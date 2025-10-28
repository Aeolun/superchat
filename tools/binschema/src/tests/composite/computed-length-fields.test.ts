import { defineTestSuite } from "../../schema/test-schema.js";

/**
 * Test suite for computed length fields
 * 
 * These tests verify that length fields marked as "computed" are automatically
 * calculated by the encoder based on the target field's actual length.
 * 
 * Key behaviors:
 * - Users should NOT provide values for computed fields during encoding
 * - Computed fields ARE visible in decoded output (users want to see checksums, lengths, offsets)
 * - Encoder calculates byte length for strings (not character count)
 * - Encoder calculates element count for arrays
 * - Error if user tries to provide computed field value during encoding
 */

/**
 * Test automatic length computation for strings with UTF-8 encoding
 * 
 * Tests that byte length is calculated correctly, not character count
 */
export const computedStringLengthTestSuite = defineTestSuite({
  name: "computed_string_length",
  description: "Automatic length calculation for strings",

  schema: {
    config: {
      endianness: "big_endian",
    },
    types: {
      "Message": {
        sequence: [
          {
            name: "len_text",
            type: "uint16",
            computed: {
              type: "length_of",
              target: "text",
              encoding: "utf8"
            },
            description: "Auto-computed byte length of text"
          },
          {
            name: "text",
            type: "string",
            kind: "field_referenced",
            length_field: "len_text",
            encoding: "utf8",
            description: "UTF-8 encoded text"
          }
        ]
      }
    }
  },

  test_type: "Message",

  test_cases: [
    {
      description: "Empty string (0 bytes)",
      value: {
        text: ""  // Computed field 'len_text' omitted - encoder auto-computes it
      },
      decoded_value: {
        len_text: 0,  // Computed field IS visible in decoded output
        text: ""
      },
      bytes: [
        0x00, 0x00, // len_text = 0 (auto-computed)
        // no text bytes
      ],
    },
    {
      description: "ASCII string 'Hello' (5 bytes = 5 characters)",
      value: {
        text: "Hello"  // Computed field 'len_text' omitted - encoder auto-computes it
      },
      decoded_value: {
        len_text: 5,  // Computed field IS visible in decoded output
        text: "Hello"
      },
      bytes: [
        0x00, 0x05, // len_text = 5 (auto-computed)
        0x48, 0x65, 0x6C, 0x6C, 0x6F, // 'Hello' in UTF-8
      ],
    },
    {
      description: "UTF-8 string with emoji '👋Hi' (6 bytes for 3 characters)",
      value: {
        text: "👋Hi"  // Computed field 'len_text' omitted - encoder auto-computes it (👋 = 4 bytes, H = 1 byte, i = 1 byte)
      },
      decoded_value: {
        len_text: 6,  // Computed field IS visible in decoded output
        text: "👋Hi"
      },
      bytes: [
        0x00, 0x06, // len_text = 6 bytes (auto-computed)
        0xF0, 0x9F, 0x91, 0x8B, // 👋 emoji (4 bytes)
        0x48, 0x69, // 'Hi' (2 bytes)
      ],
    },
    {
      description: "UTF-8 string with multi-byte chars '你好' (6 bytes for 2 characters)",
      value: {
        text: "你好"  // Computed field 'len_text' omitted - encoder auto-computes it (each Chinese character is 3 bytes in UTF-8)
      },
      decoded_value: {
        len_text: 6,  // Computed field IS visible in decoded output
        text: "你好"
      },
      bytes: [
        0x00, 0x06, // len_text = 6 bytes (auto-computed)
        0xE4, 0xBD, 0xA0, // '你' (3 bytes)
        0xE5, 0xA5, 0xBD, // '好' (3 bytes)
      ],
    },
    {
      description: "Mixed ASCII and UTF-8 'café☕' (8 bytes for 5 characters)",
      value: {
        text: "café☕"  // Computed field 'len_text' omitted - encoder auto-computes it (c=1, a=1, f=1, é=2, ☕=3 bytes)
      },
      decoded_value: {
        len_text: 8,  // Computed field IS visible in decoded output
        text: "café☕"
      },
      bytes: [
        0x00, 0x08, // len_text = 8 bytes (auto-computed)
        0x63, 0x61, 0x66, // 'caf' (3 bytes)
        0xC3, 0xA9, // 'é' (2 bytes)
        0xE2, 0x98, 0x95, // '☕' (3 bytes)
      ],
    },
  ]
});

