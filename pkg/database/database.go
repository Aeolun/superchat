package database

import (
	"database/sql"
	"fmt"
	"time"

	_ "modernc.org/sqlite"
)

// DB wraps the SQLite database connection
type DB struct {
	conn *sql.DB
}

// Open opens a connection to the SQLite database at the given path
// and initializes the schema if needed
func Open(path string) (*DB, error) {
	conn, err := sql.Open("sqlite", path)
	if err != nil {
		return nil, fmt.Errorf("failed to open database: %w", err)
	}

	// Enable foreign keys (SQLite has them disabled by default)
	if _, err := conn.Exec("PRAGMA foreign_keys = ON"); err != nil {
		conn.Close()
		return nil, fmt.Errorf("failed to enable foreign keys: %w", err)
	}

	db := &DB{conn: conn}

	// Initialize schema
	if err := db.initSchema(); err != nil {
		conn.Close()
		return nil, fmt.Errorf("failed to initialize schema: %w", err)
	}

	return db, nil
}

// Close closes the database connection
func (db *DB) Close() error {
	return db.conn.Close()
}

// initSchema creates all tables and indexes if they don't exist
func (db *DB) initSchema() error {
	schema := `
-- Channel table
CREATE TABLE IF NOT EXISTS Channel (
	id INTEGER PRIMARY KEY AUTOINCREMENT,
	name TEXT NOT NULL UNIQUE,
	display_name TEXT NOT NULL,
	description TEXT,
	channel_type INTEGER NOT NULL DEFAULT 1,
	message_retention_hours INTEGER NOT NULL DEFAULT 168,
	created_by INTEGER,
	created_at INTEGER NOT NULL,
	is_private INTEGER NOT NULL DEFAULT 0
);

-- Session table
CREATE TABLE IF NOT EXISTS Session (
	id INTEGER PRIMARY KEY AUTOINCREMENT,
	user_id INTEGER,
	nickname TEXT NOT NULL,
	connection_type TEXT NOT NULL,
	connected_at INTEGER NOT NULL,
	last_activity INTEGER NOT NULL
);

-- Message table
CREATE TABLE IF NOT EXISTS Message (
	id INTEGER PRIMARY KEY AUTOINCREMENT,
	channel_id INTEGER NOT NULL,
	subchannel_id INTEGER,
	parent_id INTEGER,
	author_user_id INTEGER,
	author_nickname TEXT NOT NULL,
	content TEXT NOT NULL,
	created_at INTEGER NOT NULL,
	edited_at INTEGER,
	deleted_at INTEGER,
	thread_depth INTEGER NOT NULL,
	FOREIGN KEY (channel_id) REFERENCES Channel(id) ON DELETE CASCADE,
	FOREIGN KEY (parent_id) REFERENCES Message(id) ON DELETE CASCADE
);

-- MessageVersion table
CREATE TABLE IF NOT EXISTS MessageVersion (
	id INTEGER PRIMARY KEY AUTOINCREMENT,
	message_id INTEGER NOT NULL,
	content TEXT NOT NULL,
	author_nickname TEXT NOT NULL,
	created_at INTEGER NOT NULL,
	version_type TEXT NOT NULL,
	FOREIGN KEY (message_id) REFERENCES Message(id) ON DELETE CASCADE
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_messages_channel ON Message(channel_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_messages_parent ON Message(parent_id) WHERE parent_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_messages_retention ON Message(created_at, parent_id);
CREATE INDEX IF NOT EXISTS idx_sessions_activity ON Session(last_activity);
`

	_, err := db.conn.Exec(schema)
	return err
}

// Channel represents a channel record
type Channel struct {
	ID                     int64
	Name                   string
	DisplayName            string
	Description            *string
	ChannelType            uint8 // 0=chat, 1=forum
	MessageRetentionHours  uint32
	CreatedBy              *int64
	CreatedAt              int64 // Unix timestamp in milliseconds
	IsPrivate              bool
}

// Session represents an active connection
type Session struct {
	ID             int64
	UserID         *int64
	Nickname       string
	ConnectionType string // "tcp" or "ssh"
	ConnectedAt    int64  // Unix timestamp in milliseconds
	LastActivity   int64  // Unix timestamp in milliseconds
}

