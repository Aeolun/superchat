package database

import (
	"errors"
	"path/filepath"
	"testing"
)

func newTestDB(t *testing.T) *DB {
	t.Helper()
	dbPath := filepath.Join(t.TempDir(), "test.db")
	db, err := Open(dbPath)
	if err != nil {
		t.Fatalf("failed to open test database: %v", err)
	}
	return db
}

func mustChannelID(t *testing.T, db *DB) int64 {
	t.Helper()
	desc := "Test channel"
	channelID, err := db.CreateChannel("test", "#test", &desc, 1, 168, nil)
	if err != nil {
		t.Fatalf("failed to create channel: %v", err)
	}
	return channelID
}

func TestSoftDeleteMessageSuccess(t *testing.T) {
	db := newTestDB(t)
	defer db.Close()

	channelID := mustChannelID(t, db)

	messageID, err := db.PostMessage(channelID, nil, nil, nil, "alice", "hello world")
	if err != nil {
		t.Fatalf("failed to create message: %v", err)
	}

	deleted, err := db.SoftDeleteMessage(uint64(messageID), "alice")
	if err != nil {
		t.Fatalf("soft delete failed: %v", err)
	}

	expectedContent := "[deleted by ~alice]"
	if deleted.Content != expectedContent {
		t.Fatalf("expected content %q, got %q", expectedContent, deleted.Content)
	}
	if deleted.DeletedAt == nil {
		t.Fatalf("expected deleted_at to be set")
	}

	stored, err := db.GetMessage(uint64(messageID))
	if err != nil {
		t.Fatalf("failed to load message: %v", err)
	}
	if stored.Content != expectedContent {
		t.Fatalf("expected stored content %q, got %q", expectedContent, stored.Content)
	}
	if stored.DeletedAt == nil {
		t.Fatalf("expected stored deleted_at to be set")
	}

	var versionCount int
	if err := db.conn.QueryRow(`SELECT COUNT(*) FROM MessageVersion WHERE message_id = ? AND version_type = 'deleted'`, messageID).Scan(&versionCount); err != nil {
		t.Fatalf("failed to count versions: %v", err)
	}
	if versionCount != 1 {
		t.Fatalf("expected 1 deleted version, got %d", versionCount)
	}
}

func TestSoftDeleteMessageNotOwned(t *testing.T) {
	db := newTestDB(t)
	defer db.Close()

	channelID := mustChannelID(t, db)
	messageID, err := db.PostMessage(channelID, nil, nil, nil, "alice", "hello")
	if err != nil {
		t.Fatalf("failed to create message: %v", err)
	}

	_, err = db.SoftDeleteMessage(uint64(messageID), "bob")
	if !errors.Is(err, ErrMessageNotOwned) {
		t.Fatalf("expected ErrMessageNotOwned, got %v", err)
	}
}

func TestSoftDeleteMessageAlreadyDeleted(t *testing.T) {
	db := newTestDB(t)
	defer db.Close()

	channelID := mustChannelID(t, db)
	messageID, err := db.PostMessage(channelID, nil, nil, nil, "alice", "hello")
	if err != nil {
		t.Fatalf("failed to create message: %v", err)
	}

	if _, err := db.SoftDeleteMessage(uint64(messageID), "alice"); err != nil {
		t.Fatalf("unexpected error deleting first time: %v", err)
	}

	_, err = db.SoftDeleteMessage(uint64(messageID), "alice")
	if !errors.Is(err, ErrMessageAlreadyDeleted) {
		t.Fatalf("expected ErrMessageAlreadyDeleted, got %v", err)
	}
}

func TestSoftDeleteMessageNotFound(t *testing.T) {
	db := newTestDB(t)
	defer db.Close()

	_, err := db.SoftDeleteMessage(9999, "anyone")
	if !errors.Is(err, ErrMessageNotFound) {
		t.Fatalf("expected ErrMessageNotFound, got %v", err)
	}
}

func TestCleanupExpiredMessages(t *testing.T) {
	db := newTestDB(t)
	defer db.Close()

	// Create a channel with 1-hour retention
	desc := "Short retention channel"
	if _, err := db.CreateChannel("shortretention", "#shortretention", &desc, 1, 1, nil); err != nil {
		t.Fatalf("failed to create channel: %v", err)
	}

	channels, err := db.ListChannels()
	if err != nil {
		t.Fatalf("failed to list channels: %v", err)
	}

	var shortChannelID int64
	for _, ch := range channels {
		if ch.Name == "shortretention" {
			shortChannelID = ch.ID
			break
		}
	}

	// Create an old message (2 hours ago)
	twoHoursAgo := nowMillis() - (2 * 3600 * 1000)
	_, err = db.conn.Exec(`
		INSERT INTO Message (channel_id, parent_id, author_nickname, content, created_at)
		VALUES (?, NULL, 'alice', 'old message', ?)
	`, shortChannelID, twoHoursAgo)
	if err != nil {
		t.Fatalf("failed to create old message: %v", err)
	}

	// Create a recent message (30 minutes ago)
	recentID, err := db.PostMessage(shortChannelID, nil, nil, nil, "bob", "recent message")
	if err != nil {
		t.Fatalf("failed to create recent message: %v", err)
	}

	// Run cleanup
	count, err := db.CleanupExpiredMessages()
	if err != nil {
		t.Fatalf("cleanup failed: %v", err)
	}

	// Should have deleted 1 message (the old one)
	if count != 1 {
		t.Fatalf("expected 1 message deleted, got %d", count)
	}

	// Verify recent message still exists
	_, err = db.GetMessage(uint64(recentID))
	if err != nil {
		t.Fatalf("recent message should still exist: %v", err)
	}

	// Verify old message is gone
	var oldCount int
	err = db.conn.QueryRow(`SELECT COUNT(*) FROM Message WHERE created_at = ?`, twoHoursAgo).Scan(&oldCount)
	if err != nil {
		t.Fatalf("failed to count old messages: %v", err)
	}
	if oldCount != 0 {
		t.Fatalf("expected 0 old messages, got %d", oldCount)
	}
}

