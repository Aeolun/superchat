# Comprehensive ZIP Test Suite Design

This document outlines a complete test suite for implementing full ZIP format support in BinSchema. Tests are organized from simple to complex, building up the features needed for complete ZIP support.

## Test Suite Organization

Tests are grouped into logical categories:
1. **Parent References** - Child structs referencing parent fields
2. **Struct Field References** - Accessing nested struct fields via dot notation
3. **Array Correlation** - Matching array indices across different sections
4. **Aggregate Computation** - Computing values over collections
5. **Position Tracking** - Advanced position_of usage
6. **Compression** - Deflate/inflate integration
7. **End-to-End ZIP** - Complete ZIP archive tests

---

## 1. Parent References

These tests validate that child structs can reference fields in their parent struct.

### Test 1.1: Basic Parent Reference
```typescript
{
  name: "parent_ref_basic",
  feature: "Child struct references immediate parent's field",
  schema: {
    config: { endianness: "little_endian" },
    types: {
      "Header": {
        sequence: [
          { 
            name: "body_len", 
            type: "uint32", 
            computed: { type: "length_of", target: "../body" } 
          }
        ]
      },
      "Message": {
        sequence: [
          { name: "header", type: "Header" },
          { name: "body", type: "array", kind: "field_referenced", 
            length_field: "header.body_len", items: { type: "uint8" } }
        ]
      }
    }
  },
  input: {
    header: {},
    body: [0xAA, 0xBB, 0xCC]
  },
  decoded: {
    header: { body_len: 3 },
    body: [0xAA, 0xBB, 0xCC]
  },
  bytes: [3, 0, 0, 0, 0xAA, 0xBB, 0xCC],
  why: "LocalFileHeader.len_body_compressed must reference parent LocalFile.body"
}
```

### Test 1.2: Double Parent Reference (Grandparent)
```typescript
{
  name: "parent_ref_grandparent",
  feature: "Deeply nested struct references grandparent field",
  schema: {
    config: { endianness: "little_endian" },
    types: {
      "NestedHeader": {
        sequence: [
          { name: "crc", type: "uint32", 
            computed: { type: "crc32_of", target: "../../data" } }
        ]
      },
      "Header": {
        sequence: [
          { name: "nested", type: "NestedHeader" }
        ]
      },
      "Container": {
        sequence: [
          { name: "header", type: "Header" },
          { name: "data", type: "array", kind: "fixed", length: 4, 
            items: { type: "uint8" } }
        ]
      }
    }
  },
  input: {
    header: { nested: {} },
    data: [0x01, 0x02, 0x03, 0x04]
  },
  decoded: {
    header: { nested: { crc: 0xB63CFBCD } },  // CRC32([1,2,3,4])
    data: [0x01, 0x02, 0x03, 0x04]
  },
  bytes: [0xCD, 0xFB, 0x3C, 0xB6, 0x01, 0x02, 0x03, 0x04],
  why: "Nested structures in ZIP may need to reference data in containing structures"
}
```

### Test 1.3: Parent Array Reference
```typescript
{
  name: "parent_ref_array_element",
  feature: "Child references parent when parent is array element",
  schema: {
    config: { endianness: "big_endian" },
    types: {
      "ItemHeader": {
        sequence: [
          { name: "data_len", type: "uint16",
            computed: { type: "length_of", target: "../data" } }
        ]
      },
      "Item": {
        sequence: [
          { name: "header", type: "ItemHeader" },
          { name: "data", type: "array", kind: "field_referenced",
            length_field: "header.data_len", items: { type: "uint8" } }
        ]
      },
      "Container": {
        sequence: [
          { name: "items", type: "array", kind: "fixed", length: 2,
            items: { type: "Item" } }
        ]
      }
    }
  },
  input: {
    items: [
      { header: {}, data: [0xAA, 0xBB] },
      { header: {}, data: [0xCC] }
    ]
  },
  decoded: {
    items: [
      { header: { data_len: 2 }, data: [0xAA, 0xBB] },
      { header: { data_len: 1 }, data: [0xCC] }
    ]
  },
  bytes: [0x00, 0x02, 0xAA, 0xBB, 0x00, 0x01, 0xCC],
  why: "Each LocalFile in ZIP sections array has header referencing its body"
}
```

---

## 2. Struct Field References

These tests validate accessing nested struct fields using dot notation.

