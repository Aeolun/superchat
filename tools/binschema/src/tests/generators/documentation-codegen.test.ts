/**
 * Documentation Code Generation Tests
 *
 * Ensures that generated TypeScript includes metadata-driven JSDoc comments.
 */

import { generateTypeScript } from "../../generators/typescript";
import { type BinarySchema } from "../../schema/binary-schema";

function assertContains(code: string, description: string, snippet: string): boolean {
  if (!code.includes(snippet)) {
    console.error(`✗ Missing documentation snippet (${description}):\n  ${snippet}`);
    return false;
  }
  return true;
}

export function runDocumentationCodegenTests() {
  console.log("\n=== Documentation Code Generation Tests ===\n");

  let passed = 0;
  let failed = 0;

  const schema: BinarySchema = {
    config: {
      endianness: "big_endian",
    },
    types: {
      "String": {
        description: "Length-prefixed UTF-8 string",
        type: "string",
        kind: "length_prefixed",
        length_type: "uint16",
        encoding: "utf8",
      },
      "Example": {
        description: "Example structure using built-in and composite types",
        sequence: [
          { name: "count", type: "uint8", description: "Number of items" },
          {
            name: "payload",
            type: "array",
            kind: "field_referenced",
            length_field: "count",
            items: { type: "String" },
          } as any,
        ],
      },
    },
  };

  try {
    const code = generateTypeScript(schema);
    const normalizedCode = code.replace(/\r\n/g, "\n").replace(/^ +/gm, "");

    const checks: Array<{ description: string; snippet?: string; pattern?: RegExp }> = [
      {
        description: "built-in primitive metadata (uint8)",
        pattern: /\* Number of items[\s\S]*?\* @remarks\n\*\n\* 8-bit Unsigned Integer/,
      },
      {
        description: "array configuration details",
        snippet: "* Array kind: field_referenced (length from 'count')",
      },
      {
        description: "array metadata separated by blank line",
        snippet: "* Collection of elements of the same type. Supports fixed-length, length-prefixed, field-referenced, and null-terminated arrays.\n*\n* @remarks\n*\n* Array kind: field_referenced",
      },
      {
        description: "string alias detailed metadata",
        snippet: "* @remarks\n*\n* String",
      },
      {
        description: "string alias encoding metadata",
        snippet: "* Encoding: utf8",
      },
    ];

    for (const check of checks) {
      if (check.pattern) {
        if (check.pattern.test(normalizedCode)) {
          passed++;
        } else {
          console.error(`✗ Missing documentation snippet (${check.description}):\n  ${check.pattern}`);
          failed++;
        }
        continue;
      }

      if (assertContains(normalizedCode, check.description, check.snippet!)) {
        passed++;
      } else {
        failed++;
      }
    }
  } catch (error: any) {
    console.error(`✗ Documentation code generation failed: ${error?.message ?? error}`);
    failed++;
  }

  console.log(`✓ ${passed} documentation assertions passed`);
  if (failed > 0) {
    console.log(`✗ ${failed} documentation assertions failed`);
    throw new Error(`${failed} documentation codegen tests failed`);
  }
}

runDocumentationCodegenTests();
