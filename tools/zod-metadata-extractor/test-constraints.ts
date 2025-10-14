// Test what validation constraints we extract
import { z } from "zod";
import { extractFields } from "./src/extract.js";

console.log("=== Testing Constraint Extraction ===\n");

// String constraints
const stringSchema = z.object({
  email: z.string().email(),
  short: z.string().min(5),
  long: z.string().max(100),
  exact: z.string().length(10),
  pattern: z.string().regex(/^[A-Z]+$/),
  url: z.string().url(),
  uuid: z.string().uuid(),
});

console.log("STRING CONSTRAINTS:");
const stringFields = extractFields(stringSchema);
stringFields?.forEach(field => {
  const def = (stringSchema as any).def.shape[field.name].def || (stringSchema as any).def.shape[field.name]._def;
  console.log(`${field.name.padEnd(10)} type="${field.type}"  checks=${JSON.stringify(def.checks || [])}`);
});

console.log("\nNUMBER CONSTRAINTS:");
const numberSchema = z.object({
  positive: z.number().positive(),
  negative: z.number().negative(),
  min: z.number().min(0),
  max: z.number().max(100),
  int: z.number().int(),
  finite: z.number().finite(),
  multipleOf: z.number().multipleOf(5),
});

const numberFields = extractFields(numberSchema);
numberFields?.forEach(field => {
  const def = (numberSchema as any).def.shape[field.name].def || (numberSchema as any).def.shape[field.name]._def;
  console.log(`${field.name.padEnd(12)} type="${field.type}"  checks=${JSON.stringify(def.checks || [])}`);
});

console.log("\nARRAY CONSTRAINTS:");
const arraySchema = z.object({
  minArray: z.array(z.string()).min(1),
  maxArray: z.array(z.string()).max(10),
  lengthArray: z.array(z.string()).length(5),
  nonempty: z.array(z.string()).nonempty(),
});

const arrayFields = extractFields(arraySchema);
arrayFields?.forEach(field => {
  const def = (arraySchema as any).def.shape[field.name].def || (arraySchema as any).def.shape[field.name]._def;
  console.log(`${field.name.padEnd(12)} type="${field.type}"  checks=${JSON.stringify(def.checks || [])}`);
});

console.log("\nDATE CONSTRAINTS:");
const dateSchema = z.object({
  minDate: z.date().min(new Date("2020-01-01")),
  maxDate: z.date().max(new Date("2030-12-31")),
});

const dateFields = extractFields(dateSchema);
dateFields?.forEach(field => {
  const def = (dateSchema as any).def.shape[field.name].def || (dateSchema as any).def.shape[field.name]._def;
  console.log(`${field.name.padEnd(12)} type="${field.type}"  checks=${JSON.stringify(def.checks || [])}`);
});

console.log("\n=== SUMMARY ===");
console.log("Zod stores constraints in 'def.checks' array");
console.log("Each check has: { kind: string, value?: any, message?: string }");
console.log("\nWe currently extract: type, required, description");
console.log("We DON'T extract: checks/constraints");
