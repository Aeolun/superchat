import { defineTestSuite } from "../../schema/test-schema.js";

/**
 * Test suite for simple struct (multiple fields)
 *
 * Demonstrates basic field composition
 */
export const simpleStructTestSuite = defineTestSuite({
  name: "simple_struct",
  description: "Struct with multiple primitive fields",

  schema: {
    config: {
      endianness: "big_endian",
    },
    types: {
      "Point": {
        fields: [
          { name: "x", type: "uint16" },
          { name: "y", type: "uint16" },
        ]
      }
    }
  },

  test_type: "Point",

  test_cases: [
    {
      description: "Origin (0, 0)",
      value: { x: 0, y: 0 },
      bytes: [0x00, 0x00, 0x00, 0x00],
    },
    {
      description: "Point (10, 20)",
      value: { x: 10, y: 20 },
      bytes: [0x00, 0x0A, 0x00, 0x14],
    },
    {
      description: "Point (0x1234, 0x5678)",
      value: { x: 0x1234, y: 0x5678 },
      bytes: [0x12, 0x34, 0x56, 0x78],
    },
  ]
});

/**
 * Test suite for struct with mixed field sizes
 *
 * Demonstrates different primitive types in one struct
 */
export const mixedFieldsStructTestSuite = defineTestSuite({
  name: "mixed_fields_struct",
  description: "Struct with uint8, uint16, uint32 fields",

  schema: {
    config: {
      endianness: "big_endian",
    },
    types: {
      "Header": {
        fields: [
          { name: "version", type: "uint8" },
          { name: "flags", type: "uint8" },
          { name: "length", type: "uint32" },
        ]
      }
    }
  },

  test_type: "Header",

  test_cases: [
    {
      description: "Version 1, flags 0, length 0",
      value: { version: 1, flags: 0, length: 0 },
      bytes: [0x01, 0x00, 0x00, 0x00, 0x00, 0x00],
    },
    {
      description: "Version 2, flags 0xFF, length 1024",
      value: { version: 2, flags: 0xFF, length: 1024 },
      bytes: [0x02, 0xFF, 0x00, 0x00, 0x04, 0x00],
    },
  ]
});
