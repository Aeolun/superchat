import { BinarySchema } from "../../schema/binary-schema";
import { validateSchema, ValidationResult } from "../../schema/validator";

/**
 * Schema Validation Tests for Back Reference Types
 *
 * Back references enable backwards references for compression (like DNS).
 * They read an offset value, seek to that offset, decode the target type,
 * then return to the original position.
 */

interface BackReferenceTestCase {
  description: string;
  schema: BinarySchema;
  shouldPass: boolean;
  expectedErrors?: string[]; // Substrings that should appear in error messages
}

const BACK_REFERENCE_VALIDATION_TESTS: BackReferenceTestCase[] = [
  // ============================================================================
  // Valid Schemas (Should Pass)
  // ============================================================================

  {
    description: "Simple uint16 back_reference to DomainName",
    shouldPass: true,
    schema: {
      types: {
        "DomainName": {
          type: "string",
          kind: "null_terminated",
          encoding: "ascii",
        },
        "Pointer": {
          type: "back_reference",
          storage: "uint16",
          offset_mask: "0x3FFF",
          offset_from: "message_start",
          target_type: "DomainName",
          endianness: "big_endian",
        } as any,
      },
    },
  },

  {
    description: "Uint8 back_reference with full offset (no mask)",
    shouldPass: true,
    schema: {
      types: {
        "Data": {
          sequence: [{ name: "value", type: "uint8" }],
        },
        "SmallPointer": {
          type: "back_reference",
          storage: "uint8",
          offset_mask: "0xFF", // Full byte
          offset_from: "message_start",
          target_type: "Data",
        } as any,
      },
    },
  },

  {
    description: "Uint32 back_reference to complex struct",
    shouldPass: true,
    schema: {
      types: {
        "ComplexStruct": {
          sequence: [
            { name: "a", type: "uint16", endianness: "big_endian" },
            { name: "b", type: "uint32", endianness: "big_endian" },
          ],
        },
        "LargePointer": {
          type: "back_reference",
          storage: "uint32",
          offset_mask: "0x7FFFFFFF", // 31-bit offset
          offset_from: "message_start",
          target_type: "ComplexStruct",
          endianness: "little_endian",
        } as any,
      },
    },
  },

  {
    description: "Pointer with current_position offset (relative back_reference)",
    shouldPass: true,
    schema: {
      types: {
        "Target": {
          sequence: [{ name: "data", type: "uint8" }],
        },
        "RelativePointer": {
          type: "back_reference",
          storage: "uint16",
          offset_mask: "0xFFFF",
          offset_from: "current_position",
          target_type: "Target",
          endianness: "big_endian",
        } as any,
      },
    },
  },

  {
    description: "Pointer with description",
    shouldPass: true,
    schema: {
      types: {
        "Label": {
          type: "string",
          kind: "length_prefixed",
          length_type: "uint8",
          encoding: "ascii",
        },
        "LabelPointer": {
          type: "back_reference",
          description: "DNS label compression back_reference (RFC 1035)",
          storage: "uint16",
          offset_mask: "0x3FFF",
          offset_from: "message_start",
          target_type: "Label",
          endianness: "big_endian",
        } as any,
      },
    },
  },

  {
    description: "Pointer to array type",
    shouldPass: true,
    schema: {
      types: {
        "ByteArray": {
          type: "array",
          kind: "length_prefixed",
          length_type: "uint8",
          items: { type: "uint8" },
        },
        "ArrayPointer": {
          type: "back_reference",
          storage: "uint16",
          offset_mask: "0xFFFF",
          offset_from: "message_start",
          target_type: "ByteArray",
          endianness: "big_endian",
        } as any,
      },
    },
  },

  {
    description: "Multiple different back_reference types in same schema",
    shouldPass: true,
    schema: {
      types: {
        "TypeA": {
          sequence: [{ name: "a", type: "uint8" }],
        },
        "TypeB": {
          sequence: [{ name: "b", type: "uint16", endianness: "big_endian" }],
        },
        "PointerA": {
          type: "back_reference",
          storage: "uint16",
          offset_mask: "0x3FFF",
          offset_from: "message_start",
          target_type: "TypeA",
          endianness: "big_endian",
        } as any,
        "PointerB": {
          type: "back_reference",
          storage: "uint32",
          offset_mask: "0xFFFFFFFF",
          offset_from: "message_start",
          target_type: "TypeB",
          endianness: "little_endian",
        } as any,
      },
    },
  },

  // ============================================================================
  // Invalid Schemas (Should Fail)
  // ============================================================================

  {
    description: "Pointer missing 'storage' field",
    shouldPass: false,
    expectedErrors: ["storage"],
    schema: {
      types: {
        "Target": {
          sequence: [{ name: "data", type: "uint8" }],
        },
        "Invalid": {
          type: "back_reference",
          // Missing storage!
          offset_mask: "0xFFFF",
          offset_from: "message_start",
          target_type: "Target",
          endianness: "big_endian",
        } as any,
      },
    },
  },

  {
    description: "Pointer missing 'offset_mask' field",
    shouldPass: false,
    expectedErrors: ["offset_mask"],
    schema: {
      types: {
        "Target": {
          sequence: [{ name: "data", type: "uint8" }],
        },
        "Invalid": {
          type: "back_reference",
          storage: "uint16",
          // Missing offset_mask!
          offset_from: "message_start",
          target_type: "Target",
          endianness: "big_endian",
        } as any,
      },
    },
  },

  {
    description: "Pointer missing 'offset_from' field",
    shouldPass: false,
    expectedErrors: ["offset_from"],
    schema: {
      types: {
        "Target": {
          sequence: [{ name: "data", type: "uint8" }],
        },
        "Invalid": {
          type: "back_reference",
          storage: "uint16",
          offset_mask: "0xFFFF",
          // Missing offset_from!
          target_type: "Target",
          endianness: "big_endian",
        } as any,
      },
    },
  },

  {
    description: "Pointer missing 'target_type' field",
    shouldPass: false,
    expectedErrors: ["target_type"],
    schema: {
      types: {
        "Invalid": {
          type: "back_reference",
          storage: "uint16",
          offset_mask: "0xFFFF",
          offset_from: "message_start",
          // Missing target_type!
          endianness: "big_endian",
        } as any,
      },
    },
  },

  {
    description: "Pointer with invalid storage type",
    shouldPass: false,
    expectedErrors: ["storage", "invalid", "uint64"],
    schema: {
      types: {
        "Target": {
          sequence: [{ name: "data", type: "uint8" }],
        },
        "Invalid": {
          type: "back_reference",
          storage: "uint64", // Invalid: uint64 back_references not supported
          offset_mask: "0xFFFF",
          offset_from: "message_start",
          target_type: "Target",
          endianness: "big_endian",
        } as any,
      },
    },
  },

  {
    description: "Pointer with invalid offset_from value",
    shouldPass: false,
    expectedErrors: ["offset_from", "invalid"],
    schema: {
      types: {
        "Target": {
          sequence: [{ name: "data", type: "uint8" }],
        },
        "Invalid": {
          type: "back_reference",
          storage: "uint16",
          offset_mask: "0xFFFF",
          offset_from: "buffer_end", // Invalid value!
          target_type: "Target",
          endianness: "big_endian",
        } as any,
      },
    },
  },

  {
    description: "Pointer with invalid offset_mask format (not hex)",
    shouldPass: false,
    expectedErrors: ["offset_mask", "hex", "0x"],
    schema: {
      types: {
        "Target": {
          sequence: [{ name: "data", type: "uint8" }],
        },
        "Invalid": {
          type: "back_reference",
          storage: "uint16",
          offset_mask: "65535", // Should be "0xFFFF"
          offset_from: "message_start",
          target_type: "Target",
          endianness: "big_endian",
        } as any,
      },
    },
  },

  {
    description: "Pointer with offset_mask too large for storage",
    shouldPass: false,
    expectedErrors: ["offset_mask", "exceeds", "uint8"],
    schema: {
      types: {
        "Target": {
          sequence: [{ name: "data", type: "uint8" }],
        },
        "Invalid": {
          type: "back_reference",
          storage: "uint8",
          offset_mask: "0xFFFF", // Too large for uint8 (max 0xFF)
          offset_from: "message_start",
          target_type: "Target",
        } as any,
      },
    },
  },

  {
    description: "Pointer target_type references non-existent type",
    shouldPass: false,
    expectedErrors: ["NonExistent", "not found"],
    schema: {
      types: {
        "Invalid": {
          type: "back_reference",
          storage: "uint16",
          offset_mask: "0xFFFF",
          offset_from: "message_start",
          target_type: "NonExistent", // Doesn't exist!
          endianness: "big_endian",
        } as any,
      },
    },
  },

  {
    description: "Pointer missing endianness for uint16 storage",
    shouldPass: false,
    expectedErrors: ["endianness", "required", "uint16"],
    schema: {
      types: {
        "Target": {
          sequence: [{ name: "data", type: "uint8" }],
        },
        "Invalid": {
          type: "back_reference",
          storage: "uint16",
          offset_mask: "0xFFFF",
          offset_from: "message_start",
          target_type: "Target",
          // Missing endianness!
        } as any,
      },
    },
  },

  {
    description: "Pointer with endianness but uint8 storage (meaningless)",
    shouldPass: false,
    expectedErrors: ["endianness", "uint8", "meaningless"],
    schema: {
      types: {
        "Target": {
          sequence: [{ name: "data", type: "uint8" }],
        },
        "Invalid": {
          type: "back_reference",
          storage: "uint8",
          offset_mask: "0xFF",
          offset_from: "message_start",
          target_type: "Target",
          endianness: "big_endian", // Meaningless for single byte!
        } as any,
      },
    },
  },

  {
    description: "Pointer with direct circular reference (points to self)",
    shouldPass: false,
    expectedErrors: ["circular", "dependency", "Recursive"],
    schema: {
      types: {
        "Recursive": {
          type: "back_reference",
          storage: "uint16",
          offset_mask: "0xFFFF",
          offset_from: "message_start",
          target_type: "Recursive", // Points to self!
          endianness: "big_endian",
        } as any,
      },
    },
  },

  {
    description: "Pointer with indirect circular reference",
    shouldPass: false,
    expectedErrors: ["circular", "dependency"],
    schema: {
      types: {
        "A": {
          type: "back_reference",
          storage: "uint16",
          offset_mask: "0xFFFF",
          offset_from: "message_start",
          target_type: "B",
          endianness: "big_endian",
        } as any,
        "B": {
          type: "back_reference",
          storage: "uint16",
          offset_mask: "0xFFFF",
          offset_from: "message_start",
          target_type: "A", // A → B → A cycle
          endianness: "big_endian",
        } as any,
      },
    },
  },

  {
    description: "Pointer to back_reference (valid - chain of back_references)",
    shouldPass: true,
    schema: {
      types: {
        "Data": {
          sequence: [{ name: "value", type: "uint8" }],
        },
        "PointerToData": {
          type: "back_reference",
          storage: "uint16",
          offset_mask: "0xFFFF",
          offset_from: "message_start",
          target_type: "Data",
          endianness: "big_endian",
        } as any,
        "PointerToPointer": {
          type: "back_reference",
          storage: "uint16",
          offset_mask: "0xFFFF",
          offset_from: "message_start",
          target_type: "PointerToData",
          endianness: "big_endian",
        } as any,
      },
    },
  },

  {
    description: "Pointer with triple-indirect circular reference",
    shouldPass: false,
    expectedErrors: ["circular", "dependency"],
    schema: {
      types: {
        "A": {
          type: "back_reference",
          storage: "uint16",
          offset_mask: "0xFFFF",
          offset_from: "message_start",
          target_type: "B",
          endianness: "big_endian",
        } as any,
        "B": {
          type: "back_reference",
          storage: "uint16",
          offset_mask: "0xFFFF",
          offset_from: "message_start",
          target_type: "C",
          endianness: "big_endian",
        } as any,
        "C": {
          type: "back_reference",
          storage: "uint16",
          offset_mask: "0xFFFF",
          offset_from: "message_start",
          target_type: "A", // A → B → C → A cycle
          endianness: "big_endian",
        } as any,
      },
    },
  },

  {
    description: "Pointer inside struct (valid - common pattern)",
    shouldPass: true,
    schema: {
      types: {
        "DomainName": {
          type: "string",
          kind: "null_terminated",
          encoding: "ascii",
        },
        "Pointer": {
          type: "back_reference",
          storage: "uint16",
          offset_mask: "0x3FFF",
          offset_from: "message_start",
          target_type: "DomainName",
          endianness: "big_endian",
        } as any,
        "DNSQuestion": {
          sequence: [
            { name: "qname", type: "Pointer" }, // Pointer as struct field
            { name: "qtype", type: "uint16", endianness: "big_endian" },
            { name: "qclass", type: "uint16", endianness: "big_endian" },
          ],
        },
      },
    },
  },

  // ============================================================================
  // CRITICAL: Missing Tests from Architect Review
  // ============================================================================

  {
    description: "CRITICAL: Pointer with invalid endianness value",
    shouldPass: false,
    expectedErrors: ["endianness", "invalid"],
    schema: {
      types: {
        "Target": { sequence: [{ name: "data", type: "uint8" }] },
        "Invalid": {
          type: "back_reference",
          storage: "uint16",
          offset_mask: "0xFFFF",
          offset_from: "message_start",
          target_type: "Target",
          endianness: "middle_endian" as any, // Invalid!
        } as any,
      },
    },
  },

  {
    description: "CRITICAL: Pointer with maximum valid offset_mask for each storage type",
    shouldPass: true,
    schema: {
      types: {
        "Data": { sequence: [{ name: "value", type: "uint8" }] },
        "Pointer8": {
          type: "back_reference",
          storage: "uint8",
          offset_mask: "0xFF", // Valid: uses all 8 bits
          offset_from: "message_start",
          target_type: "Data",
        } as any,
        "Pointer16": {
          type: "back_reference",
          storage: "uint16",
          offset_mask: "0xFFFF", // Valid: uses all 16 bits
          offset_from: "message_start",
          target_type: "Data",
          endianness: "big_endian",
        } as any,
        "Pointer32": {
          type: "back_reference",
          storage: "uint32",
          offset_mask: "0xFFFFFFFF", // Valid: uses all 32 bits
          offset_from: "message_start",
          target_type: "Data",
          endianness: "big_endian",
        } as any,
      },
    },
  },

  {
    description: "CRITICAL: Pointer with offset_mask = 0 (semantically invalid)",
    shouldPass: false,
    expectedErrors: ["offset_mask", "zero", "no bits"],
    schema: {
      types: {
        "Target": { sequence: [{ name: "data", type: "uint8" }] },
        "Invalid": {
          type: "back_reference",
          storage: "uint16",
          offset_mask: "0x0000", // Zero mask - no offset bits!
          offset_from: "message_start",
          target_type: "Target",
          endianness: "big_endian",
        } as any,
      },
    },
  },

  {
    description: "CRITICAL: Array of back_references (common in DNS answers)",
    shouldPass: true,
    schema: {
      types: {
        "DomainName": {
          type: "string",
          kind: "null_terminated",
          encoding: "ascii",
        },
        "NamePointer": {
          type: "back_reference",
          storage: "uint16",
          offset_mask: "0x3FFF",
          offset_from: "message_start",
          target_type: "DomainName",
          endianness: "big_endian",
        } as any,
        "AnswerList": {
          type: "array",
          kind: "length_prefixed",
          length_type: "uint16",
          items: { type: "NamePointer" },
        },
      },
    },
  },

  {
    description: "CRITICAL: Pointer chain of depth 4 (A→B→C→D→Data)",
    shouldPass: true,
    schema: {
      types: {
        "Data": { sequence: [{ name: "value", type: "uint8" }] },
        "Ptr1": {
          type: "back_reference",
          storage: "uint16",
          offset_mask: "0xFFFF",
          offset_from: "message_start",
          target_type: "Data",
          endianness: "big_endian",
        } as any,
        "Ptr2": {
          type: "back_reference",
          storage: "uint16",
          offset_mask: "0xFFFF",
          offset_from: "message_start",
          target_type: "Ptr1",
          endianness: "big_endian",
        } as any,
        "Ptr3": {
          type: "back_reference",
          storage: "uint16",
          offset_mask: "0xFFFF",
          offset_from: "message_start",
          target_type: "Ptr2",
          endianness: "big_endian",
        } as any,
        "Ptr4": {
          type: "back_reference",
          storage: "uint16",
          offset_mask: "0xFFFF",
          offset_from: "message_start",
          target_type: "Ptr3",
          endianness: "big_endian",
        } as any,
      },
    },
  },

  {
    description: "CRITICAL: Pointer target is discriminated union (back_reference → union)",
    shouldPass: true,
    schema: {
      types: {
        "TypeA": { sequence: [{ name: "a", type: "uint8" }] },
        "TypeB": { sequence: [{ name: "b", type: "uint8" }] },
        "Union": {
          type: "discriminated_union",
          discriminator: { peek: "uint8" },
          variants: [
            { when: "value == 0x01", type: "TypeA" },
            { when: "value == 0x02", type: "TypeB" },
          ],
        } as any,
        "Pointer": {
          type: "back_reference",
          storage: "uint16",
          offset_mask: "0xFFFF",
          offset_from: "message_start",
          target_type: "Union", // Points to union!
          endianness: "big_endian",
        } as any,
      },
    },
  },
];

