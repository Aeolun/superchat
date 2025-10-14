# BinSchema Self-Documentation System

## Overview

Generate beautiful HTML documentation from Zod schemas using metadata. This system is designed to be **generic** - it can document any Zod schema, not just BinSchema's own schemas.

**Status:** Core system is complete! ✅ All primitive types (uint8-64, int8-64, float32-64) now have rich metadata and generate beautiful HTML documentation.

**Usage:**
```bash
npm run docs:types
```

This generates `type-reference.html` with comprehensive documentation for all BinSchema types, including:
- Type descriptions and use cases
- Wire format specifications
- Tabbed code generation views (TypeScript, Go, Rust)
- Examples and notes

## Goals

1. **Self-documenting schemas**: Add rich metadata to Zod schemas using `.meta()`
2. **Generic extraction**: Walk any Zod schema tree and extract metadata
3. **Beautiful output**: Generate HTML docs with the same quality as our protocol docs
4. **Reusable**: Other projects can use this to document their own Zod schemas

## Architecture

```
Zod Schema + .meta() → Metadata Extractor → HTML Generator → Beautiful Docs
```

## Implementation Checklist

### Phase 1: Metadata System
- [x] Extend Zod's `GlobalMeta` interface with rich metadata fields
- [x] Add `.meta()` calls to primitive types (uint8, uint16, uint32, uint64, int8, int16, int32, int64)
- [x] Add `.meta()` calls to floating point types (float32, float64)
- [x] Add `code_generation` field with per-language type mappings and notes
- [ ] Add `.meta()` calls to bit-level types (bit, bitfield)
- [ ] Add `.meta()` calls to composite types (array, string, optional, discriminated_union, pointer)
- [ ] Add `.meta()` calls to special types (conditional, type reference)

### Phase 2: Generic Metadata Extractor
- [x] Create `extractMetadata(zodSchema)` function
- [x] Handle primitive types (ZodString, ZodNumber, ZodLiteral, etc.)
- [x] Handle object types (ZodObject)
- [x] Handle union/discriminated union types
- [x] Walk discriminated union structure to extract metadata from all options
- [ ] Handle array types (future)
- [ ] Handle optional/nullable types (future)
- [ ] Handle recursive schemas (future)

### Phase 3: HTML Generator
- [x] Design HTML layout for type reference (sections, navigation, examples)
- [x] Implement type reference section renderer with collapsible details
- [x] Implement tabbed code generation view with JavaScript interaction
- [x] Implement wire format visualization
- [x] Reuse inline formatting parser (`**bold**`, `*italic*`)
- [x] Add responsive CSS styling (borrowed from protocol generator)
- [x] Add table of contents with anchor links
- [ ] Add search/filter functionality (optional, future)

### Phase 4: Integration
- [x] Create `generate-type-reference.ts` script
- [x] Add npm script: `npm run docs:types`
- [x] Generate docs for BinSchema primitive types (dogfooding)
- [ ] Add to CI/deployment pipeline (optional, future)

### Phase 5: Documentation & Examples
- [ ] Document metadata format and conventions
- [ ] Document how to use the generic extractor
- [ ] Provide example for documenting custom schemas
- [ ] Update main README with link to type reference

## Metadata Format

```typescript
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
    notes?: string[];        // General notes (not language-specific)
    see_also?: string[];     // Related type names/links
    since?: string;          // Version when added
    deprecated?: string;     // Deprecation notice
  }
}
```

## Example Output

```html
<section id="uint8">
  <h2>uint8</h2>
  <p class="subtitle">8-bit Unsigned Integer</p>

  <p>Single byte (0-255). No endianness.</p>

  <div class="metadata">
    <div class="use-for">
      <strong>Use for:</strong> flags, message type codes, small counters
    </div>
    <div class="wire-format">
      <strong>Wire format:</strong> 1 byte (0x00-0xFF)
    </div>
  </div>

  <!-- Tabbed code generation view -->
  <div class="code-generation">
    <h3>Generated Code</h3>
    <div class="tabs">
      <button class="tab active" data-lang="typescript">TypeScript</button>
      <button class="tab" data-lang="go">Go</button>
      <button class="tab" data-lang="rust">Rust</button>
    </div>
    <div class="tab-content typescript active">
      <strong>Type:</strong> <code>number</code>
      <ul>
        <li>JavaScript Number type</li>
        <li>Safe for all uint8 values</li>
      </ul>
    </div>
    <div class="tab-content go">
      <strong>Type:</strong> <code>uint8</code>
      <ul>
        <li>Native Go uint8 type</li>
        <li>Also known as byte</li>
      </ul>
    </div>
    <div class="tab-content rust">
      <strong>Type:</strong> <code>u8</code>
      <ul>
        <li>Native Rust u8 type</li>
      </ul>
    </div>
  </div>

  <div class="examples">
    <h3>Examples</h3>
    <pre><code>{ name: "version", type: "uint8" }
{ name: "flags", type: "uint8", description: "Feature flags" }</code></pre>
  </div>
</section>
```

## Design Philosophy

1. **Generic first**: The extractor and generator work with any Zod schema
2. **Domain-specific second**: BinSchema-specific fields (like `wire_format`) are optional
3. **Beautiful by default**: Clean typography, good spacing, responsive design
4. **Consistent**: Matches existing BinSchema protocol documentation style
5. **Extensible**: Easy to add new metadata fields or renderers

## Future Enhancements

- Interactive examples (copy-to-clipboard)
- JSON Schema export option
- TypeScript type definition export
- Search/filter by category
- Dark mode support
- Comparison tables for similar types
