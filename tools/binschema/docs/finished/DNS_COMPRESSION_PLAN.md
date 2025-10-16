# DNS Compression Support - Implementation Plan

**Status:** Planning Phase
**Goal:** Enable BinSchema to automatically generate parsers for protocols with pointer-based compression (starting with DNS RFC 1035)

---

> Task tracking for this plan is now consolidated in `docs/TODO.md`.

## Overview

DNS uses message compression via backwards pointers to eliminate repeated domain names. A domain name field can be either:
- **Full domain name**: Sequence of labels (length-prefixed strings) + null terminator
- **Compression pointer**: 2-byte value where top 2 bits = `11`, followed by 14-bit offset to domain name elsewhere in message

This requires BinSchema to support:
1. **Discriminated unions** - Choose type based on byte value examination
2. **Message-level context** - Access full message buffer for pointer following
3. **Seeking/peeking** - Jump to offsets without consuming current position
4. **Circular reference detection** - Prevent infinite loops from malicious messages

---

## Phase 1: Runtime Support (BitStream Extensions)

### 1.1 Add Peek Methods

**File:** `src/runtime/bit-stream.ts`

Add non-consuming read methods:

```typescript
export class BitStreamDecoder {
  // Existing: position tracking
  private byteOffset: number = 0;
  private bitOffset: number = 0;

  // NEW: Peek methods (read without advancing position)
  peekUint8(): number {
    return this.buffer[this.byteOffset];
  }

  peekUint16(endianness: Endianness = "big_endian"): number {
    if (endianness === "big_endian") {
      return (this.buffer[this.byteOffset] << 8) | this.buffer[this.byteOffset + 1];
    } else {
      return this.buffer[this.byteOffset] | (this.buffer[this.byteOffset + 1] << 8);
    }
  }

  peekUint32(endianness: Endianness = "big_endian"): number {
    // Similar implementation
  }
}
```

**Tests:** `src/tests/runtime/peek-methods.test.ts`
- Peek doesn't advance position
- Multiple peeks return same value
- Peek + read works correctly
- Endianness handling

### 1.2 Add Position/Seek Methods

**File:** `src/runtime/bit-stream.ts`

Add position access and seeking:

```typescript
export class BitStreamDecoder {
  // NEW: Expose current position
  get position(): number {
    return this.byteOffset;
  }

  // NEW: Seek to absolute byte offset
  seek(offset: number): void {
    if (offset < 0 || offset > this.buffer.length) {
      throw new Error(`Seek offset ${offset} out of bounds (0-${this.buffer.length})`);
    }
    this.byteOffset = offset;
    this.bitOffset = 0; // Reset bit offset when seeking
  }

  // NEW: Save/restore position (for recursive parsing)
  private savedPositions: number[] = [];

  pushPosition(): void {
    this.savedPositions.push(this.byteOffset);
  }

  popPosition(): void {
    const saved = this.savedPositions.pop();
    if (saved === undefined) {
      throw new Error("Position stack underflow");
    }
    this.byteOffset = saved;
    this.bitOffset = 0;
  }
}
```

**Tests:** `src/tests/runtime/seek-position.test.ts`
- Seek to valid offset
- Seek bounds checking
- Position getter accuracy
- Push/pop position stack
- Nested push/pop (recursive parsing)

---

## Phase 2: Schema Extensions

### 2.1 Discriminated Union Type

**File:** `src/schema/binary-schema.ts`

Add new type definition:

```typescript
export interface DiscriminatedUnionDef {
  type: "discriminated_union";
  description?: string;
  discriminator: {
    // What to peek at to decide which variant
    peek: "uint8" | "uint16" | "uint32";
    endianness?: Endianness;
    field_name?: string; // Optional: store discriminator value in decoded object
  };
  variants: Array<{
    when: string; // Condition expression (e.g., "value >= 0xC0", "value == 0x01")
    type: string; // Type name to parse if condition matches
    description?: string;
  }>;
}
```

**Example schema:**
```json
{
  "DomainNameOrPointer": {
    "type": "discriminated_union",
    "description": "DNS domain name or compression pointer",
    "discriminator": {
      "peek": "uint16",
      "endianness": "big_endian"
    },
    "variants": [
      {
        "when": "value >= 0xC000",
        "type": "Pointer",
        "description": "Compression pointer (top 2 bits = 11)"
      },
      {
        "when": "value < 0xC000",
        "type": "DomainName",
        "description": "Standard domain name"
      }
    ]
  }
}
```

