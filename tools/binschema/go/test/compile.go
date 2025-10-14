// ABOUTME: Compiles and executes generated Go code for testing
// ABOUTME: Handles temporary file creation, compilation, and result extraction
package test

import (
	"fmt"
	"math"
	"os"
	"os/exec"
	"path/filepath"
	"strings"

	"github.com/aeolun/json5"
)

// CompileAndTest compiles generated code and runs encode/decode tests
func CompileAndTest(generatedCode string, typeName string, schema map[string]interface{}, testCases []TestCase) ([]TestResult, error) {
	// Create temporary directory for generated code
	tmpDir, err := os.MkdirTemp("", "binschema-test-*")
	if err != nil {
		return nil, fmt.Errorf("failed to create temp dir: %w", err)
	}
	defer os.RemoveAll(tmpDir)

	// Write generated code to file
	codeFile := filepath.Join(tmpDir, "generated.go")
	if err := os.WriteFile(codeFile, []byte(generatedCode), 0644); err != nil {
		return nil, fmt.Errorf("failed to write generated code: %w", err)
	}

	// Write test harness that exercises the generated code
	testHarness := generateTestHarness(typeName, schema, testCases)
	harnessFile := filepath.Join(tmpDir, "test_harness.go")
	if err := os.WriteFile(harnessFile, []byte(testHarness), 0644); err != nil {
		return nil, fmt.Errorf("failed to write test harness: %w", err)
	}

	// Initialize go.mod in temp directory
	cmd := exec.Command("go", "mod", "init", "testmodule")
	cmd.Dir = tmpDir
	if err := cmd.Run(); err != nil {
		return nil, fmt.Errorf("failed to init go module: %w", err)
	}

	// Add dependency on binschema runtime
	// For now, use replace directive to point to local copy
	runtimePath, err := filepath.Abs(".")
	if err != nil {
		return nil, fmt.Errorf("failed to get abs path: %w", err)
	}
	runtimePath = filepath.Dir(runtimePath) // go up to binschema root

	goModPath := filepath.Join(tmpDir, "go.mod")
	goModContent, err := os.ReadFile(goModPath)
	if err != nil {
		return nil, fmt.Errorf("failed to read go.mod: %w", err)
	}

	goModContent = append(goModContent, []byte(fmt.Sprintf("\nreplace github.com/anthropics/binschema => %s\n", runtimePath))...)
	if err := os.WriteFile(goModPath, goModContent, 0644); err != nil {
		return nil, fmt.Errorf("failed to update go.mod: %w", err)
	}

	// Run go get to fetch dependencies
	cmd = exec.Command("go", "get", "github.com/anthropics/binschema/runtime", "github.com/aeolun/json5")
	cmd.Dir = tmpDir
	if output, err := cmd.CombinedOutput(); err != nil {
		return nil, fmt.Errorf("failed to get dependencies: %w\nOutput: %s", err, output)
	}

	// Run the test harness
	cmd = exec.Command("go", "run", ".")
	cmd.Dir = tmpDir
	output, err := cmd.CombinedOutput()
	if err != nil {
		return nil, fmt.Errorf("failed to run test harness: %w\nOutput: %s", err, output)
	}

	// Parse results from JSON5 output (supports Infinity, NaN)
	var results []TestResult
	if err := json5.Unmarshal(output, &results); err != nil {
		return nil, fmt.Errorf("failed to parse test results: %w\nOutput: %s", err, output)
	}

	return results, nil
}

// TestResult represents the result of a single test case
type TestResult struct {
	Description string `json:"description"`
	Pass        bool   `json:"pass"`
	Error       string `json:"error,omitempty"`
	EncodedBytes []byte `json:"encoded_bytes,omitempty"`
	DecodedValue interface{} `json:"decoded_value,omitempty"`
}

