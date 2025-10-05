package server

import (
	"fmt"
	"net"
	"sync"
	"sync/atomic"

	"github.com/aeolun/superchat/pkg/database"
	"github.com/aeolun/superchat/pkg/protocol"
)

// ChannelSubscription represents a channel/subchannel subscription
type ChannelSubscription struct {
	ChannelID    uint64
	SubchannelID *uint64
}

// Session represents an active client connection
type Session struct {
	ID                     uint64
	DBSessionID            int64        // Database session record ID
	UserID                 *int64       // Registered user ID (nil for anonymous)
	Nickname               string       // Current nickname
	Conn                   *SafeConn    // TCP connection with automatic write synchronization
	JoinedChannel          *int64       // Currently joined channel ID
	mu                     sync.RWMutex // Protects Nickname and JoinedChannel
	lastActivityUpdateTime int64        // Last time we wrote activity to DB (milliseconds, atomic)

	// Subscriptions for selective message broadcasting
	subscribedThreads  map[uint64]ChannelSubscription // thread_id -> channel subscription
	subscribedChannels map[ChannelSubscription]bool   // channel/subchannel -> true
	subMu              sync.RWMutex                   // Protects subscription maps
}

// SessionManager manages all active sessions
type SessionManager struct {
	db                       *database.DB
	writeBuffer              *database.WriteBuffer
	sessions                 map[uint64]*Session
	nextID                   uint64
	mu                       sync.RWMutex
	metrics                  *Metrics
	activityUpdateIntervalMs int64 // Half of session timeout in milliseconds
}

// NewSessionManager creates a new session manager
func NewSessionManager(db *database.DB, writeBuffer *database.WriteBuffer, sessionTimeoutSeconds int) *SessionManager {
	// Activity update interval is half the session timeout
	activityIntervalMs := int64(sessionTimeoutSeconds) * 500 // half in milliseconds

	return &SessionManager{
		db:                       db,
		writeBuffer:              writeBuffer,
		activityUpdateIntervalMs: activityIntervalMs,
		sessions:    make(map[uint64]*Session),
		nextID:      1,
	}
}

// SetMetrics attaches metrics to the session manager
func (sm *SessionManager) SetMetrics(metrics *Metrics) {
	sm.metrics = metrics
}

// CreateSession creates a new session
func (sm *SessionManager) CreateSession(userID *int64, nickname, connType string, conn net.Conn) (*Session, error) {
	// Create database session record (via WriteBuffer for batching)
	// Do this OUTSIDE the lock so multiple connections can batch together
	dbSessionID, err := sm.db.WriteBuffer.CreateSession(userID, nickname, connType, conn)
	if err != nil {
		return nil, fmt.Errorf("failed to create DB session: %w", err)
	}

	// Now acquire lock to add to session map
	sm.mu.Lock()
	defer sm.mu.Unlock()

	sessionID := atomic.AddUint64(&sm.nextID, 1) - 1

	sess := &Session{
		ID:                     sessionID,
		DBSessionID:            dbSessionID,
		UserID:                 userID,
		Nickname:               nickname,
		Conn:                   NewSafeConn(conn),
		lastActivityUpdateTime: 0, // Will be set on first activity update
		subscribedThreads:      make(map[uint64]ChannelSubscription),
		subscribedChannels:     make(map[ChannelSubscription]bool),
	}

	sm.sessions[sessionID] = sess

	// Update metrics
	if sm.metrics != nil {
		sm.metrics.RecordActiveSessions(len(sm.sessions))
		sm.metrics.RecordSessionCreated()
	}

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
	sessionCount := len(sm.sessions)
	sm.mu.Unlock()

	// Update metrics
	if sm.metrics != nil {
		sm.metrics.RecordActiveSessions(sessionCount)
		sm.metrics.RecordSessionDisconnected()
	}

	// Clean up subscription state
	sess.subMu.Lock()
	sess.subscribedThreads = nil
	sess.subscribedChannels = nil
	sess.subMu.Unlock()

	// Close connection
	sess.Conn.Close()

	// Queue DB session deletion (buffered)
	sm.db.WriteBuffer.DeleteSession(sess.DBSessionID)
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

	// Update in database (no error to return - queued in buffer)
	sm.writeBuffer.UpdateSessionNickname(sess.DBSessionID, nickname)
	return nil
}

