#!/usr/bin/env bun
// ABOUTME: CLI wrapper for Go code generator (for testing with Go test harness)
// ABOUTME: Reads schema JSON and generates Go code

import { readFileSync, writeFileSync } from "fs";
import { generateGo } from "./go.js";
import type { BinarySchema } from "../schema/binary-schema.js";

// Parse command line arguments
const args = process.argv.slice(2);

function printUsage() {
  console.error("Usage: go-cli.ts --schema <path> --type <name> --out <path> [--package <name>]");
  process.exit(1);
}

// Parse arguments
let schemaPath: string | undefined;
let typeName: string | undefined;
let outPath: string | undefined;
let packageName: string | undefined;

for (let i = 0; i < args.length; i++) {
  switch (args[i]) {
    case "--schema":
      schemaPath = args[++i];
      break;
    case "--type":
      typeName = args[++i];
      break;
    case "--out":
      outPath = args[++i];
      break;
    case "--package":
      packageName = args[++i];
      break;
    default:
      console.error(`Unknown argument: ${args[i]}`);
      printUsage();
  }
}

if (!schemaPath || !typeName || !outPath) {
  console.error("Missing required arguments");
  printUsage();
}

try {
  // Read schema
  const schemaJson = readFileSync(schemaPath, "utf8");
  const schema: BinarySchema = JSON.parse(schemaJson);

  // Generate Go code
  const result = generateGo(schema, typeName, { packageName });

  // Write output
  writeFileSync(outPath, result.code);

  console.log(`Generated Go code for ${typeName} → ${outPath}`);
} catch (error) {
  console.error("Error:", error instanceof Error ? error.message : String(error));
  process.exit(1);
}
