import { BitStreamEncoder, BitStreamDecoder } from "../../runtime/bit-stream";
import { Endianness } from "../../schema/binary-schema";

/**
 * Tests for BitStream peek methods (non-consuming reads)
 *
 * Peek methods read values without advancing the stream position.
 * This is critical for discriminated unions where we need to examine
 * bytes to decide which variant to parse.
 */

interface PeekTestCase {
  description: string;
  bytes: number[];
  peekMethod: "peekUint8" | "peekUint16" | "peekUint32";
  endianness?: Endianness;
  expectedValue: number;
  readMethod?: "readUint8" | "readUint16" | "readUint32";
}

const PEEK_TEST_CASES: PeekTestCase[] = [
  // peekUint8 tests
  {
    description: "peekUint8 - single byte",
    bytes: [0x42],
    peekMethod: "peekUint8",
    expectedValue: 0x42,
  },
  {
    description: "peekUint8 - first byte of multi-byte buffer",
    bytes: [0xAB, 0xCD, 0xEF],
    peekMethod: "peekUint8",
    expectedValue: 0xAB,
  },
  {
    description: "peekUint8 - zero value",
    bytes: [0x00, 0xFF],
    peekMethod: "peekUint8",
    expectedValue: 0x00,
  },
  {
    description: "peekUint8 - max value (255)",
    bytes: [0xFF, 0x00],
    peekMethod: "peekUint8",
    expectedValue: 0xFF,
  },

  // peekUint16 tests - big endian
  {
    description: "peekUint16 - big endian (default)",
    bytes: [0x12, 0x34, 0x56],
    peekMethod: "peekUint16",
    endianness: "big_endian",
    expectedValue: 0x1234,
  },
  {
    description: "peekUint16 - big endian zero",
    bytes: [0x00, 0x00, 0xFF],
    peekMethod: "peekUint16",
    endianness: "big_endian",
    expectedValue: 0x0000,
  },
  {
    description: "peekUint16 - big endian max value",
    bytes: [0xFF, 0xFF, 0x00],
    peekMethod: "peekUint16",
    endianness: "big_endian",
    expectedValue: 0xFFFF,
  },
  {
    description: "peekUint16 - big endian high byte set",
    bytes: [0x80, 0x00, 0x12],
    peekMethod: "peekUint16",
    endianness: "big_endian",
    expectedValue: 0x8000,
  },

  // peekUint16 tests - little endian
  {
    description: "peekUint16 - little endian",
    bytes: [0x34, 0x12, 0x56],
    peekMethod: "peekUint16",
    endianness: "little_endian",
    expectedValue: 0x1234,
  },
  {
    description: "peekUint16 - little endian zero",
    bytes: [0x00, 0x00, 0xFF],
    peekMethod: "peekUint16",
    endianness: "little_endian",
    expectedValue: 0x0000,
  },
  {
    description: "peekUint16 - little endian max value",
    bytes: [0xFF, 0xFF, 0x00],
    peekMethod: "peekUint16",
    endianness: "little_endian",
    expectedValue: 0xFFFF,
  },

  // peekUint32 tests - big endian
  {
    description: "peekUint32 - big endian (default)",
    bytes: [0x12, 0x34, 0x56, 0x78, 0x9A],
    peekMethod: "peekUint32",
    endianness: "big_endian",
    expectedValue: 0x12345678,
  },
  {
    description: "peekUint32 - big endian zero",
    bytes: [0x00, 0x00, 0x00, 0x00, 0xFF],
    peekMethod: "peekUint32",
    endianness: "big_endian",
    expectedValue: 0x00000000,
  },
  {
    description: "peekUint32 - big endian max value",
    bytes: [0xFF, 0xFF, 0xFF, 0xFF, 0x00],
    peekMethod: "peekUint32",
    endianness: "big_endian",
    expectedValue: 0xFFFFFFFF,
  },

  // peekUint32 tests - little endian
  {
    description: "peekUint32 - little endian",
    bytes: [0x78, 0x56, 0x34, 0x12, 0x9A],
    peekMethod: "peekUint32",
    endianness: "little_endian",
    expectedValue: 0x12345678,
  },
  {
    description: "peekUint32 - little endian zero",
    bytes: [0x00, 0x00, 0x00, 0x00, 0xFF],
    peekMethod: "peekUint32",
    endianness: "little_endian",
    expectedValue: 0x00000000,
  },
  {
    description: "peekUint32 - little endian max value",
    bytes: [0xFF, 0xFF, 0xFF, 0xFF, 0x00],
    peekMethod: "peekUint32",
    endianness: "little_endian",
    expectedValue: 0xFFFFFFFF,
  },
];

