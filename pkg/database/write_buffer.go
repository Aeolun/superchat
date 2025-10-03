package database

import (
	"database/sql"
	"log"
	"sync"
	"time"
)

// WriteBuffer batches database writes to reduce lock contention
type WriteBuffer struct {
	db            *DB
	flushInterval time.Duration

	// Session creation
	sessionCreateMu      sync.Mutex
	sessionCreates       []*pendingSessionCreate
	sessionCreateResults map[int]chan sessionCreateResult // index -> result channel

	// Session activity updates
	sessionMu      sync.Mutex
	sessionUpdates map[int64]int64 // sessionID -> last_activity timestamp

	// Session nickname updates
	nicknameMu      sync.Mutex
	nicknameUpdates map[int64]string // sessionID -> nickname

	// Message inserts
	messageMu      sync.Mutex
	messageInserts []*pendingMessage
	messageResults map[int]chan messageResult // index -> result channel

	// Session deletions
	deletionMu       sync.Mutex
	sessionDeletions map[int64]bool // sessionID -> pending deletion

	// Shutdown
	shutdown chan struct{}
	wg       sync.WaitGroup
}

type pendingSessionCreate struct {
	userID      *int64
	nickname    string
	connType    string
	timestamp   int64
	resultIndex int
}

type sessionCreateResult struct {
	sessionID int64
	err       error
}

type pendingMessage struct {
	channelID      int64
	subchannelID   *int64
	parentID       *int64
	authorUserID   *int64
	authorNickname string
	content        string
	timestamp      int64
	resultIndex    int
}

type messageResult struct {
	messageID int64
	message   *Message
	err       error
}

// NewWriteBuffer creates a new write buffer with the given flush interval
func NewWriteBuffer(db *DB, flushInterval time.Duration) *WriteBuffer {
	wb := &WriteBuffer{
		db:                   db,
		flushInterval:        flushInterval,
		sessionCreates:       make([]*pendingSessionCreate, 0, 50),
		sessionCreateResults: make(map[int]chan sessionCreateResult),
		sessionUpdates:       make(map[int64]int64),
		nicknameUpdates:      make(map[int64]string),
		messageInserts:       make([]*pendingMessage, 0, 100),
		messageResults:       make(map[int]chan messageResult),
		sessionDeletions:     make(map[int64]bool),
		shutdown:             make(chan struct{}),
	}

	// Start flush loop
	wb.wg.Add(1)
	go wb.flushLoop()

	return wb
}

// CreateSession queues a session creation and returns the session ID once flushed
func (wb *WriteBuffer) CreateSession(userID *int64, nickname, connType string) (int64, error) {
	resultChan := make(chan sessionCreateResult, 1)

	wb.sessionCreateMu.Lock()
	resultIndex := len(wb.sessionCreates)
	wb.sessionCreates = append(wb.sessionCreates, &pendingSessionCreate{
		userID:      userID,
		nickname:    nickname,
		connType:    connType,
		timestamp:   nowMillis(),
		resultIndex: resultIndex,
	})
	wb.sessionCreateResults[resultIndex] = resultChan
	wb.sessionCreateMu.Unlock()

	// Wait for flush to complete
	result := <-resultChan
	return result.sessionID, result.err
}

// UpdateSessionActivity queues a session activity update
func (wb *WriteBuffer) UpdateSessionActivity(sessionID int64, timestamp int64) {
	wb.sessionMu.Lock()
	wb.sessionUpdates[sessionID] = timestamp
	wb.sessionMu.Unlock()
}

// UpdateSessionNickname queues a session nickname update
func (wb *WriteBuffer) UpdateSessionNickname(sessionID int64, nickname string) {
	wb.nicknameMu.Lock()
	wb.nicknameUpdates[sessionID] = nickname
	wb.nicknameMu.Unlock()
}

// PostMessage queues a message insert and returns the message ID and full message once flushed
func (wb *WriteBuffer) PostMessage(channelID int64, subchannelID, parentID, authorUserID *int64, authorNickname, content string) (int64, *Message, error) {
	resultChan := make(chan messageResult, 1)

	wb.messageMu.Lock()
	resultIndex := len(wb.messageInserts)
	wb.messageInserts = append(wb.messageInserts, &pendingMessage{
		channelID:      channelID,
		subchannelID:   subchannelID,
		parentID:       parentID,
		authorUserID:   authorUserID,
		authorNickname: authorNickname,
		content:        content,
		timestamp:      nowMillis(),
		resultIndex:    resultIndex,
	})
	wb.messageResults[resultIndex] = resultChan
	wb.messageMu.Unlock()

	// Wait for flush to complete
	result := <-resultChan
	return result.messageID, result.message, result.err
}

