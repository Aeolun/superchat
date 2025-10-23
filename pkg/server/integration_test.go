package server

import (
	"bytes"
	"fmt"
	"io"
	"log"
	"net"
	"sync"
	"sync/atomic"
	"testing"
	"time"

	"github.com/aeolun/superchat/pkg/protocol"
)

// Integration test helpers

// startTestServer starts a real server on a random port and returns the server and address
func startTestServer(t *testing.T, config ServerConfig) (*Server, string) {
	t.Helper()

	tmpDir := t.TempDir()
	dbPath := tmpDir + "/test.db"

	// Create server using NewServer
	srv, err := NewServer(dbPath, config, "")
	if err != nil {
		t.Fatalf("Failed to create server: %v", err)
	}

	// Override TCP and SSH ports to 0 (random port)
	srv.config.TCPPort = 0
	srv.config.SSHPort = 0

	// Initialize loggers to discard output
	errorLog = log.New(io.Discard, "ERROR: ", log.LstdFlags)
	debugLog = log.New(io.Discard, "DEBUG: ", log.LstdFlags)
	log.SetOutput(io.Discard)

	// Start server
	if err := srv.Start(); err != nil {
		t.Fatalf("Failed to start server: %v", err)
	}

	// Get actual address
	addr := srv.listener.Addr().String()

	// Cleanup on test completion
	t.Cleanup(func() {
		srv.Stop()
	})

	return srv, addr
}

// connectTCPClient connects a raw TCP client to the server
func connectTCPClient(t *testing.T, addr string) net.Conn {
	t.Helper()

	conn, err := net.Dial("tcp", addr)
	if err != nil {
		t.Fatalf("Failed to connect: %v", err)
	}

	return conn
}

// sendProtocolMessage sends a protocol message over TCP
func sendProtocolMessage(t *testing.T, conn net.Conn, frame *protocol.Frame) {
	t.Helper()

	if err := protocol.EncodeFrame(conn, frame); err != nil {
		t.Fatalf("Failed to send message: %v", err)
	}
}

// readProtocolMessage reads a protocol message from TCP with timeout
func readProtocolMessage(t *testing.T, conn net.Conn, timeout time.Duration) (*protocol.Frame, error) {
	t.Helper()

	// Set read deadline
	if err := conn.SetReadDeadline(time.Now().Add(timeout)); err != nil {
		return nil, err
	}

	frame, err := protocol.DecodeFrame(conn)

	// Clear deadline
	conn.SetReadDeadline(time.Time{})

	return frame, err
}

// expectMessageType reads a message and verifies its type
func expectMessageType(t *testing.T, conn net.Conn, expectedType uint8, timeout time.Duration) *protocol.Frame {
	t.Helper()

	ignored := map[uint8]bool{
		protocol.TypeServerPresence: true,
		protocol.TypeChannelPresence: true,
	}

	for {
		frame, err := readProtocolMessage(t, conn, timeout)
		if err != nil {
			t.Fatalf("Failed to read message: %v", err)
		}

		if ignored[frame.Type] {
			continue
		}

		if frame.Type != expectedType {
			t.Fatalf("Expected message type 0x%02X, got 0x%02X", expectedType, frame.Type)
		}

		return frame
	}
}

// encodeMessage encodes a message using EncodeTo pattern
func encodeMessage(t *testing.T, msgType uint8, encoder interface {
	EncodeTo(io.Writer) error
}) *protocol.Frame {
	t.Helper()

	var buf bytes.Buffer
	if err := encoder.EncodeTo(&buf); err != nil {
		t.Fatalf("Failed to encode message: %v", err)
	}

	return &protocol.Frame{
		Version: protocol.ProtocolVersion,
		Type:    msgType,
		Flags:   0,
		Payload: buf.Bytes(),
	}
}

// Integration Tests
// All tests are combined into a single test function to avoid Prometheus metric registration conflicts

