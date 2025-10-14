import { defineTestSuite } from "../../schema/test-schema.js";

/**
 * Test suite for type references to standalone string types
 *
 * This tests the bug where defining a standalone String type and then
 * referencing it from another type produces empty encoder/decoder bodies.
 *
 * The bug occurs because the generator doesn't properly resolve type references
 * to first-class string types when building composite type encoders.
 *
 * Example pattern that should work:
 * {
 *   "types": {
 *     "String": { "type": "string", "kind": "length_prefixed", ... },
 *     "AuthRequest": {
 *       "sequence": [
 *         { "name": "nickname", "type": "String" },
 *         { "name": "password", "type": "String" }
 *       ]
 *     }
 *   }
 * }
 */

/**
 * Basic test: Single string type reference
 *
 * Defines a standalone String type (uint8 length-prefixed ASCII) and a Message
 * type that references it. This is the minimal reproduction case.
 */
export const singleStringReferenceTestSuite = defineTestSuite({
  name: "string_type_reference_single",
  description: "Composite type with single reference to standalone string type",

  schema: {
    config: {
      endianness: "big_endian",
    },
    types: {
      "String": {
        type: "string",
        kind: "length_prefixed",
        length_type: "uint8",
        encoding: "ascii",
        description: "Standalone string type - uint8 length-prefixed ASCII"
      },
      "Message": {
        sequence: [
          { name: "text", type: "String" }
        ]
      }
    }
  },

  test_type: "Message",

  test_cases: [
    {
      description: "Empty string",
      value: { text: "" },
      bytes: [0x00], // length = 0
    },
    {
      description: "Single character 'x'",
      value: { text: "x" },
      bytes: [0x01, 0x78], // length=1, 'x'
    },
    {
      description: "Word 'hello'",
      value: { text: "hello" },
      bytes: [
        0x05, // length = 5
        0x68, 0x65, 0x6C, 0x6C, 0x6F, // 'hello'
      ],
    },
    {
      description: "Long string 'The quick brown fox'",
      value: { text: "The quick brown fox" },
      bytes: [
        0x13, // length = 19
        0x54, 0x68, 0x65, 0x20, 0x71, 0x75, 0x69, 0x63, 0x6B, 0x20, // 'The quick '
        0x62, 0x72, 0x6F, 0x77, 0x6E, 0x20, 0x66, 0x6F, 0x78, // 'brown fox'
      ],
    },
  ]
});

/**
 * Multiple string references in one composite type
 *
 * Tests that multiple fields can reference the same standalone string type,
 * and that each field gets its own independent encoding.
 */
export const multipleStringReferencesTestSuite = defineTestSuite({
  name: "string_type_reference_multiple",
  description: "Composite type with multiple references to same string type",

  schema: {
    config: {
      endianness: "big_endian",
    },
    types: {
      "String": {
        type: "string",
        kind: "length_prefixed",
        length_type: "uint8",
        encoding: "ascii",
        description: "Standalone string type"
      },
      "AuthRequest": {
        sequence: [
          { name: "nickname", type: "String" },
          { name: "password", type: "String" }
        ]
      }
    }
  },

  test_type: "AuthRequest",

  test_cases: [
    {
      description: "Both strings empty",
      value: { nickname: "", password: "" },
      bytes: [0x00, 0x00], // Both lengths = 0
    },
    {
      description: "Short nickname, empty password",
      value: { nickname: "bob", password: "" },
      bytes: [
        0x03, 0x62, 0x6F, 0x62, // nickname: length=3, 'bob'
        0x00, // password: length=0
      ],
    },
    {
      description: "Both strings populated",
      value: { nickname: "alice", password: "secret123" },
      bytes: [
        0x05, 0x61, 0x6C, 0x69, 0x63, 0x65, // nickname: length=5, 'alice'
        0x09, 0x73, 0x65, 0x63, 0x72, 0x65, 0x74, 0x31, 0x32, 0x33, // password: length=9, 'secret123'
      ],
    },
    {
      description: "Empty nickname, populated password",
      value: { nickname: "", password: "pass" },
      bytes: [
        0x00, // nickname: length=0
        0x04, 0x70, 0x61, 0x73, 0x73, // password: length=4, 'pass'
      ],
    },
  ]
});

