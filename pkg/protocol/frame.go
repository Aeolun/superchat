package protocol

import (
	"bytes"
	"errors"
	"io"
)

const (
	// MaxFrameSize is the maximum allowed frame size (1 MB)
	MaxFrameSize = 1024 * 1024

	// ProtocolVersion is the current protocol version
	ProtocolVersion = 1
)

// Flag constants
const (
	FlagCompressed = 0x01 // Bit 0: compression
	FlagEncrypted  = 0x02 // Bit 1: encryption
)

var (
	ErrFrameTooLarge      = errors.New("frame exceeds maximum size (1 MB)")
	ErrInvalidVersion     = errors.New("invalid protocol version")
	ErrInvalidFrameLength = errors.New("invalid frame length")
)

// Frame represents a protocol frame
// Format: [Length (4 bytes)][Version (1 byte)][Type (1 byte)][Flags (1 byte)][Payload (N bytes)]
type Frame struct {
	Version uint8  // Protocol version (currently 1)
	Type    uint8  // Message type
	Flags   uint8  // Flags byte (compression, encryption, etc.)
	Payload []byte // Message payload
}

// EncodeFrame writes a frame to the writer
func EncodeFrame(w io.Writer, f *Frame) error {
	// Calculate length: Version (1) + Type (1) + Flags (1) + Payload (N)
	length := uint32(1 + 1 + 1 + len(f.Payload))

	// Check max frame size (excluding the 4-byte length field itself)
	if length > MaxFrameSize {
		return ErrFrameTooLarge
	}

	// Write length (4 bytes, big-endian)
	if err := WriteUint32(w, length); err != nil {
		return err
	}

	// Write version (1 byte)
	if err := WriteUint8(w, f.Version); err != nil {
		return err
	}

	// Write type (1 byte)
	if err := WriteUint8(w, f.Type); err != nil {
		return err
	}

	// Write flags (1 byte)
	if err := WriteUint8(w, f.Flags); err != nil {
		return err
	}

	// Write payload
	if len(f.Payload) > 0 {
		_, err := w.Write(f.Payload)
		return err
	}

	return nil
}

// DecodeFrame reads a frame from the reader
func DecodeFrame(r io.Reader) (*Frame, error) {
	// Read length (4 bytes)
	length, err := ReadUint32(r)
	if err != nil {
		return nil, err
	}

	// Validate length
	if length > MaxFrameSize {
		return nil, ErrFrameTooLarge
	}

	// Length must be at least 3 (version + type + flags)
	if length < 3 {
		return nil, ErrInvalidFrameLength
	}

	// Read version (1 byte)
	version, err := ReadUint8(r)
	if err != nil {
		return nil, err
	}

	// Read type (1 byte)
	msgType, err := ReadUint8(r)
	if err != nil {
		return nil, err
	}

	// Read flags (1 byte)
	flags, err := ReadUint8(r)
	if err != nil {
		return nil, err
	}

	// Read payload (remaining bytes)
	payloadLen := length - 3 // Subtract version, type, flags
	payload := make([]byte, payloadLen)
	if payloadLen > 0 {
		if _, err := io.ReadFull(r, payload); err != nil {
			return nil, err
		}
	}

	return &Frame{
		Version: version,
		Type:    msgType,
		Flags:   flags,
		Payload: payload,
	}, nil
}

// EncodeMessage is a helper that encodes a message to a byte slice
func EncodeMessage(version, msgType uint8, flags uint8, payload []byte) ([]byte, error) {
	frame := &Frame{
		Version: version,
		Type:    msgType,
		Flags:   flags,
		Payload: payload,
	}

	buf := new(bytes.Buffer)
	if err := EncodeFrame(buf, frame); err != nil {
		return nil, err
	}

	return buf.Bytes(), nil
}

// DecodeMessage is a helper that decodes a frame from a byte slice
func DecodeMessage(data []byte) (*Frame, error) {
	buf := bytes.NewReader(data)
	return DecodeFrame(buf)
}
