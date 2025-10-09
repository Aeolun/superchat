import { defineTestSuite } from "../../schema/test-schema.js";

/**
 * Test suite for uint8 (8-bit unsigned integer)
 *
 * Wire format: Single byte, no endianness concerns
 */
export const uint8TestSuite = defineTestSuite({
  name: "uint8",
  description: "8-bit unsigned integer",

  schema: {
    types: {
      "Uint8Value": {
        sequence: [
          { name: "value", type: "uint8" }
        ]
      }
    }
  },

  test_type: "Uint8Value",

  test_cases: [
    {
      description: "Zero value",
      value: { value: 0 },
      bytes: [0x00],
      bits: [0,0,0,0,0,0,0,0],
    },
    {
      description: "Single bit set (LSB)",
      value: { value: 1 },
      bytes: [0x01],
      bits: [0,0,0,0,0,0,0,1],
    },
    {
      description: "Single bit set (MSB)",
      value: { value: 128 },
      bytes: [0x80],
      bits: [1,0,0,0,0,0,0,0],
    },
    {
      description: "Arbitrary value 0x42",
      value: { value: 0x42 },
      bytes: [0x42],
      bits: [0,1,0,0,0,0,1,0],
    },
    {
      description: "Maximum value (255)",
      value: { value: 255 },
      bytes: [0xFF],
      bits: [1,1,1,1,1,1,1,1],
    },
  ]
});
