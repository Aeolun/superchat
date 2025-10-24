// Quick test script to generate zip_minimal with trace logging enabled
import { generateTypeScript } from "./src/generators/typescript.js";
import { writeFileSync } from "fs";

const zipMinimalSchema = {
  types: {
    ZipArchive: {
      fields: [
        {
          name: "entries",
          type: "array",
          kind: "fixed",
          length: 1,
          items: {
            type: "LocalFileHeader"
          }
        }
      ]
    },
    LocalFileHeader: {
      fields: [
        { name: "signature", type: "uint32", endianness: "little_endian" },
        { name: "version", type: "uint16", endianness: "little_endian" },
        { name: "flags", type: "uint16", endianness: "little_endian" },
        { name: "filename_length", type: "uint16", endianness: "little_endian" },
        {
          name: "filename",
          type: "string",
          kind: "fixed",
          length_field: "filename_length",
          encoding: "utf8"
        }
      ]
    }
  }
};

// Generate with trace logging enabled
const code = generateTypeScript(zipMinimalSchema as any, { addTraceLogs: true });
writeFileSync(".generated/zip_minimal_trace.ts", code);

console.log("Generated zip_minimal_trace.ts with trace logging");

// Now test decoding with it
const testBytes = [
  0x50, 0x4B, 0x03, 0x04,  // signature (little-endian)
  0x14, 0x00,              // version
  0x00, 0x00,              // flags
  0x08, 0x00,              // filename_length = 8
  0x74, 0x65, 0x73, 0x74, 0x2E, 0x74, 0x78, 0x74  // "test.txt"
];

console.log("\nTest bytes:", testBytes);

// Import and test
const { ZipArchiveDecoder } = await import("./.generated/zip_minimal_trace.ts");
const decoder = new ZipArchiveDecoder(testBytes);
console.log("\n--- Starting decode with trace logs ---");
const result = decoder.decode();
console.log("--- Finished decode ---\n");
console.log("Result:", JSON.stringify(result, null, 2));
