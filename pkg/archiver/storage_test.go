package archiver

import (
	"os"
	"path/filepath"
	"testing"

	gen "github.com/aeolun/superchat/pkg/archive/generated"
)

func newTestStore(t *testing.T) *Store {
	t.Helper()
	dir := t.TempDir()
	store, err := NewStore(filepath.Join(dir, "test.db"))
	if err != nil {
		t.Fatalf("NewStore: %v", err)
	}
	t.Cleanup(func() { store.Close() })
	return store
}

func TestStoreUpsertChannel(t *testing.T) {
	store := newTestStore(t)

	err := store.UpsertChannel(&gen.ChannelInfo{
		ChannelId: 1, Name: "general", Description: "General chat",
		ChannelType: 0, RetentionHours: 168, ArchiveEnabled: 1,
	})
	if err != nil {
		t.Fatalf("UpsertChannel: %v", err)
	}

	channels, err := store.GetChannels()
	if err != nil {
		t.Fatalf("GetChannels: %v", err)
	}
	if len(channels) != 1 {
		t.Fatalf("len(channels) = %d, want 1", len(channels))
	}
	if channels[0].Name != "general" {
		t.Errorf("Name = %q, want %q", channels[0].Name, "general")
	}

	// Upsert same channel with updated name
	err = store.UpsertChannel(&gen.ChannelInfo{
		ChannelId: 1, Name: "general-v2", Description: "Updated",
		ChannelType: 0, RetentionHours: 168, ArchiveEnabled: 1,
	})
	if err != nil {
		t.Fatalf("UpsertChannel (update): %v", err)
	}

	channels, err = store.GetChannels()
	if err != nil {
		t.Fatalf("GetChannels after update: %v", err)
	}
	if len(channels) != 1 {
		t.Fatalf("len(channels) = %d, want 1 after upsert", len(channels))
	}
	if channels[0].Name != "general-v2" {
		t.Errorf("Name after update = %q, want %q", channels[0].Name, "general-v2")
	}
}

func TestStoreUpsertMessage(t *testing.T) {
	store := newTestStore(t)

	// Create channel first
	if err := store.UpsertChannel(&gen.ChannelInfo{ChannelId: 1, Name: "test"}); err != nil {
		t.Fatalf("UpsertChannel: %v", err)
	}

	// Insert message
	if err := store.UpsertMessage(&gen.MessageSync{
		MessageId: 100, ChannelId: 1,
		AuthorNickname: "alice", Content: "hello",
		CreatedAt: 1700000000000,
	}); err != nil {
		t.Fatalf("UpsertMessage: %v", err)
	}

	msgs, err := store.GetRootMessages(1, 50, 0)
	if err != nil {
		t.Fatalf("GetRootMessages: %v", err)
	}
	if len(msgs) != 1 {
		t.Fatalf("len(msgs) = %d, want 1", len(msgs))
	}
	if msgs[0].Content != "hello" {
		t.Errorf("Content = %q, want %q", msgs[0].Content, "hello")
	}
	if msgs[0].AuthorNickname != "alice" {
		t.Errorf("AuthorNickname = %q, want %q", msgs[0].AuthorNickname, "alice")
	}
}

func TestStoreUpdateMessage(t *testing.T) {
	store := newTestStore(t)

	if err := store.UpsertChannel(&gen.ChannelInfo{ChannelId: 1, Name: "test"}); err != nil {
		t.Fatal(err)
	}
	if err := store.UpsertMessage(&gen.MessageSync{
		MessageId: 100, ChannelId: 1, AuthorNickname: "alice",
		Content: "original", CreatedAt: 1700000000000,
	}); err != nil {
		t.Fatal(err)
	}

	// Edit message
	if err := store.UpdateMessage(&gen.MessageEdited{
		MessageId: 100, ChannelId: 1, NewContent: "edited", EditedAt: 1700000001000,
	}); err != nil {
		t.Fatal(err)
	}

	msgs, err := store.GetRootMessages(1, 50, 0)
	if err != nil {
		t.Fatal(err)
	}
	if msgs[0].Content != "edited" {
		t.Errorf("Content after edit = %q, want %q", msgs[0].Content, "edited")
	}
	if msgs[0].EditedAt == nil || *msgs[0].EditedAt != 1700000001000 {
		t.Errorf("EditedAt = %v, want 1700000001000", msgs[0].EditedAt)
	}
}

func TestStoreDeleteMessage(t *testing.T) {
	store := newTestStore(t)

	if err := store.UpsertChannel(&gen.ChannelInfo{ChannelId: 1, Name: "test"}); err != nil {
		t.Fatal(err)
	}
	if err := store.UpsertMessage(&gen.MessageSync{
		MessageId: 100, ChannelId: 1, AuthorNickname: "alice",
		Content: "to-be-deleted", CreatedAt: 1700000000000,
	}); err != nil {
		t.Fatal(err)
	}

	// Delete message
	if err := store.DeleteMessage(&gen.MessageDeleted{
		MessageId: 100, ChannelId: 1, DeletedAt: 1700000002000,
	}); err != nil {
		t.Fatal(err)
	}

	msgs, err := store.GetRootMessages(1, 50, 0)
	if err != nil {
		t.Fatal(err)
	}
	if msgs[0].DeletedAt == nil || *msgs[0].DeletedAt != 1700000002000 {
		t.Errorf("DeletedAt = %v, want 1700000002000", msgs[0].DeletedAt)
	}
}

