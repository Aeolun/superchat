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
 * Built-in types that don't need to be defined in schema.types
 */
const BUILT_IN_TYPES = [
  "bit", "int", "uint8", "uint16", "uint32", "uint64",
  "int8", "int16", "int32", "int64", "float32", "float64",
  "string", "array", "optional", "bitfield", "discriminated_union", "back_reference"
];

/**
 * Check if a type is a composite (has sequence/fields) or a type alias
 */
function isTypeAlias(typeDef: TypeDef): boolean {
  return !('sequence' in typeDef);
}

/** Get fields from a type definition */
function getTypeFields(typeDef: TypeDef): Field[] {
  if ('sequence' in typeDef && (typeDef as any).sequence) {
    return (typeDef as any).sequence;
  }
  return [];
}

/**
 * Get available fields for field references in a type
 *
 * For protocol schemas: If the type is a message payload type, includes header fields
 * For binary schemas: Only includes parent fields
 *
 * @param typeName - Name of the type being validated
 * @param parentFields - Fields from the current type
 * @param schema - The schema being validated
 * @returns Array of fields that can be referenced by field_referenced arrays and discriminated unions
 */
function getAvailableFieldsForReference(
  typeName: string,
  parentFields: Field[],
  schema: BinarySchema
): Field[] {
  // If no protocol, return only parent fields
  if (!schema.protocol) {
    return parentFields;
  }

  // Check if this type is used as a message payload type
  const isPayloadType = schema.protocol.messages.some(msg => msg.payload_type === typeName);
  if (!isPayloadType) {
    return parentFields;
  }

  // Get header fields
  const headerType = schema.types[schema.protocol.header];
  if (!headerType) {
    return parentFields; // Header type not found (will be caught by other validation)
  }

  const headerFields = getTypeFields(headerType);

  // Return header fields + parent fields (header fields come first, so they're "earlier")
  return [...headerFields, ...parentFields];
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
  // Check if this is a discriminated union or pointer type alias
  if (isTypeAlias(typeDef)) {
    const typeDefAny = typeDef as any;

    // Validate discriminated union type aliases
    if (typeDefAny.type === "discriminated_union") {
      validateDiscriminatedUnion(typeDefAny, `types.${typeName}`, schema, errors);
      return;
    }

    // Validate back_reference type aliases
    if (typeDefAny.type === "back_reference") {
      validateBackReference(typeDefAny, `types.${typeName}`, schema, errors);
      return;
    }

    // Other type aliases (primitives, arrays) don't need validation
    return;
  }

  const fields = getTypeFields(typeDef);
  const fieldsKey = 'sequence';

  // Check for duplicate field names
  const fieldNames = new Set<string>();
  for (let i = 0; i < fields.length; i++) {
    const field = fields[i];
    if ('name' in field && field.name) {
      if (fieldNames.has(field.name)) {
        errors.push({
          path: `types.${typeName}.${fieldsKey}[${i}]`,
          message: `Duplicate field name '${field.name}' in type '${typeName}' (field names must be unique within a struct)`
        });
      }
      fieldNames.add(field.name);
    }
  }

  // Validate each field
  for (let i = 0; i < fields.length; i++) {
    const field = fields[i];
    validateField(field, `types.${typeName}.${fieldsKey}[${i}]`, schema, errors, typeName, fields);
  }
}

/**
 * Validate a discriminated union
 */
