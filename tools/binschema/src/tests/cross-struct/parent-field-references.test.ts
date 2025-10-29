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
        2, 0,  // version
        0, 0, 0, 0,  // body_length = 0
      ]
    }
  ]
});

/**
 * Test multiple parent references in same struct
 */
export const multipleParentReferencesTestSuite = defineTestSuite({
  name: "multiple_parent_references",
  description: "Multiple computed fields referencing different parent fields",
  schema: {
    config: { endianness: "little_endian" },
    types: {
      "Header": {
        sequence: [
          { name: "magic", type: "uint32" },
          {
            name: "uncompressed_length",
            type: "uint32",
            computed: {
              type: "length_of",
              target: "../uncompressed_data"
            }
          },
          {
            name: "compressed_length",
            type: "uint32",
            computed: {
              type: "length_of",
              target: "../compressed_data"
            }
          }
        ]
      },
      "CompressedBlock": {
        sequence: [
          { name: "header", type: "Header" },
          {
            name: "uncompressed_data",
            type: "array",
            kind: "field_referenced",
            length_field: "header.uncompressed_length",
            items: { type: "uint8" }
          },
          {
            name: "compressed_data",
            type: "array",
            kind: "field_referenced",
            length_field: "header.compressed_length",
            items: { type: "uint8" }
          }
        ]
      }
    }
  },
  test_type: "CompressedBlock",
  test_cases: [
    {
      description: "Two parent references from same child struct",
      value: {
        header: {
          magic: 0x504B0304  // ZIP local file signature
          // uncompressed_length and compressed_length are computed
        },
        uncompressed_data: [0x01, 0x02, 0x03, 0x04, 0x05],
        compressed_data: [0x78, 0x9C, 0x63]  // Deflated data (shorter)
      },
      decoded_value: {
        header: {
          magic: 0x504B0304,
          uncompressed_length: 5,
          compressed_length: 3
        },
        uncompressed_data: [0x01, 0x02, 0x03, 0x04, 0x05],
        compressed_data: [0x78, 0x9C, 0x63]
      },
      bytes: [
        // header.magic (uint32 LE)
        0x04, 0x03, 0x4B, 0x50,
        // header.uncompressed_length (uint32 LE) - AUTO-COMPUTED
        5, 0, 0, 0,
        // header.compressed_length (uint32 LE) - AUTO-COMPUTED
        3, 0, 0, 0,
        // uncompressed_data (5 bytes)
        0x01, 0x02, 0x03, 0x04, 0x05,
        // compressed_data (3 bytes)
        0x78, 0x9C, 0x63
      ]
    }
  ]
});

/**
 * Test nested parent references (grandparent reference)
 */
export const nestedParentReferencesTestSuite = defineTestSuite({
  name: "nested_parent_references",
  description: "Computed field referencing grandparent struct field",
  schema: {
    config: { endianness: "little_endian" },
    types: {
      "DeepHeader": {
        sequence: [
          {
            name: "payload_length",
            type: "uint16",
            computed: {
              type: "length_of",
              target: "../../payload"  // Reference grandparent's payload
            }
          }
        ]
      },
      "MiddleStruct": {
        sequence: [
          { name: "deep_header", type: "DeepHeader" }
        ]
      },
      "OuterMessage": {
        sequence: [
          { name: "middle", type: "MiddleStruct" },
          {
            name: "payload",
            type: "array",
            kind: "field_referenced",
            length_field: "middle.deep_header.payload_length",
            items: { type: "uint8" }
          }
        ]
      }
    }
  },
  test_type: "OuterMessage",
  test_cases: [
    {
      description: "Grandparent reference with ../../ syntax",
      value: {
        middle: {
          deep_header: {
            // payload_length is computed from ../../payload
          }
        },
        payload: [0xDE, 0xAD, 0xBE, 0xEF]
      },
      decoded_value: {
        middle: {
          deep_header: {
            payload_length: 4
          }
        },
        payload: [0xDE, 0xAD, 0xBE, 0xEF]
      },
      bytes: [
        // middle.deep_header.payload_length (uint16 LE) - AUTO-COMPUTED
        4, 0,
        // payload (4 bytes)
        0xDE, 0xAD, 0xBE, 0xEF
      ]
    }
  ]
});

/**
 * Test parent reference with string fields (UTF-8 length)
 */
