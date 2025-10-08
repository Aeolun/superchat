import { defineTestSuite } from "../../schema/test-schema.js";

/**
 * Test suite for int8 (8-bit signed integer)
 *
 * Wire format: Single byte, two's complement
 * Range: -128 to 127
 */
export const int8TestSuite = defineTestSuite({
  name: "int8",
  description: "8-bit signed integer (two's complement)",

  schema: {
    types: {
      "Int8Value": {
        fields: [
          { name: "value", type: "int8" }
        ]
      }
    }
  },

  test_type: "Int8Value",

  test_cases: [
    {
      description: "Zero",
      value: { value: 0 },
      bytes: [0x00],
    },
    {
      description: "Positive value (42)",
      value: { value: 42 },
      bytes: [0x2A],
    },
    {
      description: "Negative value (-1)",
      value: { value: -1 },
      bytes: [0xFF], // Two's complement: -1 = 0xFF
    },
    {
      description: "Negative value (-42)",
      value: { value: -42 },
      bytes: [0xD6], // Two's complement: -42 = 0xD6
    },
    {
      description: "Minimum value (-128)",
      value: { value: -128 },
      bytes: [0x80],
    },
    {
      description: "Maximum value (127)",
      value: { value: 127 },
      bytes: [0x7F],
    },
  ]
});

/**
 * Test suite for int16 big endian (16-bit signed integer)
 *
 * Wire format: 2 bytes, two's complement, most significant byte first
 * Range: -32768 to 32767
 */
export const int16BigEndianTestSuite = defineTestSuite({
  name: "int16_big_endian",
  description: "16-bit signed integer (big endian)",

  schema: {
    config: {
      endianness: "big_endian",
    },
    types: {
      "Int16Value": {
        fields: [
          { name: "value", type: "int16" }
        ]
      }
    }
  },

  test_type: "Int16Value",

  test_cases: [
    {
      description: "Zero",
      value: { value: 0 },
      bytes: [0x00, 0x00],
    },
    {
      description: "Positive value (1000)",
      value: { value: 1000 },
      bytes: [0x03, 0xE8],
    },
    {
      description: "Negative value (-1)",
      value: { value: -1 },
      bytes: [0xFF, 0xFF],
    },
    {
      description: "Negative value (-1000)",
      value: { value: -1000 },
      bytes: [0xFC, 0x18], // Two's complement
    },
    {
      description: "Minimum value (-32768)",
      value: { value: -32768 },
      bytes: [0x80, 0x00],
    },
    {
      description: "Maximum value (32767)",
      value: { value: 32767 },
      bytes: [0x7F, 0xFF],
    },
  ]
});

/**
 * Test suite for int32 big endian (32-bit signed integer)
 *
 * Wire format: 4 bytes, two's complement, most significant byte first
 * Range: -2147483648 to 2147483647
 */
export const int32BigEndianTestSuite = defineTestSuite({
  name: "int32_big_endian",
  description: "32-bit signed integer (big endian)",

  schema: {
    config: {
      endianness: "big_endian",
    },
    types: {
      "Int32Value": {
        fields: [
          { name: "value", type: "int32" }
        ]
      }
    }
  },

  test_type: "Int32Value",

  test_cases: [
    {
      description: "Zero",
      value: { value: 0 },
      bytes: [0x00, 0x00, 0x00, 0x00],
    },
    {
      description: "Positive value (1000000)",
      value: { value: 1000000 },
      bytes: [0x00, 0x0F, 0x42, 0x40],
    },
    {
      description: "Negative value (-1)",
      value: { value: -1 },
      bytes: [0xFF, 0xFF, 0xFF, 0xFF],
    },
    {
      description: "Negative value (-1000000)",
      value: { value: -1000000 },
      bytes: [0xFF, 0xF0, 0xBD, 0xC0],
    },
    {
      description: "Minimum value (-2147483648)",
      value: { value: -2147483648 },
      bytes: [0x80, 0x00, 0x00, 0x00],
    },
    {
      description: "Maximum value (2147483647)",
      value: { value: 2147483647 },
      bytes: [0x7F, 0xFF, 0xFF, 0xFF],
    },
  ]
});

/**
 * Test suite for int64 big endian (64-bit signed integer)
 *
 * Wire format: 8 bytes, two's complement, most significant byte first
 * Range: -9223372036854775808 to 9223372036854775807
 */
export const int64BigEndianTestSuite = defineTestSuite({
  name: "int64_big_endian",
  description: "64-bit signed integer (big endian)",

  schema: {
    config: {
      endianness: "big_endian",
    },
    types: {
      "Int64Value": {
        fields: [
          { name: "value", type: "int64" }
        ]
      }
    }
  },

  test_type: "Int64Value",

  test_cases: [
    {
      description: "Zero",
      value: { value: 0n },
      bytes: [0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00],
    },
    {
      description: "Positive value (1000000000000)",
      value: { value: 1000000000000n },
      bytes: [0x00, 0x00, 0x00, 0xE8, 0xD4, 0xA5, 0x10, 0x00],
    },
    {
      description: "Negative value (-1)",
      value: { value: -1n },
      bytes: [0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF],
    },
    {
      description: "Negative value (-1000000000000)",
      value: { value: -1000000000000n },
      bytes: [0xFF, 0xFF, 0xFF, 0x17, 0x2B, 0x5A, 0xF0, 0x00],
    },
    {
      description: "Minimum value (-9223372036854775808)",
      value: { value: -9223372036854775808n },
      bytes: [0x80, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00],
    },
    {
      description: "Maximum value (9223372036854775807)",
      value: { value: 9223372036854775807n },
      bytes: [0x7F, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF],
    },
  ]
});
