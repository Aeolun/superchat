package protocol

import (
	"testing"
	"time"

	"github.com/stretchr/testify/assert"
)

// Additional targeted error tests to improve coverage to 90%+
// These tests target specific uncovered error paths in EncodeTo methods

func TestMessageListEncodeToAllErrorPaths(t *testing.T) {
	now := time.Now()
	subID := uint64(5)
	parentID := uint64(10)
	authorID := uint64(42)
	editTime := now.Add(time.Minute)

	msg := &MessageListMessage{
		ChannelID:    1,
		SubchannelID: &subID,
		ParentID:     &parentID,
		Messages: []Message{
			{
				ID:             1,
				ChannelID:      1,
				SubchannelID:   &subID,
				ParentID:       &parentID,
				AuthorUserID:   &authorID,
				AuthorNickname: "alice",
				Content:        "test",
				CreatedAt:      now,
				EditedAt:       &editTime,
				ReplyCount:     5,
			},
		},
	}

	// Test failure at various points in the message loop
	tests := []struct {
		name         string
		successCount int
	}{
		{"fail on channelID", 3},          // After header fields
		{"fail on message ID", 4},         // First field of message
		{"fail on message channelID", 5},  // Second field
		{"fail on subchannel", 6},         // Third field
		{"fail on parentID", 7},           // Fourth field
		{"fail on authorUserID", 8},       // Fifth field
		{"fail on authorNickname", 9},     // Sixth field
		{"fail on content", 10},           // Seventh field
		{"fail on createdAt", 11},         // Eighth field
		{"fail on editedAt", 12},          // Ninth field
		{"fail on replyCount", 13},        // Tenth field
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			w := &partialFailWriter{successCount: tt.successCount}
			err := msg.EncodeTo(w)
			assert.Error(t, err)
		})
	}
}

func TestPostMessageEncodeToAllErrorPaths(t *testing.T) {
	subID := uint64(5)
	parentID := uint64(10)

	msg := &PostMessageMessage{
		ChannelID:    1,
		SubchannelID: &subID,
		ParentID:     &parentID,
		Content:      "test message",
	}

	tests := []struct {
		name         string
		successCount int
	}{
		{"fail on channelID", 0},
		{"fail on subchannelID", 1},
		{"fail on parentID", 2},
		{"fail on content", 3},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			w := &partialFailWriter{successCount: tt.successCount}
			err := msg.EncodeTo(w)
			assert.Error(t, err)
		})
	}
}

func TestServerConfigEncodeToAllErrorPaths(t *testing.T) {
	msg := &ServerConfigMessage{
		ProtocolVersion:         1,
		MaxMessageRate:          10,
		MaxChannelCreates:       5,
		InactiveCleanupDays:     30,
		MaxConnectionsPerIP:     100,
		MaxMessageLength:        4000,
		MaxThreadSubscriptions:  50,
		MaxChannelSubscriptions: 20,
	}

	tests := []struct {
		name         string
		successCount int
	}{
		{"fail on ProtocolVersion", 0},
		{"fail on MaxMessageRate", 1},
		{"fail on MaxChannelCreates", 2},
		{"fail on InactiveCleanupDays", 3},
		{"fail on MaxConnectionsPerIP", 4},
		{"fail on MaxMessageLength", 5},
		{"fail on MaxThreadSubscriptions", 6},
		{"fail on MaxChannelSubscriptions", 7},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			w := &partialFailWriter{successCount: tt.successCount}
			err := msg.EncodeTo(w)
			assert.Error(t, err)
		})
	}
}

func TestNewMessageEncodeToAllErrorPaths(t *testing.T) {
	now := time.Now()
	subID := uint64(5)
	parentID := uint64(10)
	authorID := uint64(42)
	editTime := now.Add(time.Minute)

	msg := &NewMessageMessage{
		ID:             1,
		ChannelID:      2,
		SubchannelID:   &subID,
		ParentID:       &parentID,
		AuthorUserID:   &authorID,
		AuthorNickname: "alice",
		Content:        "new message",
		CreatedAt:      now,
		EditedAt:       &editTime,
		ReplyCount:     3,
	}

	tests := []struct {
		name         string
		successCount int
	}{
		{"fail on ID", 0},
		{"fail on ChannelID", 1},
		{"fail on SubchannelID", 2},
		{"fail on ParentID", 3},
		{"fail on AuthorUserID", 4},
		{"fail on AuthorNickname", 5},
		{"fail on Content", 6},
		{"fail on CreatedAt", 7},
		{"fail on EditedAt", 8},
		{"fail on ReplyCount", 9},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			w := &partialFailWriter{successCount: tt.successCount}
			err := msg.EncodeTo(w)
			assert.Error(t, err)
		})
	}
}

