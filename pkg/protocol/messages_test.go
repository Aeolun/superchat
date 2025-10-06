package protocol

import (
	"testing"
	"time"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestSetNicknameMessage(t *testing.T) {
	tests := []struct {
		name     string
		nickname string
		wantErr  bool
		errType  error
	}{
		{"valid nickname", "alice", false, nil},
		{"min length (3)", "bob", false, nil},
		{"max length (20)", "12345678901234567890", false, nil},
		{"too short (2)", "ab", true, ErrNicknameTooShort},
		{"too long (21)", "123456789012345678901", true, ErrNicknameTooLong},
		{"empty", "", true, ErrNicknameTooShort},
		{"with hyphen", "alice-bob", false, nil},
		{"with underscore", "alice_123", false, nil},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			msg := &SetNicknameMessage{Nickname: tt.nickname}

			// Test encode
			payload, err := msg.Encode()
			if tt.wantErr {
				assert.Error(t, err)
				assert.Equal(t, tt.errType, err)
				return
			}
			require.NoError(t, err)

			// Test decode
			decoded := &SetNicknameMessage{}
			err = decoded.Decode(payload)
			require.NoError(t, err)
			assert.Equal(t, tt.nickname, decoded.Nickname)
		})
	}
}

func TestNicknameResponseMessage(t *testing.T) {
	tests := []struct {
		name    string
		msg     NicknameResponseMessage
	}{
		{
			name: "success response",
			msg: NicknameResponseMessage{
				Success: true,
				Message: "Nickname set successfully",
			},
		},
		{
			name: "failure response",
			msg: NicknameResponseMessage{
				Success: false,
				Message: "Nickname already taken",
			},
		},
		{
			name: "empty message",
			msg: NicknameResponseMessage{
				Success: true,
				Message: "",
			},
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			payload, err := tt.msg.Encode()
			require.NoError(t, err)

			decoded := &NicknameResponseMessage{}
			err = decoded.Decode(payload)
			require.NoError(t, err)
			assert.Equal(t, tt.msg.Success, decoded.Success)
			assert.Equal(t, tt.msg.Message, decoded.Message)
		})
	}
}

func TestListChannelsMessage(t *testing.T) {
	tests := []struct {
		name string
		msg  ListChannelsMessage
	}{
		{
			name: "from beginning",
			msg: ListChannelsMessage{
				FromChannelID: 0,
				Limit:         50,
			},
		},
		{
			name: "from offset",
			msg: ListChannelsMessage{
				FromChannelID: 100,
				Limit:         100,
			},
		},
		{
			name: "max limit",
			msg: ListChannelsMessage{
				FromChannelID: 0,
				Limit:         1000,
			},
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			payload, err := tt.msg.Encode()
			require.NoError(t, err)

			decoded := &ListChannelsMessage{}
			err = decoded.Decode(payload)
			require.NoError(t, err)
			assert.Equal(t, tt.msg.FromChannelID, decoded.FromChannelID)
			assert.Equal(t, tt.msg.Limit, decoded.Limit)
		})
	}
}

func TestChannelListMessage(t *testing.T) {
	tests := []struct {
		name string
		msg  ChannelListMessage
	}{
		{
			name: "empty list",
			msg: ChannelListMessage{
				Channels: []Channel{},
			},
		},
		{
			name: "single channel",
			msg: ChannelListMessage{
				Channels: []Channel{
					{
						ID:             1,
						Name:           "general",
						Description:    "General discussion",
						UserCount:      42,
						IsOperator:     false,
						Type:           0,
						RetentionHours: 168,
					},
				},
			},
		},
		{
			name: "multiple channels",
			msg: ChannelListMessage{
				Channels: []Channel{
					{
						ID:             1,
						Name:           "general",
						Description:    "General discussion",
						UserCount:      42,
						IsOperator:     false,
						Type:           0,
						RetentionHours: 168,
					},
					{
						ID:             2,
						Name:           "tech",
						Description:    "Technical topics",
						UserCount:      15,
						IsOperator:     true,
						Type:           1,
						RetentionHours: 720,
					},
				},
			},
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			payload, err := tt.msg.Encode()
			require.NoError(t, err)

			decoded := &ChannelListMessage{}
			err = decoded.Decode(payload)
			require.NoError(t, err)
			assert.Equal(t, len(tt.msg.Channels), len(decoded.Channels))

			for i, ch := range tt.msg.Channels {
				assert.Equal(t, ch.ID, decoded.Channels[i].ID)
				assert.Equal(t, ch.Name, decoded.Channels[i].Name)
				assert.Equal(t, ch.Description, decoded.Channels[i].Description)
				assert.Equal(t, ch.UserCount, decoded.Channels[i].UserCount)
				assert.Equal(t, ch.IsOperator, decoded.Channels[i].IsOperator)
				assert.Equal(t, ch.Type, decoded.Channels[i].Type)
				assert.Equal(t, ch.RetentionHours, decoded.Channels[i].RetentionHours)
			}
		})
	}
}

