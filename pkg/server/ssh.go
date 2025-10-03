package server

import (
	"crypto/rand"
	"crypto/rsa"
	"crypto/x509"
	"encoding/pem"
	"fmt"
	"io"
	"log"
	"net"
	"os"
	"path/filepath"
	"strings"
	"time"

	"github.com/aeolun/superchat/pkg/protocol"
	"golang.org/x/crypto/ssh"
)

// startSSHServer starts the SSH server on the configured port
func (s *Server) startSSHServer() error {
	if s.config.SSHPort <= 0 {
		log.Printf("SSH server disabled (ssh_port=%d)", s.config.SSHPort)
		return nil
	}

	// Load or generate host key
	hostKey, err := s.loadOrGenerateHostKey()
	if err != nil {
		return fmt.Errorf("failed to load host key: %w", err)
	}

	// Configure SSH server
	config := &ssh.ServerConfig{
		// No authentication required for V1 (anonymous users)
		NoClientAuth: true,
	}
	config.ServerVersion = "SSH-2.0-SuperChat"
	config.AddHostKey(hostKey)

	// Listen on SSH port
	addr := fmt.Sprintf(":%d", s.config.SSHPort)
	listener, err := net.Listen("tcp", addr)
	if err != nil {
		return fmt.Errorf("failed to listen on %s: %w", addr, err)
	}

	s.sshListener = listener

	log.Printf("SSH server listening on %s", addr)

	// Accept connections in a goroutine
	s.wg.Add(1)
	go s.acceptSSHLoop(listener, config)

	return nil
}

// acceptSSHLoop accepts incoming SSH connections
func (s *Server) acceptSSHLoop(listener net.Listener, config *ssh.ServerConfig) {
	defer s.wg.Done()
	defer listener.Close()

	for {
		conn, err := listener.Accept()
		if err != nil {
			select {
			case <-s.shutdown:
				return
			default:
				log.Printf("SSH accept error: %v", err)
				continue
			}
		}

		// Handle SSH connection in a goroutine
		s.wg.Add(1)
		go s.handleSSHConnection(conn, config)
	}
}

// handleSSHConnection handles a single SSH connection
func (s *Server) handleSSHConnection(conn net.Conn, config *ssh.ServerConfig) {
	defer s.wg.Done()
	defer conn.Close()

	// Perform SSH handshake
	sshConn, chans, reqs, err := ssh.NewServerConn(conn, config)
	if err != nil {
		log.Printf("SSH handshake failed: %v", err)
		return
	}
	defer sshConn.Close()

	// Discard global out-of-band requests
	go ssh.DiscardRequests(reqs)

	// Handle incoming channels
	for newChannel := range chans {
		// We only accept "session" channels for our binary protocol
		if newChannel.ChannelType() != "session" {
			newChannel.Reject(ssh.UnknownChannelType, "unknown channel type")
			continue
		}

		channel, requests, err := newChannel.Accept()
		if err != nil {
			log.Printf("Could not accept channel: %v", err)
			continue
		}

		// Handle the session in the existing handler
		s.wg.Add(1)
		go func() {
			defer s.wg.Done()
			go s.handleSSHChannelRequests(requests)
			// Use the existing connection handler with the SSH channel
			s.handleSSHSession(channel)
		}()
	}
}

func (s *Server) handleSSHChannelRequests(requests <-chan *ssh.Request) {
	for req := range requests {
		switch req.Type {
		case "shell", "pty-req", "env", "window-change":
			if req.WantReply {
				req.Reply(true, nil)
			}
		default:
			if req.WantReply {
				req.Reply(false, nil)
			}
		}
	}
}

// handleSSHSession wraps an SSH channel and uses the existing protocol handler
func (s *Server) handleSSHSession(channel ssh.Channel) {
	defer channel.Close()

	// Wrap the SSH channel as a net.Conn-like interface
	conn := &sshChannelConn{channel: channel}

	// Disable Nagle's algorithm equivalent for SSH (not applicable, but keep pattern)
	// SSH channels don't have TCP-specific settings

	// Create session
	sess, err := s.sessions.CreateSession(nil, "", "ssh", conn)
	if err != nil {
		log.Printf("Failed to create SSH session: %v", err)
		return
	}
	defer s.sessions.RemoveSession(sess.ID)

	log.Printf("New SSH connection (session %d)", sess.ID)

	// Send SERVER_CONFIG immediately after connection
	if err := s.sendServerConfig(sess); err != nil {
		log.Printf("Failed to send SERVER_CONFIG to session %d: %v", sess.ID, err)
		return
	}

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

		debugLog.Printf("Session %d ← RECV: Type=0x%02X Flags=0x%02X PayloadLen=%d", sess.ID, frame.Type, frame.Flags, len(frame.Payload))

		// Update session activity (buffered write)
		s.writeBuffer.UpdateSessionActivity(sess.DBSessionID, time.Now().UnixMilli())

		// Handle message
		if err := s.handleMessage(sess, frame); err != nil {
			log.Printf("Session %d handle error: %v", sess.ID, err)
			// Send error response
			s.sendError(sess, 9000, fmt.Sprintf("Internal error: %v", err))
		}
	}
}

