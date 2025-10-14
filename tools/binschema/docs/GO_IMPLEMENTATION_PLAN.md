# Go Implementation Plan for BinSchema

## Overview

Implement Go code generator and test runner for BinSchema, using the existing JSON test definitions to ensure cross-language compatibility.

## Goals

1. **Validate cross-language design** - Prove that error codes work the same way in Go as TypeScript
2. **Enable SuperChat usage** - Generate Go encoders/decoders for SuperChat protocol
3. **Prepare for streaming** - Ensure core architecture supports streaming before implementing it

## Architecture

```
tools/binschema/
  tests-json/                    # Shared test definitions (from TypeScript)
    primitives/*.test.json
    composite/*.test.json
    streaming/*.test.json

  src/                           # TypeScript implementation
    generators/typescript.ts
    runtime/bit-stream.ts

  go/                            # NEW: Go implementation
    codegen/
      generator.go               # Go code generator
      templates.go               # Go code templates
    runtime/
      bitstream.go               # BitStreamEncoder/Decoder
      errors.go                  # Error codes (INCOMPLETE_DATA, etc.)
    test/
      runner_test.go             # Test runner (reads JSON)
      helpers.go                 # Test utilities
    examples/
      basic_test.go              # Usage examples
```

## Implementation Phases

### Phase 0: Setup (~30 min)

**Goal:** Create Go module structure

- [ ] Create `go/` directory structure
- [ ] Initialize Go module: `go mod init github.com/anthropics/binschema`
- [ ] Add basic README explaining Go implementation
- [ ] Create placeholder files for each component

**Deliverable:** Go module that compiles (empty implementations)

---

### Phase 1: BitStream Runtime (~2-3 hours)

**Goal:** Implement cross-language compatible BitStream encoder/decoder

**Files to create:**
- `go/runtime/bitstream.go`
- `go/runtime/errors.go`
- `go/runtime/bitstream_test.go`

**Key requirements:**
- `BitStreamEncoder` struct with methods matching TypeScript
- `BitStreamDecoder` struct with `LastErrorCode *string` field
- Error codes: `INCOMPLETE_DATA`, `INVALID_VALUE`, `SCHEMA_MISMATCH`, `CIRCULAR_REFERENCE`
- Support big/little endian
- Support MSB/LSB first bit order

**Example:**
```go
type BitStreamDecoder struct {
    bytes         []byte
    byteOffset    int
    bitOffset     int
    LastErrorCode *string  // Cross-language error handling
}

func (d *BitStreamDecoder) ReadUint8() (uint8, error) {
    if d.byteOffset >= len(d.bytes) {
        errCode := "INCOMPLETE_DATA"
        d.LastErrorCode = &errCode
        return 0, errors.New("unexpected end of stream")
    }
    d.LastErrorCode = nil
    return d.bytes[d.byteOffset], nil
}
```

**Tests:**
- Unit tests for each primitive type
- Round-trip encoding/decoding
- Error code behavior (EOF sets INCOMPLETE_DATA)
- Endianness handling
- Bit-level operations

**Validation criteria:**
- Behavior matches TypeScript BitStreamDecoder exactly
- Error codes set consistently with TypeScript

---

### Phase 2: Test Runner (~2-3 hours)

**Goal:** Load JSON tests and run them against generated Go code

**Files to create:**
- `go/test/runner_test.go`
- `go/test/loader.go` (JSON loading with BigInt support)
- `go/test/helpers.go` (deep equality, test utilities)

**Key requirements:**
- Load JSON test suites from `../../tests-json/`
- Parse JSON with BigInt support (strings ending in 'n')
- Generate Go code from schema
- Compile generated code (using `go run` or build tags)
- Run encode/decode tests
- Compare results with expected values
- Report failures with context

**Example test structure:**
```go
func TestBinSchema(t *testing.T) {
    // Load all JSON test suites
    suites, err := loadTestSuites("../../tests-json")
    require.NoError(t, err)

    for _, suite := range suites {
        t.Run(suite.Name, func(t *testing.T) {
            // Generate Go code from schema
            code, err := codegen.GenerateGo(suite.Schema)
            require.NoError(t, err)

            // Write to temp file and compile
            encoder, decoder := compileGenerated(t, code)

            // Run all test cases
            for _, tc := range suite.TestCases {
                t.Run(tc.Description, func(t *testing.T) {
                    // Test encoding
                    encoded := encoder.Encode(tc.Value)
                    assert.Equal(t, tc.Bytes, encoded)

                    // Test decoding
                    decoded := decoder.Decode(tc.Bytes)
                    assert.Equal(t, tc.Value, decoded)
                })
            }
        })
    }
}
```

