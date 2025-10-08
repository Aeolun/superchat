import { defineTestSuite } from "../../schema/test-schema.js";

/**
 * Test suite for 3-bit values
 *
 * Wire format: 3 bits (range 0-7)
 * Demonstrates non-byte-aligned encoding
 */
export const threeBitsTestSuite = defineTestSuite({
  name: "three_bits",
  description: "3-bit unsigned integer (0-7)",

  schema: {
    config: {
      bit_order: "msb_first",
    },
    types: {
      "ThreeBitValue": {
        fields: [
          { name: "value", type: "bit", size: 3 }
        ]
      }
    }
  },

  test_type: "ThreeBitValue",

  test_cases: [
    {
      description: "Zero (0b000)",
      value: { value: 0 },
      bits: [0, 0, 0],
    },
    {
      description: "One (0b001)",
      value: { value: 1 },
      bits: [0, 0, 1],
    },
    {
      description: "Three (0b011)",
      value: { value: 3 },
      bits: [0, 1, 1],
    },
    {
      description: "Five (0b101)",
      value: { value: 5 },
      bits: [1, 0, 1],
    },
    {
      description: "Maximum (0b111 = 7)",
      value: { value: 7 },
      bits: [1, 1, 1],
    },
  ]
});