### 2.2 Pointer Type

**File:** `src/schema/binary-schema.ts`

Add pointer type definition:

```typescript
export interface PointerDef {
  type: "pointer";
  description?: string;
  storage: "uint8" | "uint16" | "uint32"; // How pointer is stored
  offset_mask: string; // Bit mask to extract offset (e.g., "0x3FFF" for DNS)
  offset_from: "message_start" | "current_position";
  target_type: string; // Type to parse at offset
  endianness?: Endianness;
}
```

**Example schema:**
```json
{
  "Pointer": {
    "type": "pointer",
    "description": "DNS compression pointer",
    "storage": "uint16",
    "offset_mask": "0x3FFF",
    "offset_from": "message_start",
    "target_type": "DomainName",
    "endianness": "big_endian"
  }
}
```

### 2.3 Schema Validation

**File:** `src/schema/validator.ts`

Add validation for new types:
- Discriminated union has valid peek type
- All variant conditions are parseable
- All variant types exist in schema
- Pointer offset_mask is valid hex
- Pointer target_type exists in schema
- Circular pointer detection (static analysis)

**Tests:** `src/tests/schema/discriminated-union-validation.test.ts`
- Valid discriminated union accepted
- Invalid peek type rejected
- Missing variant type rejected
- Circular pointer references detected (if possible statically)

---

## Phase 3: TypeScript Code Generation

### 3.1 Generate Discriminated Union Code

**File:** `src/generators/typescript.ts`

Add case in `generateEncodeFieldCoreImpl()`:

```typescript
case "discriminated_union":
  return generateEncodeDiscriminatedUnion(field, schema, valuePath, indent);
```

**Encoding strategy:**
```typescript
function generateEncodeDiscriminatedUnion(
  field: any,
  schema: BinarySchema,
  valuePath: string,
  indent: string
): string {
  let code = "";

  // Generate if-else chain based on variant conditions
  // Determine which variant the value belongs to
  // Encode using the appropriate variant encoder

  // Example generated code:
  // if (value.qname.type === "Pointer") {
  //   // Encode as Pointer
  // } else if (value.qname.type === "DomainName") {
  //   // Encode as DomainName
  // }

  return code;
}
```

**Decoding strategy:**
```typescript
function generateDecodeDiscriminatedUnion(
  field: any,
  schema: BinarySchema,
  fieldName: string,
  indent: string
): string {
  let code = "";
  const target = getTargetPath(fieldName);

  // Peek at discriminator
  code += `${indent}const discriminator = this.peek${field.discriminator.peek}("${field.discriminator.endianness || 'big_endian'}");\n`;

  // Generate if-else chain
  for (let i = 0; i < field.variants.length; i++) {
    const variant = field.variants[i];
    const condition = variant.when.replace(/\bvalue\b/g, "discriminator");

    if (i === 0) {
      code += `${indent}if (${condition}) {\n`;
    } else if (i === field.variants.length - 1 && variant.when === "default") {
      code += `${indent}} else {\n`;
    } else {
      code += `${indent}} else if (${condition}) {\n`;
    }

    // Decode as this variant type
    code += generateDecodeTypeReference(variant.type, schema, fieldName, indent + "  ");

    if (i === field.variants.length - 1) {
      code += `${indent}}\n`;
    }
  }

  return code;
}
```

### 3.2 Generate Pointer Following Code

**File:** `src/generators/typescript.ts`

Add case in `generateDecodeFieldCoreImpl()`:

```typescript
case "pointer":
  return generateDecodePointer(field, schema, fieldName, indent);
```

**Implementation:**
```typescript
function generateDecodePointer(
  field: any,
  schema: BinarySchema,
  fieldName: string,
  indent: string
): string {
  let code = "";
  const target = getTargetPath(fieldName);

  // Read pointer value
  const storageType = field.storage;
  code += `${indent}const ${fieldName}_ptr_value = this.read${capitalize(storageType)}("${field.endianness || 'big_endian'}");\n`;

  // Extract offset using mask
  code += `${indent}const ${fieldName}_offset = ${fieldName}_ptr_value & ${field.offset_mask};\n`;

  // Save current position
  code += `${indent}this.pushPosition();\n`;

  // Seek to target
  code += `${indent}this.seek(${fieldName}_offset);\n`;

  // Decode target type recursively
  code += generateDecodeTypeReference(field.target_type, schema, fieldName, indent);

  // Restore position
  code += `${indent}this.popPosition();\n`;

  return code;
}
```

