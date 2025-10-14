import { defineTestSuite } from "../../schema/test-schema.js";

/**
 * Test suite for length_prefixed_items arrays
 *
 * Wire format: [Array Length] [Item0 Length][Item0 Data] [Item1 Length][Item1 Data] ...
 *
 * This array kind includes a byte-length prefix before each item, enabling
 * efficient network streaming - you can read the item length, then wait for
 * exactly that many bytes before decoding.
 */

/**
 * Basic test: Array of uint32 with per-item lengths
 */
export const lengthPrefixedItemsBasicTestSuite = defineTestSuite({
  name: "length_prefixed_items_basic",
  description: "Array with per-item length prefixes (uint32 items)",

  schema: {
    config: {
      endianness: "big_endian",
    },
    types: {
      "NumberArray": {
        sequence: [
          {
            name: "values",
            type: "array",
            kind: "length_prefixed_items",
            length_type: "uint16",        // Array length prefix
            item_length_type: "uint32",   // Per-item length prefix
            items: { type: "uint32" },
          }
        ]
      }
    }
  },

  test_type: "NumberArray",

  test_cases: [
    {
      description: "Empty array",
      value: { values: [] },
      bytes: [
        0x00, 0x00, // Array length = 0
      ],
    },
    {
      description: "Single uint32 item",
      value: { values: [0x12345678] },
      bytes: [
        0x00, 0x01,             // Array length = 1
        0x00, 0x00, 0x00, 0x04, // Item 0 length = 4 bytes
        0x12, 0x34, 0x56, 0x78, // Item 0 data
      ],
    },
    {
      description: "Three uint32 items",
      value: { values: [0x11111111, 0x22222222, 0x33333333] },
      bytes: [
        0x00, 0x03,             // Array length = 3
        0x00, 0x00, 0x00, 0x04, // Item 0 length = 4 bytes
        0x11, 0x11, 0x11, 0x11, // Item 0 data
        0x00, 0x00, 0x00, 0x04, // Item 1 length = 4 bytes
        0x22, 0x22, 0x22, 0x22, // Item 1 data
        0x00, 0x00, 0x00, 0x04, // Item 2 length = 4 bytes
        0x33, 0x33, 0x33, 0x33, // Item 2 data
      ],
    },
  ]
});

/**
 * Variable-length items: Strings (each string has different byte length)
 */
export const lengthPrefixedItemsStringsTestSuite = defineTestSuite({
  name: "length_prefixed_items_strings",
  description: "Array of strings with per-item length prefixes",

  schema: {
    config: {
      endianness: "big_endian",
    },
    types: {
      "StringType": {
        sequence: [
          {
            name: "value",
            type: "string",
            kind: "length_prefixed",
            length_type: "uint8",
            encoding: "utf8",
          }
        ]
      },
      "StringArray": {
        sequence: [
          {
            name: "strings",
            type: "array",
            kind: "length_prefixed_items",
            length_type: "uint8",
            item_length_type: "uint16",
            items: { type: "StringType" },
          }
        ]
      }
    }
  },

  test_type: "StringArray",

  test_cases: [
    {
      description: "Empty array",
      value: { strings: [] },
      bytes: [0x00], // Array length = 0
    },
    {
      description: "Single string 'hi'",
      value: { strings: [{ value: "hi" }] },
      bytes: [
        0x01,       // Array length = 1
        0x00, 0x03, // Item 0 length = 3 bytes (1 byte length prefix + 2 byte string)
        0x02,       // String length = 2
        0x68, 0x69, // "hi"
      ],
    },
    {
      description: "Two strings of different lengths",
      value: { strings: [{ value: "a" }, { value: "hello" }] },
      bytes: [
        0x02,       // Array length = 2
        0x00, 0x02, // Item 0 length = 2 bytes
        0x01,       // String length = 1
        0x61,       // "a"
        0x00, 0x06, // Item 1 length = 6 bytes
        0x05,       // String length = 5
        0x68, 0x65, 0x6c, 0x6c, 0x6f, // "hello"
      ],
    },
  ]
});

