import { defineTestSuite } from "../../schema/test-schema.js";

/**
 * Test suite for field-referenced arrays
 *
 * Wire format: Length comes from a field decoded earlier in the struct
 * Example: DNS messages where array length is in header field (qdcount, ancount, etc.)
 */

/**
 * Simple field-referenced array test
 *
 * Struct has: count (uint8), then data array with length from count
 */
export const simpleFieldReferencedArrayTestSuite = defineTestSuite({
  name: "simple_field_referenced_array",
  description: "Array length from simple field reference",

  schema: {
    config: {
      endianness: "big_endian",
    },
    types: {
      "Message": {
        sequence: [
          {
            name: "count",
            type: "uint8",
            description: "Number of items"
          },
          {
            name: "items",
            type: "array",
            kind: "field_referenced",
            length_field: "count",
            items: { type: "uint8" },
            description: "Array with length from count field"
          }
        ]
      }
    }
  },

  test_type: "Message",

  test_cases: [
    {
      description: "Empty array (count=0)",
      value: {
        count: 0,
        items: []
      },
      bytes: [0x00], // count=0, no items
    },
    {
      description: "Single item (count=1)",
      value: {
        count: 1,
        items: [42]
      },
      bytes: [0x01, 0x2A], // count=1, item=42
    },
    {
      description: "Three items (count=3)",
      value: {
        count: 3,
        items: [10, 20, 30]
      },
      bytes: [0x03, 0x0A, 0x14, 0x1E], // count=3, items
    },
    {
      description: "Five items",
      value: {
        count: 5,
        items: [1, 2, 3, 4, 5]
      },
      bytes: [0x05, 0x01, 0x02, 0x03, 0x04, 0x05],
    },
  ]
});

/**
 * Field-referenced array with uint16 elements
 *
 * Tests that length field controls array element count, not byte count
 */
export const fieldReferencedUint16ArrayTestSuite = defineTestSuite({
  name: "field_referenced_uint16_array",
  description: "Array of uint16 with length from field",

  schema: {
    config: {
      endianness: "big_endian",
    },
    types: {
      "Uint16Message": {
        sequence: [
          {
            name: "num_values",
            type: "uint16",
            description: "Number of uint16 values"
          },
          {
            name: "values",
            type: "array",
            kind: "field_referenced",
            length_field: "num_values",
            items: { type: "uint16" },
            description: "Array of uint16 values"
          }
        ]
      }
    }
  },

  test_type: "Uint16Message",

  test_cases: [
    {
      description: "Empty array",
      value: {
        num_values: 0,
        values: []
      },
      bytes: [0x00, 0x00], // num_values=0 (uint16)
    },
    {
      description: "Two values",
      value: {
        num_values: 2,
        values: [0x1234, 0x5678]
      },
      bytes: [
        0x00, 0x02, // num_values=2
        0x12, 0x34, // values[0]=0x1234
        0x56, 0x78, // values[1]=0x5678
      ],
    },
  ]
});

/**
 * Multiple field-referenced arrays in same struct
 *
 * Demonstrates that each array can reference a different length field
 */
export const multipleFieldReferencedArraysTestSuite = defineTestSuite({
  name: "multiple_field_referenced_arrays",
  description: "Multiple arrays with different length fields",

  schema: {
    config: {
      endianness: "big_endian",
    },
    types: {
      "MultiArrayMessage": {
        sequence: [
          {
            name: "count_a",
            type: "uint8",
            description: "Length of array A"
          },
          {
            name: "count_b",
            type: "uint8",
            description: "Length of array B"
          },
          {
            name: "array_a",
            type: "array",
            kind: "field_referenced",
            length_field: "count_a",
            items: { type: "uint8" },
          },
          {
            name: "array_b",
            type: "array",
            kind: "field_referenced",
            length_field: "count_b",
            items: { type: "uint8" },
          }
        ]
      }
    }
  },

  test_type: "MultiArrayMessage",

  test_cases: [
    {
      description: "Both arrays empty",
      value: {
        count_a: 0,
        count_b: 0,
        array_a: [],
        array_b: []
      },
      bytes: [0x00, 0x00], // count_a=0, count_b=0
    },
    {
      description: "Different sized arrays",
      value: {
        count_a: 2,
        count_b: 3,
        array_a: [10, 20],
        array_b: [30, 40, 50]
      },
      bytes: [
        0x02, // count_a=2
        0x03, // count_b=3
        0x0A, 0x14, // array_a: [10, 20]
        0x1E, 0x28, 0x32, // array_b: [30, 40, 50]
      ],
    },
  ]
});