// UpdateSessionActivity updates session activity only if the configured interval has passed
func (sm *SessionManager) UpdateSessionActivity(sess *Session, now int64) {
	lastUpdate := atomic.LoadInt64(&sess.lastActivityUpdateTime)

	// Only update if the configured interval has passed (half of session timeout)
	if now-lastUpdate >= sm.activityUpdateIntervalMs {
		// Try to atomically update the timestamp
		if atomic.CompareAndSwapInt64(&sess.lastActivityUpdateTime, lastUpdate, now) {
			sm.writeBuffer.UpdateSessionActivity(sess.DBSessionID, now)
		}
	}
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
	deadSessions := make([]uint64, 0)

	sm.mu.RLock()
	for _, sess := range sm.sessions {
		sess.mu.RLock()
		joined := sess.JoinedChannel
		sess.mu.RUnlock()

		if joined != nil && *joined == channelID {
			// Send frame (log errors but don't fail the broadcast)
			if err := sess.Conn.EncodeFrame(frame); err != nil {
				debugLog.Printf("Session %d: Broadcast encode failed (Type=0x%02X): %v", sess.ID, frame.Type, err)
				deadSessions = append(deadSessions, sess.ID)
			}
		}
	}
	sm.mu.RUnlock()

	// Remove dead sessions from broadcast pool
	for _, sessID := range deadSessions {
		sm.RemoveSession(sessID)
	}
}

// BroadcastToAll sends a frame to all connected sessions
func (sm *SessionManager) BroadcastToAll(frame *protocol.Frame) {
	deadSessions := make([]uint64, 0)

	sm.mu.RLock()
	for _, sess := range sm.sessions {
		// Send frame (collect dead sessions)
		if err := sess.Conn.EncodeFrame(frame); err != nil {
			debugLog.Printf("Session %d: Broadcast encode failed (Type=0x%02X): %v", sess.ID, frame.Type, err)
			deadSessions = append(deadSessions, sess.ID)
		}
	}
	sm.mu.RUnlock()

	// Remove dead sessions from broadcast pool
	for _, sessID := range deadSessions {
		sm.RemoveSession(sessID)
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
		sm.db.WriteBuffer.DeleteSession(sess.DBSessionID)
	}

	sm.sessions = make(map[uint64]*Session)
}

// SubscribeToThread subscribes the session to a thread with automatic locking
func (s *Session) SubscribeToThread(threadID uint64, channelSub ChannelSubscription) {
	s.subMu.Lock()
	defer s.subMu.Unlock()

	s.subscribedThreads[threadID] = channelSub
}

// UnsubscribeFromThread unsubscribes the session from a thread with automatic locking
func (s *Session) UnsubscribeFromThread(threadID uint64) {
	s.subMu.Lock()
	defer s.subMu.Unlock()

	delete(s.subscribedThreads, threadID)
}

// SubscribeToChannel subscribes the session to a channel/subchannel with automatic locking
func (s *Session) SubscribeToChannel(channelSub ChannelSubscription) {
	s.subMu.Lock()
	defer s.subMu.Unlock()

	s.subscribedChannels[channelSub] = true
}

// UnsubscribeFromChannel unsubscribes the session from a channel/subchannel with automatic locking
func (s *Session) UnsubscribeFromChannel(channelSub ChannelSubscription) {
	s.subMu.Lock()
	defer s.subMu.Unlock()

	delete(s.subscribedChannels, channelSub)
}

// IsSubscribedToThread checks if the session is subscribed to a thread (thread-safe)
func (s *Session) IsSubscribedToThread(threadID uint64) (ChannelSubscription, bool) {
	s.subMu.RLock()
	defer s.subMu.RUnlock()

	channelSub, ok := s.subscribedThreads[threadID]
	return channelSub, ok
}

// IsSubscribedToChannel checks if the session is subscribed to a channel/subchannel (thread-safe)
func (s *Session) IsSubscribedToChannel(channelSub ChannelSubscription) bool {
	s.subMu.RLock()
	defer s.subMu.RUnlock()

	return s.subscribedChannels[channelSub]
}

// ThreadSubscriptionCount returns the number of thread subscriptions (thread-safe)
func (s *Session) ThreadSubscriptionCount() int {
	s.subMu.RLock()
	defer s.subMu.RUnlock()

	return len(s.subscribedThreads)
}

// ChannelSubscriptionCount returns the number of channel subscriptions (thread-safe)
func (s *Session) ChannelSubscriptionCount() int {
	s.subMu.RLock()
	defer s.subMu.RUnlock()

	return len(s.subscribedChannels)
}
