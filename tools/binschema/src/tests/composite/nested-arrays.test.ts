import { defineTestSuite } from "../../schema/test-schema.js";

/**
 * Test suite for nested arrays (multi-dimensional)
 *
 * Wire format: Arrays of arrays - outer length, then inner lengths and data
 */
export const nestedArrays2DTestSuite = defineTestSuite({
  name: "nested_arrays_2d",
  description: "2D array (array of arrays)",

  schema: {
    config: {
      endianness: "big_endian",
    },
    types: {
      "Matrix": {
        sequence: [
          {
            name: "rows",
            type: "array",
            kind: "length_prefixed",
            length_type: "uint8",
            items: {
              type: "array",
              kind: "length_prefixed",
              length_type: "uint8",
              items: { type: "uint16" }
            }
          }
        ]
      }
    }
  },

  test_type: "Matrix",

  test_cases: [
    {
      description: "Empty 2D array",
      value: { rows: [] },
      bytes: [0x00], // rows.length = 0
    },
    {
      description: "2x3 matrix [[1,2,3], [4,5,6]]",
      value: {
        rows: [
          [1, 2, 3],
          [4, 5, 6]
        ]
      },
      bytes: [
        0x02,       // rows.length = 2
        0x03,       // rows[0].length = 3
        0x00, 0x01, // rows[0][0] = 1
        0x00, 0x02, // rows[0][1] = 2
        0x00, 0x03, // rows[0][2] = 3
        0x03,       // rows[1].length = 3
        0x00, 0x04, // rows[1][0] = 4
        0x00, 0x05, // rows[1][1] = 5
        0x00, 0x06, // rows[1][2] = 6
      ],
    },
    {
      description: "Jagged array [[1], [2,3], [4,5,6]]",
      value: {
        rows: [
          [1],
          [2, 3],
          [4, 5, 6]
        ]
      },
      bytes: [
        0x03,       // rows.length = 3
        0x01,       // rows[0].length = 1
        0x00, 0x01, // rows[0][0] = 1
        0x02,       // rows[1].length = 2
        0x00, 0x02, // rows[1][0] = 2
        0x00, 0x03, // rows[1][1] = 3
        0x03,       // rows[2].length = 3
        0x00, 0x04, // rows[2][0] = 4
        0x00, 0x05, // rows[2][1] = 5
        0x00, 0x06, // rows[2][2] = 6
      ],
    },
    {
      description: "Array with empty inner arrays [[],[1],[]]",
      value: {
        rows: [
          [],
          [42],
          []
        ]
      },
      bytes: [
        0x03,       // rows.length = 3
        0x00,       // rows[0].length = 0
        0x01,       // rows[1].length = 1
        0x00, 0x2A, // rows[1][0] = 42
        0x00,       // rows[2].length = 0
      ],
    },
  ]
});
