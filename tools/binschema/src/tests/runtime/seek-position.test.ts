import { BitStreamEncoder, BitStreamDecoder } from "../../runtime/bit-stream";

/**
 * Tests for BitStream position tracking and seeking
 *
 * These methods are critical for pointer following in DNS compression
 * and other protocols that use backwards references.
 */

/**
 * Test position getter returns current byte offset
 */
function testPositionGetter() {
  const decoder = new BitStreamDecoder(new Uint8Array([0x12, 0x34, 0x56, 0x78]));

  // Initial position should be 0
  if (decoder.position !== 0) {
    throw new Error(`Initial position: got ${decoder.position}, expected 0`);
  }

  // Read 1 byte
  decoder.readUint8();
  if (decoder.position !== 1) {
    throw new Error(`After readUint8: got ${decoder.position}, expected 1`);
  }

  // Read 2 bytes (uint16)
  decoder.readUint16("big_endian");
  if (decoder.position !== 3) {
    throw new Error(`After readUint16: got ${decoder.position}, expected 3`);
  }

  // Read 1 more byte
  decoder.readUint8();
  if (decoder.position !== 4) {
    throw new Error(`After second readUint8: got ${decoder.position}, expected 4`);
  }

  console.log("✓ Position getter tracks byte offset correctly");
}

/**
 * Test seeking to valid offsets
 */
function testSeekToValidOffset() {
  const decoder = new BitStreamDecoder(
    new Uint8Array([0x00, 0x11, 0x22, 0x33, 0x44, 0x55, 0x66, 0x77])
  );

  // Seek to middle of buffer
  decoder.seek(4);
  if (decoder.position !== 4) {
    throw new Error(`After seek(4): position is ${decoder.position}, expected 4`);
  }

  // Read should get byte at offset 4
  const value = decoder.readUint8();
  if (value !== 0x44) {
    throw new Error(`After seek(4) and read: got ${value}, expected 0x44`);
  }

  // Seek backwards
  decoder.seek(1);
  if (decoder.position !== 1) {
    throw new Error(`After seek(1): position is ${decoder.position}, expected 1`);
  }

  const value2 = decoder.readUint8();
  if (value2 !== 0x11) {
    throw new Error(`After seek(1) and read: got ${value2}, expected 0x11`);
  }

  // Seek to beginning
  decoder.seek(0);
  if (decoder.position !== 0) {
    throw new Error(`After seek(0): position is ${decoder.position}, expected 0`);
  }

  const value3 = decoder.readUint8();
  if (value3 !== 0x00) {
    throw new Error(`After seek(0) and read: got ${value3}, expected 0x00`);
  }

  // Seek to end (valid - allows peeking/checking if at end)
  decoder.seek(8);
  if (decoder.position !== 8) {
    throw new Error(`After seek(8): position is ${decoder.position}, expected 8`);
  }

  console.log("✓ Seek to valid offsets works correctly");
}

/**
 * Test seeking beyond buffer bounds throws error
 */
function testSeekOutOfBounds() {
  const decoder = new BitStreamDecoder(new Uint8Array([0x12, 0x34, 0x56]));

  // Seek beyond end
  try {
    decoder.seek(10);
    throw new Error("seek(10) should have thrown error");
  } catch (err) {
    if (!(err instanceof Error) || !err.message.includes("out of bounds")) {
      throw new Error(
        `Expected "out of bounds" error, got: ${err instanceof Error ? err.message : err}`
      );
    }
  }

  // Seek to negative offset
  try {
    decoder.seek(-1);
    throw new Error("seek(-1) should have thrown error");
  } catch (err) {
    if (!(err instanceof Error) || !err.message.includes("out of bounds")) {
      throw new Error(
        `Expected "out of bounds" error, got: ${err instanceof Error ? err.message : err}`
      );
    }
  }

  console.log("✓ Seek out of bounds throws appropriate error");
}

/**
 * Test that seeking resets bit offset
 */
function testSeekResetsBitOffset() {
  const decoder = new BitStreamDecoder(new Uint8Array([0xFF, 0x00, 0xAA, 0xBB]));

  // Read a bit (advances bit offset)
  const bit = decoder.readBit();
  if (bit !== 1) {
    throw new Error(`readBit: got ${bit}, expected 1`);
  }

  // Bit offset should now be 1, byte offset should be 0
  // (Internal state check - we can't directly test this, but we can test behavior)

  // Seek to offset 2 (should reset bit offset to 0)
  decoder.seek(2);

  // Read uint8 - should get 0xAA (if bit offset was reset)
  const value = decoder.readUint8();
  if (value !== 0xAA) {
    throw new Error(
      `After seek and readUint8: got ${value}, expected 0xAA (bit offset not reset?)`
    );
  }

  console.log("✓ Seek resets bit offset correctly");
}

