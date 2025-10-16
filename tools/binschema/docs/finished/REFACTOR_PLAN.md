# BinSchema Refactor Plan: `fields` → `sequence` + Type Aliases

## Current State (Commit: aa8f90f)

- 272 tests passing
- All tests use `"fields": [...]` to define type structures
- No distinction between composite types (tuples) and type aliases
- Example problem: `String` is defined as a struct with a `data` field, but on the wire it's just a length-prefixed byte array

> Active tasks from this refactor plan have been migrated to `docs/TODO.md`.

## Problem

The schema conflates two concepts:

1. **Type Aliases** - e.g., `String` IS a length-prefixed array (not a struct containing one)
2. **Composite Types** - e.g., `AuthRequest` is a sequence of: String, then String

Using `"fields"` for both is confusing because it implies:
- Fields have names (like struct members)
- The wire format has that level of nesting

But binary data is just **ordered byte sequences**. Field names are labels for documentation/code generation, not wire format structure.

## Solution

### 1. Rename `fields` → `sequence`

**Rationale**: "Sequence" better represents what's happening - an ordered list of types that appear one after another on the wire.

**Before:**
```json
{
  "AuthRequest": {
    "fields": [
      { "name": "nickname", "type": "String" },
      { "name": "password", "type": "String" }
    ]
  }
}
```

**After:**
```json
{
  "AuthRequest": {
    "sequence": [
      { "name": "nickname", "type": "String" },
      { "name": "password", "type": "String" }
    ]
  }
}
```

### 2. Support Type Aliases

**Rationale**: Allow types to directly reference other types/primitives without wrapping in a sequence.

**Before (incorrect):**
```json
{
  "String": {
    "fields": [
      {
        "name": "data",
        "type": "array",
        "kind": "length_prefixed",
        "length_type": "uint16",
        "items": { "type": "uint8" }
      }
    ]
  }
}
```

**After (correct):**
```json
{
  "String": {
    "type": "array",
    "kind": "length_prefixed",
    "length_type": "uint16",
    "items": { "type": "uint8" }
  }
}
```

Now `String` IS the array, not a struct containing it.

### 3. TypeScript Generator Adaptation

**String as type alias:**
```typescript
// Before: interface String { data: number[] }
// After:  type String = string  (with encode/decode helpers)
```

**Optional<T> as composite:**
```typescript
// Still: interface Optional<T> { present: number; value?: T }
```

## Implementation Plan

### Phase 1: Schema Updates
1. Update `binary-schema.ts`:
   - Change `TypeDef` to support both `sequence` and direct type references
   - Add validation: type must have either `sequence` OR be a type alias
   - Keep backwards compatibility temporarily (support both `fields` and `sequence`)

2. Update Zod schemas:
   ```typescript
   export const TypeDefSchema = z.union([
     // Composite type with sequence
     z.object({
       sequence: z.array(FieldSchema),
       description: z.string().optional(),
     }),
     // Type alias (direct reference to another type or primitive)
     z.object({
       type: z.string(),
       // ... allow array/bitfield/etc properties
     })
   ]);
   ```

### Phase 2: Generator Updates
1. Update TypeScript generator (`generators/typescript.ts`):
   - Detect type aliases vs composites
   - Generate appropriate TS types (type alias vs interface)
   - Handle encoding/decoding for both

2. Update HTML generator (`generators/html.ts`):
   - Display type aliases correctly (show the underlying structure)
   - Display sequences as ordered field lists

### Phase 3: Mass Migration
1. Find and replace in all test files:
   ```bash
   find src/tests -name "*.test.ts" -exec sed -i 's/"fields"/"sequence"/g' {} +
   ```

2. Update example schemas:
   - `examples/superchat-types.json`
   - Convert `String`, `Optional<T>` to type aliases

3. Run full test suite:
   ```bash
   npm test
   ```

4. Fix any failures

### Phase 4: Cleanup
1. Remove backwards compatibility for `fields`
2. Update documentation
3. Commit the refactor

## Expected Impact

### Breaking Changes
- All schema JSON files need `"fields"` → `"sequence"`
- Type definitions that should be aliases need restructuring

### Non-Breaking
- Generated TypeScript code should be mostly the same
- All 272 tests should still pass after migration

## Risks

1. **Mass find/replace might break something subtle**
   - Mitigation: Test suite will catch it
   - Mitigation: Review git diff before committing

2. **Type alias logic might have edge cases**
   - Mitigation: Start with simple cases (String, arrays)
   - Mitigation: Add tests for each type alias pattern

3. **Generator updates might introduce bugs**
   - Mitigation: Run full test suite after each change
   - Mitigation: Test HTML generation on example schemas

## Success Criteria

_Progress toward these criteria is now monitored via `docs/TODO.md`._

## Timeline

Estimated: 2-3 hours for full refactor

1. Schema updates: 30 min
2. Generator updates: 60 min
3. Mass migration: 15 min
4. Test and fix: 30-60 min
5. Cleanup and docs: 15 min