/**
 * Different string types referenced from same composite
 *
 * Tests that a composite type can reference multiple different standalone
 * string types with different encoding properties (different length types,
 * encodings, etc.).
 */
export const differentStringTypesTestSuite = defineTestSuite({
  name: "string_type_reference_different_types",
  description: "Composite type referencing multiple different string types",

  schema: {
    config: {
      endianness: "big_endian",
    },
    types: {
      "ShortString": {
        type: "string",
        kind: "length_prefixed",
        length_type: "uint8",
        encoding: "ascii",
        description: "Short ASCII string (max 255 bytes)"
      },
      "LongString": {
        type: "string",
        kind: "length_prefixed",
        length_type: "uint16",
        encoding: "utf8",
        description: "Long UTF-8 string (max 65535 bytes)"
      },
      "Record": {
        sequence: [
          { name: "id", type: "uint16" },
          { name: "name", type: "ShortString" },
          { name: "description", type: "LongString" }
        ]
      }
    }
  },

  test_type: "Record",

  test_cases: [
    {
      description: "All strings empty",
      value: { id: 0, name: "", description: "" },
      bytes: [
        0x00, 0x00, // id = 0
        0x00,       // name.length = 0
        0x00, 0x00, // description.length = 0
      ],
    },
    {
      description: "Record with ASCII name and UTF-8 description",
      value: { id: 42, name: "test", description: "Test 世界" },
      bytes: [
        0x00, 0x2A, // id = 42
        0x04, 0x74, 0x65, 0x73, 0x74, // name: length=4, 'test'
        0x00, 0x0B, // description.length = 11 bytes
        0x54, 0x65, 0x73, 0x74, 0x20, // 'Test '
        0xE4, 0xB8, 0x96, // '世'
        0xE7, 0x95, 0x8C, // '界'
      ],
    },
    {
      description: "Record with emoji in description",
      value: { id: 1, name: "bot", description: "👋🤖" },
      bytes: [
        0x00, 0x01, // id = 1
        0x03, 0x62, 0x6F, 0x74, // name: length=3, 'bot'
        0x00, 0x08, // description.length = 8 bytes (2 emojis × 4 bytes each)
        0xF0, 0x9F, 0x91, 0x8B, // '👋'
        0xF0, 0x9F, 0xA4, 0x96, // '🤖'
      ],
    },
  ]
});

/**
 * Nested composite types with string references
 *
 * Tests that string type references work correctly when used in nested
 * composite types (a struct that contains another struct that uses strings).
 */
export const nestedStringReferencesTestSuite = defineTestSuite({
  name: "string_type_reference_nested",
  description: "Nested composite types with string type references",

  schema: {
    config: {
      endianness: "big_endian",
    },
    types: {
      "String": {
        type: "string",
        kind: "length_prefixed",
        length_type: "uint8",
        encoding: "ascii",
        description: "Standalone ASCII string"
      },
      "Person": {
        sequence: [
          { name: "name", type: "String" },
          { name: "age", type: "uint8" }
        ]
      },
      "Message": {
        sequence: [
          { name: "sender", type: "Person" },
          { name: "text", type: "String" }
        ]
      }
    }
  },

  test_type: "Message",

  test_cases: [
    {
      description: "Empty strings in nested struct",
      value: {
        sender: { name: "", age: 0 },
        text: ""
      },
      bytes: [
        0x00, // sender.name.length = 0
        0x00, // sender.age = 0
        0x00, // text.length = 0
      ],
    },
    {
      description: "Nested struct with populated strings",
      value: {
        sender: { name: "alice", age: 25 },
        text: "hello"
      },
      bytes: [
        0x05, 0x61, 0x6C, 0x69, 0x63, 0x65, // sender.name: length=5, 'alice'
        0x19, // sender.age = 25
        0x05, 0x68, 0x65, 0x6C, 0x6C, 0x6F, // text: length=5, 'hello'
      ],
    },
    {
      description: "Complex nested message",
      value: {
        sender: { name: "bob", age: 30 },
        text: "Hello, World!"
      },
      bytes: [
        0x03, 0x62, 0x6F, 0x62, // sender.name: length=3, 'bob'
        0x1E, // sender.age = 30
        0x0D, // text.length = 13
        0x48, 0x65, 0x6C, 0x6C, 0x6F, 0x2C, 0x20, // 'Hello, '
        0x57, 0x6F, 0x72, 0x6C, 0x64, 0x21,       // 'World!'
      ],
    },
  ]
});

