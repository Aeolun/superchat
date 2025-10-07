package protocol

import (
	"errors"
	"testing"
	"time"

	"github.com/stretchr/testify/assert"
)

// failingWriter is a writer that always fails
type failingWriter struct{}

func (w *failingWriter) Write(p []byte) (n int, err error) {
	return 0, errors.New("write failed")
}

// conditionalFailWriter fails after a certain number of successful writes
type conditionalFailWriter struct {
	successCount int
	writeCount   int
}

func (w *conditionalFailWriter) Write(p []byte) (n int, err error) {
	w.writeCount++
	if w.writeCount > w.successCount {
		return 0, errors.New("write failed")
	}
	return len(p), nil
}

// Test encode error paths by using a failing writer

func TestEncodeFrameWriteErrors(t *testing.T) {
	writer := &failingWriter{}
	frame := &Frame{
		Version: 1,
		Type:    TypePing,
		Flags:   0,
		Payload: []byte("test"),
	}

	err := EncodeFrame(writer, frame)
	assert.Error(t, err)
}

func TestSetNicknameEncodeError(t *testing.T) {
	// This will fail on WriteString
	msg := &SetNicknameMessage{Nickname: "alice"}

	// We can't directly test encode errors without a mock writer
	// but we can test the validation errors
	msg.Nickname = "ab" // Too short
	_, err := msg.Encode()
	assert.Error(t, err)
	assert.Equal(t, ErrNicknameTooShort, err)
}

func TestNicknameResponseEncodeWithFailingWriter(t *testing.T) {
	// Test that empty messages encode correctly
	msg := &NicknameResponseMessage{
		Success: false,
		Message: "",
	}
	payload, err := msg.Encode()
	assert.NoError(t, err)
	assert.NotNil(t, payload)
}

func TestChannelListEncodeEmpty(t *testing.T) {
	// Test encoding with empty channel list
	msg := &ChannelListMessage{
		Channels: []Channel{},
	}
	payload, err := msg.Encode()
	assert.NoError(t, err)
	assert.NotNil(t, payload)
}

func TestChannelListEncodeMultipleChannels(t *testing.T) {
	// Test all code paths in channel encoding
	msg := &ChannelListMessage{
		Channels: []Channel{
			{
				ID:             1,
				Name:           "a",
				Description:    "",
				UserCount:      0,
				IsOperator:     false,
				Type:           0,
				RetentionHours: 1,
			},
			{
				ID:             2,
				Name:           "b",
				Description:    "desc",
				UserCount:      100,
				IsOperator:     true,
				Type:           1,
				RetentionHours: 720,
			},
		},
	}
	payload, err := msg.Encode()
	assert.NoError(t, err)
	assert.NotNil(t, payload)

	// Verify round-trip
	decoded := &ChannelListMessage{}
	err = decoded.Decode(payload)
	assert.NoError(t, err)
	assert.Equal(t, 2, len(decoded.Channels))
}

func TestMessageListEncodeComplex(t *testing.T) {
	now := time.Now()
	editTime := now.Add(time.Minute)

	subchannelID := uint64(5)
	parentID := uint64(10)
	authorID := uint64(42)

	msg := &MessageListMessage{
		ChannelID:    1,
		SubchannelID: &subchannelID,
		ParentID:     &parentID,
		Messages: []Message{
			{
				ID:             1,
				ChannelID:      1,
				SubchannelID:   nil,
				ParentID:       nil,
				AuthorUserID:   nil,
				AuthorNickname: "anon",
				Content:        "test",
				CreatedAt:      now,
				EditedAt:       nil,
				ReplyCount:     0,
			},
			{
				ID:             2,
				ChannelID:      1,
				SubchannelID:   &subchannelID,
				ParentID:       &parentID,
				AuthorUserID:   &authorID,
				AuthorNickname: "alice",
				Content:        "reply",
				CreatedAt:      now,
				EditedAt:       &editTime,
				ReplyCount:     0,
			},
		},
	}

	payload, err := msg.Encode()
	assert.NoError(t, err)

	decoded := &MessageListMessage{}
	err = decoded.Decode(payload)
	assert.NoError(t, err)
	assert.Equal(t, 2, len(decoded.Messages))
}

