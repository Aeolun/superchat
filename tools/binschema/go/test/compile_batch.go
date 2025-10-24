// ABOUTME: Batched compilation for Go test suites
// ABOUTME: Compiles all test suites at once for fast execution

package test

import (
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"regexp"
	"strings"

	"github.com/aeolun/json5"
)

// CompileAndTestBatch compiles all test suites together and runs them
func CompileAndTestBatch(suites []*TestSuite) (map[string][]TestResult, error) {
	// Create temporary directory
	tmpDir, err := os.MkdirTemp("", "binschema-batch-*")
	if err != nil {
		return nil, fmt.Errorf("failed to create temp dir: %w", err)
	}

	// If DEBUG_GENERATED is set, save files to tmp-go/ instead of deleting
	debugDir := os.Getenv("DEBUG_GENERATED")
	if debugDir != "" {
		tmpDir = debugDir
		os.RemoveAll(tmpDir) // Clean old files
		os.MkdirAll(tmpDir, 0755)
	} else {
		defer os.RemoveAll(tmpDir)
	}

	// Track results for suites that fail code generation
	results := make(map[string][]TestResult)

	// Track which suites successfully generated code
	var successfulSuites []*TestSuite
	var typeNamePrefixes []string

	// Generate code for all suites - write each to its own file in main package
	for i, suite := range suites {
		code, err := generateGoSource(suite.Schema, suite.TestType)
		if err != nil {
			// Mark all test cases in this suite as failed due to code generation error
			var failedResults []TestResult
			for _, tc := range suite.TestCases {
				failedResults = append(failedResults, TestResult{
					Description: tc.Description,
					Pass:        false,
					Error:       fmt.Sprintf("code generation failed: %v", err),
				})
			}
			results[suite.Name] = failedResults
			continue
		}

		// Prefix type names to avoid conflicts
		prefix := strings.ReplaceAll(suite.Name, "-", "_")

		// Save original code for debugging if DEBUG_GENERATED is set
		if debugDir != "" {
			origFilename := fmt.Sprintf("orig_%d.go", i)
			origFile := filepath.Join(tmpDir, origFilename)
			os.WriteFile(origFile, []byte(code), 0644)
		}

		prefixedCode := prefixTypeNames(code, suite.TestType, prefix)

		// Write to separate file (Go allows multiple files in same package/directory)
		filename := fmt.Sprintf("gen_%d.go", i)
		codeFile := filepath.Join(tmpDir, filename)
		if err := os.WriteFile(codeFile, []byte(prefixedCode), 0644); err != nil {
			return nil, fmt.Errorf("failed to write generated code: %w", err)
		}

		// Track successful generation
		successfulSuites = append(successfulSuites, suite)
		typeNamePrefixes = append(typeNamePrefixes, prefix)
	}

	// If no suites generated successfully, return the failure results
	if len(successfulSuites) == 0 {
		return results, nil
	}

	// Generate unified test harness (only for successfully generated suites)
	testHarness := generateBatchedTestHarness(successfulSuites, typeNamePrefixes)
	harnessFile := filepath.Join(tmpDir, "main.go")
	if err := os.WriteFile(harnessFile, []byte(testHarness), 0644); err != nil {
		return nil, fmt.Errorf("failed to write test harness: %w", err)
	}

	// Initialize go.mod
	cmd := exec.Command("go", "mod", "init", "testmodule")
	cmd.Dir = tmpDir
	if err := cmd.Run(); err != nil {
		return nil, fmt.Errorf("failed to init go module: %w", err)
	}

	// Add dependency on binschema runtime
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

	// Run the test harness (only one compilation!)
	cmd = exec.Command("go", "run", ".")
	cmd.Dir = tmpDir
	output, err := cmd.CombinedOutput()
	if err != nil {
		return nil, fmt.Errorf("failed to run test harness: %w\nOutput: %s", err, output)
	}

	// Parse results - array of arrays, one per suite
	var allResults [][]TestResult
	if err := json5.Unmarshal(output, &allResults); err != nil {
		return nil, fmt.Errorf("failed to parse test results: %w\nOutput: %s", err, output)
	}

	// Map results from test harness back to suite names
	for i, suite := range successfulSuites {
		if i < len(allResults) {
			results[suite.Name] = allResults[i]
		}
	}

	return results, nil
}

