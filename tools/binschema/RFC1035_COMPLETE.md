# RFC 1035 Complete Implementation

**Status:** In Progress
**Goal:** Fully implement RFC 1035 DNS protocol to prove BinSchema can handle complete real-world protocols, not just the interesting parts.

---

## Why Complete Implementation Matters

The DNS compression implementation (see `DNS_COMPRESSION_PLAN.md`) proved we can handle the **hard** parts:
- ✅ Bitfield discriminators (flags.qr)
- ✅ Discriminated unions (Label vs Pointer)
- ✅ Compression pointers with terminal variants
- ✅ 12-byte RFC-compliant header

However, we're currently claiming we can implement RFC 1035 while only having:
- **DnsQuery**: QNAME + QTYPE + QCLASS (question section)
- **DnsResponse**: Question fields + answer fields **without RDATA**

**Missing pieces:**
- ❌ Actual RDATA field in responses
- ❌ Resource Record type with proper structure
- ❌ Arrays for Answer/Authority/Additional sections
- ❌ At least one complete RR type (A record with IPv4 address)
- ❌ Complete query/response message cycle

**Why this matters:** The bitfield shortcut (separate opcode byte) showed us we can miss things when we don't implement fully. We need to implement the complete protocol to discover any other gaps.

---

## DNS Message Structure (RFC 1035 Section 4.1)

A complete DNS message has:

```
+---------------------+
|      Header         |  12 bytes - DONE ✅
+---------------------+
|  Question Section   |  QDCOUNT questions
+---------------------+
|   Answer Section    |  ANCOUNT resource records
+---------------------+
| Authority Section   |  NSCOUNT resource records
+---------------------+
| Additional Section  |  ARCOUNT resource records
+---------------------+
```

### Current Status

**Header (12 bytes):** ✅ COMPLETE
- id (2B), flags (2B bitfield), qdcount (2B), ancount (2B), nscount (2B), arcount (2B)

**Question Section:** ⚠️ PARTIAL
- We have QNAME + QTYPE + QCLASS in DnsQuery
- Missing: Array handling for QDCOUNT questions

**Answer/Authority/Additional Sections:** ❌ MISSING
- Need ResourceRecord type
- Need arrays with length from header fields

---

## Resource Record Format (RFC 1035 Section 4.1.3)

```
                                    1  1  1  1  1  1
      0  1  2  3  4  5  6  7  8  9  0  1  2  3  4  5
    +--+--+--+--+--+--+--+--+--+--+--+--+--+--+--+--+
    |                                               |
    /                      NAME                     /
    |                                               |
    +--+--+--+--+--+--+--+--+--+--+--+--+--+--+--+--+
    |                      TYPE                     |  uint16
    +--+--+--+--+--+--+--+--+--+--+--+--+--+--+--+--+
    |                     CLASS                     |  uint16
    +--+--+--+--+--+--+--+--+--+--+--+--+--+--+--+--+
    |                      TTL                      |  uint32
    |                                               |
    +--+--+--+--+--+--+--+--+--+--+--+--+--+--+--+--+
    |                   RDLENGTH                    |  uint16
    +--+--+--+--+--+--+--+--+--+--+--+--+--+--+--+--|
    /                     RDATA                     /  variable
    /                                               /
    +--+--+--+--+--+--+--+--+--+--+--+--+--+--+--+--+
```

**Fields:**
- NAME: CompressedDomain (can use pointers)
- TYPE: uint16 (1=A, 2=NS, 5=CNAME, etc.)
- CLASS: uint16 (1=IN for Internet)
- TTL: uint32 (seconds to cache)
- RDLENGTH: uint16 (length of RDATA in bytes)
- RDATA: Variable format based on TYPE and CLASS

---

## Implementation Checklist

### Phase 1: Resource Record Structure

- [ ] **1.1** Create `Question` type
  - Fields: qname (CompressedDomain), qtype (uint16), qclass (uint16)
  - Test: Encode/decode single question

- [ ] **1.2** Create `ResourceRecord` type (without RDATA first)
  - Fields: name (CompressedDomain), type (uint16), class (uint16), ttl (uint32), rdlength (uint16)
  - Test: Encode/decode RR header (no data)

- [ ] **1.3** Add RDATA as discriminated union based on TYPE field
  - Variants: A record (type=1), other types can be raw bytes for now
  - Test: Discriminated union switches correctly on TYPE

### Phase 2: RDATA Types

- [ ] **2.1** Implement A record RDATA (TYPE=1, CLASS=1)
  - Format: 4-byte IPv4 address (uint32)
  - Test: Encode/decode A record with IP 93.184.216.34 (example.com)

- [ ] **2.2** Implement NS record RDATA (TYPE=2) - Optional but useful
  - Format: CompressedDomain (name server domain)
  - Test: NS record with compression pointer

- [ ] **2.3** Implement CNAME record RDATA (TYPE=5) - Optional but useful
  - Format: CompressedDomain (canonical name)
  - Test: CNAME with compression pointer

### Phase 3: Complete Message Structure