func generateTestHarness(typeName string, schema map[string]interface{}, testCases []TestCase) string {
	// Generate Go code that runs all test cases and outputs JSON5 results
	// JSON5 supports Infinity, -Infinity, and NaN
	harness := `package main

import (
	"bytes"
	"fmt"
	"math"
	"reflect"

	"github.com/aeolun/json5"
)

type TestResult struct {
	Description  string      ` + "`json:\"description\"`" + `
	Pass         bool        ` + "`json:\"pass\"`" + `
	Error        string      ` + "`json:\"error,omitempty\"`" + `
	EncodedBytes []byte      ` + "`json:\"encoded_bytes,omitempty\"`" + `
	DecodedValue interface{} ` + "`json:\"decoded_value,omitempty\"`" + `
}

func main() {
	_ = math.Pi // Ensure math is used
	results := []TestResult{}

`

	// Generate test case code
	for i, tc := range testCases {
		harness += fmt.Sprintf("\t// Test case %d: %s\n", i, tc.Description)
		harness += fmt.Sprintf("\tfunc() {\n")
		harness += fmt.Sprintf("\t\tresult := TestResult{Description: %q}\n", tc.Description)
		harness += "\t\tdefer func() { results = append(results, result) }()\n\n"

		// Generate the test value construction
		harness += generateValueConstruction(typeName, schema, tc.Value, "testValue")

		// Encode
		harness += "\t\tencoded, encErr := testValue.Encode()\n"
		harness += "\t\tif encErr != nil {\n"
		harness += "\t\t\tresult.Error = fmt.Sprintf(\"encode error: %v\", encErr)\n"
		harness += "\t\t\treturn\n"
		harness += "\t\t}\n"
		harness += "\t\tresult.EncodedBytes = encoded\n\n"

		// Compare encoded bytes
		harness += fmt.Sprintf("\t\texpectedBytes := []byte{%s}\n", formatByteSlice(tc.Bytes))
		harness += "\t\tif !bytes.Equal(encoded, expectedBytes) {\n"
		harness += "\t\t\tresult.Error = fmt.Sprintf(\"encoded bytes mismatch: got %v, want %v\", encoded, expectedBytes)\n"
		harness += "\t\t\tresult.Pass = false\n"
		harness += "\t\t\treturn\n"
		harness += "\t\t}\n\n"

		// Decode
		harness += fmt.Sprintf("\t\tdecoded, decErr := Decode%s(encoded)\n", typeName)
		harness += "\t\tif decErr != nil {\n"
		harness += "\t\t\tresult.Error = fmt.Sprintf(\"decode error: %v\", decErr)\n"
		harness += "\t\t\treturn\n"
		harness += "\t\t}\n"
		harness += "\t\tresult.DecodedValue = decoded\n\n"

		// Compare decoded value
		harness += "\t\tif !reflect.DeepEqual(decoded, &testValue) {\n"
		harness += "\t\t\tresult.Error = fmt.Sprintf(\"decoded value mismatch: got %+v, want %+v\", decoded, testValue)\n"
		harness += "\t\t\tresult.Pass = false\n"
		harness += "\t\t\treturn\n"
		harness += "\t\t}\n\n"

		harness += "\t\tresult.Pass = true\n"
		harness += "\t}()\n\n"
	}

	harness += `
	// Output results as JSON5 (supports Infinity, NaN)
	data, err := json5.Marshal(results)
	if err != nil {
		panic(err)
	}
	fmt.Println(string(data))
}
`

	return harness
}

func generateValueConstruction(typeName string, schema map[string]interface{}, value interface{}, varName string) string {
	// Get the type definition from schema
	types, ok := schema["types"].(map[string]interface{})
	if !ok {
		// Fallback if schema is malformed
		return fmt.Sprintf("\t\t%s := %s{}\n", varName, typeName)
	}

	typeDef, ok := types[typeName].(map[string]interface{})
	if !ok {
		// Type not found in schema
		return fmt.Sprintf("\t\t%s := %s{}\n", varName, typeName)
	}

	// Convert JSON value to Go struct initialization
	valueMap, ok := value.(map[string]interface{})
	if !ok {
		return fmt.Sprintf("\t\t%s := %s{}\n", varName, typeName)
	}

	result := fmt.Sprintf("\t\t%s := %s{\n", varName, typeName)

	// Get the sequence of fields from the type definition
	sequence, ok := typeDef["sequence"].([]interface{})
	if !ok {
		// No sequence, just use raw values
		for key, val := range valueMap {
			fieldName := capitalizeFirst(key)
			result += fmt.Sprintf("\t\t\t%s: %v,\n", fieldName, formatValue(val))
		}
	} else {
		// Use schema to properly format each field
		for _, fieldRaw := range sequence {
			field, ok := fieldRaw.(map[string]interface{})
			if !ok {
				continue
			}

			fieldNameLower, ok := field["name"].(string)
			if !ok {
				continue
			}

			val, hasValue := valueMap[fieldNameLower]
			if !hasValue {
				continue
			}

			fieldName := capitalizeFirst(fieldNameLower)

			// Format the value based on its type - pass full field for array type info
			formattedValue := formatValueWithField(val, field, types)
			result += fmt.Sprintf("\t\t\t%s: %s,\n", fieldName, formattedValue)
		}
	}

	result += "\t\t}\n"
	return result
}

