package database

import (
	"database/sql"
	"errors"
	"fmt"
	"io"
	"log"
	"net"
	"sync"
	"syscall"
	"time"
)

// WriteBuffer batches database writes to reduce lock contention
type WriteBuffer struct {
	db       *DB
	interval time.Duration // Fixed flush interval

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

	// Shutdown control
	shutdown chan struct{}
	wg       sync.WaitGroup
}

type pendingSessionCreate struct {
	userID      *int64
	nickname    string
	connType    string
	timestamp   int64
	resultIndex int
	conn        net.Conn // Check health before creating
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
	authorNickname string // Only populated for anonymous users (when authorUserID IS NULL)
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
		interval:             flushInterval,
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
func (wb *WriteBuffer) CreateSession(userID *int64, nickname, connType string, conn net.Conn) (int64, error) {
	resultChan := make(chan sessionCreateResult, 1)

	wb.sessionCreateMu.Lock()
	resultIndex := len(wb.sessionCreates)
	wb.sessionCreates = append(wb.sessionCreates, &pendingSessionCreate{
		userID:      userID,
		nickname:    nickname,
		connType:    connType,
		timestamp:   nowMillis(),
		resultIndex: resultIndex,
		conn:        conn,
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

// flushLoop periodically flushes buffered writes at fixed interval
func (wb *WriteBuffer) flushLoop() {
	defer wb.wg.Done()

	ticker := time.NewTicker(wb.interval)
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

	// Track timing for each operation type
	var sessionCreateTime, sessionUpdateTime, nicknameUpdateTime, sessionDeleteTime, messageInsertTime time.Duration

	// 1. Session creation (batch INSERT with Snowflake IDs)
	if len(sessionCreates) > 0 {
		opStart := time.Now()

		// Filter out dead connections and generate IDs upfront
		type sessionWithID struct {
			sess      *pendingSessionCreate
			sessionID int64
		}
		validSessions := make([]sessionWithID, 0, len(sessionCreates))

		for _, sess := range sessionCreates {
			// Check if connection is still alive before creating session
			if !isConnAlive(sess.conn) {
				sessionCreateResults[sess.resultIndex] <- sessionCreateResult{err: errors.New("connection closed before session creation")}
				continue
			}

			validSessions = append(validSessions, sessionWithID{
				sess:      sess,
				sessionID: wb.db.snowflake.NextID(),
			})
		}

		if len(validSessions) > 0 {
			// SQLite 3.32.0+ has a limit of 32766 parameters per query
			// With 6 columns, we can insert max 5461 rows per batch (32766/6 = 5461)
			const maxRowsPerBatch = 5461

			// Process in chunks
			for chunkStart := 0; chunkStart < len(validSessions); chunkStart += maxRowsPerBatch {
				chunkEnd := chunkStart + maxRowsPerBatch
				if chunkEnd > len(validSessions) {
					chunkEnd = len(validSessions)
				}
				chunk := validSessions[chunkStart:chunkEnd]

				// Build batch INSERT for this chunk
				placeholders := make([]byte, 0, len(chunk)*20)
				args := make([]interface{}, 0, len(chunk)*6)

				for i, s := range chunk {
					if i > 0 {
						placeholders = append(placeholders, ',')
					}
					placeholders = append(placeholders, '(', '?', ',', '?', ',', '?', ',', '?', ',', '?', ',', '?', ')')

					var userIDVal sql.NullInt64
					if s.sess.userID != nil {
						userIDVal.Valid = true
						userIDVal.Int64 = *s.sess.userID
					}

					args = append(args, s.sessionID, userIDVal, s.sess.nickname, s.sess.connType, s.sess.timestamp, s.sess.timestamp)
				}

				query := "INSERT INTO Session (id, user_id, nickname, connection_type, connected_at, last_activity) VALUES " + string(placeholders)
				_, err := tx.Exec(query, args...)
				if err != nil {
					log.Printf("WriteBuffer: failed to batch insert sessions (chunk %d-%d): %v", chunkStart, chunkEnd, err)
					for _, s := range chunk {
						sessionCreateResults[s.sess.resultIndex] <- sessionCreateResult{err: err}
					}
				} else {
					// Send success with generated IDs
					for _, s := range chunk {
						sessionCreateResults[s.sess.resultIndex] <- sessionCreateResult{sessionID: s.sessionID}
					}
				}
			}
		}

		sessionCreateTime = time.Since(opStart)
	}

	// 2. Session activity updates
	if len(sessionUpdates) > 0 {
		opStart := time.Now()
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
		sessionUpdateTime = time.Since(opStart)
	}

	// 3. Nickname updates
	if len(nicknameUpdates) > 0 {
		opStart := time.Now()
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
		nicknameUpdateTime = time.Since(opStart)
	}

	// 4. Session deletions
	if len(sessionDeletions) > 0 {
		opStart := time.Now()
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
		sessionDeleteTime = time.Since(opStart)
	}

	// 5. Message inserts (batch INSERT with prepared statement)
	if len(messageInserts) > 0 {
		opStart := time.Now()

		// Batch-fetch all parent thread_root_ids in one query
		uniqueParentIDs := make(map[int64]bool)
		for _, msg := range messageInserts {
			if msg.parentID != nil {
				uniqueParentIDs[*msg.parentID] = true
			}
		}

		parentThreadRoots := make(map[int64]sql.NullInt64)
		batchFetchFailed := false
		if len(uniqueParentIDs) > 0 {
			// Build IN clause query
			parentIDList := make([]int64, 0, len(uniqueParentIDs))
			for parentID := range uniqueParentIDs {
				parentIDList = append(parentIDList, parentID)
			}

			placeholders := make([]byte, 0, len(parentIDList)*2)
			args := make([]interface{}, len(parentIDList))
			for i, id := range parentIDList {
				if i > 0 {
					placeholders = append(placeholders, ',')
				}
				placeholders = append(placeholders, '?')
				args[i] = id
			}

			query := "SELECT id, thread_root_id FROM Message WHERE id IN (" + string(placeholders) + ")"
			rows, err := tx.Query(query, args...)
			if err != nil {
				log.Printf("WriteBuffer: failed to batch fetch parent thread_root_ids: %v", err)
				for _, resultChan := range messageResults {
					resultChan <- messageResult{err: err}
				}
				batchFetchFailed = true
			} else {
				defer rows.Close()

				for rows.Next() {
					var id int64
					var threadRootID sql.NullInt64
					if err := rows.Scan(&id, &threadRootID); err != nil {
						log.Printf("WriteBuffer: failed to scan parent thread_root_id: %v", err)
						continue
					}
					parentThreadRoots[id] = threadRootID
				}
				rows.Close()
			}
		}

		if !batchFetchFailed {
			// Prepare message data with IDs generated upfront
			type messageWithID struct {
				msg              *pendingMessage
				messageID        int64
				subchannelIDVal  sql.NullInt64
				parentIDVal      sql.NullInt64
				threadRootIDVal  sql.NullInt64
				authorUserIDVal  sql.NullInt64
			}
			validMessages := make([]messageWithID, 0, len(messageInserts))

			for _, msg := range messageInserts {
				messageID := wb.db.snowflake.NextID()

				var subchannelIDVal, parentIDVal, threadRootIDVal, authorUserIDVal sql.NullInt64
				if msg.subchannelID != nil {
					subchannelIDVal.Valid = true
					subchannelIDVal.Int64 = *msg.subchannelID
				}
				if msg.parentID != nil {
					parentIDVal.Valid = true
					parentIDVal.Int64 = *msg.parentID

					// Look up parent's thread_root_id from batch-fetched map
					parentThreadRootID, found := parentThreadRoots[*msg.parentID]
					if !found {
						log.Printf("WriteBuffer: parent message not found in batch (parent=%d)", *msg.parentID)
						messageResults[msg.resultIndex] <- messageResult{err: fmt.Errorf("parent message not found")}
						continue
					}

					threadRootIDVal = parentThreadRootID
				} else {
					// Top-level message: thread_root_id = message_id (self-referential)
					threadRootIDVal.Valid = true
					threadRootIDVal.Int64 = messageID
				}
				if msg.authorUserID != nil {
					authorUserIDVal.Valid = true
					authorUserIDVal.Int64 = *msg.authorUserID
				}

				validMessages = append(validMessages, messageWithID{
					msg:             msg,
					messageID:       messageID,
					subchannelIDVal: subchannelIDVal,
					parentIDVal:     parentIDVal,
					threadRootIDVal: threadRootIDVal,
					authorUserIDVal: authorUserIDVal,
				})
			}

			if len(validMessages) > 0 {
				// SQLite 3.32.0+ has a limit of 32766 parameters per query
				// With 9 columns, we can insert max 3640 rows per batch (32766/9 = 3640)
				const maxRowsPerBatch = 3640

				// Process in chunks
				for chunkStart := 0; chunkStart < len(validMessages); chunkStart += maxRowsPerBatch {
					chunkEnd := chunkStart + maxRowsPerBatch
					if chunkEnd > len(validMessages) {
						chunkEnd = len(validMessages)
					}
					chunk := validMessages[chunkStart:chunkEnd]

					// Build batch INSERT for this chunk
					placeholders := make([]byte, 0, len(chunk)*30)
					args := make([]interface{}, 0, len(chunk)*9)

					for i, m := range chunk {
						if i > 0 {
							placeholders = append(placeholders, ',')
						}
						placeholders = append(placeholders, '(', '?', ',', '?', ',', '?', ',', '?', ',', '?', ',', '?', ',', '?', ',', '?', ',', '?', ')')

						args = append(args, m.messageID, m.msg.channelID, m.subchannelIDVal, m.parentIDVal, m.threadRootIDVal, m.authorUserIDVal, m.msg.authorNickname, m.msg.content, m.msg.timestamp)
					}

					query := "INSERT INTO Message (id, channel_id, subchannel_id, parent_id, thread_root_id, author_user_id, author_nickname, content, created_at) VALUES " + string(placeholders)
					_, err := tx.Exec(query, args...)
					if err != nil {
						log.Printf("WriteBuffer: failed to batch insert messages (chunk %d-%d): %v", chunkStart, chunkEnd, err)
						for _, m := range chunk {
							messageResults[m.msg.resultIndex] <- messageResult{err: err}
						}
					} else {
						// Send success with full message for each
						for _, m := range chunk {
							var threadRootID *int64
							if m.threadRootIDVal.Valid {
								threadRootID = &m.threadRootIDVal.Int64
							}

							dbMessage := &Message{
								ID:             m.messageID,
								ChannelID:      m.msg.channelID,
								SubchannelID:   m.msg.subchannelID,
								ParentID:       m.msg.parentID,
								ThreadRootID:   threadRootID,
								AuthorUserID:   m.msg.authorUserID,
								AuthorNickname: m.msg.authorNickname,
								Content:        m.msg.content,
								CreatedAt:      m.msg.timestamp,
								EditedAt:       nil,
								DeletedAt:      nil,
							}

							messageResults[m.msg.resultIndex] <- messageResult{messageID: m.messageID, message: dbMessage}
						}
					}
				}
			}
		}

		messageInsertTime = time.Since(opStart)
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

	// Log slow batches (taking longer than interval) to help diagnose issues
	if elapsed > wb.interval {
		log.Printf("WriteBuffer: flushed %d items (session_create:%d/%v, session_activity:%d/%v, nickname_update:%d/%v, session_deletion:%d/%v, message_insert:%d/%v) lock_wait=%v tx_time=%v total=%v interval:%v",
			totalItems,
			sessionCreateCount, sessionCreateTime,
			sessionCount, sessionUpdateTime,
			nicknameCount, nicknameUpdateTime,
			deletionCount, sessionDeleteTime,
			messageCount, messageInsertTime,
			lockWait, txTime, elapsed, wb.interval)
	}
}

// Close shuts down the write buffer and flushes remaining writes
func (wb *WriteBuffer) Close() {
	close(wb.shutdown)
	wb.wg.Wait()
}

// isConnAlive checks if a connection is still open by attempting a non-blocking read
func isConnAlive(conn net.Conn) bool {
	// Set a very short read deadline to detect closed connections
	conn.SetReadDeadline(time.Now().Add(1 * time.Millisecond))
	defer conn.SetReadDeadline(time.Time{}) // Reset to no deadline

	var probe [1]byte
	_, err := conn.Read(probe[:])

	if err == nil {
		// Client sent data before SERVER_CONFIG - protocol violation but connection is alive
		return true
	}

	// Check error type
	if netErr, ok := err.(net.Error); ok && netErr.Timeout() {
		// Timeout means connection is alive (client waiting for us)
		return true
	}

	// Check for common disconnection errors
	if errors.Is(err, io.EOF) || errors.Is(err, syscall.EPIPE) || errors.Is(err, syscall.ECONNRESET) {
		return false
	}

	// Any other error - assume dead to be safe
	return false
}
