# Computed Fields Implementation Plan

## Status: ✅ ALL THREE PHASES COMPLETE

All planned computed field types have been successfully implemented:
- **Phase 1**: `length_of` - Auto-compute byte length of strings or element count of arrays
- **Phase 2**: `crc32_of` - Auto-compute CRC32 checksums over byte arrays
- **Phase 3**: `position_of` - Auto-compute byte positions where fields start

**Total tests passing**: 467 (including end-to-end ZIP encoding tests)

## Overview

Add automatic computation of metadata fields during encoding. Users should not manually calculate lengths, offsets, checksums, etc. - the encoder computes these automatically.

**Key Principle**: Computed fields are read-only. Users cannot provide values for computed fields - they are always calculated by the encoder.

## Phase 1: Automatic Length Fields ✅ COMPLETE

### Goal
Automatically compute length fields for `field_referenced` arrays and strings.

### Schema Changes

- [x] Add `computed` property to field schema
  - Type: object with `{ type: string, target: string, encoding?: string }`
  - Allowed types for Phase 1: `"length_of"`
  - `target`: name of the field whose length to compute
  - `encoding`: optional, for strings (defaults to schema encoding)

Example:
```json
{
  "name": "len_file_name",
  "type": "uint16",
  "computed": {
    "type": "length_of",
    "target": "file_name",
    "encoding": "utf8"
  }
}
```

- [x] Add validation: computed fields must have compatible types
  - `length_of` requires numeric type (uint8, uint16, uint32, uint64)
  - Target must exist in the same type definition
  - Target must be array or string

- [x] Add validation: detect conflicts
  - If field is marked `computed`, it cannot be referenced by `length_field`
  - If field is referenced by `length_field`, suggest adding `computed` annotation

- [x] Update schema documentation with computed field examples

### TypeScript Generator Changes