/**
 * Test automatic length computation for byte arrays
 */
export const computedByteArrayLengthTestSuite = defineTestSuite({
  name: "computed_byte_array_length",
  description: "Automatic length calculation for byte arrays",

  schema: {
    config: {
      endianness: "big_endian",
    },
    types: {
      "Packet": {
        sequence: [
          {
            name: "data_length",
            type: "uint32",
            computed: {
              type: "length_of",
              target: "data"
            },
            description: "Auto-computed length of data array"
          },
          {
            name: "data",
            type: "array",
            kind: "field_referenced",
            length_field: "data_length",
            items: { type: "uint8" },
            description: "Byte array"
          }
        ]
      }
    }
  },

  test_type: "Packet",

  test_cases: [
    {
      description: "Empty array (0 elements)",
      value: {
        data: []  // Computed field 'data_length' omitted
      },
      decoded_value: {
        data_length: 0,  // Computed field IS visible in decoded output
        data: []
      },
      bytes: [
        0x00, 0x00, 0x00, 0x00, // data_length = 0 (auto-computed)
        // no data bytes
      ],
    },
    {
      description: "Single byte array",
      value: {
        data: [0xFF]  // Computed field 'data_length' omitted
      },
      decoded_value: {
        data_length: 1,  // Computed field IS visible in decoded output
        data: [0xFF]
      },
      bytes: [
        0x00, 0x00, 0x00, 0x01, // data_length = 1 (auto-computed)
        0xFF, // data
      ],
    },
    {
      description: "Multiple bytes array",
      value: {
        data: [0x01, 0x02, 0x03, 0x04, 0x05]  // Computed field 'data_length' omitted
      },
      decoded_value: {
        data_length: 5,  // Computed field IS visible in decoded output
        data: [0x01, 0x02, 0x03, 0x04, 0x05]
      },
      bytes: [
        0x00, 0x00, 0x00, 0x05, // data_length = 5 (auto-computed)
        0x01, 0x02, 0x03, 0x04, 0x05, // data
      ],
    },
    {
      description: "Large byte array (256 bytes)",
      value: {
        data: Array(256).fill(0).map((_, i) => i & 0xFF)  // Computed field 'data_length' omitted
      },
      decoded_value: {
        data_length: 256,  // Computed field IS visible in decoded output
        data: Array(256).fill(0).map((_, i) => i & 0xFF)
      },
      bytes: [
        0x00, 0x00, 0x01, 0x00, // data_length = 256 (auto-computed)
        ...Array(256).fill(0).map((_, i) => i & 0xFF), // data
      ],
    },
  ]
});

/**
 * Test automatic length computation for arrays of complex types (structs)
 */
