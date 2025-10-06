package server

import (
	"fmt"
	"sync"

	"github.com/aeolun/superchat/pkg/database"
)

// mockDB is a simple in-memory mock database for testing
type mockDB struct {
	mu       sync.RWMutex
	channels map[int64]*database.Channel
	messages map[int64]*database.Message
	nextMsgID int64
}

// newMockDB creates a new mock database
func newMockDB() *mockDB {
	return &mockDB{
		channels: make(map[int64]*database.Channel),
		messages: make(map[int64]*database.Message),
		nextMsgID: 1,
	}
}

// AddChannel adds a channel to the mock database
func (m *mockDB) AddChannel(id int64, name, description string) {
	m.mu.Lock()
	defer m.mu.Unlock()
	desc := description
	m.channels[id] = &database.Channel{
		ID:          id,
		Name:        name,
		Description: &desc,
	}
}

// ListChannels returns all channels
func (m *mockDB) ListChannels() ([]*database.Channel, error) {
	m.mu.RLock()
	defer m.mu.RUnlock()

	channels := make([]*database.Channel, 0, len(m.channels))
	for _, ch := range m.channels {
		channels = append(channels, ch)
	}
	return channels, nil
}

// ChannelExists checks if a channel exists
func (m *mockDB) ChannelExists(channelID int64) (bool, error) {
	m.mu.RLock()
	defer m.mu.RUnlock()
	_, ok := m.channels[channelID]
	return ok, nil
}

// SubchannelExists always returns false for now (V1 doesn't use subchannels)
func (m *mockDB) SubchannelExists(subchannelID int64) (bool, error) {
	return false, nil
}

// ListRootMessages returns root messages in a channel
func (m *mockDB) ListRootMessages(channelID int64, subchannelID *int64, limit uint16, beforeID *uint64) ([]*database.Message, error) {
	m.mu.RLock()
	defer m.mu.RUnlock()

	messages := make([]*database.Message, 0)
	for _, msg := range m.messages {
		if msg.ChannelID == channelID && msg.ParentID == nil {
			messages = append(messages, msg)
		}
	}
	return messages, nil
}

// ListThreadReplies returns replies to a message
func (m *mockDB) ListThreadReplies(parentID uint64) ([]*database.Message, error) {
	m.mu.RLock()
	defer m.mu.RUnlock()

	messages := make([]*database.Message, 0)
	parentIDInt := int64(parentID)
	for _, msg := range m.messages {
		if msg.ParentID != nil && *msg.ParentID == parentIDInt {
			messages = append(messages, msg)
		}
	}
	return messages, nil
}

// PostMessage creates a new message
func (m *mockDB) PostMessage(channelID int64, subchannelID *int64, parentID *int64, authorUserID *int64, authorNickname, content string) (int64, *database.Message, error) {
	m.mu.Lock()
	defer m.mu.Unlock()

	msgID := m.nextMsgID
	m.nextMsgID++

	msg := &database.Message{
		ID:             msgID,
		ChannelID:      channelID,
		SubchannelID:   subchannelID,
		ParentID:       parentID,
		AuthorUserID:   authorUserID,
		AuthorNickname: authorNickname,
		Content:        content,
		CreatedAt:      0, // timestamp not important for tests
	}

	m.messages[msgID] = msg
	return msgID, msg, nil
}

// GetMessage retrieves a message by ID
func (m *mockDB) GetMessage(messageID int64) (*database.Message, error) {
	m.mu.RLock()
	defer m.mu.RUnlock()

	msg, ok := m.messages[messageID]
	if !ok {
		return nil, fmt.Errorf("message not found")
	}
	return msg, nil
}

// MessageExists checks if a message exists
func (m *mockDB) MessageExists(messageID int64) (bool, error) {
	m.mu.RLock()
	defer m.mu.RUnlock()
	_, ok := m.messages[messageID]
	return ok, nil
}

// SoftDeleteMessage marks a message as deleted
func (m *mockDB) SoftDeleteMessage(messageID uint64, nickname string) (*database.Message, error) {
	m.mu.Lock()
	defer m.mu.Unlock()

	msg, ok := m.messages[int64(messageID)]
	if !ok {
		return nil, database.ErrMessageNotFound
	}

	if msg.AuthorNickname != nickname {
		return nil, database.ErrMessageNotOwned
	}

	if msg.DeletedAt != nil {
		return nil, database.ErrMessageAlreadyDeleted
	}

	now := int64(0) // timestamp not important for tests
	msg.DeletedAt = &now
	return msg, nil
}

// CountReplies counts replies to a message
func (m *mockDB) CountReplies(messageID int64) (uint32, error) {
	m.mu.RLock()
	defer m.mu.RUnlock()

	count := uint32(0)
	for _, msg := range m.messages {
		if msg.ParentID != nil && *msg.ParentID == messageID {
			count++
		}
	}
	return count, nil
}

// Close closes the mock database (no-op)
func (m *mockDB) Close() error {
	return nil
}