function validateDiscriminatedUnion(
  field: any,
  path: string,
  schema: BinarySchema,
  errors: ValidationError[],
  parentFields?: Field[]
): void {
  if (!field.discriminator) {
    errors.push({ path: `${path} (${field.name})`, message: "Discriminated union missing 'discriminator' property" });
    return;
  }

  const disc = field.discriminator;
  const hasPeek = disc.peek !== undefined;
  const hasField = disc.field !== undefined;

  // Must have exactly one of peek or field
  if (!hasPeek && !hasField) {
    errors.push({
      path: `${path} (${field.name})`,
      message: "Discriminator must have either 'peek' or 'field' property (both are required, one must be specified)"
    });
  }

  if (hasPeek && hasField) {
    errors.push({
      path: `${path} (${field.name})`,
      message: "Discriminator cannot have both 'peek' and 'field' properties (they are mutually exclusive)"
    });
  }

  // Validate peek-based discriminator
  if (hasPeek) {
    const validPeekTypes = ["uint8", "uint16", "uint32"];
    if (!validPeekTypes.includes(disc.peek)) {
      errors.push({
        path: `${path} (${field.name})`,
        message: `Invalid peek type '${disc.peek}' (must be uint8, uint16, or uint32, not uint64)`
      });
    }

    // Check endianness requirements
    if (disc.peek === "uint8" && disc.endianness) {
      errors.push({
        path: `${path} (${field.name})`,
        message: "Endianness is meaningless for uint8 peek (single byte has no endianness)"
      });
    }

    if ((disc.peek === "uint16" || disc.peek === "uint32") && !disc.endianness) {
      errors.push({
        path: `${path} (${field.name})`,
        message: `Endianness is required for ${disc.peek} peek`
      });
    }

    if (disc.endianness && disc.endianness !== "big_endian" && disc.endianness !== "little_endian") {
      errors.push({
        path: `${path} (${field.name})`,
        message: `Invalid endianness '${disc.endianness}' (must be 'big_endian' or 'little_endian')`
      });
    }
  }

  // Validate field-based discriminator
  if (hasField && parentFields) {
    const fieldIndex = parentFields.findIndex((f: any) => f.name === field.name);

    // Check if this is a bitfield sub-field reference (e.g., "flags.opcode")
    const dotIndex = disc.field.indexOf('.');
    if (dotIndex > 0) {
      const fieldName = disc.field.substring(0, dotIndex);
      const subFieldName = disc.field.substring(dotIndex + 1);

      const referencedFieldIndex = parentFields.findIndex((f: any) => f.name === fieldName);

      if (referencedFieldIndex === -1) {
        errors.push({
          path: `${path} (${field.name})`,
          message: `Discriminator field '${fieldName}' not found in parent struct`
        });
      } else if (referencedFieldIndex >= fieldIndex) {
        errors.push({
          path: `${path} (${field.name})`,
          message: `Discriminator field '${fieldName}' comes after this union (forward reference not allowed)`
        });
      } else {
        // Verify the field is a bitfield and the sub-field exists
        const referencedField = parentFields[referencedFieldIndex] as any;
        if (referencedField.type !== 'bitfield') {
          errors.push({
            path: `${path} (${field.name})`,
            message: `Discriminator field '${fieldName}' is not a bitfield (cannot reference sub-field '${subFieldName}')`
          });
        } else if (!referencedField.fields || !Array.isArray(referencedField.fields)) {
          errors.push({
            path: `${path} (${field.name})`,
            message: `Bitfield '${fieldName}' has no fields array`
          });
        } else {
          const bitfieldSubField = referencedField.fields.find((bf: any) => bf.name === subFieldName);
          if (!bitfieldSubField) {
            const availableFields = referencedField.fields.map((bf: any) => bf.name).join(', ');
            errors.push({
              path: `${path} (${field.name})`,
              message: `Bitfield sub-field '${subFieldName}' not found in '${fieldName}' (available: ${availableFields})`
            });
          }
        }
      }
    } else {
      // Regular field reference (no dot notation)
      const referencedFieldIndex = parentFields.findIndex((f: any) => f.name === disc.field);

      if (referencedFieldIndex === -1) {
        errors.push({
          path: `${path} (${field.name})`,
          message: `Discriminator field '${disc.field}' not found in parent struct`
        });
      } else if (referencedFieldIndex >= fieldIndex) {
        errors.push({
          path: `${path} (${field.name})`,
          message: `Discriminator field '${disc.field}' comes after this union (forward reference not allowed)`
        });
      }
    }
  }

  // Validate variants
  if (!field.variants || !Array.isArray(field.variants) || field.variants.length === 0) {
    errors.push({
      path: `${path} (${field.name})`,
      message: field.variants?.length === 0 ? "Variants array cannot be empty" : "Discriminated union missing 'variants' property"
    });
    return;
  }

  // Check that at least one variant has a 'when' condition (can't have only fallback)
  const hasNonFallback = field.variants.some((v: any) => v.when);
  if (!hasNonFallback) {
    errors.push({
      path: `${path}.variants`,
      message: "Discriminated union must have at least one variant with a 'when' condition (cannot have only fallback variants)"
    });
  }

  // Check fallback variant (no 'when') can only be last
  for (let i = 0; i < field.variants.length; i++) {
    const variant = field.variants[i];

    if (!variant.type) {
      errors.push({
        path: `${path}.variants[${i}]`,
        message: "Variant missing 'type' property"
      });
      continue;
    }

    if (!variant.when) {
      // Fallback variant
      if (i !== field.variants.length - 1) {
        errors.push({
          path: `${path}.variants[${i}]`,
          message: "Fallback variant (no 'when' condition) can only be in the last position"
        });
      }
    } else {
      // Validate 'when' expression syntax (basic check)
      if (typeof variant.when !== 'string' || variant.when.trim() === '') {
        errors.push({
          path: `${path}.variants[${i}]`,
          message: "Variant 'when' condition must be a non-empty string"
        });
      } else {
        // Basic syntax validation - check for incomplete expressions
        const trimmed = variant.when.trim();
        if (trimmed.endsWith('&&') || trimmed.endsWith('||') || trimmed.endsWith('&') || trimmed.endsWith('|')) {
          errors.push({
            path: `${path}.variants[${i}]`,
            message: `Invalid when condition syntax: '${variant.when}' (incomplete expression)`
          });
        }
      }
    }

    // Check variant type exists
    if (variant.type && !schema.types[variant.type]) {
      errors.push({
        path: `${path}.variants[${i}]`,
        message: `Variant type '${variant.type}' not found in schema.types`
      });
    }
  }
}