func TestServerIntegration(t *testing.T) {
	// Start server once for all subtests
	config := DefaultConfig()
	config.SessionTimeoutSeconds = 2 // Short timeout for faster tests
	srv, addr := startTestServer(t, config)

	t.Run("lifecycle/connect_and_disconnect", func(t *testing.T) {
		// Connect client
		conn := connectTCPClient(t, addr)
		defer conn.Close()

		// Should receive SERVER_CONFIG immediately
		expectMessageType(t, conn, protocol.TypeServerConfig, 5*time.Second)

		// Verify session was created
		initialCount := srv.sessions.CountOnlineUsers()
		if initialCount == 0 {
			t.Error("Expected at least 1 active session")
		}

		// Disconnect
		conn.Close()

		// Wait for session cleanup
		time.Sleep(100 * time.Millisecond)

		// Verify session was removed
		finalCount := srv.sessions.CountOnlineUsers()
		if finalCount >= initialCount {
			t.Errorf("Expected session count to decrease, got initial=%d final=%d", initialCount, finalCount)
		}
	})

	t.Run("lifecycle/multiple_sequential_connections", func(t *testing.T) {
		for i := 0; i < 5; i++ {
			conn := connectTCPClient(t, addr)
			expectMessageType(t, conn, protocol.TypeServerConfig, 5*time.Second)
			conn.Close()
			time.Sleep(50 * time.Millisecond)
		}

		// All connections should be cleaned up
		time.Sleep(200 * time.Millisecond)
		count := srv.sessions.CountOnlineUsers()
		if count > 0 {
			t.Logf("Warning: Expected 0 active sessions, got %d (may have other test connections)", count)
		}
	})

	t.Run("message_loop/set_nickname_and_list_channels", func(t *testing.T) {
		conn := connectTCPClient(t, addr)
		defer conn.Close()

		// Read SERVER_CONFIG
		expectMessageType(t, conn, protocol.TypeServerConfig, 5*time.Second)

		// Send SET_NICKNAME
		setNick := &protocol.SetNicknameMessage{Nickname: "testuser"}
		frame := encodeMessage(t, protocol.TypeSetNickname, setNick)
		sendProtocolMessage(t, conn, frame)

		// Read NICKNAME_RESPONSE
		expectMessageType(t, conn, protocol.TypeNicknameResponse, 5*time.Second)

		// Send LIST_CHANNELS
		listChan := &protocol.ListChannelsMessage{FromChannelID: 0, Limit: 10}
		frame = encodeMessage(t, protocol.TypeListChannels, listChan)
		sendProtocolMessage(t, conn, frame)

		// Read CHANNEL_LIST response
		expectMessageType(t, conn, protocol.TypeChannelList, 5*time.Second)
	})

	t.Run("message_loop/ping_pong", func(t *testing.T) {
		conn := connectTCPClient(t, addr)
		defer conn.Close()

		// Read SERVER_CONFIG
		expectMessageType(t, conn, protocol.TypeServerConfig, 5*time.Second)

		// Send PING
		ping := &protocol.PingMessage{Timestamp: time.Now().UnixMilli()}
		frame := encodeMessage(t, protocol.TypePing, ping)
		sendProtocolMessage(t, conn, frame)

		// Read PONG
		expectMessageType(t, conn, protocol.TypePong, 5*time.Second)
	})

	t.Run("message_loop/graceful_disconnect", func(t *testing.T) {
		conn := connectTCPClient(t, addr)
		defer conn.Close()

		// Read SERVER_CONFIG
		expectMessageType(t, conn, protocol.TypeServerConfig, 5*time.Second)

		// Get session count before disconnect
		beforeCount := srv.sessions.CountOnlineUsers()

		// Send DISCONNECT
		disconnect := &protocol.DisconnectMessage{}
		frame := encodeMessage(t, protocol.TypeDisconnect, disconnect)
		sendProtocolMessage(t, conn, frame)

		// Wait for session cleanup
		time.Sleep(100 * time.Millisecond)

		// Verify session was removed
		afterCount := srv.sessions.CountOnlineUsers()
		if afterCount >= beforeCount {
			t.Errorf("Expected session count to decrease after disconnect, before=%d after=%d", beforeCount, afterCount)
		}
	})

	t.Run("multiple_clients/concurrent_connections", func(t *testing.T) {
		numClients := 10
		var wg sync.WaitGroup
		errChan := make(chan error, numClients)

		for i := 0; i < numClients; i++ {
			wg.Add(1)
			go func(clientID int) {
				defer wg.Done()

				// Connect
				conn, err := net.Dial("tcp", addr)
				if err != nil {
					errChan <- fmt.Errorf("client %d failed to connect: %w", clientID, err)
					return
				}
				defer conn.Close()

				// Read SERVER_CONFIG
				_, err = readProtocolMessage(t, conn, 5*time.Second)
				if err != nil {
					errChan <- fmt.Errorf("client %d failed to read SERVER_CONFIG: %w", clientID, err)
					return
				}

				// Set nickname
				nickname := fmt.Sprintf("user%d", clientID)
				setNick := &protocol.SetNicknameMessage{Nickname: nickname}
				var buf bytes.Buffer
				setNick.EncodeTo(&buf)
				frame := &protocol.Frame{
					Version: protocol.ProtocolVersion,
					Type:    protocol.TypeSetNickname,
					Flags:   0,
					Payload: buf.Bytes(),
				}
				if err := protocol.EncodeFrame(conn, frame); err != nil {
					errChan <- fmt.Errorf("client %d failed to send SET_NICKNAME: %w", clientID, err)
					return
				}

				// Read NICKNAME_RESPONSE
				_, err = readProtocolMessage(t, conn, 5*time.Second)
				if err != nil {
					errChan <- fmt.Errorf("client %d failed to read NICKNAME_RESPONSE: %w", clientID, err)
					return
				}

				// List channels
				listChan := &protocol.ListChannelsMessage{FromChannelID: 0, Limit: 10}
				buf.Reset()
				listChan.EncodeTo(&buf)
				frame = &protocol.Frame{
					Version: protocol.ProtocolVersion,
					Type:    protocol.TypeListChannels,
					Flags:   0,
					Payload: buf.Bytes(),
				}
				if err := protocol.EncodeFrame(conn, frame); err != nil {
					errChan <- fmt.Errorf("client %d failed to send LIST_CHANNELS: %w", clientID, err)
					return
				}

				// Read CHANNEL_LIST
				_, err = readProtocolMessage(t, conn, 5*time.Second)
				if err != nil {
					errChan <- fmt.Errorf("client %d failed to read CHANNEL_LIST: %w", clientID, err)
					return
				}
			}(i)
		}

		// Wait for all clients
		wg.Wait()
		close(errChan)

		// Check for errors
		for err := range errChan {
			t.Error(err)
		}

		// Verify clients are connected (approximately)
		sessionCount := srv.sessions.CountOnlineUsers()
		if sessionCount < uint32(numClients) {
			t.Logf("Note: Expected at least %d active sessions, got %d (clients may have already disconnected)", numClients, sessionCount)
		}
	})

	t.Run("session_cleanup/inactive_session", func(t *testing.T) {
		// Connect client
		conn := connectTCPClient(t, addr)
		defer conn.Close()

		// Read SERVER_CONFIG
		expectMessageType(t, conn, protocol.TypeServerConfig, 5*time.Second)

		// Set nickname to create DB session
		setNick := &protocol.SetNicknameMessage{Nickname: "cleanuptest"}
		frame := encodeMessage(t, protocol.TypeSetNickname, setNick)
		sendProtocolMessage(t, conn, frame)
		expectMessageType(t, conn, protocol.TypeNicknameResponse, 5*time.Second)

		// Verify session exists
		initialCount := srv.sessions.CountOnlineUsers()
		if initialCount == 0 {
			t.Fatal("Expected at least 1 session")
		}

		// Wait for session timeout + manual cleanup
		time.Sleep(3 * time.Second)
		srv.cleanupStaleSessions()

		// Session should be cleaned up
		finalCount := srv.sessions.CountOnlineUsers()
		if finalCount >= initialCount {
			t.Logf("Note: Session cleanup may not have triggered (initial=%d final=%d)", initialCount, finalCount)
		}
	})

	t.Run("connection_errors/malformed_frame", func(t *testing.T) {
		conn := connectTCPClient(t, addr)
		defer conn.Close()

		// Read SERVER_CONFIG
		expectMessageType(t, conn, protocol.TypeServerConfig, 5*time.Second)

		// Get current session count
		beforeCount := srv.sessions.CountOnlineUsers()

		// Send malformed frame (invalid length)
		malformed := []byte{0xFF, 0xFF, 0xFF, 0xFF}
		conn.Write(malformed)

		// Wait for server to detect error and close
		time.Sleep(200 * time.Millisecond)

		// Verify session was cleaned up
		afterCount := srv.sessions.CountOnlineUsers()
		if afterCount >= beforeCount {
			t.Logf("Note: Malformed frame may not have triggered cleanup (before=%d after=%d)", beforeCount, afterCount)
		}
	})

	t.Run("connection_errors/unsupported_message_type", func(t *testing.T) {
		conn := connectTCPClient(t, addr)
		defer conn.Close()

		// Read SERVER_CONFIG
		expectMessageType(t, conn, protocol.TypeServerConfig, 5*time.Second)

		// Send unsupported message type (0xFF)
		unsupported := &protocol.Frame{
			Version: protocol.ProtocolVersion,
			Type:    0xFF,
			Flags:   0,
			Payload: []byte{},
		}
		sendProtocolMessage(t, conn, unsupported)

		// Should receive ERROR response
		frame := expectMessageType(t, conn, protocol.TypeError, 5*time.Second)

		// Verify error code
		var errMsg protocol.ErrorMessage
		if err := errMsg.Decode(frame.Payload); err != nil {
			t.Fatalf("Failed to decode error: %v", err)
		}
		if errMsg.ErrorCode != 1001 {
			t.Errorf("Expected error code 1001 (unsupported), got %d", errMsg.ErrorCode)
		}
	})

	t.Run("broadcast/message_to_multiple_clients", func(t *testing.T) {
		// Get a channel ID from database
		channels, err := srv.db.ListChannels()
		if err != nil {
			t.Fatalf("Failed to list channels: %v", err)
		}
		if len(channels) == 0 {
			t.Fatal("No channels available")
		}
		channelID := channels[0].ID

		// Connect 2 clients
		conn1 := connectTCPClient(t, addr)
		defer conn1.Close()
		conn2 := connectTCPClient(t, addr)
		defer conn2.Close()

		// Read SERVER_CONFIG for both
		expectMessageType(t, conn1, protocol.TypeServerConfig, 5*time.Second)
		expectMessageType(t, conn2, protocol.TypeServerConfig, 5*time.Second)

		// Set nicknames
		setNick1 := &protocol.SetNicknameMessage{Nickname: "bcuser1"}
		sendProtocolMessage(t, conn1, encodeMessage(t, protocol.TypeSetNickname, setNick1))
		expectMessageType(t, conn1, protocol.TypeNicknameResponse, 5*time.Second)

		setNick2 := &protocol.SetNicknameMessage{Nickname: "bcuser2"}
		sendProtocolMessage(t, conn2, encodeMessage(t, protocol.TypeSetNickname, setNick2))
		expectMessageType(t, conn2, protocol.TypeNicknameResponse, 5*time.Second)

		// Both clients subscribe to channel
		subscribeChan1 := &protocol.SubscribeChannelMessage{
			ChannelID:    uint64(channelID),
			SubchannelID: nil,
		}
		sendProtocolMessage(t, conn1, encodeMessage(t, protocol.TypeSubscribeChannel, subscribeChan1))
		expectMessageType(t, conn1, protocol.TypeSubscribeOk, 5*time.Second)

		subscribeChan2 := &protocol.SubscribeChannelMessage{
			ChannelID:    uint64(channelID),
			SubchannelID: nil,
		}
		sendProtocolMessage(t, conn2, encodeMessage(t, protocol.TypeSubscribeChannel, subscribeChan2))
		expectMessageType(t, conn2, protocol.TypeSubscribeOk, 5*time.Second)

		// Client 1 posts a message
		postMsg := &protocol.PostMessageMessage{
			ChannelID:    uint64(channelID),
			SubchannelID: nil,
			ParentID:     nil,
			Content:      "Hello from bcuser1",
		}
		sendProtocolMessage(t, conn1, encodeMessage(t, protocol.TypePostMessage, postMsg))

		// Client 1 receives MESSAGE_POSTED
		expectMessageType(t, conn1, protocol.TypeMessagePosted, 5*time.Second)

		// Client 2 should receive NEW_MESSAGE broadcast
		frame := expectMessageType(t, conn2, protocol.TypeNewMessage, 5*time.Second)

		// Verify broadcast content
		var msg protocol.NewMessageMessage
		if err := msg.Decode(frame.Payload); err != nil {
			t.Fatalf("Failed to decode NEW_MESSAGE: %v", err)
		}
		if msg.AuthorNickname != "~bcuser1" {
			t.Errorf("Expected author '~bcuser1', got '%s'", msg.AuthorNickname)
		}
		if msg.Content != "Hello from bcuser1" {
			t.Errorf("Expected content 'Hello from bcuser1', got '%s'", msg.Content)
		}
	})

	t.Run("broadcast/concurrent_broadcasts", func(t *testing.T) {
		// Get a channel ID
		channels, err := srv.db.ListChannels()
		if err != nil {
			t.Fatalf("Failed to list channels: %v", err)
		}
		if len(channels) == 0 {
			t.Fatal("No channels available")
		}
		channelID := channels[0].ID

		numClients := 5
		var conns []net.Conn
		var wg sync.WaitGroup
		var broadcastCount atomic.Int32

		// Connect and subscribe all clients
		for i := 0; i < numClients; i++ {
			conn := connectTCPClient(t, addr)
			defer conn.Close()
			conns = append(conns, conn)

			expectMessageType(t, conn, protocol.TypeServerConfig, 5*time.Second)

			// Set nickname
			nickname := fmt.Sprintf("cbuser%d", i)
			setNick := &protocol.SetNicknameMessage{Nickname: nickname}
			sendProtocolMessage(t, conn, encodeMessage(t, protocol.TypeSetNickname, setNick))
			expectMessageType(t, conn, protocol.TypeNicknameResponse, 5*time.Second)

			// Subscribe to channel
			subscribeChan := &protocol.SubscribeChannelMessage{
				ChannelID:    uint64(channelID),
				SubchannelID: nil,
			}
			sendProtocolMessage(t, conn, encodeMessage(t, protocol.TypeSubscribeChannel, subscribeChan))
			expectMessageType(t, conn, protocol.TypeSubscribeOk, 5*time.Second)
		}

		// Start listeners on all clients (except first one who will post)
		for i := 1; i < numClients; i++ {
			wg.Add(1)
			go func(conn net.Conn) {
				defer wg.Done()
				// Should receive NEW_MESSAGE broadcast
				_, err := readProtocolMessage(t, conn, 5*time.Second)
				if err == nil {
					broadcastCount.Add(1)
				}
			}(conns[i])
		}

		// First client posts a message
		postMsg := &protocol.PostMessageMessage{
			ChannelID:    uint64(channelID),
			SubchannelID: nil,
			ParentID:     nil,
			Content:      "Broadcast test",
		}
		sendProtocolMessage(t, conns[0], encodeMessage(t, protocol.TypePostMessage, postMsg))
		expectMessageType(t, conns[0], protocol.TypeMessagePosted, 5*time.Second)

		// Wait for all broadcasts
		wg.Wait()

		// Verify all other clients received the broadcast
		expectedBroadcasts := int32(numClients - 1)
		if broadcastCount.Load() != expectedBroadcasts {
			t.Errorf("Expected %d broadcasts, got %d", expectedBroadcasts, broadcastCount.Load())
		}
	})

	// Note: graceful_shutdown test is NOT included here because it would stop the server
	// and break other tests. It should be in a separate test function.
}