### Test 2.1: Basic Struct Field Reference
```typescript
{
  name: "struct_field_ref_basic",
  feature: "Reference field within nested struct",
  schema: {
    config: { endianness: "little_endian" },
    types: {
      "Header": {
        sequence: [
          { name: "size", type: "uint32" }
        ]
      },
      "File": {
        sequence: [
          { name: "header", type: "Header" },
          { name: "data", type: "array", kind: "field_referenced",
            length_field: "header.size", items: { type: "uint8" } }
        ]
      }
    }
  },
  input: {
    header: { size: 3 },
    data: [0x11, 0x22, 0x33]
  },
  decoded: {
    header: { size: 3 },
    data: [0x11, 0x22, 0x33]
  },
  bytes: [3, 0, 0, 0, 0x11, 0x22, 0x33],
  why: "Need to reference header.field_name pattern throughout ZIP"
}
```

### Test 2.2: Multi-level Struct Field Reference
```typescript
{
  name: "struct_field_ref_multilevel",
  feature: "Reference deeply nested struct fields",
  schema: {
    config: { endianness: "big_endian" },
    types: {
      "Metadata": {
        sequence: [
          { name: "total_size", type: "uint16" }
        ]
      },
      "Header": {
        sequence: [
          { name: "meta", type: "Metadata" }
        ]
      },
      "Package": {
        sequence: [
          { name: "header", type: "Header" },
          { name: "payload", type: "array", kind: "field_referenced",
            length_field: "header.meta.total_size", items: { type: "uint8" } }
        ]
      }
    }
  },
  input: {
    header: { meta: { total_size: 4 } },
    payload: [0xDE, 0xAD, 0xBE, 0xEF]
  },
  decoded: {
    header: { meta: { total_size: 4 } },
    payload: [0xDE, 0xAD, 0xBE, 0xEF]
  },
  bytes: [0x00, 0x04, 0xDE, 0xAD, 0xBE, 0xEF],
  why: "Complex ZIP structures may have deeply nested size fields"
}
```

---

## 3. Array Correlation

These tests validate correlating elements across different arrays.

### Test 3.1: Basic Array Index Correlation
```typescript
{
  name: "array_correlation_basic",
  feature: "CentralDirEntry correlates with LocalFile by index",
  schema: {
    config: { endianness: "little_endian" },
    types: {
      "LocalFile": {
        sequence: [
          { name: "signature", type: "uint16" },
          { name: "data", type: "array", kind: "fixed", length: 2,
            items: { type: "uint8" } }
        ]
      },
      "CentralDirEntry": {
        sequence: [
          { name: "signature", type: "uint16" },
          { name: "local_file_offset", type: "uint32",
            computed: { 
              type: "position_of", 
              target: "_root.local_files[_index]" 
            }
          }
        ]
      },
      "Archive": {
        sequence: [
          { name: "local_files", type: "array", kind: "fixed", length: 2,
            items: { type: "LocalFile" } },
          { name: "central_dir", type: "array", kind: "fixed", length: 2,
            items: { type: "CentralDirEntry" } }
        ]
      }
    }
  },
  input: {
    local_files: [
      { signature: 0x0403, data: [0xAA, 0xBB] },
      { signature: 0x0403, data: [0xCC, 0xDD] }
    ],
    central_dir: [
      { signature: 0x0201 },
      { signature: 0x0201 }
    ]
  },
  decoded: {
    local_files: [
      { signature: 0x0403, data: [0xAA, 0xBB] },
      { signature: 0x0403, data: [0xCC, 0xDD] }
    ],
    central_dir: [
      { signature: 0x0201, local_file_offset: 0 },
      { signature: 0x0201, local_file_offset: 4 }
    ]
  },
  bytes: [
    // LocalFiles
    0x03, 0x04, 0xAA, 0xBB,  // First at offset 0
    0x03, 0x04, 0xCC, 0xDD,  // Second at offset 4
    // CentralDir
    0x01, 0x02, 0x00, 0x00, 0x00, 0x00,  // Points to offset 0
    0x01, 0x02, 0x04, 0x00, 0x00, 0x00   // Points to offset 4
  ],
  why: "Each CentralDirEntry must know offset of corresponding LocalFile"
}
```

