# Random Access & Position-Based Parsing

## Overview

Add support for random-access/seekable parsing to BinSchema, enabling formats like ZIP, ELF, PE, and databases that use pointer-based structures and non-sequential layouts.

**Status:** Planning

**Target:** Enable parsing of ~40% more binary formats (those requiring absolute positioning)

---

## Motivation

Many binary formats cannot be parsed sequentially:

1. **Directory at end** (ZIP): Central directory at EOF, points backward to file data
2. **Pointer-based** (ELF): Header contains offsets to scattered sections
3. **Index structures** (databases): Index points to data pages throughout file
4. **Cross-references** (executables): Sections reference each other by offset

**Current limitation:** BinSchema assumes sequential parsing (stream-based).

**Proposed solution:** Support both sequential (default) and random-access (when needed) modes.

---

## Design Principles

1. **Backward compatible** - Existing sequential schemas unchanged
2. **Automatic detection** - Schema analyzer detects random access requirement
3. **Memory efficient** - Prefer seeking over buffering when possible
4. **Platform appropriate** - Use best strategy per platform (mmap, seek, buffer)
5. **Test-driven** - Comprehensive tests before implementation

---

## Three-Tier Access Strategy

```
1. Seekable file (best)    → os.File.ReadAt() / fs.FileHandle.read()
2. Seekable stream (good)  → io.ReadSeeker / Node.js streams
3. Buffered (fallback)     → Load entire input, works anywhere
```

**Memory usage comparison (1GB ZIP file):**
- Sequential buffering: 1 GB RAM
- Seekable file: ~100 KB RAM (only reads needed sections)
- Memory-mapped: ~0 RAM (OS handles paging)

---

## Schema Extensions

### Position-based Fields

```typescript
{
  name: "central_directory",
  type: "CentralDirectory",
  position: "end_record.central_dir_offset",  // Jump to this offset
  size: "end_record.central_dir_size"         // Optional size hint
}
```

### Instance Fields (Lazy/Deferred)

```typescript
{
  types: {
    "ZipFile": {
      sequence: [
        { name: "magic", type: "bytes", length: 4 },
        { name: "ofs_data", type: "uint32" }
      ],
      instances: [  // Parsed lazily when accessed
        {
          name: "data",
          type: "FileData",
          position: "ofs_data",
          size: "data_length"
        }
      ]
    }
  }
}
```

### Negative Positions (from EOF)

```typescript
{
  name: "end_record",
  type: "EndOfCentralDirectory",
  position: -22,  // Last 22 bytes of file
  size: 22
}
```

---

## Implementation Plan

### Phase 1: Schema Design & Validation
- [ ] Define `PositionField` schema type
- [ ] Define `InstanceField` schema type (lazy/deferred)
- [ ] Add position expressions (field references: `"header.offset"`)
- [ ] Add negative position support (from EOF: `-22`)
- [ ] Schema validator: detect random access requirement
- [ ] Schema validator: ensure position fields have valid targets
- [ ] Update `binary-schema.ts` with new types
- [ ] Add metadata/documentation for new field types

### Phase 2: Test Suite (TDD)
- [ ] **Write tests FIRST** (see Test Plan below)
- [ ] Simple position field test (fixed offset)
- [ ] Position field with expression (field reference)
- [ ] Negative position test (from EOF)
- [ ] Instance field test (lazy evaluation)
- [ ] Multiple position fields test
- [ ] ZIP-like format test (directory at end)
- [ ] ELF-like format test (scattered sections)
- [ ] Cross-reference test (section A references section B)
- [ ] Sequential vs random access detection test
- [ ] Memory usage tests (verify no full buffering)
- [ ] **Have architecture agent review tests**

