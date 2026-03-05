package archiver

import (
	"database/sql"
	"fmt"

	gen "github.com/aeolun/superchat/pkg/archive/generated"
	_ "modernc.org/sqlite"
)

// ChannelStateRow is the per-channel state returned to the server during handshake.
type ChannelStateRow struct {
	ChannelID     int64
	LastMessageID int64
}

// Store manages the archiver's persistent SQLite database.
type Store struct {
	db *sql.DB
}

// NewStore opens (or creates) the archive database.
func NewStore(path string) (*Store, error) {
	db, err := sql.Open("sqlite", path)
	if err != nil {
		return nil, fmt.Errorf("archiver: open db: %w", err)
	}

	// WAL mode for concurrent reads
	if _, err := db.Exec("PRAGMA journal_mode=WAL"); err != nil {
		db.Close()
		return nil, fmt.Errorf("archiver: set WAL: %w", err)
	}

	if err := migrate(db); err != nil {
		db.Close()
		return nil, fmt.Errorf("archiver: migrate: %w", err)
	}

	return &Store{db: db}, nil
}

// Close closes the database.
func (s *Store) Close() {
	s.db.Close()
}

// migrate creates the schema if it doesn't exist.
func migrate(db *sql.DB) error {
	schema := `
	CREATE TABLE IF NOT EXISTS Channel (
		id              INTEGER PRIMARY KEY,
		name            TEXT NOT NULL,
		description     TEXT NOT NULL DEFAULT '',
		channel_type    INTEGER NOT NULL DEFAULT 0,
		retention_hours INTEGER NOT NULL DEFAULT 168,
		archive_enabled INTEGER NOT NULL DEFAULT 1
	);

	CREATE TABLE IF NOT EXISTS Message (
		id              INTEGER PRIMARY KEY,
		channel_id      INTEGER NOT NULL REFERENCES Channel(id),
		parent_id       INTEGER,
		thread_root_id  INTEGER,
		author_user_id  INTEGER,
		author_nickname TEXT NOT NULL DEFAULT '',
		content         TEXT NOT NULL DEFAULT '',
		created_at      INTEGER NOT NULL,
		edited_at       INTEGER,
		deleted_at      INTEGER
	);

	CREATE INDEX IF NOT EXISTS idx_message_channel ON Message(channel_id, id);
	CREATE INDEX IF NOT EXISTS idx_message_thread ON Message(thread_root_id);
	`
	_, err := db.Exec(schema)
	return err
}

