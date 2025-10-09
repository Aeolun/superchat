import { defineTestSuite } from "../../schema/test-schema.js";

/**
 * Test suite for 12-bit values (spans 2 bytes)
 *
 * Wire format: 12 bits (range 0-4095)
 * Demonstrates bit fields crossing byte boundaries
 */
export const twelveBitsTestSuite = defineTestSuite({
  name: "twelve_bits",
  description: "12-bit unsigned integer (0-4095)",

  schema: {
    config: {
      bit_order: "msb_first",
    },
    types: {
      "TwelveBitValue": {
        fields: [
          { name: "value", type: "bit", size: 12 }
        ]
      }
    }
  },

  test_type: "TwelveBitValue",

  test_cases: [
    {
      description: "Zero (0x000)",
      value: { value: 0 },
      bytes: [0x00, 0x00],
    },
    {
      description: "One (0x001)",
      value: { value: 1 },
      bytes: [0x00, 0x10], // MSB first: 0000 0000 0001 -> 00000000 0001____
    },
    {
      description: "0x0FF (255)",
      value: { value: 255 },
      bytes: [0x0F, 0xF0], // 0000 1111 1111 -> 00001111 1111____
    },
    {
      description: "0x100 (256)",
      value: { value: 256 },
      bytes: [0x10, 0x00], // 0001 0000 0000 -> 00010000 0000____
    },
    {
      description: "0x7FF (2047)",
      value: { value: 2047 },
      bytes: [0x7F, 0xF0], // 0111 1111 1111
    },
    {
      description: "0x800 (2048)",
      value: { value: 2048 },
      bytes: [0x80, 0x00], // 1000 0000 0000
    },
    {
      description: "Maximum (0xFFF = 4095)",
      value: { value: 4095 },
      bytes: [0xFF, 0xF0], // 1111 1111 1111 -> 11111111 1111____
    },
  ]
});

/**
 * Test suite for 20-bit values (spans 3 bytes with padding)
 *
 * Wire format: 20 bits (range 0-1048575)
 * Tests non-byte-aligned field spanning 3 bytes
 */
export const twentyBitsTestSuite = defineTestSuite({
  name: "twenty_bits",
  description: "20-bit unsigned integer (0-1048575)",

  schema: {
    config: {
      bit_order: "msb_first",
    },
    types: {
      "TwentyBitValue": {
        fields: [
          { name: "value", type: "bit", size: 20 }
        ]
      }
    }
  },

  test_type: "TwentyBitValue",

  test_cases: [
    {
      description: "Zero (0x00000)",
      value: { value: 0 },
      bytes: [0x00, 0x00, 0x00],
    },
    {
      description: "All ones (0xFFFFF = 1048575)",
      value: { value: 0xFFFFF },
      bytes: [0xFF, 0xFF, 0xF0], // 11111111 11111111 1111____ (last 4 bits padded)
    },
    {
      description: "0xABCDE (699102)",
      value: { value: 0xABCDE },
      bytes: [0xAB, 0xCD, 0xE0], // 10101011 11001101 1110____
    },
    {
      description: "0x12345 (74565)",
      value: { value: 0x12345 },
      bytes: [0x12, 0x34, 0x50], // 00010010 00110100 0101____
    },
  ]
});

/**
 * Test suite for 24-bit values (spans 3 bytes)
 *
 * Wire format: 24 bits (range 0-16777215)
 * Common in RGB color values, audio samples
 */
export const twentyFourBitsTestSuite = defineTestSuite({
  name: "twenty_four_bits",
  description: "24-bit unsigned integer (0-16777215)",

  schema: {
    config: {
      bit_order: "msb_first",
    },
    types: {
      "TwentyFourBitValue": {
        fields: [
          { name: "value", type: "bit", size: 24 }
        ]
      }
    }
  },

  test_type: "TwentyFourBitValue",

  test_cases: [
    {
      description: "Zero (0x000000)",
      value: { value: 0 },
      bytes: [0x00, 0x00, 0x00],
    },
    {
      description: "One (0x000001)",
      value: { value: 1 },
      bytes: [0x00, 0x00, 0x01],
    },
    {
      description: "0x010000 (65536)",
      value: { value: 65536 },
      bytes: [0x01, 0x00, 0x00],
    },
    {
      description: "RGB Red (0xFF0000 = 16711680)",
      value: { value: 16711680 },
      bytes: [0xFF, 0x00, 0x00],
    },
    {
      description: "RGB Green (0x00FF00 = 65280)",
      value: { value: 65280 },
      bytes: [0x00, 0xFF, 0x00],
    },
    {
      description: "RGB Blue (0x0000FF = 255)",
      value: { value: 255 },
      bytes: [0x00, 0x00, 0xFF],
    },
    {
      description: "Maximum (0xFFFFFF = 16777215)",
      value: { value: 16777215 },
      bytes: [0xFF, 0xFF, 0xFF],
    },
  ]
});

