"use strict";
(() => {
  // src/BitStream.ts
  var BitStreamEncoder = class {
    constructor(bitOrder = "msb_first") {
      this.bytes = [];
      this.currentByte = 0;
      this.bitOffset = 0;
      // Bits used in currentByte (0-7)
      this.totalBitsWritten = 0;
      this.bitOrder = bitOrder;
    }
    /**
     * Write bits to stream
     * @param value - Value to write (will be masked to size)
     * @param size - Number of bits to write (1-64)
     *
     * Note: bitOrder controls byte-level bit packing (via writeBit),
     * but multi-bit values are always written LSB-first (standard for bitfields)
     */
    writeBits(value, size) {
      if (size < 1 || size > 64) {
        throw new Error(`Invalid bit size: ${size} (must be 1-64)`);
      }
      let val = typeof value === "bigint" ? value : BigInt(value);
      const mask = (1n << BigInt(size)) - 1n;
      val = val & mask;
      if (this.bitOrder === "lsb_first") {
        for (let i = 0; i < size; i++) {
          const bit = Number(val >> BigInt(i) & 1n);
          this.writeBit(bit);
        }
      } else {
        for (let i = size - 1; i >= 0; i--) {
          const bit = Number(val >> BigInt(i) & 1n);
          this.writeBit(bit);
        }
      }
    }
    /**
     * Write a single bit
     */
    writeBit(bit) {
      if (this.bitOrder === "msb_first") {
        this.currentByte |= bit << 7 - this.bitOffset;
      } else {
        this.currentByte |= bit << this.bitOffset;
      }
      this.bitOffset++;
      this.totalBitsWritten++;
      if (this.bitOffset === 8) {
        this.bytes.push(this.currentByte);
        this.currentByte = 0;
        this.bitOffset = 0;
      }
    }
    /**
     * Write uint8 (8 bits)
     * Optimized to write directly when byte-aligned
     */
    writeUint8(value) {
      if (this.bitOffset === 0) {
        this.bytes.push(value & 255);
      } else {
        for (let i = 0; i < 8; i++) {
          const bit = value >> i & 1;
          this.writeBit(bit);
        }
      }
    }
    /**
     * Write uint16
     */
    writeUint16(value, endianness) {
      if (endianness === "big_endian") {
        this.writeUint8(value >> 8 & 255);
        this.writeUint8(value & 255);
      } else {
        this.writeUint8(value & 255);
        this.writeUint8(value >> 8 & 255);
      }
    }
    /**
     * Write uint32
     */
    writeUint32(value, endianness) {
      if (endianness === "big_endian") {
        this.writeUint8(value >>> 24 & 255);
        this.writeUint8(value >>> 16 & 255);
        this.writeUint8(value >>> 8 & 255);
        this.writeUint8(value & 255);
      } else {
        this.writeUint8(value & 255);
        this.writeUint8(value >>> 8 & 255);
        this.writeUint8(value >>> 16 & 255);
        this.writeUint8(value >>> 24 & 255);
      }
    }
    /**
     * Write uint64 (as bigint)
     */
    writeUint64(value, endianness) {
      if (endianness === "big_endian") {
        this.writeUint8(Number(value >> 56n & 0xFFn));
        this.writeUint8(Number(value >> 48n & 0xFFn));
        this.writeUint8(Number(value >> 40n & 0xFFn));
        this.writeUint8(Number(value >> 32n & 0xFFn));
        this.writeUint8(Number(value >> 24n & 0xFFn));
        this.writeUint8(Number(value >> 16n & 0xFFn));
        this.writeUint8(Number(value >> 8n & 0xFFn));
        this.writeUint8(Number(value & 0xFFn));
      } else {
        this.writeUint8(Number(value & 0xFFn));
        this.writeUint8(Number(value >> 8n & 0xFFn));
        this.writeUint8(Number(value >> 16n & 0xFFn));
        this.writeUint8(Number(value >> 24n & 0xFFn));
        this.writeUint8(Number(value >> 32n & 0xFFn));
        this.writeUint8(Number(value >> 40n & 0xFFn));
        this.writeUint8(Number(value >> 48n & 0xFFn));
        this.writeUint8(Number(value >> 56n & 0xFFn));
      }
    }
    /**
     * Write int8 (two's complement)
     */
    writeInt8(value) {
      const unsigned = value < 0 ? 256 + value : value;
      this.writeUint8(unsigned);
    }
    /**
     * Write int16 (two's complement)
     */
    writeInt16(value, endianness) {
      const unsigned = value < 0 ? 65536 + value : value;
      this.writeUint16(unsigned, endianness);
    }
    /**
     * Write int32 (two's complement)
     */
    writeInt32(value, endianness) {
      const unsigned = value < 0 ? 4294967296 + value : value;
      this.writeUint32(unsigned >>> 0, endianness);
    }
    /**
     * Write int64 (two's complement)
     */
    writeInt64(value, endianness) {
      const unsigned = value < 0n ? (1n << 64n) + value : value;
      this.writeUint64(unsigned, endianness);
    }
    /**
     * Write float32 (IEEE 754)
     */
    writeFloat32(value, endianness) {
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
    writeFloat64(value, endianness) {
      const buffer = new ArrayBuffer(8);
      const view = new DataView(buffer);
      view.setFloat64(0, value, endianness === "little_endian");
      for (let i = 0; i < 8; i++) {
        this.writeUint8(view.getUint8(i));
      }
    }
    /**
     * Get current byte offset (position in buffer)
     * Returns the number of complete bytes written (for compression dictionary tracking)
     */
    get byteOffset() {
      return this.bytes.length;
    }
    /**
     * Get encoded bytes
     * Flushes any partial byte (pads with zeros)
     */
    finish() {
      if (this.bitOffset > 0) {
        this.bytes.push(this.currentByte);
        this.currentByte = 0;
        this.bitOffset = 0;
      }
      return new Uint8Array(this.bytes);
    }
    /**
     * Get bits as array (for testing)
     * Returns only the exact bits that were written, not padded to byte boundary
     */
    finishBits() {
      const bytes = this.finish();
      const bits = [];
      const bitOrder = this.bitOrder;
      for (let byteIndex = 0; byteIndex < bytes.length; byteIndex++) {
        const byte = bytes[byteIndex];
        const bitsInThisByte = Math.min(8, this.totalBitsWritten - byteIndex * 8);
        if (bitOrder === "msb_first") {
          for (let i = 7; i >= 8 - bitsInThisByte; i--) {
            bits.push(byte >> i & 1);
          }
        } else {
          for (let i = 0; i < bitsInThisByte; i++) {
            bits.push(byte >> i & 1);
          }
        }
      }
      return bits;
    }
  };
  var BitStreamDecoder = class _BitStreamDecoder {
    constructor(bytes, bitOrder = "msb_first") {
      this.byteOffset = 0;
      this.bitOffset = 0;
      this.savedPositions = [];
      this.bytes = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
      this.bitOrder = bitOrder;
    }
    static {
      // Stack for push/popPosition
      // Position stack depth limit (prevents DoS via deeply nested pointers)
      this.MAX_POSITION_STACK_DEPTH = 128;
    }
    /**
     * Read bits from stream
     */
    readBits(size) {
      if (size < 1 || size > 64) {
        throw new Error(`Invalid bit size: ${size} (must be 1-64)`);
      }
      let result = 0n;
      if (this.bitOrder === "lsb_first") {
        for (let i = 0; i < size; i++) {
          const bit = this.readBit();
          result = result | BigInt(bit) << BigInt(i);
        }
      } else {
        for (let i = size - 1; i >= 0; i--) {
          const bit = this.readBit();
          result = result | BigInt(bit) << BigInt(i);
        }
      }
      return result;
    }
    /**
     * Read a single bit
     * Public for testing bit-alignment behavior
     */
    readBit() {
      if (this.byteOffset >= this.bytes.length) {
        throw new Error("Unexpected end of stream");
      }
      const currentByte = this.bytes[this.byteOffset];
      let bit;
      if (this.bitOrder === "msb_first") {
        bit = currentByte >> 7 - this.bitOffset & 1;
      } else {
        bit = currentByte >> this.bitOffset & 1;
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
    readUint8() {
      if (this.bitOffset === 0) {
        if (this.byteOffset >= this.bytes.length) {
          throw new Error("Unexpected end of stream");
        }
        return this.bytes[this.byteOffset++];
      } else {
        let result = 0;
        for (let i = 0; i < 8; i++) {
          const bit = this.readBit();
          result = result | bit << i;
        }
        return result;
      }
    }
    /**
     * Read uint16
     */
    readUint16(endianness) {
      if (endianness === "big_endian") {
        const high = this.readUint8();
        const low = this.readUint8();
        return high << 8 | low;
      } else {
        const low = this.readUint8();
        const high = this.readUint8();
        return high << 8 | low;
      }
    }
    /**
     * Read uint32
     */
    readUint32(endianness) {
      if (endianness === "big_endian") {
        const b0 = this.readUint8();
        const b1 = this.readUint8();
        const b2 = this.readUint8();
        const b3 = this.readUint8();
        return (b0 << 24 | b1 << 16 | b2 << 8 | b3) >>> 0;
      } else {
        const b0 = this.readUint8();
        const b1 = this.readUint8();
        const b2 = this.readUint8();
        const b3 = this.readUint8();
        return (b3 << 24 | b2 << 16 | b1 << 8 | b0) >>> 0;
      }
    }
    /**
     * Read uint64
     */
    readUint64(endianness) {
      if (endianness === "big_endian") {
        let result = 0n;
        for (let i = 0; i < 8; i++) {
          result = result << 8n | BigInt(this.readUint8());
        }
        return result;
      } else {
        let result = 0n;
        for (let i = 0; i < 8; i++) {
          result = result | BigInt(this.readUint8()) << BigInt(i * 8);
        }
        return result;
      }
    }
    /**
     * Read int8 (two's complement)
     */
    readInt8() {
      const unsigned = this.readUint8();
      return unsigned > 127 ? unsigned - 256 : unsigned;
    }
    /**
     * Read int16 (two's complement)
     */
    readInt16(endianness) {
      const unsigned = this.readUint16(endianness);
      return unsigned > 32767 ? unsigned - 65536 : unsigned;
    }
    /**
     * Read int32 (two's complement)
     */
    readInt32(endianness) {
      const unsigned = this.readUint32(endianness);
      return unsigned > 2147483647 ? unsigned - 4294967296 : unsigned;
    }
    /**
     * Read int64 (two's complement)
     */
    readInt64(endianness) {
      const unsigned = this.readUint64(endianness);
      const max = 1n << 63n;
      return unsigned >= max ? unsigned - (1n << 64n) : unsigned;
    }
    /**
     * Read float32 (IEEE 754)
     */
    readFloat32(endianness) {
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
    readFloat64(endianness) {
      const buffer = new ArrayBuffer(8);
      const view = new DataView(buffer);
      for (let i = 0; i < 8; i++) {
        view.setUint8(i, this.readUint8());
      }
      return view.getFloat64(0, endianness === "little_endian");
    }
    /**
     * Get current byte offset (position in buffer)
     * Returns byte offset regardless of bit offset (DNS pointers are byte-aligned)
     */
    get position() {
      return this.byteOffset;
    }
    /**
     * Seek to absolute byte offset
     * Resets bit offset to 0 (byte-aligned)
     */
    seek(offset) {
      if (offset < 0 || offset > this.bytes.length) {
        throw new Error(
          `Seek offset ${offset} out of bounds (valid range: 0-${this.bytes.length})`
        );
      }
      this.byteOffset = offset;
      this.bitOffset = 0;
    }
    /**
     * Save current position to stack (for pointer following)
     */
    pushPosition() {
      if (this.savedPositions.length >= _BitStreamDecoder.MAX_POSITION_STACK_DEPTH) {
        throw new Error(
          `Position stack overflow: maximum depth of ${_BitStreamDecoder.MAX_POSITION_STACK_DEPTH} exceeded`
        );
      }
      this.savedPositions.push(this.byteOffset);
    }
    /**
     * Restore position from stack
     * Resets bit offset to 0 (byte-aligned)
     */
    popPosition() {
      if (this.savedPositions.length === 0) {
        throw new Error("Position stack underflow: attempted to pop from empty stack");
      }
      const saved = this.savedPositions.pop();
      this.byteOffset = saved;
      this.bitOffset = 0;
    }
    /**
     * Peek uint8 without advancing position
     * Throws error if not byte-aligned
     */
    peekUint8() {
      if (this.bitOffset !== 0) {
        throw new Error(
          `Peek not byte-aligned: bit offset is ${this.bitOffset} (must be 0)`
        );
      }
      if (this.byteOffset >= this.bytes.length) {
        throw new Error(
          `Peek out of bounds: attempted to peek 1 byte at offset ${this.byteOffset} (buffer size: ${this.bytes.length})`
        );
      }
      return this.bytes[this.byteOffset];
    }
    /**
     * Peek uint16 without advancing position
     * Throws error if not byte-aligned or insufficient bytes
     */
    peekUint16(endianness) {
      if (this.bitOffset !== 0) {
        throw new Error(
          `Peek not byte-aligned: bit offset is ${this.bitOffset} (must be 0)`
        );
      }
      if (this.byteOffset + 2 > this.bytes.length) {
        throw new Error(
          `Peek out of bounds: attempted to peek 2 bytes at offset ${this.byteOffset} (buffer size: ${this.bytes.length})`
        );
      }
      if (endianness === "big_endian") {
        return this.bytes[this.byteOffset] << 8 | this.bytes[this.byteOffset + 1];
      } else {
        return this.bytes[this.byteOffset] | this.bytes[this.byteOffset + 1] << 8;
      }
    }
    /**
     * Peek uint32 without advancing position
     * Throws error if not byte-aligned or insufficient bytes
     */
    peekUint32(endianness) {
      if (this.bitOffset !== 0) {
        throw new Error(
          `Peek not byte-aligned: bit offset is ${this.bitOffset} (must be 0)`
        );
      }
      if (this.byteOffset + 4 > this.bytes.length) {
        throw new Error(
          `Peek out of bounds: attempted to peek 4 bytes at offset ${this.byteOffset} (buffer size: ${this.bytes.length})`
        );
      }
      if (endianness === "big_endian") {
        return (this.bytes[this.byteOffset] << 24 | this.bytes[this.byteOffset + 1] << 16 | this.bytes[this.byteOffset + 2] << 8 | this.bytes[this.byteOffset + 3]) >>> 0;
      } else {
        return (this.bytes[this.byteOffset + 3] << 24 | this.bytes[this.byteOffset + 2] << 16 | this.bytes[this.byteOffset + 1] << 8 | this.bytes[this.byteOffset]) >>> 0;
      }
    }
    /**
     * Check if there are more bytes to read
     */
    hasMore() {
      return this.byteOffset < this.bytes.length || this.bitOffset > 0;
    }
  };

  // src/SuperChatCodec.ts
  var FrameHeaderEncoder = class extends BitStreamEncoder {
    constructor() {
      super("msb_first");
      this.compressionDict = /* @__PURE__ */ new Map();
    }
    encode(value) {
      this.compressionDict.clear();
      this.writeUint32(value.length, "big_endian");
      this.writeUint8(value.version);
      this.writeUint8(value.type);
      this.writeUint8(value.flags);
      return this.finish();
    }
  };
  var FrameHeaderDecoder = class extends BitStreamDecoder {
    constructor(bytes, context) {
      super(bytes, "msb_first");
      this.context = context;
    }
    decode() {
      const value = {};
      value.length = this.readUint32("big_endian");
      value.version = this.readUint8();
      value.type = this.readUint8();
      value.flags = this.readUint8();
      return value;
    }
  };
  var SetNicknameEncoder = class extends BitStreamEncoder {
    constructor() {
      super("msb_first");
      this.compressionDict = /* @__PURE__ */ new Map();
    }
    encode(value) {
      this.compressionDict.clear();
      const value_nickname_bytes = new TextEncoder().encode(value.nickname);
      this.writeUint16(value_nickname_bytes.length, "big_endian");
      for (const byte of value_nickname_bytes) {
        this.writeUint8(byte);
      }
      return this.finish();
    }
  };
  var NicknameResponseDecoder = class extends BitStreamDecoder {
    constructor(bytes, context) {
      super(bytes, "msb_first");
      this.context = context;
    }
    decode() {
      const value = {};
      value.success = this.readUint8();
      const message_length = this.readUint16("big_endian");
      const message_bytes = [];
      for (let i = 0; i < message_length; i++) {
        message_bytes.push(this.readUint8());
      }
      value.message = new TextDecoder().decode(new Uint8Array(message_bytes));
      return value;
    }
  };
  var PostMessageEncoder = class extends BitStreamEncoder {
    constructor() {
      super("msb_first");
      this.compressionDict = /* @__PURE__ */ new Map();
    }
    encode(value) {
      this.compressionDict.clear();
      this.writeUint64(value.channel_id, "big_endian");
      this.writeUint8(value.subchannel_id.present);
      if (value.subchannel_id.present == 1 && value.subchannel_id.value !== void 0) {
        this.writeUint64(value.subchannel_id.value, "big_endian");
      }
      this.writeUint8(value.parent_id.present);
      if (value.parent_id.present == 1 && value.parent_id.value !== void 0) {
        this.writeUint64(value.parent_id.value, "big_endian");
      }
      const value_content_bytes = new TextEncoder().encode(value.content);
      this.writeUint16(value_content_bytes.length, "big_endian");
      for (const byte of value_content_bytes) {
        this.writeUint8(byte);
      }
      return this.finish();
    }
  };
  var MessagePostedDecoder = class extends BitStreamDecoder {
    constructor(bytes, context) {
      super(bytes, "msb_first");
      this.context = context;
    }
    decode() {
      const value = {};
      value.success = this.readUint8();
      value.message_id = this.readUint64("big_endian");
      const message_length = this.readUint16("big_endian");
      const message_bytes = [];
      for (let i = 0; i < message_length; i++) {
        message_bytes.push(this.readUint8());
      }
      value.message = new TextDecoder().decode(new Uint8Array(message_bytes));
      return value;
    }
  };
  var NewMessageDecoder = class extends BitStreamDecoder {
    constructor(bytes, context) {
      super(bytes, "msb_first");
      this.context = context;
    }
    decode() {
      const value = {};
      value.message_id = this.readUint64("big_endian");
      value.channel_id = this.readUint64("big_endian");
      value.subchannel_id = {};
      value.subchannel_id.present = this.readUint8();
      if (value.subchannel_id.present == 1) {
        value.subchannel_id.value = this.readUint64("big_endian");
      }
      value.parent_id = {};
      value.parent_id.present = this.readUint8();
      if (value.parent_id.present == 1) {
        value.parent_id.value = this.readUint64("big_endian");
      }
      value.author_user_id = {};
      value.author_user_id.present = this.readUint8();
      if (value.author_user_id.present == 1) {
        value.author_user_id.value = this.readUint64("big_endian");
      }
      const author_nickname_length = this.readUint16("big_endian");
      const author_nickname_bytes = [];
      for (let i = 0; i < author_nickname_length; i++) {
        author_nickname_bytes.push(this.readUint8());
      }
      value.author_nickname = new TextDecoder().decode(new Uint8Array(author_nickname_bytes));
      const content_length = this.readUint16("big_endian");
      const content_bytes = [];
      for (let i = 0; i < content_length; i++) {
        content_bytes.push(this.readUint8());
      }
      value.content = new TextDecoder().decode(new Uint8Array(content_bytes));
      value.created_at = this.readInt64("big_endian");
      value.edited_at = {};
      value.edited_at.present = this.readUint8();
      if (value.edited_at.present == 1) {
        value.edited_at.value = this.readInt64("big_endian");
      }
      value.reply_count = this.readUint32("big_endian");
      return value;
    }
  };
  var ListChannelsEncoder = class extends BitStreamEncoder {
    constructor() {
      super("msb_first");
      this.compressionDict = /* @__PURE__ */ new Map();
    }
    encode(value) {
      this.compressionDict.clear();
      this.writeUint64(value.from_channel_id, "big_endian");
      this.writeUint16(value.limit, "big_endian");
      return this.finish();
    }
  };
  var ChannelListDecoder = class extends BitStreamDecoder {
    constructor(bytes, context) {
      super(bytes, "msb_first");
      this.context = context;
    }
    decode() {
      const value = {};
      value.channel_count = this.readUint16("big_endian");
      value.channels = [];
      const channels_length = value.channel_count ?? this.context?.channel_count;
      if (channels_length === void 0) {
        throw new Error('Field-referenced array length field "channel_count" not found in value or context');
      }
      for (let i = 0; i < channels_length; i++) {
        let channels_item;
        channels_item = {};
        channels_item.channel_id = this.readUint64("big_endian");
        const channels_item_name_length = this.readUint16("big_endian");
        const channels_item_name_bytes = [];
        for (let i2 = 0; i2 < channels_item_name_length; i2++) {
          channels_item_name_bytes.push(this.readUint8());
        }
        channels_item.name = new TextDecoder().decode(new Uint8Array(channels_item_name_bytes));
        const channels_item_description_length = this.readUint16("big_endian");
        const channels_item_description_bytes = [];
        for (let i2 = 0; i2 < channels_item_description_length; i2++) {
          channels_item_description_bytes.push(this.readUint8());
        }
        channels_item.description = new TextDecoder().decode(new Uint8Array(channels_item_description_bytes));
        channels_item.user_count = this.readUint32("big_endian");
        channels_item.is_operator = this.readUint8();
        channels_item.type = this.readUint8();
        channels_item.retention_hours = this.readUint32("big_endian");
        value.channels.push(channels_item);
      }
      return value;
    }
  };
  var JoinChannelEncoder = class extends BitStreamEncoder {
    constructor() {
      super("msb_first");
      this.compressionDict = /* @__PURE__ */ new Map();
    }
    encode(value) {
      this.compressionDict.clear();
      this.writeUint64(value.channel_id, "big_endian");
      this.writeUint8(value.subchannel_id.present);
      if (value.subchannel_id.present == 1 && value.subchannel_id.value !== void 0) {
        this.writeUint64(value.subchannel_id.value, "big_endian");
      }
      return this.finish();
    }
  };
  var JoinResponseDecoder = class extends BitStreamDecoder {
    constructor(bytes, context) {
      super(bytes, "msb_first");
      this.context = context;
    }
    decode() {
      const value = {};
      value.success = this.readUint8();
      value.channel_id = this.readUint64("big_endian");
      value.subchannel_id = {};
      value.subchannel_id.present = this.readUint8();
      if (value.subchannel_id.present == 1) {
        value.subchannel_id.value = this.readUint64("big_endian");
      }
      const message_length = this.readUint16("big_endian");
      const message_bytes = [];
      for (let i = 0; i < message_length; i++) {
        message_bytes.push(this.readUint8());
      }
      value.message = new TextDecoder().decode(new Uint8Array(message_bytes));
      return value;
    }
  };
  var ListMessagesEncoder = class extends BitStreamEncoder {
    constructor() {
      super("msb_first");
      this.compressionDict = /* @__PURE__ */ new Map();
    }
    encode(value) {
      this.compressionDict.clear();
      this.writeUint64(value.channel_id, "big_endian");
      this.writeUint8(value.subchannel_id.present);
      if (value.subchannel_id.present == 1 && value.subchannel_id.value !== void 0) {
        this.writeUint64(value.subchannel_id.value, "big_endian");
      }
      this.writeUint16(value.limit, "big_endian");
      this.writeUint8(value.before_id.present);
      if (value.before_id.present == 1 && value.before_id.value !== void 0) {
        this.writeUint64(value.before_id.value, "big_endian");
      }
      this.writeUint8(value.parent_id.present);
      if (value.parent_id.present == 1 && value.parent_id.value !== void 0) {
        this.writeUint64(value.parent_id.value, "big_endian");
      }
      this.writeUint8(value.after_id.present);
      if (value.after_id.present == 1 && value.after_id.value !== void 0) {
        this.writeUint64(value.after_id.value, "big_endian");
      }
      return this.finish();
    }
  };
  var MessageListDecoder = class extends BitStreamDecoder {
    constructor(bytes, context) {
      super(bytes, "msb_first");
      this.context = context;
    }
    decode() {
      const value = {};
      value.channel_id = this.readUint64("big_endian");
      value.subchannel_id = {};
      value.subchannel_id.present = this.readUint8();
      if (value.subchannel_id.present == 1) {
        value.subchannel_id.value = this.readUint64("big_endian");
      }
      value.parent_id = {};
      value.parent_id.present = this.readUint8();
      if (value.parent_id.present == 1) {
        value.parent_id.value = this.readUint64("big_endian");
      }
      value.message_count = this.readUint16("big_endian");
      value.messages = [];
      const messages_length = value.message_count ?? this.context?.message_count;
      if (messages_length === void 0) {
        throw new Error('Field-referenced array length field "message_count" not found in value or context');
      }
      for (let i = 0; i < messages_length; i++) {
        let messages_item;
        messages_item = {};
        messages_item.message_id = this.readUint64("big_endian");
        messages_item.channel_id = this.readUint64("big_endian");
        messages_item.subchannel_id = {};
        messages_item.subchannel_id.present = this.readUint8();
        if (messages_item.subchannel_id.present == 1) {
          messages_item.subchannel_id.value = this.readUint64("big_endian");
        }
        messages_item.parent_id = {};
        messages_item.parent_id.present = this.readUint8();
        if (messages_item.parent_id.present == 1) {
          messages_item.parent_id.value = this.readUint64("big_endian");
        }
        messages_item.author_user_id = {};
        messages_item.author_user_id.present = this.readUint8();
        if (messages_item.author_user_id.present == 1) {
          messages_item.author_user_id.value = this.readUint64("big_endian");
        }
        const messages_item_author_nickname_length = this.readUint16("big_endian");
        const messages_item_author_nickname_bytes = [];
        for (let i2 = 0; i2 < messages_item_author_nickname_length; i2++) {
          messages_item_author_nickname_bytes.push(this.readUint8());
        }
        messages_item.author_nickname = new TextDecoder().decode(new Uint8Array(messages_item_author_nickname_bytes));
        const messages_item_content_length = this.readUint16("big_endian");
        const messages_item_content_bytes = [];
        for (let i2 = 0; i2 < messages_item_content_length; i2++) {
          messages_item_content_bytes.push(this.readUint8());
        }
        messages_item.content = new TextDecoder().decode(new Uint8Array(messages_item_content_bytes));
        messages_item.created_at = this.readInt64("big_endian");
        messages_item.edited_at = {};
        messages_item.edited_at.present = this.readUint8();
        if (messages_item.edited_at.present == 1) {
          messages_item.edited_at.value = this.readInt64("big_endian");
        }
        messages_item.reply_count = this.readUint32("big_endian");
        value.messages.push(messages_item);
      }
      return value;
    }
  };
  var PingEncoder = class extends BitStreamEncoder {
    constructor() {
      super("msb_first");
      this.compressionDict = /* @__PURE__ */ new Map();
    }
    encode(value) {
      this.compressionDict.clear();
      this.writeInt64(value.timestamp, "big_endian");
      return this.finish();
    }
  };
  var SubscribeThreadEncoder = class extends BitStreamEncoder {
    constructor() {
      super("msb_first");
      this.compressionDict = /* @__PURE__ */ new Map();
    }
    encode(value) {
      this.compressionDict.clear();
      this.writeUint64(value.thread_id, "big_endian");
      return this.finish();
    }
  };
  var UnsubscribeThreadEncoder = class extends BitStreamEncoder {
    constructor() {
      super("msb_first");
      this.compressionDict = /* @__PURE__ */ new Map();
    }
    encode(value) {
      this.compressionDict.clear();
      this.writeUint64(value.thread_id, "big_endian");
      return this.finish();
    }
  };
  var SubscribeChannelEncoder = class extends BitStreamEncoder {
    constructor() {
      super("msb_first");
      this.compressionDict = /* @__PURE__ */ new Map();
    }
    encode(value) {
      this.compressionDict.clear();
      this.writeUint64(value.channel_id, "big_endian");
      this.writeUint8(value.subchannel_id.present);
      if (value.subchannel_id.present == 1 && value.subchannel_id.value !== void 0) {
        this.writeUint64(value.subchannel_id.value, "big_endian");
      }
      return this.finish();
    }
  };
  var UnsubscribeChannelEncoder = class extends BitStreamEncoder {
    constructor() {
      super("msb_first");
      this.compressionDict = /* @__PURE__ */ new Map();
    }
    encode(value) {
      this.compressionDict.clear();
      this.writeUint64(value.channel_id, "big_endian");
      this.writeUint8(value.subchannel_id.present);
      if (value.subchannel_id.present == 1 && value.subchannel_id.value !== void 0) {
        this.writeUint64(value.subchannel_id.value, "big_endian");
      }
      return this.finish();
    }
  };
  var SubscribeOkDecoder = class extends BitStreamDecoder {
    constructor(bytes, context) {
      super(bytes, "msb_first");
      this.context = context;
    }
    decode() {
      const value = {};
      value.type = this.readUint8();
      value.id = this.readUint64("big_endian");
      value.subchannel_id = {};
      value.subchannel_id.present = this.readUint8();
      if (value.subchannel_id.present == 1) {
        value.subchannel_id.value = this.readUint64("big_endian");
      }
      return value;
    }
  };
  var Error_Decoder = class extends BitStreamDecoder {
    constructor(bytes, context) {
      super(bytes, "msb_first");
      this.context = context;
    }
    decode() {
      const value = {};
      value.error_code = this.readUint16("big_endian");
      const message_length = this.readUint16("big_endian");
      const message_bytes = [];
      for (let i = 0; i < message_length; i++) {
        message_bytes.push(this.readUint8());
      }
      value.message = new TextDecoder().decode(new Uint8Array(message_bytes));
      return value;
    }
  };
  var ServerConfigDecoder = class extends BitStreamDecoder {
    constructor(bytes, context) {
      super(bytes, "msb_first");
      this.context = context;
    }
    decode() {
      const value = {};
      value.protocol_version = this.readUint8();
      value.max_message_rate = this.readUint16("big_endian");
      value.max_channel_creates = this.readUint16("big_endian");
      value.inactive_cleanup_days = this.readUint16("big_endian");
      value.max_connections_per_ip = this.readUint8();
      value.max_message_length = this.readUint32("big_endian");
      value.max_thread_subs = this.readUint16("big_endian");
      value.max_channel_subs = this.readUint16("big_endian");
      value.directory_enabled = this.readUint8();
      return value;
    }
  };

  // src/main.ts
  var MSG_SET_NICKNAME = 2;
  var MSG_NICKNAME_RESPONSE = 130;
  var MSG_LIST_CHANNELS = 4;
  var MSG_CHANNEL_LIST = 132;
  var MSG_JOIN_CHANNEL = 5;
  var MSG_JOIN_RESPONSE = 133;
  var MSG_LIST_MESSAGES = 9;
  var MSG_MESSAGE_LIST = 137;
  var MSG_POST_MESSAGE = 10;
  var MSG_MESSAGE_POSTED = 138;
  var MSG_NEW_MESSAGE = 141;
  var MSG_PING = 16;
  var MSG_PONG = 144;
  var MSG_SUBSCRIBE_THREAD = 81;
  var MSG_UNSUBSCRIBE_THREAD = 82;
  var MSG_SUBSCRIBE_CHANNEL = 83;
  var MSG_UNSUBSCRIBE_CHANNEL = 84;
  var MSG_SUBSCRIBE_OK = 153;
  var MSG_ERROR = 145;
  var MSG_SERVER_CONFIG = 152;
  var SuperChatClient = class {
    constructor() {
      this.ws = null;
      this.nickname = "";
      this.isRegistered = false;
      // Track if we're a registered user
      this.currentChannel = null;
      this.channels = /* @__PURE__ */ new Map();
      this.pingInterval = null;
      this.frameBuffer = new Uint8Array(0);
      this.expectedFrameLength = null;
      // Traffic tracking
      this.bytesSent = 0;
      this.bytesReceived = 0;
      this.bytesReceivedThrottled = 0;
      // Bytes we've "received" according to throttle
      this.trafficUpdateInterval = null;
      this.throttleBytesPerSecond = 0;
      // 0 = no throttle
      this.pendingSends = [];
      // Receive throttling (buffer complete frames, not fragments)
      this.frameReceiveBuffer = [];
      this.receiveProcessInterval = null;
      this.lastReceiveProcessTime = 0;
      // Threading state
      this.currentView = 0 /* ThreadList */;
      this.currentThread = null;
      this.threads = [];
      // Root messages only (parent_id.present === 0)
      this.threadReplies = /* @__PURE__ */ new Map();
      // Replies by thread root ID
      this.replyToMessageId = null;
      // When composing a reply
      this.replyingToMessage = null;
      // Full message being replied to
      // Subscription tracking
      this.subscribedChannelId = null;
      this.subscribedThreadId = null;
      this.setupEventListeners();
      this.setDefaultServerUrl();
    }
    setDefaultServerUrl() {
      const serverUrlInput = document.getElementById("server-url");
      if (serverUrlInput) {
        const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
        const hostname = window.location.hostname || "localhost";
        serverUrlInput.value = `${protocol}//${hostname}:8080/ws`;
      }
    }
    setupEventListeners() {
      const form = document.getElementById("connect-form");
      form.addEventListener("submit", (e) => {
        e.preventDefault();
        const url = document.getElementById("server-url").value;
        const nickname = document.getElementById("nickname").value;
        const throttle = parseInt(document.getElementById("throttle-speed").value, 10);
        this.throttleBytesPerSecond = throttle;
        this.connect(url, nickname);
      });
      document.getElementById("mobile-menu-toggle")?.addEventListener("click", () => {
        this.toggleMobileSidebar();
      });
      document.getElementById("send-button")?.addEventListener("click", () => {
        this.sendMessage();
      });
      document.getElementById("message-input")?.addEventListener("keydown", (e) => {
        if (e.key === "Enter" && !e.shiftKey && !e.ctrlKey) {
          e.preventDefault();
          this.sendMessage();
        }
        if (e.key === "Escape" && this.replyToMessageId !== null) {
          this.cancelReply();
        }
      });
      document.addEventListener("click", (e) => {
        const target = e.target;
        if (target.id === "back-button") {
          this.backToThreadList();
        }
      });
      document.getElementById("cancel-reply-button")?.addEventListener("click", () => {
        this.cancelReply();
      });
    }
    cancelReply() {
      this.replyToMessageId = null;
      this.replyingToMessage = null;
      this.updateComposeArea();
      this.updateReplyContext();
      this.showStatus("Reply cancelled", "info");
    }
    backToThreadList() {
      if (this.subscribedThreadId !== null) {
        this.unsubscribeFromThread(this.subscribedThreadId);
      }
      this.currentThread = null;
      this.currentView = 0 /* ThreadList */;
      this.renderMessages();
      this.updateBackButton();
      this.updateComposeArea();
    }
    updateBackButton() {
      const backButton = document.getElementById("back-button");
      if (backButton) {
        backButton.style.display = this.currentView === 1 /* ThreadDetail */ ? "inline-block" : "none";
      }
    }
    updateComposeArea() {
      const composeArea = document.getElementById("compose-area");
      const input = document.getElementById("message-input");
      if (!composeArea || !input)
        return;
      if (this.currentChannel && this.currentChannel.type === 0) {
        composeArea.style.display = "block";
        input.placeholder = "Type a message...";
      } else if (this.currentView === 0 /* ThreadList */) {
        composeArea.style.display = "block";
        input.placeholder = "Start a new conversation...";
      } else {
        const shouldShow = this.replyToMessageId !== null;
        composeArea.style.display = shouldShow ? "block" : "none";
        if (shouldShow) {
          input.placeholder = "Type your reply...";
        } else {
          input.value = "";
        }
      }
    }
    updateReplyContext() {
      const replyContext = document.getElementById("reply-context");
      const replyToAuthor = document.getElementById("reply-to-author");
      const replyToPreview = document.getElementById("reply-to-preview");
      if (!replyContext || !replyToAuthor || !replyToPreview)
        return;
      document.querySelectorAll(".reply-target").forEach((el) => {
        el.classList.remove("reply-target");
      });
      if (this.replyingToMessage) {
        replyContext.style.display = "block";
        replyToAuthor.textContent = this.replyingToMessage.author_nickname;
        const preview = this.replyingToMessage.content.length > 50 ? this.replyingToMessage.content.substring(0, 50) + "..." : this.replyingToMessage.content;
        replyToPreview.textContent = `"${preview}"`;
        const messageElement = document.querySelector(`[data-message-id="${this.replyingToMessage.message_id}"]`);
        if (messageElement) {
          messageElement.classList.add("reply-target");
        }
      } else {
        replyContext.style.display = "none";
        replyToAuthor.textContent = "";
        replyToPreview.textContent = "";
      }
    }
    toggleMobileSidebar() {
      const sidebar = document.getElementById("sidebar");
      const toggle = document.getElementById("mobile-menu-toggle");
      sidebar?.classList.toggle("mobile-open");
      toggle?.classList.toggle("active");
    }
    closeMobileSidebar() {
      const sidebar = document.getElementById("sidebar");
      const toggle = document.getElementById("mobile-menu-toggle");
      sidebar?.classList.remove("mobile-open");
      toggle?.classList.remove("active");
    }
    async connect(url, nickname) {
      this.nickname = nickname;
      try {
        this.ws = new WebSocket(url);
        this.ws.binaryType = "arraybuffer";
        this.ws.onopen = () => {
          console.log("WebSocket connected");
          this.sendSetNickname(nickname);
          this.pingInterval = window.setInterval(() => this.sendPing(), 3e4);
          this.trafficUpdateInterval = window.setInterval(() => this.updateTrafficStats(), 1e3);
          if (this.throttleBytesPerSecond > 0) {
            this.lastReceiveProcessTime = Date.now();
            this.receiveProcessInterval = window.setInterval(() => this.processReceiveBuffer(), 100);
          }
        };
        this.ws.onmessage = (event) => {
          const data = new Uint8Array(event.data);
          this.bytesReceived += data.length;
          this.handleFragment(data);
        };
        this.ws.onerror = (error) => {
          console.error("WebSocket error:", error);
          this.showStatus("Connection error", "error");
        };
        this.ws.onclose = () => {
          console.log("WebSocket closed");
          this.showStatus("Disconnected from server", "error");
          if (this.pingInterval) {
            clearInterval(this.pingInterval);
            this.pingInterval = null;
          }
          if (this.trafficUpdateInterval) {
            clearInterval(this.trafficUpdateInterval);
            this.trafficUpdateInterval = null;
          }
          if (this.receiveProcessInterval) {
            clearInterval(this.receiveProcessInterval);
            this.receiveProcessInterval = null;
          }
        };
      } catch (error) {
        console.error("Failed to connect:", error);
        this.showStatus("Failed to connect", "error");
      }
    }
    sendFrame(messageType, payloadBytes) {
      if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
        console.error("WebSocket not connected");
        return;
      }
      const headerEncoder = new FrameHeaderEncoder();
      const header = headerEncoder.encode({
        length: 3 + payloadBytes.length,
        // version(1) + type(1) + flags(1) + payload
        version: 1,
        type: messageType,
        flags: 0
      });
      const frame = new Uint8Array(header.length + payloadBytes.length);
      frame.set(header, 0);
      frame.set(payloadBytes, header.length);
      this.bytesSent += frame.length;
      if (this.throttleBytesPerSecond > 0) {
        this.pendingSends.push({ data: frame, timestamp: Date.now() });
        this.processPendingSends();
      } else {
        this.ws.send(frame);
      }
    }
    processPendingSends() {
      if (this.pendingSends.length === 0 || !this.ws || this.ws.readyState !== WebSocket.OPEN) {
        return;
      }
      const bytesPerInterval = Math.max(100, this.throttleBytesPerSecond / 10);
      while (this.pendingSends.length > 0) {
        const pending = this.pendingSends[0];
        if (pending.data.length <= bytesPerInterval) {
          this.pendingSends.shift();
          this.ws.send(pending.data);
        } else {
          setTimeout(() => this.processPendingSends(), 100);
          break;
        }
      }
    }
    processReceiveBuffer() {
      if (this.frameReceiveBuffer.length === 0) {
        return;
      }
      const now = Date.now();
      const elapsedMs = now - this.lastReceiveProcessTime;
      const bytesAllowed = this.throttleBytesPerSecond * elapsedMs / 1e3;
      let bytesProcessed = 0;
      const toProcess = [];
      while (this.frameReceiveBuffer.length > 0 && bytesProcessed < bytesAllowed) {
        const buffered = this.frameReceiveBuffer[0];
        if (bytesProcessed + buffered.size <= bytesAllowed) {
          this.frameReceiveBuffer.shift();
          toProcess.push(buffered.frame);
          bytesProcessed += buffered.size;
          this.bytesReceivedThrottled += buffered.size;
        } else {
          break;
        }
      }
      this.lastReceiveProcessTime = now;
      for (const frame of toProcess) {
        console.log(`Processing frame ${frame.length} bytes from buffer (${this.frameReceiveBuffer.length} remaining)`);
        this.handleCompleteFrame(frame);
      }
    }
    handleFragment(fragment) {
      const newBuffer = new Uint8Array(this.frameBuffer.length + fragment.length);
      newBuffer.set(this.frameBuffer, 0);
      newBuffer.set(fragment, this.frameBuffer.length);
      this.frameBuffer = newBuffer;
      while (true) {
        if (this.expectedFrameLength === null && this.frameBuffer.length >= 4) {
          const view = new DataView(this.frameBuffer.buffer, this.frameBuffer.byteOffset, 4);
          this.expectedFrameLength = view.getUint32(0, false);
          console.log(`Expecting frame of ${this.expectedFrameLength} bytes (plus 4-byte length prefix)`);
        }
        if (this.expectedFrameLength !== null) {
          const totalFrameSize = 4 + this.expectedFrameLength;
          if (this.frameBuffer.length >= totalFrameSize) {
            const completeFrame = this.frameBuffer.slice(0, totalFrameSize);
            this.frameBuffer = this.frameBuffer.slice(totalFrameSize);
            this.expectedFrameLength = null;
            if (this.throttleBytesPerSecond > 0) {
              this.frameReceiveBuffer.push({
                frame: completeFrame,
                arrivedAt: Date.now(),
                size: totalFrameSize
              });
              console.log(`Buffered frame ${totalFrameSize} bytes (buffer: ${this.frameReceiveBuffer.length} frames)`);
            } else {
              this.handleCompleteFrame(completeFrame);
            }
            continue;
          }
        }
        break;
      }
    }
    handleCompleteFrame(data) {
      this.handleMessage(data);
    }
    handleMessage(data) {
      try {
        console.log(`Received frame: ${data.length} bytes, first 20:`, Array.from(data.slice(0, 20)));
        if (data.length < 7) {
          console.error(`Frame too short: ${data.length} bytes (need at least 7 for header)`);
          return;
        }
        const headerDecoder = new FrameHeaderDecoder(data);
        const header = headerDecoder.decode();
        console.log(`Decoded header: length=${header.length}, version=${header.version}, type=0x${header.type.toString(16)}, flags=${header.flags}`);
        const payloadSlice = data.slice(7);
        const payload = new Uint8Array(new ArrayBuffer(payloadSlice.length));
        payload.set(payloadSlice);
        console.log(`Payload: ${payload.length} bytes, byteOffset: ${payload.byteOffset}`);
        switch (header.type) {
          case MSG_SERVER_CONFIG:
            this.handleServerConfig(payload);
            break;
          case MSG_NICKNAME_RESPONSE:
            this.handleNicknameResponse(payload);
            break;
          case MSG_CHANNEL_LIST:
            this.handleChannelList(payload);
            break;
          case MSG_JOIN_RESPONSE:
            this.handleJoinResponse(payload);
            break;
          case MSG_MESSAGE_LIST:
            this.handleMessageList(payload);
            break;
          case MSG_MESSAGE_POSTED:
            this.handleMessagePosted(payload);
            break;
          case MSG_NEW_MESSAGE:
            this.handleNewMessage(payload);
            break;
          case MSG_PONG:
            console.log("Received PONG");
            break;
          case MSG_SUBSCRIBE_OK:
            this.handleSubscribeOk(payload);
            break;
          case MSG_ERROR:
            this.handleError(payload);
            break;
          default:
            console.warn(`Unhandled message type: 0x${header.type.toString(16)} (decimal ${header.type})`);
        }
      } catch (error) {
        console.error("Error handling message:", error);
        console.error("Frame data:", Array.from(data));
      }
    }
    sendSetNickname(nickname) {
      const encoder = new SetNicknameEncoder();
      const payload = encoder.encode({ nickname });
      this.sendFrame(MSG_SET_NICKNAME, payload);
    }
    handleServerConfig(payload) {
      try {
        const decoder = new ServerConfigDecoder(payload);
        const config = decoder.decode();
        console.log("Received SERVER_CONFIG:", config);
      } catch (error) {
        console.error("Error decoding SERVER_CONFIG:", error);
      }
    }
    handleError(payload) {
      try {
        const decoder = new Error_Decoder(payload);
        const error = decoder.decode();
        console.error(`Server error ${error.error_code}: ${error.message}`);
        this.showStatus(`Server error: ${error.message}`, "error");
      } catch (error) {
        console.error("Error decoding ERROR message:", error);
      }
    }
    handleNicknameResponse(payload) {
      const decoder = new NicknameResponseDecoder(payload);
      const response = decoder.decode();
      if (response.success === 1) {
        console.log("Nickname set successfully:", response.message);
        this.showStatus(response.message, "success");
        this.isRegistered = !this.nickname.startsWith("~");
        document.getElementById("connect-panel")?.classList.add("hidden");
        document.getElementById("app").style.display = "flex";
        this.sendListChannels();
      } else {
        this.showStatus(response.message, "error");
      }
    }
    sendListChannels() {
      const encoder = new ListChannelsEncoder();
      const payload = encoder.encode({ from_channel_id: 0n, limit: 100 });
      this.sendFrame(MSG_LIST_CHANNELS, payload);
    }
    handleChannelList(payload) {
      try {
        const decoder = new ChannelListDecoder(payload);
        const channelList = decoder.decode();
        console.log(`Received ${channelList.channel_count} channels`);
        this.channels.clear();
        for (const channel of channelList.channels) {
          this.channels.set(channel.channel_id, channel);
        }
        this.renderChannels();
      } catch (error) {
        console.error("Error decoding CHANNEL_LIST:", error);
        throw error;
      }
    }
    renderChannels() {
      const list = document.getElementById("channel-list");
      list.innerHTML = "";
      for (const channel of this.channels.values()) {
        const item = document.createElement("div");
        item.className = "channel-item";
        if (this.currentChannel?.channel_id === channel.channel_id) {
          item.classList.add("active");
        }
        const prefix = channel.type === 0 ? ">" : "#";
        item.innerHTML = `
        <div class="channel-name">${prefix} ${channel.name}</div>
        <div class="channel-info">${channel.user_count} online \u2022 ${channel.type === 0 ? "Chat" : "Forum"}</div>
      `;
        item.addEventListener("click", () => {
          this.joinChannel(channel);
          this.closeMobileSidebar();
        });
        list.appendChild(item);
      }
    }
    joinChannel(channel) {
      const encoder = new JoinChannelEncoder();
      const payload = encoder.encode({
        channel_id: channel.channel_id,
        subchannel_id: { present: 0 }
      });
      this.sendFrame(MSG_JOIN_CHANNEL, payload);
    }
    handleJoinResponse(payload) {
      const decoder = new JoinResponseDecoder(payload);
      const response = decoder.decode();
      if (response.success === 1) {
        const channel = this.channels.get(response.channel_id);
        if (channel) {
          this.currentChannel = channel;
          console.log("Joined channel:", channel.name);
          this.showStatus(`Joined #${channel.name}`, "success");
          if (this.subscribedThreadId !== null) {
            this.unsubscribeFromThread(this.subscribedThreadId);
          }
          this.currentView = 0 /* ThreadList */;
          this.currentThread = null;
          this.replyToMessageId = null;
          this.replyingToMessage = null;
          this.threads = [];
          this.threadReplies.clear();
          const prefix = channel.type === 0 ? ">" : "#";
          document.getElementById("channel-title").textContent = `${prefix} ${channel.name}`;
          this.renderChannels();
          this.updateBackButton();
          this.updateComposeArea();
          this.subscribeToChannel(channel.channel_id);
          this.sendListMessages(channel.channel_id);
        }
      } else {
        this.showStatus(response.message, "error");
      }
    }
    subscribeToChannel(channelId) {
      if (this.subscribedChannelId !== null && this.subscribedChannelId !== channelId) {
        this.unsubscribeFromChannel(this.subscribedChannelId);
      }
      const encoder = new SubscribeChannelEncoder();
      const payload = encoder.encode({
        channel_id: channelId,
        subchannel_id: { present: 0 }
      });
      this.sendFrame(MSG_SUBSCRIBE_CHANNEL, payload);
      console.log(`Subscribing to channel ${channelId}...`);
    }
    unsubscribeFromChannel(channelId) {
      const encoder = new UnsubscribeChannelEncoder();
      const payload = encoder.encode({
        channel_id: channelId,
        subchannel_id: { present: 0 }
      });
      this.sendFrame(MSG_UNSUBSCRIBE_CHANNEL, payload);
      console.log(`Unsubscribed from channel ${channelId}`);
      this.subscribedChannelId = null;
    }
    subscribeToThread(threadId) {
      if (this.subscribedThreadId !== null && this.subscribedThreadId !== threadId) {
        this.unsubscribeFromThread(this.subscribedThreadId);
      }
      const encoder = new SubscribeThreadEncoder();
      const payload = encoder.encode({ thread_id: threadId });
      this.sendFrame(MSG_SUBSCRIBE_THREAD, payload);
      console.log(`Subscribing to thread ${threadId}...`);
    }
    unsubscribeFromThread(threadId) {
      const encoder = new UnsubscribeThreadEncoder();
      const payload = encoder.encode({ thread_id: threadId });
      this.sendFrame(MSG_UNSUBSCRIBE_THREAD, payload);
      console.log(`Unsubscribed from thread ${threadId}`);
      this.subscribedThreadId = null;
    }
    handleSubscribeOk(payload) {
      try {
        const decoder = new SubscribeOkDecoder(payload);
        const response = decoder.decode();
        if (response.type === MSG_SUBSCRIBE_CHANNEL) {
          this.subscribedChannelId = response.id;
          console.log(`Successfully subscribed to channel ${response.id}`);
        } else if (response.type === MSG_SUBSCRIBE_THREAD) {
          this.subscribedThreadId = response.id;
          console.log(`Successfully subscribed to thread ${response.id}`);
        }
      } catch (error) {
        console.error("Error decoding SUBSCRIBE_OK:", error);
      }
    }
    sendListMessages(channelId) {
      const encoder = new ListMessagesEncoder();
      const payload = encoder.encode({
        channel_id: channelId,
        subchannel_id: { present: 0 },
        limit: 50,
        before_id: { present: 0 },
        parent_id: { present: 0 },
        after_id: { present: 0 }
      });
      this.sendFrame(MSG_LIST_MESSAGES, payload);
    }
    handleMessageList(payload) {
      const decoder = new MessageListDecoder(payload);
      const messageList = decoder.decode();
      console.log(`Received ${messageList.message_count} messages for channel ${messageList.channel_id}`);
      const isThreadReplies = messageList.parent_id.present === 1;
      if (isThreadReplies) {
        const threadId = messageList.parent_id.value;
        this.threadReplies.set(threadId, messageList.messages);
        console.log(`Loaded ${messageList.messages.length} replies for thread ${threadId}`);
      } else {
        this.threads = messageList.messages.filter((msg) => msg.parent_id.present === 0);
        console.log(`Loaded ${this.threads.length} threads`);
      }
      if (this.currentChannel?.channel_id === messageList.channel_id) {
        this.renderMessages();
        console.log(`handleMessageList: isThreadReplies=${isThreadReplies}, currentView=${this.currentView}, channel.type=${this.currentChannel.type}`);
        if (isThreadReplies && this.currentView === 1 /* ThreadDetail */ && this.currentChannel.type === 0) {
          console.log("Auto-scrolling after loading thread replies");
          setTimeout(() => {
            const container = document.getElementById("messages");
            if (container) {
              console.log(`Scrolling: scrollTop=${container.scrollTop} -> scrollHeight=${container.scrollHeight}`);
              container.scrollTop = container.scrollHeight;
            }
          }, 50);
        }
      }
    }
    renderMessages() {
      if (this.currentChannel && this.currentChannel.type === 0) {
        this.renderChatMessages();
      } else if (this.currentView === 0 /* ThreadList */) {
        this.renderThreadList();
      } else {
        this.renderThreadDetail();
      }
    }
    renderChatMessages() {
      const container = document.getElementById("messages");
      if (!this.currentChannel) {
        container.innerHTML = '<div class="empty-state"><h3>Select a channel</h3></div>';
        return;
      }
      if (this.threads.length === 0) {
        container.innerHTML = '<div class="empty-state"><h3>No messages yet</h3><p>Start chatting!</p></div>';
        return;
      }
      container.innerHTML = "";
      for (const message of this.threads) {
        const div = document.createElement("div");
        div.className = "chat-message";
        div.setAttribute("data-message-id", message.message_id.toString());
        const date = new Date(Number(message.created_at));
        const timeStr = date.toLocaleTimeString();
        div.innerHTML = `
        <span class="chat-time">${timeStr}</span>
        <span class="chat-author">${this.escapeHtml(message.author_nickname)}</span>
        <span class="chat-content">${this.escapeHtml(message.content)}</span>
      `;
        container.appendChild(div);
      }
      console.log(`renderChatMessages: scrolling to bottom, scrollHeight=${container.scrollHeight}`);
      container.scrollTop = container.scrollHeight;
    }
    renderThreadList() {
      const container = document.getElementById("messages");
      if (!this.currentChannel) {
        container.innerHTML = '<div class="empty-state"><h3>Select a channel</h3></div>';
        return;
      }
      if (this.threads.length === 0) {
        container.innerHTML = '<div class="empty-state"><h3>No threads yet</h3><p>Start a conversation!</p></div>';
        return;
      }
      container.innerHTML = "";
      for (const thread of this.threads) {
        const div = document.createElement("div");
        div.className = "thread-item";
        const date = new Date(Number(thread.created_at));
        const timeStr = date.toLocaleTimeString();
        const preview = thread.content.length > 80 ? thread.content.substring(0, 80) + "..." : thread.content;
        const replyBadge = thread.reply_count > 0 ? `<span class="reply-count-badge">${thread.reply_count} ${thread.reply_count === 1 ? "reply" : "replies"}</span>` : "";
        div.innerHTML = `
        <div class="thread-header">
          <span class="thread-author">${this.escapeHtml(thread.author_nickname)}</span>
          <span class="thread-time">${timeStr}</span>
        </div>
        <div class="thread-preview">${this.escapeHtml(preview)}</div>
        <div class="thread-footer">
          ${replyBadge}
        </div>
      `;
        div.addEventListener("click", () => {
          this.openThread(thread);
        });
        container.appendChild(div);
      }
      container.scrollTop = 0;
    }
    renderThreadDetail() {
      const container = document.getElementById("messages");
      if (!this.currentThread) {
        container.innerHTML = '<div class="empty-state"><h3>No thread selected</h3></div>';
        return;
      }
      container.innerHTML = "";
      this.renderMessage(container, this.currentThread, 0, true);
      const replies = this.threadReplies.get(this.currentThread.message_id) || [];
      const messageTree = this.buildMessageTree(replies, this.currentThread.message_id);
      this.renderMessageTree(container, messageTree, 1);
      container.querySelectorAll(".reply-button").forEach((button) => {
        button.addEventListener("click", (e) => {
          e.stopPropagation();
          const messageId = BigInt(e.target.getAttribute("data-message-id"));
          this.replyToMessage(messageId);
        });
      });
      console.log(`renderThreadDetail: channel.type=${this.currentChannel?.type}`);
      if (this.currentChannel && this.currentChannel.type === 0) {
        console.log(`Auto-scrolling in renderThreadDetail: scrollHeight=${container.scrollHeight}`);
        container.scrollTop = container.scrollHeight;
      }
    }
    buildMessageTree(messages, rootId) {
      const childrenMap = /* @__PURE__ */ new Map();
      for (const msg of messages) {
        if (msg.parent_id.present === 1) {
          const parentId = msg.parent_id.value;
          if (!childrenMap.has(parentId)) {
            childrenMap.set(parentId, []);
          }
          childrenMap.get(parentId).push(msg);
        }
      }
      return childrenMap.get(rootId) || [];
    }
    renderMessageTree(container, messages, depth) {
      for (const msg of messages) {
        this.renderMessage(container, msg, depth, false);
        const replies = this.threadReplies.get(this.currentThread.message_id) || [];
        const children = this.buildMessageTree(replies, msg.message_id);
        if (children.length > 0) {
          this.renderMessageTree(container, children, depth + 1);
        }
      }
    }
    renderMessage(container, message, depth, isRoot) {
      const div = document.createElement("div");
      div.className = isRoot ? "message thread-root" : "message thread-reply";
      div.setAttribute("data-message-id", message.message_id.toString());
      if (!isRoot && depth > 0) {
        div.style.marginLeft = `${depth * 2}rem`;
      }
      const date = new Date(Number(message.created_at));
      const timeStr = date.toLocaleTimeString();
      div.innerHTML = `
      <div class="message-header">
        <span class="message-author">${this.escapeHtml(message.author_nickname)}</span>
        <span class="message-time">${timeStr}</span>
      </div>
      <div class="message-content">${this.escapeHtml(message.content)}</div>
      <div class="message-actions">
        <button class="reply-button" data-message-id="${message.message_id}">Reply</button>
      </div>
    `;
      container.appendChild(div);
    }
    openThread(thread) {
      this.currentThread = thread;
      this.currentView = 1 /* ThreadDetail */;
      this.updateBackButton();
      this.updateComposeArea();
      this.subscribeToThread(thread.message_id);
      this.loadThreadReplies(thread.message_id);
    }
    loadThreadReplies(threadId) {
      const encoder = new ListMessagesEncoder();
      const payload = encoder.encode({
        channel_id: this.currentChannel.channel_id,
        subchannel_id: { present: 0 },
        limit: 100,
        before_id: { present: 0 },
        parent_id: { present: 1, value: threadId },
        after_id: { present: 0 }
      });
      this.sendFrame(MSG_LIST_MESSAGES, payload);
    }
    replyToMessage(messageId) {
      this.replyToMessageId = messageId;
      if (this.currentThread && this.currentThread.message_id === messageId) {
        this.replyingToMessage = this.currentThread;
      } else {
        const replies = this.threadReplies.get(this.currentThread.message_id) || [];
        this.replyingToMessage = replies.find((m) => m.message_id === messageId) || null;
      }
      this.updateComposeArea();
      this.updateReplyContext();
      const input = document.getElementById("message-input");
      input.focus();
      this.showStatus("Reply mode active - press Escape to cancel", "info");
    }
    handleNewMessage(payload) {
      const decoder = new NewMessageDecoder(payload);
      const newMsg = decoder.decode();
      console.log("Received new message:", newMsg);
      const message = {
        message_id: newMsg.message_id,
        channel_id: newMsg.channel_id,
        subchannel_id: newMsg.subchannel_id,
        parent_id: newMsg.parent_id,
        author_user_id: newMsg.author_user_id,
        author_nickname: newMsg.author_nickname,
        content: newMsg.content,
        created_at: newMsg.created_at,
        edited_at: newMsg.edited_at,
        reply_count: newMsg.reply_count
      };
      const isOurMessage = this.isOwnMessage(message.author_nickname);
      if (message.parent_id.present === 0) {
        this.threads.push(message);
        console.log("Added new thread to list");
      } else {
        const parentId = message.parent_id.value;
        let rootThreadId = parentId;
        const isRootThread = this.threads.some((t) => t.message_id === parentId);
        if (!isRootThread) {
          if (this.currentThread) {
            rootThreadId = this.currentThread.message_id;
          }
        }
        const replies = this.threadReplies.get(rootThreadId) || [];
        replies.push(message);
        this.threadReplies.set(rootThreadId, replies);
        console.log(`Added reply to thread ${rootThreadId}`);
        const thread = this.threads.find((t) => t.message_id === rootThreadId);
        if (thread) {
          thread.reply_count++;
        }
      }
      if (this.currentChannel?.channel_id === newMsg.channel_id) {
        this.renderMessages();
        const shouldScroll = this.currentChannel.type === 0 || this.currentView === 1 /* ThreadDetail */;
        if (shouldScroll) {
          setTimeout(() => {
            const container = document.getElementById("messages");
            if (container) {
              container.scrollTop = container.scrollHeight;
            }
          }, 50);
        }
      }
    }
    sendMessage() {
      const input = document.getElementById("message-input");
      const content = input.value.trim();
      if (!content || !this.currentChannel) {
        return;
      }
      const encoder = new PostMessageEncoder();
      const payload = encoder.encode({
        channel_id: this.currentChannel.channel_id,
        subchannel_id: { present: 0 },
        parent_id: this.replyToMessageId !== null ? { present: 1, value: this.replyToMessageId } : { present: 0 },
        content
      });
      this.sendFrame(MSG_POST_MESSAGE, payload);
      input.value = "";
      this.replyToMessageId = null;
      this.replyingToMessage = null;
      this.updateComposeArea();
      this.updateReplyContext();
    }
    handleMessagePosted(payload) {
      const decoder = new MessagePostedDecoder(payload);
      const response = decoder.decode();
      if (response.success === 1) {
        console.log("Message posted successfully:", response.message_id);
      } else {
        this.showStatus(response.message, "error");
      }
    }
    sendPing() {
      const encoder = new PingEncoder();
      const payload = encoder.encode({ timestamp: BigInt(Date.now()) });
      this.sendFrame(MSG_PING, payload);
    }
    showStatus(message, type = "info") {
      let status = document.getElementById("status-bar");
      if (!status) {
        status = document.createElement("div");
        status.id = "status-bar";
        status.className = "status";
        document.body.prepend(status);
      }
      status.textContent = message;
      status.className = `status ${type}`;
      setTimeout(() => {
        status?.remove();
      }, 3e3);
    }
    escapeHtml(text) {
      const div = document.createElement("div");
      div.textContent = text;
      return div.innerHTML;
    }
    isOwnMessage(authorNickname) {
      if (this.isRegistered) {
        return authorNickname === this.nickname;
      }
      return authorNickname === `~${this.nickname}`;
    }
    formatBytes(bytes) {
      const unit = 1024;
      if (bytes < unit) {
        return `${bytes}B`;
      }
      let div = unit;
      let exp = 0;
      for (let n = Math.floor(bytes / unit); n >= unit; n = Math.floor(n / unit)) {
        div *= unit;
        exp++;
      }
      const units = "KMGTPE";
      return `${(bytes / div).toFixed(1)}${units[exp]}B`;
    }
    formatBandwidth(bytesPerSec) {
      const bitsPerSec = bytesPerSec * 8;
      if (bitsPerSec <= 14400)
        return "14.4k";
      if (bitsPerSec <= 28800)
        return "28.8k";
      if (bitsPerSec <= 33600)
        return "33.6k";
      if (bitsPerSec <= 56e3)
        return "56k";
      if (bitsPerSec <= 128e3)
        return "128k";
      if (bitsPerSec <= 256e3)
        return "256k";
      if (bitsPerSec <= 512e3)
        return "512k";
      if (bitsPerSec <= 1024e3)
        return "1Mbps";
      if (bitsPerSec <= 1024e4)
        return `${(bitsPerSec / 1e6).toFixed(1)}Mbps`;
      return `${(bitsPerSec / 1e6).toFixed(1)}Mbps`;
    }
    updateTrafficStats() {
      const trafficElement = document.getElementById("traffic-stats");
      if (trafficElement && this.ws && this.ws.readyState === WebSocket.OPEN) {
        const sent = this.formatBytes(this.bytesSent);
        const recvBytes = this.throttleBytesPerSecond > 0 ? this.bytesReceivedThrottled : this.bytesReceived;
        const recv = this.formatBytes(recvBytes);
        let html = `<span style="color: #9ca3af;">\u2191${sent} \u2193${recv}</span>`;
        if (this.throttleBytesPerSecond > 0) {
          const speed = this.formatBandwidth(this.throttleBytesPerSecond);
          html += ` <span style="color: #9ca3af;">\u23F1 ${speed}</span>`;
          if (this.frameReceiveBuffer.length > 0) {
            const bufferedBytes = this.frameReceiveBuffer.reduce((sum, item) => sum + item.size, 0);
            const buffered = this.formatBytes(bufferedBytes);
            html += ` <span style="color: #f59e0b;">(${buffered} buffered)</span>`;
          }
        }
        trafficElement.innerHTML = html;
      }
    }
  };
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", () => new SuperChatClient());
  } else {
    new SuperChatClient();
  }
})();
//# sourceMappingURL=main.js.map
