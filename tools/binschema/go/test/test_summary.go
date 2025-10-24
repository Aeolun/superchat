// ABOUTME: Test result summary utilities for common reporting tasks
// ABOUTME: Provides flags to control test output verbosity and format via environment variables
package test

import (
	"encoding/json"
	"fmt"
	"os"
	"sort"
	"strings"
)

// TestSummary holds aggregated test results
type TestSummary struct {
	TotalSuites      int
	FullyPassingSuites int
	PartiallyPassingSuites int
	FullyFailingSuites int
	TotalTests       int
	PassedTests      int
	FailedTests      int
	SuiteResults     map[string]*SuiteSummary
}

// SuiteSummary holds results for a single test suite
type SuiteSummary struct {
	Name       string
	Passed     int
	Failed     int
	Total      int
	FailedCases []string
}

// BuildTestSummary builds a TestSummary from in-memory test results
func BuildTestSummary(resultMap map[string][]TestResult, suites []*TestSuite) *TestSummary {
	summary := &TestSummary{
		TotalSuites:  len(suites),
		SuiteResults: make(map[string]*SuiteSummary),
	}

	for _, suite := range suites {
		results, ok := resultMap[suite.Name]
		if !ok {
			// Suite has no results (probably failed to compile)
			summary.SuiteResults[suite.Name] = &SuiteSummary{
				Name:   suite.Name,
				Failed: len(suite.TestCases),
				Total:  len(suite.TestCases),
			}
			summary.FullyFailingSuites++
			summary.FailedTests += len(suite.TestCases)
			summary.TotalTests += len(suite.TestCases)
			continue
		}

		passed := 0
		failed := 0
		var failedCases []string
		for _, result := range results {
			if result.Pass {
				passed++
			} else {
				failed++
				failedCases = append(failedCases, result.Description)
			}
		}

		summary.SuiteResults[suite.Name] = &SuiteSummary{
			Name:        suite.Name,
			Passed:      passed,
			Failed:      failed,
			Total:       len(results),
			FailedCases: failedCases,
		}

		summary.PassedTests += passed
		summary.FailedTests += failed
		summary.TotalTests += len(results)

		if failed == 0 {
			summary.FullyPassingSuites++
		} else if passed > 0 {
			summary.PartiallyPassingSuites++
		} else {
			summary.FullyFailingSuites++
		}
	}

	return summary
}

// PrintSummary prints overall test statistics
func (s *TestSummary) PrintSummary() {
	pct := 0
	if s.TotalTests > 0 {
		pct = int((float64(s.PassedTests) / float64(s.TotalTests)) * 100)
	}

	fmt.Printf("\n========== TEST SUMMARY ==========\n")
	fmt.Printf("Total test cases: %d\n", s.TotalTests)
	fmt.Printf("Passed: %d (%d%%)\n", s.PassedTests, pct)
	fmt.Printf("Failed: %d\n", s.FailedTests)
	fmt.Printf("\nTest suites:\n")
	fmt.Printf("  Fully passing:      %d\n", s.FullyPassingSuites)
	fmt.Printf("  Partially passing:  %d\n", s.PartiallyPassingSuites)
	fmt.Printf("  Fully failing:      %d\n", s.FullyFailingSuites)
	fmt.Printf("===================================\n\n")
}

// PrintFailedSuites prints test suites that have failures
func (s *TestSummary) PrintFailedSuites() {
	fmt.Printf("\n========== FAILING TEST SUITES ==========\n")

	var names []string
	for name := range s.SuiteResults {
		suite := s.SuiteResults[name]
		if suite.Failed > 0 {
			names = append(names, name)
		}
	}
	sort.Strings(names)

	if len(names) == 0 {
		fmt.Println("All test suites passing!")
		fmt.Printf("=========================================\n\n")
		return
	}

	for _, name := range names {
		suite := s.SuiteResults[name]
		pct := 0
		if suite.Total > 0 {
			pct = int((float64(suite.Passed) / float64(suite.Total)) * 100)
		}
		fmt.Printf("  %s: %d/%d passing (%d%%)\n", name, suite.Passed, suite.Total, pct)
	}
	fmt.Printf("=========================================\n\n")
}

// PrintFullyPassingSuites prints test suites that pass completely
func (s *TestSummary) PrintFullyPassingSuites() {
	fmt.Printf("\n========== FULLY PASSING TEST SUITES ==========\n")

	var names []string
	for name := range s.SuiteResults {
		suite := s.SuiteResults[name]
		if suite.Failed == 0 && suite.Total > 0 {
			names = append(names, name)
		}
	}
	sort.Strings(names)

	if len(names) == 0 {
		fmt.Println("No fully passing test suites")
		fmt.Printf("===============================================\n\n")
		return
	}

	for _, name := range names {
		suite := s.SuiteResults[name]
		fmt.Printf("  %s: %d test cases\n", name, suite.Total)
	}
	fmt.Printf("===============================================\n\n")
}

// PrintFailingTests prints individual test cases that fail
func (s *TestSummary) PrintFailingTests() {
	fmt.Printf("\n========== FAILING TEST CASES ==========\n")

	var suites []string
	for name := range s.SuiteResults {
		suite := s.SuiteResults[name]
		if suite.Failed > 0 {
			suites = append(suites, name)
		}
	}
	sort.Strings(suites)

	if len(suites) == 0 {
		fmt.Println("All test cases passing!")
		fmt.Printf("========================================\n\n")
		return
	}

	for _, suiteName := range suites {
		suite := s.SuiteResults[suiteName]
		fmt.Printf("\n%s (%d failing):\n", suiteName, suite.Failed)
		for _, testCase := range suite.FailedCases {
			fmt.Printf("  - %s\n", testCase)
		}
	}
	fmt.Printf("========================================\n\n")
}

// PrintJSON prints results as JSON (for scripting)
func (s *TestSummary) PrintJSON() {
	data, err := json.MarshalIndent(s, "", "  ")
	if err != nil {
		fmt.Fprintf(os.Stderr, "Failed to marshal JSON: %v\n", err)
		return
	}
	fmt.Println(string(data))
}

// GetReportFlag returns the requested report format from environment or args
func GetReportFlag() string {
	// Check TEST_REPORT environment variable
	if report := os.Getenv("TEST_REPORT"); report != "" {
		return report
	}

	// Check for common flag patterns in os.Args
	for _, arg := range os.Args[1:] {
		if strings.HasPrefix(arg, "--") {
			return strings.TrimPrefix(arg, "--")
		}
	}

	return ""
}
