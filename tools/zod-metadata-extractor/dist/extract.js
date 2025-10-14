// ABOUTME: Core metadata extraction functions for Zod v4 schemas
// ABOUTME: Handles simple schemas, unions, and discriminated unions
/**
 * Extract metadata from a Zod schema using .meta()
 *
 * @param schema - Any Zod schema
 * @returns Metadata object or undefined if no metadata exists
 */
export function extractMetadata(schema) {
    try {
        // In Zod v4, calling .meta() without arguments retrieves metadata
        const metadata = schema.meta();
        return metadata || undefined;
    }
    catch (error) {
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
export function extractFields(schema, options = {}) {
    const { extractUnions = true, extractFieldMeta = true, } = options;
    const def = schema.def || schema._def;
    // Only works for object types
    if (def?.type !== "object" || !def?.shape) {
        return undefined;
    }
    const fields = [];
    for (const [fieldName, fieldSchema] of Object.entries(def.shape)) {
        const field = extractFieldInfo(fieldName, fieldSchema, { extractUnions, extractFieldMeta });
        fields.push(field);
    }
    return fields.length > 0 ? fields : undefined;
}
/**
 * Extract information about a single field
 */
function extractFieldInfo(name, schema, options) {
    const { extractUnions, extractFieldMeta } = options;
    let unwrappedSchema = schema;
    let fieldDef = schema.def || schema._def;
    // Determine if field is required
    const required = !schema.isOptional?.();
    // Unwrap optional types to get the actual underlying type (handle nested optionals)
    while (fieldDef?.type === "optional" && fieldDef?.innerType) {
        unwrappedSchema = fieldDef.innerType;
        fieldDef = unwrappedSchema.def || unwrappedSchema._def;
    }
    // Get the type name
    let typeName = getTypeName(fieldDef);
    // Extract description from field's .meta() if requested
    let description;
    if (extractFieldMeta) {
        try {
            const fieldMeta = schema.meta?.();
            if (fieldMeta?.description) {
                description = fieldMeta.description;
            }
        }
        catch (e) {
            // No meta on this field
        }
    }
    // Extract union options if this is a union field
    let unionOptions;
    if (extractUnions && fieldDef?.type === "union") {
        unionOptions = extractUnionOptions(unwrappedSchema);
    }
    return {
        name,
        type: typeName,
        required,
        description,
        unionOptions,
    };
}
/**
 * Get human-readable type name from Zod def
 */
function getTypeName(fieldDef) {
    const type = fieldDef?.type;
    if (!type) {
        return "unknown";
    }
    // Handle literal types (Zod 4 uses 'values' array)
    if (type === "literal") {
        if (fieldDef?.values && Array.isArray(fieldDef.values) && fieldDef.values.length > 0) {
            return `literal "${fieldDef.values[0]}"`;
        }
        else if (fieldDef?.value !== undefined) {
            // Fallback for older Zod versions
            return `literal "${fieldDef.value}"`;
        }
    }
    // Handle enum types
    if (type === "enum") {
        // Zod 4 uses 'entries' object instead of 'values' Set
        if (fieldDef?.entries) {
            const enumValues = Object.keys(fieldDef.entries);
            return `enum (${enumValues.map((v) => `"${v}"`).join(" | ")})`;
        }
        else if (fieldDef?.values) {
            // Fallback for older Zod versions
            return `enum (${Array.from(fieldDef.values).map((v) => `"${v}"`).join(" | ")})`;
        }
    }
    return type;
}
/**
 * Extract union options from a Zod union schema
 *
 * @param schema - Zod union schema
 * @returns Array of union options or undefined
 */
export function extractUnionOptions(schema) {
    const def = schema.def || schema._def;
    // Check if this is a union type
    if (def?.type !== "union" || !def?.options) {
        return undefined;
    }
    const options = [];
    for (const option of def.options) {
        const optDef = option.def || option._def;
        // Only extract from object types
        if (optDef?.type === "object" && optDef?.shape) {
            const fields = [];
            for (const [fieldName, fieldSchema] of Object.entries(optDef.shape)) {
                const fieldInfo = extractFieldInfo(fieldName, fieldSchema, { extractUnions: false, extractFieldMeta: true });
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
export function walkUnion(schema, options = {}) {
    const { mergeFields = true, extractUnions = true, extractFieldMeta = true, } = options;
    const results = new Map();
    const def = schema.def || schema._def;
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
                        const enriched = enrichMetadata(meta, innerOption, { mergeFields, extractUnions, extractFieldMeta });
                        results.set(discriminatorValue, enriched);
                    }
                }
            }
        }
        else {
            // Try to extract from this option directly
            const discriminatorValue = extractDiscriminatorValue(optionSchema);
            if (discriminatorValue) {
                const meta = extractMetadata(optionSchema);
                if (meta) {
                    const enriched = enrichMetadata(meta, optionSchema, { mergeFields, extractUnions, extractFieldMeta });
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
function extractDiscriminatorValue(schema) {
    const def = schema.def || schema._def;
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
function enrichMetadata(metadata, schema, options) {
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
    if (metadata.fields) {
        const descriptionMap = new Map();
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
    return {
        ...metadata,
        fields: schemaFields,
    };
}
//# sourceMappingURL=extract.js.map