// ABOUTME: Generate HTML type reference documentation from BinSchema's Zod schemas
// ABOUTME: Extracts metadata from primitive type definitions and produces beautiful HTML docs

import { FieldSchema } from "./schema/binary-schema.js";
import { walkUnion, type ExtractedMetadata } from "./schema/extract-metadata.js";
import { generateTypeReferenceHTML } from "./generators/type-reference-html.js";
import { writeFileSync } from "fs";
import { resolve } from "path";

/**
 * Main entry point
 */
function main() {
  console.log("Extracting metadata from BinSchema type definitions...\n");

  // Extract metadata from FieldSchema union
  const metadata = walkUnion(FieldSchema);

  console.log(`Found metadata for ${metadata.size} types\n`);

  if (metadata.size === 0) {
    console.error("ERROR: No metadata found. Make sure types have .meta() calls.");
    process.exit(1);
  }

  // Generate HTML
  console.log("Generating HTML documentation...\n");
  const html = generateTypeReferenceHTML(metadata, {
    title: "BinSchema Type Reference",
    description: "Complete reference for all built-in types supported by BinSchema, including wire format specifications and code generation mappings.",
  });

  // Write to file
  const outputPath = resolve(process.cwd(), "type-reference.html");
  writeFileSync(outputPath, html, "utf-8");

  console.log(`✓ Generated type reference documentation: ${outputPath}`);
  console.log(`✓ Documented ${metadata.size} types\n`);
  console.log(`Documented types:`);
  for (const typeName of Array.from(metadata.keys()).sort()) {
    const meta = metadata.get(typeName)!;
    console.log(`  - ${typeName}: ${meta.title || "(no title)"}`);
  }
}

// Run if executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}