/**
 * Validate a back_reference
 */
function validateBackReference(
  field: any,
  path: string,
  schema: BinarySchema,
  errors: ValidationError[]
): void {
  if (!field.storage) {
    errors.push({ path: `${path} (${field.name})`, message: "Back reference missing 'storage' property" });
    return;
  }

  const validStorageTypes = ["uint8", "uint16", "uint32"];
  if (!validStorageTypes.includes(field.storage)) {
    errors.push({
      path: `${path} (${field.name})`,
      message: `Invalid back reference storage type '${field.storage}' (must be uint8, uint16, or uint32, not uint64)`
    });
  }

  if (!field.offset_mask) {
    errors.push({ path: `${path} (${field.name})`, message: "Back reference missing 'offset_mask' property" });
  } else {
    // Validate offset_mask format
    if (!/^0x[0-9A-Fa-f]+$/.test(field.offset_mask)) {
      errors.push({
        path: `${path} (${field.name})`,
        message: `Invalid offset_mask format '${field.offset_mask}' (must be hex starting with 0x, e.g., '0x3FFF')`
      });
    } else {
      const maskValue = parseInt(field.offset_mask, 16);

      // Check if mask is zero
      if (maskValue === 0) {
        errors.push({
          path: `${path} (${field.name})`,
          message: "offset_mask cannot be zero (no bits available for offset)"
        });
      }

      // Check if mask exceeds storage capacity
      const maxValues: Record<string, number> = {
        "uint8": 0xFF,
        "uint16": 0xFFFF,
        "uint32": 0xFFFFFFFF
      };

      if (field.storage in maxValues && maskValue > maxValues[field.storage]) {
        errors.push({
          path: `${path} (${field.name})`,
          message: `offset_mask ${field.offset_mask} exceeds maximum for ${field.storage} storage (max: 0x${maxValues[field.storage].toString(16).toUpperCase()})`
        });
      }
    }
  }

  if (!field.target_type) {
    errors.push({ path: `${path} (${field.name})`, message: "Back reference missing 'target_type' property" });
  } else if (!schema.types[field.target_type]) {
    errors.push({
      path: `${path} (${field.name})`,
      message: `Back reference target_type '${field.target_type}' not found in schema.types`
    });
  }

  // Check endianness requirements
  if (field.storage === "uint8" && field.endianness) {
    errors.push({
      path: `${path} (${field.name})`,
      message: "Endianness is meaningless for uint8 storage (single byte has no endianness)"
    });
  }

  if ((field.storage === "uint16" || field.storage === "uint32") && !field.endianness) {
    errors.push({
      path: `${path} (${field.name})`,
      message: `Endianness is required for ${field.storage} back reference storage`
    });
  }

  if (field.endianness && field.endianness !== "big_endian" && field.endianness !== "little_endian") {
    errors.push({
      path: `${path} (${field.name})`,
      message: `Invalid endianness '${field.endianness}' (must be 'big_endian' or 'little_endian')`
    });
  }
}

/**
 * Validate an optional field
 */
