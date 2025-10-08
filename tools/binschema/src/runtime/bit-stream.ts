/**
 * BitStream - Low-level bit-level reading/writing
 *
 * Handles bit-level precision for encoding/decoding.
 * Maintains a buffer and bit offset for streaming operations.
 */

export type Endianness = "big_endian" | "little_endian";
export type BitOrder = "msb_first" | "lsb_first";

/**
 * BitStreamEncoder - Write bits to a byte stream
 */
export class BitStreamEncoder {
  private bytes: number[] = [];
  private currentByte: number = 0;
  private bitOffset: number = 0; // Bits used in currentByte (0-7)
  private bitOrder: BitOrder;

  constructor(bitOrder: BitOrder = "msb_first") {
    this.bitOrder = bitOrder;
  }

  /**
   * Write bits to stream
   * @param value - Value to write (will be masked to size)
   * @param size - Number of bits to write (1-64)
   */
  writeBits(value: number | bigint, size: number): void {
    if (size < 1 || size > 64) {
      throw new Error(`Invalid bit size: ${size} (must be 1-64)`);
    }

    // Convert to bigint for consistent handling
    let val = typeof value === 'bigint' ? value : BigInt(value);

    // Mask to size
    const mask = (1n << BigInt(size)) - 1n;
    val = val & mask;

    // Write bits one at a time (MSB first for now)
    for (let i = size - 1; i >= 0; i--) {
      const bit = Number((val >> BigInt(i)) & 1n);
      this.writeBit(bit);
    }
  }

  /**
   * Write a single bit
   */
  private writeBit(bit: number): void {
    if (this.bitOrder === "msb_first") {
      // MSB first: fill from left to right
      // Bit 0 is leftmost (MSB), bit 7 is rightmost (LSB)
      this.currentByte |= (bit << (7 - this.bitOffset));
    } else {
      // LSB first: fill from right to left
      // Bit 0 is rightmost (LSB), bit 7 is leftmost (MSB)
      this.currentByte |= (bit << this.bitOffset);
    }

    this.bitOffset++;

    // Byte is full, flush it
    if (this.bitOffset === 8) {
      this.bytes.push(this.currentByte);
      this.currentByte = 0;
      this.bitOffset = 0;
    }
  }

  /**
   * Write uint8 (8 bits)
   */
  writeUint8(value: number): void {
    this.writeBits(value, 8);
  }

  /**
   * Write uint16
   */
  writeUint16(value: number, endianness: Endianness): void {
    if (endianness === "big_endian") {
      this.writeUint8((value >> 8) & 0xFF);
      this.writeUint8(value & 0xFF);
    } else {
      this.writeUint8(value & 0xFF);
      this.writeUint8((value >> 8) & 0xFF);
    }
  }

  /**
   * Write uint32
   */
  writeUint32(value: number, endianness: Endianness): void {
    if (endianness === "big_endian") {
      this.writeUint8((value >> 24) & 0xFF);
      this.writeUint8((value >> 16) & 0xFF);
      this.writeUint8((value >> 8) & 0xFF);
      this.writeUint8(value & 0xFF);
    } else {
      this.writeUint8(value & 0xFF);
      this.writeUint8((value >> 8) & 0xFF);
      this.writeUint8((value >> 16) & 0xFF);
      this.writeUint8((value >> 24) & 0xFF);
    }
  }

