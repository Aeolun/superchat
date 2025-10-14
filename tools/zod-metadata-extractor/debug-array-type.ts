#!/usr/bin/env bun
// ABOUTME: Debug script to see what information is available in Zod array defs
// ABOUTME: Helps determine how to extract element type for display

import { z } from "zod";

// Test schemas with arrays
const schemas = {
  stringArray: z.array(z.string()),
  numberArray: z.array(z.number()),
  objectArray: z.array(z.object({ id: z.number(), name: z.string() })),
  unionArray: z.array(z.union([z.string(), z.number()])),
  nestedArray: z.array(z.array(z.string())),
};

for (const [name, schema] of Object.entries(schemas)) {
  console.log(`\n=== ${name} ===`);
  const def = (schema as any)._def;
  console.log("Type:", def.type);
  console.log("Has 'type' property:", def.type);
  console.log("Has 'item' property:", def.type?.type);
  console.log("Has 'element' property:", def.element);

  if (def.type) {
    console.log("Element def:", def.type._def || def.type.def);
  }

  console.log("\nFull def structure:");
  console.log(JSON.stringify(def, null, 2));
}