// formatValueWithField formats a value using full field definition from schema
func formatValueWithField(val interface{}, field map[string]interface{}, types map[string]interface{}) string {
	fieldType, _ := field["type"].(string)

	// Check if it's a nested struct type (exists in types map)
	if typeDef, ok := types[fieldType].(map[string]interface{}); ok {
		// It's a custom type - recursively format it
		if sequence, ok := typeDef["sequence"].([]interface{}); ok && len(sequence) > 0 {
			// It's a struct type with fields
			return formatNestedStruct(val, fieldType, typeDef, types)
		}
	}

	// Check if it's an array
	if fieldType == "array" {
		if valSlice, ok := val.([]interface{}); ok {
			return formatArrayWithField(valSlice, field, types)
		}
	}

	// Primitive or string - use existing formatValue
	return formatValue(val)
}

// formatNestedStruct formats a nested struct value
func formatNestedStruct(val interface{}, typeName string, typeDef map[string]interface{}, types map[string]interface{}) string {
	valueMap, ok := val.(map[string]interface{})
	if !ok {
		return fmt.Sprintf("%s{}", typeName)
	}

	result := fmt.Sprintf("%s{\n", typeName)

	sequence, _ := typeDef["sequence"].([]interface{})
	for _, fieldRaw := range sequence {
		field, ok := fieldRaw.(map[string]interface{})
		if !ok {
			continue
		}

		fieldNameLower, _ := field["name"].(string)
		fieldValue, hasValue := valueMap[fieldNameLower]
		if !hasValue {
			continue
		}

		fieldName := capitalizeFirst(fieldNameLower)

		formattedValue := formatValueWithField(fieldValue, field, types)
		result += fmt.Sprintf("\t\t\t\t%s: %s,\n", fieldName, formattedValue)
	}

	result += "\t\t\t}"
	return result
}

// formatArrayWithField formats an array using field definition to determine element type
func formatArrayWithField(arr []interface{}, field map[string]interface{}, types map[string]interface{}) string {
	if len(arr) == 0 {
		// Empty array - we need to figure out the type
		items, ok := field["items"].(map[string]interface{})
		if !ok {
			return "[]"
		}
		itemType, _ := items["type"].(string)

		// Check if it's a struct type
		if _, isStruct := types[itemType].(map[string]interface{}); isStruct {
			return fmt.Sprintf("[]%s{}", capitalizeFirst(itemType))
		}

		// Primitive type
		goType := mapPrimitiveType(itemType)
		return fmt.Sprintf("[]%s{}", goType)
	}

	// Get item type from field definition
	items, ok := field["items"].(map[string]interface{})
	if !ok {
		// Fallback to old behavior if items not defined
		return formatArray(arr)
	}

	itemType, _ := items["type"].(string)

	// Check if elements are primitives
	allPrimitives := true
	for _, elem := range arr {
		switch elem.(type) {
		case int, int64, uint, uint64, float64, float32, string, bool:
			// Primitive
		default:
			allPrimitives = false
			break
		}
	}

	if allPrimitives {
		// Format inline with proper type
		goType := mapPrimitiveType(itemType)
		result := fmt.Sprintf("[]%s{", goType)
		for i, elem := range arr {
			if i > 0 {
				result += ", "
			}
			result += formatValue(elem)
		}
		result += "}"
		return result
	}

	// Complex array (structs) - format multi-line
	structType := capitalizeFirst(itemType)
	result := fmt.Sprintf("[]%s{\n", structType)
	for _, elem := range arr {
		// Each element is a struct, format it properly
		if elemMap, ok := elem.(map[string]interface{}); ok {
			if typeDef, ok := types[itemType].(map[string]interface{}); ok {
				result += "\t\t\t\t" + formatNestedStruct(elemMap, itemType, typeDef, types) + ",\n"
			}
		}
	}
	result += "\t\t\t}"
	return result
}

