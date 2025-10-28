#!/usr/bin/env bun
// Demonstration of seekable file reading with BinSchema

import { SeekableBitStreamDecoder } from "../src/runtime/seekable-bit-stream.js";
import { BufferReader, FileHandleReader } from "../src/runtime/binary-reader.js";

console.log("BinSchema Seekable File Reader Demo");
console.log("=====================================\n");

// Example 1: In-memory buffer (current behavior)
console.log("1. In-memory buffer (backward compatible):");
const buffer = new Uint8Array([0xDE, 0xAD, 0xBE, 0xEF, 0x12, 0x34]);
const decoder1 = new SeekableBitStreamDecoder(buffer);
console.log(`   Size: ${decoder1.size} bytes`);
console.log(`   Seekable: ${decoder1.seekable}`);
console.log(`   First 4 bytes: 0x${Array.from(decoder1.bytes.slice(0, 4))
  .map(b => b.toString(16).padStart(2, '0')).join('')}\n`);

// Example 2: Using BufferReader explicitly
console.log("2. BufferReader (explicit):");
const reader = new BufferReader([0xCA, 0xFE, 0xBA, 0xBE]);
const decoder2 = new SeekableBitStreamDecoder(reader);
console.log(`   Size: ${decoder2.size} bytes`);
console.log(`   Seekable: ${decoder2.seekable}`);
console.log(`   Data at position -2: 0x${reader.readByteAt(-2).toString(16)}`);
console.log(`   Data at position -1: 0x${reader.readByteAt(-1).toString(16)}\n`);

// Example 3: Demonstrate the API
console.log("3. BinaryReader interface demonstration:");
console.log("   - readAt(position, length): Read bytes at position");
console.log("   - readByteAt(position): Read single byte");
console.log("   - slice(start, end): Get slice of data");
console.log("   - Negative positions count from end");
console.log("   - Memory-efficient for large files (no full load)");

console.log("\n4. Input type auto-detection:");
console.log("   - Uint8Array → BufferReader");
console.log("   - File path → FileHandleReader (Node.js)");
console.log("   - File object → BrowserFileReader (browser)");
console.log("   - Stream → StreamReader (with buffering warning)");

console.log("\n✅ Seekable file reader infrastructure is ready!");
console.log("   - Backward compatible with existing code");
console.log("   - Memory efficient for large files");
console.log("   - Supports multiple input sources");