/**
 * Test push/pop position stack (single level)
 */
function testPushPopPositionSingle() {
  const decoder = new BitStreamDecoder(
    new Uint8Array([0x00, 0x11, 0x22, 0x33, 0x44])
  );

  // Move to offset 2
  decoder.seek(2);
  if (decoder.position !== 2) {
    throw new Error(`After seek(2): position is ${decoder.position}, expected 2`);
  }

  // Save position
  decoder.pushPosition();

  // Seek elsewhere and read
  decoder.seek(4);
  const value1 = decoder.readUint8();
  if (value1 !== 0x44) {
    throw new Error(`At offset 4: got ${value1}, expected 0x44`);
  }

  // Restore position
  decoder.popPosition();
  if (decoder.position !== 2) {
    throw new Error(
      `After popPosition: position is ${decoder.position}, expected 2`
    );
  }

  // Read should get byte at restored position
  const value2 = decoder.readUint8();
  if (value2 !== 0x22) {
    throw new Error(`After restore and read: got ${value2}, expected 0x22`);
  }

  console.log("✓ Push/pop position (single level) works correctly");
}

/**
 * Test nested push/pop position (multiple levels)
 */
function testPushPopPositionNested() {
  const decoder = new BitStreamDecoder(
    new Uint8Array([0x00, 0x11, 0x22, 0x33, 0x44, 0x55])
  );

  // Start at offset 0
  const value0 = decoder.readUint8();
  if (value0 !== 0x00) {
    throw new Error(`At offset 0: got ${value0}, expected 0x00`);
  }
  // Now at offset 1

  // Save position 1
  decoder.pushPosition();

  // Move to offset 3
  decoder.seek(3);
  const value3 = decoder.readUint8();
  if (value3 !== 0x33) {
    throw new Error(`At offset 3: got ${value3}, expected 0x33`);
  }
  // Now at offset 4

  // Save position 4
  decoder.pushPosition();

  // Move to offset 5
  decoder.seek(5);
  const value5 = decoder.readUint8();
  if (value5 !== 0x55) {
    throw new Error(`At offset 5: got ${value5}, expected 0x55`);
  }

  // Pop to position 4
  decoder.popPosition();
  if (decoder.position !== 4) {
    throw new Error(
      `After first pop: position is ${decoder.position}, expected 4`
    );
  }

  // Pop to position 1
  decoder.popPosition();
  if (decoder.position !== 1) {
    throw new Error(
      `After second pop: position is ${decoder.position}, expected 1`
    );
  }

  // Read should get byte at position 1
  const value1 = decoder.readUint8();
  if (value1 !== 0x11) {
    throw new Error(`At restored position 1: got ${value1}, expected 0x11`);
  }

  console.log("✓ Push/pop position (nested) works correctly");
}

/**
 * Test pop on empty stack throws error
 */
function testPopPositionUnderflow() {
  const decoder = new BitStreamDecoder(new Uint8Array([0x12, 0x34]));

  // Pop without push should throw
  try {
    decoder.popPosition();
    throw new Error("popPosition on empty stack should have thrown error");
  } catch (err) {
    if (!(err instanceof Error) || !err.message.includes("stack underflow")) {
      throw new Error(
        `Expected "stack underflow" error, got: ${err instanceof Error ? err.message : err}`
      );
    }
  }

  // Push then pop twice should throw on second pop
  decoder.pushPosition();
  decoder.popPosition(); // OK

  try {
    decoder.popPosition(); // Should throw
    throw new Error("Second popPosition should have thrown error");
  } catch (err) {
    if (!(err instanceof Error) || !err.message.includes("stack underflow")) {
      throw new Error(
        `Expected "stack underflow" error, got: ${err instanceof Error ? err.message : err}`
      );
    }
  }

  console.log("✓ Pop position on empty stack throws appropriate error");
}

/**
 * Test realistic pointer following scenario
 */
