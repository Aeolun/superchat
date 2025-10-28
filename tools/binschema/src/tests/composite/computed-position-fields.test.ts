// ABOUTME: Tests for computed position_of fields feature
// ABOUTME: Validates that byte positions are automatically tracked and computed by the encoder

import { defineTestSuite } from "../../schema/test-schema.js";

/**
 * Test basic position tracking - position of a field within same struct
 *
 * Simple case: Track where a field starts within the encoded message
 */
export const computedPositionBasicTestSuite = defineTestSuite({
  name: "computed_position_basic",
  description: "Basic position tracking within a struct",

  schema: {
    config: {
      endianness: "little_endian",
    },
    types: {
      "Message": {
        sequence: [
          {
            name: "header",
            type: "uint32",
            description: "Message header"
          },
          {
            name: "data_offset",
            type: "uint32",
            computed: {
              type: "position_of",
              target: "data"
            },
            description: "Auto-computed position of data field"
          },
          {
            name: "data",
            type: "array",
            kind: "fixed",
            length: 4,
            items: { type: "uint8" }
          }
        ]
      }
    }
  },

  test_type: "Message",

  test_cases: [
    {
      description: "Position after fixed header (8 bytes)",
      value: {
        header: 0x12345678,
        data: [0xAA, 0xBB, 0xCC, 0xDD]
      },
      decoded_value: {
        header: 0x12345678,
        data_offset: 8,  // Position after header (4 bytes) + data_offset field (4 bytes)
        data: [0xAA, 0xBB, 0xCC, 0xDD]
      },
      bytes: [
        0x78, 0x56, 0x34, 0x12, // header (little-endian)
        0x08, 0x00, 0x00, 0x00, // data_offset = 8 (little-endian)
        0xAA, 0xBB, 0xCC, 0xDD, // data
      ],
    },
  ]
});

/**
 * Test position tracking with variable-length fields
 *
 * Position depends on the length of earlier variable-length fields
 */
export const computedPositionVariableLengthTestSuite = defineTestSuite({
  name: "computed_position_variable_length",
  description: "Position tracking with variable-length fields",

  schema: {
    config: {
      endianness: "little_endian",
    },
    types: {
      "Packet": {
        sequence: [
          {
            name: "name_length",
            type: "uint8",
            computed: {
              type: "length_of",
              target: "name"
            }
          },
          {
            name: "name",
            type: "string",
            kind: "field_referenced",
            length_field: "name_length",
            encoding: "utf8"
          },
          {
            name: "payload_offset",
            type: "uint16",
            computed: {
              type: "position_of",
              target: "payload"
            }
          },
          {
            name: "payload",
            type: "array",
            kind: "fixed",
            length: 2,
            items: { type: "uint8" }
          }
        ]
      }
    }
  },

  test_type: "Packet",

  test_cases: [
    {
      description: "Position after short name (3 chars)",
      value: {
        name: "foo",
        payload: [0x11, 0x22]
      },
      decoded_value: {
        name_length: 3,
        name: "foo",
        payload_offset: 6,  // name_length (1) + name (3) + payload_offset (2) = 6
        payload: [0x11, 0x22]
      },
      bytes: [
        0x03,             // name_length = 3
        0x66, 0x6F, 0x6F, // "foo"
        0x06, 0x00,       // payload_offset = 6 (little-endian)
        0x11, 0x22,       // payload
      ],
    },
    {
      description: "Position after longer name (5 chars)",
      value: {
        name: "hello",
        payload: [0x33, 0x44]
      },
      decoded_value: {
        name_length: 5,
        name: "hello",
        payload_offset: 8,  // name_length (1) + name (5) + payload_offset (2) = 8
        payload: [0x33, 0x44]
      },
      bytes: [
        0x05,                         // name_length = 5
        0x68, 0x65, 0x6C, 0x6C, 0x6F, // "hello"
        0x08, 0x00,                   // payload_offset = 8 (little-endian)
        0x33, 0x44,                   // payload
      ],
    },
  ]
});

/**
 * Test position tracking for nested struct
 *
 * Position of a nested struct field
 */
export const computedPositionNestedStructTestSuite = defineTestSuite({
  name: "computed_position_nested_struct",
  description: "Position tracking for nested structures",

  schema: {
    config: {
      endianness: "little_endian",
    },
    types: {
      "Header": {
        sequence: [
          { name: "version", type: "uint8" },
          { name: "flags", type: "uint8" }
        ]
      },
      "Container": {
        sequence: [
          {
            name: "header_offset",
            type: "uint16",
            computed: {
              type: "position_of",
              target: "header"
            }
          },
          {
            name: "header",
            type: "Header"
          },
          {
            name: "data_offset",
            type: "uint16",
            computed: {
              type: "position_of",
              target: "data"
            }
          },
          {
            name: "data",
            type: "uint32"
          }
        ]
      }
    }
  },

  test_type: "Container",

  test_cases: [
    {
      description: "Positions of nested struct and following field",
      value: {
        header: {
          version: 1,
          flags: 0x80
        },
        data: 0xDEADBEEF
      },
      decoded_value: {
        header_offset: 2,  // After header_offset field (2 bytes)
        header: {
          version: 1,
          flags: 0x80
        },
        data_offset: 6,  // After header_offset (2) + header (2) + data_offset (2) = 6
        data: 0xDEADBEEF
      },
      bytes: [
        0x02, 0x00,             // header_offset = 2
        0x01, 0x80,             // header (version=1, flags=0x80)
        0x06, 0x00,             // data_offset = 6
        0xEF, 0xBE, 0xAD, 0xDE, // data (little-endian)
      ],
    },
  ]
});
