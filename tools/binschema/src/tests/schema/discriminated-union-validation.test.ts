import { BinarySchema } from "../../schema/binary-schema";
import { validateSchema, ValidationResult } from "../../schema/validator";

/**
 * Schema Validation Tests for Discriminated Unions
 *
 * Discriminated unions allow choosing between type variants based on
 * peeking at a discriminator value. Critical for DNS compression and
 * other protocols with format discrimination.
 */

interface DiscriminatedUnionTestCase {
  description: string;
  schema: BinarySchema;
  shouldPass: boolean;
  expectedErrors?: string[]; // Substrings that should appear in error messages
}

const DISCRIMINATED_UNION_VALIDATION_TESTS: DiscriminatedUnionTestCase[] = [
  // ============================================================================
  // Valid Schemas (Should Pass)
  // ============================================================================

  {
    description: "Simple discriminated union with 2 variants",
    shouldPass: true,
    schema: {
      types: {
        "Pointer": {
          sequence: [
            { name: "value", type: "uint16", endianness: "big_endian" },
          ],
        },
        "DirectValue": {
          sequence: [
            { name: "length", type: "uint8" },
          ],
        },
        "ValueOrPointer": {
          type: "discriminated_union",
          discriminator: {
            peek: "uint8",
          },
          variants: [
            { when: "value >= 0xC0", type: "Pointer" },
            { when: "value < 0xC0", type: "DirectValue" },
          ],
        },
      },
    },
  },

  {
    description: "Discriminated union with 3 variants",
    shouldPass: true,
    schema: {
      types: {
        "TypeA": {
          sequence: [{ name: "a", type: "uint8" }],
        },
        "TypeB": {
          sequence: [{ name: "b", type: "uint16", endianness: "big_endian" }],
        },
        "TypeC": {
          sequence: [{ name: "c", type: "uint32", endianness: "big_endian" }],
        },
        "MultiVariant": {
          type: "discriminated_union",
          discriminator: {
            peek: "uint8",
          },
          variants: [
            { when: "value == 0x01", type: "TypeA" },
            { when: "value == 0x02", type: "TypeB" },
            { when: "value == 0x03", type: "TypeC" },
          ],
        },
      },
    },
  },

  {
    description: "Discriminated union with uint16 discriminator (big endian)",
    shouldPass: true,
    schema: {
      types: {
        "Pointer": {
          sequence: [{ name: "offset", type: "uint16", endianness: "big_endian" }],
        },
        "DirectData": {
          sequence: [{ name: "data", type: "uint8" }],
        },
        "PointerOrData": {
          type: "discriminated_union",
          discriminator: {
            peek: "uint16",
            endianness: "big_endian",
          },
          variants: [
            { when: "value >= 0xC000", type: "Pointer" },
            { when: "value < 0xC000", type: "DirectData" },
          ],
        },
      },
    },
  },

  {
    description: "Discriminated union with uint32 discriminator (little endian)",
    shouldPass: true,
    schema: {
      types: {
        "LargePointer": {
          sequence: [{ name: "offset", type: "uint32", endianness: "little_endian" }],
        },
        "SmallData": {
          sequence: [{ name: "byte", type: "uint8" }],
        },
        "Variant": {
          type: "discriminated_union",
          discriminator: {
            peek: "uint32",
            endianness: "little_endian",
          },
          variants: [
            { when: "value >= 0x80000000", type: "LargePointer" },
            { when: "value < 0x80000000", type: "SmallData" },
          ],
        },
      },
    },
  },

  {
    description: "Discriminated union with complex conditions",
    shouldPass: true,
    schema: {
      types: {
        "TypeX": {
          sequence: [{ name: "x", type: "uint8" }],
        },
        "TypeY": {
          sequence: [{ name: "y", type: "uint8" }],
        },
        "TypeZ": {
          sequence: [{ name: "z", type: "uint8" }],
        },
        "Complex": {
          type: "discriminated_union",
          discriminator: {
            peek: "uint8",
          },
          variants: [
            { when: "(value & 0xF0) == 0x80", type: "TypeX" },
            { when: "(value & 0x0F) == 0x0C", type: "TypeY" },
            { when: "value == 0xFF", type: "TypeZ" },
          ],
        },
      },
    },
  },

  {
    description: "Discriminated union with description",
    shouldPass: true,
    schema: {
      types: {
        "A": {
          sequence: [{ name: "a", type: "uint8" }],
        },
        "B": {
          sequence: [{ name: "b", type: "uint8" }],
        },
        "UnionWithDesc": {
          type: "discriminated_union",
          description: "Choose between A and B based on first byte",
          discriminator: {
            peek: "uint8",
          },
          variants: [
            {
              when: "value >= 0x80",
              type: "A",
              description: "High bit set means type A",
            },
            {
              when: "value < 0x80",
              type: "B",
              description: "High bit clear means type B",
            },
          ],
        },
      },
    },
  },

  {
    description: "Discriminated union with optional field_name for discriminator",
    shouldPass: true,
    schema: {
      types: {
        "TypeOne": {
          sequence: [{ name: "data", type: "uint8" }],
        },
        "TypeTwo": {
          sequence: [{ name: "data", type: "uint16", endianness: "big_endian" }],
        },
        "UnionWithFieldName": {
          type: "discriminated_union",
          discriminator: {
            peek: "uint8",
            field_name: "tag", // Optional: store discriminator value as 'tag'
          },
          variants: [
            { when: "value == 1", type: "TypeOne" },
            { when: "value == 2", type: "TypeTwo" },
          ],
        },
      },
    },
  },

  // ============================================================================
  // Invalid Schemas (Should Fail)
  // ============================================================================

  {
    description: "Discriminated union missing discriminator",
    shouldPass: false,
    expectedErrors: ["discriminator"],
    schema: {
      types: {
        "A": {
          sequence: [{ name: "a", type: "uint8" }],
        },
        "B": {
          sequence: [{ name: "b", type: "uint8" }],
        },
        "Invalid": {
          type: "discriminated_union",
          // Missing discriminator!
          variants: [
            { when: "value >= 0x80", type: "A" },
            { when: "value < 0x80", type: "B" },
          ],
        } as any,
      },
    },
  },

  {
    description: "Discriminated union missing variants",
    shouldPass: false,
    expectedErrors: ["variants"],
    schema: {
      types: {
        "Invalid": {
          type: "discriminated_union",
          discriminator: {
            peek: "uint8",
          },
          // Missing variants!
        } as any,
      },
    },
  },

  {
    description: "Discriminated union with empty variants array",
    shouldPass: false,
    expectedErrors: ["variants", "empty"],
    schema: {
      types: {
        "Invalid": {
          type: "discriminated_union",
          discriminator: {
            peek: "uint8",
          },
          variants: [], // Empty!
        } as any,
      },
    },
  },

  {
    description: "Discriminated union with invalid peek type",
    shouldPass: false,
    expectedErrors: ["peek", "uint64"], // uint64 not supported for peek
    schema: {
      types: {
        "A": {
          sequence: [{ name: "a", type: "uint8" }],
        },
        "Invalid": {
          type: "discriminated_union",
          discriminator: {
            peek: "uint64" as any, // Invalid: uint64 can't be peeked atomically
          },
          variants: [
            { when: "value > 0", type: "A" },
          ],
        } as any,
      },
    },
  },

  {
    description: "Discriminated union variant references non-existent type",
    shouldPass: false,
    expectedErrors: ["NonExistent", "not found"],
    schema: {
      types: {
        "TypeA": {
          sequence: [{ name: "a", type: "uint8" }],
        },
        "Invalid": {
          type: "discriminated_union",
          discriminator: {
            peek: "uint8",
          },
          variants: [
            { when: "value == 0x01", type: "TypeA" },
            { when: "value == 0x02", type: "NonExistent" }, // Doesn't exist!
          ],
        } as any,
      },
    },
  },

  {
    description: "Discriminated union variant missing 'when' condition",
    shouldPass: false,
    expectedErrors: ["when", "condition"],
    schema: {
      types: {
        "TypeA": {
          sequence: [{ name: "a", type: "uint8" }],
        },
        "Invalid": {
          type: "discriminated_union",
          discriminator: {
            peek: "uint8",
          },
          variants: [
            { type: "TypeA" }, // Missing 'when'!
          ] as any,
        } as any,
      },
    },
  },

  {
    description: "Discriminated union variant missing 'type'",
    shouldPass: false,
    expectedErrors: ["type"],
    schema: {
      types: {
        "Invalid": {
          type: "discriminated_union",
          discriminator: {
            peek: "uint8",
          },
          variants: [
            { when: "value == 0x01" }, // Missing 'type'!
          ] as any,
        } as any,
      },
    },
  },

  {
    description: "Discriminated union with unparseable 'when' condition",
    shouldPass: false,
    expectedErrors: ["when", "invalid", "syntax"],
    schema: {
      types: {
        "TypeA": {
          sequence: [{ name: "a", type: "uint8" }],
        },
        "Invalid": {
          type: "discriminated_union",
          discriminator: {
            peek: "uint8",
          },
          variants: [
            { when: "value >= 0x80 &&", type: "TypeA" }, // Invalid syntax (incomplete)
          ],
        } as any,
      },
    },
  },

  {
    description: "Discriminated union discriminator missing 'peek' field",
    shouldPass: false,
    expectedErrors: ["peek"],
    schema: {
      types: {
        "TypeA": {
          sequence: [{ name: "a", type: "uint8" }],
        },
        "Invalid": {
          type: "discriminated_union",
          discriminator: {
            // Missing 'peek'!
            endianness: "big_endian",
          } as any,
          variants: [
            { when: "value == 0x01", type: "TypeA" },
          ],
        } as any,
      },
    },
  },

  {
    description: "Discriminated union with endianness but uint8 peek (meaningless)",
    shouldPass: false,
    expectedErrors: ["endianness", "uint8", "meaningless"],
    schema: {
      types: {
        "TypeA": {
          sequence: [{ name: "a", type: "uint8" }],
        },
        "Invalid": {
          type: "discriminated_union",
          discriminator: {
            peek: "uint8",
            endianness: "big_endian" as any, // Meaningless for single byte!
          },
          variants: [
            { when: "value == 0x01", type: "TypeA" },
          ],
        } as any,
      },
    },
  },

  {
    description: "Discriminated union with uint16/uint32 peek missing endianness",
    shouldPass: false,
    expectedErrors: ["endianness", "required", "uint16"],
    schema: {
      types: {
        "TypeA": {
          sequence: [{ name: "a", type: "uint8" }],
        },
        "Invalid": {
          type: "discriminated_union",
          discriminator: {
            peek: "uint16",
            // Missing endianness!
          } as any,
          variants: [
            { when: "value >= 0xC000", type: "TypeA" },
          ],
        } as any,
      },
    },
  },

  {
    description: "Discriminated union with circular reference (variant points to self)",
    shouldPass: false,
    expectedErrors: ["circular", "dependency", "Recursive"],
    schema: {
      types: {
        "Recursive": {
          type: "discriminated_union",
          discriminator: {
            peek: "uint8",
          },
          variants: [
            { when: "value == 0x01", type: "Recursive" }, // Points to self!
          ],
        } as any,
      },
    },
  },

  {
    description: "Discriminated union with indirect circular reference",
    shouldPass: false,
    expectedErrors: ["circular", "dependency"],
    schema: {
      types: {
        "A": {
          type: "discriminated_union",
          discriminator: { peek: "uint8" },
          variants: [
            { when: "value == 0x01", type: "B" },
          ],
        } as any,
        "B": {
          type: "discriminated_union",
          discriminator: { peek: "uint8" },
          variants: [
            { when: "value == 0x01", type: "A" }, // A → B → A cycle
          ],
        } as any,
      },
    },
  },

  {
    description: "Nested discriminated unions (should be valid)",
    shouldPass: true,
    schema: {
      types: {
        "Leaf": {
          sequence: [{ name: "value", type: "uint8" }],
        },
        "Inner": {
          type: "discriminated_union",
          discriminator: { peek: "uint8" },
          variants: [
            { when: "value == 0x01", type: "Leaf" },
            { when: "value == 0x02", type: "Leaf" },
          ],
        } as any,
        "Outer": {
          type: "discriminated_union",
          discriminator: { peek: "uint8" },
          variants: [
            { when: "value == 0x10", type: "Inner" },
            { when: "value == 0x20", type: "Leaf" },
          ],
        } as any,
      },
    },
  },

  // ============================================================================
  // CRITICAL: Missing Tests from Architect Review
  // ============================================================================

  {
    description: "CRITICAL: Discriminated union with uint32 peek missing endianness",
    shouldPass: false,
    expectedErrors: ["endianness", "required", "uint32"],
    schema: {
      types: {
        "TypeA": { sequence: [{ name: "a", type: "uint8" }] },
        "Invalid": {
          type: "discriminated_union",
          discriminator: { peek: "uint32" }, // Missing endianness!
          variants: [{ when: "value >= 0x80000000", type: "TypeA" }],
        } as any,
      },
    },
  },

  {
    description: "CRITICAL: Discriminated union with invalid endianness value",
    shouldPass: false,
    expectedErrors: ["endianness", "invalid"],
    schema: {
      types: {
        "TypeA": { sequence: [{ name: "a", type: "uint8" }] },
        "Invalid": {
          type: "discriminated_union",
          discriminator: {
            peek: "uint16",
            endianness: "middle_endian" as any, // Invalid!
          },
          variants: [{ when: "value >= 0xC000", type: "TypeA" }],
        } as any,
      },
    },
  },

  {
    description: "CRITICAL: Circular ref through struct field (union → struct → union)",
    shouldPass: false,
    expectedErrors: ["circular", "dependency"],
    schema: {
      types: {
        "Leaf": { sequence: [{ name: "value", type: "uint8" }] },
        "Container": {
          sequence: [
            { name: "child", type: "UnionType" } // Points back to union!
          ],
        },
        "UnionType": {
          type: "discriminated_union",
          discriminator: { peek: "uint8" },
          variants: [
            { when: "value == 0x01", type: "Leaf" },
            { when: "value == 0x02", type: "Container" }, // Container → UnionType cycle
          ],
        } as any,
      },
    },
  },

  {
    description: "CRITICAL: Discriminated union as conditional field (integration test)",
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
        "Container": {
          sequence: [
            { name: "flags", type: "uint8" },
            { name: "optional_union", type: "Union", conditional: "flags == 0x01" },
          ],
        },
      },
    },
  },

  {
    description: "Fallback variant (no 'when') as last item (allowed)",
    shouldPass: true,
    schema: {
      types: {
        "Pointer": { sequence: [{ name: "offset", type: "uint16", endianness: "big_endian" }] },
        "DirectValue": { sequence: [{ name: "data", type: "uint8" }] },
        "WithFallback": {
          type: "discriminated_union",
          discriminator: { peek: "uint8" },
          variants: [
            { when: "value >= 0xC0", type: "Pointer" },
            { type: "DirectValue" }, // No when = default/else (last only!)
          ],
        } as any,
      },
    },
  },

  {
    description: "Fallback variant (no 'when') NOT as last item (rejected)",
    shouldPass: false,
    expectedErrors: ["fallback", "last", "position"],
    schema: {
      types: {
        "TypeA": { sequence: [{ name: "a", type: "uint8" }] },
        "TypeB": { sequence: [{ name: "b", type: "uint8" }] },
        "Invalid": {
          type: "discriminated_union",
          discriminator: { peek: "uint8" },
          variants: [
            { type: "TypeA" }, // Fallback not as last item!
            { when: "value == 0x02", type: "TypeB" },
          ],
        } as any,
      },
    },
  },

  // ============================================================================
  // Field-Based Discriminators (not peek-based)
  // ============================================================================

  {
    description: "Field-based discriminator (SuperChat pattern)",
    shouldPass: true,
    schema: {
      types: {
        "LoginPayload": { sequence: [{ name: "username", type: "uint8" }] },
        "MessagePayload": { sequence: [{ name: "text", type: "uint8" }] },
        "Frame": {
          sequence: [
            { name: "message_type", type: "uint8" },
            { name: "flags", type: "uint8" },
            {
              name: "payload",
              type: "discriminated_union",
              discriminator: { field: "message_type" }, // Reference earlier field
              variants: [
                { when: "value == 0x01", type: "LoginPayload" },
                { when: "value == 0x02", type: "MessagePayload" },
              ],
            } as any,
          ],
        },
      },
    },
  },

  {
    description: "Field-based discriminator with non-existent field",
    shouldPass: false,
    expectedErrors: ["field", "NonExistent", "not found"],
    schema: {
      types: {
        "TypeA": { sequence: [{ name: "a", type: "uint8" }] },
        "Invalid": {
          sequence: [
            { name: "tag", type: "uint8" },
            {
              name: "payload",
              type: "discriminated_union",
              discriminator: { field: "NonExistent" }, // Field doesn't exist!
              variants: [{ when: "value == 0x01", type: "TypeA" }],
            } as any,
          ],
        },
      },
    },
  },

  {
    description: "Field-based discriminator referencing field AFTER union (invalid)",
    shouldPass: false,
    expectedErrors: ["field", "after", "forward reference"],
    schema: {
      types: {
        "TypeA": { sequence: [{ name: "a", type: "uint8" }] },
        "Invalid": {
          sequence: [
            {
              name: "payload",
              type: "discriminated_union",
              discriminator: { field: "tag" }, // tag comes after!
              variants: [{ when: "value == 0x01", type: "TypeA" }],
            } as any,
            { name: "tag", type: "uint8" }, // Defined after union - can't work
          ],
        },
      },
    },
  },

  {
    description: "Discriminator with both 'peek' and 'field' (ambiguous)",
    shouldPass: false,
    expectedErrors: ["peek", "field", "both", "exclusive"],
    schema: {
      types: {
        "TypeA": { sequence: [{ name: "a", type: "uint8" }] },
        "Invalid": {
          sequence: [
            { name: "tag", type: "uint8" },
            {
              name: "payload",
              type: "discriminated_union",
              discriminator: {
                peek: "uint8",
                field: "tag", // Can't have both!
              } as any,
              variants: [{ when: "value == 0x01", type: "TypeA" }],
            } as any,
          ],
        },
      },
    },
  },

  {
    description: "Discriminator with neither 'peek' nor 'field' (missing)",
    shouldPass: false,
    expectedErrors: ["discriminator", "peek", "field", "required"],
    schema: {
      types: {
        "TypeA": { sequence: [{ name: "a", type: "uint8" }] },
        "Invalid": {
          type: "discriminated_union",
          discriminator: {} as any, // Empty - no peek or field!
          variants: [{ when: "value == 0x01", type: "TypeA" }],
        } as any,
      },
    },
  },
];

/**
 * Run all discriminated union validation tests
 */
export function runDiscriminatedUnionValidationTests() {
  console.log("\n=== Discriminated Union Schema Validation Tests ===\n");

  let passed = 0;
  let failed = 0;

  for (const tc of DISCRIMINATED_UNION_VALIDATION_TESTS) {
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
    throw new Error(`${failed} discriminated union validation tests failed`);
  }

  console.log("\n✓ All discriminated union validation tests passed!\n");
}

// Run tests if executed directly
if (require.main === module) {
  runDiscriminatedUnionValidationTests();
}
