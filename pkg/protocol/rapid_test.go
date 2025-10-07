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

// TestGetUserInfoRoundTrip tests GetUserInfoMessage encoding
func TestGetUserInfoRoundTrip(t *testing.T) {
	rapid.Check(t, func(t *rapid.T) {
		nickname := rapid.StringN(3, 20, 256).Draw(t, "nickname")

		original := &GetUserInfoMessage{
			Nickname: nickname,
		}

		// Encode
		var buf bytes.Buffer
		err := original.EncodeTo(&buf)
		if err != nil {
			t.Fatalf("encode failed: %v", err)
		}

		// Decode
		decoded := &GetUserInfoMessage{}
		err = decoded.Decode(buf.Bytes())
		if err != nil {
			t.Fatalf("decode failed: %v", err)
		}

		// Verify round-trip
		if decoded.Nickname != original.Nickname {
			t.Fatalf("nickname mismatch: got %s, want %s", decoded.Nickname, original.Nickname)
		}
	})
}

// TestUserInfoRoundTrip tests UserInfoMessage encoding
func TestUserInfoRoundTrip(t *testing.T) {
	rapid.Check(t, func(t *rapid.T) {
		nickname := rapid.StringN(1, 50, 256).Draw(t, "nickname")
		isRegistered := rapid.Bool().Draw(t, "is_registered")
		var userID *uint64
		if isRegistered {
			id := rapid.Uint64().Draw(t, "user_id")
			userID = &id
		}
		online := rapid.Bool().Draw(t, "online")

		original := &UserInfoMessage{
			Nickname:     nickname,
			IsRegistered: isRegistered,
			UserID:       userID,
			Online:       online,
		}

		// Encode
		var buf bytes.Buffer
		err := original.EncodeTo(&buf)
		if err != nil {
			t.Fatalf("encode failed: %v", err)
		}

		// Decode
		decoded := &UserInfoMessage{}
		err = decoded.Decode(buf.Bytes())
		if err != nil {
			t.Fatalf("decode failed: %v", err)
		}

		// Verify round-trip
		if decoded.Nickname != original.Nickname {
			t.Fatalf("nickname mismatch: got %s, want %s", decoded.Nickname, original.Nickname)
		}
		if decoded.IsRegistered != original.IsRegistered {
			t.Fatalf("is_registered mismatch: got %v, want %v", decoded.IsRegistered, original.IsRegistered)
		}
		if (decoded.UserID == nil) != (original.UserID == nil) {
			t.Fatalf("user_id presence mismatch")
		}
		if original.UserID != nil && *decoded.UserID != *original.UserID {
			t.Fatalf("user_id mismatch: got %d, want %d", *decoded.UserID, *original.UserID)
		}
		if decoded.Online != original.Online {
			t.Fatalf("online mismatch: got %v, want %v", decoded.Online, original.Online)
		}
	})
}

// TestListUsersRoundTrip tests ListUsersMessage encoding
func TestListUsersRoundTrip(t *testing.T) {
	rapid.Check(t, func(t *rapid.T) {
		limit := rapid.Uint16().Draw(t, "limit")

		original := &ListUsersMessage{
			Limit: limit,
		}

		// Encode
		var buf bytes.Buffer
		err := original.EncodeTo(&buf)
		if err != nil {
			t.Fatalf("encode failed: %v", err)
		}

		// Decode
		decoded := &ListUsersMessage{}
		err = decoded.Decode(buf.Bytes())
		if err != nil {
			t.Fatalf("decode failed: %v", err)
		}

		// Verify round-trip
		if decoded.Limit != original.Limit {
			t.Fatalf("limit mismatch: got %d, want %d", decoded.Limit, original.Limit)
		}
	})
}

