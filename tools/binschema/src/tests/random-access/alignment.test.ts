// ABOUTME: Alignment constraint tests for position-based fields
// ABOUTME: Validates that position fields respect alignment requirements

import { defineTestSuite } from "../../schema/test-schema.js";

/**
 * Basic alignment constraint - 4-byte aligned
 */
export const fourByteAlignmentTestSuite = defineTestSuite({
  name: "four_byte_alignment",
  description: "Position field must be 4-byte aligned",
  schema: {
    config: { endianness: "little_endian" },
    types: {
      "AlignedFile": {
        sequence: [
          { name: "data_offset", type: "uint32" }
        ],
        instances: [
          {
            name: "data",
            type: "AlignedData",
            position: "data_offset",
            alignment: 4  // Must be 4-byte aligned
          }
        ]
      },
      "AlignedData": {
        sequence: [
          { name: "value", type: "uint32" }
        ]
      }
    }
  },
  test_type: "AlignedFile",
  test_cases: [
    {
      description: "Aligned position (offset 8) should succeed",
      bytes: [
        0x08, 0x00, 0x00, 0x00,  // data_offset = 8 (4-byte aligned ✓)
        0x00, 0x00, 0x00, 0x00,  // padding
        0x12, 0x34, 0x56, 0x78   // data.value
      ],
      value: {
        data_offset: 8,
        data: { value: 0x78563412 }
      }
    },
    {
      description: "Misaligned position (offset 6) should error",
      bytes: [
        0x06, 0x00, 0x00, 0x00,  // data_offset = 6 (NOT 4-byte aligned ✗)
        0x00, 0x00,              // padding
        0x12, 0x34, 0x56, 0x78   // data.value
      ],
      should_error: true,
      error_message: "Position 6 is not aligned to 4 bytes (6 % 4 = 2)"
    }
  ]
});

/**
 * 8-byte alignment (for int64/float64)
 */
export const eightByteAlignmentTestSuite = defineTestSuite({
  name: "eight_byte_alignment",
  description: "Position field with 8-byte alignment requirement",
  schema: {
    config: { endianness: "big_endian" },
    types: {
      "Aligned64File": {
        sequence: [
          { name: "data_offset", type: "uint32" }
        ],
        instances: [
          {
            name: "data",
            type: "Int64Data",
            position: "data_offset",
            alignment: 8
          }
        ]
      },
      "Int64Data": {
        sequence: [
          { name: "value", type: "uint64" }
        ]
      }
    }
  },
  test_type: "Aligned64File",
  test_cases: [
    {
      description: "8-byte aligned position should succeed",
      bytes: [
        0x00, 0x00, 0x00, 0x08,  // data_offset = 8 (8-byte aligned ✓)
        0x00, 0x00, 0x00, 0x00,  // padding
        0x00, 0x00, 0x00, 0x00,  // data.value (high)
        0x00, 0x00, 0x04, 0xD2   // data.value (low) = 1234
      ],
      value: {
        data_offset: 8,
        data: { value: 1234n }
      }
    },
    {
      description: "4-byte aligned but not 8-byte should error",
      bytes: [
        0x00, 0x00, 0x00, 0x0C,  // data_offset = 12 (4-byte aligned, NOT 8-byte ✗)
        0x00, 0x00, 0x00, 0x00,
        0x00, 0x00, 0x00, 0x00,
        0x00, 0x00, 0x00, 0x00,
        0x00, 0x00, 0x04, 0xD2
      ],
      should_error: true,
      error_message: "Position 12 is not aligned to 8 bytes (12 % 8 = 4)"
    }
  ]
});

/**
 * Alignment with negative position (from EOF)
 */
export const negativePositionAlignmentTestSuite = defineTestSuite({
  name: "negative_position_alignment",
  description: "Negative position should also respect alignment",
  schema: {
    config: { endianness: "little_endian" },
    types: {
      "AlignedFooter": {
        sequence: [
          { name: "magic", type: "uint32" }
        ],
        instances: [
          {
            name: "footer",
            type: "Footer",
            position: -8,  // Should be 8-byte aligned from end
            alignment: 8,
            size: 8
          }
        ]
      },
      "Footer": {
        sequence: [
          { name: "checksum", type: "uint32" },
          { name: "size", type: "uint32" }
        ]
      }
    }
  },
  test_type: "AlignedFooter",
  test_cases: [
    {
      description: "Footer at aligned position from EOF",
      bytes: [
        0xDE, 0xAD, 0xBE, 0xEF,  // magic
        0x00, 0x00, 0x00, 0x00,  // padding to ensure footer is 8-byte aligned
        // Footer (last 8 bytes, starts at offset 8 = aligned)
        0x12, 0x34, 0x56, 0x78,  // checksum
        0x00, 0x10, 0x00, 0x00   // size
      ],
      value: {
        magic: 0xEFBEADDE,
        footer: {
          checksum: 0x78563412,
          size: 4096
        }
      }
    }
  ]
});

/**
 * No alignment requirement (alignment = 1)
 */
export const noAlignmentTestSuite = defineTestSuite({
  name: "no_alignment",
  description: "Position field with alignment=1 (any position valid)",
  schema: {
    config: { endianness: "big_endian" },
    types: {
      "UnalignedFile": {
        sequence: [
          { name: "data_offset", type: "uint32" }
        ],
        instances: [
          {
            name: "data",
            type: "ByteData",
            position: "data_offset",
            alignment: 1  // No alignment requirement
          }
        ]
      },
      "ByteData": {
        sequence: [
          { name: "value", type: "uint8" }
        ]
      }
    }
  },
  test_type: "UnalignedFile",
  test_cases: [
    {
      description: "Odd offset should succeed with alignment=1",
      bytes: [
        0x00, 0x00, 0x00, 0x05,  // data_offset = 5 (odd, but ok with alignment=1)
        0x00,                    // padding
        0xAB                     // data.value
      ],
      value: {
        data_offset: 5,
        data: { value: 0xAB }
      }
    }
  ]
});

/**
 * Alignment validation at schema level
 * TODO: This test needs to be handled differently since Zod validates
 * the schema immediately when defineTestSuite() is called
 */
// export const alignmentSchemaValidation = defineTestSuite({
//   name: "alignment_schema_validation",
//   description: "Invalid alignment values should be rejected at schema validation",
//   schema: {
//     config: { endianness: "big_endian" },
//     types: {
//       "InvalidAlignment": {
//         sequence: [
//           { name: "offset", type: "uint32" }
//         ],
//         instances: [
//           {
//             name: "data",
//             type: "DataBlock",
//             position: "offset",
//             alignment: 3  // Invalid! Must be power of 2
//           }
//         ]
//       },
//       "DataBlock": {
//         sequence: [
//           { name: "value", type: "uint16" }
//         ]
//       }
//     }
//   },
//   test_type: "InvalidAlignment",
//   schema_validation_error: true,
//   error_message: "Alignment must be a power of 2 (got 3)"
// });
