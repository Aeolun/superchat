# BinSchema Streaming Feasibility Analysis

## Current Architecture

BinSchema currently uses a **batch processing model** where:

1. Complete binary data is loaded into `BitStreamDecoder`
2. Decoder walks through the schema sequentially
3. Full message is decoded and returned as a complete object
4. User receives the entire decoded structure at once

**Example current flow:**
```typescript
const stream = new BitStreamDecoder(bytes);
const message = decodeMessage(stream);
// User gets complete message after all decoding is done
console.log(message.items); // All items available
```

## Proposed Streaming Model

Enable **network streaming + incremental decoding** where:

1. Binary data arrives incrementally from network (ReadableStream)
2. Decoder yields fields/items as soon as they're complete
3. User processes data while rest still downloading

**Example: Streaming array items:**
```typescript
// Network streaming with async iterator
const response = await fetch('/data.bin');
for await (const item of decodeMessageArrayStream(response.body)) {
  console.log(item); // Each Message yielded as it arrives
  // Don't need to wait for entire response!
}
```

**Example: Streaming mixed fields (union types):**
```typescript
// Stream a type with header, array, and footer
for await (const event of decodeComplexMessageStream(response.body)) {
  switch (event.type) {
    case 'header':
      console.log('Header:', event.value);
      break;
    case 'item':
      console.log('Item:', event.value);
      break;
    case 'footer':
      console.log('Footer:', event.value);
      break;
  }
}
```

## Key Insight: Streaming Requires Both Network + Decode

**Without network streaming, decoding callbacks provide minimal benefit:**
- If entire byte array loads first, all callbacks fire immediately
- Only marginal benefits: lower memory, early termination

**True streaming requires end-to-end approach:**
- Read bytes from network incrementally
- Decode items as soon as enough bytes available
- Yield items while rest of data still downloading

## Technical Feasibility

### ✅ What Works Well

1. **Sequential decoding**: BinSchema already decodes sequentially, one field at a time
2. **Length-prefixed arrays**: Known item count upfront enables progress tracking
3. **Fixed arrays**: Known item count upfront
4. **Independent items**: Array items don't reference each other (no forward references)
5. **BitStreamDecoder state**: Already maintains position and can be resumed

### ⚠️ Challenges

#### 1. **Generator/Callback Architecture**

Current code generates **synchronous functions** that return complete objects:

```typescript
// Current generated code
export function decodeMessage(stream: BitStreamDecoder): Message {
  const items: Item[] = [];
  const items_length = stream.readUint16('big_endian');
  for (let i = 0; i < items_length; i++) {
    items.push(decodeItem(stream));
  }
  return { items };
}
```

For streaming, would need to generate **generator functions**:

```typescript
// Streaming variant
export function* decodeMessageStream(stream: BitStreamDecoder): Generator<Item, void, unknown> {
  const items_length = stream.readUint16('big_endian');
  for (let i = 0; i < items_length; i++) {
    yield decodeItem(stream); // Yield each item as decoded
  }
}
```

**Implementation options:**

- **Option A**: Generate both batch and streaming variants (doubles code generation)
- **Option B**: Only generate streaming variant (breaking change, requires collecting items manually)
- **Option C**: Add configuration option to choose batch vs streaming per-type

#### 2. **Mixed Field Types - Solved with Union Types**

Messages with multiple fields can stream **everything** using discriminated unions:

```typescript
interface ComplexMessage {
  header: Header;        // Decoded first
  items: Item[];        // Streamed as they arrive
  footer: Footer;       // Decoded last
}

// Generated streaming decoder yields union type
type ComplexMessageEvent =
  | { type: 'header', value: Header }
  | { type: 'item', value: Item }
  | { type: 'footer', value: Footer };

async function* decodeComplexMessageStream(
  reader: ReadableStreamDefaultReader
): AsyncGenerator<ComplexMessageEvent> {
  // Decode header first
  const headerBytes = await readExactly(reader, headerSize);
  const header = decodeHeader(new BitStreamDecoder(headerBytes));
  yield { type: 'header', value: header };

  // Stream array items
  const itemCount = header.itemCount; // or read separately
  for (let i = 0; i < itemCount; i++) {
    const itemBytes = await readItemBytes(reader);
    const item = decodeItem(new BitStreamDecoder(itemBytes));
    yield { type: 'item', value: item };
  }

  // Decode footer last
  const footerBytes = await readExactly(reader, footerSize);
  const footer = decodeFooter(new BitStreamDecoder(footerBytes));
  yield { type: 'footer', value: footer };
}
```