/**
 * Field-referenced array with bitfield sub-field reference
 *
 * Demonstrates dot notation: length_field can reference bitfield sub-field
 * Example: DNS uses flags.opcode, we test with flags.count
 */
export const bitfieldSubFieldReferencedArrayTestSuite = defineTestSuite({
  name: "bitfield_subfield_referenced_array",
  description: "Array length from bitfield sub-field (dot notation)",

  schema: {
    config: {
      endianness: "big_endian",
    },
    types: {
      "BitfieldMessage": {
        sequence: [
          {
            name: "flags",
            type: "bitfield",
            size: 16,
            fields: [
              {
                name: "version",
                offset: 0,
                size: 4,
                description: "Version bits"
              },
              {
                name: "count",
                offset: 4,
                size: 4,
                description: "Array count (0-15)"
              },
              {
                name: "reserved",
                offset: 8,
                size: 8,
                description: "Reserved bits"
              }
            ]
          },
          {
            name: "items",
            type: "array",
            kind: "field_referenced",
            length_field: "flags.count",
            items: { type: "uint8" },
            description: "Array with length from flags.count"
          }
        ]
      }
    }
  },

  test_type: "BitfieldMessage",

  test_cases: [
    {
      description: "Zero items (flags.count=0)",
      value: {
        flags: {
          version: 1,
          count: 0,
          reserved: 0
        },
        items: []
      },
      bytes: [
        0x10, 0x00, // flags: version=1 (bits 0-3), count=0 (bits 4-7), reserved=0 (bits 8-15)
      ],
    },
    {
      description: "Three items (flags.count=3)",
      value: {
        flags: {
          version: 1,
          count: 3,
          reserved: 0
        },
        items: [0xAA, 0xBB, 0xCC]
      },
      bytes: [
        0x13, 0x00, // flags: version=1 (bits 0-3), count=3 (bits 4-7), reserved=0 (bits 8-15)
        0xAA, 0xBB, 0xCC, // items
      ],
    },
    {
      description: "Maximum count (flags.count=15)",
      value: {
        flags: {
          version: 2,
          count: 15,
          reserved: 0xFF
        },
        items: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15]
      },
      bytes: [
        0x2F, 0xFF, // flags: version=2 (bits 0-3), count=15 (bits 4-7), reserved=0xFF (bits 8-15)
        0x01, 0x02, 0x03, 0x04, 0x05, 0x06, 0x07, 0x08, 0x09, 0x0A, 0x0B, 0x0C, 0x0D, 0x0E, 0x0F,
      ],
    },
  ]
});

/**
 * Field-referenced array of structs
 *
 * Tests that complex element types work with field-referenced arrays
 */
export const fieldReferencedStructArrayTestSuite = defineTestSuite({
  name: "field_referenced_struct_array",
  description: "Array of structs with length from field",

  schema: {
    config: {
      endianness: "big_endian",
    },
    types: {
      "Point": {
        sequence: [
          { name: "x", type: "uint16" },
          { name: "y", type: "uint16" },
        ]
      },
      "PointList": {
        sequence: [
          {
            name: "num_points",
            type: "uint8",
            description: "Number of points"
          },
          {
            name: "points",
            type: "array",
            kind: "field_referenced",
            length_field: "num_points",
            items: { type: "Point" },
            description: "Array of points"
          }
        ]
      }
    }
  },

  test_type: "PointList",

  test_cases: [
    {
      description: "Empty point list",
      value: {
        num_points: 0,
        points: []
      },
      bytes: [0x00], // num_points=0
    },
    {
      description: "Two points",
      value: {
        num_points: 2,
        points: [
          { x: 10, y: 20 },
          { x: 30, y: 40 }
        ]
      },
      bytes: [
        0x02, // num_points=2
        0x00, 0x0A, 0x00, 0x14, // Point{x:10, y:20}
        0x00, 0x1E, 0x00, 0x28, // Point{x:30, y:40}
      ],
    },
  ]
});