func TestPostMessageEncodeAllBranches(t *testing.T) {
	subID := uint64(5)
	parentID := uint64(10)

	tests := []struct {
		name string
		msg  PostMessageMessage
	}{
		{
			name: "all fields nil",
			msg: PostMessageMessage{
				ChannelID:    1,
				SubchannelID: nil,
				ParentID:     nil,
				Content:      "test",
			},
		},
		{
			name: "with subchannel",
			msg: PostMessageMessage{
				ChannelID:    1,
				SubchannelID: &subID,
				ParentID:     nil,
				Content:      "test",
			},
		},
		{
			name: "with parent",
			msg: PostMessageMessage{
				ChannelID:    1,
				SubchannelID: nil,
				ParentID:     &parentID,
				Content:      "test",
			},
		},
		{
			name: "with both",
			msg: PostMessageMessage{
				ChannelID:    1,
				SubchannelID: &subID,
				ParentID:     &parentID,
				Content:      "test",
			},
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			payload, err := tt.msg.Encode()
			assert.NoError(t, err)

			decoded := &PostMessageMessage{}
			err = decoded.Decode(payload)
			assert.NoError(t, err)
			assert.Equal(t, tt.msg.Content, decoded.Content)
		})
	}
}

func TestMessageDeletedEncodeBothPaths(t *testing.T) {
	now := time.Now()

	t.Run("success with timestamp", func(t *testing.T) {
		msg := &MessageDeletedMessage{
			Success:   true,
			MessageID: 123,
			DeletedAt: now,
			Message:   "",
		}
		payload, err := msg.Encode()
		assert.NoError(t, err)

		decoded := &MessageDeletedMessage{}
		err = decoded.Decode(payload)
		assert.NoError(t, err)
		assert.True(t, decoded.Success)
	})

	t.Run("failure without timestamp", func(t *testing.T) {
		msg := &MessageDeletedMessage{
			Success:   false,
			MessageID: 123,
			DeletedAt: time.Time{},
			Message:   "error",
		}
		payload, err := msg.Encode()
		assert.NoError(t, err)

		decoded := &MessageDeletedMessage{}
		err = decoded.Decode(payload)
		assert.NoError(t, err)
		assert.False(t, decoded.Success)
	})
}

func TestNewMessageEncodeAllFields(t *testing.T) {
	now := time.Now()
	editTime := now.Add(time.Minute)

	subID := uint64(5)
	parentID := uint64(10)
	authorID := uint64(42)

	tests := []struct {
		name string
		msg  NewMessageMessage
	}{
		{
			name: "minimal fields",
			msg: NewMessageMessage{
				ID:             1,
				ChannelID:      1,
				SubchannelID:   nil,
				ParentID:       nil,
				AuthorUserID:   nil,
				AuthorNickname: "anon",
				Content:        "test",
				CreatedAt:      now,
				EditedAt:       nil,
				ReplyCount:     0,
			},
		},
		{
			name: "all fields set",
			msg: NewMessageMessage{
				ID:             2,
				ChannelID:      1,
				SubchannelID:   &subID,
				ParentID:       &parentID,
				AuthorUserID:   &authorID,
				AuthorNickname: "alice",
				Content:        "reply",
				CreatedAt:      now,
				EditedAt:       &editTime,
				ReplyCount:     5,
			},
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			payload, err := tt.msg.Encode()
			assert.NoError(t, err)

			decoded := &NewMessageMessage{}
			err = decoded.Decode(payload)
			assert.NoError(t, err)
			assert.Equal(t, tt.msg.ID, decoded.ID)
			assert.Equal(t, tt.msg.Content, decoded.Content)
		})
	}
}