**Circular Reference Detection:**
```typescript
// Add to decoder class initialization
private visitedOffsets = new Set<number>();

// In pointer following:
if (this.visitedOffsets.has(offset)) {
  throw new Error(`Circular pointer reference detected at offset ${offset}`);
}
this.visitedOffsets.add(offset);

// Clear after top-level decode completes
```

**Tests:** `src/tests/generators/discriminated-union-codegen.test.ts`
- Simple discriminated union (2 variants)
- Complex discriminated union (3+ variants)
- Nested discriminated unions
- Generated code compiles

**Tests:** `src/tests/generators/pointer-codegen.test.ts`
- Simple pointer following
- Nested pointers
- Circular reference detection
- Generated code compiles

---

## Phase 4: DNS Protocol Tests

### 4.1 DNS Label Tests

**File:** `src/tests/protocols/dns-labels.test.ts`

Test basic DNS labels (already works with string support):

```typescript
{
  "Label": {
    "type": "string",
    "kind": "length_prefixed",
    "length_type": "uint8",
    "encoding": "ascii"
  }
}
```

Test cases:
- Empty label (length 0)
- Single character label
- Maximum length label (63 bytes)
- Label with hyphens

### 4.2 DNS DomainName Tests

**File:** `src/tests/protocols/dns-domain-name.test.ts`

Test domain names (array of labels):

```typescript
{
  "DomainName": {
    "type": "array",
    "kind": "null_terminated",
    "items": { "type": "Label" }
  }
}
```

Test cases:
- Single label domain ("example")
- Multi-label domain ("www.example.com")
- Root domain (empty, just null terminator)

### 4.3 DNS Compression Pointer Tests

**File:** `src/tests/protocols/dns-compression.test.ts`

Test compression pointers:

```typescript
defineTestSuite({
  name: "dns_compression_simple",
  description: "DNS compression with single pointer",

  schema: {
    types: {
      "Label": { /* as above */ },
      "DomainName": { /* as above */ },
      "Pointer": {
        "type": "pointer",
        "storage": "uint16",
        "offset_mask": "0x3FFF",
        "offset_from": "message_start",
        "target_type": "DomainName"
      },
      "DomainNameOrPointer": {
        "type": "discriminated_union",
        "discriminator": {
          "peek": "uint16"
        },
        "variants": [
          { "when": "value >= 0xC000", "type": "Pointer" },
          { "when": "value < 0xC000", "type": "DomainName" }
        ]
      }
    }
  },

  test_cases: [
    {
      description: "Question with full domain name",
      bytes: [
        // domain: "example.com"
        0x07, 0x65, 0x78, 0x61, 0x6D, 0x70, 0x6C, 0x65, // "example"
        0x03, 0x63, 0x6F, 0x6D, // "com"
        0x00, // null terminator
      ],
      decoded: {
        domain: "example.com"
      }
    },
    {
      description: "Pointer to offset 12 (0xC00C)",
      bytes: [
        // First occurrence at offset 0
        0x07, 0x65, 0x78, 0x61, 0x6D, 0x70, 0x6C, 0x65, // "example"
        0x03, 0x63, 0x6F, 0x6D, // "com"
        0x00, // null terminator (total: 13 bytes, 0x00-0x0C)

        // Second occurrence: pointer to offset 0
        0xC0, 0x00, // Pointer: top 2 bits = 11, offset = 0
      ],
      decoded: {
        first: "example.com",
        second: "example.com" // Resolved from pointer
      }
    },
    {
      description: "Circular pointer (should throw error)",
      bytes: [
        0xC0, 0x00, // Pointer to self
      ],
      expectError: "Circular pointer reference"
    }
  ]
});
```

### 4.4 Complete DNS Message Test

**File:** `src/tests/protocols/dns-message.test.ts`

Test complete DNS response with multiple pointers:

