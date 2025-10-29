// ABOUTME: Tests for array element correlation between different struct arrays
// ABOUTME: Required for ZIP CentralDirEntry referencing positions of LocalFile entries

import { defineTestSuite } from "../../schema/test-schema.js";

/**
 * Test same-index correlation between two arrays
 *
 * This pattern is needed for ZIP:
 * - sections array contains multiple LocalFile and CentralDirEntry elements
 * - Each CentralDirEntry.ofs_local_header needs position of the corresponding LocalFile
 * - Correlation: CentralDirEntry[i] references LocalFile[i]
 */
export const sameIndexCorrelationTestSuite = defineTestSuite({
  name: "same_index_correlation",
  description: "Array element references corresponding element in another array",
  schema: {
    config: { endianness: "little_endian" },
    types: {
      "DataBlock": {
        sequence: [
          { name: "type_tag", type: "uint8" },  // Discriminator: 0x01
          { name: "id", type: "uint8" },
          {
            name: "data",
            type: "array",
            kind: "fixed",
            length: 4,
            items: { type: "uint8" }
          }
        ]
      },
      "IndexEntry": {
        sequence: [
          { name: "type_tag", type: "uint8" },  // Discriminator: 0x02
          { name: "id", type: "uint8" },
          {
            name: "data_offset",
            type: "uint32",
            computed: {
              type: "position_of",
              target: "../sections[same_index<DataBlock>]"  // Position of corresponding DataBlock
            }
          }
        ]
      },
      "Archive": {
        sequence: [
          {
            name: "sections",
            type: "array",
            kind: "length_prefixed",
            length_type: "uint8",
            items: {
              type: "choice",
              choices: [
                { type: "DataBlock" },
                { type: "IndexEntry" }
              ]
            }
          }
        ]
      }
    }
  },
  test_type: "Archive",
  test_cases: [
    {
      description: "Index entry references corresponding data block position",
      value: {
        sections: [
          {
            type: "DataBlock",
            type_tag: 0x01,
            id: 1,
            data: [0xAA, 0xBB, 0xCC, 0xDD]
          },
          {
            type: "IndexEntry",
            type_tag: 0x02,
            id: 1
            // data_offset is computed from sections[same_index<DataBlock>]
          }
        ]
      },
      decoded_value: {
        sections: [
          {
            type: "DataBlock",
            type_tag: 0x01,
            id: 1,
            data: [0xAA, 0xBB, 0xCC, 0xDD]
          },
          {
            type: "IndexEntry",
            type_tag: 0x02,
            id: 1,
            data_offset: 1  // Position of first DataBlock (after length prefix)
          }
        ]
      },
      bytes: [
        2,  // sections.length (uint8 length prefix)
        // sections[0]: DataBlock (starts at position 1)
        0x01,  // type_tag (discriminator)
        1,  // id
        0xAA, 0xBB, 0xCC, 0xDD,  // data (4 bytes)
        // sections[1]: IndexEntry (starts at position 7)
        0x02,  // type_tag (discriminator)
        1,  // id
        1, 0, 0, 0  // data_offset = 1 (position of corresponding DataBlock)
      ]
    },
    {
      description: "Multiple data blocks with multiple index entries",
      value: {
        sections: [
          {
            type: "DataBlock",
            type_tag: 0x01,
            id: 1,
            data: [0x01, 0x02, 0x03, 0x04]
          },
          {
            type: "DataBlock",
            type_tag: 0x01,
            id: 2,
            data: [0x05, 0x06, 0x07, 0x08]
          },
          {
            type: "IndexEntry",
            type_tag: 0x02,
            id: 1
            // References sections[0] (first DataBlock)
          },
          {
            type: "IndexEntry",
            type_tag: 0x02,
            id: 2
            // References sections[1] (second DataBlock)
          }
        ]
      },
      decoded_value: {
        sections: [
          {
            type: "DataBlock",
            type_tag: 0x01,
            id: 1,
            data: [0x01, 0x02, 0x03, 0x04]
          },
          {
            type: "DataBlock",
            type_tag: 0x01,
            id: 2,
            data: [0x05, 0x06, 0x07, 0x08]
          },
          {
            type: "IndexEntry",
            type_tag: 0x02,
            id: 1,
            data_offset: 1  // Position of sections[0] (after length prefix)
          },
          {
            type: "IndexEntry",
            type_tag: 0x02,
            id: 2,
            data_offset: 7  // Position of sections[1] (1 length + 1 type_tag + 1 id + 4 data = 7)
          }
        ]
      },
      bytes: [
        4,  // sections.length (uint8 length prefix)
        // sections[0]: DataBlock (starts at position 1)
        0x01,  // type_tag
        1,  // id
        0x01, 0x02, 0x03, 0x04,  // data
        // sections[1]: DataBlock (starts at position 7)
        0x01,  // type_tag
        2,  // id
        0x05, 0x06, 0x07, 0x08,  // data
        // sections[2]: IndexEntry (starts at position 13)
        0x02,  // type_tag
        1,  // id
        1, 0, 0, 0,  // data_offset = 1 (little endian)
        // sections[3]: IndexEntry (starts at position 19)
        0x02,  // type_tag
        2,  // id
        7, 0, 0, 0  // data_offset = 7 (little endian)
      ]
    }
  ]
});

