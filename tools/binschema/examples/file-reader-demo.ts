#!/usr/bin/env bun
// Demonstration of file-based reading without loading entire file

import { SeekableBitStreamDecoder } from "../src/runtime/seekable-bit-stream.js";
import { FileHandleReader } from "../src/runtime/binary-reader.js";
import { writeFileSync } from "fs";

console.log("BinSchema File Reader Demo");
console.log("===========================\n");

// Create a test file with known content
const testFile = "/tmp/binschema-test.bin";
const fileContent = new Uint8Array(1024); // 1KB file

// Fill with pattern: header, data, footer
fileContent.set([0xDE, 0xAD, 0xBE, 0xEF], 0); // Magic at start
fileContent.set([0x12, 0x34, 0x56, 0x78], 1020); // Footer at end
for (let i = 4; i < 1020; i++) {
  fileContent[i] = i % 256; // Fill with pattern
}

writeFileSync(testFile, fileContent);
console.log(`Created test file: ${testFile} (${fileContent.length} bytes)\n`);

// Read file without loading it all into memory
console.log("Reading file with FileHandleReader:");
try {
  const reader = FileHandleReader.fromPathSync(testFile);
  console.log(`  File size: ${reader.size} bytes`);
  console.log(`  Seekable: ${reader.seekable}`);
  
  // Read header (first 4 bytes)
  const header = reader.readAt(0, 4);
  console.log(`  Header: 0x${Array.from(header)
    .map(b => b.toString(16).padStart(2, '0')).join('')}`);
  
  // Read footer (last 4 bytes) using negative position
  const footer = reader.readAt(-4, 4);
  console.log(`  Footer: 0x${Array.from(footer)
    .map(b => b.toString(16).padStart(2, '0')).join('')}`);
  
  // Read a byte in the middle
  const middleByte = reader.readByteAt(512);
  console.log(`  Byte at position 512: 0x${middleByte.toString(16)}`);
  
  // Demonstrate that we haven't loaded the whole file
  console.log("\n✅ File was read without loading entire content into memory!");
  console.log("   Perfect for large binary files like ZIP, PDF, executables, etc.");
  
  reader.close();
} catch (error) {
  console.error("Error:", error);
}

console.log("\nUse cases for seekable file reading:");
console.log("  - ZIP files: Read central directory at end without loading entire archive");
console.log("  - ELF/PE executables: Jump to section tables scattered throughout file");
console.log("  - Media files: Read metadata from headers/footers");
console.log("  - Large data files: Access specific records by offset");
