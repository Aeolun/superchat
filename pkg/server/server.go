package server

import (
	"fmt"
	"io"
	"log"
	"net"
	"sync"
	"time"

	"github.com/aeolun/superchat/pkg/database"
	"github.com/aeolun/superchat/pkg/protocol"
)

// Server represents the SuperChat server
type Server struct {
	db          *database.DB
	listener    net.Listener
	sshListener net.Listener
	sessions    *SessionManager
	config      ServerConfig
	configPath  string
	shutdown    chan struct{}
	wg          sync.WaitGroup
}

// ServerConfig holds server configuration
type ServerConfig struct {
	TCPPort               int
	SSHPort               int
	SSHHostKeyPath        string
	MaxConnectionsPerIP   uint8
	MessageRateLimit      uint16
	MaxChannelCreates     uint16
	InactiveCleanupDays   uint16
	MaxMessageLength      uint32
	SessionTimeoutSeconds int
	ProtocolVersion       uint8
}

// DefaultConfig returns default server configuration
func DefaultConfig() ServerConfig {
	return ServerConfig{
		TCPPort:               6465,
		SSHPort:               6466,
		SSHHostKeyPath:        "~/.superchat/ssh_host_key",
		MaxConnectionsPerIP:   10,
		MessageRateLimit:      10,   // per minute
		MaxChannelCreates:     5,    // per hour
		InactiveCleanupDays:   90,   // days
		MaxMessageLength:      4096, // bytes
		SessionTimeoutSeconds: 60,   // 60 seconds
		ProtocolVersion:       1,
	}
}

// NewServer creates a new server instance
func NewServer(dbPath string, config ServerConfig, configPath string) (*Server, error) {
	db, err := database.Open(dbPath)
	if err != nil {
		return nil, fmt.Errorf("failed to open database: %w", err)
	}

	// Seed default channels if they don't exist
	if err := db.SeedDefaultChannels(); err != nil {
		db.Close()
		return nil, fmt.Errorf("failed to seed channels: %w", err)
	}

	return &Server{
		db:         db,
		sessions:   NewSessionManager(db),
		config:     config,
		configPath: configPath,
		shutdown:   make(chan struct{}),
	}, nil
}

// Start starts the TCP and SSH servers
func (s *Server) Start() error {
	// Start TCP server
	addr := fmt.Sprintf(":%d", s.config.TCPPort)
	listener, err := net.Listen("tcp", addr)
	if err != nil {
		return fmt.Errorf("failed to listen on %s: %w", addr, err)
	}

	s.listener = listener
	log.Printf("TCP server listening on %s", addr)

	// Start SSH server
	if err := s.startSSHServer(); err != nil {
		s.listener.Close()
		return fmt.Errorf("failed to start SSH server: %w", err)
	}

	// Start session cleanup goroutine
	s.wg.Add(1)
	go s.sessionCleanupLoop()

	// Start message retention cleanup goroutine
	s.wg.Add(1)
	go s.retentionCleanupLoop()

	// Accept TCP connections
	s.wg.Add(1)
	go s.acceptLoop()

	return nil
}

// GetChannels returns the list of channels from the database
func (s *Server) GetChannels() ([]*database.Channel, error) {
	return s.db.ListChannels()
}

// Stop gracefully stops the server
func (s *Server) Stop() error {
	close(s.shutdown)

	if s.listener != nil {
		s.listener.Close()
		s.listener = nil
	}

	if s.sshListener != nil {
		s.sshListener.Close()
		s.sshListener = nil
	}

	// Wait for goroutines to finish
	s.wg.Wait()

	// Close all sessions
	s.sessions.CloseAll()

	// Close database
	return s.db.Close()
}

// acceptLoop accepts incoming connections
func (s *Server) acceptLoop() {
	defer s.wg.Done()

	for {
		conn, err := s.listener.Accept()
		if err != nil {
			select {
			case <-s.shutdown:
				return
			default:
				log.Printf("Accept error: %v", err)
				continue
			}
		}

		// Handle connection in goroutine
		go s.handleConnection(conn)
	}
}

// handleConnection handles a single client connection
func (s *Server) handleConnection(conn net.Conn) {
	defer conn.Close()

	// Disable Nagle's algorithm for immediate sends
	if tcpConn, ok := conn.(*net.TCPConn); ok {
		tcpConn.SetNoDelay(true)
	}

	// Create session
	sess, err := s.sessions.CreateSession(nil, "", "tcp", conn)
	if err != nil {
		log.Printf("Failed to create session: %v", err)
		return
	}
	defer s.sessions.RemoveSession(sess.ID)

	log.Printf("New connection from %s (session %d)", conn.RemoteAddr(), sess.ID)

	// Send SERVER_CONFIG immediately after connection
	log.Printf("Session %d: Attempting to send SERVER_CONFIG...", sess.ID)
	if err := s.sendServerConfig(sess); err != nil {
		log.Printf("Failed to send SERVER_CONFIG to session %d: %v", sess.ID, err)
		return
	}
	log.Printf("Session %d: SERVER_CONFIG sent successfully", sess.ID)

	// Message loop
	for {
		// Read frame
		frame, err := protocol.DecodeFrame(conn)
		if err != nil {
			if err == io.EOF {
				log.Printf("Session %d disconnected", sess.ID)
			} else {
				log.Printf("Session %d read error: %v", sess.ID, err)
			}
			return
		}

		log.Printf("Session %d ← RECV: Type=0x%02X Flags=0x%02X PayloadLen=%d", sess.ID, frame.Type, frame.Flags, len(frame.Payload))

		// Update session activity
		if err := s.db.UpdateSessionActivity(sess.DBSessionID); err != nil {
			log.Printf("Failed to update session activity: %v", err)
		}

		// Handle message
		if err := s.handleMessage(sess, frame); err != nil {
			log.Printf("Session %d handle error: %v", sess.ID, err)
			// Send error response
			s.sendError(sess, 9000, fmt.Sprintf("Internal error: %v", err))
		}
	}
}