### Phase 3: TypeScript Runtime (Seekable Files)
- [ ] `SeekableReader` interface
- [ ] `FileHandleReader` implementation (Node.js `fs.FileHandle`)
- [ ] `BufferReader` implementation (in-memory fallback)
- [ ] Position field runtime support
- [ ] Instance field runtime support (lazy getters)
- [ ] Expression evaluator for position calculations
- [ ] Auto-detect input type (path vs buffer vs stream)
- [ ] Warning when forced to buffer

### Phase 4: TypeScript Code Generation
- [ ] Detect schemas requiring random access
- [ ] Generate decoder with seekable reader
- [ ] Generate lazy instance getters
- [ ] Generate position field accessors
- [ ] Generate input type detection
- [ ] Update existing generators to skip position/instance fields in sequence
- [ ] Documentation generation for position fields

### Phase 5: Go Runtime (Native Seeking)
- [ ] `SeekableDecoder` interface
- [ ] `FileDecoder` implementation (`os.File` + `ReadAt()`)
- [ ] `ReaderAtDecoder` implementation (`io.ReaderAt`)
- [ ] `BufferDecoder` implementation (fallback)
- [ ] Position field support
- [ ] Instance field support (lazy methods)
- [ ] Expression evaluator
- [ ] Input type detection

### Phase 6: Go Code Generation
- [ ] Generate seekable decoder structs
- [ ] Generate lazy instance methods
- [ ] Generate position field accessors
- [ ] Input type factory function
- [ ] Error handling (seeking vs buffering)

### Phase 7: Browser Support (File API)
- [ ] `BrowserFileReader` implementation (`File.slice()`)
- [ ] Large file handling documentation
- [ ] Progressive parsing examples

### Phase 8: Optimizations
- [ ] Read-ahead cache for sequential-within-random patterns
- [ ] Concurrent section reading (Go goroutines)
- [ ] Memory-mapped file support investigation
- [ ] Performance benchmarks vs Kaitai

### Phase 9: Real-World Formats
- [ ] ZIP format schema
- [ ] ELF format schema (simplified)
- [ ] PNG format schema (chunks with lengths)
- [ ] SQLite format schema (B-tree pages)
- [ ] Documentation: converting Kaitai `pos:` to BinSchema

### Phase 10: Documentation
- [ ] User guide: when to use random access
- [ ] User guide: position field expressions
- [ ] User guide: instance fields
- [ ] API documentation for seekable readers
- [ ] Performance guide: memory usage
- [ ] Migration guide: adding random access to existing schemas
- [ ] Examples: ZIP, ELF, databases

---

## Test Plan

### Test Structure

Tests should be written in TypeScript using the existing test infrastructure:

```typescript
// File: src/tests/random-access/position-fields.test.ts
import { defineTestSuite } from "../../schema/test-schema.js";

export const positionFieldTests = defineTestSuite({
  name: "position_fields",
  description: "Position-based field parsing",
  schema: {
    config: { endianness: "big_endian" },
    types: {
      "FileWithIndex": {
        sequence: [
          { name: "magic", type: "uint32" },
          { name: "data_offset", type: "uint32" }
        ],
        instances: [
          {
            name: "data",
            type: "FileData",
            position: "data_offset"
          }
        ]
      },
      "FileData": {
        sequence: [
          { name: "value", type: "uint16" }
        ]
      }
    }
  },
  test_type: "FileWithIndex",
  test_cases: [
    {
      description: "Jump to offset specified in header",
      bytes: [
        // Header at offset 0
        0xDE, 0xAD, 0xBE, 0xEF,  // magic
        0x00, 0x00, 0x00, 0x0C,  // data_offset = 12
        // Padding (offset 8-11)
        0x00, 0x00, 0x00, 0x00,
        // FileData at offset 12
        0x12, 0x34                // value
      ],
      value: {
        magic: 0xDEADBEEF,
        data_offset: 12,
        data: { value: 0x1234 }  // Lazy field evaluated
      }
    }
  ]
});
```

### Required Test Cases