### Test 3.2: Filtered Array Correlation
```typescript
{
  name: "array_correlation_filtered",
  feature: "Correlate with filtered subset of array",
  schema: {
    config: { endianness: "little_endian" },
    types: {
      "Section": {
        sequence: [
          { name: "type", type: "uint8" },
          { name: "size", type: "uint16" }
        ]
      },
      "DirectoryEntry": {
        sequence: [
          { name: "file_index", type: "uint8" },
          { name: "file_offset", type: "uint32",
            computed: {
              type: "position_of",
              target: "_root.sections.filter(s => s.type == 1)[file_index]"
            }
          }
        ]
      },
      "Archive": {
        sequence: [
          { name: "sections", type: "array", kind: "fixed", length: 4,
            items: { type: "Section" } },
          { name: "directory", type: "array", kind: "fixed", length: 2,
            items: { type: "DirectoryEntry" } }
        ]
      }
    }
  },
  input: {
    sections: [
      { type: 1, size: 10 },   // File type
      { type: 2, size: 20 },   // Metadata type
      { type: 1, size: 30 },   // File type
      { type: 2, size: 40 }    // Metadata type
    ],
    directory: [
      { file_index: 0 },  // First file (sections[0])
      { file_index: 1 }   // Second file (sections[2])
    ]
  },
  decoded: {
    sections: [
      { type: 1, size: 10 },
      { type: 2, size: 20 },
      { type: 1, size: 30 },
      { type: 2, size: 40 }
    ],
    directory: [
      { file_index: 0, file_offset: 0 },
      { file_index: 1, file_offset: 6 }
    ]
  },
  bytes: [
    // Sections
    0x01, 0x0A, 0x00,  // Type 1, size 10 (offset 0)
    0x02, 0x14, 0x00,  // Type 2, size 20 (offset 3)
    0x01, 0x1E, 0x00,  // Type 1, size 30 (offset 6)
    0x02, 0x28, 0x00,  // Type 2, size 40 (offset 9)
    // Directory
    0x00, 0x00, 0x00, 0x00, 0x00,  // Index 0, offset 0
    0x01, 0x06, 0x00, 0x00, 0x00   // Index 1, offset 6
  ],
  why: "ZIP may have mixed section types, directory only references files"
}
```

---

## 4. Aggregate Computation

These tests validate computing aggregate values over collections.

### Test 4.1: Sum of Array Element Sizes
```typescript
{
  name: "aggregate_sum_sizes",
  feature: "Compute total size of all array elements",
  schema: {
    config: { endianness: "little_endian" },
    types: {
      "Entry": {
        sequence: [
          { name: "size", type: "uint16" },
          { name: "data", type: "array", kind: "field_referenced",
            length_field: "size", items: { type: "uint8" } }
        ]
      },
      "Directory": {
        sequence: [
          { name: "entries", type: "array", kind: "fixed", length: 3,
            items: { type: "Entry" } },
          { name: "total_size", type: "uint32",
            computed: {
              type: "sum_of",
              target: "entries",
              expression: "sizeof(item)"
            }
          }
        ]
      }
    }
  },
  input: {
    entries: [
      { size: 2, data: [0xAA, 0xBB] },
      { size: 1, data: [0xCC] },
      { size: 3, data: [0xDD, 0xEE, 0xFF] }
    ]
  },
  decoded: {
    entries: [
      { size: 2, data: [0xAA, 0xBB] },
      { size: 1, data: [0xCC] },
      { size: 3, data: [0xDD, 0xEE, 0xFF] }
    ],
    total_size: 12  // (2+2) + (2+1) + (2+3) = 12 bytes total
  },
  bytes: [
    0x02, 0x00, 0xAA, 0xBB,
    0x01, 0x00, 0xCC,
    0x03, 0x00, 0xDD, 0xEE, 0xFF,
    0x0C, 0x00, 0x00, 0x00
  ],
  why: "EndOfCentralDir.len_central_dir needs sum of all CentralDirEntry sizes"
}
```

