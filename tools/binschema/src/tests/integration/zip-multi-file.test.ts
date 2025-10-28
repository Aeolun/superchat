// ABOUTME: Integration test for multi-file ZIP archive with complex correlations
// ABOUTME: Tests array correlation between multiple LocalFiles and CentralDirEntries

import { defineTestSuite } from "../../schema/test-schema.js";

/**
 * Multi-file ZIP archive with proper correlation
 *
 * This test validates:
 * - Multiple LocalFiles with different content lengths
 * - Multiple CentralDirEntries that correctly reference their corresponding LocalFiles
 * - Array correlation: CentralDirEntry[i].ofs_local_header → position of LocalFile[i]
 * - Aggregate size: EndOfCentralDir.len_central_dir = sum of all CentralDirEntry sizes
 * - Position tracking: EndOfCentralDir.ofs_central_dir = position of first CentralDirEntry
 */
export const multiFileZipTestSuite = defineTestSuite({
  name: "multi_file_zip",
  description: "Multiple files in valid ZIP archive with correlation",
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
              target: "../body"
            }
          },
          {
            name: "len_body_compressed",
            type: "uint32",
            computed: {
              type: "length_of",
              target: "../body"
            }
          },
          {
            name: "len_body_uncompressed",
            type: "uint32",
            computed: {
              type: "length_of",
              target: "../body"
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
          { name: "signature", type: "uint32" },
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
          { name: "signature", type: "uint32" },
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
          { name: "signature", type: "uint32" },
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
            length: 7,  // 3 local files + 3 central dir entries + 1 end record
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
      description: "Three files with different sizes",
      value: {
        sections: [
          // Local files
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
              file_name: "a.txt"
            },
            body: [0x41]  // "A"
          },
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
              file_name: "bb.txt"
            },
            body: [0x42, 0x42]  // "BB"
          },
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
              file_name: "ccc.txt"
            },
            body: [0x43, 0x43, 0x43]  // "CCC"
          },
          // Central directory entries
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
            file_name: "a.txt"
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
            file_name: "bb.txt"
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
            file_name: "ccc.txt"
          },
          // End of central directory
          {
            type: "EndOfCentralDir",
            signature: 0x06054b50,
            disk_number: 0,
            disk_with_central_dir: 0,
            num_entries_this_disk: 3,
            num_entries_total: 3,
            len_comment: 0
          }
        ]
      },
      decoded_value: {
        sections: [
          // Local files with computed fields
          {
            type: "LocalFile",
            signature: 0x04034b50,
            header: {
              version: 20,
              flags: 0,
              compression_method: 0,
              file_mod_time: 0,
              file_mod_date: 0,
              crc32: 0xD3D99E8B,  // CRC32("A")
              len_body_compressed: 1,
              len_body_uncompressed: 1,
              len_file_name: 5,
              len_extra: 0,
              file_name: "a.txt"
            },
            body: [0x41]
          },
          {
            type: "LocalFile",
            signature: 0x04034b50,
            header: {
              version: 20,
              flags: 0,
              compression_method: 0,
              file_mod_time: 0,
              file_mod_date: 0,
              crc32: 0x9D0B45E5,  // CRC32("BB")
              len_body_compressed: 2,
              len_body_uncompressed: 2,
              len_file_name: 6,
              len_extra: 0,
              file_name: "bb.txt"
            },
            body: [0x42, 0x42]
          },
          {
            type: "LocalFile",
            signature: 0x04034b50,
            header: {
              version: 20,
              flags: 0,
              compression_method: 0,
              file_mod_time: 0,
              file_mod_date: 0,
              crc32: 0xAA18567F,  // CRC32("CCC")
              len_body_compressed: 3,
              len_body_uncompressed: 3,
              len_file_name: 7,
              len_extra: 0,
              file_name: "ccc.txt"
            },
            body: [0x43, 0x43, 0x43]
          },
          // Central directory entries with computed correlations
          {
            type: "CentralDirEntry",
            signature: 0x02014b50,
            version_made_by: 20,
            version_needed: 20,
            flags: 0,
            compression_method: 0,
            file_mod_time: 0,
            file_mod_date: 0,
            crc32: 0xD3D99E8B,  // Matches first LocalFile
            len_body_compressed: 1,
            len_body_uncompressed: 1,
            len_file_name: 5,
            len_extra: 0,
            len_comment: 0,
            disk_number_start: 0,
            int_file_attr: 0,
            ext_file_attr: 0,
            ofs_local_header: 0,  // Position of first LocalFile
            file_name: "a.txt"
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
            crc32: 0x9D0B45E5,  // Matches second LocalFile
            len_body_compressed: 2,
            len_body_uncompressed: 2,
            len_file_name: 6,
            len_extra: 0,
            len_comment: 0,
            disk_number_start: 0,
            int_file_attr: 0,
            ext_file_attr: 0,
            ofs_local_header: 40,  // Position of second LocalFile (after first: 40 bytes)
            file_name: "bb.txt"
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
            crc32: 0xAA18567F,  // Matches third LocalFile
            len_body_compressed: 3,
            len_body_uncompressed: 3,
            len_file_name: 7,
            len_extra: 0,
            len_comment: 0,
            disk_number_start: 0,
            int_file_attr: 0,
            ext_file_attr: 0,
            ofs_local_header: 81,  // Position of third LocalFile (after first two: 40 + 41 bytes)
            file_name: "ccc.txt"
          },
          // End record with aggregate computations
          {
            type: "EndOfCentralDir",
            signature: 0x06054b50,
            disk_number: 0,
            disk_with_central_dir: 0,
            num_entries_this_disk: 3,
            num_entries_total: 3,
            len_central_dir: 156,  // Sum of 3 CentralDirEntry sizes (50 + 51 + 52)
            ofs_central_dir: 123,  // Position of first CentralDirEntry (after all LocalFiles)
            len_comment: 0
          }
        ]
      },
      bytes: [
        // LocalFile "a.txt" (40 bytes, starts at position 0)
        0x50, 0x4b, 0x03, 0x04,  // signature
        20, 0,  // version
        0, 0,   // flags
        0, 0,   // compression_method
        0, 0,   // file_mod_time
        0, 0,   // file_mod_date
        0x8B, 0x9E, 0xD9, 0xD3,  // crc32 (AUTO-COMPUTED)
        1, 0, 0, 0,  // len_body_compressed (AUTO-COMPUTED)
        1, 0, 0, 0,  // len_body_uncompressed (AUTO-COMPUTED)
        5, 0,   // len_file_name (AUTO-COMPUTED)
        0, 0,   // len_extra
        0x61, 0x2E, 0x74, 0x78, 0x74,  // "a.txt"
        0x41,   // body: "A"

        // LocalFile "bb.txt" (41 bytes, starts at position 40)
        0x50, 0x4b, 0x03, 0x04,  // signature
        20, 0,  // version
        0, 0,   // flags
        0, 0,   // compression_method
        0, 0,   // file_mod_time
        0, 0,   // file_mod_date
        0xE5, 0x45, 0x0B, 0x9D,  // crc32 (AUTO-COMPUTED)
        2, 0, 0, 0,  // len_body_compressed (AUTO-COMPUTED)
        2, 0, 0, 0,  // len_body_uncompressed (AUTO-COMPUTED)
        6, 0,   // len_file_name (AUTO-COMPUTED)
        0, 0,   // len_extra
        0x62, 0x62, 0x2E, 0x74, 0x78, 0x74,  // "bb.txt"
        0x42, 0x42,  // body: "BB"

        // LocalFile "ccc.txt" (42 bytes, starts at position 81)
        0x50, 0x4b, 0x03, 0x04,  // signature
        20, 0,  // version
        0, 0,   // flags
        0, 0,   // compression_method
        0, 0,   // file_mod_time
        0, 0,   // file_mod_date
        0x7F, 0x56, 0x18, 0xAA,  // crc32 (AUTO-COMPUTED)
        3, 0, 0, 0,  // len_body_compressed (AUTO-COMPUTED)
        3, 0, 0, 0,  // len_body_uncompressed (AUTO-COMPUTED)
        7, 0,   // len_file_name (AUTO-COMPUTED)
        0, 0,   // len_extra
        0x63, 0x63, 0x63, 0x2E, 0x74, 0x78, 0x74,  // "ccc.txt"
        0x43, 0x43, 0x43,  // body: "CCC"

        // CentralDirEntry "a.txt" (50 bytes, starts at position 123)
        0x50, 0x4b, 0x01, 0x02,  // signature
        20, 0,  // version_made_by
        20, 0,  // version_needed
        0, 0,   // flags
        0, 0,   // compression_method
        0, 0,   // file_mod_time
        0, 0,   // file_mod_date
        0x8B, 0x9E, 0xD9, 0xD3,  // crc32 (AUTO-COMPUTED)
        1, 0, 0, 0,  // len_body_compressed (AUTO-COMPUTED)
        1, 0, 0, 0,  // len_body_uncompressed (AUTO-COMPUTED)
        5, 0,   // len_file_name (AUTO-COMPUTED)
        0, 0,   // len_extra
        0, 0,   // len_comment
        0, 0,   // disk_number_start
        0, 0,   // int_file_attr
        0, 0, 0, 0,  // ext_file_attr
        0, 0, 0, 0,  // ofs_local_header = 0 (AUTO-COMPUTED)
        0x61, 0x2E, 0x74, 0x78, 0x74,  // "a.txt"

        // CentralDirEntry "bb.txt" (51 bytes, starts at position 173)
        0x50, 0x4b, 0x01, 0x02,  // signature
        20, 0,  // version_made_by
        20, 0,  // version_needed
        0, 0,   // flags
        0, 0,   // compression_method
        0, 0,   // file_mod_time
        0, 0,   // file_mod_date
        0xE5, 0x45, 0x0B, 0x9D,  // crc32 (AUTO-COMPUTED)
        2, 0, 0, 0,  // len_body_compressed (AUTO-COMPUTED)
        2, 0, 0, 0,  // len_body_uncompressed (AUTO-COMPUTED)
        6, 0,   // len_file_name (AUTO-COMPUTED)
        0, 0,   // len_extra
        0, 0,   // len_comment
        0, 0,   // disk_number_start
        0, 0,   // int_file_attr
        0, 0, 0, 0,  // ext_file_attr
        40, 0, 0, 0,  // ofs_local_header = 40 (AUTO-COMPUTED)
        0x62, 0x62, 0x2E, 0x74, 0x78, 0x74,  // "bb.txt"

        // CentralDirEntry "ccc.txt" (52 bytes, starts at position 224)
        0x50, 0x4b, 0x01, 0x02,  // signature
        20, 0,  // version_made_by
        20, 0,  // version_needed
        0, 0,   // flags
        0, 0,   // compression_method
        0, 0,   // file_mod_time
        0, 0,   // file_mod_date
        0x7F, 0x56, 0x18, 0xAA,  // crc32 (AUTO-COMPUTED)
        3, 0, 0, 0,  // len_body_compressed (AUTO-COMPUTED)
        3, 0, 0, 0,  // len_body_uncompressed (AUTO-COMPUTED)
        7, 0,   // len_file_name (AUTO-COMPUTED)
        0, 0,   // len_extra
        0, 0,   // len_comment
        0, 0,   // disk_number_start
        0, 0,   // int_file_attr
        0, 0, 0, 0,  // ext_file_attr
        81, 0, 0, 0,  // ofs_local_header = 81 (AUTO-COMPUTED)
        0x63, 0x63, 0x63, 0x2E, 0x74, 0x78, 0x74,  // "ccc.txt"

        // EndOfCentralDir (22 bytes, starts at position 276)
        0x50, 0x4b, 0x05, 0x06,  // signature
        0, 0,   // disk_number
        0, 0,   // disk_with_central_dir
        3, 0,   // num_entries_this_disk = 3
        3, 0,   // num_entries_total = 3
        156, 0, 0, 0,  // len_central_dir = 156 (AUTO-COMPUTED: 50 + 51 + 52)
        123, 0, 0, 0,  // ofs_central_dir = 123 (AUTO-COMPUTED)
        0, 0    // len_comment
      ]
    }
  ]
});

