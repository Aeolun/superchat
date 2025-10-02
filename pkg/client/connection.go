package client

import (
	"fmt"
	"io"
	"log"
	"net"
	"sync"
	"time"

	"github.com/aeolun/superchat/pkg/protocol"
)

// Connection represents a client connection to the server
type Connection struct {
	addr         string
	conn         net.Conn
	mu           sync.RWMutex
	connected    bool
	reconnecting bool

	// Channels for communication
	incoming chan *protocol.Frame
	outgoing chan *protocol.Frame
	errors   chan error

	// Auto-reconnect settings
	autoReconnect      bool
	reconnectDelay     time.Duration
	maxReconnectDelay  time.Duration

	// Shutdown
	shutdown chan struct{}
	wg       sync.WaitGroup
}

// NewConnection creates a new client connection
func NewConnection(addr string) *Connection {
	return &Connection{
		addr:              addr,
		incoming:          make(chan *protocol.Frame, 100),
		outgoing:          make(chan *protocol.Frame, 100),
		errors:            make(chan error, 10),
		autoReconnect:     true,
		reconnectDelay:    1 * time.Second,
		maxReconnectDelay: 30 * time.Second,
		shutdown:          make(chan struct{}),
	}
}

// Connect establishes connection to the server
func (c *Connection) Connect() error {
	c.mu.Lock()
	if c.connected {
		c.mu.Unlock()
		return fmt.Errorf("already connected")
	}
	c.mu.Unlock()

	conn, err := net.DialTimeout("tcp", c.addr, 10*time.Second)
	if err != nil {
		return fmt.Errorf("failed to connect: %w", err)
	}

	c.mu.Lock()
	c.conn = conn
	c.connected = true
	c.mu.Unlock()

	// Start reader and writer goroutines
	c.wg.Add(2)
	go c.readLoop()
	go c.writeLoop()

	return nil
}

// Disconnect closes the connection
func (c *Connection) Disconnect() {
	c.mu.Lock()
	if !c.connected {
		c.mu.Unlock()
		return
	}
	c.connected = false
	if c.conn != nil {
		c.conn.Close()
	}
	c.mu.Unlock()
}

// Close shuts down the connection permanently
func (c *Connection) Close() {
	close(c.shutdown)
	c.Disconnect()
	c.wg.Wait()
	close(c.incoming)
	close(c.outgoing)
	close(c.errors)
}

// Send sends a frame to the server
func (c *Connection) Send(frame *protocol.Frame) error {
	select {
	case c.outgoing <- frame:
		return nil
	case <-c.shutdown:
		return fmt.Errorf("connection closed")
	default:
		return fmt.Errorf("outgoing queue full")
	}
}

// Incoming returns the channel for receiving frames from server
func (c *Connection) Incoming() <-chan *protocol.Frame {
	return c.incoming
}

// Errors returns the channel for connection errors
func (c *Connection) Errors() <-chan error {
	return c.errors
}

// IsConnected returns whether the connection is active
func (c *Connection) IsConnected() bool {
	c.mu.RLock()
	defer c.mu.RUnlock()
	return c.connected
}

// readLoop reads frames from the connection
func (c *Connection) readLoop() {
	defer c.wg.Done()

	for {
		c.mu.RLock()
		conn := c.conn
		connected := c.connected
		c.mu.RUnlock()

		if !connected || conn == nil {
			break
		}

		frame, err := protocol.DecodeFrame(conn)
		if err != nil {
			if err == io.EOF {
				c.handleDisconnect()
				return
			}
			c.errors <- fmt.Errorf("read error: %w", err)
			c.handleDisconnect()
			return
		}

		select {
		case c.incoming <- frame:
		case <-c.shutdown:
			return
		}
	}
}

// writeLoop sends frames to the connection
func (c *Connection) writeLoop() {
	defer c.wg.Done()

	for {
		select {
		case frame := <-c.outgoing:
			c.mu.RLock()
			conn := c.conn
			connected := c.connected
			c.mu.RUnlock()

			if !connected || conn == nil {
				continue
			}

			if err := protocol.EncodeFrame(conn, frame); err != nil {
				c.errors <- fmt.Errorf("write error: %w", err)
				c.handleDisconnect()
				return
			}

		case <-c.shutdown:
			return
		}
	}
}

// handleDisconnect handles unexpected disconnection
func (c *Connection) handleDisconnect() {
	c.mu.Lock()
	wasConnected := c.connected
	c.connected = false
	if c.conn != nil {
		c.conn.Close()
		c.conn = nil
	}
	c.mu.Unlock()

	if !wasConnected {
		return
	}

	c.errors <- fmt.Errorf("disconnected from server")

	// Auto-reconnect if enabled
	if c.autoReconnect {
		go c.reconnectLoop()
	}
}

// reconnectLoop attempts to reconnect with exponential backoff
func (c *Connection) reconnectLoop() {
	c.mu.Lock()
	if c.reconnecting {
		c.mu.Unlock()
		return
	}
	c.reconnecting = true
	c.mu.Unlock()

	defer func() {
		c.mu.Lock()
		c.reconnecting = false
		c.mu.Unlock()
	}()

	delay := c.reconnectDelay

	for {
		select {
		case <-c.shutdown:
			return
		case <-time.After(delay):
			log.Printf("Attempting to reconnect to %s...", c.addr)

			if err := c.Connect(); err != nil {
				log.Printf("Reconnect failed: %v", err)

				// Exponential backoff
				delay = delay * 2
				if delay > c.maxReconnectDelay {
					delay = c.maxReconnectDelay
				}
				continue
			}

			log.Printf("Reconnected successfully")
			return
		}
	}
}

// SendMessage is a helper to send a protocol message
func (c *Connection) SendMessage(msgType uint8, msg interface{}) error {
	var payload []byte
	var err error

	switch m := msg.(type) {
	case interface{ Encode() ([]byte, error) }:
		payload, err = m.Encode()
	default:
		return fmt.Errorf("message type does not implement Encode()")
	}

	if err != nil {
		return err
	}

	frame := &protocol.Frame{
		Version: protocol.ProtocolVersion,
		Type:    msgType,
		Flags:   0,
		Payload: payload,
	}

	return c.Send(frame)
}
