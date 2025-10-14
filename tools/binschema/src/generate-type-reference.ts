// ABOUTME: Generate HTML type reference documentation from BinSchema's Zod schemas
// ABOUTME: Extracts metadata from primitive type definitions and produces beautiful HTML docs

import { FieldSchema } from "./schema/binary-schema.js";
import { extractMetadata, type ExtractedMetadata } from "./schema/extract-metadata.js";
import { generateTypeReferenceHTML } from "./generators/type-reference-html.js";
import { writeFileSync } from "fs";
import { resolve } from "path";

/**
 * Extract union options from a Zod union schema
 */
function extractUnionOptions(schema: any): Array<{ fields: Array<{ name: string; type: string; required: boolean; description?: string }> }> | undefined {
  // In Zod 4, use .def instead of ._def
  const def = schema.def || schema._def;

  if (def?.type !== 'union' || !def?.options) {
    return undefined;
  }

  const options: Array<{ fields: Array<{ name: string; type: string; required: boolean; description?: string }> }> = [];

  for (const option of def.options) {
    const optDef = option.def || option._def;

    if (optDef?.type === 'object' && optDef?.shape) {
      const fields: Array<{ name: string; type: string; required: boolean; description?: string }> = [];

      for (const [fieldName, fieldSchema] of Object.entries(optDef.shape)) {
        let unwrappedSchema = fieldSchema as any;
        let fieldDef = unwrappedSchema.def || unwrappedSchema._def;

        // Determine if field is required
        const required = !unwrappedSchema.isOptional?.();

        // Unwrap optional types to get the actual underlying type
        if (fieldDef?.type === 'optional' && fieldDef?.innerType) {
          unwrappedSchema = fieldDef.innerType;
          fieldDef = unwrappedSchema.def || unwrappedSchema._def;
        }

        // Get the type name
        let typeName = fieldDef?.type || 'unknown';

        // For enum types, show the enum values
        if (fieldDef?.type === 'enum') {
          // Zod 4 uses 'entries' object instead of 'values' Set
          if (fieldDef?.entries) {
            const enumValues = Object.keys(fieldDef.entries);
            typeName = `enum (${enumValues.map((v: any) => `"${v}"`).join(' | ')})`;
          } else if (fieldDef?.values) {
            // Fallback for older Zod versions
            typeName = `enum (${Array.from(fieldDef.values).map((v: any) => `"${v}"`).join(' | ')})`;
          }
        }

        // Try to extract description from field's .meta()
        let description: string | undefined;
        try {
          const fieldMeta = (fieldSchema as any).meta?.();
          if (fieldMeta?.description) {
            description = fieldMeta.description;
          }
        } catch (e) {
          // No meta on this field
        }

        fields.push({
          name: fieldName,
          type: typeName,
          required,
          description
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
 * Walk a Zod union/discriminated union and extract metadata from each option
 */
function walkUnion(schema: any): Map<string, ExtractedMetadata> {
  const results = new Map<string, ExtractedMetadata>();

  const def = schema.def || schema._def;
  if (!def?.options) {
    return results;
  }

  // Regular ZodUnion - walk all options (could be nested discriminated unions)
  for (const optionSchema of def.options) {
    const optDef = optionSchema.def || optionSchema._def;

    // Check if this option itself is a discriminated union
    if (optDef?.discriminator && optDef?.options) {
      // Recursively walk this discriminated union
      for (const innerOption of optDef.options) {
        const innerDef = innerOption.def || innerOption._def;
        const typeLiteral = innerDef?.shape?.type;
        const typeLiteralDef = typeLiteral?.def || typeLiteral?._def;

        if (typeLiteralDef?.values) {
          const typeValue = Array.from(typeLiteralDef.values)[0];
          if (typeValue && typeof typeValue === 'string') {
            const meta = extractMetadata(innerOption);
            if (meta) {
              // Enrich metadata with field information from schema
              enrichMetadataWithSchemaFields(meta, innerDef);
              results.set(typeValue, meta);
            }
          }
        }
      }
    } else {
      // Try to extract from this option directly
      const typeLiteral = optDef?.shape?.type;
      const typeLiteralDef = typeLiteral?.def || typeLiteral?._def;

      if (typeLiteralDef?.values) {
        const typeValue = Array.from(typeLiteralDef.values)[0];
        if (typeValue && typeof typeValue === 'string') {
          const meta = extractMetadata(optionSchema);
          if (meta) {
            // Enrich metadata with field information from schema
            enrichMetadataWithSchemaFields(meta, optDef);
            results.set(typeValue, meta);
          }
        }
      }
    }
  }

  return results;
}

/**
 * Extract field information directly from Zod schema shape
 */
function extractFieldsFromSchema(schemaDef: any): ExtractedMetadata['fields'] {
  if (!schemaDef?.shape) {
    return undefined;
  }

  const fields: NonNullable<ExtractedMetadata['fields']> = [];

  for (const [fieldName, fieldSchema] of Object.entries(schemaDef.shape)) {
    const fieldDef = (fieldSchema as any).def || (fieldSchema as any)._def;

    // Determine if field is required
    const required = !(fieldSchema as any).isOptional?.();

    // Get the type name
    let typeName = fieldDef?.type || 'unknown';

    // For literal types, show the literal value
    if (fieldDef?.type === 'literal' && fieldDef?.value !== undefined) {
      typeName = `literal "${fieldDef.value}"`;
    }

    // For enum types, show the enum values
    if (fieldDef?.type === 'enum') {
      // Zod 4 uses 'entries' object instead of 'values' Set
      if (fieldDef?.entries) {
        const enumValues = Object.keys(fieldDef.entries);
        typeName = `enum (${enumValues.map((v: any) => `"${v}"`).join(' | ')})`;
      } else if (fieldDef?.values) {
        // Fallback for older Zod versions
        typeName = `enum (${Array.from(fieldDef.values).map((v: any) => `"${v}"`).join(' | ')})`;
      }
    }

    // For union types, note it's a union (we'll extract options separately)
    if (fieldDef?.type === 'union') {
      typeName = 'union';
    }

    // For array types
    if (fieldDef?.type === 'array') {
      typeName = 'array';
    }

    // Extract union options if this is a union field
    const unionOptions = extractUnionOptions(fieldSchema as any);

    fields.push({
      name: fieldName,
      type: typeName,
      required,
      description: '', // Will be filled from metadata if available
      union_options: unionOptions
    });
  }

  return fields.length > 0 ? fields : undefined;
}

/**
 * Enrich metadata with field information extracted from the Zod schema
 * Merges schema-extracted fields with metadata descriptions
 */
function enrichMetadataWithSchemaFields(metadata: ExtractedMetadata, schemaDef: any): void {
  if (!schemaDef?.shape) {
    return;
  }

  // Extract fields from schema
  const schemaFields = extractFieldsFromSchema(schemaDef);
  if (!schemaFields) {
    return;
  }

  // If metadata already has fields with descriptions, merge them
  if (metadata.fields) {
    // Create a map of existing field descriptions
    const descriptionMap = new Map<string, string>();
    for (const field of metadata.fields) {
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

  // Replace metadata fields with schema-extracted fields (enriched with descriptions)
  metadata.fields = schemaFields;
}

/**
 * Main entry point
 */
function main() {
  console.log("Extracting metadata from BinSchema type definitions...\n");

  // Extract metadata from FieldSchema union
  const metadata = walkUnion(FieldSchema);

  console.log(`Found metadata for ${metadata.size} types\n`);

  if (metadata.size === 0) {
    console.error("ERROR: No metadata found. Make sure types have .meta() calls.");
    process.exit(1);
  }

  // Generate HTML
  console.log("Generating HTML documentation...\n");
  const html = generateTypeReferenceHTML(metadata, {
    title: "BinSchema Type Reference",
    description: "Complete reference for all built-in types supported by BinSchema, including wire format specifications and code generation mappings.",
  });

  // Write to file
  const outputPath = resolve(process.cwd(), "type-reference.html");
  writeFileSync(outputPath, html, "utf-8");

  console.log(`✓ Generated type reference documentation: ${outputPath}`);
  console.log(`✓ Documented ${metadata.size} types\n`);
  console.log(`Documented types:`);
  for (const typeName of Array.from(metadata.keys()).sort()) {
    const meta = metadata.get(typeName)!;
    console.log(`  - ${typeName}: ${meta.title || "(no title)"}`);
  }
}

// Run if executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}
