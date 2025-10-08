package server

import (
	"context"
	"errors"
	"fmt"
	"io"
	"log"
	"net"
	"net/http"
	"os"
	"path/filepath"
	"runtime"
	"strings"
	"sync"
	"sync/atomic"
	"syscall"
	"time"

	"github.com/aeolun/superchat/pkg/database"
	"github.com/aeolun/superchat/pkg/protocol"
	"github.com/prometheus/client_golang/prometheus/promhttp"
)

var (
	errorLog *log.Logger
	debugLog *log.Logger
)

// Server represents the SuperChat server
type Server struct {
	db          *database.MemDB
	listener    net.Listener
	sshListener net.Listener
	sessions    *SessionManager
	config      ServerConfig
	configPath  string
	shutdown    chan struct{}
	wg          sync.WaitGroup
	metrics     *Metrics
	startTime   time.Time // Server start time for uptime calculation

	// Connection deltas for periodic reporting
	connectionsSinceReport    atomic.Int64
	disconnectionsSinceReport atomic.Int64

	// Server discovery
	verificationMu          sync.Mutex
	verificationChallenges  map[uint64]uint64 // sessionID -> challenge
	discoveryRateLimits     map[string]*discoveryRateLimiter
	discoveryRateLimitMu    sync.Mutex
}

// ServerConfig holds server configuration
type ServerConfig struct {
	TCPPort                 int
	SSHPort                 int
	HTTPPort                int    // Public HTTP port for /servers.json (default: 8080, 0 = disabled)
	SSHHostKeyPath          string
	MaxConnectionsPerIP     uint8
	MessageRateLimit        uint16
	MaxChannelCreates       uint16
	InactiveCleanupDays     uint16
	MaxMessageLength        uint32
	SessionTimeoutSeconds   int
	ProtocolVersion         uint8
	MaxThreadSubscriptions  uint16
	MaxChannelSubscriptions uint16
	DirectoryEnabled        bool

	// Server discovery metadata (used when DirectoryEnabled=true)
	PublicHostname string // Public hostname/IP for clients to connect
	ServerName     string // Display name in server list
	ServerDesc     string // Description in server list
	MaxUsers       uint32 // Max concurrent users (0 = unlimited)
}

// DefaultConfig returns default server configuration
func DefaultConfig() ServerConfig {
	return ServerConfig{
		TCPPort:                 6465,
		SSHPort:                 6466,
		HTTPPort:                8080, // Public HTTP server for /servers.json
		SSHHostKeyPath:          "~/.superchat/ssh_host_key",
		MaxConnectionsPerIP:     10,
		MessageRateLimit:        10,   // per minute
		MaxChannelCreates:       5,    // per hour
		InactiveCleanupDays:     90,   // days
		MaxMessageLength:        4096, // bytes
		SessionTimeoutSeconds:   120,  // 2 minutes
		ProtocolVersion:         1,
		MaxThreadSubscriptions:  50, // max thread subscriptions per session
		MaxChannelSubscriptions: 10, // max channel subscriptions per session
		DirectoryEnabled:        true, // Default: directory mode enabled

		// Server discovery metadata
		PublicHostname: "localhost",
		ServerName:     "SuperChat Server",
		ServerDesc:     "A SuperChat server",
		MaxUsers:       0, // unlimited
	}
}

// NewServer creates a new server instance
func NewServer(dbPath string, config ServerConfig, configPath string) (*Server, error) {
	// Open underlying SQLite database for snapshots
	sqliteDB, err := database.Open(dbPath)
	if err != nil {
		return nil, fmt.Errorf("failed to open database: %w", err)
	}

	// Seed default channels if they don't exist
	if err := sqliteDB.SeedDefaultChannels(); err != nil {
		sqliteDB.Close()
		return nil, fmt.Errorf("failed to seed channels: %w", err)
	}

	// Create in-memory database with 30-second snapshot interval
	memDB, err := database.NewMemDB(sqliteDB, 30*time.Second)
	if err != nil {
		sqliteDB.Close()
		return nil, fmt.Errorf("failed to create in-memory database: %w", err)
	}

	// Initialize loggers
	if err := initLoggers(); err != nil {
		memDB.Close()
		sqliteDB.Close()
		return nil, fmt.Errorf("failed to initialize loggers: %w", err)
	}

	metrics := NewMetrics()
	sessions := NewSessionManager(memDB, config.SessionTimeoutSeconds)
	sessions.SetMetrics(metrics)

	server := &Server{
		db:                     memDB,
		sessions:               sessions,
		config:                 config,
		configPath:             configPath,
		shutdown:               make(chan struct{}),
		metrics:                metrics,
		startTime:              time.Now(),
		verificationChallenges: make(map[uint64]uint64),
		discoveryRateLimits:    make(map[string]*discoveryRateLimiter),
	}

	return server, nil
}

