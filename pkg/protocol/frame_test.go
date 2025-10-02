package protocol

import (
	"bytes"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestEncodeDecodeFrame(t *testing.T) {
	tests := []struct {
		name    string
		frame   Frame
		wantErr bool
	}{
		{
			name: "valid frame - empty payload",
			frame: Frame{
				Version: 1,
				Type:    TypeSetNickname,
				Flags:   0,
				Payload: []byte{},
			},
			wantErr: false,
		},
		{
			name: "valid frame - with payload",
			frame: Frame{
				Version: 1,
				Type:    TypeSetNickname,
				Flags:   0,
				Payload: []byte("alice"),
			},
			wantErr: false,
		},
		{
			name: "compression flag set",
			frame: Frame{
				Version: 1,
				Type:    TypePostMessage,
				Flags:   FlagCompressed,
				Payload: []byte("compressed data here"),
			},
			wantErr: false,
		},
		{
			name: "encryption flag set",
			frame: Frame{
				Version: 1,
				Type:    TypePostMessage,
				Flags:   FlagEncrypted,
				Payload: []byte("encrypted data here"),
			},
			wantErr: false,
		},
		{
			name: "both flags set",
			frame: Frame{
				Version: 1,
				Type:    TypePostMessage,
				Flags:   FlagCompressed | FlagEncrypted,
				Payload: []byte("compressed and encrypted"),
			},
			wantErr: false,
		},
		{
			name: "max payload size (1MB)",
			frame: Frame{
				Version: 1,
				Type:    TypePostMessage,
				Flags:   0,
				Payload: make([]byte, MaxFrameSize-3), // Subtract version, type, flags
			},
			wantErr: false,
		},
		{
			name: "oversized payload (should fail)",
			frame: Frame{
				Version: 1,
				Type:    TypePostMessage,
				Flags:   0,
				Payload: make([]byte, MaxFrameSize), // Too large (exceeds with header)
			},
			wantErr: true,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			// Encode
			buf := new(bytes.Buffer)
			err := EncodeFrame(buf, &tt.frame)

			if tt.wantErr {
				assert.Error(t, err)
				assert.Equal(t, ErrFrameTooLarge, err)
				return
			}
			require.NoError(t, err)

			// Decode
			decoded, err := DecodeFrame(buf)
			require.NoError(t, err)

			// Verify round-trip
			assert.Equal(t, tt.frame.Version, decoded.Version)
			assert.Equal(t, tt.frame.Type, decoded.Type)
			assert.Equal(t, tt.frame.Flags, decoded.Flags)
			assert.Equal(t, tt.frame.Payload, decoded.Payload)
		})
	}
}

func TestDecodeFrameErrors(t *testing.T) {
	t.Run("empty buffer", func(t *testing.T) {
		buf := bytes.NewReader([]byte{})
		_, err := DecodeFrame(buf)
		assert.Error(t, err)
	})

	t.Run("oversized frame", func(t *testing.T) {
		// Length field indicates frame larger than MaxFrameSize
		buf := new(bytes.Buffer)
		WriteUint32(buf, MaxFrameSize+1)

		_, err := DecodeFrame(buf)
		assert.Error(t, err)
		assert.Equal(t, ErrFrameTooLarge, err)
	})

	t.Run("invalid frame length (too small)", func(t *testing.T) {
		// Length must be at least 3 (version + type + flags)
		buf := new(bytes.Buffer)
		WriteUint32(buf, 2) // Too small

		_, err := DecodeFrame(buf)
		assert.Error(t, err)
		assert.Equal(t, ErrInvalidFrameLength, err)
	})

	t.Run("incomplete frame - missing version", func(t *testing.T) {
		buf := new(bytes.Buffer)
		WriteUint32(buf, 3) // Valid length
		// But no data follows

		_, err := DecodeFrame(buf)
		assert.Error(t, err)
	})

	t.Run("incomplete frame - missing type", func(t *testing.T) {
		buf := new(bytes.Buffer)
		WriteUint32(buf, 3)     // Valid length
		WriteUint8(buf, 1)      // Version
		// Type missing

		_, err := DecodeFrame(buf)
		assert.Error(t, err)
	})

	t.Run("incomplete frame - missing flags", func(t *testing.T) {
		buf := new(bytes.Buffer)
		WriteUint32(buf, 3)     // Valid length
		WriteUint8(buf, 1)      // Version
		WriteUint8(buf, 0x02)   // Type
		// Flags missing

		_, err := DecodeFrame(buf)
		assert.Error(t, err)
	})

	t.Run("incomplete frame - missing payload", func(t *testing.T) {
		buf := new(bytes.Buffer)
		WriteUint32(buf, 10)    // Length indicates 10 bytes (including 7 bytes of payload)
		WriteUint8(buf, 1)      // Version
		WriteUint8(buf, 0x02)   // Type
		WriteUint8(buf, 0)      // Flags
		buf.Write([]byte{0x01, 0x02}) // Only 2 bytes instead of 7

		_, err := DecodeFrame(buf)
		assert.Error(t, err)
	})
}

func TestEncodeMessage(t *testing.T) {
	payload := []byte("test payload")
	data, err := EncodeMessage(1, TypeSetNickname, 0, payload)
	require.NoError(t, err)

	// Decode it back
	frame, err := DecodeMessage(data)
	require.NoError(t, err)

	assert.Equal(t, uint8(1), frame.Version)
	assert.Equal(t, uint8(TypeSetNickname), frame.Type)
	assert.Equal(t, uint8(0), frame.Flags)
	assert.Equal(t, payload, frame.Payload)
}

func TestFrameConstants(t *testing.T) {
	assert.Equal(t, 1024*1024, MaxFrameSize)
	assert.Equal(t, 1, ProtocolVersion)
	assert.Equal(t, 0x01, FlagCompressed)
	assert.Equal(t, 0x02, FlagEncrypted)
}

func TestFrameStructure(t *testing.T) {
	t.Run("frame with all fields", func(t *testing.T) {
		frame := &Frame{
			Version: 1,
			Type:    TypePostMessage,
			Flags:   FlagCompressed,
			Payload: []byte("Hello, world!"),
		}

		buf := new(bytes.Buffer)
		err := EncodeFrame(buf, frame)
		require.NoError(t, err)

		// Check the binary structure manually
		data := buf.Bytes()

		// First 4 bytes: length (big-endian)
		length := uint32(data[0])<<24 | uint32(data[1])<<16 | uint32(data[2])<<8 | uint32(data[3])
		expectedLength := uint32(1 + 1 + 1 + len(frame.Payload)) // version + type + flags + payload
		assert.Equal(t, expectedLength, length)

		// Next byte: version
		assert.Equal(t, frame.Version, data[4])

		// Next byte: type
		assert.Equal(t, frame.Type, data[5])

		// Next byte: flags
		assert.Equal(t, frame.Flags, data[6])

		// Remaining bytes: payload
		assert.Equal(t, frame.Payload, data[7:])
	})
}

func TestZeroLengthPayload(t *testing.T) {
	frame := &Frame{
		Version: 1,
		Type:    TypeListChannels,
		Flags:   0,
		Payload: nil, // No payload
	}

	buf := new(bytes.Buffer)
	err := EncodeFrame(buf, frame)
	require.NoError(t, err)

	decoded, err := DecodeFrame(buf)
	require.NoError(t, err)

	assert.Equal(t, frame.Version, decoded.Version)
	assert.Equal(t, frame.Type, decoded.Type)
	assert.Equal(t, frame.Flags, decoded.Flags)
	assert.Equal(t, 0, len(decoded.Payload))
}
