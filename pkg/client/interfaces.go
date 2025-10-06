package client

import (
	"github.com/aeolun/superchat/pkg/protocol"
)

// ConnectionInterface defines the interface for client connections
// This allows for mocking in tests while the real Connection implements all these methods
type ConnectionInterface interface {
	// Connection management
	Connect() error
	Disconnect()
	Close()
	IsConnected() bool
	GetAddress() string

	// Message sending
	Send(frame *protocol.Frame) error
	SendMessage(msgType uint8, msg interface{}) error

	// Channels for receiving data
	Incoming() <-chan *protocol.Frame
	Errors() <-chan error
	StateChanges() <-chan ConnectionStateUpdate

	// Configuration
	DisableAutoReconnect()
}

// StateInterface defines the interface for client state persistence
// This allows for mocking in tests while the real State implements all these methods
type StateInterface interface {
	// Configuration
	GetConfig(key string) (string, error)
	SetConfig(key, value string) error

	// Nickname management
	GetLastNickname() string
	SetLastNickname(nickname string) error

	// Read state tracking
	GetReadState(channelID uint64) (lastReadAt int64, lastReadMessageID *uint64, err error)
	UpdateReadState(channelID uint64, timestamp int64, messageID *uint64) error

	// First run tracking
	GetFirstRun() bool
	SetFirstRunComplete() error

	// State directory
	GetStateDir() string

	// Close the state
	Close() error
}
