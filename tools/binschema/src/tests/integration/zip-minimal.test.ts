// ABOUTME: Integration test for minimal single-file ZIP archive
// ABOUTME: Tests all computed fields working together for valid ZIP format

import { defineTestSuite } from "../../schema/test-schema.js";

/**
 * Minimal valid ZIP archive with single uncompressed file
 *
 * This test validates that all cross-struct references work together:
 * - LocalFileHeader.len_body_compressed references ../body (parent reference)
 * - CentralDirEntry.ofs_local_header references position of LocalFile (array correlation)
 * - EndOfCentralDir.ofs_central_dir references position of first CentralDirEntry
 * - EndOfCentralDir.len_central_dir sums size of all CentralDirEntry elements
 *
 * The resulting bytes should be a valid ZIP that opens in unzip/7zip.
 */
export const minimalZipSingleFileTestSuite = defineTestSuite({
  name: "minimal_zip_single_file",
  description: "Single uncompressed file in valid ZIP archive",
  schema: {
    config: { endianness: "little_endian" },
    types: {
      "LocalFileHeader": {
        sequence: [
          { name: "version", type: "uint16" },
          { name: "flags", type: "uint16" },
          { name: "compression_method", type: "uint16" },
          { name: "file_mod_time", type: "uint16" },
          { name: "file_mod_date", type: "uint16" },
          {
            name: "crc32",
            type: "uint32",
            computed: {
              type: "crc32_of",
              target: "../body"  // CRC of parent's body field
            }
          },
          {
            name: "len_body_compressed",
            type: "uint32",
            computed: {
              type: "length_of",
              target: "../body"  // Length of parent's body field
            }
          },
          {
            name: "len_body_uncompressed",
            type: "uint32",
            computed: {
              type: "length_of",
              target: "../body"  // Same as compressed for store method
            }
          },
          {
            name: "len_file_name",
            type: "uint16",
            computed: {
              type: "length_of",
              target: "file_name",
              encoding: "utf8"
            }
          },
          { name: "len_extra", type: "uint16" },  // Always 0 for minimal ZIP
          {
            name: "file_name",
            type: "string",
            kind: "field_referenced",
            length_field: "len_file_name",
            encoding: "utf8"
          }
        ]
      },
      "LocalFile": {
        sequence: [
          { name: "signature", type: "uint32" },  // 0x04034b50
          { name: "header", type: "LocalFileHeader" },
          {
            name: "body",
            type: "array",
            kind: "field_referenced",
            length_field: "header.len_body_compressed",
            items: { type: "uint8" }
          }
        ]
      },
      "CentralDirEntry": {
        sequence: [
          { name: "signature", type: "uint32" },  // 0x02014b50
          { name: "version_made_by", type: "uint16" },
          { name: "version_needed", type: "uint16" },
          { name: "flags", type: "uint16" },
          { name: "compression_method", type: "uint16" },
          { name: "file_mod_time", type: "uint16" },
          { name: "file_mod_date", type: "uint16" },
          {
            name: "crc32",
            type: "uint32",
            computed: {
              type: "crc32_of",
              target: "../sections[same_index<LocalFile>].body"
            }
          },
          {
            name: "len_body_compressed",
            type: "uint32",
            computed: {
              type: "length_of",
              target: "../sections[same_index<LocalFile>].body"
            }
          },
          {
            name: "len_body_uncompressed",
            type: "uint32",
            computed: {
              type: "length_of",
              target: "../sections[same_index<LocalFile>].body"
            }
          },
          {
            name: "len_file_name",
            type: "uint16",
            computed: {
              type: "length_of",
              target: "file_name",
              encoding: "utf8"
            }
          },
          { name: "len_extra", type: "uint16" },
          { name: "len_comment", type: "uint16" },
          { name: "disk_number_start", type: "uint16" },
          { name: "int_file_attr", type: "uint16" },
          { name: "ext_file_attr", type: "uint32" },
          {
            name: "ofs_local_header",
            type: "uint32",
            computed: {
              type: "position_of",
              target: "../sections[same_index<LocalFile>]"
            }
          },
          {
            name: "file_name",
            type: "string",
            kind: "field_referenced",
            length_field: "len_file_name",
            encoding: "utf8"
          }
        ]
      },
      "EndOfCentralDir": {
        sequence: [
          { name: "signature", type: "uint32" },  // 0x06054b50
          { name: "disk_number", type: "uint16" },
          { name: "disk_with_central_dir", type: "uint16" },
          { name: "num_entries_this_disk", type: "uint16" },
          { name: "num_entries_total", type: "uint16" },
          {
            name: "len_central_dir",
            type: "uint32",
            computed: {
              type: "sum_of_type_sizes",
              target: "../sections",
              element_type: "CentralDirEntry"
            }
          },
          {
            name: "ofs_central_dir",
            type: "uint32",
            computed: {
              type: "position_of",
              target: "../sections[first<CentralDirEntry>]"
            }
          },
          { name: "len_comment", type: "uint16" }
        ]
      },
      "ZipArchive": {
        sequence: [
          {
            name: "sections",
            type: "array",
            kind: "fixed",
            length: 3,  // 1 local file + 1 central dir entry + 1 end record
            items: {
              type: "choice",
              choices: [
                { type: "LocalFile" },
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
      description: "Single file 'hello.txt' with content 'Hello, World!'",
      value: {
        sections: [
          // Local file
          {
            type: "LocalFile",
            signature: 0x04034b50,
            header: {
              version: 20,
              flags: 0,
              compression_method: 0,  // Store (no compression)
              file_mod_time: 0,
              file_mod_date: 0,
              len_extra: 0,
              file_name: "hello.txt"
              // crc32, len_body_compressed, len_body_uncompressed, len_file_name are computed
            },
            body: [0x48, 0x65, 0x6C, 0x6C, 0x6F, 0x2C, 0x20, 0x57, 0x6F, 0x72, 0x6C, 0x64, 0x21]  // "Hello, World!"
          },
          // Central directory entry
          {
            type: "CentralDirEntry",
            signature: 0x02014b50,
            version_made_by: 20,
            version_needed: 20,
            flags: 0,
            compression_method: 0,
            file_mod_time: 0,
            file_mod_date: 0,
            len_extra: 0,
            len_comment: 0,
            disk_number_start: 0,
            int_file_attr: 0,
            ext_file_attr: 0,
            file_name: "hello.txt"
            // crc32, lengths, ofs_local_header, len_file_name are computed
          },
          // End of central directory
          {
            type: "EndOfCentralDir",
            signature: 0x06054b50,
            disk_number: 0,
            disk_with_central_dir: 0,
            num_entries_this_disk: 1,
            num_entries_total: 1,
            len_comment: 0
            // len_central_dir and ofs_central_dir are computed
          }
        ]
      },
      decoded_value: {
        sections: [
          {
            type: "LocalFile",
            signature: 0x04034b50,
            header: {
              version: 20,
              flags: 0,
              compression_method: 0,
              file_mod_time: 0,
              file_mod_date: 0,
              crc32: 0x0D4A1185,  // CRC32 of "Hello, World!"
              len_body_compressed: 13,
              len_body_uncompressed: 13,
              len_file_name: 9,
              len_extra: 0,
              file_name: "hello.txt"
            },
            body: [0x48, 0x65, 0x6C, 0x6C, 0x6F, 0x2C, 0x20, 0x57, 0x6F, 0x72, 0x6C, 0x64, 0x21]
          },
          {
            type: "CentralDirEntry",
            signature: 0x02014b50,
            version_made_by: 20,
            version_needed: 20,
            flags: 0,
            compression_method: 0,
            file_mod_time: 0,
            file_mod_date: 0,
            crc32: 0x0D4A1185,
            len_body_compressed: 13,
            len_body_uncompressed: 13,
            len_file_name: 9,
            len_extra: 0,
            len_comment: 0,
            disk_number_start: 0,
            int_file_attr: 0,
            ext_file_attr: 0,
            ofs_local_header: 0,  // Position of LocalFile (at start)
            file_name: "hello.txt"
          },
          {
            type: "EndOfCentralDir",
            signature: 0x06054b50,
            disk_number: 0,
            disk_with_central_dir: 0,
            num_entries_this_disk: 1,
            num_entries_total: 1,
            len_central_dir: 51,  // Size of CentralDirEntry
            ofs_central_dir: 52,  // Position of CentralDirEntry
            len_comment: 0
          }
        ]
      },
      bytes: [
        // LocalFile (starts at position 0, 52 bytes total)
        // signature
        0x50, 0x4b, 0x03, 0x04,
        // header.version
        20, 0,
        // header.flags
        0, 0,
        // header.compression_method
        0, 0,
        // header.file_mod_time
        0, 0,
        // header.file_mod_date
        0, 0,
        // header.crc32 (AUTO-COMPUTED)
        0x85, 0x11, 0x4A, 0x0D,
        // header.len_body_compressed (AUTO-COMPUTED)
        13, 0, 0, 0,
        // header.len_body_uncompressed (AUTO-COMPUTED)
        13, 0, 0, 0,
        // header.len_file_name (AUTO-COMPUTED)
        9, 0,
        // header.len_extra
        0, 0,
        // header.file_name
        0x68, 0x65, 0x6C, 0x6C, 0x6F, 0x2E, 0x74, 0x78, 0x74,  // "hello.txt"
        // body
        0x48, 0x65, 0x6C, 0x6C, 0x6F, 0x2C, 0x20, 0x57, 0x6F, 0x72, 0x6C, 0x64, 0x21,  // "Hello, World!"

        // CentralDirEntry (starts at position 52, 51 bytes total)
        // signature
        0x50, 0x4b, 0x01, 0x02,
        // version_made_by
        20, 0,
        // version_needed
        20, 0,
        // flags
        0, 0,
        // compression_method
        0, 0,
        // file_mod_time
        0, 0,
        // file_mod_date
        0, 0,
        // crc32 (AUTO-COMPUTED)
        0x85, 0x11, 0x4A, 0x0D,
        // len_body_compressed (AUTO-COMPUTED)
        13, 0, 0, 0,
        // len_body_uncompressed (AUTO-COMPUTED)
        13, 0, 0, 0,
        // len_file_name (AUTO-COMPUTED)
        9, 0,
        // len_extra
        0, 0,
        // len_comment
        0, 0,
        // disk_number_start
        0, 0,
        // int_file_attr
        0, 0,
        // ext_file_attr
        0, 0, 0, 0,
        // ofs_local_header (AUTO-COMPUTED)
        0, 0, 0, 0,
        // file_name
        0x68, 0x65, 0x6C, 0x6C, 0x6F, 0x2E, 0x74, 0x78, 0x74,  // "hello.txt"

        // EndOfCentralDir (starts at position 103, 22 bytes total)
        // signature
        0x50, 0x4b, 0x05, 0x06,
        // disk_number
        0, 0,
        // disk_with_central_dir
        0, 0,
        // num_entries_this_disk
        1, 0,
        // num_entries_total
        1, 0,
        // len_central_dir (AUTO-COMPUTED)
        51, 0, 0, 0,
        // ofs_central_dir (AUTO-COMPUTED)
        52, 0, 0, 0,
        // len_comment
        0, 0
      ]
    },
    {
      description: "Empty file 'empty.txt'",
      value: {
        sections: [
          {
            type: "LocalFile",
            signature: 0x04034b50,
            header: {
              version: 20,
              flags: 0,
              compression_method: 0,
              file_mod_time: 0,
              file_mod_date: 0,
              len_extra: 0,
              file_name: "empty.txt"
            },
            body: []  // Empty file
          },
          {
            type: "CentralDirEntry",
            signature: 0x02014b50,
            version_made_by: 20,
            version_needed: 20,
            flags: 0,
            compression_method: 0,
            file_mod_time: 0,
            file_mod_date: 0,
            len_extra: 0,
            len_comment: 0,
            disk_number_start: 0,
            int_file_attr: 0,
            ext_file_attr: 0,
            file_name: "empty.txt"
          },
          {
            type: "EndOfCentralDir",
            signature: 0x06054b50,
            disk_number: 0,
            disk_with_central_dir: 0,
            num_entries_this_disk: 1,
            num_entries_total: 1,
            len_comment: 0
          }
        ]
      },
      decoded_value: {
        sections: [
          {
            type: "LocalFile",
            signature: 0x04034b50,
            header: {
              version: 20,
              flags: 0,
              compression_method: 0,
              file_mod_time: 0,
              file_mod_date: 0,
              crc32: 0x00000000,  // CRC32 of empty data
              len_body_compressed: 0,
              len_body_uncompressed: 0,
              len_file_name: 9,
              len_extra: 0,
              file_name: "empty.txt"
            },
            body: []
          },
          {
            type: "CentralDirEntry",
            signature: 0x02014b50,
            version_made_by: 20,
            version_needed: 20,
            flags: 0,
            compression_method: 0,
            file_mod_time: 0,
            file_mod_date: 0,
            crc32: 0x00000000,
            len_body_compressed: 0,
            len_body_uncompressed: 0,
            len_file_name: 9,
            len_extra: 0,
            len_comment: 0,
            disk_number_start: 0,
            int_file_attr: 0,
            ext_file_attr: 0,
            ofs_local_header: 0,
            file_name: "empty.txt"
          },
          {
            type: "EndOfCentralDir",
            signature: 0x06054b50,
            disk_number: 0,
            disk_with_central_dir: 0,
            num_entries_this_disk: 1,
            num_entries_total: 1,
            len_central_dir: 51,
            ofs_central_dir: 39,  // Position after LocalFile (39 bytes for empty file)
            len_comment: 0
          }
        ]
      },
      bytes: [
        // LocalFile (39 bytes)
        0x50, 0x4b, 0x03, 0x04,  // signature
        20, 0,  // version
        0, 0,   // flags
        0, 0,   // compression_method
        0, 0,   // file_mod_time
        0, 0,   // file_mod_date
        0, 0, 0, 0,  // crc32 = 0
        0, 0, 0, 0,  // len_body_compressed = 0
        0, 0, 0, 0,  // len_body_uncompressed = 0
        9, 0,   // len_file_name = 9
        0, 0,   // len_extra = 0
        0x65, 0x6D, 0x70, 0x74, 0x79, 0x2E, 0x74, 0x78, 0x74,  // "empty.txt"
        // body (empty)

        // CentralDirEntry (51 bytes, starts at position 39)
        0x50, 0x4b, 0x01, 0x02,  // signature
        20, 0,  // version_made_by
        20, 0,  // version_needed
        0, 0,   // flags
        0, 0,   // compression_method
        0, 0,   // file_mod_time
        0, 0,   // file_mod_date
        0, 0, 0, 0,  // crc32 = 0
        0, 0, 0, 0,  // len_body_compressed = 0
        0, 0, 0, 0,  // len_body_uncompressed = 0
        9, 0,   // len_file_name = 9
        0, 0,   // len_extra = 0
        0, 0,   // len_comment = 0
        0, 0,   // disk_number_start = 0
        0, 0,   // int_file_attr = 0
        0, 0, 0, 0,  // ext_file_attr = 0
        0, 0, 0, 0,  // ofs_local_header = 0
        0x65, 0x6D, 0x70, 0x74, 0x79, 0x2E, 0x74, 0x78, 0x74,  // "empty.txt"

        // EndOfCentralDir (22 bytes, starts at position 90)
        0x50, 0x4b, 0x05, 0x06,  // signature
        0, 0,   // disk_number
        0, 0,   // disk_with_central_dir
        1, 0,   // num_entries_this_disk = 1
        1, 0,   // num_entries_total = 1
        51, 0, 0, 0,  // len_central_dir = 51
        39, 0, 0, 0,  // ofs_central_dir = 39
        0, 0    // len_comment = 0
      ]
    }
  ]
});