/**
 * String references in arrays
 *
 * Tests that arrays of composite types that contain string references
 * work correctly. This is a common pattern (e.g., array of records).
 */
export const stringReferencesInArraysTestSuite = defineTestSuite({
  name: "string_type_reference_arrays",
  description: "Arrays of composite types containing string references",

  schema: {
    config: {
      endianness: "big_endian",
    },
    types: {
      "String": {
        type: "string",
        kind: "length_prefixed",
        length_type: "uint8",
        encoding: "ascii"
      },
      "Entry": {
        sequence: [
          { name: "key", type: "String" },
          { name: "value", type: "String" }
        ]
      },
      "Dictionary": {
        sequence: [
          {
            name: "entries",
            type: "array",
            kind: "length_prefixed",
            length_type: "uint8",
            items: { type: "Entry" }
          }
        ]
      }
    }
  },

  test_type: "Dictionary",

  test_cases: [
    {
      description: "Empty dictionary",
      value: { entries: [] },
      bytes: [0x00], // entries.length = 0
    },
    {
      description: "Single entry",
      value: {
        entries: [
          { key: "name", value: "alice" }
        ]
      },
      bytes: [
        0x01, // entries.length = 1
        0x04, 0x6E, 0x61, 0x6D, 0x65, // key: length=4, 'name'
        0x05, 0x61, 0x6C, 0x69, 0x63, 0x65, // value: length=5, 'alice'
      ],
    },
    {
      description: "Multiple entries",
      value: {
        entries: [
          { key: "name", value: "bob" },
          { key: "role", value: "admin" },
        ]
      },
      bytes: [
        0x02, // entries.length = 2
        // Entry 0:
        0x04, 0x6E, 0x61, 0x6D, 0x65, // key: length=4, 'name'
        0x03, 0x62, 0x6F, 0x62,       // value: length=3, 'bob'
        // Entry 1:
        0x04, 0x72, 0x6F, 0x6C, 0x65, // key: length=4, 'role'
        0x05, 0x61, 0x64, 0x6D, 0x69, 0x6E, // value: length=5, 'admin'
      ],
    },
    {
      description: "Entries with empty values",
      value: {
        entries: [
          { key: "a", value: "" },
          { key: "", value: "b" },
        ]
      },
      bytes: [
        0x02, // entries.length = 2
        // Entry 0:
        0x01, 0x61, // key: length=1, 'a'
        0x00,       // value: length=0
        // Entry 1:
        0x00,       // key: length=0
        0x01, 0x62, // value: length=1, 'b'
      ],
    },
  ]
});

/**
 * Null-terminated string references
 *
 * Tests that standalone null-terminated string types can be referenced
 * correctly (different encoding strategy from length-prefixed).
 */
export const nullTerminatedStringReferenceTestSuite = defineTestSuite({
  name: "string_type_reference_null_terminated",
  description: "Composite type referencing standalone null-terminated string type",

  schema: {
    config: {
      endianness: "big_endian",
    },
    types: {
      "CString": {
        type: "string",
        kind: "null_terminated",
        encoding: "ascii",
        description: "C-style null-terminated string"
      },
      "Message": {
        sequence: [
          { name: "path", type: "CString" },
          { name: "flags", type: "uint8" }
        ]
      }
    }
  },

  test_type: "Message",

  test_cases: [
    {
      description: "Empty string",
      value: { path: "", flags: 0 },
      bytes: [
        0x00, // path: just null terminator
        0x00, // flags = 0
      ],
    },
    {
      description: "Short path",
      value: { path: "/bin", flags: 1 },
      bytes: [
        0x2F, 0x62, 0x69, 0x6E, // '/bin'
        0x00, // null terminator
        0x01, // flags = 1
      ],
    },
    {
      description: "Long path",
      value: { path: "/usr/local/bin", flags: 7 },
      bytes: [
        0x2F, 0x75, 0x73, 0x72, 0x2F, 0x6C, 0x6F, 0x63, 0x61, 0x6C, 0x2F, 0x62, 0x69, 0x6E, // '/usr/local/bin'
        0x00, // null terminator
        0x07, // flags = 7
      ],
    },
  ]
});

