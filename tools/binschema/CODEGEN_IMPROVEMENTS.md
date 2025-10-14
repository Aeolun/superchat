# Code Generation Improvements

This document tracks improvements needed to make BinSchema's generated TypeScript code production-ready and user-friendly.

## Critical Issues (Distribution)

- [x] **Runtime dependency distribution** ✅ **SOLVED**
  - Problem: Generated code imports from `"../dist/runtime/bit-stream.js"` (relative path that only works inside binschema project)
  - Impact: **Users cannot use generated code in their own projects** - the BitStreamEncoder/Decoder classes are inaccessible
  - **Solution implemented**: Copy runtime alongside (Option 3)
    - Runtime file (`bit-stream.ts`) is copied to `.generated/` directory
    - Generated code imports from `"./bit-stream.js"` (same directory)
    - Runtime classes appear in TypeDoc documentation
    - Generated code is now self-contained and immediately usable
  - Future: Option 1 (npm package) for wider distribution
  - Example package.json exports (for future npm publish):
    ```json
    {
      "exports": {
        "./runtime": "./dist/runtime/bit-stream.js"
      },
      "files": ["dist"]
    }
    ```

## Critical Issues (Type Safety)

- [x] **Fix type aliases for primitive wrappers** ✅
  - Problem: `export interface Label {}` should be `export type Label = string`
  - Problem: `export interface CompressedDomain {}` should be `export type CompressedDomain = CompressedLabel[]`
  - Impact: Zero type safety - can pass anything without TypeScript errors
  - Files affected: String types, array types that are standalone
  - **Status: COMPLETED** - All string and array type aliases now generate proper `export type` declarations
  - Example fix:
    ```typescript
    // Current (WRONG):
    export interface Label {}

    // Should be:
    export type Label = string;
    ```

- [x] **Add proper stream typing** ✅
  - Problem: All functions use `stream: any`, losing type safety
  - Impact: No autocomplete, no compile-time errors for wrong stream usage
  - Fix: Import and use `BitStreamEncoder` and `BitStreamDecoder` types
  - **Status: COMPLETED** - All encoder/decoder functions now use properly typed stream parameters
  - Example fix:
    ```typescript
    // Current (WRONG):
    export function encodeLabel(stream: any, value: Label): void

    // Should be:
    import { BitStreamEncoder, BitStreamDecoder } from "../runtime/bit-stream.js";
    export function encodeLabel(stream: BitStreamEncoder, value: Label): void
    export function decodeLabel(stream: BitStreamDecoder): Label
    ```

## High Priority (Documentation)

- [x] **Generate JSDoc for interfaces** ✅
  - Problem: No documentation on generated interfaces
  - Impact: Users must read schema JSON to understand field meanings
  - Source: Use `description` field from schema
  - **Status: COMPLETED** - All interfaces and interface properties now generate JSDoc from schema descriptions
  - Example fix:
    ```typescript
    // Current (WRONG):
    export interface Question {
      qname: CompressedDomain;
      qtype: number;
      qclass: number;
    }

    // Should be:
    /**
     * DNS question entry
     */
    export interface Question {
      /** Domain name being queried */
      qname: CompressedDomain;
      /** Question type (1=A, 2=NS, etc.) */
      qtype: number;
      /** Question class (1=IN for Internet) */
      qclass: number;
    }
    ```

- [x] **Generate JSDoc for functions** ✅
  - Problem: No documentation on encode/decode functions
  - Impact: Users don't know what parameters mean or what gets returned
  - **Status: COMPLETED** - All encoder/decoder functions now generate JSDoc with parameter and return type documentation
  - Example fix:
    ```typescript
    // Current (WRONG):
    export function encodeQuestion(stream: any, value: Question): void

    // Should be:
    /**
     * Encode a DNS question entry to the stream
     * @param stream - The bit stream to write to
     * @param value - The question to encode
     */
    export function encodeQuestion(stream: BitStreamEncoder, value: Question): void
    ```

- [ ] **Generate JSDoc for discriminated unions**
  - Problem: Union types have no documentation explaining variants
  - Example fix:
    ```typescript
    // Should generate:
    /**
     * DNS label or pointer to previous label
     *
     * Variants:
     * - `Label`: Regular label (when first byte < 0xC0)
     * - `LabelPointer`: Pointer to previous label (when first byte >= 0xC0)
     */
    export type CompressedLabel =
      | { type: 'Label'; value: Label }
      | { type: 'LabelPointer'; value: LabelPointer };
    ```

## Medium Priority (Better Types)