// Message represents a message record
type Message struct {
	ID             int64
	ChannelID      int64
	SubchannelID   *int64
	ParentID       *int64
	AuthorUserID   *int64
	AuthorNickname string
	Content        string
	CreatedAt      int64 // Unix timestamp in milliseconds
	EditedAt       *int64
	DeletedAt      *int64
	ThreadDepth    uint8
}

// MessageVersion represents a version history entry
type MessageVersion struct {
	ID             int64
	MessageID      int64
	Content        string
	AuthorNickname string
	CreatedAt      int64 // Unix timestamp in milliseconds
	VersionType    string // "created", "edited", "deleted"
}

// nowMillis returns current time as Unix timestamp in milliseconds
func nowMillis() int64 {
	return time.Now().UnixMilli()
}

// SeedDefaultChannels creates the default channels if they don't exist
func (db *DB) SeedDefaultChannels() error {
	defaultChannels := []struct {
		name        string
		displayName string
		description string
	}{
		{"general", "#general", "General discussion"},
		{"tech", "#tech", "Technical topics"},
		{"random", "#random", "Off-topic chat"},
		{"feedback", "#feedback", "Bug reports and feature requests"},
	}

	for _, ch := range defaultChannels {
		if err := db.CreateChannel(ch.name, ch.displayName, &ch.description, 1, 168); err != nil {
			return fmt.Errorf("failed to seed channel %s: %w", ch.name, err)
		}
	}

	return nil
}

// CreateChannel creates a new channel (returns nil if already exists)
func (db *DB) CreateChannel(name, displayName string, description *string, channelType uint8, retentionHours uint32) error {
	descStr := sql.NullString{}
	if description != nil {
		descStr.Valid = true
		descStr.String = *description
	}

	_, err := db.conn.Exec(`
		INSERT OR IGNORE INTO Channel (name, display_name, description, channel_type, message_retention_hours, created_at, is_private)
		VALUES (?, ?, ?, ?, ?, ?, 0)
	`, name, displayName, descStr, channelType, retentionHours, nowMillis())

	return err
}

