import { defineTestSuite } from "../../schema/test-schema.js";

/**
 * Test suite for first-class string type
 *
 * This tests the new syntax:
 * {
 *   "type": "string",
 *   "kind": "length_prefixed",
 *   "length_type": "uint8",
 *   "encoding": "ascii"
 * }
 *
 * Unlike the old workaround (arrays of uint8), this generates proper
 * string encoding/decoding with native JavaScript string values.
 */

/**
 * Length-prefixed strings with uint8 length
 */
export const lengthPrefixedUint8TestSuite = defineTestSuite({
  name: "string_length_prefixed_uint8",
  description: "Length-prefixed string with uint8 length (0-255 bytes)",

  schema: {
    config: {
      endianness: "big_endian",
    },
    types: {
      "Label": {
        type: "string",
        kind: "length_prefixed",
        length_type: "uint8",
        encoding: "ascii",
        description: "DNS label - 1 byte length + ASCII characters"
      },
      "Message": {
        sequence: [
          { name: "label", type: "Label" }
        ]
      }
    }
  },

  test_type: "Message",

  test_cases: [
    {
      description: "Empty string",
      value: { label: "" },
      bytes: [0x00], // length = 0
    },
    {
      description: "Single character 'a'",
      value: { label: "a" },
      bytes: [0x01, 0x61], // length=1, 'a'
    },
    {
      description: "DNS label 'example'",
      value: { label: "example" },
      bytes: [
        0x07, // length = 7
        0x65, 0x78, 0x61, 0x6D, 0x70, 0x6C, 0x65, // 'example'
      ],
    },
    {
      description: "Maximum length label (63 bytes)",
      value: { label: "a".repeat(63) },
      bytes: [
        0x3F, // length = 63
        ...Array(63).fill(0x61), // 63 'a' characters
      ],
    },
    {
      description: "Hyphenated label 'my-server'",
      value: { label: "my-server" },
      bytes: [
        0x09, // length = 9
        0x6D, 0x79, 0x2D, 0x73, 0x65, 0x72, 0x76, 0x65, 0x72, // 'my-server'
      ],
    },
  ]
});

/**
 * Length-prefixed strings with uint16 length
 */
export const lengthPrefixedUint16TestSuite = defineTestSuite({
  name: "string_length_prefixed_uint16",
  description: "Length-prefixed string with uint16 length (0-65535 bytes)",

  schema: {
    config: {
      endianness: "big_endian",
    },
    types: {
      "MediumString": {
        type: "string",
        kind: "length_prefixed",
        length_type: "uint16",
        encoding: "utf8",
        description: "String with uint16 length prefix"
      },
      "Message": {
        sequence: [
          { name: "text", type: "MediumString" }
        ]
      }
    }
  },

  test_type: "Message",

  test_cases: [
    {
      description: "Empty string",
      value: { text: "" },
      bytes: [0x00, 0x00], // length = 0
    },
    {
      description: "String 'Hello, World!'",
      value: { text: "Hello, World!" },
      bytes: [
        0x00, 0x0D, // length = 13
        0x48, 0x65, 0x6C, 0x6C, 0x6F, 0x2C, 0x20, // 'Hello, '
        0x57, 0x6F, 0x72, 0x6C, 0x64, 0x21,       // 'World!'
      ],
    },
    {
      description: "UTF-8 emoji '👋' (4 bytes)",
      value: { text: "👋" },
      bytes: [
        0x00, 0x04,             // length = 4 bytes
        0xF0, 0x9F, 0x91, 0x8B, // UTF-8 encoding of 👋
      ],
    },
    {
      description: "UTF-8 string 'Hello 世界'",
      value: { text: "Hello 世界" },
      bytes: [
        0x00, 0x0C,             // length = 12 bytes
        0x48, 0x65, 0x6C, 0x6C, 0x6F, 0x20, // 'Hello '
        0xE4, 0xB8, 0x96,       // '世' (3 bytes)
        0xE7, 0x95, 0x8C,       // '界' (3 bytes)
      ],
    },
  ]
});

/**
 * Length-prefixed strings with uint32 length
 */
export const lengthPrefixedUint32TestSuite = defineTestSuite({
  name: "string_length_prefixed_uint32",
  description: "Length-prefixed string with uint32 length (large strings)",

  schema: {
    config: {
      endianness: "big_endian",
    },
    types: {
      "LargeString": {
        type: "string",
        kind: "length_prefixed",
        length_type: "uint32",
        encoding: "utf8",
        description: "String with uint32 length prefix"
      },
      "Message": {
        sequence: [
          { name: "data", type: "LargeString" }
        ]
      }
    }
  },

  test_type: "Message",

  test_cases: [
    {
      description: "Empty string",
      value: { data: "" },
      bytes: [0x00, 0x00, 0x00, 0x00], // length = 0
    },
    {
      description: "String 'test'",
      value: { data: "test" },
      bytes: [
        0x00, 0x00, 0x00, 0x04, // length = 4
        0x74, 0x65, 0x73, 0x74, // 'test'
      ],
    },
  ]
});

/**
 * Null-terminated strings (C-style)
 */
