// ABOUTME: Test arrays that read until a terminator value is encountered
// ABOUTME: Arrays with "kind": "terminated" that stop when terminator field appears

import { defineTestSuite } from "../../schema/test-schema.js";

/**
 * Terminated arrays read elements until a specific terminator value is detected.
 * The terminator is specified by field name, not value.
 *
 * Note: This is complex because we need to peek ahead to check if the next
 * element matches the terminator pattern. For ZIP files, the terminator is
 * the "end_of_central_dir_signature" field with value 0x06054b50.
 */
export const terminatedArrayTestSuite = defineTestSuite({
  name: "signature_terminated_arrays",
  description: "Arrays that read until specific signature value is detected",
  schema: {
    config: { endianness: "little_endian" },
    types: {
      "Record": {
        sequence: [
          { "name": "signature", "type": "uint32" },
          { "name": "value", "type": "uint8" }
        ]
      },
      "RecordList": {
        sequence: [
          {
            "name": "records",
            "type": "array",
            "kind": "signature_terminated",
            "terminator_value": 0xFFFFFFFF,
            "terminator_type": "uint32",
            "terminator_endianness": "little_endian",
            "items": { "type": "Record" }
          },
          { "name": "end_signature", "type": "uint32" }
        ]
      }
    }
  },
  test_type: "RecordList",
  test_cases: [
    {
      description: "Empty list (immediate terminator)",
      bytes: [
        0xFF, 0xFF, 0xFF, 0xFF  // end_signature = 0xFFFFFFFF
      ],
      value: {
        records: [],
        end_signature: 0xFFFFFFFF
      }
    },
    {
      description: "Single record before terminator",
      bytes: [
        0x01, 0x02, 0x03, 0x04, // record 0: signature = 0x04030201
        0x42,                   // record 0: value = 0x42
        0xFF, 0xFF, 0xFF, 0xFF  // end_signature = 0xFFFFFFFF
      ],
      value: {
        records: [
          { signature: 0x04030201, value: 0x42 }
        ],
        end_signature: 0xFFFFFFFF
      }
    },
    {
      description: "Multiple records before terminator",
      bytes: [
        0x01, 0x00, 0x00, 0x00, // record 0: signature = 0x00000001
        0x10,                   // record 0: value = 0x10
        0x02, 0x00, 0x00, 0x00, // record 1: signature = 0x00000002
        0x20,                   // record 1: value = 0x20
        0x03, 0x00, 0x00, 0x00, // record 2: signature = 0x00000003
        0x30,                   // record 2: value = 0x30
        0xFF, 0xFF, 0xFF, 0xFF  // end_signature = 0xFFFFFFFF
      ],
      value: {
        records: [
          { signature: 0x00000001, value: 0x10 },
          { signature: 0x00000002, value: 0x20 },
          { signature: 0x00000003, value: 0x30 }
        ],
        end_signature: 0xFFFFFFFF
      }
    }
  ]
});