func TestChannelListEncodeToAllErrorPaths(t *testing.T) {
	msg := &ChannelListMessage{
		Channels: []Channel{
			{
				ID:             1,
				Name:           "test",
				Description:    "desc",
				UserCount:      10,
				IsOperator:     true,
				Type:           1,
				RetentionHours: 168,
			},
		},
	}

	tests := []struct {
		name         string
		successCount int
	}{
		{"fail on count", 0},
		{"fail on channel ID", 1},
		{"fail on channel name", 2},
		{"fail on description", 3},
		{"fail on user count", 4},
		{"fail on is_operator", 5},
		{"fail on type", 6},
		{"fail on retention", 7},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			w := &partialFailWriter{successCount: tt.successCount}
			err := msg.EncodeTo(w)
			assert.Error(t, err)
		})
	}
}

func TestMessagePostedEncodeToAllErrorPaths(t *testing.T) {
	msg := &MessagePostedMessage{
		Success:   true,
		MessageID: 123,
		Message:   "ok",
	}

	tests := []struct {
		name         string
		successCount int
	}{
		{"fail on Success", 0},
		{"fail on MessageID", 1},
		{"fail on Message", 2},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			w := &partialFailWriter{successCount: tt.successCount}
			err := msg.EncodeTo(w)
			assert.Error(t, err)
		})
	}
}

func TestMessageDeletedEncodeToAllErrorPaths(t *testing.T) {
	msg := &MessageDeletedMessage{
		Success:   true,
		MessageID: 123,
		DeletedAt: time.Now(),
		Message:   "",
	}

	tests := []struct {
		name         string
		successCount int
	}{
		{"fail on Success", 0},
		{"fail on MessageID", 1},
		{"fail on DeletedAt", 2},
		{"fail on Message", 3},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			w := &partialFailWriter{successCount: tt.successCount}
			err := msg.EncodeTo(w)
			assert.Error(t, err)
		})
	}
}

func TestJoinResponseEncodeToAllErrorPaths(t *testing.T) {
	subID := uint64(5)
	msg := &JoinResponseMessage{
		Success:      true,
		ChannelID:    1,
		SubchannelID: &subID,
		Message:      "joined",
	}

	tests := []struct {
		name         string
		successCount int
	}{
		{"fail on Success", 0},
		{"fail on ChannelID", 1},
		{"fail on SubchannelID", 2},
		{"fail on Message", 3},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			w := &partialFailWriter{successCount: tt.successCount}
			err := msg.EncodeTo(w)
			assert.Error(t, err)
		})
	}
}

// Additional decode error tests for better coverage

func TestListMessagesDecodeErrorPaths(t *testing.T) {
	t.Run("truncated after channelID", func(t *testing.T) {
		msg := &ListMessagesMessage{}
		// Only channelID, missing subchannel optional
		payload := []byte{0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x01}
		err := msg.Decode(payload)
		assert.Error(t, err)
	})

	t.Run("truncated after subchannel", func(t *testing.T) {
		msg := &ListMessagesMessage{}
		// channelID + subchannel(nil), missing parent
		payload := []byte{
			0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x01, // channelID
			0x00, // subchannel = nil
		}
		err := msg.Decode(payload)
		assert.Error(t, err)
	})

	t.Run("truncated after parent", func(t *testing.T) {
		msg := &ListMessagesMessage{}
		// channelID + subchannel(nil) + parent(nil), missing limit
		payload := []byte{
			0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x01, // channelID
			0x00, // subchannel = nil
			0x00, // parent = nil
		}
		err := msg.Decode(payload)
		assert.Error(t, err)
	})

	t.Run("truncated after limit", func(t *testing.T) {
		msg := &ListMessagesMessage{}
		// channelID + subchannel(nil) + parent(nil) + limit, missing beforeID
		payload := []byte{
			0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x01, // channelID
			0x00,       // subchannel = nil
			0x00,       // parent = nil
			0x00, 0x0A, // limit = 10
		}
		err := msg.Decode(payload)
		assert.Error(t, err)
	})
}

func TestMessageListDecodeMoreErrorPaths(t *testing.T) {
	t.Run("truncated after channelID", func(t *testing.T) {
		msg := &MessageListMessage{}
		payload := []byte{0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x01}
		err := msg.Decode(payload)
		assert.Error(t, err)
	})

	t.Run("truncated after subchannel", func(t *testing.T) {
		msg := &MessageListMessage{}
		payload := []byte{
			0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x01, // channelID
			0x00, // subchannel = nil
		}
		err := msg.Decode(payload)
		assert.Error(t, err)
	})

	t.Run("truncated message in loop", func(t *testing.T) {
		msg := &MessageListMessage{}
		payload := []byte{
			0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x01, // channelID
			0x00, // subchannel = nil
			0x00, // parent = nil
			0x00, 0x01, // count = 1
			0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x01, // message ID
			// Missing rest of message
		}
		err := msg.Decode(payload)
		assert.Error(t, err)
	})
}