- [ ] **Extract inline anonymous types to named interfaces**
  - Problem: Bitfield types are inline, making them hard to document and reuse
  - Example: `flags: { qr: number, opcode: number, ... }` (89 characters!)
  - Impact: Hard to read, can't document fields properly, can't reference type elsewhere
  - Example fix:
    ```typescript
    // Current (WRONG):
    export interface DnsMessage {
      flags: { qr: number, opcode: number, aa: number, tc: number, rd: number, ra: number, z: number, rcode: number };
    }

    // Should be:
    /**
     * DNS header flags (16-bit bitfield)
     */
    export interface DnsFlags {
      /** Query/Response flag (0=query, 1=response) */
      qr: number;
      /** Operation code (0=standard query, 1=inverse query, 2=status) */
      opcode: number;
      /** Authoritative answer flag */
      aa: number;
      /** Truncation flag */
      tc: number;
      /** Recursion desired flag */
      rd: number;
      /** Recursion available flag */
      ra: number;
      /** Reserved (must be 0) */
      z: number;
      /** Response code (0=no error, 1=format error, 2=server failure, 3=name error) */
      rcode: number;
    }

    export interface DnsMessage {
      flags: DnsFlags;
    }
    ```

- [ ] **Add const enums for discriminated union types**
  - Problem: Magic strings for union types (`'Label'`, `'LabelPointer'`)
  - Impact: Easy to make typos, no autocomplete
  - Example fix:
    ```typescript
    // Should generate:
    export const CompressedLabelType = {
      Label: 'Label',
      LabelPointer: 'LabelPointer',
    } as const;

    export type CompressedLabelType = typeof CompressedLabelType[keyof typeof CompressedLabelType];
    ```

## Low Priority (Nice to Have)

- [ ] **Add input validation for bitfields**
  - Problem: No validation that values fit in their bit sizes
  - Example: `writeBits(value.flags.qr, 1)` - if qr=255, silent overflow
  - Fix: Add runtime checks in generated encoders
  - Example:
    ```typescript
    if (value.flags.qr < 0 || value.flags.qr >= (1 << 1)) {
      throw new Error(`flags.qr must fit in 1 bit (got ${value.flags.qr})`);
    }
    stream.writeBits(value.flags.qr, 1);
    ```

- [ ] **Add const enums for well-known discriminator values**
  - Problem: Magic numbers for DNS record types (1=A, 2=NS, 5=CNAME)
  - Impact: Code is less readable, easy to use wrong value
  - Example fix:
    ```typescript
    // Should optionally generate from schema annotations:
    export const DnsRecordType = {
      A: 1,
      NS: 2,
      CNAME: 5,
    } as const;
    ```

- [ ] **Generate helper type guards**
  - Problem: Users must manually write type guards for discriminated unions
  - Example fix:
    ```typescript
    // Should generate:
    export function isLabel(item: CompressedLabel): item is { type: 'Label'; value: Label } {
      return item.type === 'Label';
    }

    export function isLabelPointer(item: CompressedLabel): item is { type: 'LabelPointer'; value: LabelPointer } {
      return item.type === 'LabelPointer';
    }
    ```

- [ ] **Add encode/decode convenience wrappers**
  - Problem: Users must manually create streams for every encode/decode
  - Example fix:
    ```typescript
    // Should generate:
    /**
     * Encode a DNS message to bytes
     * @param value - The message to encode
     * @returns The encoded message as a Uint8Array
     */
    export function encodeDnsMessageToBytes(value: DnsMessage): Uint8Array {
      const stream = new BitStreamEncoder("msb_first");
      encodeDnsMessage(stream, value);
      return stream.finish();
    }

    /**
     * Decode a DNS message from bytes
     * @param bytes - The bytes to decode
     * @returns The decoded message
     */
    export function decodeDnsMessageFromBytes(bytes: Uint8Array): DnsMessage {
      const stream = new BitStreamDecoder(bytes, "msb_first");
      return decodeDnsMessage(stream);
    }
    ```

- [ ] **Add `toJSON()` methods for pretty printing**
  - Problem: Discriminated unions and complex types don't pretty-print well
  - Example: `CompressedDomain` is an array of `{type: 'Label', value: string}`
  - Would be nice: Helper to convert to "example.com." string format

## Documentation Quality Checks

After implementing improvements, validate by:

1. ✅ Run typedoc on generated code
2. ✅ Check that all public interfaces/types have documentation
3. ✅ Check that function parameters are documented
4. ✅ Check that return types are documented
5. ✅ Check that JSDoc renders correctly in IDE (VSCode)
6. ✅ Check that examples compile and work

## Testing

- [ ] Add test that validates generated TypeScript compiles without errors
- [ ] Add test that validates no `any` types in public API (except stream - to fix)
- [ ] Add test that validates all public interfaces have JSDoc
- [ ] Add snapshot test for generated code structure
