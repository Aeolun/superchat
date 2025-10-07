package server

import (
	"bytes"
	"fmt"
	"io"
	"log"
	"net"
	"testing"
	"time"

	"github.com/aeolun/superchat/pkg/database"
	"github.com/aeolun/superchat/pkg/protocol"
)

// initTestLoggers initializes package-level loggers for testing
func initTestLoggers(t *testing.T) {
	// Discard logs during tests to keep output clean
	errorLog = log.New(io.Discard, "ERROR: ", log.LstdFlags)
	debugLog = log.New(io.Discard, "DEBUG: ", log.LstdFlags)
}

// testServer creates a test server with an in-memory database
func testServer(t *testing.T) (*Server, *database.DB) {
	tmpDir := t.TempDir()
	dbPath := tmpDir + "/test.db"

	db, err := database.Open(dbPath)
	if err != nil {
		t.Fatalf("Failed to open test database: %v", err)
	}

	memDB, err := database.NewMemDB(db, 100*time.Millisecond)
	if err != nil {
		t.Fatalf("Failed to create MemDB: %v", err)
	}

	// Initialize loggers for testing (discard output)
	initTestLoggers(t)

	// Create session manager (no metrics in tests to avoid registration conflicts)
	sessions := NewSessionManager(memDB, 120)

	cfg := DefaultConfig()
	srv := &Server{
		db:       memDB,
		sessions: sessions,
		config:   cfg,
		metrics:  nil, // Skip metrics in tests
	}

	return srv, db
}

// createTestChannel helper - creates a channel via database
func createTestChannel(t *testing.T, db *database.DB, name, displayName string) int64 {
	channelID, err := db.CreateChannel(name, displayName, nil, 1, 168, nil)
	if err != nil {
		t.Fatalf("Failed to create test channel: %v", err)
	}
	return channelID
}

// postTestMessage helper - posts a message via database
func postTestMessage(t *testing.T, db *database.DB, channelID int64, parentID *int64, nickname, content string) int64 {
	msgID, err := db.PostMessage(channelID, nil, parentID, nil, nickname, content)
	if err != nil {
		t.Fatalf("Failed to post test message: %v", err)
	}
	return msgID
}

// reloadMemDB helper - reloads the MemDB from database
func reloadMemDB(t *testing.T, srv *Server, db *database.DB) {
	memDB, err := database.NewMemDB(db, 100*time.Millisecond)
	if err != nil {
		t.Fatalf("Failed to create new MemDB: %v", err)
	}
	srv.db = memDB
	srv.sessions = NewSessionManager(memDB, 120)
}

// mockAddr implements net.Addr for testing
type mockAddr struct{}

func (m *mockAddr) Network() string { return "tcp" }
func (m *mockAddr) String() string  { return "127.0.0.1:12345" }

// mockConn implements net.Conn for testing
type mockConn struct {
	readBuf  *bytes.Buffer
	writeBuf *bytes.Buffer
}

func newMockConn() *mockConn {
	return &mockConn{
		readBuf:  &bytes.Buffer{},
		writeBuf: &bytes.Buffer{},
	}
}

func (m *mockConn) Read(b []byte) (n int, err error)         { return m.readBuf.Read(b) }
func (m *mockConn) Write(b []byte) (n int, err error)        { return m.writeBuf.Write(b) }
func (m *mockConn) Close() error                             { return nil }
func (m *mockConn) LocalAddr() net.Addr                      { return &mockAddr{} }
func (m *mockConn) RemoteAddr() net.Addr                     { return &mockAddr{} }
func (m *mockConn) SetDeadline(t time.Time) error            { return nil }
func (m *mockConn) SetReadDeadline(t time.Time) error        { return nil }
func (m *mockConn) SetWriteDeadline(t time.Time) error       { return nil }

// testSession creates a test session with a mock connection
func testSession(srv *Server) *Session {
	mockConn := newMockConn()
	sess, err := srv.sessions.CreateSession(nil, "", "tcp", mockConn)
	if err != nil {
		panic(err)
	}
	return sess
}

// encodeSetNicknameMessage helper
func encodeSetNicknameMessage(msg *protocol.SetNicknameMessage) (*protocol.Frame, error) {
	var buf bytes.Buffer
	if err := msg.EncodeTo(&buf); err != nil {
		return nil, err
	}
	return &protocol.Frame{
		Version: protocol.ProtocolVersion,
		Type:    protocol.TypeSetNickname,
		Flags:   0,
		Payload: buf.Bytes(),
	}, nil
}

// encodeListChannelsMessage helper
func encodeListChannelsMessage(msg *protocol.ListChannelsMessage) (*protocol.Frame, error) {
	var buf bytes.Buffer
	if err := msg.EncodeTo(&buf); err != nil {
		return nil, err
	}
	return &protocol.Frame{
		Version: protocol.ProtocolVersion,
		Type:    protocol.TypeListChannels,
		Flags:   0,
		Payload: buf.Bytes(),
	}, nil
}

// encodeJoinChannelMessage helper
func encodeJoinChannelMessage(msg *protocol.JoinChannelMessage) (*protocol.Frame, error) {
	var buf bytes.Buffer
	if err := msg.EncodeTo(&buf); err != nil {
		return nil, err
	}
	return &protocol.Frame{
		Version: protocol.ProtocolVersion,
		Type:    protocol.TypeJoinChannel,
		Flags:   0,
		Payload: buf.Bytes(),
	}, nil
}