/**
 * Fixed-length string references
 *
 * Tests that standalone fixed-length string types can be referenced correctly
 * (padded encoding strategy).
 */
export const fixedLengthStringReferenceTestSuite = defineTestSuite({
  name: "string_type_reference_fixed_length",
  description: "Composite type referencing standalone fixed-length string type",

  schema: {
    config: {
      endianness: "big_endian",
    },
    types: {
      "FixedString": {
        type: "string",
        kind: "fixed",
        length: 8,
        encoding: "ascii",
        description: "8-byte fixed ASCII string"
      },
      "Header": {
        sequence: [
          { name: "magic", type: "FixedString" },
          { name: "version", type: "uint16" }
        ]
      }
    }
  },

  test_type: "Header",

  test_cases: [
    {
      description: "Empty magic (all nulls)",
      value: { magic: "", version: 1 },
      bytes: [
        0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, // magic: 8 null bytes
        0x00, 0x01, // version = 1
      ],
    },
    {
      description: "Short magic (padded)",
      value: { magic: "SUPER", version: 2 },
      bytes: [
        0x53, 0x55, 0x50, 0x45, 0x52, // 'SUPER'
        0x00, 0x00, 0x00,             // null padding
        0x00, 0x02,                   // version = 2
      ],
    },
    {
      description: "Exact length magic",
      value: { magic: "PROTOCOL", version: 3 },
      bytes: [
        0x50, 0x52, 0x4F, 0x54, 0x4F, 0x43, 0x4F, 0x4C, // 'PROTOCOL' (exactly 8 bytes)
        0x00, 0x03, // version = 3
      ],
    },
  ]
});

/**
 * Multiple different standalone string types
 *
 * Tests that a composite type can reference multiple different standalone
 * string types (not just different instances of the same type, but truly
 * different named types), ensuring they work correctly without interference.
 */
export const mixedInlineAndReferencedStringsTestSuite = defineTestSuite({
  name: "string_type_reference_mixed_types",
  description: "Composite type referencing multiple different standalone string types",

  schema: {
    config: {
      endianness: "big_endian",
    },
    types: {
      "String": {
        type: "string",
        kind: "length_prefixed",
        length_type: "uint8",
        encoding: "ascii",
        description: "Standalone string type"
      },
      "InlineString": {
        type: "string",
        kind: "length_prefixed",
        length_type: "uint8",
        encoding: "ascii",
        description: "Another standalone string type"
      },
      "Record": {
        sequence: [
          { name: "id", type: "uint16" },
          { name: "name", type: "String" }, // Reference to standalone type
          { name: "label", type: "InlineString" } // Reference to another standalone type
        ]
      }
    }
  },

  test_type: "Record",

  test_cases: [
    {
      description: "Both strings empty",
      value: { id: 0, name: "", label: "" },
      bytes: [
        0x00, 0x00, // id = 0
        0x00,       // name.length = 0
        0x00,       // label.length = 0
      ],
    },
    {
      description: "Both strings populated",
      value: { id: 42, name: "alice", label: "user" },
      bytes: [
        0x00, 0x2A, // id = 42
        0x05, 0x61, 0x6C, 0x69, 0x63, 0x65, // name: length=5, 'alice'
        0x04, 0x75, 0x73, 0x65, 0x72,       // label: length=4, 'user'
      ],
    },
    {
      description: "Different string lengths",
      value: { id: 1, name: "x", label: "administrator" },
      bytes: [
        0x00, 0x01, // id = 1
        0x01, 0x78, // name: length=1, 'x'
        0x0D, // label: length=13
        0x61, 0x64, 0x6D, 0x69, 0x6E, 0x69, 0x73, 0x74, 0x72, 0x61, 0x74, 0x6F, 0x72, // 'administrator'
      ],
    },
  ]
});