**Advantages:**
- ✅ **Everything can stream** - not just simple arrays
- ✅ Type-safe with discriminated unions
- ✅ Consumer knows what type each event is
- ✅ Encapsulation preserved - decoder handles structure
- ✅ Works with any field ordering

#### 3. **Null-Terminated Arrays**

Arrays without known length require **peek-ahead** to check for terminator:

```typescript
while (true) {
  const byte = stream.readUint8();
  if (byte === 0) break;
  items.push(byte);
}
```

This still works with streaming - just yield items until terminator found.

#### 4. **Nested Structures**

For nested arrays, the outer array's streaming decoder yields complete inner arrays:

```typescript
interface Message {
  threads: {           // Top-level array
    id: number;
    messages: {        // Nested array
      text: string;
    }[];
  }[];
}

// Streaming decoder yields complete Thread objects (with all messages loaded)
async function* decodeMessageStream(reader): AsyncGenerator<Thread> {
  const threadCount = await readArrayLength(reader);
  for (let i = 0; i < threadCount; i++) {
    const threadBytes = await readItemBytes(reader);
    const thread = decodeThread(new BitStreamDecoder(threadBytes));
    yield thread; // Thread contains all its messages
  }
}
```

**Rationale**: Keep streaming simple - stream at one level only. Inner arrays are decoded synchronously as part of the item.

#### 5. **Error Handling**

With batch decoding, errors abort and return nothing. With streaming:

```typescript
for (const item of decodeStream(bytes)) {
  // What if decoding fails halfway through?
  // User already processed 50 items, can't "undo"
}
```

**Implication**: Streaming is **best-effort** - partial results delivered even on failure.

### 🔧 Implementation Approach

#### Recommended: Callback-Based API (Simpler)

Add streaming variant that takes callback:

```typescript
// Generated code
export function decodeMessage(stream: BitStreamDecoder): Message {
  // ... existing batch decoder
}

export function decodeMessageWithCallback(
  stream: BitStreamDecoder,
  itemCallback: (item: Item) => void
): void {
  const items_length = stream.readUint16('big_endian');
  for (let i = 0; i < items_length; i++) {
    const item = decodeItem(stream);
    itemCallback(item);
  }
}
```

**Pros:**
- Simple to implement (modify code generator to emit callback variant)
- No need for async/await or generators
- Clear control flow

**Cons:**
- Less idiomatic than async iterators
- Can't use for-await-of syntax

#### Alternative: Generator Functions (More Idiomatic)

Generate synchronous generator:

```typescript
export function* decodeMessageItems(stream: BitStreamDecoder): Generator<Item> {
  const items_length = stream.readUint16('big_endian');
  for (let i = 0; i < items_length; i++) {
    yield decodeItem(stream);
  }
}
```

**Pros:**
- Idiomatic JavaScript (can use for-of)
- Lazy evaluation (can stop early)
- Composable with other generators

**Cons:**
- More complex codegen
- Need to decide: generate only streaming, or both batch and streaming?

#### Alternative: Async Iterator (Most Modern)

If decoding could be async (e.g., reading from stream):

```typescript
export async function* decodeMessageStream(
  reader: ReadableStreamDefaultReader<Uint8Array>
): AsyncGenerator<Item> {
  // Read length
  const lengthBytes = await readBytes(reader, 2);
  const length = new DataView(lengthBytes.buffer).getUint16(0);

  for (let i = 0; i < length; i++) {
    const itemBytes = await readItemBytes(reader);
    yield decodeItem(new BitStreamDecoder(itemBytes));
  }
}
```

**Pros:**
- Works with network streams (fetch, WebSocket)
- Modern async/await syntax
- Natural backpressure handling

**Cons:**
- Requires async architecture (BinSchema is currently fully synchronous)
- More complex implementation
- Need to know item boundaries upfront (or read byte-by-byte)

## Use Cases

### ✅ Good Use Cases for Streaming

1. **Large array of independent items**
   - DNS query with 10,000 resource records
   - Log file with millions of entries
   - Packet capture with thousands of packets

2. **Progressive UI rendering**
   - Decode and display items as they arrive
   - Show "Loading..." then populate list incrementally

3. **Memory-constrained environments**
   - Don't allocate entire array upfront
   - Process items one at a time, discard after processing

4. **Early termination**
   - Find first matching item, stop decoding rest
   - Process until some condition met

### ❌ Bad Use Cases (Streaming Doesn't Help)

1. **Small messages** (< 1KB)
   - Overhead of streaming outweighs benefits

2. **Messages with interdependent fields**
   - Need to parse entire message to understand any part

3. **Random access needed**
   - Want to jump to item 500 without decoding items 0-499
   - (Could solve with index structure, but complex)

## Recommended Approach: Two-Tier Streaming Strategy

