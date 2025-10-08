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
        fields: [
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
        fields: [
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
        fields: [
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