// getServerDataDir returns the server data directory, creating it if needed
func getServerDataDir() (string, error) {
	var dataDir string
	if xdg := os.Getenv("XDG_DATA_HOME"); xdg != "" {
		dataDir = filepath.Join(xdg, "superchat")
	} else {
		homeDir, err := os.UserHomeDir()
		if err != nil {
			return "", fmt.Errorf("failed to get home directory: %w", err)
		}
		dataDir = filepath.Join(homeDir, ".local", "share", "superchat")
	}

	// Create directory if it doesn't exist
	if err := os.MkdirAll(dataDir, 0755); err != nil {
		return "", fmt.Errorf("failed to create data directory: %w", err)
	}

	return dataDir, nil
}

// initLoggers sets up error and debug loggers
func initLoggers() error {
	// Get server data directory
	dataDir, err := getServerDataDir()
	if err != nil {
		return err
	}

	// Error log goes to stderr and errors.log
	errorLogPath := filepath.Join(dataDir, "errors.log")
	errorFile, err := os.OpenFile(errorLogPath, os.O_CREATE|os.O_WRONLY|os.O_APPEND, 0666)
	if err != nil {
		return err
	}

	// Write startup marker to errors.log (for distinguishing between runs)
	startupMsg := fmt.Sprintf("=== Server started at %s ===\n", time.Now().Format(time.RFC3339))
	if _, err := errorFile.WriteString(startupMsg); err != nil {
		return err
	}

	errorLog = log.New(io.MultiWriter(os.Stderr, errorFile), "ERROR: ", log.LstdFlags)

	// Debug log goes to /dev/null by default (can be enabled via EnableDebugLogging)
	debugLog = log.New(io.Discard, "DEBUG: ", log.LstdFlags)

	// Redirect standard log (used by database package) to stdout and server.log
	// Truncate server.log on startup to avoid confusion from multiple runs
	serverLogPath := filepath.Join(dataDir, "server.log")
	serverLogFile, err := os.OpenFile(serverLogPath, os.O_CREATE|os.O_WRONLY|os.O_TRUNC, 0666)
	if err != nil {
		return err
	}
	log.SetOutput(io.MultiWriter(os.Stdout, serverLogFile))

	return nil
}

// EnableDebugLogging enables debug logging to debug.log
func (s *Server) EnableDebugLogging() {
	// Get server data directory
	dataDir, err := getServerDataDir()
	if err != nil {
		log.Printf("Failed to get data directory: %v", err)
		return
	}

	// Create/truncate debug.log
	debugLogPath := filepath.Join(dataDir, "debug.log")
	debugLogFile, err := os.OpenFile(debugLogPath, os.O_CREATE|os.O_WRONLY|os.O_TRUNC, 0666)
	if err != nil {
		log.Printf("Failed to open debug.log: %v", err)
		return
	}

	debugLog = log.New(debugLogFile, "DEBUG: ", log.LstdFlags)
	debugLog.Println("Debug logging enabled")
}

