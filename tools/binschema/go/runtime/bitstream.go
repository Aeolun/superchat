// Package runtime provides the core BitStream encoder/decoder for BinSchema.
//
// This implementation is designed for cross-language compatibility with the
// TypeScript version. Core logic should be nearly identical, differing only
// in syntax (Go error returns vs TypeScript exceptions).
package runtime

import (
	"encoding/binary"
	"errors"
	"math"
)

// Endianness specifies byte order for multi-byte values
type Endianness int

const (
	BigEndian Endianness = iota
	LittleEndian
)

// BitOrder specifies bit packing order within bytes
type BitOrder int

const (
	MSBFirst BitOrder = iota // Most significant bit first (network order)
	LSBFirst                 // Least significant bit first (hardware bitfields)
)

// BitStreamEncoder writes bits to a byte stream
type BitStreamEncoder struct {
	bytes           []byte
	currentByte     byte
	bitOffset       int // Bits used in currentByte (0-7)
	totalBitsWritten int
	bitOrder        BitOrder
}

// NewBitStreamEncoder creates a new encoder with the specified bit order
func NewBitStreamEncoder(bitOrder BitOrder) *BitStreamEncoder {
	return &BitStreamEncoder{
		bytes:    make([]byte, 0),
		bitOrder: bitOrder,
	}
}

// Finish returns the encoded bytes, flushing any partial byte
func (e *BitStreamEncoder) Finish() []byte {
	// Flush partial byte if any
	if e.bitOffset > 0 {
		e.bytes = append(e.bytes, e.currentByte)
		e.currentByte = 0
		e.bitOffset = 0
	}
	return e.bytes
}

// BitStreamDecoder reads bits from a byte stream
type BitStreamDecoder struct {
	bytes         []byte
	byteOffset    int
	bitOffset     int // Bits read from current byte (0-7)
	bitOrder      BitOrder
	LastErrorCode *string // Cross-language error handling
}

// NewBitStreamDecoder creates a new decoder with the specified bit order
func NewBitStreamDecoder(bytes []byte, bitOrder BitOrder) *BitStreamDecoder {
	return &BitStreamDecoder{
		bytes:    bytes,
		bitOrder: bitOrder,
	}
}

// Position returns the current byte offset
func (d *BitStreamDecoder) Position() int {
	return d.byteOffset
}

// ReadUint8 reads an 8-bit unsigned integer
func (d *BitStreamDecoder) ReadUint8() (uint8, error) {
	if d.bitOffset == 0 {
		// Byte-aligned: read directly
		if d.byteOffset >= len(d.bytes) {
			errCode := "INCOMPLETE_DATA"
			d.LastErrorCode = &errCode
			return 0, errors.New("unexpected end of stream")
		}
		d.LastErrorCode = nil
		val := d.bytes[d.byteOffset]
		d.byteOffset++
		return val, nil
	}

	// Not byte-aligned: read bit by bit (LSB first for byte values)
	var result uint8
	for i := 0; i < 8; i++ {
		bit, err := d.readBit()
		if err != nil {
			return 0, err
		}
		result |= bit << i
	}
	d.LastErrorCode = nil
	return result, nil
}

// readBit reads a single bit
func (d *BitStreamDecoder) readBit() (uint8, error) {
	if d.byteOffset >= len(d.bytes) {
		errCode := "INCOMPLETE_DATA"
		d.LastErrorCode = &errCode
		return 0, errors.New("unexpected end of stream")
	}

	currentByte := d.bytes[d.byteOffset]
	var bit uint8

	if d.bitOrder == MSBFirst {
		// MSB first: read from left to right
		bit = (currentByte >> (7 - d.bitOffset)) & 1
	} else {
		// LSB first: read from right to left
		bit = (currentByte >> d.bitOffset) & 1
	}

	d.bitOffset++

	if d.bitOffset == 8 {
		d.byteOffset++
		d.bitOffset = 0
	}

	return bit, nil
}

// WriteUint8 writes an 8-bit unsigned integer
func (e *BitStreamEncoder) WriteUint8(value uint8) {
	if e.bitOffset == 0 {
		// Byte-aligned: write directly
		e.bytes = append(e.bytes, value)
	} else {
		// Not byte-aligned: write bit by bit (LSB first for byte values)
		for i := 0; i < 8; i++ {
			bit := (value >> i) & 1
			e.writeBit(bit)
		}
	}
}

// writeBit writes a single bit
func (e *BitStreamEncoder) writeBit(bit uint8) {
	if e.bitOrder == MSBFirst {
		// MSB first: fill from left to right
		e.currentByte |= (bit << (7 - e.bitOffset))
	} else {
		// LSB first: fill from right to left
		e.currentByte |= (bit << e.bitOffset)
	}

	e.bitOffset++
	e.totalBitsWritten++

	if e.bitOffset == 8 {
		e.bytes = append(e.bytes, e.currentByte)
		e.currentByte = 0
		e.bitOffset = 0
	}
}

