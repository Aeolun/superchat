/**
 * Discriminated Union Code Generation Tests
 *
 * Tests TypeScript code generation for discriminated unions.
 * Covers both peek-based and field-based discriminators.
 */

import { generateTypeScriptCode } from "../../generators/typescript";
import { BinarySchema } from "../../schema/binary-schema";

interface CodegenTestCase {
  description: string;
  schema: BinarySchema;
  expectedTypes: {
    typeName: string;
    // Key patterns that must appear in generated code
    mustContain: string[];
    // Patterns that must NOT appear
    mustNotContain?: string[];
  }[];
  shouldCompile: boolean;
}

const DISCRIMINATED_UNION_CODEGEN_TESTS: CodegenTestCase[] = [
  // ==========================================================================
  // Peek-Based Discriminators (DNS Pattern)
  // ==========================================================================

  {
    description: "Peek-based discriminated union (uint8, DNS compression pattern)",
    shouldCompile: true,
    schema: {
      types: {
        "Pointer": {
          sequence: [
            { name: "offset", type: "uint16", endianness: "big_endian" }
          ]
        },
        "DirectValue": {
          sequence: [
            { name: "length", type: "uint8" },
            { name: "data", type: "array", kind: "fixed", length: 5, items: { type: "uint8" } }
          ]
        },
        "ValueOrPointer": {
          type: "discriminated_union",
          discriminator: {
            peek: "uint8"
          },
          variants: [
            { when: "value >= 0xC0", type: "Pointer" },
            { when: "value < 0xC0", type: "DirectValue" }
          ]
        } as any
      }
    },
    expectedTypes: [
      {
        typeName: "ValueOrPointer",
        mustContain: [
          "function decodeValueOrPointer(",
          "function encodeValueOrPointer(",
          // Peek discriminator value
          "const discriminator = stream.peekUint8()",
          // Variant 1: value >= 0xC0
          "if (discriminator >= 0xC0)",
          "const value = decodePointer(stream)",
          "return { type: 'Pointer', value }",
          // Variant 2: value < 0xC0
          "else if (discriminator < 0xC0)",
          "const value = decodeDirectValue(stream)",
          "return { type: 'DirectValue', value }",
          // Encoding
          "if (value.type === 'Pointer')",
          "encodePointer(stream, value.value)",
          "if (value.type === 'DirectValue')",
          "encodeDirectValue(stream, value.value)",
          // Type definitions
          "type ValueOrPointer =",
          "| { type: 'Pointer'; value: Pointer }",
          "| { type: 'DirectValue'; value: DirectValue }"
        ]
      }
    ]
  },

  {
    description: "Peek-based discriminated union (uint16 big-endian)",
    shouldCompile: true,
    schema: {
      types: {
        "TypeA": { sequence: [{ name: "a", type: "uint8" }] },
        "TypeB": { sequence: [{ name: "b", type: "uint8" }] },
        "Union16": {
          type: "discriminated_union",
          discriminator: {
            peek: "uint16",
            endianness: "big_endian"
          },
          variants: [
            { when: "value >= 0xC000", type: "TypeA" },
            { when: "value < 0xC000", type: "TypeB" }
          ]
        } as any
      }
    },
    expectedTypes: [
      {
        typeName: "Union16",
        mustContain: [
          "function decodeUnion16(",
          // Peek uint16 with correct endianness
          "const discriminator = stream.peekUint16('big')",
          "if (discriminator >= 0xC000)",
          "if (discriminator < 0xC000)"
        ]
      }
    ]
  },

  {
    description: "Peek-based discriminated union (uint32 little-endian)",
    shouldCompile: true,
    schema: {
      types: {
        "TypeX": { sequence: [{ name: "x", type: "uint8" }] },
        "TypeY": { sequence: [{ name: "y", type: "uint8" }] },
        "Union32": {
          type: "discriminated_union",
          discriminator: {
            peek: "uint32",
            endianness: "little_endian"
          },
          variants: [
            { when: "value >= 0x80000000", type: "TypeX" },
            { when: "value < 0x80000000", type: "TypeY" }
          ]
        } as any
      }
    },
    expectedTypes: [
      {
        typeName: "Union32",
        mustContain: [
          "function decodeUnion32(",
          // Peek uint32 with correct endianness
          "const discriminator = stream.peekUint32('little')",
          "if (discriminator >= 0x80000000)"
        ]
      }
    ]
  },

  // ==========================================================================
  // Field-Based Discriminators (SuperChat Pattern)
  // ==========================================================================

  {
    description: "Field-based discriminated union (reference earlier field)",
    shouldCompile: true,
    schema: {
      types: {
        "LoginPayload": {
          sequence: [
            { name: "username", type: "string", kind: "length_prefixed", length_type: "uint8", encoding: "utf8" }
          ]
        },
        "MessagePayload": {
          sequence: [
            { name: "text", type: "string", kind: "length_prefixed", length_type: "uint8", encoding: "utf8" }
          ]
        },
        "Frame": {
          sequence: [
            { name: "message_type", type: "uint8" },
            { name: "flags", type: "uint8" },
            {
              name: "payload",
              type: "discriminated_union",
              discriminator: { field: "message_type" },
              variants: [
                { when: "value == 0x01", type: "LoginPayload" },
                { when: "value == 0x02", type: "MessagePayload" }
              ]
            } as any
          ]
        }
      }
    },
    expectedTypes: [
      {
        typeName: "Frame",
        mustContain: [
          "function decodeFrame(",
          // Read fields before discriminator
          "const message_type = stream.readUint8()",
          "const flags = stream.readUint8()",
          // Use message_type as discriminator (NOT peek)
          "if (message_type == 0x01)",
          "const payload = decodeLoginPayload(stream)",
          "payload: { type: 'LoginPayload', value: payload }",
          "else if (message_type == 0x02)",
          "const payload = decodeMessagePayload(stream)",
          "payload: { type: 'MessagePayload', value: payload }",
          // Encoding
          "stream.writeUint8(value.message_type)",
          "stream.writeUint8(value.flags)",
          "if (value.payload.type === 'LoginPayload')",
          "encodeLoginPayload(stream, value.payload.value)"
        ],
        mustNotContain: [
          "peekUint8" // Field-based should NOT use peek
        ]
      }
    ]
  },

  // ==========================================================================
  // Complex Conditions
  // ==========================================================================

  {
    description: "Discriminated union with complex 'when' conditions",
    shouldCompile: true,
    schema: {
      types: {
        "TypeA": { sequence: [{ name: "a", type: "uint8" }] },
        "TypeB": { sequence: [{ name: "b", type: "uint8" }] },
        "TypeC": { sequence: [{ name: "c", type: "uint8" }] },
        "ComplexUnion": {
          type: "discriminated_union",
          discriminator: { peek: "uint8" },
          variants: [
            { when: "(value & 0xF0) == 0x80", type: "TypeA" },
            { when: "(value & 0x0F) == 0x0C", type: "TypeB" },
            { when: "value == 0xFF", type: "TypeC" }
          ]
        } as any
      }
    },
    expectedTypes: [
      {
        typeName: "ComplexUnion",
        mustContain: [
          "const discriminator = stream.peekUint8()",
          "if ((discriminator & 0xF0) == 0x80)",
          "else if ((discriminator & 0x0F) == 0x0C)",
          "else if (discriminator == 0xFF)"
        ]
      }
    ]
  },

  // ==========================================================================
  // Fallback Variants
  // ==========================================================================

  {
    description: "Discriminated union with fallback variant (no 'when')",
    shouldCompile: true,
    schema: {
      types: {
        "KnownType": { sequence: [{ name: "data", type: "uint8" }] },
        "UnknownType": { sequence: [{ name: "raw", type: "uint8" }] },
        "WithFallback": {
          type: "discriminated_union",
          discriminator: { peek: "uint8" },
          variants: [
            { when: "value == 0x01", type: "KnownType" },
            { type: "UnknownType" } // Fallback (no 'when')
          ]
        } as any
      }
    },
    expectedTypes: [
      {
        typeName: "WithFallback",
        mustContain: [
          "const discriminator = stream.peekUint8()",
          "if (discriminator == 0x01)",
          "const value = decodeKnownType(stream)",
          "else", // Fallback else
          "const value = decodeUnknownType(stream)",
          "return { type: 'UnknownType', value }"
        ]
      }
    ]
  },

  // ==========================================================================
  // Nested Discriminated Unions
  // ==========================================================================

  {
    description: "Nested discriminated unions",
    shouldCompile: true,
    schema: {
      types: {
        "Leaf": { sequence: [{ name: "value", type: "uint8" }] },
        "Inner": {
          type: "discriminated_union",
          discriminator: { peek: "uint8" },
          variants: [
            { when: "value == 0x01", type: "Leaf" },
            { when: "value == 0x02", type: "Leaf" }
          ]
        } as any,
        "Outer": {
          type: "discriminated_union",
          discriminator: { peek: "uint8" },
          variants: [
            { when: "value == 0x10", type: "Inner" },
            { when: "value == 0x20", type: "Leaf" }
          ]
        } as any
      }
    },
    expectedTypes: [
      {
        typeName: "Outer",
        mustContain: [
          "function decodeOuter(",
          "const discriminator = stream.peekUint8()",
          "if (discriminator == 0x10)",
          "const value = decodeInner(stream)", // Nested call
          "return { type: 'Inner', value }"
        ]
      },
      {
        typeName: "Inner",
        mustContain: [
          "function decodeInner(",
          "const discriminator = stream.peekUint8()",
          "if (discriminator == 0x01)",
          "const value = decodeLeaf(stream)"
        ]
      }
    ]
  },

  // ==========================================================================
  // Security: Encoding Type Tags (CRITICAL)
  // ==========================================================================

  {
    description: "CRITICAL: Discriminated union encoding requires explicit type tag",
    shouldCompile: true,
    schema: {
      types: {
        "TypeA": { sequence: [{ name: "a", type: "uint8" }] },
        "TypeB": { sequence: [{ name: "b", type: "uint8" }] },
        "TaggedUnion": {
          type: "discriminated_union",
          discriminator: { peek: "uint8" },
          variants: [
            { when: "value == 0x01", type: "TypeA" },
            { when: "value == 0x02", type: "TypeB" }
          ]
        } as any
      }
    },
    expectedTypes: [
      {
        typeName: "TaggedUnion",
        mustContain: [
          // Encoding must check type tag
          "function encodeTaggedUnion(",
          "if (value.type === 'TypeA')",
          "encodeTypeA(stream, value.value)",
          "else if (value.type === 'TypeB')",
          "encodeTypeB(stream, value.value)",
          // Fallthrough error for unknown type
          "else",
          "throw new Error",
          "Unknown variant type"
        ]
      }
    ]
  },

  // ==========================================================================
  // Error Handling
  // ==========================================================================

  {
    description: "Discriminated union with exhaustive error handling",
    shouldCompile: true,
    schema: {
      types: {
        "TypeA": { sequence: [{ name: "a", type: "uint8" }] },
        "TypeB": { sequence: [{ name: "b", type: "uint8" }] },
        "StrictUnion": {
          type: "discriminated_union",
          discriminator: { peek: "uint8" },
          variants: [
            { when: "value == 0x01", type: "TypeA" },
            { when: "value == 0x02", type: "TypeB" }
            // No fallback - should throw on unknown discriminator
          ]
        } as any
      }
    },
    expectedTypes: [
      {
        typeName: "StrictUnion",
        mustContain: [
          "const discriminator = stream.peekUint8()",
          "if (discriminator == 0x01)",
          "else if (discriminator == 0x02)",
          // Should throw on unknown discriminator
          "throw new Error(",
          "Unknown discriminator",
          "0x${discriminator.toString(16)}"
        ]
      }
    ]
  },

  // ==========================================================================
  // Type Alias Form
  // ==========================================================================

  {
    description: "Discriminated union as type alias (not in struct)",
    shouldCompile: true,
    schema: {
      types: {
        "PointerData": { sequence: [{ name: "offset", type: "uint16", endianness: "big_endian" }] },
        "DirectData": { sequence: [{ name: "bytes", type: "uint8" }] },
        "DataUnion": {
          type: "discriminated_union",
          discriminator: { peek: "uint8" },
          variants: [
            { when: "value >= 0xC0", type: "PointerData" },
            { when: "value < 0xC0", type: "DirectData" }
          ]
        } as any,
        "Container": {
          sequence: [
            { name: "length", type: "uint8" },
            { name: "data", type: "DataUnion" } // Reference type alias
          ]
        }
      }
    },
    expectedTypes: [
      {
        typeName: "Container",
        mustContain: [
          "function decodeContainer(",
          "const length = stream.readUint8()",
          "const data = decodeDataUnion(stream)", // Call discriminated union decoder
          "return { length, data }"
        ]
      },
      {
        typeName: "DataUnion",
        mustContain: [
          "function decodeDataUnion(",
          "type DataUnion =",
          "| { type: 'PointerData'; value: PointerData }",
          "| { type: 'DirectData'; value: DirectData }"
        ]
      }
    ]
  },
];

