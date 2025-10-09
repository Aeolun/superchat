import { defineTestSuite } from "../../schema/test-schema.js";

/**
 * Test suite for conditionals based on nested field references
 *
 * Tests conditionals that reference fields in nested structs (e.g., "header.flags & 0x01")
 */
export const nestedFieldConditionalTestSuite = defineTestSuite({
  name: "nested_field_conditional",
  description: "Conditional fields based on nested struct field values",

  schema: {
    config: {
      endianness: "big_endian",
    },
    types: {
      "Header": {
        fields: [
          { name: "flags", type: "uint8" },
          { name: "version", type: "uint8" },
        ]
      },
      "Packet": {
        fields: [
          { name: "header", type: "Header" },
          { name: "payload", type: "uint32", conditional: "header.flags & 0x01" },
          { name: "checksum", type: "uint16", conditional: "header.flags & 0x02" },
          { name: "timestamp", type: "uint64", conditional: "header.version >= 2" },
        ]
      }
    }
  },

  test_type: "Packet",

  test_cases: [
    {
      description: "No optional fields (flags=0, version=1)",
      value: {
        header: { flags: 0, version: 1 }
      },
      bytes: [
        0x00, // flags = 0
        0x01, // version = 1
      ],
    },
    {
      description: "Payload only (flags=0x01, version=1)",
      value: {
        header: { flags: 0x01, version: 1 },
        payload: 0x12345678
      },
      bytes: [
        0x01, // flags = 0x01
        0x01, // version = 1
        0x12, 0x34, 0x56, 0x78, // payload
      ],
    },
    {
      description: "Checksum only (flags=0x02, version=1)",
      value: {
        header: { flags: 0x02, version: 1 },
        checksum: 0xABCD
      },
      bytes: [
        0x02, // flags = 0x02
        0x01, // version = 1
        0xAB, 0xCD, // checksum
      ],
    },
    {
      description: "Timestamp only (flags=0, version=2)",
      value: {
        header: { flags: 0, version: 2 },
        timestamp: 0x123456789ABCDEFn
      },
      bytes: [
        0x00, // flags = 0
        0x02, // version = 2
        0x01, 0x23, 0x45, 0x67, 0x89, 0xAB, 0xCD, 0xEF, // timestamp
      ],
    },
    {
      description: "All fields (flags=0x03, version=2)",
      value: {
        header: { flags: 0x03, version: 2 },
        payload: 0xDEADBEEF,
        checksum: 0x1234,
        timestamp: 0xFFFFFFFFFFFFFFFFn
      },
      bytes: [
        0x03, // flags = 0x03
        0x02, // version = 2
        0xDE, 0xAD, 0xBE, 0xEF, // payload
        0x12, 0x34, // checksum
        0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, // timestamp
      ],
    },
  ]
});

/**
 * Test suite for deeply nested field conditionals
 *
 * Tests conditionals that reference fields multiple levels deep
 */
export const deeplyNestedConditionalTestSuite = defineTestSuite({
  name: "deeply_nested_conditional",
  description: "Conditional based on deeply nested field",

  schema: {
    config: {
      endianness: "big_endian",
    },
    types: {
      "Config": {
        fields: [
          { name: "enabled", type: "uint8" }
        ]
      },
      "Settings": {
        fields: [
          { name: "config", type: "Config" }
        ]
      },
      "Message": {
        fields: [
          { name: "id", type: "uint8" },
          { name: "settings", type: "Settings" },
          { name: "data", type: "uint32", conditional: "settings.config.enabled == 1" },
        ]
      }
    }
  },

  test_type: "Message",

  test_cases: [
    {
      description: "Data not present (enabled=0)",
      value: {
        id: 42,
        settings: { config: { enabled: 0 } }
      },
      bytes: [
        0x2A, // id = 42
        0x00, // enabled = 0
      ],
    },
    {
      description: "Data present (enabled=1)",
      value: {
        id: 42,
        settings: { config: { enabled: 1 } },
        data: 0x12345678
      },
      bytes: [
        0x2A, // id = 42
        0x01, // enabled = 1
        0x12, 0x34, 0x56, 0x78, // data
      ],
    },
  ]
});