// ReadUint16 reads a 16-bit unsigned integer
func (d *BitStreamDecoder) ReadUint16(endianness Endianness) (uint16, error) {
	if endianness == BigEndian {
		high, err := d.ReadUint8()
		if err != nil {
			return 0, err
		}
		low, err := d.ReadUint8()
		if err != nil {
			return 0, err
		}
		d.LastErrorCode = nil
		return (uint16(high) << 8) | uint16(low), nil
	}

	// Little endian
	low, err := d.ReadUint8()
	if err != nil {
		return 0, err
	}
	high, err := d.ReadUint8()
	if err != nil {
		return 0, err
	}
	d.LastErrorCode = nil
	return (uint16(high) << 8) | uint16(low), nil
}

// ReadUint32 reads a 32-bit unsigned integer
func (d *BitStreamDecoder) ReadUint32(endianness Endianness) (uint32, error) {
	if endianness == BigEndian {
		b0, err := d.ReadUint8()
		if err != nil {
			return 0, err
		}
		b1, err := d.ReadUint8()
		if err != nil {
			return 0, err
		}
		b2, err := d.ReadUint8()
		if err != nil {
			return 0, err
		}
		b3, err := d.ReadUint8()
		if err != nil {
			return 0, err
		}
		d.LastErrorCode = nil
		return (uint32(b0) << 24) | (uint32(b1) << 16) | (uint32(b2) << 8) | uint32(b3), nil
	}

	// Little endian
	b0, err := d.ReadUint8()
	if err != nil {
		return 0, err
	}
	b1, err := d.ReadUint8()
	if err != nil {
		return 0, err
	}
	b2, err := d.ReadUint8()
	if err != nil {
		return 0, err
	}
	b3, err := d.ReadUint8()
	if err != nil {
		return 0, err
	}
	d.LastErrorCode = nil
	return (uint32(b3) << 24) | (uint32(b2) << 16) | (uint32(b1) << 8) | uint32(b0), nil
}

// ReadUint64 reads a 64-bit unsigned integer
func (d *BitStreamDecoder) ReadUint64(endianness Endianness) (uint64, error) {
	if endianness == BigEndian {
		var result uint64
		for i := 0; i < 8; i++ {
			b, err := d.ReadUint8()
			if err != nil {
				return 0, err
			}
			result = (result << 8) | uint64(b)
		}
		d.LastErrorCode = nil
		return result, nil
	}

	// Little endian
	var result uint64
	for i := 0; i < 8; i++ {
		b, err := d.ReadUint8()
		if err != nil {
			return 0, err
		}
		result = result | (uint64(b) << (i * 8))
	}
	d.LastErrorCode = nil
	return result, nil
}

// ReadInt8 reads an 8-bit signed integer (two's complement)
func (d *BitStreamDecoder) ReadInt8() (int8, error) {
	unsigned, err := d.ReadUint8()
	if err != nil {
		return 0, err
	}
	d.LastErrorCode = nil
	// Two's complement conversion using casting
	return int8(unsigned), nil
}

// ReadInt16 reads a 16-bit signed integer (two's complement)
func (d *BitStreamDecoder) ReadInt16(endianness Endianness) (int16, error) {
	unsigned, err := d.ReadUint16(endianness)
	if err != nil {
		return 0, err
	}
	d.LastErrorCode = nil
	// Two's complement conversion using casting
	return int16(unsigned), nil
}

// ReadInt32 reads a 32-bit signed integer (two's complement)
func (d *BitStreamDecoder) ReadInt32(endianness Endianness) (int32, error) {
	unsigned, err := d.ReadUint32(endianness)
	if err != nil {
		return 0, err
	}
	d.LastErrorCode = nil
	// Two's complement conversion using casting
	return int32(unsigned), nil
}

// ReadInt64 reads a 64-bit signed integer (two's complement)
func (d *BitStreamDecoder) ReadInt64(endianness Endianness) (int64, error) {
	unsigned, err := d.ReadUint64(endianness)
	if err != nil {
		return 0, err
	}
	d.LastErrorCode = nil
	// Two's complement conversion using casting
	return int64(unsigned), nil
}

// WriteUint16 writes a 16-bit unsigned integer
func (e *BitStreamEncoder) WriteUint16(value uint16, endianness Endianness) {
	if endianness == BigEndian {
		e.WriteUint8(uint8((value >> 8) & 0xFF))
		e.WriteUint8(uint8(value & 0xFF))
	} else {
		e.WriteUint8(uint8(value & 0xFF))
		e.WriteUint8(uint8((value >> 8) & 0xFF))
	}
}

