#!/usr/bin/env bun
// ABOUTME: Test extraction of array element structure
// ABOUTME: Verifies that we extract fields from array element objects

import { z } from "zod";
import { extractFields } from "./src/extract.js";

const TestSchema = z.object({
  fields: z.array(z.object({
    name: z.string(),
    offset: z.number().int().min(0),
    size: z.number().int().min(1),
    description: z.string().optional(),
  })),
});

console.log("Testing array element field extraction...\n");

const fields = extractFields(TestSchema);

if (!fields) {
  console.error("❌ No fields extracted!");
  process.exit(1);
}

const fieldsField = fields.find((f) => f.name === "fields");
console.log("Fields field:");
console.log(JSON.stringify(fieldsField, null, 2));

// Check if we have union options or other metadata about the array elements
if (fieldsField?.unionOptions) {
  console.log("\n✅ Union options extracted:");
  console.log(JSON.stringify(fieldsField.unionOptions, null, 2));
} else {
  console.log("\n⚠️  No union options - we should extract the object structure!");
}
