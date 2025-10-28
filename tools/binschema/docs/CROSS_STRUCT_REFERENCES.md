# Cross-Struct Reference System for ZIP Support

## Goal

Enable full ZIP encoding/decoding automation by supporting computed fields that reference data across struct boundaries.

## ZIP Requirements Analysis

A valid ZIP file requires these cross-struct references:

### 1. Parent→Child References
```
LocalFile {
  len_body: computed,        // Need to reference body field
  header: LocalFileHeader {
    len_body_compressed: ?   // Need to reference parent's body.length
    len_body_uncompressed: ? // Need uncompressed size
  }
  body: byte[]
}
```

### 2. Array Element Correlation
```
ZipArchive {
  sections: [
    LocalFile { ... },       // Position: 0
    LocalFile { ... },       // Position: 30
    CentralDirEntry {
      ofs_local_header: ?    // Need position of corresponding LocalFile
    },
    CentralDirEntry {
      ofs_local_header: ?    // Need position of corresponding LocalFile
    },
    EndOfCentralDir {
      ofs_central_dir: ?     // Need position of first CentralDirEntry
      len_central_dir: ?     // Need total size of all CentralDirEntries
    }
  ]
}
```

### 3. Aggregate Computations
```
EndOfCentralDir {
  len_central_dir: ?  // Sum of encoded sizes of all CentralDirEntry structs
}
```

## Proposed Syntax

### Parent Field Reference
```json
{
  "name": "len_body_compressed",
  "type": "uint32",
  "computed": {
    "type": "length_of",
    "target": "../body"
  }
}
```

### Array Element Correlation (Same Index)
```json
{
  "name": "ofs_local_header",
  "type": "uint32",
  "computed": {
    "type": "position_of",
    "target": "../../sections[same_index<LocalFile>]"
  }
}
```

### Array Element Position (First Match)
```json
{
  "name": "ofs_central_dir",
  "type": "uint32",
  "computed": {
    "type": "position_of",
    "target": "../sections[first<CentralDirEntry>]"
  }
}
```

### Aggregate Size Computation
```json
{
  "name": "len_central_dir",
  "type": "uint32",
  "computed": {
    "type": "size_of",
    "target": "../sections[all<CentralDirEntry>]"
  }
}
```

## Implementation Strategy

### Phase 1: Parent References
- [x] Basic same-struct references (DONE)
- [ ] Parent struct references using `../field` syntax
- [ ] Validation: ensure parent struct has the referenced field
- [ ] Code generation: pass parent context to nested encoders

### Phase 2: Array Correlation
- [ ] Design correlation mechanism (same_index, first, last, all)
- [ ] Track array element positions during encoding
- [ ] Support type filtering in array queries `[type<TypeName>]`
- [ ] Generate position/size lookup tables

### Phase 3: Two-Pass Encoding
Current encoding is single-pass. Cross-struct references require:
- **Pass 1**: Encode with placeholder values, track positions/sizes
- **Pass 2**: Re-encode with computed values filled in

Or: **Three-phase**:
- **Phase 1**: Calculate all positions (dry run, no writes)
- **Phase 2**: Calculate all computed values
- **Phase 3**: Actual encoding with all values known

### Phase 4: Compression
- [ ] Integrate deflate/inflate (pako library or native)
- [ ] Auto-compute CRC32 of uncompressed data
- [ ] Auto-compute compressed size
- [ ] Support compression_method field

## Open Questions

1. **Correlation identity**: How do we know which CentralDirEntry corresponds to which LocalFile?
   - Option A: Array index (sections[0] LocalFile → sections[2] CentralDirEntry)
   - Option B: Explicit correlation field (file_name matching)
   - Option C: User-provided mapping

2. **Encoding architecture**: Single-pass, two-pass, or three-phase?
   - Two-pass might be sufficient
   - Need to handle circular dependencies

3. **Memory efficiency**: For 5GB ZIPs with 300k files
   - Can't hold entire archive in memory
   - Need streaming support
   - Position tracking with minimal overhead

## Success Criteria

Full ZIP support means:
- [ ] Encode arbitrary files into valid ZIP (no manual calculations)
- [ ] Decode any real ZIP file (5GB, 300k files)
- [ ] Round-trip test: decode → encode → verify identical
- [ ] Works with compressed data (deflate)
- [ ] Opens in unzip, 7zip, macOS Archive Utility