### Strategy 1: Length-Prefixed Items (Optimal)

**New array kind: `length_prefixed_items`**

Wire format includes byte-length before each item:
```
[Array Length: uint16]
[Item 0 Length: uint32] [Item 0 Data: N bytes]
[Item 1 Length: uint32] [Item 1 Data: N bytes]
```

**Streaming implementation:**
```typescript
async function* decodeArrayStream<T>(
  reader: ReadableStreamDefaultReader,
  itemDecoder: (bytes: Uint8Array) => T
): AsyncGenerator<T> {
  // Read array length
  const lengthBytes = await readExactly(reader, 2);
  const arrayLength = new DataView(lengthBytes.buffer).getUint16(0);

  for (let i = 0; i < arrayLength; i++) {
    // Read item length
    const itemLengthBytes = await readExactly(reader, 4);
    const itemLength = new DataView(itemLengthBytes.buffer).getUint32(0);

    // Read exactly that many bytes from network
    const itemBytes = await readExactly(reader, itemLength);

    // Decode synchronously (reuses existing decoder!)
    const item = itemDecoder(itemBytes);

    yield item;
  }
}
```

**Advantages:**
- ✅ No guessing - read exact bytes needed
- ✅ Works on top of existing synchronous decoder
- ✅ Clean separation: streaming handles I/O, decoder handles parsing
- ✅ Works with any item type (simple or complex, fixed or variable)
- ✅ Efficient - minimal buffering needed

**Trade-offs:**
- Adds overhead per item (1/2/4/8 bytes depending on `item_length_type`)
- Requires buffering encoded item to measure size before writing
- New array kind - old decoders won't recognize it (but array length is still present for forward compatibility)

**Schema configuration:**
```json
{
  "messages": {
    "type": "array",
    "kind": "length_prefixed_items",
    "length_type": "uint16",
    "item_length_type": "uint32",
    "items": { "type": "Message" }
  }
}
```

**Choosing `item_length_type` (required field):**
- `"uint8"`: Max 255 bytes per item (1 byte overhead) - use for small, fixed-size items
- `"uint16"`: Max 65,535 bytes per item (2 bytes overhead) - good for most messages
- `"uint32"`: Max 4GB per item (4 bytes overhead) - use for large payloads, file chunks
- `"uint64"`: Max 2^64-1 bytes per item (8 bytes overhead) - rarely needed

**Note:** This field is **required** in schema definitions (no defaults). Wire format specs should be explicit about byte layout.

**Example: Small items (use uint8)**
```json
{
  "points": {
    "kind": "length_prefixed_items",
    "length_type": "uint16",
    "item_length_type": "uint8",  // Each point ~6 bytes (EXPLICIT)
    "items": { "type": "Point3D" }
  }
}
```

**Example: Large items (use uint32)**
```json
{
  "file_chunks": {
    "kind": "length_prefixed_items",
    "length_type": "uint16",
    "item_length_type": "uint32",  // Chunks up to 1MB (EXPLICIT)
    "items": { "type": "FileChunk" }
  }
}
```

**Encoding process:**
1. Encode item to temporary buffer (one-pass encoding)
2. Measure buffer size
3. Write item length, then item bytes
4. Validate item size ≤ max for `item_length_type` (throw error if exceeded)

**Note on item_length measurement:** The `item_length_type` specifies the byte-length of the **complete encoded item**, including all internal length prefixes, optional field presence bytes, nested structure overhead, etc. It is the exact number of bytes that will be read from the stream before passing to the item decoder.

### Strategy 2: Greedy Buffering (Fallback)

For arrays without per-item lengths (existing `length_prefixed`, `fixed`, `null_terminated`), use greedy buffering:

**Algorithm:**
1. Read chunk from network (configurable buffer size, e.g., 64KB)
2. Try to decode as many items as possible from buffer
3. Yield decoded items
4. If incomplete item at end, save remainder for next chunk
5. Repeat until array complete

**Error handling with error codes (cross-language compatible):**

**Design Rationale: Why Error Codes?**

BinSchema is designed to be implemented in multiple languages (TypeScript, Go, Rust, etc.). Using error codes in decoder state ensures **identical core logic** across all implementations:

```typescript
// TypeScript - uses exceptions idiomatically
class BitStreamDecoder {
  lastErrorCode: string | null = null;

  readUint8(): number {
    if (this.byteOffset >= this.bytes.length) {
      this.lastErrorCode = 'INCOMPLETE_DATA';
      throw new Error("Unexpected end of stream");
    }
    this.lastErrorCode = null; // Clear on success
    return this.bytes[this.byteOffset++];
  }
}

// Greedy buffering checks error code (same logic in all languages)
try {
  const item = decodeItem(stream);
  if (stream.lastErrorCode === 'INCOMPLETE_DATA') {
    // Incomplete item - buffer and wait for more data
    buffer = buffer.slice(lastSuccessfulPosition);
    continue;
  }
  items.push(item);
} catch (e) {
  // Real decode error - not incomplete data
  throw new Error(`Decode failed: ${e.message}`);
}
```

