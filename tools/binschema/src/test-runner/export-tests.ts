/**
 * Export TypeScript test definitions to JSON format
 *
 * This script:
 * 1. Discovers all *.test.ts files
 * 2. Imports them and extracts test suites
 * 3. Serializes to JSON format
 * 4. Writes to tests-json/ directory (gitignored)
 *
 * The JSON files are consumed by test runners in any language (TypeScript, Go, Rust, etc.)
 *
 * Usage:
 *   bun run src/test-runner/export-tests.ts
 */

import { readdirSync, statSync, mkdirSync, writeFileSync } from "fs";
import { join, relative, dirname } from "path";
import { fileURLToPath } from "url";
import { TestSuite } from "../schema/test-schema.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

/**
 * Recursively find all *.test.ts files
 */
function findTestFiles(dir: string): string[] {
  const files: string[] = [];

  try {
    const entries = readdirSync(dir);

    for (const entry of entries) {
      const fullPath = join(dir, entry);
      const stat = statSync(fullPath);

      if (stat.isDirectory()) {
        files.push(...findTestFiles(fullPath));
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
 * Import a test file and extract all test suites
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
 * Serialize test suite to JSON with BigInt support
 */
function serializeTestSuite(suite: TestSuite): string {
  return JSON.stringify(suite, (key, value) => {
    // Convert BigInt to string with 'n' suffix for language-agnostic representation
    if (typeof value === 'bigint') {
      return value.toString() + 'n';
    }
    return value;
  }, 2);
}

async function main() {
  console.log("=".repeat(80));
  console.log("Exporting TypeScript tests to JSON");
  console.log("=".repeat(80));

  // Find all test files
  const testsDir = join(__dirname, '../tests');
  const testFiles = findTestFiles(testsDir);

  console.log(`\nFound ${testFiles.length} test files`);

  // Create output directory
  const outputDir = join(__dirname, '../../tests-json');
  mkdirSync(outputDir, { recursive: true });

  let totalSuites = 0;
  let totalFiles = 0;

  // Process each test file
  for (const testFile of testFiles) {
    const suites = await loadTestSuites(testFile);

    if (suites.length === 0) {
      continue;
    }

    // Determine output path (preserve directory structure)
    const relativeToTests = relative(testsDir, testFile);
    const outputPath = join(outputDir, relativeToTests.replace('.test.ts', '.test.json'));

    // Create output directory if needed
    mkdirSync(dirname(outputPath), { recursive: true });

    // Write each suite as separate JSON file (one per suite, not per source file)
    for (const suite of suites) {
      const suitePath = join(dirname(outputPath), `${suite.name}.test.json`);
      const json = serializeTestSuite(suite);
      writeFileSync(suitePath, json, 'utf-8');

      console.log(`  ✓ ${relative(join(__dirname, '../..'), suitePath)}`);
      totalSuites++;
    }

    totalFiles++;
  }

  console.log("\n" + "=".repeat(80));
  console.log(`Exported ${totalSuites} test suites from ${totalFiles} files`);
  console.log(`Output: tests-json/`);
  console.log("=".repeat(80));
}

main().catch(console.error);
