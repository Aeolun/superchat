#!/usr/bin/env bun
// ABOUTME: Test that array element types are extracted correctly
// ABOUTME: Verifies that arrays show as Array<ElementType> not just "array"

import { z } from "zod";
import { extractFields } from "./src/extract.js";

const TestSchema = z.object({
  tags: z.array(z.string()),
  scores: z.array(z.number()),
  nested: z.array(z.array(z.string())),
  unionArray: z.array(z.union([z.string(), z.number()])),
});

console.log("Testing array type extraction...\n");

const fields = extractFields(TestSchema);

if (!fields) {
  console.error("❌ No fields extracted!");
  process.exit(1);
}

for (const field of fields) {
  console.log(`${field.name}: ${field.type}`);
}

// Verify correct formatting
const tags = fields.find((f) => f.name === "tags");
const scores = fields.find((f) => f.name === "scores");
const nested = fields.find((f) => f.name === "nested");

if (tags?.type !== "Array<string>") {
  console.error(`\n❌ FAIL: tags should be "Array<string>", got "${tags?.type}"`);
  process.exit(1);
}

if (scores?.type !== "Array<number>") {
  console.error(`\n❌ FAIL: scores should be "Array<number>", got "${scores?.type}"`);
  process.exit(1);
}

if (nested?.type !== "Array<Array<string>>") {
  console.error(`\n❌ FAIL: nested should be "Array<Array<string>>", got "${nested?.type}"`);
  process.exit(1);
}

console.log("\n✅ SUCCESS: Array types are formatted correctly!");
