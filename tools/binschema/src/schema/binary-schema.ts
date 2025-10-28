import { z } from "zod";
import { normalizeMessageCode } from "./protocol-schema.js";

/**
 * Binary Schema Definition
 *
 * This schema defines the structure of binary format definitions.
 * It supports bit-level precision and generates encoders/decoders.
 */

// ============================================================================
// Metadata Extension for Self-Documentation
// ============================================================================

declare module "zod" {
  interface GlobalMeta {
    title?: string;           // Human-readable type name
    description?: string;     // Brief description (supports **bold** and *italic*)
    examples?: unknown[];     // Code examples showing usage
    use_for?: string;        // "Use for: X, Y, Z"
    wire_format?: string;    // Binary representation (for binary schemas)
    code_generation?: {      // How this type is represented in generated code (for tabbed view per language)
      typescript?: {
        type: string;        // TypeScript type (e.g., "number", "bigint")
        notes?: string[];    // TypeScript-specific notes
      };
      go?: {
        type: string;        // Go type (e.g., "uint8", "uint64")
        notes?: string[];    // Go-specific notes
      };
      rust?: {
        type: string;        // Rust type (e.g., "u8", "u64")
        notes?: string[];    // Rust-specific notes
      };
    };
    examples_values?: {      // Language-specific example values (what the data looks like)
      typescript?: string;   // TypeScript value example
      go?: string;           // Go value example
      rust?: string;         // Rust value example
    };
    notes?: string[];        // General notes (not language-specific)
    see_also?: string[];     // Related type names/links
    since?: string;          // Version when added
    deprecated?: string;     // Deprecation notice
  }
}

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
  endianness: EndiannessSchema.optional().meta({
    description: "Byte order for multi-byte values (big_endian or little_endian). Overrides global config if specified."
  }),
  bit_order: BitOrderSchema.optional(),
}).optional();
export type Config = z.infer<typeof ConfigSchema>;

/**
 * String encoding
 */
const StringEncodingSchema = z.enum([
  "ascii",  // 7-bit ASCII (one byte per character)
  "utf8",   // UTF-8 encoding (variable bytes per character)
]);
export type StringEncoding = z.infer<typeof StringEncodingSchema>;

/**
 * Computed field specification
 *
 * Computed fields are automatically calculated by the encoder and cannot be set by users.
 * Phase 1: length_of - compute byte length of target field
 * Phase 2: crc32_of - compute CRC32 checksum of target field
 * Phase 3: position_of - compute byte position of target type
 */
const ComputedFieldSchema = z.object({
  type: z.enum(["length_of", "crc32_of", "position_of"]).meta({
    description: "Type of computation to perform"
  }),
  target: z.string().meta({
    description: "Name of the field or type to compute from (supports dot notation like 'header.data')"
  }),
  encoding: StringEncodingSchema.optional().meta({
    description: "For length_of with string targets: encoding to use for byte length calculation (defaults to field's encoding)"
  }),
});
export type ComputedField = z.infer<typeof ComputedFieldSchema>;

// ============================================================================
// Field Types
// ============================================================================

/**
 * Bit field (1-64 bits, unsigned integer)
 */
const BitFieldSchema = z.object({
  name: z.string().meta({
    description: "Field name"
  }),
  type: z.literal("bit").meta({
    description: "Field type (always 'bit')"  
  }),
  size: z.number().int().min(1).max(64),
  description: z.string().optional().meta({
    description: "Human-readable description of this field"
  }),
});

/**
 * Signed integer field (1-64 bits)
 */
const SignedIntFieldSchema = z.object({
  name: z.string().meta({
    description: "Field name"
  }),
  type: z.literal("int").meta({
    description: "Field type (always 'int')"  
  }),
  size: z.number().int().min(1).max(64),
  signed: z.literal(true),
  description: z.string().optional().meta({
    description: "Human-readable description of this field"
  }),
});

/**
 * Fixed-width unsigned integers (syntactic sugar for bit fields)
 */
const Uint8FieldSchema = z.object({
  name: z.string().meta({
    description: "Field name"
  }),
  type: z.literal("uint8").meta({
    description: "Field type (always 'uint8')"
  }),
  computed: ComputedFieldSchema.optional().meta({
    description: "Marks this field as automatically computed (e.g., length_of, crc32_of)"
  }),
  description: z.string().optional().meta({
    description: "Human-readable description of this field"
  }),
}).meta({
  title: "8-bit Unsigned Integer",
  description: "Fixed-width 8-bit unsigned integer (0-255). Single byte, no endianness concerns.",
  use_for: "Message type codes, flags, single-byte counters, status codes",
  wire_format: "1 byte (0x00-0xFF)",
  
  code_generation: {
    typescript: {
      type: "number",
      notes: ["JavaScript Number type", "Safe for all uint8 values"]
    },
    go: {
      type: "uint8",
      notes: ["Native Go uint8 type", "Also known as byte"]
    },
    rust: {
      type: "u8",
      notes: ["Native Rust u8 type"]
    }
  },
  examples: [
    { name: "version", type: "uint8" },
    { name: "flags", type: "uint8", description: "Feature flags" },
    { name: "message_type", type: "uint8" }
  ],
  examples_values: {
    typescript: `{
  version: 1,
  flags: 0x01,
  message_type: 0x20
}`,
    go: `Message{
  Version:     1,
  Flags:       0x01,
  MessageType: 0x20,
}`,
    rust: `Message {
  version: 1,
  flags: 0x01,
  message_type: 0x20,
}`
  }
});

const Uint16FieldSchema = z.object({
  name: z.string().meta({
    description: "Field name"
  }),
  type: z.literal("uint16").meta({
    description: "Field type (always 'uint16')"
  }),
  endianness: EndiannessSchema.optional().meta({
    description: "Byte order for multi-byte values (big_endian or little_endian). Overrides global config if specified."
  }),
  computed: ComputedFieldSchema.optional().meta({
    description: "Marks this field as automatically computed (e.g., length_of, crc32_of)"
  }),
  description: z.string().optional().meta({
    description: "Human-readable description of this field"
  }),
}).meta({
  title: "16-bit Unsigned Integer",
  description: "Fixed-width 16-bit unsigned integer (0-65535). Respects endianness configuration (big-endian or little-endian).",
  use_for: "Port numbers, message lengths, medium-range counters, message IDs",
  wire_format: "2 bytes, byte order depends on endianness setting",
  
  code_generation: {
    typescript: {
      type: "number",
      notes: ["JavaScript Number type", "Safe for all uint16 values"]
    },
    go: {
      type: "uint16",
      notes: ["Native Go uint16 type"]
    },
    rust: {
      type: "u16",
      notes: ["Native Rust u16 type"]
    }
  },
  notes: [
    "Default endianness is inherited from global config",
    "Can override with field-level `endianness` property",
    "Network protocols typically use big-endian"
  ],
  examples: [
    { name: "port", type: "uint16", endianness: "big_endian" },
    { name: "content_length", type: "uint16" },
    { name: "message_id", type: "uint16", endianness: "little_endian" }
  ]
});