/**
 * Run all discriminated union code generation tests
 */
export function runDiscriminatedUnionCodegenTests() {
  console.log("\n=== Discriminated Union Code Generation Tests ===\n");

  let passed = 0;
  let failed = 0;

  for (const tc of DISCRIMINATED_UNION_CODEGEN_TESTS) {
    try {
      const generatedCode = generateTypeScriptCode(tc.schema);

      // Check each expected type
      for (const expectedType of tc.expectedTypes) {
        // Verify all required patterns are present
        for (const pattern of expectedType.mustContain) {
          if (!generatedCode.includes(pattern)) {
            console.error(
              `✗ ${tc.description}\n  Type '${expectedType.typeName}' missing required pattern:\n  "${pattern}"`
            );
            failed++;
            continue;
          }
        }

        // Verify forbidden patterns are absent
        if (expectedType.mustNotContain) {
          for (const pattern of expectedType.mustNotContain) {
            if (generatedCode.includes(pattern)) {
              console.error(
                `✗ ${tc.description}\n  Type '${expectedType.typeName}' contains forbidden pattern:\n  "${pattern}"`
              );
              failed++;
              continue;
            }
          }
        }
      }

      passed++;
    } catch (error: any) {
      console.error(`✗ ${tc.description}\n  Code generation failed: ${error.message}`);
      failed++;
    }
  }

  console.log(`✓ ${passed} tests passed`);
  if (failed > 0) {
    console.log(`✗ ${failed} tests failed`);
    throw new Error(`${failed} discriminated union codegen tests failed`);
  }

  console.log("\n✓ All discriminated union code generation tests passed!\n");
}

// Run tests if executed directly
if (require.main === module) {
  runDiscriminatedUnionCodegenTests();
}
