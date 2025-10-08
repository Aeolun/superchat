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
  value: z.any(),

  // Expected encoded output (provide one or both)
  bytes: z.array(
    z.number().int().min(0).max(255)
  ).optional(),

  bits: z.array(
    z.number().int().min(0).max(1) // Enforce 0 or 1
  ).optional(),
}).refine(
  (data) => data.bytes !== undefined || data.bits !== undefined,
  {
    message: "Must provide either 'bytes' or 'bits' (or both)",
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

  // Test cases
  test_cases: z.array(TestCaseSchema).min(1),
});
export type TestSuite = z.infer<typeof TestSuiteSchema>;

/**
 * Helper function to define a test suite with type checking
 */
export function defineTestSuite(suite: TestSuite): TestSuite {
  return TestSuiteSchema.parse(suite);
}
