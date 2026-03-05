package archive

import (
	"log"
	"net"
	"sync"
	"time"

	gen "github.com/aeolun/superchat/pkg/archive/generated"
)

const (
	// BufferCapacity is the max number of events in the outbound queue.
	// When full, new events are silently dropped to avoid blocking the chat server.
	BufferCapacity = 10_000

	// reconnectBaseDelay is the initial delay before reconnecting.
	reconnectBaseDelay = 1 * time.Second
	// reconnectMaxDelay caps exponential backoff.
	reconnectMaxDelay = 30 * time.Second

	// ArchiveProtocolVersion is the archive protocol version sent in the handshake.
	ArchiveProtocolVersion = 1
)

// Event is a tagged union of archive protocol events.
// Exactly one field is non-nil.
type Event struct {
	MessageSync    *gen.MessageSync
	MessageEdited  *gen.MessageEdited
	MessageDeleted *gen.MessageDeleted
	ChannelInfo    *gen.ChannelInfo
}

// BackfillProvider is implemented by the server to supply channel/message data for backfill.
type BackfillProvider interface {
	// ArchiveChannels returns all channels with archive enabled.
	ArchiveChannels() []ChannelMeta
	// ArchiveMessages returns messages for a channel after the given message ID, ordered by ID ascending.
	ArchiveMessages(channelID int64, afterMessageID int64) []MessageMeta
}

// ChannelMeta is the channel info needed for archive backfill.
type ChannelMeta struct {
	ID             int64
	Name           string
	Description    string
	ChannelType    uint8
	RetentionHours uint32
	ArchiveEnabled bool
}

// MessageMeta is the message info needed for archive sync.
type MessageMeta struct {
	ID             int64
	ChannelID      int64
	ParentID       *int64
	ThreadRootID   *int64
	AuthorUserID   *int64
	AuthorNickname string
	Content        string
	CreatedAt      int64
	EditedAt       *int64
	DeletedAt      *int64
}

// Client manages the connection to the archive service.
// It provides non-blocking enqueue methods that the chat server calls
// after broadcasting messages, edits, and deletes.
type Client struct {
	endpoint   string
	serverName string
	events     chan Event
	shutdown   chan struct{}
	done       chan struct{}
	provider   BackfillProvider

	mu   sync.Mutex
	conn *Conn // guarded by mu, may be nil
}

// NewClient creates a new archive client. Call Start() to begin connecting.
func NewClient(endpoint, serverName string, provider BackfillProvider) *Client {
	return &Client{
		endpoint:   endpoint,
		serverName: serverName,
		events:     make(chan Event, BufferCapacity),
		shutdown:   make(chan struct{}),
		done:       make(chan struct{}),
		provider:   provider,
	}
}

// Start begins the connection loop in a background goroutine.
func (c *Client) Start() {
	go c.run()
}

// Stop gracefully shuts down the archive client, draining the buffer.
func (c *Client) Stop() {
	close(c.shutdown)
	<-c.done
}

// EnqueueMessage sends a new message event to the archive service.
// Non-blocking: drops the event if the buffer is full.
func (c *Client) EnqueueMessage(msg *gen.MessageSync) {
	select {
	case c.events <- Event{MessageSync: msg}:
	default:
		log.Printf("[archive] buffer full, dropping message %d", msg.MessageId)
	}
}

// EnqueueEdit sends an edit event to the archive service.
func (c *Client) EnqueueEdit(msg *gen.MessageEdited) {
	select {
	case c.events <- Event{MessageEdited: msg}:
	default:
		log.Printf("[archive] buffer full, dropping edit for message %d", msg.MessageId)
	}
}

// EnqueueDelete sends a delete event to the archive service.
func (c *Client) EnqueueDelete(msg *gen.MessageDeleted) {
	select {
	case c.events <- Event{MessageDeleted: msg}:
	default:
		log.Printf("[archive] buffer full, dropping delete for message %d", msg.MessageId)
	}
}

// EnqueueChannelInfo sends channel info to the archive service.
func (c *Client) EnqueueChannelInfo(msg *gen.ChannelInfo) {
	select {
	case c.events <- Event{ChannelInfo: msg}:
	default:
		log.Printf("[archive] buffer full, dropping channel info for channel %d", msg.ChannelId)
	}
}

// run is the main loop: connect, handshake, backfill, then forward events.
func (c *Client) run() {
	defer close(c.done)
	delay := reconnectBaseDelay

	for {
		select {
		case <-c.shutdown:
			c.drainAndClose()
			return
		default:
		}

		err := c.connectAndServe()
		if err != nil {
			log.Printf("[archive] connection error: %v", err)
		}

		// Exponential backoff before reconnect
		select {
		case <-c.shutdown:
			c.drainAndClose()
			return
		case <-time.After(delay):
		}
		delay = delay * 2
		if delay > reconnectMaxDelay {
			delay = reconnectMaxDelay
		}
	}
}

// connectAndServe connects to the archiver, performs handshake, runs backfill,
// then forwards events from the buffer until disconnected.
func (c *Client) connectAndServe() error {
	netConn, err := net.DialTimeout("tcp", c.endpoint, 10*time.Second)
	if err != nil {
		return err
	}

	conn := NewConn(netConn)
	c.mu.Lock()
	c.conn = conn
	c.mu.Unlock()

	defer func() {
		c.mu.Lock()
		c.conn = nil
		c.mu.Unlock()
		conn.Close()
	}()

	// Handshake
	ack, err := c.handshake(conn)
	if err != nil {
		return err
	}

	// Backfill channels the archiver knows about vs what we have
	if err := c.backfill(conn, ack); err != nil {
		return err
	}

	log.Printf("[archive] connected to %s, forwarding events", c.endpoint)

	// Forward events until disconnect or shutdown
	return c.forwardEvents(conn)
}