func TestJoinChannelMessage(t *testing.T) {
	subchannelID := uint64(5)

	tests := []struct {
		name string
		msg  JoinChannelMessage
	}{
		{
			name: "without subchannel",
			msg: JoinChannelMessage{
				ChannelID:    1,
				SubchannelID: nil,
			},
		},
		{
			name: "with subchannel",
			msg: JoinChannelMessage{
				ChannelID:    1,
				SubchannelID: &subchannelID,
			},
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			payload, err := tt.msg.Encode()
			require.NoError(t, err)

			decoded := &JoinChannelMessage{}
			err = decoded.Decode(payload)
			require.NoError(t, err)
			assert.Equal(t, tt.msg.ChannelID, decoded.ChannelID)

			if tt.msg.SubchannelID == nil {
				assert.Nil(t, decoded.SubchannelID)
			} else {
				require.NotNil(t, decoded.SubchannelID)
				assert.Equal(t, *tt.msg.SubchannelID, *decoded.SubchannelID)
			}
		})
	}
}

func TestJoinResponseMessage(t *testing.T) {
	subchannelID := uint64(5)

	tests := []struct {
		name string
		msg  JoinResponseMessage
	}{
		{
			name: "success without subchannel",
			msg: JoinResponseMessage{
				Success:      true,
				ChannelID:    1,
				SubchannelID: nil,
				Message:      "Joined successfully",
			},
		},
		{
			name: "success with subchannel",
			msg: JoinResponseMessage{
				Success:      true,
				ChannelID:    1,
				SubchannelID: &subchannelID,
				Message:      "",
			},
		},
		{
			name: "failure",
			msg: JoinResponseMessage{
				Success:      false,
				ChannelID:    999,
				SubchannelID: nil,
				Message:      "Channel not found",
			},
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			payload, err := tt.msg.Encode()
			require.NoError(t, err)

			decoded := &JoinResponseMessage{}
			err = decoded.Decode(payload)
			require.NoError(t, err)
			assert.Equal(t, tt.msg.Success, decoded.Success)
			assert.Equal(t, tt.msg.ChannelID, decoded.ChannelID)
			assert.Equal(t, tt.msg.Message, decoded.Message)

			if tt.msg.SubchannelID == nil {
				assert.Nil(t, decoded.SubchannelID)
			} else {
				require.NotNil(t, decoded.SubchannelID)
				assert.Equal(t, *tt.msg.SubchannelID, *decoded.SubchannelID)
			}
		})
	}
}

func TestListMessagesMessage(t *testing.T) {
	subchannelID := uint64(5)
	beforeID := uint64(100)
	parentID := uint64(50)

	tests := []struct {
		name string
		msg  ListMessagesMessage
	}{
		{
			name: "root messages, no filters",
			msg: ListMessagesMessage{
				ChannelID:    1,
				SubchannelID: nil,
				Limit:        50,
				BeforeID:     nil,
				ParentID:     nil,
			},
		},
		{
			name: "with subchannel",
			msg: ListMessagesMessage{
				ChannelID:    1,
				SubchannelID: &subchannelID,
				Limit:        100,
				BeforeID:     nil,
				ParentID:     nil,
			},
		},
		{
			name: "with pagination",
			msg: ListMessagesMessage{
				ChannelID:    1,
				SubchannelID: nil,
				Limit:        50,
				BeforeID:     &beforeID,
				ParentID:     nil,
			},
		},
		{
			name: "thread view",
			msg: ListMessagesMessage{
				ChannelID:    1,
				SubchannelID: nil,
				Limit:        200,
				BeforeID:     nil,
				ParentID:     &parentID,
			},
		},
		{
			name: "all filters",
			msg: ListMessagesMessage{
				ChannelID:    1,
				SubchannelID: &subchannelID,
				Limit:        50,
				BeforeID:     &beforeID,
				ParentID:     &parentID,
			},
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			payload, err := tt.msg.Encode()
			require.NoError(t, err)

			decoded := &ListMessagesMessage{}
			err = decoded.Decode(payload)
			require.NoError(t, err)
			assert.Equal(t, tt.msg.ChannelID, decoded.ChannelID)
			assert.Equal(t, tt.msg.Limit, decoded.Limit)

			// Check optional fields
			if tt.msg.SubchannelID == nil {
				assert.Nil(t, decoded.SubchannelID)
			} else {
				require.NotNil(t, decoded.SubchannelID)
				assert.Equal(t, *tt.msg.SubchannelID, *decoded.SubchannelID)
			}

			if tt.msg.BeforeID == nil {
				assert.Nil(t, decoded.BeforeID)
			} else {
				require.NotNil(t, decoded.BeforeID)
				assert.Equal(t, *tt.msg.BeforeID, *decoded.BeforeID)
			}

			if tt.msg.ParentID == nil {
				assert.Nil(t, decoded.ParentID)
			} else {
				require.NotNil(t, decoded.ParentID)
				assert.Equal(t, *tt.msg.ParentID, *decoded.ParentID)
			}
		})
	}
}

