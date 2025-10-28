# Computed Fields Implementation Plan

## Overview

Add automatic computation of metadata fields during encoding. Users should not manually calculate lengths, offsets, checksums, etc. - the encoder computes these automatically.

**Key Principle**: Computed fields are read-only. Users cannot provide values for computed fields - they are always calculated by the encoder.

## Phase 1: Automatic Length Fields

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

- [ ] Update schema documentation with computed field examples

### TypeScript Generator Changes

- [ ] Modify TypeScript interface generation
  - Computed fields should be optional in the interface (users don't provide them)
  - Or use a separate builder/options interface
  - Document which fields are computed

- [ ] Modify encoder generation
  - Scan schema for all `field_referenced` arrays/strings
  - Build map of which fields are used as length fields
  - Before encoding each field, check if it's a computed field
  - If computed as `length_of`, calculate the target field's byte length
  - For strings: use TextEncoder to get byte length with correct encoding
  - For arrays: use array.length
  - Throw error if user provided value for computed field

- [ ] Add encoder validation
  - Throw clear error if user provides value for computed field
  - Error message: "Field 'X' is computed and cannot be set manually"

### Test Cases

- [ ] Test automatic length computation for strings
  - UTF-8 multi-byte characters
  - ASCII strings
  - Empty strings

- [ ] Test automatic length computation for arrays
  - byte arrays
  - complex type arrays
  - empty arrays

- [ ] Test error when user provides computed field value
  - Clear error message
  - Points to which field is computed

- [ ] Test nested field references
  - `header.len_file_name` style references
  - Ensure computed values are available for nested references

- [ ] Test ZIP schema with automatic lengths
  - Update ZIP schema to mark length fields as computed
  - Verify encoding produces valid ZIP
  - Verify all length fields are correct

### Documentation

- [ ] Update schema reference docs
  - Document `computed` property
  - Show examples of `length_of`
  - Explain read-only nature

- [ ] Add migration guide
  - How to update existing schemas to use computed fields
  - What to do with manual length calculations in user code

- [ ] Update ZIP example
  - Show before/after with computed fields
  - Demonstrate simplified encoding

## Phase 2: Checksums (CRC32 for ZIP)

### Goals
- Support CRC32 computation (required for ZIP)
- Compute checksums over byte arrays
- Support other hash algorithms later (SHA256, Adler32, etc.)

### Schema Changes

- [ ] Add `crc32_of` to computed field types
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

- [ ] Add CRC32 computation function to encoder runtime
  - Use standard CRC32 algorithm (polynomial 0xEDB88320)
  - Support Uint8Array input
  - Return uint32 value

- [ ] Update TypeScript encoder generation
  - Detect `crc32_of` computed fields
  - Generate code to compute CRC32 over target field bytes
  - Throw error if target is not a byte array

- [ ] Add test cases
  - Known CRC32 values for test data
  - Empty array (CRC32 should be 0)
  - ZIP file CRC32 validation

### ZIP Schema Updates

- [ ] Mark `crc32` fields as computed in ZIP schema
  - LocalFileHeader.crc32
  - DataDescriptor.crc32
  - CentralDirEntry.crc32 (same as LocalFileHeader)

- [ ] Test end-to-end ZIP encoding with computed CRC32
  - Verify generated ZIP is valid
  - Verify CRC32 values match expected

## Phase 3: Position Tracking (Future)

### Goals
- Track byte positions during encoding
- Support `position_of` computed fields
- Handle multiple instances (cardinality problem)

### Open Design Questions
- [ ] How to specify which instance (current, index, correlation)?
- [ ] How to handle forward references vs backward references?
- [ ] Two-pass or three-phase encoding architecture?
- [ ] How to expose position tracking in encoder API?

### Examples Needed
```json
{
  "name": "ofs_local_header",
  "type": "uint32",
  "computed": {
    "type": "position_of",
    "target": "LocalFile",
    "instance": "current"  // or index, or correlation
  }
}
```

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

### Phase 1 Complete When:
- [ ] Users can mark fields as `computed: { type: "length_of", target: "field_name" }`
- [ ] TypeScript encoder automatically computes length values
- [ ] Encoder throws clear error if user provides computed field value
- [ ] ZIP schema uses computed length fields (but still manual CRC32)
- [ ] All existing tests pass
- [ ] New tests cover length computation edge cases
- [ ] Documentation explains computed fields clearly

### Phase 2 Complete When:
- [ ] Users can mark fields as `computed: { type: "crc32_of", target: "field_name" }`
- [ ] TypeScript encoder automatically computes CRC32 checksums
- [ ] ZIP schema uses computed CRC32 fields
- [ ] Can encode a valid ZIP file with only providing file data (no manual lengths or CRC32)
- [ ] Generated ZIPs are readable by standard tools (unzip, 7zip, etc.)
- [ ] All tests pass including CRC32 validation

### Phase 3 Complete When:
- [ ] Users can mark fields as `computed: { type: "position_of", target: "TypeName" }`
- [ ] Encoder tracks positions and fills in offset fields automatically
- [ ] ZIP schema uses computed position fields
- [ ] Can encode a complete ZIP file with zero manual metadata (full automation)
- [ ] Documentation covers position tracking

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