/**
 * Test that peek methods don't advance position
 */
function testPeekDoesNotAdvancePosition() {
  const testCases = [
    {
      description: "peekUint8 doesn't advance position",
      bytes: [0x12, 0x34, 0x56],
      peekMethod: "peekUint8" as const,
      readMethod: "readUint8" as const,
      expectedPeek: 0x12,
      expectedRead: 0x12,
    },
    {
      description: "peekUint16 doesn't advance position (big endian)",
      bytes: [0x12, 0x34, 0x56],
      peekMethod: "peekUint16" as const,
      readMethod: "readUint16" as const,
      endianness: "big_endian" as Endianness,
      expectedPeek: 0x1234,
      expectedRead: 0x1234,
    },
    {
      description: "peekUint32 doesn't advance position (big endian)",
      bytes: [0x12, 0x34, 0x56, 0x78, 0x9A],
      peekMethod: "peekUint32" as const,
      readMethod: "readUint32" as const,
      endianness: "big_endian" as Endianness,
      expectedPeek: 0x12345678,
      expectedRead: 0x12345678,
    },
  ];

  for (const tc of testCases) {
    const decoder = new BitStreamDecoder(new Uint8Array(tc.bytes));

    // Peek first
    const peekValue =
      tc.endianness !== undefined
        ? (decoder as any)[tc.peekMethod](tc.endianness)
        : (decoder as any)[tc.peekMethod]();

    if (peekValue !== tc.expectedPeek) {
      throw new Error(
        `${tc.description}: peek returned ${peekValue}, expected ${tc.expectedPeek}`
      );
    }

    // Position should still be 0
    if (decoder.position !== 0) {
      throw new Error(
        `${tc.description}: position is ${decoder.position}, expected 0 after peek`
      );
    }

    // Now read - should get same value and advance position
    const readValue =
      tc.endianness !== undefined
        ? (decoder as any)[tc.readMethod](tc.endianness)
        : (decoder as any)[tc.readMethod]();

    if (readValue !== tc.expectedRead) {
      throw new Error(
        `${tc.description}: read returned ${readValue}, expected ${tc.expectedRead}`
      );
    }

    // Position should now be advanced
    const expectedPosition: number = tc.peekMethod === "peekUint8" ? 1 : tc.peekMethod === "peekUint16" ? 2 : 4;
    const actualPosition: number = decoder.position;
    if (actualPosition !== expectedPosition) {
      throw new Error(
        `${tc.description}: position is ${actualPosition}, expected ${expectedPosition} after read`
      );
    }
  }

  console.log("✓ Peek methods don't advance position");
}

/**
 * Test that multiple peeks return same value
 */
function testMultiplePeeksReturnSameValue() {
  const testCases = [
    { bytes: [0x42, 0x43], method: "peekUint8" as const, expected: 0x42 },
    { bytes: [0x12, 0x34, 0x56], method: "peekUint16" as const, expected: 0x1234, endianness: "big_endian" as Endianness },
    { bytes: [0x12, 0x34, 0x56, 0x78], method: "peekUint32" as const, expected: 0x12345678, endianness: "big_endian" as Endianness },
  ];

  for (const tc of testCases) {
    const decoder = new BitStreamDecoder(new Uint8Array(tc.bytes));

    // Peek multiple times
    for (let i = 0; i < 5; i++) {
      const value =
        tc.endianness !== undefined
          ? (decoder as any)[tc.method](tc.endianness)
          : (decoder as any)[tc.method]();

      if (value !== tc.expected) {
        throw new Error(
          `${tc.method} peek #${i + 1}: returned ${value}, expected ${tc.expected}`
        );
      }

      if (decoder.position !== 0) {
        throw new Error(
          `${tc.method} peek #${i + 1}: position is ${decoder.position}, expected 0`
        );
      }
    }
  }

  console.log("✓ Multiple peeks return same value");
}

/**
 * Test peek after reading (peek sees next value)
 */