const Uint32FieldSchema = z.object({
  name: z.string().meta({
    description: "Field name"
  }),
  type: z.literal("uint32").meta({
    description: "Field type (always 'uint32')"
  }),
  endianness: EndiannessSchema.optional().meta({
    description: "Byte order for multi-byte values (big_endian or little_endian). Overrides global config if specified."
  }),
  computed: ComputedFieldSchema.optional().meta({
    description: "Marks this field as automatically computed (e.g., length_of, crc32_of)"
  }),
  description: z.string().optional().meta({
    description: "Human-readable description of this field"
  }),
}).meta({
  title: "32-bit Unsigned Integer",
  description: "Fixed-width 32-bit unsigned integer (0-4294967295). Respects endianness configuration.",
  use_for: "Timestamps, large counters, IP addresses, file sizes, CRCs",
  wire_format: "4 bytes, byte order depends on endianness setting",
  
  code_generation: {
    typescript: {
      type: "number",
      notes: ["JavaScript Number type", "Safe for all uint32 values"]
    },
    go: {
      type: "uint32",
      notes: ["Native Go uint32 type"]
    },
    rust: {
      type: "u32",
      notes: ["Native Rust u32 type"]
    }
  },
  notes: [
    "Common choice for Unix timestamps (seconds since epoch)",
    "IPv4 addresses are typically stored as uint32"
  ],
  examples: [
    { name: "timestamp", type: "uint32", endianness: "big_endian" },
    { name: "file_size", type: "uint32" },
    { name: "crc32", type: "uint32", endianness: "little_endian" }
  ],
  examples_values: {
    typescript: `{
  timestamp: 1704067200,
  file_size: 1048576,
  crc32: 0xDEADBEEF
}`,
    go: `Message{
  Timestamp: 1704067200,
  FileSize:  1048576,
  Crc32:     0xDEADBEEF,
}`,
    rust: `Message {
  timestamp: 1704067200,
  file_size: 1048576,
  crc32: 0xDEADBEEF,
}`
  }
});

const Uint64FieldSchema = z.object({
  name: z.string().meta({
    description: "Field name"
  }),
  type: z.literal("uint64").meta({
    description: "Field type (always 'uint64')"
  }),
  endianness: EndiannessSchema.optional().meta({
    description: "Byte order for multi-byte values (big_endian or little_endian). Overrides global config if specified."
  }),
  computed: ComputedFieldSchema.optional().meta({
    description: "Marks this field as automatically computed (e.g., length_of, crc32_of)"
  }),
  description: z.string().optional().meta({
    description: "Human-readable description of this field"
  }),
}).meta({
  title: "64-bit Unsigned Integer",
  description: "Fixed-width 64-bit unsigned integer (0-18446744073709551615). Respects endianness configuration.",
  use_for: "High-precision timestamps, very large counters, database IDs, file offsets",
  wire_format: "8 bytes, byte order depends on endianness setting",
  code_generation: {
    typescript: {
      type: "bigint",
      notes: [
        "JavaScript BigInt type (not Number!)",
        "Number can only safely represent up to 2^53-1",
        "Literal syntax: 123n"
      ]
    },
    go: {
      type: "uint64",
      notes: ["Native Go uint64 type"]
    },
    rust: {
      type: "u64",
      notes: ["Native Rust u64 type"]
    }
  },
  notes: [
    "Use for millisecond/microsecond timestamps",
    "Exceeds JavaScript Number's safe integer range"
  ],
  examples: [
    { name: "user_id", type: "uint64" },
    { name: "timestamp_ms", type: "uint64", endianness: "big_endian", description: "Milliseconds since epoch" },
    { name: "byte_offset", type: "uint64" }
  ],
  examples_values: {
    typescript: `{
  user_id: 123456789012345n,  // BigInt literal!
  timestamp_ms: 1704067200000n,
  byte_offset: 0n
}`,
    go: `Message{
  UserId:      123456789012345,
  TimestampMs: 1704067200000,
  ByteOffset:  0,
}`,
    rust: `Message {
  user_id: 123456789012345,
  timestamp_ms: 1704067200000,
  byte_offset: 0,
}`
  }
});

/**
 * Fixed-width signed integers
 */
const Int8FieldSchema = z.object({
  name: z.string().meta({
    description: "Field name"
  }),
  type: z.literal("int8").meta({
    description: "Field type (always 'int8')"
  }),
  computed: ComputedFieldSchema.optional().meta({
    description: "Marks this field as automatically computed (e.g., length_of, crc32_of)"
  }),
  description: z.string().optional().meta({
    description: "Human-readable description of this field"
  }),
}).meta({
  title: "8-bit Signed Integer",
  description: "Fixed-width 8-bit signed integer (-128 to 127). Single byte, no endianness concerns.",
  use_for: "Small signed values, temperature readings, coordinate offsets",
  wire_format: "1 byte, two's complement encoding",
  code_generation: {
    typescript: {
      type: "number",
      notes: ["JavaScript Number type", "Safe for all int8 values"]
    },
    go: {
      type: "int8",
      notes: ["Native Go int8 type"]
    },
    rust: {
      type: "i8",
      notes: ["Native Rust i8 type"]
    }
  },
  examples: [
    { name: "temperature", type: "int8", description: "Temperature in Celsius" },
    { name: "offset", type: "int8" }
  ]
});

const Int16FieldSchema = z.object({
  name: z.string().meta({
    description: "Field name"
  }),
  type: z.literal("int16").meta({
    description: "Field type (always 'int16')"
  }),
  endianness: EndiannessSchema.optional().meta({
    description: "Byte order for multi-byte values (big_endian or little_endian). Overrides global config if specified."
  }),
  computed: ComputedFieldSchema.optional().meta({
    description: "Marks this field as automatically computed (e.g., length_of, crc32_of)"
  }),
  description: z.string().optional().meta({
    description: "Human-readable description of this field"
  }),
}).meta({
  title: "16-bit Signed Integer",
  description: "Fixed-width 16-bit signed integer (-32768 to 32767). Respects endianness configuration.",
  use_for: "Signed coordinates, altitude values, timezone offsets",
  wire_format: "2 bytes, two's complement encoding, byte order depends on endianness",
  code_generation: {
    typescript: {
      type: "number",
      notes: ["JavaScript Number type", "Safe for all int16 values"]
    },
    go: {
      type: "int16",
      notes: ["Native Go int16 type"]
    },
    rust: {
      type: "i16",
      notes: ["Native Rust i16 type"]
    }
  },
  examples: [
    { name: "altitude", type: "int16", endianness: "big_endian" },
    { name: "x_coord", type: "int16" }
  ]
});

const Int32FieldSchema = z.object({
  name: z.string().meta({
    description: "Field name"
  }),
  type: z.literal("int32").meta({
    description: "Field type (always 'int32')"
  }),
  endianness: EndiannessSchema.optional().meta({
    description: "Byte order for multi-byte values (big_endian or little_endian). Overrides global config if specified."
  }),
  computed: ComputedFieldSchema.optional().meta({
    description: "Marks this field as automatically computed (e.g., length_of, crc32_of)"
  }),
  description: z.string().optional().meta({
    description: "Human-readable description of this field"
  }),
}).meta({
  title: "32-bit Signed Integer",
  description: "Fixed-width 32-bit signed integer (-2147483648 to 2147483647). Respects endianness configuration.",
  use_for: "Large signed values, geographic coordinates, time differences",
  wire_format: "4 bytes, two's complement encoding, byte order depends on endianness",
  code_generation: {
    typescript: {
      type: "number",
      notes: ["JavaScript Number type", "Safe for all int32 values"]
    },
    go: {
      type: "int32",
      notes: ["Native Go int32 type", "Also known as rune"]
    },
    rust: {
      type: "i32",
      notes: ["Native Rust i32 type"]
    }
  },
  examples: [
    { name: "latitude", type: "int32", endianness: "big_endian" },
    { name: "time_delta", type: "int32" }
  ]
});