func TestMessageListMessage(t *testing.T) {
	now := time.Now()
	editedTime := now.Add(5 * time.Minute)

	subchannelID := uint64(5)
	parentID := uint64(10)
	authorUserID := uint64(42)

	tests := []struct {
		name string
		msg  MessageListMessage
	}{
		{
			name: "empty list",
			msg: MessageListMessage{
				ChannelID:    1,
				SubchannelID: nil,
				ParentID:     nil,
				Messages:     []Message{},
			},
		},
		{
			name: "single message",
			msg: MessageListMessage{
				ChannelID:    1,
				SubchannelID: nil,
				ParentID:     nil,
				Messages: []Message{
					{
						ID:             1,
						ChannelID:      1,
						SubchannelID:   nil,
						ParentID:       nil,
						AuthorUserID:   &authorUserID,
						AuthorNickname: "alice",
						Content:        "Hello, world!",
						CreatedAt:      now,
						EditedAt:       nil,
						ReplyCount:     5,
					},
				},
			},
		},
		{
			name: "multiple messages with all fields",
			msg: MessageListMessage{
				ChannelID:    1,
				SubchannelID: &subchannelID,
				ParentID:     &parentID,
				Messages: []Message{
					{
						ID:             1,
						ChannelID:      1,
						SubchannelID:   &subchannelID,
						ParentID:       nil,
						AuthorUserID:   &authorUserID,
						AuthorNickname: "alice",
						Content:        "Root message",
						CreatedAt:      now,
						EditedAt:       nil,
						ReplyCount:     2,
					},
					{
						ID:             2,
						ChannelID:      1,
						SubchannelID:   &subchannelID,
						ParentID:       &parentID,
						AuthorUserID:   nil, // Anonymous user
						AuthorNickname: "bob",
						Content:        "Reply message",
						CreatedAt:      now.Add(time.Minute),
						EditedAt:       &editedTime,
						ReplyCount:     0,
					},
				},
			},
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			payload, err := tt.msg.Encode()
			require.NoError(t, err)

			decoded := &MessageListMessage{}
			err = decoded.Decode(payload)
			require.NoError(t, err)

			assert.Equal(t, tt.msg.ChannelID, decoded.ChannelID)
			assert.Equal(t, len(tt.msg.Messages), len(decoded.Messages))

			for i, msg := range tt.msg.Messages {
				dec := decoded.Messages[i]
				assert.Equal(t, msg.ID, dec.ID)
				assert.Equal(t, msg.ChannelID, dec.ChannelID)
				assert.Equal(t, msg.AuthorNickname, dec.AuthorNickname)
				assert.Equal(t, msg.Content, dec.Content)
				assert.Equal(t, msg.ReplyCount, dec.ReplyCount)

				assert.InDelta(t, msg.CreatedAt.UnixMilli(), dec.CreatedAt.UnixMilli(), 1)

				// Check optional fields
				if msg.SubchannelID == nil {
					assert.Nil(t, dec.SubchannelID)
				} else {
					require.NotNil(t, dec.SubchannelID)
					assert.Equal(t, *msg.SubchannelID, *dec.SubchannelID)
				}

				if msg.ParentID == nil {
					assert.Nil(t, dec.ParentID)
				} else {
					require.NotNil(t, dec.ParentID)
					assert.Equal(t, *msg.ParentID, *dec.ParentID)
				}

				if msg.AuthorUserID == nil {
					assert.Nil(t, dec.AuthorUserID)
				} else {
					require.NotNil(t, dec.AuthorUserID)
					assert.Equal(t, *msg.AuthorUserID, *dec.AuthorUserID)
				}

				if msg.EditedAt == nil {
					assert.Nil(t, dec.EditedAt)
				} else {
					require.NotNil(t, dec.EditedAt)
					assert.InDelta(t, msg.EditedAt.UnixMilli(), dec.EditedAt.UnixMilli(), 1)
				}
			}
		})
	}
}