// formatArray formats an array/slice value (fallback when field info not available)
func formatArray(arr []interface{}) string {
	if len(arr) == 0 {
		return "[]"
	}

	// Check if all elements are primitives (numbers/strings/bools)
	allPrimitives := true
	for _, elem := range arr {
		switch elem.(type) {
		case int, int64, uint, uint64, float64, float32, string, bool:
			// Primitive
		default:
			allPrimitives = false
			break
		}
	}

	if allPrimitives {
		// Format inline
		result := "[]"
		// Infer type from first element
		if len(arr) > 0 {
			switch arr[0].(type) {
			case int, int64, uint, uint64:
				result = "[]uint8"
			case float64, float32:
				result = "[]float64"
			case string:
				result = "[]string"
			case bool:
				result = "[]bool"
			}
		}

		result += "{"
		for i, elem := range arr {
			if i > 0 {
				result += ", "
			}
			result += formatValue(elem)
		}
		result += "}"
		return result
	}

	// Complex array (structs/nested) - format multi-line
	result := "[]{\n"
	for _, elem := range arr {
		result += "\t\t\t\t" + formatValue(elem) + ",\n"
	}
	result += "\t\t\t}"
	return result
}

// formatValueWithType formats a value for Go code generation with explicit type information
func formatValueWithType(val interface{}, fieldType string) string {
	// Handle nil - only convert to Infinity for float types
	if val == nil {
		if fieldType == "float32" || fieldType == "float64" {
			if fieldType == "float32" {
				return "float32(math.Inf(1))"
			}
			return "math.Inf(1)"
		}
		// For non-float types, nil means optional field not present
		return "nil"
	}

	switch v := val.(type) {
	case int:
		return fmt.Sprintf("%d", v)
	case int64:
		return fmt.Sprintf("%d", v)
	case uint:
		return fmt.Sprintf("%d", v)
	case uint64:
		return fmt.Sprintf("%d", v)
	case float64:
		// Check for special values - cast based on field type
		if math.IsInf(v, 1) {
			if fieldType == "float32" {
				return "float32(math.Inf(1))"
			}
			return "math.Inf(1)"
		}
		if math.IsInf(v, -1) {
			if fieldType == "float32" {
				return "float32(math.Inf(-1))"
			}
			return "math.Inf(-1)"
		}
		if math.IsNaN(v) {
			if fieldType == "float32" {
				return "float32(math.NaN())"
			}
			return "math.NaN()"
		}
		// Check if it's actually an integer
		if v == float64(int64(v)) {
			return fmt.Sprintf("%d", int64(v))
		}
		// For float values, use %.17g to maintain full precision
		str := fmt.Sprintf("%.17g", v)
		// Remove + from scientific notation (1e+38 -> 1e38)
		str = strings.Replace(str, "e+", "e", 1)
		return str
	case float32:
		return fmt.Sprintf("%f", v)
	case string:
		return fmt.Sprintf("%q", v)
	case bool:
		return fmt.Sprintf("%t", v)
	default:
		return fmt.Sprintf("%v", v)
	}
}

func formatValue(val interface{}) string {
	// Fallback for when type information is not available
	// This should not be used for new code - use formatValueWithType instead
	return formatValueWithType(val, "")
}

func formatByteSlice(bytes []byte) string {
	if len(bytes) == 0 {
		return ""
	}
	result := ""
	for i, b := range bytes {
		if i > 0 {
			result += ", "
		}
		result += fmt.Sprintf("%d", b)
	}
	return result
}

func capitalizeFirst(s string) string {
	if s == "" {
		return ""
	}
	// Only capitalize if first character is lowercase letter (a-z)
	if s[0] >= 'a' && s[0] <= 'z' {
		return string(s[0]-32) + s[1:]
	}
	// Already uppercase or not a letter - return as is
	return s
}

// mapPrimitiveType maps BinSchema primitive types to Go types
func mapPrimitiveType(binschemaType string) string {
	switch binschemaType {
	case "uint8":
		return "uint8"
	case "uint16":
		return "uint16"
	case "uint32":
		return "uint32"
	case "uint64":
		return "uint64"
	case "int8":
		return "int8"
	case "int16":
		return "int16"
	case "int32":
		return "int32"
	case "int64":
		return "int64"
	case "float32":
		return "float32"
	case "float64":
		return "float64"
	case "string":
		return "string"
	case "bool":
		return "bool"
	default:
		// For unknown/custom types, capitalize first letter
		return capitalizeFirst(binschemaType)
	}
}
