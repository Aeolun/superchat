# Random Access Implementation Details

**Date:** 2025-10-27
**Status:** Implemented and tested

This document describes the actual implementation of random access (position fields) in BinSchema, including the `_rootDecoder` pattern and technical details discovered during implementation.

---

## Core Implementation Pattern

### Instance Fields (Lazy Position Fields)

Position fields are implemented as lazy-evaluated getter properties on type instances. Each type with `instances` defined gets a corresponding Instance class that:

1. Stores the decoder reference for seeking
2. Caches evaluated lazy fields
3. Tracks circular reference detection state
4. Provides field reference resolution

**Generated Code Structure:**

```typescript
class MyTypeInstance implements MyType {
  // Internal state (non-enumerable to avoid JSON cycles)
  private _decoder!: BitStreamDecoder;
  private _lazyCache!: Map<string, any>;
  private _evaluating!: Set<string>;  // Circular reference detection
  private _root!: any;                 // Root instance for field references

  // Sequential fields (parsed immediately)
  offset: number;
  size: number;

  constructor(decoder: BitStreamDecoder, sequenceData: any, root?: any) {
    // Make internal properties non-enumerable
    Object.defineProperty(this, '_decoder', { value: decoder, enumerable: false });
    Object.defineProperty(this, '_lazyCache', { value: new Map(), enumerable: false });
    Object.defineProperty(this, '_evaluating', { value: new Set(), enumerable: false });
    Object.defineProperty(this, '_root', { value: root || this, enumerable: false });

    // Copy sequential data
    this.offset = sequenceData.offset;
    this.size = sequenceData.size;

    // Define lazy getter for position field
    Object.defineProperty(this, 'data', {
      enumerable: true,
      get: () => {
        // Circular reference check (prevents stack overflow)
        if (this._evaluating.has('data')) {
          throw new Error(`Circular reference detected: field 'data' references itself during evaluation`);
        }

        if (!this._lazyCache.has('data')) {
          this._evaluating.add('data');
          try {
            // Resolve position from field reference
            const position = this._resolveFieldReference('offset');

            // Seek to position
            this._decoder.seek(position);

            // Create decoder for nested type, passing context
            const decoder = new DataTypeDecoder(
              this._decoder['bytes'].slice(position),
              { _root: this._root, _rootDecoder: this._decoder }
            );

            // Decode and cache
            const value = decoder.decode();
            this._lazyCache.set('data', value);
          } finally {
            // Always clean up evaluation state
            this._evaluating.delete('data');
          }
        }
        return this._lazyCache.get('data')!;
      }
    });
  }

  private _resolveFieldReference(path: string): number {
    const parts = path.split('.');
    let current: any = parts[0] === '_root' ? this._root : this;
    const startIndex = parts[0] === '_root' ? 1 : 0;

    for (let i = startIndex; i < parts.length; i++) {
      current = current[parts[i]];
      if (current === undefined) {
        throw new Error(`Field reference '${path}' not found (failed at '${parts.slice(0, i + 1).join('.')}')`);
      }
    }

    if (typeof current !== 'number' && typeof current !== 'bigint') {
      throw new Error(`Field reference '${path}' does not resolve to a numeric value (got ${typeof current})`);
    }

    return Number(current);
  }
}
```

---

## The `_rootDecoder` Pattern

### Problem: Nested Position Fields

When a position field references a type that itself has position fields (nested random access), we need all instances to seek in the same byte array. However, the natural implementation creates a new decoder with sliced bytes for each nested type.

**Broken approach:**
```typescript
// Parent instance creates child decoder with SLICED bytes
const decoder = new ChildDecoder(this._decoder['bytes'].slice(position));
```

This breaks because the child's position fields try to seek to absolute positions, but they only have access to bytes from `position` onward.

### Solution: Context Propagation

Pass the root decoder through context so all nested instances can seek in the full byte array:

**Fixed approach:**
```typescript
// Parent instance passes root decoder through context
const decoder = new ChildDecoder(
  this._decoder['bytes'].slice(position),
  { _root: this._root, _rootDecoder: this._decoder }
);
```

**Child decoder uses root decoder if available:**
```typescript
decode(): ChildType {
  const sequenceData: any = {};

  // ... decode sequential fields ...

  // Use root decoder for instance creation (if available from context)
  const decoder = this.context?._rootDecoder || this;
  const root = this.context?._root;
  const instance = new ChildTypeInstance(decoder, sequenceData, root);
  return instance as ChildType;
}
```

### Why This Works

1. **Sequential decoding uses sliced bytes:** The decoder still operates on the sliced byte array for reading sequential fields (correct behavior)
2. **Position seeking uses full byte array:** When a position field needs to seek, it uses the root decoder which has the complete bytes
3. **Context propagates through nesting:** Each level passes `_rootDecoder` and `_root` through context, so deeply nested types can still seek correctly

---

## Circular Reference Detection

### What We Protect Against

The circular reference detection prevents **same-instance recursion** where a lazy field tries to access itself during evaluation:

