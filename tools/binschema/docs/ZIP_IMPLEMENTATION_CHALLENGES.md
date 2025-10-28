# ZIP Implementation Challenges & Solutions

## Core Technical Challenges

### 1. Parent References (`../field`)
**Challenge**: Child struct needs to access parent struct's fields
**Example**: `LocalFileHeader.compressed_size` needs `length_of("../body")`
**Solution**: Extend computed field resolver to traverse parent context chain

### 2. Struct Field References (`header.field`)
**Challenge**: Dot notation for accessing nested struct fields
**Example**: `data` array uses `header.compressed_size` as length
**Solution**: Parse dot notation and traverse nested structures

### 3. Array Index Correlation
**Challenge**: `CentralDirEntry[i]` must reference `LocalFile[i]` position
**Example**: `central_dir[0].local_header_offset` = position of `local_files[0]`
**Solution**: Provide `_index` context variable in array processing

### 4. Aggregate Computations
**Challenge**: Compute values over entire arrays
**Examples**:
- `sum_of(central_directory, sizeof(item))` - Total size
- `count_of(sections, item.type == 0x01)` - Filtered count
- `position_of(sections.find(...))` - First matching element
**Solution**: New computed field types with expression evaluation

### 5. Cross-Array References
**Challenge**: Reference specific elements in different arrays
**Example**: `_root.local_files[_index]` from within `central_directory[i]`
**Solution**: Full path resolution with root context access

### 6. Dynamic Size Calculation
**Challenge**: Size depends on encoded content, not input
**Example**: String length in bytes varies with UTF-8 encoding
**Solution**: Two-pass encoding or size pre-calculation phase

### 7. Lazy Evaluation
**Challenge**: Position fields shouldn't parse until accessed
**Example**: Central directory at EOF shouldn't parse when reading files
**Solution**: Getter-based lazy evaluation in generated code

## Implementation Roadmap

### Step 1: Extend Computed Field Context
```typescript
interface ComputedContext {
  self: any;           // Current struct
  parent?: any;        // Parent struct
  root: any;           // Root document
  index?: number;      // Current array index
  position: number;    // Current byte position
}
```

### Step 2: Path Resolution Engine
```typescript
function resolvePath(path: string, context: ComputedContext): any {
  // Handle:
  // - "../field" - Parent reference
  // - "header.field" - Nested struct
  // - "_root.array[_index]" - Root with index
  // - "array.find(expr)" - Array operations
}
```

### Step 3: Expression Evaluator
```typescript
function evaluateExpression(expr: string, item: any): any {
  // Safe evaluation of:
  // - "sizeof(item)"
  // - "item.type == 0x01"
  // - "item.flags & 0x10"
}
```

### Step 4: Two-Pass Encoding
1. **Size calculation pass**: Compute all sizes without writing
2. **Write pass**: Write with known sizes

### Step 5: Lazy Position Fields
Generate getters that only parse when accessed:
```typescript
get data() {
  if (!this._data_cached) {
    this._decoder.seek(this.data_offset);
    this._data = DataBlock.decode(this._decoder);
    this._data_cached = true;
  }
  return this._data;
}
```

## Key Design Decisions

1. **Parent context chain**: Each nested struct maintains reference to parent
2. **Root always accessible**: `_root` available at any nesting level
3. **Array index context**: `_index` provided during array iteration
4. **Expression safety**: No eval(), use AST-based expression parser
5. **Lazy by default**: Position fields generate getters, not immediate values
6. **Size caching**: Computed sizes cached after first calculation

## Test-Driven Development Order

1. Start with Test 1.1 (basic parent reference)
2. Implement minimal parent context
3. Add Test 2.1 (struct field reference)
4. Implement dot notation parsing
5. Add Test 3.1 (array correlation)
6. Implement index context
7. Continue incrementally...

Each test failure guides the next implementation step.
