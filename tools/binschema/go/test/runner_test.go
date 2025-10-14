// ABOUTME: Main test runner that loads JSON test suites and validates Go implementation against them
// ABOUTME: Ensures cross-language compatibility by testing generated code against shared test definitions
package test

import (
	"fmt"
	"path/filepath"
	"testing"

	"github.com/anthropics/binschema/codegen"
	"github.com/stretchr/testify/require"
)

// TestBinSchema runs all JSON test suites against generated Go code
func TestBinSchema(t *testing.T) {
	// Load all JSON test suites from ../../tests-json/
	testsDir := filepath.Join("..", "..", "tests-json")
	suites, err := LoadAllTestSuites(testsDir)
	require.NoError(t, err, "Failed to load test suites")

	require.NotEmpty(t, suites, "No test suites found in %s", testsDir)

	t.Logf("Loaded %d test suites", len(suites))

	for _, suite := range suites {
		suite := suite // Capture for parallel tests
		t.Run(suite.Name, func(t *testing.T) {
			// Don't run in parallel for now - easier to debug
			// t.Parallel()

			t.Logf("Test suite: %s - %s", suite.Name, suite.Description)
			t.Logf("  Test type: %s", suite.TestType)
			t.Logf("  Test cases: %d", len(suite.TestCases))

			// Generate Go code from schema
			code, err := codegen.GenerateGo(suite.Schema, suite.TestType)
			if err != nil {
				t.Fatalf("Failed to generate code: %v", err)
			}

			t.Logf("Generated %d bytes of code", len(code))

			// Compile and run tests
			results, err := CompileAndTest(code, suite.TestType, suite.Schema, suite.TestCases)
			if err != nil {
				t.Fatalf("Failed to compile/run tests: %v", err)
			}

			// Check results
			passed := 0
			failed := 0
			for _, result := range results {
				if result.Pass {
					passed++
					t.Logf("  ✓ %s", result.Description)
				} else {
					failed++
					t.Errorf("  ✗ %s: %s", result.Description, result.Error)
				}
			}

			t.Logf("Results: %d passed, %d failed out of %d", passed, failed, len(suite.TestCases))

			if failed > 0 {
				t.Fail()
			}
		})
	}
}

// TestLoadTestSuites verifies that test suites can be loaded correctly
func TestLoadTestSuites(t *testing.T) {
	testsDir := filepath.Join("..", "..", "tests-json")
	suites, err := LoadAllTestSuites(testsDir)
	require.NoError(t, err)
	require.NotEmpty(t, suites)

	t.Logf("Successfully loaded %d test suites:", len(suites))
	for _, suite := range suites {
		t.Logf("  - %s: %d test cases", suite.Name, len(suite.TestCases))
	}
}

// TestBigIntParsing verifies that BigInt strings are parsed correctly
func TestBigIntParsing(t *testing.T) {
	tests := []struct {
		name     string
		input    interface{}
		expected interface{}
	}{
		{
			name:     "BigInt string",
			input:    "12345n",
			expected: int64(12345),
		},
		{
			name:     "Regular string",
			input:    "hello",
			expected: "hello",
		},
		{
			name:     "Number",
			input:    float64(123),
			expected: float64(123),
		},
		{
			name: "Map with BigInt",
			input: map[string]interface{}{
				"field": "999n",
			},
			expected: map[string]interface{}{
				"field": int64(999),
			},
		},
		{
			name:     "Array with BigInt",
			input:    []interface{}{"123n", "456n"},
			expected: []interface{}{int64(123), int64(456)},
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			result := processBigIntValue(tt.input)
			require.Equal(t, tt.expected, result)
		})
	}
}

// Example test showing what a complete test will look like once code generation is implemented
func Example() {
	fmt.Println("Example workflow:")
	fmt.Println("1. Load JSON test suite")
	fmt.Println("2. Generate Go code from schema")
	fmt.Println("3. Compile generated code")
	fmt.Println("4. For each test case:")
	fmt.Println("   a. Encode value using generated encoder")
	fmt.Println("   b. Compare encoded bytes with expected bytes")
	fmt.Println("   c. Decode bytes using generated decoder")
	fmt.Println("   d. Compare decoded value with original value")
	fmt.Println("5. Report results")
	// Output:
	// Example workflow:
	// 1. Load JSON test suite
	// 2. Generate Go code from schema
	// 3. Compile generated code
	// 4. For each test case:
	//    a. Encode value using generated encoder
	//    b. Compare encoded bytes with expected bytes
	//    c. Decode bytes using generated decoder
	//    d. Compare decoded value with original value
	// 5. Report results
}
