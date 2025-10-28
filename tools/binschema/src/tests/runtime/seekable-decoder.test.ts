// ABOUTME: Test suite for SeekableBitStreamDecoder with BinaryReader support
// ABOUTME: Validates backward compatibility and new seekable features

import { defineTestSuite } from "../../schema/test-schema.js";

/**
 * Test that SeekableBitStreamDecoder maintains backward compatibility
 */
export const backwardCompatibilityTestSuite = defineTestSuite({
  name: "seekable_backward_compat",
  description: "SeekableBitStreamDecoder works with existing Uint8Array usage",
  schema: {
    config: { endianness: "big_endian" },
    types: {
      "SimpleStruct": {
        sequence: [
          { name: "magic", type: "uint32" },
          { name: "value", type: "uint16" }
        ]
      }
    }
  },
  test_type: "SimpleStruct",
  test_cases: [
    {
      description: "Decode from Uint8Array (backward compatibility)",
      bytes: [
        0xDE, 0xAD, 0xBE, 0xEF,  // magic
        0x12, 0x34                // value
      ],
      value: {
        magic: 0xDEADBEEF,
        value: 0x1234
      }
    }
  ]
});

/**
 * Test memory-efficient position fields
 */
export const memoryEfficientPositionTestSuite = defineTestSuite({
  name: "memory_efficient_positions",
  description: "Position fields should not load entire file into memory",
  schema: {
    config: { endianness: "little_endian" },
    types: {
      "LargeFile": {
        sequence: [
          { name: "header_size", type: "uint32" },
          { name: "footer_offset", type: "uint32" }
        ],
        instances: [
          {
            name: "footer",
            type: "Footer",
            position: "footer_offset"
          }
        ]
      },
      "Footer": {
        sequence: [
          { name: "checksum", type: "uint32" },
          { name: "version", type: "uint16" }
        ]
      }
    }
  },
  test_type: "LargeFile",
  test_cases: [
    {
      description: "Access position field without loading full file",
      bytes: [
        // Header at offset 0
        0x08, 0x00, 0x00, 0x00,  // header_size = 8
        0x10, 0x00, 0x00, 0x00,  // footer_offset = 16
        // Padding (simulating large file content)
        0x00, 0x00, 0x00, 0x00,
        0x00, 0x00, 0x00, 0x00,
        // Footer at offset 16
        0x78, 0x56, 0x34, 0x12,  // checksum = 0x12345678
        0xAB, 0xCD                // version = 0xCDAB
      ],
      value: {
        header_size: 8,
        footer_offset: 16,
        footer: {
          checksum: 0x12345678,
          version: 0xCDAB
        }
      }
    }
  ]
});
