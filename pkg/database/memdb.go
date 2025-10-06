package database

import (
	"database/sql"
	"errors"
	"fmt"
	"log"
	"sort"
	"strings"
	"sync"
	"time"
)

// MemDB is an in-memory database with periodic SQLite snapshots
type MemDB struct {
	mu sync.RWMutex

	// Core data
	channels map[int64]*Channel
	sessions map[int64]*Session
	messages map[int64]*Message

	// Indexes for fast lookups
	messagesByChannel map[int64][]int64        // channelID -> sorted messageIDs (by timestamp)
	messagesByParent  map[int64][]int64        // parentID -> sorted reply messageIDs
	messagesByThread  map[int64][]int64        // threadRootID -> sorted messageIDs
	sessionsByUserID  map[int64]map[int64]bool // userID -> set of sessionIDs

	// Dirty tracking for incremental snapshots
	dirtyMessages map[int64]bool // Messages modified since last snapshot

	// Underlying SQLite DB for snapshots
	sqliteDB         *DB
	snapshotInterval time.Duration
	shutdown         chan struct{}
	wg               sync.WaitGroup
}

// NewMemDB creates a new in-memory database and loads initial state from SQLite
func NewMemDB(sqliteDB *DB, snapshotInterval time.Duration) (*MemDB, error) {
	m := &MemDB{
		channels:          make(map[int64]*Channel),
		sessions:          make(map[int64]*Session),
		messages:          make(map[int64]*Message),
		messagesByChannel: make(map[int64][]int64),
		messagesByParent:  make(map[int64][]int64),
		messagesByThread:  make(map[int64][]int64),
		sessionsByUserID:  make(map[int64]map[int64]bool),
		dirtyMessages:     make(map[int64]bool),
		sqliteDB:          sqliteDB,
		snapshotInterval:  snapshotInterval,
		shutdown:          make(chan struct{}),
	}

	// Load initial state from SQLite
	if err := m.loadFromSQLite(); err != nil {
		return nil, fmt.Errorf("failed to load from SQLite: %w", err)
	}

	// Start background snapshot goroutine
	m.wg.Add(1)
	go m.snapshotLoop()

	log.Printf("MemDB: initialized with %d channels, %d sessions, %d messages",
		len(m.channels), len(m.sessions), len(m.messages))

	return m, nil
}

