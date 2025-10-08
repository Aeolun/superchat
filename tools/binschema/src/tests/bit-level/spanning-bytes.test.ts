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
        fields: [
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