// encodePostMessageMessage helper
func encodePostMessageMessage(msg *protocol.PostMessageMessage) (*protocol.Frame, error) {
	var buf bytes.Buffer
	if err := msg.EncodeTo(&buf); err != nil {
		return nil, err
	}
	return &protocol.Frame{
		Version: protocol.ProtocolVersion,
		Type:    protocol.TypePostMessage,
		Flags:   0,
		Payload: buf.Bytes(),
	}, nil
}

// encodeDeleteMessageMessage helper
func encodeDeleteMessageMessage(msg *protocol.DeleteMessageMessage) (*protocol.Frame, error) {
	var buf bytes.Buffer
	if err := msg.EncodeTo(&buf); err != nil {
		return nil, err
	}
	return &protocol.Frame{
		Version: protocol.ProtocolVersion,
		Type:    protocol.TypeDeleteMessage,
		Flags:   0,
		Payload: buf.Bytes(),
	}, nil
}

// encodePingMessage helper
func encodePingMessage(msg *protocol.PingMessage) (*protocol.Frame, error) {
	var buf bytes.Buffer
	if err := msg.EncodeTo(&buf); err != nil {
		return nil, err
	}
	return &protocol.Frame{
		Version: protocol.ProtocolVersion,
		Type:    protocol.TypePing,
		Flags:   0,
		Payload: buf.Bytes(),
	}, nil
}

// encodeListMessagesMessage helper
func encodeListMessagesMessage(msg *protocol.ListMessagesMessage) (*protocol.Frame, error) {
	var buf bytes.Buffer
	if err := msg.EncodeTo(&buf); err != nil {
		return nil, err
	}
	return &protocol.Frame{
		Version: protocol.ProtocolVersion,
		Type:    protocol.TypeListMessages,
		Flags:   0,
		Payload: buf.Bytes(),
	}, nil
}

func TestHandleSetNickname(t *testing.T) {
	srv, db := testServer(t)
	defer db.Close()

	sess := testSession(srv)

	tests := []struct {
		name        string
		nickname    string
		expectError bool
	}{
		{"valid nickname", "testuser", false},
		{"min length", "abc", false},
		{"max length", "12345678901234567890", false},
		{"with underscore", "test_user", false},
		{"with dash", "test-user", false},
		{"too short", "ab", true},
		{"too long", "123456789012345678901", true},
		{"invalid chars", "test user", true},
		{"invalid chars special", "test@user", true},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			msg := &protocol.SetNicknameMessage{
				Nickname: tt.nickname,
			}

			frame, err := encodeSetNicknameMessage(msg)
			if err != nil {
				// Protocol validation caught the error during encoding
				if tt.expectError {
					// This is expected - protocol rejects invalid nicknames at encoding time
					return
				}
				t.Fatalf("Failed to encode message: %v", err)
			}

			err = srv.handleSetNickname(sess, frame)

			// Handler sends response but only returns error on write failure
			if err != nil {
				t.Errorf("Unexpected transport error for nickname '%s': %v", tt.nickname, err)
			}

			// Verify nickname was set (or not) based on validity
			sess.mu.RLock()
			actualNick := sess.Nickname
			sess.mu.RUnlock()

			if tt.expectError {
				// Invalid nickname should not be set
				if actualNick == tt.nickname {
					t.Errorf("Invalid nickname '%s' should not have been set", tt.nickname)
				}
			} else {
				// Valid nickname should be set
				if actualNick != tt.nickname {
					t.Errorf("Expected nickname '%s', got '%s'", tt.nickname, actualNick)
				}
			}
		})
	}
}

func TestHandleListChannels(t *testing.T) {
	srv, db := testServer(t)
	defer db.Close()

	// Create some test channels
	createTestChannel(t, db, "general", "General")
	createTestChannel(t, db, "tech", "Technology")
	createTestChannel(t, db, "random", "Random")

	// Reload MemDB to pick up channels
	reloadMemDB(t, srv, db)

	sess := testSession(srv)

	msg := &protocol.ListChannelsMessage{
		FromChannelID: 0,
		Limit:         10,
	}

	frame, err := encodeListChannelsMessage(msg)
	if err != nil {
		t.Fatalf("Failed to encode message: %v", err)
	}

	err = srv.handleListChannels(sess, frame)
	if err != nil {
		t.Fatalf("handleListChannels failed: %v", err)
	}
}

func TestHandleJoinChannel(t *testing.T) {
	srv, db := testServer(t)
	defer db.Close()

	// Create test channel
	channelID := createTestChannel(t, db, "general", "General")

	// Reload MemDB to pick up channel
	reloadMemDB(t, srv, db)

	sess := testSession(srv)

	tests := []struct {
		name        string
		channelID   uint64
		expectError bool
	}{
		{"valid channel", uint64(channelID), false},
		{"non-existent channel", 999, false}, // Returns success=false, not error
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			msg := &protocol.JoinChannelMessage{
				ChannelID:    tt.channelID,
				SubchannelID: nil,
			}

			frame, err := encodeJoinChannelMessage(msg)
			if err != nil {
				t.Fatalf("Failed to encode message: %v", err)
			}

			err = srv.handleJoinChannel(sess, frame)
			if tt.expectError && err == nil {
				t.Error("Expected error, got nil")
			}
			if !tt.expectError && err != nil {
				t.Errorf("Unexpected error: %v", err)
			}
		})
	}
}

