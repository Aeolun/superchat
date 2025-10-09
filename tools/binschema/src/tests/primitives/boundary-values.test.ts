import { defineTestSuite } from "../../schema/test-schema.js";

/**
 * Test suite for boundary values
 *
 * Tests values at type boundaries that often expose sign/overflow bugs
 */
export const boundaryValuesTestSuite = defineTestSuite({
  name: "boundary_values",
  description: "Boundary values at type limits",

  schema: {
    types: {
      "BoundaryTest": {
        sequence: [
          { name: "value_127", type: "uint8" },    // Max signed int8
          { name: "value_128", type: "uint8" },    // Min signed int8 (if interpreted as signed)
          { name: "value_255", type: "uint8" },    // Max uint8
          { name: "value_256", type: "uint16" },   // First value needing uint16
          { name: "value_32767", type: "uint16" }, // Max signed int16
          { name: "value_32768", type: "uint16" }, // Min signed int16 (if interpreted as signed)
          { name: "value_65535", type: "uint16" }, // Max uint16
          { name: "value_65536", type: "uint32" }, // First value needing uint32
        ]
      }
    }
  },

  test_type: "BoundaryTest",

  test_cases: [
    {
      description: "All boundary values",
      value: {
        value_127: 127,
        value_128: 128,
        value_255: 255,
        value_256: 256,
        value_32767: 32767,
        value_32768: 32768,
        value_65535: 65535,
        value_65536: 65536,
      },
      bytes: [
        0x7F,       // 127
        0x80,       // 128
        0xFF,       // 255
        0x01, 0x00, // 256
        0x7F, 0xFF, // 32767
        0x80, 0x00, // 32768
        0xFF, 0xFF, // 65535
        0x00, 0x01, 0x00, 0x00, // 65536
      ],
    },
  ]
});

/**
 * Test suite for power-of-2 boundaries
 *
 * Tests values at power-of-2 boundaries (2^n and 2^n - 1)
 */
export const powerOfTwoBoundariesTestSuite = defineTestSuite({
  name: "power_of_two_boundaries",
  description: "Powers of 2 and adjacent values",

  schema: {
    types: {
      "PowerOfTwo": {
        sequence: [
          { name: "pow2_7", type: "uint8" },    // 128 = 2^7
          { name: "pow2_8_minus_1", type: "uint8" }, // 255 = 2^8 - 1
          { name: "pow2_8", type: "uint16" },   // 256 = 2^8
          { name: "pow2_15", type: "uint16" },  // 32768 = 2^15
          { name: "pow2_16_minus_1", type: "uint16" }, // 65535 = 2^16 - 1
          { name: "pow2_16", type: "uint32" },  // 65536 = 2^16
          { name: "pow2_31", type: "uint32" },  // 2147483648 = 2^31
        ]
      }
    }
  },

  test_type: "PowerOfTwo",

  test_cases: [
    {
      description: "Powers of 2",
      value: {
        pow2_7: 128,
        pow2_8_minus_1: 255,
        pow2_8: 256,
        pow2_15: 32768,
        pow2_16_minus_1: 65535,
        pow2_16: 65536,
        pow2_31: 2147483648,
      },
      bytes: [
        0x80,             // 128
        0xFF,             // 255
        0x01, 0x00,       // 256
        0x80, 0x00,       // 32768
        0xFF, 0xFF,       // 65535
        0x00, 0x01, 0x00, 0x00, // 65536
        0x80, 0x00, 0x00, 0x00, // 2147483648
      ],
    },
  ]
});

/**
 * Test suite for alternating bit patterns
 *
 * Tests values with specific bit patterns that can reveal encoding issues
 */
export const bitPatternTestSuite = defineTestSuite({
  name: "bit_patterns",
  description: "Alternating and specific bit patterns",

  schema: {
    types: {
      "BitPattern": {
        sequence: [
          { name: "pattern_aa", type: "uint8" },   // 0xAA = 10101010
          { name: "pattern_55", type: "uint8" },   // 0x55 = 01010101
          { name: "pattern_ff", type: "uint8" },   // 0xFF = 11111111
          { name: "pattern_00", type: "uint8" },   // 0x00 = 00000000
          { name: "pattern_f0", type: "uint8" },   // 0xF0 = 11110000
          { name: "pattern_0f", type: "uint8" },   // 0x0F = 00001111
          { name: "pattern_aaaa", type: "uint16" }, // 0xAAAA
          { name: "pattern_5555", type: "uint16" }, // 0x5555
        ]
      }
    }
  },

  test_type: "BitPattern",

  test_cases: [
    {
      description: "Various bit patterns",
      value: {
        pattern_aa: 0xAA,
        pattern_55: 0x55,
        pattern_ff: 0xFF,
        pattern_00: 0x00,
        pattern_f0: 0xF0,
        pattern_0f: 0x0F,
        pattern_aaaa: 0xAAAA,
        pattern_5555: 0x5555,
      },
      bytes: [
        0xAA,       // 10101010
        0x55,       // 01010101
        0xFF,       // 11111111
        0x00,       // 00000000
        0xF0,       // 11110000
        0x0F,       // 00001111
        0xAA, 0xAA, // 1010101010101010
        0x55, 0x55, // 0101010101010101
      ],
    },
  ]
});

/**
 * Test suite for signed integer boundaries
 *
 * Tests sign bit transitions for signed types
 */
export const signedBoundariesTestSuite = defineTestSuite({
  name: "signed_boundaries",
  description: "Signed integer boundary values",

  schema: {
    config: {
      endianness: "big_endian",
    },
    types: {
      "SignedBoundaries": {
        sequence: [
          { name: "int8_max", type: "int8" },       // 127
          { name: "int8_min", type: "int8" },       // -128
          { name: "int8_minus_one", type: "int8" }, // -1
          { name: "int16_max", type: "int16" },     // 32767
          { name: "int16_min", type: "int16" },     // -32768
          { name: "int16_minus_one", type: "int16" }, // -1
          { name: "int32_max", type: "int32" },     // 2147483647
          { name: "int32_min", type: "int32" },     // -2147483648
        ]
      }
    }
  },

  test_type: "SignedBoundaries",

  test_cases: [
    {
      description: "All signed boundaries",
      value: {
        int8_max: 127,
        int8_min: -128,
        int8_minus_one: -1,
        int16_max: 32767,
        int16_min: -32768,
        int16_minus_one: -1,
        int32_max: 2147483647,
        int32_min: -2147483648,
      },
      bytes: [
        0x7F,             // 127
        0x80,             // -128
        0xFF,             // -1
        0x7F, 0xFF,       // 32767
        0x80, 0x00,       // -32768
        0xFF, 0xFF,       // -1
        0x7F, 0xFF, 0xFF, 0xFF, // 2147483647
        0x80, 0x00, 0x00, 0x00, // -2147483648
      ],
    },
  ]
});
