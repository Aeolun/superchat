// ABOUTME: Test nested object encoding/decoding with different endianness configurations
// ABOUTME: Verifies that nested types respect the global endianness setting

import { defineTestSuite } from "../../schema/test-schema.js";

/**
 * Test that nested objects are decoded with correct endianness.
 * This test has a parent type with a nested object field.
 * The schema uses little_endian, so all fields should be decoded as little-endian.
 */
export const nestedObjectLittleEndianTestSuite = defineTestSuite({
  name: "nested_object_little_endian",
  description: "Nested object with little-endian encoding",
  schema: {
    config: { endianness: "little_endian" },
    types: {
      "Container": {
        sequence: [
          { "name": "header", "type": "Header" },
          { "name": "magic", "type": "uint32" }
        ]
      },
      "Header": {
        sequence: [
          { "name": "version", "type": "uint16" },
          { "name": "flags", "type": "uint32" }
        ]
      }
    }
  },
  test_type: "Container",
  test_cases: [
    {
      description: "Nested object respects little-endian",
      bytes: [
        // Header.version = 0x1234 in little-endian = [0x34, 0x12]
        0x34, 0x12,
        // Header.flags = 0x12345678 in little-endian = [0x78, 0x56, 0x34, 0x12]
        0x78, 0x56, 0x34, 0x12,
        // Container.magic = 0xABCDEF00 in little-endian = [0x00, 0xEF, 0xCD, 0xAB]
        0x00, 0xEF, 0xCD, 0xAB
      ],
      value: {
        header: {
          version: 0x1234,
          flags: 0x12345678
        },
        magic: 0xABCDEF00
      }
    }
  ]
});

/**
 * Test that nested objects are decoded with correct endianness when using big-endian.
 */
export const nestedObjectBigEndianTestSuite = defineTestSuite({
  name: "nested_object_big_endian",
  description: "Nested object with big-endian encoding",
  schema: {
    config: { endianness: "big_endian" },
    types: {
      "Container": {
        sequence: [
          { "name": "header", "type": "Header" },
          { "name": "magic", "type": "uint32" }
        ]
      },
      "Header": {
        sequence: [
          { "name": "version", "type": "uint16" },
          { "name": "flags", "type": "uint32" }
        ]
      }
    }
  },
  test_type: "Container",
  test_cases: [
    {
      description: "Nested object respects big-endian",
      bytes: [
        // Header.version = 0x1234 in big-endian = [0x12, 0x34]
        0x12, 0x34,
        // Header.flags = 0x12345678 in big-endian = [0x12, 0x34, 0x56, 0x78]
        0x12, 0x34, 0x56, 0x78,
        // Container.magic = 0xABCDEF00 in big-endian = [0xAB, 0xCD, 0xEF, 0x00]
        0xAB, 0xCD, 0xEF, 0x00
      ],
      value: {
        header: {
          version: 0x1234,
          flags: 0x12345678
        },
        magic: 0xABCDEF00
      }
    }
  ]
});

/**
 * Test nested objects in arrays with little-endian.
 */
export const nestedObjectArrayLittleEndianTestSuite = defineTestSuite({
  name: "nested_object_array_little_endian",
  description: "Array of nested objects with little-endian encoding",
  schema: {
    config: { endianness: "little_endian" },
    types: {
      "Container": {
        sequence: [
          { "name": "count", "type": "uint8" },
          {
            "name": "items",
            "type": "array",
            "kind": "field_referenced",
            "length_field": "count",
            "items": { "type": "Item" }
          }
        ]
      },
      "Item": {
        sequence: [
          { "name": "id", "type": "uint16" },
          { "name": "value", "type": "uint32" }
        ]
      }
    }
  },
  test_type: "Container",
  test_cases: [
    {
      description: "Array items respect little-endian",
      bytes: [
        // count = 2
        0x02,
        // Item[0]: id = 0x1234, value = 0x12345678 (both little-endian)
        0x34, 0x12,
        0x78, 0x56, 0x34, 0x12,
        // Item[1]: id = 0xABCD, value = 0xABCDEF00 (both little-endian)
        0xCD, 0xAB,
        0x00, 0xEF, 0xCD, 0xAB
      ],
      value: {
        count: 2,
        items: [
          { id: 0x1234, value: 0x12345678 },
          { id: 0xABCD, value: 0xABCDEF00 }
        ]
      }
    }
  ]
});