// DeleteSession queues a session deletion
func (wb *WriteBuffer) DeleteSession(sessionID int64) {
	wb.deletionMu.Lock()
	wb.sessionDeletions[sessionID] = true
	wb.deletionMu.Unlock()
}

// flushLoop periodically flushes buffered writes
func (wb *WriteBuffer) flushLoop() {
	defer wb.wg.Done()

	ticker := time.NewTicker(wb.flushInterval)
	defer ticker.Stop()

	for {
		select {
		case <-ticker.C:
			wb.flush()
		case <-wb.shutdown:
			// Final flush on shutdown
			wb.flush()
			return
		}
	}
}

// flush writes all buffered updates to the database in a single transaction
func (wb *WriteBuffer) flush() {
	start := time.Now()

	// Grab all pending updates
	wb.sessionCreateMu.Lock()
	sessionCreates := wb.sessionCreates
	sessionCreateResults := wb.sessionCreateResults
	wb.sessionCreates = make([]*pendingSessionCreate, 0, 50)
	wb.sessionCreateResults = make(map[int]chan sessionCreateResult)
	wb.sessionCreateMu.Unlock()

	wb.sessionMu.Lock()
	sessionUpdates := wb.sessionUpdates
	wb.sessionUpdates = make(map[int64]int64)
	wb.sessionMu.Unlock()

	wb.nicknameMu.Lock()
	nicknameUpdates := wb.nicknameUpdates
	wb.nicknameUpdates = make(map[int64]string)
	wb.nicknameMu.Unlock()

	wb.messageMu.Lock()
	messageInserts := wb.messageInserts
	messageResults := wb.messageResults
	wb.messageInserts = make([]*pendingMessage, 0, 100)
	wb.messageResults = make(map[int]chan messageResult)
	wb.messageMu.Unlock()

	wb.deletionMu.Lock()
	sessionDeletions := wb.sessionDeletions
	wb.sessionDeletions = make(map[int64]bool)
	wb.deletionMu.Unlock()

	// Nothing to do
	if len(sessionCreates) == 0 && len(sessionUpdates) == 0 && len(nicknameUpdates) == 0 && len(messageInserts) == 0 && len(sessionDeletions) == 0 {
		return
	}

	sessionCreateCount := len(sessionCreates)
	sessionCount := len(sessionUpdates)
	nicknameCount := len(nicknameUpdates)
	messageCount := len(messageInserts)
	deletionCount := len(sessionDeletions)
	totalItems := sessionCreateCount + sessionCount + nicknameCount + messageCount + deletionCount

	// Measure time waiting for transaction lock
	lockStart := time.Now()
	// Single transaction for ALL writes (using dedicated write connection)
	tx, err := wb.db.writeConn.Begin()
	lockWait := time.Since(lockStart)
	if err != nil {
		log.Printf("WriteBuffer: failed to begin transaction: %v", err)
		// Return updates for retry
		wb.sessionMu.Lock()
		for id, ts := range sessionUpdates {
			wb.sessionUpdates[id] = ts
		}
		wb.sessionMu.Unlock()
		wb.nicknameMu.Lock()
		for id, nick := range nicknameUpdates {
			wb.nicknameUpdates[id] = nick
		}
		wb.nicknameMu.Unlock()
		for _, resultChan := range messageResults {
			resultChan <- messageResult{err: err}
		}
		return
	}
	defer tx.Rollback()

	// 1. Session creation
	if len(sessionCreates) > 0 {
		stmt, err := tx.Prepare(`
			INSERT INTO Session (user_id, nickname, connection_type, connected_at, last_activity)
			VALUES (?, ?, ?, ?, ?)
		`)
		if err != nil {
			log.Printf("WriteBuffer: failed to prepare session create statement: %v", err)
			for _, resultChan := range sessionCreateResults {
				resultChan <- sessionCreateResult{err: err}
			}
		} else {
			defer stmt.Close()
			for _, sess := range sessionCreates {
				var userIDVal sql.NullInt64
				if sess.userID != nil {
					userIDVal.Valid = true
					userIDVal.Int64 = *sess.userID
				}

				result, err := stmt.Exec(userIDVal, sess.nickname, sess.connType, sess.timestamp, sess.timestamp)
				if err != nil {
					sessionCreateResults[sess.resultIndex] <- sessionCreateResult{err: err}
					continue
				}

				sessionID, err := result.LastInsertId()
				if err != nil {
					sessionCreateResults[sess.resultIndex] <- sessionCreateResult{err: err}
					continue
				}

				sessionCreateResults[sess.resultIndex] <- sessionCreateResult{sessionID: sessionID}
			}
		}
	}

	// 2. Session activity updates
	if len(sessionUpdates) > 0 {
		stmt, err := tx.Prepare(`UPDATE Session SET last_activity = ? WHERE id = ?`)
		if err != nil {
			log.Printf("WriteBuffer: failed to prepare session statement: %v", err)
		} else {
			defer stmt.Close()
			for sessionID, timestamp := range sessionUpdates {
				if _, err := stmt.Exec(timestamp, sessionID); err != nil {
					log.Printf("WriteBuffer: failed to update session %d: %v", sessionID, err)
				}
			}
		}
	}

	// 3. Nickname updates
	if len(nicknameUpdates) > 0 {
		stmt, err := tx.Prepare(`UPDATE Session SET nickname = ? WHERE id = ?`)
		if err != nil {
			log.Printf("WriteBuffer: failed to prepare nickname statement: %v", err)
		} else {
			defer stmt.Close()
			for sessionID, nickname := range nicknameUpdates {
				if _, err := stmt.Exec(nickname, sessionID); err != nil {
					log.Printf("WriteBuffer: failed to update nickname for session %d: %v", sessionID, err)
				}
			}
		}
	}

	// 4. Session deletions
	if len(sessionDeletions) > 0 {
		// Build DELETE ... WHERE id IN (?, ?, ...) query
		sessionIDs := make([]int64, 0, len(sessionDeletions))
		for sessionID := range sessionDeletions {
			sessionIDs = append(sessionIDs, sessionID)
		}

		placeholders := make([]byte, 0, len(sessionIDs)*2)
		args := make([]interface{}, len(sessionIDs))
		for i, id := range sessionIDs {
			if i > 0 {
				placeholders = append(placeholders, ',')
			}
			placeholders = append(placeholders, '?')
			args[i] = id
		}

		query := "DELETE FROM Session WHERE id IN (" + string(placeholders) + ")"
		if _, err := tx.Exec(query, args...); err != nil {
			log.Printf("WriteBuffer: failed to delete %d sessions: %v", len(sessionIDs), err)
		}
	}

	// 5. Message inserts (batch INSERT with prepared statement)
	if len(messageInserts) > 0 {
		stmt, err := tx.Prepare(`
			INSERT INTO Message (id, channel_id, subchannel_id, parent_id, author_user_id, author_nickname, content, created_at)
			VALUES (?, ?, ?, ?, ?, ?, ?, ?)
		`)
		if err != nil {
			log.Printf("WriteBuffer: failed to prepare message insert: %v", err)
			for _, resultChan := range messageResults {
				resultChan <- messageResult{err: err}
			}
		} else {
			defer stmt.Close()

			for _, msg := range messageInserts {
				// Generate Snowflake ID
				messageID := wb.db.snowflake.NextID()

				var subchannelIDVal, parentIDVal, authorUserIDVal sql.NullInt64
				if msg.subchannelID != nil {
					subchannelIDVal.Valid = true
					subchannelIDVal.Int64 = *msg.subchannelID
				}
				if msg.parentID != nil {
					parentIDVal.Valid = true
					parentIDVal.Int64 = *msg.parentID
				}
				if msg.authorUserID != nil {
					authorUserIDVal.Valid = true
					authorUserIDVal.Int64 = *msg.authorUserID
				}

				_, err := stmt.Exec(messageID, msg.channelID, subchannelIDVal, parentIDVal, authorUserIDVal, msg.authorNickname, msg.content, msg.timestamp)
				if err != nil {
					messageResults[msg.resultIndex] <- messageResult{err: err}
					continue
				}

				// Construct the full message to return
				dbMessage := &Message{
					ID:             messageID,
					ChannelID:      msg.channelID,
					SubchannelID:   msg.subchannelID,
					ParentID:       msg.parentID,
					AuthorUserID:   msg.authorUserID,
					AuthorNickname: msg.authorNickname,
					Content:        msg.content,
					CreatedAt:      msg.timestamp,
					EditedAt:       nil,
					DeletedAt:      nil,
				}

				// Send success with full message
				messageResults[msg.resultIndex] <- messageResult{messageID: messageID, message: dbMessage}
			}
		}
	}

	// Commit the single transaction
	if err := tx.Commit(); err != nil {
		log.Printf("WriteBuffer: failed to commit transaction: %v", err)
		for _, resultChan := range messageResults {
			resultChan <- messageResult{err: err}
		}
		return
	}

	elapsed := time.Since(start)
	txTime := elapsed - lockWait

	// Only log slow flushes (those that exceed the flush interval)
	if elapsed > wb.flushInterval {
		log.Printf("WriteBuffer: flushed %d items (session_create:%d, session_activity:%d, nickname_update:%d, session_deletion:%d, message_insert:%d) lock_wait=%v tx_time=%v total=%v",
			totalItems, sessionCreateCount, sessionCount, nicknameCount, deletionCount, messageCount, lockWait, txTime, elapsed)
	}
}

// Close shuts down the write buffer and flushes remaining writes
func (wb *WriteBuffer) Close() {
	close(wb.shutdown)
	wb.wg.Wait()
}