/**
 * Test first element position reference
 */
export const firstElementPositionTestSuite = defineTestSuite({
  name: "first_element_position",
  description: "Reference to first element of specific type in array",
  schema: {
    config: { endianness: "little_endian" },
    types: {
      "FileData": {
        sequence: [
          { name: "file_id", type: "uint8" },
          {
            name: "content",
            type: "array",
            kind: "fixed",
            length: 3,
            items: { type: "uint8" }
          }
        ]
      },
      "Directory": {
        sequence: [
          { name: "dir_id", type: "uint8" },
          {
            name: "first_file_offset",
            type: "uint32",
            computed: {
              type: "position_of",
              target: "../sections[first<FileData>]"
            }
          }
        ]
      },
      "FileSystem": {
        sequence: [
          {
            name: "sections",
            type: "array",
            kind: "fixed",
            length: 3,
            items: {
              type: "choice",
              choices: [
                { type: "Directory" },
                { type: "FileData" }
              ]
            }
          }
        ]
      }
    }
  },
  test_type: "FileSystem",
  test_cases: [
    {
      description: "Directory references first file data position",
      value: {
        sections: [
          {
            type: "Directory",
            dir_id: 1
            // first_file_offset computed to point to first FileData
          },
          {
            type: "FileData",
            file_id: 10,
            content: [0xAA, 0xBB, 0xCC]
          },
          {
            type: "FileData",
            file_id: 20,
            content: [0xDD, 0xEE, 0xFF]
          }
        ]
      },
      decoded_value: {
        sections: [
          {
            type: "Directory",
            dir_id: 1,
            first_file_offset: 5  // Position of first FileData (after Directory: 1 + 4 bytes)
          },
          {
            type: "FileData",
            file_id: 10,
            content: [0xAA, 0xBB, 0xCC]
          },
          {
            type: "FileData",
            file_id: 20,
            content: [0xDD, 0xEE, 0xFF]
          }
        ]
      },
      bytes: [
        // sections[0]: Directory (starts at position 0)
        1,  // dir_id
        5, 0, 0, 0,  // first_file_offset = 5 (AUTO-COMPUTED)
        // sections[1]: FileData (starts at position 5)
        10,  // file_id
        0xAA, 0xBB, 0xCC,  // content
        // sections[2]: FileData (starts at position 9)
        20,  // file_id
        0xDD, 0xEE, 0xFF  // content
      ]
    }
  ]
});

/**
 * Test last element position reference
 */
export const lastElementPositionTestSuite = defineTestSuite({
  name: "last_element_position",
  description: "Reference to last element of specific type in array",
  schema: {
    config: { endianness: "little_endian" },
    types: {
      "DataChunk": {
        sequence: [
          { name: "chunk_id", type: "uint8" },
          {
            name: "data",
            type: "array",
            kind: "fixed",
            length: 2,
            items: { type: "uint8" }
          }
        ]
      },
      "Footer": {
        sequence: [
          {
            name: "last_chunk_offset",
            type: "uint32",
            computed: {
              type: "position_of",
              target: "../chunks[last<DataChunk>]"
            }
          }
        ]
      },
      "Container": {
        sequence: [
          {
            name: "chunks",
            type: "array",
            kind: "fixed",
            length: 3,
            items: { type: "DataChunk" }
          },
          { name: "footer", type: "Footer" }
        ]
      }
    }
  },
  test_type: "Container",
  test_cases: [
    {
      description: "Footer references last chunk position",
      value: {
        chunks: [
          { chunk_id: 1, data: [0x01, 0x02] },
          { chunk_id: 2, data: [0x03, 0x04] },
          { chunk_id: 3, data: [0x05, 0x06] }
        ],
        footer: {
          // last_chunk_offset computed to point to last DataChunk
        }
      },
      decoded_value: {
        chunks: [
          { chunk_id: 1, data: [0x01, 0x02] },
          { chunk_id: 2, data: [0x03, 0x04] },
          { chunk_id: 3, data: [0x05, 0x06] }
        ],
        footer: {
          last_chunk_offset: 6  // Position of third chunk (after first two: 3 + 3 bytes)
        }
      },
      bytes: [
        // chunks[0] (starts at position 0)
        1, 0x01, 0x02,
        // chunks[1] (starts at position 3)
        2, 0x03, 0x04,
        // chunks[2] (starts at position 6)
        3, 0x05, 0x06,
        // footer
        6, 0, 0, 0  // last_chunk_offset = 6 (AUTO-COMPUTED)
      ]
    }
  ]
});

