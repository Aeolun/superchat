package protocol

import (
	"bytes"
	"testing"
)

// FuzzDecodeFrame fuzzes the frame decoder with random bytes
func FuzzDecodeFrame(f *testing.F) {
	// Seed with some valid frames
	f.Add([]byte{0x00, 0x00, 0x00, 0x03, 0x01, 0x01, 0x00}) // Minimal valid frame
	f.Add([]byte{0x00, 0x00, 0x00, 0x05, 0x01, 0x02, 0x00, 0x48, 0x69}) // Frame with payload "Hi"

	// Create a valid SET_NICKNAME frame
	var validBuf bytes.Buffer
	msg := &SetNicknameMessage{Nickname: "test"}
	msg.EncodeTo(&validBuf)
	frame := &Frame{
		Version: ProtocolVersion,
		Type:    TypeSetNickname,
		Flags:   0,
		Payload: validBuf.Bytes(),
	}
	var frameBuf bytes.Buffer
	EncodeFrame(&frameBuf, frame)
	f.Add(frameBuf.Bytes())

	f.Fuzz(func(t *testing.T, data []byte) {
		// Try to decode - should never panic
		buf := bytes.NewReader(data)
		frame, err := DecodeFrame(buf)

		// We don't care if it errors (invalid data is expected)
		// But it must NOT panic or hang
		_ = frame
		_ = err
	})
}

// FuzzReadString fuzzes the string decoder
func FuzzReadString(f *testing.F) {
	// Seed with valid strings
	f.Add([]byte{0x00, 0x00, 0x00, 0x00}) // Empty string
	f.Add([]byte{0x00, 0x00, 0x00, 0x05, 'h', 'e', 'l', 'l', 'o'}) // "hello"

	f.Fuzz(func(t *testing.T, data []byte) {
		buf := bytes.NewReader(data)
		str, err := ReadString(buf)

		// Should never panic
		_ = str
		_ = err
	})
}

// FuzzReadUint64 fuzzes the uint64 decoder
func FuzzReadUint64(f *testing.F) {
	// Seed with valid uint64s
	f.Add([]byte{0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00}) // 0
	f.Add([]byte{0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF}) // Max uint64

	f.Fuzz(func(t *testing.T, data []byte) {
		buf := bytes.NewReader(data)
		val, err := ReadUint64(buf)

		// Should never panic
		_ = val
		_ = err
	})
}

// FuzzSetNicknameMessage fuzzes SetNicknameMessage decoder
func FuzzSetNicknameMessage(f *testing.F) {
	// Seed with valid message
	var buf bytes.Buffer
	msg := &SetNicknameMessage{Nickname: "alice"}
	msg.EncodeTo(&buf)
	f.Add(buf.Bytes())

	f.Fuzz(func(t *testing.T, data []byte) {
		msg := &SetNicknameMessage{}
		err := msg.Decode(data)

		// Should never panic
		_ = err
	})
}

// FuzzPostMessageMessage fuzzes PostMessageMessage decoder
func FuzzPostMessageMessage(f *testing.F) {
	// Seed with valid messages
	var buf1 bytes.Buffer
	msg1 := &PostMessageMessage{
		ChannelID: 1,
		ParentID:  nil,
		Content:   "Hello",
	}
	msg1.EncodeTo(&buf1)
	f.Add(buf1.Bytes())

	var buf2 bytes.Buffer
	parentID := uint64(42)
	msg2 := &PostMessageMessage{
		ChannelID: 1,
		ParentID:  &parentID,
		Content:   "Reply",
	}
	msg2.EncodeTo(&buf2)
	f.Add(buf2.Bytes())

	f.Fuzz(func(t *testing.T, data []byte) {
		msg := &PostMessageMessage{}
		err := msg.Decode(data)

		// Should never panic
		_ = err
	})
}

// FuzzListMessagesMessage fuzzes ListMessagesMessage decoder
func FuzzListMessagesMessage(f *testing.F) {
	// Seed with valid messages
	var buf1 bytes.Buffer
	msg1 := &ListMessagesMessage{
		ChannelID: 1,
		ParentID:  nil,
		Limit:     50,
	}
	msg1.EncodeTo(&buf1)
	f.Add(buf1.Bytes())

	var buf2 bytes.Buffer
	parentID := uint64(100)
	msg2 := &ListMessagesMessage{
		ChannelID: 1,
		ParentID:  &parentID,
		Limit:     25,
	}
	msg2.EncodeTo(&buf2)
	f.Add(buf2.Bytes())

	f.Fuzz(func(t *testing.T, data []byte) {
		msg := &ListMessagesMessage{}
		err := msg.Decode(data)

		// Should never panic
		_ = err
	})
}

// FuzzDeleteMessageMessage fuzzes DeleteMessageMessage decoder
func FuzzDeleteMessageMessage(f *testing.F) {
	// Seed with valid message
	var buf bytes.Buffer
	msg := &DeleteMessageMessage{MessageID: 123}
	msg.EncodeTo(&buf)
	f.Add(buf.Bytes())

	f.Fuzz(func(t *testing.T, data []byte) {
		msg := &DeleteMessageMessage{}
		err := msg.Decode(data)

		// Should never panic
		_ = err
	})
}
