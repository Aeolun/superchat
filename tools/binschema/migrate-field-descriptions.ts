#!/usr/bin/env bun
// ABOUTME: Script to migrate field descriptions from .meta().fields arrays to .describe() calls
// ABOUTME: Reads binary-schema.ts, transforms schemas, writes back to file

import { readFileSync, writeFileSync } from "fs";
import { resolve } from "path";

const SCHEMA_PATH = resolve(
  process.cwd(),
  "src/schema/binary-schema.ts"
);

// Map of schema names to their manual field descriptions
// Extracted from the .meta().fields arrays
const FIELD_DESCRIPTIONS: Record<string, Record<string, string>> = {
  Uint8FieldSchema: {
    name: "Field name in the generated struct/type",
    endianness:
      "Byte order (not applicable for single-byte types, included for consistency)",
  },
  Uint16FieldSchema: {
    name: "Field name in the generated struct/type",
    endianness:
      "Byte order (overrides global config if specified)",
  },
  Uint32FieldSchema: {
    name: "Field name in the generated struct/type",
    endianness:
      "Byte order (overrides global config if specified)",
  },
  OptionalFieldSchema: {
    name: "Field name in the generated struct/type",
    value_type:
      "Type of the wrapped value (primitive or type reference)",
    presence_type:
      "Type of presence indicator (defaults to uint8)",
  },
  ArrayFieldSchema: {
    name: "Field name in the generated struct/type",
    items:
      "Type of array elements (primitive, struct, or type reference)",
    length: "Fixed array size (required for kind=fixed)",
    length_type:
      "Type of length prefix (required for kind=length_prefixed and length_prefixed_items)",
    item_length_type:
      "Type of per-item length prefix (required for kind=length_prefixed_items)",
    length_field:
      "Field name to read length from (required for kind=field_referenced, supports dot notation)",
  },
  StringFieldSchema: {
    name: "Field name in the generated struct/type",
    kind: "How the string length is determined",
    encoding: "Character encoding (defaults to utf8)",
    length: "Fixed length in bytes (required for kind=fixed)",
    length_type:
      "Type of length prefix (required for kind=length_prefixed)",
  },
  DiscriminatedUnionFieldSchema: {
    name: "Field name in the generated struct/type",
    discriminator:
      "How to determine which variant to use - EITHER peek-based OR field-based (mutually exclusive)",
    "discriminator.peek":
      "Peek-based discriminator: Read next bytes without consuming them (use this OR field, not both)",
    "discriminator.field":
      "Field-based discriminator: Reference to earlier field with supports dot notation (use this OR peek, not both)",
    "discriminator.endianness":
      "Byte order for uint16/uint32 peek (only valid with peek, not with field)",
    variants: "List of possible variants with conditions",
  },
  PointerFieldSchema: {
    name: "Field name in the generated struct/type",
    storage: "How the pointer value is stored on wire",
    offset_mask:
      "Bit mask to extract offset from storage value (e.g., '0x3FFF')",
    offset_from: "Where offset is calculated from",
    target_type: "Type to parse at the target offset",
    endianness: "Byte order for uint16/uint32 storage",
  },
  BitfieldFieldSchema: {
    name: "Field name in the generated struct/type",
    size: "Total size in bits (determines byte count)",
    bit_order:
      "Bit ordering within bytes (overrides global config)",
    fields: "Array of bit fields with offset and size",
  },
  ConditionalFieldSchema: {
    name: "Field name in the generated struct/type",
    type: "Type of the field (primitive or type reference)",
    conditional:
      "Boolean expression referencing earlier fields (e.g., 'flags.extended == 1')",
  },
};

function main() {
  console.log("Reading binary-schema.ts...");
  let content = readFileSync(SCHEMA_PATH, "utf-8");

  // For each schema, add .describe() calls to fields
  for (const [schemaName, descriptions] of Object.entries(
    FIELD_DESCRIPTIONS
  )) {
    console.log(`\nProcessing ${schemaName}...`);

    // Find the schema definition
    const schemaRegex = new RegExp(
      `const ${schemaName} = z\\.object\\(\\{([^}]+)\\}\\)`,
      "s"
    );
    const match = content.match(schemaRegex);

    if (!match) {
      console.log(`  ⚠️  Could not find schema definition`);
      continue;
    }

    const [fullMatch, fieldsBlock] = match;
    let newFieldsBlock = fieldsBlock;

    // For each field with a description, add .describe()
    for (const [fieldName, description] of Object.entries(
      descriptions
    )) {
      // Skip nested field paths like "discriminator.peek"
      if (fieldName.includes(".")) {
        continue;
      }

      console.log(`  Adding description for field: ${fieldName}`);

      // Match field definition: name: z.string()
      // We need to add .describe() after the field type
      const fieldRegex = new RegExp(
        `(${fieldName}:\\s*[^,\\n]+?)(,|\\n)`,
        "g"
      );

      newFieldsBlock = newFieldsBlock.replace(
        fieldRegex,
        (match, fieldDef, separator) => {
          // Check if .describe() already exists
          if (fieldDef.includes(".describe(")) {
            console.log(`    ⚠️  Field already has .describe()`);
            return match;
          }

          // Add .describe() before the separator
          return `${fieldDef}.describe("${description}")${separator}`;
        }
      );
    }

    // Replace the fields block in the content
    content = content.replace(fieldsBlock, newFieldsBlock);
  }

  // Now remove all .meta() fields arrays
  console.log("\nRemoving .meta().fields arrays...");

  // Match .meta({ ... }) blocks that contain a fields array
  const metaWithFieldsRegex = /\.meta\(\{([^}]*fields:\s*\[[^\]]*\][^}]*)\}\)/gs;

  content = content.replace(metaWithFieldsRegex, (match, metaContent) => {
    // Remove the fields array but keep other meta properties
    const withoutFields = metaContent
      .replace(/fields:\s*\[[^\]]*\],?\s*/gs, "")
      .replace(/,\s*,/g, ",") // Clean up double commas
      .replace(/,\s*$/s, ""); // Clean up trailing comma

    return `.meta({${withoutFields}})`;
  });

  // Write back to file
  console.log("\nWriting updated file...");
  writeFileSync(SCHEMA_PATH, content, "utf-8");

  console.log("✅ Migration complete!");
  console.log("\nNext steps:");
  console.log("1. Review changes: git diff src/schema/binary-schema.ts");
  console.log("2. Run tests: npm test");
  console.log("3. Generate HTML: bun run src/generate-type-reference.ts");
  console.log("4. Verify constraints appear in generated HTML");
}

main();
