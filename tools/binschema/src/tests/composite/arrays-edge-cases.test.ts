import { defineTestSuite } from "../../schema/test-schema.js";

/**
 * Test suite for empty arrays with all length type sizes
 *
 * Ensures correct encoding of length prefixes for all integer sizes
 */
export const emptyArraysAllTypesTestSuite = defineTestSuite({
  name: "empty_arrays_all_length_types",
  description: "Empty arrays with uint8/16/32/64 length prefixes",

  schema: {
    config: {
      endianness: "big_endian",
    },
    types: {
      "EmptyUint8Array": {
        fields: [{
          name: "data",
          type: "array",
          kind: "length_prefixed",
          length_type: "uint8",
          items: { type: "uint8" }
        }]
      },
      "EmptyUint16Array": {
        fields: [{
          name: "data",
          type: "array",
          kind: "length_prefixed",
          length_type: "uint16",
          items: { type: "uint8" }
        }]
      },
      "EmptyUint32Array": {
        fields: [{
          name: "data",
          type: "array",
          kind: "length_prefixed",
          length_type: "uint32",
          items: { type: "uint8" }
        }]
      },
      "EmptyUint64Array": {
        fields: [{
          name: "data",
          type: "array",
          kind: "length_prefixed",
          length_type: "uint64",
          items: { type: "uint8" }
        }]
      }
    }
  },

  test_type: "EmptyUint8Array",

  test_cases: [
    {
      description: "Empty array with uint8 length",
      value: { data: [] },
      bytes: [0x00],
    },
  ]
});

export const emptyUint16ArrayTestSuite = defineTestSuite({
  name: "empty_uint16_array",
  description: "Empty array with uint16 length prefix",

  schema: {
    config: {
      endianness: "big_endian",
    },
    types: {
      "EmptyUint16Array": {
        fields: [{
          name: "data",
          type: "array",
          kind: "length_prefixed",
          length_type: "uint16",
          items: { type: "uint8" }
        }]
      }
    }
  },

  test_type: "EmptyUint16Array",

  test_cases: [
    {
      description: "Empty array with uint16 length",
      value: { data: [] },
      bytes: [0x00, 0x00],
    },
  ]
});

export const emptyUint32ArrayTestSuite = defineTestSuite({
  name: "empty_uint32_array",
  description: "Empty array with uint32 length prefix",

  schema: {
    config: {
      endianness: "big_endian",
    },
    types: {
      "EmptyUint32Array": {
        fields: [{
          name: "data",
          type: "array",
          kind: "length_prefixed",
          length_type: "uint32",
          items: { type: "uint8" }
        }]
      }
    }
  },

  test_type: "EmptyUint32Array",

  test_cases: [
    {
      description: "Empty array with uint32 length",
      value: { data: [] },
      bytes: [0x00, 0x00, 0x00, 0x00],
    },
  ]
});

export const emptyUint64ArrayTestSuite = defineTestSuite({
  name: "empty_uint64_array",
  description: "Empty array with uint64 length prefix",

  schema: {
    config: {
      endianness: "big_endian",
    },
    types: {
      "EmptyUint64Array": {
        fields: [{
          name: "data",
          type: "array",
          kind: "length_prefixed",
          length_type: "uint64",
          items: { type: "uint8" }
        }]
      }
    }
  },

  test_type: "EmptyUint64Array",

  test_cases: [
    {
      description: "Empty array with uint64 length",
      value: { data: [] },
      bytes: [0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00],
    },
  ]
});

/**
 * Test suite for large array length values
 *
 * Tests that uint64 length prefixes work correctly (without allocating huge arrays)
 */
export const largeArrayLengthTestSuite = defineTestSuite({
  name: "large_array_length_uint64",
  description: "Array with uint64 length prefix and realistic size",

  schema: {
    config: {
      endianness: "big_endian",
    },
    types: {
      "LargeArray": {
        fields: [{
          name: "data",
          type: "array",
          kind: "length_prefixed",
          length_type: "uint64",
          items: { type: "uint8" }
        }]
      }
    }
  },

  test_type: "LargeArray",

  test_cases: [
    {
      description: "Small array with uint64 length (3 elements)",
      value: { data: [1, 2, 3] },
      bytes: [
        0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x03, // length = 3 (as uint64)
        0x01, 0x02, 0x03, // data
      ],
    },
    {
      description: "Array with length 255 (max uint8) as uint64",
      value: { data: new Array(255).fill(42) },
      bytes: [
        0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0xFF, // length = 255
        ...new Array(255).fill(0x2A), // 255 x 0x2A
      ],
    },
  ]
});
