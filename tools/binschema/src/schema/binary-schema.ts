import { z } from "zod";

/**
 * Binary Schema Definition
 *
 * This schema defines the structure of binary format definitions.
 * It supports bit-level precision and generates encoders/decoders.
 */

// ============================================================================
// Primitives and Basic Types
// ============================================================================

/**
 * Endianness for multi-byte numeric types
 */
export const EndiannessSchema = z.enum(["big_endian", "little_endian"]);
export type Endianness = z.infer<typeof EndiannessSchema>;

/**
 * Bit ordering within bytes
 */
export const BitOrderSchema = z.enum(["msb_first", "lsb_first"]);
export type BitOrder = z.infer<typeof BitOrderSchema>;

/**
 * Global configuration options
 */
export const ConfigSchema = z.object({
  endianness: EndiannessSchema.optional(),
  bit_order: BitOrderSchema.optional(),
}).optional();
export type Config = z.infer<typeof ConfigSchema>;

// ============================================================================
// Field Types
// ============================================================================

/**
 * Bit field (1-64 bits, unsigned integer)
 */
const BitFieldSchema = z.object({
  name: z.string(),
  type: z.literal("bit"),
  size: z.number().int().min(1).max(64),
  description: z.string().optional(),
});

/**
 * Signed integer field (1-64 bits)
 */
const SignedIntFieldSchema = z.object({
  name: z.string(),
  type: z.literal("int"),
  size: z.number().int().min(1).max(64),
  signed: z.literal(true),
  description: z.string().optional(),
});

/**
 * Fixed-width unsigned integers (syntactic sugar for bit fields)
 */
const Uint8FieldSchema = z.object({
  name: z.string(),
  type: z.literal("uint8"),
  endianness: EndiannessSchema.optional(), // Override global
  description: z.string().optional(),
});

const Uint16FieldSchema = z.object({
  name: z.string(),
  type: z.literal("uint16"),
  endianness: EndiannessSchema.optional(),
  description: z.string().optional(),
});

const Uint32FieldSchema = z.object({
  name: z.string(),
  type: z.literal("uint32"),
  endianness: EndiannessSchema.optional(),
  description: z.string().optional(),
});

const Uint64FieldSchema = z.object({
  name: z.string(),
  type: z.literal("uint64"),
  endianness: EndiannessSchema.optional(),
  description: z.string().optional(),
});

/**
 * Fixed-width signed integers
 */
const Int8FieldSchema = z.object({
  name: z.string(),
  type: z.literal("int8"),
  endianness: EndiannessSchema.optional(),
  description: z.string().optional(),
});

const Int16FieldSchema = z.object({
  name: z.string(),
  type: z.literal("int16"),
  endianness: EndiannessSchema.optional(),
  description: z.string().optional(),
});

const Int32FieldSchema = z.object({
  name: z.string(),
  type: z.literal("int32"),
  endianness: EndiannessSchema.optional(),
  description: z.string().optional(),
});

const Int64FieldSchema = z.object({
  name: z.string(),
  type: z.literal("int64"),
  endianness: EndiannessSchema.optional(),
  description: z.string().optional(),
});

/**
 * Floating point types
 */
const Float32FieldSchema = z.object({
  name: z.string(),
  type: z.literal("float32"),
  endianness: EndiannessSchema.optional(),
  description: z.string().optional(),
});

const Float64FieldSchema = z.object({
  name: z.string(),
  type: z.literal("float64"),
  endianness: EndiannessSchema.optional(),
  description: z.string().optional(),
});

/**
 * Array kinds
 */
const ArrayKindSchema = z.enum([
  "fixed",           // Fixed size array
  "length_prefixed", // Length prefix, then elements
  "null_terminated", // Elements until null/zero terminator
]);
export type ArrayKind = z.infer<typeof ArrayKindSchema>;

// ============================================================================
// Element Types (for array items - no 'name' field required)
// ============================================================================

