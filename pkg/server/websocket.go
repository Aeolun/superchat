package server

import (
	"bytes"
	"io"
	"log"
	"net"
	"net/http"
	"sync"
	"time"

	"github.com/gorilla/websocket"
)

// WebSocketConn adapts a WebSocket connection to implement net.Conn interface
// This allows us to reuse all existing protocol handling code unchanged
type WebSocketConn struct {
	ws      *websocket.Conn
	readBuf bytes.Buffer
	readMu  sync.Mutex
	writeMu sync.Mutex
	closed  bool
	closeMu sync.Mutex
}

var upgrader = websocket.Upgrader{
	ReadBufferSize:  1048576, // 1MB - matches our max frame size
	WriteBufferSize: 1048576, // 1MB
	CheckOrigin: func(r *http.Request) bool {
		// For terminal client, accept all origins
		// In production, you might want to check X-SuperChat-Client header
		return true
	},
}

// HandleWebSocket upgrades HTTP connection to WebSocket and handles it as a session
func (s *Server) HandleWebSocket(w http.ResponseWriter, r *http.Request) {
	// Upgrade connection
	ws, err := upgrader.Upgrade(w, r, nil)
	if err != nil {
		log.Printf("WebSocket upgrade failed: %v", err)
		return
	}

	// Wrap WebSocket as net.Conn
	conn := NewWebSocketConn(ws)

	// Create session (exactly like TCP handler does)
	sess, err := s.sessions.CreateSession(nil, "", "websocket", conn)
	if err != nil {
		log.Printf("Failed to create WebSocket session: %v", err)
		conn.Close()
		return
	}

	// Track connection for periodic metrics
	s.connectionsSinceReport.Add(1)
	debugLog.Printf("WebSocket connection from %s (session %d)", conn.RemoteAddr(), sess.ID)

	// Send SERVER_CONFIG immediately after connection
	s.sendServerConfig(sess)

	// Spawn goroutine for message loop (same as TCP handler does)
	go s.messageLoop(sess, conn)
}

// NewWebSocketConn creates a new WebSocket connection adapter
func NewWebSocketConn(ws *websocket.Conn) *WebSocketConn {
	return &WebSocketConn{
		ws: ws,
	}
}

// Read implements net.Conn.Read
func (c *WebSocketConn) Read(b []byte) (int, error) {
	c.readMu.Lock()
	defer c.readMu.Unlock()

	// If we have buffered data, read from buffer first
	if c.readBuf.Len() > 0 {
		return c.readBuf.Read(b)
	}

	// Read next WebSocket message
	messageType, data, err := c.ws.ReadMessage()
	if err != nil {
		return 0, err
	}

	// We only accept binary messages
	if messageType != websocket.BinaryMessage {
		return 0, io.ErrUnexpectedEOF
	}

	// Buffer the data
	c.readBuf.Write(data)

	// Read from buffer
	return c.readBuf.Read(b)
}

// Write implements net.Conn.Write
func (c *WebSocketConn) Write(b []byte) (int, error) {
	c.writeMu.Lock()
	defer c.writeMu.Unlock()

	c.closeMu.Lock()
	if c.closed {
		c.closeMu.Unlock()
		return 0, net.ErrClosed
	}
	c.closeMu.Unlock()

	// Send as binary WebSocket message
	err := c.ws.WriteMessage(websocket.BinaryMessage, b)
	if err != nil {
		return 0, err
	}

	return len(b), nil
}

// Close implements net.Conn.Close
func (c *WebSocketConn) Close() error {
	c.closeMu.Lock()
	defer c.closeMu.Unlock()

	if c.closed {
		return nil
	}

	c.closed = true
	return c.ws.Close()
}

// LocalAddr implements net.Conn.LocalAddr
func (c *WebSocketConn) LocalAddr() net.Addr {
	return c.ws.LocalAddr()
}

// RemoteAddr implements net.Conn.RemoteAddr
func (c *WebSocketConn) RemoteAddr() net.Addr {
	return c.ws.RemoteAddr()
}

// SetDeadline implements net.Conn.SetDeadline
func (c *WebSocketConn) SetDeadline(t time.Time) error {
	if err := c.ws.SetReadDeadline(t); err != nil {
		return err
	}
	return c.ws.SetWriteDeadline(t)
}

// SetReadDeadline implements net.Conn.SetReadDeadline
func (c *WebSocketConn) SetReadDeadline(t time.Time) error {
	return c.ws.SetReadDeadline(t)
}

// SetWriteDeadline implements net.Conn.SetWriteDeadline
func (c *WebSocketConn) SetWriteDeadline(t time.Time) error {
	return c.ws.SetWriteDeadline(t)
}
