// ABOUTME: Utility functions for working with schema types
// ABOUTME: Includes type checking, name sanitization, and field extraction

import { TypeDef, Field } from "../../schema/binary-schema.js";
import { TS_RESERVED_TYPES, JS_RESERVED_KEYWORDS, BACK_REFERENCE_TYPE_NAMES } from "./shared.js";

/**
 * Check if a type definition is a simple alias (not a composite type)
 */
export function isTypeAlias(typeDef: TypeDef): boolean {
  const typeDefAny = typeDef as any;

  // Types with sequence are composite types
  if ('sequence' in typeDef) {
    return false;
  }

  // Standalone array and string types need encoder/decoder functions
  if (typeDefAny.type === 'array' || typeDefAny.type === 'string') {
    return false;
  }

  // Everything else is a type alias
  return true;
}

/**
 * Get fields from a type definition
 */
export function getTypeFields(typeDef: TypeDef): Field[] {
  if ('sequence' in typeDef && (typeDef as any).sequence) {
    return (typeDef as any).sequence;
  }
  return [];
}

/**
 * Check if a type definition is a back reference
 */
export function isBackReferenceTypeDef(typeDef: any): boolean {
  return !!typeDef && typeof typeDef === "object" && BACK_REFERENCE_TYPE_NAMES.has(typeDef.type);
}

/**
 * Check if a type name is a back reference type
 */
export function isBackReferenceType(type: string | undefined): boolean {
  return !!type && BACK_REFERENCE_TYPE_NAMES.has(type);
}

/**
 * Sanitize a type name for TypeScript to avoid conflicts with built-in types
 * Appends "_" to conflicting names (e.g., "string" → "string_")
 */
export function sanitizeTypeName(typeName: string): string {
  // Don't sanitize generic template parameters (e.g., "Optional<T>")
  if (typeName.includes("<")) {
    return typeName;
  }

  if (TS_RESERVED_TYPES.has(typeName)) {
    return `${typeName}_`;
  }

  return typeName;
}

/**
 * Sanitize a variable/field name for TypeScript to avoid reserved keywords
 * Appends "_" to reserved keywords (e.g., "class" → "class_")
 */
export function sanitizeVarName(varName: string): string {
  if (JS_RESERVED_KEYWORDS.has(varName)) {
    return `${varName}_`;
  }
  return varName;
}

/**
 * Sanitize an enum member name to be a valid TypeScript identifier
 */
export function sanitizeEnumMemberName(name: string): string {
  let sanitized = name.replace(/[^a-zA-Z0-9_]/g, "_");
  if (/^[0-9]/.test(sanitized)) {
    sanitized = `_${sanitized}`;
  }
  if (JS_RESERVED_KEYWORDS.has(sanitized)) {
    return `${sanitized}_`;
  }
  return sanitized;
}
