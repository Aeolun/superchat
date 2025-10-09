import { defineTestSuite } from "../../schema/test-schema.js";

/**
 * Test suite for conditional fields
 *
 * Fields that are only encoded if a condition is true
 * Common in protocols with version flags or optional features
 */
export const conditionalFieldTestSuite = defineTestSuite({
  name: "conditional_field",
  description: "Field present only if flags indicate it",

  schema: {
    config: {
      endianness: "big_endian",
    },
    types: {
      "ConditionalMessage": {
        sequence: [
          { name: "flags", type: "uint8" },
          {
            name: "timestamp",
            type: "uint32",
            conditional: "flags & 0x01", // Only if bit 0 is set
          },
        ]
      }
    }
  },

  test_type: "ConditionalMessage",

  test_cases: [
    {
      description: "Flags = 0 (no timestamp)",
      value: { flags: 0 },
      bytes: [0x00], // Just flags
    },
    {
      description: "Flags = 0x01 (timestamp present)",
      value: { flags: 0x01, timestamp: 1234567890 },
      bytes: [
        0x01,             // flags
        0x49, 0x96, 0x02, 0xD2, // timestamp = 1234567890
      ],
    },
    {
      description: "Flags = 0x02 (no timestamp, other bits set)",
      value: { flags: 0x02 },
      bytes: [0x02], // Just flags, timestamp not present
    },
  ]
});

/**
 * Test suite for multiple conditional fields
 *
 * Different fields present based on different flag bits
 */
export const multipleConditionalsTestSuite = defineTestSuite({
  name: "multiple_conditionals",
  description: "Multiple fields with different conditions",

  schema: {
    config: {
      endianness: "big_endian",
    },
    types: {
      "FeatureFlags": {
        sequence: [
          { name: "flags", type: "uint8" },
          {
            name: "user_id",
            type: "uint64",
            conditional: "flags & 0x01", // Bit 0: has user_id
          },
          {
            name: "session_id",
            type: "uint64",
            conditional: "flags & 0x02", // Bit 1: has session_id
          },
          {
            name: "nonce",
            type: "uint32",
            conditional: "flags & 0x04", // Bit 2: has nonce
          },
        ]
      }
    }
  },

  test_type: "FeatureFlags",

  test_cases: [
    {
      description: "No optional fields (flags = 0)",
      value: { flags: 0 },
      bytes: [0x00],
    },
    {
      description: "Only user_id (flags = 0x01)",
      value: { flags: 0x01, user_id: 42n },
      bytes: [
        0x01, // flags
        0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x2A, // user_id = 42
      ],
    },
    {
      description: "Only session_id (flags = 0x02)",
      value: { flags: 0x02, session_id: 99n },
      bytes: [
        0x02, // flags
        0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x63, // session_id = 99
      ],
    },
    {
      description: "user_id and nonce (flags = 0x05)",
      value: { flags: 0x05, user_id: 1n, nonce: 0xDEADBEEF },
      bytes: [
        0x05, // flags = 0x05 (bits 0 and 2)
        0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x01, // user_id = 1
        0xDE, 0xAD, 0xBE, 0xEF, // nonce
      ],
    },
    {
      description: "All fields (flags = 0x07)",
      value: {
        flags: 0x07,
        user_id: 1n,
        session_id: 2n,
        nonce: 3,
      },
      bytes: [
        0x07, // flags = 0x07 (bits 0, 1, 2)
        0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x01, // user_id = 1
        0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x02, // session_id = 2
        0x00, 0x00, 0x00, 0x03, // nonce = 3
      ],
    },
  ]
});

/**
 * Test suite for version-based conditionals
 *
 * Fields present only in newer protocol versions
 */
export const versionConditionalTestSuite = defineTestSuite({
  name: "version_conditional",
  description: "Fields present based on protocol version",

  schema: {
    config: {
      endianness: "big_endian",
    },
    types: {
      "VersionedMessage": {
        sequence: [
          { name: "version", type: "uint8" },
          { name: "type", type: "uint8" },
          {
            name: "checksum",
            type: "uint32",
            conditional: "version >= 2", // Only in v2+
          },
        ]
      }
    }
  },

  test_type: "VersionedMessage",

  test_cases: [
    {
      description: "Version 1 (no checksum)",
      value: { version: 1, type: 0x42 },
      bytes: [0x01, 0x42],
    },
    {
      description: "Version 2 (with checksum)",
      value: { version: 2, type: 0x42, checksum: 0x12345678 },
      bytes: [
        0x02, // version
        0x42, // type
        0x12, 0x34, 0x56, 0x78, // checksum
      ],
    },
  ]
});

