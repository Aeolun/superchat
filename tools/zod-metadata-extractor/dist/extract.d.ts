import type { z } from "zod";
import type { SchemaMetadata, FieldInfo, UnionOption, ExtractionOptions, UnionWalkResult } from "./types.js";
/**
 * Extract metadata from a Zod schema using .meta()
 *
 * @param schema - Any Zod schema
 * @returns Metadata object or undefined if no metadata exists
 */
export declare function extractMetadata(schema: z.ZodType): SchemaMetadata | undefined;
/**
 * Extract field information from a Zod object schema
 *
 * @param schema - Zod object schema
 * @param options - Extraction options
 * @returns Array of field info or undefined
 */
export declare function extractFields(schema: z.ZodType, options?: ExtractionOptions): FieldInfo[] | undefined;
/**
 * Extract union options from a Zod union schema
 *
 * @param schema - Zod union schema
 * @returns Array of union options or undefined
 */
export declare function extractUnionOptions(schema: z.ZodType): UnionOption[] | undefined;
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
export declare function walkUnion(schema: z.ZodType, options?: ExtractionOptions): UnionWalkResult;
//# sourceMappingURL=extract.d.ts.map