export const nullTerminatedTestSuite = defineTestSuite({
  name: "string_null_terminated",
  description: "Null-terminated string (C-style, no length prefix)",

  schema: {
    config: {
      endianness: "big_endian",
    },
    types: {
      "CString": {
        type: "string",
        kind: "null_terminated",
        encoding: "ascii",
        description: "Null-terminated ASCII string"
      },
      "Message": {
        sequence: [
          { name: "text", type: "CString" }
        ]
      }
    }
  },

  test_type: "Message",

  test_cases: [
    {
      description: "Empty string",
      value: { text: "" },
      bytes: [0x00], // Just null terminator
    },
    {
      description: "String 'hello'",
      value: { text: "hello" },
      bytes: [
        0x68, 0x65, 0x6C, 0x6C, 0x6F, // 'hello'
        0x00,                         // null terminator
      ],
    },
    {
      description: "Path '/usr/bin'",
      value: { text: "/usr/bin" },
      bytes: [
        0x2F, 0x75, 0x73, 0x72, 0x2F, 0x62, 0x69, 0x6E, // '/usr/bin'
        0x00, // null terminator
      ],
    },
  ]
});

/**
 * Fixed-length strings (padded with nulls or spaces)
 */
export const fixedLengthTestSuite = defineTestSuite({
  name: "string_fixed_length",
  description: "Fixed-length string (padded to exact size)",

  schema: {
    config: {
      endianness: "big_endian",
    },
    types: {
      "FixedString8": {
        type: "string",
        kind: "fixed",
        length: 8,
        encoding: "ascii",
        description: "8-byte fixed ASCII string"
      },
      "Message": {
        sequence: [
          { name: "name", type: "FixedString8" }
        ]
      }
    }
  },

  test_type: "Message",

  test_cases: [
    {
      description: "Empty string (all nulls)",
      value: { name: "" },
      bytes: [0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00],
    },
    {
      description: "String 'test' (padded with nulls)",
      value: { name: "test" },
      bytes: [
        0x74, 0x65, 0x73, 0x74, // 'test'
        0x00, 0x00, 0x00, 0x00, // null padding
      ],
    },
    {
      description: "Exact length string 'abcdefgh'",
      value: { name: "abcdefgh" },
      bytes: [0x61, 0x62, 0x63, 0x64, 0x65, 0x66, 0x67, 0x68],
    },
  ]
});

/**
 * Multiple strings in one struct
 */
export const multipleStringsTestSuite = defineTestSuite({
  name: "string_multiple_fields",
  description: "Struct with multiple string fields of different types",

  schema: {
    config: {
      endianness: "big_endian",
    },
    types: {
      "Label": {
        type: "string",
        kind: "length_prefixed",
        length_type: "uint8",
        encoding: "ascii"
      },
      "Description": {
        type: "string",
        kind: "length_prefixed",
        length_type: "uint16",
        encoding: "utf8"
      },
      "Record": {
        sequence: [
          { name: "id", type: "uint16" },
          { name: "label", type: "Label" },
          { name: "description", type: "Description" },
        ]
      }
    }
  },

  test_type: "Record",

  test_cases: [
    {
      description: "Record with both strings empty",
      value: {
        id: 42,
        label: "",
        description: "",
      },
      bytes: [
        0x00, 0x2A, // id = 42
        0x00,       // label.length = 0
        0x00, 0x00, // description.length = 0
      ],
    },
    {
      description: "Record with 'web' label and description",
      value: {
        id: 1,
        label: "web",
        description: "Web server",
      },
      bytes: [
        0x00, 0x01, // id = 1
        0x03,       // label.length = 3
        0x77, 0x65, 0x62, // 'web'
        0x00, 0x0A, // description.length = 10
        0x57, 0x65, 0x62, 0x20, 0x73, 0x65, 0x72, 0x76, 0x65, 0x72, // 'Web server'
      ],
    },
  ]
});

/**
 * Edge cases and special characters
 */
export const edgeCasesTestSuite = defineTestSuite({
  name: "string_edge_cases",
  description: "Edge cases: special chars, whitespace, etc.",

  schema: {
    config: {
      endianness: "big_endian",
    },
    types: {
      "Text": {
        type: "string",
        kind: "length_prefixed",
        length_type: "uint8",
        encoding: "ascii"
      },
      "Message": {
        sequence: [
          { name: "text", type: "Text" }
        ]
      }
    }
  },

  test_type: "Message",

  test_cases: [
    {
      description: "String with spaces '  hello  '",
      value: { text: "  hello  " },
      bytes: [
        0x09, // length = 9
        0x20, 0x20, 0x68, 0x65, 0x6C, 0x6C, 0x6F, 0x20, 0x20, // '  hello  '
      ],
    },
    {
      description: "String with newline 'line1\\nline2'",
      value: { text: "line1\nline2" },
      bytes: [
        0x0B, // length = 11
        0x6C, 0x69, 0x6E, 0x65, 0x31, 0x0A, // 'line1\n'
        0x6C, 0x69, 0x6E, 0x65, 0x32,       // 'line2'
      ],
    },
    {
      description: "String with tab 'before\\tafter'",
      value: { text: "before\tafter" },
      bytes: [
        0x0C, // length = 12
        0x62, 0x65, 0x66, 0x6F, 0x72, 0x65, 0x09, // 'before\t'
        0x61, 0x66, 0x74, 0x65, 0x72,             // 'after'
      ],
    },
    {
      description: "String with punctuation '!@#$%'",
      value: { text: "!@#$%" },
      bytes: [
        0x05, // length = 5
        0x21, 0x40, 0x23, 0x24, 0x25, // '!@#$%'
      ],
    },
  ]
});
