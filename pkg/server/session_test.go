package server

import (
	"testing"
	"time"

	"github.com/aeolun/superchat/pkg/database"
)

func TestSessionManagerSubscriptionMethods(t *testing.T) {
	// Create a test database
	tmpDir := t.TempDir()
	dbPath := tmpDir + "/test.db"

	db, err := database.Open(dbPath)
	if err != nil {
		t.Fatalf("Failed to open test database: %v", err)
	}
	defer db.Close()

	memDB, err := database.NewMemDB(db, 100*time.Millisecond)
	if err != nil {
		t.Fatalf("Failed to create MemDB: %v", err)
	}

	sm := NewSessionManager(memDB, 120)

	// Create mock connection
	mockConn := newMockConn()

	sess, err := sm.CreateSession(nil, "", "tcp", mockConn)
	if err != nil {
		t.Fatalf("Failed to create session: %v", err)
	}

	t.Run("SubscribeToThread and GetThreadSubscribers", func(t *testing.T) {
		threadID := uint64(123)
		channelSub := ChannelSubscription{
			ChannelID:    1,
			SubchannelID: nil,
		}

		// Subscribe
		sm.SubscribeToThread(sess, threadID, channelSub)

		// Verify subscription on session
		if _, ok := sess.IsSubscribedToThread(threadID); !ok {
			t.Error("Session should be subscribed to thread")
		}

		// Verify subscription via session manager
		subscribers := sm.GetThreadSubscribers(threadID)
		if len(subscribers) != 1 {
			t.Errorf("Expected 1 subscriber, got %d", len(subscribers))
		}
		if len(subscribers) > 0 && subscribers[0].ID != sess.ID {
			t.Errorf("Expected subscriber to be session %d, got %d", sess.ID, subscribers[0].ID)
		}
	})

	t.Run("UnsubscribeFromThread", func(t *testing.T) {
		threadID := uint64(123)

		// Unsubscribe
		sm.UnsubscribeFromThread(sess, threadID)

		// Verify subscription removed from session
		if _, ok := sess.IsSubscribedToThread(threadID); ok {
			t.Error("Session should not be subscribed to thread")
		}

		// Verify subscription removed from reverse index
		subscribers := sm.GetThreadSubscribers(threadID)
		if len(subscribers) != 0 {
			t.Errorf("Expected 0 subscribers, got %d", len(subscribers))
		}
	})

	t.Run("SubscribeToChannel and GetChannelSubscribers", func(t *testing.T) {
		channelSub := ChannelSubscription{
			ChannelID:    2,
			SubchannelID: nil,
		}

		// Subscribe
		sm.SubscribeToChannel(sess, channelSub)

		// Verify subscription on session
		if !sess.IsSubscribedToChannel(channelSub) {
			t.Error("Session should be subscribed to channel")
		}

		// Verify subscription via session manager
		subscribers := sm.GetChannelSubscribers(channelSub)
		if len(subscribers) != 1 {
			t.Errorf("Expected 1 subscriber, got %d", len(subscribers))
		}
		if len(subscribers) > 0 && subscribers[0].ID != sess.ID {
			t.Errorf("Expected subscriber to be session %d, got %d", sess.ID, subscribers[0].ID)
		}
	})

	t.Run("UnsubscribeFromChannel", func(t *testing.T) {
		channelSub := ChannelSubscription{
			ChannelID:    2,
			SubchannelID: nil,
		}

		// Unsubscribe
		sm.UnsubscribeFromChannel(sess, channelSub)

		// Verify subscription removed from session
		if sess.IsSubscribedToChannel(channelSub) {
			t.Error("Session should not be subscribed to channel")
		}

		// Verify subscription removed from reverse index
		subscribers := sm.GetChannelSubscribers(channelSub)
		if len(subscribers) != 0 {
			t.Errorf("Expected 0 subscribers, got %d", len(subscribers))
		}
	})

	t.Run("ThreadSubscriptionCount", func(t *testing.T) {
		// Clear any existing subscriptions
		sess.subMu.Lock()
		sess.subscribedThreads = make(map[uint64]ChannelSubscription)
		sess.subMu.Unlock()

		channelSub := ChannelSubscription{
			ChannelID:    1,
			SubchannelID: nil,
		}

		// Should start at 0
		if sess.ThreadSubscriptionCount() != 0 {
			t.Errorf("Expected 0 thread subscriptions, got %d", sess.ThreadSubscriptionCount())
		}

		// Add subscriptions
		sm.SubscribeToThread(sess, 1, channelSub)
		sm.SubscribeToThread(sess, 2, channelSub)
		sm.SubscribeToThread(sess, 3, channelSub)

		if sess.ThreadSubscriptionCount() != 3 {
			t.Errorf("Expected 3 thread subscriptions, got %d", sess.ThreadSubscriptionCount())
		}
	})

	t.Run("ChannelSubscriptionCount", func(t *testing.T) {
		// Clear any existing subscriptions
		sess.subMu.Lock()
		sess.subscribedChannels = make(map[ChannelSubscription]bool)
		sess.subMu.Unlock()

		// Should start at 0
		if sess.ChannelSubscriptionCount() != 0 {
			t.Errorf("Expected 0 channel subscriptions, got %d", sess.ChannelSubscriptionCount())
		}

		// Add subscriptions
		sm.SubscribeToChannel(sess, ChannelSubscription{ChannelID: 1})
		sm.SubscribeToChannel(sess, ChannelSubscription{ChannelID: 2})
		sm.SubscribeToChannel(sess, ChannelSubscription{ChannelID: 3})

		if sess.ChannelSubscriptionCount() != 3 {
			t.Errorf("Expected 3 channel subscriptions, got %d", sess.ChannelSubscriptionCount())
		}
	})
}

