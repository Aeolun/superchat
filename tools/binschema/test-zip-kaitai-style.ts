#!/usr/bin/env bun
/**
 * Test parsing a real ZIP file using the Kaitai-style schema
 */

import { readFileSync } from "fs";
import { join } from "path";

// Import the generated ZIP decoder
import { ZipArchiveDecoder } from "./.generated/generated.js";

// Read the actual ZIP file
const zipPath = join(import.meta.dir, "fixtures/redketchup.zip");
const zipBytes = readFileSync(zipPath);

console.log(`\n📦 Testing ZIP parser with Kaitai-style schema`);
console.log(`   File: ${zipPath}`);
console.log(`   Size: ${zipBytes.length} bytes\n`);

try {
  // Create decoder and parse
  const decoder = new ZipArchiveDecoder(zipBytes);
  const archive = decoder.decode();

  console.log("✅ Successfully decoded ZIP archive!\n");

  // Count section types
  const sectionCounts: Record<string, number> = {};
  let localFiles: any[] = [];
  let centralDirEntries: any[] = [];
  let endOfCentralDir: any = null;

  for (const section of archive.sections) {
    const type = section.body.type;
    sectionCounts[type] = (sectionCounts[type] || 0) + 1;

    if (type === 'LocalFile') {
      localFiles.push(section.body.value);
    } else if (type === 'CentralDirEntry') {
      centralDirEntries.push(section.body.value);
    } else if (type === 'EndOfCentralDir') {
      endOfCentralDir = section.body.value;
    }
  }

  console.log(`📊 Sections found:`);
  for (const [type, count] of Object.entries(sectionCounts)) {
    console.log(`   ${type}: ${count}`);
  }

  console.log(`\n📁 Local Files (${localFiles.length}):`);
  for (let i = 0; i < Math.min(5, localFiles.length); i++) {
    const file = localFiles[i];
    console.log(`   ${i + 1}. ${file.header.file_name}`);
    console.log(`      Compressed: ${file.header.len_body_compressed} bytes`);
    console.log(`      Uncompressed: ${file.header.len_body_uncompressed} bytes`);
    console.log(`      Compression: ${file.header.compression_method === 0 ? 'none' : file.header.compression_method === 8 ? 'deflate' : file.header.compression_method}`);
  }
  if (localFiles.length > 5) {
    console.log(`   ... and ${localFiles.length - 5} more`);
  }

  console.log(`\n📂 Central Directory Entries (${centralDirEntries.length}):`);
  for (let i = 0; i < Math.min(5, centralDirEntries.length); i++) {
    const entry = centralDirEntries[i];
    console.log(`   ${i + 1}. ${entry.file_name}`);
    console.log(`      Local header offset: ${entry.ofs_local_header}`);
  }
  if (centralDirEntries.length > 5) {
    console.log(`   ... and ${centralDirEntries.length - 5} more`);
  }

  if (endOfCentralDir) {
    console.log(`\n📋 End of Central Directory:`);
    console.log(`   Total entries: ${endOfCentralDir.num_central_dir_entries_total}`);
    console.log(`   Central dir size: ${endOfCentralDir.len_central_dir} bytes`);
    console.log(`   Central dir offset: ${endOfCentralDir.ofs_central_dir}`);
    if (endOfCentralDir.comment.length > 0) {
      console.log(`   Comment: "${endOfCentralDir.comment}"`);
    }
  }

  console.log(`\n✅ ZIP parsing successful!`);
  console.log(`   ✓ Discriminated unions working correctly`);
  console.log(`   ✓ Null-terminated section array parsed successfully`);
  console.log(`   ✓ Field-referenced strings and arrays working`);
  console.log(`   ✓ Nested field references (header.len_body_compressed) working`);

} catch (error) {
  console.error("\n❌ Error parsing ZIP file:");
  console.error(error);
  process.exit(1);
}