```typescript
defineTestSuite({
  name: "dns_complete_response",
  description: "Complete DNS response with header, question, and answers using compression",

  // Schema includes DNSHeader, Question, ResourceRecord, etc.

  test_cases: [
    {
      description: "DNS A record response for example.com",
      bytes: [/* Real DNS response bytes */],
      decoded: {
        header: { id: 1234, qr: 1, /* ... */ },
        questions: [
          { qname: "example.com", qtype: 1, qclass: 1 }
        ],
        answers: [
          {
            name: "example.com", // Compressed pointer to question
            type: 1,
            class: 1,
            ttl: 3600,
            rdata: { address: "93.184.216.34" }
          }
        ]
      }
    }
  ]
});
```

---

## Phase 5: Documentation Updates

### 5.1 Update CLAUDE.md

Add section on discriminated unions and pointers:

```markdown
## Advanced Features

### Discriminated Unions

For protocols that use format discrimination (e.g., DNS compression):

```json
{
  "FieldWithVariants": {
    "type": "discriminated_union",
    "discriminator": { "peek": "uint8" },
    "variants": [
      { "when": "value >= 0xC0", "type": "PointerType" },
      { "when": "value < 0x40", "type": "DirectType" }
    ]
  }
}
```

### Pointer Support

For protocols with backwards references:

```json
{
  "Pointer": {
    "type": "pointer",
    "storage": "uint16",
    "offset_mask": "0x3FFF",
    "target_type": "DomainName"
  }
}
```

Circular references are automatically detected and throw errors.
```

### 5.2 Update HTML Generator

Document discriminated unions and pointers in generated docs:
- Show all variants in wire diagram
- Indicate pointer fields with special styling
- Add notes about compression

### 5.3 Create DNS Example

**File:** `examples/dns-complete.json`

Full DNS protocol schema with:
- DNSHeader with bitfields
- Question with compressed qname
- ResourceRecord with compressed name
- All RDATA types

---

## Implementation Order

### Week 1: Runtime & Schema
1. ✅ **Day 1-2:** Implement peek() methods + tests
2. ✅ **Day 3:** Implement seek() / position tracking + tests
3. ✅ **Day 4-5:** Add discriminated_union schema type + validation

### Week 2: Code Generation
4. ✅ **Day 1-2:** Generate discriminated union code + tests
5. ✅ **Day 3:** Add pointer schema type + validation
6. ✅ **Day 4-5:** Generate pointer following code + tests

### Week 3: DNS Protocol
7. ✅ **Day 1-2:** DNS label & domain name tests
8. ✅ **Day 3-4:** DNS compression pointer tests
9. ✅ **Day 5:** Complete DNS message test

### Week 4: Polish & Docs
10. ✅ **Day 1-2:** Circular reference detection + edge cases
11. ✅ **Day 3-4:** Update documentation (CLAUDE.md, HTML generator)
12. ✅ **Day 5:** Create complete DNS example schema

---

## Success Criteria

_Remaining validation items are tracked in `docs/TODO.md`._

---

## Risk Mitigation

**Risk:** Generated code is too complex to debug
- **Mitigation:** Generate heavily commented code, add logging statements

**Risk:** Circular reference detection has false positives
- **Mitigation:** Only track visited offsets within single parse operation, clear between messages

**Risk:** Pointer following breaks with nested structures
- **Mitigation:** Use position stack (push/pop) instead of single saved position

**Risk:** Encoding discriminated unions is ambiguous
- **Mitigation:** Require explicit type tagging in encoded values (e.g., `{ type: "Pointer", offset: 0 }`)

---

## Future Enhancements (Post-DNS)

- **Forward pointers**: Support pointers to data that comes later (harder, requires lookahead)
- **Relative pointers**: Offsets relative to current position instead of message start
- **Complex discriminators**: Multi-field discrimination (e.g., "if type==1 AND flags&0x01")
- **Pointer compression during encoding**: Automatically detect repeated data and create pointers
- **Other protocols**: SIP, HTTP/2, CBOR, etc.

---

## Notes

- This is ambitious but achievable in ~4 weeks part-time
- Each phase builds on previous (no shortcuts!)
- Test-driven development is **mandatory** (write tests first)
- DNS is perfect test case: real-world, well-specified, not trivial
- Success means BinSchema can handle 90% of binary protocols automatically