/**
 * Test empty array edge case
 */
export const emptyArrayCorrelationTestSuite = defineTestSuite({
  name: "empty_array_correlation",
  description: "Array correlation with no matching elements",
  schema: {
    config: { endianness: "little_endian" },
    types: {
      "Item": {
        sequence: [
          { name: "value", type: "uint8" }
        ]
      },
      "Index": {
        sequence: [
          {
            name: "first_item_offset",
            type: "uint32",
            computed: {
              type: "position_of",
              target: "../items[first<Item>]"
            }
          }
        ]
      },
      "EmptyContainer": {
        sequence: [
          {
            name: "items",
            type: "array",
            kind: "fixed",
            length: 0,  // Empty array
            items: { type: "Item" }
          },
          { name: "index", type: "Index" }
        ]
      }
    }
  },
  test_type: "EmptyContainer",
  test_cases: [
    {
      description: "Empty array produces 0xFFFFFFFF offset (not found marker)",
      value: {
        items: [],
        index: {
          // first_item_offset computed, but no items exist
        }
      },
      decoded_value: {
        items: [],
        index: {
          first_item_offset: 0xFFFFFFFF  // Special value indicating "not found"
        }
      },
      bytes: [
        // items (empty)
        // index
        0xFF, 0xFF, 0xFF, 0xFF  // first_item_offset = 0xFFFFFFFF (not found)
      ]
    }
  ]
});

/**
 * Test ZIP-style correlation (realistic example)
 */
export const zipStyleCorrelationTestSuite = defineTestSuite({
  name: "zip_style_correlation",
  description: "Realistic ZIP-style local header and central directory correlation",
  schema: {
    config: { endianness: "little_endian" },
    types: {
      "LocalFileHeader": {
        sequence: [
          { name: "signature", type: "uint32" },  // 0x04034b50
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
          { name: "signature", type: "uint32" },  // 0x02014b50
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
            name: "local_header_offset",
            type: "uint32",
            computed: {
              type: "position_of",
              target: "../sections[same_index<LocalFileHeader>]"
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
      "ZipArchive": {
        sequence: [
          {
            name: "sections",
            type: "array",
            kind: "fixed",
            length: 4,  // 2 local headers + 2 central dir entries
            items: {
              type: "choice",
              choices: [
                { type: "LocalFileHeader" },
                { type: "CentralDirEntry" }
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
      description: "Two files with local headers followed by central directory",
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
          // Central directory entries (reference corresponding local headers)
          {
            type: "CentralDirEntry",
            signature: 0x02014b50,
            filename: "a.txt"
            // local_header_offset computed
          },
          {
            type: "CentralDirEntry",
            signature: 0x02014b50,
            filename: "b.txt"
            // local_header_offset computed
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
            local_header_offset: 0,  // Position of first LocalFileHeader
            filename: "a.txt"
          },
          {
            type: "CentralDirEntry",
            signature: 0x02014b50,
            filename_length: 5,
            local_header_offset: 13,  // Position of second LocalFileHeader
            filename: "b.txt"
          }
        ]
      },
      bytes: [
        // sections[0]: LocalFileHeader for "a.txt" (starts at position 0)
        0x50, 0x4b, 0x03, 0x04,  // signature
        20, 0,  // version
        5, 0,  // filename_length (AUTO-COMPUTED)
        0x61, 0x2e, 0x74, 0x78, 0x74,  // "a.txt"

        // sections[1]: LocalFileHeader for "b.txt" (starts at position 13)
        0x50, 0x4b, 0x03, 0x04,  // signature
        20, 0,  // version
        5, 0,  // filename_length (AUTO-COMPUTED)
        0x62, 0x2e, 0x74, 0x78, 0x74,  // "b.txt"

        // sections[2]: CentralDirEntry for "a.txt" (starts at position 26)
        0x50, 0x4b, 0x01, 0x02,  // signature
        5, 0,  // filename_length (AUTO-COMPUTED)
        0, 0, 0, 0,  // local_header_offset = 0 (AUTO-COMPUTED)
        0x61, 0x2e, 0x74, 0x78, 0x74,  // "a.txt"

        // sections[3]: CentralDirEntry for "b.txt" (starts at position 37)
        0x50, 0x4b, 0x01, 0x02,  // signature
        5, 0,  // filename_length (AUTO-COMPUTED)
        13, 0, 0, 0,  // local_header_offset = 13 (AUTO-COMPUTED)
        0x62, 0x2e, 0x74, 0x78, 0x74  // "b.txt"
      ]
    }
  ]
});