/**
 * Test suite for conditional based on specific bits
 *
 * Demonstrates conditionals using bitwise operations for message type discrimination
 */
export const conditionalEqualityTestSuite = defineTestSuite({
  name: "conditional_equality",
  description: "Conditional fields based on type bits",

  schema: {
    types: {
      "String": {
        sequence: [
          { name: "data", type: "array", kind: "length_prefixed", length_type: "uint32", items: { type: "uint8" } }
        ]
      },
      "TypedMessage": {
        sequence: [
          { name: "type", type: "uint8" },
          { name: "text", type: "String", conditional: "type & 0x01" },
          { name: "number", type: "uint32", conditional: "type & 0x02" },
          { name: "flag", type: "uint8", conditional: "type & 0x04" },
        ]
      }
    }
  },

  test_type: "TypedMessage",

  test_cases: [
    {
      description: "Type 0x01 (text message)",
      value: {
        type: 0x01,
        text: { data: [72, 105] } // "Hi"
      },
      bytes: [
        0x01, // type = 0x01
        0x00, 0x00, 0x00, 0x02, // string length = 2
        0x48, 0x69, // "Hi"
      ],
    },
    {
      description: "Type 0x02 (number message)",
      value: {
        type: 0x02,
        number: 12345
      },
      bytes: [
        0x02, // type = 0x02
        0x00, 0x00, 0x30, 0x39, // number = 12345
      ],
    },
    {
      description: "Type 0x04 (flag message)",
      value: {
        type: 0x04,
        flag: 0xFF
      },
      bytes: [
        0x04, // type = 0x04
        0xFF, // flag
      ],
    },
    {
      description: "Type 0x00 (no conditional fields)",
      value: {
        type: 0x00
      },
      bytes: [0x00], // Only type field
    },
    {
      description: "Type 0x03 (text + number)",
      value: {
        type: 0x03,
        text: { data: [72, 105] }, // "Hi"
        number: 999
      },
      bytes: [
        0x03, // type = 0x03 (bits 0 and 1 set)
        0x00, 0x00, 0x00, 0x02, // string length = 2
        0x48, 0x69, // "Hi"
        0x00, 0x00, 0x03, 0xE7, // number = 999
      ],
    },
  ]
});

/**
 * Test suite for conditional based on comparison operators
 *
 * Demonstrates conditionals using >, <, >=, <= operators
 */
export const conditionalComparisonTestSuite = defineTestSuite({
  name: "conditional_comparison",
  description: "Conditional fields based on comparison operators",

  schema: {
    types: {
      "RangeMessage": {
        sequence: [
          { name: "level", type: "uint8" },
          { name: "basic_info", type: "uint8", conditional: "level >= 1" },
          { name: "extended_info", type: "uint16", conditional: "level >= 2" },
          { name: "debug_data", type: "uint32", conditional: "level >= 3" },
        ]
      }
    }
  },

  test_type: "RangeMessage",

  test_cases: [
    {
      description: "Level 0 (no info)",
      value: { level: 0 },
      bytes: [0x00],
    },
    {
      description: "Level 1 (basic info only)",
      value: { level: 1, basic_info: 0x42 },
      bytes: [0x01, 0x42],
    },
    {
      description: "Level 2 (basic + extended)",
      value: {
        level: 2,
        basic_info: 0x42,
        extended_info: 0x1234
      },
      bytes: [0x02, 0x42, 0x12, 0x34],
    },
    {
      description: "Level 3 (all fields)",
      value: {
        level: 3,
        basic_info: 0x42,
        extended_info: 0x1234,
        debug_data: 0x12345678
      },
      bytes: [0x03, 0x42, 0x12, 0x34, 0x12, 0x34, 0x56, 0x78],
    },
  ]
});
