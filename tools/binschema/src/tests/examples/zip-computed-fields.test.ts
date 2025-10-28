// ABOUTME: End-to-end test for ZIP schema with computed fields
// ABOUTME: Demonstrates automatic length computation in a real ZIP-like structure

import { defineTestSuite } from "../../schema/test-schema.js";
import { readFileSync } from "fs";
import { join } from "path";

// Load the ZIP schema
const zipSchemaPath = join(process.cwd(), "examples", "zip.schema.json");
const zipSchema = JSON.parse(readFileSync(zipSchemaPath, "utf-8"));

/**
 * Test ZIP LocalFileHeader with computed length fields
 *
 * This demonstrates that users only need to provide:
 * - file_name
 * - extra
 *
 * And the encoder automatically computes:
 * - len_file_name
 * - len_extra
 */
export const zipLocalFileHeaderComputedLengthsTestSuite = defineTestSuite({
  name: "zip_local_file_header_computed_lengths",
  description: "ZIP LocalFileHeader with auto-computed length fields",

  schema: zipSchema,

  test_type: "LocalFileHeader",

  test_cases: [
    {
      description: "Simple file with name 'test.txt' and no extra data",
      value: {
        version: 20,
        flags: 0,
        compression_method: 0, // No compression
        file_mod_time: 0x4FA5281E, // DOS datetime
        crc32: 0x12345678, // User provides this (can't auto-compute from compressed data)
        len_body_compressed: 13, // User provides this (references parent struct's body)
        len_body_uncompressed: 13, // User provides this
        file_name: "test.txt",  // Computed fields omitted: len_file_name, len_extra
        extra: []
      },
      decoded_value: {
        version: 20,
        flags: 0,
        compression_method: 0,
        file_mod_time: 0x4FA5281E,
        crc32: 0x12345678,
        len_body_compressed: 13,
        len_body_uncompressed: 13,
        len_file_name: 8,  // Auto-computed: "test.txt" = 8 bytes UTF-8
        len_extra: 0,  // Auto-computed: empty array = 0 bytes
        file_name: "test.txt",
        extra: []
      },
      bytes: [
        // version (uint16 LE)
        20, 0,
        // flags (uint16 LE)
        0, 0,
        // compression_method (uint16 LE)
        0, 0,
        // file_mod_time (uint32 LE)
        0x1E, 0x28, 0xA5, 0x4F,
        // crc32 (uint32 LE)
        0x78, 0x56, 0x34, 0x12,
        // len_body_compressed (uint32 LE)
        13, 0, 0, 0,
        // len_body_uncompressed (uint32 LE)
        13, 0, 0, 0,
        // len_file_name (uint16 LE) - AUTO-COMPUTED
        8, 0,
        // len_extra (uint16 LE) - AUTO-COMPUTED
        0, 0,
        // file_name ("test.txt")
        0x74, 0x65, 0x73, 0x74, 0x2E, 0x74, 0x78, 0x74,
        // extra (empty)
      ],
    },
    {
      description: "File with UTF-8 filename and extra field",
      value: {
        version: 20,
        flags: 0,
        compression_method: 8, // Deflate
        file_mod_time: 0x4FA5281E,
        crc32: 0xABCDEF01,
        len_body_compressed: 100,
        len_body_uncompressed: 200,
        file_name: "データ.txt", // Japanese characters: 13 bytes UTF-8
        extra: [0x01, 0x02, 0x03, 0x04]  // 4 bytes
      },
      decoded_value: {
        version: 20,
        flags: 0,
        compression_method: 8,
        file_mod_time: 0x4FA5281E,
        crc32: 0xABCDEF01,
        len_body_compressed: 100,
        len_body_uncompressed: 200,
        len_file_name: 13,  // Auto-computed: "データ.txt" = 13 bytes UTF-8
        len_extra: 4,  // Auto-computed: 4 bytes
        file_name: "データ.txt",
        extra: [0x01, 0x02, 0x03, 0x04]
      },
      bytes: [
        // version
        20, 0,
        // flags
        0, 0,
        // compression_method
        8, 0,
        // file_mod_time
        0x1E, 0x28, 0xA5, 0x4F,
        // crc32
        0x01, 0xEF, 0xCD, 0xAB,
        // len_body_compressed
        100, 0, 0, 0,
        // len_body_uncompressed
        200, 0, 0, 0,
        // len_file_name - AUTO-COMPUTED (13 bytes)
        13, 0,
        // len_extra - AUTO-COMPUTED (4 bytes)
        4, 0,
        // file_name ("データ.txt" in UTF-8: 0xE38387 0xE383BC 0xE382BF .txt)
        0xE3, 0x83, 0x87, 0xE3, 0x83, 0xBC, 0xE3, 0x82, 0xBF, 0x2E, 0x74, 0x78, 0x74,
        // extra
        0x01, 0x02, 0x03, 0x04,
      ],
    },
  ]
});