func TestPostMessageDecodeErrorPaths(t *testing.T) {
	t.Run("truncated after channelID", func(t *testing.T) {
		msg := &PostMessageMessage{}
		payload := []byte{0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x01}
		err := msg.Decode(payload)
		assert.Error(t, err)
	})

	t.Run("truncated after subchannel", func(t *testing.T) {
		msg := &PostMessageMessage{}
		payload := []byte{
			0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x01, // channelID
			0x00, // subchannel = nil
		}
		err := msg.Decode(payload)
		assert.Error(t, err)
	})

	t.Run("truncated after parent", func(t *testing.T) {
		msg := &PostMessageMessage{}
		payload := []byte{
			0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x01, // channelID
			0x00, // subchannel = nil
			0x00, // parent = nil
		}
		err := msg.Decode(payload)
		assert.Error(t, err)
	})
}

func TestServerConfigDecodeErrorPaths(t *testing.T) {
	t.Run("truncated after first field", func(t *testing.T) {
		msg := &ServerConfigMessage{}
		payload := []byte{0x01} // Only ProtocolVersion
		err := msg.Decode(payload)
		assert.Error(t, err)
	})

	t.Run("truncated after second field", func(t *testing.T) {
		msg := &ServerConfigMessage{}
		payload := []byte{0x01, 0x00, 0x0A} // ProtocolVersion + partial MaxMessageRate
		err := msg.Decode(payload)
		assert.Error(t, err)
	})
}

func TestNewMessageDecodeErrorPaths(t *testing.T) {
	t.Run("truncated after ID", func(t *testing.T) {
		msg := &NewMessageMessage{}
		payload := []byte{0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x01}
		err := msg.Decode(payload)
		assert.Error(t, err)
	})

	t.Run("truncated after channelID", func(t *testing.T) {
		msg := &NewMessageMessage{}
		payload := []byte{
			0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x01, // ID
			0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x01, // ChannelID
		}
		err := msg.Decode(payload)
		assert.Error(t, err)
	})
}

func TestMessagePostedDecodeErrorPaths(t *testing.T) {
	t.Run("truncated after success", func(t *testing.T) {
		msg := &MessagePostedMessage{}
		payload := []byte{0x01} // Only success
		err := msg.Decode(payload)
		assert.Error(t, err)
	})

	t.Run("truncated after messageID", func(t *testing.T) {
		msg := &MessagePostedMessage{}
		payload := []byte{
			0x01,                                           // success
			0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x7B, // messageID = 123
		}
		err := msg.Decode(payload)
		assert.Error(t, err)
	})
}

func TestMessageDeletedDecodeErrorPaths(t *testing.T) {
	t.Run("truncated after success", func(t *testing.T) {
		msg := &MessageDeletedMessage{}
		payload := []byte{0x01} // Only success
		err := msg.Decode(payload)
		assert.Error(t, err)
	})

	t.Run("truncated after messageID", func(t *testing.T) {
		msg := &MessageDeletedMessage{}
		payload := []byte{
			0x01,                                           // success
			0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x7B, // messageID = 123
		}
		err := msg.Decode(payload)
		assert.Error(t, err)
	})

	t.Run("truncated after deletedAt", func(t *testing.T) {
		msg := &MessageDeletedMessage{}
		payload := []byte{
			0x01,                                           // success
			0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x7B, // messageID = 123
			0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, // deletedAt
		}
		err := msg.Decode(payload)
		assert.Error(t, err)
	})
}

func TestJoinResponseDecodeErrorPaths(t *testing.T) {
	t.Run("truncated after success", func(t *testing.T) {
		msg := &JoinResponseMessage{}
		payload := []byte{0x01} // Only success
		err := msg.Decode(payload)
		assert.Error(t, err)
	})

	t.Run("truncated after channelID", func(t *testing.T) {
		msg := &JoinResponseMessage{}
		payload := []byte{
			0x01,                                           // success
			0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x01, // channelID
		}
		err := msg.Decode(payload)
		assert.Error(t, err)
	})

	t.Run("truncated after subchannel", func(t *testing.T) {
		msg := &JoinResponseMessage{}
		payload := []byte{
			0x01,                                           // success
			0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x01, // channelID
			0x00, // subchannel = nil
		}
		err := msg.Decode(payload)
		assert.Error(t, err)
	})
}

func TestListMessagesDecodeErrorWithBeforeID(t *testing.T) {
	t.Run("truncated before beforeID", func(t *testing.T) {
		msg := &ListMessagesMessage{}
		payload := []byte{
			0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x01, // channelID
			0x00,       // subchannel = nil
			0x00,       // parent = nil
			0x00, 0x0A, // limit = 10
			0x01, // beforeID present
			// Missing the uint64 value
		}
		err := msg.Decode(payload)
		assert.Error(t, err)
	})
}

func TestUnsubscribeChannelDecodeErrorPath(t *testing.T) {
	t.Run("truncated after channelID", func(t *testing.T) {
		msg := &UnsubscribeChannelMessage{}
		payload := []byte{0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x01}
		err := msg.Decode(payload)
		assert.Error(t, err)
	})

	t.Run("truncated in subchannel optional", func(t *testing.T) {
		msg := &UnsubscribeChannelMessage{}
		payload := []byte{
			0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x01, // channelID
			0x01, // subchannel present
			// Missing the uint64 value
		}
		err := msg.Decode(payload)
		assert.Error(t, err)
	})
}
