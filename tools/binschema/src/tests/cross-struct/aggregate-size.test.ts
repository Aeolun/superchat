// ABOUTME: Tests for computed fields that sum sizes of multiple fields or array elements
// ABOUTME: Required for ZIP EndOfCentralDir.len_central_dir (sum of all CentralDirEntry sizes)

import { defineTestSuite } from "../../schema/test-schema.js";

/**
 * Test sum of multiple field sizes
 *
 * Pattern needed for ZIP:
 * - EndOfCentralDir has len_central_dir field
 * - It needs to be the total encoded size of all CentralDirEntry elements
 */
export const sumOfFieldSizesTestSuite = defineTestSuite({
  name: "sum_of_field_sizes",
  description: "Computed field that sums multiple field encoded sizes",
  schema: {
    config: { endianness: "little_endian" },
    types: {
      "Header": {
        sequence: [
          { name: "magic", type: "uint32" },
          {
            name: "total_payload_size",
            type: "uint32",
            computed: {
              type: "sum_of_sizes",
              targets: ["../payload1", "../payload2", "../payload3"]
            }
          }
        ]
      },
      "MultiPayload": {
        sequence: [
          { name: "header", type: "Header" },
          {
            name: "payload1",
            type: "array",
            kind: "fixed",
            length: 3,
            items: { type: "uint8" }
          },
          {
            name: "payload2",
            type: "array",
            kind: "fixed",
            length: 5,
            items: { type: "uint8" }
          },
          {
            name: "payload3",
            type: "array",
            kind: "fixed",
            length: 2,
            items: { type: "uint8" }
          }
        ]
      }
    }
  },
  test_type: "MultiPayload",
  test_cases: [
    {
      description: "Sum of three payload sizes",
      value: {
        header: {
          magic: 0xDEADBEEF
          // total_payload_size computed from ../payload1 + ../payload2 + ../payload3
        },
        payload1: [0x01, 0x02, 0x03],
        payload2: [0x04, 0x05, 0x06, 0x07, 0x08],
        payload3: [0x09, 0x0A]
      },
      decoded_value: {
        header: {
          magic: 0xDEADBEEF,
          total_payload_size: 10  // 3 + 5 + 2 = 10 bytes
        },
        payload1: [0x01, 0x02, 0x03],
        payload2: [0x04, 0x05, 0x06, 0x07, 0x08],
        payload3: [0x09, 0x0A]
      },
      bytes: [
        // header.magic (uint32 LE)
        0xEF, 0xBE, 0xAD, 0xDE,
        // header.total_payload_size (uint32 LE) - AUTO-COMPUTED
        10, 0, 0, 0,
        // payload1 (3 bytes)
        0x01, 0x02, 0x03,
        // payload2 (5 bytes)
        0x04, 0x05, 0x06, 0x07, 0x08,
        // payload3 (2 bytes)
        0x09, 0x0A
      ]
    },
    {
      description: "Empty payloads produce zero sum",
      value: {
        header: {
          magic: 0x12345678
        },
        payload1: [],
        payload2: [],
        payload3: []
      },
      decoded_value: {
        header: {
          magic: 0x12345678,
          total_payload_size: 0
        },
        payload1: [],
        payload2: [],
        payload3: []
      },
      bytes: [
        0x78, 0x56, 0x34, 0x12,  // magic
        0, 0, 0, 0  // total_payload_size = 0
      ]
    }
  ]
});

/**
 * Test size of all array elements of specific type
 */