// handleMessage dispatches a frame to the appropriate handler
func (s *Server) handleMessage(sess *Session, frame *protocol.Frame) error {
	switch frame.Type {
	case protocol.TypeSetNickname:
		return s.handleSetNickname(sess, frame)
	case protocol.TypeListChannels:
		return s.handleListChannels(sess, frame)
	case protocol.TypeJoinChannel:
		return s.handleJoinChannel(sess, frame)
	case protocol.TypeLeaveChannel:
		return s.handleLeaveChannel(sess, frame)
	case protocol.TypeListMessages:
		return s.handleListMessages(sess, frame)
	case protocol.TypePostMessage:
		return s.handlePostMessage(sess, frame)
	case protocol.TypeDeleteMessage:
		return s.handleDeleteMessage(sess, frame)
	case protocol.TypePing:
		return s.handlePing(sess, frame)
	default:
		// Unknown or unimplemented message type
		return s.sendError(sess, 1001, "Unsupported message type")
	}
}

// sendServerConfig sends the SERVER_CONFIG message to a session
func (s *Server) sendServerConfig(sess *Session) error {
	msg := &protocol.ServerConfigMessage{
		ProtocolVersion:     s.config.ProtocolVersion,
		MaxMessageRate:      s.config.MessageRateLimit,
		MaxChannelCreates:   s.config.MaxChannelCreates,
		InactiveCleanupDays: s.config.InactiveCleanupDays,
		MaxConnectionsPerIP: s.config.MaxConnectionsPerIP,
		MaxMessageLength:    s.config.MaxMessageLength,
	}

	payload, err := msg.Encode()
	if err != nil {
		return err
	}

	frame := &protocol.Frame{
		Version: protocol.ProtocolVersion,
		Type:    protocol.TypeServerConfig,
		Flags:   0,
		Payload: payload,
	}

	log.Printf("Session %d → SEND: Type=0x%02X (SERVER_CONFIG) Flags=0x%02X PayloadLen=%d", sess.ID, protocol.TypeServerConfig, 0, len(payload))
	return protocol.EncodeFrame(sess.Conn, frame)
}

// sendError sends an ERROR message to a session
func (s *Server) sendError(sess *Session, code uint16, message string) error {
	msg := &protocol.ErrorMessage{
		ErrorCode: code,
		Message:   message,
	}

	payload, err := msg.Encode()
	if err != nil {
		return err
	}

	frame := &protocol.Frame{
		Version: protocol.ProtocolVersion,
		Type:    protocol.TypeError,
		Flags:   0,
		Payload: payload,
	}

	return protocol.EncodeFrame(sess.Conn, frame)
}

// sessionCleanupLoop periodically cleans up stale sessions
func (s *Server) sessionCleanupLoop() {
	defer s.wg.Done()

	ticker := time.NewTicker(30 * time.Second)
	defer ticker.Stop()

	for {
		select {
		case <-s.shutdown:
			return
		case <-ticker.C:
			s.cleanupStaleSessions()
		}
	}
}

// cleanupStaleSessions removes sessions that have been inactive
func (s *Server) cleanupStaleSessions() {
	timeout := time.Duration(s.config.SessionTimeoutSeconds) * time.Second
	cutoff := time.Now().Add(-timeout).UnixMilli()

	sessions := s.sessions.GetAllSessions()
	for _, sess := range sessions {
		dbSess, err := s.db.GetSession(sess.DBSessionID)
		if err != nil {
			continue
		}

		if dbSess.LastActivity < cutoff {
			log.Printf("Closing stale session %d (inactive for %v)", sess.ID, timeout)
			s.sessions.RemoveSession(sess.ID)
		}
	}
}

// retentionCleanupLoop periodically cleans up old messages based on channel retention policies
func (s *Server) retentionCleanupLoop() {
	defer s.wg.Done()

	// Run cleanup every hour
	ticker := time.NewTicker(1 * time.Hour)
	defer ticker.Stop()

	// Run cleanup immediately on startup
	s.cleanupExpiredMessages()

	for {
		select {
		case <-s.shutdown:
			return
		case <-ticker.C:
			s.cleanupExpiredMessages()
		}
	}
}

// cleanupExpiredMessages deletes messages older than their channel's retention policy
func (s *Server) cleanupExpiredMessages() {
	count, err := s.db.CleanupExpiredMessages()
	if err != nil {
		log.Printf("Error cleaning up expired messages: %v", err)
		return
	}

	if count > 0 {
		log.Printf("Cleaned up %d expired messages", count)
	}

	// Also cleanup idle sessions from the database
	sessionTimeout := int64(s.config.SessionTimeoutSeconds)
	sessionCount, err := s.db.CleanupIdleSessions(sessionTimeout)
	if err != nil {
		log.Printf("Error cleaning up idle sessions from database: %v", err)
		return
	}

	if sessionCount > 0 {
		log.Printf("Cleaned up %d idle database sessions", sessionCount)
	}
}
