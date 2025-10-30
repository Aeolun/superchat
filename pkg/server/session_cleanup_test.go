// ABOUTME: Tests for session cleanup and subscription removal
// ABOUTME: Verifies that disconnecting sessions properly clean up channel/thread subscriptions
package server

import (
	"testing"
	"time"

	"github.com/aeolun/superchat/pkg/database"
)

func TestRemoveSession_CleansUpChannelSubscriptions(t *testing.T) {
	// Create test database
	sqlDB, err := database.Open(":memory:")
	if err != nil {
		t.Fatalf("Failed to create test database: %v", err)
	}
	defer sqlDB.Close()

	memDB, err := database.NewMemDB(sqlDB, 100*time.Millisecond)
	if err != nil {
		t.Fatalf("Failed to create MemDB: %v", err)
	}
	defer memDB.Close()

	// Create session manager
	sm := NewSessionManager(memDB, 60)

	// Create two sessions
	conn1 := newMockConn()
	sess1, err := sm.CreateSession(nil, "user1", "tcp", conn1)
	if err != nil {
		t.Fatalf("Failed to create session 1: %v", err)
	}

	conn2 := newMockConn()
	sess2, err := sm.CreateSession(nil, "user2", "tcp", conn2)
	if err != nil {
		t.Fatalf("Failed to create session 2: %v", err)
	}

	// Subscribe both sessions to channel 1
	channelSub := ChannelSubscription{ChannelID: 1}
	sm.SubscribeToChannel(sess1, channelSub)
	sm.SubscribeToChannel(sess2, channelSub)

	// Verify both sessions are subscribed
	subscribers := sm.GetChannelSubscribers(channelSub)
	if len(subscribers) != 2 {
		t.Fatalf("Expected 2 subscribers, got %d", len(subscribers))
	}

	// Remove session 1
	sm.RemoveSession(sess1.ID)

	// Verify only session 2 remains subscribed
	subscribers = sm.GetChannelSubscribers(channelSub)
	if len(subscribers) != 1 {
		t.Fatalf("Expected 1 subscriber after removing sess1, got %d", len(subscribers))
	}
	if subscribers[0].ID != sess2.ID {
		t.Fatalf("Expected sess2 to remain, got session %d", subscribers[0].ID)
	}

	// Remove session 2
	sm.RemoveSession(sess2.ID)

	// Verify no subscribers remain
	subscribers = sm.GetChannelSubscribers(channelSub)
	if len(subscribers) != 0 {
		t.Fatalf("Expected 0 subscribers after removing all sessions, got %d", len(subscribers))
	}

	// Verify the reverse index was cleaned up (map should be empty)
	sm.subIndexMu.RLock()
	_, exists := sm.channelSubscribers[channelSub]
	sm.subIndexMu.RUnlock()

	if exists {
		t.Fatal("Expected channel subscription entry to be removed from reverse index")
	}
}

func TestRemoveSession_CleansUpThreadSubscriptions(t *testing.T) {
	// Create test database
	sqlDB, err := database.Open(":memory:")
	if err != nil {
		t.Fatalf("Failed to create test database: %v", err)
	}
	defer sqlDB.Close()

	memDB, err := database.NewMemDB(sqlDB, 100*time.Millisecond)
	if err != nil {
		t.Fatalf("Failed to create MemDB: %v", err)
	}
	defer memDB.Close()

	// Create session manager
	sm := NewSessionManager(memDB, 60)

	// Create session
	conn := newMockConn()
	sess, err := sm.CreateSession(nil, "user1", "tcp", conn)
	if err != nil {
		t.Fatalf("Failed to create session: %v", err)
	}

	// Subscribe to thread
	threadID := uint64(42)
	channelSub := ChannelSubscription{ChannelID: 1}
	sm.SubscribeToThread(sess, threadID, channelSub)

	// Verify subscription exists
	subscribers := sm.GetThreadSubscribers(threadID)
	if len(subscribers) != 1 {
		t.Fatalf("Expected 1 subscriber, got %d", len(subscribers))
	}

	// Remove session
	sm.RemoveSession(sess.ID)

	// Verify subscription was removed
	subscribers = sm.GetThreadSubscribers(threadID)
	if len(subscribers) != 0 {
		t.Fatalf("Expected 0 subscribers after removing session, got %d", len(subscribers))
	}

	// Verify the reverse index was cleaned up
	sm.subIndexMu.RLock()
	_, exists := sm.threadSubscribers[threadID]
	sm.subIndexMu.RUnlock()

	if exists {
		t.Fatal("Expected thread subscription entry to be removed from reverse index")
	}
}

