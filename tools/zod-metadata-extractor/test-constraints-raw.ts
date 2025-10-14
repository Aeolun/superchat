// Inspect raw check objects without JSON.stringify
import { z } from "zod";

console.log("=== Raw Check Object Investigation ===\n");

// String with min/max
const stringSchema = z.string().min(5).max(100);
const stringDef = (stringSchema as any)._def;
console.log("STRING MIN/MAX checks:");
stringDef.checks.forEach((check: any, i: number) => {
  console.log(`  Check ${i}:`, check);
  console.log(`    kind:`, check.kind);
  console.log(`    value:`, check.value);
  console.log(`    message:`, check.message);
  console.log(`    Object.keys:`, Object.keys(check));
  console.log(`    Object.getOwnPropertyNames:`, Object.getOwnPropertyNames(check));
});
console.log();

// Number with range
const numberSchema = z.number().min(0).max(100);
const numberDef = (numberSchema as any)._def;
console.log("NUMBER MIN/MAX checks:");
numberDef.checks.forEach((check: any, i: number) => {
  console.log(`  Check ${i}:`, check);
  console.log(`    kind:`, check.kind);
  console.log(`    value:`, check.value);
  console.log(`    message:`, check.message);
});
console.log();

// Array with length
const arraySchema = z.array(z.string()).min(1).max(10);
const arrayDef = (arraySchema as any)._def;
console.log("ARRAY MIN/MAX checks:");
arrayDef.checks.forEach((check: any, i: number) => {
  console.log(`  Check ${i}:`, check);
  console.log(`    kind:`, check.kind);
  console.log(`    value:`, check.value);
  console.log(`    message:`, check.message);
});
console.log();

// Email (format constraint)
const emailSchema = z.string().email();
const emailDef = (emailSchema as any)._def;
console.log("EMAIL checks:");
emailDef.checks.forEach((check: any, i: number) => {
  console.log(`  Check ${i}:`, check);
  console.log(`    kind:`, check.kind);
  console.log(`    check:`, check.check); // Different property name?
});
console.log();