  /**
   * Write uint64 (as bigint)
   */
  writeUint64(value: bigint, endianness: Endianness): void {
    if (endianness === "big_endian") {
      this.writeUint8(Number((value >> 56n) & 0xFFn));
      this.writeUint8(Number((value >> 48n) & 0xFFn));
      this.writeUint8(Number((value >> 40n) & 0xFFn));
      this.writeUint8(Number((value >> 32n) & 0xFFn));
      this.writeUint8(Number((value >> 24n) & 0xFFn));
      this.writeUint8(Number((value >> 16n) & 0xFFn));
      this.writeUint8(Number((value >> 8n) & 0xFFn));
      this.writeUint8(Number(value & 0xFFn));
    } else {
      this.writeUint8(Number(value & 0xFFn));
      this.writeUint8(Number((value >> 8n) & 0xFFn));
      this.writeUint8(Number((value >> 16n) & 0xFFn));
      this.writeUint8(Number((value >> 24n) & 0xFFn));
      this.writeUint8(Number((value >> 32n) & 0xFFn));
      this.writeUint8(Number((value >> 40n) & 0xFFn));
      this.writeUint8(Number((value >> 48n) & 0xFFn));
      this.writeUint8(Number((value >> 56n) & 0xFFn));
    }
  }

  /**
   * Write int8 (two's complement)
   */
  writeInt8(value: number): void {
    const unsigned = value < 0 ? 256 + value : value;
    this.writeUint8(unsigned);
  }

  /**
   * Write int16 (two's complement)
   */
  writeInt16(value: number, endianness: Endianness): void {
    const unsigned = value < 0 ? 65536 + value : value;
    this.writeUint16(unsigned, endianness);
  }

  /**
   * Write int32 (two's complement)
   */
  writeInt32(value: number, endianness: Endianness): void {
    const unsigned = value < 0 ? 4294967296 + value : value;
    this.writeUint32(unsigned >>> 0, endianness);
  }

  /**
   * Write int64 (two's complement)
   */
  writeInt64(value: bigint, endianness: Endianness): void {
    const unsigned = value < 0n ? (1n << 64n) + value : value;
    this.writeUint64(unsigned, endianness);
  }

  /**
   * Write float32 (IEEE 754)
   */
  writeFloat32(value: number, endianness: Endianness): void {
    const buffer = new ArrayBuffer(4);
    const view = new DataView(buffer);
    view.setFloat32(0, value, endianness === "little_endian");

    for (let i = 0; i < 4; i++) {
      this.writeUint8(view.getUint8(i));
    }
  }

  /**
   * Write float64 (IEEE 754)
   */
  writeFloat64(value: number, endianness: Endianness): void {
    const buffer = new ArrayBuffer(8);
    const view = new DataView(buffer);
    view.setFloat64(0, value, endianness === "little_endian");

    for (let i = 0; i < 8; i++) {
      this.writeUint8(view.getUint8(i));
    }
  }

  /**
   * Get encoded bytes
   * Flushes any partial byte (pads with zeros)
   */
  finish(): Uint8Array {
    // Flush partial byte if any
    if (this.bitOffset > 0) {
      this.bytes.push(this.currentByte);
      this.currentByte = 0;
      this.bitOffset = 0;
    }

    return new Uint8Array(this.bytes);
  }

  /**
   * Get bits as array (for testing)
   */
  finishBits(): number[] {
    const bytes = this.finish();
    const bits: number[] = [];

    for (const byte of bytes) {
      for (let i = 7; i >= 0; i--) {
        bits.push((byte >> i) & 1);
      }
    }

    return bits;
  }
}

/**
 * BitStreamDecoder - Read bits from a byte stream
 */
export class BitStreamDecoder {
  private bytes: Uint8Array;
  private byteOffset: number = 0;
  private bitOffset: number = 0; // Bits read from current byte (0-7)
  private bitOrder: BitOrder;

  constructor(bytes: Uint8Array | number[], bitOrder: BitOrder = "msb_first") {
    this.bytes = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
    this.bitOrder = bitOrder;
  }

  /**
   * Read bits from stream
   */
  readBits(size: number): bigint {
    if (size < 1 || size > 64) {
      throw new Error(`Invalid bit size: ${size} (must be 1-64)`);
    }

    let result = 0n;

    for (let i = 0; i < size; i++) {
      const bit = this.readBit();
      result = (result << 1n) | BigInt(bit);
    }

    return result;
  }