func TestStoreChannelStates(t *testing.T) {
	store := newTestStore(t)

	// Create channels with messages
	if err := store.UpsertChannel(&gen.ChannelInfo{ChannelId: 1, Name: "ch1"}); err != nil {
		t.Fatal(err)
	}
	if err := store.UpsertChannel(&gen.ChannelInfo{ChannelId: 2, Name: "ch2"}); err != nil {
		t.Fatal(err)
	}

	// Insert messages
	for _, msg := range []*gen.MessageSync{
		{MessageId: 10, ChannelId: 1, AuthorNickname: "a", Content: "1", CreatedAt: 1},
		{MessageId: 20, ChannelId: 1, AuthorNickname: "a", Content: "2", CreatedAt: 2},
		{MessageId: 30, ChannelId: 2, AuthorNickname: "a", Content: "3", CreatedAt: 3},
	} {
		if err := store.UpsertMessage(msg); err != nil {
			t.Fatal(err)
		}
	}

	states, err := store.GetChannelStates()
	if err != nil {
		t.Fatal(err)
	}
	if len(states) != 2 {
		t.Fatalf("len(states) = %d, want 2", len(states))
	}

	// Build map for easier assertion
	stateMap := make(map[int64]int64)
	for _, s := range states {
		stateMap[s.ChannelID] = s.LastMessageID
	}

	if stateMap[1] != 20 {
		t.Errorf("channel 1 last_message_id = %d, want 20", stateMap[1])
	}
	if stateMap[2] != 30 {
		t.Errorf("channel 2 last_message_id = %d, want 30", stateMap[2])
	}
}

func TestStoreGetThreadMessages(t *testing.T) {
	store := newTestStore(t)

	if err := store.UpsertChannel(&gen.ChannelInfo{ChannelId: 1, Name: "test"}); err != nil {
		t.Fatal(err)
	}

	threadRoot := uint64(100)
	// Root message
	if err := store.UpsertMessage(&gen.MessageSync{
		MessageId: 100, ChannelId: 1, AuthorNickname: "alice",
		Content: "root", CreatedAt: 1000,
	}); err != nil {
		t.Fatal(err)
	}
	// Reply
	if err := store.UpsertMessage(&gen.MessageSync{
		MessageId: 101, ChannelId: 1, ParentId: &threadRoot, ThreadRootId: &threadRoot,
		AuthorNickname: "bob", Content: "reply", CreatedAt: 2000,
	}); err != nil {
		t.Fatal(err)
	}

	msgs, err := store.GetThreadMessages(100)
	if err != nil {
		t.Fatal(err)
	}
	if len(msgs) != 2 {
		t.Fatalf("len(thread msgs) = %d, want 2", len(msgs))
	}
	// Should be ordered by created_at ASC
	if msgs[0].ID != 100 {
		t.Errorf("first message ID = %d, want 100 (root)", msgs[0].ID)
	}
	if msgs[1].ID != 101 {
		t.Errorf("second message ID = %d, want 101 (reply)", msgs[1].ID)
	}
}

func TestStoreGetMessageCount(t *testing.T) {
	store := newTestStore(t)

	if err := store.UpsertChannel(&gen.ChannelInfo{ChannelId: 1, Name: "test"}); err != nil {
		t.Fatal(err)
	}

	count, err := store.GetMessageCount(1)
	if err != nil {
		t.Fatal(err)
	}
	if count != 0 {
		t.Errorf("count = %d, want 0", count)
	}

	for i := range 5 {
		if err := store.UpsertMessage(&gen.MessageSync{
			MessageId: uint64(i + 1), ChannelId: 1,
			AuthorNickname: "a", Content: "msg", CreatedAt: int64(i * 1000),
		}); err != nil {
			t.Fatal(err)
		}
	}

	count, err = store.GetMessageCount(1)
	if err != nil {
		t.Fatal(err)
	}
	if count != 5 {
		t.Errorf("count = %d, want 5", count)
	}
}

func TestHTMLGeneratorCreatesDirs(t *testing.T) {
	store := newTestStore(t)
	outputDir := filepath.Join(t.TempDir(), "html-output")

	htmlGen := NewHTMLGenerator(outputDir, store)

	// Create a channel with some messages
	if err := store.UpsertChannel(&gen.ChannelInfo{ChannelId: 1, Name: "test-channel", Description: "Test"}); err != nil {
		t.Fatal(err)
	}
	if err := store.UpsertMessage(&gen.MessageSync{
		MessageId: 1, ChannelId: 1, AuthorNickname: "alice",
		Content: "hello world", CreatedAt: 1700000000000,
	}); err != nil {
		t.Fatal(err)
	}

	htmlGen.GenerateAll()

	// Verify index.html was created
	if _, err := os.Stat(filepath.Join(outputDir, "index.html")); os.IsNotExist(err) {
		t.Error("index.html not created")
	}

	// Verify channel dir was created
	channelDir := filepath.Join(outputDir, "channel", "test-channel")
	if _, err := os.Stat(filepath.Join(channelDir, "index.html")); os.IsNotExist(err) {
		t.Error("channel/test-channel/index.html not created")
	}
}
