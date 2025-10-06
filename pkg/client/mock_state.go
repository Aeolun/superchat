package client

import (
	"sync"
)

// MockState is an in-memory test implementation of StateInterface
type MockState struct {
	mu sync.RWMutex

	// In-memory storage
	config    map[string]string
	readState map[uint64]ReadStateData
	dir       string

	// Error injection
	getConfigErr         error
	setConfigErr         error
	getReadStateErr      error
	updateReadStateErr   error
	setFirstRunCompleteErr error
}

// ReadStateData holds read state information
type ReadStateData struct {
	LastReadAt        int64
	LastReadMessageID *uint64
}

// NewMockState creates a new mock state
func NewMockState() *MockState {
	return &MockState{
		config:    make(map[string]string),
		readState: make(map[uint64]ReadStateData),
		dir:       "/tmp/mock-state",
	}
}

// GetConfig retrieves a configuration value
func (s *MockState) GetConfig(key string) (string, error) {
	s.mu.RLock()
	defer s.mu.RUnlock()

	if s.getConfigErr != nil {
		return "", s.getConfigErr
	}

	return s.config[key], nil
}

// SetConfig stores a configuration value
func (s *MockState) SetConfig(key, value string) error {
	s.mu.Lock()
	defer s.mu.Unlock()

	if s.setConfigErr != nil {
		return s.setConfigErr
	}

	s.config[key] = value
	return nil
}

// GetLastNickname returns the last used nickname
func (s *MockState) GetLastNickname() string {
	nickname, _ := s.GetConfig("last_nickname")
	return nickname
}

// SetLastNickname stores the last used nickname
func (s *MockState) SetLastNickname(nickname string) error {
	return s.SetConfig("last_nickname", nickname)
}

// GetUserID returns the authenticated user ID (V2)
func (s *MockState) GetUserID() *uint64 {
	return nil // Mock always returns nil for now
}

// SetUserID stores the authenticated user ID (V2)
func (s *MockState) SetUserID(userID *uint64) error {
	return nil // Mock does nothing for now
}

// GetReadState returns the read state for a channel
func (s *MockState) GetReadState(channelID uint64) (lastReadAt int64, lastReadMessageID *uint64, err error) {
	s.mu.RLock()
	defer s.mu.RUnlock()

	if s.getReadStateErr != nil {
		return 0, nil, s.getReadStateErr
	}

	data, exists := s.readState[channelID]
	if !exists {
		return 0, nil, nil
	}

	return data.LastReadAt, data.LastReadMessageID, nil
}

// UpdateReadState updates the read state for a channel
func (s *MockState) UpdateReadState(channelID uint64, timestamp int64, messageID *uint64) error {
	s.mu.Lock()
	defer s.mu.Unlock()

	if s.updateReadStateErr != nil {
		return s.updateReadStateErr
	}

	s.readState[channelID] = ReadStateData{
		LastReadAt:        timestamp,
		LastReadMessageID: messageID,
	}
	return nil
}

// GetFirstRun checks if this is the first time running the client
func (s *MockState) GetFirstRun() bool {
	val, _ := s.GetConfig("first_run_complete")
	return val != "true"
}

// SetFirstRunComplete marks first run as complete
func (s *MockState) SetFirstRunComplete() error {
	if s.setFirstRunCompleteErr != nil {
		return s.setFirstRunCompleteErr
	}
	return s.SetConfig("first_run_complete", "true")
}

// GetStateDir returns the directory where state is stored
func (s *MockState) GetStateDir() string {
	return s.dir
}

// Close closes the mock state (no-op for in-memory)
func (s *MockState) Close() error {
	return nil
}

// Test helpers

// SetGetConfigError sets an error to return from GetConfig()
func (s *MockState) SetGetConfigError(err error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.getConfigErr = err
}

// SetSetConfigError sets an error to return from SetConfig()
func (s *MockState) SetSetConfigError(err error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.setConfigErr = err
}

// SetGetReadStateError sets an error to return from GetReadState()
func (s *MockState) SetGetReadStateError(err error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.getReadStateErr = err
}

// SetUpdateReadStateError sets an error to return from UpdateReadState()
func (s *MockState) SetUpdateReadStateError(err error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.updateReadStateErr = err
}

// SetFirstRun sets the first run state
func (s *MockState) SetFirstRun(firstRun bool) {
	s.mu.Lock()
	defer s.mu.Unlock()
	if firstRun {
		delete(s.config, "first_run_complete")
	} else {
		s.config["first_run_complete"] = "true"
	}
}

// GetAllConfig returns all config (for testing)
func (s *MockState) GetAllConfig() map[string]string {
	s.mu.RLock()
	defer s.mu.RUnlock()

	result := make(map[string]string)
	for k, v := range s.config {
		result[k] = v
	}
	return result
}

// GetAllReadState returns all read state (for testing)
func (s *MockState) GetAllReadState() map[uint64]ReadStateData {
	s.mu.RLock()
	defer s.mu.RUnlock()

	result := make(map[uint64]ReadStateData)
	for k, v := range s.readState {
		result[k] = v
	}
	return result
}

// Clear clears all state (for testing)
func (s *MockState) Clear() {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.config = make(map[string]string)
	s.readState = make(map[uint64]ReadStateData)
}

// Verify that MockState implements StateInterface
var _ StateInterface = (*MockState)(nil)
