// ABOUTME: Error handling tests for position-based field parsing
// ABOUTME: Validates proper error messages and boundary conditions

import { defineTestSuite } from "../../schema/test-schema.js";

/**
 * Position beyond EOF - should throw error
 */
export const positionBeyondEOF = defineTestSuite({
  name: "position_beyond_eof",
  description: "Position field pointing beyond EOF should error",
  schema: {
    config: { endianness: "big_endian" },
    types: {
      "BadFile": {
        sequence: [
          { name: "bad_offset", type: "uint32" }
        ],
        instances: [
          {
            name: "data",
            type: "DataBlock",
            position: "bad_offset"
          }
        ]
      },
      "DataBlock": {
        sequence: [
          { name: "value", type: "uint16" }
        ]
      }
    }
  },
  test_type: "BadFile",
  test_cases: [
    {
      description: "Position beyond EOF should throw",
      bytes: [
        0x00, 0x00, 0x00, 0xFF  // bad_offset = 255 (but file is only 4 bytes)
      ],
      should_error: true,
      error_message: "Position 255 exceeds file size 4"
    }
  ]
});

/**
 * Position + size exceeds EOF
 */
export const positionPlusSizeExceedsEOF = defineTestSuite({
  name: "position_plus_size_exceeds_eof",
  description: "Position + size extending beyond EOF should error",
  schema: {
    config: { endianness: "big_endian" },
    types: {
      "PartialFile": {
        sequence: [
          { name: "data_offset", type: "uint32" }
        ],
        instances: [
          {
            name: "data",
            type: "LargeBlock",
            position: "data_offset"
          }
        ]
      },
      "LargeBlock": {
        sequence: [
          { name: "a", type: "uint32" },
          { name: "b", type: "uint32" },
          { name: "c", type: "uint32" }  // Needs 12 bytes total
        ]
      }
    }
  },
  test_type: "PartialFile",
  test_cases: [
    {
      description: "Position valid but not enough bytes remain",
      bytes: [
        0x00, 0x00, 0x00, 0x04,  // data_offset = 4
        0x12, 0x34              // Only 2 bytes available (need 12)
      ],
      should_error: true,
      error_message: "Insufficient bytes: position 4 + size 12 exceeds file size 6"
    }
  ]
});

/**
 * Negative position beyond start of file
 */
export const negativePositionBeyondStart = defineTestSuite({
  name: "negative_position_beyond_start",
  description: "Negative position extending before file start should error",
  schema: {
    config: { endianness: "big_endian" },
    types: {
      "TinyFile": {
        sequence: [
          { name: "magic", type: "uint16" }
        ],
        instances: [
          {
            name: "footer",
            type: "Footer",
            position: -100,  // File is only 2 bytes!
            size: 4
          }
        ]
      },
      "Footer": {
        sequence: [
          { name: "value", type: "uint32" }
        ]
      }
    }
  },
  test_type: "TinyFile",
  test_cases: [
    {
      description: "Negative position beyond file start",
      bytes: [
        0x12, 0x34  // File is only 2 bytes
      ],
      should_error: true,
      error_message: "Negative position -100 exceeds file size 2 (resolves to -98)"
    }
  ]
});

/**
 * Invalid field reference in position expression
 */
export const invalidFieldReference = defineTestSuite({
  name: "invalid_field_reference",
  description: "Position referencing non-existent field should error at schema validation",
  schema: {
    config: { endianness: "big_endian" },
    types: {
      "BadSchema": {
        sequence: [
          { name: "magic", type: "uint32" }
        ],
        instances: [
          {
            name: "data",
            type: "DataBlock",
            position: "header.does_not_exist"  // Invalid reference!
          }
        ]
      },
      "DataBlock": {
        sequence: [
          { name: "value", type: "uint16" }
        ]
      }
    }
  },
  test_type: "BadSchema",
  schema_validation_error: true,
  error_message: "Position field 'data' references non-existent field 'header.does_not_exist'"
});

/**
 * Circular position references
 */