- [ ] **3.1** Update DnsQuery to use Question array
  - Add Question type as separate from DnsQuery payload
  - Change DnsQuery to have: questions array (length from qdcount)
  - Test: Query with 1 question, query with 2 questions

- [ ] **3.2** Update DnsResponse to use ResourceRecord arrays
  - Add: questions array (length from qdcount)
  - Add: answers array (length from ancount)
  - Add: authority array (length from nscount) - can be empty for now
  - Add: additional array (length from arcount) - can be empty for now
  - Test: Response with 1 answer, response with multiple answers

- [ ] **3.3** Handle length-prefixed arrays with header field references
  - Ensure arrays use qdcount/ancount/nscount/arcount from header
  - Test: Array lengths match header counts

### Phase 4: Integration Tests

- [ ] **4.1** Complete query test
  - Wire bytes: Full DNS query for example.com A record
  - Decode: Verify header + question section correct
  - Encode: Round-trip test

- [ ] **4.2** Complete response test without compression
  - Wire bytes: Full DNS response with A record (no pointers)
  - Decode: Verify header + question + answer sections
  - Verify: RDATA contains correct IPv4 address
  - Encode: Round-trip test

- [ ] **4.3** Complete response test with compression
  - Wire bytes: Response where answer NAME points to question QNAME
  - Decode: Verify pointer resolution works
  - Verify: Both question and answer have same domain name
  - Encode: Round-trip test

- [ ] **4.4** Multi-answer response test
  - Wire bytes: Response with 2+ A records (load balanced server)
  - Decode: Verify multiple answers parsed correctly
  - Test: Different IP addresses in each answer

### Phase 5: Edge Cases & Validation

- [ ] **5.1** Empty response (ANCOUNT=0)
  - NXDOMAIN or no records found
  - Test: Empty answer array

- [ ] **5.2** Authority section (NSCOUNT > 0)
  - Response with NS records in authority section
  - Test: Authority array populated

- [ ] **5.3** Additional section (ARCOUNT > 0)
  - Response with glue records (A records for NS servers)
  - Test: Additional array populated

- [ ] **5.4** Maximum message size
  - DNS over UDP: 512 bytes max
  - Test: Message with TC (truncation) bit set

### Phase 6: Documentation

- [ ] **6.1** Update DNS test file comments
  - Document complete message structure
  - Explain RDATA discriminated union

- [ ] **6.2** Create RFC1035_COMPLETE.md status update
  - Mark completed items
  - Document any RFC features deliberately omitted

- [ ] **6.3** Update CLAUDE.md if needed
  - Add notes about complete protocol implementation

---

## RDATA Type Implementation Priority

**Must implement (for complete protocol):**
1. ✅ A (TYPE=1): IPv4 address - 4 bytes
2. ⚠️ NS (TYPE=2): Name server domain - CompressedDomain
3. ⚠️ CNAME (TYPE=5): Canonical name - CompressedDomain

**Nice to have (commonly used):**
4. SOA (TYPE=6): Start of authority - complex, 7 fields
5. PTR (TYPE=12): Pointer for reverse DNS - CompressedDomain
6. MX (TYPE=15): Mail exchange - uint16 preference + CompressedDomain
7. TXT (TYPE=16): Text strings - length-prefixed string array

**Can skip (less common):**
- HINFO, MB, MG, MR, NULL, WKS, etc.

**Approach:** Implement A record fully, then add a "RawRDATA" variant that stores unknown types as raw bytes. This proves the concept while handling all TYPE values.

---

## Array Handling Challenge

DNS uses **header field references** for array lengths:
```json
{
  "questions": {
    "type": "array",
    "kind": "length_prefixed",
    "length_field": "qdcount",  // ← Reference to header field
    "items": { "type": "Question" }
  }
}
```

**Current BinSchema support:**
- ✅ Fixed-length arrays: `"kind": "fixed", "length": 5`
- ✅ Inline length prefix: `"kind": "length_prefixed", "length_type": "uint16"`
- ❌ **Field reference:** `"length_field": "qdcount"`

**Options:**
1. **Add field reference support** (clean, reusable)
2. **Use conditional fields** (hacky but works now)
3. **Manual array handling** (defeats purpose of schema)

**Decision:** Implement field reference support properly - other protocols need this too.

---

## Expected Outcomes

After completing this checklist:

1. ✅ **Can claim:** "BinSchema fully implements RFC 1035 DNS protocol"
2. ✅ **Proven capabilities:**
   - Complete message parsing (all sections)
   - Discriminated unions for RDATA
   - Arrays with header field length references
   - Compression pointers in nested structures
3. ✅ **Test coverage:** Real DNS wire format examples from RFC 1035
4. ✅ **No shortcuts:** Every field specified in RFC is in our schema

**This proves BinSchema can handle complete real-world protocols, not just the interesting parts.**

---

## Notes

- Focus on correctness over feature count
- Every test case should use actual RFC 1035 examples
- Round-trip tests (encode then decode) verify completeness
- Document any deliberate omissions with rationale
