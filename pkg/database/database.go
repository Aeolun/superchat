package database

import (
	"database/sql"
	"errors"
	"fmt"
	"log"
	"strings"
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

// User represents a registered user account (V2 feature)
type User struct {
	ID           int64
	Nickname     string
	UserFlags    uint8  // Bit flags: 0x01=admin, 0x02=moderator
	PasswordHash string // bcrypt hash
	CreatedAt    int64  // Unix timestamp in milliseconds
	LastSeen     int64  // Unix timestamp in milliseconds
}

// SSHKey represents an SSH public key for user authentication (V2 feature)
type SSHKey struct {
	ID          int64
	UserID      int64
	Fingerprint string  // SHA256:base64 format (e.g., SHA256:abc123...)
	PublicKey   string  // Full SSH public key in authorized_keys format
	KeyType     string  // Key algorithm: 'ssh-rsa', 'ssh-ed25519', 'ecdsa-sha2-nistp256'
	Label       *string // Optional user-friendly name (e.g., "laptop", "work")
	AddedAt     int64   // Unix timestamp in milliseconds
	LastUsedAt  *int64  // Unix timestamp in milliseconds of last successful auth
}

// Message represents a message record
type Message struct {
	ID             int64
	ChannelID      int64
	SubchannelID   *int64
	ParentID       *int64
	ThreadRootID   *int64 // Root message ID of thread (denormalized for fast broadcast)
	AuthorUserID   *int64
	AuthorNickname string // Only populated for anonymous users (when AuthorUserID IS NULL)
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
		name           string
		displayName    string
		description    string
		channelType    uint8  // 0=chat, 1=forum
		retentionHours uint32 // hours
	}{
		{"chat", ">chat", "General chat (linear conversation)", 0, 24},        // Chat channel, 24h retention
		{"general", "#general", "General discussion", 1, 168},                  // Forum, 7 days
		{"tech", "#tech", "Technical topics", 1, 168},                          // Forum, 7 days
		{"random", "#random", "Off-topic chat", 1, 168},                        // Forum, 7 days
		{"feedback", "#feedback", "Bug reports and feature requests", 1, 168}, // Forum, 7 days
	}

	for _, ch := range defaultChannels {
		if _, err := db.CreateChannel(ch.name, ch.displayName, &ch.description, ch.channelType, ch.retentionHours, nil); err != nil {
			return fmt.Errorf("failed to seed channel %s: %w", ch.name, err)
		}
	}

	return nil
}

// CreateChannel creates a new channel (returns nil if already exists)
// createdBy is optional - NULL for admin-created channels (V1), populated for user-created channels (V2+)
func (db *DB) CreateChannel(name, displayName string, description *string, channelType uint8, retentionHours uint32, createdBy *int64) (int64, error) {
	start := time.Now()
	descStr := sql.NullString{}
	if description != nil {
		descStr.Valid = true
		descStr.String = *description
	}

	createdByVal := sql.NullInt64{}
	if createdBy != nil {
		createdByVal.Valid = true
		createdByVal.Int64 = *createdBy
	}

	result, err := db.writeConn.Exec(`
		INSERT OR IGNORE INTO Channel (name, display_name, description, channel_type, message_retention_hours, created_by, created_at, is_private)
		VALUES (?, ?, ?, ?, ?, ?, ?, 0)
	`, name, displayName, descStr, channelType, retentionHours, createdByVal, nowMillis())

	if err != nil {
		return 0, err
	}

	channelID, err := result.LastInsertId()
	if err != nil {
		return 0, fmt.Errorf("failed to get last insert ID: %w", err)
	}

	elapsed := time.Since(start)
	log.Printf("DB: CreateChannel took %v", elapsed)

	return channelID, nil
}