#### 1. Basic Position Fields
- [ ] Fixed position (absolute offset)
- [ ] Position from field reference (`"header.offset"`)
- [ ] Position with dot notation (`"header.flags.data_offset"`)
- [ ] Multiple position fields (non-overlapping)
- [ ] Position field at EOF
- [ ] Position field before current position (backward seek)

#### 2. Negative Positions (from EOF)
- [ ] Simple negative position (`-22` for last 22 bytes)
- [ ] Negative position with calculation (`-(header.footer_size)`)
- [ ] Reading footer then jumping forward to data

#### 3. Instance Fields (Lazy)
- [ ] Instance field not accessed (verify no parsing)
- [ ] Instance field accessed once (verify single parse)
- [ ] Instance field accessed multiple times (verify caching)
- [ ] Multiple instance fields (verify independent lazy eval)
- [ ] Instance field referencing another instance field

#### 4. Real-World Format Patterns
- [ ] **ZIP-like**: Directory at end, points to files
- [ ] **ELF-like**: Header with offset table, scattered sections
- [ ] **PNG-like**: Sequential chunks with length prefixes
- [ ] **Database-like**: Index page points to data pages

#### 5. Edge Cases
- [ ] Position beyond EOF (error)
- [ ] Position to invalid offset (error)
- [ ] Circular references (A.pos → B, B.pos → A)
- [ ] Size mismatch (position + size exceeds EOF)
- [ ] Empty file with position fields (error)

#### 6. Memory & Performance
- [ ] Sequential schema doesn't buffer (memory test)
- [ ] Random access schema with seekable input doesn't buffer
- [ ] Random access schema with stream input does buffer
- [ ] Large file (>1GB) with seekable access (memory < 1MB)
- [ ] Reading same position multiple times (verify caching)

#### 7. Input Type Detection
- [ ] File path → seekable decoder
- [ ] Buffer → in-memory decoder
- [ ] Stream → buffered decoder (with warning)
- [ ] FileHandle → seekable decoder
- [ ] Browser File → slice-based decoder

#### 8. Cross-Language Compatibility
- [ ] TypeScript encoder → Go decoder (position fields)
- [ ] Go encoder → TypeScript decoder (position fields)
- [ ] Round-trip test with position fields

---

## Success Criteria

### Functionality
- ✅ All tests passing (100% coverage for position/instance fields)
- ✅ ZIP format successfully parsed (real .zip file)
- ✅ ELF format header successfully parsed (real binary)
- ✅ No false positives (sequential schemas still sequential)

### Performance
- ✅ 1GB file parsed with <10MB memory (seekable mode)
- ✅ Position field access <1ms (cached after first read)
- ✅ No full-file buffering unless unavoidable

### Developer Experience
- ✅ Clear error messages for invalid position references
- ✅ Warnings when forced to buffer
- ✅ Documentation with real-world examples
- ✅ Migration guide from sequential to random-access

---

## Example: ZIP Format Schema