function testPeekAfterRead() {
  const decoder = new BitStreamDecoder(new Uint8Array([0x12, 0x34, 0x56, 0x78]));

  // Read first byte
  const firstByte = decoder.readUint8();
  if (firstByte !== 0x12) {
    throw new Error(`Read first byte: got ${firstByte}, expected 0x12`);
  }

  // Peek should see second byte
  const peekByte = decoder.peekUint8();
  if (peekByte !== 0x34) {
    throw new Error(`Peek after read: got ${peekByte}, expected 0x34`);
  }

  // Position should still be 1
  if (decoder.position !== 1) {
    throw new Error(`Position after peek: got ${decoder.position}, expected 1`);
  }

  // Read uint16 (should get 0x3456)
  const uint16 = decoder.readUint16("big_endian");
  if (uint16 !== 0x3456) {
    throw new Error(`Read uint16: got ${uint16}, expected 0x3456`);
  }

  // Peek should see fourth byte
  const peekByte2 = decoder.peekUint8();
  if (peekByte2 !== 0x78) {
    throw new Error(`Peek after read: got ${peekByte2}, expected 0x78`);
  }

  console.log("✓ Peek after read sees correct next value");
}

/**
 * Test peek at end of buffer (should throw or return sentinel)
 */
function testPeekAtEndOfBuffer() {
  const testCases = [
    {
      description: "peekUint8 at end of buffer",
      bytes: [0x12],
      peekMethod: "peekUint8" as const,
      readFirst: true,
    },
    {
      description: "peekUint16 with insufficient bytes (1 byte left)",
      bytes: [0x12, 0x34],
      peekMethod: "peekUint16" as const,
      readFirst: true, // Read first byte, leaving only 1 byte
    },
    {
      description: "peekUint32 with insufficient bytes (2 bytes left)",
      bytes: [0x12, 0x34, 0x56],
      peekMethod: "peekUint32" as const,
      readFirst: true, // Read first byte, leaving only 2 bytes
    },
  ];

  for (const tc of testCases) {
    const decoder = new BitStreamDecoder(new Uint8Array(tc.bytes));

    if (tc.readFirst) {
      decoder.readUint8(); // Consume first byte
    }

    // Attempt to peek beyond buffer - should throw
    let threw = false;
    try {
      (decoder as any)[tc.peekMethod]("big_endian");
    } catch (err) {
      threw = true;
      if (!(err instanceof Error) || !err.message.includes("out of bounds")) {
        throw new Error(
          `${tc.description}: expected "out of bounds" error, got: ${err}`
        );
      }
    }

    if (!threw) {
      throw new Error(`${tc.description}: expected error but none was thrown`);
    }
  }

  console.log("✓ Peek at end of buffer throws appropriate error");
}

/**
 * Test peek with different endianness
 */
function testPeekEndianness() {
  const bytes = [0x12, 0x34, 0x56, 0x78];
  const decoder = new BitStreamDecoder(new Uint8Array(bytes));

  // Peek uint16 big endian
  const bigEndian16 = decoder.peekUint16("big_endian");
  if (bigEndian16 !== 0x1234) {
    throw new Error(`peekUint16 big endian: got ${bigEndian16}, expected 0x1234`);
  }

  // Peek uint16 little endian (position still 0)
  const littleEndian16 = decoder.peekUint16("little_endian");
  if (littleEndian16 !== 0x3412) {
    throw new Error(`peekUint16 little endian: got ${littleEndian16}, expected 0x3412`);
  }

  // Peek uint32 big endian
  const bigEndian32 = decoder.peekUint32("big_endian");
  if (bigEndian32 !== 0x12345678) {
    throw new Error(`peekUint32 big endian: got ${bigEndian32}, expected 0x12345678`);
  }

  // Peek uint32 little endian
  const littleEndian32 = decoder.peekUint32("little_endian");
  if (littleEndian32 !== 0x78563412) {
    throw new Error(`peekUint32 little endian: got ${littleEndian32}, expected 0x78563412`);
  }

  // Position should still be 0
  if (decoder.position !== 0) {
    throw new Error(`Position after all peeks: got ${decoder.position}, expected 0`);
  }

  console.log("✓ Peek methods handle endianness correctly");
}

/**
 * CRITICAL TEST: Bit-alignment interaction with peek methods
 *
 * DNS compression can occur mid-byte if preceded by bitfields in the header.
 * Peek methods must either throw an error or properly handle non-byte-aligned positions.
 */
