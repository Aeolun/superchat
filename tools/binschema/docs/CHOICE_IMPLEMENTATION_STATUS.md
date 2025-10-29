# Choice Type Implementation Status

## Goal

Implement `choice` type as a **flat discriminated union** - avoiding the `.value` wrapper that `discriminated_union` uses.

### Why Choice Exists

The existing `discriminated_union` generates wrapped types:
```typescript
type Section =
  | { type: 'DataBlock'; value: DataBlock }  // ← .value wrapper
  | { type: 'IndexEntry'; value: IndexEntry }
```

This forces users to work with nested structures. The `choice` type generates flat types:
```typescript
type Section =
  | (DataBlock & { type: 'DataBlock' })  // ← discriminator is part of the type
  | (IndexEntry & { type: 'IndexEntry' })
```

The discriminator field (e.g., `type_tag`) is **inside** each variant type, not in a wrapper.

## Current Implementation Status

### ✅ Completed

1. **Schema validation** (`src/schema/binary-schema.ts`, `src/schema/validator.ts`)
   - Added `ChoiceElementSchema` to accept `{ type: "choice", choices: [...] }` syntax
   - Added `validateChoice()` function to validate choice elements
   - Choice now validates in schemas

2. **Type generation** (`src/generators/typescript.ts:1539-1565`)
   - Added `generateChoiceType()` to generate flat union types
   - Generates `(TypeA & { type: 'TypeA' }) | (TypeB & { type: 'TypeB' })`
   - No `.value` wrapper in generated types

3. **Encoding generation** (`src/generators/typescript.ts:2203-2239`)
   - Added `generateEncodeChoice()` function
   - Generates encoding without `.value` wrapper
   - Uses `valuePath` directly instead of `${valuePath}.value`

### ❌ Not Working / Not Implemented

The implementation is **partially working** but the code generator has an architectural issue:

**Problem:** When `choice` appears as an array item type, the generator creates a **standalone type definition** (e.g., `Section`) with its own encoder/decoder classes. These standalone classes are still being generated using the `discriminated_union` logic, which assumes the wrapped format.

**Symptoms:**
- Generated type `Section` is correct (flat union)
- But `SectionEncoder.encode()` still accesses `.value` properties
- Tests fail with "undefined is not an object (evaluating 'value_sections_item.value.type_tag')"

**What needs fixing:**

1. **Standalone type encoder/decoder generation**
   - When a `choice` type is encountered as an array item
   - The generator creates separate encoder/decoder classes
   - These classes need to know they're encoding a `choice` (flat) not `discriminated_union` (wrapped)
   - Location: Somewhere in the type code generation pipeline (needs investigation)

2. **Decoding generation** (not started)
   - Need to add decoding logic for choice types
   - Should peek at discriminator field (first field of each choice type)
   - Decode directly into flat structure (no wrapper)
   - Need to add case in decode switch statement

3. **Discriminator auto-detection** (future enhancement)
   - Currently assumes TypeScript `.type` property for discrimination
   - Should auto-detect common first field across all choice types
   - Validate that discriminator field has unique values per type

## Code Locations

### Schema Definition
- `src/schema/binary-schema.ts:925-939` - ChoiceElementSchema
- `src/schema/binary-schema.ts:1099` - Add ChoiceElementSchema to union

### Schema Validation
- `src/schema/validator.ts:801-835` - validateChoice()
- `src/schema/validator.ts:1203-1207` - Call validateChoice for choice elements

### TypeScript Generation
- `src/generators/typescript.ts:1539-1541` - Type generation case
- `src/generators/typescript.ts:1553-1565` - generateChoiceType()
- `src/generators/typescript.ts:2185-2187` - Encoding generation case
- `src/generators/typescript.ts:2203-2239` - generateEncodeChoice()

### What's Missing
- Decoding case in decode switch (around line ~2914)
- Decode function: `generateDecodeChoice()` (needs to be written)
- **CRITICAL:** Fix standalone type generation to use choice logic instead of discriminated_union logic

## Investigation Needed

**Key Question:** Where does the generator decide to create standalone `Section` type with encoder/decoder classes?

Search for:
- Code that processes array `items` field with `type: "choice"`
- Code that creates type aliases/definitions from inline union types
- Code that generates `SectionEncoder` and `SectionDecoder` classes

**Hypothesis:** There's probably a function that checks "if array items is a discriminated_union or choice, create a standalone type" and it's treating both the same way.

## Test Case

`src/tests/cross-struct/array-correlation.test.ts` - `same_index_correlation` test

Schema has:
```typescript
items: {
  type: "choice",
  choices: [
    { type: "DataBlock" },
    { type: "IndexEntry" }
  ]
}
```

Expected generated code should access:
```typescript
value_sections_item.type_tag  // ← Direct access (flat)
```

Currently generates:
```typescript
value_sections_item.value.type_tag  // ← Wrapped access (wrong!)
```

## Next Steps

1. Find where standalone type definitions are created from array items
2. Add logic to distinguish between `choice` and `discriminated_union`
3. Pass a flag or metadata so encoder/decoder generation knows it's a flat type
4. Implement decoding for choice types
5. Test with all failing test cases
