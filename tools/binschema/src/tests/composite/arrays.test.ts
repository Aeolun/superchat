import { defineTestSuite } from "../../schema/test-schema.js";

/**
 * Test suite for fixed-size arrays
 *
 * Wire format: Fixed number of elements, no length prefix
 */
export const fixedArrayTestSuite = defineTestSuite({
  name: "fixed_array",
  description: "Fixed-size array of bytes",

  schema: {
    config: {
      endianness: "big_endian",
    },
    types: {
      "FixedByteArray": {
        fields: [
          {
            name: "data",
            type: "array",
            kind: "fixed",
            length: 4,
            items: { type: "uint8" },
          }
        ]
      }
    }
  },

  test_type: "FixedByteArray",

  test_cases: [
    {
      description: "Array of zeros",
      value: { data: [0, 0, 0, 0] },
      bytes: [0x00, 0x00, 0x00, 0x00],
    },
    {
      description: "Array [1, 2, 3, 4]",
      value: { data: [1, 2, 3, 4] },
      bytes: [0x01, 0x02, 0x03, 0x04],
    },
    {
      description: "Array [0xDE, 0xAD, 0xBE, 0xEF]",
      value: { data: [0xDE, 0xAD, 0xBE, 0xEF] },
      bytes: [0xDE, 0xAD, 0xBE, 0xEF],
    },
  ]
});

/**
 * Test suite for length-prefixed arrays
 *
 * Wire format: Length (uint8), then elements
 */
export const lengthPrefixedArrayTestSuite = defineTestSuite({
  name: "length_prefixed_array_uint8",
  description: "Length-prefixed array with uint8 length",

  schema: {
    config: {
      endianness: "big_endian",
    },
    types: {
      "ByteArray": {
        fields: [
          {
            name: "data",
            type: "array",
            kind: "length_prefixed",
            length_type: "uint8",
            items: { type: "uint8" },
          }
        ]
      }
    }
  },

  test_type: "ByteArray",

  test_cases: [
    {
      description: "Empty array",
      value: { data: [] },
      bytes: [0x00], // Length = 0
    },
    {
      description: "Single element [42]",
      value: { data: [42] },
      bytes: [0x01, 0x2A], // Length = 1, data = 0x2A
    },
    {
      description: "Array [1, 2, 3]",
      value: { data: [1, 2, 3] },
      bytes: [0x03, 0x01, 0x02, 0x03], // Length = 3, data
    },
  ]
});

/**
 * Test suite for length-prefixed array with uint16 elements
 *
 * Demonstrates arrays of multi-byte elements
 */
export const lengthPrefixedUint16ArrayTestSuite = defineTestSuite({
  name: "length_prefixed_array_uint16_elements",
  description: "Length-prefixed array of uint16 values",

  schema: {
    config: {
      endianness: "big_endian",
    },
    types: {
      "Uint16Array": {
        fields: [
          {
            name: "values",
            type: "array",
            kind: "length_prefixed",
            length_type: "uint16",
            items: { type: "uint16" },
          }
        ]
      }
    }
  },

  test_type: "Uint16Array",

  test_cases: [
    {
      description: "Empty array",
      value: { values: [] },
      bytes: [0x00, 0x00], // Length = 0 (uint16)
    },
    {
      description: "Array [0x1234, 0x5678]",
      value: { values: [0x1234, 0x5678] },
      bytes: [
        0x00, 0x02, // Length = 2
        0x12, 0x34, // values[0] = 0x1234
        0x56, 0x78, // values[1] = 0x5678
      ],
    },
  ]
});

/**
 * Test suite for null-terminated arrays
 *
 * Wire format: Elements until null/zero terminator
 */
export const nullTerminatedArrayTestSuite = defineTestSuite({
  name: "null_terminated_array",
  description: "Null-terminated array (C-string style)",

  schema: {
    config: {
      endianness: "big_endian",
    },
    types: {
      "CString": {
        fields: [
          {
            name: "chars",
            type: "array",
            kind: "null_terminated",
            items: { type: "uint8" },
          }
        ]
      }
    }
  },

  test_type: "CString",

  test_cases: [
    {
      description: "Empty string",
      value: { chars: [] },
      bytes: [0x00], // Just null terminator
    },
    {
      description: "String 'Hi'",
      value: { chars: [0x48, 0x69] }, // 'H', 'i'
      bytes: [0x48, 0x69, 0x00], // 'H', 'i', null
    },
    {
      description: "String 'ABC'",
      value: { chars: [0x41, 0x42, 0x43] },
      bytes: [0x41, 0x42, 0x43, 0x00], // 'A', 'B', 'C', null
    },
  ]
});
