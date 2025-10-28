# BinSchema Next Tasks: Random Access Edge Cases

## Immediate Priorities (based on architecture review)

### 1. Add Circular Reference Detection (HIGH PRIORITY)
**Risk**: Stack overflow if position fields form cycles
**Impact**: Production safety issue

Add visited tracking in `_resolveFieldReference()`:
```typescript
private _resolveFieldReference(path: string, visited = new Set<string>()): number {
  if (visited.has(path)) {
    throw new Error(`Circular reference detected: ${path}`);
  }
  visited.add(path);
  // ... rest of resolution logic
}
```

**Test case needed**: TypeA.position → TypeB.offset → TypeA.offset (cycle)

### 2. Test Deep Nesting (3+ Levels) (MEDIUM PRIORITY)
**Risk**: String path resolution might break with complex nesting
**Files to test**:
- `archive.header.metadata.filename` (3 levels)
- Field-referenced strings/arrays at each level
- Position fields at multiple depths

### 3. Document _rootDecoder Pattern (MEDIUM PRIORITY)
**Current state**: Pattern works but is implicit and undocumented
**Action**: Add comprehensive comments explaining:
- Why sliced decoders need root decoder access
- How context chain is maintained
- When to use `_rootDecoder` vs `this`

## Medium-term Improvements

### 4. Refactor Path Resolution to Use Structured Objects
**Current issue**: Heavy string manipulation (`replace(/\./g, "_")`, `includes('_item')`)
**Better approach**:
```typescript
interface DecodePath {
  segments: string[];
  isArrayItem: boolean;
  depth: number;

  getParent(): DecodePath;
  resolve(field: string): DecodePath;
  toVariableName(): string;
}
```

### 5. Add Performance Benchmarks
**Missing metrics**:
- Position field overhead vs sequential decode
- Instance wrapper memory usage
- Path resolution performance with 1000+ position fields

### 6. Test Mixed Inline/Standalone Scenarios
**Edge case**: Type used both inline (in arrays) and standalone
**Concern**: Context passing might differ between usages

## Long-term Architecture

### 7. Consider Decoder Context Sharing
**Current issue**: Byte array slicing for each position field
**Better approach**: Shared byte source with window tracking

### 8. Two-Pass Decoder Design
**For large files**:
- Pass 1: Build offset index
- Pass 2: Decode with full random access

## Test Cases to Add

### Critical Tests
- [ ] Deep nesting (3+ levels) with field references at each level
- [ ] Circular position field references (should throw error)
- [ ] Array of types where each item has position fields
- [ ] Position field referencing another position field's result (expand existing)
- [ ] Alignment violations with nested structures

### Stress Tests
- [ ] Pathological nesting: position fields at every level
- [ ] 1000+ position fields in single schema
- [ ] Large arrays (10k items) where each item has position fields

### Error Cases
- [ ] Invalid offset (beyond EOF)
- [ ] Negative position beyond start
- [ ] Misaligned position with alignment requirement
- [ ] Circular reference detection

## Code Smells Identified

1. **String manipulation fragility**: Path resolution relies on string operations
2. **Implicit behavior**: Inline vs standalone detection based on `hasInstanceFields`
3. **Slicing overhead**: Creating new Uint8Arrays for each position field
4. **No circular reference protection**: Could cause stack overflow

## Performance Considerations

### Instance Wrapper Overhead
- ~100 bytes per instance
- Consider object pooling for frequently created instances

### Path Resolution Caching
```typescript
class PathCache {
  private cache = new Map<string, string[]>();

  resolve(path: string): string[] {
    if (!this.cache.has(path)) {
      this.cache.set(path, path.split('.'));
    }
    return this.cache.get(path)!;
  }
}
```

## Risk Assessment

**Low Risk**: Current fixes are sound for reported issues ✅
**Medium Risk**: Deep nesting and circular structures not fully tested ⚠️
**High Risk**: Architecture doesn't scale to very large files (GB+) ⚠️

## Conclusion from Architecture Review

> The bug fixes are technically correct and address the immediate issues. However, the architecture shows signs of organic growth that could benefit from systematic refactoring. The string-based path resolution and `_rootDecoder` pattern work but are fragile. Priority should be given to adding comprehensive tests for edge cases and documenting the current patterns before attempting major architectural changes.

**Most critical addition**: Circular reference detection to prevent stack overflows in production.
