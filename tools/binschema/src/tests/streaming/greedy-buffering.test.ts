import { defineTestSuite } from "../../schema/test-schema.js";

/**
 * Test suite for greedy buffering with standard array types
 *
 * When streaming network data with arrays that DON'T have per-item length prefixes,
 * we use greedy buffering: read chunks from network, decode as many complete items
 * as possible, yield them, then wait for more data.
 *
 * These tests verify that the decoder can handle partial items at buffer boundaries.
 */

/**
 * Fixed-length arrays - simplest case for greedy buffering
 */
export const greedyBufferingFixedArrayTestSuite = defineTestSuite({
  name: "greedy_buffering_fixed_array",
  description: "Fixed-size array decoded with greedy buffering",

  schema: {
    config: {
      endianness: "big_endian",
    },
    types: {
      "FixedArray": {
        sequence: [
          {
            name: "values",
            type: "array",
            kind: "fixed",
            length: 5,
            items: { type: "uint16" },
          }
        ]
      }
    }
  },

  test_type: "FixedArray",

  test_cases: [
    {
      description: "Complete array in one buffer",
      value: { values: [0x1111, 0x2222, 0x3333, 0x4444, 0x5555] },
      bytes: [
        0x11, 0x11,
        0x22, 0x22,
        0x33, 0x33,
        0x44, 0x44,
        0x55, 0x55,
      ],
    },
  ]
});

/**
 * Length-prefixed arrays (standard, not per-item)
 */
export const greedyBufferingLengthPrefixedTestSuite = defineTestSuite({
  name: "greedy_buffering_length_prefixed",
  description: "Length-prefixed array with greedy buffering",

  schema: {
    config: {
      endianness: "big_endian",
    },
    types: {
      "Message": {
        sequence: [
          {
            name: "id",
            type: "uint32",
          },
          {
            name: "data",
            type: "string",
            kind: "length_prefixed",
            length_type: "uint8",
            encoding: "utf8",
          }
        ]
      },
      "MessageArray": {
        sequence: [
          {
            name: "messages",
            type: "array",
            kind: "length_prefixed",
            length_type: "uint16",
            items: { type: "Message" },
          }
        ]
      }
    }
  },

  test_type: "MessageArray",

  test_cases: [
    {
      description: "Three messages - decoder should handle variable lengths",
      value: {
        messages: [
          { id: 1, data: "hi" },
          { id: 2, data: "hello" },
          { id: 3, data: "x" },
        ]
      },
      bytes: [
        0x00, 0x03,             // Array length = 3
        // Message 0: id=1, data="hi"
        0x00, 0x00, 0x00, 0x01, // id = 1
        0x02,                   // string length = 2
        0x68, 0x69,             // "hi"
        // Message 1: id=2, data="hello"
        0x00, 0x00, 0x00, 0x02, // id = 2
        0x05,                   // string length = 5
        0x68, 0x65, 0x6c, 0x6c, 0x6f, // "hello"
        // Message 2: id=3, data="x"
        0x00, 0x00, 0x00, 0x03, // id = 3
        0x01,                   // string length = 1
        0x78,                   // "x"
      ],
    },
  ]
});

/**
 * Simple primitives - ideal for greedy buffering
 */
export const greedyBufferingPrimitivesTestSuite = defineTestSuite({
  name: "greedy_buffering_primitives",
  description: "Array of primitives with known fixed sizes",

  schema: {
    config: {
      endianness: "big_endian",
    },
    types: {
      "Uint32Array": {
        sequence: [
          {
            name: "values",
            type: "array",
            kind: "length_prefixed",
            length_type: "uint16",
            items: { type: "uint32" },
          }
        ]
      }
    }
  },

  test_type: "Uint32Array",

  test_cases: [
    {
      description: "10 uint32 values - can calculate exact bytes needed",
      value: {
        values: [
          0x11111111, 0x22222222, 0x33333333, 0x44444444, 0x55555555,
          0x66666666, 0x77777777, 0x88888888, 0x99999999, 0xAAAAAAAA,
        ]
      },
      bytes: [
        0x00, 0x0A, // Array length = 10
        0x11, 0x11, 0x11, 0x11,
        0x22, 0x22, 0x22, 0x22,
        0x33, 0x33, 0x33, 0x33,
        0x44, 0x44, 0x44, 0x44,
        0x55, 0x55, 0x55, 0x55,
        0x66, 0x66, 0x66, 0x66,
        0x77, 0x77, 0x77, 0x77,
        0x88, 0x88, 0x88, 0x88,
        0x99, 0x99, 0x99, 0x99,
        0xAA, 0xAA, 0xAA, 0xAA,
      ],
    },
  ]
});

/**
 * Struct with fixed-size fields - predictable byte boundaries
 */