### Test 4.2: Count with Filter
```typescript
{
  name: "aggregate_count_filtered",
  feature: "Count elements matching condition",
  schema: {
    config: { endianness: "big_endian" },
    types: {
      "Section": {
        sequence: [
          { name: "type", type: "uint8" },
          { name: "flags", type: "uint8" }
        ]
      },
      "Summary": {
        sequence: [
          { name: "sections", type: "array", kind: "fixed", length: 4,
            items: { type: "Section" } },
          { name: "file_count", type: "uint16",
            computed: {
              type: "count_of",
              target: "sections",
              condition: "item.type == 0x01"
            }
          }
        ]
      }
    }
  },
  input: {
    sections: [
      { type: 0x01, flags: 0x00 },  // File
      { type: 0x02, flags: 0x00 },  // Directory
      { type: 0x01, flags: 0x01 },  // File
      { type: 0x03, flags: 0x00 }   // Other
    ]
  },
  decoded: {
    sections: [
      { type: 0x01, flags: 0x00 },
      { type: 0x02, flags: 0x00 },
      { type: 0x01, flags: 0x01 },
      { type: 0x03, flags: 0x00 }
    ],
    file_count: 2  // Two sections with type == 0x01
  },
  bytes: [
    0x01, 0x00,
    0x02, 0x00,
    0x01, 0x01,
    0x03, 0x00,
    0x00, 0x02
  ],
  why: "ZIP end record needs count of central directory entries"
}
```

### Test 4.3: Position of First/Last Matching Element
```typescript
{
  name: "aggregate_position_first_last",
  feature: "Find position of first/last element matching condition",
  schema: {
    config: { endianness: "little_endian" },
    types: {
      "Section": {
        sequence: [
          { name: "magic", type: "uint16" }
        ]
      },
      "EndRecord": {
        sequence: [
          { name: "central_dir_offset", type: "uint32",
            computed: {
              type: "position_of",
              target: "_root.sections.find(s => s.magic == 0x0201)"
            }
          },
          { name: "end_central_dir_offset", type: "uint32",
            computed: {
              type: "position_of",
              target: "_root.sections.findLast(s => s.magic == 0x0201)",
              after: true  // Position after the element
            }
          }
        ]
      },
      "Archive": {
        sequence: [
          { name: "sections", type: "array", kind: "fixed", length: 5,
            items: { type: "Section" } },
          { name: "end_record", type: "EndRecord" }
        ]
      }
    }
  },
  input: {
    sections: [
      { magic: 0x0403 },  // LocalFile
      { magic: 0x0403 },  // LocalFile
      { magic: 0x0201 },  // CentralDir (first)
      { magic: 0x0201 },  // CentralDir
      { magic: 0x0201 }   // CentralDir (last)
    ],
    end_record: {}
  },
  decoded: {
    sections: [
      { magic: 0x0403 },
      { magic: 0x0403 },
      { magic: 0x0201 },
      { magic: 0x0201 },
      { magic: 0x0201 }
    ],
    end_record: {
      central_dir_offset: 4,   // Position of first 0x0201
      end_central_dir_offset: 10  // Position after last 0x0201
    }
  },
  bytes: [
    0x03, 0x04,  // sections[0] at offset 0
    0x03, 0x04,  // sections[1] at offset 2
    0x01, 0x02,  // sections[2] at offset 4 (first central dir)
    0x01, 0x02,  // sections[3] at offset 6
    0x01, 0x02,  // sections[4] at offset 8 (last central dir)
    0x04, 0x00, 0x00, 0x00,  // central_dir_offset = 4
    0x0A, 0x00, 0x00, 0x00   // end_central_dir_offset = 10
  ],
  why: "ZIP end record needs offset to start of central directory"
}
```

---

## 5. Position Tracking

These tests validate advanced position tracking capabilities.

### Test 5.1: Dynamic Position Tracking
```typescript
{
  name: "position_dynamic_tracking",
  feature: "Track positions during sequential parsing",
  schema: {
    config: { endianness: "little_endian" },
    types: {
      "VariableSection": {
        sequence: [
          { name: "type", type: "uint8" },
          { name: "size", type: "uint8" },
          { name: "data", type: "array", kind: "field_referenced",
            length_field: "size", items: { type: "uint8" } },
          { name: "position", type: "uint32",
            computed: { type: "position_of", target: "_self" }
          }
        ]
      },
      "Container": {
        sequence: [
          { name: "sections", type: "array", kind: "fixed", length: 3,
            items: { type: "VariableSection" } }
        ]
      }
    }
  },
  input: {
    sections: [
      { type: 1, size: 2, data: [0xAA, 0xBB] },
      { type: 2, size: 1, data: [0xCC] },
      { type: 3, size: 3, data: [0xDD, 0xEE, 0xFF] }
    ]
  },
  decoded: {
    sections: [
      { type: 1, size: 2, data: [0xAA, 0xBB], position: 0 },
      { type: 2, size: 1, data: [0xCC], position: 8 },
      { type: 3, size: 3, data: [0xDD, 0xEE, 0xFF], position: 13 }
    ]
  },
  bytes: [
    0x01, 0x02, 0xAA, 0xBB, 0x00, 0x00, 0x00, 0x00,
    0x02, 0x01, 0xCC, 0x08, 0x00, 0x00, 0x00,
    0x03, 0x03, 0xDD, 0xEE, 0xFF, 0x0D, 0x00, 0x00, 0x00
  ],
  why: "Need to track positions of variable-sized sections for offset calculation"
}
```

