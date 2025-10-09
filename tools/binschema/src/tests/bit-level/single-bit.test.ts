import { defineTestSuite } from "../../schema/test-schema.js";

/**
 * Test suite for single bit (1-bit boolean/flag)
 *
 * Wire format: Single bit
 * Note: When encoded alone, will occupy 1 bit (not a full byte)
 */
export const singleBitTestSuite = defineTestSuite({
  name: "single_bit",
  description: "1-bit boolean value",

  schema: {
    config: {
      bit_order: "msb_first",
    },
    types: {
      "BitValue": {
        sequence: [
          { name: "flag", type: "bit", size: 1 }
        ]
      }
    }
  },

  test_type: "BitValue",

  test_cases: [
    {
      description: "False (0)",
      value: { flag: 0 },
      bits: [0],
    },
    {
      description: "True (1)",
      value: { flag: 1 },
      bits: [1],
    },
  ]
});