```go
// Go - uses error returns idiomatically (nearly identical logic!)
type BitStreamDecoder struct {
    LastErrorCode *string
    // ...
}

func (d *BitStreamDecoder) ReadUint8() (uint8, error) {
    if d.byteOffset >= len(d.bytes) {
        errCode := "INCOMPLETE_DATA"
        d.LastErrorCode = &errCode
        return 0, errors.New("unexpected end of stream")
    }
    d.LastErrorCode = nil // Clear on success
    return d.bytes[d.byteOffset], nil
}

// Greedy buffering (same logic, different syntax)
item, err := decodeItem(stream)
if stream.LastErrorCode != nil && *stream.LastErrorCode == "INCOMPLETE_DATA" {
    // Incomplete item - buffer and wait for more data
    buffer = buffer[lastSuccessfulPosition:]
    continue
}
if err != nil {
    return fmt.Errorf("decode failed: %w", err)
}
items = append(items, item)
```

**Key Benefits:**
1. ✅ **Core algorithm is identical** - copy-paste implementation between languages
2. ✅ **Language generators add syntax sugar** - throw vs return, nil vs null
3. ✅ **Cross-language compatibility** - same error codes, same logic
4. ✅ **Bug fixes transfer directly** - fix once, apply everywhere
5. ✅ **Tests check error codes** - language-agnostic test format

**Complete Implementation:**
```typescript
async function* decodeArrayGreedy<T>(
  reader: ReadableStreamDefaultReader,
  arrayLength: number,
  itemDecoder: (stream: BitStreamDecoder) => T,
  bufferSize: number = 65536
): AsyncGenerator<T> {
  let buffer = new Uint8Array(0);
  let itemsDecoded = 0;

  while (itemsDecoded < arrayLength) {
    // Read next chunk from network
    const { value, done } = await reader.read();
    if (value) buffer = concat(buffer, value);

    // Decode as many items as possible from current buffer
    const stream = new BitStreamDecoder(buffer);
    const itemsThisChunk: T[] = [];

    // Track last successful position for buffering incomplete items
    let lastSuccessfulPosition = 0;

    while (itemsDecoded < arrayLength) {
      // Save position before attempting decode
      lastSuccessfulPosition = stream.position;

      try {
        const item = itemDecoder(stream);

        // Verify decoder made progress (prevent infinite loops)
        if (stream.position === lastSuccessfulPosition) {
          throw new Error("Decoder stuck: no bytes consumed");
        }

        // Check if decode succeeded but hit incomplete data
        if (stream.lastErrorCode === 'INCOMPLETE_DATA') {
          // Item decode succeeded but read ahead hit EOF
          // This shouldn't happen with proper decoder design, but handle it
          buffer = buffer.slice(lastSuccessfulPosition);
          break; // Wait for more data
        }

        // Successful decode
        itemsThisChunk.push(item);
        itemsDecoded++;
        stream.lastErrorCode = null; // Clear error state

      } catch (e) {
        // Check if this was an incomplete data error
        if (stream.lastErrorCode === 'INCOMPLETE_DATA') {
          // Incomplete item - rewind to last successful position
          buffer = buffer.slice(lastSuccessfulPosition);
          break; // Wait for more network data
        } else {
          // Real decode error - wrap with context for debugging
          throw new Error(
            `Decode failed at item ${itemsDecoded} of ${arrayLength} ` +
            `(byte offset ${stream.position}): ${e instanceof Error ? e.message : String(e)}`
          );
        }
      }
    }

    // Yield all items decoded in this chunk
    for (const item of itemsThisChunk) yield item;

    // Check if stream ended
    if (done) {
      if (itemsDecoded < arrayLength) {
        throw new Error(
          `Stream ended prematurely: decoded ${itemsDecoded} of ${arrayLength} items`
        );
      }
      break; // All items decoded successfully
    }
  }
}
```

**Error codes (shared across implementations):**
- `INCOMPLETE_DATA`: Not enough bytes in buffer (need more network data)
- `INVALID_VALUE`: Value out of range or invalid for type
- `SCHEMA_MISMATCH`: Data doesn't match schema expectations
- `CIRCULAR_REFERENCE`: Infinite loop in pointer structures