**JSON loading with BigInt support:**
```go
type TestSuite struct {
    Name        string      `json:"name"`
    Description string      `json:"description"`
    Schema      interface{} `json:"schema"`
    TestType    string      `json:"test_type"`
    TestCases   []TestCase  `json:"test_cases"`
}

// Custom unmarshaler to handle BigInt strings ("123n" -> int64)
func (ts *TestSuite) UnmarshalJSON(data []byte) error {
    // Parse with custom handler for strings ending in 'n'
    // Convert "12345n" -> int64(12345)
}
```

**Validation criteria:**
- Can load all existing JSON test suites
- Test runner output matches TypeScript format
- Failures are clearly reported with context

---

### Phase 3: Code Generator (~3-4 hours)

**Goal:** Generate Go encoder/decoder code from BinSchema definitions

**Files to create:**
- `go/codegen/generator.go`
- `go/codegen/types.go` (Go type generation)
- `go/codegen/encoder.go` (encoding logic)
- `go/codegen/decoder.go` (decoding logic)
- `go/codegen/templates.go` (code templates)

**Key requirements:**
- Generate Go structs from schema types
- Generate `Encode()` methods
- Generate `Decode()` methods
- Support all primitive types (uint8, uint16, uint32, uint64, int*, float*, string)
- Support arrays (fixed, length_prefixed, null_terminated)
- Support optional fields (bool + value)
- Support nested structs
- Support conditionals
- Match TypeScript generator behavior exactly

**Generated code structure:**
```go
// Generated from schema
package generated

import "github.com/anthropics/binschema/runtime"

type MyMessage struct {
    Field1 uint32
    Field2 string
    Field3 []uint8
}

func (m *MyMessage) Encode() ([]byte, error) {
    encoder := runtime.NewBitStreamEncoder(runtime.BigEndian)

    encoder.WriteUint32(m.Field1)
    encoder.WriteString(m.Field2, runtime.LengthPrefixed, runtime.Uint8)
    encoder.WriteArray(m.Field3, runtime.LengthPrefixed, runtime.Uint16,
        func(item uint8) error {
            return encoder.WriteUint8(item)
        })

    return encoder.Finish(), nil
}

func DecodeMyMessage(bytes []byte) (*MyMessage, error) {
    decoder := runtime.NewBitStreamDecoder(bytes, runtime.BigEndian)

    msg := &MyMessage{}

    field1, err := decoder.ReadUint32()
    if err != nil { return nil, err }
    msg.Field1 = field1

    field2, err := decoder.ReadString(runtime.LengthPrefixed, runtime.Uint8)
    if err != nil { return nil, err }
    msg.Field2 = field2

    // ... etc

    return msg, nil
}
```

**Validation criteria:**
- Generated code compiles without errors
- All primitive type tests pass
- All composite type tests pass (arrays, structs, optional fields)
- Behavior matches TypeScript generator exactly

---

### Phase 4: Primitive Types (~1-2 hours)

**Goal:** All primitive type tests pass

**Test suites to pass:**
- `primitives/uint8.test.json`
- `primitives/uint16.test.json`
- `primitives/uint32.test.json`
- `primitives/uint64.test.json`
- `primitives/int8.test.json`
- `primitives/int16.test.json`
- `primitives/int32.test.json`
- `primitives/int64.test.json`
- `primitives/float32.test.json`
- `primitives/float64.test.json`

**Focus areas:**
- Big endian vs little endian
- Two's complement for signed integers
- IEEE 754 for floats
- Exact byte-for-byte compatibility with TypeScript

---

### Phase 5: Composite Types (~2-3 hours)

**Goal:** All composite type tests pass

**Test suites to pass:**
- `composite/simple-struct.test.json`
- `composite/nested-struct.test.json`
- `composite/arrays.test.json`
- `composite/strings.test.json`
- `composite/optional.test.json`
- `composite/conditionals.test.json`

