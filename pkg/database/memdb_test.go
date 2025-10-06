package database

import (
	"testing"
	"time"
)

// TestSnapshotAndRecovery tests that messages are persisted across server restarts
func TestSnapshotAndRecovery(t *testing.T) {
	// Create temporary database
	dbPath := t.TempDir() + "/test.db"

	var msg1ID int64

	// Phase 1: Create database, post messages, snapshot, close
	func() {
		db, err := Open(dbPath)
		if err != nil {
			t.Fatalf("failed to create DB: %v", err)
		}
		defer db.Close()

		// Create MemDB with short snapshot interval for testing
		memDB, err := NewMemDB(db, 100*time.Millisecond)
		if err != nil {
			t.Fatalf("failed to create MemDB: %v", err)
		}

		// Create a channel
		err = db.CreateChannel("test-channel", "Test Channel", strPtr("Test description"), 0, 168, nil)
		if err != nil {
			t.Fatalf("failed to create channel: %v", err)
		}

		// Get channel ID
		channels, err := db.ListChannels()
		if err != nil {
			t.Fatalf("failed to list channels: %v", err)
		}
		if len(channels) != 1 {
			t.Fatalf("expected 1 channel, got %d", len(channels))
		}
		channelID := channels[0].ID

		// Post messages
		msg1ID, _, err = memDB.PostMessage(channelID, nil, nil, nil, "user1", "Hello World")
		if err != nil {
			t.Fatalf("failed to post message 1: %v", err)
		}

		_, _, err = memDB.PostMessage(channelID, nil, &msg1ID, nil, "user2", "Reply to hello")
		if err != nil {
			t.Fatalf("failed to post message 2: %v", err)
		}

		_, _, err = memDB.PostMessage(channelID, nil, nil, nil, "user3", "Another root message")
		if err != nil {
			t.Fatalf("failed to post message 3: %v", err)
		}

		// Force a snapshot by calling it directly
		if err := memDB.snapshot(); err != nil {
			t.Fatalf("snapshot failed: %v", err)
		}

		// Verify messages are in memory
		roots, err := memDB.GetRootMessages(channelID, 0, 100)
		if err != nil {
			t.Fatalf("failed to get root messages: %v", err)
		}
		if len(roots) != 2 {
			t.Fatalf("expected 2 root messages in memory, got %d", len(roots))
		}

		// Close MemDB (simulating server shutdown)
		if err := memDB.Close(); err != nil {
			t.Fatalf("failed to close MemDB: %v", err)
		}
	}()

	// Phase 2: Reopen database and verify messages are restored
	func() {
		db, err := Open(dbPath)
		if err != nil {
			t.Fatalf("failed to reopen DB: %v", err)
		}
		defer db.Close()

		// Create new MemDB (loads from SQLite)
		memDB, err := NewMemDB(db, 30*time.Second)
		if err != nil {
			t.Fatalf("failed to create MemDB after recovery: %v", err)
		}
		defer memDB.Close()

		// Get channel ID
		channels, err := db.ListChannels()
		if err != nil {
			t.Fatalf("failed to list channels: %v", err)
		}
		if len(channels) != 1 {
			t.Fatalf("expected 1 channel, got %d", len(channels))
		}
		channelID := channels[0].ID

		// Verify root messages were restored
		roots, err := memDB.GetRootMessages(channelID, 0, 100)
		if err != nil {
			t.Fatalf("failed to get root messages after recovery: %v", err)
		}

		if len(roots) != 2 {
			t.Fatalf("expected 2 root messages after recovery, got %d", len(roots))
		}

		// Verify replies were restored
		replies, err := memDB.GetReplies(msg1ID)
		if err != nil {
			t.Fatalf("failed to get replies after recovery: %v", err)
		}

		if len(replies) != 1 {
			t.Fatalf("expected 1 reply after recovery, got %d", len(replies))
		}

		// Verify reply count was restored
		for _, msg := range roots {
			if msg.Content == "Hello World" {
				count := msg.ReplyCount.Load()
				if count != 1 {
					t.Errorf("expected reply count 1 for 'Hello World', got %d", count)
				}
			}
		}
	}()
}