func TestPostMessageMessage(t *testing.T) {
	subchannelID := uint64(5)
	parentID := uint64(10)

	tests := []struct {
		name    string
		msg     PostMessageMessage
		wantErr bool
		errType error
	}{
		{
			name: "root message",
			msg: PostMessageMessage{
				ChannelID:    1,
				SubchannelID: nil,
				ParentID:     nil,
				Content:      "Hello, world!",
			},
			wantErr: false,
		},
		{
			name: "reply message",
			msg: PostMessageMessage{
				ChannelID:    1,
				SubchannelID: nil,
				ParentID:     &parentID,
				Content:      "This is a reply",
			},
			wantErr: false,
		},
		{
			name: "with subchannel",
			msg: PostMessageMessage{
				ChannelID:    1,
				SubchannelID: &subchannelID,
				ParentID:     nil,
				Content:      "In subchannel",
			},
			wantErr: false,
		},
		{
			name: "max length (4096)",
			msg: PostMessageMessage{
				ChannelID:    1,
				SubchannelID: nil,
				ParentID:     nil,
				Content:      string(make([]byte, 4096)),
			},
			wantErr: false,
		},
		{
			name: "empty content",
			msg: PostMessageMessage{
				ChannelID: 1,
				Content:   "",
			},
			wantErr: true,
			errType: ErrEmptyContent,
		},
		{
			name: "too long content",
			msg: PostMessageMessage{
				ChannelID: 1,
				Content:   string(make([]byte, 4097)),
			},
			wantErr: true,
			errType: ErrMessageTooLong,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			payload, err := tt.msg.Encode()
			if tt.wantErr {
				assert.Error(t, err)
				assert.Equal(t, tt.errType, err)
				return
			}
			require.NoError(t, err)

			decoded := &PostMessageMessage{}
			err = decoded.Decode(payload)
			require.NoError(t, err)
			assert.Equal(t, tt.msg.ChannelID, decoded.ChannelID)
			assert.Equal(t, tt.msg.Content, decoded.Content)

			if tt.msg.SubchannelID == nil {
				assert.Nil(t, decoded.SubchannelID)
			} else {
				require.NotNil(t, decoded.SubchannelID)
				assert.Equal(t, *tt.msg.SubchannelID, *decoded.SubchannelID)
			}

			if tt.msg.ParentID == nil {
				assert.Nil(t, decoded.ParentID)
			} else {
				require.NotNil(t, decoded.ParentID)
				assert.Equal(t, *tt.msg.ParentID, *decoded.ParentID)
			}
		})
	}
}

func TestMessagePostedMessage(t *testing.T) {
	tests := []struct {
		name string
		msg  MessagePostedMessage
	}{
		{
			name: "success",
			msg: MessagePostedMessage{
				Success:   true,
				MessageID: 123,
				Message:   "",
			},
		},
		{
			name: "failure",
			msg: MessagePostedMessage{
				Success:   false,
				MessageID: 0,
				Message:   "Rate limit exceeded",
			},
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			payload, err := tt.msg.Encode()
			require.NoError(t, err)

			decoded := &MessagePostedMessage{}
			err = decoded.Decode(payload)
			require.NoError(t, err)
			assert.Equal(t, tt.msg.Success, decoded.Success)
			assert.Equal(t, tt.msg.MessageID, decoded.MessageID)
			assert.Equal(t, tt.msg.Message, decoded.Message)
		})
	}
}

func TestDeleteMessageMessage(t *testing.T) {
	msg := &DeleteMessageMessage{MessageID: 123}

	payload, err := msg.Encode()
	require.NoError(t, err)

	decoded := &DeleteMessageMessage{}
	err = decoded.Decode(payload)
	require.NoError(t, err)
	assert.Equal(t, msg.MessageID, decoded.MessageID)
}