// TestUserListRoundTrip tests UserListMessage encoding
func TestUserListRoundTrip(t *testing.T) {
	rapid.Check(t, func(t *rapid.T) {
		userCount := rapid.IntRange(0, 10).Draw(t, "user_count")
		users := make([]UserListEntry, userCount)

		for i := 0; i < userCount; i++ {
			nickname := rapid.StringN(1, 20, 256).Draw(t, "nickname")
			isRegistered := rapid.Bool().Draw(t, "is_registered")
			var userID *uint64
			if isRegistered {
				id := rapid.Uint64().Draw(t, "user_id")
				userID = &id
			}
			users[i] = UserListEntry{
				Nickname:     nickname,
				IsRegistered: isRegistered,
				UserID:       userID,
			}
		}

		original := &UserListMessage{
			Users: users,
		}

		// Encode
		var buf bytes.Buffer
		err := original.EncodeTo(&buf)
		if err != nil {
			t.Fatalf("encode failed: %v", err)
		}

		// Decode
		decoded := &UserListMessage{}
		err = decoded.Decode(buf.Bytes())
		if err != nil {
			t.Fatalf("decode failed: %v", err)
		}

		// Verify round-trip
		if len(decoded.Users) != len(original.Users) {
			t.Fatalf("user count mismatch: got %d, want %d", len(decoded.Users), len(original.Users))
		}
		for i := range original.Users {
			if decoded.Users[i].Nickname != original.Users[i].Nickname {
				t.Fatalf("user[%d] nickname mismatch: got %s, want %s", i, decoded.Users[i].Nickname, original.Users[i].Nickname)
			}
			if decoded.Users[i].IsRegistered != original.Users[i].IsRegistered {
				t.Fatalf("user[%d] is_registered mismatch", i)
			}
			if (decoded.Users[i].UserID == nil) != (original.Users[i].UserID == nil) {
				t.Fatalf("user[%d] user_id presence mismatch", i)
			}
			if original.Users[i].UserID != nil && *decoded.Users[i].UserID != *original.Users[i].UserID {
				t.Fatalf("user[%d] user_id mismatch", i)
			}
		}
	})
}

// TestAuthRequestRoundTrip tests AuthRequestMessage encoding
func TestAuthRequestRoundTrip(t *testing.T) {
	rapid.Check(t, func(t *rapid.T) {
		nickname := rapid.StringN(3, 20, 256).Draw(t, "nickname")
		password := rapid.StringN(1, 50, 256).Draw(t, "password")

		original := &AuthRequestMessage{
			Nickname: nickname,
			Password: password,
		}

		var buf bytes.Buffer
		err := original.EncodeTo(&buf)
		if err != nil {
			t.Fatalf("encode failed: %v", err)
		}

		decoded := &AuthRequestMessage{}
		err = decoded.Decode(buf.Bytes())
		if err != nil {
			t.Fatalf("decode failed: %v", err)
		}

		if decoded.Nickname != original.Nickname {
			t.Fatalf("nickname mismatch: got %s, want %s", decoded.Nickname, original.Nickname)
		}
		if decoded.Password != original.Password {
			t.Fatalf("password mismatch")
		}
	})
}

// TestAuthResponseRoundTrip tests AuthResponseMessage encoding
func TestAuthResponseRoundTrip(t *testing.T) {
	rapid.Check(t, func(t *rapid.T) {
		success := rapid.Bool().Draw(t, "success")
		var userID uint64
		if success {
			userID = rapid.Uint64().Draw(t, "user_id")
		}
		message := rapid.StringN(0, 100, 256).Draw(t, "message")

		original := &AuthResponseMessage{
			Success: success,
			UserID:  userID,
			Message: message,
		}

		var buf bytes.Buffer
		err := original.EncodeTo(&buf)
		if err != nil {
			t.Fatalf("encode failed: %v", err)
		}

		decoded := &AuthResponseMessage{}
		err = decoded.Decode(buf.Bytes())
		if err != nil {
			t.Fatalf("decode failed: %v", err)
		}

		if decoded.Success != original.Success {
			t.Fatalf("success mismatch")
		}
		if decoded.Message != original.Message {
			t.Fatalf("message mismatch")
		}
		if success && decoded.UserID != original.UserID {
			t.Fatalf("user_id mismatch")
		}
	})
}

// TestRegisterUserRoundTrip tests RegisterUserMessage encoding
func TestRegisterUserRoundTrip(t *testing.T) {
	rapid.Check(t, func(t *rapid.T) {
		password := rapid.StringN(1, 50, 256).Draw(t, "password")

		original := &RegisterUserMessage{
			Password: password,
		}

		var buf bytes.Buffer
		err := original.EncodeTo(&buf)
		if err != nil {
			t.Fatalf("encode failed: %v", err)
		}

		decoded := &RegisterUserMessage{}
		err = decoded.Decode(buf.Bytes())
		if err != nil {
			t.Fatalf("decode failed: %v", err)
		}

		if decoded.Password != original.Password {
			t.Fatalf("password mismatch")
		}
	})
}

