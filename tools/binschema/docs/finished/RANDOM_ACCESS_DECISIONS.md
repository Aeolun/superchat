# Random Access Implementation Decisions

**Date:** 2025-10-24
**Status:** Decided, ready for implementation

These decisions were made based on architecture review feedback and practical considerations.

---

## Decision 1: No Expression Language (Initially)

**Question:** Do we need a full expression language for position calculations?

**Decision:** **Start with simple field references only. Add arithmetic later if needed.**

**Rationale:**
- 90% of real formats just use `position: "header.offset"`
- Complex expressions add significant complexity (parser, validator, codegen)
- Can be added incrementally later without breaking changes
- Kaitai uses expressions because it also uses them for conditionals - we don't need that coupling

**Schema Syntax:**
```typescript
// Phase 1: Simple field references (90% of use cases)
{
  name: "data",
  type: "DataBlock",
  position: "header.data_offset"  // Dot notation for nested fields
}

// Negative positions (from EOF)
{
  name: "footer",
  type: "Footer",
  position: -22  // Number = bytes from end
}

// Future: Optional offset addition (if we find we need it)
{
  name: "aligned_data",
  type: "DataBlock",
  position: "header.data_offset",
  offset: 16  // Explicit offset addition
}
```

**Non-goals for Phase 1:**
- ❌ Arithmetic expressions: `"offset + 512"`
- ❌ Conditional expressions: `"flags.extended ? offset_ext : offset"`
- ❌ Bitwise operations: `"(flags & 0x3FFF)"`

---

## Decision 2: Clean Reader Design (No Retrofit)

**Question:** Should we retrofit the existing sequential reader?

**Decision:** **Design new reader interface from scratch. Nobody uses the current one yet.**

**Rationale:**
- No existing users to break
- Clean design easier to implement and maintain
- Can optimize for both sequential and random access
- Tests can still pass by updating to new API

**Reader Interface:**
```typescript
interface BinaryReader {
  // Core operations (both sequential and random)
  read(count: number): Uint8Array;
  tell(): number;      // Current position
  size(): number;      // Total size (if known)

  // Seeking (optional - checked at runtime)
  seek?(position: number): void;
  isSeekable(): boolean;
}

// Implementations:
class BufferReader implements BinaryReader {
  // Uint8Array - always seekable, fast
}

class FileReader implements BinaryReader {
  // Node.js fs.FileHandle - seekable, disk-based
}

class StreamReader implements BinaryReader {
  // ReadableStream - NOT seekable
  // Buffers entire stream on first position field access
  // Warns user about memory usage
}
```

---

## Decision 3: Simple Lazy Evaluation

**Question:** How should instance fields (lazy position fields) be cached?

**Decision:** **Evaluate once on first access, cache result in Map.**

**Rationale:**
- Simple to implement
- Prevents redundant seeks/reads
- Memory usage predictable (only accessed fields consume memory)
- Thread-safe in TypeScript (single-threaded)
- Go can add mutex easily

**Implementation Pattern:**
```typescript
class DecodedMessage {
  private _reader: BinaryReader;
  private _lazyFields = new Map<string, any>();

  // Regular fields (sequential)
  magic: number;
  version: number;

  // Lazy position field (getter)
  get data(): DataBlock {
    if (!this._lazyFields.has('data')) {
      // Seek to position
      const offset = this.data_offset;  // Reference to sequential field
      this._reader.seek(offset);

      // Decode type
      const decoded = DataBlockDecoder.decode(this._reader);

      // Cache result
      this._lazyFields.set('data', decoded);
    }
    return this._lazyFields.get('data')!;
  }
}
```

**Go Pattern:**
```go
type DecodedMessage struct {
  // Sequential fields
  Magic   uint32
  Version uint16

  // Lazy fields (private)
  dataOnce sync.Once
  dataVal  *DataBlock
  dataErr  error

  // Reader (kept for lazy access)
  reader SeekableReader
}

func (m *DecodedMessage) Data() (*DataBlock, error) {
  m.dataOnce.Do(func() {
    m.reader.Seek(m.DataOffset)
    m.dataVal, m.dataErr = DecodeDataBlock(m.reader)
  })
  return m.dataVal, m.dataErr
}
```

---

## Decision 4: Two-Phase Validation

**Question:** When should we validate position field references?

**Decision:** **Validate at both schema compile time AND runtime.**

**Schema Validation (Compile Time):**
- ✅ Position field references valid fields
- ✅ Referenced field is numeric type (or resolves to number)
- ✅ Circular dependencies detected (static analysis)
- ✅ Alignment is power of 2

**Runtime Validation:**
- ✅ Position value is within bounds (0 to file_size)
- ✅ Position + decoded type size doesn't exceed EOF
- ✅ Negative position resolves to valid offset
- ✅ Alignment requirement satisfied

**Error Examples:**
```typescript
// Schema validation error (caught early)
throw new SchemaValidationError(
  "Position field 'data' references non-existent field 'header.offset'"
);

// Runtime error (caught during decode)
throw new DecodeError(
  "Position 255 exceeds file size 100"
);
```

---

## Decision 5: Alignment Support (Required)