/**
 * Complex nested structures with variable sizes
 */
export const lengthPrefixedItemsStructsTestSuite = defineTestSuite({
  name: "length_prefixed_items_structs",
  description: "Array of complex structs with per-item length prefixes",

  schema: {
    config: {
      endianness: "big_endian",
    },
    types: {
      "Person": {
        sequence: [
          {
            name: "age",
            type: "uint8",
          },
          {
            name: "name",
            type: "string",
            kind: "length_prefixed",
            length_type: "uint8",
            encoding: "utf8",
          }
        ]
      },
      "PersonArray": {
        sequence: [
          {
            name: "people",
            type: "array",
            kind: "length_prefixed_items",
            length_type: "uint16",
            item_length_type: "uint32",
            items: { type: "Person" },
          }
        ]
      }
    }
  },

  test_type: "PersonArray",

  test_cases: [
    {
      description: "Single person",
      value: { people: [{ age: 30, name: "Alice" }] },
      bytes: [
        0x00, 0x01,             // Array length = 1
        0x00, 0x00, 0x00, 0x07, // Item 0 length = 7 bytes
        0x1e,                   // age = 30
        0x05,                   // name length = 5
        0x41, 0x6c, 0x69, 0x63, 0x65, // "Alice"
      ],
    },
    {
      description: "Two people with different name lengths",
      value: {
        people: [
          { age: 25, name: "Bob" },
          { age: 40, name: "Charlotte" }
        ]
      },
      bytes: [
        0x00, 0x02,             // Array length = 2
        0x00, 0x00, 0x00, 0x05, // Item 0 length = 5 bytes
        0x19,                   // age = 25
        0x03,                   // name length = 3
        0x42, 0x6f, 0x62,       // "Bob"
        0x00, 0x00, 0x00, 0x0b, // Item 1 length = 11 bytes
        0x28,                   // age = 40
        0x09,                   // name length = 9
        0x43, 0x68, 0x61, 0x72, 0x6c, 0x6f, 0x74, 0x74, 0x65, // "Charlotte"
      ],
    },
  ]
});

/**
 * Edge case: Large array with many items (verify no overflow)
 */
export const lengthPrefixedItemsLargeArrayTestSuite = defineTestSuite({
  name: "length_prefixed_items_large",
  description: "Large array to test length prefix handling",

  schema: {
    config: {
      endianness: "big_endian",
    },
    types: {
      "ByteArray": {
        sequence: [
          {
            name: "bytes",
            type: "array",
            kind: "length_prefixed_items",
            length_type: "uint16",
            item_length_type: "uint8",  // Small per-item length (uint8 only)
            items: { type: "uint8" },
          }
        ]
      }
    }
  },

  test_type: "ByteArray",

  test_cases: [
    {
      description: "100 uint8 items",
      value: {
        bytes: Array.from({ length: 100 }, (_, i) => i % 256)
      },
      bytes: [
        0x00, 0x64, // Array length = 100
        // Each item: [length=1][data]
        ...Array.from({ length: 100 }, (_, i) => [0x01, i % 256]).flat()
      ],
    },
  ]
});

/**
 * Different item_length_type sizes (uint8, uint16, uint32)
 */
