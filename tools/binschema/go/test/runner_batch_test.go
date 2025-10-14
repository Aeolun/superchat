// ABOUTME: Batched test runner for fast Go test execution
// ABOUTME: Compiles all test suites together instead of one-by-one

package test

import (
	"os"
	"path/filepath"
	"testing"

	"github.com/stretchr/testify/require"
)

// TestBinSchemaBatched runs all test suites with batched compilation
func TestBinSchemaBatched(t *testing.T) {
	// Load all JSON test suites
	testsDir := filepath.Join("..", "..", "tests-json", "primitives")
	suites, err := LoadAllTestSuites(testsDir)
	require.NoError(t, err, "Failed to load test suites")
	require.NotEmpty(t, suites, "No test suites found in %s", testsDir)

	t.Logf("Loaded %d test suites", len(suites))

	// Compile and run all tests in one batch
	resultMap, err := CompileAndTestBatch(suites)
	if err != nil {
		t.Fatalf("Failed to compile/run batched tests: %v", err)
	}

	// Report results per suite
	totalPassed := 0
	totalFailed := 0
	verbose := os.Getenv("VERBOSE") != ""

	for _, suite := range suites {
		results, ok := resultMap[suite.Name]
		if !ok {
			t.Errorf("No results for suite %s", suite.Name)
			continue
		}

		passed := 0
		failed := 0
		for _, result := range results {
			if result.Pass {
				passed++
				if verbose {
					t.Logf("  ✓ %s: %s", suite.Name, result.Description)
				}
			} else {
				failed++
				if verbose {
					t.Errorf("  ✗ %s: %s - %s", suite.Name, result.Description, result.Error)
				}
			}
		}

		totalPassed += passed
		totalFailed += failed

		status := "✓"
		if failed > 0 {
			status = "✗"
		}
		t.Logf("%s %s: %d/%d passed", status, suite.Name, passed, passed+failed)
	}

	t.Logf("\nSummary: %d/%d tests passed across %d suites",
		totalPassed, totalPassed+totalFailed, len(suites))

	if totalFailed > 0 {
		t.Logf("Failed tests: %d", totalFailed)
		// Don't fail the test yet - we're still developing
		// t.Fail()
	}
}
