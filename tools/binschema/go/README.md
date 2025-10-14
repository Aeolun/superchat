# BinSchema Go Implementation

Go implementation of BinSchema - a bit-level binary serialization schema and code generator.

## Status

**🚧 Under Development**

Current progress:
- [x] Phase 0: Setup (Module structure, placeholders)
- [ ] Phase 1: BitStream Runtime (Encoder/Decoder with error codes)
- [ ] Phase 2: Test Runner (Load JSON tests, run against generated code)
- [ ] Phase 3: Code Generator (Generate Go code from schemas)
- [ ] Phase 4-6: Test suites (Primitives, Composites, Advanced features)
- [ ] Phase 7: Documentation & Examples

See `../docs/GO_IMPLEMENTATION_PLAN.md` for complete implementation plan.

## Architecture

```
go/
  runtime/         # Core BitStream encoder/decoder
    bitstream.go   # BitStreamEncoder, BitStreamDecoder
    errors.go      # Error codes (cross-language compatible)

  codegen/         # Code generator
    generator.go   # Generate Go code from schemas

  test/            # Test runner
    runner_test.go # Loads JSON tests, runs against generated code

  examples/        # Usage examples
```

## Cross-Language Compatibility

This Go implementation is designed to be **byte-for-byte compatible** with the TypeScript version:

- Same wire format (encode same value → same bytes)
- Same error codes (INCOMPLETE_DATA, INVALID_VALUE, etc.)
- Same test suites (loads tests-json/ generated from TypeScript)
- Same core logic (only syntax differs)

**Key principle:** If TypeScript and Go implementations diverge significantly, the design is wrong.

## Testing

Tests are defined in TypeScript (`../src/tests/*.test.ts`) and exported to JSON (`../tests-json/`).

The Go test runner loads these JSON files and validates that:
1. Generated Go code compiles without errors
2. Encoding produces expected bytes
3. Decoding produces expected values
4. Error codes are set correctly

**Running tests:**
```bash
cd go
go test ./...
```

**Test requirements:**
- 100% pass rate required
- No test failures tolerated
- Byte-for-byte compatibility with TypeScript

## Development Workflow

1. **TypeScript first** - TypeScript implementation is the reference
2. **Port to Go** - Copy logic, adapt syntax
3. **Run tests** - Validate against JSON test suites
4. **Fix divergences** - If tests fail, fix Go (or TypeScript if bug found)
5. **Document decisions** - Update docs if design changes

## Error Handling

Go uses error codes in decoder state for cross-language compatibility:

```go
decoder := runtime.NewBitStreamDecoder(bytes, runtime.BigEndian)

value, err := decoder.ReadUint8()
if err != nil {
    // Check error code for control flow
    if decoder.LastErrorCode != nil && *decoder.LastErrorCode == runtime.ErrorIncompleteData {
        // Incomplete data - need more bytes (for streaming)
        buffer = buffer[lastPosition:]
        continue
    }
    // Real error - propagate
    return err
}
```

This matches the TypeScript approach:
```typescript
try {
  const value = decoder.readUint8();
  if (decoder.lastErrorCode === 'INCOMPLETE_DATA') {
    // Same logic, different syntax
  }
} catch (e) {
  // Real error
}
```

## Next Steps

See `../docs/GO_IMPLEMENTATION_PLAN.md` for detailed implementation phases.

**Currently implementing:** Phase 1 - BitStream Runtime

## License

MIT