// TestCreateChannelRoundTrip tests CreateChannelMessage encoding
func TestCreateChannelRoundTrip(t *testing.T) {
	rapid.Check(t, func(t *rapid.T) {
		name := rapid.StringN(1, 20, 256).Draw(t, "name")
		displayName := rapid.StringN(1, 30, 256).Draw(t, "display_name")
		var description *string
		if rapid.Bool().Draw(t, "has_description") {
			desc := rapid.StringN(0, 100, 256).Draw(t, "description")
			description = &desc
		}
		channelType := rapid.Uint8().Draw(t, "channel_type")
		retentionHours := rapid.Uint32().Draw(t, "retention_hours")

		original := &CreateChannelMessage{
			Name:           name,
			DisplayName:    displayName,
			Description:    description,
			ChannelType:    channelType,
			RetentionHours: retentionHours,
		}

		var buf bytes.Buffer
		err := original.EncodeTo(&buf)
		if err != nil {
			t.Fatalf("encode failed: %v", err)
		}

		decoded := &CreateChannelMessage{}
		err = decoded.Decode(buf.Bytes())
		if err != nil {
			t.Fatalf("decode failed: %v", err)
		}

		if decoded.Name != original.Name {
			t.Fatalf("name mismatch")
		}
		if decoded.DisplayName != original.DisplayName {
			t.Fatalf("display_name mismatch")
		}
		if (decoded.Description == nil) != (original.Description == nil) {
			t.Fatalf("description presence mismatch")
		}
		if original.Description != nil && *decoded.Description != *original.Description {
			t.Fatalf("description value mismatch")
		}
		if decoded.ChannelType != original.ChannelType {
			t.Fatalf("channel_type mismatch")
		}
		if decoded.RetentionHours != original.RetentionHours {
			t.Fatalf("retention_hours mismatch")
		}
	})
}

// TestChannelCreatedRoundTrip tests ChannelCreatedMessage encoding
func TestChannelCreatedRoundTrip(t *testing.T) {
	rapid.Check(t, func(t *rapid.T) {
		success := rapid.Bool().Draw(t, "success")
		var channelID uint64
		var name string
		var description string
		var channelType uint8
		var retentionHours uint32
		if success {
			channelID = rapid.Uint64().Draw(t, "channel_id")
			name = rapid.StringN(1, 20, 256).Draw(t, "name")
			description = rapid.StringN(0, 100, 256).Draw(t, "description")
			channelType = rapid.Uint8().Draw(t, "type")
			retentionHours = rapid.Uint32().Draw(t, "retention_hours")
		}
		message := rapid.StringN(0, 100, 256).Draw(t, "message")

		original := &ChannelCreatedMessage{
			Success:        success,
			ChannelID:      channelID,
			Name:           name,
			Description:    description,
			Type:           channelType,
			RetentionHours: retentionHours,
			Message:        message,
		}

		var buf bytes.Buffer
		err := original.EncodeTo(&buf)
		if err != nil {
			t.Fatalf("encode failed: %v", err)
		}

		decoded := &ChannelCreatedMessage{}
		err = decoded.Decode(buf.Bytes())
		if err != nil {
			t.Fatalf("decode failed: %v", err)
		}

		if decoded.Success != original.Success {
			t.Fatalf("success mismatch")
		}
		if decoded.Message != original.Message {
			t.Fatalf("message mismatch")
		}
		if success {
			if decoded.ChannelID != original.ChannelID {
				t.Fatalf("channel_id mismatch")
			}
			if decoded.Name != original.Name {
				t.Fatalf("name mismatch")
			}
			if decoded.Description != original.Description {
				t.Fatalf("description mismatch")
			}
			if decoded.Type != original.Type {
				t.Fatalf("type mismatch")
			}
			if decoded.RetentionHours != original.RetentionHours {
				t.Fatalf("retention_hours mismatch")
			}
		}
	})
}