**Advantages:**
- ✅ Works with existing array kinds (no protocol changes)
- ✅ Still provides streaming benefit (decode while downloading)
- ✅ Reuses existing synchronous decoder

**Trade-offs:**
- Less efficient than per-item lengths (may decode partial items multiple times)
- Requires try/catch for "unexpected end of stream" errors
- Variable-length items create uncertainty at buffer boundaries

**When to use:**
- Existing protocols can't change wire format
- Items have predictable sizes (fixed-size primitives/structs)
- Backward compatibility required

## Code Generation Rules

**When to Generate Streaming Decoders:**

Generate streaming decoders for **all types** - streaming is not limited to simple arrays!

### Simple Array Types

For types containing a single array field:

```typescript
type MessageArray = {
  messages: Message[];
}
```

Generate streaming decoder that yields **array items directly**:

```typescript
async function* decodeMessageArrayStream(
  reader: ReadableStreamDefaultReader
): AsyncGenerator<Message> {
  // Yield individual Message objects
}
```

**Test Expectation**: Test runner collects yielded items and compares with `testCase.value.messages`.

### Mixed Field Types

For types with multiple fields (header, array, footer):

```typescript
type ComplexMessage = {
  header: Header;
  items: Item[];
  footer: Footer;
}
```

Generate discriminated union type and streaming decoder:

```typescript
type ComplexMessageEvent =
  | { type: 'header', value: Header }
  | { type: 'item', value: Item }
  | { type: 'footer', value: Footer };

async function* decodeComplexMessageStream(
  reader: ReadableStreamDefaultReader
): AsyncGenerator<ComplexMessageEvent> {
  // Yield header, then items, then footer
}
```

### Simple Structs (No Arrays)

For types with no array fields:

```typescript
type Point = {
  x: number;
  y: number;
}
```

**Option 1**: Don't generate streaming decoder (use batch decoder only)
**Option 2**: Generate streaming decoder that yields single value:

```typescript
async function* decodePointStream(
  reader: ReadableStreamDefaultReader
): AsyncGenerator<Point> {
  const bytes = await readExactly(reader, pointSize);
  yield decodePoint(new BitStreamDecoder(bytes));
}
```

**Recommendation**: Option 1 (skip streaming for simple structs) - minimal value, adds complexity.

### Nested Arrays

For nested array structures:

```typescript
type Message = {
  threads: Thread[];  // Each thread contains message array
}

type Thread = {
  id: number;
  messages: Message[];
}
```

Stream at the **outermost level only**. Inner arrays are decoded synchronously:

```typescript
async function* decodeMessageStream(
  reader: ReadableStreamDefaultReader
): AsyncGenerator<Thread> {
  // Each yielded Thread has all its messages already loaded
}
```

**Rationale**: Multi-level streaming adds complexity without clear benefit. User can stream outer array and process inner arrays in memory.

## Implementation Plan

### Phase 1: Add `length_prefixed_items` Array Kind

1. **Schema changes:**
   - Add `item_length_type` field to array schema
   - Validate `length_prefixed_items` array kind

2. **Codegen changes (encoder):**
   - Encode each item to temp buffer
   - Write item length, then item bytes

3. **Codegen changes (decoder - synchronous):**
   - Read item length
   - Read exactly that many bytes
   - Decode item from bytes
   - (Existing batch decoder still works)

4. **Tests:**
   - All test cases in `length-prefixed-items.test.ts`
   - Primitives, strings, structs, nested, optional fields

### Phase 2: Add Network Streaming Layer

1. **New module: `src/runtime/stream-decoder.ts`:**
   - `StreamDecoder` class wraps `ReadableStreamDefaultReader`
   - `decodeArrayStream()` for `length_prefixed_items` arrays
   - `decodeArrayGreedy()` for standard arrays

2. **Helper: `readExactly(reader, n)`:**
   - Read exactly N bytes from stream (may require multiple chunks)

3. **Tests:**
   - Mock `ReadableStream` with controlled chunk boundaries
   - Verify items yielded incrementally
   - Test incomplete items at chunk boundaries

### Phase 3: Generate Streaming Variants

1. **Codegen option:** `generate_streaming: true`
2. Generate async functions alongside sync decoders:
   ```typescript
   // Existing sync decoder (unchanged)
   export function decodeMessage(stream: BitStreamDecoder): Message;

   // New streaming decoder
   export async function* decodeMessageStream(
     reader: ReadableStreamDefaultReader
   ): AsyncGenerator<Message>;
   ```

3. Detect root-level arrays and generate appropriate streaming function

## Test Coverage

**Created test suites:**