// ListChannels returns all public channels
func (db *DB) ListChannels() ([]*Channel, error) {
	rows, err := db.conn.Query(`
		SELECT id, name, display_name, description, channel_type, message_retention_hours, created_by, created_at, is_private
		FROM Channel
		WHERE is_private = 0
		ORDER BY id ASC
	`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var channels []*Channel
	for rows.Next() {
		ch := &Channel{}
		var desc sql.NullString
		var createdBy sql.NullInt64

		err := rows.Scan(
			&ch.ID,
			&ch.Name,
			&ch.DisplayName,
			&desc,
			&ch.ChannelType,
			&ch.MessageRetentionHours,
			&createdBy,
			&ch.CreatedAt,
			&ch.IsPrivate,
		)
		if err != nil {
			return nil, err
		}

		if desc.Valid {
			ch.Description = &desc.String
		}
		if createdBy.Valid {
			ch.CreatedBy = &createdBy.Int64
		}

		channels = append(channels, ch)
	}

	return channels, rows.Err()
}

// GetChannel returns a channel by ID
func (db *DB) GetChannel(id int64) (*Channel, error) {
	ch := &Channel{}
	var desc sql.NullString
	var createdBy sql.NullInt64

	err := db.conn.QueryRow(`
		SELECT id, name, display_name, description, channel_type, message_retention_hours, created_by, created_at, is_private
		FROM Channel
		WHERE id = ?
	`, id).Scan(
		&ch.ID,
		&ch.Name,
		&ch.DisplayName,
		&desc,
		&ch.ChannelType,
		&ch.MessageRetentionHours,
		&createdBy,
		&ch.CreatedAt,
		&ch.IsPrivate,
	)

	if err != nil {
		return nil, err
	}

	if desc.Valid {
		ch.Description = &desc.String
	}
	if createdBy.Valid {
		ch.CreatedBy = &createdBy.Int64
	}

	return ch, nil
}

// CreateSession creates a new session record
func (db *DB) CreateSession(userID *int64, nickname, connType string) (int64, error) {
	var userIDVal sql.NullInt64
	if userID != nil {
		userIDVal.Valid = true
		userIDVal.Int64 = *userID
	}

	now := nowMillis()
	result, err := db.conn.Exec(`
		INSERT INTO Session (user_id, nickname, connection_type, connected_at, last_activity)
		VALUES (?, ?, ?, ?, ?)
	`, userIDVal, nickname, connType, now, now)

	if err != nil {
		return 0, err
	}

	return result.LastInsertId()
}

// UpdateSessionNickname updates the nickname for a session
func (db *DB) UpdateSessionNickname(sessionID int64, nickname string) error {
	_, err := db.conn.Exec(`
		UPDATE Session SET nickname = ? WHERE id = ?
	`, nickname, sessionID)
	return err
}

// UpdateSessionActivity updates the last_activity timestamp for a session
func (db *DB) UpdateSessionActivity(sessionID int64) error {
	_, err := db.conn.Exec(`
		UPDATE Session SET last_activity = ? WHERE id = ?
	`, nowMillis(), sessionID)
	return err
}

// GetSession returns a session by ID
func (db *DB) GetSession(sessionID int64) (*Session, error) {
	sess := &Session{}
	var userID sql.NullInt64

	err := db.conn.QueryRow(`
		SELECT id, user_id, nickname, connection_type, connected_at, last_activity
		FROM Session
		WHERE id = ?
	`, sessionID).Scan(
		&sess.ID,
		&userID,
		&sess.Nickname,
		&sess.ConnectionType,
		&sess.ConnectedAt,
		&sess.LastActivity,
	)

	if err != nil {
		return nil, err
	}

	if userID.Valid {
		sess.UserID = &userID.Int64
	}

	return sess, nil
}

// DeleteSession deletes a session record
func (db *DB) DeleteSession(sessionID int64) error {
	_, err := db.conn.Exec(`DELETE FROM Session WHERE id = ?`, sessionID)
	return err
}

// PostMessage creates a new message and its initial version
func (db *DB) PostMessage(channelID int64, subchannelID, parentID, authorUserID *int64, authorNickname, content string) (int64, error) {
	// Begin transaction
	tx, err := db.conn.Begin()
	if err != nil {
		return 0, err
	}
	defer tx.Rollback()

	// Calculate thread depth
	depth := uint8(0)
	if parentID != nil {
		err := tx.QueryRow(`SELECT thread_depth FROM Message WHERE id = ?`, *parentID).Scan(&depth)
		if err != nil {
			return 0, fmt.Errorf("failed to get parent depth: %w", err)
		}
		depth++
	}

	// Insert message
	var subchannelIDVal, parentIDVal, authorUserIDVal sql.NullInt64
	if subchannelID != nil {
		subchannelIDVal.Valid = true
		subchannelIDVal.Int64 = *subchannelID
	}
	if parentID != nil {
		parentIDVal.Valid = true
		parentIDVal.Int64 = *parentID
	}
	if authorUserID != nil {
		authorUserIDVal.Valid = true
		authorUserIDVal.Int64 = *authorUserID
	}

	now := nowMillis()
	result, err := tx.Exec(`
		INSERT INTO Message (channel_id, subchannel_id, parent_id, author_user_id, author_nickname, content, created_at, thread_depth)
		VALUES (?, ?, ?, ?, ?, ?, ?, ?)
	`, channelID, subchannelIDVal, parentIDVal, authorUserIDVal, authorNickname, content, now, depth)

	if err != nil {
		return 0, err
	}

	messageID, err := result.LastInsertId()
	if err != nil {
		return 0, err
	}

	// Insert initial version
	_, err = tx.Exec(`
		INSERT INTO MessageVersion (message_id, content, author_nickname, created_at, version_type)
		VALUES (?, ?, ?, ?, 'created')
	`, messageID, content, authorNickname, now)

	if err != nil {
		return 0, err
	}

	// Commit transaction
	if err := tx.Commit(); err != nil {
		return 0, err
	}

	return messageID, nil
}

// ListRootMessages returns root messages (parent_id = null) for a channel, sorted newest first
func (db *DB) ListRootMessages(channelID int64, subchannelID *int64, limit uint16, beforeID *uint64) ([]*Message, error) {
	var subchannelIDVal sql.NullInt64
	if subchannelID != nil {
		subchannelIDVal.Valid = true
		subchannelIDVal.Int64 = *subchannelID
	}

	query := `
		SELECT id, channel_id, subchannel_id, parent_id, author_user_id, author_nickname,
		       content, created_at, edited_at, deleted_at, thread_depth
		FROM Message
		WHERE channel_id = ?
		  AND (subchannel_id IS ? OR (subchannel_id IS NULL AND ? IS NULL))
		  AND parent_id IS NULL
	`
	args := []interface{}{channelID, subchannelIDVal, subchannelIDVal}

	if beforeID != nil {
		query += ` AND id < ?`
		args = append(args, *beforeID)
	}

	query += ` ORDER BY created_at DESC LIMIT ?`
	args = append(args, limit)

	rows, err := db.conn.Query(query, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	return scanMessages(rows)
}

// ListThreadReplies returns all replies under a parent message, sorted for depth-first display
func (db *DB) ListThreadReplies(parentID uint64) ([]*Message, error) {
	// Recursive CTE to get all descendants
	query := `
		WITH RECURSIVE thread_tree AS (
			-- Base case: direct replies to parent
			SELECT id, channel_id, subchannel_id, parent_id, author_user_id, author_nickname,
			       content, created_at, edited_at, deleted_at, thread_depth
			FROM Message
			WHERE parent_id = ?

			UNION ALL

			-- Recursive case: replies to replies
			SELECT m.id, m.channel_id, m.subchannel_id, m.parent_id, m.author_user_id, m.author_nickname,
			       m.content, m.created_at, m.edited_at, m.deleted_at, m.thread_depth
			FROM Message m
			INNER JOIN thread_tree tt ON m.parent_id = tt.id
		)
		SELECT * FROM thread_tree
		ORDER BY thread_depth ASC, created_at ASC
	`

	rows, err := db.conn.Query(query, parentID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	return scanMessages(rows)
}

// GetMessage returns a single message by ID
func (db *DB) GetMessage(messageID uint64) (*Message, error) {
	msg := &Message{}
	var subchannelID, parentID, authorUserID, editedAt, deletedAt sql.NullInt64

	err := db.conn.QueryRow(`
		SELECT id, channel_id, subchannel_id, parent_id, author_user_id, author_nickname,
		       content, created_at, edited_at, deleted_at, thread_depth
		FROM Message
		WHERE id = ?
	`, messageID).Scan(
		&msg.ID,
		&msg.ChannelID,
		&subchannelID,
		&parentID,
		&authorUserID,
		&msg.AuthorNickname,
		&msg.Content,
		&msg.CreatedAt,
		&editedAt,
		&deletedAt,
		&msg.ThreadDepth,
	)

	if err != nil {
		return nil, err
	}

	if subchannelID.Valid {
		msg.SubchannelID = &subchannelID.Int64
	}
	if parentID.Valid {
		msg.ParentID = &parentID.Int64
	}
	if authorUserID.Valid {
		msg.AuthorUserID = &authorUserID.Int64
	}
	if editedAt.Valid {
		msg.EditedAt = &editedAt.Int64
	}
	if deletedAt.Valid {
		msg.DeletedAt = &deletedAt.Int64
	}

	return msg, nil
}

// CountReplies returns the total number of descendants for a message
func (db *DB) CountReplies(messageID int64) (uint32, error) {
	var count uint32

	query := `
		WITH RECURSIVE descendants AS (
			SELECT id FROM Message WHERE parent_id = ?
			UNION ALL
			SELECT m.id FROM Message m
			INNER JOIN descendants d ON m.parent_id = d.id
		)
		SELECT COUNT(*) FROM descendants
	`

	err := db.conn.QueryRow(query, messageID).Scan(&count)
	return count, err
}

// scanMessages is a helper to scan multiple message rows
func scanMessages(rows *sql.Rows) ([]*Message, error) {
	var messages []*Message

	for rows.Next() {
		msg := &Message{}
		var subchannelID, parentID, authorUserID, editedAt, deletedAt sql.NullInt64

		err := rows.Scan(
			&msg.ID,
			&msg.ChannelID,
			&subchannelID,
			&parentID,
			&authorUserID,
			&msg.AuthorNickname,
			&msg.Content,
			&msg.CreatedAt,
			&editedAt,
			&deletedAt,
			&msg.ThreadDepth,
		)

		if err != nil {
			return nil, err
		}

		if subchannelID.Valid {
			msg.SubchannelID = &subchannelID.Int64
		}
		if parentID.Valid {
			msg.ParentID = &parentID.Int64
		}
		if authorUserID.Valid {
			msg.AuthorUserID = &authorUserID.Int64
		}
		if editedAt.Valid {
			msg.EditedAt = &editedAt.Int64
		}
		if deletedAt.Valid {
			msg.DeletedAt = &deletedAt.Int64
		}

		messages = append(messages, msg)
	}

	return messages, rows.Err()
}
