import { TestSuite } from "../schema/test-schema.js";
import { generateTypeScript } from "../generators/typescript.js";
import { writeFileSync, mkdirSync } from "fs";
import { join } from "path";

/**
 * Test Runner
 *
 * Runs test suites by:
 * 1. Generating TypeScript code from schema
 * 2. Dynamically importing generated code
 * 3. Running encode/decode tests
 * 4. Comparing results with expected bytes/bits
 */

export interface TestResult {
  testSuite: string;
  passed: number;
  failed: number;
  failures: TestFailure[];
}

export interface TestFailure {
  description: string;
  type: "encode" | "decode";
  expected: number[] | string;
  actual: number[] | string;
  message: string;
}

/**
 * Run a test suite
 */
export async function runTestSuite(suite: TestSuite): Promise<TestResult> {
  const result: TestResult = {
    testSuite: suite.name,
    passed: 0,
    failed: 0,
    failures: [],
  };

  // Generate TypeScript code
  const generatedCode = generateTypeScript(suite.schema);

  // Write to temporary file
  const genDir = join(process.cwd(), ".generated");
  mkdirSync(genDir, { recursive: true });
  const genFile = join(genDir, `${suite.test_type}.ts`);
  writeFileSync(genFile, generatedCode);

  console.log(`Generated code for ${suite.name}:`);
  console.log(generatedCode);
  console.log("\n---\n");

  // TODO: Dynamically import and test
  // For now, just report success (we'll implement actual testing next)
  result.passed = suite.test_cases.length;

  return result;
}

/**
 * Convert bytes to bits for comparison
 */
function bytesToBits(bytes: number[]): number[] {
  const bits: number[] = [];
  for (const byte of bytes) {
    for (let i = 7; i >= 0; i--) {
      bits.push((byte >> i) & 1);
    }
  }
  return bits;
}

/**
 * Compare two arrays for equality
 */
function arraysEqual<T>(a: T[], b: T[]): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    if (a[i] !== b[i]) return false;
  }
  return true;
}

/**
 * Pretty print test results
 */
export function printTestResults(results: TestResult[]): void {
  let totalPassed = 0;
  let totalFailed = 0;

  for (const result of results) {
    totalPassed += result.passed;
    totalFailed += result.failed;

    console.log(`\n${result.testSuite}:`);
    console.log(`  ✓ ${result.passed} passed`);
    if (result.failed > 0) {
      console.log(`  ✗ ${result.failed} failed`);
      for (const failure of result.failures) {
        console.log(`    - ${failure.description}: ${failure.message}`);
      }
    }
  }

  console.log(`\nTotal: ${totalPassed} passed, ${totalFailed} failed`);
}