**Question:** Do we need alignment constraints?

**Decision:** **Yes, add optional alignment property to position fields.**

**Rationale:**
- Many binary formats require alignment (ELF, databases, GPU formats)
- Simple to validate (modulo check)
- Common requirement (not edge case)

**Schema Syntax:**
```typescript
{
  name: "section_data",
  type: "SectionData",
  position: "header.section_offset",
  alignment: 4  // Must be 4-byte aligned
}
```

**Validation:**
- Schema level: `alignment` must be power of 2 (1, 2, 4, 8, 16, ...)
- Runtime: `position % alignment == 0`

---

## Decision 6: Input Type Auto-Detection

**Question:** How should decoder select between seekable and buffered strategies?

**Decision:** **Auto-detect based on input type, warn when forced to buffer.**

**Strategy Selection:**
```typescript
function createDecoder(schema: BinarySchema, input: DecoderInput) {
  const needsRandomAccess = hasPositionFields(schema);

  if (!needsRandomAccess) {
    // Sequential-only schema - always use streaming
    return new SequentialDecoder(schema, input);
  }

  // Random access required - pick best strategy
  if (typeof input === 'string') {
    // File path - use seekable file (BEST)
    return new FileDecoder(schema, input);
  } else if (input instanceof Uint8Array) {
    // Already buffered - use directly
    return new BufferDecoder(schema, input);
  } else if (hasSeekMethod(input)) {
    // Seekable stream (Node.js FileHandle, etc.)
    return new SeekableDecoder(schema, input);
  } else {
    // Non-seekable stream - MUST buffer
    console.warn('Random access schema requires buffering entire stream');
    return new BufferedStreamDecoder(schema, input);
  }
}
```

**Input Types:**
- `string` → File path → `FileDecoder` (seekable, disk-based)
- `Uint8Array` → Buffer → `BufferDecoder` (in-memory, seekable)
- `FileHandle` → Node.js handle → `SeekableDecoder` (seekable, disk-based)
- `File` → Browser File API → `BrowserFileDecoder` (seekable, slice-based)
- `ReadableStream` → Stream → `BufferedStreamDecoder` (buffered with warning)

---

## Decision 7: Position Field Schema Type

**Question:** What's the exact schema structure for position fields?

**Decision:** **Use `instances` array with position property.**

**Schema Structure:**
```typescript
{
  types: {
    "MyType": {
      sequence: [
        // Regular sequential fields (parsed immediately)
        { name: "magic", type: "uint32" },
        { name: "data_offset", type: "uint32" }
      ],
      instances: [
        // Lazy position-based fields (parsed on access)
        {
          name: "data",
          type: "DataBlock",
          position: "data_offset",  // Field reference or negative number
          size: "data_size",        // Optional: size hint
          alignment: 4,             // Optional: alignment requirement
          description: "File data section"
        }
      ]
    }
  }
}
```

**Zod Schema:**
```typescript
const PositionFieldSchema = z.object({
  name: z.string(),
  type: z.string(),  // Type to decode
  position: z.union([
    z.number(),      // Absolute offset or negative (from EOF)
    z.string()       // Field reference (e.g., "header.offset")
  ]),
  size: z.union([
    z.number(),      // Fixed size
    z.string()       // Field reference
  ]).optional(),
  alignment: z.number().optional(),  // Power of 2
  description: z.string().optional()
});

const TypeDefSchema = z.object({
  sequence: z.array(FieldSchema),
  instances: z.array(PositionFieldSchema).optional()  // NEW
});
```

---

## Decision 8: Error Handling Strategy

**Question:** How to handle errors in position fields?

**Decision:** **Fail fast with descriptive errors.**

**Error Categories:**

1. **Schema Validation Errors** (fail at schema load):
   - Invalid position reference
   - Circular dependencies
   - Non-numeric position field
   - Invalid alignment value

2. **Decode Errors** (fail during parsing):
   - Position beyond EOF
   - Position + size exceeds EOF
   - Alignment violation
   - Lazy field decode failure

**Error Messages:**
```typescript
// Good error messages
throw new DecodeError(
  "Position field 'data' at offset 255 exceeds file size 100"
);

throw new AlignmentError(
  "Position 6 is not aligned to 4 bytes (6 % 4 = 2)"
);

// Include context
throw new SchemaValidationError(
  "Circular dependency: block_a -> ref_b -> ref_a",
  { path: "types.MyType.instances.block_a" }
);
```

---

## Next Steps

With these decisions made, we can proceed directly to implementation:

1. ✅ **Schema extensions** - Add `instances` array to TypeDefSchema
2. ✅ **Reader interface** - Implement BinaryReader interface
3. ✅ **Schema validation** - Add position field validation
4. ✅ **Tests are written** - Ready to TDD

**No Phase 0.5 needed** - decisions are made, tests are written, ready to implement!

---

## Open Questions (For Future)

These can be decided later as needs arise:

1. **Arithmetic expressions** - Wait until we find a real format that needs them
2. **Relative positions** - Not needed for ZIP/ELF, can add later
3. **Memory-mapped files** - Optimization, not core feature
4. **Concurrent reads** - Go optimization, not needed initially