func TestRemoveSession_IdempotentCalls(t *testing.T) {
	// Create test database
	sqlDB, err := database.Open(":memory:")
	if err != nil {
		t.Fatalf("Failed to create test database: %v", err)
	}
	defer sqlDB.Close()

	memDB, err := database.NewMemDB(sqlDB, 100*time.Millisecond)
	if err != nil {
		t.Fatalf("Failed to create MemDB: %v", err)
	}
	defer memDB.Close()

	// Create session manager
	sm := NewSessionManager(memDB, 60)

	// Create session
	conn := newMockConn()
	sess, err := sm.CreateSession(nil, "user1", "tcp", conn)
	if err != nil {
		t.Fatalf("Failed to create session: %v", err)
	}

	sessionID := sess.ID

	// Remove session
	sm.RemoveSession(sessionID)

	// Verify session was removed
	_, exists := sm.GetSession(sessionID)
	if exists {
		t.Fatal("Expected session to be removed")
	}

	// Remove again - should not panic
	sm.RemoveSession(sessionID)

	// Remove third time - should still not panic
	sm.RemoveSession(sessionID)
}

func TestRemoveSession_MultipleChannelSubscriptions(t *testing.T) {
	// Create test database
	sqlDB, err := database.Open(":memory:")
	if err != nil {
		t.Fatalf("Failed to create test database: %v", err)
	}
	defer sqlDB.Close()

	memDB, err := database.NewMemDB(sqlDB, 100*time.Millisecond)
	if err != nil {
		t.Fatalf("Failed to create MemDB: %v", err)
	}
	defer memDB.Close()

	// Create session manager
	sm := NewSessionManager(memDB, 60)

	// Create session
	conn := newMockConn()
	sess, err := sm.CreateSession(nil, "user1", "tcp", conn)
	if err != nil {
		t.Fatalf("Failed to create session: %v", err)
	}

	// Subscribe to multiple channels
	channel1 := ChannelSubscription{ChannelID: 1}
	channel2 := ChannelSubscription{ChannelID: 2}
	channel3 := ChannelSubscription{ChannelID: 3}

	sm.SubscribeToChannel(sess, channel1)
	sm.SubscribeToChannel(sess, channel2)
	sm.SubscribeToChannel(sess, channel3)

	// Verify all subscriptions exist
	if len(sm.GetChannelSubscribers(channel1)) != 1 {
		t.Fatal("Expected subscription to channel 1")
	}
	if len(sm.GetChannelSubscribers(channel2)) != 1 {
		t.Fatal("Expected subscription to channel 2")
	}
	if len(sm.GetChannelSubscribers(channel3)) != 1 {
		t.Fatal("Expected subscription to channel 3")
	}

	// Remove session
	sm.RemoveSession(sess.ID)

	// Verify all subscriptions were removed
	if len(sm.GetChannelSubscribers(channel1)) != 0 {
		t.Fatal("Expected no subscribers to channel 1 after removal")
	}
	if len(sm.GetChannelSubscribers(channel2)) != 0 {
		t.Fatal("Expected no subscribers to channel 2 after removal")
	}
	if len(sm.GetChannelSubscribers(channel3)) != 0 {
		t.Fatal("Expected no subscribers to channel 3 after removal")
	}
}
