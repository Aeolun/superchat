// Deep dive into Zod's constraint storage
import { z } from "zod";

console.log("=== Deep Constraint Investigation ===\n");

// String with min/max
const stringSchema = z.string().min(5).max(100);
const stringDef = (stringSchema as any)._def;
console.log("STRING MIN/MAX:");
console.log("Type:", stringDef.typeName);
console.log("Full def:", JSON.stringify(stringDef, null, 2));
console.log();

// Number with range
const numberSchema = z.number().min(0).max(100);
const numberDef = (numberSchema as any)._def;
console.log("NUMBER MIN/MAX:");
console.log("Type:", numberDef.typeName);
console.log("Full def:", JSON.stringify(numberDef, null, 2));
console.log();

// Array with length
const arraySchema = z.array(z.string()).min(1).max(10);
const arrayDef = (arraySchema as any)._def;
console.log("ARRAY MIN/MAX:");
console.log("Type:", arrayDef.typeName);
console.log("Full def:", JSON.stringify(arrayDef, null, 2));
console.log();

// Email (format constraint)
const emailSchema = z.string().email();
const emailDef = (emailSchema as any)._def;
console.log("EMAIL:");
console.log("Type:", emailDef.typeName);
console.log("Full def:", JSON.stringify(emailDef, null, 2));
console.log();

console.log("=== FINDINGS ===");
console.log("Looking for where constraints are actually stored...");