/**
 * Element type schemas are like field schemas but without the 'name' property.
 * Used for array items where elements don't have individual names.
 */

const BitElementSchema = z.object({
  type: z.literal("bit"),
  size: z.number().int().min(1).max(64),
  description: z.string().optional(),
});

const SignedIntElementSchema = z.object({
  type: z.literal("int"),
  size: z.number().int().min(1).max(64),
  signed: z.literal(true),
  description: z.string().optional(),
});

const Uint8ElementSchema = z.object({
  type: z.literal("uint8"),
  endianness: EndiannessSchema.optional(),
  description: z.string().optional(),
});

const Uint16ElementSchema = z.object({
  type: z.literal("uint16"),
  endianness: EndiannessSchema.optional(),
  description: z.string().optional(),
});

const Uint32ElementSchema = z.object({
  type: z.literal("uint32"),
  endianness: EndiannessSchema.optional(),
  description: z.string().optional(),
});

const Uint64ElementSchema = z.object({
  type: z.literal("uint64"),
  endianness: EndiannessSchema.optional(),
  description: z.string().optional(),
});

const Int8ElementSchema = z.object({
  type: z.literal("int8"),
  endianness: EndiannessSchema.optional(),
  description: z.string().optional(),
});

const Int16ElementSchema = z.object({
  type: z.literal("int16"),
  endianness: EndiannessSchema.optional(),
  description: z.string().optional(),
});

const Int32ElementSchema = z.object({
  type: z.literal("int32"),
  endianness: EndiannessSchema.optional(),
  description: z.string().optional(),
});

const Int64ElementSchema = z.object({
  type: z.literal("int64"),
  endianness: EndiannessSchema.optional(),
  description: z.string().optional(),
});

const Float32ElementSchema = z.object({
  type: z.literal("float32"),
  endianness: EndiannessSchema.optional(),
  description: z.string().optional(),
});

const Float64ElementSchema = z.object({
  type: z.literal("float64"),
  endianness: EndiannessSchema.optional(),
  description: z.string().optional(),
});

/**
 * Type reference without name (for array items)
 */
const TypeRefElementSchema = z.object({
  type: z.string(),
  description: z.string().optional(),
});

/**
 * Array element schema (array without name - for nested arrays)
 */
const ArrayElementSchema = z.object({
  type: z.literal("array"),
  kind: ArrayKindSchema,
  get items() {
    return ElementTypeSchema; // Recursive reference
  },
  length: z.number().int().min(1).optional(),
  length_type: z.enum(["uint8", "uint16", "uint32", "uint64"]).optional(),
  description: z.string().optional(),
}).refine(
  (data) => {
    if (data.kind === "fixed") return data.length !== undefined;
    if (data.kind === "length_prefixed") return data.length_type !== undefined;
    return true;
  },
  {
    message: "Fixed arrays require 'length', length_prefixed arrays require 'length_type'",
  }
);

/**
 * Element type union - all possible array element types
 * Note: Uses getter for recursive array elements (Zod 4 pattern)
 */
const ElementTypeSchema: z.ZodType<any> = z.union([
  // Discriminated union for typed elements (includes nested arrays)
  z.discriminatedUnion("type", [
    BitElementSchema,
    SignedIntElementSchema,
    Uint8ElementSchema,
    Uint16ElementSchema,
    Uint32ElementSchema,
    Uint64ElementSchema,
    Int8ElementSchema,
    Int16ElementSchema,
    Int32ElementSchema,
    Int64ElementSchema,
    Float32ElementSchema,
    Float64ElementSchema,
    ArrayElementSchema, // Support nested arrays
  ]),
  // Type reference for user-defined types
  TypeRefElementSchema,
]);

/**
 * Array field (variable or fixed length)
 * Note: Uses getter for recursive 'items' reference (Zod 4 pattern)
 */
