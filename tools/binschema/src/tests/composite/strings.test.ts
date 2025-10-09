import { defineTestSuite } from "../../schema/test-schema.js";

/**
 * Test suite for string convenience type
 *
 * String is defined as length-prefixed array of UTF-8 bytes
 * This is a user-defined type, not a built-in primitive
 */
export const stringTestSuite = defineTestSuite({
  name: "string_type",
  description: "String as length-prefixed UTF-8 bytes",

  schema: {
    config: {
      endianness: "big_endian",
    },
    types: {
      // Define "string" as a custom type (not built-in)
      "string": {
        sequence: [
          {
            name: "data",
            type: "array",
            kind: "length_prefixed",
            length_type: "uint32",
            items: { type: "uint8" },
          }
        ]
      },
      "StringValue": {
        sequence: [
          { name: "text", type: "string" }
        ]
      }
    }
  },

  test_type: "StringValue",

  test_cases: [
    {
      description: "Empty string",
      value: { text: { data: [] } },
      bytes: [0x00, 0x00, 0x00, 0x00], // length = 0
    },
    {
      description: "String 'Hi'",
      value: { text: { data: [0x48, 0x69] } }, // 'H', 'i'
      bytes: [
        0x00, 0x00, 0x00, 0x02, // length = 2
        0x48, 0x69,             // 'H', 'i'
      ],
    },
    {
      description: "String 'Hello'",
      value: { text: { data: [0x48, 0x65, 0x6C, 0x6C, 0x6F] } },
      bytes: [
        0x00, 0x00, 0x00, 0x05, // length = 5
        0x48, 0x65, 0x6C, 0x6C, 0x6F, // 'Hello'
      ],
    },
    {
      description: "UTF-8 emoji '👋' (U+1F44B = 0xF0 0x9F 0x91 0x8B)",
      value: { text: { data: [0xF0, 0x9F, 0x91, 0x8B] } },
      bytes: [
        0x00, 0x00, 0x00, 0x04,       // length = 4 bytes
        0xF0, 0x9F, 0x91, 0x8B,       // UTF-8 encoding of 👋
      ],
    },
  ]
});

/**
 * Test suite for short string (uint8 length prefix)
 *
 * Common optimization for strings that won't exceed 255 bytes
 */
export const shortStringTestSuite = defineTestSuite({
  name: "short_string",
  description: "String with uint8 length prefix",

  schema: {
    config: {
      endianness: "big_endian",
    },
    types: {
      "ShortString": {
        sequence: [
          {
            name: "data",
            type: "array",
            kind: "length_prefixed",
            length_type: "uint8",
            items: { type: "uint8" },
          }
        ]
      },
      "ShortStringValue": {
        sequence: [
          { name: "text", type: "ShortString" }
        ]
      }
    }
  },

  test_type: "ShortStringValue",

  test_cases: [
    {
      description: "Empty string",
      value: { text: { data: [] } },
      bytes: [0x00],
    },
    {
      description: "String 'OK'",
      value: { text: { data: [0x4F, 0x4B] } },
      bytes: [0x02, 0x4F, 0x4B],
    },
  ]
});

/**
 * Test suite for struct with multiple strings
 *
 * Demonstrates string fields in composite types
 */
export const multipleStringsTestSuite = defineTestSuite({
  name: "multiple_strings",
  description: "Struct with multiple string fields",

  schema: {
    config: {
      endianness: "big_endian",
    },
    types: {
      "ShortString": {
        sequence: [
          {
            name: "data",
            type: "array",
            kind: "length_prefixed",
            length_type: "uint8",
            items: { type: "uint8" },
          }
        ]
      },
      "User": {
        sequence: [
          { name: "id", type: "uint32" },
          { name: "username", type: "ShortString" },
          { name: "email", type: "ShortString" },
        ]
      }
    }
  },

  test_type: "User",

  test_cases: [
    {
      description: "User with empty strings",
      value: {
        id: 42,
        username: { data: [] },
        email: { data: [] },
      },
      bytes: [
        0x00, 0x00, 0x00, 0x2A, // id = 42
        0x00,                   // username.length = 0
        0x00,                   // email.length = 0
      ],
    },
    {
      description: "User 'alice' with email",
      value: {
        id: 1,
        username: { data: [0x61, 0x6C, 0x69, 0x63, 0x65] }, // 'alice'
        email: { data: [0x61, 0x40, 0x65, 0x78, 0x2E, 0x63, 0x6F] }, // 'a@ex.co'
      },
      bytes: [
        0x00, 0x00, 0x00, 0x01, // id = 1
        0x05,                   // username.length = 5
        0x61, 0x6C, 0x69, 0x63, 0x65, // 'alice'
        0x07,                   // email.length = 7
        0x61, 0x40, 0x65, 0x78, 0x2E, 0x63, 0x6F, // 'a@ex.co'
      ],
    },
  ]
});

/**
 * Test suite for C-style null-terminated strings
 *
 * Alternative string encoding (less common in binary protocols)
 */
export const cStringTestSuite = defineTestSuite({
  name: "c_string",
  description: "Null-terminated string (C-style)",

  schema: {
    types: {
      "CString": {
        sequence: [
          {
            name: "data",
            type: "array",
            kind: "null_terminated",
            items: { type: "uint8" },
          }
        ]
      },
      "CStringValue": {
        sequence: [
          { name: "text", type: "CString" }
        ]
      }
    }
  },

  test_type: "CStringValue",

  test_cases: [
    {
      description: "Empty string",
      value: { text: { data: [] } },
      bytes: [0x00], // Just null terminator
    },
    {
      description: "String 'Hi'",
      value: { text: { data: [0x48, 0x69] } },
      bytes: [0x48, 0x69, 0x00], // 'H', 'i', null
    },
  ]
});