const Int64FieldSchema = z.object({
  name: z.string().meta({
    description: "Field name"
  }),
  type: z.literal("int64").meta({
    description: "Field type (always 'int64')"
  }),
  endianness: EndiannessSchema.optional().meta({
    description: "Byte order for multi-byte values (big_endian or little_endian). Overrides global config if specified."
  }),
  computed: ComputedFieldSchema.optional().meta({
    description: "Marks this field as automatically computed (e.g., length_of, crc32_of)"
  }),
  description: z.string().optional().meta({
    description: "Human-readable description of this field"
  }),
}).meta({
  title: "64-bit Signed Integer",
  description: "Fixed-width 64-bit signed integer (-9223372036854775808 to 9223372036854775807). Respects endianness configuration.",
  use_for: "High-precision signed timestamps, large signed offsets, financial calculations",
  wire_format: "8 bytes, two's complement encoding, byte order depends on endianness",
  code_generation: {
    typescript: {
      type: "bigint",
      notes: [
        "JavaScript BigInt type (not Number!)",
        "Number can only safely represent -(2^53-1) to (2^53-1)",
        "Literal syntax: -123n"
      ]
    },
    go: {
      type: "int64",
      notes: ["Native Go int64 type"]
    },
    rust: {
      type: "i64",
      notes: ["Native Rust i64 type"]
    }
  },
  notes: [
    "Exceeds JavaScript Number's safe integer range"
  ],
  examples: [
    { name: "account_balance", type: "int64", description: "Balance in cents" },
    { name: "time_offset_us", type: "int64", description: "Microsecond offset" }
  ]
});

/**
 * Floating point types
 */
const Float32FieldSchema = z.object({
  name: z.string().meta({
    description: "Field name"
  }),
  type: z.literal("float32").meta({
    description: "Field type (always 'float32')"  
  }),
  endianness: EndiannessSchema.optional().meta({
    description: "Byte order for multi-byte values (big_endian or little_endian). Overrides global config if specified."
  }),
  description: z.string().optional().meta({
    description: "Human-readable description of this field"
  }),
}).meta({
  title: "32-bit Floating Point",
  description: "IEEE 754 single-precision floating point (32-bit). Provides ~7 decimal digits of precision.",
  use_for: "Measurements, sensor data, graphics coordinates, scientific values",
  wire_format: "4 bytes, IEEE 754 format, byte order depends on endianness",
  code_generation: {
    typescript: {
      type: "number",
      notes: [
        "JavaScript Number type",
        "Stored internally as float64, but represents float32 wire value"
      ]
    },
    go: {
      type: "float32",
      notes: ["Native Go float32 type"]
    },
    rust: {
      type: "f32",
      notes: ["Native Rust f32 type"]
    }
  },
  notes: [
    "Range: ±1.4E-45 to ±3.4E38",
    "Special values: NaN, +Infinity, -Infinity, -0",
    "Not all decimal values can be represented exactly"
  ],
  examples: [
    { name: "temperature", type: "float32", endianness: "big_endian" },
    { name: "sensor_value", type: "float32" }
  ]
});

const Float64FieldSchema = z.object({
  name: z.string().meta({
    description: "Field name"
  }),
  type: z.literal("float64").meta({
    description: "Field type (always 'float64')"  
  }),
  endianness: EndiannessSchema.optional().meta({
    description: "Byte order for multi-byte values (big_endian or little_endian). Overrides global config if specified."
  }),
  description: z.string().optional().meta({
    description: "Human-readable description of this field"
  }),
}).meta({
  title: "64-bit Floating Point",
  description: "IEEE 754 double-precision floating point (64-bit). Provides ~15 decimal digits of precision.",
  use_for: "High-precision measurements, geographic coordinates, scientific calculations",
  wire_format: "8 bytes, IEEE 754 format, byte order depends on endianness",
  code_generation: {
    typescript: {
      type: "number",
      notes: [
        "JavaScript Number type (native representation)",
        "This is the default numeric type in JavaScript"
      ]
    },
    go: {
      type: "float64",
      notes: ["Native Go float64 type"]
    },
    rust: {
      type: "f64",
      notes: ["Native Rust f64 type"]
    }
  },
  notes: [
    "Range: ±5.0E-324 to ±1.7E308",
    "Special values: NaN, +Infinity, -Infinity, -0"
  ],
  examples: [
    { name: "latitude", type: "float64", endianness: "big_endian" },
    { name: "precise_measurement", type: "float64" }
  ]
});

/**
 * Array kinds
 */
const ArrayKindSchema = z.enum([
  "fixed",           // Fixed size array
  "length_prefixed", // Length prefix, then elements
  "length_prefixed_items", // Length prefix, then per-item length prefix + elements
  "null_terminated", // Elements until null/zero terminator
  "signature_terminated", // Elements until specific multi-byte signature value
  "eof_terminated",  // Elements until end of stream
  "field_referenced", // Length comes from a field decoded earlier
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
  type: z.literal("bit").meta({
    description: "Field type (always 'bit')"  
  }),
  size: z.number().int().min(1).max(64),
  description: z.string().optional().meta({
    description: "Human-readable description of this field"
  }),
});

const SignedIntElementSchema = z.object({
  type: z.literal("int").meta({
    description: "Field type (always 'int')"  
  }),
  size: z.number().int().min(1).max(64),
  signed: z.literal(true),
  description: z.string().optional().meta({
    description: "Human-readable description of this field"
  }),
});

const Uint8ElementSchema = z.object({
  type: z.literal("uint8").meta({
    description: "Field type (always 'uint8')"
  }),
  description: z.string().optional().meta({
    description: "Human-readable description of this field"
  }),
});

const Uint16ElementSchema = z.object({
  type: z.literal("uint16").meta({
    description: "Field type (always 'uint16')"  
  }),
  endianness: EndiannessSchema.optional().meta({
    description: "Byte order for multi-byte values (big_endian or little_endian). Overrides global config if specified."
  }),
  description: z.string().optional().meta({
    description: "Human-readable description of this field"
  }),
});

const Uint32ElementSchema = z.object({
  type: z.literal("uint32").meta({
    description: "Field type (always 'uint32')"  
  }),
  endianness: EndiannessSchema.optional().meta({
    description: "Byte order for multi-byte values (big_endian or little_endian). Overrides global config if specified."
  }),
  description: z.string().optional().meta({
    description: "Human-readable description of this field"
  }),
});

