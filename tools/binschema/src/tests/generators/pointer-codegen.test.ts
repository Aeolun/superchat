/**
 * Pointer Code Generation Tests
 *
 * Tests TypeScript code generation for pointers (DNS compression pattern).
 * Covers different storage types, offset masks, and offset calculation modes.
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

const POINTER_CODEGEN_TESTS: CodegenTestCase[] = [
  // ==========================================================================
  // Basic Pointer (DNS Compression Pattern)
  // ==========================================================================

  {
    description: "Basic pointer with uint16 storage (DNS pattern)",
    shouldCompile: true,
    schema: {
      types: {
        "Label": {
          sequence: [
            { name: "length", type: "uint8" },
            { name: "data", type: "array", kind: "fixed", length: 3, items: { type: "uint8" } }
          ]
        },
        "LabelPointer": {
          type: "pointer",
          storage: "uint16",
          offset_mask: "0x3FFF",
          offset_from: "message_start",
          target_type: "Label",
          endianness: "big_endian"
        } as any,
        "DomainName": {
          sequence: [
            { name: "label_or_pointer", type: "LabelPointer" }
          ]
        }
      }
    },
    expectedTypes: [
      {
        typeName: "DomainName",
        mustContain: [
          "function decodeDomainName(",
          // Read pointer storage
          "const pointerValue = stream.readUint16('big')",
          // Extract offset using mask
          "const offset = pointerValue & 0x3FFF",
          // Save current position
          "stream.pushPosition()",
          // Seek to offset from message start
          "stream.seek(offset)",
          // Decode target type
          "const label_or_pointer = decodeLabel(stream)",
          // Restore position
          "stream.popPosition()",
          "return { label_or_pointer }",
          // Encoding
          "function encodeDomainName(",
          "encodeLabel(stream, value.label_or_pointer)"
        ]
      }
    ]
  },

  // ==========================================================================
  // Different Storage Types
  // ==========================================================================

  {
    description: "Pointer with uint8 storage",
    shouldCompile: true,
    schema: {
      types: {
        "Data": { sequence: [{ name: "byte", type: "uint8" }] },
        "Pointer8": {
          type: "pointer",
          storage: "uint8",
          offset_mask: "0x7F",
          offset_from: "message_start",
          target_type: "Data"
          // No endianness for uint8
        } as any
      }
    },
    expectedTypes: [
      {
        typeName: "Pointer8",
        mustContain: [
          "function decodePointer8(",
          "const pointerValue = stream.readUint8()", // uint8 storage
          "const offset = pointerValue & 0x7F",
          "stream.pushPosition()",
          "stream.seek(offset)",
          "const value = decodeData(stream)",
          "stream.popPosition()",
          "return value"
        ]
      }
    ]
  },

  {
    description: "Pointer with uint32 storage (big-endian)",
    shouldCompile: true,
    schema: {
      types: {
        "LargeData": { sequence: [{ name: "value", type: "uint32", endianness: "big_endian" }] },
        "Pointer32BE": {
          type: "pointer",
          storage: "uint32",
          offset_mask: "0x7FFFFFFF",
          offset_from: "message_start",
          target_type: "LargeData",
          endianness: "big_endian"
        } as any
      }
    },
    expectedTypes: [
      {
        typeName: "Pointer32BE",
        mustContain: [
          "function decodePointer32BE(",
          "const pointerValue = stream.readUint32('big')", // uint32 big-endian
          "const offset = pointerValue & 0x7FFFFFFF"
        ]
      }
    ]
  },

  {
    description: "CRITICAL: Pointer with little-endian storage (test both endianness paths)",
    shouldCompile: true,
    schema: {
      types: {
        "Data": { sequence: [{ name: "value", type: "uint8" }] },
        "PointerLE": {
          type: "pointer",
          storage: "uint16",
          offset_mask: "0x3FFF",
          offset_from: "message_start",
          target_type: "Data",
          endianness: "little_endian" // Test little-endian path
        } as any
      }
    },
    expectedTypes: [
      {
        typeName: "PointerLE",
        mustContain: [
          "const pointerValue = stream.readUint16('little')", // Correct little-endian
          "const offset = pointerValue & 0x3FFF"
        ]
      }
    ]
  },

  // ==========================================================================
  // Offset Calculation Modes
  // ==========================================================================

  {
    description: "Pointer with offset_from = current_position",
    shouldCompile: true,
    schema: {
      types: {
        "Target": { sequence: [{ name: "data", type: "uint8" }] },
        "RelativePointer": {
          type: "pointer",
          storage: "uint16",
          offset_mask: "0xFFFF",
          offset_from: "current_position",
          target_type: "Target",
          endianness: "big_endian"
        } as any
      }
    },
    expectedTypes: [
      {
        typeName: "RelativePointer",
        mustContain: [
          "function decodeRelativePointer(",
          "const pointerValue = stream.readUint16('big')",
          "const offset = pointerValue & 0xFFFF",
          // Calculate offset from current position (after reading pointer)
          "const currentPos = stream.position",
          "stream.pushPosition()",
          "stream.seek(currentPos + offset)",
          "const value = decodeTarget(stream)",
          "stream.popPosition()"
        ]
      }
    ]
  },

  // ==========================================================================
  // Pointer Chains
  // ==========================================================================

  {
    description: "Pointer to another pointer (chain)",
    shouldCompile: true,
    schema: {
      types: {
        "Leaf": { sequence: [{ name: "value", type: "uint8" }] },
        "PointerToLeaf": {
          type: "pointer",
          storage: "uint16",
          offset_mask: "0x3FFF",
          offset_from: "message_start",
          target_type: "Leaf",
          endianness: "big_endian"
        } as any,
        "PointerToPointer": {
          type: "pointer",
          storage: "uint16",
          offset_mask: "0x3FFF",
          offset_from: "message_start",
          target_type: "PointerToLeaf",
          endianness: "big_endian"
        } as any
      }
    },
    expectedTypes: [
      {
        typeName: "PointerToPointer",
        mustContain: [
          "function decodePointerToPointer(",
          "const pointerValue = stream.readUint16('big')",
          "const offset = pointerValue & 0x3FFF",
          "stream.pushPosition()",
          "stream.seek(offset)",
          "const value = decodePointerToLeaf(stream)", // Recursive pointer following
          "stream.popPosition()"
        ]
      }
    ]
  },

  // ==========================================================================
  // Pointers in Structs
  // ==========================================================================

  {
    description: "Pointer as field in struct",
    shouldCompile: true,
    schema: {
      types: {
        "Label": { sequence: [{ name: "text", type: "uint8" }] },
        "LabelPtr": {
          type: "pointer",
          storage: "uint16",
          offset_mask: "0x3FFF",
          offset_from: "message_start",
          target_type: "Label",
          endianness: "big_endian"
        } as any,
        "DomainRecord": {
          sequence: [
            { name: "id", type: "uint16", endianness: "big_endian" },
            { name: "name", type: "LabelPtr" },
            { name: "type", type: "uint16", endianness: "big_endian" }
          ]
        }
      }
    },
    expectedTypes: [
      {
        typeName: "DomainRecord",
        mustContain: [
          "function decodeDomainRecord(",
          "const id = stream.readUint16('big')",
          "const name = decodeLabelPtr(stream)", // Call pointer decoder
          "const type = stream.readUint16('big')",
          "return { id, name, type }"
        ]
      }
    ]
  },

  // ==========================================================================
  // Pointers in Arrays
  // ==========================================================================

  {
    description: "Array of pointers",
    shouldCompile: true,
    schema: {
      types: {
        "String": {
          sequence: [
            { name: "length", type: "uint8" },
            { name: "chars", type: "array", kind: "fixed", length: 5, items: { type: "uint8" } }
          ]
        },
        "StringPtr": {
          type: "pointer",
          storage: "uint16",
          offset_mask: "0x3FFF",
          offset_from: "message_start",
          target_type: "String",
          endianness: "big_endian"
        } as any,
        "StringTable": {
          sequence: [
            { name: "count", type: "uint8" },
            {
              name: "strings",
              type: "array",
              kind: "fixed",
              length: 3,
              items: { type: "StringPtr" } as any
            }
          ]
        }
      }
    },
    expectedTypes: [
      {
        typeName: "StringTable",
        mustContain: [
          "function decodeStringTable(",
          "const count = stream.readUint8()",
          // Array of pointers
          "const strings: StringPtr[] = []",
          "for (let i = 0; i < 3; i++)",
          "strings.push(decodeStringPtr(stream))",
          "return { count, strings }"
        ]
      }
    ]
  },

  // ==========================================================================
  // Type Alias Form
  // ==========================================================================

  {
    description: "Pointer as type alias (standalone definition)",
    shouldCompile: true,
    schema: {
      types: {
        "Data": { sequence: [{ name: "value", type: "uint8" }] },
        "DataPointer": {
          type: "pointer",
          storage: "uint16",
          offset_mask: "0x3FFF",
          offset_from: "message_start",
          target_type: "Data",
          endianness: "big_endian",
          description: "Pointer to compressed data"
        } as any
      }
    },
    expectedTypes: [
      {
        typeName: "DataPointer",
        mustContain: [
          "function decodeDataPointer(",
          "function encodeDataPointer(",
          "type DataPointer = Data", // Type alias to target
          "// Pointer to compressed data" // Description comment
        ]
      }
    ]
  },

  // ==========================================================================
  // Complex Offset Masks
  // ==========================================================================

  {
    description: "Pointer with custom offset mask (not full range)",
    shouldCompile: true,
    schema: {
      types: {
        "Target": { sequence: [{ name: "data", type: "uint8" }] },
        "MaskedPointer": {
          type: "pointer",
          storage: "uint16",
          offset_mask: "0x0FFF", // Only 12 bits for offset (top 4 bits used for flags)
          offset_from: "message_start",
          target_type: "Target",
          endianness: "big_endian"
        } as any
      }
    },
    expectedTypes: [
      {
        typeName: "MaskedPointer",
        mustContain: [
          "const pointerValue = stream.readUint16('big')",
          "const offset = pointerValue & 0x0FFF", // Custom mask
          "stream.seek(offset)"
        ]
      }
    ]
  },

  // ==========================================================================
  // Security: Circular Reference Detection (CRITICAL)
  // ==========================================================================

  {
    description: "CRITICAL: Pointer circular reference detection (DoS protection)",
    shouldCompile: true,
    schema: {
      types: {
        "SelfPointer": {
          sequence: [
            { name: "ptr", type: "SelfPointerRef" }
          ]
        },
        "SelfPointerRef": {
          type: "pointer",
          storage: "uint16",
          offset_mask: "0x3FFF",
          offset_from: "message_start",
          target_type: "SelfPointer", // Could create cycle!
          endianness: "big_endian"
        } as any
      }
    },
    expectedTypes: [
      {
        typeName: "SelfPointerRef",
        mustContain: [
          // Track visited offsets
          "visitedOffsets = new Set<number>()",
          "visitedOffsets.has(offset)",
          // Throw on circular reference
          "throw new Error",
          "Circular pointer reference",
          "visitedOffsets.add(offset)",
          // Clean up after decode
          "visitedOffsets.clear()"
        ]
      }
    ]
  },

  {
    description: "CRITICAL: Position stack overflow protection (respect MAX_DEPTH)",
    shouldCompile: true,
    schema: {
      types: {
        "Leaf": { sequence: [{ name: "value", type: "uint8" }] },
        "DeepPointer": {
          type: "pointer",
          storage: "uint16",
          offset_mask: "0x3FFF",
          offset_from: "message_start",
          target_type: "DeepPointer", // Nested pointer
          endianness: "big_endian"
        } as any
      }
    },
    expectedTypes: [
      {
        typeName: "DeepPointer",
        mustContain: [
          // Should use pushPosition/popPosition (runtime enforces depth limit)
          "stream.pushPosition()",
          "stream.popPosition()",
          // Runtime will throw if MAX_DEPTH exceeded (tested in bit-stream.ts)
        ]
      }
    ]
  },

  {
    description: "CRITICAL: visitedOffsets cleared at start of decode",
    shouldCompile: true,
    schema: {
      types: {
        "Data": { sequence: [{ name: "value", type: "uint8" }] },
        "Ptr": {
          type: "pointer",
          storage: "uint16",
          offset_mask: "0x3FFF",
          offset_from: "message_start",
          target_type: "Data",
          endianness: "big_endian"
        } as any
      }
    },
    expectedTypes: [
      {
        typeName: "Ptr",
        mustContain: [
          // Should clear visited offsets at start of decode
          "visitedOffsets.clear()",
          "visitedOffsets = new Set<number>()"
        ]
      }
    ]
  },

  // ==========================================================================
  // Error Handling
  // ==========================================================================

  {
    description: "Pointer with bounds checking",
    shouldCompile: true,
    schema: {
      types: {
        "SafeData": { sequence: [{ name: "byte", type: "uint8" }] },
        "SafePointer": {
          type: "pointer",
          storage: "uint16",
          offset_mask: "0x3FFF",
          offset_from: "message_start",
          target_type: "SafeData",
          endianness: "big_endian"
        } as any
      }
    },
    expectedTypes: [
      {
        typeName: "SafePointer",
        mustContain: [
          "const offset = pointerValue & 0x3FFF",
          // Should have bounds checking (implementation detail)
          "stream.seek(offset)" // Seek will throw if out of bounds
        ]
      }
    ]
  },
];

/**
 * Run all pointer code generation tests
 */
export function runPointerCodegenTests() {
  console.log("\n=== Pointer Code Generation Tests ===\n");

  let passed = 0;
  let failed = 0;

  for (const tc of POINTER_CODEGEN_TESTS) {
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
    throw new Error(`${failed} pointer codegen tests failed`);
  }

  console.log("\n✓ All pointer code generation tests passed!\n");
}

// Run tests if executed directly
if (require.main === module) {
  runPointerCodegenTests();
}
