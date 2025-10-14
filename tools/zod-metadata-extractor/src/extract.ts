// ABOUTME: Core metadata extraction functions for Zod v4 schemas
// ABOUTME: Handles simple schemas, unions, and discriminated unions

import type { z } from "zod";
import type {
  SchemaMetadata,
  ExtractedMetadata,
  FieldInfo,
  UnionOption,
  ExtractionOptions,
  UnionWalkResult,
  Constraint,
} from "./types.js";

/**
 * Extract metadata from a Zod schema using .meta()
 *
 * @param schema - Any Zod schema
 * @returns Metadata object or undefined if no metadata exists
 */
export function extractMetadata(schema: z.ZodType): SchemaMetadata | undefined {
  try {
    // In Zod v4, calling .meta() without arguments retrieves metadata
    const metadata = (schema as any).meta();
    return metadata || undefined;
  } catch (error) {
    // Schema has no metadata
    return undefined;
  }
}

/**
 * Extract field information from a Zod object schema
 *
 * @param schema - Zod object schema
 * @param options - Extraction options
 * @returns Array of field info or undefined
 */
export function extractFields(
  schema: z.ZodType,
  options: ExtractionOptions = {}
): FieldInfo[] | undefined {
  const {
    extractUnions = true,
    extractFieldMeta = true,
  } = options;

  const def = (schema as any).def || (schema as any)._def;

  // Only works for object types
  if (def?.type !== "object" || !def?.shape) {
    return undefined;
  }

  const fields: FieldInfo[] = [];

  for (const [fieldName, fieldSchema] of Object.entries(def.shape)) {
    const field = extractFieldInfo(
      fieldName,
      fieldSchema as z.ZodType,
      { extractUnions, extractFieldMeta }
    );
    fields.push(field);
  }

  return fields.length > 0 ? fields : undefined;
}

/**
 * Extract information about a single field
 */
function extractFieldInfo(
  name: string,
  schema: z.ZodType,
  options: ExtractionOptions
): FieldInfo {
  const { extractUnions, extractFieldMeta } = options;

  let unwrappedSchema = schema;
  let fieldDef = (schema as any).def || (schema as any)._def;

  // Determine if field is required
  const required = !(schema as any).isOptional?.();

  // Unwrap optional types to get the actual underlying type (handle nested optionals)
  while (fieldDef?.type === "optional" && fieldDef?.innerType) {
    unwrappedSchema = fieldDef.innerType;
    fieldDef = (unwrappedSchema as any).def || (unwrappedSchema as any)._def;
  }

  // Get the type name
  let typeName = getTypeName(fieldDef);

  // Extract description from field's .meta() if requested
  let description: string | undefined;
  if (extractFieldMeta) {
    try {
      const fieldMeta = (schema as any).meta?.();
      if (fieldMeta?.description) {
        description = fieldMeta.description;
      }
    } catch (e) {
      // No meta on this field
    }
  }

  // Extract union options if this is a union field
  let unionOptions: UnionOption[] | undefined;
  if (extractUnions && fieldDef?.type === "union") {
    unionOptions = extractUnionOptions(unwrappedSchema);
  }

  // Extract validation constraints
  const constraints = extractConstraints(fieldDef);

  return {
    name,
    type: typeName,
    required,
    description,
    constraints,
    unionOptions,
  };
}

/**
 * Get human-readable type name from Zod def
 */
function getTypeName(fieldDef: any): string {
  const type = fieldDef?.type;

  if (!type) {
    return "unknown";
  }

  // Handle literal types (Zod 4 uses 'values' array)
  if (type === "literal") {
    if (fieldDef?.values && Array.isArray(fieldDef.values) && fieldDef.values.length > 0) {
      return `literal "${fieldDef.values[0]}"`;
    } else if (fieldDef?.value !== undefined) {
      // Fallback for older Zod versions
      return `literal "${fieldDef.value}"`;
    }
  }

  // Handle enum types
  if (type === "enum") {
    // Zod 4 uses 'entries' object instead of 'values' Set
    if (fieldDef?.entries) {
      const enumValues = Object.keys(fieldDef.entries);
      return `enum (${enumValues.map((v: any) => `"${v}"`).join(" | ")})`;
    } else if (fieldDef?.values) {
      // Fallback for older Zod versions
      return `enum (${Array.from(fieldDef.values).map((v: any) => `"${v}"`).join(" | ")})`;
    }
  }

  return type;
}

/**
 * Extract validation constraints from Zod checks array
 *
 * @param fieldDef - Zod field definition
 * @returns Array of constraints or undefined if none exist
 */
function extractConstraints(fieldDef: any): Constraint[] | undefined {
  const checks = fieldDef?.checks;
  if (!checks || !Array.isArray(checks) || checks.length === 0) {
    return undefined;
  }

  const constraints: Constraint[] = [];

  for (const check of checks) {
    const checkDef = check._zod?.def;
    if (!checkDef) continue;

    switch (checkDef.check) {
      case "min_length":
        constraints.push({ type: "min_length", value: checkDef.minimum });
        break;

      case "max_length":
        constraints.push({ type: "max_length", value: checkDef.maximum });
        break;

      case "length_equals":
        constraints.push({ type: "exact_length", value: checkDef.length });
        break;

      case "greater_than":
        constraints.push({
          type: checkDef.inclusive ? "min" : "greater_than",
          value: checkDef.value,
          inclusive: checkDef.inclusive,
        });
        break;

      case "less_than":
        constraints.push({
          type: checkDef.inclusive ? "max" : "less_than",
          value: checkDef.value,
          inclusive: checkDef.inclusive,
        });
        break;

      case "string_format":
        // Distinguish between regex and other formats (email, url, uuid)
        if (checkDef.format === "regex") {
          constraints.push({
            type: "pattern",
            pattern: checkDef.pattern,
          });
        } else {
          constraints.push({
            type: "format",
            format: checkDef.format,
            pattern: checkDef.pattern,
          });
        }
        break;

      case "multiple_of":
        constraints.push({
          type: "multiple_of",
          value: checkDef.value,
        });
        break;

      // Add more constraint types as needed
    }
  }

  return constraints.length > 0 ? constraints : undefined;
}

