// Package runtime provides the core BitStream encoder/decoder for BinSchema.
//
// This implementation is designed for cross-language compatibility with the
// TypeScript version. Core logic should be nearly identical, differing only
// in syntax (Go error returns vs TypeScript exceptions).
//
// Vendored from github.com/anthropics/binschema/runtime
package runtime

import (
	"encoding/binary"
	"errors"
	"fmt"
	"hash/crc32"
	"math"
	"sync"
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

// Position returns the current byte position in the output stream
func (e *BitStreamEncoder) Position() int {
	if e.bitOffset > 0 {
		return len(e.bytes) + 1
	}
	return len(e.bytes)
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

// Reset resets the decoder to read from new data, allowing reuse
func (d *BitStreamDecoder) Reset(bytes []byte, bitOrder BitOrder) {
	d.bytes = bytes
	d.byteOffset = 0
	d.bitOffset = 0
	d.bitOrder = bitOrder
	d.LastErrorCode = nil
}

// Decoder pools for different bit orders
var (
	decoderPoolMSB = sync.Pool{
		New: func() interface{} {
			return &BitStreamDecoder{bitOrder: MSBFirst}
		},
	}
	decoderPoolLSB = sync.Pool{
		New: func() interface{} {
			return &BitStreamDecoder{bitOrder: LSBFirst}
		},
	}
)

// AcquireDecoder gets a decoder from the pool
func AcquireDecoder(bytes []byte, bitOrder BitOrder) *BitStreamDecoder {
	var d *BitStreamDecoder
	if bitOrder == MSBFirst {
		d = decoderPoolMSB.Get().(*BitStreamDecoder)
	} else {
		d = decoderPoolLSB.Get().(*BitStreamDecoder)
	}
	d.Reset(bytes, bitOrder)
	return d
}

// ReleaseDecoder returns a decoder to the pool
func ReleaseDecoder(d *BitStreamDecoder) {
	if d == nil {
		return
	}
	d.bytes = nil // Allow GC of the byte slice
	if d.bitOrder == MSBFirst {
		decoderPoolMSB.Put(d)
	} else {
		decoderPoolLSB.Put(d)
	}
}

// Position returns the current byte offset
func (d *BitStreamDecoder) Position() int {
	return d.byteOffset
}

// SkipBytes skips the specified number of bytes
func (d *BitStreamDecoder) SkipBytes(n int) {
	d.byteOffset += n
}

// Seek sets the current byte offset to an absolute position
func (d *BitStreamDecoder) Seek(offset int) {
	d.byteOffset = offset
	d.bitOffset = 0 // Reset bit offset when seeking
}

// Len returns the total length of the underlying byte slice
func (d *BitStreamDecoder) Len() int {
	return len(d.bytes)
}

// Bytes returns the underlying byte slice (for calculating EOF-relative positions)
func (d *BitStreamDecoder) Bytes() []byte {
	return d.bytes
}

// ReadBytesSlice returns a slice of the input buffer without copying.
// Only valid when byte-aligned. The returned slice references the decoder's
// input data and is only valid as long as that data is alive.
func (d *BitStreamDecoder) ReadBytesSlice(n int) ([]byte, error) {
	if d.bitOffset != 0 {
		return nil, errors.New("ReadBytesSlice requires byte alignment")
	}
	if d.byteOffset+n > len(d.bytes) {
		errCode := "INCOMPLETE_DATA"
		d.LastErrorCode = &errCode
		return nil, errors.New("unexpected end of stream")
	}
	slice := d.bytes[d.byteOffset : d.byteOffset+n]
	d.byteOffset += n
	d.LastErrorCode = nil
	return slice, nil
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
		bit, err := d.ReadBit()
		if err != nil {
			return 0, err
		}
		result |= bit << i
	}
	d.LastErrorCode = nil
	return result, nil
}

// ReadBit reads a single bit
func (d *BitStreamDecoder) ReadBit() (uint8, error) {
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

// ReadBits reads numBits and returns the value respecting bit order setting
// MSB first: First bit read is the MSB of the value
// LSB first: First bit read is the LSB of the value
func (d *BitStreamDecoder) ReadBits(numBits int) (uint64, error) {
	// Fast path: MSB-first reads of <=8 bits
	if d.bitOrder == MSBFirst && numBits <= 8 && numBits > 0 {
		if d.byteOffset >= len(d.bytes) {
			errCode := "INCOMPLETE_DATA"
			d.LastErrorCode = &errCode
			return 0, errors.New("unexpected end of stream")
		}
		bitsAvailable := 8 - d.bitOffset
		if numBits <= bitsAvailable {
			// All bits from current byte — single shift+mask
			shift := bitsAvailable - numBits
			mask := uint8((1 << numBits) - 1)
			result := uint64((d.bytes[d.byteOffset] >> shift) & mask)
			d.bitOffset += numBits
			if d.bitOffset == 8 {
				d.bitOffset = 0
				d.byteOffset++
			}
			d.LastErrorCode = nil
			return result, nil
		}
		// Cross byte boundary — read from two bytes
		if d.byteOffset+1 >= len(d.bytes) {
			errCode := "INCOMPLETE_DATA"
			d.LastErrorCode = &errCode
			return 0, errors.New("unexpected end of stream")
		}
		// Bits from current byte (high bits of result)
		bitsFromFirst := bitsAvailable
		bitsFromSecond := numBits - bitsFromFirst
		maskFirst := uint8((1 << bitsFromFirst) - 1)
		highPart := uint64(d.bytes[d.byteOffset]&maskFirst) << bitsFromSecond
		// Bits from next byte (low bits of result)
		shift := 8 - bitsFromSecond
		maskSecond := uint8((1 << bitsFromSecond) - 1)
		lowPart := uint64((d.bytes[d.byteOffset+1] >> shift) & maskSecond)
		d.byteOffset++
		d.bitOffset = bitsFromSecond
		if d.bitOffset == 8 {
			d.bitOffset = 0
			d.byteOffset++
		}
		d.LastErrorCode = nil
		return highPart | lowPart, nil
	}

	var result uint64
	if d.bitOrder == LSBFirst {
		// LSB first: first bit read is bit 0 of result
		for i := 0; i < numBits; i++ {
			bit, err := d.ReadBit()
			if err != nil {
				return 0, err
			}
			result |= uint64(bit) << i
		}
	} else {
		// MSB first: first bit read is bit (numBits-1) of result
		for i := numBits - 1; i >= 0; i-- {
			bit, err := d.ReadBit()
			if err != nil {
				return 0, err
			}
			result |= uint64(bit) << i
		}
	}
	d.LastErrorCode = nil
	return result, nil
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
			e.WriteBit(bit)
		}
	}
}