export const greedyBufferingFixedStructsTestSuite = defineTestSuite({
  name: "greedy_buffering_fixed_structs",
  description: "Array of structs with only fixed-size fields",

  schema: {
    config: {
      endianness: "big_endian",
    },
    types: {
      "Point": {
        sequence: [
          {
            name: "x",
            type: "uint16",
          },
          {
            name: "y",
            type: "uint16",
          },
          {
            name: "z",
            type: "uint16",
          }
        ]
      },
      "PointArray": {
        sequence: [
          {
            name: "points",
            type: "array",
            kind: "length_prefixed",
            length_type: "uint8",
            items: { type: "Point" },
          }
        ]
      }
    }
  },

  test_type: "PointArray",

  test_cases: [
    {
      description: "Three points - each point is exactly 6 bytes",
      value: {
        points: [
          { x: 10, y: 20, z: 30 },
          { x: 40, y: 50, z: 60 },
          { x: 70, y: 80, z: 90 },
        ]
      },
      bytes: [
        0x03,       // Array length = 3
        // Point 0
        0x00, 0x0A, // x = 10
        0x00, 0x14, // y = 20
        0x00, 0x1E, // z = 30
        // Point 1
        0x00, 0x28, // x = 40
        0x00, 0x32, // y = 50
        0x00, 0x3C, // z = 60
        // Point 2
        0x00, 0x46, // x = 70
        0x00, 0x50, // y = 80
        0x00, 0x5A, // z = 90
      ],
    },
  ]
});

/**
 * Complex case: Mixed fixed and variable-length fields
 *
 * This is where greedy buffering gets tricky - can't predict item boundaries
 * until you start decoding. Decoder needs to handle "unexpected end of stream"
 * gracefully and wait for more data.
 */
export const greedyBufferingMixedFieldsTestSuite = defineTestSuite({
  name: "greedy_buffering_mixed_fields",
  description: "Array with mixed fixed/variable fields - complex buffering",

  schema: {
    config: {
      endianness: "big_endian",
    },
    types: {
      "Record": {
        sequence: [
          {
            name: "id",
            type: "uint32",
          },
          {
            name: "name",
            type: "string",
            kind: "length_prefixed",
            length_type: "uint8",
            encoding: "utf8",
          },
          {
            name: "score",
            type: "uint16",
          }
        ]
      },
      "RecordArray": {
        sequence: [
          {
            name: "records",
            type: "array",
            kind: "length_prefixed",
            length_type: "uint16",
            items: { type: "Record" },
          }
        ]
      }
    }
  },

  test_type: "RecordArray",

  test_cases: [
    {
      description: "Two records with different string lengths",
      value: {
        records: [
          { id: 100, name: "Alice", score: 95 },
          { id: 200, name: "Bob", score: 87 },
        ]
      },
      bytes: [
        0x00, 0x02,             // Array length = 2
        // Record 0
        0x00, 0x00, 0x00, 0x64, // id = 100
        0x05,                   // name length = 5
        0x41, 0x6c, 0x69, 0x63, 0x65, // "Alice"
        0x00, 0x5F,             // score = 95
        // Record 1
        0x00, 0x00, 0x00, 0xC8, // id = 200
        0x03,                   // name length = 3
        0x42, 0x6f, 0x62,       // "Bob"
        0x00, 0x57,             // score = 87
      ],
    },
  ]
});

/**
 * Edge case: Empty array
 */
export const greedyBufferingEmptyArrayTestSuite = defineTestSuite({
  name: "greedy_buffering_empty",
  description: "Empty array should complete immediately",

  schema: {
    config: {
      endianness: "big_endian",
    },
    types: {
      "EmptyArray": {
        sequence: [
          {
            name: "items",
            type: "array",
            kind: "length_prefixed",
            length_type: "uint16",
            items: { type: "uint32" },
          }
        ]
      }
    }
  },

  test_type: "EmptyArray",

  test_cases: [
    {
      description: "Empty array - no items to decode",
      value: { items: [] },
      bytes: [0x00, 0x00], // Array length = 0
    },
  ]
});

/**
 * Null-terminated arrays - greedy buffering must handle terminator check
 */
export const greedyBufferingNullTerminatedTestSuite = defineTestSuite({
  name: "greedy_buffering_null_terminated",
  description: "Null-terminated array with greedy buffering",

  schema: {
    config: {
      endianness: "big_endian",
    },
    types: {
      "CString": {
        sequence: [
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
      description: "String 'hello' with null terminator",
      value: { chars: [0x68, 0x65, 0x6c, 0x6c, 0x6f] },
      bytes: [0x68, 0x65, 0x6c, 0x6c, 0x6f, 0x00], // "hello\0"
    },
    {
      description: "Empty string (just null terminator)",
      value: { chars: [] },
      bytes: [0x00], // Just null terminator
    },
  ]
});