func TestJoinChannelEncodeAllBranches(t *testing.T) {
	subID := uint64(5)

	t.Run("without subchannel", func(t *testing.T) {
		msg := &JoinChannelMessage{
			ChannelID:    1,
			SubchannelID: nil,
		}
		payload, err := msg.Encode()
		assert.NoError(t, err)

		decoded := &JoinChannelMessage{}
		err = decoded.Decode(payload)
		assert.NoError(t, err)
		assert.Nil(t, decoded.SubchannelID)
	})

	t.Run("with subchannel", func(t *testing.T) {
		msg := &JoinChannelMessage{
			ChannelID:    1,
			SubchannelID: &subID,
		}
		payload, err := msg.Encode()
		assert.NoError(t, err)

		decoded := &JoinChannelMessage{}
		err = decoded.Decode(payload)
		assert.NoError(t, err)
		assert.NotNil(t, decoded.SubchannelID)
		assert.Equal(t, subID, *decoded.SubchannelID)
	})
}

func TestJoinResponseEncodeAllBranches(t *testing.T) {
	subID := uint64(5)

	t.Run("success without subchannel", func(t *testing.T) {
		msg := &JoinResponseMessage{
			Success:      true,
			ChannelID:    1,
			SubchannelID: nil,
			Message:      "",
		}
		payload, err := msg.Encode()
		assert.NoError(t, err)

		decoded := &JoinResponseMessage{}
		err = decoded.Decode(payload)
		assert.NoError(t, err)
	})

	t.Run("success with subchannel", func(t *testing.T) {
		msg := &JoinResponseMessage{
			Success:      true,
			ChannelID:    1,
			SubchannelID: &subID,
			Message:      "",
		}
		payload, err := msg.Encode()
		assert.NoError(t, err)

		decoded := &JoinResponseMessage{}
		err = decoded.Decode(payload)
		assert.NoError(t, err)
	})

	t.Run("failure", func(t *testing.T) {
		msg := &JoinResponseMessage{
			Success:      false,
			ChannelID:    1,
			SubchannelID: nil,
			Message:      "error",
		}
		payload, err := msg.Encode()
		assert.NoError(t, err)

		decoded := &JoinResponseMessage{}
		err = decoded.Decode(payload)
		assert.NoError(t, err)
	})
}

func TestWriteStringDataError(t *testing.T) {
	// Test WriteString when WriteUint16 succeeds but Write(data) fails
	w := &conditionalFailWriter{successCount: 1} // Allow WriteUint16, fail on data
	err := WriteString(w, "test")
	assert.Error(t, err)
}

func TestWriteOptionalUint64ValueError(t *testing.T) {
	// Test WriteOptionalUint64 when WriteBool succeeds but WriteUint64 fails
	w := &conditionalFailWriter{successCount: 1} // Allow WriteBool, fail on WriteUint64
	val := uint64(123)
	err := WriteOptionalUint64(w, &val)
	assert.Error(t, err)
}

func TestWriteOptionalTimestampValueError(t *testing.T) {
	// Test WriteOptionalTimestamp when WriteBool succeeds but WriteInt64 fails
	w := &conditionalFailWriter{successCount: 1} // Allow WriteBool, fail on WriteInt64
	now := time.Now()
	err := WriteOptionalTimestamp(w, &now)
	assert.Error(t, err)
}

// Test EncodeTo error paths with failing writer
func TestSetNicknameEncodeToWriteError(t *testing.T) {
	msg := &SetNicknameMessage{Nickname: "alice"}
	w := &failingWriter{}
	err := msg.EncodeTo(w)
	assert.Error(t, err)
}

func TestChannelListEncodeToWriteError(t *testing.T) {
	msg := &ChannelListMessage{
		Channels: []Channel{{ID: 1, Name: "test", Description: "desc"}},
	}
	w := &failingWriter{}
	err := msg.EncodeTo(w)
	assert.Error(t, err)
}