function testPeekAfterReadingBits() {
  // Test 1: Peek after reading 1 bit
  {
    const decoder = new BitStreamDecoder(new Uint8Array([0xFF, 0xAB, 0xCD]));
    decoder.readBit(); // Read 1 bit, now at bit offset 1

    // Peek should throw error (not byte-aligned)
    try {
      decoder.peekUint8();
      throw new Error("peekUint8 after readBit(1) should throw 'not byte-aligned' error");
    } catch (err) {
      if (!(err instanceof Error) || !err.message.toLowerCase().includes("byte")) {
        throw new Error(
          `Expected error about byte alignment, got: ${err instanceof Error ? err.message : err}`
        );
      }
    }
  }

  // Test 2: Peek after reading 7 bits (almost full byte)
  {
    const decoder = new BitStreamDecoder(new Uint8Array([0xFF, 0xAB, 0xCD]));
    for (let i = 0; i < 7; i++) {
      decoder.readBit();
    }

    // Peek should throw error (still not byte-aligned)
    try {
      decoder.peekUint8();
      throw new Error("peekUint8 after readBit(7) should throw 'not byte-aligned' error");
    } catch (err) {
      if (!(err instanceof Error) || !err.message.toLowerCase().includes("byte")) {
        throw new Error(
          `Expected error about byte alignment, got: ${err instanceof Error ? err.message : err}`
        );
      }
    }
  }

  // Test 3: Peek after reading exactly 8 bits (should be byte-aligned again)
  {
    const decoder = new BitStreamDecoder(new Uint8Array([0xFF, 0xAB, 0xCD]));
    for (let i = 0; i < 8; i++) {
      decoder.readBit();
    }

    // Now byte-aligned at position 1 - peek should work
    const value = decoder.peekUint8();
    if (value !== 0xAB) {
      throw new Error(`peekUint8 after 8 bits: got ${value}, expected 0xAB`);
    }

    // Position should be 1
    if (decoder.position !== 1) {
      throw new Error(`Position after 8 bits: got ${decoder.position}, expected 1`);
    }
  }

  console.log("✓ Peek methods correctly handle bit alignment (throw when not byte-aligned)");
}

/**
 * CRITICAL TEST: Comprehensive bounds checking from position 0
 *
 * Security-critical: ensure peek doesn't read beyond buffer even from start.
 */
function testPeekBoundsFromPositionZero() {
  // Test 1: peekUint8 on empty buffer
  {
    const decoder = new BitStreamDecoder(new Uint8Array([]));
    try {
      decoder.peekUint8();
      throw new Error("peekUint8 on empty buffer should throw");
    } catch (err) {
      if (!(err instanceof Error) || !err.message.toLowerCase().includes("out of bounds")) {
        throw new Error(`Expected 'out of bounds' error, got: ${err instanceof Error ? err.message : err}`);
      }
    }
  }

  // Test 2: peekUint16 with only 1 byte from start
  {
    const decoder = new BitStreamDecoder(new Uint8Array([0x12]));
    try {
      decoder.peekUint16("big_endian");
      throw new Error("peekUint16 with 1-byte buffer should throw");
    } catch (err) {
      if (!(err instanceof Error) || !err.message.toLowerCase().includes("out of bounds")) {
        throw new Error(`Expected 'out of bounds' error, got: ${err instanceof Error ? err.message : err}`);
      }
    }
  }

  // Test 3: peekUint32 with only 1 byte from start
  {
    const decoder = new BitStreamDecoder(new Uint8Array([0x12]));
    try {
      decoder.peekUint32("big_endian");
      throw new Error("peekUint32 with 1-byte buffer should throw");
    } catch (err) {
      if (!(err instanceof Error) || !err.message.toLowerCase().includes("out of bounds")) {
        throw new Error(`Expected 'out of bounds' error, got: ${err instanceof Error ? err.message : err}`);
      }
    }
  }

  // Test 4: peekUint32 with only 2 bytes from start
  {
    const decoder = new BitStreamDecoder(new Uint8Array([0x12, 0x34]));
    try {
      decoder.peekUint32("big_endian");
      throw new Error("peekUint32 with 2-byte buffer should throw");
    } catch (err) {
      if (!(err instanceof Error) || !err.message.toLowerCase().includes("out of bounds")) {
        throw new Error(`Expected 'out of bounds' error, got: ${err instanceof Error ? err.message : err}`);
      }
    }
  }

  // Test 5: peekUint32 with only 3 bytes from start (edge case)
  {
    const decoder = new BitStreamDecoder(new Uint8Array([0x12, 0x34, 0x56]));
    try {
      decoder.peekUint32("big_endian");
      throw new Error("peekUint32 with 3-byte buffer should throw");
    } catch (err) {
      if (!(err instanceof Error) || !err.message.toLowerCase().includes("out of bounds")) {
        throw new Error(`Expected 'out of bounds' error, got: ${err instanceof Error ? err.message : err}`);
      }
    }
  }

  // Test 6: peekUint32 with exactly 4 bytes should work
  {
    const decoder = new BitStreamDecoder(new Uint8Array([0x12, 0x34, 0x56, 0x78]));
    const value = decoder.peekUint32("big_endian");
    if (value !== 0x12345678) {
      throw new Error(`peekUint32 with 4-byte buffer: got ${value}, expected 0x12345678`);
    }
  }

  console.log("✓ Peek methods enforce comprehensive bounds checking from position 0");
}

