package protocol

import (
	"bytes"
	"testing"

	"github.com/stretchr/testify/assert"
)

// Test decode errors for all message types

func TestSetNicknameDecodeErrors(t *testing.T) {
	t.Run("invalid payload - empty", func(t *testing.T) {
		msg := &SetNicknameMessage{}
		err := msg.Decode([]byte{})
		assert.Error(t, err)
	})

	t.Run("invalid payload - partial string", func(t *testing.T) {
		msg := &SetNicknameMessage{}
		// String length says 10 bytes but only provide 2
		payload := []byte{0x00, 0x0A, 0x41, 0x42}
		err := msg.Decode(payload)
		assert.Error(t, err)
	})
}

func TestNicknameResponseDecodeErrors(t *testing.T) {
	t.Run("invalid payload - missing bool", func(t *testing.T) {
		msg := &NicknameResponseMessage{}
		err := msg.Decode([]byte{})
		assert.Error(t, err)
	})

	t.Run("invalid payload - missing message", func(t *testing.T) {
		msg := &NicknameResponseMessage{}
		err := msg.Decode([]byte{0x01}) // Bool but no message
		assert.Error(t, err)
	})
}

func TestListChannelsDecodeErrors(t *testing.T) {
	t.Run("invalid payload - missing fields", func(t *testing.T) {
		msg := &ListChannelsMessage{}
		err := msg.Decode([]byte{0x00, 0x00, 0x00}) // Partial uint64
		assert.Error(t, err)
	})

	t.Run("invalid payload - missing limit", func(t *testing.T) {
		msg := &ListChannelsMessage{}
		payload := []byte{0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x01} // uint64 but no limit
		err := msg.Decode(payload)
		assert.Error(t, err)
	})
}

func TestChannelListDecodeErrors(t *testing.T) {
	t.Run("invalid payload - missing count", func(t *testing.T) {
		msg := &ChannelListMessage{}
		err := msg.Decode([]byte{})
		assert.Error(t, err)
	})

	t.Run("invalid payload - incomplete channel", func(t *testing.T) {
		msg := &ChannelListMessage{}
		// Count says 1 channel but data is incomplete
		payload := []byte{0x00, 0x01, 0x00, 0x00}
		err := msg.Decode(payload)
		assert.Error(t, err)
	})
}

func TestJoinChannelDecodeErrors(t *testing.T) {
	t.Run("invalid payload - missing channel ID", func(t *testing.T) {
		msg := &JoinChannelMessage{}
		err := msg.Decode([]byte{})
		assert.Error(t, err)
	})

	t.Run("invalid payload - missing optional field", func(t *testing.T) {
		msg := &JoinChannelMessage{}
		// uint64 channel ID but missing optional subchannel ID
		payload := []byte{0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x01}
		err := msg.Decode(payload)
		assert.Error(t, err)
	})
}

func TestJoinResponseDecodeErrors(t *testing.T) {
	t.Run("invalid payload - empty", func(t *testing.T) {
		msg := &JoinResponseMessage{}
		err := msg.Decode([]byte{})
		assert.Error(t, err)
	})

	t.Run("invalid payload - missing fields", func(t *testing.T) {
		msg := &JoinResponseMessage{}
		payload := []byte{0x01, 0x00, 0x00} // Bool + partial uint64
		err := msg.Decode(payload)
		assert.Error(t, err)
	})
}

func TestListMessagesDecodeErrors(t *testing.T) {
	t.Run("invalid payload - empty", func(t *testing.T) {
		msg := &ListMessagesMessage{}
		err := msg.Decode([]byte{})
		assert.Error(t, err)
	})

	t.Run("invalid payload - incomplete", func(t *testing.T) {
		msg := &ListMessagesMessage{}
		payload := []byte{0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x01, 0x00} // Partial
		err := msg.Decode(payload)
		assert.Error(t, err)
	})
}

func TestMessageListDecodeErrors(t *testing.T) {
	t.Run("invalid payload - empty", func(t *testing.T) {
		msg := &MessageListMessage{}
		err := msg.Decode([]byte{})
		assert.Error(t, err)
	})

	t.Run("invalid payload - incomplete message", func(t *testing.T) {
		msg := &MessageListMessage{}
		buf := new(bytes.Buffer)
		WriteUint64(buf, 1)                 // channel_id
		WriteOptionalUint64(buf, nil)       // subchannel_id
		WriteOptionalUint64(buf, nil)       // parent_id
		WriteUint16(buf, 1)                 // message count = 1
		WriteUint64(buf, 1)                 // message id
		// Missing rest of message fields

		err := msg.Decode(buf.Bytes())
		assert.Error(t, err)
	})
}

func TestPostMessageDecodeErrors(t *testing.T) {
	t.Run("invalid payload - empty", func(t *testing.T) {
		msg := &PostMessageMessage{}
		err := msg.Decode([]byte{})
		assert.Error(t, err)
	})

	t.Run("decode empty content", func(t *testing.T) {
		msg := &PostMessageMessage{}
		buf := new(bytes.Buffer)
		WriteUint64(buf, 1)                 // channel_id
		WriteOptionalUint64(buf, nil)       // subchannel_id
		WriteOptionalUint64(buf, nil)       // parent_id
		WriteString(buf, "")                // empty content

		err := msg.Decode(buf.Bytes())
		assert.Error(t, err)
		assert.Equal(t, ErrEmptyContent, err)
	})

	t.Run("decode too long content", func(t *testing.T) {
		msg := &PostMessageMessage{}
		buf := new(bytes.Buffer)
		WriteUint64(buf, 1)                        // channel_id
		WriteOptionalUint64(buf, nil)              // subchannel_id
		WriteOptionalUint64(buf, nil)              // parent_id
		WriteString(buf, string(make([]byte, 4097))) // too long

		err := msg.Decode(buf.Bytes())
		assert.Error(t, err)
		assert.Equal(t, ErrMessageTooLong, err)
	})
}