// TestSnapshotDeletesOldMessages tests that old deleted messages are hard-deleted
func TestSnapshotDeletesOldMessages(t *testing.T) {
	dbPath := t.TempDir() + "/test.db"

	db, err := Open(dbPath)
	if err != nil {
		t.Fatalf("failed to create DB: %v", err)
	}
	defer db.Close()

	memDB, err := NewMemDB(db, 100*time.Millisecond)
	if err != nil {
		t.Fatalf("failed to create MemDB: %v", err)
	}
	defer memDB.Close()

	// Create a channel
	err = db.CreateChannel("test-channel", "Test Channel", strPtr("Test description"), 0, 168, nil)
	if err != nil {
		t.Fatalf("failed to create channel: %v", err)
	}

	// Get channel ID
	channels, err := db.ListChannels()
	if err != nil {
		t.Fatalf("failed to list channels: %v", err)
	}
	if len(channels) != 1 {
		t.Fatalf("expected 1 channel, got %d", len(channels))
	}
	channelID := channels[0].ID

	// Post message
	msgID, _, err := memDB.PostMessage(channelID, nil, nil, nil, "user1", "To be deleted")
	if err != nil {
		t.Fatalf("failed to post message: %v", err)
	}

	// Soft delete the message
	_, err = memDB.SoftDeleteMessage(uint64(msgID), "user1")
	if err != nil {
		t.Fatalf("failed to soft delete message: %v", err)
	}

	// Manually set DeletedAt to 8 days ago (beyond 7-day retention)
	memDB.mu.Lock()
	msg := memDB.messages[msgID]
	oldTime := time.Now().UnixMilli() - (8 * 24 * 3600 * 1000)
	msg.DeletedAt = &oldTime
	memDB.mu.Unlock()

	// Take snapshot (should skip old deleted message)
	if err := memDB.snapshot(); err != nil {
		t.Fatalf("snapshot failed: %v", err)
	}

	// Hard delete old messages
	deleted := memDB.hardDeleteOldMessages()
	if deleted != 1 {
		t.Errorf("expected 1 message to be hard deleted, got %d", deleted)
	}

	// Verify message was removed from memory
	memDB.mu.RLock()
	_, exists := memDB.messages[msgID]
	memDB.mu.RUnlock()

	if exists {
		t.Error("expected message to be removed from memory after hard delete")
	}

	// Verify message is not in SQLite either (was skipped during snapshot)
	roots, err := memDB.GetRootMessages(channelID, 0, 100)
	if err != nil {
		t.Fatalf("failed to get root messages: %v", err)
	}

	for _, msg := range roots {
		if msg.ID == msgID {
			t.Error("old deleted message should not be in SQLite")
		}
	}
}

// TestReplyCountPersistence tests that reply counts are recomputed on load
func TestReplyCountPersistence(t *testing.T) {
	dbPath := t.TempDir() + "/test.db"

	// Phase 1: Create messages with replies
	func() {
		db, err := Open(dbPath)
		if err != nil {
			t.Fatalf("failed to create DB: %v", err)
		}
		defer db.Close()

		memDB, err := NewMemDB(db, 100*time.Millisecond)
		if err != nil {
			t.Fatalf("failed to create MemDB: %v", err)
		}
		defer memDB.Close()

		err = db.CreateChannel("test-channel", "Test Channel", strPtr("Test description"), 0, 168, nil)
		if err != nil {
			t.Fatalf("failed to create channel: %v", err)
		}

		// Get channel ID
		channels, err := db.ListChannels()
		if err != nil {
			t.Fatalf("failed to list channels: %v", err)
		}
		if len(channels) != 1 {
			t.Fatalf("expected 1 channel, got %d", len(channels))
		}
		channelID := channels[0].ID

		// Post root message
		rootID, _, err := memDB.PostMessage(channelID, nil, nil, nil, "user1", "Root message")
		if err != nil {
			t.Fatalf("failed to post root: %v", err)
		}

		// Post 3 replies
		for i := 0; i < 3; i++ {
			_, _, err := memDB.PostMessage(channelID, nil, &rootID, nil, "user2", "Reply")
			if err != nil {
				t.Fatalf("failed to post reply %d: %v", i, err)
			}
		}

		// Verify reply count in memory
		memDB.mu.RLock()
		rootMsg := memDB.messages[rootID]
		count := rootMsg.ReplyCount.Load()
		memDB.mu.RUnlock()

		if count != 3 {
			t.Fatalf("expected reply count 3 in memory, got %d", count)
		}

		// Snapshot and close
		if err := memDB.snapshot(); err != nil {
			t.Fatalf("snapshot failed: %v", err)
		}
	}()

	// Phase 2: Reload and verify reply counts were recomputed
	func() {
		db, err := Open(dbPath)
		if err != nil {
			t.Fatalf("failed to reopen DB: %v", err)
		}
		defer db.Close()

		memDB, err := NewMemDB(db, 30*time.Second)
		if err != nil {
			t.Fatalf("failed to create MemDB after recovery: %v", err)
		}
		defer memDB.Close()

		channels, err := db.ListChannels()
		if err != nil {
			t.Fatalf("failed to list channels: %v", err)
		}
		channelID := channels[0].ID

		roots, err := memDB.GetRootMessages(channelID, 0, 100)
		if err != nil {
			t.Fatalf("failed to get root messages: %v", err)
		}

		// Find root message
		for _, msg := range roots {
			count := msg.ReplyCount.Load()
			if count != 3 {
				t.Errorf("expected reply count 3 after reload, got %d", count)
			}
		}
	}()
}