/**
 * Extract union options from a Zod union schema
 *
 * @param schema - Zod union schema
 * @returns Array of union options or undefined
 */
export function extractUnionOptions(schema: z.ZodType): UnionOption[] | undefined {
  const def = (schema as any).def || (schema as any)._def;

  // Check if this is a union type
  if (def?.type !== "union" || !def?.options) {
    return undefined;
  }

  const options: UnionOption[] = [];

  for (const option of def.options) {
    const optDef = option.def || option._def;

    // Only extract from object types
    if (optDef?.type === "object" && optDef?.shape) {
      const fields: UnionOption["fields"] = [];

      for (const [fieldName, fieldSchema] of Object.entries(optDef.shape)) {
        const fieldInfo = extractFieldInfo(
          fieldName,
          fieldSchema as z.ZodType,
          { extractUnions: false, extractFieldMeta: true }
        );

        fields.push({
          name: fieldInfo.name,
          type: fieldInfo.type,
          required: fieldInfo.required,
          description: fieldInfo.description,
        });
      }

      if (fields.length > 0) {
        options.push({ fields });
      }
    }
  }

  return options.length > 0 ? options : undefined;
}

/**
 * Walk a Zod union and extract metadata from each option
 *
 * This is useful for discriminated unions where each option has its own metadata.
 * The function attempts to find a discriminator value (like a "type" literal field)
 * and uses it as the key in the result map.
 *
 * @param schema - Zod union schema
 * @param options - Extraction options
 * @returns Map of discriminator value to extracted metadata
 */
export function walkUnion(
  schema: z.ZodType,
  options: ExtractionOptions = {}
): UnionWalkResult {
  const {
    mergeFields = true,
    extractUnions = true,
    extractFieldMeta = true,
  } = options;

  const results = new Map<string, ExtractedMetadata>();
  const def = (schema as any).def || (schema as any)._def;

  if (!def?.options) {
    return { metadata: results, hasMetadata: false };
  }

  // Regular ZodUnion - walk all options
  for (const optionSchema of def.options) {
    const optDef = optionSchema.def || optionSchema._def;

    // Check if this option itself is a discriminated union
    if (optDef?.discriminator && optDef?.options) {
      // Recursively walk this discriminated union
      for (const innerOption of optDef.options) {
        const discriminatorValue = extractDiscriminatorValue(innerOption);
        if (discriminatorValue) {
          const meta = extractMetadata(innerOption);
          if (meta) {
            const enriched = enrichMetadata(
              meta,
              innerOption,
              { mergeFields, extractUnions, extractFieldMeta }
            );
            results.set(discriminatorValue, enriched);
          }
        }
      }
    } else {
      // Try to extract from this option directly
      const discriminatorValue = extractDiscriminatorValue(optionSchema);
      if (discriminatorValue) {
        const meta = extractMetadata(optionSchema);
        if (meta) {
          const enriched = enrichMetadata(
            meta,
            optionSchema,
            { mergeFields, extractUnions, extractFieldMeta }
          );
          results.set(discriminatorValue, enriched);
        }
      }
    }
  }

  return {
    metadata: results,
    hasMetadata: results.size > 0,
  };
}

/**
 * Extract discriminator value from a schema option
 *
 * Looks for a "type" field with a literal value
 */
function extractDiscriminatorValue(schema: z.ZodType): string | undefined {
  const def = (schema as any).def || (schema as any)._def;
  const typeLiteral = def?.shape?.type;

  if (!typeLiteral) {
    return undefined;
  }

  const typeLiteralDef = typeLiteral.def || typeLiteral._def;

  // Zod 4: literals have a 'values' array
  if (typeLiteralDef?.values && Array.isArray(typeLiteralDef.values) && typeLiteralDef.values.length > 0) {
    const typeValue = typeLiteralDef.values[0];
    return typeof typeValue === "string" ? typeValue : undefined;
  }

  // Fallback: direct value property (older Zod versions)
  if (typeLiteralDef?.value !== undefined) {
    return typeof typeLiteralDef.value === "string" ? typeLiteralDef.value : undefined;
  }

  return undefined;
}

/**
 * Enrich metadata with field information extracted from the schema
 *
 * @param metadata - Existing metadata from .meta()
 * @param schema - Zod schema to extract fields from
 * @param options - Extraction options
 * @returns Enriched metadata
 */
function enrichMetadata(
  metadata: SchemaMetadata,
  schema: z.ZodType,
  options: ExtractionOptions
): ExtractedMetadata {
  const { mergeFields } = options;

  if (!mergeFields) {
    return metadata;
  }

  // Extract fields from schema
  const schemaFields = extractFields(schema, options);
  if (!schemaFields) {
    return metadata;
  }

  // If metadata already has fields with descriptions, merge them
  if ((metadata as any).fields) {
    const descriptionMap = new Map<string, string>();
    for (const field of (metadata as any).fields) {
      if (field.description) {
        descriptionMap.set(field.name, field.description);
      }
    }

    // Update schema fields with descriptions from metadata
    for (const field of schemaFields) {
      const description = descriptionMap.get(field.name);
      if (description) {
        field.description = description;
      }
    }
  }

  return {
    ...metadata,
    fields: schemaFields,
  };
}