func TestMessageDeletedMessage(t *testing.T) {
	now := time.Now()

	tests := []struct {
		name string
		msg  MessageDeletedMessage
	}{
		{
			name: "success",
			msg: MessageDeletedMessage{
				Success:   true,
				MessageID: 123,
				DeletedAt: now,
				Message:   "",
			},
		},
		{
			name: "failure",
			msg: MessageDeletedMessage{
				Success:   false,
				MessageID: 123,
				DeletedAt: time.Time{}, // Not used when Success=false
				Message:   "Not your message",
			},
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			payload, err := tt.msg.Encode()
			require.NoError(t, err)

			decoded := &MessageDeletedMessage{}
			err = decoded.Decode(payload)
			require.NoError(t, err)
			assert.Equal(t, tt.msg.Success, decoded.Success)
			assert.Equal(t, tt.msg.MessageID, decoded.MessageID)
			assert.Equal(t, tt.msg.Message, decoded.Message)

			if tt.msg.Success {
				assert.InDelta(t, tt.msg.DeletedAt.UnixMilli(), decoded.DeletedAt.UnixMilli(), 1)
			}
		})
	}
}

func TestPingMessage(t *testing.T) {
	now := time.Now().UnixMilli()
	msg := &PingMessage{Timestamp: now}

	payload, err := msg.Encode()
	require.NoError(t, err)

	decoded := &PingMessage{}
	err = decoded.Decode(payload)
	require.NoError(t, err)
	assert.Equal(t, msg.Timestamp, decoded.Timestamp)
}

func TestPongMessage(t *testing.T) {
	now := time.Now().UnixMilli()
	msg := &PongMessage{ClientTimestamp: now}

	payload, err := msg.Encode()
	require.NoError(t, err)

	decoded := &PongMessage{}
	err = decoded.Decode(payload)
	require.NoError(t, err)
	assert.Equal(t, msg.ClientTimestamp, decoded.ClientTimestamp)
}

func TestErrorMessage(t *testing.T) {
	tests := []struct {
		name string
		msg  ErrorMessage
	}{
		{
			name: "protocol error",
			msg: ErrorMessage{
				ErrorCode: ErrCodeInvalidFormat,
				Message:   "Invalid message format",
			},
		},
		{
			name: "auth error",
			msg: ErrorMessage{
				ErrorCode: ErrCodeAuthRequired,
				Message:   "Authentication required",
			},
		},
		{
			name: "not found",
			msg: ErrorMessage{
				ErrorCode: ErrCodeChannelNotFound,
				Message:   "Channel not found",
			},
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			payload, err := tt.msg.Encode()
			require.NoError(t, err)

			decoded := &ErrorMessage{}
			err = decoded.Decode(payload)
			require.NoError(t, err)
			assert.Equal(t, tt.msg.ErrorCode, decoded.ErrorCode)
			assert.Equal(t, tt.msg.Message, decoded.Message)
		})
	}
}

func TestServerConfigMessage(t *testing.T) {
	msg := &ServerConfigMessage{
		ProtocolVersion:      1,
		MaxMessageRate:       10,
		MaxChannelCreates:    5,
		InactiveCleanupDays:  90,
		MaxConnectionsPerIP:  10,
		MaxMessageLength:     4096,
	}

	payload, err := msg.Encode()
	require.NoError(t, err)

	decoded := &ServerConfigMessage{}
	err = decoded.Decode(payload)
	require.NoError(t, err)
	assert.Equal(t, msg.ProtocolVersion, decoded.ProtocolVersion)
	assert.Equal(t, msg.MaxMessageRate, decoded.MaxMessageRate)
	assert.Equal(t, msg.MaxChannelCreates, decoded.MaxChannelCreates)
	assert.Equal(t, msg.InactiveCleanupDays, decoded.InactiveCleanupDays)
	assert.Equal(t, msg.MaxConnectionsPerIP, decoded.MaxConnectionsPerIP)
	assert.Equal(t, msg.MaxMessageLength, decoded.MaxMessageLength)
}

