/**
 * Schema Validator
 *
 * Validates that a BinarySchema is internally consistent before code generation.
 * Catches errors like:
 * - Type references to non-existent types
 * - Missing array items
 * - Invalid generic instantiations
 * - Circular type dependencies
 */

import { BinarySchema, Field, TypeDef } from "./binary-schema.js";

export interface ValidationError {
  path: string;
  message: string;
}

export interface ValidationResult {
  valid: boolean;
  errors: ValidationError[];
}

/**
 * Validate a binary schema for consistency
 */
export function validateSchema(schema: BinarySchema): ValidationResult {
  const errors: ValidationError[] = [];

  // Validate each type definition
  for (const [typeName, typeDef] of Object.entries(schema.types)) {
    validateTypeDef(typeName, typeDef, schema, errors);
  }

  // Check for circular dependencies
  for (const typeName of Object.keys(schema.types)) {
    const cycle = findCircularDependency(typeName, schema, new Set());
    if (cycle) {
      errors.push({
        path: `types.${typeName}`,
        message: `Circular dependency detected: ${cycle.join(" → ")}`,
      });
    }
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

/**
 * Validate a single type definition
 */
function validateTypeDef(
  typeName: string,
  typeDef: TypeDef,
  schema: BinarySchema,
  errors: ValidationError[]
): void {
  for (let i = 0; i < typeDef.fields.length; i++) {
    const field = typeDef.fields[i];
    validateField(field, `types.${typeName}.fields[${i}]`, schema, errors);
  }
}

/**
 * Validate a single field
 */
function validateField(
  field: Field,
  path: string,
  schema: BinarySchema,
  errors: ValidationError[]
): void {
  if (!("type" in field)) {
    errors.push({ path, message: "Field missing 'type' property" });
    return;
  }

  const fieldType = field.type;

  // Check array fields have items defined
  if (fieldType === "array") {
    if (!("items" in field) || !field.items) {
      errors.push({
        path: `${path} (${field.name || "array"})`,
        message: "Array field missing 'items' property",
      });
    } else if (!("kind" in field)) {
      errors.push({
        path: `${path} (${field.name || "array"})`,
        message: "Array field missing 'kind' property (fixed|length_prefixed|null_terminated)",
      });
    } else {
      // Recursively validate items (as element type, which doesn't require 'name')
      validateElementType(field.items as any, `${path}.items`, schema, errors);
    }
  }

  // Check bitfield fields have fields array
  if (fieldType === "bitfield") {
    if (!("fields" in field) || !Array.isArray(field.fields)) {
      errors.push({
        path: `${path} (${field.name})`,
        message: "Bitfield missing 'fields' array",
      });
    }
  }

  // Check type references exist
  const builtInTypes = [
    "bit", "int", "uint8", "uint16", "uint32", "uint64",
    "int8", "int16", "int32", "int64", "float32", "float64",
    "array", "bitfield"
  ];

  // Allow 'T' as a type parameter in generic templates (don't validate it as a type reference)
  if (fieldType === 'T') {
    return;
  }

  if (!builtInTypes.includes(fieldType)) {
    // This is a type reference - check if it exists
    const referencedType = extractTypeReference(fieldType);

    if (!schema.types[referencedType]) {
      // Check if it's a generic instantiation
      const genericMatch = fieldType.match(/^(\w+)<(.+)>$/);
      if (genericMatch) {
        const [, genericType, typeArg] = genericMatch;
        const templateKey = `${genericType}<T>`;

        if (!schema.types[templateKey]) {
          errors.push({
            path: `${path} (${field.name})`,
            message: `Generic template '${templateKey}' not found in schema.types`,
          });
        }

        // Validate the type argument (allow 'T' here too)
        const argType = extractTypeReference(typeArg);
        if (argType !== 'T' && !builtInTypes.includes(argType) && !schema.types[argType]) {
          errors.push({
            path: `${path} (${field.name})`,
            message: `Type argument '${typeArg}' in '${fieldType}' not found in schema.types`,
          });
        }
      } else {
        errors.push({
          path: `${path} (${field.name})`,
          message: `Type '${fieldType}' not found in schema.types`,
        });
      }
    }
  }
}

/**
 * Validate an element type (array item - no 'name' required)
 */
function validateElementType(
  element: any,
  path: string,
  schema: BinarySchema,
  errors: ValidationError[]
): void {
  if (!("type" in element)) {
    errors.push({ path, message: "Element missing 'type' property" });
    return;
  }

  const elementType = element.type;

  // Check nested arrays
  if (elementType === "array") {
    if (!("items" in element) || !element.items) {
      errors.push({
        path,
        message: "Array element missing 'items' property",
      });
    } else if (!("kind" in element)) {
      errors.push({
        path,
        message: "Array element missing 'kind' property (fixed|length_prefixed|null_terminated)",
      });
    } else {
      // Recursively validate nested array items
      validateElementType(element.items as any, `${path}.items`, schema, errors);
    }
    return;
  }

  // Check type references exist
  const builtInTypes = [
    "bit", "int", "uint8", "uint16", "uint32", "uint64",
    "int8", "int16", "int32", "int64", "float32", "float64",
    "array", "bitfield"
  ];

  // Allow 'T' as a type parameter in generic templates
  if (elementType === 'T') {
    return;
  }

  if (!builtInTypes.includes(elementType)) {
    // This is a type reference - check if it exists
    const referencedType = extractTypeReference(elementType);

    if (!schema.types[referencedType]) {
      // Check if it's a generic instantiation
      const genericMatch = elementType.match(/^(\w+)<(.+)>$/);
      if (genericMatch) {
        const [, genericType, typeArg] = genericMatch;
        const templateKey = `${genericType}<T>`;

        if (!schema.types[templateKey]) {
          errors.push({
            path,
            message: `Generic template '${templateKey}' not found in schema.types`,
          });
        }

        // Validate the type argument (allow 'T' here too)
        const argType = extractTypeReference(typeArg);
        if (argType !== 'T' && !builtInTypes.includes(argType) && !schema.types[argType]) {
          errors.push({
            path,
            message: `Type argument '${typeArg}' in '${elementType}' not found in schema.types`,
          });
        }
      } else {
        errors.push({
          path,
          message: `Type '${elementType}' not found in schema.types`,
        });
      }
    }
  }
}

/**
 * Extract the base type from a type reference (e.g., "Point" from "Optional<Point>")
 */
function extractTypeReference(typeRef: string): string {
  const genericMatch = typeRef.match(/^(\w+)<(.+)>$/);
  if (genericMatch) {
    return `${genericMatch[1]}<T>`;
  }
  return typeRef;
}

/**
 * Find circular dependencies in type definitions
 */
function findCircularDependency(
  typeName: string,
  schema: BinarySchema,
  visited: Set<string>,
  path: string[] = []
): string[] | null {
  // If we've seen this type before in this path, we have a cycle
  if (visited.has(typeName)) {
    return [...path, typeName];
  }

  // Skip generic templates
  if (typeName.includes("<T>")) {
    return null;
  }

  const typeDef = schema.types[typeName];
  if (!typeDef) {
    return null;
  }

  visited.add(typeName);
  path.push(typeName);

  // Check all fields for type references
  for (const field of typeDef.fields) {
    if (!("type" in field)) continue;

    const fieldType = field.type;

    // Skip built-in types
    const builtInTypes = [
      "bit", "int", "uint8", "uint16", "uint32", "uint64",
      "int8", "int16", "int32", "int64", "float32", "float64",
      "array", "bitfield"
    ];

    if (builtInTypes.includes(fieldType)) {
      // Check array items recursively
      if (fieldType === "array" && "items" in field && field.items) {
        const itemType = (field.items as any).type;
        if (itemType && !builtInTypes.includes(itemType)) {
          const cycle = findCircularDependency(itemType, schema, new Set(visited), [...path]);
          if (cycle) return cycle;
        }
      }
      continue;
    }

    // Extract base type (handle generics)
    const referencedType = extractTypeReference(fieldType);

    if (referencedType !== typeName && schema.types[referencedType]) {
      const cycle = findCircularDependency(referencedType, schema, new Set(visited), [...path]);
      if (cycle) return cycle;
    }
  }

  return null;
}

/**
 * Format validation errors for display
 */
export function formatValidationErrors(result: ValidationResult): string {
  if (result.valid) {
    return "✓ Schema validation passed";
  }

  let output = `✗ Schema validation failed with ${result.errors.length} error(s):\n\n`;

  for (const error of result.errors) {
    output += `  • ${error.path}\n`;
    output += `    ${error.message}\n\n`;
  }

  return output;
}
