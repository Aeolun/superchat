import { defineTestSuite } from "../../schema/test-schema.js";

/**
 * Test suite for bit fields with very different sizes
 *
 * Tests packing small and large bit fields together (1-bit + 15-bit + 48-bit)
 */
export const mixedSizeBitfieldsTestSuite = defineTestSuite({
  name: "mixed_size_bitfields",
  description: "Bit fields with drastically different sizes (1-bit + 15-bit + 48-bit)",

  schema: {
    config: {
      bit_order: "msb_first",
    },
    types: {
      "MixedBits": {
        fields: [
          { name: "flag", type: "bit", size: 1 },
          { name: "medium", type: "bit", size: 15 },
          { name: "large", type: "bit", size: 48 }
        ]
      }
    }
  },

  test_type: "MixedBits",

  test_cases: [
    {
      description: "All zeros (64 bits total)",
      value: {
        flag: 0,
        medium: 0,
        large: 0n
      },
      bytes: [0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00],
    },
    {
      description: "flag=1, medium=0, large=0",
      value: {
        flag: 1,
        medium: 0,
        large: 0n
      },
      bits: [
        1,              // flag
        0,0,0,0,0,0,0,0,0,0,0,0,0,0,0, // medium (15 bits)
        0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0 // large (48 bits)
      ],
      bytes: [0x80, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00], // 1000000000000000...
    },
    {
      description: "flag=0, medium=0x7FFF (max 15-bit), large=0",
      value: {
        flag: 0,
        medium: 0x7FFF,
        large: 0n
      },
      bits: [
        0,              // flag
        1,1,1,1,1,1,1,1,1,1,1,1,1,1,1, // medium (all 1s, 15 bits)
        0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0 // large (48 bits)
      ],
      bytes: [0x7F, 0xFF, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00], // 01111111 11111111 00000000...
    },
    {
      description: "flag=1, medium=0x7FFF, large=0xABCDEF123456",
      value: {
        flag: 1,
        medium: 0x7FFF,
        large: 0xABCDEF123456n
      },
      bits: [
        1,              // flag = 1
        1,1,1,1,1,1,1,1,1,1,1,1,1,1,1, // medium = 0x7FFF (all 1s)
        // large = 0xABCDEF123456 = 10101011 11001101 11101111 00010010 00110100 01010110
        1,0,1,0,1,0,1,1,1,1,0,0,1,1,0,1,1,1,1,0,1,1,1,1,0,0,0,1,0,0,1,0,0,0,1,1,0,1,0,0,0,1,0,1,0,1,1,0
      ],
      bytes: [0xFF, 0xFF, 0xAB, 0xCD, 0xEF, 0x12, 0x34, 0x56], // 11111111 11111111 10101011...
    },
    {
      description: "All ones (flag=1, medium=0x7FFF, large=0xFFFFFFFFFFFF)",
      value: {
        flag: 1,
        medium: 0x7FFF,
        large: 0xFFFFFFFFFFFFn
      },
      bytes: [0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF],
    },
  ]
});

/**
 * Test suite for mixed bit field sizes with byte alignment edge cases
 *
 * Tests combinations like 3-bit + 5-bit + 24-bit + 32-bit = 64 bits
 */
export const variableSizeBitfieldsTestSuite = defineTestSuite({
  name: "variable_size_bitfields",
  description: "Multiple bit fields of varying sizes (3 + 5 + 24 + 32 bits)",

  schema: {
    config: {
      bit_order: "msb_first",
    },
    types: {
      "VariableBits": {
        fields: [
          { name: "small", type: "bit", size: 3 },
          { name: "tiny", type: "bit", size: 5 },
          { name: "medium", type: "bit", size: 24 },
          { name: "large", type: "bit", size: 32 }
        ]
      }
    }
  },

  test_type: "VariableBits",

  test_cases: [
    {
      description: "All zeros",
      value: {
        small: 0,
        tiny: 0,
        medium: 0,
        large: 0
      },
      bytes: [0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00],
    },
    {
      description: "small=7, tiny=31, medium=0xFFFFFF, large=0xFFFFFFFF",
      value: {
        small: 7,       // 111 (3 bits)
        tiny: 31,       // 11111 (5 bits)
        medium: 0xFFFFFF, // all 1s (24 bits)
        large: 0xFFFFFFFF // all 1s (32 bits)
      },
      bytes: [0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF], // All 1s
    },
    {
      description: "small=5, tiny=10, medium=0x123456, large=0x789ABCDE",
      value: {
        small: 5,       // 101 (3 bits)
        tiny: 10,       // 01010 (5 bits)
        medium: 0x123456, // 24 bits
        large: 0x789ABCDE // 32 bits
      },
      // Total: 3 + 5 + 24 + 32 = 64 bits (8 bytes)
      // MSB first: 10101010 00010010 00110100 01010110 01111000 10011010 10111100 11011110
      bytes: [0xAA, 0x12, 0x34, 0x56, 0x78, 0x9A, 0xBC, 0xDE],
    },
  ]
});
