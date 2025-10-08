import { TestSuite, TestCase } from "../schema/test-schema.js";
import { generateTypeScript } from "../generators/typescript.js";
import { writeFileSync, mkdirSync } from "fs";
import { join } from "path";
import { execSync } from "child_process";
import { pathToFileURL } from "url";

/**
 * Test Runner
 *
 * Runs test suites by:
 * 1. Generating TypeScript code from schema
 * 2. Compiling to JavaScript
 * 3. Dynamically importing generated code
 * 4. Running encode/decode tests
 * 5. Comparing results with expected bytes/bits
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

  // Write to .generated directory
  const genDir = join(process.cwd(), ".generated");
  mkdirSync(genDir, { recursive: true });
  const genFile = join(genDir, `${suite.test_type}.ts`);
  writeFileSync(genFile, generatedCode);

  console.log(`\nGenerated code for ${suite.name} → ${genFile}`);

  // Compile TypeScript to JavaScript
  try {
    execSync(`npx tsc ${genFile} --outDir ${genDir} --module esnext --target es2020 --moduleResolution node`, {
      cwd: process.cwd(),
      stdio: "inherit",
    });
  } catch (error) {
    console.error("TypeScript compilation failed!");
    result.failed = suite.test_cases.length;
    return result;
  }

  // Dynamically import generated code
  const genJsFile = join(genDir, `${suite.test_type}.js`);
  const generatedModule = await import(pathToFileURL(genJsFile).href);

  // Get encoder/decoder class names (use test_type, not first type in schema)
  const typeName = suite.test_type;
  const EncoderClass = generatedModule[`${typeName}Encoder`];
  const DecoderClass = generatedModule[`${typeName}Decoder`];

  if (!EncoderClass || !DecoderClass) {
    console.error(`Could not find ${typeName}Encoder or ${typeName}Decoder in generated code`);
    result.failed = suite.test_cases.length;
    return result;
  }

  // Run each test case
  for (const testCase of suite.test_cases) {
    const testResult = await runTestCase(testCase, EncoderClass, DecoderClass);
    if (testResult.passed) {
      result.passed++;
    } else {
      result.failed++;
      result.failures.push(...testResult.failures);
    }
  }

  return result;
}

/**
 * Run a single test case
 */
async function runTestCase(
  testCase: TestCase,
  EncoderClass: any,
  DecoderClass: any
): Promise<{ passed: boolean; failures: TestFailure[] }> {
  const failures: TestFailure[] = [];
  const format = testCase.bytes ? "bytes" : "bits";

  try {
    // Test encoding
    const encoder = new EncoderClass();

    let encoded: number[];
    let expected: number[];

    if (format === "bytes") {
      // Byte-level encoding
      encoded = Array.from(encoder.encode(testCase.value));
      expected = testCase.bytes!;
    } else {
      // Bit-level encoding - use finishBits() method
      encoder.encode(testCase.value);
      encoded = encoder.finishBits();
      expected = testCase.bits!;
    }

    if (!arraysEqual(encoded, expected)) {
      failures.push({
        description: testCase.description,
        type: "encode",
        expected: expected,
        actual: encoded,
        message: `Encoded ${format} do not match`,
      });
    }

    // Test decoding (round-trip)
    if (testCase.bytes) {
      const decoder = new DecoderClass(new Uint8Array(testCase.bytes));
      const decoded = decoder.decode();

      if (!deepEqual(decoded, testCase.value)) {
        failures.push({
          description: testCase.description,
          type: "decode",
          expected: JSON.stringify(testCase.value),
          actual: JSON.stringify(decoded),
          message: "Decoded value does not match original",
        });
      }
    }
  } catch (error) {
    failures.push({
      description: testCase.description,
      type: "encode",
      expected: testCase.bytes || testCase.bits || [],
      actual: [],
      message: `Exception: ${error}`,
    });
  }

  return {
    passed: failures.length === 0,
    failures,
  };
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
 * Deep equality comparison for objects
 */
function deepEqual(a: any, b: any): boolean {
  if (a === b) return true;
  if (typeof a !== typeof b) return false;
  if (typeof a !== "object" || a === null || b === null) return false;

  // Handle arrays
  if (Array.isArray(a) && Array.isArray(b)) {
    if (a.length !== b.length) return false;
    for (let i = 0; i < a.length; i++) {
      if (!deepEqual(a[i], b[i])) return false;
    }
    return true;
  }

  // Handle objects
  const keysA = Object.keys(a);
  const keysB = Object.keys(b);
  if (keysA.length !== keysB.length) return false;

  for (const key of keysA) {
    if (!keysB.includes(key)) return false;
    if (!deepEqual(a[key], b[key])) return false;
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