const ArrayFieldSchema = z.object({
  name: z.string(),
  type: z.literal("array"),
  kind: ArrayKindSchema,
  get items() {
    return ElementTypeSchema; // Recursive: array of element types (no name required)
  },
  length: z.number().int().min(1).optional(), // For fixed arrays
  length_type: z.enum(["uint8", "uint16", "uint32", "uint64"]).optional(), // For length_prefixed
  description: z.string().optional(),
}).refine(
  (data) => {
    if (data.kind === "fixed") return data.length !== undefined;
    if (data.kind === "length_prefixed") return data.length_type !== undefined;
    return true;
  },
  {
    message: "Fixed arrays require 'length', length_prefixed arrays require 'length_type'",
  }
);

/**
 * Bitfield container (pack multiple bit-level fields)
 */
const BitfieldFieldSchema = z.object({
  name: z.string(),
  type: z.literal("bitfield"),
  size: z.number().int().min(1), // Total bits
  bit_order: BitOrderSchema.optional(), // Override global
  fields: z.array(z.object({
    name: z.string(),
    offset: z.number().int().min(0), // Bit offset within bitfield
    size: z.number().int().min(1),   // Bits used
    description: z.string().optional(),
  })),
  description: z.string().optional(),
});

/**
 * Reference to another type (for composition)
 * Note: This MUST be last in the FieldTypeRefSchema union to avoid matching built-in types
 */
const TypeRefFieldSchema = z.object({
  name: z.string(),
  type: z.string(), // Name of another type or generic like "Optional<uint64>"
  description: z.string().optional(),
});

/**
 * Conditional field (only present if condition is true)
 */
const ConditionalFieldSchema = z.object({
  name: z.string(),
  type: z.string(),
  conditional: z.string(), // Expression like "flags.present == 1"
  description: z.string().optional(),
});

/**
 * All possible field types as a discriminated union
 *
 * Order matters: most specific schemas first, then fallback to type reference.
 * - Primitives and special types use discriminated union on 'type' field
 * - Conditionals are detected by presence of 'conditional' property
 * - Type references are the fallback for user-defined types
 */
const FieldTypeRefSchema: z.ZodType<any> = z.union([
  // First: Check for conditional fields (has 'conditional' property - unique identifier)
  ConditionalFieldSchema,

  // Second: Discriminated union on 'type' field for all built-in types
  z.discriminatedUnion("type", [
    BitFieldSchema,
    SignedIntFieldSchema,
    Uint8FieldSchema,
    Uint16FieldSchema,
    Uint32FieldSchema,
    Uint64FieldSchema,
    Int8FieldSchema,
    Int16FieldSchema,
    Int32FieldSchema,
    Int64FieldSchema,
    Float32FieldSchema,
    Float64FieldSchema,
    ArrayFieldSchema,
    BitfieldFieldSchema,
  ]),

  // Third: Fallback to type reference for user-defined types
  TypeRefFieldSchema,
]);

/**
 * All possible field types
 */
export const FieldSchema = FieldTypeRefSchema;
export type Field = z.infer<typeof FieldSchema>;

// ============================================================================
// Type Definitions
// ============================================================================

/**
 * Type definition (struct/composite type)
 */
export const TypeDefSchema = z.object({
  fields: z.array(FieldSchema),
  description: z.string().optional(),
});
export type TypeDef = z.infer<typeof TypeDefSchema>;

// ============================================================================
// Complete Binary Schema
// ============================================================================

/**
 * Complete binary schema definition
 */
export const BinarySchemaSchema = z.object({
  config: ConfigSchema,
  types: z.record(z.string(), TypeDefSchema), // Map of type name → definition
});
export type BinarySchema = z.infer<typeof BinarySchemaSchema>;

/**
 * Helper function to define a schema with type checking
 */
export function defineBinarySchema(schema: BinarySchema): BinarySchema {
  return BinarySchemaSchema.parse(schema);
}