func TestMessagePostedDecodeErrors(t *testing.T) {
	t.Run("invalid payload - empty", func(t *testing.T) {
		msg := &MessagePostedMessage{}
		err := msg.Decode([]byte{})
		assert.Error(t, err)
	})

	t.Run("invalid payload - incomplete", func(t *testing.T) {
		msg := &MessagePostedMessage{}
		payload := []byte{0x01, 0x00, 0x00} // Bool + partial uint64
		err := msg.Decode(payload)
		assert.Error(t, err)
	})
}

func TestDeleteMessageDecodeErrors(t *testing.T) {
	t.Run("invalid payload - empty", func(t *testing.T) {
		msg := &DeleteMessageMessage{}
		err := msg.Decode([]byte{})
		assert.Error(t, err)
	})
}

func TestMessageDeletedDecodeErrors(t *testing.T) {
	t.Run("invalid payload - empty", func(t *testing.T) {
		msg := &MessageDeletedMessage{}
		err := msg.Decode([]byte{})
		assert.Error(t, err)
	})

	t.Run("invalid payload - success but missing timestamp", func(t *testing.T) {
		msg := &MessageDeletedMessage{}
		buf := new(bytes.Buffer)
		WriteBool(buf, true)  // success = true
		WriteUint64(buf, 123) // message_id
		// Missing timestamp (required when success=true)

		err := msg.Decode(buf.Bytes())
		assert.Error(t, err)
	})
}

func TestPingDecodeErrors(t *testing.T) {
	t.Run("invalid payload - empty", func(t *testing.T) {
		msg := &PingMessage{}
		err := msg.Decode([]byte{})
		assert.Error(t, err)
	})
}

func TestPongDecodeErrors(t *testing.T) {
	t.Run("invalid payload - empty", func(t *testing.T) {
		msg := &PongMessage{}
		err := msg.Decode([]byte{})
		assert.Error(t, err)
	})
}

func TestErrorMessageDecodeErrors(t *testing.T) {
	t.Run("invalid payload - empty", func(t *testing.T) {
		msg := &ErrorMessage{}
		err := msg.Decode([]byte{})
		assert.Error(t, err)
	})

	t.Run("invalid payload - missing message", func(t *testing.T) {
		msg := &ErrorMessage{}
		payload := []byte{0x03, 0xE8} // error code but no message
		err := msg.Decode(payload)
		assert.Error(t, err)
	})
}

func TestServerConfigDecodeErrors(t *testing.T) {
	t.Run("invalid payload - empty", func(t *testing.T) {
		msg := &ServerConfigMessage{}
		err := msg.Decode([]byte{})
		assert.Error(t, err)
	})

	t.Run("invalid payload - incomplete", func(t *testing.T) {
		msg := &ServerConfigMessage{}
		payload := []byte{0x01, 0x00, 0x0A} // Partial fields
		err := msg.Decode(payload)
		assert.Error(t, err)
	})
}

func TestNewMessageDecodeErrors(t *testing.T) {
	t.Run("invalid payload - empty", func(t *testing.T) {
		msg := &NewMessageMessage{}
		err := msg.Decode([]byte{})
		assert.Error(t, err)
	})

	t.Run("invalid payload - incomplete", func(t *testing.T) {
		msg := &NewMessageMessage{}
		buf := new(bytes.Buffer)
		WriteUint64(buf, 1)           // ID
		WriteUint64(buf, 1)           // ChannelID
		// Missing rest of fields

		err := msg.Decode(buf.Bytes())
		assert.Error(t, err)
	})
}

// Test error paths in Write functions

func TestWriteStringError(t *testing.T) {
	t.Run("empty string writes zero length", func(t *testing.T) {
		buf := new(bytes.Buffer)
		err := WriteString(buf, "")
		assert.NoError(t, err)

		// Verify it wrote length of 0
		assert.Equal(t, []byte{0x00, 0x00}, buf.Bytes())
	})
}

func TestWriteOptionalError(t *testing.T) {
	t.Run("nil optional uint64", func(t *testing.T) {
		buf := new(bytes.Buffer)
		err := WriteOptionalUint64(buf, nil)
		assert.NoError(t, err)

		// Verify it wrote false
		assert.Equal(t, []byte{0x00}, buf.Bytes())
	})

	t.Run("nil optional timestamp", func(t *testing.T) {
		buf := new(bytes.Buffer)
		err := WriteOptionalTimestamp(buf, nil)
		assert.NoError(t, err)

		// Verify it wrote false
		assert.Equal(t, []byte{0x00}, buf.Bytes())
	})
}

func TestEncodeFrameError(t *testing.T) {
	t.Run("nil payload", func(t *testing.T) {
		frame := &Frame{
			Version: 1,
			Type:    TypePing,
			Flags:   0,
			Payload: nil,
		}

		buf := new(bytes.Buffer)
		err := EncodeFrame(buf, frame)
		assert.NoError(t, err)
	})
}

func TestEncodeMessageError(t *testing.T) {
	t.Run("oversized message", func(t *testing.T) {
		_, err := EncodeMessage(1, TypePostMessage, 0, make([]byte, MaxFrameSize))
		assert.Error(t, err)
		assert.Equal(t, ErrFrameTooLarge, err)
	})
}
