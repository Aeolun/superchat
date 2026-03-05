package archive

import (
	"encoding/binary"
	"fmt"
	"io"
	"net"
	"sync"

	gen "github.com/aeolun/superchat/pkg/archive/generated"
)

const (
	// MaxFrameSize is the maximum allowed archive frame size (1 MB)
	MaxFrameSize = 1 << 20

	// FrameHeaderSize is the size of the length prefix (4 bytes) + type (1 byte)
	FrameHeaderSize = 5
)

// Archive message type constants (matching the generated MessageCode values)
const (
	TypeHandshake      = uint8(gen.MessageCodeHANDSHAKE)
	TypeHandshakeAck   = uint8(gen.MessageCodeHANDSHAKEACK)
	TypeChannelInfo    = uint8(gen.MessageCodeCHANNELINFO)
	TypeBackfillStart  = uint8(gen.MessageCodeBACKFILLSTART)
	TypeMessageSync    = uint8(gen.MessageCodeMESSAGESYNC)
	TypeBackfillEnd    = uint8(gen.MessageCodeBACKFILLEND)
	TypeMessageEdited  = uint8(gen.MessageCodeMESSAGEEDITED)
	TypeMessageDeleted = uint8(gen.MessageCodeMESSAGEDELETED)
)

// Conn wraps a net.Conn with archive protocol framing.
// It provides thread-safe writing and reading of archive protocol messages.
type Conn struct {
	conn    net.Conn
	writeMu sync.Mutex
}

// NewConn wraps a net.Conn for archive protocol framing.
func NewConn(conn net.Conn) *Conn {
	return &Conn{conn: conn}
}

// WriteMessage encodes and sends a typed message over the connection.
// Thread-safe: multiple goroutines can call WriteMessage concurrently.
func (c *Conn) WriteMessage(msgType uint8, payload interface {
	Encode() ([]byte, error)
}) error {
	payloadBytes, err := payload.Encode()
	if err != nil {
		return fmt.Errorf("archive: encode payload: %w", err)
	}

	// Frame: [length (4B)][type (1B)][payload (N bytes)]
	// length = 1 (type) + len(payload)
	frameLen := 1 + len(payloadBytes)
	if frameLen > MaxFrameSize {
		return fmt.Errorf("archive: frame too large: %d bytes (max %d)", frameLen, MaxFrameSize)
	}

	buf := make([]byte, 4+frameLen)
	binary.BigEndian.PutUint32(buf[0:4], uint32(frameLen))
	buf[4] = msgType
	copy(buf[5:], payloadBytes)

	c.writeMu.Lock()
	defer c.writeMu.Unlock()

	_, err = c.conn.Write(buf)
	if err != nil {
		return fmt.Errorf("archive: write: %w", err)
	}
	return nil
}

// ReadMessage reads a single archive frame and returns the message type and raw payload bytes.
func (c *Conn) ReadMessage() (uint8, []byte, error) {
	// Read length prefix (4 bytes)
	var lenBuf [4]byte
	if _, err := io.ReadFull(c.conn, lenBuf[:]); err != nil {
		return 0, nil, fmt.Errorf("archive: read length: %w", err)
	}

	frameLen := binary.BigEndian.Uint32(lenBuf[:])
	if frameLen == 0 || frameLen > MaxFrameSize {
		return 0, nil, fmt.Errorf("archive: invalid frame length: %d", frameLen)
	}

	// Read type + payload
	frameBuf := make([]byte, frameLen)
	if _, err := io.ReadFull(c.conn, frameBuf); err != nil {
		return 0, nil, fmt.Errorf("archive: read frame: %w", err)
	}

	msgType := frameBuf[0]
	payload := frameBuf[1:]
	return msgType, payload, nil
}

// Close closes the underlying connection.
func (c *Conn) Close() error {
	return c.conn.Close()
}

// DecodePayload decodes raw payload bytes into the appropriate message struct
// based on the message type.
func DecodePayload(msgType uint8, payload []byte) (interface{}, error) {
	switch msgType {
	case TypeHandshake:
		return gen.DecodeHandshake(payload)
	case TypeHandshakeAck:
		return gen.DecodeHandshakeAck(payload)
	case TypeChannelInfo:
		return gen.DecodeChannelInfo(payload)
	case TypeBackfillStart:
		return gen.DecodeBackfillStart(payload)
	case TypeMessageSync:
		return gen.DecodeMessageSync(payload)
	case TypeBackfillEnd:
		return gen.DecodeBackfillEnd(payload)
	case TypeMessageEdited:
		return gen.DecodeMessageEdited(payload)
	case TypeMessageDeleted:
		return gen.DecodeMessageDeleted(payload)
	default:
		return nil, fmt.Errorf("archive: unknown message type: 0x%02x", msgType)
	}
}