### Test 5.2: Relative Position References
```typescript
{
  name: "position_relative_references",
  feature: "Compute positions relative to parent or specific anchor",
  schema: {
    config: { endianness: "little_endian" },
    types: {
      "Header": {
        sequence: [
          { name: "section_offset", type: "uint16",
            computed: {
              type: "position_of",
              target: "../data",
              relative_to: "_parent"
            }
          }
        ]
      },
      "Section": {
        sequence: [
          { name: "header", type: "Header" },
          { name: "data", type: "array", kind: "fixed", length: 2,
            items: { type: "uint8" } }
        ]
      }
    }
  },
  input: {
    header: {},
    data: [0xAA, 0xBB]
  },
  decoded: {
    header: { section_offset: 2 },  // Relative to parent start
    data: [0xAA, 0xBB]
  },
  bytes: [0x02, 0x00, 0xAA, 0xBB],
  why: "Some formats use relative offsets instead of absolute"
}
```

---

## 6. Compression

These tests validate compression/decompression integration.

### Test 6.1: Basic Deflate Compression
```typescript
{
  name: "compression_deflate_basic",
  feature: "Compress data field using deflate",
  schema: {
    config: { endianness: "little_endian" },
    types: {
      "CompressedFile": {
        sequence: [
          { name: "uncompressed_size", type: "uint32" },
          { name: "compressed_size", type: "uint32",
            computed: { type: "length_of", target: "compressed_data" }
          },
          { name: "compressed_data", type: "array",
            kind: "field_referenced",
            length_field: "compressed_size",
            items: { type: "uint8" },
            compression: {
              algorithm: "deflate",
              uncompressed_size_field: "uncompressed_size"
            }
          }
        ]
      }
    }
  },
  input: {
    uncompressed_size: 11,
    compressed_data: "Hello World"  // Will be compressed
  },
  decoded: {
    uncompressed_size: 11,
    compressed_size: 13,  // Actual compressed size
    compressed_data: [/* deflated bytes */]
  },
  bytes: [
    0x0B, 0x00, 0x00, 0x00,  // uncompressed_size = 11
    0x0D, 0x00, 0x00, 0x00,  // compressed_size = 13
    // Deflated "Hello World"
    0x78, 0x9C, 0xF2, 0x48, 0xCD, 0xC9, 0xC9, 0x57,
    0x08, 0xCF, 0x2F, 0xCA, 0x49, 0x01, 0x00
  ],
  why: "ZIP stores compressed file data with deflate algorithm"
}
```

### Test 6.2: Conditional Compression
```typescript
{
  name: "compression_conditional",
  feature: "Compress based on compression_method field",
  schema: {
    config: { endianness: "little_endian" },
    types: {
      "FlexibleFile": {
        sequence: [
          { name: "compression_method", type: "uint16" },
          { name: "uncompressed_size", type: "uint32" },
          { name: "compressed_size", type: "uint32",
            computed: { type: "length_of", target: "data" }
          },
          { name: "data", type: "array",
            kind: "field_referenced",
            length_field: "compressed_size",
            items: { type: "uint8" },
            compression: {
              algorithm_field: "compression_method",
              // 0 = stored (no compression)
              // 8 = deflate
              algorithms: {
                0: null,
                8: "deflate"
              },
              uncompressed_size_field: "uncompressed_size"
            }
          }
        ]
      }
    }
  },
  input: [
    {
      compression_method: 0,
      uncompressed_size: 4,
      data: [0xDE, 0xAD, 0xBE, 0xEF]
    },
    {
      compression_method: 8,
      uncompressed_size: 4,
      data: [0xDE, 0xAD, 0xBE, 0xEF]  // Will be deflated
    }
  ],
  decoded: [
    {
      compression_method: 0,
      uncompressed_size: 4,
      compressed_size: 4,
      data: [0xDE, 0xAD, 0xBE, 0xEF]
    },
    {
      compression_method: 8,
      uncompressed_size: 4,
      compressed_size: 12,  // Deflated size
      data: [/* deflated bytes */]
    }
  ],
  bytes: [
    // Uncompressed
    0x00, 0x00, 0x04, 0x00, 0x00, 0x00, 0x04, 0x00, 0x00, 0x00,
    0xDE, 0xAD, 0xBE, 0xEF,
    // Compressed
    0x08, 0x00, 0x04, 0x00, 0x00, 0x00, 0x0C, 0x00, 0x00, 0x00,
    0x78, 0x9C, 0x73, 0x71, 0x74, 0x71, 0x01, 0x00, 0x02, 0xFC, 0x01, 0x27
  ],
  why: "ZIP supports multiple compression methods per file"
}
```