// handshake sends a Handshake and reads the HandshakeAck.
func (c *Client) handshake(conn *Conn) (*gen.HandshakeAck, error) {
	hs := &gen.Handshake{
		ServerName:      c.serverName,
		ProtocolVersion: ArchiveProtocolVersion,
	}
	if err := conn.WriteMessage(TypeHandshake, hs); err != nil {
		return nil, err
	}

	msgType, payload, err := conn.ReadMessage()
	if err != nil {
		return nil, err
	}
	if msgType != TypeHandshakeAck {
		return nil, errUnexpectedMessage(msgType, TypeHandshakeAck)
	}

	ack, err := gen.DecodeHandshakeAck(payload)
	if err != nil {
		return nil, err
	}
	if ack.Success == 0 {
		return nil, errHandshakeRejected
	}

	log.Printf("[archive] handshake complete, archiver has %d channels", ack.ChannelCount)
	return ack, nil
}

// backfill sends channel info and any messages the archiver is missing.
func (c *Client) backfill(conn *Conn, ack *gen.HandshakeAck) error {
	if c.provider == nil {
		return nil
	}

	// Build map of archiver's last known message per channel
	archiverState := make(map[int64]int64)
	for _, ch := range ack.Channels {
		archiverState[int64(ch.ChannelId)] = int64(ch.LastMessageId)
	}

	channels := c.provider.ArchiveChannels()
	for _, ch := range channels {
		// Send channel info
		info := &gen.ChannelInfo{
			ChannelId:      uint64(ch.ID),
			Name:           ch.Name,
			Description:    ch.Description,
			ChannelType:    ch.ChannelType,
			RetentionHours: ch.RetentionHours,
			ArchiveEnabled: boolToUint8(ch.ArchiveEnabled),
		}
		if err := conn.WriteMessage(TypeChannelInfo, info); err != nil {
			return err
		}

		// Get messages after archiver's last known message
		afterID, _ := archiverState[ch.ID]
		msgs := c.provider.ArchiveMessages(ch.ID, afterID)
		if len(msgs) == 0 {
			continue
		}

		// BackfillStart
		bs := &gen.BackfillStart{
			ChannelId:     uint64(ch.ID),
			TotalMessages: uint32(len(msgs)),
		}
		if err := conn.WriteMessage(TypeBackfillStart, bs); err != nil {
			return err
		}

		// Stream messages
		for _, m := range msgs {
			ms := &gen.MessageSync{
				MessageId:      uint64(m.ID),
				ChannelId:      uint64(m.ChannelID),
				ParentId:       int64PtrToUint64Ptr(m.ParentID),
				ThreadRootId:   int64PtrToUint64Ptr(m.ThreadRootID),
				AuthorUserId:   int64PtrToUint64Ptr(m.AuthorUserID),
				AuthorNickname: m.AuthorNickname,
				Content:        m.Content,
				CreatedAt:      m.CreatedAt,
				EditedAt:       m.EditedAt,
				DeletedAt:      m.DeletedAt,
			}
			if err := conn.WriteMessage(TypeMessageSync, ms); err != nil {
				return err
			}
		}

		// BackfillEnd
		be := &gen.BackfillEnd{
			ChannelId:    uint64(ch.ID),
			MessageCount: uint32(len(msgs)),
		}
		if err := conn.WriteMessage(TypeBackfillEnd, be); err != nil {
			return err
		}

		log.Printf("[archive] backfilled %d messages for channel %s", len(msgs), ch.Name)
	}

	return nil
}

// forwardEvents reads events from the buffer and sends them to the archiver.
func (c *Client) forwardEvents(conn *Conn) error {
	for {
		select {
		case <-c.shutdown:
			return nil
		case ev := <-c.events:
			if err := c.sendEvent(conn, ev); err != nil {
				return err
			}
		}
	}
}

// sendEvent sends a single event to the archiver.
func (c *Client) sendEvent(conn *Conn, ev Event) error {
	switch {
	case ev.MessageSync != nil:
		return conn.WriteMessage(TypeMessageSync, ev.MessageSync)
	case ev.MessageEdited != nil:
		return conn.WriteMessage(TypeMessageEdited, ev.MessageEdited)
	case ev.MessageDeleted != nil:
		return conn.WriteMessage(TypeMessageDeleted, ev.MessageDeleted)
	case ev.ChannelInfo != nil:
		return conn.WriteMessage(TypeChannelInfo, ev.ChannelInfo)
	default:
		return nil
	}
}

// drainAndClose flushes remaining events and closes the connection.
func (c *Client) drainAndClose() {
	c.mu.Lock()
	conn := c.conn
	c.mu.Unlock()

	if conn == nil {
		return
	}

	// Drain with a short deadline
	timer := time.NewTimer(5 * time.Second)
	defer timer.Stop()

	for {
		select {
		case ev := <-c.events:
			if err := c.sendEvent(conn, ev); err != nil {
				conn.Close()
				return
			}
		case <-timer.C:
			conn.Close()
			return
		default:
			// Buffer empty
			conn.Close()
			return
		}
	}
}

// Helper functions

func boolToUint8(b bool) uint8 {
	if b {
		return 1
	}
	return 0
}

func int64PtrToUint64Ptr(p *int64) *uint64 {
	if p == nil {
		return nil
	}
	v := uint64(*p)
	return &v
}
