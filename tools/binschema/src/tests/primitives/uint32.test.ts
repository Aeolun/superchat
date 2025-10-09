import { defineTestSuite } from "../../schema/test-schema.js";

/**
 * Test suite for uint32 big endian (32-bit unsigned integer)
 *
 * Wire format: 4 bytes, most significant byte first
 */
export const uint32BigEndianTestSuite = defineTestSuite({
  name: "uint32_big_endian",
  description: "32-bit unsigned integer (big endian)",

  schema: {
    config: {
      endianness: "big_endian",
    },
    types: {
      "Uint32Value": {
        sequence: [
          { name: "value", type: "uint32" }
        ]
      }
    }
  },

  test_type: "Uint32Value",

  test_cases: [
    {
      description: "Zero value",
      value: { value: 0 },
      bytes: [0x00, 0x00, 0x00, 0x00],
    },
    {
      description: "Value 0x00000001",
      value: { value: 0x00000001 },
      bytes: [0x00, 0x00, 0x00, 0x01],
    },
    {
      description: "Value 0x12345678",
      value: { value: 0x12345678 },
      bytes: [0x12, 0x34, 0x56, 0x78],
    },
    {
      description: "Maximum value (4294967295)",
      value: { value: 0xFFFFFFFF },
      bytes: [0xFF, 0xFF, 0xFF, 0xFF],
    },
  ]
});

/**
 * Test suite for uint32 little endian (32-bit unsigned integer)
 *
 * Wire format: 4 bytes, least significant byte first
 */
export const uint32LittleEndianTestSuite = defineTestSuite({
  name: "uint32_little_endian",
  description: "32-bit unsigned integer (little endian)",

  schema: {
    config: {
      endianness: "little_endian",
    },
    types: {
      "Uint32Value": {
        sequence: [
          { name: "value", type: "uint32" }
        ]
      }
    }
  },

  test_type: "Uint32Value",

  test_cases: [
    {
      description: "Zero value",
      value: { value: 0 },
      bytes: [0x00, 0x00, 0x00, 0x00],
    },
    {
      description: "Value 0x00000001",
      value: { value: 0x00000001 },
      bytes: [0x01, 0x00, 0x00, 0x00],
    },
    {
      description: "Value 0x12345678",
      value: { value: 0x12345678 },
      bytes: [0x78, 0x56, 0x34, 0x12], // Little endian
    },
    {
      description: "Maximum value (4294967295)",
      value: { value: 0xFFFFFFFF },
      bytes: [0xFF, 0xFF, 0xFF, 0xFF],
    },
  ]
});