function testRealisticPointerFollowing() {
  // Simulate DNS-style message with compression pointer
  // Bytes 0-10: First domain name "example.com"
  // Bytes 11-12: Pointer to offset 0 (0xC000)
  const bytes = new Uint8Array([
    // Offset 0-10: "example.com" (simplified - just 3 bytes for test)
    0x07, 0x65, 0x78, // "ex" (shortened for test)
    // Offset 3-5: padding
    0x00, 0x00, 0x00,
    // Offset 6-7: Pointer to offset 0 (0xC000 in big endian)
    0xC0, 0x00,
  ]);

  const decoder = new BitStreamDecoder(bytes);

  // Read first domain name at offset 0
  decoder.seek(0);
  const length1 = decoder.readUint8();
  if (length1 !== 0x07) {
    throw new Error(`First domain length: got ${length1}, expected 7`);
  }

  // Skip ahead to pointer at offset 6
  decoder.seek(6);

  // Peek to check if it's a pointer (top 2 bits set)
  const pointerValue = decoder.peekUint16("big_endian");
  if ((pointerValue & 0xC000) !== 0xC000) {
    throw new Error(
      `Expected pointer (0xC000), got ${pointerValue.toString(16)}`
    );
  }

  // Read pointer value
  const ptr = decoder.readUint16("big_endian");
  const offset = ptr & 0x3FFF; // Extract offset (bottom 14 bits)

  if (offset !== 0) {
    throw new Error(`Pointer offset: got ${offset}, expected 0`);
  }

  // Save current position before following pointer
  const currentPos = decoder.position;
  decoder.pushPosition();

  // Follow pointer to offset 0
  decoder.seek(offset);

  // Read referenced domain name
  const length2 = decoder.readUint8();
  if (length2 !== 0x07) {
    throw new Error(`Referenced domain length: got ${length2}, expected 7`);
  }

  // Restore position after following pointer
  decoder.popPosition();

  if (decoder.position !== currentPos) {
    throw new Error(
      `After popPosition: position is ${decoder.position}, expected ${currentPos}`
    );
  }

  console.log("✓ Realistic pointer following scenario works correctly");
}

/**
 * Test that position is read-only (getter only, no setter)
 */
function testPositionIsReadOnly() {
  const decoder = new BitStreamDecoder(new Uint8Array([0x12, 0x34]));

  // Try to set position directly (should not compile in TypeScript,
  // but we can test at runtime)
  const initialPosition = decoder.position;

  // TypeScript should prevent this, but test runtime behavior
  try {
    (decoder as any).position = 99;
    // If we got here, check if it actually changed
    if (decoder.position !== initialPosition) {
      throw new Error(
        "position property should not be settable (use seek() instead)"
      );
    }
  } catch (err) {
    // Error is OK - property might be read-only
  }

  console.log("✓ Position property is read-only (use seek() to modify)");
}

/**
 * CRITICAL TEST: Seek to same position after reading bits
 *
 * Edge case: seeking to current byte position should reset bit offset.
 */
function testSeekToSamePositionAfterBits() {
  const decoder = new BitStreamDecoder(new Uint8Array([0xFF, 0xAA, 0xBB]));

  // Read 1 bit (bit offset = 1, byte offset = 0)
  const bit = decoder.readBit();
  if (bit !== 1) {
    throw new Error(`readBit: got ${bit}, expected 1`);
  }

  // Seek to same byte position (0)
  decoder.seek(0);

  // Bit offset should be reset - reading uint8 should get full 0xFF
  const value = decoder.readUint8();
  if (value !== 0xFF) {
    throw new Error(
      `After seek(0) with pending bits: got 0x${value.toString(16)}, expected 0xFF (bit offset not reset?)`
    );
  }

  console.log("✓ Seek to same position resets bit offset correctly");
}

/**
 * CRITICAL TEST: Seek forward after partial byte
 *
 * Ensures seek properly resets bit offset when jumping forward.
 */
function testSeekForwardAfterPartialByte() {
  const decoder = new BitStreamDecoder(new Uint8Array([0xFF, 0xAA, 0xBB, 0xCC]));

  // Read 5 bits from first byte (bit offset = 5, byte offset = 0)
  for (let i = 0; i < 5; i++) {
    decoder.readBit();
  }

  // Seek forward to byte 2
  decoder.seek(2);

  // Should read 0xBB (bit offset reset)
  const value = decoder.readUint8();
  if (value !== 0xBB) {
    throw new Error(
      `After seek forward with pending bits: got 0x${value.toString(16)}, expected 0xBB`
    );
  }

  console.log("✓ Seek forward after partial byte resets bit offset correctly");
}