1. **`length-prefixed-items.test.ts`** - Per-item length prefix strategy (wire format tests)
   - Basic primitives (uint32 array)
   - Variable-length items (strings)
   - Complex structs (Person with variable name)
   - Large arrays (100+ items)
   - Different item_length_type sizes (uint8/uint16/uint32/uint64)
   - Nested arrays
   - Optional fields
   - Size constraint validation (max bytes for item_length_type)

2. **`greedy-buffering.test.ts`** - Fallback strategy for existing array kinds (wire format tests)
   - Fixed arrays
   - Length-prefixed arrays (standard)
   - Primitive arrays
   - Fixed-size structs
   - Mixed fixed/variable fields
   - Empty arrays
   - Null-terminated arrays

3. **`chunked-network.test.ts`** - Edge cases for real network streaming (integration tests)
   - **Items split across chunks** (most common failure - critical for web clients)
   - One-byte chunks (worst case latency)
   - Large chunks (multiple items per chunk)
   - Partial item at chunk boundary (incomplete item buffering)
   - Variable-length items with unpredictable boundaries
   - Empty arrays (should complete immediately)
   - Network errors mid-stream (error context validation)
   - Decode errors mid-stream (partial results handling)
   - Slow consumer backpressure (verify no excessive buffering)
   - `length_prefixed_items` with chunked data

**How streaming tests work:**

Test cases can optionally specify `chunkSizes` array to trigger streaming tests:

```typescript
{
  description: "Item split across chunks",
  value: { messages: [{ id: 1, data: "hello" }] },
  bytes: [0x00, 0x01, 0x00, 0x00, 0x00, 0x01, 0x05, 0x68, 0x65, 0x6c, 0x6c, 0x6f],
  chunkSizes: [3, 5, 10]  // First chunk 3 bytes, second 5 bytes, third 10 bytes
}
```

When `chunkSizes` is present:
1. Test runner creates mock `ReadableStream` that delivers bytes in specified chunks
2. Calls generated `decode{TypeName}Stream()` async generator
3. Collects all yielded items into an array
4. **For simple array types**: Unwraps the field (e.g., `testCase.value.messages`) and compares with yielded items
5. **For mixed field types**: Reconstructs the object from yielded union events and compares with `testCase.value`
6. **For simple structs**: Compares single yielded value with `testCase.value`

**Test runner behavior (already implemented):**
- Skips streaming test if `decode{TypeName}Stream()` doesn't exist yet (TDD approach)
- Validates that `chunkSizes` sum to `bytes.length` (catches test mistakes)
- Mock `ReadableStream` repeats chunk pattern if needed (e.g., `[1]` means every byte is a separate chunk)

This automatically tests that the decoder handles:
- Items split across chunk boundaries
- Incomplete data buffering
- Incremental decoding
- Error handling mid-stream

## Design Decisions Summary

### Key Decisions Made:

1. **✅ Error codes for cross-language portability**
   - Use `lastErrorCode` property in `BitStreamDecoder` state
   - TypeScript throws exceptions (idiomatic) but sets error code first
   - Go returns errors (idiomatic) but checks error code for control flow
   - **Same core logic** across all languages - implementation is copy-paste portable
   - Tests check error codes, not exception types (language-agnostic)

2. **✅ Union types enable streaming everything**
   - Not limited to simple arrays
   - Mixed field types work via discriminated unions (`{ type: 'header', value: ... }`)
   - Consumer gets type-safe events with clear semantics
   - Encapsulation preserved - decoder handles structure

3. **✅ Stream at one level only (no nested streaming)**
   - Outer array streams items incrementally
   - Inner arrays decoded synchronously as part of item
   - Simpler implementation, clear semantics
   - User can still process nested data in memory

4. **✅ Comprehensive edge case tests**
   - `chunked-network.test.ts` tests real network conditions
   - Items split across chunks (critical for web clients)
   - Network errors, decode errors, backpressure handling
   - Tests define API first (TDD approach)

5. **✅ `item_length_type` required field (no defaults)**
   - Wire format specs should be explicit
   - Clear documentation of size constraints
   - Prevents accidental protocol changes

6. **✅ One-pass encoding (no performance penalty)**
   - Encode item once to temp buffer
   - Measure buffer size
   - Write length + bytes
   - For fixed-size types, could optimize to calculate size without buffer

## Conclusion

**Yes, streaming is feasible and valuable for BinSchema.**

**Two complementary strategies:**

1. **`length_prefixed_items`** (optimal) - New array kind for streaming-first protocols
   - Clean, efficient, predictable
   - Recommended for new protocols or protocols that can evolve
   - Array length still present (compatible structure, incompatible wire format)

2. **Greedy buffering** (fallback) - Works with existing array kinds
   - Backward compatible
   - Still provides streaming benefits
   - Good for protocols that can't change wire format

