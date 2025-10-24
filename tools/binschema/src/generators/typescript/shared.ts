// ABOUTME: Shared constants and types used across TypeScript generator modules
// ABOUTME: Contains reserved keywords, type names, and common interfaces

import { FieldSchema } from "../../schema/binary-schema.js";
import { walkUnion, type ExtractedMetadata } from "../../schema/extract-metadata.js";

/**
 * Generated TypeScript code with metadata
 */
export interface GeneratedCode {
  code: string;
  typeName: string;
}

/**
 * Documentation input - can be string, array of strings, or undefined
 */
export type DocInput = string | string[] | undefined;

/**
 * Structured documentation block
 */
export interface DocBlock {
  summary?: string[];
  remarks?: string[];
}

/**
 * TypeScript reserved types that conflict with schema type names
 */
export const TS_RESERVED_TYPES = new Set([
  "string", "number", "boolean", "object", "symbol", "bigint",
  "undefined", "null", "any", "void", "never", "unknown",
  "Array", "Promise", "Map", "Set", "Date", "RegExp", "Error",
]);

/**
 * JavaScript/TypeScript reserved keywords that cannot be used as variable names
 */
export const JS_RESERVED_KEYWORDS = new Set([
  "break", "case", "catch", "class", "const", "continue", "debugger", "default",
  "delete", "do", "else", "enum", "export", "extends", "false", "finally",
  "for", "function", "if", "import", "in", "instanceof", "new", "null",
  "return", "super", "switch", "this", "throw", "true", "try", "typeof",
  "var", "void", "while", "with", "yield", "let", "static", "implements",
  "interface", "package", "private", "protected", "public", "await", "async"
]);

/**
 * Back reference type names in schema
 */
export const BACK_REFERENCE_TYPE_NAMES = new Set(["back_reference"]);

/**
 * Field type metadata extracted from FieldSchema
 */
export const FIELD_TYPE_METADATA: Map<string, ExtractedMetadata> = (() => {
  try {
    return walkUnion(FieldSchema);
  } catch {
    return new Map<string, ExtractedMetadata>();
  }
})();
