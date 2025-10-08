import { defineTestSuite } from "../../schema/test-schema.js";

/**
 * Test suite for uint64 big endian (64-bit unsigned integer)
 *
 * Wire format: 8 bytes, most significant byte first
 * Note: JavaScript numbers lose precision beyond 2^53, use BigInt for large values
 */
export const uint64BigEndianTestSuite = defineTestSuite({
  name: "uint64_big_endian",
  description: "64-bit unsigned integer (big endian)",

  schema: {
    config: {
      endianness: "big_endian",
    },
    types: {
      "Uint64Value": {
        fields: [
          { name: "value", type: "uint64" }
        ]
      }
    }
  },

  test_type: "Uint64Value",

  test_cases: [
    {
      description: "Zero value",
      value: { value: 0n },
      bytes: [0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00],
    },
    {
      description: "Value 1",
      value: { value: 1n },
      bytes: [0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x01],
    },
    {
      description: "Value 0x123456789ABCDEF0",
      value: { value: 0x123456789ABCDEF0n },
      bytes: [0x12, 0x34, 0x56, 0x78, 0x9A, 0xBC, 0xDE, 0xF0],
    },
    {
      description: "Maximum safe integer (2^53 - 1)",
      value: { value: 9007199254740991n }, // Number.MAX_SAFE_INTEGER
      bytes: [0x00, 0x1F, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF],
    },
    {
      description: "Maximum value (2^64 - 1)",
      value: { value: 18446744073709551615n },
      bytes: [0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF],
    },
  ]
});

/**
 * Test suite for uint64 little endian (64-bit unsigned integer)
 *
 * Wire format: 8 bytes, least significant byte first
 */
export const uint64LittleEndianTestSuite = defineTestSuite({
  name: "uint64_little_endian",
  description: "64-bit unsigned integer (little endian)",

  schema: {
    config: {
      endianness: "little_endian",
    },
    types: {
      "Uint64Value": {
        fields: [
          { name: "value", type: "uint64" }
        ]
      }
    }
  },

  test_type: "Uint64Value",

  test_cases: [
    {
      description: "Zero value",
      value: { value: 0n },
      bytes: [0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00],
    },
    {
      description: "Value 1",
      value: { value: 1n },
      bytes: [0x01, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00],
    },
    {
      description: "Value 0x123456789ABCDEF0",
      value: { value: 0x123456789ABCDEF0n },
      bytes: [0xF0, 0xDE, 0xBC, 0x9A, 0x78, 0x56, 0x34, 0x12], // Little endian
    },
    {
      description: "Maximum safe integer (2^53 - 1)",
      value: { value: 9007199254740991n },
      bytes: [0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0x1F, 0x00],
    },
    {
      description: "Maximum value (2^64 - 1)",
      value: { value: 18446744073709551615n },
      bytes: [0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF],
    },
  ]
});
