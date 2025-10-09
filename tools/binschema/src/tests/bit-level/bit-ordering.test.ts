import { defineTestSuite } from "../../schema/test-schema.js";

/**
 * Test suite for MSB-first bit ordering
 *
 * MSB-first (most common): bits read left-to-right within bytes
 * Example: byte 0b10110010
 *   - bit 0 = 1 (leftmost/MSB)
 *   - bit 7 = 0 (rightmost/LSB)
 */
export const msbFirstTestSuite = defineTestSuite({
  name: "bit_order_msb_first",
  description: "MSB-first bit ordering (read bits left to right)",

  schema: {
    config: {
      bit_order: "msb_first",
    },
    types: {
      "ThreeBits": {
        sequence: [
          { name: "value", type: "bit", size: 3 }
        ]
      }
    }
  },

  test_type: "ThreeBits",

  test_cases: [
    {
      description: "Value 0b101 with MSB-first",
      value: { value: 0b101 },
      bits: [1, 0, 1], // Read left-to-right: 101
    },
  ]
});

/**
 * Test suite for LSB-first bit ordering
 *
 * LSB-first (less common): bits read right-to-left within bytes
 * Example: byte 0b10110010
 *   - bit 0 = 0 (rightmost/LSB)
 *   - bit 7 = 1 (leftmost/MSB)
 */
export const lsbFirstTestSuite = defineTestSuite({
  name: "bit_order_lsb_first",
  description: "LSB-first bit ordering (read bits right to left)",

  schema: {
    config: {
      bit_order: "lsb_first",
    },
    types: {
      "ThreeBits": {
        sequence: [
          { name: "value", type: "bit", size: 3 }
        ]
      }
    }
  },

  test_type: "ThreeBits",

  test_cases: [
    {
      description: "Value 0b101 with LSB-first",
      value: { value: 0b101 },
      bits: [1, 0, 1], // Logical value is still 101
      // But when packed into byte, would be reversed
    },
  ]
});

/**
 * Test demonstrating the difference between MSB and LSB first
 * when packing into bytes
 */
export const bitOrderComparisonTestSuite = defineTestSuite({
  name: "bit_order_comparison",
  description: "Compare MSB-first vs LSB-first byte packing",

  schema: {
    config: {
      bit_order: "msb_first",
    },
    types: {
      "TwoBitFields": {
        sequence: [
          { name: "a", type: "bit", size: 2 },
          { name: "b", type: "bit", size: 3 },
          { name: "c", type: "bit", size: 3 },
        ]
      }
    }
  },

  test_type: "TwoBitFields",

  test_cases: [
    {
      description: "a=0b11, b=0b010, c=0b101 (MSB-first packing)",
      value: { a: 0b11, b: 0b010, c: 0b101 },
      bits: [
        1,1,     // a = 0b11
        0,1,0,   // b = 0b010
        1,0,1,   // c = 0b101
      ],
      bytes: [0xD5], // 11010101 (packed left-to-right)
    },
  ]
});