export const arrayElementTypeSizeTestSuite = defineTestSuite({
  name: "array_element_type_size",
  description: "Computed field that sums encoded size of all elements of specific type in array",
  schema: {
    config: { endianness: "little_endian" },
    types: {
      "DataBlock": {
        sequence: [
          { name: "block_id", type: "uint8" },
          {
            name: "data",
            type: "array",
            kind: "fixed",
            length: 4,
            items: { type: "uint8" }
          }
        ]
      },
      "MetadataBlock": {
        sequence: [
          { name: "meta_id", type: "uint8" },
          { name: "flags", type: "uint16" }
        ]
      },
      "Summary": {
        sequence: [
          {
            name: "total_data_blocks_size",
            type: "uint32",
            computed: {
              type: "sum_of_type_sizes",
              target: "../sections",
              element_type: "DataBlock"
            }
          },
          {
            name: "total_metadata_blocks_size",
            type: "uint32",
            computed: {
              type: "sum_of_type_sizes",
              target: "../sections",
              element_type: "MetadataBlock"
            }
          }
        ]
      },
      "Container": {
        sequence: [
          { name: "summary", type: "Summary" },
          {
            name: "sections",
            type: "array",
            kind: "fixed",
            length: 4,
            items: {
              type: "choice",
              choices: [
                { type: "DataBlock" },
                { type: "MetadataBlock" }
              ]
            }
          }
        ]
      }
    }
  },
  test_type: "Container",
  test_cases: [
    {
      description: "Sum sizes of specific element types in mixed array",
      value: {
        summary: {
          // total_data_blocks_size and total_metadata_blocks_size are computed
        },
        sections: [
          {
            type: "DataBlock",
            block_id: 1,
            data: [0xAA, 0xBB, 0xCC, 0xDD]
          },
          {
            type: "MetadataBlock",
            meta_id: 2,
            flags: 0x1234
          },
          {
            type: "DataBlock",
            block_id: 3,
            data: [0xEE, 0xFF, 0x00, 0x11]
          },
          {
            type: "MetadataBlock",
            meta_id: 4,
            flags: 0x5678
          }
        ]
      },
      decoded_value: {
        summary: {
          total_data_blocks_size: 10,  // 2 DataBlocks × 5 bytes each (1 id + 4 data)
          total_metadata_blocks_size: 6  // 2 MetadataBlocks × 3 bytes each (1 id + 2 flags)
        },
        sections: [
          {
            type: "DataBlock",
            block_id: 1,
            data: [0xAA, 0xBB, 0xCC, 0xDD]
          },
          {
            type: "MetadataBlock",
            meta_id: 2,
            flags: 0x1234
          },
          {
            type: "DataBlock",
            block_id: 3,
            data: [0xEE, 0xFF, 0x00, 0x11]
          },
          {
            type: "MetadataBlock",
            meta_id: 4,
            flags: 0x5678
          }
        ]
      },
      bytes: [
        // summary
        10, 0, 0, 0,  // total_data_blocks_size = 10 (AUTO-COMPUTED)
        6, 0, 0, 0,   // total_metadata_blocks_size = 6 (AUTO-COMPUTED)
        // sections[0]: DataBlock (5 bytes)
        1,  // block_id
        0xAA, 0xBB, 0xCC, 0xDD,  // data
        // sections[1]: MetadataBlock (3 bytes)
        2,  // meta_id
        0x34, 0x12,  // flags
        // sections[2]: DataBlock (5 bytes)
        3,  // block_id
        0xEE, 0xFF, 0x00, 0x11,  // data
        // sections[3]: MetadataBlock (3 bytes)
        4,  // meta_id
        0x78, 0x56  // flags
      ]
    },
    {
      description: "Array with only one type",
      value: {
        summary: {},
        sections: [
          {
            type: "DataBlock",
            block_id: 1,
            data: [0x01, 0x02, 0x03, 0x04]
          },
          {
            type: "DataBlock",
            block_id: 2,
            data: [0x05, 0x06, 0x07, 0x08]
          }
        ]
      },
      decoded_value: {
        summary: {
          total_data_blocks_size: 10,  // 2 DataBlocks × 5 bytes
          total_metadata_blocks_size: 0  // No MetadataBlocks
        },
        sections: [
          {
            type: "DataBlock",
            block_id: 1,
            data: [0x01, 0x02, 0x03, 0x04]
          },
          {
            type: "DataBlock",
            block_id: 2,
            data: [0x05, 0x06, 0x07, 0x08]
          }
        ]
      },
      bytes: [
        // summary
        10, 0, 0, 0,  // total_data_blocks_size = 10
        0, 0, 0, 0,   // total_metadata_blocks_size = 0
        // sections[0]: DataBlock
        1, 0x01, 0x02, 0x03, 0x04,
        // sections[1]: DataBlock
        2, 0x05, 0x06, 0x07, 0x08
      ]
    }
  ]
});

/**
 * Test combined aggregate size with position tracking
 */
