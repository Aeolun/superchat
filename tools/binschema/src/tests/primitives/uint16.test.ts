import { defineTestSuite } from "../../schema/test-schema.js";

/**
 * Test suite for uint16 big endian (16-bit unsigned integer)
 *
 * Wire format: 2 bytes, most significant byte first
 */
export const uint16BigEndianTestSuite = defineTestSuite({
  name: "uint16_big_endian",
  description: "16-bit unsigned integer (big endian)",

  schema: {
    config: {
      endianness: "big_endian",
    },
    types: {
      "Uint16Value": {
        fields: [
          { name: "value", type: "uint16" }
        ]
      }
    }
  },

  test_type: "Uint16Value",

  test_cases: [
    {
      description: "Zero value",
      value: { value: 0 },
      bytes: [0x00, 0x00],
    },
    {
      description: "Value 0x0001 (LSB set)",
      value: { value: 0x0001 },
      bytes: [0x00, 0x01],
    },
    {
      description: "Value 0x0100 (byte boundary)",
      value: { value: 0x0100 },
      bytes: [0x01, 0x00],
    },
    {
      description: "Value 0x1234",
      value: { value: 0x1234 },
      bytes: [0x12, 0x34],
      bits: [
        0,0,0,1,0,0,1,0, // 0x12
        0,0,1,1,0,1,0,0, // 0x34
      ],
    },
    {
      description: "Maximum value (65535)",
      value: { value: 0xFFFF },
      bytes: [0xFF, 0xFF],
    },
  ]
});

/**
 * Test suite for uint16 little endian (16-bit unsigned integer)
 *
 * Wire format: 2 bytes, least significant byte first
 */
export const uint16LittleEndianTestSuite = defineTestSuite({
  name: "uint16_little_endian",
  description: "16-bit unsigned integer (little endian)",

  schema: {
    config: {
      endianness: "little_endian",
    },
    types: {
      "Uint16Value": {
        fields: [
          { name: "value", type: "uint16" }
        ]
      }
    }
  },

  test_type: "Uint16Value",

  test_cases: [
    {
      description: "Zero value",
      value: { value: 0 },
      bytes: [0x00, 0x00],
    },
    {
      description: "Value 0x0001 (LSB set)",
      value: { value: 0x0001 },
      bytes: [0x01, 0x00], // Little endian: LSB first
    },
    {
      description: "Value 0x0100 (byte boundary)",
      value: { value: 0x0100 },
      bytes: [0x00, 0x01], // Little endian: LSB first
    },
    {
      description: "Value 0x1234",
      value: { value: 0x1234 },
      bytes: [0x34, 0x12], // Little endian: 0x34 then 0x12
      bits: [
        0,0,1,1,0,1,0,0, // 0x34
        0,0,0,1,0,0,1,0, // 0x12
      ],
    },
    {
      description: "Maximum value (65535)",
      value: { value: 0xFFFF },
      bytes: [0xFF, 0xFF],
    },
  ]
});