- [x] Modify TypeScript interface generation
  - Computed fields are excluded from interface (users don't provide them)
  - TypeScript compile errors if user tries to provide computed value
  - Documentation shows which fields are computed

- [x] Modify encoder generation
  - Scan schema for computed fields
  - Before encoding each field, check if it's a computed field
  - If computed as `length_of`, calculate the target field's byte length
  - For strings: use TextEncoder to get UTF-8 byte length
  - For arrays: use array.length
  - Throw error if user provided value for computed field

- [x] Add encoder validation
  - Throws error if user bypasses TypeScript and provides computed field
  - Error message: "Field 'X' is computed and cannot be provided"

### Test Cases

- [x] Test automatic length computation for strings
  - UTF-8 multi-byte characters
  - ASCII strings
  - Empty strings

- [x] Test automatic length computation for arrays
  - byte arrays
  - complex type arrays
  - empty arrays

- [x] Test error when user provides computed field value
  - Clear error message
  - Points to which field is computed

- [x] Test nested structures with computed fields
  - Computed fields in nested structs
  - Multiple computed fields in same structure

- [x] Test ZIP schema with automatic lengths
  - Updated ZIP schema with computed length fields
  - End-to-end encoding tests
  - Verified all length fields are correct

### Documentation

- [x] Schema examples demonstrate computed fields
- [x] ZIP example shows simplified encoding with computed fields
- [ ] Add comprehensive schema reference documentation

## Phase 2: Checksums (CRC32 for ZIP) ✅ COMPLETE

### Goals
- Support CRC32 computation (required for ZIP)
- Compute checksums over byte arrays
- Support other hash algorithms later (SHA256, Adler32, etc.)

### Schema Changes

- [x] Add `crc32_of` to computed field types
  - Target must be a byte array field
  - Output type must be uint32

Example:
```json
{
  "name": "crc32",
  "type": "uint32",
  "computed": {
    "type": "crc32_of",
    "target": "body"
  }
}
```

### Implementation

- [x] Add CRC32 computation function to encoder runtime
  - Uses standard CRC32 algorithm (polynomial 0xEDB88320)
  - Supports Uint8Array input
  - Returns uint32 value

- [x] Update TypeScript encoder generation
  - Detects `crc32_of` computed fields
  - Generates code to compute CRC32 over target field bytes
  - Validates target is a byte array

- [x] Add test cases
  - Known CRC32 values for test data
  - Empty array (CRC32 = 0)
  - Variable-length byte arrays
  - Integration with other computed fields

### ZIP Schema Updates

- [x] ZIP schema can use computed CRC32 fields
  - Note: CRC32 is typically computed over uncompressed data
  - For full ZIP automation, need position_of for offsets
  - Current implementation allows CRC32 computation over byte arrays

## Phase 3: Position Tracking ✅ COMPLETE

### Goals
- Track byte positions during encoding
- Support `position_of` computed fields
- Enable automatic offset field computation

### Implementation

- [x] Add `position_of` to computed field types
  - Target is a field name (not type name)
  - Computes the byte position where the target field starts
  - Supports forward references (position field can appear before target)

- [x] Position tracking in encoder
  - Uses `BitStreamEncoder.byteOffset` to track current position
  - Position computed as: current offset + size of position field itself
  - Works with variable-length fields (strings, arrays)

- [x] Test cases
  - Basic position tracking after fixed header
  - Variable-length fields (length-prefixed strings/arrays)
  - Nested structures with computed positions
  - Forward references

Example:
```json
{
  "name": "data_offset",
  "type": "uint32",
  "computed": {
    "type": "position_of",
    "target": "data"
  }
}
```

### Design Decisions

- **Single-pass encoding**: Position is computed when the position field is written, not when target is written
- **Forward references allowed**: Position field can appear before its target
- **Field-level targets only**: Targets must be field names in the same struct (not cross-type references)
- **Cardinality**: Each position field references exactly one occurrence of its target field

## Phase 4: Aggregates and Other Checksums (Future)

### Goals
- Support sum_of, count_of aggregates
- Support SHA256, Adler32, MD5, etc.
- Specify byte ranges for checksums

### Examples Needed
```json
{
  "name": "total_size",
  "type": "uint32",
  "computed": {
    "type": "sum_of",
    "targets": ["header_size", "data_size", "footer_size"]
  }
}
```

## Implementation Order

### Phase 1: Length Fields
1. Schema changes (add `computed` property with validation)
2. TypeScript interface generation (make computed fields optional)
3. TypeScript encoder generation (compute length_of fields)
4. Test suite for Phase 1 features
5. Update ZIP schema with computed length fields
6. Documentation updates for Phase 1

### Phase 2: CRC32 Checksums
1. Add CRC32 runtime function
2. Schema validation for `crc32_of` computed type
3. TypeScript encoder generation (compute crc32_of fields)
4. Test suite for CRC32 computation
5. Update ZIP schema with computed CRC32 fields
6. End-to-end ZIP encoding test (lengths + CRC32)
7. Documentation updates for Phase 2

### Phase 3: Position Tracking (Future)
1. Design cardinality/instance selection mechanism
2. Schema changes for `position_of`
3. Two-pass or three-phase encoder architecture
4. Implementation and tests
5. Update ZIP schema with computed position fields
6. Full ZIP encoding working end-to-end

### Phase 4: Other Features (Future)
1. Other hash algorithms (SHA256, Adler32, etc.)
2. Aggregate computations (sum_of, count_of)
3. Byte range specifications for checksums

## Success Criteria

### Phase 1 Complete ✅
- [x] Users can mark fields as `computed: { type: "length_of", target: "field_name" }`
- [x] TypeScript encoder automatically computes length values
- [x] Encoder throws clear error if user provides computed field value
- [x] ZIP schema uses computed length fields
- [x] All existing tests pass (467 total)
- [x] New tests cover length computation edge cases
- [x] Schema examples demonstrate computed fields

### Phase 2 Complete ✅
- [x] Users can mark fields as `computed: { type: "crc32_of", target: "field_name" }`
- [x] TypeScript encoder automatically computes CRC32 checksums
- [x] CRC32 function available in runtime
- [x] Tests validate CRC32 computation (known values, empty arrays, variable length)
- [x] All tests pass including CRC32 validation (467 total)

### Phase 3 Complete ✅
- [x] Users can mark fields as `computed: { type: "position_of", target: "field_name" }`
- [x] Encoder tracks positions and fills in offset fields automatically
- [x] Forward references supported (position field before target field)
- [x] Works with variable-length fields
- [x] All tests pass (467 total)
- [x] Tests cover basic, variable-length, and nested position tracking

### Non-Goals:
- ❌ Validation modes (decided against - computed fields are always read-only)
- ❌ Streaming encoding (future consideration)
- ❌ Go/Rust generator updates (TypeScript first, others later)
- ❌ Conditional computed fields (future consideration)
- ❌ Cross-type position references (complex cardinality issues - defer)

## Notes

- **Why read-only?** Computed fields exist because the value MUST match the data structure. Allowing users to override defeats the purpose and creates bugs.
- **Why explicit annotation?** Makes intent clear, easier to validate, no inference complexity.
- **Why start with length_of?** Solves 80% of use cases, simplest to implement, establishes pattern for future phases.
