import { defineTestSuite } from "../../schema/test-schema.js";

/**
 * Test suite for bit fields that span byte boundaries
 *
 * Wire format: 1-bit flag + 8-bit value = 9 bits total (spans 2 bytes)
 * Critical test for true bit streaming
 */
export const spanningBytesTestSuite = defineTestSuite({
  name: "spanning_bytes",
  description: "Bit fields that cross byte boundaries",

  schema: {
    config: {
      bit_order: "msb_first",
    },
    types: {
      "SpanningValue": {
        sequence: [
          { name: "flag", type: "bit", size: 1 },
          { name: "value", type: "bit", size: 8 },
        ]
      }
    }
  },

  test_type: "SpanningValue",

  test_cases: [
    {
      description: "flag=0, value=0x00",
      value: { flag: 0, value: 0x00 },
      bits: [
        0,            // flag
        0,0,0,0,0,0,0,0, // value
      ],
      bytes: [0x00, 0x00], // 00000000 0_______ (7 unused bits in byte 1)
    },
    {
      description: "flag=1, value=0x00",
      value: { flag: 1, value: 0x00 },
      bits: [
        1,            // flag
        0,0,0,0,0,0,0,0, // value
      ],
      bytes: [0x80, 0x00], // 10000000 0_______ (MSB first: flag takes bit 0)
    },
    {
      description: "flag=0, value=0xFF",
      value: { flag: 0, value: 0xFF },
      bits: [
        0,            // flag
        1,1,1,1,1,1,1,1, // value
      ],
      bytes: [0x7F, 0x80], // 01111111 1_______
    },
    {
      description: "flag=1, value=0x42",
      value: { flag: 1, value: 0x42 },
      bits: [
        1,            // flag
        0,1,0,0,0,0,1,0, // value = 0x42 = 0b01000010
      ],
      bytes: [0xA1, 0x00], // 10100001 0_______
                            // flag=1, value bits fit in: 10100001 0
    },
  ]
});

/**
 * Test suite for LSB-first byte spanning
 *
 * Wire format: 1-bit flag + 8-bit value with LSB-first bit order
 * Tests that LSB-first works correctly across byte boundaries
 */
export const spanningBytesLSBTestSuite = defineTestSuite({
  name: "spanning_bytes_lsb",
  description: "LSB-first bit fields crossing byte boundaries",

  schema: {
    config: {
      bit_order: "lsb_first",
    },
    types: {
      "SpanningValueLSB": {
        sequence: [
          { name: "flag", type: "bit", size: 1 },
          { name: "value", type: "bit", size: 8 },
        ]
      }
    }
  },

  test_type: "SpanningValueLSB",

  test_cases: [
    {
      description: "flag=0, value=0x00",
      value: { flag: 0, value: 0x00 },
      bytes: [0x00, 0x00], // LSB first: 00000000 0_______
    },
    {
      description: "flag=1, value=0x00",
      value: { flag: 1, value: 0x00 },
      bytes: [0x01, 0x00], // LSB first: flag takes bit 0 -> 00000001 0_______
    },
    {
      description: "flag=0, value=0xFF",
      value: { flag: 0, value: 0xFF },
      bytes: [0xFE, 0x01], // LSB first: 0 + FF = 11111110 00000001
    },
    {
      description: "flag=1, value=0x42 (0b01000010)",
      value: { flag: 1, value: 0x42 },
      bytes: [0x85, 0x00], // LSB: 1 + 0b01000010 = 10000101 0_______
                            // Bit layout: 1(flag) 01000010(value LSB first)
    },
    {
      description: "flag=1, value=0xAA (0b10101010)",
      value: { flag: 1, value: 0xAA },
      bytes: [0x55, 0x01], // LSB: 1 + 0b10101010 = 01010101 00000001
    },
  ]
});