func TestHandlePostMessage(t *testing.T) {
	srv, db := testServer(t)
	defer db.Close()

	// Create test channel
	channelID := createTestChannel(t, db, "general", "General")

	// Reload MemDB to pick up channel
	reloadMemDB(t, srv, db)

	sess := testSession(srv)

	t.Run("post without nickname fails", func(t *testing.T) {
		msg := &protocol.PostMessageMessage{
			ChannelID:    uint64(channelID),
			SubchannelID: nil,
			ParentID:     nil,
			Content:      "Test message",
		}

		frame, err := encodePostMessageMessage(msg)
		if err != nil {
			t.Fatalf("Failed to encode message: %v", err)
		}

		// Handler sends error response to client but doesn't return error
		err = srv.handlePostMessage(sess, frame)
		if err != nil {
			t.Errorf("Handler should not return error, got: %v", err)
		}
		// Note: In production, we would verify the ERROR response was sent to client
	})

	t.Run("post with nickname succeeds", func(t *testing.T) {
		// Set nickname
		srv.sessions.UpdateNickname(sess.ID, "testuser")

		msg := &protocol.PostMessageMessage{
			ChannelID:    uint64(channelID),
			SubchannelID: nil,
			ParentID:     nil,
			Content:      "Test message",
		}

		frame, err := encodePostMessageMessage(msg)
		if err != nil {
			t.Fatalf("Failed to encode message: %v", err)
		}

		err = srv.handlePostMessage(sess, frame)
		if err != nil {
			t.Fatalf("Unexpected error: %v", err)
		}
	})

	t.Run("message too long fails", func(t *testing.T) {
		srv.sessions.UpdateNickname(sess.ID, "testuser")

		// Create message longer than max
		longContent := make([]byte, srv.config.MaxMessageLength+1)
		for i := range longContent {
			longContent[i] = 'a'
		}

		msg := &protocol.PostMessageMessage{
			ChannelID:    uint64(channelID),
			SubchannelID: nil,
			ParentID:     nil,
			Content:      string(longContent),
		}

		frame, err := encodePostMessageMessage(msg)
		if err != nil {
			// Protocol validation caught the error during encoding
			// This is expected - protocol rejects oversized messages at encoding time
			return
		}

		// If encoding succeeded, handler should reject it
		err = srv.handlePostMessage(sess, frame)
		if err != nil {
			t.Errorf("Handler should send error response, not return error: %v", err)
		}
		// Note: In production, we would verify the ERROR response was sent to client
	})
}

func TestHandleDeleteMessage(t *testing.T) {
	srv, db := testServer(t)
	defer db.Close()

	// Create test channel and message
	channelID := createTestChannel(t, db, "general", "General")
	msgID := postTestMessage(t, db, channelID, nil, "testuser", "Test message")

	// Reload MemDB to pick up data
	reloadMemDB(t, srv, db)

	sess := testSession(srv)

	t.Run("delete without nickname fails", func(t *testing.T) {
		msg := &protocol.DeleteMessageMessage{
			MessageID: uint64(msgID),
		}

		frame, err := encodeDeleteMessageMessage(msg)
		if err != nil {
			t.Fatalf("Failed to encode message: %v", err)
		}

		// Handler sends error response to client but doesn't return error
		err = srv.handleDeleteMessage(sess, frame)
		if err != nil {
			t.Errorf("Handler should not return error, got: %v", err)
		}
		// Note: In production, we would verify the ERROR response was sent to client
	})

	t.Run("delete wrong user message fails", func(t *testing.T) {
		srv.sessions.UpdateNickname(sess.ID, "wronguser")

		msg := &protocol.DeleteMessageMessage{
			MessageID: uint64(msgID),
		}

		frame, err := encodeDeleteMessageMessage(msg)
		if err != nil {
			t.Fatalf("Failed to encode message: %v", err)
		}

		// Handler sends error response to client but doesn't return error
		err = srv.handleDeleteMessage(sess, frame)
		if err != nil {
			t.Errorf("Handler should not return error, got: %v", err)
		}
		// Note: In production, we would verify the ERROR response was sent to client
	})

	t.Run("delete own message succeeds", func(t *testing.T) {
		srv.sessions.UpdateNickname(sess.ID, "testuser")

		msg := &protocol.DeleteMessageMessage{
			MessageID: uint64(msgID),
		}

		frame, err := encodeDeleteMessageMessage(msg)
		if err != nil {
			t.Fatalf("Failed to encode message: %v", err)
		}

		err = srv.handleDeleteMessage(sess, frame)
		if err != nil {
			t.Fatalf("Unexpected error: %v", err)
		}
	})

	t.Run("delete non-existent message fails", func(t *testing.T) {
		srv.sessions.UpdateNickname(sess.ID, "testuser")

		msg := &protocol.DeleteMessageMessage{
			MessageID: 999,
		}

		frame, err := encodeDeleteMessageMessage(msg)
		if err != nil {
			t.Fatalf("Failed to encode message: %v", err)
		}

		// Handler sends error response to client but doesn't return error
		err = srv.handleDeleteMessage(sess, frame)
		if err != nil {
			t.Errorf("Handler should not return error, got: %v", err)
		}
		// Note: In production, we would verify the ERROR response was sent to client
	})
}

