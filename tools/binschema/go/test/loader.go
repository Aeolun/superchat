// ABOUTME: Loads JSON test suites and handles BigInt parsing for cross-language test compatibility
// ABOUTME: Provides utilities for finding and parsing test files from the tests-json directory
package test

import (
	"fmt"
	"os"
	"path/filepath"
	"strconv"
	"strings"

	"github.com/aeolun/json5"
)

// TestSuite represents a complete test suite loaded from JSON
type TestSuite struct {
	Name        string                 `json:"name"`
	Description string                 `json:"description"`
	Schema      map[string]interface{} `json:"schema"`
	TestType    string                 `json:"test_type"`
	TestCases   []TestCase             `json:"test_cases"`
}

// TestCase represents a single test case within a suite
type TestCase struct {
	Description string        `json:"description"`
	Value       interface{}   `json:"value"`
	Bytes       []byte        `json:"bytes"`
	Bits        []int         `json:"bits,omitempty"`
	ChunkSizes  []int         `json:"chunkSizes,omitempty"`
	Error       *string       `json:"error,omitempty"`
}

// LoadTestSuite loads a single test suite from a JSON file
func LoadTestSuite(path string) (*TestSuite, error) {
	data, err := os.ReadFile(path)
	if err != nil {
		return nil, fmt.Errorf("failed to read test file %s: %w", path, err)
	}

	var suite TestSuite
	if err := json5.Unmarshal(data, &suite); err != nil {
		return nil, fmt.Errorf("failed to parse test file %s: %w", path, err)
	}

	// Post-process to handle BigInt strings (e.g., "12345n" -> int64)
	suite.TestCases = processBigIntInTestCases(suite.TestCases)

	// Convert bits to bytes for test cases that use bit-level encoding
	suite.TestCases = convertBitsToBytes(suite.TestCases)

	return &suite, nil
}

// LoadAllTestSuites loads all test suites from a directory (recursively)
func LoadAllTestSuites(rootDir string) ([]*TestSuite, error) {
	var suites []*TestSuite

	err := filepath.Walk(rootDir, func(path string, info os.FileInfo, err error) error {
		if err != nil {
			return err
		}

		// Only process .test.json files
		if !info.IsDir() && strings.HasSuffix(path, ".test.json") {
			suite, err := LoadTestSuite(path)
			if err != nil {
				return fmt.Errorf("failed to load %s: %w", path, err)
			}
			suites = append(suites, suite)
		}

		return nil
	})

	if err != nil {
		return nil, err
	}

	return suites, nil
}

// processBigIntInTestCases processes test cases to convert BigInt strings to int64
func processBigIntInTestCases(cases []TestCase) []TestCase {
	for i := range cases {
		cases[i].Value = processBigIntValue(cases[i].Value)
	}
	return cases
}

// processBigIntValue recursively processes a value to convert BigInt strings
func processBigIntValue(val interface{}) interface{} {
	switch v := val.(type) {
	case string:
		// Check if it's a BigInt string (ends with 'n')
		if strings.HasSuffix(v, "n") {
			numStr := strings.TrimSuffix(v, "n")
			if num, err := strconv.ParseInt(numStr, 10, 64); err == nil {
				return num
			}
			if num, err := strconv.ParseUint(numStr, 10, 64); err == nil {
				return num
			}
		}
		return v
	case map[string]interface{}:
		// Recursively process map values
		result := make(map[string]interface{})
		for k, v := range v {
			result[k] = processBigIntValue(v)
		}
		return result
	case []interface{}:
		// Recursively process array elements
		result := make([]interface{}, len(v))
		for i, elem := range v {
			result[i] = processBigIntValue(elem)
		}
		return result
	default:
		return v
	}
}

// convertBitsToBytes converts test cases with `bits` field to `bytes` field
// This is needed because the Go test harness compares bytes, not bits
func convertBitsToBytes(cases []TestCase) []TestCase {
	for i := range cases {
		// If test case has bits but no bytes, convert bits to bytes
		if len(cases[i].Bits) > 0 && len(cases[i].Bytes) == 0 {
			cases[i].Bytes = bitsToBytes(cases[i].Bits)
		}
	}
	return cases
}

// bitsToBytes converts a bit array to byte array (MSB first within each byte)
func bitsToBytes(bits []int) []byte {
	if len(bits) == 0 {
		return []byte{}
	}

	// Calculate number of bytes needed
	numBytes := (len(bits) + 7) / 8
	bytes := make([]byte, numBytes)

	// Pack bits into bytes (MSB first)
	for i, bit := range bits {
		if bit != 0 {
			byteIdx := i / 8
			bitIdx := 7 - (i % 8) // MSB first
			bytes[byteIdx] |= 1 << bitIdx
		}
	}

	return bytes
}
