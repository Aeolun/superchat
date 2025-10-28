// ABOUTME: Tests for computed CRC32 fields feature
// ABOUTME: Validates that CRC32 checksums are automatically computed by the encoder

import { defineTestSuite } from "../../schema/test-schema.js";

/**
 * Test automatic CRC32 computation for byte arrays
 *
 * CRC32 is a common checksum used in file formats like ZIP, PNG, etc.
 * The encoder should automatically compute the CRC32 of the target byte array.
 */
export const computedCrc32ByteArrayTestSuite = defineTestSuite({
  name: "computed_crc32_byte_array",
  description: "Automatic CRC32 calculation for byte arrays",

  schema: {
    config: {
      endianness: "little_endian",  // CRC32 is typically little-endian
    },
    types: {
      "Packet": {
        sequence: [
          {
            name: "data",
            type: "array",
            kind: "fixed",
            length: 4,
            items: { type: "uint8" },
            description: "Data bytes"
          },
          {
            name: "checksum",
            type: "uint32",
            computed: {
              type: "crc32_of",
              target: "data"
            },
            description: "Auto-computed CRC32 checksum of data"
          }
        ]
      }
    }
  },

  test_type: "Packet",

  test_cases: [
    {
      description: "CRC32 of [0x00, 0x00, 0x00, 0x00]",
      value: {
        data: [0x00, 0x00, 0x00, 0x00]  // Computed field 'checksum' omitted
      },
      decoded_value: {
        data: [0x00, 0x00, 0x00, 0x00],
        checksum: 0x2144DF1C  // CRC32 of 4 zero bytes
      },
      bytes: [
        0x00, 0x00, 0x00, 0x00, // data
        0x1C, 0xDF, 0x44, 0x21, // CRC32 (little-endian)
      ],
    },
    {
      description: "CRC32 of [0xFF, 0xFF, 0xFF, 0xFF]",
      value: {
        data: [0xFF, 0xFF, 0xFF, 0xFF]  // Computed field 'checksum' omitted
      },
      decoded_value: {
        data: [0xFF, 0xFF, 0xFF, 0xFF],
        checksum: 0xFFFFFFFF  // CRC32 of 4 0xFF bytes
      },
      bytes: [
        0xFF, 0xFF, 0xFF, 0xFF, // data
        0xFF, 0xFF, 0xFF, 0xFF, // CRC32 (little-endian)
      ],
    },
    {
      description: "CRC32 of [0x01, 0x02, 0x03, 0x04]",
      value: {
        data: [0x01, 0x02, 0x03, 0x04]  // Computed field 'checksum' omitted
      },
      decoded_value: {
        data: [0x01, 0x02, 0x03, 0x04],
        checksum: 0xB63CFBCD  // CRC32 of these bytes
      },
      bytes: [
        0x01, 0x02, 0x03, 0x04, // data
        0xCD, 0xFB, 0x3C, 0xB6, // CRC32 (little-endian)
      ],
    },
  ]
});

/**
 * Test CRC32 with variable-length arrays
 */
export const computedCrc32VariableLengthTestSuite = defineTestSuite({
  name: "computed_crc32_variable_length",
  description: "CRC32 calculation for variable-length byte arrays",

  schema: {
    config: {
      endianness: "little_endian",
    },
    types: {
      "Message": {
        sequence: [
          {
            name: "length",
            type: "uint8",
            computed: {
              type: "length_of",
              target: "data"
            }
          },
          {
            name: "data",
            type: "array",
            kind: "field_referenced",
            length_field: "length",
            items: { type: "uint8" }
          },
          {
            name: "crc",
            type: "uint32",
            computed: {
              type: "crc32_of",
              target: "data"
            }
          }
        ]
      }
    }
  },

  test_type: "Message",

  test_cases: [
    {
      description: "Empty array",
      value: {
        data: []  // Both computed fields omitted
      },
      decoded_value: {
        length: 0,
        data: [],
        crc: 0x00000000  // CRC32 of empty data
      },
      bytes: [
        0x00, // length = 0 (auto-computed)
        // no data bytes
        0x00, 0x00, 0x00, 0x00, // CRC32 (little-endian)
      ],
    },
    {
      description: "Single byte [0x42]",
      value: {
        data: [0x42]  // Both computed fields omitted
      },
      decoded_value: {
        length: 1,
        data: [0x42],
        crc: 0x4AD0CF31  // CRC32 of [0x42]
      },
      bytes: [
        0x01, // length = 1 (auto-computed)
        0x42, // data
        0x31, 0xCF, 0xD0, 0x4A, // CRC32 (little-endian)
      ],
    },
    {
      description: "ASCII 'Hello'",
      value: {
        data: [0x48, 0x65, 0x6C, 0x6C, 0x6F]  // 'Hello' in ASCII
      },
      decoded_value: {
        length: 5,
        data: [0x48, 0x65, 0x6C, 0x6C, 0x6F],
        crc: 0xF7D18982  // CRC32 of 'Hello'
      },
      bytes: [
        0x05, // length = 5 (auto-computed)
        0x48, 0x65, 0x6C, 0x6C, 0x6F, // 'Hello'
        0x82, 0x89, 0xD1, 0xF7, // CRC32 (little-endian)
      ],
    },
  ]
});

/**
 * Test CRC32 before the data (like ZIP local file header)
 */
export const computedCrc32BeforeDataTestSuite = defineTestSuite({
  name: "computed_crc32_before_data",
  description: "CRC32 field can appear before the data it checksums",

  schema: {
    config: {
      endianness: "little_endian",
    },
    types: {
      "Header": {
        sequence: [
          {
            name: "crc",
            type: "uint32",
            computed: {
              type: "crc32_of",
              target: "payload"
            },
            description: "CRC32 appears before payload (forward reference)"
          },
          {
            name: "length",
            type: "uint16",
            computed: {
              type: "length_of",
              target: "payload"
            }
          },
          {
            name: "payload",
            type: "array",
            kind: "field_referenced",
            length_field: "length",
            items: { type: "uint8" }
          }
        ]
      }
    }
  },

  test_type: "Header",

  test_cases: [
    {
      description: "CRC before data - [0xAA, 0xBB]",
      value: {
        payload: [0xAA, 0xBB]  // Computed fields omitted
      },
      decoded_value: {
        crc: 0x49822C98,  // CRC32 of [0xAA, 0xBB]
        length: 2,
        payload: [0xAA, 0xBB]
      },
      bytes: [
        0x98, 0x2C, 0x82, 0x49, // CRC32 (little-endian) - comes BEFORE data!
        0x02, 0x00, // length = 2 (auto-computed)
        0xAA, 0xBB, // payload
      ],
    },
  ]
});
