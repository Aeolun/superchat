package archiver

import (
	"log"
	"net"

	"github.com/aeolun/superchat/pkg/archive"
	gen "github.com/aeolun/superchat/pkg/archive/generated"
)

// Handler processes a single archive connection.
type Handler struct {
	conn     *archive.Conn
	store    *Store
	htmlGen  *HTMLGenerator
	serverID int64 // set after handshake
}

// NewHandler creates a handler for an incoming archive connection.
func NewHandler(netConn net.Conn, store *Store, htmlGen *HTMLGenerator) *Handler {
	return &Handler{
		conn:    archive.NewConn(netConn),
		store:   store,
		htmlGen: htmlGen,
	}
}

// Serve processes messages from the connection until it closes or shutdown is signaled.
func (h *Handler) Serve(shutdown <-chan struct{}) {
	defer h.conn.Close()

	// Expect handshake first
	serverName, err := h.handleHandshake()
	if err != nil {
		log.Printf("[archiver] handshake failed: %v", err)
		return
	}
	log.Printf("[archiver] accepted connection from server %q (id=%d)", serverName, h.serverID)

	// Process messages
	for {
		select {
		case <-shutdown:
			return
		default:
		}

		msgType, payload, err := h.conn.ReadMessage()
		if err != nil {
			log.Printf("[archiver] read error from %q: %v", serverName, err)
			return
		}

		if err := h.processMessage(msgType, payload); err != nil {
			log.Printf("[archiver] process error from %q: msg type 0x%02x: %v", serverName, msgType, err)
		}
	}
}

// handleHandshake reads the handshake and sends ack with channel state.
func (h *Handler) handleHandshake() (string, error) {
	msgType, payload, err := h.conn.ReadMessage()
	if err != nil {
		return "", err
	}
	if msgType != archive.TypeHandshake {
		return "", archive.ErrUnexpectedMessage(msgType, archive.TypeHandshake)
	}

	hs, err := gen.DecodeHandshake(payload)
	if err != nil {
		return "", err
	}

	// Get or create server record
	serverID, err := h.store.GetOrCreateServer(hs.ServerName)
	if err != nil {
		return "", err
	}
	h.serverID = serverID

	// Get channel states for backfill (filtered by this server)
	channelStates, err := h.store.GetChannelStates(serverID)
	if err != nil {
		log.Printf("[archiver] failed to get channel states: %v", err)
		channelStates = nil
	}

	channels := make([]gen.ChannelState, len(channelStates))
	for i, cs := range channelStates {
		channels[i] = gen.ChannelState{
			ChannelId:     uint64(cs.ChannelID),
			LastMessageId: uint64(cs.LastMessageID),
		}
	}

	ack := &gen.HandshakeAck{
		Success:      1,
		ChannelCount: uint16(len(channels)),
		Channels:     channels,
	}
	if err := h.conn.WriteMessage(archive.TypeHandshakeAck, ack); err != nil {
		return "", err
	}

	return hs.ServerName, nil
}

// processMessage dispatches a decoded archive message to the appropriate handler.
func (h *Handler) processMessage(msgType uint8, payload []byte) error {
	switch msgType {
	case archive.TypeChannelInfo:
		msg, err := gen.DecodeChannelInfo(payload)
		if err != nil {
			return err
		}
		return h.store.UpsertChannel(h.serverID, msg)

	case archive.TypeBackfillStart:
		msg, err := gen.DecodeBackfillStart(payload)
		if err != nil {
			return err
		}
		log.Printf("[archiver] backfill start: channel %d, %d messages", msg.ChannelId, msg.TotalMessages)
		return nil

	case archive.TypeMessageSync:
		msg, err := gen.DecodeMessageSync(payload)
		if err != nil {
			return err
		}
		return h.store.UpsertMessage(h.serverID, msg)

	case archive.TypeBackfillEnd:
		msg, err := gen.DecodeBackfillEnd(payload)
		if err != nil {
			return err
		}
		log.Printf("[archiver] backfill end: channel %d, %d messages", msg.ChannelId, msg.MessageCount)
		// Trigger full HTML regeneration (index + channel pages)
		h.htmlGen.GenerateAll()
		return nil

	case archive.TypeMessageEdited:
		msg, err := gen.DecodeMessageEdited(payload)
		if err != nil {
			return err
		}
		return h.store.UpdateMessage(h.serverID, msg)

	case archive.TypeMessageDeleted:
		msg, err := gen.DecodeMessageDeleted(payload)
		if err != nil {
			return err
		}
		return h.store.DeleteMessage(h.serverID, msg)

	default:
		log.Printf("[archiver] ignoring unknown message type 0x%02x", msgType)
		return nil
	}
}
