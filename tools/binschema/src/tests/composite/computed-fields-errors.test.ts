// ABOUTME: Error tests for computed fields feature
// ABOUTME: Validates that users cannot provide values for computed fields during encoding

import { defineTestSuite } from "../../schema/test-schema.js";

/**
 * Error: User provides value for computed length field
 *
 * Computed fields are read-only during encoding. If a user tries to provide
 * a value for a computed field, the encoder should throw a clear error.
 */
export const userProvidesComputedLengthFieldTestSuite = defineTestSuite({
  name: "error_user_provides_computed_length",
  description: "User cannot provide value for computed length field",

  schema: {
    config: {
      endianness: "big_endian"
    },
    types: {
      "Message": {
        sequence: [
          {
            name: "len",
            type: "uint8",
            computed: {
              type: "length_of",
              target: "data"
            }
          },
          {
            name: "data",
            type: "array",
            kind: "field_referenced",
            length_field: "len",
            items: { type: "uint8" }
          }
        ]
      }
    }
  },

  test_type: "Message",

  test_cases: [
    {
      description: "User provides computed field 'len' - should error",
      value: {
        len: 5,  // ❌ User trying to set computed field
        data: [1, 2, 3, 4, 5]
      },
      should_error_on_encode: true,
      error_message: "Field 'len' is computed and cannot be set manually"
    },
    {
      description: "User provides wrong computed value - should error",
      value: {
        len: 999,  // ❌ Wrong value for computed field
        data: [1, 2, 3]
      },
      should_error_on_encode: true,
      error_message: "Field 'len' is computed and cannot be set manually"
    }
  ]
});

/**
 * Error: User provides value for computed string length field
 */
export const userProvidesComputedStringLengthTestSuite = defineTestSuite({
  name: "error_user_provides_computed_string_length",
  description: "User cannot provide value for computed string length field",

  schema: {
    config: {
      endianness: "big_endian"
    },
    types: {
      "TextMessage": {
        sequence: [
          {
            name: "len_text",
            type: "uint16",
            computed: {
              type: "length_of",
              target: "text",
              encoding: "utf8"
            }
          },
          {
            name: "text",
            type: "string",
            kind: "field_referenced",
            length_field: "len_text",
            encoding: "utf8"
          }
        ]
      }
    }
  },

  test_type: "TextMessage",

  test_cases: [
    {
      description: "User provides string length - should error",
      value: {
        len_text: 5,  // ❌ Computed field
        text: "Hello"
      },
      should_error_on_encode: true,
      error_message: "Field 'len_text' is computed and cannot be set manually"
    }
  ]
});

/**
 * Error: User provides value for multiple computed fields
 */
export const userProvidesMultipleComputedFieldsTestSuite = defineTestSuite({
  name: "error_user_provides_multiple_computed",
  description: "User cannot provide values for any computed fields",

  schema: {
    config: {
      endianness: "big_endian"
    },
    types: {
      "MultiMessage": {
        sequence: [
          {
            name: "len_name",
            type: "uint8",
            computed: {
              type: "length_of",
              target: "name"
            }
          },
          {
            name: "name",
            type: "string",
            kind: "field_referenced",
            length_field: "len_name",
            encoding: "utf8"
          },
          {
            name: "len_data",
            type: "uint16",
            computed: {
              type: "length_of",
              target: "data"
            }
          },
          {
            name: "data",
            type: "array",
            kind: "field_referenced",
            length_field: "len_data",
            items: { type: "uint8" }
          }
        ]
      }
    }
  },

  test_type: "MultiMessage",

  test_cases: [
    {
      description: "User provides first computed field - should error",
      value: {
        len_name: 3,  // ❌ Computed
        name: "Bob",
        data: [1, 2, 3]
      },
      should_error_on_encode: true,
      error_message: "Field 'len_name' is computed and cannot be set manually"
    },
    {
      description: "User provides second computed field - should error",
      value: {
        name: "Alice",
        len_data: 5,  // ❌ Computed
        data: [1, 2, 3, 4, 5]
      },
      should_error_on_encode: true,
      error_message: "Field 'len_data' is computed and cannot be set manually"
    },
    {
      description: "User provides both computed fields - should error",
      value: {
        len_name: 3,  // ❌ Computed
        name: "Joe",
        len_data: 2,  // ❌ Computed
        data: [10, 20]
      },
      should_error_on_encode: true,
      error_message: "computed and cannot be set manually"  // Should match either field
    }
  ]
});

/**
 * Error: User provides computed field for nested structure
 */
export const userProvidesNestedComputedFieldTestSuite = defineTestSuite({
  name: "error_user_provides_nested_computed",
  description: "User cannot provide computed field in nested structure",

  schema: {
    config: {
      endianness: "big_endian"
    },
    types: {
      "Header": {
        sequence: [
          {
            name: "len_body",
            type: "uint16",
            computed: {
              type: "length_of",
              target: "body"
            }
          },
          {
            name: "body",
            type: "array",
            kind: "field_referenced",
            length_field: "len_body",
            items: { type: "uint8" }
          }
        ]
      },
      "Packet": {
        sequence: [
          {
            name: "header",
            type: "Header"
          },
          {
            name: "footer",
            type: "uint32"
          }
        ]
      }
    }
  },

  test_type: "Packet",

  test_cases: [
    {
      description: "User provides computed field in nested header - should error",
      value: {
        header: {
          len_body: 4,  // ❌ Computed field
          body: [0xAA, 0xBB, 0xCC, 0xDD]
        },
        footer: 0x12345678
      },
      should_error_on_encode: true,
      error_message: "Field 'len_body' is computed and cannot be set manually"
    }
  ]
});