**Focus areas:**
- Struct field ordering
- Array kinds (fixed, length_prefixed, null_terminated)
- String encodings (UTF-8)
- Optional field presence byte
- Conditional field evaluation

---

### Phase 6: Advanced Features (~2-3 hours)

**Goal:** All advanced feature tests pass

**Test suites to pass:**
- `composite/nested-arrays.test.json`
- `composite/array-of-structs.test.json`
- `composite/endianness-overrides.test.json`
- `composite/field-referenced-arrays.test.json`

**Focus areas:**
- Complex nesting
- Per-field endianness overrides
- Array length from another field
- Edge cases and corner cases

---

### Phase 7: Documentation & Examples (~1 hour)

**Goal:** Make Go implementation usable

**Files to create:**
- `go/README.md` - Getting started guide
- `go/examples/basic_test.go` - Simple usage example
- `go/examples/superchat_test.go` - SuperChat protocol example
- `go/doc.go` - Package documentation

**Documentation to include:**
- Installation instructions
- Basic usage example
- How to generate code from schema
- How to use generated encoders/decoders
- How to run tests
- Comparison with TypeScript implementation

---

## Validation Checklist

**Before considering Go implementation "complete":**

- [ ] All primitive type tests pass (10 test suites)
- [ ] All composite type tests pass (6 test suites)
- [ ] All advanced feature tests pass (4 test suites)
- [ ] No test failures (100% pass rate required)
- [ ] Generated code compiles without warnings
- [ ] Error codes behave identically to TypeScript
- [ ] Documentation is complete
- [ ] Examples run successfully
- [ ] Can generate SuperChat protocol encoders/decoders

**Test pass criteria:**
- Total test suites: ~20 (from tests-json/)
- Total test cases: ~200+
- Required pass rate: 100%

**If any test fails:**
1. Debug why Go behavior differs from TypeScript
2. Fix either Go implementation or TypeScript (if bug found)
3. Re-run all tests to ensure no regressions
4. Document the fix in commit message

---

## Cross-Language Compatibility Notes

**Critical requirements:**

1. **Error codes must be identical:**
   - TypeScript: `stream.lastErrorCode === 'INCOMPLETE_DATA'`
   - Go: `stream.LastErrorCode != nil && *stream.LastErrorCode == "INCOMPLETE_DATA"`
   - Same logic, different syntax

2. **Wire format must be byte-for-byte identical:**
   - Encode same value in TypeScript and Go → same bytes
   - Decode same bytes in TypeScript and Go → same value
   - No ambiguity or differences allowed

3. **Test cases are source of truth:**
   - If test says bytes should be `[0x12, 0x34]`, both languages must produce exactly that
   - No "close enough" - exact match required

4. **BigInt handling:**
   - TypeScript: native BigInt support
   - Go: int64 for most cases, big.Int for > 64-bit
   - JSON representation: strings ending in 'n' (e.g., "12345n")

---

## Future Work (After Go Implementation)

**Once Go implementation is complete and all tests pass:**

1. **Add streaming support** (see STREAMING_ANALYSIS.md)
   - Implement in TypeScript first
   - Port to Go using same error code logic
   - Validate that streaming works identically in both languages

2. **Rust implementation** (if desired)
   - Even stricter validation of portability
   - Would expose any remaining design issues

3. **Performance optimization**
   - Benchmark encoding/decoding speed
   - Compare with other binary serialization libraries
   - Optimize hot paths

4. **Advanced features**
   - Compression (bit packing, dictionary compression)
   - Encryption integration
   - Custom validators

---

## Notes for Implementation

**When stuck or unclear:**

1. **Look at TypeScript implementation** - it's the reference
2. **Check test JSON** - tests define correct behavior
3. **Ask for clarification** - don't guess if unsure
4. **Test frequently** - run tests after every small change
5. **Error codes are key** - if in doubt, set error code and check it

**Common pitfalls to avoid:**

- ❌ Assuming Go idioms differ from TypeScript (they shouldn't for core logic)
- ❌ Using Go-specific error handling instead of error codes
- ❌ Not checking error codes in streaming/buffering logic
- ❌ Forgetting to clear error codes on success
- ❌ Implementing features not in TypeScript version (stay aligned)

**Remember:**
- Go implementation should be a **port**, not a rewrite
- Core algorithm should be nearly identical (copy-paste logic, different syntax)
- If implementations diverge significantly, the design is wrong
