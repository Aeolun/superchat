import { defineTestSuite } from "../../schema/test-schema.js";

/**
 * Test suite for optional fields
 *
 * Wire format: presence byte (0/1), then value if present
 * This is the pattern used in SuperChat protocol
 */
export const optionalUint64TestSuite = defineTestSuite({
  name: "optional_uint64",
  description: "Optional uint64 with presence byte",

  schema: {
    config: {
      endianness: "big_endian",
    },
    types: {
      "Optional<T>": {
        description: "Generic optional type",
        fields: [
          { name: "present", type: "uint8" },
          { name: "value", type: "T", conditional: "present == 1" },
        ]
      },
      "OptionalValue": {
        fields: [
          { name: "maybe_id", type: "Optional<uint64>" },
        ]
      }
    }
  },

  test_type: "OptionalValue",

  test_cases: [
    {
      description: "Not present (null)",
      value: { maybe_id: { present: 0 } },
      bytes: [0x00], // present = 0, no value follows
    },
    {
      description: "Present with value 0",
      value: { maybe_id: { present: 1, value: 0n } },
      bytes: [
        0x01, // present = 1
        0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, // value = 0
      ],
    },
    {
      description: "Present with value 0x123456789ABCDEF0",
      value: { maybe_id: { present: 1, value: 0x123456789ABCDEF0n } },
      bytes: [
        0x01, // present = 1
        0x12, 0x34, 0x56, 0x78, 0x9A, 0xBC, 0xDE, 0xF0, // value
      ],
    },
  ]
});

/**
 * Test suite for struct with multiple optional fields
 *
 * Demonstrates multiple optionals in one struct
 */
export const multipleOptionalsTestSuite = defineTestSuite({
  name: "multiple_optionals",
  description: "Struct with multiple optional fields",

  schema: {
    config: {
      endianness: "big_endian",
    },
    types: {
      "Optional<T>": {
        fields: [
          { name: "present", type: "uint8" },
          { name: "value", type: "T", conditional: "present == 1" },
        ]
      },
      "Message": {
        fields: [
          { name: "channel_id", type: "uint64" },
          { name: "parent_id", type: "Optional<uint64>" },
          { name: "subchannel_id", type: "Optional<uint64>" },
        ]
      }
    }
  },

  test_type: "Message",

  test_cases: [
    {
      description: "Only channel_id (both optionals absent)",
      value: {
        channel_id: 1n,
        parent_id: { present: 0 },
        subchannel_id: { present: 0 },
      },
      bytes: [
        0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x01, // channel_id = 1
        0x00, // parent_id.present = 0
        0x00, // subchannel_id.present = 0
      ],
    },
    {
      description: "With parent_id, no subchannel",
      value: {
        channel_id: 1n,
        parent_id: { present: 1, value: 42n },
        subchannel_id: { present: 0 },
      },
      bytes: [
        0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x01, // channel_id = 1
        0x01, // parent_id.present = 1
        0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x2A, // parent_id.value = 42
        0x00, // subchannel_id.present = 0
      ],
    },
    {
      description: "All fields present",
      value: {
        channel_id: 1n,
        parent_id: { present: 1, value: 42n },
        subchannel_id: { present: 1, value: 99n },
      },
      bytes: [
        0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x01, // channel_id = 1
        0x01, // parent_id.present = 1
        0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x2A, // parent_id.value = 42
        0x01, // subchannel_id.present = 1
        0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x63, // subchannel_id.value = 99
      ],
    },
  ]
});

/**
 * Test suite for optional with bit-level presence flag
 *
 * Demonstrates space-efficient optional (1 bit instead of 1 byte)
 */
export const optionalWithBitFlagTestSuite = defineTestSuite({
  name: "optional_bit_flag",
  description: "Optional field with 1-bit presence flag",

  schema: {
    config: {
      bit_order: "msb_first",
    },
    types: {
      "CompactOptional<T>": {
        fields: [
          { name: "present", type: "bit", size: 1 },
          { name: "value", type: "T", conditional: "present == 1" },
        ]
      },
      "CompactMessage": {
        fields: [
          { name: "has_parent", type: "CompactOptional<uint8>" },
        ]
      }
    }
  },

  test_type: "CompactMessage",

  test_cases: [
    {
      description: "Not present",
      value: { has_parent: { present: 0 } },
      bits: [0], // Just the presence bit
    },
    {
      description: "Present with value 42",
      value: { has_parent: { present: 1, value: 42 } },
      bits: [
        1,            // present = 1
        0,0,1,0,1,0,1,0, // value = 42 = 0b00101010
      ],
      bytes: [0xAA, 0x00], // 10101010 0_______ (7 unused bits)
    },
  ]
});