const Uint64ElementSchema = z.object({
  type: z.literal("uint64").meta({
    description: "Field type (always 'uint64')"  
  }),
  endianness: EndiannessSchema.optional().meta({
    description: "Byte order for multi-byte values (big_endian or little_endian). Overrides global config if specified."
  }),
  description: z.string().optional().meta({
    description: "Human-readable description of this field"
  }),
});

const Int8ElementSchema = z.object({
  type: z.literal("int8").meta({
    description: "Field type (always 'int8')"
  }),
  description: z.string().optional().meta({
    description: "Human-readable description of this field"
  }),
});

const Int16ElementSchema = z.object({
  type: z.literal("int16").meta({
    description: "Field type (always 'int16')"  
  }),
  endianness: EndiannessSchema.optional().meta({
    description: "Byte order for multi-byte values (big_endian or little_endian). Overrides global config if specified."
  }),
  description: z.string().optional().meta({
    description: "Human-readable description of this field"
  }),
});

const Int32ElementSchema = z.object({
  type: z.literal("int32").meta({
    description: "Field type (always 'int32')"  
  }),
  endianness: EndiannessSchema.optional().meta({
    description: "Byte order for multi-byte values (big_endian or little_endian). Overrides global config if specified."
  }),
  description: z.string().optional().meta({
    description: "Human-readable description of this field"
  }),
});

const Int64ElementSchema = z.object({
  type: z.literal("int64").meta({
    description: "Field type (always 'int64')"  
  }),
  endianness: EndiannessSchema.optional().meta({
    description: "Byte order for multi-byte values (big_endian or little_endian). Overrides global config if specified."
  }),
  description: z.string().optional().meta({
    description: "Human-readable description of this field"
  }),
});

const Float32ElementSchema = z.object({
  type: z.literal("float32").meta({
    description: "Field type (always 'float32')"  
  }),
  endianness: EndiannessSchema.optional().meta({
    description: "Byte order for multi-byte values (big_endian or little_endian). Overrides global config if specified."
  }),
  description: z.string().optional().meta({
    description: "Human-readable description of this field"
  }),
});

const Float64ElementSchema = z.object({
  type: z.literal("float64").meta({
    description: "Field type (always 'float64')"  
  }),
  endianness: EndiannessSchema.optional().meta({
    description: "Byte order for multi-byte values (big_endian or little_endian). Overrides global config if specified."
  }),
  description: z.string().optional().meta({
    description: "Human-readable description of this field"
  }),
});

/**
 * Optional element schema (optional without name - for array items)
 */
const OptionalElementSchema = z.object({
  type: z.literal("optional").meta({
    description: "Field type (always 'optional')"  
  }),
  value_type: z.string(), // The wrapped type (can be primitive or type reference)
  presence_type: z.enum(["uint8", "bit"]).optional().default("uint8"), // Type of presence indicator (uint8 = 1 byte, bit = 1 bit)
  description: z.string().optional().meta({
    description: "Human-readable description of this field"
  }),
});

/**
 * Optional field schema (optional with name - for struct fields)
 */
const OptionalFieldSchema = z.object({
  name: z.string().meta({
    description: "Field name"
  }),
  type: z.literal("optional").meta({
    description: "Field type (always 'optional')"  
  }),
  value_type: z.string(), // The wrapped type (can be primitive or type reference)
  presence_type: z.enum(["uint8", "bit"]).optional().default("uint8"), // Type of presence indicator (uint8 = 1 byte, bit = 1 bit)
  description: z.string().optional().meta({
    description: "Human-readable description of this field"
  }),
}).meta({
  title: "Optional",
  description: "Field that may or may not be present. Uses a presence indicator (byte or bit) followed by the value if present.",
  use_for: "Optional data fields, nullable values, feature flags with associated data",
  wire_format: "Presence indicator (1 byte or 1 bit) + value (if present=1)",
  
  code_generation: {
    typescript: {
      type: "T | undefined",
      notes: ["TypeScript union with undefined", "Clean optional types", "Type T depends on value_type field"]
    },
    go: {
      type: "*T",
      notes: ["Go pointer type (nil for absent)", "Type T depends on value_type field"]
    },
    rust: {
      type: "Option<T>",
      notes: ["Rust Option enum", "Type T depends on value_type field"]
    }
  },
  notes: [
    "presence_type=uint8 uses 1 full byte (0=absent, 1=present)",
    "presence_type=bit uses 1 bit (more compact for multiple optional fields)",
    "Value is only encoded/decoded if presence indicator is 1"
  ],
  examples: [
    { name: "user_id", type: "optional", value_type: "uint64" },
    { name: "nickname", type: "optional", value_type: "String", presence_type: "uint8" },
    { name: "flags", type: "optional", value_type: "uint8", presence_type: "bit" }
  ]
});

/**
 * Type reference without name (for array items)
 */
const TypeRefElementSchema = z.object({
  type: z.string(),
  description: z.string().optional().meta({
    description: "Human-readable description of this field"
  }),
});

/**
 * Discriminated union variant (define before use)
 */
const DiscriminatedUnionVariantSchema = z.object({
  when: z.string().optional(), // Condition expression (e.g., "value >= 0xC0"), optional for fallback
  type: z.string(), // Type name to parse if condition matches
  description: z.string().optional().meta({
    description: "Human-readable description of this field"
  }),
});

/**
 * Discriminator - either peek-based or field-based (mutually exclusive)
 */
const DiscriminatorSchema = z.union([
  // Peek-based: Read discriminator value at current position without consuming
  z.object({
    peek: z.enum(["uint8", "uint16", "uint32"]).meta({
      description: "Type of integer to peek (read without consuming bytes)"
    }),
    endianness: EndiannessSchema.optional().meta({
      description: "Byte order for uint16/uint32 (required for multi-byte types)"
    }),
  }),
  // Field-based: Reference an earlier field's value
  z.object({
    field: z.string().meta({
      description: "Name of earlier field to use as discriminator (supports dot notation like 'flags.type')"
    }),
  }),
]);

/**
 * Discriminated union element (without name - for type aliases)
 */
const DiscriminatedUnionElementSchema = z.object({
  type: z.literal("discriminated_union").meta({
    description: "Field type (always 'discriminated_union')"  
  }),
  discriminator: DiscriminatorSchema,
  variants: z.array(DiscriminatedUnionVariantSchema).min(1),
  description: z.string().optional().meta({
    description: "Human-readable description of this field"
  }),
});

/**
 * Back reference element (without name - for type aliases)
 * Used for compression via backwards references (like DNS name compression)
 */
const BackReferenceElementSchema = z.object({
  type: z.literal("back_reference").meta({
    description: "Type identifier (always 'back_reference')"
  }),
  storage: z.enum(["uint8", "uint16", "uint32"]).meta({
    description: "Integer type used to store the offset on the wire (uint8 = 1 byte, uint16 = 2 bytes, uint32 = 4 bytes)"
  }),
  offset_mask: z.string().regex(/^0x[0-9A-Fa-f]+$/, "Must be a valid hex mask (e.g., '0x3FFF')").meta({
    description: "Hex bitmask to extract offset bits from the storage integer (e.g., '0x3FFF' extracts lower 14 bits). Allows packing flags or type tags in unused bits."
  }),
  target_type: z.string().meta({
    description: "Name of the type to parse at the referenced offset location. When decoder jumps to the offset, it will decode this type."
  }),
  endianness: EndiannessSchema.optional().meta({
    description: "Byte order for multi-byte storage types (required for uint16/uint32, meaningless for uint8)"
  }),
  description: z.string().optional().meta({
    description: "Human-readable description of this back reference field"
  }),
});

