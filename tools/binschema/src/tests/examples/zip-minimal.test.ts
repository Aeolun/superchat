// ABOUTME: Minimal ZIP archive test demonstrating random access features
// ABOUTME: Tests end-of-central-directory at EOF and position-based parsing

import { defineTestSuite } from "../../schema/test-schema.js";

/**
 * Minimal ZIP archive with single file
 * Demonstrates:
 * - Negative position (end_of_central_dir at EOF)
 * - Size field reference (central_directory size from instance field)
 * - Position field reference (central_directory offset from instance field)
 * - _root references (array length from root type's instance field)
 */
export const zipMinimalTestSuite = defineTestSuite({
  name: "zip_minimal",
  description: "Minimal ZIP archive with random access features",
  schema: {
    config: { endianness: "little_endian" },
    types: {
      "ZipArchive": {
        sequence: [
          // In a real ZIP, local files would be here
          // For this test, we'll just have a single local file header
          { "name": "local_file", "type": "LocalFileHeader" }
        ],
        instances: [
          // End of central directory (last 22 bytes)
          {
            "name": "end_of_central_dir",
            "type": "EndOfCentralDir",
            "position": -22,
            "size": 22
          },
          // Central directory (lazy, read when accessed)
          {
            "name": "central_directory",
            "type": "CentralDirectory",
            "position": "end_of_central_dir.central_dir_offset",
            "size": "end_of_central_dir.central_dir_size"
          }
        ]
      },

      "LocalFileHeader": {
        sequence: [
          { "name": "signature", "type": "uint32" },  // 0x04034b50
          { "name": "version", "type": "uint16" },
          { "name": "flags", "type": "uint16" },
          { "name": "filename_length", "type": "uint16" },
          {
            "name": "filename",
            "type": "string",
            "kind": "fixed",
            "length_field": "filename_length",
            "encoding": "utf8"
          }
        ]
      },

      "EndOfCentralDir": {
        sequence: [
          { "name": "signature", "type": "uint32" },  // 0x06054b50
          { "name": "disk_number", "type": "uint16" },
          { "name": "disk_with_cd", "type": "uint16" },
          { "name": "disk_entries", "type": "uint16" },
          { "name": "total_entries", "type": "uint16" },
          { "name": "central_dir_size", "type": "uint32" },
          { "name": "central_dir_offset", "type": "uint32" },
          { "name": "comment_length", "type": "uint16" }
        ]
      },

      "CentralDirectory": {
        "sequence": [
          {
            "name": "entries",
            "type": "array",
            "kind": "field_referenced",
            "length_field": "_root.end_of_central_dir.total_entries",
            "items": { "type": "CentralDirEntry" }
          }
        ]
      },

      "CentralDirEntry": {
        sequence: [
          { "name": "signature", "type": "uint32" },  // 0x02014b50
          { "name": "version_made_by", "type": "uint16" },
          { "name": "filename_length", "type": "uint16" },
          {
            "name": "filename",
            "type": "string",
            "kind": "fixed",
            "length_field": "filename_length",
            "encoding": "utf8"
          }
        ]
      }
    }
  },
  test_type: "ZipArchive",
  test_cases: [
    {
      description: "Minimal ZIP with single file entry",
      bytes: [
        // Local file header at offset 0
        0x50, 0x4b, 0x03, 0x04,  // signature (PK\x03\x04)
        0x0A, 0x00,              // version = 10
        0x00, 0x00,              // flags = 0
        0x08, 0x00,              // filename_length = 8
        // Filename "test.txt"
        0x74, 0x65, 0x73, 0x74, 0x2e, 0x74, 0x78, 0x74,

        // Central directory at offset 18
        // Central dir entry
        0x50, 0x4b, 0x01, 0x02,  // signature (PK\x01\x02)
        0x14, 0x00,              // version_made_by = 20
        0x08, 0x00,              // filename_length = 8
        // Filename "test.txt"
        0x74, 0x65, 0x73, 0x74, 0x2e, 0x74, 0x78, 0x74,

        // End of central directory at offset 36 (last 22 bytes)
        0x50, 0x4b, 0x05, 0x06,  // signature (PK\x05\x06)
        0x00, 0x00,              // disk_number = 0
        0x00, 0x00,              // disk_with_cd = 0
        0x01, 0x00,              // disk_entries = 1
        0x01, 0x00,              // total_entries = 1
        0x12, 0x00, 0x00, 0x00,  // central_dir_size = 18
        0x12, 0x00, 0x00, 0x00,  // central_dir_offset = 18
        0x00, 0x00               // comment_length = 0
      ],
      value: {
        local_file: {
          signature: 0x04034b50,
          version: 10,
          flags: 0,
          filename_length: 8,
          filename: "test.txt"
        },
        end_of_central_dir: {
          signature: 0x06054b50,
          disk_number: 0,
          disk_with_cd: 0,
          disk_entries: 1,
          total_entries: 1,
          central_dir_size: 18,
          central_dir_offset: 18,
          comment_length: 0
        },
        central_directory: {
          entries: [
            {
              signature: 0x02014b50,
              version_made_by: 20,
              filename_length: 8,
              filename: "test.txt"
            }
          ]
        }
      }
    }
  ]
});