  /**
   * Read a single bit
   */
  private readBit(): number {
    if (this.byteOffset >= this.bytes.length) {
      throw new Error("Unexpected end of stream");
    }

    const currentByte = this.bytes[this.byteOffset];
    let bit: number;

    if (this.bitOrder === "msb_first") {
      // MSB first: read from left to right
      bit = (currentByte >> (7 - this.bitOffset)) & 1;
    } else {
      // LSB first: read from right to left
      bit = (currentByte >> this.bitOffset) & 1;
    }

    this.bitOffset++;

    if (this.bitOffset === 8) {
      this.byteOffset++;
      this.bitOffset = 0;
    }

    return bit;
  }

  /**
   * Read uint8
   */
  readUint8(): number {
    return Number(this.readBits(8));
  }

  /**
   * Read uint16
   */
  readUint16(endianness: Endianness): number {
    if (endianness === "big_endian") {
      const high = this.readUint8();
      const low = this.readUint8();
      return (high << 8) | low;
    } else {
      const low = this.readUint8();
      const high = this.readUint8();
      return (high << 8) | low;
    }
  }

  /**
   * Read uint32
   */
  readUint32(endianness: Endianness): number {
    if (endianness === "big_endian") {
      const b0 = this.readUint8();
      const b1 = this.readUint8();
      const b2 = this.readUint8();
      const b3 = this.readUint8();
      return (b0 << 24) | (b1 << 16) | (b2 << 8) | b3;
    } else {
      const b0 = this.readUint8();
      const b1 = this.readUint8();
      const b2 = this.readUint8();
      const b3 = this.readUint8();
      return (b3 << 24) | (b2 << 16) | (b1 << 8) | b0;
    }
  }

  /**
   * Read uint64
   */
  readUint64(endianness: Endianness): bigint {
    if (endianness === "big_endian") {
      let result = 0n;
      for (let i = 0; i < 8; i++) {
        result = (result << 8n) | BigInt(this.readUint8());
      }
      return result;
    } else {
      let result = 0n;
      for (let i = 0; i < 8; i++) {
        result = result | (BigInt(this.readUint8()) << BigInt(i * 8));
      }
      return result;
    }
  }

  /**
   * Read int8 (two's complement)
   */
  readInt8(): number {
    const unsigned = this.readUint8();
    return unsigned > 127 ? unsigned - 256 : unsigned;
  }

  /**
   * Read int16 (two's complement)
   */
  readInt16(endianness: Endianness): number {
    const unsigned = this.readUint16(endianness);
    return unsigned > 32767 ? unsigned - 65536 : unsigned;
  }

  /**
   * Read int32 (two's complement)
   */
  readInt32(endianness: Endianness): number {
    const unsigned = this.readUint32(endianness);
    return unsigned > 2147483647 ? unsigned - 4294967296 : unsigned;
  }

  /**
   * Read int64 (two's complement)
   */
  readInt64(endianness: Endianness): bigint {
    const unsigned = this.readUint64(endianness);
    const max = 1n << 63n;
    return unsigned >= max ? unsigned - (1n << 64n) : unsigned;
  }

  /**
   * Read float32 (IEEE 754)
   */
  readFloat32(endianness: Endianness): number {
    const buffer = new ArrayBuffer(4);
    const view = new DataView(buffer);

    for (let i = 0; i < 4; i++) {
      view.setUint8(i, this.readUint8());
    }

    return view.getFloat32(0, endianness === "little_endian");
  }

  /**
   * Read float64 (IEEE 754)
   */
  readFloat64(endianness: Endianness): number {
    const buffer = new ArrayBuffer(8);
    const view = new DataView(buffer);

    for (let i = 0; i < 8; i++) {
      view.setUint8(i, this.readUint8());
    }

    return view.getFloat64(0, endianness === "little_endian");
  }

  /**
   * Check if there are more bytes to read
   */
  hasMore(): boolean {
    return this.byteOffset < this.bytes.length || this.bitOffset > 0;
  }
}