func TestCleanupExpiredMessagesWithReplies(t *testing.T) {
	db := newTestDB(t)
	defer db.Close()

	// Create a channel with 1-hour retention
	desc := "Short retention channel"
	if _, err := db.CreateChannel("shortretention", "#shortretention", &desc, 1, 1, nil); err != nil {
		t.Fatalf("failed to create channel: %v", err)
	}

	channels, err := db.ListChannels()
	if err != nil {
		t.Fatalf("failed to list channels: %v", err)
	}

	var channelID int64
	for _, ch := range channels {
		if ch.Name == "shortretention" {
			channelID = ch.ID
			break
		}
	}

	// Create old root message with replies
	twoHoursAgo := nowMillis() - (2 * 3600 * 1000)
	result, err := db.conn.Exec(`
		INSERT INTO Message (channel_id, parent_id, author_nickname, content, created_at)
		VALUES (?, NULL, 'alice', 'old root', ?)
	`, channelID, twoHoursAgo)
	if err != nil {
		t.Fatalf("failed to create old root: %v", err)
	}
	rootID, _ := result.LastInsertId()

	// Add reply to old root
	_, err = db.conn.Exec(`
		INSERT INTO Message (channel_id, parent_id, author_nickname, content, created_at)
		VALUES (?, ?, 'bob', 'reply to old', ?)
	`, channelID, rootID, twoHoursAgo)
	if err != nil {
		t.Fatalf("failed to create reply: %v", err)
	}

	// Run cleanup
	count, err := db.CleanupExpiredMessages()
	if err != nil {
		t.Fatalf("cleanup failed: %v", err)
	}

	// Should have deleted 1 root (CASCADE deletes the reply)
	if count != 1 {
		t.Fatalf("expected 1 root message deleted, got %d", count)
	}

	// Verify both messages are gone (CASCADE delete)
	var totalCount int
	err = db.conn.QueryRow(`SELECT COUNT(*) FROM Message WHERE channel_id = ?`, channelID).Scan(&totalCount)
	if err != nil {
		t.Fatalf("failed to count messages: %v", err)
	}
	if totalCount != 0 {
		t.Fatalf("expected 0 messages after cleanup, got %d", totalCount)
	}
}

func TestCleanupIdleSessions(t *testing.T) {
	db := newTestDB(t)
	defer db.Close()

	// Create a recent session (30 seconds ago)
	thirtySecondsAgo := nowMillis() - (30 * 1000)
	_, err := db.conn.Exec(`
		INSERT INTO Session (nickname, connection_type, connected_at, last_activity)
		VALUES ('alice', 'tcp', ?, ?)
	`, thirtySecondsAgo, thirtySecondsAgo)
	if err != nil {
		t.Fatalf("failed to create recent session: %v", err)
	}

	// Create an old session (2 minutes ago)
	twoMinutesAgo := nowMillis() - (120 * 1000)
	_, err = db.conn.Exec(`
		INSERT INTO Session (nickname, connection_type, connected_at, last_activity)
		VALUES ('bob', 'tcp', ?, ?)
	`, twoMinutesAgo, twoMinutesAgo)
	if err != nil {
		t.Fatalf("failed to create old session: %v", err)
	}

	// Cleanup sessions older than 60 seconds
	count, err := db.CleanupIdleSessions(60)
	if err != nil {
		t.Fatalf("cleanup failed: %v", err)
	}

	// Should have deleted 1 session (the old one)
	if count != 1 {
		t.Fatalf("expected 1 session deleted, got %d", count)
	}

	// Verify recent session still exists
	var recentCount int
	err = db.conn.QueryRow(`SELECT COUNT(*) FROM Session WHERE last_activity >= ?`, nowMillis()-(60*1000)).Scan(&recentCount)
	if err != nil {
		t.Fatalf("failed to count recent sessions: %v", err)
	}
	if recentCount != 1 {
		t.Fatalf("expected 1 recent session, got %d", recentCount)
	}
}
