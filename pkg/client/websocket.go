package client

import (
	"bytes"
	"fmt"
	"io"
	"net"
	"net/url"
	"strings"
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
	addr    string // Store the address for RemoteAddr()
}

// DialWebSocket connects to a WebSocket server using the specified scheme (ws or wss)
func DialWebSocket(addr string, useTLS bool) (*WebSocketConn, error) {
	// Determine scheme based on TLS flag
	scheme := "ws"
	if useTLS {
		scheme = "wss"
	}

	// Parse address to construct WebSocket URL
	u := url.URL{Scheme: scheme, Host: addr, Path: "/ws"}

	// Connect with timeout
	dialer := &websocket.Dialer{
		HandshakeTimeout: 10 * time.Second,
		ReadBufferSize:   1048576, // 1MB
		WriteBufferSize:  1048576, // 1MB
	}

	ws, _, err := dialer.Dial(u.String(), nil)
	if err != nil {
		// Improve error message for common TLS/handshake issues
		errStr := err.Error()
		if strings.Contains(errStr, "bad handshake") {
			if useTLS {
				return nil, fmt.Errorf("TLS handshake failed - server may not support WSS (try ws:// instead): %w", err)
			} else {
				return nil, fmt.Errorf("handshake failed - server may require WSS/TLS (try wss:// instead): %w", err)
			}
		}
		return nil, err
	}

	return &WebSocketConn{
		ws:   ws,
		addr: addr,
	}, nil
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