func TestHandlePing(t *testing.T) {
	srv, db := testServer(t)
	defer db.Close()

	sess := testSession(srv)

	msg := &protocol.PingMessage{
		Timestamp: time.Now().UnixMilli(),
	}

	frame, err := encodePingMessage(msg)
	if err != nil {
		t.Fatalf("Failed to encode message: %v", err)
	}

	err = srv.handlePing(sess, frame)
	if err != nil {
		t.Fatalf("handlePing failed: %v", err)
	}
}

func TestHandleListMessages(t *testing.T) {
	srv, db := testServer(t)
	defer db.Close()

	// Create test channel and messages
	channelID := createTestChannel(t, db, "general", "General")
	rootID := postTestMessage(t, db, channelID, nil, "testuser", "Root message")
	postTestMessage(t, db, channelID, &rootID, "testuser", "Reply message")

	// Reload MemDB to pick up data
	reloadMemDB(t, srv, db)

	sess := testSession(srv)

	t.Run("list root messages", func(t *testing.T) {
		msg := &protocol.ListMessagesMessage{
			ChannelID:    uint64(channelID),
			SubchannelID: nil,
			ParentID:     nil,
			Limit:        10,
			BeforeID:     nil,
		}

		frame, err := encodeListMessagesMessage(msg)
		if err != nil {
			t.Fatalf("Failed to encode message: %v", err)
		}

		err = srv.handleListMessages(sess, frame)
		if err != nil {
			t.Fatalf("handleListMessages failed: %v", err)
		}
	})

	t.Run("list thread replies", func(t *testing.T) {
		parentID := uint64(rootID)
		msg := &protocol.ListMessagesMessage{
			ChannelID:    uint64(channelID),
			SubchannelID: nil,
			ParentID:     &parentID,
			Limit:        10,
			BeforeID:     nil,
		}

		frame, err := encodeListMessagesMessage(msg)
		if err != nil {
			t.Fatalf("Failed to encode message: %v", err)
		}

		err = srv.handleListMessages(sess, frame)
		if err != nil {
			t.Fatalf("handleListMessages failed: %v", err)
		}
	})
}

func TestConvertDBMessageToProtocol(t *testing.T) {
	srv, db := testServer(t)
	defer db.Close()

	now := time.Now().UnixMilli()
	dbMsg := &database.Message{
		ID:             1,
		ChannelID:      1,
		SubchannelID:   nil,
		ParentID:       nil,
		ThreadRootID:   nil,
		AuthorUserID:   nil,
		AuthorNickname: "testuser",
		Content:        "Test message",
		CreatedAt:      now,
		EditedAt:       nil,
		DeletedAt:      nil,
	}

	protoMsg := convertDBMessageToProtocol(dbMsg, srv.db)

	if protoMsg.ID != 1 {
		t.Errorf("Expected ID 1, got %d", protoMsg.ID)
	}
	if protoMsg.AuthorNickname != "~testuser" {
		t.Errorf("Expected AuthorNickname '~testuser', got '%s'", protoMsg.AuthorNickname)
	}
	if protoMsg.Content != "Test message" {
		t.Errorf("Expected Content 'Test message', got '%s'", protoMsg.Content)
	}
}

// encodeSubscribeThreadMessage helper
func encodeSubscribeThreadMessage(msg *protocol.SubscribeThreadMessage) (*protocol.Frame, error) {
	var buf bytes.Buffer
	if err := msg.EncodeTo(&buf); err != nil {
		return nil, err
	}
	return &protocol.Frame{
		Version: protocol.ProtocolVersion,
		Type:    protocol.TypeSubscribeThread,
		Flags:   0,
		Payload: buf.Bytes(),
	}, nil
}

// encodeUnsubscribeThreadMessage helper
func encodeUnsubscribeThreadMessage(msg *protocol.UnsubscribeThreadMessage) (*protocol.Frame, error) {
	var buf bytes.Buffer
	if err := msg.EncodeTo(&buf); err != nil {
		return nil, err
	}
	return &protocol.Frame{
		Version: protocol.ProtocolVersion,
		Type:    protocol.TypeUnsubscribeThread,
		Flags:   0,
		Payload: buf.Bytes(),
	}, nil
}

// encodeSubscribeChannelMessage helper
func encodeSubscribeChannelMessage(msg *protocol.SubscribeChannelMessage) (*protocol.Frame, error) {
	var buf bytes.Buffer
	if err := msg.EncodeTo(&buf); err != nil {
		return nil, err
	}
	return &protocol.Frame{
		Version: protocol.ProtocolVersion,
		Type:    protocol.TypeSubscribeChannel,
		Flags:   0,
		Payload: buf.Bytes(),
	}, nil
}