export const circularPositionReferences = defineTestSuite({
  name: "circular_position_references",
  description: "Circular position field dependencies should be detected",
  schema: {
    config: { endianness: "big_endian" },
    types: {
      "CircularFile": {
        sequence: [
          { name: "offset_a", type: "uint16" },
          { name: "offset_b", type: "uint16" }
        ],
        instances: [
          {
            name: "block_a",
            type: "BlockA",
            position: "offset_a"
          },
          {
            name: "block_b",
            type: "BlockB",
            position: "offset_b"
          }
        ]
      },
      "BlockA": {
        sequence: [
          { name: "value", type: "uint16" }
        ],
        instances: [
          {
            name: "ref_to_b",
            type: "BlockB",
            position: "_root.offset_b"  // Points to BlockB
          }
        ]
      },
      "BlockB": {
        sequence: [
          { name: "value", type: "uint16" }
        ],
        instances: [
          {
            name: "ref_to_a",
            type: "BlockA",
            position: "_root.offset_a"  // Points back to BlockA - CIRCULAR!
          }
        ]
      }
    }
  },
  test_type: "CircularFile",
  schema_validation_error: true,
  error_message: "Circular position field dependency detected: block_a -> ref_to_b -> ref_to_a -> block_a"
});

/**
 * Zero-size position field
 */
export const zeroSizePositionField = defineTestSuite({
  name: "zero_size_position_field",
  description: "Position field with zero size should work (empty struct)",
  schema: {
    config: { endianness: "big_endian" },
    types: {
      "FileWithEmpty": {
        sequence: [
          { name: "empty_offset", type: "uint32" }
        ],
        instances: [
          {
            name: "empty_block",
            type: "EmptyBlock",
            position: "empty_offset"
          }
        ]
      },
      "EmptyBlock": {
        sequence: []  // Empty type
      }
    }
  },
  test_type: "FileWithEmpty",
  test_cases: [
    {
      description: "Zero-size position field should succeed",
      bytes: [
        0x00, 0x00, 0x00, 0x04  // empty_offset = 4
        // No bytes at position 4 - that's ok!
      ],
      value: {
        empty_offset: 4,
        empty_block: {}
      }
    }
  ]
});

/**
 * Position field at exact EOF boundary
 */
export const positionAtEOFBoundary = defineTestSuite({
  name: "position_at_eof_boundary",
  description: "Position pointing to exact EOF should work for zero-size reads",
  schema: {
    config: { endianness: "big_endian" },
    types: {
      "BoundaryFile": {
        sequence: [
          { name: "offset", type: "uint32" }
        ],
        instances: [
          {
            name: "boundary_block",
            type: "EmptyBlock",
            position: "offset"
          }
        ]
      },
      "EmptyBlock": {
        sequence: []
      }
    }
  },
  test_type: "BoundaryFile",
  test_cases: [
    {
      description: "Position at EOF with zero-size type should succeed",
      bytes: [
        0x00, 0x00, 0x00, 0x04  // offset = 4 (exactly at EOF)
      ],
      value: {
        offset: 4,
        boundary_block: {}
      }
    }
  ]
});

/**
 * Multiple instances accessing same position (should cache)
 */
export const samePositionMultipleTimes = defineTestSuite({
  name: "same_position_multiple_times",
  description: "Multiple position fields at same offset should share cached data",
  schema: {
    config: { endianness: "big_endian" },
    types: {
      "SharedPositionFile": {
        sequence: [
          { name: "shared_offset", type: "uint32" }
        ],
        instances: [
          {
            name: "view_a",
            type: "DataView",
            position: "shared_offset"
          },
          {
            name: "view_b",
            type: "DataView",
            position: "shared_offset"  // Same position!
          }
        ]
      },
      "DataView": {
        sequence: [
          { name: "value", type: "uint16" }
        ]
      }
    }
  },
  test_type: "SharedPositionFile",
  test_cases: [
    {
      description: "Two position fields at same offset should parse successfully",
      bytes: [
        0x00, 0x00, 0x00, 0x04,  // shared_offset = 4
        0x12, 0x34               // value
      ],
      value: {
        shared_offset: 4,
        view_a: { value: 0x1234 },
        view_b: { value: 0x1234 }
      }
      // TODO: Runtime test that they share the same cached data
      // expect(result.view_a).toBe(result.view_b)  // Same object reference
    }
  ]
});