// GetChannelStates returns the last message ID for each channel.
func (s *Store) GetChannelStates() ([]ChannelStateRow, error) {
	rows, err := s.db.Query(`
		SELECT c.id, COALESCE(MAX(m.id), 0) as last_message_id
		FROM Channel c
		LEFT JOIN Message m ON m.channel_id = c.id
		GROUP BY c.id
	`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var states []ChannelStateRow
	for rows.Next() {
		var cs ChannelStateRow
		if err := rows.Scan(&cs.ChannelID, &cs.LastMessageID); err != nil {
			return nil, err
		}
		states = append(states, cs)
	}
	return states, rows.Err()
}

// UpsertChannel inserts or updates a channel.
func (s *Store) UpsertChannel(msg *gen.ChannelInfo) error {
	_, err := s.db.Exec(`
		INSERT INTO Channel (id, name, description, channel_type, retention_hours, archive_enabled)
		VALUES (?, ?, ?, ?, ?, ?)
		ON CONFLICT(id) DO UPDATE SET
			name = excluded.name,
			description = excluded.description,
			channel_type = excluded.channel_type,
			retention_hours = excluded.retention_hours,
			archive_enabled = excluded.archive_enabled
	`, msg.ChannelId, msg.Name, msg.Description, msg.ChannelType, msg.RetentionHours, msg.ArchiveEnabled)
	return err
}

// UpsertMessage inserts or updates a message (idempotent for backfill).
func (s *Store) UpsertMessage(msg *gen.MessageSync) error {
	_, err := s.db.Exec(`
		INSERT INTO Message (id, channel_id, parent_id, thread_root_id, author_user_id, author_nickname, content, created_at, edited_at, deleted_at)
		VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
		ON CONFLICT(id) DO UPDATE SET
			content = excluded.content,
			edited_at = excluded.edited_at,
			deleted_at = excluded.deleted_at
	`, msg.MessageId, msg.ChannelId, msg.ParentId, msg.ThreadRootId, msg.AuthorUserId, msg.AuthorNickname, msg.Content, msg.CreatedAt, msg.EditedAt, msg.DeletedAt)
	return err
}

// UpdateMessage applies an edit to a message.
func (s *Store) UpdateMessage(msg *gen.MessageEdited) error {
	_, err := s.db.Exec(`
		UPDATE Message SET content = ?, edited_at = ? WHERE id = ?
	`, msg.NewContent, msg.EditedAt, msg.MessageId)
	return err
}

// DeleteMessage applies a soft delete to a message.
func (s *Store) DeleteMessage(msg *gen.MessageDeleted) error {
	_, err := s.db.Exec(`
		UPDATE Message SET deleted_at = ? WHERE id = ?
	`, msg.DeletedAt, msg.MessageId)
	return err
}

// GetChannels returns all channels.
func (s *Store) GetChannels() ([]ChannelRow, error) {
	rows, err := s.db.Query(`
		SELECT id, name, description, channel_type, retention_hours, archive_enabled
		FROM Channel ORDER BY name
	`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var channels []ChannelRow
	for rows.Next() {
		var ch ChannelRow
		if err := rows.Scan(&ch.ID, &ch.Name, &ch.Description, &ch.ChannelType, &ch.RetentionHours, &ch.ArchiveEnabled); err != nil {
			return nil, err
		}
		channels = append(channels, ch)
	}
	return channels, rows.Err()
}

// GetChannelByID returns a single channel by ID.
func (s *Store) GetChannelByID(id int64) (*ChannelRow, error) {
	var ch ChannelRow
	err := s.db.QueryRow(`
		SELECT id, name, description, channel_type, retention_hours, archive_enabled
		FROM Channel WHERE id = ?
	`, id).Scan(&ch.ID, &ch.Name, &ch.Description, &ch.ChannelType, &ch.RetentionHours, &ch.ArchiveEnabled)
	if err != nil {
		return nil, err
	}
	return &ch, nil
}

// GetRootMessages returns top-level messages (no parent) for a channel, ordered by created_at.
func (s *Store) GetRootMessages(channelID int64, limit, offset int) ([]MessageRow, error) {
	rows, err := s.db.Query(`
		SELECT id, channel_id, parent_id, thread_root_id, author_user_id, author_nickname,
			content, created_at, edited_at, deleted_at
		FROM Message
		WHERE channel_id = ? AND parent_id IS NULL
		ORDER BY created_at DESC
		LIMIT ? OFFSET ?
	`, channelID, limit, offset)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	return scanMessages(rows)
}

// GetThreadMessages returns all messages in a thread (root + replies), ordered by created_at.
func (s *Store) GetThreadMessages(threadRootID int64) ([]MessageRow, error) {
	rows, err := s.db.Query(`
		SELECT id, channel_id, parent_id, thread_root_id, author_user_id, author_nickname,
			content, created_at, edited_at, deleted_at
		FROM Message
		WHERE id = ? OR thread_root_id = ?
		ORDER BY created_at ASC
	`, threadRootID, threadRootID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	return scanMessages(rows)
}

// GetMessageCount returns the total number of messages in a channel.
func (s *Store) GetMessageCount(channelID int64) (int, error) {
	var count int
	err := s.db.QueryRow("SELECT COUNT(*) FROM Message WHERE channel_id = ?", channelID).Scan(&count)
	return count, err
}

// ChannelRow is a channel from the archive database.
type ChannelRow struct {
	ID             int64
	Name           string
	Description    string
	ChannelType    int
	RetentionHours int
	ArchiveEnabled int
}

// MessageRow is a message from the archive database.
type MessageRow struct {
	ID             int64
	ChannelID      int64
	ParentID       *int64
	ThreadRootID   *int64
	AuthorUserID   *int64
	AuthorNickname string
	Content        string
	CreatedAt      int64
	EditedAt       *int64
	DeletedAt      *int64
}

func scanMessages(rows *sql.Rows) ([]MessageRow, error) {
	var messages []MessageRow
	for rows.Next() {
		var m MessageRow
		if err := rows.Scan(&m.ID, &m.ChannelID, &m.ParentID, &m.ThreadRootID, &m.AuthorUserID, &m.AuthorNickname, &m.Content, &m.CreatedAt, &m.EditedAt, &m.DeletedAt); err != nil {
			return nil, err
		}
		messages = append(messages, m)
	}
	return messages, rows.Err()
}
