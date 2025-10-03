package protocol

import (
	"bytes"
	"testing"

	"pgregory.net/rapid"
)

// TestFrameRoundTrip tests that any valid frame can be encoded and decoded
func TestFrameRoundTrip(t *testing.T) {
	rapid.Check(t, func(t *rapid.T) {
		// Generate random frame components
		msgType := rapid.Byte().Draw(t, "type")
		flags := rapid.Byte().Draw(t, "flags")
		payloadLen := rapid.IntRange(0, 1024).Draw(t, "payloadLen")
		payload := rapid.SliceOfN(rapid.Byte(), payloadLen, payloadLen).Draw(t, "payload")

		// Create frame
		original := &Frame{
			Version: ProtocolVersion,
			Type:    msgType,
			Flags:   flags,
			Payload: payload,
		}

		// Encode
		var buf bytes.Buffer
		err := EncodeFrame(&buf, original)
		if err != nil {
			t.Fatalf("encode failed: %v", err)
		}

		// Decode
		decoded, err := DecodeFrame(&buf)
		if err != nil {
			t.Fatalf("decode failed: %v", err)
		}

		// Verify round-trip
		if decoded.Version != original.Version {
			t.Fatalf("version mismatch: got %d, want %d", decoded.Version, original.Version)
		}
		if decoded.Type != original.Type {
			t.Fatalf("type mismatch: got %d, want %d", decoded.Type, original.Type)
		}
		if decoded.Flags != original.Flags {
			t.Fatalf("flags mismatch: got %d, want %d", decoded.Flags, original.Flags)
		}
		if !bytes.Equal(decoded.Payload, original.Payload) {
			t.Fatalf("payload mismatch")
		}
	})
}

// TestStringRoundTrip tests that any valid string can be encoded and decoded
func TestStringRoundTrip(t *testing.T) {
	rapid.Check(t, func(t *rapid.T) {
		original := rapid.String().Draw(t, "string")

		// Encode
		var buf bytes.Buffer
		err := WriteString(&buf, original)
		if err != nil {
			t.Fatalf("encode failed: %v", err)
		}

		// Decode
		decoded, err := ReadString(&buf)
		if err != nil {
			t.Fatalf("decode failed: %v", err)
		}

		// Verify round-trip
		if decoded != original {
			t.Fatalf("string mismatch: got %q, want %q", decoded, original)
		}
	})
}

// TestUint64RoundTrip tests that any uint64 can be encoded and decoded
func TestUint64RoundTrip(t *testing.T) {
	rapid.Check(t, func(t *rapid.T) {
		original := rapid.Uint64().Draw(t, "uint64")

		// Encode
		var buf bytes.Buffer
		err := WriteUint64(&buf, original)
		if err != nil {
			t.Fatalf("encode failed: %v", err)
		}

		// Decode
		decoded, err := ReadUint64(&buf)
		if err != nil {
			t.Fatalf("decode failed: %v", err)
		}

		// Verify round-trip
		if decoded != original {
			t.Fatalf("uint64 mismatch: got %d, want %d", decoded, original)
		}
	})
}

// TestOptionalUint64RoundTrip tests optional uint64 encoding
func TestOptionalUint64RoundTrip(t *testing.T) {
	rapid.Check(t, func(t *rapid.T) {
		hasValue := rapid.Bool().Draw(t, "hasValue")
		var original *uint64
		if hasValue {
			v := rapid.Uint64().Draw(t, "uint64")
			original = &v
		}

		// Encode
		var buf bytes.Buffer
		err := WriteOptionalUint64(&buf, original)
		if err != nil {
			t.Fatalf("encode failed: %v", err)
		}

		// Decode
		decoded, err := ReadOptionalUint64(&buf)
		if err != nil {
			t.Fatalf("decode failed: %v", err)
		}

		// Verify round-trip
		if original == nil && decoded != nil {
			t.Fatalf("expected nil, got %d", *decoded)
		}
		if original != nil && decoded == nil {
			t.Fatalf("expected %d, got nil", *original)
		}
		if original != nil && decoded != nil && *decoded != *original {
			t.Fatalf("uint64 mismatch: got %d, want %d", *decoded, *original)
		}
	})
}

// TestSetNicknameRoundTrip tests SetNicknameMessage encoding
func TestSetNicknameRoundTrip(t *testing.T) {
	rapid.Check(t, func(t *rapid.T) {
		original := &SetNicknameMessage{
			Nickname: rapid.StringMatching(`[a-zA-Z0-9_-]{3,20}`).Draw(t, "nickname"),
		}

		// Encode
		var buf bytes.Buffer
		err := original.EncodeTo(&buf)
		if err != nil {
			t.Fatalf("encode failed: %v", err)
		}

		// Decode
		decoded := &SetNicknameMessage{}
		err = decoded.Decode(buf.Bytes())
		if err != nil {
			t.Fatalf("decode failed: %v", err)
		}

		// Verify round-trip
		if decoded.Nickname != original.Nickname {
			t.Fatalf("nickname mismatch: got %q, want %q", decoded.Nickname, original.Nickname)
		}
	})
}

// TestPostMessageRoundTrip tests PostMessageMessage encoding
func TestPostMessageRoundTrip(t *testing.T) {
	rapid.Check(t, func(t *rapid.T) {
		hasParent := rapid.Bool().Draw(t, "hasParent")
		var parentID *uint64
		if hasParent {
			p := rapid.Uint64().Draw(t, "parentID")
			parentID = &p
		}

		original := &PostMessageMessage{
			ChannelID: rapid.Uint64().Draw(t, "channelID"),
			ParentID:  parentID,
			Content:   rapid.StringOfN(rapid.Rune(), 1, 4096, -1).Draw(t, "content"),
		}

		// Encode
		var buf bytes.Buffer
		err := original.EncodeTo(&buf)
		if err != nil {
			t.Fatalf("encode failed: %v", err)
		}

		// Decode
		decoded := &PostMessageMessage{}
		err = decoded.Decode(buf.Bytes())
		if err != nil {
			t.Fatalf("decode failed: %v", err)
		}

		// Verify round-trip
		if decoded.ChannelID != original.ChannelID {
			t.Fatalf("channelID mismatch: got %d, want %d", decoded.ChannelID, original.ChannelID)
		}
		if (decoded.ParentID == nil) != (original.ParentID == nil) {
			t.Fatalf("parentID presence mismatch")
		}
		if original.ParentID != nil && *decoded.ParentID != *original.ParentID {
			t.Fatalf("parentID mismatch: got %d, want %d", *decoded.ParentID, *original.ParentID)
		}
		if decoded.Content != original.Content {
			t.Fatalf("content mismatch")
		}
	})
}
