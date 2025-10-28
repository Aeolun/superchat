import { TestSuite, TestCase } from "../schema/test-schema.js";
import { generateTypeScript } from "../generators/typescript.js";
import { validateSchema, formatValidationErrors } from "../schema/validator.js";
import { writeFileSync, mkdirSync } from "fs";
import { join } from "path";
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

/**
 * Stringify with BigInt support
 * Converts BigInt to string with 'n' suffix
 */
function stringifyWithBigInt(value: any): string {
  return JSON.stringify(value, (key, val) =>
    typeof val === 'bigint' ? val.toString() + 'n' : val
  );
}

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

  // Validate schema before generation
  const validation = validateSchema(suite.schema);
  if (!validation.valid) {
    console.error(`\n❌ Schema validation failed for ${suite.name}:`);
    console.error(formatValidationErrors(validation));

    // If this is a schema validation error test, this is expected
    if (suite.schema_validation_error) {
      console.log(`  ✓ Schema validation correctly failed (expected)`);
      result.passed = 1;
      return result;
    }

    // Otherwise, unexpected schema validation failure
    result.failed = suite.test_cases?.length ?? 0;
    for (const testCase of suite.test_cases ?? []) {
      result.failures.push({
        description: testCase.description,
        type: "encode",
        expected: [],
        actual: [],
        message: "Schema validation failed",
      });
    }
    return result;
  }

  // If this is a schema validation error test but schema passed, that's wrong
  if (suite.schema_validation_error) {
    console.error(`\n❌ Expected schema validation to fail for ${suite.name}, but it passed`);
    result.failed = 1;
    result.failures.push({
      description: "Schema validation",
      type: "encode",
      expected: [],
      actual: [],
      message: "Expected schema validation to fail, but it passed",
    });
    return result;
  }

  // Generate TypeScript code
  const generatedCode = generateTypeScript(suite.schema);

  // Write to .generated directory (use suite.name to avoid collisions between variants)
  const genDir = join(process.cwd(), ".generated");
  mkdirSync(genDir, { recursive: true });
  const genFile = join(genDir, `${suite.name}.ts`);
  writeFileSync(genFile, generatedCode);

  console.log(`\nGenerated code for ${suite.name} → ${genFile}`);

  // Dynamically import generated TypeScript code (bun supports .ts natively)
  // Force fresh import by adding timestamp to bypass cache
  const generatedModule = await import(pathToFileURL(genFile).href + `?t=${Date.now()}`);

  // Get encoder/decoder class names (use test_type, not first type in schema)
  const typeName = suite.test_type;
  const EncoderClass = generatedModule[`${typeName}Encoder`];
  const DecoderClass = generatedModule[`${typeName}Decoder`];

  if (!EncoderClass || !DecoderClass) {
    console.error(`Could not find ${typeName}Encoder or ${typeName}Decoder in generated code`);
    result.failed = suite.test_cases?.length ?? 0;
    return result;
  }

  // Check if test type has instance fields (position-based random access)
  const testTypeDef = (suite.schema.types as any)?.[typeName];
  const hasInstanceFields = testTypeDef && (testTypeDef.instances?.length ?? 0) > 0;

  // Run each test case
  for (const testCase of suite.test_cases ?? []) {
    // Run standard encode/decode test
    const testResult = await runTestCase(testCase, EncoderClass, DecoderClass, hasInstanceFields);
    if (testResult.passed) {
      result.passed++;
    } else {
      result.failed++;
      result.failures.push(...testResult.failures);
    }

    // If chunkSizes provided, also run streaming test
    if (testCase.chunkSizes && testCase.bytes) {
      const streamResult = await runStreamingTestCase(
        testCase,
        EncoderClass,
        DecoderClass,
        typeName,
        generatedModule
      );
      if (streamResult.passed) {
        result.passed++;
      } else {
        result.failed++;
        result.failures.push(...streamResult.failures);
      }
    }
  }

  return result;
}