**Key architectural insights:**
- **Cross-language portability**: Error codes in decoder state enable identical logic across TypeScript/Go/Rust
- **Streaming layer wraps synchronous decoder**: No rewrite needed, clean separation of concerns
- **Network I/O and decoding separated**: ReadableStream layer + synchronous BitStreamDecoder
- **Union types enable streaming everything**: Not just arrays - mixed fields work via discriminated unions
- **Edge case tests critical**: Web clients have unpredictable chunk boundaries, tests verify correctness

**Estimated effort:**
- Phase 1 (`length_prefixed_items`): ~2-3 days (schema, codegen, tests)
- Phase 2 (streaming layer): ~2-3 days (async wrapper, helpers, error codes)
- Phase 3 (streaming codegen): ~1-2 days (generate async variants)
- Edge case testing: ~1-2 days (mock streams, error scenarios)

**Total: ~1-1.5 weeks for complete streaming support**

**Use case justification:** While not immediately critical, streaming support is expected in a production-grade binary protocol library. Good to have for future-proofing, especially for:
- Web clients with chunked TCP/WebSocket frames
- Large message arrays (1000+ items)
- Progressive UI rendering
- Memory-constrained environments

---

## Implementation Checklist

### Phase 1: `length_prefixed_items` Array Kind (~2-3 days)

**Schema Changes:**
- [ ] Add `item_length_type` field to array schema definition
- [ ] Validate `length_prefixed_items` kind in schema validator
- [ ] Add error if `item_length_type` missing when `kind: "length_prefixed_items"`
- [ ] Support `item_length_type` values: `"uint8"`, `"uint16"`, `"uint32"`, `"uint64"`

**Encoder Changes:**
- [ ] Detect `length_prefixed_items` array kind in code generator
- [ ] Generate encoding code that:
  - [ ] Encodes item to temporary buffer
  - [ ] Measures buffer size
  - [ ] Validates size ≤ max for `item_length_type` (throw error if exceeded)
  - [ ] Writes item length prefix (using `item_length_type`)
  - [ ] Writes item bytes
- [ ] Update `generateEncodeArray()` function with new case

**Decoder Changes (Synchronous):**
- [ ] Generate decoding code that:
  - [ ] Reads array length (using `length_type`)
  - [ ] For each item:
    - [ ] Reads item length (using `item_length_type`)
    - [ ] Reads exactly that many bytes
    - [ ] Decodes item from bytes slice
- [ ] Update `generateDecodeArray()` and `generateFunctionalDecodeArray()` functions

**Tests:**
- [ ] Run existing test suite (should all pass)
- [ ] All tests in `length-prefixed-items.test.ts` should pass:
  - [ ] Basic primitives
  - [ ] Variable-length strings
  - [ ] Complex structs
  - [ ] Large arrays (100+ items)
  - [ ] uint8/uint16/uint32/uint64 `item_length_type`
  - [ ] Nested arrays
  - [ ] Optional fields
  - [ ] Size constraint validation

### Phase 2: Error Codes for Cross-Language Compatibility (~1 day)

**BitStreamDecoder Changes:**
- [ ] Add `lastErrorCode: string | null` property to `BitStreamDecoder` class
- [ ] Set `lastErrorCode = 'INCOMPLETE_DATA'` when hitting EOF in all read methods:
  - [ ] `readUint8()`
  - [ ] `readUint16()`
  - [ ] `readUint32()`
  - [ ] `readUint64()`
  - [ ] `readInt8()`, `readInt16()`, `readInt32()`, `readInt64()`
  - [ ] `readFloat32()`, `readFloat64()`
  - [ ] `readBit()`
- [ ] Clear `lastErrorCode = null` on successful read
- [ ] Document error codes in comments

**Error Code Constants:**
- [ ] Define standard error codes (TypeScript + documentation):
  - [ ] `INCOMPLETE_DATA` - Not enough bytes in buffer
  - [ ] `INVALID_VALUE` - Value out of range
  - [ ] `SCHEMA_MISMATCH` - Data doesn't match schema
  - [ ] `CIRCULAR_REFERENCE` - Infinite loop in pointers

**Tests:**
- [ ] Test that `lastErrorCode` is set correctly on EOF
- [ ] Test that `lastErrorCode` is cleared on success

### Phase 3: Streaming Layer (~2-3 days)

**New Module: `src/runtime/stream-decoder.ts`:**
- [ ] Create `readExactly(reader, n)` helper function:
  - [ ] Reads exactly N bytes from `ReadableStreamDefaultReader`
  - [ ] Buffers across multiple chunks if needed
  - [ ] Throws if stream ends before N bytes read
