// ABOUTME: Tests for computed fields that reference parent struct fields
// ABOUTME: Required for ZIP LocalFileHeader referencing LocalFile.body

import { defineTestSuite } from "../../schema/test-schema.js";

/**
 * Test parent field reference for length_of
 *
 * This is the core pattern needed for ZIP:
 * - LocalFile has a `body` field (byte array)
 * - LocalFileHeader (nested inside LocalFile) has `len_body_compressed`
 * - len_body_compressed needs to reference ../body.length
 */
export const parentFieldReferenceLengthTestSuite = defineTestSuite({
  name: "parent_field_reference_length",
  description: "Computed length_of field referencing parent struct field",
  schema: {
    config: { endianness: "little_endian" },
    types: {
      "Header": {
        sequence: [
          { name: "version", type: "uint16" },
          {
            name: "body_length",
            type: "uint32",
            computed: {
              type: "length_of",
              target: "../body"  // Reference parent's body field
            }
          }
        ]
      },
      "Message": {
        sequence: [
          { name: "header", type: "Header" },
          {
            name: "body",
            type: "array",
            kind: "field_referenced",
            length_field: "header.body_length",
            items: { type: "uint8" }
          }
        ]
      }
    }
  },
  test_type: "Message",
  test_cases: [
    {
      description: "Child struct references parent's body length",
      value: {
        header: {
          version: 1
          // body_length is computed from ../body
        },
        body: [0xAA, 0xBB, 0xCC, 0xDD]
      },
      decoded_value: {
        header: {
          version: 1,
          body_length: 4  // Auto-computed from parent's body
        },
        body: [0xAA, 0xBB, 0xCC, 0xDD]
      },
      bytes: [
        // header.version (uint16 LE)
        1, 0,
        // header.body_length (uint32 LE) - AUTO-COMPUTED
        4, 0, 0, 0,
        // body (4 bytes)
        0xAA, 0xBB, 0xCC, 0xDD
      ]
    },
    {
      description: "Empty body produces zero length",
      value: {
        header: {
          version: 2
        },
        body: []
      },
      decoded_value: {
        header: {
          version: 2,
          body_length: 0
        },
        body: []
      },
      bytes: [
        1, 0,  // version
        0, 0, 0, 0,  // body_length = 0
      ]
    }
  ]
});
