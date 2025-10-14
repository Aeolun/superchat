// ABOUTME: Main entry point for zod-metadata-extractor library
// ABOUTME: Re-exports all public APIs and types

export {
  extractMetadata,
  extractFields,
  extractUnionOptions,
  walkUnion,
} from "./extract.js";

export type {
  SchemaMetadata,
  ExtractedMetadata,
  FieldInfo,
  UnionOption,
  ExtractionOptions,
  UnionWalkResult,
} from "./types.js";