/**
 * Test suite for 40-bit values (spans 5 bytes)
 *
 * Wire format: 40 bits
 * Common for timestamps and MAC addresses
 */
export const fortyBitsTestSuite = defineTestSuite({
  name: "forty_bits",
  description: "40-bit unsigned integer",

  schema: {
    config: {
      bit_order: "msb_first",
    },
    types: {
      "FortyBitValue": {
        fields: [
          { name: "timestamp", type: "bit", size: 40 }
        ]
      }
    }
  },

  test_type: "FortyBitValue",

  test_cases: [
    {
      description: "Zero (0x0000000000)",
      value: { timestamp: 0x0000000000 },
      bytes: [0x00, 0x00, 0x00, 0x00, 0x00],
    },
    {
      description: "All ones (0xFFFFFFFFFF)",
      value: { timestamp: 0xFFFFFFFFFF },
      bytes: [0xFF, 0xFF, 0xFF, 0xFF, 0xFF],
    },
    {
      description: "0x123456789A",
      value: { timestamp: 0x123456789A },
      bytes: [0x12, 0x34, 0x56, 0x78, 0x9A],
    },
  ]
});

/**
 * Test suite for 48-bit values (spans 6 bytes)
 *
 * Wire format: 48 bits
 * Demonstrates large multi-byte bit fields
 */
export const fortyEightBitsTestSuite = defineTestSuite({
  name: "forty_eight_bits",
  description: "48-bit unsigned integer",

  schema: {
    config: {
      bit_order: "msb_first",
    },
    types: {
      "FortyEightBitValue": {
        fields: [
          { name: "value", type: "bit", size: 48 }
        ]
      }
    }
  },

  test_type: "FortyEightBitValue",

  test_cases: [
    {
      description: "Zero",
      value: { value: 0n },
      bytes: [0x00, 0x00, 0x00, 0x00, 0x00, 0x00],
    },
    {
      description: "One",
      value: { value: 1n },
      bytes: [0x00, 0x00, 0x00, 0x00, 0x00, 0x01],
    },
    {
      description: "MAC address pattern (0x001122334455)",
      value: { value: 0x001122334455n },
      bytes: [0x00, 0x11, 0x22, 0x33, 0x44, 0x55],
    },
    {
      description: "Maximum (0xFFFFFFFFFFFF)",
      value: { value: 281474976710655n }, // 2^48 - 1
      bytes: [0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF],
    },
  ]
});

/**
 * Test suite for 64-bit bit field (maximum size)
 *
 * Wire format: 64 bits
 * Tests maximum supported bit field size
 */
export const sixtyFourBitsTestSuite = defineTestSuite({
  name: "sixty_four_bits",
  description: "64-bit unsigned integer (as bit field)",

  schema: {
    config: {
      bit_order: "msb_first",
    },
    types: {
      "SixtyFourBitValue": {
        fields: [
          { name: "value", type: "bit", size: 64 }
        ]
      }
    }
  },

  test_type: "SixtyFourBitValue",

  test_cases: [
    {
      description: "Zero",
      value: { value: 0n },
      bytes: [0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00],
    },
    {
      description: "One",
      value: { value: 1n },
      bytes: [0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x01],
    },
    {
      description: "0xDEADBEEFCAFEBABE",
      value: { value: 0xDEADBEEFCAFEBABEn },
      bytes: [0xDE, 0xAD, 0xBE, 0xEF, 0xCA, 0xFE, 0xBA, 0xBE],
    },
    {
      description: "Maximum (0xFFFFFFFFFFFFFFFF)",
      value: { value: 18446744073709551615n }, // 2^64 - 1
      bytes: [0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF],
    },
  ]
});

/**
 * Test suite for non-byte-aligned start (10-bit value starting at bit 6)
 *
 * Demonstrates bit field that crosses multiple byte boundaries
 */
export const unalignedTenBitsTestSuite = defineTestSuite({
  name: "unaligned_ten_bits",
  description: "10-bit value after 6-bit offset",

  schema: {
    config: {
      bit_order: "msb_first",
    },
    types: {
      "UnalignedValue": {
        fields: [
          { name: "header", type: "bit", size: 6 },
          { name: "value", type: "bit", size: 10 },
        ]
      }
    }
  },

  test_type: "UnalignedValue",

  test_cases: [
    {
      description: "Header 0b111111, Value 0 (10 bits)",
      value: { header: 0x3F, value: 0 },
      bytes: [0xFC, 0x00], // 111111 00 00000000
    },
    {
      description: "Header 0b000000, Value 1023 (0b1111111111)",
      value: { header: 0, value: 1023 },
      bytes: [0x03, 0xFF], // 000000 11 11111111
    },
    {
      description: "Header 0b101010, Value 512 (0b1000000000)",
      value: { header: 0x2A, value: 512 },
      bytes: [0xAA, 0x00], // 101010 10 00000000
    },
  ]
});
