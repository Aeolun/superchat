/**
 * Comprehensive test runner with automatic test discovery
 *
 * Automatically finds and runs all *.test.ts files
 */

import { runTestSuite, printTestResults, TestResult } from "./test-runner/runner.js";
import { readdirSync, statSync } from "fs";
import { join, relative } from "path";
import { fileURLToPath } from "url";
import { dirname } from "path";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

interface TestSuite {
  name: string;
  description: string;
  schema: any;
  test_type: string;
  test_cases: any[];
}

/**
 * Recursively find all *.test.ts and *.test.js files in a directory
 */
function findTestFiles(dir: string): string[] {
  const files: string[] = [];

  try {
    const entries = readdirSync(dir);

    for (const entry of entries) {
      const fullPath = join(dir, entry);
      const stat = statSync(fullPath);

      if (stat.isDirectory()) {
        // Recursively search subdirectories
        files.push(...findTestFiles(fullPath));
      } else if (entry.endsWith('.test.ts') || entry.endsWith('.test.js')) {
        files.push(fullPath);
      }
    }
  } catch (err) {
    // Ignore directories we can't read
  }

  return files;
}

/**
 * Import a test file and extract all exported test suites
 */
async function loadTestSuites(filePath: string): Promise<TestSuite[]> {
  // Convert absolute path to relative import path
  const relativePath = './' + relative(__dirname, filePath).replace(/\.ts$/, '.js');

  try {
    const module = await import(relativePath);

    // Extract all exports that look like test suites (end with "TestSuite")
    const testSuites: TestSuite[] = [];
    for (const [key, value] of Object.entries(module)) {
      if (key.endsWith('TestSuite') && value && typeof value === 'object') {
        testSuites.push(value as TestSuite);
      }
    }

    return testSuites;
  } catch (err) {
    console.error(`Failed to load test file ${filePath}:`, err);
    return [];
  }
}

/**
 * Get category name from file path (e.g., "tests/composite/strings.test.ts" -> "Composite")
 */
function getCategoryFromPath(filePath: string): string {
  const parts = filePath.split('/');
  const testsIndex = parts.indexOf('tests');

  if (testsIndex >= 0 && testsIndex < parts.length - 1) {
    const category = parts[testsIndex + 1];
    // Capitalize first letter
    return category.charAt(0).toUpperCase() + category.slice(1);
  }

  return 'Other';
}

async function main() {
  // Parse command line arguments
  const args = process.argv.slice(2);
  let filter: string | null = null;

  for (const arg of args) {
    if (arg.startsWith("--filter=")) {
      filter = arg.substring("--filter=".length);
    } else if (arg === "--help" || arg === "-h") {
      console.log("Usage: bun run src/run-tests.ts [options]");
      console.log("");
      console.log("Options:");
      console.log("  --filter=<pattern>  Only run tests with names containing <pattern>");
      console.log("  --help, -h          Show this help message");
      console.log("");
      console.log("Examples:");
      console.log("  bun run src/run-tests.ts                    # Run all tests");
      console.log("  bun run src/run-tests.ts --filter=optional  # Run tests with 'optional' in name");
      console.log("  bun run src/run-tests.ts --filter=uint8     # Run only uint8 tests");
      process.exit(0);
    }
  }

  console.log("=".repeat(80));
  console.log("Running BinSchema Test Suite");
  if (filter) {
    console.log(`Filter: "${filter}"`);
  }
  console.log("=".repeat(80));

  // Find all test files
  const testsDir = join(__dirname, 'tests');
  const testFiles = findTestFiles(testsDir);

  // Load all test suites
  const allSuites: Map<string, TestSuite[]> = new Map();

  for (const testFile of testFiles) {
    const suites = await loadTestSuites(testFile);
    const category = getCategoryFromPath(testFile);

    if (!allSuites.has(category)) {
      allSuites.set(category, []);
    }

    allSuites.get(category)!.push(...suites);
  }

  const results: TestResult[] = [];
  let totalSuites = 0;
  let filteredSuites = 0;

  // Sort categories for consistent output
  const sortedCategories = Array.from(allSuites.keys()).sort();

  for (const category of sortedCategories) {
    const suites = allSuites.get(category)!;

    // Filter suites
    const filteredGroupSuites = filter
      ? suites.filter(suite => suite.name.toLowerCase().includes(filter.toLowerCase()))
      : suites;

    totalSuites += suites.length;
    filteredSuites += filteredGroupSuites.length;

    // Skip empty categories
    if (filteredGroupSuites.length === 0) continue;

    console.log(`\n${"━".repeat(80)}`);
    console.log(`📦 ${category}`);
    console.log(`${"━".repeat(80)}`);

    for (const suite of filteredGroupSuites) {
      const result = await runTestSuite(suite);
      results.push(result);
    }
  }

  // Show filter summary
  if (filter && filteredSuites === 0) {
    console.log(`\n⚠️  No tests matched filter: "${filter}"`);
    console.log(`Total available test suites: ${totalSuites}`);
    process.exit(0);
  } else if (filter) {
    console.log(`\nℹ️  Ran ${filteredSuites} of ${totalSuites} test suites (filtered)`);
  }

  console.log(`\n${"=".repeat(80)}`);
  console.log("Final Results");
  console.log("=".repeat(80));

  printTestResults(results);

  // Exit with error code if any tests failed
  const totalFailed = results.reduce((sum, r) => sum + r.failed, 0);
  if (totalFailed > 0) {
    process.exit(1);
  }
}

main().catch(console.error);