// Start starts the TCP and SSH servers
func (s *Server) Start() error {
	// Start TCP server
	addr := fmt.Sprintf(":%d", s.config.TCPPort)

	// Use ListenConfig to enable SO_REUSEADDR
	lc := net.ListenConfig{
		Control: func(network, address string, c syscall.RawConn) error {
			var opErr error
			err := c.Control(func(fd uintptr) {
				// Set SO_REUSEADDR to allow quick restart
				opErr = syscall.SetsockoptInt(int(fd), syscall.SOL_SOCKET, syscall.SO_REUSEADDR, 1)
			})
			if err != nil {
				return err
			}
			return opErr
		},
	}

	listener, err := lc.Listen(context.Background(), "tcp", addr)
	if err != nil {
		return fmt.Errorf("failed to listen on %s: %w", addr, err)
	}

	s.listener = listener
	logListenBacklog(addr)

	// Start listen overflow monitor (Linux only)
	s.wg.Add(1)
	go func() {
		defer s.wg.Done()
		s.monitorListenOverflows()
	}()

	// Start SSH server
	if err := s.startSSHServer(); err != nil {
		s.listener.Close()
		return fmt.Errorf("failed to start SSH server: %w", err)
	}

	// Start metrics HTTP server (internal only - never expose publicly!)
	go func() {
		metricsMux := http.NewServeMux()
		metricsMux.Handle("/metrics", promhttp.Handler())
		metricsMux.HandleFunc("/health", s.HealthHandler)
		log.Printf("Metrics server listening on :9090 (/metrics, /health) - INTERNAL ONLY")
		if err := http.ListenAndServe(":9090", metricsMux); err != nil {
			log.Printf("Metrics server error: %v", err)
		}
	}()

	// Start public HTTP server for /servers.json and WebSocket (safe to expose publicly)
	if s.config.HTTPPort > 0 {
		go func() {
			publicMux := http.NewServeMux()
			if s.config.DirectoryEnabled {
				publicMux.HandleFunc("/servers.json", s.ServersJSONHandler)
			}
			publicMux.HandleFunc("/ws", s.HandleWebSocket)
			addr := fmt.Sprintf(":%d", s.config.HTTPPort)

			endpoints := "/ws"
			if s.config.DirectoryEnabled {
				endpoints = "/servers.json, /ws"
			}
			log.Printf("Public HTTP server listening on %s (%s)", addr, endpoints)

			if err := http.ListenAndServe(addr, publicMux); err != nil {
				log.Printf("Public HTTP server error: %v", err)
			}
		}()
	}

	// Start metrics logging goroutine (log metrics every 5 seconds)
	s.wg.Add(1)
	go s.metricsLoggingLoop()

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

	// Close all sessions first to unblock handlers
	s.sessions.CloseAll()

	// Wait for goroutines to finish
	s.wg.Wait()

	// Close in-memory database (triggers final snapshot to SQLite)
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

		// Handle connection directly in goroutine
		go s.handleConnection(conn)
	}
}

// handleConnection handles initial connection setup, then spawns message loop goroutine
func (s *Server) handleConnection(conn net.Conn) {
	startTime := time.Now()

	// Disable Nagle's algorithm for immediate sends
	if tcpConn, ok := conn.(*net.TCPConn); ok {
		tcpConn.SetNoDelay(true)
	}

	afterTCP := time.Now()

	// Create session
	sess, err := s.sessions.CreateSession(nil, "", "tcp", conn)
	if err != nil {
		log.Printf("Failed to create session: %v", err)
		conn.Close()
		return
	}

	afterCreateSession := time.Now()

	// Track connection for periodic metrics
	s.connectionsSinceReport.Add(1)
	debugLog.Printf("New connection from %s (session %d)", conn.RemoteAddr(), sess.ID)

	// Send SERVER_CONFIG immediately after connection
	if err := s.sendServerConfig(sess); err != nil {
		// Debug log already shows the send attempt, clean up and return
		s.sessions.RemoveSession(sess.ID)
		conn.Close()
		return
	}

	afterServerConfig := time.Now()

	// Log timing if it took more than 100ms
	totalTime := afterServerConfig.Sub(startTime)
	if totalTime > 100*time.Millisecond {
		debugLog.Printf("Session %d: SLOW connection setup: total=%v (tcp=%v, createSess=%v, sendConfig=%v)",
			sess.ID,
			totalTime,
			afterTCP.Sub(startTime),
			afterCreateSession.Sub(afterTCP),
			afterServerConfig.Sub(afterCreateSession))
	}

	// Spawn goroutine for message loop (worker returns to pool)
	go s.messageLoop(sess, conn)
}