---

## 7. End-to-End ZIP

These tests validate complete ZIP archive functionality.

### Test 7.1: Minimal ZIP Archive
```typescript
{
  name: "zip_minimal",
  feature: "Complete minimal ZIP with one file",
  schema: {
    // Full ZIP schema with all computed fields working
    config: { endianness: "little_endian" },
    types: {
      "LocalFileHeader": {
        sequence: [
          { name: "signature", type: "uint32", value: 0x04034b50 },
          { name: "version", type: "uint16" },
          { name: "flags", type: "uint16" },
          { name: "compression_method", type: "uint16" },
          { name: "file_mod_time", type: "uint32" },
          { name: "crc32", type: "uint32",
            computed: { type: "crc32_of", target: "../body" }
          },
          { name: "compressed_size", type: "uint32",
            computed: { type: "length_of", target: "../body" }
          },
          { name: "uncompressed_size", type: "uint32" },
          { name: "filename_len", type: "uint16",
            computed: { type: "length_of", target: "filename", encoding: "utf8" }
          },
          { name: "extra_len", type: "uint16",
            computed: { type: "length_of", target: "extra" }
          },
          { name: "filename", type: "string", kind: "field_referenced",
            length_field: "filename_len", encoding: "utf8" },
          { name: "extra", type: "array", kind: "field_referenced",
            length_field: "extra_len", items: { type: "uint8" } }
        ]
      },
      "LocalFile": {
        sequence: [
          { name: "header", type: "LocalFileHeader" },
          { name: "body", type: "array", kind: "field_referenced",
            length_field: "header.compressed_size",
            items: { type: "uint8" },
            compression: {
              algorithm_field: "header.compression_method",
              algorithms: { 0: null, 8: "deflate" }
            }
          }
        ]
      },
      "CentralDirEntry": {
        sequence: [
          { name: "signature", type: "uint32", value: 0x02014b50 },
          { name: "version_made", type: "uint16" },
          { name: "version_needed", type: "uint16" },
          { name: "flags", type: "uint16" },
          { name: "compression_method", type: "uint16" },
          { name: "file_mod_time", type: "uint32" },
          { name: "crc32", type: "uint32" },
          { name: "compressed_size", type: "uint32" },
          { name: "uncompressed_size", type: "uint32" },
          { name: "filename_len", type: "uint16",
            computed: { type: "length_of", target: "filename", encoding: "utf8" }
          },
          { name: "extra_len", type: "uint16",
            computed: { type: "length_of", target: "extra" }
          },
          { name: "comment_len", type: "uint16",
            computed: { type: "length_of", target: "comment", encoding: "utf8" }
          },
          { name: "disk_number_start", type: "uint16" },
          { name: "internal_attrs", type: "uint16" },
          { name: "external_attrs", type: "uint32" },
          { name: "local_header_offset", type: "uint32",
            computed: {
              type: "position_of",
              target: "_root.local_files[_index]"
            }
          },
          { name: "filename", type: "string", kind: "field_referenced",
            length_field: "filename_len", encoding: "utf8" },
          { name: "extra", type: "array", kind: "field_referenced",
            length_field: "extra_len", items: { type: "uint8" } },
          { name: "comment", type: "string", kind: "field_referenced",
            length_field: "comment_len", encoding: "utf8" }
        ]
      },
      "EndOfCentralDir": {
        sequence: [
          { name: "signature", type: "uint32", value: 0x06054b50 },
          { name: "disk_number", type: "uint16" },
          { name: "disk_with_central_dir", type: "uint16" },
          { name: "num_entries_this_disk", type: "uint16",
            computed: { type: "count_of", target: "_root.central_directory" }
          },
          { name: "num_entries_total", type: "uint16",
            computed: { type: "count_of", target: "_root.central_directory" }
          },
          { name: "central_dir_size", type: "uint32",
            computed: {
              type: "sum_of",
              target: "_root.central_directory",
              expression: "sizeof(item)"
            }
          },
          { name: "central_dir_offset", type: "uint32",
            computed: {
              type: "position_of",
              target: "_root.central_directory[0]"
            }
          },
          { name: "comment_len", type: "uint16",
            computed: { type: "length_of", target: "comment", encoding: "utf8" }
          },
          { name: "comment", type: "string", kind: "field_referenced",
            length_field: "comment_len", encoding: "utf8" }
        ]
      },
      "ZipArchive": {
        sequence: [
          { name: "local_files", type: "array", kind: "variable",
            items: { type: "LocalFile" } },
          { name: "central_directory", type: "array", kind: "variable",
            items: { type: "CentralDirEntry" } },
          { name: "end_record", type: "EndOfCentralDir" }
        ]
      }
    }
  },
  input: {
    local_files: [
      {
        header: {
          version: 20,
          flags: 0,
          compression_method: 0,
          file_mod_time: 0x5A2B4C6D,
          uncompressed_size: 11,
          filename: "hello.txt",
          extra: []
        },
        body: "Hello World"
      }
    ],
    central_directory: [
      {
        version_made: 20,
        version_needed: 20,
        flags: 0,
        compression_method: 0,
        file_mod_time: 0x5A2B4C6D,
        crc32: 0x4A17B156,  // CRC of "Hello World"
        compressed_size: 11,
        uncompressed_size: 11,
        disk_number_start: 0,
        internal_attrs: 0,
        external_attrs: 0,
        filename: "hello.txt",
        extra: [],
        comment: ""
      }
    ],
    end_record: {
      disk_number: 0,
      disk_with_central_dir: 0,
      comment: ""
    }
  },
  decoded: {
    // Same as input but with all computed fields filled in
    local_files: [
      {
        header: {
          signature: 0x04034b50,
          version: 20,
          flags: 0,
          compression_method: 0,
          file_mod_time: 0x5A2B4C6D,
          crc32: 0x4A17B156,
          compressed_size: 11,
          uncompressed_size: 11,
          filename_len: 9,
          extra_len: 0,
          filename: "hello.txt",
          extra: []
        },
        body: [0x48, 0x65, 0x6C, 0x6C, 0x6F, 0x20, 0x57, 0x6F, 0x72, 0x6C, 0x64]
      }
    ],
    central_directory: [
      {
        signature: 0x02014b50,
        version_made: 20,
        version_needed: 20,
        flags: 0,
        compression_method: 0,
        file_mod_time: 0x5A2B4C6D,
        crc32: 0x4A17B156,
        compressed_size: 11,
        uncompressed_size: 11,
        filename_len: 9,
        extra_len: 0,
        comment_len: 0,
        disk_number_start: 0,
        internal_attrs: 0,
        external_attrs: 0,
        local_header_offset: 0,
        filename: "hello.txt",
        extra: [],
        comment: ""
      }
    ],
    end_record: {
      signature: 0x06054b50,
      disk_number: 0,
      disk_with_central_dir: 0,
      num_entries_this_disk: 1,
      num_entries_total: 1,
      central_dir_size: 47,
      central_dir_offset: 50,
      comment_len: 0,
      comment: ""
    }
  },
  bytes: [
    // LocalFile (offset 0)
    0x50, 0x4B, 0x03, 0x04,  // Signature
    0x14, 0x00,              // Version
    0x00, 0x00,              // Flags
    0x00, 0x00,              // Compression
    0x6D, 0x4C, 0x2B, 0x5A,  // Mod time
    0x56, 0xB1, 0x17, 0x4A,  // CRC32
    0x0B, 0x00, 0x00, 0x00,  // Compressed size
    0x0B, 0x00, 0x00, 0x00,  // Uncompressed size
    0x09, 0x00,              // Filename len
    0x00, 0x00,              // Extra len
    // "hello.txt"
    0x68, 0x65, 0x6C, 0x6C, 0x6F, 0x2E, 0x74, 0x78, 0x74,
    // "Hello World"
    0x48, 0x65, 0x6C, 0x6C, 0x6F, 0x20, 0x57, 0x6F, 0x72, 0x6C, 0x64,
    
    // CentralDirEntry (offset 50)
    0x50, 0x4B, 0x01, 0x02,  // Signature
    0x14, 0x00,              // Version made
    0x14, 0x00,              // Version needed
    0x00, 0x00,              // Flags
    0x00, 0x00,              // Compression
    0x6D, 0x4C, 0x2B, 0x5A,  // Mod time
    0x56, 0xB1, 0x17, 0x4A,  // CRC32
    0x0B, 0x00, 0x00, 0x00,  // Compressed size
    0x0B, 0x00, 0x00, 0x00,  // Uncompressed size
    0x09, 0x00,              // Filename len
    0x00, 0x00,              // Extra len
    0x00, 0x00,              // Comment len
    0x00, 0x00,              // Disk number
    0x00, 0x00,              // Internal attrs
    0x00, 0x00, 0x00, 0x00,  // External attrs
    0x00, 0x00, 0x00, 0x00,  // Local header offset
    // "hello.txt"
    0x68, 0x65, 0x6C, 0x6C, 0x6F, 0x2E, 0x74, 0x78, 0x74,
    
    // EndOfCentralDir (offset 97)
    0x50, 0x4B, 0x05, 0x06,  // Signature
    0x00, 0x00,              // Disk number
    0x00, 0x00,              // Disk with central dir
    0x01, 0x00,              // Num entries this disk
    0x01, 0x00,              // Num entries total
    0x2F, 0x00, 0x00, 0x00,  // Central dir size (47)
    0x32, 0x00, 0x00, 0x00,  // Central dir offset (50)
    0x00, 0x00               // Comment len
  ],
  why: "Complete end-to-end test of minimal valid ZIP archive"
}
```

