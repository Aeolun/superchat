// ABOUTME: Extract metadata from Zod schemas for documentation generation
// ABOUTME: Walks schema definitions and retrieves .meta() data from z.globalRegistry

import { z } from "zod";

/**
 * Metadata extracted from a Zod schema
 */
export interface ExtractedMetadata {
  title?: string;
  description?: string;
  examples?: unknown[];
  use_for?: string;
  wire_format?: string;
  fields?: Array<{
    name: string;
    type: string;
    required: boolean;
    description: string;
    default?: string;
    union_options?: Array<{
      fields: Array<{
        name: string;
        type: string;
        required: boolean;
        description?: string;
      }>;
    }>;
  }>;
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
  notes?: string[];
  see_also?: string[];
  since?: string;
  deprecated?: string;
}

/**
 * Extract union options from a Zod union schema
 * Returns array of option structures with their fields
 */
function extractUnionOptions(schema: any): Array<{ fields: Array<{ name: string; type: string; required: boolean }> }> | undefined {
  // Check if this is a union type
  if (schema.def?.type !== 'union' || !schema.def?.options) {
    return undefined;
  }

  const options: Array<{ fields: Array<{ name: string; type: string; required: boolean }> }> = [];

  for (const option of schema.def.options) {
    // Only extract from object types
    if (option.def?.type === 'object' && option.def?.shape) {
      const fields: Array<{ name: string; type: string; required: boolean }> = [];

      for (const [fieldName, fieldSchema] of Object.entries(option.def.shape)) {
        const fieldDef = (fieldSchema as any).def;

        // Determine if field is required (not optional)
        const required = !(fieldSchema as any).isOptional?.();

        // Get the type name
        let typeName = fieldDef?.type || 'unknown';

        // For enum types, show the enum values
        if (fieldDef?.type === 'enum' && fieldDef?.values) {
          typeName = `enum (${Array.from(fieldDef.values).map((v: any) => `"${v}"`).join(' | ')})`;
        }

        fields.push({
          name: fieldName,
          type: typeName,
          required
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
 * Extract metadata from a Zod schema
 *
 * Uses Zod 4's .meta() method to retrieve metadata from z.globalRegistry
 */
export function extractMetadata(schema: z.ZodType): ExtractedMetadata | undefined {
  try {
    // In Zod 4, calling .meta() without arguments retrieves metadata
    const metadata = (schema as any).meta();

    // If metadata has fields, check if any field schemas are unions
    if (metadata?.fields) {
      // We need access to the actual schema to extract union info
      // This requires the schema to be passed along with metadata
      // For now, we'll handle this in the generator that has access to both
    }

    return metadata;
  } catch (error) {
    // Schema has no metadata
    return undefined;
  }
}

/**
 * Walk a Zod union/discriminated union and extract metadata from each option
 */
function walkUnion(schema: any): Map<string, ExtractedMetadata> {
  const results = new Map<string, ExtractedMetadata>();

  if (!schema._def?.options) {
    return results;
  }

  // Regular ZodUnion - walk all options (could be nested discriminated unions)
  for (const optionSchema of schema._def.options) {
    // Check if this option itself is a discriminated union
    if (optionSchema._def?.discriminator && optionSchema._def?.options) {
      // Recursively walk this discriminated union
      for (const innerOption of optionSchema._def.options) {
        // Try to find the literal type value from the 'type' field
        // In Zod 4, ZodLiteral has _def.values which is a Set
        const typeLiteral = innerOption._def?.shape?.type;
        if (typeLiteral?._def?.values) {
          const typeValue = Array.from(typeLiteral._def.values)[0];
          if (typeValue && typeof typeValue === 'string') {
            const meta = extractMetadata(innerOption);
            if (meta) {
              results.set(typeValue, meta);
            }
          }
        }
      }
    } else {
      // Try to extract from this option directly
      const typeLiteral = optionSchema._def?.shape?.type;
      if (typeLiteral?._def?.values) {
        const typeValue = Array.from(typeLiteral._def.values)[0];
        if (typeValue && typeof typeValue === 'string') {
          const meta = extractMetadata(optionSchema);
          if (meta) {
            results.set(typeValue, meta);
          }
        }
      }
    }
  }

  return results;
}

/**
 * Test extraction with our BinarySchema types
 */
export async function testMetadataExtraction() {
  // Import the FieldSchema which is a union of all field types
  // Use dynamic import to get the TS version
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