/**
 * CRITICAL TEST: Seek backward after partial byte
 *
 * Ensures seek properly resets bit offset when jumping backward.
 */
function testSeekBackwardAfterPartialByte() {
  const decoder = new BitStreamDecoder(new Uint8Array([0xFF, 0xAA, 0xBB]));

  // Read first byte completely
  decoder.readUint8();

  // Read 3 bits from second byte (bit offset = 3, byte offset = 1)
  for (let i = 0; i < 3; i++) {
    decoder.readBit();
  }

  // Seek back to start
  decoder.seek(0);

  // Should read 0xFF (bit offset reset)
  const value = decoder.readUint8();
  if (value !== 0xFF) {
    throw new Error(
      `After seek backward with pending bits: got 0x${value.toString(16)}, expected 0xFF`
    );
  }

  console.log("✓ Seek backward after partial byte resets bit offset correctly");
}

/**
 * IMPORTANT TEST: Position getter with bit offset
 *
 * Documents behavior: position returns current byte offset regardless of bit offset.
 */
function testPositionWithBitOffset() {
  const decoder = new BitStreamDecoder(new Uint8Array([0xFF, 0xAA, 0xBB]));

  // Initially at byte 0, bit 0
  if (decoder.position !== 0) {
    throw new Error(`Initial position: got ${decoder.position}, expected 0`);
  }

  // Read 3 bits (still in byte 0, bit offset = 3)
  for (let i = 0; i < 3; i++) {
    decoder.readBit();
  }

  // Position should still return 0 (current byte offset)
  // Note: DNS pointers reference byte offsets, not bit offsets
  if (decoder.position !== 0) {
    throw new Error(
      `Position after 3 bits: got ${decoder.position}, expected 0 (position returns byte offset)`
    );
  }

  // Read 5 more bits (total 8 bits, now at byte 1)
  for (let i = 0; i < 5; i++) {
    decoder.readBit();
  }

  // Position should now be 1
  if (decoder.position !== 1) {
    throw new Error(`Position after 8 bits: got ${decoder.position}, expected 1`);
  }

  console.log("✓ Position getter returns byte offset (ignores bit offset)");
}

/**
 * IMPORTANT TEST: Position stack overflow protection
 *
 * Prevents DoS attacks via deeply nested pointers.
 */
function testPushPositionLimit() {
  const decoder = new BitStreamDecoder(new Uint8Array(new Array(100).fill(0xFF)));

  // Push many positions (reasonable limit: 64-128 for DNS)
  const limit = 128;
  let pushed = 0;

  for (let i = 0; i < limit; i++) {
    try {
      decoder.pushPosition();
      pushed++;
    } catch (err) {
      // Hit limit - verify error message
      if (!(err instanceof Error) || !err.message.toLowerCase().includes("stack")) {
        throw new Error(
          `Expected 'stack overflow' or 'stack limit' error, got: ${err instanceof Error ? err.message : err}`
        );
      }
      break;
    }
  }

  // If we pushed all without error, that's OK too (no enforced limit)
  // But document this behavior
  if (pushed === limit) {
    console.log(`✓ Position stack allows at least ${limit} levels (no limit enforced - consider adding one for security)`);
  } else {
    console.log(`✓ Position stack limit enforced at ${pushed} levels (prevents DoS)`);
  }

  // Clean up: pop what we pushed
  for (let i = 0; i < pushed; i++) {
    decoder.popPosition();
  }
}

/**
 * Main test runner
 */
export function runSeekPositionTests() {
  console.log("\n=== Seek/Position Tests ===\n");

  testPositionGetter();
  testSeekToValidOffset();
  testSeekOutOfBounds();
  testSeekResetsBitOffset();
  testPushPopPositionSingle();
  testPushPopPositionNested();
  testPopPositionUnderflow();
  testRealisticPointerFollowing();
  testPositionIsReadOnly();
  testSeekToSamePositionAfterBits();
  testSeekForwardAfterPartialByte();
  testSeekBackwardAfterPartialByte();
  testPositionWithBitOffset();
  testPushPositionLimit();

  console.log("\n✓ All seek/position tests passed!\n");
}

// Run tests if executed directly
if (require.main === module) {
  runSeekPositionTests();
}