function validateOptional(
  field: any,
  path: string,
  schema: BinarySchema,
  errors: ValidationError[]
): void {
  if (!field.value_type) {
    errors.push({ path: `${path} (${field.name || "optional"})`, message: "Optional field missing 'value_type' property" });
    return;
  }

  const valueType = field.value_type;

  // Prohibit nested optionals (optional<optional<T>>)
  if (valueType === "optional") {
    errors.push({
      path: `${path} (${field.name || "optional"})`,
      message: "Nested optionals are not allowed (optional<optional<T>> is redundant)"
    });
    return;
  }

  // Prohibit optional bit (pointless - 1 bit presence + 1 bit value = 2 bits)
  if (valueType === "bit") {
    errors.push({
      path: `${path} (${field.name || "optional"})`,
      message: "Optional bit is not allowed (use a 2-bit field instead - presence flag + value bit = 2 bits total)"
    });
    return;
  }

  // Validate that value_type exists (if not a built-in type)
  if (!BUILT_IN_TYPES.includes(valueType) && !schema.types[valueType]) {
    errors.push({
      path: `${path} (${field.name || "optional"})`,
      message: `Optional value_type '${valueType}' not found in schema.types`
    });
  }

  // Validate presence_type if specified
  if (field.presence_type) {
    const validPresenceTypes = ["uint8", "bit"];
    if (!validPresenceTypes.includes(field.presence_type)) {
      errors.push({
        path: `${path} (${field.name || "optional"})`,
        message: `Invalid presence_type '${field.presence_type}' (must be 'uint8' or 'bit')`
      });
    }
  }
}

/**
 * Validate a single field
 */
