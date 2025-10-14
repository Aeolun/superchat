// ABOUTME: Re-export metadata extraction from zod-metadata-extractor library
// ABOUTME: Provides binschema-specific type aliases and utilities

import type { z } from "zod";
import {
  extractMetadata as libExtractMetadata,
  walkUnion as libWalkUnion,
  type ExtractedMetadata as LibExtractedMetadata,
  type FieldInfo as LibFieldInfo,
} from "zod-metadata-extractor";

/**
 * BinSchema-specific metadata interface
 * Extends the library's ExtractedMetadata with custom fields
 */
export interface ExtractedMetadata extends LibExtractedMetadata {
  // BinSchema-specific fields
  use_for?: string;
  wire_format?: string;
  code_generation?: {
    typescript?: {
      type: string;
      notes?: string[];
    };
    go?: {
      type: string;
      notes?: string[];
    };
    rust?: {
      type: string;
      notes?: string[];
    };
  };
  examples_values?: {
    typescript?: string;
    go?: string;
    rust?: string;
  };
}

/**
 * Re-export extractMetadata from library
 */
export function extractMetadata(schema: z.ZodType): ExtractedMetadata | undefined {
  return libExtractMetadata(schema) as ExtractedMetadata | undefined;
}

/**
 * Walk a Zod union and extract metadata from each option
 * Wrapper around library's walkUnion with BinSchema types
 */
export function walkUnion(schema: z.ZodType): Map<string, ExtractedMetadata> {
  const result = libWalkUnion(schema, {
    mergeFields: true,
    extractUnions: true,
    extractFieldMeta: true,
  });

  return result.metadata as Map<string, ExtractedMetadata>;
}

/**
 * Test extraction with our BinarySchema types
 */
export async function testMetadataExtraction() {
  // Import the FieldSchema which is a union of all field types
  const binarySchema = await import("./binary-schema.js");
  const FieldSchema = binarySchema.FieldSchema;

  console.log("Testing metadata extraction from FieldSchema union...\n");

  // Walk the union and extract metadata from each field type
  const allMetadata = walkUnion(FieldSchema);

  console.log(`Found metadata for ${allMetadata.size} types:\n`);

  for (const [typeName, metadata] of allMetadata) {
    console.log(`=== ${typeName} ===`);
    console.log(JSON.stringify(metadata, null, 2));
    console.log();
  }
}
