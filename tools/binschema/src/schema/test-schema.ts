import { z } from "zod";
import { BinarySchemaSchema } from "./binary-schema.js";

/**
 * Test Case Schema
 *
 * Defines test cases for binary schemas with expected encoded output.
 * Tests are bidirectional: encode(value) → bytes/bits, decode(bytes/bits) → value
 */

/**
 * Single test case
 */
export const TestCaseSchema = z.object({
  description: z.string(),

  // The input value to encode (primitive, object, array, etc.)
  // Optional for error test cases (which only test decode)
  value: z.any().optional(),

  // Expected encoded output (provide one or both)
  bytes: z.array(
    z.number().int().min(0).max(255)
  ).optional(),

  bits: z.array(
    z.number().int().min(0).max(1) // Enforce 0 or 1
  ).optional(),

  // Optional: chunk sizes for streaming tests
  // If provided, bytes will be delivered in chunks of these sizes
  // Example: [3, 5, 10] means first chunk 3 bytes, second chunk 5 bytes, etc.
  chunkSizes: z.array(z.number().int().min(1)).optional(),

  // Optional: expect this test to error during decode
  should_error: z.boolean().optional(),

  // Optional: expected error message (partial match)
  error_message: z.string().optional(),
}).refine(
  (data) => {
    // Normal test cases need value AND (bytes or bits)
    if (!data.should_error) {
      return data.value !== undefined && (data.bytes !== undefined || data.bits !== undefined);
    }
    // Error test cases only need bytes to try decoding (no value needed)
    return data.bytes !== undefined;
  },
  {
    message: "Normal tests need value + (bytes or bits). Error tests need bytes only.",
  }
).refine(
  (data) => {
    // If chunkSizes provided, validate they sum to bytes.length
    if (data.chunkSizes && data.bytes) {
      const totalChunkSize = data.chunkSizes.reduce((sum, size) => sum + size, 0);
      return totalChunkSize === data.bytes.length;
    }
    return true;
  },
  {
    message: "chunkSizes must sum to exactly bytes.length",
  }
);
export type TestCase = z.infer<typeof TestCaseSchema>;

/**
 * Test suite for a binary schema
 */
export const TestSuiteSchema = z.object({
  name: z.string(),
  description: z.string().optional(),

  // The schema being tested
  schema: BinarySchemaSchema,

  // Type name to test (from schema.types)
  test_type: z.string(),

  // Test cases (omit for schema validation error tests)
  test_cases: z.array(TestCaseSchema).min(1).optional(),

  // Optional: expect schema validation to fail
  schema_validation_error: z.boolean().optional(),

  // Optional: expected schema validation error message (partial match)
  error_message: z.string().optional(),
}).refine(
  (data) => {
    // Either have test_cases OR be a schema validation error test
    return (data.test_cases !== undefined && data.test_cases.length > 0) || data.schema_validation_error === true;
  },
  {
    message: "Must provide either test_cases or schema_validation_error=true",
  }
);
export type TestSuite = z.infer<typeof TestSuiteSchema>;

/**
 * Helper function to define a test suite with type checking
 */
export function defineTestSuite(suite: TestSuite): TestSuite {
  return TestSuiteSchema.parse(suite);
}
