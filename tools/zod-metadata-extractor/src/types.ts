// ABOUTME: Type definitions for metadata extraction from Zod schemas
// ABOUTME: Extensible metadata interface supporting custom fields

import type { z } from "zod";

/**
 * Metadata that can be attached to a Zod schema via .meta()
 *
 * This interface is intentionally permissive to allow any custom fields.
 * Common fields are documented here, but users can add their own.
 */
export interface SchemaMetadata extends Record<string, unknown> {
  /** Human-readable title */
  title?: string;

  /** Description with optional inline markdown (**bold**, *italic*) */
  description?: string;

  /** Example values */
  examples?: unknown[];

  /** Additional notes */
  notes?: string[];

  /** References to related types/schemas */
  see_also?: string[];

  /** Version when added */
  since?: string;

  /** Deprecation notice */
  deprecated?: string;
}

/**
 * Field information extracted from schema structure
 */
export interface FieldInfo {
  /** Field name */
  name: string;

  /** Field type (primitive name or "unknown") */
  type: string;

  /** Whether the field is required */
  required: boolean;

  /** Optional description from field's .meta() */
  description?: string;

  /** Default value if specified */
  default?: string;

  /** For union fields, extracted options */
  unionOptions?: UnionOption[];
}

/**
 * A single option in a union type
 */
export interface UnionOption {
  /** Fields that make up this option */
  fields: Array<{
    name: string;
    type: string;
    required: boolean;
    description?: string;
  }>;
}

/**
 * Complete extracted metadata including both .meta() and schema-derived info
 */
export interface ExtractedMetadata extends SchemaMetadata {
  /** Fields/properties extracted from schema shape */
  fields?: FieldInfo[];
}

/**
 * Options for metadata extraction
 */
export interface ExtractionOptions {
  /** Whether to merge schema-derived fields with metadata fields */
  mergeFields?: boolean;

  /** Whether to extract union options */
  extractUnions?: boolean;

  /** Whether to extract field descriptions from .meta() */
  extractFieldMeta?: boolean;
}

/**
 * Result of walking a union type
 */
export interface UnionWalkResult {
  /** Map of discriminator value to metadata */
  metadata: Map<string, ExtractedMetadata>;

  /** Whether any metadata was found */
  hasMetadata: boolean;
}
