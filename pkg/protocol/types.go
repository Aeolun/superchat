package protocol

import (
	"encoding/binary"
	"errors"
	"io"
	"time"
)

var (
	ErrStringTooLong = errors.New("string exceeds maximum length (65535 bytes)")
	ErrInvalidUTF8   = errors.New("invalid UTF-8 string")
)

// WriteUint8 writes a single byte
func WriteUint8(w io.Writer, v uint8) error {
	_, err := w.Write([]byte{v})
	return err
}

// ReadUint8 reads a single byte
func ReadUint8(r io.Reader) (uint8, error) {
	buf := make([]byte, 1)
	if _, err := io.ReadFull(r, buf); err != nil {
		return 0, err
	}
	return buf[0], nil
}

// WriteUint16 writes a 16-bit unsigned integer in big-endian
func WriteUint16(w io.Writer, v uint16) error {
	buf := make([]byte, 2)
	binary.BigEndian.PutUint16(buf, v)
	_, err := w.Write(buf)
	return err
}

// ReadUint16 reads a 16-bit unsigned integer in big-endian
func ReadUint16(r io.Reader) (uint16, error) {
	buf := make([]byte, 2)
	if _, err := io.ReadFull(r, buf); err != nil {
		return 0, err
	}
	return binary.BigEndian.Uint16(buf), nil
}

// WriteUint32 writes a 32-bit unsigned integer in big-endian
func WriteUint32(w io.Writer, v uint32) error {
	buf := make([]byte, 4)
	binary.BigEndian.PutUint32(buf, v)
	_, err := w.Write(buf)
	return err
}

// ReadUint32 reads a 32-bit unsigned integer in big-endian
func ReadUint32(r io.Reader) (uint32, error) {
	buf := make([]byte, 4)
	if _, err := io.ReadFull(r, buf); err != nil {
		return 0, err
	}
	return binary.BigEndian.Uint32(buf), nil
}

// WriteUint64 writes a 64-bit unsigned integer in big-endian
func WriteUint64(w io.Writer, v uint64) error {
	buf := make([]byte, 8)
	binary.BigEndian.PutUint64(buf, v)
	_, err := w.Write(buf)
	return err
}

// ReadUint64 reads a 64-bit unsigned integer in big-endian
func ReadUint64(r io.Reader) (uint64, error) {
	buf := make([]byte, 8)
	if _, err := io.ReadFull(r, buf); err != nil {
		return 0, err
	}
	return binary.BigEndian.Uint64(buf), nil
}

// WriteInt64 writes a 64-bit signed integer in big-endian
func WriteInt64(w io.Writer, v int64) error {
	return WriteUint64(w, uint64(v))
}

// ReadInt64 reads a 64-bit signed integer in big-endian
func ReadInt64(r io.Reader) (int64, error) {
	v, err := ReadUint64(r)
	return int64(v), err
}

// WriteBool writes a boolean as a single byte (0x00 or 0x01)
func WriteBool(w io.Writer, v bool) error {
	if v {
		return WriteUint8(w, 0x01)
	}
	return WriteUint8(w, 0x00)
}

// ReadBool reads a boolean from a single byte
func ReadBool(r io.Reader) (bool, error) {
	b, err := ReadUint8(r)
	if err != nil {
		return false, err
	}
	return b != 0x00, nil
}

// WriteString writes a length-prefixed UTF-8 string
// Format: [Length (uint16)][Data (N bytes UTF-8)]
func WriteString(w io.Writer, s string) error {
	data := []byte(s)
	if len(data) > 65535 {
		return ErrStringTooLong
	}

	if err := WriteUint16(w, uint16(len(data))); err != nil {
		return err
	}

	if len(data) > 0 {
		_, err := w.Write(data)
		return err
	}
	return nil
}

// ReadString reads a length-prefixed UTF-8 string
func ReadString(r io.Reader) (string, error) {
	length, err := ReadUint16(r)
	if err != nil {
		return "", err
	}

	if length == 0 {
		return "", nil
	}

	data := make([]byte, length)
	if _, err := io.ReadFull(r, data); err != nil {
		return "", err
	}

	return string(data), nil
}

// WriteTimestamp writes a Unix timestamp in milliseconds (int64)
func WriteTimestamp(w io.Writer, t time.Time) error {
	millis := t.UnixMilli()
	return WriteInt64(w, millis)
}

// ReadTimestamp reads a Unix timestamp in milliseconds and returns a time.Time
func ReadTimestamp(r io.Reader) (time.Time, error) {
	millis, err := ReadInt64(r)
	if err != nil {
		return time.Time{}, err
	}
	return time.UnixMilli(millis), nil
}

// WriteOptionalUint64 writes an optional 64-bit unsigned integer
// Format: [Present (bool)][Value (uint64) if present]
func WriteOptionalUint64(w io.Writer, v *uint64) error {
	if v == nil {
		return WriteBool(w, false)
	}

	if err := WriteBool(w, true); err != nil {
		return err
	}
	return WriteUint64(w, *v)
}

// ReadOptionalUint64 reads an optional 64-bit unsigned integer
func ReadOptionalUint64(r io.Reader) (*uint64, error) {
	present, err := ReadBool(r)
	if err != nil {
		return nil, err
	}

	if !present {
		return nil, nil
	}

	value, err := ReadUint64(r)
	if err != nil {
		return nil, err
	}
	return &value, nil
}

// WriteOptionalTimestamp writes an optional timestamp
// Format: [Present (bool)][Timestamp (int64) if present]
func WriteOptionalTimestamp(w io.Writer, t *time.Time) error {
	if t == nil {
		return WriteBool(w, false)
	}

	if err := WriteBool(w, true); err != nil {
		return err
	}
	return WriteTimestamp(w, *t)
}

// ReadOptionalTimestamp reads an optional timestamp
func ReadOptionalTimestamp(r io.Reader) (*time.Time, error) {
	present, err := ReadBool(r)
	if err != nil {
		return nil, err
	}

	if !present {
		return nil, nil
	}

	value, err := ReadTimestamp(r)
	if err != nil {
		return nil, err
	}
	return &value, nil
}
