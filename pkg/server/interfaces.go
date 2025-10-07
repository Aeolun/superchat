package server

import "github.com/aeolun/superchat/pkg/database"

// DatabaseStore defines the interface for database operations used by the server.
// This abstraction allows for easier testing and potential future database backends.
type DatabaseStore interface {
	// Channel operations
	ListChannels() ([]*database.Channel, error)
	ChannelExists(channelID int64) (bool, error)

	// Subchannel operations
	SubchannelExists(subchannelID int64) (bool, error)

	// Message operations
	ListRootMessages(channelID int64, subchannelID *int64, limit uint16, beforeID *uint64, afterID *uint64) ([]*database.Message, error)
	ListThreadReplies(parentID uint64, afterID *uint64) ([]*database.Message, error)
	PostMessage(channelID int64, subchannelID *int64, parentID *int64, authorUserID *int64, authorNickname, content string) (int64, *database.Message, error)
	GetMessage(messageID int64) (*database.Message, error)
	MessageExists(messageID int64) (bool, error)
	SoftDeleteMessage(messageID uint64, nickname string) (*database.Message, error)
	CountReplies(messageID int64) (uint32, error)

	// Close the database
	Close() error
}