// encodeUnsubscribeChannelMessage helper
func encodeUnsubscribeChannelMessage(msg *protocol.UnsubscribeChannelMessage) (*protocol.Frame, error) {
	var buf bytes.Buffer
	if err := msg.EncodeTo(&buf); err != nil {
		return nil, err
	}
	return &protocol.Frame{
		Version: protocol.ProtocolVersion,
		Type:    protocol.TypeUnsubscribeChannel,
		Flags:   0,
		Payload: buf.Bytes(),
	}, nil
}

// encodeLeaveChannelMessage helper
func encodeLeaveChannelMessage() (*protocol.Frame, error) {
	// LeaveChannel has no payload
	return &protocol.Frame{
		Version: protocol.ProtocolVersion,
		Type:    protocol.TypeLeaveChannel,
		Flags:   0,
		Payload: []byte{},
	}, nil
}

// encodeDisconnectMessage helper
func encodeDisconnectMessage(msg *protocol.DisconnectMessage) (*protocol.Frame, error) {
	var buf bytes.Buffer
	if err := msg.EncodeTo(&buf); err != nil {
		return nil, err
	}
	return &protocol.Frame{
		Version: protocol.ProtocolVersion,
		Type:    protocol.TypeDisconnect,
		Flags:   0,
		Payload: buf.Bytes(),
	}, nil
}

func TestHandleSubscribeThread(t *testing.T) {
	srv, db := testServer(t)
	defer db.Close()

	// Create test channel and thread
	channelID := createTestChannel(t, db, "general", "General")
	threadID := postTestMessage(t, db, channelID, nil, "testuser", "Thread root")

	// Reload MemDB to pick up data
	reloadMemDB(t, srv, db)

	sess := testSession(srv)

	t.Run("subscribe to valid thread", func(t *testing.T) {
		msg := &protocol.SubscribeThreadMessage{
			ThreadID: uint64(threadID),
		}

		frame, err := encodeSubscribeThreadMessage(msg)
		if err != nil {
			t.Fatalf("Failed to encode message: %v", err)
		}

		err = srv.handleSubscribeThread(sess, frame)
		if err != nil {
			t.Fatalf("handleSubscribeThread failed: %v", err)
		}

		// Verify subscription was added
		if _, ok := sess.IsSubscribedToThread(uint64(threadID)); !ok {
			t.Error("Session should be subscribed to thread")
		}
	})

	t.Run("subscribe to non-existent thread fails", func(t *testing.T) {
		msg := &protocol.SubscribeThreadMessage{
			ThreadID: 999,
		}

		frame, err := encodeSubscribeThreadMessage(msg)
		if err != nil {
			t.Fatalf("Failed to encode message: %v", err)
		}

		err = srv.handleSubscribeThread(sess, frame)
		if err != nil {
			t.Errorf("Handler should not return error, got: %v", err)
		}
		// Should send error response to client
	})

	t.Run("subscription limit enforced", func(t *testing.T) {
		// Create multiple threads and subscribe to max limit
		for i := 0; i < int(srv.config.MaxThreadSubscriptions); i++ {
			tid := postTestMessage(t, db, channelID, nil, "testuser", "Thread "+string(rune('A'+i)))
			reloadMemDB(t, srv, db)

			msg := &protocol.SubscribeThreadMessage{
				ThreadID: uint64(tid),
			}

			frame, err := encodeSubscribeThreadMessage(msg)
			if err != nil {
				t.Fatalf("Failed to encode message: %v", err)
			}

			err = srv.handleSubscribeThread(sess, frame)
			if err != nil {
				t.Fatalf("handleSubscribeThread failed on subscription %d: %v", i+1, err)
			}
		}

		// Try to subscribe to one more (should fail)
		tid := postTestMessage(t, db, channelID, nil, "testuser", "Extra thread")
		reloadMemDB(t, srv, db)

		msg := &protocol.SubscribeThreadMessage{
			ThreadID: uint64(tid),
		}

		frame, err := encodeSubscribeThreadMessage(msg)
		if err != nil {
			t.Fatalf("Failed to encode message: %v", err)
		}

		err = srv.handleSubscribeThread(sess, frame)
		if err != nil {
			t.Errorf("Handler should not return error, got: %v", err)
		}
		// Should send error response about limit exceeded
	})
}

func TestHandleUnsubscribeThread(t *testing.T) {
	srv, db := testServer(t)
	defer db.Close()

	// Create test channel and thread
	channelID := createTestChannel(t, db, "general", "General")
	threadID := postTestMessage(t, db, channelID, nil, "testuser", "Thread root")

	// Reload MemDB to pick up data
	reloadMemDB(t, srv, db)

	sess := testSession(srv)

	t.Run("unsubscribe from subscribed thread", func(t *testing.T) {
		// First subscribe
		subscribeMsg := &protocol.SubscribeThreadMessage{
			ThreadID: uint64(threadID),
		}
		subscribeFrame, err := encodeSubscribeThreadMessage(subscribeMsg)
		if err != nil {
			t.Fatalf("Failed to encode subscribe message: %v", err)
		}
		err = srv.handleSubscribeThread(sess, subscribeFrame)
		if err != nil {
			t.Fatalf("handleSubscribeThread failed: %v", err)
		}

		// Now unsubscribe
		msg := &protocol.UnsubscribeThreadMessage{
			ThreadID: uint64(threadID),
		}

		frame, err := encodeUnsubscribeThreadMessage(msg)
		if err != nil {
			t.Fatalf("Failed to encode message: %v", err)
		}

		err = srv.handleUnsubscribeThread(sess, frame)
		if err != nil {
			t.Fatalf("handleUnsubscribeThread failed: %v", err)
		}

		// Verify subscription was removed
		if _, ok := sess.IsSubscribedToThread(uint64(threadID)); ok {
			t.Error("Session should not be subscribed to thread")
		}
	})

	t.Run("unsubscribe from non-subscribed thread (idempotent)", func(t *testing.T) {
		msg := &protocol.UnsubscribeThreadMessage{
			ThreadID: 999,
		}

		frame, err := encodeUnsubscribeThreadMessage(msg)
		if err != nil {
			t.Fatalf("Failed to encode message: %v", err)
		}

		err = srv.handleUnsubscribeThread(sess, frame)
		if err != nil {
			t.Fatalf("handleUnsubscribeThread failed: %v", err)
		}
		// Should succeed (idempotent)
	})
}

