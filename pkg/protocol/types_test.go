package protocol

import (
	"bytes"
	"testing"
	"time"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestWriteReadUint8(t *testing.T) {
	tests := []struct {
		name  string
		value uint8
	}{
		{"zero", 0},
		{"one", 1},
		{"max", 255},
		{"mid", 128},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			buf := new(bytes.Buffer)

			err := WriteUint8(buf, tt.value)
			require.NoError(t, err)

			result, err := ReadUint8(buf)
			require.NoError(t, err)
			assert.Equal(t, tt.value, result)
		})
	}
}

func TestWriteReadUint16(t *testing.T) {
	tests := []struct {
		name  string
		value uint16
	}{
		{"zero", 0},
		{"one", 1},
		{"max", 65535},
		{"mid", 32768},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			buf := new(bytes.Buffer)

			err := WriteUint16(buf, tt.value)
			require.NoError(t, err)

			result, err := ReadUint16(buf)
			require.NoError(t, err)
			assert.Equal(t, tt.value, result)
		})
	}
}

func TestWriteReadUint32(t *testing.T) {
	tests := []struct {
		name  string
		value uint32
	}{
		{"zero", 0},
		{"one", 1},
		{"max", 4294967295},
		{"mid", 2147483648},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			buf := new(bytes.Buffer)

			err := WriteUint32(buf, tt.value)
			require.NoError(t, err)

			result, err := ReadUint32(buf)
			require.NoError(t, err)
			assert.Equal(t, tt.value, result)
		})
	}
}

func TestWriteReadUint64(t *testing.T) {
	tests := []struct {
		name  string
		value uint64
	}{
		{"zero", 0},
		{"one", 1},
		{"max", 18446744073709551615},
		{"mid", 9223372036854775808},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			buf := new(bytes.Buffer)

			err := WriteUint64(buf, tt.value)
			require.NoError(t, err)

			result, err := ReadUint64(buf)
			require.NoError(t, err)
			assert.Equal(t, tt.value, result)
		})
	}
}

func TestWriteReadInt64(t *testing.T) {
	tests := []struct {
		name  string
		value int64
	}{
		{"zero", 0},
		{"positive", 12345},
		{"negative", -12345},
		{"max", 9223372036854775807},
		{"min", -9223372036854775808},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			buf := new(bytes.Buffer)

			err := WriteInt64(buf, tt.value)
			require.NoError(t, err)

			result, err := ReadInt64(buf)
			require.NoError(t, err)
			assert.Equal(t, tt.value, result)
		})
	}
}

func TestWriteReadBool(t *testing.T) {
	tests := []struct {
		name  string
		value bool
	}{
		{"true", true},
		{"false", false},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			buf := new(bytes.Buffer)

			err := WriteBool(buf, tt.value)
			require.NoError(t, err)

			result, err := ReadBool(buf)
			require.NoError(t, err)
			assert.Equal(t, tt.value, result)
		})
	}
}

func TestWriteReadString(t *testing.T) {
	tests := []struct {
		name    string
		value   string
		wantErr bool
	}{
		{"empty", "", false},
		{"short", "hello", false},
		{"long", "Hello, 世界! 👋", false},
		{"max length", string(make([]byte, 65535)), false},
		{"too long", string(make([]byte, 65536)), true},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			buf := new(bytes.Buffer)

			err := WriteString(buf, tt.value)
			if tt.wantErr {
				assert.Error(t, err)
				assert.Equal(t, ErrStringTooLong, err)
				return
			}
			require.NoError(t, err)

			result, err := ReadString(buf)
			require.NoError(t, err)
			assert.Equal(t, tt.value, result)
		})
	}
}

func TestWriteReadTimestamp(t *testing.T) {
	tests := []struct {
		name  string
		value time.Time
	}{
		{"now", time.Now()},
		{"zero", time.Time{}},
		{"future", time.Now().Add(24 * time.Hour)},
		{"past", time.Now().Add(-24 * time.Hour)},
		{"unix epoch", time.Unix(0, 0)},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			buf := new(bytes.Buffer)

			err := WriteTimestamp(buf, tt.value)
			require.NoError(t, err)

			result, err := ReadTimestamp(buf)
			require.NoError(t, err)

			// Timestamps are in milliseconds, so allow 1ms tolerance
			assert.InDelta(t, tt.value.UnixMilli(), result.UnixMilli(), 1)
		})
	}
}

func TestWriteReadOptionalUint64(t *testing.T) {
	t.Run("nil value", func(t *testing.T) {
		buf := new(bytes.Buffer)

		err := WriteOptionalUint64(buf, nil)
		require.NoError(t, err)

		result, err := ReadOptionalUint64(buf)
		require.NoError(t, err)
		assert.Nil(t, result)
	})

	t.Run("present value", func(t *testing.T) {
		buf := new(bytes.Buffer)
		value := uint64(12345)

		err := WriteOptionalUint64(buf, &value)
		require.NoError(t, err)

		result, err := ReadOptionalUint64(buf)
		require.NoError(t, err)
		require.NotNil(t, result)
		assert.Equal(t, value, *result)
	})

	t.Run("zero value", func(t *testing.T) {
		buf := new(bytes.Buffer)
		value := uint64(0)

		err := WriteOptionalUint64(buf, &value)
		require.NoError(t, err)

		result, err := ReadOptionalUint64(buf)
		require.NoError(t, err)
		require.NotNil(t, result)
		assert.Equal(t, value, *result)
	})
}