function validateField(
  field: Field,
  path: string,
  schema: BinarySchema,
  errors: ValidationError[],
  typeName?: string, // Type name being validated (for protocol context)
  parentFields?: Field[] // For field-based discriminator validation
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
        message: "Array field missing 'kind' property (fixed|length_prefixed|null_terminated|field_referenced)",
      });
    } else {
      // Validate field_referenced arrays
      if ((field as any).kind === "field_referenced") {
        if (!("length_field" in field) || !(field as any).length_field) {
          errors.push({
            path: `${path} (${field.name || "array"})`,
            message: "field_referenced array missing 'length_field' property",
          });
        } else if (parentFields && typeName) {
          // Get available fields for reference (includes header fields if protocol payload type)
          const availableFields = getAvailableFieldsForReference(typeName, parentFields, schema);
          const lengthFieldRef = (field as any).length_field;
          const fieldIndex = availableFields.findIndex((f: any) => f.name === field.name);

          // Check for bitfield sub-field reference (e.g., "flags.opcode")
          const dotIndex = lengthFieldRef.indexOf('.');
          if (dotIndex > 0) {
            const fieldName = lengthFieldRef.substring(0, dotIndex);
            const subFieldName = lengthFieldRef.substring(dotIndex + 1);

            const referencedFieldIndex = availableFields.findIndex((f: any) => f.name === fieldName);

            if (referencedFieldIndex === -1) {
              const fieldNames = availableFields.map((f: any) => f.name).join(', ');
              errors.push({
                path: `${path} (${field.name})`,
                message: `length_field '${fieldName}' not found in type '${typeName}'${schema.protocol ? ` or protocol header '${schema.protocol.header}'` : ''} (available fields: ${fieldNames})`,
              });
            } else if (referencedFieldIndex >= fieldIndex) {
              errors.push({
                path: `${path} (${field.name})`,
                message: `length_field '${fieldName}' comes after this array (forward reference not allowed)`,
              });
            } else {
              // Verify the field is a bitfield and the sub-field exists
              const referencedField = availableFields[referencedFieldIndex] as any;
              if (referencedField.type !== 'bitfield') {
                errors.push({
                  path: `${path} (${field.name})`,
                  message: `length_field '${fieldName}' is not a bitfield (cannot reference sub-field '${subFieldName}')`,
                });
              } else if (!referencedField.fields || !Array.isArray(referencedField.fields)) {
                errors.push({
                  path: `${path} (${field.name})`,
                  message: `Bitfield '${fieldName}' has no fields array`,
                });
              } else {
                const bitfieldSubField = referencedField.fields.find((bf: any) => bf.name === subFieldName);
                if (!bitfieldSubField) {
                  const availableBitfields = referencedField.fields.map((bf: any) => bf.name).join(', ');
                  errors.push({
                    path: `${path} (${field.name})`,
                    message: `Bitfield sub-field '${subFieldName}' not found in '${fieldName}' (available: ${availableBitfields})`,
                  });
                }
              }
            }
          } else {
            // Regular field reference (no dot notation)
            const referencedFieldIndex = availableFields.findIndex((f: any) => f.name === lengthFieldRef);

            if (referencedFieldIndex === -1) {
              const fieldNames = availableFields.map((f: any) => f.name).join(', ');
              errors.push({
                path: `${path} (${field.name})`,
                message: `length_field '${lengthFieldRef}' not found in type '${typeName}'${schema.protocol ? ` or protocol header '${schema.protocol.header}'` : ''} (available fields: ${fieldNames})`,
              });
            } else if (referencedFieldIndex >= fieldIndex) {
              errors.push({
                path: `${path} (${field.name})`,
                message: `length_field '${lengthFieldRef}' comes after this array (forward reference not allowed)`,
              });
            }
          }
        }
      }

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

  // Check discriminated union fields
  if (fieldType === "discriminated_union") {
    validateDiscriminatedUnion(field as any, path, schema, errors, parentFields);
  }

  // Check back_reference fields
  if (fieldType === "back_reference") {
    validateBackReference(field as any, path, schema, errors);
  }

  // Check optional fields
  if (fieldType === "optional") {
    validateOptional(field as any, path, schema, errors);
  }

  // Check type references exist
  // Allow 'T' as a type parameter in generic templates (don't validate it as a type reference)
  if (fieldType === 'T') {
    return;
  }

  if (!BUILT_IN_TYPES.includes(fieldType)) {
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
        if (argType !== 'T' && !BUILT_IN_TYPES.includes(argType) && !schema.types[argType]) {
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

  // Check discriminated union elements
  if (elementType === "discriminated_union") {
    validateDiscriminatedUnion(element, path, schema, errors);
    return;
  }

  // Check back_reference elements
  if (elementType === "back_reference") {
    validateBackReference(element, path, schema, errors);
    return;
  }

  // Check optional elements
  if (elementType === "optional") {
    validateOptional(element, path, schema, errors);
    return;
  }

  // Check type references exist
  // Allow 'T' as a type parameter in generic templates
  if (elementType === 'T') {
    return;
  }

  if (!BUILT_IN_TYPES.includes(elementType)) {
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
        if (argType !== 'T' && !BUILT_IN_TYPES.includes(argType) && !schema.types[argType]) {
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

  // Handle type aliases that can have dependencies (discriminated unions and pointers)
  if (isTypeAlias(typeDef)) {
    const typeDefAny = typeDef as any;

    // Check discriminated union variants for circular dependencies
    if (typeDefAny.type === "discriminated_union" && typeDefAny.variants) {
      for (const variant of typeDefAny.variants) {
        if (variant.type && schema.types[variant.type]) {
          const cycle = findCircularDependency(variant.type, schema, new Set(visited), [...path]);
          if (cycle) return cycle;
        }
      }
    }

    // Check back_reference target_type for circular dependencies
    if (typeDefAny.type === "back_reference" && typeDefAny.target_type) {
      if (schema.types[typeDefAny.target_type]) {
        const cycle = findCircularDependency(typeDefAny.target_type, schema, new Set(visited), [...path]);
        if (cycle) return cycle;
      }
    }

    // Other type aliases (primitives, arrays) don't have dependencies
    return null;
  }

  // Check all fields for type references
  const fields = getTypeFields(typeDef);
  for (const field of fields) {
    if (!("type" in field)) continue;

    const fieldType = field.type;

    // Skip built-in types
    if (BUILT_IN_TYPES.includes(fieldType)) {
      // Check array items recursively
      if (fieldType === "array" && "items" in field && field.items) {
        const itemType = (field.items as any).type;
        if (itemType && !BUILT_IN_TYPES.includes(itemType)) {
          const cycle = findCircularDependency(itemType, schema, new Set(visited), [...path]);
          if (cycle) return cycle;
        }
      }

      // Check discriminated union variants recursively
      if (fieldType === "discriminated_union" && "variants" in field && Array.isArray(field.variants)) {
        for (const variant of field.variants) {
          if (variant.type && !BUILT_IN_TYPES.includes(variant.type)) {
            const cycle = findCircularDependency(variant.type, schema, new Set(visited), [...path]);
            if (cycle) return cycle;
          }
        }
      }

      // Check back_reference target type recursively
      if (fieldType === "back_reference" && "target_type" in field) {
        const targetType = (field as any).target_type;
        if (targetType && !BUILT_IN_TYPES.includes(targetType)) {
          const cycle = findCircularDependency(targetType, schema, new Set(visited), [...path]);
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