/**
 * Overlapping position fields
 */
export const overlappingPositionFields = defineTestSuite({
  name: "overlapping_position_fields",
  description: "Overlapping position fields should parse independently",
  schema: {
    config: { endianness: "big_endian" },
    types: {
      "OverlappingFile": {
        sequence: [
          { name: "offset_a", type: "uint32" },
          { name: "offset_b", type: "uint32" }
        ],
        instances: [
          {
            name: "block_a",
            type: "LargeBlock",  // 8 bytes
            position: "offset_a"
          },
          {
            name: "block_b",
            type: "SmallBlock",  // 2 bytes, overlaps with block_a
            position: "offset_b"
          }
        ]
      },
      "LargeBlock": {
        sequence: [
          { name: "a", type: "uint32" },
          { name: "b", type: "uint32" }
        ]
      },
      "SmallBlock": {
        sequence: [
          { name: "value", type: "uint16" }
        ]
      }
    }
  },
  test_type: "OverlappingFile",
  test_cases: [
    {
      description: "Overlapping reads should work (both read same bytes)",
      bytes: [
        0x00, 0x00, 0x00, 0x08,  // offset_a = 8
        0x00, 0x00, 0x00, 0x0A,  // offset_b = 10 (inside block_a!)
        // Data at offset 8
        0x11, 0x11, 0x22, 0x22,
        0x33, 0x33, 0x44, 0x44
      ],
      value: {
        offset_a: 8,
        offset_b: 10,
        block_a: { a: 0x11112222, b: 0x33334444 },
        block_b: { value: 0x2222 }  // Overlaps with block_a.a
      }
    }
  ]
});

/**
 * Deep nesting of position references
 */
export const deepPositionNesting = defineTestSuite({
  name: "deep_position_nesting",
  description: "Deeply nested position field references should work",
  schema: {
    config: { endianness: "big_endian" },
    types: {
      "Level0": {
        sequence: [
          { name: "level1_offset", type: "uint16" }
        ],
        instances: [
          {
            name: "level1",
            type: "Level1",
            position: "level1_offset"
          }
        ]
      },
      "Level1": {
        sequence: [
          { name: "level2_offset", type: "uint16" }
        ],
        instances: [
          {
            name: "level2",
            type: "Level2",
            position: "level2_offset"
          }
        ]
      },
      "Level2": {
        sequence: [
          { name: "level3_offset", type: "uint16" }
        ],
        instances: [
          {
            name: "level3",
            type: "Level3",
            position: "level3_offset"
          }
        ]
      },
      "Level3": {
        sequence: [
          { name: "value", type: "uint16" }
        ]
      }
    }
  },
  test_type: "Level0",
  test_cases: [
    {
      description: "Nested position references (4 levels deep)",
      bytes: [
        0x00, 0x02,  // level1_offset = 2
        0x00, 0x04,  // level2_offset = 4
        0x00, 0x06,  // level3_offset = 6
        0xAB, 0xCD   // value
      ],
      value: {
        level1_offset: 2,
        level1: {
          level2_offset: 4,
          level2: {
            level3_offset: 6,
            level3: {
              value: 0xABCD
            }
          }
        }
      }
    }
  ]
});

/**
 * Position field with wrong type (not a number)
 */
export const positionFieldWrongType = defineTestSuite({
  name: "position_field_wrong_type",
  description: "Position referencing non-numeric field should error",
  schema: {
    config: { endianness: "big_endian" },
    types: {
      "BadTypeFile": {
        sequence: [
          {
            name: "not_a_number",
            type: "string",
            kind: "fixed",
            length: 4,
            encoding: "ascii"
          }
        ],
        instances: [
          {
            name: "data",
            type: "DataBlock",
            position: "not_a_number"  // String, not number!
          }
        ]
      },
      "DataBlock": {
        sequence: [
          { name: "value", type: "uint16" }
        ]
      }
    }
  },
  test_type: "BadTypeFile",
  schema_validation_error: true,
  error_message: "Position field 'data' references non-numeric field 'not_a_number' (type: string)"
});
