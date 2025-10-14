import { defineTestSuite } from "../../schema/test-schema.js";

/**
 * Test suite for built-in optional type
 *
 * This tests the first-class 'optional' type in binschema.
 * Users should be able to write:
 *   { name: "maybe_id", type: "optional", value_type: "uint64" }
 * instead of wrapping in Optional<T> generic types.
 */

/**
 * Test 1: Basic optional uint64 with default presence_type (uint8)
 */
export const optionalBuiltinUint64TestSuite = defineTestSuite({
  name: "optional_builtin_uint64",
  description: "Built-in optional type with uint64 value",

  schema: {
    config: {
      endianness: "big_endian",
    },
    types: {
      "OptionalValue": {
        sequence: [
          {
            name: "maybe_id",
            type: "optional",
            value_type: "uint64"
          },
        ]
      }
    }
  },

  test_type: "OptionalValue",

  test_cases: [
    {
      description: "Not present",
      value: {},
      bytes: [0x00], // presence = 0
    },
    {
      description: "Present with value 0",
      value: { maybe_id: 0n },
      bytes: [
        0x01, // presence = 1
        0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, // value = 0
      ],
    },
    {
      description: "Present with value 0x123456789ABCDEF0",
      value: { maybe_id: 0x123456789ABCDEF0n },
      bytes: [
        0x01, // presence = 1
        0x12, 0x34, 0x56, 0x78, 0x9A, 0xBC, 0xDE, 0xF0,
      ],
    },
  ]
});

/**
 * Test 2: Optional with bit-level presence flag
 */
export const optionalBuiltinBitTestSuite = defineTestSuite({
  name: "optional_builtin_bit",
  description: "Built-in optional with 1-bit presence flag",

  schema: {
    config: {
      bit_order: "msb_first",
    },
    types: {
      "CompactMessage": {
        sequence: [
          {
            name: "has_parent",
            type: "optional",
            value_type: "uint8",
            presence_type: "bit",
          },
        ]
      }
    }
  },

  test_type: "CompactMessage",

  test_cases: [
    {
      description: "Not present",
      value: {},
      bits: [0],
    },
    {
      description: "Present with value 42",
      value: { has_parent: 42 },
      bits: [
        1,            // presence = 1
        0,0,1,0,1,0,1,0, // value = 42
      ],
      bytes: [0xAA, 0x00], // 10101010 0_______ (7 unused bits)
    },
  ]
});

/**
 * Test 3: Optional struct
 */
export const optionalBuiltinStructTestSuite = defineTestSuite({
  name: "optional_builtin_struct",
  description: "Built-in optional wrapping a struct",

  schema: {
    types: {
      "Point": {
        sequence: [
          { name: "x", type: "uint16" },
          { name: "y", type: "uint16" },
        ]
      },
      "Message": {
        sequence: [
          { name: "id", type: "uint8" },
          {
            name: "location",
            type: "optional",
            value_type: "Point"
          },
        ]
      }
    }
  },

  test_type: "Message",

  test_cases: [
    {
      description: "Location not present",
      value: { id: 42 },
      bytes: [
        0x2A, // id = 42
        0x00, // location presence = 0
      ],
    },
    {
      description: "Location present (100, 200)",
      value: {
        id: 42,
        location: { x: 100, y: 200 }
      },
      bytes: [
        0x2A, // id = 42
        0x01, // location presence = 1
        0x00, 0x64, // x = 100
        0x00, 0xC8, // y = 200
      ],
    },
  ]
});

/**
 * Test 4: Multiple optionals in same struct
 */
export const optionalBuiltinMultipleTestSuite = defineTestSuite({
  name: "optional_builtin_multiple",
  description: "Multiple built-in optional fields in one struct",

  schema: {
    config: {
      endianness: "big_endian",
    },
    types: {
      "Message": {
        sequence: [
          { name: "channel_id", type: "uint64" },
          { name: "parent_id", type: "optional", value_type: "uint64" },
          { name: "subchannel_id", type: "optional", value_type: "uint64" },
        ]
      }
    }
  },

  test_type: "Message",

  test_cases: [
    {
      description: "Only channel_id (both optionals absent)",
      value: { channel_id: 1n },
      bytes: [
        0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x01, // channel_id = 1
        0x00, // parent_id presence = 0
        0x00, // subchannel_id presence = 0
      ],
    },
    {
      description: "With parent_id, no subchannel",
      value: {
        channel_id: 1n,
        parent_id: 42n,
      },
      bytes: [
        0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x01, // channel_id = 1
        0x01, // parent_id presence = 1
        0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x2A, // parent_id value = 42
        0x00, // subchannel_id presence = 0
      ],
    },
    {
      description: "All fields present",
      value: {
        channel_id: 1n,
        parent_id: 42n,
        subchannel_id: 99n,
      },
      bytes: [
        0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x01, // channel_id = 1
        0x01, // parent_id presence = 1
        0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x2A, // parent_id value = 42
        0x01, // subchannel_id presence = 1
        0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x63, // subchannel_id value = 99
      ],
    },
  ]
});

/**
 * Test 5: Optional string
 */
export const optionalBuiltinStringTestSuite = defineTestSuite({
  name: "optional_builtin_string",
  description: "Built-in optional wrapping a string",

  schema: {
    config: {
      endianness: "big_endian",
    },
    types: {
      "String": {
        type: "string",
        kind: "length_prefixed",
        length_type: "uint8",
        encoding: "utf8",
      },
      "Message": {
        sequence: [
          { name: "id", type: "uint8" },
          {
            name: "name",
            type: "optional",
            value_type: "String"
          },
        ]
      }
    }
  },

  test_type: "Message",

  test_cases: [
    {
      description: "Name not present",
      value: { id: 42 },
      bytes: [0x2A, 0x00],
    },
    {
      description: "Name present",
      value: { id: 42, name: "Alice" },
      bytes: [
        0x2A,       // id = 42
        0x01,       // name presence = 1
        0x05,       // string length = 5
        0x41, 0x6c, 0x69, 0x63, 0x65, // "Alice"
      ],
    },
  ]
});
