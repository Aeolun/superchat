#!/usr/bin/env bun
// ABOUTME: Script to remove manual fields arrays from .meta() calls
// ABOUTME: This allows schema-extracted fields (with constraints) to show in docs

import { readFileSync, writeFileSync } from "fs";
import { resolve } from "path";

const SCHEMA_PATH = resolve(process.cwd(), "src/schema/binary-schema.ts");

function main() {
  console.log("Reading binary-schema.ts...");
  let content = readFileSync(SCHEMA_PATH, "utf-8");

  // Remove fields arrays from .meta() calls
  // Match: fields: [ ... ],
  // We need to handle multi-line arrays, so use a more careful approach

  // Strategy: Find each 'fields: [' and match until the closing '],'
  let modified = content;
  let iteration = 0;
  const maxIterations = 20; // Safety limit

  while (modified.includes("fields: [") && iteration < maxIterations) {
    iteration++;

    // Find next occurrence
    const fieldsIndex = modified.indexOf("fields: [");
    if (fieldsIndex === -1) break;

    // Find the matching closing bracket
    let depth = 0;
    let inArray = false;
    let endIndex = fieldsIndex;

    for (let i = fieldsIndex; i < modified.length; i++) {
      const char = modified[i];

      if (char === "[") {
        depth++;
        inArray = true;
      } else if (char === "]") {
        depth--;
        if (depth === 0 && inArray) {
          // Found the closing bracket
          // Check if there's a comma after it
          let j = i + 1;
          while (j < modified.length && /\s/.test(modified[j])) {
            j++;
          }
          if (modified[j] === ",") {
            endIndex = j + 1;
          } else {
            endIndex = i + 1;
          }
          break;
        }
      }
    }

    // Remove this fields array
    const before = modified.substring(0, fieldsIndex);
    const after = modified.substring(endIndex);
    modified = before + after;

    console.log(`Iteration ${iteration}: Removed fields array at position ${fieldsIndex}`);
  }

  // Write back
  console.log("\nWriting updated file...");
  writeFileSync(SCHEMA_PATH, modified, "utf-8");

  console.log("✅ Removed all manual fields arrays!");
  console.log("\nNext steps:");
  console.log("1. Review: git diff src/schema/binary-schema.ts");
  console.log("2. Test: npm test");
  console.log("3. Generate HTML: bun run src/generate-type-reference.ts");
  console.log("4. Check that constraints appear in generated HTML");
}

main();
