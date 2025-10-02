package server

import (
	"fmt"
	"net"
	"sync"
	"sync/atomic"

	"github.com/aeolun/superchat/pkg/database"
	"github.com/aeolun/superchat/pkg/protocol"
)

// Session represents an active client connection
type Session struct {
	ID            uint64
	DBSessionID   int64       // Database session record ID
	UserID        *int64      // Registered user ID (nil for anonymous)
	Nickname      string      // Current nickname
	Conn          net.Conn    // TCP connection
	JoinedChannel *int64      // Currently joined channel ID
	mu            sync.RWMutex
}

// SessionManager manages all active sessions
type SessionManager struct {
	db       *database.DB
	sessions map[uint64]*Session
	nextID   uint64
	mu       sync.RWMutex
}

// NewSessionManager creates a new session manager
func NewSessionManager(db *database.DB) *SessionManager {
	return &SessionManager{
		db:       db,
		sessions: make(map[uint64]*Session),
		nextID:   1,
	}
}

// CreateSession creates a new session
func (sm *SessionManager) CreateSession(userID *int64, nickname, connType string, conn net.Conn) (*Session, error) {
	sm.mu.Lock()
	defer sm.mu.Unlock()

	// Create database session record
	dbSessionID, err := sm.db.CreateSession(userID, nickname, connType)
	if err != nil {
		return nil, fmt.Errorf("failed to create DB session: %w", err)
	}

	sessionID := atomic.AddUint64(&sm.nextID, 1) - 1

	sess := &Session{
		ID:          sessionID,
		DBSessionID: dbSessionID,
		UserID:      userID,
		Nickname:    nickname,
		Conn:        conn,
	}

	sm.sessions[sessionID] = sess
	return sess, nil
}

// GetSession returns a session by ID
func (sm *SessionManager) GetSession(sessionID uint64) (*Session, bool) {
	sm.mu.RLock()
	defer sm.mu.RUnlock()

	sess, ok := sm.sessions[sessionID]
	return sess, ok
}

// GetAllSessions returns all active sessions
func (sm *SessionManager) GetAllSessions() []*Session {
	sm.mu.RLock()
	defer sm.mu.RUnlock()

	sessions := make([]*Session, 0, len(sm.sessions))
	for _, sess := range sm.sessions {
		sessions = append(sessions, sess)
	}
	return sessions
}

// RemoveSession removes a session and closes the connection
func (sm *SessionManager) RemoveSession(sessionID uint64) {
	sm.mu.Lock()
	sess, ok := sm.sessions[sessionID]
	if !ok {
		sm.mu.Unlock()
		return
	}
	delete(sm.sessions, sessionID)
	sm.mu.Unlock()

	// Close connection
	sess.Conn.Close()

	// Delete DB session record
	if err := sm.db.DeleteSession(sess.DBSessionID); err != nil {
		// Log but don't fail
		fmt.Printf("Failed to delete DB session %d: %v\n", sess.DBSessionID, err)
	}
}

// UpdateNickname updates a session's nickname
func (sm *SessionManager) UpdateNickname(sessionID uint64, nickname string) error {
	sess, ok := sm.GetSession(sessionID)
	if !ok {
		return fmt.Errorf("session not found")
	}

	sess.mu.Lock()
	sess.Nickname = nickname
	sess.mu.Unlock()

	// Update in database
	return sm.db.UpdateSessionNickname(sess.DBSessionID, nickname)
}

// SetJoinedChannel sets the currently joined channel for a session
func (sm *SessionManager) SetJoinedChannel(sessionID uint64, channelID *int64) error {
	sess, ok := sm.GetSession(sessionID)
	if !ok {
		return fmt.Errorf("session not found")
	}

	sess.mu.Lock()
	sess.JoinedChannel = channelID
	sess.mu.Unlock()

	return nil
}

// BroadcastToChannel sends a frame to all sessions in a channel
func (sm *SessionManager) BroadcastToChannel(channelID int64, frame *protocol.Frame) {
	sm.mu.RLock()
	defer sm.mu.RUnlock()

	for _, sess := range sm.sessions {
		sess.mu.RLock()
		joined := sess.JoinedChannel
		sess.mu.RUnlock()

		if joined != nil && *joined == channelID {
			// Send frame (ignore errors for individual sessions)
			protocol.EncodeFrame(sess.Conn, frame)
		}
	}
}

// BroadcastToAll sends a frame to all connected sessions
func (sm *SessionManager) BroadcastToAll(frame *protocol.Frame) {
	sm.mu.RLock()
	defer sm.mu.RUnlock()

	for _, sess := range sm.sessions {
		// Send frame (ignore errors for individual sessions)
		protocol.EncodeFrame(sess.Conn, frame)
	}
}

// CountOnlineUsers returns the number of currently connected users
func (sm *SessionManager) CountOnlineUsers() uint32 {
	sm.mu.RLock()
	defer sm.mu.RUnlock()

	return uint32(len(sm.sessions))
}

// CloseAll closes all sessions
func (sm *SessionManager) CloseAll() {
	sm.mu.Lock()
	defer sm.mu.Unlock()

	for _, sess := range sm.sessions {
		sess.Conn.Close()
		sm.db.DeleteSession(sess.DBSessionID)
	}

	sm.sessions = make(map[uint64]*Session)
}