// prefixTypeNames adds a prefix to ALL type names and functions to avoid conflicts
func prefixTypeNames(code string, typeName string, prefix string) string {
	// Use regexp to find and prefix ALL type definitions and decode functions
	// This is more robust than string replacement as schemas may define multiple types

	// Prefix all struct type definitions: "type Foo struct" -> "type prefix_Foo struct"
	typeDefRegex := regexp.MustCompile(`\btype\s+([A-Z][a-zA-Z0-9]*)\s+struct`)
	code = typeDefRegex.ReplaceAllStringFunc(code, func(match string) string {
		parts := typeDefRegex.FindStringSubmatch(match)
		if len(parts) >= 2 {
			typeName := parts[1]
			return fmt.Sprintf("type %s_%s struct", prefix, typeName)
		}
		return match
	})

	// Prefix all Decode function DEFINITIONS: "func DecodeFoo" -> "func Decodeprefix_Foo"
	// and "func decodeFooWithDecoder" -> "func decodeprefixFooWithDecoder"
	// Note: Decode functions get prefix AFTER Decode, decode helpers get prefix BEFORE decode
	decodeFuncDefRegex := regexp.MustCompile(`(\bfunc\s+)Decode([A-Z][a-zA-Z0-9]*)`)
	code = decodeFuncDefRegex.ReplaceAllString(code, fmt.Sprintf("${1}Decode%s_${2}", prefix))

	decodeHelperRegex := regexp.MustCompile(`(\bfunc\s+)decode([A-Z][a-zA-Z0-9]*)`)
	code = decodeHelperRegex.ReplaceAllString(code, fmt.Sprintf("${1}%s_decode${2}", prefix))

	// Prefix type references in function CALLS: "DecodeFoo(" -> "Decodeprefix_Foo("
	// and "decodeFooWithDecoder(" -> "prefix_decodeFooWithDecoder("
	decodeCallRegex := regexp.MustCompile(`\bDecode([A-Z][a-zA-Z0-9]*)\(`)
	code = decodeCallRegex.ReplaceAllString(code, fmt.Sprintf("Decode%s_${1}(", prefix))

	decodeHelperCallRegex := regexp.MustCompile(`\bdecode([A-Z][a-zA-Z0-9]*)\(`)
	code = decodeHelperCallRegex.ReplaceAllString(code, fmt.Sprintf("%s_decode${1}(", prefix))

	// Prefix type references carefully to avoid breaking maps and other Go syntax
	// Only prefix: "&Foo{" -> "&prefix_Foo{", "*Foo," -> "*prefix_Foo,", " Foo{" -> " prefix_Foo{"
	// but NOT map[string]Foo or other complex expressions

	// Handle array types: []Type -> []prefix_Type
	code = regexp.MustCompile(`\[\]([A-Z][a-zA-Z0-9]*)`).ReplaceAllString(code, fmt.Sprintf("[]%s_$1", prefix))

	// Handle &Type{} struct literals
	code = regexp.MustCompile(`&([A-Z][a-zA-Z0-9]*)\{`).ReplaceAllString(code, fmt.Sprintf("&%s_$1{", prefix))

	// Handle *Type in function parameters/returns (with comma or closing paren after)
	code = regexp.MustCompile(`\*([A-Z][a-zA-Z0-9]*)([,\)])`).ReplaceAllString(code, fmt.Sprintf("*%s_$1$2", prefix))

	// Handle Type{} struct literals (with space before)
	code = regexp.MustCompile(`\s([A-Z][a-zA-Z0-9]*)\{`).ReplaceAllString(code, fmt.Sprintf(" %s_$1{", prefix))

	// Prefix method receivers: "func (m *Foo)" -> "func (m *prefix_Foo)"
	methodRegex := regexp.MustCompile(`\bfunc\s+\(([a-z])\s+\*([A-Z][a-zA-Z0-9]*)\)`)
	code = methodRegex.ReplaceAllStringFunc(code, func(match string) string {
		parts := methodRegex.FindStringSubmatch(match)
		if len(parts) >= 3 {
			receiver := parts[1]
			typeName := parts[2]
			return fmt.Sprintf("func (%s *%s_%s)", receiver, prefix, typeName)
		}
		return match
	})

	// Handle field types in struct definitions: "FieldName TypeName" at end of line
	// Match patterns like "Value Discriminated_union" or "Cname CompressedDomain"
	// Be careful to match full lines to avoid false matches
	fieldTypeRegex := regexp.MustCompile(`(\s+\w+\s+)([A-Z][a-zA-Z0-9_]*)(\s*)$`)
	lines := strings.Split(code, "\n")
	for i, line := range lines {
		// Only process lines that look like field declarations (indent + word + Type)
		if fieldTypeRegex.MatchString(line) {
			lines[i] = fieldTypeRegex.ReplaceAllString(line, fmt.Sprintf("${1}%s_${2}${3}", prefix))
		}
	}
	code = strings.Join(lines, "\n")

	return code
}

