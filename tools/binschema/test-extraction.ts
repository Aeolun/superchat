#!/usr/bin/env bun
// ABOUTME: Test script to verify constraint extraction is working
// ABOUTME: Checks if constraints are present in extracted field info

import { z } from "zod";
import { extractFields } from "../zod-metadata-extractor/src/extract.js";

// Test schema with constraints
const TestSchema = z.object({
  nickname: z.string().min(3).max(20),
  age: z.number().min(0).max(120),
  email: z.string().email(),
});

console.log("Testing constraint extraction...\n");

const fields = extractFields(TestSchema, { extractFieldMeta: true });

if (!fields) {
  console.error("❌ No fields extracted!");
  process.exit(1);
}

console.log("Extracted fields:");
for (const field of fields) {
  console.log(`\nField: ${field.name}`);
  console.log(`  Type: ${field.type}`);
  console.log(`  Required: ${field.required}`);
  if (field.constraints) {
    console.log(`  Constraints: ${JSON.stringify(field.constraints, null, 2)}`);
  } else {
    console.log(`  Constraints: none`);
  }
}

// Check that constraints were extracted
const nicknameField = fields.find((f) => f.name === "nickname");
if (!nicknameField?.constraints || nicknameField.constraints.length === 0) {
  console.error("\n❌ FAIL: nickname field has no constraints!");
  process.exit(1);
}

console.log("\n✅ SUCCESS: Constraints are being extracted correctly!");
