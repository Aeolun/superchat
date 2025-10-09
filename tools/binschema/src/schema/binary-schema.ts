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

/**
 * String encoding
 */
const StringEncodingSchema = z.enum([
  "ascii",  // 7-bit ASCII (one byte per character)
  "utf8",   // UTF-8 encoding (variable bytes per character)
]);
export type StringEncoding = z.infer<typeof StringEncodingSchema>;

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
 * Discriminated union variant (define before use)
 */
const DiscriminatedUnionVariantSchema = z.object({
  when: z.string().optional(), // Condition expression (e.g., "value >= 0xC0"), optional for fallback
  type: z.string(), // Type name to parse if condition matches
  description: z.string().optional(),
});

/**
 * Discriminated union element (without name - for type aliases)
 */
const DiscriminatedUnionElementSchema = z.object({
  type: z.literal("discriminated_union"),
  discriminator: z.object({
    peek: z.enum(["uint8", "uint16", "uint32"]).optional(),
    field: z.string().optional(),
    endianness: EndiannessSchema.optional(),
  }),
  variants: z.array(DiscriminatedUnionVariantSchema).min(1),
  description: z.string().optional(),
});

/**
 * Pointer element (without name - for type aliases)
 */
const PointerElementSchema = z.object({
  type: z.literal("pointer"),
  storage: z.enum(["uint8", "uint16", "uint32"]),
  offset_mask: z.string(),
  offset_from: z.enum(["message_start", "current_position"]),
  target_type: z.string(),
  endianness: EndiannessSchema.optional(),
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
  length_field: z.string().optional(), // Optional: name to display for the length field
  variants: z.array(z.string()).optional(), // Optional: possible type names this could contain
  notes: z.array(z.string()).optional(), // Optional: notes about variants or usage
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
 * String element schema (string without name - for array items)
 */
const StringElementSchema = z.object({
  type: z.literal("string"),
  kind: ArrayKindSchema,
  encoding: StringEncodingSchema.optional().default("utf8"),
  length: z.number().int().min(1).optional(), // For fixed length
  length_type: z.enum(["uint8", "uint16", "uint32", "uint64"]).optional(), // For length_prefixed
  description: z.string().optional(),
}).refine(
  (data) => {
    if (data.kind === "fixed") return data.length !== undefined;
    if (data.kind === "length_prefixed") return data.length_type !== undefined;
    return true;
  },
  {
    message: "Fixed strings require 'length', length_prefixed strings require 'length_type'",
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
    StringElementSchema, // Support strings
    DiscriminatedUnionElementSchema, // Support discriminated unions
    PointerElementSchema, // Support pointers
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
  length_field: z.string().optional(), // Optional: name to display for the length field
  variants: z.array(z.string()).optional(), // Optional: possible type names this could contain
  notes: z.array(z.string()).optional(), // Optional: notes about variants or usage
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
 * String field (variable or fixed length)
 */
const StringFieldSchema = z.object({
  name: z.string(),
  type: z.literal("string"),
  kind: ArrayKindSchema,
  encoding: StringEncodingSchema.optional().default("utf8"),
  length: z.number().int().min(1).optional(), // For fixed length
  length_type: z.enum(["uint8", "uint16", "uint32", "uint64"]).optional(), // For length_prefixed
  description: z.string().optional(),
}).refine(
  (data) => {
    if (data.kind === "fixed") return data.length !== undefined;
    if (data.kind === "length_prefixed") return data.length_type !== undefined;
    return true;
  },
  {
    message: "Fixed strings require 'length', length_prefixed strings require 'length_type'",
  }
);

/**
 * Discriminated union field
 * Choose type variant based on discriminator value (peek or field-based)
 */
const DiscriminatedUnionFieldSchema = z.object({
  name: z.string(),
  type: z.literal("discriminated_union"),
  discriminator: z.object({
    peek: z.enum(["uint8", "uint16", "uint32"]).optional(), // Peek at current position
    field: z.string().optional(), // Reference to earlier field in same struct
    endianness: EndiannessSchema.optional(), // Required for uint16/uint32 peek
  }),
  variants: z.array(DiscriminatedUnionVariantSchema).min(1),
  description: z.string().optional(),
});

/**
 * Pointer field (for compression via backwards references)
 */
const PointerFieldSchema = z.object({
  name: z.string(),
  type: z.literal("pointer"),
  storage: z.enum(["uint8", "uint16", "uint32"]), // How pointer is stored
  offset_mask: z.string(), // Bit mask to extract offset (e.g., "0x3FFF")
  offset_from: z.enum(["message_start", "current_position"]), // Offset calculation
  target_type: z.string(), // Type to parse at offset
  endianness: EndiannessSchema.optional(), // Required for uint16/uint32
  description: z.string().optional(),
});

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
    StringFieldSchema,
    BitfieldFieldSchema,
    DiscriminatedUnionFieldSchema,
    PointerFieldSchema,
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
 * Composite type with sequence of fields
 *
 * Supports both 'sequence' (new format) and 'fields' (backwards compatibility).
 * A composite type represents an ordered sequence of types on the wire.
 */
const CompositeTypeSchema = z.union([
  // New format with 'sequence' - represents ordered byte sequence
  z.object({
    sequence: z.array(FieldSchema),
    description: z.string().optional(),
  }),
  // Backwards compatibility with 'fields'
  z.object({
    fields: z.array(FieldSchema),
    description: z.string().optional(),
  })
]);

/**
 * Type definition - either composite or type alias
 *
 * A type can be:
 * 1. Composite type: Has a 'sequence' (or 'fields') of named types that appear in order on the wire
 *    Example: AuthRequest is a sequence of [String nickname, String password]
 *
 * 2. Type alias: Directly references a type/primitive without wrapping
 *    Example: String IS a length-prefixed array of uint8, not a struct containing one
 *
 * This distinction clarifies that binary schemas represent wire format (ordered byte sequences),
 * not TypeScript structure (nested objects).
 */
export const TypeDefSchema = z.union([
  CompositeTypeSchema,
  // Type alias - any element type (primitive, array, etc) with optional description
  ElementTypeSchema.and(z.object({
    description: z.string().optional()
  }))
]);
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