- [ ] Implement `decodeArrayStream()` for `length_prefixed_items`:
  - [ ] Read array length
  - [ ] Loop for each item:
    - [ ] Read item length
    - [ ] Call `readExactly()` for item bytes
    - [ ] Decode item synchronously
    - [ ] Yield item
  - [ ] Async generator function
- [ ] Implement `decodeArrayGreedy()` for standard arrays:
  - [ ] Read array length
  - [ ] Buffer chunks from network
  - [ ] Try to decode items, catch `INCOMPLETE_DATA` error code
  - [ ] Buffer unconsumed bytes, wait for more data
  - [ ] Yield items as decoded
  - [ ] Wrap decode errors with context (item number, byte offset)

**Tests:**
- [ ] All tests in `chunked-network.test.ts` should pass:
  - [ ] Items split across chunks
  - [ ] One-byte chunks
  - [ ] Large chunks
  - [ ] Partial item at boundary
  - [ ] Variable-length items
  - [ ] Empty arrays
  - [ ] Network errors mid-stream
  - [ ] Decode errors mid-stream
  - [ ] Slow consumer backpressure
  - [ ] `length_prefixed_items` with chunks

**Test Framework Changes:**
- [x] ~~Add `chunkSizes` field to test schema~~ (DONE)
- [x] ~~Validate `chunkSizes` sum to `bytes.length`~~ (DONE)
- [x] ~~Create `createChunkedStream()` helper in test runner~~ (DONE)
- [x] ~~Add `runStreamingTestCase()` function~~ (DONE)
- [ ] Update tests to work with actual generated streaming functions

### Phase 4: Code Generation for Streaming Variants (~1-2 days)

**Codegen Changes:**
- [ ] Add `generate_streaming: true` option to code generator config
- [ ] Detect root-level arrays in schema
- [ ] For arrays with `kind: "length_prefixed_items"`:
  - [ ] Generate `decode{TypeName}Stream()` async generator
  - [ ] Use `readExactly()` helper for exact byte reads
- [ ] For arrays with standard kinds:
  - [ ] Generate `decode{TypeName}StreamGreedy()` async generator
  - [ ] Use greedy buffering with error code checking
- [ ] Generate both sync and streaming decoders side-by-side

**Documentation:**
- [ ] Add TypeDoc comments to generated streaming functions
- [ ] Document when to use streaming vs batch decoding
- [ ] Add usage examples

### Phase 5: Documentation and Examples (~1 day)

**Documentation Updates:**
- [ ] Update `CLAUDE.md` with streaming section
- [ ] Add streaming examples to `examples/` directory
- [ ] Document error codes and their meanings
- [ ] Add troubleshooting guide for common streaming issues

**Examples to Add:**
- [ ] Simple streaming example (fetch data, decode incrementally)
- [ ] Web client example (WebSocket/fetch integration)
- [ ] Greedy buffering example (existing protocol)
- [ ] Error handling example (network failure, invalid data)

**README Updates:**
- [ ] Add streaming section to main README
- [ ] Add badges/indicators for streaming support
- [ ] Link to streaming analysis document

### Testing Checklist

**Unit Tests:**
- [ ] All existing tests pass (no regressions)
- [ ] `length-prefixed-items.test.ts` (wire format)
- [ ] `greedy-buffering.test.ts` (wire format)
- [ ] `chunked-network.test.ts` (streaming integration)

**Integration Tests:**
- [ ] Test with real ReadableStream from fetch()
- [ ] Test with WebSocket streams
- [ ] Test with Node.js file streams
- [ ] Test with various chunk sizes (1 byte, 64KB, random)

**Edge Cases:**
- [ ] Empty arrays
- [ ] Single-item arrays
- [ ] Very large items (> 1MB)
- [ ] Maximum array length (uint16/uint32 limits)
- [ ] Network errors at every possible boundary
- [ ] Decode errors at every possible position

**Performance Tests:**
- [ ] Compare batch vs streaming overhead (< 10% acceptable)
- [ ] Memory usage with large arrays (no unbounded buffering)
- [ ] Backpressure handling (slow consumer doesn't OOM)

### Cross-Language Considerations

**Go Implementation (Future):**
- [ ] Document error codes in shared spec
- [ ] Ensure wire format is language-agnostic
- [ ] Test interoperability (TypeScript encode → Go decode)
- [ ] Consider Go-specific optimizations (io.Reader interface)

### Final Checklist

- [ ] All tests passing
- [ ] Documentation complete
- [ ] Examples working
- [ ] No performance regressions
- [ ] Error messages are clear and helpful
- [ ] Code review complete
- [ ] Ready for production use
