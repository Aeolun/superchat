import { defineTestSuite } from "../../schema/test-schema.js";

/**
 * Test suite for nested structs (type references)
 *
 * Demonstrates composition via type references
 */
export const nestedStructTestSuite = defineTestSuite({
  name: "nested_struct",
  description: "Struct containing other struct types",

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
      },
      "Rectangle": {
        fields: [
          { name: "top_left", type: "Point" },     // Type reference
          { name: "bottom_right", type: "Point" }, // Type reference
        ]
      }
    }
  },

  test_type: "Rectangle",

  test_cases: [
    {
      description: "Rectangle at origin",
      value: {
        top_left: { x: 0, y: 0 },
        bottom_right: { x: 100, y: 50 },
      },
      bytes: [
        0x00, 0x00, // top_left.x = 0
        0x00, 0x00, // top_left.y = 0
        0x00, 0x64, // bottom_right.x = 100
        0x00, 0x32, // bottom_right.y = 50
      ],
    },
    {
      description: "Rectangle (10,20) to (30,40)",
      value: {
        top_left: { x: 10, y: 20 },
        bottom_right: { x: 30, y: 40 },
      },
      bytes: [
        0x00, 0x0A, // top_left.x = 10
        0x00, 0x14, // top_left.y = 20
        0x00, 0x1E, // bottom_right.x = 30
        0x00, 0x28, // bottom_right.y = 40
      ],
    },
  ]
});

/**
 * Test suite for deeply nested structs
 *
 * Demonstrates multiple levels of nesting
 */
export const deeplyNestedStructTestSuite = defineTestSuite({
  name: "deeply_nested_struct",
  description: "Multi-level struct nesting",

  schema: {
    config: {
      endianness: "big_endian",
    },
    types: {
      "Color": {
        fields: [
          { name: "r", type: "uint8" },
          { name: "g", type: "uint8" },
          { name: "b", type: "uint8" },
        ]
      },
      "Pixel": {
        fields: [
          { name: "x", type: "uint16" },
          { name: "y", type: "uint16" },
          { name: "color", type: "Color" },
        ]
      }
    }
  },

  test_type: "Pixel",

  test_cases: [
    {
      description: "Red pixel at (10, 20)",
      value: {
        x: 10,
        y: 20,
        color: { r: 255, g: 0, b: 0 },
      },
      bytes: [
        0x00, 0x0A, // x = 10
        0x00, 0x14, // y = 20
        0xFF,       // r = 255
        0x00,       // g = 0
        0x00,       // b = 0
      ],
    },
  ]
});
