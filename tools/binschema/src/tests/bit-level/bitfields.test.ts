import { defineTestSuite } from "../../schema/test-schema.js";

/**
 * Test suite for bitfield (explicit bit container)
 *
 * Demonstrates packing multiple named bit-level fields into a container
 * Common in video codecs (H.264 NAL header, etc.)
 */
export const bitfield8TestSuite = defineTestSuite({
  name: "bitfield_8bit",
  description: "8-bit bitfield with multiple packed fields",

  schema: {
    config: {
      bit_order: "msb_first",
    },
    types: {
      "Flags": {
        fields: [
          {
            name: "flags",
            type: "bitfield",
            size: 8,
            fields: [
              { name: "compressed", offset: 0, size: 1 },
              { name: "encrypted", offset: 1, size: 1 },
              { name: "priority", offset: 2, size: 2 }, // 2-bit value
              { name: "reserved", offset: 4, size: 4 },
            ]
          }
        ]
      }
    }
  },

  test_type: "Flags",

  test_cases: [
    {
      description: "All zeros",
      value: {
        flags: {
          compressed: 0,
          encrypted: 0,
          priority: 0,
          reserved: 0,
        }
      },
      bytes: [0x00],
      bits: [0,0,0,0,0,0,0,0],
    },
    {
      description: "Compressed flag set",
      value: {
        flags: {
          compressed: 1,
          encrypted: 0,
          priority: 0,
          reserved: 0,
        }
      },
      bytes: [0x80], // 10000000
      bits: [1,0,0,0,0,0,0,0],
    },
    {
      description: "Priority = 3 (0b11)",
      value: {
        flags: {
          compressed: 0,
          encrypted: 0,
          priority: 3, // 0b11
          reserved: 0,
        }
      },
      bytes: [0x30], // 00110000
      bits: [0,0,1,1,0,0,0,0],
    },
    {
      description: "Compressed + encrypted + priority 2",
      value: {
        flags: {
          compressed: 1,
          encrypted: 1,
          priority: 2, // 0b10 (MSB first: writes as [1,0])
          reserved: 0,
        }
      },
      bytes: [0xE0], // 11100000
      bits: [1,1,1,0,0,0,0,0],
    },
    {
      description: "All bits set",
      value: {
        flags: {
          compressed: 1,
          encrypted: 1,
          priority: 3,
          reserved: 15, // 0b1111
        }
      },
      bytes: [0xFF],
      bits: [1,1,1,1,1,1,1,1],
    },
  ]
});

/**
 * Test suite for H.264 NAL header (real-world example)
 *
 * Demonstrates actual video codec bitfield usage
 */
export const h264NALHeaderTestSuite = defineTestSuite({
  name: "h264_nal_header",
  description: "H.264 NAL unit header (real-world bitfield)",

  schema: {
    config: {
      bit_order: "msb_first",
    },
    types: {
      "NALHeader": {
        fields: [
          {
            name: "header",
            type: "bitfield",
            size: 8,
            fields: [
              { name: "forbidden_zero_bit", offset: 0, size: 1 },
              { name: "nal_ref_idc", offset: 1, size: 2 },
              { name: "nal_unit_type", offset: 3, size: 5 },
            ]
          }
        ]
      }
    }
  },

  test_type: "NALHeader",

  test_cases: [
    {
      description: "NAL unit type 1 (coded slice, non-IDR)",
      value: {
        header: {
          forbidden_zero_bit: 0,
          nal_ref_idc: 2, // 0b10 (reference)
          nal_unit_type: 1, // 0b00001 (coded slice)
        }
      },
      bytes: [0x41], // 01000001
      bits: [0, 1,0, 0,0,0,0,1],
      //     ^ ^-^ ^-------^
      //     f ref type
    },
    {
      description: "NAL unit type 5 (IDR slice)",
      value: {
        header: {
          forbidden_zero_bit: 0,
          nal_ref_idc: 3, // 0b11 (highest priority reference)
          nal_unit_type: 5, // 0b00101 (IDR)
        }
      },
      bytes: [0x65], // 01100101
    },
  ]
});

/**
 * Test suite for multi-byte bitfield
 *
 * Demonstrates bitfields larger than 8 bits
 */
export const bitfield16TestSuite = defineTestSuite({
  name: "bitfield_16bit",
  description: "16-bit bitfield spanning 2 bytes",

  schema: {
    config: {
      bit_order: "msb_first",
    },
    types: {
      "ControlWord": {
        fields: [
          {
            name: "control",
            type: "bitfield",
            size: 16,
            fields: [
              { name: "version", offset: 0, size: 4 }, // 4 bits
              { name: "type", offset: 4, size: 4 },    // 4 bits
              { name: "length", offset: 8, size: 8 },  // 8 bits
            ]
          }
        ]
      }
    }
  },

  test_type: "ControlWord",

  test_cases: [
    {
      description: "Version 1, type 5, length 42",
      value: {
        control: {
          version: 1,  // 0b0001
          type: 5,     // 0b0101
          length: 42,  // 0b00101010
        }
      },
      bytes: [0x15, 0x2A], // 00010101 00101010
      bits: [
        0,0,0,1, // version = 1
        0,1,0,1, // type = 5
        0,0,1,0,1,0,1,0, // length = 42
      ],
    },
  ]
});

/**
 * Test suite for bitfield with LSB-first ordering
 *
 * Demonstrates bit ordering within bitfields
 */
export const bitfieldLSBFirstTestSuite = defineTestSuite({
  name: "bitfield_lsb_first",
  description: "Bitfield with LSB-first bit ordering",

  schema: {
    config: {
      bit_order: "lsb_first",
    },
    types: {
      "LSBFlags": {
        fields: [
          {
            name: "flags",
            type: "bitfield",
            size: 8,
            bit_order: "lsb_first", // Explicitly LSB-first
            fields: [
              { name: "flag_a", offset: 0, size: 1 },
              { name: "flag_b", offset: 1, size: 1 },
              { name: "value", offset: 2, size: 3 },
              { name: "reserved", offset: 5, size: 3 },
            ]
          }
        ]
      }
    }
  },

  test_type: "LSBFlags",

  test_cases: [
    {
      description: "flag_a=1, flag_b=0, value=5",
      value: {
        flags: {
          flag_a: 1,
          flag_b: 0,
          value: 5, // 0b101
          reserved: 0,
        }
      },
      // LSB-first: bit 0 is rightmost in byte
      bytes: [0x15], // 00010101
      bits: [1,0,1,0,1,0,0,0], // Read right-to-left within byte
      //     ^ ^ ^-^
      //     a b value
    },
  ]
});
