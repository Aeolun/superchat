package client

import (
	"database/sql"
	"fmt"
	"os"
	"path/filepath"
	"time"

	_ "modernc.org/sqlite"
)

// State manages client-side persistent state
type State struct {
	db  *sql.DB
	dir string // Directory where state is stored
}

// OpenState opens or creates the client state database
func OpenState(path string) (*State, error) {
	// Ensure directory exists
	dir := filepath.Dir(path)
	if err := os.MkdirAll(dir, 0755); err != nil {
		return nil, fmt.Errorf("failed to create state directory: %w", err)
	}

	db, err := sql.Open("sqlite", path)
	if err != nil {
		return nil, fmt.Errorf("failed to open state database: %w", err)
	}

	// Configure for better reliability
	db.SetMaxOpenConns(1) // Client only needs one connection
	db.SetMaxIdleConns(1)

	// Enable WAL mode
	if _, err := db.Exec("PRAGMA journal_mode = WAL"); err != nil {
		db.Close()
		return nil, fmt.Errorf("failed to enable WAL mode: %w", err)
	}

	// Set busy timeout
	if _, err := db.Exec("PRAGMA busy_timeout = 5000"); err != nil {
		db.Close()
		return nil, fmt.Errorf("failed to set busy timeout: %w", err)
	}

	state := &State{
		db:  db,
		dir: dir,
	}

	// Initialize schema
	if err := state.initSchema(); err != nil {
		db.Close()
		return nil, fmt.Errorf("failed to initialize schema: %w", err)
	}

	return state, nil
}

// Close closes the state database
func (s *State) Close() error {
	return s.db.Close()
}

// initSchema creates tables if they don't exist
func (s *State) initSchema() error {
	schema := `
CREATE TABLE IF NOT EXISTS Config (
	key TEXT PRIMARY KEY,
	value TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS ReadState (
	channel_id INTEGER PRIMARY KEY,
	last_read_at INTEGER NOT NULL,
	last_read_message_id INTEGER
);

CREATE TABLE IF NOT EXISTS ConnectionHistory (
	server_address TEXT PRIMARY KEY,
	last_successful_method TEXT NOT NULL,
	last_success_at INTEGER NOT NULL
);
`
	_, err := s.db.Exec(schema)
	return err
}

// GetConfig retrieves a configuration value
func (s *State) GetConfig(key string) (string, error) {
	var value string
	err := s.db.QueryRow("SELECT value FROM Config WHERE key = ?", key).Scan(&value)
	if err == sql.ErrNoRows {
		return "", nil
	}
	return value, err
}

// SetConfig stores a configuration value
func (s *State) SetConfig(key, value string) error {
	_, err := s.db.Exec(`
		INSERT OR REPLACE INTO Config (key, value) VALUES (?, ?)
	`, key, value)
	return err
}

// GetLastNickname returns the last used nickname
func (s *State) GetLastNickname() string {
	nickname, _ := s.GetConfig("last_nickname")
	return nickname
}

// SetLastNickname stores the last used nickname
func (s *State) SetLastNickname(nickname string) error {
	return s.SetConfig("last_nickname", nickname)
}

// GetUserID returns the authenticated user ID (V2)
func (s *State) GetUserID() *uint64 {
	userIDStr, _ := s.GetConfig("user_id")
	if userIDStr == "" {
		return nil
	}
	var userID uint64
	if _, err := fmt.Sscanf(userIDStr, "%d", &userID); err != nil {
		return nil
	}
	return &userID
}

// SetUserID stores the authenticated user ID (V2)
func (s *State) SetUserID(userID *uint64) error {
	if userID == nil {
		return s.SetConfig("user_id", "")
	}
	return s.SetConfig("user_id", fmt.Sprintf("%d", *userID))
}

// GetReadState returns the read state for a channel
func (s *State) GetReadState(channelID uint64) (lastReadAt int64, lastReadMessageID *uint64, err error) {
	var messageID sql.NullInt64
	err = s.db.QueryRow(`
		SELECT last_read_at, last_read_message_id
		FROM ReadState
		WHERE channel_id = ?
	`, channelID).Scan(&lastReadAt, &messageID)

	if err == sql.ErrNoRows {
		return 0, nil, nil
	}
	if err != nil {
		return 0, nil, err
	}

	if messageID.Valid {
		id := uint64(messageID.Int64)
		lastReadMessageID = &id
	}

	return lastReadAt, lastReadMessageID, nil
}

// UpdateReadState updates the read state for a channel
func (s *State) UpdateReadState(channelID uint64, timestamp int64, messageID *uint64) error {
	var msgID sql.NullInt64
	if messageID != nil {
		msgID.Valid = true
		msgID.Int64 = int64(*messageID)
	}

	_, err := s.db.Exec(`
		INSERT OR REPLACE INTO ReadState (channel_id, last_read_at, last_read_message_id)
		VALUES (?, ?, ?)
	`, channelID, timestamp, msgID)

	return err
}

// GetLastSuccessfulMethod retrieves the last successful connection method for a server
func (s *State) GetLastSuccessfulMethod(serverAddress string) (string, error) {
	var method string
	err := s.db.QueryRow(`
		SELECT last_successful_method
		FROM ConnectionHistory
		WHERE server_address = ?
	`, serverAddress).Scan(&method)

	if err == sql.ErrNoRows {
		return "", nil // No history for this server
	}
	return method, err
}

// SaveSuccessfulConnection records a successful connection method for a server
func (s *State) SaveSuccessfulConnection(serverAddress string, method string) error {
	now := time.Now().Unix()
	_, err := s.db.Exec(`
		INSERT OR REPLACE INTO ConnectionHistory (server_address, last_successful_method, last_success_at)
		VALUES (?, ?, ?)
	`, serverAddress, method, now)
	return err
}

// GetFirstRun checks if this is the first time running the client
func (s *State) GetFirstRun() bool {
	val, _ := s.GetConfig("first_run_complete")
	return val != "true"
}

// SetFirstRunComplete marks first run as complete
func (s *State) SetFirstRunComplete() error {
	return s.SetConfig("first_run_complete", "true")
}

// GetStateDir returns the directory where state is stored
func (s *State) GetStateDir() string {
	return s.dir
}

// GetFirstPostWarningDismissed checks if the user has permanently dismissed the first post warning
func (s *State) GetFirstPostWarningDismissed() bool {
	val, _ := s.GetConfig("first_post_warning_dismissed")
	return val == "true"
}

// SetFirstPostWarningDismissed marks the first post warning as permanently dismissed
func (s *State) SetFirstPostWarningDismissed() error {
	return s.SetConfig("first_post_warning_dismissed", "true")
}