func TestWriteReadOptionalTimestamp(t *testing.T) {
	t.Run("nil value", func(t *testing.T) {
		buf := new(bytes.Buffer)

		err := WriteOptionalTimestamp(buf, nil)
		require.NoError(t, err)

		result, err := ReadOptionalTimestamp(buf)
		require.NoError(t, err)
		assert.Nil(t, result)
	})

	t.Run("present value", func(t *testing.T) {
		buf := new(bytes.Buffer)
		value := time.Now()

		err := WriteOptionalTimestamp(buf, &value)
		require.NoError(t, err)

		result, err := ReadOptionalTimestamp(buf)
		require.NoError(t, err)
		require.NotNil(t, result)
		assert.InDelta(t, value.UnixMilli(), result.UnixMilli(), 1)
	})
}

// Test error cases for Read functions
func TestReadErrors(t *testing.T) {
	t.Run("ReadUint8 EOF", func(t *testing.T) {
		buf := bytes.NewReader([]byte{})
		_, err := ReadUint8(buf)
		assert.Error(t, err)
	})

	t.Run("ReadUint16 partial", func(t *testing.T) {
		buf := bytes.NewReader([]byte{0x01}) // Only 1 byte instead of 2
		_, err := ReadUint16(buf)
		assert.Error(t, err)
	})

	t.Run("ReadUint32 partial", func(t *testing.T) {
		buf := bytes.NewReader([]byte{0x01, 0x02}) // Only 2 bytes instead of 4
		_, err := ReadUint32(buf)
		assert.Error(t, err)
	})

	t.Run("ReadUint64 partial", func(t *testing.T) {
		buf := bytes.NewReader([]byte{0x01, 0x02, 0x03, 0x04}) // Only 4 bytes instead of 8
		_, err := ReadUint64(buf)
		assert.Error(t, err)
	})

	t.Run("ReadString length error", func(t *testing.T) {
		buf := bytes.NewReader([]byte{0x00}) // Incomplete length field
		_, err := ReadString(buf)
		assert.Error(t, err)
	})

	t.Run("ReadString data error", func(t *testing.T) {
		buf := bytes.NewReader([]byte{0x00, 0x05, 0x41, 0x42}) // Length=5 but only 2 bytes of data
		_, err := ReadString(buf)
		assert.Error(t, err)
	})

	t.Run("ReadTimestamp error", func(t *testing.T) {
		buf := bytes.NewReader([]byte{0x01, 0x02}) // Incomplete int64
		_, err := ReadTimestamp(buf)
		assert.Error(t, err)
	})

	t.Run("ReadOptionalUint64 bool error", func(t *testing.T) {
		buf := bytes.NewReader([]byte{}) // Empty
		_, err := ReadOptionalUint64(buf)
		assert.Error(t, err)
	})

	t.Run("ReadOptionalUint64 value error", func(t *testing.T) {
		buf := bytes.NewReader([]byte{0x01, 0x00, 0x00}) // Present but incomplete value
		_, err := ReadOptionalUint64(buf)
		assert.Error(t, err)
	})

	t.Run("ReadOptionalTimestamp bool error", func(t *testing.T) {
		buf := bytes.NewReader([]byte{}) // Empty
		_, err := ReadOptionalTimestamp(buf)
		assert.Error(t, err)
	})

	t.Run("ReadOptionalTimestamp value error", func(t *testing.T) {
		buf := bytes.NewReader([]byte{0x01, 0x00, 0x00}) // Present but incomplete timestamp
		_, err := ReadOptionalTimestamp(buf)
		assert.Error(t, err)
	})
}

// Test big-endian encoding
func TestBigEndianEncoding(t *testing.T) {
	t.Run("Uint16 big-endian", func(t *testing.T) {
		buf := new(bytes.Buffer)
		err := WriteUint16(buf, 0x0102)
		require.NoError(t, err)

		bytes := buf.Bytes()
		assert.Equal(t, byte(0x01), bytes[0]) // High byte first
		assert.Equal(t, byte(0x02), bytes[1]) // Low byte second
	})

	t.Run("Uint32 big-endian", func(t *testing.T) {
		buf := new(bytes.Buffer)
		err := WriteUint32(buf, 0x01020304)
		require.NoError(t, err)

		bytes := buf.Bytes()
		assert.Equal(t, byte(0x01), bytes[0])
		assert.Equal(t, byte(0x02), bytes[1])
		assert.Equal(t, byte(0x03), bytes[2])
		assert.Equal(t, byte(0x04), bytes[3])
	})

	t.Run("Uint64 big-endian", func(t *testing.T) {
		buf := new(bytes.Buffer)
		err := WriteUint64(buf, 0x0102030405060708)
		require.NoError(t, err)

		bytes := buf.Bytes()
		assert.Equal(t, byte(0x01), bytes[0])
		assert.Equal(t, byte(0x02), bytes[1])
		assert.Equal(t, byte(0x03), bytes[2])
		assert.Equal(t, byte(0x04), bytes[3])
		assert.Equal(t, byte(0x05), bytes[4])
		assert.Equal(t, byte(0x06), bytes[5])
		assert.Equal(t, byte(0x07), bytes[6])
		assert.Equal(t, byte(0x08), bytes[7])
	})
}
