/**
 * Generate SuperChat protocol encoder/decoder from schema
 */
import { readFileSync, writeFileSync, mkdirSync } from "fs";
import { resolve } from "path";
import { generateTypeScript } from "./src/generators/typescript.js";
import type { BinarySchema } from "./src/schema/binary-schema.js";

const schemaPath = resolve(__dirname, "examples/superchat-types.json");
const schema = JSON.parse(readFileSync(schemaPath, "utf-8")) as BinarySchema;

const generatedCode = generateTypeScript(schema);

// Ensure .generated directory exists
const outputDir = resolve(__dirname, ".generated");
try {
  mkdirSync(outputDir, { recursive: true });
} catch (err) {
  // Directory already exists, ignore
}

const outputPath = resolve(outputDir, "SuperChatCodec.ts");
writeFileSync(outputPath, generatedCode);

console.log(`Generated SuperChat codec written to: ${outputPath}`);
console.log(`\nTo use in a web client:`);
console.log(`  import { AuthRequestEncoder, AuthRequestDecoder } from './SuperChatCodec.js';`);
console.log(`  const encoder = new AuthRequestEncoder();`);
console.log(`  const bytes = encoder.encode({ nickname: 'alice', password: 'secret' });`);
