// Debug what check types Zod uses for .length() and .regex()
import { z } from "zod";

// Test .length()
const lengthSchema = z.string().length(10);
const lengthDef = (lengthSchema as any)._def;
console.log("STRING LENGTH:");
console.log("Checks:", lengthDef.checks);
lengthDef.checks.forEach((check: any) => {
  console.log("  Check:", check._zod?.def);
});
console.log();

// Test .regex()
const regexSchema = z.string().regex(/^[A-Z]+$/);
const regexDef = (regexSchema as any)._def;
console.log("STRING REGEX:");
console.log("Checks:", regexDef.checks);
regexDef.checks.forEach((check: any) => {
  console.log("  Check:", check._zod?.def);
});
console.log();

// Test array .length()
const arrayLengthSchema = z.array(z.string()).length(5);
const arrayLengthDef = (arrayLengthSchema as any)._def;
console.log("ARRAY LENGTH:");
console.log("Checks:", arrayLengthDef.checks);
arrayLengthDef.checks.forEach((check: any) => {
  console.log("  Check:", check._zod?.def);
});