```typescript
defineBinarySchema({
  config: {
    endianness: "little_endian",
  },
  types: {
    "ZipArchive": {
      sequence: [
        // Read local file headers sequentially from start
        {
          name: "local_files",
          type: "array",
          kind: "null_terminated",
          items: { type: "LocalFileRecord" }
        }
      ],
      instances: [
        // End of central directory at EOF
        {
          name: "end_of_central_dir",
          type: "EndOfCentralDir",
          position: -22,  // Last 22 bytes
          size: 22
        },
        // Central directory (lazy, read when accessed)
        {
          name: "central_directory",
          type: "CentralDirectory",
          position: "end_of_central_dir.central_dir_offset",
          size: "end_of_central_dir.central_dir_size"
        }
      ]
    },

    "LocalFileRecord": {
      sequence: [
        { name: "signature", type: "uint32" },  // 0x04034b50
        { name: "version", type: "uint16" },
        { name: "flags", type: "uint16" },
        { name: "compression", type: "uint16" },
        { name: "mod_time", type: "uint16" },
        { name: "mod_date", type: "uint16" },
        { name: "crc32", type: "uint32" },
        { name: "compressed_size", type: "uint32" },
        { name: "uncompressed_size", type: "uint32" },
        { name: "filename_length", type: "uint16" },
        { name: "extra_length", type: "uint16" },
        {
          name: "filename",
          type: "string",
          kind: "fixed",
          length_field: "filename_length",
          encoding: "utf8"
        },
        {
          name: "extra",
          type: "array",
          kind: "fixed",
          length_field: "extra_length",
          items: { type: "uint8" }
        },
        {
          name: "compressed_data",
          type: "array",
          kind: "fixed",
          length_field: "compressed_size",
          items: { type: "uint8" }
        }
      ]
    },

    "EndOfCentralDir": {
      sequence: [
        { name: "signature", type: "uint32" },  // 0x06054b50
        { name: "disk_number", type: "uint16" },
        { name: "disk_with_cd", type: "uint16" },
        { name: "disk_entries", type: "uint16" },
        { name: "total_entries", type: "uint16" },
        { name: "central_dir_size", type: "uint32" },
        { name: "central_dir_offset", type: "uint32" },
        { name: "comment_length", type: "uint16" }
      ]
    },

    "CentralDirectory": {
      sequence: [
        {
          name: "entries",
          type: "array",
          kind: "length_prefixed",
          length_field: "_root.end_of_central_dir.total_entries",
          items: { type: "CentralDirEntry" }
        }
      ]
    },

    "CentralDirEntry": {
      sequence: [
        { name: "signature", type: "uint32" },  // 0x02014b50
        { name: "version_made_by", type: "uint16" },
        { name: "version_needed", type: "uint16" },
        { name: "flags", type: "uint16" },
        { name: "compression", type: "uint16" },
        { name: "mod_time", type: "uint16" },
        { name: "mod_date", type: "uint16" },
        { name: "crc32", type: "uint32" },
        { name: "compressed_size", type: "uint32" },
        { name: "uncompressed_size", type: "uint32" },
        { name: "filename_length", type: "uint16" },
        { name: "extra_length", type: "uint16" },
        { name: "comment_length", type: "uint16" },
        { name: "disk_number", type: "uint16" },
        { name: "internal_attrs", type: "uint16" },
        { name: "external_attrs", type: "uint32" },
        { name: "local_header_offset", type: "uint32" },
        {
          name: "filename",
          type: "string",
          kind: "fixed",
          length_field: "filename_length",
          encoding: "utf8"
        }
      ],
      instances: [
        // Lazy reference to local file header
        {
          name: "local_file",
          type: "LocalFileRecord",
          position: "local_header_offset"
        }
      ]
    }
  }
});
```

---

## ✅ Decisions Made (See RANDOM_ACCESS_DECISIONS.md)

All key architecture decisions have been made:

1. **Expression language**: Start with simple field references only (no arithmetic initially)
2. **Reader design**: Clean slate, new BinaryReader interface
3. **Lazy evaluation**: Evaluate once, cache in Map
4. **Validation**: Two-phase (schema compile-time + runtime)
5. **Alignment**: Required, added to schema
6. **Input detection**: Auto-detect seekable vs buffered
7. **Error handling**: Fail fast with descriptive errors

**Ready to implement!** No Phase 0.5 needed.

---

## Non-Goals (For This Phase)

- ❌ Memory-mapped file support (future optimization)
- ❌ Streaming writes with position fields (read-only for now)
- ❌ Complex expression language (keep simple)
- ❌ Position field compression/encryption
- ❌ Network stream seeking (buffering is fine for now)

---

## References

- Kaitai Struct `pos:` documentation
- ZIP file format specification (APPNOTE.TXT)
- ELF format specification
- Node.js FileHandle API
- Go `io.ReaderAt` interface
- Browser File API