export const computedStructArrayLengthTestSuite = defineTestSuite({
  name: "computed_struct_array_length",
  description: "Automatic length calculation for struct arrays",

  schema: {
    config: {
      endianness: "big_endian",
    },
    types: {
      "Point": {
        sequence: [
          { name: "x", type: "uint16" },
          { name: "y", type: "uint16" },
        ]
      },
      "PointCloud": {
        sequence: [
          {
            name: "num_points",
            type: "uint8",
            computed: {
              type: "length_of",
              target: "points"
            },
            description: "Auto-computed number of points"
          },
          {
            name: "points",
            type: "array",
            kind: "field_referenced",
            length_field: "num_points",
            items: { type: "Point" },
            description: "Array of points"
          }
        ]
      }
    }
  },

  test_type: "PointCloud",

  test_cases: [
    {
      description: "Empty points array",
      value: {
        points: []  // Computed field 'num_points' omitted
      },
      decoded_value: {
        num_points: 0,  // Computed field IS visible in decoded output
        points: []
      },
      bytes: [
        0x00, // num_points = 0 (auto-computed)
        // no points
      ],
    },
    {
      description: "Single point",
      value: {
        points: [
          { x: 10, y: 20 }
        ]  // Computed field 'num_points' omitted
      },
      decoded_value: {
        num_points: 1,  // Computed field IS visible in decoded output
        points: [
          { x: 10, y: 20 }
        ]
      },
      bytes: [
        0x01, // num_points = 1 (auto-computed)
        0x00, 0x0A, 0x00, 0x14, // Point{x:10, y:20}
      ],
    },
    {
      description: "Three points",
      value: {
        points: [
          { x: 10, y: 20 },
          { x: 30, y: 40 },
          { x: 50, y: 60 }
        ]  // Computed field 'num_points' omitted
      },
      decoded_value: {
        num_points: 3,  // Computed field IS visible in decoded output
        points: [
          { x: 10, y: 20 },
          { x: 30, y: 40 },
          { x: 50, y: 60 }
        ]
      },
      bytes: [
        0x03, // num_points = 3 (auto-computed)
        0x00, 0x0A, 0x00, 0x14, // Point{x:10, y:20}
        0x00, 0x1E, 0x00, 0x28, // Point{x:30, y:40}
        0x00, 0x32, 0x00, 0x3C, // Point{x:50, y:60}
      ],
    },
  ]
});

/**
 * Test multiple computed fields in same struct
 */
export const multipleComputedFieldsTestSuite = defineTestSuite({
  name: "multiple_computed_fields",
  description: "Multiple computed length fields in same struct",

  schema: {
    config: {
      endianness: "big_endian",
    },
    types: {
      "MultiData": {
        sequence: [
          {
            name: "len_name",
            type: "uint8",
            computed: {
              type: "length_of",
              target: "name",
              encoding: "utf8"
            }
          },
          {
            name: "len_tags",
            type: "uint8",
            computed: {
              type: "length_of",
              target: "tags"
            }
          },
          {
            name: "len_data",
            type: "uint16",
            computed: {
              type: "length_of",
              target: "data"
            }
          },
          {
            name: "name",
            type: "string",
            kind: "field_referenced",
            length_field: "len_name",
            encoding: "utf8"
          },
          {
            name: "tags",
            type: "array",
            kind: "field_referenced",
            length_field: "len_tags",
            items: { 
              type: "string",
              kind: "fixed",
              length: 4,
              encoding: "ascii"
            }
          },
          {
            name: "data",
            type: "array",
            kind: "field_referenced",
            length_field: "len_data",
            items: { type: "uint8" }
          }
        ]
      }
    }
  },

  test_type: "MultiData",

  test_cases: [
    {
      description: "All empty fields",
      value: {
        // All computed length fields omitted
        name: "",
        tags: [],
        data: []
      },
      decoded_value: {
        // All computed length fields ARE visible in decoded output
        len_name: 0,
        len_tags: 0,
        len_data: 0,
        name: "",
        tags: [],
        data: []
      },
      bytes: [
        0x00, // len_name = 0 (auto-computed)
        0x00, // len_tags = 0 (auto-computed)
        0x00, 0x00, // len_data = 0 (auto-computed)
        // no name, tags, or data
      ],
    },
    {
      description: "All fields populated",
      value: {
        // All computed length fields omitted
        name: "test",
        tags: ["tag1", "tag2"],
        data: [0x01, 0x02, 0x03]
      },
      decoded_value: {
        // All computed length fields ARE visible in decoded output
        len_name: 4,
        len_tags: 2,
        len_data: 3,
        name: "test",
        tags: ["tag1", "tag2"],
        data: [0x01, 0x02, 0x03]
      },
      bytes: [
        0x04, // len_name = 4 (auto-computed for "test")
        0x02, // len_tags = 2 (auto-computed for 2 tags)
        0x00, 0x03, // len_data = 3 (auto-computed for 3 bytes)
        0x74, 0x65, 0x73, 0x74, // "test"
        0x74, 0x61, 0x67, 0x31, // "tag1"
        0x74, 0x61, 0x67, 0x32, // "tag2"
        0x01, 0x02, 0x03, // data
      ],
    },
  ]
});