func TestHandleSubscribeChannel(t *testing.T) {
	srv, db := testServer(t)
	defer db.Close()

	// Create test channel
	channelID := createTestChannel(t, db, "general", "General")

	// Reload MemDB to pick up channel
	reloadMemDB(t, srv, db)

	sess := testSession(srv)

	t.Run("subscribe to valid channel", func(t *testing.T) {
		msg := &protocol.SubscribeChannelMessage{
			ChannelID:    uint64(channelID),
			SubchannelID: nil,
		}

		frame, err := encodeSubscribeChannelMessage(msg)
		if err != nil {
			t.Fatalf("Failed to encode message: %v", err)
		}

		err = srv.handleSubscribeChannel(sess, frame)
		if err != nil {
			t.Fatalf("handleSubscribeChannel failed: %v", err)
		}

		// Verify subscription was added
		channelSub := ChannelSubscription{
			ChannelID:    uint64(channelID),
			SubchannelID: nil,
		}
		if !sess.IsSubscribedToChannel(channelSub) {
			t.Error("Session should be subscribed to channel")
		}
	})

	t.Run("subscribe to non-existent channel fails", func(t *testing.T) {
		msg := &protocol.SubscribeChannelMessage{
			ChannelID:    999,
			SubchannelID: nil,
		}

		frame, err := encodeSubscribeChannelMessage(msg)
		if err != nil {
			t.Fatalf("Failed to encode message: %v", err)
		}

		err = srv.handleSubscribeChannel(sess, frame)
		if err != nil {
			t.Errorf("Handler should not return error, got: %v", err)
		}
		// Should send error response to client
	})

	t.Run("subscription limit enforced", func(t *testing.T) {
		// Create a new session for this test to avoid conflicts
		sess2 := testSession(srv)

		// Create multiple channels upfront
		channelIDs := make([]int64, int(srv.config.MaxChannelSubscriptions)+1)
		for i := 0; i < int(srv.config.MaxChannelSubscriptions)+1; i++ {
			channelIDs[i] = createTestChannel(t, db, fmt.Sprintf("chan%d", i), fmt.Sprintf("Channel %d", i))
		}
		// Reload once to pick up all channels
		reloadMemDB(t, srv, db)

		// Re-create session after reload
		sess2 = testSession(srv)

		// Subscribe to max limit
		for i := 0; i < int(srv.config.MaxChannelSubscriptions); i++ {
			msg := &protocol.SubscribeChannelMessage{
				ChannelID:    uint64(channelIDs[i]),
				SubchannelID: nil,
			}

			frame, err := encodeSubscribeChannelMessage(msg)
			if err != nil {
				t.Fatalf("Failed to encode message: %v", err)
			}

			err = srv.handleSubscribeChannel(sess2, frame)
			if err != nil {
				t.Fatalf("handleSubscribeChannel failed on subscription %d: %v", i+1, err)
			}
		}

		// Try to subscribe to one more (should fail)
		msg := &protocol.SubscribeChannelMessage{
			ChannelID:    uint64(channelIDs[srv.config.MaxChannelSubscriptions]),
			SubchannelID: nil,
		}

		frame, err := encodeSubscribeChannelMessage(msg)
		if err != nil {
			t.Fatalf("Failed to encode message: %v", err)
		}

		err = srv.handleSubscribeChannel(sess2, frame)
		if err != nil {
			t.Errorf("Handler should not return error, got: %v", err)
		}
		// Should send error response about limit exceeded
	})
}