/**
 * Run all back_reference validation tests
 */
export function runPointerValidationTests() {
  console.log("\n=== Pointer Schema Validation Tests ===\n");

  let passed = 0;
  let failed = 0;

  for (const tc of BACK_REFERENCE_VALIDATION_TESTS) {
    const result = validateSchema(tc.schema);

    if (tc.shouldPass && result.valid) {
      // Expected pass, got pass
      passed++;
    } else if (!tc.shouldPass && !result.valid) {
      // Expected fail, got fail - check error messages
      if (tc.expectedErrors) {
        let allErrorsFound = true;
        for (const expectedError of tc.expectedErrors) {
          const found = result.errors.some((err) =>
            err.message.toLowerCase().includes(expectedError.toLowerCase())
          );
          if (!found) {
            console.error(
              `✗ ${tc.description}\n  Expected error containing "${expectedError}" but got:\n  ${result.errors.map((e) => e.message).join("\n  ")}`
            );
            allErrorsFound = false;
            failed++;
            break;
          }
        }
        if (allErrorsFound) {
          passed++;
        }
      } else {
        passed++;
      }
    } else if (tc.shouldPass && !result.valid) {
      // Expected pass, got fail
      console.error(
        `✗ ${tc.description}\n  Expected to pass but got errors:\n  ${result.errors.map((e) => `${e.path}: ${e.message}`).join("\n  ")}`
      );
      failed++;
    } else {
      // Expected fail, got pass
      console.error(`✗ ${tc.description}\n  Expected to fail but passed validation`);
      failed++;
    }
  }

  console.log(`\n✓ ${passed} tests passed`);
  if (failed > 0) {
    console.log(`✗ ${failed} tests failed`);
    throw new Error(`${failed} back_reference validation tests failed`);
  }

  console.log("\n✓ All back_reference validation tests passed!\n");
}

// Run tests if executed directly
if (require.main === module) {
  runPointerValidationTests();
}