/**
 * Back reference field (with name - for struct fields)
 * Extends the element schema with a name field
 */
const BackReferenceFieldSchema = BackReferenceElementSchema.extend({
  name: z.string().meta({
    description: "Field name"
  }),
}).meta({
  title: "Back Reference",
  description: "Backward reference to data at an earlier position in the message. Used for compression via backwards references (like DNS name compression). Offset is always from message start.",
  use_for: "Message compression, duplicate data elimination, backwards references, deduplication",
  wire_format: "Storage integer with offset bits (extracted via mask). Offset points backwards to earlier data in message (measured from message start).",

  code_generation: {
    typescript: {
      type: "T (resolved value)",
      notes: ["TypeScript uses resolved value, not pointer", "Encoder handles deduplication", "Type T depends on target_type field"]
    },
    go: {
      type: "T (resolved value)",
      notes: ["Go uses resolved value, not pointer", "Encoder handles deduplication", "Type T depends on target_type field"]
    },
    rust: {
      type: "T (resolved value)",
      notes: ["Rust uses resolved value, not pointer", "Encoder handles deduplication", "Type T depends on target_type field"]
    }
  },
  notes: [
    "offset_mask extracts offset bits (allows packing flags in unused bits)",
    "Offset is always measured from message start (backwards only)",
    "Cannot reference data that comes later (no forward references)",
    "Common in DNS (name compression) and other protocols with repeated data"
  ],
  examples: [
    {
      name: "domain_name_ref",
      type: "back_reference",
      storage: "uint16",
      offset_mask: "0x3FFF",
      target_type: "DomainName",
      endianness: "big_endian",
      description: "Compressed domain name (DNS-style)"
    }
  ]
});

/**
 * Array element schema (array without name - for nested arrays)
 */
const ArrayElementSchema = z.object({
  type: z.literal("array").meta({
    description: "Field type (always 'array')"
  }),
  kind: ArrayKindSchema,
  get items() {
    return ElementTypeSchema; // Recursive reference
  },
  length: z.number().int().min(1).optional(),
  length_type: z.enum(["uint8", "uint16", "uint32", "uint64"]).optional(),
  item_length_type: z.enum(["uint8", "uint16", "uint32", "uint64"]).optional(), // For length_prefixed_items: per-item length prefix type
  length_field: z.string().optional(), // For field_referenced: field name to read length from (supports dot notation)
  terminator_value: z.number().optional(), // For signature_terminated: signature value to stop on
  terminator_type: z.enum(["uint8", "uint16", "uint32", "uint64"]).optional(), // For signature_terminated: type to peek for terminator
  terminator_endianness: EndiannessSchema.optional(), // For signature_terminated: endianness of terminator (required for uint16/uint32/uint64)
  variants: z.array(z.string()).optional(), // Optional: possible type names this could contain
  notes: z.array(z.string()).optional(), // Optional: notes about variants or usage
  terminal_variants: z.array(z.string()).optional(), // Optional: variant types that terminate the array (no null terminator after)
  description: z.string().optional().meta({
    description: "Human-readable description of this field"
  }),
}).refine(
  (data) => {
    if (data.kind === "fixed") return data.length !== undefined;
    if (data.kind === "length_prefixed") return data.length_type !== undefined;
    if (data.kind === "length_prefixed_items") return data.length_type !== undefined && data.item_length_type !== undefined;
    if (data.kind === "field_referenced") return data.length_field !== undefined;
    if (data.kind === "signature_terminated") return data.terminator_value !== undefined && data.terminator_type !== undefined;
    return true;
  },
  {
    message: "Fixed arrays require 'length', length_prefixed arrays require 'length_type', length_prefixed_items arrays require 'length_type' and 'item_length_type', field_referenced arrays require 'length_field', signature_terminated arrays require 'terminator_value' and 'terminator_type'",
  }
);

/**
 * String element schema (string without name - for array items)
 */
const StringElementSchema = z.object({
  type: z.literal("string").meta({
    description: "Field type (always 'string')"  
  }),
  kind: ArrayKindSchema,
  encoding: StringEncodingSchema.optional().default("utf8"),
  length: z.number().int().min(1).optional(), // For fixed length
  length_type: z.enum(["uint8", "uint16", "uint32", "uint64"]).optional(), // For length_prefixed
  description: z.string().optional().meta({
    description: "Human-readable description of this field"
  }),
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
    OptionalElementSchema, // Support optional elements
    ArrayElementSchema, // Support nested arrays
    StringElementSchema, // Support strings
    DiscriminatedUnionElementSchema, // Support discriminated unions
    BackReferenceElementSchema, // Support back references
  ]),
  // Type reference for user-defined types
  TypeRefElementSchema,
]);

/**
 * Array field (variable or fixed length)
 * Note: Uses getter for recursive 'items' reference (Zod 4 pattern)
 */
const ArrayFieldSchema = z.object({
  name: z.string().meta({
    description: "Field name"
  }),
  type: z.literal("array").meta({
    description: "Field type (always 'array')"
  }),
  kind: ArrayKindSchema,
  get items() {
    return ElementTypeSchema; // Recursive: array of element types (no name required)
  },
  length: z.number().int().min(1).optional(), // For fixed arrays
  length_type: z.enum(["uint8", "uint16", "uint32", "uint64"]).optional(), // For length_prefixed
  item_length_type: z.enum(["uint8", "uint16", "uint32", "uint64"]).optional(), // For length_prefixed_items: per-item length prefix type
  length_field: z.string().optional(), // For field_referenced: field name to read length from (supports dot notation like "flags.opcode")
  terminator_value: z.number().optional(), // For signature_terminated: signature value to stop on
  terminator_type: z.enum(["uint8", "uint16", "uint32", "uint64"]).optional(), // For signature_terminated: type to peek for terminator
  terminator_endianness: EndiannessSchema.optional(), // For signature_terminated: endianness of terminator (required for uint16/uint32/uint64)
  variants: z.array(z.string()).optional(), // Optional: possible type names this could contain
  notes: z.array(z.string()).optional(), // Optional: notes about variants or usage
  terminal_variants: z.array(z.string()).optional(), // Optional: variant types that terminate the array (no null terminator after)
  description: z.string().optional().meta({
    description: "Human-readable description of this field"
  }),
}).refine(
  (data) => {
    if (data.kind === "fixed") return data.length !== undefined;
    if (data.kind === "length_prefixed") return data.length_type !== undefined;
    if (data.kind === "length_prefixed_items") return data.length_type !== undefined && data.item_length_type !== undefined;
    if (data.kind === "field_referenced") return data.length_field !== undefined;
    if (data.kind === "signature_terminated") return data.terminator_value !== undefined && data.terminator_type !== undefined;
    return true;
  },
  {
    message: "Fixed arrays require 'length', length_prefixed arrays require 'length_type', length_prefixed_items arrays require 'length_type' and 'item_length_type', field_referenced arrays require 'length_field', signature_terminated arrays require 'terminator_value' and 'terminator_type'",
  }
).meta({
  title: "Array",
  description: "Collection of elements of the same type. Supports fixed-length, length-prefixed, field-referenced, and null-terminated arrays.",
  use_for: "Lists of items, message batches, repeated structures, variable-length data",
  wire_format: "Depends on kind: fixed (N items), length_prefixed (count + items), length_prefixed_items (count + per-item lengths + items), null_terminated (items + terminator), field_referenced (length from earlier field)",
  
  code_generation: {
    typescript: {
      type: "Array<T>",
      notes: ["JavaScript array", "Elements type T depends on items field"]
    },
    go: {
      type: "[]T",
      notes: ["Go slice", "Elements type T depends on items field"]
    },
    rust: {
      type: "Vec<T>",
      notes: ["Rust vector (heap-allocated)", "Elements type T depends on items field"]
    }
  },
  notes: [
    "length_prefixed is most common for variable-length arrays",
    "field_referenced allows dynamic sizing based on earlier fields",
    "null_terminated useful for variable-length lists with terminator value",
    "length_prefixed_items used when each item has individual length prefix (e.g., array of strings)"
  ],
  examples: [
    { name: "values", type: "array", kind: "fixed", items: { type: "uint32" }, length: 4 },
    { name: "items", type: "array", kind: "length_prefixed", items: { type: "uint64" }, length_type: "uint16" },
    { name: "data", type: "array", kind: "field_referenced", items: { type: "uint8" }, length_field: "data_length" }
  ]
});