func TestMessageListEncodeToWriteError(t *testing.T) {
	msg := &MessageListMessage{
		ChannelID: 1,
		Messages:  []Message{{ID: 1, ChannelID: 1, AuthorNickname: "alice", Content: "test", CreatedAt: time.Now()}},
	}
	w := &failingWriter{}
	err := msg.EncodeTo(w)
	assert.Error(t, err)
}

func TestNewMessageEncodeToWriteError(t *testing.T) {
	msg := &NewMessageMessage{
		ID: 1, ChannelID: 1, AuthorNickname: "alice", Content: "test", CreatedAt: time.Now(),
	}
	w := &failingWriter{}
	err := msg.EncodeTo(w)
	assert.Error(t, err)
}

func TestAllMessageTypesEncodeToWithFailingWriter(t *testing.T) {
	w := &failingWriter{}
	now := time.Now()

	tests := []struct {
		name string
		fn   func() error
	}{
		{"NicknameResponse", func() error { return (&NicknameResponseMessage{}).EncodeTo(w) }},
		{"ListChannels", func() error { return (&ListChannelsMessage{}).EncodeTo(w) }},
		{"JoinChannel", func() error { return (&JoinChannelMessage{}).EncodeTo(w) }},
		{"JoinResponse", func() error { return (&JoinResponseMessage{}).EncodeTo(w) }},
		{"ListMessages", func() error { return (&ListMessagesMessage{}).EncodeTo(w) }},
		{"PostMessage", func() error { return (&PostMessageMessage{ChannelID: 1, Content: "x"}).EncodeTo(w) }},
		{"MessagePosted", func() error { return (&MessagePostedMessage{}).EncodeTo(w) }},
		{"DeleteMessage", func() error { return (&DeleteMessageMessage{}).EncodeTo(w) }},
		{"MessageDeleted", func() error { return (&MessageDeletedMessage{Success: true, DeletedAt: now}).EncodeTo(w) }},
		{"Ping", func() error { return (&PingMessage{}).EncodeTo(w) }},
		{"Pong", func() error { return (&PongMessage{}).EncodeTo(w) }},
		{"Error", func() error { return (&ErrorMessage{}).EncodeTo(w) }},
		{"ServerConfig", func() error { return (&ServerConfigMessage{}).EncodeTo(w) }},
		{"GetUserInfo", func() error { return (&GetUserInfoMessage{Nickname: "alice"}).EncodeTo(w) }},
		{"UserInfo", func() error { return (&UserInfoMessage{Nickname: "alice"}).EncodeTo(w) }},
		{"ListUsers", func() error { return (&ListUsersMessage{}).EncodeTo(w) }},
		{"UserList", func() error { return (&UserListMessage{Users: []UserListEntry{}}).EncodeTo(w) }},
		{"AuthRequest", func() error { return (&AuthRequestMessage{Nickname: "alice", Password: "pwd"}).EncodeTo(w) }},
		{"AuthResponse", func() error { return (&AuthResponseMessage{Success: true, UserID: 1}).EncodeTo(w) }},
		{"RegisterUser", func() error { return (&RegisterUserMessage{Password: "pwd"}).EncodeTo(w) }},
		{"RegisterResponse", func() error { return (&RegisterResponseMessage{Success: true, UserID: 1}).EncodeTo(w) }},
		{"CreateChannel", func() error { return (&CreateChannelMessage{Name: "test", DisplayName: "#test", ChannelType: 1}).EncodeTo(w) }},
		{"ChannelCreated", func() error { return (&ChannelCreatedMessage{Success: true, ChannelID: 1}).EncodeTo(w) }},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			err := tt.fn()
			assert.Error(t, err, "EncodeTo should fail with failing writer")
		})
	}
}
