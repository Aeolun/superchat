/**
 * Regenerate DNS message encoder/decoder from schema
 */
import { readFileSync, writeFileSync } from "fs";
import { resolve } from "path";
import { generateTypeScriptCode } from "./src/generators/typescript.js";
import { defineBinarySchema, type BinarySchema } from "./src/schema/binary-schema.js";
import JSON5 from "json5";

const schemaPath = resolve(__dirname, "src/tests/protocols/dns-complete-message.schema.json");
const rawSchema = JSON5.parse(readFileSync(schemaPath, "utf-8")) as BinarySchema;
const schema = defineBinarySchema(rawSchema);

const generatedCode = generateTypeScriptCode(schema);

const outputPath = resolve(__dirname, ".generated/DnsCodec.ts");
writeFileSync(outputPath, generatedCode);

console.log(`Generated code written to: ${outputPath}`);