func generateBatchedTestHarness(suites []*TestSuite, typePrefixes []string) string {
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
	_ = math.Pi
	allResults := [][]TestResult{}

`

	// Generate test code for each suite
	for i, suite := range suites {
		typePrefix := typePrefixes[i]
		prefixedType := typePrefix + "_" + suite.TestType

		harness += fmt.Sprintf("\t// Test suite: %s\n", suite.Name)
		harness += "\t{\n"
		harness += "\t\tresults := []TestResult{}\n\n"

		for j, tc := range suite.TestCases {
			harness += fmt.Sprintf("\t\t// Test case %d: %s\n", j, tc.Description)
			harness += "\t\tfunc() {\n"
			harness += fmt.Sprintf("\t\t\tresult := TestResult{Description: %q}\n", tc.Description)
			harness += "\t\t\tdefer func() { results = append(results, result) }()\n\n"

			// Generate value construction with schema information
			harness += generateValueConstructionWithSchema(prefixedType, tc.Value, "testValue", suite)

			// Encode
			harness += "\t\t\tencoded, encErr := testValue.Encode()\n"
			harness += "\t\t\tif encErr != nil {\n"
			harness += "\t\t\t\tresult.Error = fmt.Sprintf(\"encode error: %v\", encErr)\n"
			harness += "\t\t\t\treturn\n"
			harness += "\t\t\t}\n"
			harness += "\t\t\tresult.EncodedBytes = encoded\n\n"

			// Compare bytes
			harness += fmt.Sprintf("\t\t\texpectedBytes := []byte{%s}\n", formatByteSlice(tc.Bytes))
			harness += "\t\t\tif !bytes.Equal(encoded, expectedBytes) {\n"
			harness += "\t\t\t\tresult.Error = fmt.Sprintf(\"encoded bytes mismatch: got %v, want %v\", encoded, expectedBytes)\n"
			harness += "\t\t\t\tresult.Pass = false\n"
			harness += "\t\t\t\treturn\n"
			harness += "\t\t\t}\n\n"

			// Decode
			harness += fmt.Sprintf("\t\t\tdecoded, decErr := Decode%s(encoded)\n", prefixedType)
			harness += "\t\t\tif decErr != nil {\n"
			harness += "\t\t\t\tresult.Error = fmt.Sprintf(\"decode error: %v\", decErr)\n"
			harness += "\t\t\t\treturn\n"
			harness += "\t\t\t}\n"
			harness += "\t\t\tresult.DecodedValue = decoded\n\n"

			// Compare values
			harness += "\t\t\tif !reflect.DeepEqual(decoded, &testValue) {\n"
			harness += "\t\t\t\tresult.Error = fmt.Sprintf(\"decoded value mismatch: got %+v, want %+v\", decoded, testValue)\n"
			harness += "\t\t\t\tresult.Pass = false\n"
			harness += "\t\t\t\treturn\n"
			harness += "\t\t\t}\n\n"

			harness += "\t\t\tresult.Pass = true\n"
			harness += "\t\t}()\n\n"
		}

		harness += "\t\tallResults = append(allResults, results)\n"
		harness += "\t}\n\n"
	}

	harness += `
	// Output results as JSON5
	data, err := json5.Marshal(allResults)
	if err != nil {
		panic(err)
	}
	fmt.Println(string(data))
}
`

	return harness
}

func generateValueConstructionWithSchema(typeName string, value interface{}, varName string, suite *TestSuite) string {
	valueMap, ok := value.(map[string]interface{})
	if !ok {
		return fmt.Sprintf("\t\t\t%s := %s{}\n", varName, typeName)
	}

	// Get the type definition from the schema
	typeDef, ok := suite.Schema["types"].(map[string]interface{})[suite.TestType].(map[string]interface{})
	if !ok {
		// Fallback to simple generation if schema not available
		return generateValueConstructionSimple(typeName, value, varName)
	}

	// Build field type map from schema
	fieldTypes := make(map[string]string)
	if sequence, ok := typeDef["sequence"].([]interface{}); ok {
		for _, fieldRaw := range sequence {
			if field, ok := fieldRaw.(map[string]interface{}); ok {
				if name, ok := field["name"].(string); ok {
					if fieldType, ok := field["type"].(string); ok {
						fieldTypes[name] = fieldType
					}
				}
			}
		}
	}

	result := fmt.Sprintf("\t\t\t%s := %s{\n", varName, typeName)
	for key, val := range valueMap {
		fieldName := capitalizeFirst(key)
		fieldType := fieldTypes[key]
		result += fmt.Sprintf("\t\t\t\t%s: %s,\n", fieldName, formatValueWithType(val, fieldType))
	}
	result += "\t\t\t}\n"

	return result
}

func generateValueConstructionSimple(typeName string, value interface{}, varName string) string {
	valueMap, ok := value.(map[string]interface{})
	if !ok {
		return fmt.Sprintf("\t\t\t%s := %s{}\n", varName, typeName)
	}

	result := fmt.Sprintf("\t\t\t%s := %s{\n", varName, typeName)
	for key, val := range valueMap {
		fieldName := capitalizeFirst(key)
		result += fmt.Sprintf("\t\t\t\t%s: %s,\n", fieldName, formatValue(val))
	}
	result += "\t\t\t}\n"

	return result
}