/**
 * Test computed length with uint8 size (max 255)
 */
export const computedLengthUint8TestSuite = defineTestSuite({
  name: "computed_length_uint8",
  description: "Computed length with uint8 field type",

  schema: {
    config: {
      endianness: "big_endian",
    },
    types: {
      "ShortMessage": {
        sequence: [
          {
            name: "len",
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
            length_field: "len",
            items: { type: "uint8" }
          }
        ]
      }
    }
  },

  test_type: "ShortMessage",

  test_cases: [
    {
      description: "Maximum uint8 length (255 bytes)",
      value: {
        data: Array(255).fill(0xAA)  // Computed field 'len' omitted
      },
      decoded_value: {
        len: 255,  // Computed field IS visible in decoded output
        data: Array(255).fill(0xAA)
      },
      bytes: [
        0xFF, // len = 255 (auto-computed)
        ...Array(255).fill(0xAA), // data
      ],
    },
  ]
});

/**
 * Test computed length with different integer sizes
 */
export const computedLengthVariousSizesTestSuite = defineTestSuite({
  name: "computed_length_various_sizes",
  description: "Computed length with different integer types",

  schema: {
    config: {
      endianness: "big_endian",
    },
    types: {
      "Uint8Length": {
        sequence: [
          {
            name: "len",
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
            length_field: "len",
            items: { type: "uint8" }
          }
        ]
      },
      "Uint16Length": {
        sequence: [
          {
            name: "len",
            type: "uint16",
            computed: {
              type: "length_of",
              target: "data"
            }
          },
          {
            name: "data",
            type: "array",
            kind: "field_referenced",
            length_field: "len",
            items: { type: "uint8" }
          }
        ]
      },
      "Uint32Length": {
        sequence: [
          {
            name: "len",
            type: "uint32",
            computed: {
              type: "length_of",
              target: "data"
            }
          },
          {
            name: "data",
            type: "array",
            kind: "field_referenced",
            length_field: "len",
            items: { type: "uint8" }
          }
        ]
      },
      "Uint64Length": {
        sequence: [
          {
            name: "len",
            type: "uint64",
            computed: {
              type: "length_of",
              target: "data"
            }
          },
          {
            name: "data",
            type: "array",
            kind: "field_referenced",
            length_field: "len",
            items: { type: "uint8" }
          }
        ]
      }
    }
  },

  test_type: "Uint32Length", // Testing uint32 version

  test_cases: [
    {
      description: "10 bytes with uint32 length field",
      value: {
        data: [0x00, 0x01, 0x02, 0x03, 0x04, 0x05, 0x06, 0x07, 0x08, 0x09]  // Computed field 'len' omitted
      },
      decoded_value: {
        len: 10,  // Computed field IS visible in decoded output
        data: [0x00, 0x01, 0x02, 0x03, 0x04, 0x05, 0x06, 0x07, 0x08, 0x09]
      },
      bytes: [
        0x00, 0x00, 0x00, 0x0A, // len = 10 (uint32, auto-computed)
        0x00, 0x01, 0x02, 0x03, 0x04, 0x05, 0x06, 0x07, 0x08, 0x09, // data
      ],
    },
  ]
});
