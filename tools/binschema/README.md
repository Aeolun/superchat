# BinSchema

Bit-level binary serialization schema and code generator.

## Philosophy

- **Bit-streaming by default** - Support bit-level precision for maximum flexibility
- **Test-driven** - Define expected behavior first, then generate code to match
- **Multi-target** - Generate Go, TypeScript, and HTML documentation from single schema
- **Type-safe** - Zod schemas provide IDE autocomplete and validation

## Features

- True bit-streaming (1-64 bit fields)
- Byte-aligned types (uint8, uint16, uint32, uint64, strings, arrays)
- Generic types (Optional<T>, Array<T>)
- Conditional fields
- Computed fields (for protocol headers)
- Endianness control (big/little, per-field or global)
- Bit ordering control (MSB/LSB first)

## Project Structure

```
binschema/
  src/
    schema/          # Zod schemas for binary format definitions
    tests/           # Test cases (schemas + expected bytes/bits)
    generators/      # Code generators (Go, TypeScript, HTML)
    runtime/         # Runtime encoder/decoder (reference implementation)
  dist/              # Compiled TypeScript output
```

## Usage

```typescript
import { defineBinarySchema } from './src/schema/binary-schema.js';

const myProtocol = defineBinarySchema({
  config: {
    endianness: "big_endian",
    bit_order: "msb_first",
  },
  types: {
    "MessageHeader": {
      fields: [
        { name: "version", type: "uint8" },
        { name: "flags", type: "uint8" },
      ]
    }
  }
});
```

## Development

```bash
npm install
npm run build
npm test
```