// sshChannelConn wraps ssh.Channel to implement net.Conn interface
type sshChannelConn struct {
	channel ssh.Channel
}

func (c *sshChannelConn) Read(b []byte) (int, error) {
	return c.channel.Read(b)
}

func (c *sshChannelConn) Write(b []byte) (int, error) {
	return c.channel.Write(b)
}

func (c *sshChannelConn) Close() error {
	return c.channel.Close()
}

func (c *sshChannelConn) LocalAddr() net.Addr {
	return &net.TCPAddr{IP: net.IPv4zero, Port: 0}
}

func (c *sshChannelConn) RemoteAddr() net.Addr {
	return &net.TCPAddr{IP: net.IPv4zero, Port: 0}
}

func (c *sshChannelConn) SetDeadline(t time.Time) error      { return nil }
func (c *sshChannelConn) SetReadDeadline(t time.Time) error  { return nil }
func (c *sshChannelConn) SetWriteDeadline(t time.Time) error { return nil }

// loadOrGenerateHostKey loads the SSH host key or generates one if it doesn't exist
func (s *Server) loadOrGenerateHostKey() (ssh.Signer, error) {
	// Expand ~ in path
	keyPath := s.config.SSHHostKeyPath
	if strings.HasPrefix(keyPath, "~/") {
		homeDir, err := os.UserHomeDir()
		if err != nil {
			return nil, fmt.Errorf("failed to get home directory: %w", err)
		}
		keyPath = filepath.Join(homeDir, keyPath[2:])
	}

	if strings.TrimSpace(keyPath) == "" {
		configTarget := "server config file"
		if strings.TrimSpace(s.configPath) != "" {
			configTarget = s.configPath
		}
		return nil, fmt.Errorf("ssh host key path is empty; update [server].ssh_host_key in %s or remove it to use the default (%s)", configTarget, DefaultConfig().SSHHostKeyPath)
	}

	// Try to load existing key
	keyBytes, err := os.ReadFile(keyPath)
	if err == nil {
		// Parse the key
		key, err := ssh.ParsePrivateKey(keyBytes)
		if err != nil {
			return nil, fmt.Errorf("failed to parse host key: %w", err)
		}
		log.Printf("Loaded SSH host key from %s", keyPath)
		return key, nil
	}

	// Generate new key if file doesn't exist
	if !os.IsNotExist(err) {
		return nil, fmt.Errorf("failed to read host key: %w", err)
	}

	log.Printf("Generating new SSH host key at %s...", keyPath)

	// Generate RSA key
	privateKey, err := rsa.GenerateKey(rand.Reader, 2048)
	if err != nil {
		return nil, fmt.Errorf("failed to generate key: %w", err)
	}

	// Encode to PEM format
	privateKeyPEM := &pem.Block{
		Type:  "RSA PRIVATE KEY",
		Bytes: x509.MarshalPKCS1PrivateKey(privateKey),
	}

	// Ensure directory exists
	if err := os.MkdirAll(filepath.Dir(keyPath), 0755); err != nil {
		return nil, fmt.Errorf("failed to create directory: %w", err)
	}

	// Write key to file
	keyFile, err := os.OpenFile(keyPath, os.O_WRONLY|os.O_CREATE|os.O_TRUNC, 0600)
	if err != nil {
		return nil, fmt.Errorf("failed to create key file: %w", err)
	}
	defer keyFile.Close()

	if err := pem.Encode(keyFile, privateKeyPEM); err != nil {
		return nil, fmt.Errorf("failed to write key: %w", err)
	}

	// Parse the generated key
	key, err := ssh.ParsePrivateKey(pem.EncodeToMemory(privateKeyPEM))
	if err != nil {
		return nil, fmt.Errorf("failed to parse generated key: %w", err)
	}

	log.Printf("Generated and saved new SSH host key")
	return key, nil
}
