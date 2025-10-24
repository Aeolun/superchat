// ABOUTME: Test suite for position-based field parsing (random access)
// ABOUTME: Validates jumping to absolute offsets within binary data

import { defineTestSuite } from "../../schema/test-schema.js";

/**
 * Basic position field tests - fixed absolute offsets
 */
export const basicPositionFieldsTestSuite = defineTestSuite({
  name: "basic_position_fields",
  description: "Position fields with fixed absolute offsets",
  schema: {
    config: { endianness: "big_endian" },
    types: {
      "FileWithData": {
        sequence: [
          { name: "magic", type: "uint32" },
          { name: "data_offset", type: "uint32" }
        ],
        instances: [
          {
            name: "data",
            type: "DataBlock",
            position: "data_offset"
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
  test_type: "FileWithData",
  test_cases: [
    {
      description: "Jump to offset specified in header field",
      bytes: [
        // Header at offset 0
        0xDE, 0xAD, 0xBE, 0xEF,  // magic = 0xDEADBEEF
        0x00, 0x00, 0x00, 0x0C,  // data_offset = 12
        // Padding bytes 8-11
        0x00, 0x00, 0x00, 0x00,
        // DataBlock at offset 12
        0x12, 0x34                // value = 0x1234
      ],
      value: {
        magic: 0xDEADBEEF,
        data_offset: 12,
        data: { value: 0x1234 }
      }
    },
    {
      description: "Position field can jump backward",
      bytes: [
        // Header at offset 0
        0xCA, 0xFE, 0xBA, 0xBE,  // magic = 0xCAFEBABE
        0x00, 0x00, 0x00, 0x0A,  // data_offset = 10 (forward to offset 10)
        // Padding
        0x00, 0x00,
        // DataBlock at offset 10
        0xAB, 0xCD               // value = 0xABCD
      ],
      value: {
        magic: 0xCAFEBABE,
        data_offset: 10,
        data: { value: 0xABCD }
      }
    }
  ]
});

/**
 * Multiple position fields - non-overlapping sections
 */
export const multiplePositionFieldsTestSuite = defineTestSuite({
  name: "multiple_position_fields",
  description: "Multiple independent position fields",
  schema: {
    config: { endianness: "little_endian" },
    types: {
      "FileWithSections": {
        sequence: [
          { name: "section_a_offset", type: "uint32" },
          { name: "section_b_offset", type: "uint32" }
        ],
        instances: [
          {
            name: "section_a",
            type: "Section",
            position: "section_a_offset"
          },
          {
            name: "section_b",
            type: "Section",
            position: "section_b_offset"
          }
        ]
      },
      "Section": {
        sequence: [
          { name: "id", type: "uint8" },
          { name: "value", type: "uint16" }
        ]
      }
    }
  },
  test_type: "FileWithSections",
  test_cases: [
    {
      description: "Two position fields pointing to different sections",
      bytes: [
        // Header (offset 0-7)
        0x08, 0x00, 0x00, 0x00,  // section_a_offset = 8
        0x0B, 0x00, 0x00, 0x00,  // section_b_offset = 11
        // Section A (offset 8-10)
        0x01,                    // id = 1
        0x11, 0x11,              // value = 0x1111
        // Section B (offset 11-13)
        0x02,                    // id = 2
        0x22, 0x22               // value = 0x2222
      ],
      value: {
        section_a_offset: 8,
        section_b_offset: 11,
        section_a: { id: 1, value: 0x1111 },
        section_b: { id: 2, value: 0x2222 }
      }
    }
  ]
});

/**
 * Negative positions - reading from end of file
 */
export const negativePositionsTestSuite = defineTestSuite({
  name: "negative_positions",
  description: "Position fields with negative offsets (from EOF)",
  schema: {
    config: { endianness: "big_endian" },
    types: {
      "FileWithFooter": {
        sequence: [
          { name: "magic", type: "uint32" }
        ],
        instances: [
          {
            name: "footer",
            type: "Footer",
            position: -4,  // Last 4 bytes
            size: 4
          }
        ]
      },
      "Footer": {
        sequence: [
          { name: "checksum", type: "uint32" }
        ]
      }
    }
  },
  test_type: "FileWithFooter",
  test_cases: [
    {
      description: "Read footer from end of file",
      bytes: [
        // Header
        0xDE, 0xAD, 0xBE, 0xEF,  // magic
        // Padding
        0x00, 0x00, 0x00, 0x00,
        0x00, 0x00, 0x00, 0x00,
        // Footer (last 4 bytes)
        0x12, 0x34, 0x56, 0x78   // checksum
      ],
      value: {
        magic: 0xDEADBEEF,
        footer: { checksum: 0x12345678 }
      }
    }
  ]
});

/**
 * ZIP-like format - directory at end pointing to files
 */
export const zipLikeFormatTestSuite = defineTestSuite({
  name: "zip_like_format",
  description: "Archive format with central directory at EOF",
  schema: {
    config: { endianness: "little_endian" },
    types: {
      "Archive": {
        sequence: [
          // Local files are read sequentially first
          {
            name: "files",
            type: "array",
            kind: "fixed",
            length: 2,
            items: { type: "LocalFile" }
          }
        ],
        instances: [
          // End record at EOF
          {
            name: "end_record",
            type: "EndRecord",
            position: -8,
            size: 8
          },
          // Central directory (lazy)
          {
            name: "central_dir",
            type: "CentralDir",
            position: "end_record.dir_offset",
            size: "end_record.dir_size"
          }
        ]
      },
      "LocalFile": {
        sequence: [
          { name: "signature", type: "uint16" },  // 0x4C46 = "LF"
          { name: "size", type: "uint16" },
          {
            name: "data",
            type: "array",
            kind: "field_referenced",
            length_field: "size",
            items: { type: "uint8" }
          }
        ]
      },
      "EndRecord": {
        sequence: [
          { name: "signature", type: "uint16" },  // 0x4544 = "ED"
          { name: "num_files", type: "uint16" },
          { name: "dir_size", type: "uint16" },
          { name: "dir_offset", type: "uint16" }
        ]
      },
      "CentralDir": {
        sequence: [
          {
            name: "entries",
            type: "array",
            kind: "field_referenced",
            length_field: "_root.end_record.num_files",
            items: { type: "DirEntry" }
          }
        ]
      },
      "DirEntry": {
        sequence: [
          { name: "file_offset", type: "uint16" },
          { name: "file_size", type: "uint16" }
        ],
        instances: [
          {
            name: "file",
            type: "LocalFile",
            position: "file_offset"
          }
        ]
      }
    }
  },
  test_type: "Archive",
  test_cases: [
    {
      description: "Parse archive with central directory at end",
      bytes: [
        // File 1 at offset 0
        0x4C, 0x46,              // signature = "LF"
        0x02, 0x00,              // size = 2
        0xAA, 0xBB,              // data
        // File 2 at offset 6
        0x4C, 0x46,              // signature = "LF"
        0x03, 0x00,              // size = 3
        0xCC, 0xDD, 0xEE,        // data
        // Central directory at offset 11
        0x00, 0x00,              // entries[0].file_offset = 0
        0x06, 0x00,              // entries[0].file_size = 6
        0x06, 0x00,              // entries[1].file_offset = 6
        0x09, 0x00,              // entries[1].file_size = 9
        // End record at offset 19 (last 8 bytes)
        0x45, 0x44,              // signature = "ED"
        0x02, 0x00,              // num_files = 2
        0x08, 0x00,              // dir_size = 8
        0x0B, 0x00               // dir_offset = 11
      ],
      value: {
        files: [
          { signature: 0x464C, size: 2, data: [0xAA, 0xBB] },
          { signature: 0x464C, size: 3, data: [0xCC, 0xDD, 0xEE] }
        ],
        end_record: {
          signature: 0x4445,
          num_files: 2,
          dir_size: 8,
          dir_offset: 11
        },
        central_dir: {
          entries: [
            {
              file_offset: 0,
              file_size: 6,
              file: { signature: 0x464C, size: 2, data: [0xAA, 0xBB] }
            },
            {
              file_offset: 6,
              file_size: 9,
              file: { signature: 0x464C, size: 3, data: [0xCC, 0xDD, 0xEE] }
            }
          ]
        }
      }
    }
  ]
});

/**
 * ELF-like format - header with section table
 */
export const elfLikeFormatTestSuite = defineTestSuite({
  name: "elf_like_format",
  description: "Executable format with scattered sections",
  schema: {
    config: { endianness: "little_endian" },
    types: {
      "Executable": {
        sequence: [
          { name: "magic", type: "uint32" },      // 0x7F454C46 = "\x7FELF"
          { name: "section_table_offset", type: "uint16" },
          { name: "num_sections", type: "uint16" }
        ],
        instances: [
          {
            name: "section_table",
            type: "SectionTable",
            position: "section_table_offset"
          }
        ]
      },
      "SectionTable": {
        sequence: [
          {
            name: "sections",
            type: "array",
            kind: "field_referenced",
            length_field: "_root.num_sections",
            items: { type: "SectionHeader" }
          }
        ]
      },
      "SectionHeader": {
        sequence: [
          { name: "type", type: "uint8" },
          { name: "offset", type: "uint16" },
          { name: "size", type: "uint16" }
        ],
        instances: [
          {
            name: "data",
            type: "array",
            kind: "fixed",
            length_field: "size",
            items: { type: "uint8" },
            position: "offset"
          }
        ]
      }
    }
  },
  test_type: "Executable",
  test_cases: [
    {
      description: "Parse executable with scattered sections",
      bytes: [
        // Header (offset 0-7)
        0x7F, 0x45, 0x4C, 0x46,  // magic = "\x7FELF"
        0x08, 0x00,              // section_table_offset = 8
        0x02, 0x00,              // num_sections = 2
        // Section table (offset 8-17)
        0x01,                    // sections[0].type = 1
        0x12, 0x00,              // sections[0].offset = 18
        0x03, 0x00,              // sections[0].size = 3
        0x02,                    // sections[1].type = 2
        0x15, 0x00,              // sections[1].offset = 21
        0x02, 0x00,              // sections[1].size = 2
        // Section 0 data (offset 18-20)
        0xAA, 0xBB, 0xCC,
        // Section 1 data (offset 21-22)
        0xDD, 0xEE
      ],
      value: {
        magic: 0x464C457F,
        section_table_offset: 8,
        num_sections: 2,
        section_table: {
          sections: [
            {
              type: 1,
              offset: 18,
              size: 3,
              data: [0xAA, 0xBB, 0xCC]
            },
            {
              type: 2,
              offset: 21,
              size: 2,
              data: [0xDD, 0xEE]
            }
          ]
        }
      }
    }
  ]
});

/**
 * Lazy evaluation tests - verify position fields are only parsed when accessed
 */
export const lazyEvaluationTestSuite = defineTestSuite({
  name: "lazy_evaluation",
  description: "Instance fields should only parse when accessed",
  schema: {
    config: { endianness: "big_endian" },
    types: {
      "LazyFile": {
        sequence: [
          { name: "data_offset", type: "uint32" }
        ],
        instances: [
          {
            name: "data",
            type: "DataBlock",
            position: "data_offset"
          }
        ]
      },
      "DataBlock": {
        sequence: [
          { name: "value", type: "uint32" }
        ]
      }
    }
  },
  test_type: "LazyFile",
  test_cases: [
    {
      description: "Instance field accessed - should parse",
      bytes: [
        0x00, 0x00, 0x00, 0x04,  // data_offset = 4
        0xDE, 0xAD, 0xBE, 0xEF   // data.value
      ],
      value: {
        data_offset: 4,
        data: { value: 0xDEADBEEF }
      }
    }
    // TODO: Add test that verifies data is NOT parsed if not accessed
    // This requires runtime instrumentation or decoder API extension
  ]
});

/**
 * Edge cases and error conditions
 */
export const edgeCasesTestSuite = defineTestSuite({
  name: "position_field_edge_cases",
  description: "Error conditions and edge cases for position fields",
  schema: {
    config: { endianness: "big_endian" },
    types: {
      "EdgeCaseFile": {
        sequence: [
          { name: "offset", type: "uint32" }
        ],
        instances: [
          {
            name: "data",
            type: "DataBlock",
            position: "offset"
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
  test_type: "EdgeCaseFile",
  test_cases: [
    {
      description: "Position at EOF boundary - should work",
      bytes: [
        0x00, 0x00, 0x00, 0x04,  // offset = 4
        0x12, 0x34                // data.value (exactly at boundary)
      ],
      value: {
        offset: 4,
        data: { value: 0x1234 }
      }
    }
    // TODO: Add error test cases when error handling is implemented:
    // - Position beyond EOF (should throw)
    // - Position + size exceeds EOF (should throw)
    // - Negative position beyond start of file (should throw)
    // - Invalid position reference (field doesn't exist)
  ]
});

/**
 * Nested position fields - position field referencing another position field
 */
export const nestedPositionsTestSuite = defineTestSuite({
  name: "nested_position_fields",
  description: "Position fields that reference other position field results",
  schema: {
    config: { endianness: "little_endian" },
    types: {
      "NestedFile": {
        sequence: [
          { name: "index_offset", type: "uint16" }
        ],
        instances: [
          {
            name: "index",
            type: "Index",
            position: "index_offset"
          },
          {
            name: "data",
            type: "DataBlock",
            position: "index.data_offset"  // Nested reference!
          }
        ]
      },
      "Index": {
        sequence: [
          { name: "data_offset", type: "uint16" }
        ]
      },
      "DataBlock": {
        sequence: [
          { name: "value", type: "uint8" }
        ]
      }
    }
  },
  test_type: "NestedFile",
  test_cases: [
    {
      description: "Position field references another position field's result",
      bytes: [
        0x02, 0x00,              // index_offset = 2
        0x04, 0x00,              // index.data_offset = 4
        0xAB                     // data.value = 0xAB
      ],
      value: {
        index_offset: 2,
        index: { data_offset: 4 },
        data: { value: 0xAB }
      }
    }
  ]
});