// TestNestedRepliesSnapshot tests that deeply nested replies are snapshotted correctly
func TestNestedRepliesSnapshot(t *testing.T) {
	dbPath := t.TempDir() + "/test.db"

	var rootID, reply1ID, reply2ID, reply3ID int64

	// Phase 1: Create deeply nested replies
	func() {
		db, err := Open(dbPath)
		if err != nil {
			t.Fatalf("failed to create DB: %v", err)
		}
		defer db.Close()

		memDB, err := NewMemDB(db, 100*time.Millisecond)
		if err != nil {
			t.Fatalf("failed to create MemDB: %v", err)
		}
		defer memDB.Close()

		err = db.CreateChannel("test", "Test", strPtr("Test"), 0, 168, nil)
		if err != nil {
			t.Fatalf("failed to create channel: %v", err)
		}

		channels, _ := db.ListChannels()
		channelID := channels[0].ID

		// Create nested structure: Root -> Reply1 -> Reply2 -> Reply3
		rootID, _, err = memDB.PostMessage(channelID, nil, nil, nil, "user1", "Root")
		if err != nil {
			t.Fatalf("failed to post root: %v", err)
		}

		reply1ID, _, err = memDB.PostMessage(channelID, nil, &rootID, nil, "user2", "Reply1")
		if err != nil {
			t.Fatalf("failed to post reply1: %v", err)
		}

		reply2ID, _, err = memDB.PostMessage(channelID, nil, &reply1ID, nil, "user3", "Reply2")
		if err != nil {
			t.Fatalf("failed to post reply2: %v", err)
		}

		reply3ID, _, err = memDB.PostMessage(channelID, nil, &reply2ID, nil, "user4", "Reply3")
		if err != nil {
			t.Fatalf("failed to post reply3: %v", err)
		}

		// Force snapshot
		if err := memDB.snapshot(); err != nil {
			t.Fatalf("snapshot failed: %v", err)
		}
	}()

	// Phase 2: Verify nested structure was persisted correctly
	func() {
		db, err := Open(dbPath)
		if err != nil {
			t.Fatalf("failed to reopen DB: %v", err)
		}
		defer db.Close()

		memDB, err := NewMemDB(db, 30*time.Second)
		if err != nil {
			t.Fatalf("failed to create MemDB: %v", err)
		}
		defer memDB.Close()

		// Verify all messages exist
		for _, id := range []int64{rootID, reply1ID, reply2ID, reply3ID} {
			msg, err := db.GetMessage(uint64(id))
			if err != nil {
				t.Fatalf("failed to get message %d: %v", id, err)
			}
			if msg.ID != id {
				t.Errorf("message ID mismatch: expected %d, got %d", id, msg.ID)
			}
		}

		// Verify parent relationships
		msg2, _ := db.GetMessage(uint64(reply1ID))
		if msg2.ParentID == nil || *msg2.ParentID != rootID {
			t.Errorf("reply1 parent should be %d", rootID)
		}

		msg3, _ := db.GetMessage(uint64(reply2ID))
		if msg3.ParentID == nil || *msg3.ParentID != reply1ID {
			t.Errorf("reply2 parent should be %d", reply1ID)
		}

		msg4, _ := db.GetMessage(uint64(reply3ID))
		if msg4.ParentID == nil || *msg4.ParentID != reply2ID {
			t.Errorf("reply3 parent should be %d", reply2ID)
		}
	}()
}

// TestLargeBatchSnapshot tests batch insert performance with many messages
func TestLargeBatchSnapshot(t *testing.T) {
	tests := []struct {
		name         string
		messageCount int
	}{
		{"200 messages (single batch)", 200},
		{"5000 messages (10 batches of 500)", 5000},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			dbPath := t.TempDir() + "/test.db"

			db, err := Open(dbPath)
			if err != nil {
				t.Fatalf("failed to create DB: %v", err)
			}
			defer db.Close()

			memDB, err := NewMemDB(db, 100*time.Millisecond)
			if err != nil {
				t.Fatalf("failed to create MemDB: %v", err)
			}

			err = db.CreateChannel("test", "Test", strPtr("Test"), 0, 168, nil)
			if err != nil {
				t.Fatalf("failed to create channel: %v", err)
			}

			channels, _ := db.ListChannels()
			channelID := channels[0].ID

			// Create messages
			for i := 0; i < tt.messageCount; i++ {
				_, _, err := memDB.PostMessage(channelID, nil, nil, nil, "user", "test message")
				if err != nil {
					t.Fatalf("failed to post message %d: %v", i, err)
				}
			}

			// Force snapshot
			start := time.Now()
			if err := memDB.snapshot(); err != nil {
				t.Fatalf("snapshot failed: %v", err)
			}
			elapsed := time.Since(start)

			t.Logf("Snapshot of %d messages took %v (%.0f msg/sec)",
				tt.messageCount, elapsed, float64(tt.messageCount)/elapsed.Seconds())

			// Close first memDB before opening second
			if err := memDB.Close(); err != nil {
				t.Fatalf("failed to close memDB: %v", err)
			}

			// Verify messages exist after reload
			memDB2, err := NewMemDB(db, 30*time.Second)
			if err != nil {
				t.Fatalf("failed to reload MemDB: %v", err)
			}
			defer memDB2.Close()

			roots, err := memDB2.GetRootMessages(channelID, 0, tt.messageCount+100)
			if err != nil {
				t.Fatalf("failed to get messages: %v", err)
			}

			if len(roots) != tt.messageCount {
				t.Errorf("expected %d messages after reload, got %d", tt.messageCount, len(roots))
			}
		})
	}
}

func strPtr(s string) *string {
	return &s
}
