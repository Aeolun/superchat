# zod-metadata-extractor

Extract and work with metadata from Zod v4 schemas. Perfect for generating documentation, building schema introspection tools, or creating code generators.

## Features

- ✅ Extract `.meta()` metadata from any Zod schema
- ✅ Walk union/discriminated union structures
- ✅ Extract field information from object schemas
- ✅ Merge schema-derived info (types, required) with metadata (descriptions)
- ✅ Handle nested optionals, literals, enums
- ✅ Fully typed with TypeScript
- ✅ Comprehensive test coverage (21 tests, 68 assertions)
- ✅ Zero dependencies (peer dep: zod ^4.0.0)

## Installation

```bash
npm install zod-metadata-extractor
# or
bun add zod-metadata-extractor
```

## Quick Start

```typescript
import { z } from "zod";
import { extractMetadata, extractFields, walkUnion } from "zod-metadata-extractor";

// Extract metadata from a simple schema
const UserSchema = z.object({
  id: z.number(),
  name: z.string(),
}).meta({
  title: "User",
  description: "A user entity",
  examples: [{ id: 1, name: "Alice" }],
});

const meta = extractMetadata(UserSchema);
console.log(meta?.title); // "User"

// Extract field information
const fields = extractFields(UserSchema);
console.log(fields);
// [
//   { name: "id", type: "number", required: true },
//   { name: "name", type: "string", required: true }
// ]

// Walk a discriminated union
const MessageSchema = z.union([
  z.object({ type: z.literal("text"), content: z.string() })
    .meta({ title: "Text Message" }),
  z.object({ type: z.literal("image"), url: z.string() })
    .meta({ title: "Image Message" }),
]);

const result = walkUnion(MessageSchema);
console.log(result.metadata.get("text")?.title); // "Text Message"
console.log(result.metadata.get("image")?.title); // "Image Message"
```

## API

### `extractMetadata(schema: ZodType)`

Extract metadata attached via `.meta()`.

```typescript
const schema = z.string().meta({
  title: "Username",
  description: "User's display name",
  custom_field: "any value",
});

const meta = extractMetadata(schema);
// { title: "Username", description: "User's display name", custom_field: "any value" }
```

### `extractFields(schema: ZodType, options?)`

Extract field information from an object schema.

**Options:**
- `extractUnions` (default: `true`) - Extract union options for union fields
- `extractFieldMeta` (default: `true`) - Extract descriptions from field `.meta()`

```typescript
const schema = z.object({
  id: z.number(),
  name: z.string().meta({ description: "User's full name" }),
  role: z.enum(["admin", "user"]),
  email: z.string().optional(),
});

const fields = extractFields(schema);
// [
//   { name: "id", type: "number", required: true },
//   { name: "name", type: "string", required: true, description: "User's full name" },
//   { name: "role", type: 'enum ("admin" | "user")', required: true },
//   { name: "email", type: "string", required: false }
// ]
```

### `extractUnionOptions(schema: ZodType)`

Extract options from a union of object schemas.

```typescript
const schema = z.union([
  z.object({ type: z.literal("a"), value: z.string() }),
  z.object({ type: z.literal("b"), count: z.number() }),
]);

const options = extractUnionOptions(schema);
// [
//   { fields: [{ name: "type", type: 'literal "a"', required: true }, ...] },
//   { fields: [{ name: "type", type: 'literal "b"', required: true }, ...] }
// ]
```

### `walkUnion(schema: ZodType, options?)`

Walk a union and extract metadata from each option. Maps discriminator values to metadata.

**Options:**
- `mergeFields` (default: `true`) - Enrich metadata with schema-derived fields
- `extractUnions` (default: `true`) - Extract union options
- `extractFieldMeta` (default: `true`) - Extract field descriptions

```typescript
const FieldSchema = z.union([
  z.object({ type: z.literal("uint8"), name: z.string() })
    .meta({ title: "8-bit Integer", description: "Single byte" }),
  z.object({ type: z.literal("uint16"), name: z.string() })
    .meta({ title: "16-bit Integer", description: "Two bytes" }),
]);

const result = walkUnion(FieldSchema, { mergeFields: true });

result.metadata.get("uint8");
// {
//   title: "8-bit Integer",
//   description: "Single byte",
//   fields: [
//     { name: "type", type: 'literal "uint8"', required: true },
//     { name: "name", type: "string", required: true }
//   ]
// }
```

## TypeScript Types

```typescript
interface SchemaMetadata {
  title?: string;
  description?: string;
  examples?: unknown[];
  notes?: string[];
  see_also?: string[];
  since?: string;
  deprecated?: string;
  // ... any custom fields
}

interface FieldInfo {
  name: string;
  type: string;
  required: boolean;
  description?: string;
  default?: string;
  unionOptions?: UnionOption[];
}

interface ExtractedMetadata extends SchemaMetadata {
  fields?: FieldInfo[];
}
```

## Use Cases

- **Documentation generators**: Extract metadata to generate HTML/Markdown docs
- **Schema introspection**: Build tools that analyze Zod schemas
- **Code generators**: Generate types/validators for other languages
- **API documentation**: Document request/response schemas
- **Protocol documentation**: Document binary protocols (like BinSchema!)

## Zod 4 Compatibility

This library is designed for Zod v4 and uses:
- `.meta()` for metadata retrieval
- `.def` / `._def` for internal structure access
- Handles Zod 4's `values` arrays for literals
- Handles Zod 4's `entries` objects for enums

## Development

```bash
# Install dependencies
bun install

# Run tests
bun test

# Build
bun run build
```

## License

MIT