func TestHandleUnsubscribeChannel(t *testing.T) {
	srv, db := testServer(t)
	defer db.Close()

	// Create test channel
	channelID := createTestChannel(t, db, "general", "General")

	// Reload MemDB to pick up channel
	reloadMemDB(t, srv, db)

	sess := testSession(srv)

	t.Run("unsubscribe from subscribed channel", func(t *testing.T) {
		// First subscribe
		subscribeMsg := &protocol.SubscribeChannelMessage{
			ChannelID:    uint64(channelID),
			SubchannelID: nil,
		}
		subscribeFrame, err := encodeSubscribeChannelMessage(subscribeMsg)
		if err != nil {
			t.Fatalf("Failed to encode subscribe message: %v", err)
		}
		err = srv.handleSubscribeChannel(sess, subscribeFrame)
		if err != nil {
			t.Fatalf("handleSubscribeChannel failed: %v", err)
		}

		// Now unsubscribe
		msg := &protocol.UnsubscribeChannelMessage{
			ChannelID:    uint64(channelID),
			SubchannelID: nil,
		}

		frame, err := encodeUnsubscribeChannelMessage(msg)
		if err != nil {
			t.Fatalf("Failed to encode message: %v", err)
		}

		err = srv.handleUnsubscribeChannel(sess, frame)
		if err != nil {
			t.Fatalf("handleUnsubscribeChannel failed: %v", err)
		}

		// Verify subscription was removed
		channelSub := ChannelSubscription{
			ChannelID:    uint64(channelID),
			SubchannelID: nil,
		}
		if sess.IsSubscribedToChannel(channelSub) {
			t.Error("Session should not be subscribed to channel")
		}
	})

	t.Run("unsubscribe from non-subscribed channel (idempotent)", func(t *testing.T) {
		msg := &protocol.UnsubscribeChannelMessage{
			ChannelID:    999,
			SubchannelID: nil,
		}

		frame, err := encodeUnsubscribeChannelMessage(msg)
		if err != nil {
			t.Fatalf("Failed to encode message: %v", err)
		}

		err = srv.handleUnsubscribeChannel(sess, frame)
		if err != nil {
			t.Fatalf("handleUnsubscribeChannel failed: %v", err)
		}
		// Should succeed (idempotent)
	})
}

func TestHandleLeaveChannel(t *testing.T) {
	srv, db := testServer(t)
	defer db.Close()

	// Create test channel
	channelID := createTestChannel(t, db, "general", "General")

	// Reload MemDB to pick up channel
	reloadMemDB(t, srv, db)

	sess := testSession(srv)

	t.Run("leave channel when joined", func(t *testing.T) {
		// First join the channel
		cid := int64(channelID)
		err := srv.sessions.SetJoinedChannel(sess.ID, &cid)
		if err != nil {
			t.Fatalf("SetJoinedChannel failed: %v", err)
		}

		// Now leave
		frame, err := encodeLeaveChannelMessage()
		if err != nil {
			t.Fatalf("Failed to encode message: %v", err)
		}

		err = srv.handleLeaveChannel(sess, frame)
		if err != nil {
			t.Fatalf("handleLeaveChannel failed: %v", err)
		}

		// Verify channel was left
		sess.mu.RLock()
		joinedChannel := sess.JoinedChannel
		sess.mu.RUnlock()

		if joinedChannel != nil {
			t.Error("Session should not have a joined channel")
		}
	})

	t.Run("leave when not in channel", func(t *testing.T) {
		// Create new session not in any channel
		sess2 := testSession(srv)

		frame, err := encodeLeaveChannelMessage()
		if err != nil {
			t.Fatalf("Failed to encode message: %v", err)
		}

		err = srv.handleLeaveChannel(sess2, frame)
		if err != nil {
			t.Fatalf("handleLeaveChannel failed: %v", err)
		}
		// Should succeed even if not in a channel
	})
}

func TestHandleDisconnect(t *testing.T) {
	srv, db := testServer(t)
	defer db.Close()

	sess := testSession(srv)
	sessionID := sess.ID

	t.Run("disconnect removes session", func(t *testing.T) {
		msg := &protocol.DisconnectMessage{}
		frame, err := encodeDisconnectMessage(msg)
		if err != nil {
			t.Fatalf("Failed to encode message: %v", err)
		}

		err = srv.handleDisconnect(sess, frame)
		if err == nil {
			t.Error("Expected error (ErrClientDisconnecting), got nil")
		}

		// Verify session was removed
		if _, ok := srv.sessions.GetSession(sessionID); ok {
			t.Error("Session should have been removed")
		}
	})
}