export const lengthPrefixedItemsLengthTypesTestSuite = defineTestSuite({
  name: "length_prefixed_items_length_types",
  description: "Test different item_length_type configurations",

  schema: {
    config: {
      endianness: "big_endian",
    },
    types: {
      "Uint8ItemLength": {
        sequence: [
          {
            name: "values",
            type: "array",
            kind: "length_prefixed_items",
            length_type: "uint8",
            item_length_type: "uint8",
            items: { type: "uint16" },
          }
        ]
      },
      "Uint16ItemLength": {
        sequence: [
          {
            name: "values",
            type: "array",
            kind: "length_prefixed_items",
            length_type: "uint8",
            item_length_type: "uint16",
            items: { type: "uint32" },
          }
        ]
      },
      "Uint32ItemLength": {
        sequence: [
          {
            name: "values",
            type: "array",
            kind: "length_prefixed_items",
            length_type: "uint8",
            item_length_type: "uint32",
            items: { type: "uint64" },
          }
        ]
      }
    }
  },

  test_type: "Uint8ItemLength",

  test_cases: [
    {
      description: "uint8 item length prefix",
      value: { values: [0x1234] },
      bytes: [
        0x01,       // Array length = 1
        0x02,       // Item 0 length = 2 bytes (uint8)
        0x12, 0x34, // Item 0 data
      ],
    },
  ]
});

/**
 * Test with uint16 item length prefix
 */
export const lengthPrefixedItemsUint16LengthTestSuite = defineTestSuite({
  name: "length_prefixed_items_uint16_length",
  description: "Array with uint16 item length prefixes",

  schema: {
    config: {
      endianness: "big_endian",
    },
    types: {
      "Uint16ItemLength": {
        sequence: [
          {
            name: "values",
            type: "array",
            kind: "length_prefixed_items",
            length_type: "uint8",
            item_length_type: "uint16",
            items: { type: "uint32" },
          }
        ]
      }
    }
  },

  test_type: "Uint16ItemLength",

  test_cases: [
    {
      description: "uint16 item length prefix",
      value: { values: [0xAABBCCDD] },
      bytes: [
        0x01,             // Array length = 1
        0x00, 0x04,       // Item 0 length = 4 bytes (uint16)
        0xAA, 0xBB, 0xCC, 0xDD, // Item 0 data
      ],
    },
  ]
});

/**
 * Test with uint64 item length prefix
 */
export const lengthPrefixedItemsUint64LengthTestSuite = defineTestSuite({
  name: "length_prefixed_items_uint64_length",
  description: "Array with uint64 item length prefixes (for very large items)",

  schema: {
    config: {
      endianness: "big_endian",
    },
    types: {
      "Uint64ItemLength": {
        sequence: [
          {
            name: "values",
            type: "array",
            kind: "length_prefixed_items",
            length_type: "uint8",
            item_length_type: "uint64",
            items: { type: "uint32" },
          }
        ]
      }
    }
  },

  test_type: "Uint64ItemLength",

  test_cases: [
    {
      description: "uint64 item length prefix",
      value: { values: [0xFEEDFACE] },
      bytes: [
        0x01,             // Array length = 1
        0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x04, // Item 0 length = 4 bytes (uint64)
        0xFE, 0xED, 0xFA, 0xCE, // Item 0 data
      ],
    },
  ]
});

/**
 * Test item_length_type constraints
 *
 * This test validates that the encoder checks item size against item_length_type max:
 * - uint8: max 255 bytes per item
 * - uint16: max 65,535 bytes per item
 * - uint32: max 4,294,967,295 bytes per item
 * - uint64: max 2^64-1 bytes per item
 */
export const lengthPrefixedItemsSizeConstraintsTestSuite = defineTestSuite({
  name: "length_prefixed_items_size_constraints",
  description: "Validate item size fits within item_length_type",

  schema: {
    config: {
      endianness: "big_endian",
    },
    types: {
      "LargeString": {
        sequence: [
          {
            name: "data",
            type: "string",
            kind: "length_prefixed",
            length_type: "uint16",
            encoding: "utf8",
          }
        ]
      },
      "TinyItemLengthArray": {
        sequence: [
          {
            name: "items",
            type: "array",
            kind: "length_prefixed_items",
            length_type: "uint8",
            item_length_type: "uint8",  // Max 255 bytes per item
            items: { type: "LargeString" },
          }
        ]
      }
    }
  },

  test_type: "TinyItemLengthArray",

  test_cases: [
    {
      description: "Item at max size for uint8 (253 bytes data + 2 bytes length prefix = 255 total)",
      value: { items: [{ data: "a".repeat(253) }] },
      bytes: [
        0x01,       // Array length = 1
        0xFF,       // Item 0 length = 255 bytes (max for uint8)
        0x00, 0xFD, // String length = 253
        ...Array(253).fill(0x61), // "aaa...aaa" (253 times)
      ],
    },
  ]
});