/**
 * IMPORTANT TEST: Peek at arbitrary positions
 *
 * Ensures peek works correctly after seeking to various positions.
 */
function testPeekAtArbitraryPositions() {
  const decoder = new BitStreamDecoder(
    new Uint8Array([0x00, 0x11, 0x22, 0x33, 0x44, 0x55, 0x66, 0x77])
  );

  const positions = [0, 1, 2, 3, 6, 7]; // Include near-end position

  for (const pos of positions) {
    decoder.seek(pos);
    const peeked = decoder.peekUint8();
    const expected = pos * 0x11;

    if (peeked !== expected) {
      throw new Error(
        `Peek at position ${pos}: got 0x${peeked.toString(16)}, expected 0x${expected.toString(16)}`
      );
    }

    // Verify position didn't change
    if (decoder.position !== pos) {
      throw new Error(`Position changed after peek at ${pos}: now ${decoder.position}`);
    }
  }

  console.log("✓ Peek methods work correctly at arbitrary positions");
}

/**
 * IMPORTANT TEST: Peek → seek integration
 *
 * Critical for DNS compression: peek to check for pointer, then seek to offset.
 */
function testPeekThenSeekIntegration() {
  // Simulate DNS compression pointer detection
  const decoder = new BitStreamDecoder(
    new Uint8Array([
      0xC0, 0x0C, // Pointer: 0xC00C (points to offset 12)
      0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, // Padding
      0x07, 0x65, 0x78, // Offset 12: length-prefixed string
    ])
  );

  // Peek first byte to check if it's a pointer (top 2 bits = 11)
  const firstByte = decoder.peekUint8();
  if ((firstByte & 0xC0) !== 0xC0) {
    throw new Error(`Expected pointer marker (0xC0), got 0x${firstByte.toString(16)}`);
  }

  // Position should still be 0
  if (decoder.position !== 0) {
    throw new Error(`Position after peek: got ${decoder.position}, expected 0`);
  }

  // Read full pointer value
  const pointer = decoder.readUint16("big_endian");
  const offset = pointer & 0x3FFF; // Extract lower 14 bits

  if (offset !== 12) {
    throw new Error(`Pointer offset: got ${offset}, expected 12`);
  }

  // Now at position 2
  const currentPosition: number = decoder.position;
  if (currentPosition !== 2) {
    throw new Error(`Position after reading pointer: got ${currentPosition}, expected 2`);
  }

  // Save position before following pointer
  decoder.pushPosition();

  // Seek to offset
  decoder.seek(offset);
  const posAfterSeek: number = decoder.position;
  if (posAfterSeek !== 12) {
    throw new Error(`Position after seek: got ${posAfterSeek}, expected 12`);
  }

  // Read data at offset
  const length = decoder.readUint8();
  if (length !== 0x07) {
    throw new Error(`Length at offset 12: got ${length}, expected 7`);
  }

  // Restore position
  decoder.popPosition();
  const posAfterPop: number = decoder.position;
  if (posAfterPop !== 2) {
    throw new Error(`Position after popPosition: got ${posAfterPop}, expected 2`);
  }

  console.log("✓ Peek → seek integration works correctly (DNS compression pattern)");
}

/**
 * Main test runner
 */
export function runPeekMethodsTests() {
  console.log("\n=== Peek Methods Tests ===\n");

  // Basic peek value tests
  for (const tc of PEEK_TEST_CASES) {
    const decoder = new BitStreamDecoder(new Uint8Array(tc.bytes));
    const value =
      tc.endianness !== undefined
        ? (decoder as any)[tc.peekMethod](tc.endianness)
        : (decoder as any)[tc.peekMethod]();

    if (value !== tc.expectedValue) {
      throw new Error(
        `${tc.description}: got ${value}, expected ${tc.expectedValue}`
      );
    }
  }
  console.log(`✓ All ${PEEK_TEST_CASES.length} basic peek value tests passed`);

  testPeekDoesNotAdvancePosition();
  testMultiplePeeksReturnSameValue();
  testPeekAfterRead();
  testPeekAtEndOfBuffer();
  testPeekEndianness();
  testPeekAfterReadingBits();
  testPeekBoundsFromPositionZero();
  testPeekAtArbitraryPositions();
  testPeekThenSeekIntegration();

  console.log("\n✓ All peek methods tests passed!\n");
}

// Run tests if executed directly
if (require.main === module) {
  runPeekMethodsTests();
}