/**
 * String field (variable or fixed length)
 */
const StringFieldSchema = z.object({
  name: z.string().meta({
    description: "Field name"
  }),
  type: z.literal("string").meta({
    description: "Field type (always 'string')"
  }),
  kind: ArrayKindSchema,
  encoding: StringEncodingSchema.optional().default("utf8"),
  length: z.number().int().min(1).optional(), // For fixed length
  length_type: z.enum(["uint8", "uint16", "uint32", "uint64"]).optional(), // For length_prefixed
  length_field: z.string().optional(), // For field_referenced: field name to read length from
  description: z.string().optional().meta({
    description: "Human-readable description of this field"
  }),
}).refine(
  (data) => {
    if (data.kind === "fixed") return data.length !== undefined || data.length_field !== undefined;
    if (data.kind === "length_prefixed") return data.length_type !== undefined;
    if (data.kind === "field_referenced") return data.length_field !== undefined;
    return true;
  },
  {
    message: "Fixed strings require 'length' or 'length_field', length_prefixed strings require 'length_type', field_referenced strings require 'length_field'",
  }
).meta({
  title: "String",
  description: "Variable or fixed-length text field with UTF-8 or ASCII encoding. Can be length-prefixed, fixed-length, or null-terminated.",
  use_for: "Usernames, messages, labels, text data, identifiers",
  wire_format: "Depends on kind: length-prefixed (length prefix + bytes), fixed (N bytes), or null-terminated (bytes + 0x00)",
  
  code_generation: {
    typescript: {
      type: "string",
      notes: ["JavaScript string type", "Automatically handles UTF-8 encoding"]
    },
    go: {
      type: "string",
      notes: ["Native Go string type", "UTF-8 by default"]
    },
    rust: {
      type: "String",
      notes: ["Rust String type (heap-allocated)", "Always UTF-8"]
    }
  },
  notes: [
    "Length-prefixed is most common for variable-length strings",
    "Fixed-length strings are padded/truncated to exact size",
    "Null-terminated strings read until 0x00 byte"
  ],
  examples: [
    { name: "nickname", type: "string", kind: "length_prefixed", length_type: "uint8" },
    { name: "username", type: "string", kind: "length_prefixed", length_type: "uint16", encoding: "utf8" },
    { name: "code", type: "string", kind: "fixed", length: 8, encoding: "ascii" }
  ]
});

/**
 * Discriminated union field
 * Choose type variant based on discriminator value (peek or field-based)
 */
const DiscriminatedUnionFieldSchema = z.object({
  name: z.string().meta({
    description: "Field name"
  }),
  type: z.literal("discriminated_union").meta({
    description: "Field type (always 'discriminated_union')"  
  }),
  discriminator: DiscriminatorSchema,
  variants: z.array(DiscriminatedUnionVariantSchema).min(1),
  description: z.string().optional().meta({
    description: "Human-readable description of this field"
  }),
}).meta({
  title: "Discriminated Union",
  description: "Type that can be one of several variants, chosen based on a discriminator value. Supports peek-based (read ahead) or field-based (reference earlier field) discrimination.",
  use_for: "Protocol messages, polymorphic data, variant types, message envelopes",
  wire_format: "Discriminator determines which variant type to parse. No additional type tag on wire (discriminator serves this purpose).",
  
  code_generation: {
    typescript: {
      type: "V1 | V2 | ...",
      notes: ["TypeScript union of variant types", "Requires type guards for access", "Variant types depend on variants array"]
    },
    go: {
      type: "interface{} (with type assertion)",
      notes: ["Go interface with concrete variant types", "Type assertion required for access", "Variant types depend on variants array"]
    },
    rust: {
      type: "enum { V1(...), V2(...), ... }",
      notes: ["Rust enum with named variants", "Pattern matching for access", "Variant types depend on variants array"]
    }
  },
  notes: [
    "Peek-based: Reads discriminator without consuming bytes (useful for tag-first protocols)",
    "Field-based: Uses value from earlier field (useful for header-based protocols)",
    "Each variant has a 'when' condition (e.g., 'value == 0x01') that determines if it matches"
  ],
  examples: [
    {
      name: "message",
      type: "discriminated_union",
      discriminator: { peek: "uint8" },
      variants: [
        { when: "value == 0x01", type: "QueryMessage" },
        { when: "value == 0x02", type: "ResponseMessage" }
      ]
    }
  ]
});

/**
 * Bitfield container (pack multiple bit-level fields)
 */
const BitfieldFieldSchema = z.object({
  name: z.string().meta({
    description: "Field name"
  }),
  type: z.literal("bitfield").meta({
    description: "Field type (always 'bitfield')"  
  }),
  size: z.number().int().min(1), // Total bits
  bit_order: BitOrderSchema.optional(), // Override global
  fields: z.array(z.object({
    name: z.string().meta({
      description: "Field name"
    }),
    offset: z.number().int().min(0), // Bit offset within bitfield
    size: z.number().int().min(1),   // Bits used
    description: z.string().optional().meta({
      description: "Human-readable description of this field"
    }),
  })),
  description: z.string().optional().meta({
    description: "Human-readable description of this field"
  }),
}).meta({
  title: "Bitfield",
  description: "Container for packing multiple bit-level fields into a compact byte-aligned structure. Allows precise bit-level control.",
  use_for: "Flags, compact headers, protocol opcodes, bit-packed data",
  wire_format: "Packed bits stored in bytes (size determines total bytes). Bit order (MSB/LSB first) determined by config.",
  
  code_generation: {
    typescript: {
      type: "object with number fields",
      notes: ["TypeScript object with numeric properties", "Each field is a number", "Bit manipulation handled by encoder/decoder"]
    },
    go: {
      type: "struct with uintN fields",
      notes: ["Go struct with appropriate uint types", "Bit manipulation handled by encoder/decoder"]
    },
    rust: {
      type: "struct with uN fields",
      notes: ["Rust struct with appropriate uint types", "Bit manipulation handled by encoder/decoder"]
    }
  },
  notes: [
    "Size must be multiple of 8 for byte alignment",
    "Field offsets specify bit position within the bitfield",
    "Bit order (MSB first vs LSB first) affects how bits are numbered"
  ],
  examples: [
    {
      name: "flags",
      type: "bitfield",
      size: 8,
      
    }
  ]
});