/**
 * Test ZIP CentralDirEntry with computed length fields
 */
export const zipCentralDirEntryComputedLengthsTestSuite = defineTestSuite({
  name: "zip_central_dir_entry_computed_lengths",
  description: "ZIP CentralDirEntry with auto-computed length fields (including comment)",

  schema: zipSchema,

  test_type: "CentralDirEntry",

  test_cases: [
    {
      description: "Central directory entry with file name and comment",
      value: {
        version_made_by: 0x031E, // Unix, version 3.0
        version_needed_to_extract: 20,
        flags: 0,
        compression_method: 0,
        file_mod_time: 0x4FA5281E,
        crc32: 0x12345678,
        len_body_compressed: 13,
        len_body_uncompressed: 13,
        disk_number_start: 0,
        int_file_attr: 1,
        ext_file_attr: 0x81A40000, // Unix file attributes
        ofs_local_header: 0, // User provides this (complex correlation)
        file_name: "test.txt",
        extra: [],
        comment: "Test file"  // Computed fields omitted: len_file_name, len_extra, len_comment
      },
      decoded_value: {
        version_made_by: 0x031E,
        version_needed_to_extract: 20,
        flags: 0,
        compression_method: 0,
        file_mod_time: 0x4FA5281E,
        crc32: 0x12345678,
        len_body_compressed: 13,
        len_body_uncompressed: 13,
        len_file_name: 8,  // Auto-computed
        len_extra: 0,  // Auto-computed
        len_comment: 9,  // Auto-computed: "Test file" = 9 bytes
        disk_number_start: 0,
        int_file_attr: 1,
        ext_file_attr: 0x81A40000,
        ofs_local_header: 0,
        file_name: "test.txt",
        extra: [],
        comment: "Test file"
      },
      bytes: [
        // version_made_by
        0x1E, 0x03,
        // version_needed_to_extract
        20, 0,
        // flags
        0, 0,
        // compression_method
        0, 0,
        // file_mod_time
        0x1E, 0x28, 0xA5, 0x4F,
        // crc32
        0x78, 0x56, 0x34, 0x12,
        // len_body_compressed
        13, 0, 0, 0,
        // len_body_uncompressed
        13, 0, 0, 0,
        // len_file_name - AUTO-COMPUTED
        8, 0,
        // len_extra - AUTO-COMPUTED
        0, 0,
        // len_comment - AUTO-COMPUTED
        9, 0,
        // disk_number_start
        0, 0,
        // int_file_attr
        1, 0,
        // ext_file_attr
        0x00, 0x00, 0xA4, 0x81,
        // ofs_local_header
        0, 0, 0, 0,
        // file_name
        0x74, 0x65, 0x73, 0x74, 0x2E, 0x74, 0x78, 0x74,
        // extra (empty)
        // comment ("Test file")
        0x54, 0x65, 0x73, 0x74, 0x20, 0x66, 0x69, 0x6C, 0x65,
      ],
    },
  ]
});
