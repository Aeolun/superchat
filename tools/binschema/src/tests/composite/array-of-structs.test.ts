import { defineTestSuite } from "../../schema/test-schema.js";

/**
 * Test suite for fixed array of structs
 *
 * Demonstrates arrays where elements are composite types
 */
export const fixedArrayOfStructsTestSuite = defineTestSuite({
  name: "fixed_array_of_structs",
  description: "Fixed-size array of struct elements",

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
      "Triangle": {
        sequence: [
          {
            name: "vertices",
            type: "array",
            kind: "fixed",
            length: 3,
            items: { type: "Point" },
          }
        ]
      }
    }
  },

  test_type: "Triangle",

  test_cases: [
    {
      description: "Triangle at origin",
      value: {
        vertices: [
          { x: 0, y: 0 },
          { x: 100, y: 0 },
          { x: 50, y: 100 },
        ]
      },
      bytes: [
        0x00, 0x00, // vertices[0].x = 0
        0x00, 0x00, // vertices[0].y = 0
        0x00, 0x64, // vertices[1].x = 100
        0x00, 0x00, // vertices[1].y = 0
        0x00, 0x32, // vertices[2].x = 50
        0x00, 0x64, // vertices[2].y = 100
      ],
    },
  ]
});

/**
 * Test suite for length-prefixed array of structs
 *
 * Variable-length array where elements are composite types
 */
export const lengthPrefixedArrayOfStructsTestSuite = defineTestSuite({
  name: "length_prefixed_array_of_structs",
  description: "Variable-length array of struct elements",

  schema: {
    config: {
      endianness: "big_endian",
    },
    types: {
      "Color": {
        sequence: [
          { name: "r", type: "uint8" },
          { name: "g", type: "uint8" },
          { name: "b", type: "uint8" },
        ]
      },
      "Palette": {
        sequence: [
          {
            name: "colors",
            type: "array",
            kind: "length_prefixed",
            length_type: "uint8",
            items: { type: "Color" },
          }
        ]
      }
    }
  },

  test_type: "Palette",

  test_cases: [
    {
      description: "Empty palette",
      value: { colors: [] },
      bytes: [0x00], // length = 0
    },
    {
      description: "Single color (red)",
      value: {
        colors: [
          { r: 255, g: 0, b: 0 },
        ]
      },
      bytes: [
        0x01,       // length = 1
        0xFF, 0x00, 0x00, // red
      ],
    },
    {
      description: "RGB palette",
      value: {
        colors: [
          { r: 255, g: 0, b: 0 },   // red
          { r: 0, g: 255, b: 0 },   // green
          { r: 0, g: 0, b: 255 },   // blue
        ]
      },
      bytes: [
        0x03,             // length = 3
        0xFF, 0x00, 0x00, // red
        0x00, 0xFF, 0x00, // green
        0x00, 0x00, 0xFF, // blue
      ],
    },
  ]
});

/**
 * Test suite for nested arrays of structs
 *
 * Array of structs where each struct contains another array
 */
export const nestedArrayOfStructsTestSuite = defineTestSuite({
  name: "nested_array_of_structs",
  description: "Array of structs containing arrays",

  schema: {
    config: {
      endianness: "big_endian",
    },
    types: {
      "Polygon": {
        sequence: [
          {
            name: "vertices",
            type: "array",
            kind: "length_prefixed",
            length_type: "uint8",
            items: { type: "uint16" }, // Array of x coordinates (simplified)
          }
        ]
      },
      "Scene": {
        sequence: [
          {
            name: "shapes",
            type: "array",
            kind: "length_prefixed",
            length_type: "uint8",
            items: { type: "Polygon" },
          }
        ]
      }
    }
  },

  test_type: "Scene",

  test_cases: [
    {
      description: "Empty scene",
      value: { shapes: [] },
      bytes: [0x00],
    },
    {
      description: "Scene with one triangle",
      value: {
        shapes: [
          {
            vertices: [0, 100, 50],
          },
        ]
      },
      bytes: [
        0x01,       // shapes.length = 1
        0x03,       // shapes[0].vertices.length = 3
        0x00, 0x00, // vertices[0] = 0
        0x00, 0x64, // vertices[1] = 100
        0x00, 0x32, // vertices[2] = 50
      ],
    },
    {
      description: "Scene with two shapes",
      value: {
        shapes: [
          { vertices: [10, 20] },      // Line
          { vertices: [0, 100, 50] },  // Triangle
        ]
      },
      bytes: [
        0x02,       // shapes.length = 2
        0x02,       // shapes[0].vertices.length = 2
        0x00, 0x0A, // vertices[0] = 10
        0x00, 0x14, // vertices[1] = 20
        0x03,       // shapes[1].vertices.length = 3
        0x00, 0x00, // vertices[0] = 0
        0x00, 0x64, // vertices[1] = 100
        0x00, 0x32, // vertices[2] = 50
      ],
    },
  ]
});

/**
 * Test suite for array of structs with optional fields
 *
 * Demonstrates complex composition: arrays + structs + optionals
 */
export const arrayOfStructsWithOptionalsTestSuite = defineTestSuite({
  name: "array_of_structs_with_optionals",
  description: "Array of structs containing optional fields",

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
      "Person": {
        sequence: [
          { name: "age", type: "uint8" },
          { name: "height", type: "Optional<uint16>" }, // Optional height in cm
        ]
      },
      "Group": {
        sequence: [
          {
            name: "members",
            type: "array",
            kind: "length_prefixed",
            length_type: "uint8",
            items: { type: "Person" },
          }
        ]
      }
    }
  },

  test_type: "Group",

  test_cases: [
    {
      description: "Group with one person (no height)",
      value: {
        members: [
          { age: 25, height: { present: 0 } },
        ]
      },
      bytes: [
        0x01, // members.length = 1
        0x19, // age = 25
        0x00, // height.present = 0
      ],
    },
    {
      description: "Group with two people (one with height)",
      value: {
        members: [
          { age: 25, height: { present: 0 } },
          { age: 30, height: { present: 1, value: 175 } },
        ]
      },
      bytes: [
        0x02, // members.length = 2
        0x19, // members[0].age = 25
        0x00, // members[0].height.present = 0
        0x1E, // members[1].age = 30
        0x01, // members[1].height.present = 1
        0x00, 0xAF, // members[1].height.value = 175
      ],
    },
  ]
});