/**
 * Create a mock ReadableStream that delivers bytes in chunks
 */
function createChunkedStream(fullData: Uint8Array, chunkSizes: number[]): ReadableStream<Uint8Array> {
  let offset = 0;
  let chunkIndex = 0;

  return new ReadableStream({
    pull(controller) {
      if (offset >= fullData.length) {
        controller.close();
        return;
      }

      const chunkSize = chunkSizes[chunkIndex % chunkSizes.length];
      const end = Math.min(offset + chunkSize, fullData.length);
      const chunk = fullData.slice(offset, end);

      controller.enqueue(chunk);
      offset = end;
      chunkIndex++;
    }
  });
}

/**
 * Run streaming test case
 * Tests that data can be decoded when delivered in chunks
 */
async function runStreamingTestCase(
  testCase: TestCase,
  EncoderClass: any,
  DecoderClass: any,
  typeName: string,
  generatedModule: any
): Promise<{ passed: boolean; failures: TestFailure[] }> {
  const failures: TestFailure[] = [];

  try {
    const fullData = new Uint8Array(testCase.bytes!);
    const stream = createChunkedStream(fullData, testCase.chunkSizes!);
    const reader = stream.getReader();

    // Try to find streaming decoder function
    const streamDecoderFn = generatedModule[`decode${typeName}Stream`];

    if (!streamDecoderFn) {
      // No streaming decoder generated yet - skip test
      console.log(`  ⚠ Skipping streaming test for ${testCase.description} - no streaming decoder generated`);
      return { passed: true, failures: [] };
    }

    // Decode using streaming API
    const items: any[] = [];
    for await (const item of streamDecoderFn(reader)) {
      items.push(item);
    }

    // Compare decoded items with expected value
    // For arrays, the value should be an array of items
    const expectedItems = Array.isArray(testCase.value)
      ? testCase.value
      : [testCase.value];

    if (!deepEqual(items, expectedItems)) {
      failures.push({
        description: `${testCase.description} (streaming with chunks ${testCase.chunkSizes!.join(',')})`,
        type: "decode",
        expected: stringifyWithBigInt(expectedItems),
        actual: stringifyWithBigInt(items),
        message: "Streaming decode does not match expected value",
      });
    }

  } catch (error) {
    failures.push({
      description: `${testCase.description} (streaming)`,
      type: "decode",
      expected: stringifyWithBigInt(testCase.value),
      actual: "",
      message: `Streaming exception: ${error}`,
    });
  }

  return {
    passed: failures.length === 0,
    failures,
  };
}

/**
 * Run a single test case
 */