export const aggregateSizeWithPositionTestSuite = defineTestSuite({
  name: "aggregate_size_with_position",
  description: "Aggregate size computation combined with position tracking",
  schema: {
    config: { endianness: "little_endian" },
    types: {
      "Entry": {
        sequence: [
          { name: "entry_id", type: "uint8" },
          {
            name: "name",
            type: "string",
            kind: "fixed",
            length: 4,
            encoding: "ascii"
          }
        ]
      },
      "Directory": {
        sequence: [
          {
            name: "entries_start_offset",
            type: "uint32",
            computed: {
              type: "position_of",
              target: "../entries[first<Entry>]"
            }
          },
          {
            name: "entries_total_size",
            type: "uint32",
            computed: {
              type: "sum_of_type_sizes",
              target: "../entries",
              element_type: "Entry"
            }
          }
        ]
      },
      "Archive": {
        sequence: [
          { name: "directory", type: "Directory" },
          {
            name: "entries",
            type: "array",
            kind: "fixed",
            length: 3,
            items: { type: "Entry" }
          }
        ]
      }
    }
  },
  test_type: "Archive",
  test_cases: [
    {
      description: "Directory tracks both position and total size of entries",
      value: {
        directory: {
          // entries_start_offset and entries_total_size are computed
        },
        entries: [
          { entry_id: 1, name: "foo " },
          { entry_id: 2, name: "bar " },
          { entry_id: 3, name: "baz " }
        ]
      },
      decoded_value: {
        directory: {
          entries_start_offset: 8,  // After directory (4 + 4 bytes)
          entries_total_size: 15    // 3 entries × 5 bytes each (1 id + 4 name)
        },
        entries: [
          { entry_id: 1, name: "foo " },
          { entry_id: 2, name: "bar " },
          { entry_id: 3, name: "baz " }
        ]
      },
      bytes: [
        // directory
        8, 0, 0, 0,   // entries_start_offset = 8 (AUTO-COMPUTED)
        15, 0, 0, 0,  // entries_total_size = 15 (AUTO-COMPUTED)
        // entries[0] (starts at position 8)
        1, 0x66, 0x6F, 0x6F, 0x20,  // "foo "
        // entries[1]
        2, 0x62, 0x61, 0x72, 0x20,  // "bar "
        // entries[2]
        3, 0x62, 0x61, 0x7A, 0x20   // "baz "
      ]
    }
  ]
});

/**
 * Test ZIP-style aggregate size (realistic example)
 */
export const zipStyleAggregateSizeTestSuite = defineTestSuite({
  name: "zip_style_aggregate_size",
  description: "Realistic ZIP-style central directory size computation",
  schema: {
    config: { endianness: "little_endian" },
    types: {
      "LocalFileHeader": {
        sequence: [
          { name: "signature", type: "uint32" },
          { name: "version", type: "uint16" },
          {
            name: "filename_length",
            type: "uint16",
            computed: {
              type: "length_of",
              target: "../filename",
              encoding: "utf8"
            }
          },
          {
            name: "filename",
            type: "string",
            kind: "field_referenced",
            length_field: "filename_length",
            encoding: "utf8"
          }
        ]
      },
      "CentralDirEntry": {
        sequence: [
          { name: "signature", type: "uint32" },
          {
            name: "filename_length",
            type: "uint16",
            computed: {
              type: "length_of",
              target: "../filename",
              encoding: "utf8"
            }
          },
          {
            name: "filename",
            type: "string",
            kind: "field_referenced",
            length_field: "filename_length",
            encoding: "utf8"
          }
        ]
      },
      "EndOfCentralDir": {
        sequence: [
          { name: "signature", type: "uint32" },
          {
            name: "central_dir_offset",
            type: "uint32",
            computed: {
              type: "position_of",
              target: "../sections[first<CentralDirEntry>]"
            }
          },
          {
            name: "central_dir_size",
            type: "uint32",
            computed: {
              type: "sum_of_type_sizes",
              target: "../sections",
              element_type: "CentralDirEntry"
            }
          }
        ]
      },
      "ZipArchive": {
        sequence: [
          {
            name: "sections",
            type: "array",
            kind: "fixed",
            length: 5,  // 2 local + 2 central + 1 end
            items: {
              type: "choice",
              choices: [
                { type: "LocalFileHeader" },
                { type: "CentralDirEntry" },
                { type: "EndOfCentralDir" }
              ]
            }
          }
        ]
      }
    }
  },
  test_type: "ZipArchive",
  test_cases: [
    {
      description: "End of central dir tracks offset and size of central directory",
      value: {
        sections: [
          // Local file headers
          {
            type: "LocalFileHeader",
            signature: 0x04034b50,
            version: 20,
            filename: "a.txt"
          },
          {
            type: "LocalFileHeader",
            signature: 0x04034b50,
            version: 20,
            filename: "b.txt"
          },
          // Central directory entries
          {
            type: "CentralDirEntry",
            signature: 0x02014b50,
            filename: "a.txt"
          },
          {
            type: "CentralDirEntry",
            signature: 0x02014b50,
            filename: "b.txt"
          },
          // End of central directory
          {
            type: "EndOfCentralDir",
            signature: 0x06054b50
            // central_dir_offset and central_dir_size are computed
          }
        ]
      },
      decoded_value: {
        sections: [
          {
            type: "LocalFileHeader",
            signature: 0x04034b50,
            version: 20,
            filename_length: 5,
            filename: "a.txt"
          },
          {
            type: "LocalFileHeader",
            signature: 0x04034b50,
            version: 20,
            filename_length: 5,
            filename: "b.txt"
          },
          {
            type: "CentralDirEntry",
            signature: 0x02014b50,
            filename_length: 5,
            filename: "a.txt"
          },
          {
            type: "CentralDirEntry",
            signature: 0x02014b50,
            filename_length: 5,
            filename: "b.txt"
          },
          {
            type: "EndOfCentralDir",
            signature: 0x06054b50,
            central_dir_offset: 26,  // Position of first CentralDirEntry
            central_dir_size: 22     // 2 CentralDirEntry × 11 bytes each
          }
        ]
      },
      bytes: [
        // sections[0]: LocalFileHeader "a.txt" (13 bytes)
        0x50, 0x4b, 0x03, 0x04,  // signature
        20, 0,  // version
        5, 0,   // filename_length (AUTO-COMPUTED)
        0x61, 0x2e, 0x74, 0x78, 0x74,  // "a.txt"

        // sections[1]: LocalFileHeader "b.txt" (13 bytes)
        0x50, 0x4b, 0x03, 0x04,  // signature
        20, 0,  // version
        5, 0,   // filename_length (AUTO-COMPUTED)
        0x62, 0x2e, 0x74, 0x78, 0x74,  // "b.txt"

        // sections[2]: CentralDirEntry "a.txt" (11 bytes, starts at position 26)
        0x50, 0x4b, 0x01, 0x02,  // signature
        5, 0,   // filename_length (AUTO-COMPUTED)
        0x61, 0x2e, 0x74, 0x78, 0x74,  // "a.txt"

        // sections[3]: CentralDirEntry "b.txt" (11 bytes)
        0x50, 0x4b, 0x01, 0x02,  // signature
        5, 0,   // filename_length (AUTO-COMPUTED)
        0x62, 0x2e, 0x74, 0x78, 0x74,  // "b.txt"

        // sections[4]: EndOfCentralDir (12 bytes, starts at position 48)
        0x50, 0x4b, 0x05, 0x06,  // signature
        26, 0, 0, 0,  // central_dir_offset = 26 (AUTO-COMPUTED)
        22, 0, 0, 0   // central_dir_size = 22 (AUTO-COMPUTED)
      ]
    }
  ]
});