func TestBroadcastToChannel(t *testing.T) {
	srv, db := testServer(t)
	defer db.Close()

	// Create test channel
	channelID := createTestChannel(t, db, "general", "General")

	// Reload MemDB to pick up channel
	reloadMemDB(t, srv, db)

	t.Run("broadcast to joined channel subscribers", func(t *testing.T) {
		// Create multiple sessions joined to the channel
		var sessions []*Session
		for i := 0; i < 3; i++ {
			sess := testSession(srv)
			cid := int64(channelID)
			srv.sessions.SetJoinedChannel(sess.ID, &cid)
			sessions = append(sessions, sess)
		}

		// Broadcast a message
		now := time.Now()
		testMsg := &protocol.NewMessageMessage{
			ID:             123,
			ChannelID:      uint64(channelID),
			SubchannelID:   nil,
			ParentID:       nil,
			AuthorUserID:   nil,
			AuthorNickname: "~testuser",
			Content:        "Test broadcast",
			CreatedAt:      now,
			EditedAt:       nil,
			ReplyCount:     0,
		}

		err := srv.broadcastToChannel(int64(channelID), protocol.TypeNewMessage, testMsg)
		if err != nil {
			t.Fatalf("broadcastToChannel failed: %v", err)
		}

		// Verify all sessions received the message
		for i, sess := range sessions {
			mockConn := sess.Conn.conn.(*mockConn)
			if mockConn.writeBuf.Len() == 0 {
				t.Errorf("Session %d did not receive broadcast", i)
			}
		}
	})

	t.Run("broadcast to channel subscribers", func(t *testing.T) {
		// Create session subscribed to channel (but not joined)
		sess := testSession(srv)
		channelSub := ChannelSubscription{
			ChannelID:    uint64(channelID),
			SubchannelID: nil,
		}
		srv.sessions.SubscribeToChannel(sess, channelSub)

		// Clear write buffer
		mockConn := sess.Conn.conn.(*mockConn)
		mockConn.writeBuf.Reset()

		// Broadcast a message
		now := time.Now()
		testMsg := &protocol.NewMessageMessage{
			ID:             124,
			ChannelID:      uint64(channelID),
			SubchannelID:   nil,
			ParentID:       nil,
			AuthorUserID:   nil,
			AuthorNickname: "~testuser",
			Content:        "Test broadcast to subscribers",
			CreatedAt:      now,
			EditedAt:       nil,
			ReplyCount:     0,
		}

		err := srv.broadcastToChannel(int64(channelID), protocol.TypeNewMessage, testMsg)
		if err != nil {
			t.Fatalf("broadcastToChannel failed: %v", err)
		}

		// Verify session received the message
		if mockConn.writeBuf.Len() == 0 {
			t.Error("Subscribed session did not receive broadcast")
		}
	})
}

func TestBroadcastNewMessage(t *testing.T) {
	srv, db := testServer(t)
	defer db.Close()

	// Create test channel and messages
	channelID := createTestChannel(t, db, "general", "General")
	threadID := postTestMessage(t, db, channelID, nil, "testuser", "Thread root")

	// Reload MemDB to pick up data
	reloadMemDB(t, srv, db)

	t.Run("broadcast to thread subscribers", func(t *testing.T) {
		// Create session subscribed to thread
		sess := testSession(srv)
		channelSub := ChannelSubscription{
			ChannelID:    uint64(channelID),
			SubchannelID: nil,
		}
		srv.sessions.SubscribeToThread(sess, uint64(threadID), channelSub)

		// Clear write buffer
		mockConn := sess.Conn.conn.(*mockConn)
		mockConn.writeBuf.Reset()

		// Post a reply to the thread
		replyID := postTestMessage(t, db, channelID, &threadID, "testuser", "Reply to thread")

		// Get the message directly from DB (don't reload MemDB to preserve subscriptions!)
		dbMsg, err := db.GetMessage(uint64(replyID))
		if err != nil {
			t.Fatalf("Failed to get message: %v", err)
		}

		// Convert to protocol message (need to create a temporary message for conversion)
		protoMsg := &protocol.NewMessageMessage{
			ID:             uint64(replyID),
			ChannelID:      uint64(channelID),
			SubchannelID:   nil,
			ParentID:       func() *uint64 { id := uint64(threadID); return &id }(),
			AuthorUserID:   nil,
			AuthorNickname: "~testuser",
			Content:        dbMsg.Content,
			CreatedAt:      time.Unix(dbMsg.CreatedAt, 0),
			EditedAt:       nil,
			ReplyCount:     0,
		}
		threadRootIDUint := uint64(threadID)

		// Broadcast the new message
		err = srv.broadcastNewMessage(protoMsg, &threadRootIDUint)
		if err != nil {
			t.Fatalf("broadcastNewMessage failed: %v", err)
		}

		// Verify session received the message
		if mockConn.writeBuf.Len() == 0 {
			t.Error("Thread subscriber did not receive new message broadcast")
		}
	})

	t.Run("broadcast to channel subscribers for root message", func(t *testing.T) {
		// Create session subscribed to channel
		sess := testSession(srv)
		channelSub := ChannelSubscription{
			ChannelID:    uint64(channelID),
			SubchannelID: nil,
		}
		srv.sessions.SubscribeToChannel(sess, channelSub)

		// Clear write buffer
		mockConn := sess.Conn.conn.(*mockConn)
		mockConn.writeBuf.Reset()

		// Post a root message
		rootID := postTestMessage(t, db, channelID, nil, "testuser", "New root message")

		// Get the message directly from DB (don't reload MemDB to preserve subscriptions!)
		msg, err := db.GetMessage(uint64(rootID))
		if err != nil {
			t.Fatalf("Failed to get message: %v", err)
		}

		// Convert to protocol message and broadcast
		protoMsg := &protocol.NewMessageMessage{
			ID:             uint64(rootID),
			ChannelID:      uint64(channelID),
			SubchannelID:   nil,
			ParentID:       nil,
			AuthorUserID:   nil,
			AuthorNickname: "~testuser",
			Content:        msg.Content,
			CreatedAt:      time.Unix(msg.CreatedAt, 0),
			EditedAt:       nil,
			ReplyCount:     0,
		}
		err = srv.broadcastNewMessage(protoMsg, nil)
		if err != nil {
			t.Fatalf("broadcastNewMessage failed: %v", err)
		}

		// Verify session received the message
		if mockConn.writeBuf.Len() == 0 {
			t.Error("Channel subscriber did not receive new root message broadcast")
		}
	})
}