func TestSessionManagerRemoveSession(t *testing.T) {
	tmpDir := t.TempDir()
	dbPath := tmpDir + "/test.db"

	db, err := database.Open(dbPath)
	if err != nil {
		t.Fatalf("Failed to open test database: %v", err)
	}
	defer db.Close()

	memDB, err := database.NewMemDB(db, 100*time.Millisecond)
	if err != nil {
		t.Fatalf("Failed to create MemDB: %v", err)
	}

	sm := NewSessionManager(memDB, 120)
	mockConn := newMockConn()

	sess, err := sm.CreateSession(nil, "", "tcp", mockConn)
	if err != nil {
		t.Fatalf("Failed to create session: %v", err)
	}
	sessionID := sess.ID

	// Add some subscriptions
	threadID := uint64(100)
	channelSub := ChannelSubscription{ChannelID: 1}

	sm.SubscribeToThread(sess, threadID, channelSub)
	sm.SubscribeToChannel(sess, channelSub)

	// Verify subscriptions exist
	if len(sm.GetThreadSubscribers(threadID)) != 1 {
		t.Error("Thread should have 1 subscriber")
	}
	if len(sm.GetChannelSubscribers(channelSub)) != 1 {
		t.Error("Channel should have 1 subscriber")
	}

	// Remove session
	sm.RemoveSession(sessionID)

	// Verify session was removed
	if _, ok := sm.GetSession(sessionID); ok {
		t.Error("Session should have been removed")
	}

	// Verify subscriptions were cleaned up
	if len(sm.GetThreadSubscribers(threadID)) != 0 {
		t.Error("Thread should have no subscribers after session removal")
	}
	if len(sm.GetChannelSubscribers(channelSub)) != 0 {
		t.Error("Channel should have no subscribers after session removal")
	}
}

func TestSessionManagerGetAllSessions(t *testing.T) {
	tmpDir := t.TempDir()
	dbPath := tmpDir + "/test.db"

	db, err := database.Open(dbPath)
	if err != nil {
		t.Fatalf("Failed to open test database: %v", err)
	}
	defer db.Close()

	memDB, err := database.NewMemDB(db, 100*time.Millisecond)
	if err != nil {
		t.Fatalf("Failed to create MemDB: %v", err)
	}

	sm := NewSessionManager(memDB, 120)

	// Should start empty
	if len(sm.GetAllSessions()) != 0 {
		t.Error("Expected no sessions initially")
	}

	// Create some sessions
	for i := 0; i < 5; i++ {
		mockConn := newMockConn()
		_, err := sm.CreateSession(nil, "", "tcp", mockConn)
		if err != nil {
			t.Fatalf("Failed to create session: %v", err)
		}
	}

	// Should have 5 sessions
	sessions := sm.GetAllSessions()
	if len(sessions) != 5 {
		t.Errorf("Expected 5 sessions, got %d", len(sessions))
	}
}

func TestSessionManagerCountOnlineUsers(t *testing.T) {
	tmpDir := t.TempDir()
	dbPath := tmpDir + "/test.db"

	db, err := database.Open(dbPath)
	if err != nil {
		t.Fatalf("Failed to open test database: %v", err)
	}
	defer db.Close()

	memDB, err := database.NewMemDB(db, 100*time.Millisecond)
	if err != nil {
		t.Fatalf("Failed to create MemDB: %v", err)
	}

	sm := NewSessionManager(memDB, 120)

	// Should start at 0
	if sm.CountOnlineUsers() != 0 {
		t.Error("Expected 0 online users initially")
	}

	// Create sessions
	var sessionIDs []uint64
	for i := 0; i < 3; i++ {
		mockConn := newMockConn()
		sess, err := sm.CreateSession(nil, "", "tcp", mockConn)
		if err != nil {
			t.Fatalf("Failed to create session: %v", err)
		}
		sessionIDs = append(sessionIDs, sess.ID)
	}

	// Should have 3 online users
	if sm.CountOnlineUsers() != 3 {
		t.Errorf("Expected 3 online users, got %d", sm.CountOnlineUsers())
	}

	// Remove one session
	sm.RemoveSession(sessionIDs[0])

	// Should have 2 online users
	if sm.CountOnlineUsers() != 2 {
		t.Errorf("Expected 2 online users, got %d", sm.CountOnlineUsers())
	}
}

func TestSessionManagerCloseAll(t *testing.T) {
	tmpDir := t.TempDir()
	dbPath := tmpDir + "/test.db"

	db, err := database.Open(dbPath)
	if err != nil {
		t.Fatalf("Failed to open test database: %v", err)
	}
	defer db.Close()

	memDB, err := database.NewMemDB(db, 100*time.Millisecond)
	if err != nil {
		t.Fatalf("Failed to create MemDB: %v", err)
	}

	sm := NewSessionManager(memDB, 120)

	// Create sessions
	for i := 0; i < 5; i++ {
		mockConn := newMockConn()
		_, err := sm.CreateSession(nil, "", "tcp", mockConn)
		if err != nil {
			t.Fatalf("Failed to create session: %v", err)
		}
	}

	// Should have 5 sessions
	if len(sm.GetAllSessions()) != 5 {
		t.Errorf("Expected 5 sessions, got %d", len(sm.GetAllSessions()))
	}

	// Close all
	sm.CloseAll()

	// Should have no sessions
	if len(sm.GetAllSessions()) != 0 {
		t.Errorf("Expected 0 sessions after CloseAll, got %d", len(sm.GetAllSessions()))
	}
}