/**
 * Reference to another type (for composition)
 * Note: This MUST be last in the FieldTypeRefSchema union to avoid matching built-in types
 */
const TypeRefFieldSchema = z.object({
  name: z.string().meta({
    description: "Field name"
  }),
  type: z.string(), // Name of another type or generic like "Optional<uint64>"
  description: z.string().optional().meta({
    description: "Human-readable description of this field"
  }),
});

/**
 * Conditional field (only present if condition is true)
 */
const ConditionalFieldSchema = z.object({
  name: z.string().meta({
    description: "Field name"
  }),
  type: z.string(),
  conditional: z.string(), // Expression like "flags.present == 1"
  description: z.string().optional().meta({
    description: "Human-readable description of this field"
  }),
}).meta({
  title: "Conditional Field",
  description: "Field that is only present on the wire if a condition evaluates to true. Condition references earlier fields.",
  use_for: "Protocol extensions, optional sections, feature-flagged data",
  wire_format: "Field is only encoded/decoded if condition is true. No presence indicator on wire.",
  
  code_generation: {
    typescript: {
      type: "T | undefined",
      notes: ["TypeScript union with undefined", "Undefined if condition false", "Type T depends on type field"]
    },
    go: {
      type: "*T or separate bool",
      notes: ["Go pointer (nil if absent) or separate present flag", "Type T depends on type field"]
    },
    rust: {
      type: "Option<T>",
      notes: ["Rust Option enum", "None if condition false", "Type T depends on type field"]
    }
  },
  notes: [
    "Condition is evaluated during encoding/decoding",
    "Supports dot notation for nested field access (e.g., 'header.flags.extended')",
    "Unlike optional type, no presence indicator is stored on wire"
  ],
  examples: [
    {
      name: "extended_data",
      type: "uint32",
      conditional: "flags.has_extended == 1"
    },
    {
      name: "metadata",
      type: "Metadata",
      conditional: "version >= 2"
    }
  ]
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
    OptionalFieldSchema,
    ArrayFieldSchema,
    StringFieldSchema,
    BitfieldFieldSchema,
    DiscriminatedUnionFieldSchema,
    BackReferenceFieldSchema,
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
 * Position field (lazy-evaluated, accessed via getter)
 * Used for random-access/seekable parsing (ZIP, ELF, databases, etc.)
 */
const PositionFieldSchema = z.object({
  name: z.string().meta({
    description: "Field name"
  }),
  type: z.string(), // Type to decode at position
  position: z.union([
    z.number(),  // Absolute offset (positive) or offset from EOF (negative)
    z.string()   // Field reference (e.g., "header.offset")
  ]).meta({
    description: "Position to seek to before decoding. Number (positive=absolute offset, negative=from EOF), or field reference (e.g., 'header.data_offset')"
  }),
  size: z.union([
    z.number(),  // Fixed size
    z.string()   // Field reference
  ]).optional().meta({
    description: "Optional size hint for the data at this position"
  }),
  alignment: z.number().int().positive().optional().meta({
    description: "Required alignment in bytes (must be power of 2). Position will be validated: position % alignment == 0"
  }),
  description: z.string().optional().meta({
    description: "Human-readable description of this field"
  }),
}).refine(
  (data) => {
    // If alignment is specified, verify it's a power of 2
    if (data.alignment !== undefined) {
      const isPowerOfTwo = (data.alignment & (data.alignment - 1)) === 0;
      return isPowerOfTwo;
    }
    return true;
  },
  {
    message: "Alignment must be a power of 2 (1, 2, 4, 8, 16, ...)"
  }
).meta({
  title: "Position Field (Instance)",
  description: "Lazy-evaluated field at an absolute or relative position in the file. Used for random-access formats like ZIP, ELF, databases. Only evaluated when accessed.",
  use_for: "ZIP central directory, ELF section headers, database indexes, table-of-contents structures",
  wire_format: "No bytes on wire for the field itself - position indicates where to seek and parse the target type",

  code_generation: {
    typescript: {
      type: "get accessor returning T",
      notes: [
        "TypeScript getter that parses on first access",
        "Cached after first read",
        "Type T depends on type field"
      ]
    },
    go: {
      type: "method returning (*T, error)",
      notes: [
        "Go method with sync.Once for thread-safe lazy init",
        "Cached after first call",
        "Type T depends on type field"
      ]
    }
  },
  notes: [
    "Position can be negative (from EOF): -22 means last 22 bytes",
    "Position can reference earlier field: 'header.offset'",
    "Alignment is validated at runtime: position % alignment == 0",
    "Size is optional hint for memory allocation"
  ],
  examples: [
    {
      name: "footer",
      type: "Footer",
      position: -22,
      size: 22,
      description: "Footer at end of file"
    },
    {
      name: "data",
      type: "DataBlock",
      position: "header.data_offset",
      alignment: 4,
      description: "Data block at offset from header"
    }
  ]
});

/**
 * Composite type with sequence of fields
 *
 * A composite type represents an ordered sequence of types on the wire.
 */
const CompositeTypeSchema = z.object({
  sequence: z.array(FieldSchema),
  instances: z.array(PositionFieldSchema).optional().meta({
    description: "Position-based fields (lazy-evaluated when accessed). Requires seekable input."
  }),
  description: z.string().optional(),
});

/**
 * Type definition - either composite or type alias
 *
 * A type can be:
 * 1. Composite type: Has a 'sequence' of named types that appear in order on the wire
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
// Protocol Definition (Optional - for protocol schemas with headers)
// ============================================================================

/**
 * Protocol message group (for documentation)
 */
const MessageGroupSchema = z.object({
  name: z.string(), // Group name (e.g., "Authentication", "Messaging")
  messages: z.array(z.union([z.string(), z.number()])).transform((values, ctx) => {
    const normalized: string[] = [];
    values.forEach((value, index) => {
      try {
        normalized.push(normalizeMessageCode(value as string | number));
      } catch (err) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: [index],
          message: err instanceof Error ? err.message : "Invalid message code value",
        });
      }
    });
    return normalized;
  }), // Message codes in this group (normalized to hex)
  description: z.string().optional().meta({
    description: "Human-readable description of this field"
  }),
});
export type MessageGroup = z.infer<typeof MessageGroupSchema>;

/**
 * Protocol constant definition
 */
const ProtocolConstantSchema = z.object({
  value: z.union([z.number(), z.string()]), // Constant value
  description: z.string(), // Description
  type: z.string().optional(), // Optional: Associated type
});
export type ProtocolConstant = z.infer<typeof ProtocolConstantSchema>;

/**
 * Protocol message definition
 */
