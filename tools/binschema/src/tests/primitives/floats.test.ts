import { defineTestSuite } from "../../schema/test-schema.js";

/**
 * Test suite for float32 (32-bit IEEE 754 floating point)
 *
 * Wire format: 4 bytes, IEEE 754 single precision
 * Endianness applies to byte order
 */
export const float32BigEndianTestSuite = defineTestSuite({
  name: "float32_big_endian",
  description: "32-bit IEEE 754 float (big endian)",

  schema: {
    config: {
      endianness: "big_endian",
    },
    types: {
      "Float32Value": {
        fields: [
          { name: "value", type: "float32" }
        ]
      }
    }
  },

  test_type: "Float32Value",

  test_cases: [
    {
      description: "Zero (0.0)",
      value: { value: 0.0 },
      bytes: [0x00, 0x00, 0x00, 0x00],
    },
    {
      description: "One (1.0)",
      value: { value: 1.0 },
      bytes: [0x3F, 0x80, 0x00, 0x00], // IEEE 754: 0x3F800000
    },
    {
      description: "Negative one (-1.0)",
      value: { value: -1.0 },
      bytes: [0xBF, 0x80, 0x00, 0x00], // IEEE 754: 0xBF800000
    },
    {
      description: "Pi (3.14159265359)",
      value: { value: 3.14159265359 },
      bytes: [0x40, 0x49, 0x0F, 0xDB], // IEEE 754: approximately pi
    },
    {
      description: "Very small number (0.000001)",
      value: { value: 0.000001 },
      bytes: [0x35, 0x86, 0x37, 0xBD],
    },
    {
      description: "Infinity",
      value: { value: Infinity },
      bytes: [0x7F, 0x80, 0x00, 0x00],
    },
    {
      description: "Negative infinity",
      value: { value: -Infinity },
      bytes: [0xFF, 0x80, 0x00, 0x00],
    },
    // Note: NaN is tricky because there are multiple NaN representations
    // Skipping NaN test for now
  ]
});

/**
 * Test suite for float64 (64-bit IEEE 754 floating point)
 *
 * Wire format: 8 bytes, IEEE 754 double precision
 * Endianness applies to byte order
 */
export const float64BigEndianTestSuite = defineTestSuite({
  name: "float64_big_endian",
  description: "64-bit IEEE 754 double (big endian)",

  schema: {
    config: {
      endianness: "big_endian",
    },
    types: {
      "Float64Value": {
        fields: [
          { name: "value", type: "float64" }
        ]
      }
    }
  },

  test_type: "Float64Value",

  test_cases: [
    {
      description: "Zero (0.0)",
      value: { value: 0.0 },
      bytes: [0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00],
    },
    {
      description: "One (1.0)",
      value: { value: 1.0 },
      bytes: [0x3F, 0xF0, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00],
    },
    {
      description: "Negative one (-1.0)",
      value: { value: -1.0 },
      bytes: [0xBF, 0xF0, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00],
    },
    {
      description: "Pi (3.141592653589793)",
      value: { value: Math.PI },
      bytes: [0x40, 0x09, 0x21, 0xFB, 0x54, 0x44, 0x2D, 0x18],
    },
    {
      description: "Euler's number (2.718281828459045)",
      value: { value: Math.E },
      bytes: [0x40, 0x05, 0xBF, 0x0A, 0x8B, 0x14, 0x57, 0x69],
    },
    {
      description: "Very small number (1e-10)",
      value: { value: 1e-10 },
      bytes: [0x3D, 0xDB, 0x7C, 0xDF, 0xD9, 0xD7, 0xBD, 0xBB],
    },
    {
      description: "Infinity",
      value: { value: Infinity },
      bytes: [0x7F, 0xF0, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00],
    },
    {
      description: "Negative infinity",
      value: { value: -Infinity },
      bytes: [0xFF, 0xF0, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00],
    },
  ]
});

/**
 * Test suite for float32 little endian
 *
 * Wire format: 4 bytes, IEEE 754 single precision, LSB first
 */
export const float32LittleEndianTestSuite = defineTestSuite({
  name: "float32_little_endian",
  description: "32-bit IEEE 754 float (little endian)",

  schema: {
    config: {
      endianness: "little_endian",
    },
    types: {
      "Float32Value": {
        fields: [
          { name: "value", type: "float32" }
        ]
      }
    }
  },

  test_type: "Float32Value",

  test_cases: [
    {
      description: "Zero (0.0)",
      value: { value: 0.0 },
      bytes: [0x00, 0x00, 0x00, 0x00],
    },
    {
      description: "One (1.0)",
      value: { value: 1.0 },
      bytes: [0x00, 0x00, 0x80, 0x3F], // Little endian
    },
    {
      description: "Pi (3.14159265359)",
      value: { value: 3.14159265359 },
      bytes: [0xDB, 0x0F, 0x49, 0x40], // Little endian
    },
  ]
});

/**
 * Test suite for float64 little endian
 *
 * Wire format: 8 bytes, IEEE 754 double precision, LSB first
 */
export const float64LittleEndianTestSuite = defineTestSuite({
  name: "float64_little_endian",
  description: "64-bit IEEE 754 float (little endian)",

  schema: {
    config: {
      endianness: "little_endian",
    },
    types: {
      "Float64Value": {
        fields: [
          { name: "value", type: "float64" }
        ]
      }
    }
  },

  test_type: "Float64Value",

  test_cases: [
    {
      description: "Zero (0.0)",
      value: { value: 0.0 },
      bytes: [0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00],
    },
    {
      description: "One (1.0)",
      value: { value: 1.0 },
      bytes: [0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0xF0, 0x3F], // Little endian
    },
    {
      description: "Negative one (-1.0)",
      value: { value: -1.0 },
      bytes: [0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0xF0, 0xBF], // Little endian
    },
    {
      description: "Pi (3.141592653589793)",
      value: { value: Math.PI },
      bytes: [0x18, 0x2D, 0x44, 0x54, 0xFB, 0x21, 0x09, 0x40], // Little endian
    },
    {
      description: "Euler's number (2.718281828459045)",
      value: { value: Math.E },
      bytes: [0x69, 0x57, 0x14, 0x8B, 0x0A, 0xBF, 0x05, 0x40], // Little endian
    },
    {
      description: "Very small number (1e-10)",
      value: { value: 1e-10 },
      bytes: [0xBB, 0xBD, 0xD7, 0xD9, 0xDF, 0x7C, 0xDB, 0x3D], // Little endian
    },
    {
      description: "Negative zero (-0.0)",
      value: { value: -0.0 },
      bytes: [0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x80], // Sign bit set
    },
    {
      description: "Infinity",
      value: { value: Infinity },
      bytes: [0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0xF0, 0x7F], // Little endian
    },
    {
      description: "Negative infinity",
      value: { value: -Infinity },
      bytes: [0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0xF0, 0xFF], // Little endian
    },
  ]
});