// WriteBytes writes a slice of bytes to the encoder
func (e *BitStreamEncoder) WriteBytes(data []byte) {
	if e.bitOffset == 0 {
		// Byte-aligned: append directly
		e.bytes = append(e.bytes, data...)
	} else {
		// Not byte-aligned: write byte by byte
		for _, b := range data {
			e.WriteUint8(b)
		}
	}
}

// WriteBit writes a single bit
func (e *BitStreamEncoder) WriteBit(bit uint8) {
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

// WriteBits writes numBits from value respecting bit order setting
// MSB first: Write MSB of value first (video codecs, network protocols)
// LSB first: Write LSB of value first (hardware bitfields)
func (e *BitStreamEncoder) WriteBits(value uint64, numBits int) {
	// Fast path: MSB-first writes of <=8 bits that fit in current byte
	if e.bitOrder == MSBFirst && numBits <= 8 && numBits > 0 {
		bitsAvailable := 8 - e.bitOffset
		if numBits <= bitsAvailable {
			// All bits fit in current byte
			shift := bitsAvailable - numBits
			mask := uint8((1 << numBits) - 1)
			e.currentByte |= (uint8(value) & mask) << shift
			e.bitOffset += numBits
			e.totalBitsWritten += numBits
			if e.bitOffset == 8 {
				e.bytes = append(e.bytes, e.currentByte)
				e.currentByte = 0
				e.bitOffset = 0
			}
			return
		}
	}

	if e.bitOrder == LSBFirst {
		for i := 0; i < numBits; i++ {
			bit := uint8((value >> i) & 1)
			e.WriteBit(bit)
		}
	} else {
		for i := numBits - 1; i >= 0; i-- {
			bit := uint8((value >> i) & 1)
			e.WriteBit(bit)
		}
	}
}

// ReadUint16 reads a 16-bit unsigned integer
func (d *BitStreamDecoder) ReadUint16(endianness Endianness) (uint16, error) {
	if d.bitOffset == 0 {
		if d.byteOffset+2 > len(d.bytes) {
			errCode := "INCOMPLETE_DATA"
			d.LastErrorCode = &errCode
			return 0, errors.New("unexpected end of stream")
		}
		var v uint16
		if endianness == BigEndian {
			v = binary.BigEndian.Uint16(d.bytes[d.byteOffset:])
		} else {
			v = binary.LittleEndian.Uint16(d.bytes[d.byteOffset:])
		}
		d.byteOffset += 2
		d.LastErrorCode = nil
		return v, nil
	}

	// Not byte-aligned: fallback to byte-at-a-time
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
	if d.bitOffset == 0 {
		if d.byteOffset+4 > len(d.bytes) {
			errCode := "INCOMPLETE_DATA"
			d.LastErrorCode = &errCode
			return 0, errors.New("unexpected end of stream")
		}
		var v uint32
		if endianness == BigEndian {
			v = binary.BigEndian.Uint32(d.bytes[d.byteOffset:])
		} else {
			v = binary.LittleEndian.Uint32(d.bytes[d.byteOffset:])
		}
		d.byteOffset += 4
		d.LastErrorCode = nil
		return v, nil
	}

	// Not byte-aligned: fallback to byte-at-a-time
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
	if d.bitOffset == 0 {
		if d.byteOffset+8 > len(d.bytes) {
			errCode := "INCOMPLETE_DATA"
			d.LastErrorCode = &errCode
			return 0, errors.New("unexpected end of stream")
		}
		var v uint64
		if endianness == BigEndian {
			v = binary.BigEndian.Uint64(d.bytes[d.byteOffset:])
		} else {
			v = binary.LittleEndian.Uint64(d.bytes[d.byteOffset:])
		}
		d.byteOffset += 8
		d.LastErrorCode = nil
		return v, nil
	}

	// Not byte-aligned: fallback to byte-at-a-time
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

// PeekUint8 reads an 8-bit unsigned integer without advancing the stream position
func (d *BitStreamDecoder) PeekUint8() (uint8, error) {
	savedByteOffset := d.byteOffset
	savedBitOffset := d.bitOffset
	val, err := d.ReadUint8()
	d.byteOffset = savedByteOffset
	d.bitOffset = savedBitOffset
	return val, err
}

// PeekUint16 reads a 16-bit unsigned integer without advancing the stream position
func (d *BitStreamDecoder) PeekUint16(endianness Endianness) (uint16, error) {
	savedByteOffset := d.byteOffset
	savedBitOffset := d.bitOffset
	val, err := d.ReadUint16(endianness)
	d.byteOffset = savedByteOffset
	d.bitOffset = savedBitOffset
	return val, err
}

// PeekUint32 reads a 32-bit unsigned integer without advancing the stream position
func (d *BitStreamDecoder) PeekUint32(endianness Endianness) (uint32, error) {
	savedByteOffset := d.byteOffset
	savedBitOffset := d.bitOffset
	val, err := d.ReadUint32(endianness)
	d.byteOffset = savedByteOffset
	d.bitOffset = savedBitOffset
	return val, err
}

// PeekUint64 reads a 64-bit unsigned integer without advancing the stream position
func (d *BitStreamDecoder) PeekUint64(endianness Endianness) (uint64, error) {
	savedByteOffset := d.byteOffset
	savedBitOffset := d.bitOffset
	val, err := d.ReadUint64(endianness)
	d.byteOffset = savedByteOffset
	d.bitOffset = savedBitOffset
	return val, err
}

// ReadInt8 reads an 8-bit signed integer (two's complement)
func (d *BitStreamDecoder) ReadInt8() (int8, error) {
	unsigned, err := d.ReadUint8()
	if err != nil {
		return 0, err
	}
	d.LastErrorCode = nil
	return int8(unsigned), nil
}

// ReadInt16 reads a 16-bit signed integer (two's complement)
func (d *BitStreamDecoder) ReadInt16(endianness Endianness) (int16, error) {
	unsigned, err := d.ReadUint16(endianness)
	if err != nil {
		return 0, err
	}
	d.LastErrorCode = nil
	return int16(unsigned), nil
}

// ReadInt32 reads a 32-bit signed integer (two's complement)
func (d *BitStreamDecoder) ReadInt32(endianness Endianness) (int32, error) {
	unsigned, err := d.ReadUint32(endianness)
	if err != nil {
		return 0, err
	}
	d.LastErrorCode = nil
	return int32(unsigned), nil
}

// ReadInt64 reads a 64-bit signed integer (two's complement)
func (d *BitStreamDecoder) ReadInt64(endianness Endianness) (int64, error) {
	unsigned, err := d.ReadUint64(endianness)
	if err != nil {
		return 0, err
	}
	d.LastErrorCode = nil
	return int64(unsigned), nil
}

// WriteUint16 writes a 16-bit unsigned integer
func (e *BitStreamEncoder) WriteUint16(value uint16, endianness Endianness) {
	if e.bitOffset == 0 {
		var buf [2]byte
		if endianness == BigEndian {
			binary.BigEndian.PutUint16(buf[:], value)
		} else {
			binary.LittleEndian.PutUint16(buf[:], value)
		}
		e.bytes = append(e.bytes, buf[:]...)
		return
	}
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
	if e.bitOffset == 0 {
		var buf [4]byte
		if endianness == BigEndian {
			binary.BigEndian.PutUint32(buf[:], value)
		} else {
			binary.LittleEndian.PutUint32(buf[:], value)
		}
		e.bytes = append(e.bytes, buf[:]...)
		return
	}
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
	if e.bitOffset == 0 {
		var buf [8]byte
		if endianness == BigEndian {
			binary.BigEndian.PutUint64(buf[:], value)
		} else {
			binary.LittleEndian.PutUint64(buf[:], value)
		}
		e.bytes = append(e.bytes, buf[:]...)
		return
	}
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
	e.WriteUint8(uint8(value))
}

// WriteInt16 writes a 16-bit signed integer (two's complement)
func (e *BitStreamEncoder) WriteInt16(value int16, endianness Endianness) {
	e.WriteUint16(uint16(value), endianness)
}

// WriteInt32 writes a 32-bit signed integer (two's complement)
func (e *BitStreamEncoder) WriteInt32(value int32, endianness Endianness) {
	e.WriteUint32(uint32(value), endianness)
}

// WriteInt64 writes a 64-bit signed integer (two's complement)
func (e *BitStreamEncoder) WriteInt64(value int64, endianness Endianness) {
	e.WriteUint64(uint64(value), endianness)
}

// ReadFloat32 reads a 32-bit IEEE 754 float
func (d *BitStreamDecoder) ReadFloat32(endianness Endianness) (float32, error) {
	bits, err := d.ReadUint32(endianness)
	if err != nil {
		return 0, err
	}
	return math.Float32frombits(bits), nil
}

// ReadFloat64 reads a 64-bit IEEE 754 float
func (d *BitStreamDecoder) ReadFloat64(endianness Endianness) (float64, error) {
	bits, err := d.ReadUint64(endianness)
	if err != nil {
		return 0, err
	}
	return math.Float64frombits(bits), nil
}

// WriteFloat32 writes a 32-bit IEEE 754 float
func (e *BitStreamEncoder) WriteFloat32(value float32, endianness Endianness) {
	e.WriteUint32(math.Float32bits(value), endianness)
}

// WriteFloat64 writes a 64-bit IEEE 754 float
func (e *BitStreamEncoder) WriteFloat64(value float64, endianness Endianness) {
	e.WriteUint64(math.Float64bits(value), endianness)
}

// WriteVarlengthDER writes a variable-length integer using DER encoding
func (e *BitStreamEncoder) WriteVarlengthDER(value uint64) {
	if value < 128 {
		e.WriteUint8(uint8(value))
		return
	}
	numBytes := 0
	temp := value
	for temp > 0 {
		numBytes++
		temp >>= 8
	}
	e.WriteUint8(uint8(0x80 | numBytes))
	for i := numBytes - 1; i >= 0; i-- {
		e.WriteUint8(uint8((value >> (i * 8)) & 0xFF))
	}
}

// VarlengthDERSize calculates the encoded size of a DER variable-length integer
func VarlengthDERSize(value uint64) int {
	if value < 128 {
		return 1
	}
	numBytes := 0
	temp := value
	for temp > 0 {
		numBytes++
		temp >>= 8
	}
	return 1 + numBytes
}

// WriteVarlengthLEB128 writes a variable-length integer using LEB128 encoding
func (e *BitStreamEncoder) WriteVarlengthLEB128(value uint64) {
	for {
		b := uint8(value & 0x7F)
		value >>= 7
		if value != 0 {
			b |= 0x80
		}
		e.WriteUint8(b)
		if value == 0 {
			break
		}
	}
}

// WriteVarlengthEBML writes a variable-length integer using EBML VINT encoding
func (e *BitStreamEncoder) WriteVarlengthEBML(value uint64) {
	width := 1
	maxVal := uint64((1 << 7) - 2)
	for value > maxVal && width < 8 {
		width++
		maxVal = uint64((1 << (width * 7)) - 2)
	}
	markerBit := uint64(1) << (width * 7)
	encoded := markerBit | value
	for i := width - 1; i >= 0; i-- {
		e.WriteUint8(uint8((encoded >> (i * 8)) & 0xFF))
	}
}

// WriteVarlengthVLQ writes a variable-length integer using VLQ encoding (MIDI style)
func (e *BitStreamEncoder) WriteVarlengthVLQ(value uint64) {
	var bytes [4]uint8
	numBytes := 0
	bytes[numBytes] = uint8(value & 0x7F)
	numBytes++
	value >>= 7
	for value > 0 && numBytes < 4 {
		bytes[numBytes] = uint8((value & 0x7F) | 0x80)
		numBytes++
		value >>= 7
	}
	for i := numBytes - 1; i >= 0; i-- {
		e.WriteUint8(bytes[i])
	}
}

// ReadVarlengthDER reads a variable-length integer using DER encoding
func (d *BitStreamDecoder) ReadVarlengthDER() (uint64, error) {
	firstByte, err := d.ReadUint8()
	if err != nil {
		return 0, err
	}
	if firstByte < 0x80 {
		return uint64(firstByte), nil
	}
	numBytes := int(firstByte & 0x7F)
	if numBytes == 0 {
		return 0, fmt.Errorf("DER indefinite length (0x80) not supported")
	}
	if numBytes > 8 {
		return 0, fmt.Errorf("DER length too large: %d bytes (max 8 supported)", numBytes)
	}
	var value uint64
	for i := 0; i < numBytes; i++ {
		b, err := d.ReadUint8()
		if err != nil {
			return 0, err
		}
		value = (value << 8) | uint64(b)
	}
	return value, nil
}

// ReadVarlengthLEB128 reads a variable-length integer using LEB128 encoding
func (d *BitStreamDecoder) ReadVarlengthLEB128() (uint64, error) {
	var result uint64
	var shift uint
	for {
		b, err := d.ReadUint8()
		if err != nil {
			return 0, err
		}
		value := uint64(b & 0x7F)
		result |= value << shift
		shift += 7
		if (b & 0x80) == 0 {
			break
		}
		if shift > 64 {
			return 0, fmt.Errorf("LEB128 value too large (exceeds 64 bits)")
		}
	}
	return result, nil
}

// ReadVarlengthEBML reads a variable-length integer using EBML VINT encoding
func (d *BitStreamDecoder) ReadVarlengthEBML() (uint64, error) {
	firstByte, err := d.ReadUint8()
	if err != nil {
		return 0, err
	}
	width := 1
	mask := uint8(0x80)
	for width <= 8 && (firstByte&mask) == 0 {
		width++
		mask >>= 1
	}
	if width > 8 {
		return 0, fmt.Errorf("EBML VINT: no marker bit found in first byte")
	}
	value := uint64(firstByte & (mask - 1))
	for i := 1; i < width; i++ {
		b, err := d.ReadUint8()
		if err != nil {
			return 0, err
		}
		value = (value << 8) | uint64(b)
	}
	return value, nil
}

// ReadVarlengthVLQ reads a variable-length integer using VLQ encoding (MIDI style)
func (d *BitStreamDecoder) ReadVarlengthVLQ() (uint64, error) {
	var result uint64
	bytesRead := 0
	for {
		if bytesRead >= 4 {
			return 0, fmt.Errorf("VLQ value too large (exceeds 4 bytes)")
		}
		b, err := d.ReadUint8()
		if err != nil {
			return 0, err
		}
		bytesRead++
		result = (result << 7) | uint64(b&0x7F)
		if (b & 0x80) == 0 {
			break
		}
	}
	return result, nil
}

// CRC32 computes the CRC32 checksum (IEEE polynomial) of the given data.
func CRC32(data []byte) uint32 {
	return crc32.ChecksumIEEE(data)
}