// ListChannels returns all public channels
func (db *DB) ListChannels() ([]*Channel, error) {
	rows, err := db.conn.Query(`
		SELECT id, name, display_name, description, channel_type, message_retention_hours, created_by, created_at, is_private
		FROM Channel
		WHERE is_private = 0
		ORDER BY name ASC
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

// ListRootMessages returns root messages (parent_id = null) for a channel
// Sorting: DESC (newest first) by default or with beforeID, ASC (oldest first) with afterID
func (db *DB) ListRootMessages(channelID int64, subchannelID *int64, limit uint16, beforeID *uint64, afterID *uint64) ([]*Message, error) {
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

	// beforeID takes precedence over afterID
	if beforeID != nil {
		query += ` AND id < ?`
		args = append(args, *beforeID)
		query += ` ORDER BY created_at DESC LIMIT ?`
	} else if afterID != nil {
		query += ` AND id > ?`
		args = append(args, *afterID)
		query += ` ORDER BY created_at ASC LIMIT ?`
	} else {
		query += ` ORDER BY created_at DESC LIMIT ?`
	}
	args = append(args, limit)

	rows, err := db.conn.Query(query, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	return scanMessages(rows)
}

// ListThreadReplies returns all replies under a parent message, sorted for depth-first display
// Supports pagination via limit, beforeID, and afterID parameters
func (db *DB) ListThreadReplies(parentID uint64, limit uint16, beforeID *uint64, afterID *uint64) ([]*Message, error) {
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
	`

	args := []interface{}{parentID}

	// Add WHERE clauses for pagination
	var whereClauses []string
	if beforeID != nil {
		whereClauses = append(whereClauses, "id < ?")
		args = append(args, *beforeID)
	}
	if afterID != nil {
		whereClauses = append(whereClauses, "id > ?")
		args = append(args, *afterID)
	}

	if len(whereClauses) > 0 {
		query += " WHERE " + strings.Join(whereClauses, " AND ")
	}

	query += ` ORDER BY path ASC`

	// Add LIMIT if specified
	if limit > 0 {
		query += ` LIMIT ?`
		args = append(args, limit)
	}

	rows, err := db.conn.Query(query, args...)
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

// UpdateMessage updates a message's content (for registered users only)
// Returns the updated message with edited_at timestamp set
func (db *DB) UpdateMessage(messageID uint64, userID uint64, newContent string) (*Message, error) {
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

	// Validate message is editable
	if msg.AuthorUserID == nil {
		return nil, errors.New("cannot edit anonymous messages")
	}
	if *msg.AuthorUserID != int64(userID) {
		return nil, ErrMessageNotOwned
	}
	if msg.DeletedAt != nil {
		return nil, errors.New("cannot edit deleted message")
	}

	editedAtMillis := nowMillis()

	// Record edit version with original content
	if _, err := tx.Exec(`
		INSERT INTO MessageVersion (message_id, content, author_nickname, created_at, version_type)
		VALUES (?, ?, ?, ?, 'edited')
	`, messageID, msg.Content, msg.AuthorNickname, editedAtMillis); err != nil {
		return nil, err
	}

	// Update message content and edited_at
	if _, err := tx.Exec(`
		UPDATE Message
		SET content = ?, edited_at = ?
		WHERE id = ?
	`, newContent, editedAtMillis, messageID); err != nil {
		return nil, err
	}

	if err := tx.Commit(); err != nil {
		return nil, err
	}

	msg.Content = newContent
	msg.EditedAt = &editedAtMillis

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

// CreateUser inserts a new registered user and returns the user ID
func (db *DB) CreateUser(nickname, passwordHash string, userFlags uint8) (int64, error) {
	now := nowMillis()
	result, err := db.writeConn.Exec(`
		INSERT INTO User (nickname, user_flags, password_hash, created_at, last_seen)
		VALUES (?, ?, ?, ?, ?)
	`, nickname, userFlags, passwordHash, now, now)

	if err != nil {
		return 0, err // UNIQUE constraint violation if nickname taken
	}

	userID, err := result.LastInsertId()
	if err != nil {
		return 0, err
	}

	return userID, nil
}

// GetUserByNickname retrieves a user by nickname for login validation
func (db *DB) GetUserByNickname(nickname string) (*User, error) {
	var user User
	err := db.conn.QueryRow(`
		SELECT id, nickname, user_flags, password_hash, created_at, last_seen
		FROM User
		WHERE nickname = ?
	`, nickname).Scan(&user.ID, &user.Nickname, &user.UserFlags, &user.PasswordHash, &user.CreatedAt, &user.LastSeen)

	if err != nil {
		return nil, err // sql.ErrNoRows if not found
	}

	return &user, nil
}

// GetUserByID retrieves a user by ID
func (db *DB) GetUserByID(userID int64) (*User, error) {
	var user User
	err := db.conn.QueryRow(`
		SELECT id, nickname, user_flags, password_hash, created_at, last_seen
		FROM User
		WHERE id = ?
	`, userID).Scan(&user.ID, &user.Nickname, &user.UserFlags, &user.PasswordHash, &user.CreatedAt, &user.LastSeen)

	if err != nil {
		return nil, err // sql.ErrNoRows if not found
	}

	return &user, nil
}

// UpdateUserNickname updates a user's nickname
// Returns error if nickname is already taken by another user
func (db *DB) UpdateUserNickname(userID int64, newNickname string) error {
	// Check if nickname is already taken by another user
	existingUser, err := db.GetUserByNickname(newNickname)
	if err == nil && existingUser.ID != userID {
		// Nickname exists and belongs to a different user
		return fmt.Errorf("nickname already in use")
	}
	if err != nil && err != sql.ErrNoRows {
		// Database error (not just "not found")
		return fmt.Errorf("failed to check nickname availability: %w", err)
	}

	// Update the user's nickname
	_, err = db.conn.Exec(`
		UPDATE User
		SET nickname = ?
		WHERE id = ?
	`, newNickname, userID)

	if err != nil {
		return fmt.Errorf("failed to update nickname: %w", err)
	}

	return nil
}

// UpdateUserLastSeen updates the last_seen timestamp for a user
func (db *DB) UpdateUserLastSeen(userID int64) error {
	_, err := db.writeConn.Exec(`
		UPDATE User SET last_seen = ? WHERE id = ?
	`, nowMillis(), userID)
	return err
}

// UpdateSessionUserID links a session to a registered user
func (db *DB) UpdateSessionUserID(sessionID, userID int64) error {
	_, err := db.writeConn.Exec(`
		UPDATE Session SET user_id = ? WHERE id = ?
	`, userID, sessionID)
	return err
}

// UpdateUserPassword updates a user's password hash
func (db *DB) UpdateUserPassword(userID int64, newPasswordHash string) error {
	_, err := db.writeConn.Exec(`
		UPDATE User SET password_hash = ? WHERE id = ?
	`, newPasswordHash, userID)
	return err
}

// ===== SSH Key Methods (V2 SSH Authentication) =====

// CreateSSHKey adds a new SSH public key for a user
func (db *DB) CreateSSHKey(key *SSHKey) error {
	result, err := db.writeConn.Exec(`
		INSERT INTO SSHKey (user_id, fingerprint, public_key, key_type, label, added_at, last_used_at)
		VALUES (?, ?, ?, ?, ?, ?, ?)
	`, key.UserID, key.Fingerprint, key.PublicKey, key.KeyType, key.Label, key.AddedAt, key.LastUsedAt)

	if err != nil {
		return err // UNIQUE constraint violation if fingerprint already exists
	}

	id, err := result.LastInsertId()
	if err != nil {
		return err
	}

	key.ID = id
	return nil
}

// GetSSHKeyByFingerprint retrieves an SSH key by its fingerprint
func (db *DB) GetSSHKeyByFingerprint(fingerprint string) (*SSHKey, error) {
	var key SSHKey
	err := db.conn.QueryRow(`
		SELECT id, user_id, fingerprint, public_key, key_type, label, added_at, last_used_at
		FROM SSHKey
		WHERE fingerprint = ?
	`, fingerprint).Scan(&key.ID, &key.UserID, &key.Fingerprint, &key.PublicKey, &key.KeyType, &key.Label, &key.AddedAt, &key.LastUsedAt)

	if err != nil {
		return nil, err // sql.ErrNoRows if not found
	}

	return &key, nil
}

// GetSSHKeysByUserID retrieves all SSH keys for a user
func (db *DB) GetSSHKeysByUserID(userID int64) ([]SSHKey, error) {
	rows, err := db.conn.Query(`
		SELECT id, user_id, fingerprint, public_key, key_type, label, added_at, last_used_at
		FROM SSHKey
		WHERE user_id = ?
		ORDER BY added_at DESC
	`, userID)

	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var keys []SSHKey
	for rows.Next() {
		var key SSHKey
		if err := rows.Scan(&key.ID, &key.UserID, &key.Fingerprint, &key.PublicKey, &key.KeyType, &key.Label, &key.AddedAt, &key.LastUsedAt); err != nil {
			return nil, err
		}
		keys = append(keys, key)
	}

	if err := rows.Err(); err != nil {
		return nil, err
	}

	return keys, nil
}

// DeleteSSHKey deletes an SSH key by ID
// Only allows deletion if the key belongs to the specified user
func (db *DB) DeleteSSHKey(keyID, userID int64) error {
	result, err := db.writeConn.Exec(`
		DELETE FROM SSHKey WHERE id = ? AND user_id = ?
	`, keyID, userID)

	if err != nil {
		return err
	}

	rowsAffected, err := result.RowsAffected()
	if err != nil {
		return err
	}

	if rowsAffected == 0 {
		return fmt.Errorf("key not found or not owned by user")
	}

	return nil
}

// UpdateSSHKeyLastUsed updates the last_used_at timestamp for an SSH key
func (db *DB) UpdateSSHKeyLastUsed(fingerprint string) error {
	_, err := db.writeConn.Exec(`
		UPDATE SSHKey SET last_used_at = ? WHERE fingerprint = ?
	`, nowMillis(), fingerprint)
	return err
}

// UpdateSSHKeyLabel updates the user-friendly label for an SSH key
// Only allows update if the key belongs to the specified user
func (db *DB) UpdateSSHKeyLabel(keyID, userID int64, label string) error {
	result, err := db.writeConn.Exec(`
		UPDATE SSHKey SET label = ? WHERE id = ? AND user_id = ?
	`, label, keyID, userID)

	if err != nil {
		return err
	}

	rowsAffected, err := result.RowsAffected()
	if err != nil {
		return err
	}

	if rowsAffected == 0 {
		return fmt.Errorf("key not found or not owned by user")
	}

	return nil
}

// ===== DiscoveredServer Methods (Server Discovery Protocol) =====

// DiscoveredServer represents a server in the directory
type DiscoveredServer struct {
	ID                int64
	Hostname          string
	Port              uint16
	Name              string
	Description       string
	MaxUsers          uint32
	IsPublic          bool
	UserCount         uint32
	UptimeSeconds     uint64
	ChannelCount      uint32
	LastHeartbeat     int64
	HeartbeatInterval uint32
	DiscoveredVia     string // "registration" or "gossip"
	SourceIP          string
	CreatedAt         int64
}

// RegisterDiscoveredServer adds or updates a server in the directory
// This is an upsert operation: if hostname:port exists, it updates; otherwise inserts
func (db *DB) RegisterDiscoveredServer(hostname string, port uint16, name, description string, maxUsers uint32, isPublic bool, channelCount uint32, sourceIP, discoveredVia string) (int64, error) {
	now := nowMillis()

	result, err := db.writeConn.Exec(`
		INSERT INTO DiscoveredServer (
			hostname, port, name, description, max_users, is_public,
			user_count, uptime_seconds, channel_count, last_heartbeat, heartbeat_interval,
			discovered_via, source_ip, created_at
		) VALUES (?, ?, ?, ?, ?, ?, 0, 0, ?, ?, 300, ?, ?, ?)
		ON CONFLICT(hostname, port) DO UPDATE SET
			name = excluded.name,
			description = excluded.description,
			max_users = excluded.max_users,
			is_public = excluded.is_public,
			channel_count = excluded.channel_count,
			last_heartbeat = excluded.last_heartbeat
	`, hostname, port, name, description, maxUsers, isPublic, channelCount, now, discoveredVia, sourceIP, now)

	if err != nil {
		return 0, fmt.Errorf("failed to register discovered server: %w", err)
	}

	id, err := result.LastInsertId()
	if err != nil {
		// If it was an update, LastInsertId might fail. Get the ID by querying.
		var serverID int64
		err = db.conn.QueryRow("SELECT id FROM DiscoveredServer WHERE hostname = ? AND port = ?", hostname, port).Scan(&serverID)
		if err != nil {
			return 0, fmt.Errorf("failed to get discovered server ID: %w", err)
		}
		return serverID, nil
	}

	return id, nil
}

// UpdateHeartbeat updates the heartbeat timestamp and stats for a server
func (db *DB) UpdateHeartbeat(hostname string, port uint16, userCount uint32, uptimeSeconds uint64, channelCount uint32, newInterval uint32) error {
	now := nowMillis()

	_, err := db.writeConn.Exec(`
		UPDATE DiscoveredServer
		SET last_heartbeat = ?,
		    user_count = ?,
		    uptime_seconds = ?,
		    channel_count = ?,
		    heartbeat_interval = ?
		WHERE hostname = ? AND port = ?
	`, now, userCount, uptimeSeconds, channelCount, newInterval, hostname, port)

	if err != nil {
		return fmt.Errorf("failed to update heartbeat: %w", err)
	}

	return nil
}

// ListDiscoveredServers returns servers sorted by last heartbeat (most recent first)
// Only returns servers that have sent a heartbeat within the last (heartbeat_interval * 3) seconds
func (db *DB) ListDiscoveredServers(limit uint16) ([]*DiscoveredServer, error) {
	now := nowMillis()

	rows, err := db.conn.Query(`
		SELECT id, hostname, port, name, description, max_users, is_public,
		       user_count, uptime_seconds, channel_count, last_heartbeat, heartbeat_interval,
		       discovered_via, source_ip, created_at
		FROM DiscoveredServer
		WHERE (? - last_heartbeat) <= (heartbeat_interval * 3 * 1000)
		ORDER BY last_heartbeat DESC
		LIMIT ?
	`, now, limit)

	if err != nil {
		return nil, fmt.Errorf("failed to list discovered servers: %w", err)
	}
	defer rows.Close()

	var servers []*DiscoveredServer
	for rows.Next() {
		var server DiscoveredServer
		var sourceIP sql.NullString

		err := rows.Scan(
			&server.ID, &server.Hostname, &server.Port, &server.Name,
			&server.Description, &server.MaxUsers, &server.IsPublic,
			&server.UserCount, &server.UptimeSeconds, &server.ChannelCount, &server.LastHeartbeat,
			&server.HeartbeatInterval, &server.DiscoveredVia, &sourceIP, &server.CreatedAt,
		)
		if err != nil {
			return nil, fmt.Errorf("failed to scan discovered server: %w", err)
		}

		if sourceIP.Valid {
			server.SourceIP = sourceIP.String
		}

		servers = append(servers, &server)
	}

	return servers, rows.Err()
}

// GetDiscoveredServer retrieves a server by hostname and port
func (db *DB) GetDiscoveredServer(hostname string, port uint16) (*DiscoveredServer, error) {
	var server DiscoveredServer
	var sourceIP sql.NullString

	err := db.conn.QueryRow(`
		SELECT id, hostname, port, name, description, max_users, is_public,
		       user_count, uptime_seconds, channel_count, last_heartbeat, heartbeat_interval,
		       discovered_via, source_ip, created_at
		FROM DiscoveredServer
		WHERE hostname = ? AND port = ?
	`, hostname, port).Scan(
		&server.ID, &server.Hostname, &server.Port, &server.Name,
		&server.Description, &server.MaxUsers, &server.IsPublic,
		&server.UserCount, &server.UptimeSeconds, &server.ChannelCount, &server.LastHeartbeat,
		&server.HeartbeatInterval, &server.DiscoveredVia, &sourceIP, &server.CreatedAt,
	)

	if err != nil {
		return nil, err // sql.ErrNoRows if not found
	}

	if sourceIP.Valid {
		server.SourceIP = sourceIP.String
	}

	return &server, nil
}

// DeleteDiscoveredServer removes a server from the directory
func (db *DB) DeleteDiscoveredServer(hostname string, port uint16) error {
	_, err := db.writeConn.Exec(`
		DELETE FROM DiscoveredServer
		WHERE hostname = ? AND port = ?
	`, hostname, port)

	if err != nil {
		return fmt.Errorf("failed to delete discovered server: %w", err)
	}

	return nil
}

// CleanupStaleServers removes servers that haven't sent a heartbeat in more than (heartbeat_interval * 3) seconds
func (db *DB) CleanupStaleServers() (int64, error) {
	now := nowMillis()

	result, err := db.writeConn.Exec(`
		DELETE FROM DiscoveredServer
		WHERE (? - last_heartbeat) > (heartbeat_interval * 3 * 1000)
	`, now)

	if err != nil {
		return 0, fmt.Errorf("failed to cleanup stale servers: %w", err)
	}

	count, err := result.RowsAffected()
	if err != nil {
		return 0, err
	}

	return count, nil
}

// CountDiscoveredServers returns the total number of servers in the directory
func (db *DB) CountDiscoveredServers() (uint32, error) {
	var count uint32
	err := db.conn.QueryRow("SELECT COUNT(*) FROM DiscoveredServer").Scan(&count)
	if err != nil {
		return 0, fmt.Errorf("failed to count discovered servers: %w", err)
	}
	return count, nil
}