// loadFromSQLite loads all data from SQLite into memory
func (m *MemDB) loadFromSQLite() error {
	startTotal := time.Now()

	// Load channels
	startChannels := time.Now()
	channels, err := m.sqliteDB.ListChannels()
	if err != nil {
		return fmt.Errorf("failed to load channels: %w", err)
	}
	for _, ch := range channels {
		m.channels[ch.ID] = ch
	}
	log.Printf("MemDB: loaded %d channels in %v", len(channels), time.Since(startChannels))

	// Load ALL messages in one query instead of per-channel recursive queries
	startMessages := time.Now()

	// Query all messages directly from SQLite
	rows, err := m.sqliteDB.conn.Query(`
		SELECT id, channel_id, subchannel_id, parent_id, thread_root_id, author_user_id,
		       author_nickname, content, created_at, edited_at, deleted_at
		FROM Message
		WHERE deleted_at IS NULL
		ORDER BY created_at ASC
	`)
	if err != nil {
		return fmt.Errorf("failed to load messages: %w", err)
	}
	defer rows.Close()

	totalRootMessages := 0
	totalReplies := 0

	for rows.Next() {
		var msg Message
		var subchannelID, parentID, threadRootID, authorUserID, editedAt, deletedAt sql.NullInt64

		err := rows.Scan(
			&msg.ID, &msg.ChannelID, &subchannelID, &parentID, &threadRootID, &authorUserID,
			&msg.AuthorNickname, &msg.Content, &msg.CreatedAt, &editedAt, &deletedAt,
		)
		if err != nil {
			log.Printf("MemDB: failed to scan message: %v", err)
			continue
		}

		// Convert nullable fields
		if subchannelID.Valid {
			msg.SubchannelID = &subchannelID.Int64
		}
		if parentID.Valid {
			msg.ParentID = &parentID.Int64
			totalReplies++
		} else {
			totalRootMessages++
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

		// Store message
		m.messages[msg.ID] = &msg

		// Build indexes
		m.messagesByChannel[msg.ChannelID] = append(m.messagesByChannel[msg.ChannelID], msg.ID)
		if msg.ParentID != nil {
			m.messagesByParent[*msg.ParentID] = append(m.messagesByParent[*msg.ParentID], msg.ID)
		}
		if msg.ThreadRootID != nil {
			m.messagesByThread[*msg.ThreadRootID] = append(m.messagesByThread[*msg.ThreadRootID], msg.ID)
		}
	}

	if err := rows.Err(); err != nil {
		return fmt.Errorf("error iterating messages: %w", err)
	}

	log.Printf("MemDB: loaded %d root messages and %d replies in %v", totalRootMessages, totalReplies, time.Since(startMessages))

	// Sort all message indexes by timestamp
	startSort := time.Now()
	for channelID := range m.messagesByChannel {
		m.sortMessagesByTimestamp(m.messagesByChannel[channelID])
	}
	for parentID := range m.messagesByParent {
		m.sortMessagesByTimestamp(m.messagesByParent[parentID])
	}
	for threadID := range m.messagesByThread {
		m.sortMessagesByTimestamp(m.messagesByThread[threadID])
	}
	log.Printf("MemDB: sorted indexes in %v", time.Since(startSort))

	// Compute reply counts for all messages
	startCounts := time.Now()
	for msgID := range m.messages {
		m.recomputeReplyCount(msgID)
	}
	log.Printf("MemDB: computed reply counts in %v", time.Since(startCounts))

	// Note: Sessions are NOT loaded - they're ephemeral connections
	// Users reconnect and create new sessions on startup

	log.Printf("MemDB: total load time %v (%d total messages)", time.Since(startTotal), len(m.messages))
	return nil
}

// sortMessagesByTimestamp sorts message IDs by their timestamps
func (m *MemDB) sortMessagesByTimestamp(messageIDs []int64) {
	sort.Slice(messageIDs, func(i, j int) bool {
		msgI := m.messages[messageIDs[i]]
		msgJ := m.messages[messageIDs[j]]
		if msgI == nil || msgJ == nil {
			return false
		}
		return msgI.CreatedAt < msgJ.CreatedAt
	})
}

// snapshotLoop periodically snapshots to SQLite
func (m *MemDB) snapshotLoop() {
	defer m.wg.Done()

	ticker := time.NewTicker(m.snapshotInterval)
	defer ticker.Stop()

	for {
		select {
		case <-ticker.C:
			if err := m.snapshot(); err != nil {
				log.Printf("MemDB: snapshot failed: %v", err)
			} else {
				log.Printf("MemDB: snapshot completed successfully")
				// Hard delete old messages after successful snapshot
				deleted := m.hardDeleteOldMessages()
				if deleted > 0 {
					log.Printf("MemDB: hard deleted %d old messages from memory", deleted)
				}
			}
		case <-m.shutdown:
			// Final snapshot on shutdown
			if err := m.snapshot(); err != nil {
				log.Printf("MemDB: final snapshot failed: %v", err)
			} else {
				log.Printf("MemDB: final snapshot completed")
				// Hard delete old messages after final snapshot
				deleted := m.hardDeleteOldMessages()
				if deleted > 0 {
					log.Printf("MemDB: hard deleted %d old messages from memory", deleted)
				}
			}
			return
		}
	}
}

// snapshot writes current in-memory state to SQLite
func (m *MemDB) snapshot() error {
	m.mu.RLock()
	defer m.mu.RUnlock()

	start := time.Now()

	// Note: We don't snapshot channels (admin-managed, rarely change)
	// Note: We don't snapshot sessions (ephemeral, recreated on reconnect)

	// Collect dirty message IDs and sort by ID (ascending order)
	// Since Snowflake IDs are monotonically increasing, parent.ID < child.ID always
	// This ensures we write parents before children without recursion
	retentionCutoff := time.Now().UnixMilli() - (7 * 24 * 3600 * 1000)
	messagesWritten := 0
	messagesSkipped := 0

	dirtyIDs := make([]int64, 0, len(m.dirtyMessages))
	for id := range m.dirtyMessages {
		dirtyIDs = append(dirtyIDs, id)
	}

	// Sort by ID (ascending) - O(n log n) but much faster than recursion for large n
	sort.Slice(dirtyIDs, func(i, j int) bool {
		return dirtyIDs[i] < dirtyIDs[j]
	})

	// Filter out messages to skip and collect messages to write
	messagesToWrite := make([]*Message, 0, len(dirtyIDs))
	for _, id := range dirtyIDs {
		msg := m.messages[id]

		// Skip old deleted messages (will be hard-deleted later)
		if msg.DeletedAt != nil && *msg.DeletedAt < retentionCutoff {
			messagesSkipped++
			continue
		}

		messagesToWrite = append(messagesToWrite, msg)
	}

	// Batch write messages to SQLite using multi-row INSERT
	// Batch size of 500 is optimal (balances SQL parsing vs statement count)
	if len(messagesToWrite) > 0 {
		if err := m.batchInsertMessages(messagesToWrite); err != nil {
			log.Printf("MemDB: snapshot failed to batch insert: %v", err)
			return err
		}
		messagesWritten = len(messagesToWrite)
	}

	// Clear dirty flags after successful write
	m.dirtyMessages = make(map[int64]bool)

	log.Printf("MemDB: snapshot completed - %d messages written, %d old messages skipped (will be deleted) in %v",
		messagesWritten, messagesSkipped, time.Since(start))
	return nil
}

// batchInsertMessages performs a batched INSERT OR REPLACE for messages
// SQLite 3.32.0+ has a parameter limit of 32766, but optimal batch size is smaller
// due to query building and parsing overhead (string concatenation + SQL parse)
func (m *MemDB) batchInsertMessages(messages []*Message) error {
	const fieldsPerMessage = 11
	// Optimal batch size balances:
	// - Fewer SQL statements (larger batches)
	// - Less string building overhead (smaller batches)
	// - SQL parsing time (smaller batches)
	// Testing shows ~500 messages hits the sweet spot
	const batchSize = 500

	tx, err := m.sqliteDB.writeConn.Begin()
	if err != nil {
		return fmt.Errorf("failed to begin transaction: %w", err)
	}
	defer tx.Rollback()

	for i := 0; i < len(messages); i += batchSize {
		end := i + batchSize
		if end > len(messages) {
			end = len(messages)
		}
		batch := messages[i:end]

		// Build multi-row INSERT statement
		// INSERT OR REPLACE INTO Message (...) VALUES (?,?,...), (?,?,...), ...
		var queryBuilder strings.Builder
		queryBuilder.WriteString(`INSERT OR REPLACE INTO Message
			(id, channel_id, subchannel_id, parent_id, thread_root_id,
			 author_user_id, author_nickname, content, created_at, edited_at, deleted_at)
			VALUES `)

		args := make([]interface{}, 0, len(batch)*fieldsPerMessage)
		for j, msg := range batch {
			if j > 0 {
				queryBuilder.WriteString(", ")
			}
			queryBuilder.WriteString("(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)")

			args = append(args,
				msg.ID, msg.ChannelID, msg.SubchannelID, msg.ParentID, msg.ThreadRootID,
				msg.AuthorUserID, msg.AuthorNickname, msg.Content, msg.CreatedAt,
				msg.EditedAt, msg.DeletedAt,
			)
		}

		// Execute batch
		if _, err := tx.Exec(queryBuilder.String(), args...); err != nil {
			return fmt.Errorf("failed to execute batch insert: %w", err)
		}
	}

	if err := tx.Commit(); err != nil {
		return fmt.Errorf("failed to commit transaction: %w", err)
	}

	return nil
}

// hardDeleteOldMessages removes messages from memory that have been soft-deleted for >7 days
// Must be called after snapshot() to ensure deleted messages are persisted first
func (m *MemDB) hardDeleteOldMessages() int {
	m.mu.Lock()
	defer m.mu.Unlock()

	retentionCutoff := time.Now().UnixMilli() - (7 * 24 * 3600 * 1000)
	deletedCount := 0

	// Collect message IDs to delete (can't modify map while iterating)
	toDelete := make([]int64, 0)
	for msgID, msg := range m.messages {
		if msg.DeletedAt != nil && *msg.DeletedAt < retentionCutoff {
			toDelete = append(toDelete, msgID)
		}
	}

	// Delete messages and clean up indices
	for _, msgID := range toDelete {
		msg := m.messages[msgID]
		if msg == nil {
			continue
		}

		// Remove from main map
		delete(m.messages, msgID)

		// Remove from channel index
		channelMsgs := m.messagesByChannel[msg.ChannelID]
		for i, id := range channelMsgs {
			if id == msgID {
				m.messagesByChannel[msg.ChannelID] = append(channelMsgs[:i], channelMsgs[i+1:]...)
				break
			}
		}

		// Remove from parent index (if reply)
		if msg.ParentID != nil {
			parentReplies := m.messagesByParent[*msg.ParentID]
			for i, id := range parentReplies {
				if id == msgID {
					m.messagesByParent[*msg.ParentID] = append(parentReplies[:i], parentReplies[i+1:]...)
					break
				}
			}
		}

		// Remove from thread index
		if msg.ThreadRootID != nil {
			threadMsgs := m.messagesByThread[*msg.ThreadRootID]
			for i, id := range threadMsgs {
				if id == msgID {
					m.messagesByThread[*msg.ThreadRootID] = append(threadMsgs[:i], threadMsgs[i+1:]...)
					break
				}
			}
		}

		deletedCount++
	}

	return deletedCount
}

// Close shuts down the background snapshot goroutine
func (m *MemDB) Close() error {
	close(m.shutdown)
	m.wg.Wait()
	return nil
}

// Snowflake returns the snowflake ID generator
func (m *MemDB) Snowflake() *Snowflake {
	return m.sqliteDB.snowflake
}

// === Session Operations ===

// CreateSession creates a new session in memory
func (m *MemDB) CreateSession(userID *int64, nickname, connType string) (int64, error) {
	// Generate session ID using lock-free snowflake
	sessionID := m.sqliteDB.snowflake.NextID()
	now := nowMillis()

	session := &Session{
		ID:             sessionID,
		UserID:         userID,
		Nickname:       nickname,
		ConnectionType: connType,
		ConnectedAt:    now,
		LastActivity:   now,
	}

	// Only acquire lock for map operations (critical section)
	m.mu.Lock()
	m.sessions[sessionID] = session
	if userID != nil {
		if m.sessionsByUserID[*userID] == nil {
			m.sessionsByUserID[*userID] = make(map[int64]bool)
		}
		m.sessionsByUserID[*userID][sessionID] = true
	}
	m.mu.Unlock()

	return sessionID, nil
}

// GetSession retrieves a session by ID
func (m *MemDB) GetSession(sessionID int64) (*Session, error) {
	m.mu.RLock()
	session, exists := m.sessions[sessionID]
	m.mu.RUnlock()

	if !exists {
		return nil, fmt.Errorf("session not found")
	}

	// Return a copy to prevent external mutation
	sessionCopy := *session
	return &sessionCopy, nil
}

// UpdateSessionActivity updates the last_activity timestamp
func (m *MemDB) UpdateSessionActivity(sessionID int64) error {
	m.mu.Lock()
	session, exists := m.sessions[sessionID]
	if !exists {
		m.mu.Unlock()
		return fmt.Errorf("session not found")
	}
	session.LastActivity = nowMillis()
	m.mu.Unlock()

	return nil
}

// UpdateSessionNickname updates a session's nickname
func (m *MemDB) UpdateSessionNickname(sessionID int64, nickname string) error {
	m.mu.Lock()
	session, exists := m.sessions[sessionID]
	if !exists {
		m.mu.Unlock()
		return fmt.Errorf("session not found")
	}
	session.Nickname = nickname
	m.mu.Unlock()

	return nil
}

// DeleteSession removes a session from memory
func (m *MemDB) DeleteSession(sessionID int64) error {
	m.mu.Lock()
	session, exists := m.sessions[sessionID]
	if exists {
		// Remove from user index
		if session.UserID != nil {
			if userSessions, ok := m.sessionsByUserID[*session.UserID]; ok {
				delete(userSessions, sessionID)
				if len(userSessions) == 0 {
					delete(m.sessionsByUserID, *session.UserID)
				}
			}
		}
		delete(m.sessions, sessionID)
	}
	m.mu.Unlock()

	return nil
}

// GetActiveSessions returns sessions active within the given number of seconds
func (m *MemDB) GetActiveSessions(withinSeconds int64) ([]Session, error) {
	threshold := nowMillis() - (withinSeconds * 1000)

	m.mu.RLock()
	defer m.mu.RUnlock()

	sessions := make([]Session, 0, len(m.sessions))
	for _, session := range m.sessions {
		if session.LastActivity >= threshold {
			sessions = append(sessions, *session)
		}
	}

	return sessions, nil
}

// === Channel Operations ===

// ListChannels returns all channels
func (m *MemDB) ListChannels() ([]*Channel, error) {
	m.mu.RLock()
	defer m.mu.RUnlock()

	channels := make([]*Channel, 0, len(m.channels))
	for _, ch := range m.channels {
		// Return copies to prevent external mutation
		chCopy := *ch
		channels = append(channels, &chCopy)
	}

	// Sort channels alphabetically by name
	sort.Slice(channels, func(i, j int) bool {
		return channels[i].Name < channels[j].Name
	})

	return channels, nil
}

// GetChannel retrieves a channel by ID
func (m *MemDB) GetChannel(channelID int64) (*Channel, error) {
	m.mu.RLock()
	channel, exists := m.channels[channelID]
	m.mu.RUnlock()

	if !exists {
		return nil, fmt.Errorf("channel not found")
	}

	channelCopy := *channel
	return &channelCopy, nil
}

// ChannelExists checks if a channel exists
func (m *MemDB) ChannelExists(channelID int64) (bool, error) {
	m.mu.RLock()
	_, exists := m.channels[channelID]
	m.mu.RUnlock()

	return exists, nil
}

// === Message Operations ===

// PostMessage creates a new message in memory and returns both ID and the message
func (m *MemDB) PostMessage(channelID int64, subchannelID, parentID, authorUserID *int64, authorNickname, content string) (int64, *Message, error) {
	messageID := m.sqliteDB.snowflake.NextID()
	now := nowMillis()

	// Determine thread_root_id
	var threadRootID *int64
	if parentID != nil {
		// This is a reply - inherit parent's thread_root_id
		m.mu.RLock()
		parent, exists := m.messages[*parentID]
		m.mu.RUnlock()

		if !exists {
			return 0, nil, fmt.Errorf("parent message not found")
		}

		threadRootID = parent.ThreadRootID
	} else {
		// Top-level message - it's its own thread root
		threadRootID = &messageID
	}

	message := &Message{
		ID:             messageID,
		ChannelID:      channelID,
		SubchannelID:   subchannelID,
		ParentID:       parentID,
		ThreadRootID:   threadRootID,
		AuthorUserID:   authorUserID,
		AuthorNickname: authorNickname,
		Content:        content,
		CreatedAt:      now,
		EditedAt:       nil,
		DeletedAt:      nil,
	}

	m.mu.Lock()
	m.messages[messageID] = message
	m.dirtyMessages[messageID] = true // Mark as dirty for next snapshot

	// Update indexes
	m.messagesByChannel[channelID] = append(m.messagesByChannel[channelID], messageID)
	if parentID != nil {
		m.messagesByParent[*parentID] = append(m.messagesByParent[*parentID], messageID)
		// Increment parent's reply count (atomic)
		if parent := m.messages[*parentID]; parent != nil {
			parent.ReplyCount.Add(1)
		}
	}
	if threadRootID != nil {
		m.messagesByThread[*threadRootID] = append(m.messagesByThread[*threadRootID], messageID)
	}
	m.mu.Unlock()

	return messageID, message, nil
}

// GetMessage retrieves a single message by ID
func (m *MemDB) GetMessage(messageID int64) (*Message, error) {
	m.mu.RLock()
	message, exists := m.messages[messageID]
	m.mu.RUnlock()

	if !exists {
		return nil, fmt.Errorf("message not found")
	}

	messageCopy := *message
	return &messageCopy, nil
}

// GetRootMessages retrieves top-level messages in a channel (no parent)
func (m *MemDB) GetRootMessages(channelID int64, fromMessageID int64, limit int) ([]Message, error) {
	m.mu.RLock()
	defer m.mu.RUnlock()

	allMessageIDs, exists := m.messagesByChannel[channelID]
	if !exists {
		return []Message{}, nil
	}

	messages := make([]Message, 0, limit)
	for _, msgID := range allMessageIDs {
		if fromMessageID > 0 && msgID <= fromMessageID {
			continue
		}

		msg := m.messages[msgID]
		if msg == nil || msg.DeletedAt != nil || msg.ParentID != nil {
			continue // Skip deleted or replies
		}

		messages = append(messages, *msg)
		if len(messages) >= limit {
			break
		}
	}

	return messages, nil
}

// GetReplies retrieves all direct replies to a message
func (m *MemDB) GetReplies(parentID int64) ([]Message, error) {
	m.mu.RLock()
	defer m.mu.RUnlock()

	replyIDs, exists := m.messagesByParent[parentID]
	if !exists {
		return []Message{}, nil
	}

	messages := make([]Message, 0, len(replyIDs))
	for _, msgID := range replyIDs {
		msg := m.messages[msgID]
		if msg != nil && msg.DeletedAt == nil {
			messages = append(messages, *msg)
		}
	}

	return messages, nil
}

// GetThreadMessages retrieves all messages in a thread
func (m *MemDB) GetThreadMessages(threadRootID int64) ([]Message, error) {
	m.mu.RLock()
	defer m.mu.RUnlock()

	messageIDs, exists := m.messagesByThread[threadRootID]
	if !exists {
		return []Message{}, nil
	}

	messages := make([]Message, 0, len(messageIDs))
	for _, msgID := range messageIDs {
		msg := m.messages[msgID]
		if msg != nil && msg.DeletedAt == nil {
			messages = append(messages, *msg)
		}
	}

	return messages, nil
}

// MessageExists checks if a message exists and is not deleted
func (m *MemDB) MessageExists(messageID int64) (bool, error) {
	m.mu.RLock()
	msg, exists := m.messages[messageID]
	m.mu.RUnlock()

	return exists && msg.DeletedAt == nil, nil
}

// ListRootMessages retrieves top-level messages (compatible with SQLite DB interface)
func (m *MemDB) ListRootMessages(channelID int64, subchannelID *int64, limit uint16, beforeID *uint64) ([]*Message, error) {
	m.mu.RLock()
	defer m.mu.RUnlock()

	allMessageIDs, exists := m.messagesByChannel[channelID]
	if !exists {
		return []*Message{}, nil
	}

	messages := make([]*Message, 0, limit)
	for _, msgID := range allMessageIDs {
		if beforeID != nil && uint64(msgID) >= *beforeID {
			continue
		}

		msg := m.messages[msgID]
		if msg == nil || msg.DeletedAt != nil || msg.ParentID != nil {
			continue // Skip deleted or replies
		}

		// Filter by subchannel if specified
		if subchannelID != nil {
			if msg.SubchannelID == nil || *msg.SubchannelID != *subchannelID {
				continue
			}
		}

		messages = append(messages, msg)
		if len(messages) >= int(limit) {
			break
		}
	}

	return messages, nil
}

// ListThreadReplies retrieves all replies to a message (compatible with SQLite DB interface)
func (m *MemDB) ListThreadReplies(parentID uint64) ([]*Message, error) {
	m.mu.RLock()
	defer m.mu.RUnlock()

	replyIDs, exists := m.messagesByParent[int64(parentID)]
	if !exists {
		return []*Message{}, nil
	}

	messages := make([]*Message, 0, len(replyIDs))
	for _, msgID := range replyIDs {
		msg := m.messages[msgID]
		if msg != nil && msg.DeletedAt == nil {
			messages = append(messages, msg)
		}
	}

	return messages, nil
}

// recomputeReplyCount recalculates the reply count for a message (assumes lock held)
func (m *MemDB) recomputeReplyCount(messageID int64) {
	msg := m.messages[messageID]
	if msg == nil {
		return
	}

	replyIDs := m.messagesByParent[messageID]
	count := uint32(0)
	for _, msgID := range replyIDs {
		reply := m.messages[msgID]
		if reply != nil && reply.DeletedAt == nil {
			count++
		}
	}
	msg.ReplyCount.Store(count)
}

// CountReplies returns the cached reply count for a message (O(1) lookup)
func (m *MemDB) CountReplies(messageID int64) (uint32, error) {
	m.mu.RLock()
	defer m.mu.RUnlock()

	msg := m.messages[messageID]
	if msg == nil {
		return 0, nil
	}

	return msg.ReplyCount.Load(), nil
}

// SubchannelExists checks if a subchannel exists (V2 feature - not implemented yet)
func (m *MemDB) SubchannelExists(subchannelID int64) (bool, error) {
	// V2 feature - always return false for V1
	return false, nil
}

// SoftDeleteMessage marks a message as deleted (sets deleted_at timestamp)
func (m *MemDB) SoftDeleteMessage(messageID uint64, nickname string) (*Message, error) {
	m.mu.Lock()
	defer m.mu.Unlock()

	msg, exists := m.messages[int64(messageID)]
	if !exists {
		return nil, fmt.Errorf("message not found")
	}

	if msg.DeletedAt != nil {
		return nil, fmt.Errorf("message already deleted")
	}

	// Mark as deleted
	now := nowMillis()
	msg.DeletedAt = &now
	m.dirtyMessages[int64(messageID)] = true // Mark as dirty for next snapshot

	// Decrement parent's reply count (if this is a reply, atomic)
	if msg.ParentID != nil {
		if parent := m.messages[*msg.ParentID]; parent != nil && parent.ReplyCount.Load() > 0 {
			parent.ReplyCount.Add(^uint32(0)) // Atomic decrement (two's complement of 0 = -1)
		}
	}

	return msg, nil
}

// UpdateMessage updates a message's content (for registered users only)
func (m *MemDB) UpdateMessage(messageID uint64, userID uint64, newContent string) (*Message, error) {
	m.mu.Lock()
	defer m.mu.Unlock()

	msg, exists := m.messages[int64(messageID)]
	if !exists {
		return nil, ErrMessageNotFound
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

	// Update content and edited_at timestamp
	now := nowMillis()
	msg.Content = newContent
	msg.EditedAt = &now
	m.dirtyMessages[int64(messageID)] = true // Mark as dirty for next snapshot

	return msg, nil
}

// CleanupExpiredMessages removes messages older than retention period (no-op for V1 - handled by snapshot)
func (m *MemDB) CleanupExpiredMessages() (int64, error) {
	// In MemDB, we don't need to actively clean up - the snapshot process
	// only writes recent messages, and we reload from SQLite on startup
	// SQLite's cleanup will handle the actual deletion
	return 0, nil
}

// CleanupIdleSessions removes sessions inactive for longer than timeout (no-op for V1 - handled by session manager)
func (m *MemDB) CleanupIdleSessions(timeoutSeconds int64) (int64, error) {
	// Session cleanup is handled by SessionManager in real-time
	// No need for batch cleanup in MemDB
	return 0, nil
}

// User management methods (V2 features)

// CreateUser creates a new registered user
func (m *MemDB) CreateUser(nickname, passwordHash string, userFlags uint8) (int64, error) {
	return m.sqliteDB.CreateUser(nickname, passwordHash, userFlags)
}

// GetUserByNickname retrieves a user by nickname
func (m *MemDB) GetUserByNickname(nickname string) (*User, error) {
	return m.sqliteDB.GetUserByNickname(nickname)
}

// GetUserByID retrieves a user by ID
func (m *MemDB) GetUserByID(userID int64) (*User, error) {
	return m.sqliteDB.GetUserByID(userID)
}

// UpdateUserLastSeen updates the last_seen timestamp for a user
func (m *MemDB) UpdateUserLastSeen(userID int64) error {
	return m.sqliteDB.UpdateUserLastSeen(userID)
}

// UpdateUserNickname updates a user's nickname
func (m *MemDB) UpdateUserNickname(userID int64, newNickname string) error {
	return m.sqliteDB.UpdateUserNickname(userID, newNickname)
}

// UpdateSessionUserID links a session to a registered user
func (m *MemDB) UpdateSessionUserID(sessionID, userID int64) error {
	return m.sqliteDB.UpdateSessionUserID(sessionID, userID)
}

// CreateChannel creates a new channel (wrapper for sqliteDB.CreateChannel)
func (m *MemDB) CreateChannel(name, displayName string, description *string, channelType uint8, retentionHours uint32, createdBy *int64) error {
	return m.sqliteDB.CreateChannel(name, displayName, description, channelType, retentionHours, createdBy)
}