async function runTestCase(
  testCase: TestCase,
  EncoderClass: any,
  DecoderClass: any,
  skipEncoding: boolean = false
): Promise<{ passed: boolean; failures: TestFailure[] }> {
  const failures: TestFailure[] = [];

  // Handle encoding error test cases (should_error_on_encode = true)
  if (testCase.should_error_on_encode) {
    try {
      const encoder = new EncoderClass();
      const encoded = encoder.encode(testCase.value);

      // If we got here, encode didn't throw - that's a failure
      failures.push({
        description: testCase.description,
        type: "encode",
        expected: `Error containing: ${testCase.error_message || "any error"}`,
        actual: `Encoded successfully to ${Array.from(encoded).length} bytes`,
        message: "Expected encode to throw an error, but it succeeded",
      });
    } catch (error) {
      // Error was thrown - check if message matches (if error_message specified)
      if (testCase.error_message) {
        const errorStr = String(error);
        if (!errorStr.includes(testCase.error_message)) {
          failures.push({
            description: testCase.description,
            type: "encode",
            expected: `Error containing: ${testCase.error_message}`,
            actual: errorStr,
            message: "Error was thrown but message doesn't match expected",
          });
        }
      }
      // Otherwise, any error is success
    }

    return {
      passed: failures.length === 0,
      failures,
    };
  }

  // Handle decoding error test cases (should_error = true)
  if (testCase.should_error) {
    try {
      if (testCase.bytes) {
        const decoder = new DecoderClass(new Uint8Array(testCase.bytes));
        const decoded = decoder.decode();

        // If we got here, decode didn't throw - that's a failure
        failures.push({
          description: testCase.description,
          type: "decode",
          expected: `Error containing: ${testCase.error_message || "any error"}`,
          actual: stringifyWithBigInt(decoded),
          message: "Expected decode to throw an error, but it succeeded",
        });
      }
    } catch (error) {
      // Error was thrown - check if message matches (if error_message specified)
      if (testCase.error_message) {
        const errorStr = String(error);
        if (!errorStr.includes(testCase.error_message)) {
          failures.push({
            description: testCase.description,
            type: "decode",
            expected: `Error containing: ${testCase.error_message}`,
            actual: errorStr,
            message: "Error was thrown but message doesn't match expected",
          });
        }
      }
      // Otherwise, any error is success
    }

    return {
      passed: failures.length === 0,
      failures,
    };
  }

  // Normal test case (not error test)
  const format = testCase.bytes ? "bytes" : "bits";

  try {
    // Test encoding (skip for types with instance fields - they're decode-only)
    if (!skipEncoding) {
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
    }

    // Test decoding (round-trip)
    if (testCase.bytes) {
      const decoder = new DecoderClass(new Uint8Array(testCase.bytes));
      const decoded = decoder.decode();

      // Use decoded_value if present (for computed fields), otherwise use value
      const expectedDecoded = testCase.decoded_value !== undefined ? testCase.decoded_value : testCase.value;

      if (!deepEqual(decoded, expectedDecoded)) {
        failures.push({
          description: testCase.description,
          type: "decode",
          expected: stringifyWithBigInt(expectedDecoded),
          actual: stringifyWithBigInt(decoded),
          message: "Decoded value does not match expected",
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
 * Check if two numbers are approximately equal (for float comparisons)
 * Uses relative tolerance for large numbers, absolute for small
 */
function approximatelyEqual(a: number, b: number): boolean {
  // Exact match (including special values like Infinity, NaN)
  if (a === b) return true;

  // NaN handling
  if (Number.isNaN(a) && Number.isNaN(b)) return true;
  if (Number.isNaN(a) || Number.isNaN(b)) return false;

  // Float32 has ~7 decimal digits of precision
  // Use relative error tolerance
  const diff = Math.abs(a - b);
  const absA = Math.abs(a);
  const absB = Math.abs(b);
  const largest = Math.max(absA, absB);

  // For very small numbers near zero, use absolute tolerance
  if (largest < 1e-9) {
    return diff < 1e-12;
  }

  // For normal numbers, use relative tolerance
  // Float32 precision is ~6-7 significant digits, so allow 1.5% error
  return diff / largest < 0.015;
}

/**
 * Deep equality comparison for objects
 */
function deepEqual(a: any, b: any): boolean {
  if (a === b) return true;

  // Special handling for numbers (float comparisons with tolerance)
  if (typeof a === "number" && typeof b === "number") {
    return approximatelyEqual(a, b);
  }

  // Special handling for bigint - allow comparison between bigint and number
  if (typeof a === "bigint" || typeof b === "bigint") {
    // Convert both to bigint for comparison
    try {
      const bigA = typeof a === "bigint" ? a : BigInt(a);
      const bigB = typeof b === "bigint" ? b : BigInt(b);
      return bigA === bigB;
    } catch {
      return false;
    }
  }

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
        // Show expected vs actual for both encode and decode failures
        if (failure.type === "encode") {
          console.log(`      Expected bytes: [${failure.expected}]`);
          console.log(`      Actual bytes:   [${failure.actual}]`);
        } else if (failure.type === "decode") {
          console.log(`      Expected: ${failure.expected}`);
          console.log(`      Actual:   ${failure.actual}`);
        }
      }
    }
  }

  console.log(`\nTotal: ${totalPassed} passed, ${totalFailed} failed`);
}