/**
 * Test mixed content with UTF-8 filenames
 */
export const multiFileUtf8FilenamesTestSuite = defineTestSuite({
  name: "multi_file_utf8_filenames",
  description: "Multiple files with UTF-8 filenames of varying byte lengths",
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
            computed: { type: "crc32_of", target: "../body" }
          },
          {
            name: "len_body_compressed",
            type: "uint32",
            computed: { type: "length_of", target: "../body" }
          },
          {
            name: "len_body_uncompressed",
            type: "uint32",
            computed: { type: "length_of", target: "../body" }
          },
          {
            name: "len_file_name",
            type: "uint16",
            computed: { type: "length_of", target: "file_name", encoding: "utf8" }
          },
          { name: "len_extra", type: "uint16" },
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
          { name: "signature", type: "uint32" },
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
          { name: "signature", type: "uint32" },
          { name: "version_made_by", type: "uint16" },
          { name: "version_needed", type: "uint16" },
          { name: "flags", type: "uint16" },
          { name: "compression_method", type: "uint16" },
          { name: "file_mod_time", type: "uint16" },
          { name: "file_mod_date", type: "uint16" },
          {
            name: "crc32",
            type: "uint32",
            computed: { type: "crc32_of", target: "../sections[same_index<LocalFile>].body" }
          },
          {
            name: "len_body_compressed",
            type: "uint32",
            computed: { type: "length_of", target: "../sections[same_index<LocalFile>].body" }
          },
          {
            name: "len_body_uncompressed",
            type: "uint32",
            computed: { type: "length_of", target: "../sections[same_index<LocalFile>].body" }
          },
          {
            name: "len_file_name",
            type: "uint16",
            computed: { type: "length_of", target: "file_name", encoding: "utf8" }
          },
          { name: "len_extra", type: "uint16" },
          { name: "len_comment", type: "uint16" },
          { name: "disk_number_start", type: "uint16" },
          { name: "int_file_attr", type: "uint16" },
          { name: "ext_file_attr", type: "uint32" },
          {
            name: "ofs_local_header",
            type: "uint32",
            computed: { type: "position_of", target: "../sections[same_index<LocalFile>]" }
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
          { name: "signature", type: "uint32" },
          { name: "disk_number", type: "uint16" },
          { name: "disk_with_central_dir", type: "uint16" },
          { name: "num_entries_this_disk", type: "uint16" },
          { name: "num_entries_total", type: "uint16" },
          {
            name: "len_central_dir",
            type: "uint32",
            computed: { type: "sum_of_type_sizes", target: "../sections", element_type: "CentralDirEntry" }
          },
          {
            name: "ofs_central_dir",
            type: "uint32",
            computed: { type: "position_of", target: "../sections[first<CentralDirEntry>]" }
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
            length: 5,  // 2 local files + 2 central dir entries + 1 end record
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
      description: "ASCII and UTF-8 filenames with emoji",
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
              file_name: "README.md"  // 9 bytes
            },
            body: [0x23, 0x20, 0x54, 0x65, 0x73, 0x74]  // "# Test"
          },
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
              file_name: "📄doc.txt"  // 11 bytes (4 for emoji + 7 for "doc.txt")
            },
            body: [0xF0, 0x9F, 0x93, 0x84]  // 📄 emoji as data
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
            file_name: "README.md"
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
            file_name: "📄doc.txt"
          },
          {
            type: "EndOfCentralDir",
            signature: 0x06054b50,
            disk_number: 0,
            disk_with_central_dir: 0,
            num_entries_this_disk: 2,
            num_entries_total: 2,
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
              crc32: 0x4F3C5A77,  // CRC32("# Test")
              len_body_compressed: 6,
              len_body_uncompressed: 6,
              len_file_name: 9,
              len_extra: 0,
              file_name: "README.md"
            },
            body: [0x23, 0x20, 0x54, 0x65, 0x73, 0x74]
          },
          {
            type: "LocalFile",
            signature: 0x04034b50,
            header: {
              version: 20,
              flags: 0,
              compression_method: 0,
              file_mod_time: 0,
              file_mod_date: 0,
              crc32: 0xCED9AE7B,  // CRC32 of emoji bytes
              len_body_compressed: 4,
              len_body_uncompressed: 4,
              len_file_name: 11,  // 4 bytes for emoji + 7 for "doc.txt"
              len_extra: 0,
              file_name: "📄doc.txt"
            },
            body: [0xF0, 0x9F, 0x93, 0x84]
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
            crc32: 0x4F3C5A77,
            len_body_compressed: 6,
            len_body_uncompressed: 6,
            len_file_name: 9,
            len_extra: 0,
            len_comment: 0,
            disk_number_start: 0,
            int_file_attr: 0,
            ext_file_attr: 0,
            ofs_local_header: 0,
            file_name: "README.md"
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
            crc32: 0xCED9AE7B,
            len_body_compressed: 4,
            len_body_uncompressed: 4,
            len_file_name: 11,
            len_extra: 0,
            len_comment: 0,
            disk_number_start: 0,
            int_file_attr: 0,
            ext_file_attr: 0,
            ofs_local_header: 48,  // Position of second LocalFile
            file_name: "📄doc.txt"
          },
          {
            type: "EndOfCentralDir",
            signature: 0x06054b50,
            disk_number: 0,
            disk_with_central_dir: 0,
            num_entries_this_disk: 2,
            num_entries_total: 2,
            len_central_dir: 106,  // Sum of both CentralDirEntry sizes (54 + 52)
            ofs_central_dir: 93,   // Position of first CentralDirEntry
            len_comment: 0
          }
        ]
      },
      bytes: [
        // LocalFile "README.md" (48 bytes, starts at position 0)
        0x50, 0x4b, 0x03, 0x04,  // signature
        20, 0,  // version
        0, 0,   // flags
        0, 0,   // compression_method
        0, 0,   // file_mod_time
        0, 0,   // file_mod_date
        0x77, 0x5A, 0x3C, 0x4F,  // crc32 (AUTO-COMPUTED)
        6, 0, 0, 0,  // len_body_compressed (AUTO-COMPUTED)
        6, 0, 0, 0,  // len_body_uncompressed (AUTO-COMPUTED)
        9, 0,   // len_file_name (AUTO-COMPUTED)
        0, 0,   // len_extra
        0x52, 0x45, 0x41, 0x44, 0x4D, 0x45, 0x2E, 0x6D, 0x64,  // "README.md"
        0x23, 0x20, 0x54, 0x65, 0x73, 0x74,  // "# Test"

        // LocalFile "📄doc.txt" (45 bytes, starts at position 48)
        0x50, 0x4b, 0x03, 0x04,  // signature
        20, 0,  // version
        0, 0,   // flags
        0, 0,   // compression_method
        0, 0,   // file_mod_time
        0, 0,   // file_mod_date
        0x7B, 0xAE, 0xD9, 0xCE,  // crc32 (AUTO-COMPUTED)
        4, 0, 0, 0,  // len_body_compressed (AUTO-COMPUTED)
        4, 0, 0, 0,  // len_body_uncompressed (AUTO-COMPUTED)
        11, 0,  // len_file_name (AUTO-COMPUTED)
        0, 0,   // len_extra
        0xF0, 0x9F, 0x93, 0x84, 0x64, 0x6F, 0x63, 0x2E, 0x74, 0x78, 0x74,  // "📄doc.txt"
        0xF0, 0x9F, 0x93, 0x84,  // body (emoji bytes)

        // CentralDirEntry "README.md" (54 bytes, starts at position 93)
        0x50, 0x4b, 0x01, 0x02,  // signature
        20, 0,  // version_made_by
        20, 0,  // version_needed
        0, 0,   // flags
        0, 0,   // compression_method
        0, 0,   // file_mod_time
        0, 0,   // file_mod_date
        0x77, 0x5A, 0x3C, 0x4F,  // crc32 (AUTO-COMPUTED)
        6, 0, 0, 0,  // len_body_compressed (AUTO-COMPUTED)
        6, 0, 0, 0,  // len_body_uncompressed (AUTO-COMPUTED)
        9, 0,   // len_file_name (AUTO-COMPUTED)
        0, 0,   // len_extra
        0, 0,   // len_comment
        0, 0,   // disk_number_start
        0, 0,   // int_file_attr
        0, 0, 0, 0,  // ext_file_attr
        0, 0, 0, 0,  // ofs_local_header = 0 (AUTO-COMPUTED)
        0x52, 0x45, 0x41, 0x44, 0x4D, 0x45, 0x2E, 0x6D, 0x64,  // "README.md"

        // CentralDirEntry "📄doc.txt" (52 bytes, starts at position 147)
        0x50, 0x4b, 0x01, 0x02,  // signature
        20, 0,  // version_made_by
        20, 0,  // version_needed
        0, 0,   // flags
        0, 0,   // compression_method
        0, 0,   // file_mod_time
        0, 0,   // file_mod_date
        0x7B, 0xAE, 0xD9, 0xCE,  // crc32 (AUTO-COMPUTED)
        4, 0, 0, 0,  // len_body_compressed (AUTO-COMPUTED)
        4, 0, 0, 0,  // len_body_uncompressed (AUTO-COMPUTED)
        11, 0,  // len_file_name (AUTO-COMPUTED)
        0, 0,   // len_extra
        0, 0,   // len_comment
        0, 0,   // disk_number_start
        0, 0,   // int_file_attr
        0, 0, 0, 0,  // ext_file_attr
        48, 0, 0, 0,  // ofs_local_header = 48 (AUTO-COMPUTED)
        0xF0, 0x9F, 0x93, 0x84, 0x64, 0x6F, 0x63, 0x2E, 0x74, 0x78, 0x74,  // "📄doc.txt"

        // EndOfCentralDir (22 bytes, starts at position 199)
        0x50, 0x4b, 0x05, 0x06,  // signature
        0, 0,   // disk_number
        0, 0,   // disk_with_central_dir
        2, 0,   // num_entries_this_disk = 2
        2, 0,   // num_entries_total = 2
        106, 0, 0, 0,  // len_central_dir = 106 (AUTO-COMPUTED: 54 + 52)
        93, 0, 0, 0,   // ofs_central_dir = 93 (AUTO-COMPUTED)
        0, 0    // len_comment
      ]
    }
  ]
});
