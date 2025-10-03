package database

import (
	"errors"
	"fmt"
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
	if err := db.CreateChannel("test", "#test", &desc, 1, 168); err != nil {
		t.Fatalf("failed to create channel: %v", err)
	}

	channels, err := db.ListChannels()
	if err != nil {
		t.Fatalf("failed to list channels: %v", err)
	}

	for _, ch := range channels {
		if ch.Name == "test" {
			return ch.ID
		}
	}

	t.Fatalf("test channel not found: %v", fmt.Errorf("name test missing"))
	return 0
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