// messageLoop handles messages for an established connection
func (s *Server) messageLoop(sess *Session, conn net.Conn) {
	defer conn.Close()
	defer s.sessions.RemoveSession(sess.ID)

	// Message loop
	for {
		// Read frame
		frame, err := protocol.DecodeFrame(conn)
		if err != nil {
			// Check if session still exists (if not, it was closed by stale cleanup)
			_, exists := s.sessions.GetSession(sess.ID)

			// Remove from sessions map immediately to prevent broadcast attempts
			s.sessions.RemoveSession(sess.ID)

			// Only log if we're the ones who discovered the error (session existed)
			if exists {
				s.disconnectionsSinceReport.Add(1)
				if err == io.EOF {
					debugLog.Printf("Session %d: Client disconnected (message loop read)", sess.ID)
				} else {
					debugLog.Printf("Session %d: Message loop read error: %v", sess.ID, err)
				}
			}
			return
		}

		debugLog.Printf("Session %d ← RECV: Type=0x%02X Flags=0x%02X PayloadLen=%d", sess.ID, frame.Type, frame.Flags, len(frame.Payload))

		// Update session activity (buffered write, rate-limited to half of session timeout)
		s.sessions.UpdateSessionActivity(sess, time.Now().UnixMilli())

		// Track message received
		if s.metrics != nil {
			s.metrics.RecordMessageReceived(messageTypeToString(frame.Type))
		}

		// Handle message
		if err := s.handleMessage(sess, frame); err != nil {
			// If it's a graceful disconnect, exit cleanly
			if errors.Is(err, ErrClientDisconnecting) {
				s.disconnectionsSinceReport.Add(1)
				debugLog.Printf("Session %d disconnected gracefully", sess.ID)
				return
			}
			// Log and send error response for other errors
			log.Printf("Session %d handle error: %v", sess.ID, err)
			s.sendError(sess, 9000, fmt.Sprintf("Internal error: %v", err))
		}
	}
}

// handleMessage dispatches a frame to the appropriate handler
func (s *Server) handleMessage(sess *Session, frame *protocol.Frame) error {
	switch frame.Type {
	case protocol.TypeAuthRequest:
		return s.handleAuthRequest(sess, frame)
	case protocol.TypeSetNickname:
		return s.handleSetNickname(sess, frame)
	case protocol.TypeRegisterUser:
		return s.handleRegisterUser(sess, frame)
	case protocol.TypeLogout:
		return s.handleLogout(sess, frame)
	case protocol.TypeListChannels:
		return s.handleListChannels(sess, frame)
	case protocol.TypeJoinChannel:
		return s.handleJoinChannel(sess, frame)
	case protocol.TypeLeaveChannel:
		return s.handleLeaveChannel(sess, frame)
	case protocol.TypeCreateChannel:
		return s.handleCreateChannel(sess, frame)
	case protocol.TypeListMessages:
		return s.handleListMessages(sess, frame)
	case protocol.TypePostMessage:
		return s.handlePostMessage(sess, frame)
	case protocol.TypeEditMessage:
		return s.handleEditMessage(sess, frame)
	case protocol.TypeDeleteMessage:
		return s.handleDeleteMessage(sess, frame)
	case protocol.TypeChangePassword:
		return s.handleChangePassword(sess, frame)
	case protocol.TypeAddSSHKey:
		return s.handleAddSSHKey(sess, frame)
	case protocol.TypeListSSHKeys:
		return s.handleListSSHKeys(sess, frame)
	case protocol.TypeUpdateSSHKeyLabel:
		return s.handleUpdateSSHKeyLabel(sess, frame)
	case protocol.TypeDeleteSSHKey:
		return s.handleDeleteSSHKey(sess, frame)
	case protocol.TypeGetUserInfo:
		return s.handleGetUserInfo(sess, frame)
	case protocol.TypeListUsers:
		return s.handleListUsers(sess, frame)
	case protocol.TypePing:
		return s.handlePing(sess, frame)
	case protocol.TypeDisconnect:
		return s.handleDisconnect(sess, frame)
	case protocol.TypeSubscribeThread:
		return s.handleSubscribeThread(sess, frame)
	case protocol.TypeUnsubscribeThread:
		return s.handleUnsubscribeThread(sess, frame)
	case protocol.TypeSubscribeChannel:
		return s.handleSubscribeChannel(sess, frame)
	case protocol.TypeUnsubscribeChannel:
		return s.handleUnsubscribeChannel(sess, frame)
	case protocol.TypeListServers:
		return s.handleListServers(sess, frame)
	case protocol.TypeRegisterServer:
		return s.handleRegisterServer(sess, frame)
	case protocol.TypeVerifyResponse:
		return s.handleVerifyResponse(sess, frame)
	case protocol.TypeHeartbeat:
		return s.handleHeartbeat(sess, frame)
	default:
		// Unknown or unimplemented message type
		return s.sendError(sess, 1001, "Unsupported message type")
	}
}