// WriteUint32 writes a 32-bit unsigned integer
func (e *BitStreamEncoder) WriteUint32(value uint32, endianness Endianness) {
	if endianness == BigEndian {
		e.WriteUint8(uint8((value >> 24) & 0xFF))
		e.WriteUint8(uint8((value >> 16) & 0xFF))
		e.WriteUint8(uint8((value >> 8) & 0xFF))
		e.WriteUint8(uint8(value & 0xFF))
	} else {
		e.WriteUint8(uint8(value & 0xFF))
		e.WriteUint8(uint8((value >> 8) & 0xFF))
		e.WriteUint8(uint8((value >> 16) & 0xFF))
		e.WriteUint8(uint8((value >> 24) & 0xFF))
	}
}

// WriteUint64 writes a 64-bit unsigned integer
func (e *BitStreamEncoder) WriteUint64(value uint64, endianness Endianness) {
	if endianness == BigEndian {
		e.WriteUint8(uint8((value >> 56) & 0xFF))
		e.WriteUint8(uint8((value >> 48) & 0xFF))
		e.WriteUint8(uint8((value >> 40) & 0xFF))
		e.WriteUint8(uint8((value >> 32) & 0xFF))
		e.WriteUint8(uint8((value >> 24) & 0xFF))
		e.WriteUint8(uint8((value >> 16) & 0xFF))
		e.WriteUint8(uint8((value >> 8) & 0xFF))
		e.WriteUint8(uint8(value & 0xFF))
	} else {
		e.WriteUint8(uint8(value & 0xFF))
		e.WriteUint8(uint8((value >> 8) & 0xFF))
		e.WriteUint8(uint8((value >> 16) & 0xFF))
		e.WriteUint8(uint8((value >> 24) & 0xFF))
		e.WriteUint8(uint8((value >> 32) & 0xFF))
		e.WriteUint8(uint8((value >> 40) & 0xFF))
		e.WriteUint8(uint8((value >> 48) & 0xFF))
		e.WriteUint8(uint8((value >> 56) & 0xFF))
	}
}

// WriteInt8 writes an 8-bit signed integer (two's complement)
func (e *BitStreamEncoder) WriteInt8(value int8) {
	// Two's complement conversion using casting
	e.WriteUint8(uint8(value))
}

// WriteInt16 writes a 16-bit signed integer (two's complement)
func (e *BitStreamEncoder) WriteInt16(value int16, endianness Endianness) {
	// Two's complement conversion using casting
	e.WriteUint16(uint16(value), endianness)
}

// WriteInt32 writes a 32-bit signed integer (two's complement)
func (e *BitStreamEncoder) WriteInt32(value int32, endianness Endianness) {
	// Two's complement conversion using casting
	e.WriteUint32(uint32(value), endianness)
}

// WriteInt64 writes a 64-bit signed integer (two's complement)
func (e *BitStreamEncoder) WriteInt64(value int64, endianness Endianness) {
	// Two's complement conversion using casting
	e.WriteUint64(uint64(value), endianness)
}

// ReadFloat32 reads a 32-bit IEEE 754 float
func (d *BitStreamDecoder) ReadFloat32(endianness Endianness) (float32, error) {
	var buf [4]byte
	for i := 0; i < 4; i++ {
		b, err := d.ReadUint8()
		if err != nil {
			return 0, err
		}
		buf[i] = b
	}

	d.LastErrorCode = nil
	var bits uint32
	if endianness == LittleEndian {
		bits = binary.LittleEndian.Uint32(buf[:])
	} else {
		bits = binary.BigEndian.Uint32(buf[:])
	}
	return math.Float32frombits(bits), nil
}

// ReadFloat64 reads a 64-bit IEEE 754 float
func (d *BitStreamDecoder) ReadFloat64(endianness Endianness) (float64, error) {
	var buf [8]byte
	for i := 0; i < 8; i++ {
		b, err := d.ReadUint8()
		if err != nil {
			return 0, err
		}
		buf[i] = b
	}

	d.LastErrorCode = nil
	var bits uint64
	if endianness == LittleEndian {
		bits = binary.LittleEndian.Uint64(buf[:])
	} else {
		bits = binary.BigEndian.Uint64(buf[:])
	}
	return math.Float64frombits(bits), nil
}

// WriteFloat32 writes a 32-bit IEEE 754 float
func (e *BitStreamEncoder) WriteFloat32(value float32, endianness Endianness) {
	bits := math.Float32bits(value)
	var buf [4]byte

	if endianness == LittleEndian {
		binary.LittleEndian.PutUint32(buf[:], bits)
	} else {
		binary.BigEndian.PutUint32(buf[:], bits)
	}

	for i := 0; i < 4; i++ {
		e.WriteUint8(buf[i])
	}
}

// WriteFloat64 writes a 64-bit IEEE 754 float
func (e *BitStreamEncoder) WriteFloat64(value float64, endianness Endianness) {
	bits := math.Float64bits(value)
	var buf [8]byte

	if endianness == LittleEndian {
		binary.LittleEndian.PutUint64(buf[:], bits)
	} else {
		binary.BigEndian.PutUint64(buf[:], bits)
	}

	for i := 0; i < 8; i++ {
		e.WriteUint8(buf[i])
	}
}