export const parentReferenceStringLengthTestSuite = defineTestSuite({
  name: "parent_reference_string_length",
  description: "Computed length_of referencing parent's string field",
  schema: {
    config: { endianness: "little_endian" },
    types: {
      "StringHeader": {
        sequence: [
          { name: "flags", type: "uint8" },
          {
            name: "filename_length",
            type: "uint16",
            computed: {
              type: "length_of",
              target: "../filename",
              encoding: "utf8"
            }
          }
        ]
      },
      "FileEntry": {
        sequence: [
          { name: "header", type: "StringHeader" },
          {
            name: "filename",
            type: "string",
            kind: "field_referenced",
            length_field: "header.filename_length",
            encoding: "utf8"
          }
        ]
      }
    }
  },
  test_type: "FileEntry",
  test_cases: [
    {
      description: "ASCII filename",
      value: {
        header: {
          flags: 0x01
          // filename_length is computed from ../filename
        },
        filename: "test.txt"
      },
      decoded_value: {
        header: {
          flags: 0x01,
          filename_length: 8  // "test.txt" is 8 bytes
        },
        filename: "test.txt"
      },
      bytes: [
        // header.flags (uint8)
        0x01,
        // header.filename_length (uint16 LE) - AUTO-COMPUTED
        8, 0,
        // filename (8 bytes UTF-8)
        0x74, 0x65, 0x73, 0x74, 0x2E, 0x74, 0x78, 0x74  // "test.txt"
      ]
    },
    {
      description: "UTF-8 filename with emoji",
      value: {
        header: {
          flags: 0x02
        },
        filename: "📄data.json"  // emoji is 4 bytes + "data.json" is 9 bytes = 13 bytes
      },
      decoded_value: {
        header: {
          flags: 0x02,
          filename_length: 13
        },
        filename: "📄data.json"
      },
      bytes: [
        // header.flags (uint8)
        0x02,
        // header.filename_length (uint16 LE) - AUTO-COMPUTED
        13, 0,
        // filename (13 bytes UTF-8)
        0xF0, 0x9F, 0x93, 0x84,  // 📄 emoji (4 bytes)
        0x64, 0x61, 0x74, 0x61, 0x2E, 0x6A, 0x73, 0x6F, 0x6E  // "data.json" (9 bytes)
      ]
    },
    {
      description: "Empty filename",
      value: {
        header: {
          flags: 0x00
        },
        filename: ""
      },
      decoded_value: {
        header: {
          flags: 0x00,
          filename_length: 0
        },
        filename: ""
      },
      bytes: [
        0x00,  // flags
        0, 0   // filename_length = 0
      ]
    }
  ]
});

/**
 * Test parent reference with CRC32
 */
export const parentReferenceCrc32TestSuite = defineTestSuite({
  name: "parent_reference_crc32",
  description: "Computed crc32_of referencing parent's field",
  schema: {
    config: { endianness: "little_endian" },
    types: {
      "ChecksumHeader": {
        sequence: [
          {
            name: "data_crc32",
            type: "uint32",
            computed: {
              type: "crc32_of",
              target: "../data"
            }
          }
        ]
      },
      "ChecksummedData": {
        sequence: [
          { name: "header", type: "ChecksumHeader" },
          {
            name: "data",
            type: "array",
            kind: "fixed",
            length: 4,
            items: { type: "uint8" }
          }
        ]
      }
    }
  },
  test_type: "ChecksummedData",
  test_cases: [
    {
      description: "CRC32 of parent's data field",
      value: {
        header: {
          // data_crc32 is computed from ../data
        },
        data: [0x01, 0x02, 0x03, 0x04]
      },
      decoded_value: {
        header: {
          data_crc32: 0xB63CFBCD  // CRC32 of [0x01, 0x02, 0x03, 0x04]
        },
        data: [0x01, 0x02, 0x03, 0x04]
      },
      bytes: [
        // header.data_crc32 (uint32 LE) - AUTO-COMPUTED
        0xCD, 0xFB, 0x3C, 0xB6,
        // data (4 bytes)
        0x01, 0x02, 0x03, 0x04
      ]
    }
  ]
});

/**
 * Test parent reference with position_of
 */
export const parentReferencePositionTestSuite = defineTestSuite({
  name: "parent_reference_position",
  description: "Computed position_of referencing parent's field",
  schema: {
    config: { endianness: "little_endian" },
    types: {
      "OffsetHeader": {
        sequence: [
          { name: "flags", type: "uint8" },
          {
            name: "data_offset",
            type: "uint32",
            computed: {
              type: "position_of",
              target: "../data"
            }
          }
        ]
      },
      "OffsetData": {
        sequence: [
          { name: "header", type: "OffsetHeader" },
          {
            name: "data",
            type: "array",
            kind: "fixed",
            length: 3,
            items: { type: "uint8" }
          }
        ]
      }
    }
  },
  test_type: "OffsetData",
  test_cases: [
    {
      description: "Position of parent's data field",
      value: {
        header: {
          flags: 0xFF
          // data_offset is computed from ../data position
        },
        data: [0xAA, 0xBB, 0xCC]
      },
      decoded_value: {
        header: {
          flags: 0xFF,
          data_offset: 5  // Position after flags (1 byte) + data_offset (4 bytes)
        },
        data: [0xAA, 0xBB, 0xCC]
      },
      bytes: [
        // header.flags (uint8)
        0xFF,
        // header.data_offset (uint32 LE) - AUTO-COMPUTED = 5
        5, 0, 0, 0,
        // data (3 bytes) - starts at position 5
        0xAA, 0xBB, 0xCC
      ]
    }
  ]
});
