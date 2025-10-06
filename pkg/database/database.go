package database

import (
	"database/sql"
	"errors"
	"fmt"
	"log"
	"sync/atomic"
	"time"

	_ "modernc.org/sqlite"
)

var (
	// ErrMessageNotFound indicates the message does not exist.
	ErrMessageNotFound = errors.New("message not found")
	// ErrMessageNotOwned indicates the caller is not the message author.
	ErrMessageNotOwned = errors.New("cannot delete message not authored by this nickname")
	// ErrMessageAlreadyDeleted indicates the message has already been soft-deleted.
	ErrMessageAlreadyDeleted = errors.New("message already deleted")
)

// DB wraps the SQLite database connection
type DB struct {
	conn        *sql.DB // Read connection pool (25 connections)
	writeConn   *sql.DB // Dedicated write connection (1 connection)
	snowflake   *Snowflake
	WriteBuffer *WriteBuffer
}

// Open opens a connection to the SQLite database at the given path
// and initializes the schema if needed
func Open(path string) (*DB, error) {
	conn, err := sql.Open("sqlite", path)
	if err != nil {
		return nil, fmt.Errorf("failed to open database: %w", err)
	}

	// Configure connection pool for better concurrency
	// Limit to 1 open connection for writes (SQLite limitation)
	// But allow multiple readers in WAL mode
	conn.SetMaxOpenConns(25)
	conn.SetMaxIdleConns(5)
	conn.SetConnMaxLifetime(5 * time.Minute)

	// Enable WAL mode for better concurrent access
	// WAL allows multiple readers and one writer at the same time
	if _, err := conn.Exec("PRAGMA journal_mode = WAL"); err != nil {
		conn.Close()
		return nil, fmt.Errorf("failed to enable WAL mode: %w", err)
	}

	// Set busy timeout to 5 seconds
	// This makes SQLite wait and retry instead of immediately failing with SQLITE_BUSY
	if _, err := conn.Exec("PRAGMA busy_timeout = 5000"); err != nil {
		conn.Close()
		return nil, fmt.Errorf("failed to set busy timeout: %w", err)
	}

	// Enable foreign keys (SQLite has them disabled by default)
	if _, err := conn.Exec("PRAGMA foreign_keys = ON"); err != nil {
		conn.Close()
		return nil, fmt.Errorf("failed to enable foreign keys: %w", err)
	}

	// Optimize for concurrency
	if _, err := conn.Exec("PRAGMA synchronous = NORMAL"); err != nil {
		conn.Close()
		return nil, fmt.Errorf("failed to set synchronous mode: %w", err)
	}

	// Create dedicated write connection (single connection, no pooling)
	writeConn, err := sql.Open("sqlite", path)
	if err != nil {
		conn.Close()
		return nil, fmt.Errorf("failed to open write connection: %w", err)
	}

	// Configure write connection: exactly 1 connection, no pooling
	writeConn.SetMaxOpenConns(1)
	writeConn.SetMaxIdleConns(1)
	writeConn.SetConnMaxLifetime(0) // Never expire

	// Enable WAL mode on write connection
	if _, err := writeConn.Exec("PRAGMA journal_mode = WAL"); err != nil {
		conn.Close()
		writeConn.Close()
		return nil, fmt.Errorf("failed to enable WAL mode on write connection: %w", err)
	}

	// Set busy timeout on write connection
	if _, err := writeConn.Exec("PRAGMA busy_timeout = 5000"); err != nil {
		conn.Close()
		writeConn.Close()
		return nil, fmt.Errorf("failed to set busy timeout on write connection: %w", err)
	}

	// Enable foreign keys on write connection
	if _, err := writeConn.Exec("PRAGMA foreign_keys = ON"); err != nil {
		conn.Close()
		writeConn.Close()
		return nil, fmt.Errorf("failed to enable foreign keys on write connection: %w", err)
	}

	// Synchronous mode on write connection
	if _, err := writeConn.Exec("PRAGMA synchronous = NORMAL"); err != nil {
		conn.Close()
		writeConn.Close()
		return nil, fmt.Errorf("failed to set synchronous mode on write connection: %w", err)
	}

	// Create Snowflake ID generator (epoch: 2024-01-01, workerID: 0)
	epoch := time.Date(2024, 1, 1, 0, 0, 0, 0, time.UTC).UnixMilli()
	snowflake := NewSnowflake(epoch, 0)

	db := &DB{
		conn:      conn,
		writeConn: writeConn,
		snowflake: snowflake,
	}

	// Run migrations first (before schema init)
	// This will backup the database if migrations are pending
	if err := runMigrations(conn, path); err != nil {
		conn.Close()
		writeConn.Close()
		return nil, fmt.Errorf("failed to run migrations: %w", err)
	}

	// Initialize schema (fallback for dev, migrations should handle this)
	if err := db.initSchema(); err != nil {
		conn.Close()
		writeConn.Close()
		return nil, fmt.Errorf("failed to initialize schema: %w", err)
	}

	// Initialize write buffer (100ms flush interval)
	db.WriteBuffer = NewWriteBuffer(db, 100*time.Millisecond)

	return db, nil
}