### Test 7.2: Multi-file ZIP with Compression
```typescript
{
  name: "zip_multifile_compressed",
  feature: "ZIP with multiple compressed files",
  // Similar structure but with:
  // - Multiple LocalFile entries
  // - compression_method: 8 (deflate)
  // - Proper correlation between LocalFiles and CentralDirEntries
  // - Accurate offset calculations
  why: "Validates complete ZIP with compression and multiple files"
}
```

---

## Implementation Priority

1. **Phase 1: Parent & Struct References** (Tests 1.1-2.2)
   - Essential for basic ZIP structure
   - Enables LocalFileHeader to reference parent's body

2. **Phase 2: Position Tracking** (Tests 5.1-5.2)
   - Required for offset calculations
   - Foundation for array correlation

3. **Phase 3: Array Correlation** (Tests 3.1-3.2)
   - Links CentralDirEntry to LocalFile
   - Critical for ZIP directory structure

4. **Phase 4: Aggregate Computation** (Tests 4.1-4.3)
   - Computes central directory size
   - Counts entries for end record

5. **Phase 5: Compression** (Tests 6.1-6.2)
   - Deflate/inflate support
   - Conditional compression

6. **Phase 6: Integration** (Tests 7.1-7.2)
   - Complete ZIP archive support
   - Validation of all features working together

---

## Edge Cases to Test

1. **Empty ZIP archive** - No files, just end record
2. **ZIP with only directories** - No actual file data
3. **Nested ZIP** - ZIP file containing another ZIP
4. **Large files** - Files requiring ZIP64 extensions
5. **Encrypted ZIP** - Files with encryption flags
6. **Streaming ZIP** - Data descriptors after compressed data
7. **Split archives** - Multi-disk ZIP files
8. **Unicode filenames** - UTF-8 filename handling
9. **Extra field parsing** - Vendor-specific extensions
10. **Corrupted archives** - Recovery and error handling

---

## Success Criteria

Each test must:
1. **Encode correctly**: Input → Expected bytes
2. **Decode correctly**: Bytes → Expected decoded value
3. **Round-trip**: Input → Bytes → Decoded → Bytes (identical)
4. **Handle errors**: Invalid input produces clear error messages
5. **Performance**: Large archives parse efficiently with lazy evaluation

The complete test suite validates that BinSchema can fully describe and process ZIP archives without manual intervention for computed fields.
