/**
 * Comprehensive test runner with automatic test discovery
 *
 * Automatically exports TypeScript tests to JSON, then runs them
 */

import { runTestSuite, printTestResults, TestResult } from "./test-runner/runner.js";
import { readdirSync, statSync, readFileSync, mkdirSync, writeFileSync, copyFileSync } from "fs";
import { join, relative, dirname } from "path";
import { fileURLToPath } from "url";
import { TestSuite } from "./schema/test-schema.js";
import JSON5 from "json5";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

/**
 * Export TypeScript tests to JSON (inline implementation)
 */
async function exportTestsToJson(): Promise<void> {
  const testsDir = join(__dirname, 'tests');
  const outputDir = join(__dirname, '../tests-json');

  // Create output directory
  mkdirSync(outputDir, { recursive: true });

  // Find all .test.ts files
  const testFiles = findTestSourceFiles(testsDir);

  let totalSuites = 0;

  for (const testFile of testFiles) {
    const suites = await loadTestSuitesFromTypeScript(testFile);

    for (const suite of suites) {
      const relativeToTests = relative(testsDir, dirname(testFile));
      const outputPath = join(outputDir, relativeToTests, `${suite.name}.test.json`);

      mkdirSync(dirname(outputPath), { recursive: true });

      // Use JSON5 to support Infinity, -Infinity, NaN
      const json = JSON5.stringify(suite, (key, value) => {
        if (typeof value === 'bigint') {
          return value.toString() + 'n';
        }
        return value;
      }, 2);

      writeFileSync(outputPath, json, 'utf-8');
      totalSuites++;
    }
  }

  console.log(`Exported ${totalSuites} test suites to JSON`);
}

/**
 * Find all *.test.ts files
 */
function findTestSourceFiles(dir: string): string[] {
  const files: string[] = [];

  try {
    const entries = readdirSync(dir);

    for (const entry of entries) {
      const fullPath = join(dir, entry);
      const stat = statSync(fullPath);

      if (stat.isDirectory()) {
        files.push(...findTestSourceFiles(fullPath));
      } else if (entry.endsWith('.test.ts')) {
        files.push(fullPath);
      }
    }
  } catch (err) {
    // Ignore directories we can't read
  }

  return files;
}

/**
 * Load test suites from TypeScript module
 */
async function loadTestSuitesFromTypeScript(filePath: string): Promise<TestSuite[]> {
  const relativePath = './' + relative(__dirname, filePath).replace(/\.ts$/, '.js');

  try {
    const module = await import(relativePath);

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
 * Recursively find all *.test.json files in a directory
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
      } else if (entry.endsWith('.test.json')) {
        files.push(fullPath);
      }
    }
  } catch (err) {
    // Ignore directories we can't read
  }

  return files;
}

/**
 * Load test suite from JSON file
 */
async function loadTestSuite(filePath: string): Promise<TestSuite | null> {
  try {
    const json = readFileSync(filePath, 'utf-8');

    // Parse JSON5 with BigInt support (supports Infinity, NaN)
    const suite = JSON5.parse(json, (key, value) => {
      // Convert string ending with 'n' back to BigInt
      if (typeof value === 'string' && /^-?\d+n$/.test(value)) {
        return BigInt(value.slice(0, -1));
      }
      return value;
    });

    return suite as TestSuite;
  } catch (err) {
    console.error(`Failed to load test file ${filePath}:`, err);
    return null;
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

/**
 * Set up runtime library in .generated directory
 * Copies bit-stream.ts to BitStream.ts so generated code can import it
 */
function setupRuntimeLibrary(): void {
  const genDir = join(__dirname, '../.generated');
  mkdirSync(genDir, { recursive: true });

  const runtimeSource = join(__dirname, 'runtime/bit-stream.ts');
  const runtimeDest = join(genDir, 'BitStream.ts');

  copyFileSync(runtimeSource, runtimeDest);
  console.log(`Copied runtime library to ${runtimeDest}`);
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

  // Always export TypeScript tests to JSON first
  console.log("\n📝 Exporting TypeScript tests to JSON...");
  await exportTestsToJson();
  console.log("");

  // Set up runtime library for generated code
  console.log("📦 Setting up runtime library...");
  setupRuntimeLibrary();
  console.log("");

  // Find all test JSON files
  const testsJsonDir = join(__dirname, '../tests-json');
  const testFiles = findTestFiles(testsJsonDir);

  // Load all test suites
  const allSuites: Map<string, TestSuite[]> = new Map();

  for (const testFile of testFiles) {
    const suite = await loadTestSuite(testFile);
    if (!suite) continue;

    const category = getCategoryFromPath(testFile);

    if (!allSuites.has(category)) {
      allSuites.set(category, []);
    }

    allSuites.get(category)!.push(suite);
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