/**
 * Test sum of variable-length struct sizes
 */
export const variableLengthStructSumTestSuite = defineTestSuite({
  name: "variable_length_struct_sum",
  description: "Sum of encoded sizes for structs with variable-length fields",
  schema: {
    config: { endianness: "little_endian" },
    types: {
      "Record": {
        sequence: [
          {
            name: "name_length",
            type: "uint8",
            computed: {
              type: "length_of",
              target: "name",
              encoding: "utf8"
            }
          },
          {
            name: "name",
            type: "string",
            kind: "field_referenced",
            length_field: "name_length",
            encoding: "utf8"
          }
        ]
      },
      "Footer": {
        sequence: [
          {
            name: "records_total_size",
            type: "uint32",
            computed: {
              type: "sum_of_type_sizes",
              target: "../records",
              element_type: "Record"
            }
          }
        ]
      },
      "Database": {
        sequence: [
          { name: "footer", type: "Footer" },
          {
            name: "records",
            type: "array",
            kind: "fixed",
            length: 3,
            items: { type: "Record" }
          }
        ]
      }
    }
  },
  test_type: "Database",
  test_cases: [
    {
      description: "Sum of variable-length records with different name lengths",
      value: {
        footer: {
          // records_total_size is computed
        },
        records: [
          { name: "a" },     // 1 byte length + 1 byte name = 2 bytes
          { name: "abc" },   // 1 byte length + 3 bytes name = 4 bytes
          { name: "hello" }  // 1 byte length + 5 bytes name = 6 bytes
        ]
      },
      decoded_value: {
        footer: {
          records_total_size: 12  // 2 + 4 + 6 = 12 bytes
        },
        records: [
          { name_length: 1, name: "a" },
          { name_length: 3, name: "abc" },
          { name_length: 5, name: "hello" }
        ]
      },
      bytes: [
        // footer
        12, 0, 0, 0,  // records_total_size = 12 (AUTO-COMPUTED)
        // records[0] (2 bytes)
        1, 0x61,  // "a"
        // records[1] (4 bytes)
        3, 0x61, 0x62, 0x63,  // "abc"
        // records[2] (6 bytes)
        5, 0x68, 0x65, 0x6C, 0x6C, 0x6F  // "hello"
      ]
    }
  ]
});