// sendServerConfig sends the SERVER_CONFIG message to a session
func (s *Server) sendServerConfig(sess *Session) error {
	msg := &protocol.ServerConfigMessage{
		ProtocolVersion:         s.config.ProtocolVersion,
		MaxMessageRate:          s.config.MessageRateLimit,
		MaxChannelCreates:       s.config.MaxChannelCreates,
		InactiveCleanupDays:     s.config.InactiveCleanupDays,
		MaxConnectionsPerIP:     s.config.MaxConnectionsPerIP,
		MaxMessageLength:        s.config.MaxMessageLength,
		MaxThreadSubscriptions:  s.config.MaxThreadSubscriptions,
		MaxChannelSubscriptions: s.config.MaxChannelSubscriptions,
		DirectoryEnabled:        s.config.DirectoryEnabled,
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

	debugLog.Printf("Session %d → SEND: Type=0x%02X (SERVER_CONFIG) Flags=0x%02X PayloadLen=%d", sess.ID, protocol.TypeServerConfig, 0, len(payload))
	if s.metrics != nil {
		s.metrics.RecordMessageSent(messageTypeToString(protocol.TypeServerConfig))
	}
	return sess.Conn.EncodeFrame(frame)
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

	if s.metrics != nil {
		s.metrics.RecordMessageSent(messageTypeToString(protocol.TypeError))
	}
	return sess.Conn.EncodeFrame(frame)
}

// metricsLoggingLoop periodically logs key metrics
func (s *Server) metricsLoggingLoop() {
	defer s.wg.Done()

	ticker := time.NewTicker(5 * time.Second)
	defer ticker.Stop()

	for {
		select {
		case <-s.shutdown:
			return
		case <-ticker.C:
			// Get current counts
			activeSessions := s.sessions.CountOnlineUsers()
			goroutines := runtime.NumGoroutine()

			// Get deltas and reset
			connected := s.connectionsSinceReport.Swap(0)
			disconnected := s.disconnectionsSinceReport.Swap(0)

			log.Printf("[METRICS] Active sessions: %d, connected since last: %d, disconnected since last: %d, goroutines: %d",
				activeSessions, connected, disconnected, goroutines)
		}
	}
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
			s.disconnectionsSinceReport.Add(1)
			debugLog.Printf("Closing stale session %d (inactive for %v)", sess.ID, timeout)
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

// ===== Server Discovery Methods =====

// DisableDirectory disables directory mode (server won't accept registrations)
func (s *Server) DisableDirectory() {
	s.config.DirectoryEnabled = false
}

// EnableDirectory enables directory mode (server will accept registrations)
func (s *Server) EnableDirectory() {
	s.config.DirectoryEnabled = true
}

// AnnounceToDirectory announces this server to a directory server and maintains heartbeat
func (s *Server) AnnounceToDirectory(directoryAddr, serverName, serverDescription string) {
	// Check if we're listening on localhost only
	if s.listener != nil {
		addr := s.listener.Addr().String()
		// Check if listening on localhost/127.0.0.1
		if strings.HasPrefix(addr, "127.0.0.1:") || strings.HasPrefix(addr, "[::1]:") || strings.HasPrefix(addr, "localhost:") {
			log.Printf("WARNING: Server is listening on localhost only (%s) - not announcing to public directory %s", addr, directoryAddr)
			return
		}
	}

	// Parse directory address
	host, portStr, err := net.SplitHostPort(directoryAddr)
	if err != nil {
		log.Printf("Failed to parse directory address %s: %v", directoryAddr, err)
		return
	}

	port := 0
	if _, err := fmt.Sscanf(portStr, "%d", &port); err != nil {
		log.Printf("Invalid port in directory address %s: %v", directoryAddr, err)
		return
	}

	// Get our external hostname (from config or listener)
	ourHostname := host // TODO: Get from config or detect external IP
	if s.listener != nil {
		if addr := s.listener.Addr().String(); addr != "" {
			// Extract just the port from our listener
			_, ourPort, _ := net.SplitHostPort(addr)
			if ourPort != "" {
				// Use the directory's host as a guess for our hostname
				// In production, this should be configurable
				ourHostname = host
			}
		}
	}
	ourPort := uint16(s.config.TCPPort)

	// Start announcement loop
	go s.maintainDirectoryAnnouncement(directoryAddr, ourHostname, ourPort, serverName, serverDescription)
}

// maintainDirectoryAnnouncement maintains connection to directory with registration and heartbeats
func (s *Server) maintainDirectoryAnnouncement(directoryAddr, ourHostname string, ourPort uint16, serverName, serverDescription string) {
	heartbeatInterval := uint32(300) // Start with 5 minutes
	startTime := time.Now()

	for {
		select {
		case <-s.shutdown:
			log.Printf("Stopping announcement to %s (server shutdown)", directoryAddr)
			return
		default:
		}

		// Connect to directory
		conn, err := net.DialTimeout("tcp", directoryAddr, 10*time.Second)
		if err != nil {
			log.Printf("Failed to connect to directory %s: %v (retrying in 60s)", directoryAddr, err)
			time.Sleep(60 * time.Second)
			continue
		}

		log.Printf("Connected to directory %s", directoryAddr)

		// Send REGISTER_SERVER
		registerMsg := &protocol.RegisterServerMessage{
			Hostname:    ourHostname,
			Port:        ourPort,
			Name:        serverName,
			Description: serverDescription,
			MaxUsers:    0, // 0 = unlimited
			IsPublic:    true,
		}

		payload, err := registerMsg.Encode()
		if err != nil {
			log.Printf("Failed to encode REGISTER_SERVER: %v", err)
			conn.Close()
			time.Sleep(60 * time.Second)
			continue
		}

		frame := &protocol.Frame{
			Version: 1,
			Type:    protocol.TypeRegisterServer,
			Flags:   0,
			Payload: payload,
		}

		if err := protocol.EncodeFrame(conn, frame); err != nil {
			log.Printf("Failed to send REGISTER_SERVER to %s: %v", directoryAddr, err)
			conn.Close()
			time.Sleep(60 * time.Second)
			continue
		}

		log.Printf("Sent REGISTER_SERVER to %s", directoryAddr)

		// Wait for VERIFY_REGISTRATION challenge
		conn.SetReadDeadline(time.Now().Add(30 * time.Second))
		verifyFrame, err := protocol.DecodeFrame(conn)
		if err != nil {
			log.Printf("Failed to receive verification from %s: %v (retrying in 60s)", directoryAddr, err)
			conn.Close()
			time.Sleep(60 * time.Second)
			continue
		}

		if verifyFrame.Type != protocol.TypeVerifyRegistration {
			log.Printf("Expected VERIFY_REGISTRATION from %s, got 0x%02x", directoryAddr, verifyFrame.Type)
			conn.Close()
			time.Sleep(60 * time.Second)
			continue
		}

		// Decode challenge
		verifyMsg := &protocol.VerifyRegistrationMessage{}
		if err := verifyMsg.Decode(verifyFrame.Payload); err != nil {
			log.Printf("Failed to decode VERIFY_REGISTRATION: %v", err)
			conn.Close()
			time.Sleep(60 * time.Second)
			continue
		}

		log.Printf("Received verification challenge from %s: %d", directoryAddr, verifyMsg.Challenge)

		// Send VERIFY_RESPONSE
		responseMsg := &protocol.VerifyResponseMessage{
			Challenge: verifyMsg.Challenge,
		}

		respPayload, err := responseMsg.Encode()
		if err != nil {
			log.Printf("Failed to encode VERIFY_RESPONSE: %v", err)
			conn.Close()
			time.Sleep(60 * time.Second)
			continue
		}

		respFrame := &protocol.Frame{
			Version: 1,
			Type:    protocol.TypeVerifyResponse,
			Flags:   0,
			Payload: respPayload,
		}

		if err := protocol.EncodeFrame(conn, respFrame); err != nil {
			log.Printf("Failed to send VERIFY_RESPONSE: %v", err)
			conn.Close()
			time.Sleep(60 * time.Second)
			continue
		}

		log.Printf("Successfully registered with directory %s", directoryAddr)

		// Start heartbeat loop
		ticker := time.NewTicker(time.Duration(heartbeatInterval) * time.Second)
		defer ticker.Stop()

		for {
			select {
			case <-s.shutdown:
				log.Printf("Stopping heartbeat to %s (server shutdown)", directoryAddr)
				conn.Close()
				return

			case <-ticker.C:
				// Calculate uptime
				uptime := uint64(time.Since(startTime).Seconds())

				// Get current user count
				userCount := s.sessions.CountOnlineUsers()

				// Send HEARTBEAT
				heartbeatMsg := &protocol.HeartbeatMessage{
					Hostname:      ourHostname,
					Port:          ourPort,
					UserCount:     userCount,
					UptimeSeconds: uptime,
				}

				hbPayload, err := heartbeatMsg.Encode()
				if err != nil {
					log.Printf("Failed to encode HEARTBEAT: %v", err)
					goto reconnect
				}

				hbFrame := &protocol.Frame{
					Version: 1,
					Type:    protocol.TypeHeartbeat,
					Flags:   0,
					Payload: hbPayload,
				}

				if err := protocol.EncodeFrame(conn, hbFrame); err != nil {
					log.Printf("Failed to send HEARTBEAT to %s: %v (reconnecting)", directoryAddr, err)
					goto reconnect
				}

				// Wait for HEARTBEAT_ACK
				conn.SetReadDeadline(time.Now().Add(30 * time.Second))
				ackFrame, err := protocol.DecodeFrame(conn)
				if err != nil {
					log.Printf("Failed to receive HEARTBEAT_ACK from %s: %v (reconnecting)", directoryAddr, err)
					goto reconnect
				}

				if ackFrame.Type != protocol.TypeHeartbeatAck {
					log.Printf("Expected HEARTBEAT_ACK from %s, got 0x%02x", directoryAddr, ackFrame.Type)
					goto reconnect
				}

				// Decode ACK to get new interval
				ackMsg := &protocol.HeartbeatAckMessage{}
				if err := ackMsg.Decode(ackFrame.Payload); err != nil {
					log.Printf("Failed to decode HEARTBEAT_ACK: %v", err)
					goto reconnect
				}

				// Update interval if changed
				if ackMsg.HeartbeatInterval != heartbeatInterval {
					oldInterval := heartbeatInterval
					heartbeatInterval = ackMsg.HeartbeatInterval
					log.Printf("Directory %s adjusted heartbeat interval: %ds -> %ds", directoryAddr, oldInterval, heartbeatInterval)
					ticker.Reset(time.Duration(heartbeatInterval) * time.Second)
				}

				log.Printf("Heartbeat sent to %s (users: %d, uptime: %ds, next in %ds)", directoryAddr, userCount, uptime, heartbeatInterval)
			}
		}

	reconnect:
		ticker.Stop()
		conn.Close()
		log.Printf("Lost connection to directory %s, reconnecting in 60s...", directoryAddr)
		time.Sleep(60 * time.Second)
	}
}