const ProtocolMessageSchema = z.object({
  code: z.union([z.string(), z.number()]).transform((value, ctx) => {
    try {
      return normalizeMessageCode(value as string | number);
    } catch (err) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: err instanceof Error ? err.message : "Invalid message code value",
      });
      return z.NEVER;
    }
  }), // Message type code (normalized hex string, e.g., "0x00")
  name: z.string(), // Human-readable name (e.g., "Query", "Response")
  direction: z.enum(["client_to_server", "server_to_client", "bidirectional"]).optional(), // Message direction
  payload_type: z.string(), // Type name from schema.types
  description: z.string().optional(), // Short description
  notes: z.union([z.string(), z.array(z.string())]).optional(), // Longer notes about usage
  example: z.object({
    description: z.string(),
    bytes: z.array(z.number()),
    decoded: z.any().optional(), // The decoded value
  }).optional(), // Wire format example
  since: z.string().optional(), // Protocol version when added
  deprecated: z.string().optional(), // Protocol version when deprecated
});
export type ProtocolMessage = z.infer<typeof ProtocolMessageSchema>;

/**
 * Protocol definition (optional field for schemas representing protocols with headers)
 */
const ProtocolDefinitionSchema = z.object({
  name: z.string(), // Protocol name (e.g., "DNS", "SuperChat")
  version: z.string(), // Protocol version (e.g., "1.0", "2.1")
  description: z.string().optional(), // Overview/description
  header: z.string(), // Type name of the header (e.g., "DnsHeader")
  header_size_field: z.string().optional(), // Name of header field containing payload size
  header_example: z.object({
    decoded: z.any(), // Decoded header values
  }).optional(), // Example header values for docs
  discriminator: z.string(), // Field in header that determines message type (supports dot notation for bitfields)
  field_descriptions: z.record(z.string(), z.string()).optional(), // Type.field -> description
  messages: z.array(ProtocolMessageSchema).min(1),
  message_groups: z.array(MessageGroupSchema).optional(), // Group messages into categories
  constants: z.record(z.string(), ProtocolConstantSchema).optional(), // Protocol constants/enums
  notes: z.array(z.string()).optional(), // General protocol notes
});
export type ProtocolDefinition = z.infer<typeof ProtocolDefinitionSchema>;

// ============================================================================
// Complete Binary Schema
// ============================================================================

/**
 * Helper function to get variants from a discriminated union type
 */
function getDiscriminatedUnionVariants(typeDef: any): string[] {
  if (typeDef && typeDef.type === "discriminated_union" && typeDef.variants) {
    return typeDef.variants.map((v: any) => v.type);
  }
  return [];
}

/**
 * Helper function to validate terminal_variants references
 */
function validateTerminalVariants(schema: any): { valid: boolean; error?: string } {
  // Walk through all types and find arrays with terminal_variants
  for (const [typeName, typeDef] of Object.entries(schema.types)) {
    // Check if this is an array type (either top-level or nested in sequence)
    const checkArray = (arrayDef: any, path: string) => {
      if (!arrayDef || arrayDef.type !== "array" || !arrayDef.terminal_variants) {
        return { valid: true };
      }

      // terminal_variants only makes sense for null_terminated arrays
      if (arrayDef.kind !== "null_terminated") {
        return {
          valid: false,
          error: `${path}: terminal_variants can only be used with null_terminated arrays (current kind: ${arrayDef.kind})`
        };
      }

      // Get the items type
      const itemsType = arrayDef.items;
      if (!itemsType) {
        return {
          valid: false,
          error: `${path}: Array has terminal_variants but no items type defined`
        };
      }

      // If items is a type reference (string), resolve it
      let itemsTypeDef = itemsType;
      if (typeof itemsType === "string" || (itemsType.type && typeof itemsType.type === "string" && !["array", "discriminated_union", "back_reference"].includes(itemsType.type))) {
        const refTypeName = typeof itemsType === "string" ? itemsType : itemsType.type;
        itemsTypeDef = schema.types[refTypeName];
        if (!itemsTypeDef) {
          return {
            valid: false,
            error: `${path}: Array items type '${refTypeName}' not found in schema`
          };
        }
      }

      // Items must be a discriminated union to have variants
      if (itemsTypeDef.type !== "discriminated_union") {
        return {
          valid: false,
          error: `${path}: terminal_variants requires items to be a discriminated_union (current type: ${itemsTypeDef.type || "type reference"})`
        };
      }

      // Get available variant types
      const availableVariants = getDiscriminatedUnionVariants(itemsTypeDef);
      if (availableVariants.length === 0) {
        return {
          valid: false,
          error: `${path}: Items discriminated union has no variants defined`
        };
      }

      // Check each terminal_variant is actually a valid variant type
      for (const terminalVariant of arrayDef.terminal_variants) {
        if (!availableVariants.includes(terminalVariant)) {
          return {
            valid: false,
            error: `${path}: terminal_variant '${terminalVariant}' is not a valid variant of items type (available variants: ${availableVariants.join(", ")})`
          };
        }
      }

      return { valid: true };
    };

    // Check if typeDef is itself an array
    const result = checkArray(typeDef, `Type '${typeName}'`);
    if (!result.valid) {
      return result;
    }

    // Check sequence for array fields
    const fields = (typeDef as any).sequence;
    if (Array.isArray(fields)) {
      for (const field of fields) {
        if (field.type === "array") {
          const result = checkArray(field, `Type '${typeName}', field '${field.name}'`);
          if (!result.valid) {
            return result;
          }
        }
      }
    }
  }

  return { valid: true };
}

/**
 * Complete binary schema definition
 *
 * A schema can be either:
 * 1. Types-only schema: Just type definitions for standalone encoding/decoding
 * 2. Protocol schema: Type definitions + protocol header and message definitions
 *
 * The optional 'protocol' field determines the mode:
 * - Without 'protocol': Validate field references within each type only
 * - With 'protocol': Allow field references to header fields from payload types
 */
export const BinarySchemaSchema = z.object({
  config: ConfigSchema,
  types: z.record(z.string(), TypeDefSchema), // Map of type name → definition
  protocol: ProtocolDefinitionSchema.optional(), // Optional: protocol header and messages
}).refine(
  (schema) => {
    // Validate all user-defined type names start with uppercase letter
    for (const typeName of Object.keys(schema.types)) {
      if (!/^[A-Z]/.test(typeName)) {
        return false;
      }
    }
    return true;
  },
  {
    message: "User-defined types must start with an uppercase letter (e.g., 'String', 'MyType'). This prevents conflicts with built-in types like 'string', 'uint8', 'array', etc.",
  }
).refine(
  (schema) => {
    // Validate terminal_variants references
    const result = validateTerminalVariants(schema);
    return result.valid;
  },
  {
    message: "Invalid terminal_variants configuration (check terminal_variant references)"
  }
);
export type BinarySchema = z.infer<typeof BinarySchemaSchema>;

/**
 * Alias for BinarySchema - supports both types-only and protocol schemas
 */
export type Schema = BinarySchema;

/**
 * Helper function to define a schema with type checking
 */
export function defineBinarySchema(schema: BinarySchema): BinarySchema {
  return BinarySchemaSchema.parse(schema);
}