/**
 * Nested arrays (array of arrays)
 */
export const lengthPrefixedItemsNestedTestSuite = defineTestSuite({
  name: "length_prefixed_items_nested",
  description: "Nested arrays with per-item length prefixes",

  schema: {
    config: {
      endianness: "big_endian",
    },
    types: {
      "InnerArray": {
        sequence: [
          {
            name: "values",
            type: "array",
            kind: "length_prefixed",
            length_type: "uint8",
            items: { type: "uint8" },
          }
        ]
      },
      "OuterArray": {
        sequence: [
          {
            name: "arrays",
            type: "array",
            kind: "length_prefixed_items",
            length_type: "uint8",
            item_length_type: "uint16",
            items: { type: "InnerArray" },
          }
        ]
      }
    }
  },

  test_type: "OuterArray",

  test_cases: [
    {
      description: "Array of two inner arrays",
      value: {
        arrays: [
          { values: [1, 2, 3] },
          { values: [4, 5] }
        ]
      },
      bytes: [
        0x02,       // Outer array length = 2
        0x00, 0x04, // Item 0 length = 4 bytes
        0x03,       // Inner array length = 3
        0x01, 0x02, 0x03, // Inner array data
        0x00, 0x03, // Item 1 length = 3 bytes
        0x02,       // Inner array length = 2
        0x04, 0x05, // Inner array data
      ],
    },
  ]
});

/**
 * Optional fields inside array items
 */
export const lengthPrefixedItemsOptionalTestSuite = defineTestSuite({
  name: "length_prefixed_items_optional",
  description: "Array items with optional fields",

  schema: {
    config: {
      endianness: "big_endian",
    },
    types: {
      "Optional<T>": {
        sequence: [
          { name: "present", type: "uint8" },
          { name: "value", type: "T", conditional: "present == 1" },
        ]
      },
      "OptionalItem": {
        sequence: [
          {
            name: "id",
            type: "uint16",
          },
          {
            name: "data",
            type: "Optional<uint32>",
          }
        ]
      },
      "OptionalArray": {
        sequence: [
          {
            name: "items",
            type: "array",
            kind: "length_prefixed_items",
            length_type: "uint8",
            item_length_type: "uint8",
            items: { type: "OptionalItem" },
          }
        ]
      }
    }
  },

  test_type: "OptionalArray",

  test_cases: [
    {
      description: "Item without optional field",
      value: { items: [{ id: 100, data: { present: 0 } }] },
      bytes: [
        0x01,       // Array length = 1
        0x03,       // Item 0 length = 3 bytes
        0x00, 0x64, // id = 100
        0x00,       // data not present
      ],
    },
    {
      description: "Item with optional field",
      value: { items: [{ id: 200, data: { present: 1, value: 0xDEADBEEF } }] },
      bytes: [
        0x01,       // Array length = 1
        0x07,       // Item 0 length = 7 bytes
        0x00, 0xC8, // id = 200
        0x01,       // data present
        0xDE, 0xAD, 0xBE, 0xEF, // data = 0xDEADBEEF
      ],
    },
    {
      description: "Mix of items with and without optional",
      value: {
        items: [
          { id: 1, data: { present: 0 } },
          { id: 2, data: { present: 1, value: 0x12345678 } }
        ]
      },
      bytes: [
        0x02,       // Array length = 2
        0x03,       // Item 0 length = 3 bytes
        0x00, 0x01, // id = 1
        0x00,       // data not present
        0x07,       // Item 1 length = 7 bytes
        0x00, 0x02, // id = 2
        0x01,       // data present
        0x12, 0x34, 0x56, 0x78, // data
      ],
    },
  ]
});
