# BinSchema - Claude Code Instructions

This file provides guidance when working with the BinSchema tool.

## Overview

BinSchema is a bit-level binary serialization schema and code generator. It generates TypeScript encoders/decoders and HTML documentation from JSON schema definitions.

## Testing

```bash
# Run all tests (preferred - uses bun for speed)
npm test

# Run specific test category
bun run src/run-tests.ts --filter=<pattern>

# Examples:
bun run src/run-tests.ts --filter=uint16      # Only uint16 tests
bun run src/run-tests.ts --filter=optional    # Only optional field tests
bun run src/run-tests.ts --filter=bitfields   # Only bitfield tests
```

Tests run fast (~0.15s for full suite with bun).

## Generating HTML Documentation

To generate HTML documentation from a protocol schema:

```bash
bun run src/generate-docs.ts <protocol-schema.json> <output.html>
```

**Example for SuperChat protocol:**
```bash
bun run src/generate-docs.ts examples/superchat-protocol.json examples/protocol-docs.html
```

**Input files:**
- `examples/superchat-protocol.json` - Protocol definition with messages, descriptions, examples
- `examples/superchat-types.json` - Type definitions referenced by protocol (linked via `types_schema` field)

**Output:**
- HTML documentation with:
  - Frame format visualization with complete header + payload example
  - Message type reference
  - Type definitions with wire format diagrams
  - Interactive hex examples with byte-level annotations

**Protocol Schema Fields:**
- `header_format` - Name of the type used as the frame header (e.g., "FrameHeader", "Packet")
- `header_size_field` - Name of the header field that contains the payload size/length (e.g., "length", "size")
  - This field will be auto-calculated in the frame example if not provided in `header_example.decoded`
  - Calculation: size of all other header fields + payload size
- `header_example` - Example header values for the frame format example
  - The first message with an `example` will be used as the payload
  - Together they create a complete frame visualization

## Wire Format Annotations

The HTML generator uses `annotateWireFormat()` to automatically generate byte-level annotations from schemas:

```typescript
// Example: Generate annotations for a message
const annotations = annotateWireFormat(
  bytes,           // Raw byte array
  "AuthRequest",   // Type name from schema
  binarySchema,    // Schema definition
  decodedValue     // Decoded value for context
);
```

**Supported features:**
- Primitive types (uint8, uint16, uint32, uint64, etc.)
- Strings (length-prefixed)
- Optional fields (presence byte + value)
- Nested structs
- **Bitfields** - Groups consecutive bit fields into byte ranges with bit position annotations

## Architecture Notes

### Annotation System

The annotation system (`src/schema/annotate-wire-format.ts`) recursively walks a schema and generates byte-range descriptions:

- **Bitfields**: Consecutive `type: "bit"` fields are grouped into byte-aligned chunks
  - Single-byte groups: `Byte 0 (bits): flag1=1, flag2=0, padding=0`
  - Multi-byte groups: `Bytes 0-1 (bits): field1=1 (bits 0-3), field2=255 (bits 4-15)`
- **Regular fields**: Generate one annotation per field (e.g., `nickname: 'alice'`)
- **Optional fields**: Generate presence annotation + value annotation if present

### HTML Generator

The HTML generator (`src/generators/html.ts`) has several key functions:

- `generateFrameFormatSection()` - Renders frame format with complete header + payload example
- `generateAnnotatedHexView()` - Renders colored hex bytes with cross-highlighting
- `formatInlineMarkup()` - Parses `**bold**` and `*italic*` in notes (XSS-safe)

### Testing Strategy

Tests are comprehensive and test-driven:
- Every feature has tests before implementation
- Tests verify both encoding and decoding
- Round-trip tests ensure correctness
- Edge cases are extensively covered (35 tests for inline formatting alone!)

## Common Tasks

**Adding a new primitive type:**
1. Add to `getPrimitiveSize()` in `annotate-wire-format.ts`
2. Add test cases in `src/tests/primitives/`
3. Update HTML primitive types table if needed

**Adding a new message type to SuperChat docs:**
1. Add to `examples/superchat-protocol.json` messages array
2. Add type definition to `examples/superchat-types.json` if needed
3. Add field descriptions to `field_descriptions` object
4. Regenerate: `bun run src/generate-docs.ts examples/superchat-protocol.json examples/protocol-docs.html`

**Testing annotation generation:**
- Create test file in `src/tests/schema/`
- Define test cases with `{ schema, bytes, decoded, expected }` tuples
- Run test: `bun run src/tests/schema/your-test.test.ts`