// Close closes the database connection
func (db *DB) Close() error {
	db.writeConn.Close()
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

-- Session table (uses Snowflake IDs for performance)
CREATE TABLE IF NOT EXISTS Session (
	id INTEGER PRIMARY KEY,
	user_id INTEGER,
	nickname TEXT NOT NULL,
	connection_type TEXT NOT NULL,
	connected_at INTEGER NOT NULL,
	last_activity INTEGER NOT NULL
);

-- Message table
CREATE TABLE IF NOT EXISTS Message (
	id INTEGER PRIMARY KEY,
	channel_id INTEGER NOT NULL,
	subchannel_id INTEGER,
	parent_id INTEGER,
	thread_root_id INTEGER,
	author_user_id INTEGER,
	author_nickname TEXT NOT NULL,
	content TEXT NOT NULL,
	created_at INTEGER NOT NULL,
	edited_at INTEGER,
	deleted_at INTEGER,
	FOREIGN KEY (channel_id) REFERENCES Channel(id) ON DELETE CASCADE,
	FOREIGN KEY (parent_id) REFERENCES Message(id) ON DELETE CASCADE,
	FOREIGN KEY (thread_root_id) REFERENCES Message(id) ON DELETE CASCADE
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
CREATE INDEX IF NOT EXISTS idx_messages_thread_root ON Message(thread_root_id) WHERE thread_root_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_messages_retention ON Message(created_at, parent_id);
CREATE INDEX IF NOT EXISTS idx_sessions_activity ON Session(last_activity);
`

	_, err := db.conn.Exec(schema)
	return err
}

// Channel represents a channel record
type Channel struct {
	ID                    int64
	Name                  string
	DisplayName           string
	Description           *string
	ChannelType           uint8 // 0=chat, 1=forum
	MessageRetentionHours uint32
	CreatedBy             *int64
	CreatedAt             int64 // Unix timestamp in milliseconds
	IsPrivate             bool
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
	ThreadRootID   *int64 // Root message ID of thread (denormalized for fast broadcast)
	AuthorUserID   *int64
	AuthorNickname string
	Content        string
	CreatedAt      int64 // Unix timestamp in milliseconds
	EditedAt       *int64
	DeletedAt      *int64
	ReplyCount     atomic.Uint32 // Cached reply count (in-memory only, not persisted to SQLite)
}

// MessageVersion represents a version history entry
type MessageVersion struct {
	ID             int64
	MessageID      int64
	Content        string
	AuthorNickname string
	CreatedAt      int64  // Unix timestamp in milliseconds
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
	start := time.Now()
	descStr := sql.NullString{}
	if description != nil {
		descStr.Valid = true
		descStr.String = *description
	}

	_, err := db.writeConn.Exec(`
		INSERT OR IGNORE INTO Channel (name, display_name, description, channel_type, message_retention_hours, created_at, is_private)
		VALUES (?, ?, ?, ?, ?, ?, 0)
	`, name, displayName, descStr, channelType, retentionHours, nowMillis())

	elapsed := time.Since(start)
	log.Printf("DB: CreateChannel took %v", elapsed)

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
	start := time.Now()
	var userIDVal sql.NullInt64
	if userID != nil {
		userIDVal.Valid = true
		userIDVal.Int64 = *userID
	}

	now := nowMillis()
	result, err := db.writeConn.Exec(`
		INSERT INTO Session (user_id, nickname, connection_type, connected_at, last_activity)
		VALUES (?, ?, ?, ?, ?)
	`, userIDVal, nickname, connType, now, now)

	elapsed := time.Since(start)
	log.Printf("DB: CreateSession took %v", elapsed)

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

	// Generate Snowflake ID
	messageID := db.snowflake.NextID()

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
	_, err = tx.Exec(`
		INSERT INTO Message (id, channel_id, subchannel_id, parent_id, author_user_id, author_nickname, content, created_at)
		VALUES (?, ?, ?, ?, ?, ?, ?, ?)
	`, messageID, channelID, subchannelIDVal, parentIDVal, authorUserIDVal, authorNickname, content, now)

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
		SELECT id, channel_id, subchannel_id, parent_id, thread_root_id, author_user_id, author_nickname,
		       content, created_at, edited_at, deleted_at
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
	// Recursive CTE to get all descendants with a path for proper depth-first ordering
	query := `
		WITH RECURSIVE thread_tree AS (
			-- Base case: direct replies to parent
			SELECT id, channel_id, subchannel_id, parent_id, thread_root_id, author_user_id, author_nickname,
			       content, created_at, edited_at, deleted_at,
			       printf('%010d', created_at) AS path
			FROM Message
			WHERE parent_id = ?

			UNION ALL

			-- Recursive case: replies to replies
			-- Build path by concatenating parent path with current message's timestamp
			SELECT m.id, m.channel_id, m.subchannel_id, m.parent_id, m.thread_root_id, m.author_user_id, m.author_nickname,
			       m.content, m.created_at, m.edited_at, m.deleted_at,
			       tt.path || '.' || printf('%010d', m.created_at)
			FROM Message m
			INNER JOIN thread_tree tt ON m.parent_id = tt.id
		)
		SELECT id, channel_id, subchannel_id, parent_id, thread_root_id, author_user_id, author_nickname,
		       content, created_at, edited_at, deleted_at
		FROM thread_tree
		ORDER BY path ASC
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
	var subchannelID, parentID, threadRootID, authorUserID, editedAt, deletedAt sql.NullInt64

	err := db.conn.QueryRow(`
		SELECT id, channel_id, subchannel_id, parent_id, thread_root_id, author_user_id, author_nickname,
		       content, created_at, edited_at, deleted_at
		FROM Message
		WHERE id = ?
	`, messageID).Scan(
		&msg.ID,
		&msg.ChannelID,
		&subchannelID,
		&parentID,
		&threadRootID,
		&authorUserID,
		&msg.AuthorNickname,
		&msg.Content,
		&msg.CreatedAt,
		&editedAt,
		&deletedAt,
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
	if threadRootID.Valid {
		msg.ThreadRootID = &threadRootID.Int64
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

// SoftDeleteMessage performs a soft delete on the message if owned by the nickname.
func (db *DB) SoftDeleteMessage(messageID uint64, nickname string) (*Message, error) {
	tx, err := db.conn.Begin()
	if err != nil {
		return nil, err
	}
	defer tx.Rollback()

	// Load message row
	msg := &Message{}
	var subchannelID, parentID, authorUserID, editedAt, deletedAt sql.NullInt64

	err = tx.QueryRow(`
		SELECT id, channel_id, subchannel_id, parent_id, author_user_id, author_nickname,
		       content, created_at, edited_at, deleted_at
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
	)

	if errors.Is(err, sql.ErrNoRows) {
		return nil, ErrMessageNotFound
	}
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

	if msg.AuthorNickname != nickname {
		return nil, ErrMessageNotOwned
	}
	if msg.DeletedAt != nil {
		return nil, ErrMessageAlreadyDeleted
	}

	deletedAtMillis := nowMillis()
	deletedContent := fmt.Sprintf("[deleted by ~%s]", nickname)

	// Update message content and deleted_at
	if _, err := tx.Exec(`
		UPDATE Message
		SET content = ?, deleted_at = ?
		WHERE id = ?
	`, deletedContent, deletedAtMillis, messageID); err != nil {
		return nil, err
	}

	// Record deletion version with original content
	if _, err := tx.Exec(`
		INSERT INTO MessageVersion (message_id, content, author_nickname, created_at, version_type)
		VALUES (?, ?, ?, ?, 'deleted')
	`, messageID, msg.Content, msg.AuthorNickname, deletedAtMillis); err != nil {
		return nil, err
	}

	if err := tx.Commit(); err != nil {
		return nil, err
	}

	msg.Content = deletedContent
	msg.DeletedAt = &deletedAtMillis

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

// CleanupExpiredMessages deletes messages older than their channel's retention policy
// Returns the number of messages deleted
func (db *DB) CleanupExpiredMessages() (int64, error) {
	start := time.Now()
	// Delete root messages (and their descendants via CASCADE) that are older than retention
	// For each channel, calculate the cutoff time based on message_retention_hours
	result, err := db.writeConn.Exec(`
		DELETE FROM Message
		WHERE id IN (
			SELECT m.id
			FROM Message m
			INNER JOIN Channel c ON m.channel_id = c.id
			WHERE m.parent_id IS NULL
			  AND m.created_at < (? - (c.message_retention_hours * 3600000))
		)
	`, nowMillis())

	elapsed := time.Since(start)
	log.Printf("DB: CleanupExpiredMessages took %v", elapsed)

	if err != nil {
		return 0, fmt.Errorf("failed to cleanup expired messages: %w", err)
	}

	return result.RowsAffected()
}

// CleanupIdleSessions deletes sessions that have been idle for more than the timeout period
// Returns the number of sessions deleted
func (db *DB) CleanupIdleSessions(timeoutSeconds int64) (int64, error) {
	start := time.Now()
	cutoffMillis := nowMillis() - (timeoutSeconds * 1000)

	result, err := db.writeConn.Exec(`
		DELETE FROM Session
		WHERE last_activity < ?
	`, cutoffMillis)

	elapsed := time.Since(start)
	log.Printf("DB: CleanupIdleSessions took %v", elapsed)

	if err != nil {
		return 0, fmt.Errorf("failed to cleanup idle sessions: %w", err)
	}

	return result.RowsAffected()
}

// scanMessages is a helper to scan multiple message rows
func scanMessages(rows *sql.Rows) ([]*Message, error) {
	var messages []*Message

	for rows.Next() {
		msg := &Message{}
		var subchannelID, parentID, threadRootID, authorUserID, editedAt, deletedAt sql.NullInt64

		err := rows.Scan(
			&msg.ID,
			&msg.ChannelID,
			&subchannelID,
			&parentID,
			&threadRootID,
			&authorUserID,
			&msg.AuthorNickname,
			&msg.Content,
			&msg.CreatedAt,
			&editedAt,
			&deletedAt,
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
		if threadRootID.Valid {
			msg.ThreadRootID = &threadRootID.Int64
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

// ChannelExists checks if a channel exists
func (db *DB) ChannelExists(channelID int64) (bool, error) {
	var exists bool
	err := db.conn.QueryRow(`SELECT EXISTS(SELECT 1 FROM Channel WHERE id = ?)`, channelID).Scan(&exists)
	return exists, err
}

// SubchannelExists checks if a subchannel exists
func (db *DB) SubchannelExists(subchannelID int64) (bool, error) {
	var exists bool
	err := db.conn.QueryRow(`SELECT EXISTS(SELECT 1 FROM Subchannel WHERE id = ?)`, subchannelID).Scan(&exists)
	return exists, err
}

// MessageExists checks if a message exists
func (db *DB) MessageExists(messageID int64) (bool, error) {
	var exists bool
	err := db.conn.QueryRow(`SELECT EXISTS(SELECT 1 FROM Message WHERE id = ? AND deleted_at IS NULL)`, messageID).Scan(&exists)
	return exists, err
}
