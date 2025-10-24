// ABOUTME: Main test runner that loads JSON test suites and validates Go implementation against them
// ABOUTME: Ensures cross-language compatibility by testing generated code against shared test definitions
package test

import (
	"fmt"
	"path/filepath"
	"testing"

	"github.com/stretchr/testify/require"
)

// Note: TestBinSchema is now in runner_batch_test.go and uses batched compilation for efficiency.
// Batched compilation compiles all test suites together (~5-10s) instead of one-by-one (~60s).

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