func TestNewMessageMessage(t *testing.T) {
	now := time.Now()
	editedTime := now.Add(5 * time.Minute)

	subchannelID := uint64(5)
	parentID := uint64(10)
	authorUserID := uint64(42)

	tests := []struct {
		name string
		msg  NewMessageMessage
	}{
		{
			name: "root message",
			msg: NewMessageMessage{
				ID:             1,
				ChannelID:      1,
				SubchannelID:   nil,
				ParentID:       nil,
				AuthorUserID:   &authorUserID,
				AuthorNickname: "alice",
				Content:        "Hello, world!",
				CreatedAt:      now,
				EditedAt:       nil,
				ReplyCount:     0,
			},
		},
		{
			name: "reply with all fields",
			msg: NewMessageMessage{
				ID:             2,
				ChannelID:      1,
				SubchannelID:   &subchannelID,
				ParentID:       &parentID,
				AuthorUserID:   nil, // Anonymous
				AuthorNickname: "bob",
				Content:        "This is a reply",
				CreatedAt:      now,
				EditedAt:       &editedTime,
				ReplyCount:     0,
			},
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			payload, err := tt.msg.Encode()
			require.NoError(t, err)

			decoded := &NewMessageMessage{}
			err = decoded.Decode(payload)
			require.NoError(t, err)

			assert.Equal(t, tt.msg.ID, decoded.ID)
			assert.Equal(t, tt.msg.ChannelID, decoded.ChannelID)
			assert.Equal(t, tt.msg.AuthorNickname, decoded.AuthorNickname)
			assert.Equal(t, tt.msg.Content, decoded.Content)
			assert.Equal(t, tt.msg.ReplyCount, decoded.ReplyCount)
			assert.InDelta(t, tt.msg.CreatedAt.UnixMilli(), decoded.CreatedAt.UnixMilli(), 1)

			// Check optional fields
			if tt.msg.SubchannelID == nil {
				assert.Nil(t, decoded.SubchannelID)
			} else {
				require.NotNil(t, decoded.SubchannelID)
				assert.Equal(t, *tt.msg.SubchannelID, *decoded.SubchannelID)
			}

			if tt.msg.ParentID == nil {
				assert.Nil(t, decoded.ParentID)
			} else {
				require.NotNil(t, decoded.ParentID)
				assert.Equal(t, *tt.msg.ParentID, *decoded.ParentID)
			}

			if tt.msg.AuthorUserID == nil {
				assert.Nil(t, decoded.AuthorUserID)
			} else {
				require.NotNil(t, decoded.AuthorUserID)
				assert.Equal(t, *tt.msg.AuthorUserID, *decoded.AuthorUserID)
			}

			if tt.msg.EditedAt == nil {
				assert.Nil(t, decoded.EditedAt)
			} else {
				require.NotNil(t, decoded.EditedAt)
				assert.InDelta(t, tt.msg.EditedAt.UnixMilli(), decoded.EditedAt.UnixMilli(), 1)
			}
		})
	}
}

func TestMessageTypeConstants(t *testing.T) {
	// Test that message type constants have expected values
	assert.Equal(t, 0x02, TypeSetNickname)
	assert.Equal(t, 0x04, TypeListChannels)
	assert.Equal(t, 0x05, TypeJoinChannel)
	assert.Equal(t, 0x06, TypeLeaveChannel)
	assert.Equal(t, 0x09, TypeListMessages)
	assert.Equal(t, 0x0A, TypePostMessage)
	assert.Equal(t, 0x0C, TypeDeleteMessage)
	assert.Equal(t, 0x10, TypePing)

	assert.Equal(t, 0x82, TypeNicknameResponse)
	assert.Equal(t, 0x84, TypeChannelList)
	assert.Equal(t, 0x85, TypeJoinResponse)
	assert.Equal(t, 0x86, TypeLeaveResponse)
	assert.Equal(t, 0x89, TypeMessageList)
	assert.Equal(t, 0x8A, TypeMessagePosted)
	assert.Equal(t, 0x8B, TypeMessageEdited)
	assert.Equal(t, 0x8C, TypeMessageDeleted)
	assert.Equal(t, 0x8D, TypeNewMessage)
	assert.Equal(t, 0x90, TypePong)
	assert.Equal(t, 0x91, TypeError)
	assert.Equal(t, 0x98, TypeServerConfig)
}

func TestErrorCodeConstants(t *testing.T) {
	// Test that error code constants are in correct ranges
	assert.Equal(t, 1000, ErrCodeInvalidFormat)
	assert.Equal(t, 1001, ErrCodeUnsupportedVersion)
	assert.Equal(t, 2000, ErrCodeAuthRequired)
	assert.Equal(t, 3000, ErrCodePermissionDenied)
	assert.Equal(t, 4000, ErrCodeNotFound)
	assert.Equal(t, 5000, ErrCodeRateLimitExceeded)
	assert.Equal(t, 6000, ErrCodeInvalidInput)
	assert.Equal(t, 9000, ErrCodeInternalError)
}