**Example that would cause stack overflow without detection:**
```typescript
{
  name: "self_ref",
  type: "MyType",
  position: "self_ref.offset"  // ❌ Field references itself
}
```

### What We DON'T Protect Against

Cross-instance circular references (A→B→A) are either:
1. **Valid use cases** (like linked lists with next pointers)
2. **Naturally fail** with "out of bounds" errors if the structure is truly circular in the file

The detection mechanism uses a Set to track which fields are currently being evaluated on each instance. If a field tries to access itself recursively, we throw immediately.

**Implementation:**
```typescript
if (this._evaluating.has('fieldName')) {
  throw new Error(`Circular reference detected: field 'fieldName' references itself during evaluation`);
}

this._evaluating.add('fieldName');
try {
  // ... evaluate field ...
} finally {
  this._evaluating.delete('fieldName');  // Always clean up
}
```

---

## Field Reference Resolution

### Dot Notation Support

Field references support dot notation for accessing nested fields:

```typescript
// Reference field on current instance
position: "data_offset"

// Reference field on root instance
position: "_root.header.data_offset"

// Reference nested field
position: "header.section.offset"
```

### Resolution Algorithm (Compile-Time)

Path resolution is performed at **code generation time** (not runtime) for optimal performance:

1. Parse path at compile time: `"header.section.offset"` → `["header", "section", "offset"]`
2. Generate direct property access code:
   - `"data_offset"` → `this.data_offset`
   - `"header.offset"` → `this.header.offset`
   - `"_root.header.offset"` → `this._root.header.offset`
3. Add runtime type validation (numeric check only)

**Generated Code Example:**
```typescript
// Schema: position: "header.offset"
// Generated:
const position = this.header.offset;
if (typeof position !== 'number' && typeof position !== 'bigint') {
  throw new Error(`Field reference 'header.offset' does not resolve to a numeric value (got ${typeof position})`);
}
```

**Benefits:**
- ✅ **No runtime string parsing** - Direct property access
- ✅ **Type-safe** - TypeScript validates property existence at compile time
- ✅ **Faster** - No split/join operations at runtime
- ✅ **Cleaner generated code** - No helper methods needed

**Error Handling:**
- **Field not found:** TypeScript compile error (property doesn't exist)
- **Non-numeric value:** Runtime error with actual type received

---

## Testing Coverage

### Test Suites

1. **circular_reference_protection**: Verifies lazy fields evaluate without stack overflow
2. **deep_nesting_position_fields**: Tests 3+ levels of nested position fields
3. **mixed_inline_standalone**: Tests same type used both inline and via position fields

### Edge Cases Tested

- ✅ Lazy field evaluation and caching
- ✅ Deep nesting (3+ levels)
- ✅ Mixed inline/position usage of same type
- ✅ Position field reference resolution (dot notation)
- ✅ Context propagation through nesting
- ✅ Root decoder preservation

### Known Limitations

1. **No arithmetic expressions:** Position must be simple field reference or number
2. **No cycle detection for cross-instance references:** Intentionally not implemented (valid use cases exist)

---

## Performance Characteristics

### Memory Usage

- **Lazy evaluation:** Fields only consume memory when accessed
- **Caching:** Each field evaluated once, result cached in Map
- **No memory leaks:** Internal properties are non-enumerable, preventing JSON.stringify cycles

### Seek Performance

- **In-memory (Uint8Array):** O(1) seek operation
- **Deep nesting:** Each level performs one seek operation
- **Sequential fields:** Decoded immediately (no seeking cost)

### Optimization Opportunities

1. **Decoder pooling:** Reuse decoder instances for nested types
2. **Lazy getter optimization:** Consider defining getters at class level instead of constructor
3. **Performance benchmarks:** Add benchmarks comparing sequential vs random access patterns

---

## Future Improvements

### Medium Priority

1. **Add performance benchmarks** to measure seek overhead in various scenarios
2. **Improved error messages** with full path context for nested references

### Low Priority

1. **Arithmetic expressions** in position calculations (if real-world need arises)
2. **Memory-mapped file support** for large files
3. **Concurrent read optimization** (Go implementation)

---

## Implementation Checklist

- ✅ Instance class generation with lazy getters
- ✅ Context propagation (`_rootDecoder`, `_root`)
- ✅ Circular reference detection
- ✅ Field reference resolution with dot notation (compile-time path parsing)
- ✅ Deep nesting support (3+ levels tested)
- ✅ Mixed inline/standalone usage
- ✅ All tests passing (425+ test suites)
- ✅ Error handling with descriptive messages
- ✅ Path resolution refactoring (compile-time property access generation)
- ✅ Documentation (this file)
- ⏳ Performance benchmarks

---

## References

- **Architecture Review:** See `NEXT_TASK.md` for edge cases and recommendations
- **Schema Decisions:** See `RANDOM_ACCESS_DECISIONS.md` for high-level design decisions
- **Test Files:** `src/tests/random-access/circular-reference.test.ts`
- **Generator Code:** `src/generators/typescript.ts` (lines 1350-1463, 2583-2589)
