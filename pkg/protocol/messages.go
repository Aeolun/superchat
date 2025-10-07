package protocol

import (
	"bytes"
	"errors"
	"io"
	"time"
)

// ProtocolMessage interface - all protocol messages must implement this
type ProtocolMessage interface {
	// Encode serializes the message to bytes (convenience wrapper)
	Encode() ([]byte, error)
	// EncodeTo serializes the message directly to a writer (efficient)
	EncodeTo(w io.Writer) error
	// Decode deserializes the message from bytes
	Decode(payload []byte) error
}

// Message type constants (Client → Server)
const (
	TypeAuthRequest        = 0x01
	TypeSetNickname        = 0x02
	TypeRegisterUser       = 0x03
	TypeListChannels       = 0x04
	TypeJoinChannel        = 0x05
	TypeLeaveChannel       = 0x06
	TypeCreateChannel      = 0x07
	TypeListMessages       = 0x09
	TypePostMessage        = 0x0A
	TypeEditMessage        = 0x0B
	TypeDeleteMessage      = 0x0C
	TypeAddSSHKey          = 0x0D
	TypeChangePassword     = 0x0E
	TypeGetUserInfo        = 0x0F
	TypeUpdateSSHKeyLabel  = 0x12
	TypeDeleteSSHKey       = 0x13
	TypeListSSHKeys        = 0x14
	TypeLogout             = 0x1C
	TypePing               = 0x10
	TypeDisconnect         = 0x11
	TypeListUsers          = 0x16
	TypeSubscribeThread    = 0x51
	TypeUnsubscribeThread  = 0x52
	TypeSubscribeChannel   = 0x53
	TypeUnsubscribeChannel = 0x54
	TypeListServers        = 0x55
	TypeRegisterServer     = 0x56
	TypeHeartbeat          = 0x57
	TypeVerifyResponse     = 0x58
)

// Message type constants (Server → Client)
const (
	TypeAuthResponse      = 0x81
	TypeNicknameResponse  = 0x82
	TypeRegisterResponse  = 0x83
	TypeChannelList       = 0x84
	TypeJoinResponse      = 0x85
	TypeLeaveResponse     = 0x86
	TypeChannelCreated    = 0x87
	TypeSubchannelCreated = 0x88
	TypeMessageList       = 0x89
	TypeMessagePosted     = 0x8A
	TypeMessageEdited     = 0x8B
	TypeMessageDeleted    = 0x8C
	TypeNewMessage        = 0x8D
	TypePasswordChanged   = 0x8E
	TypeUserInfo          = 0x8F
	TypePong              = 0x90
	TypeError             = 0x91
	TypeSSHKeyLabelUpdated = 0x92
	TypeSSHKeyDeleted     = 0x93
	TypeSSHKeyList        = 0x94
	TypeSSHKeyAdded       = 0x95
	TypeServerConfig       = 0x98
	TypeSubscribeOk        = 0x99
	TypeUserList           = 0x9A
	TypeServerList         = 0x9B
	TypeRegisterAck        = 0x9C
	TypeHeartbeatAck       = 0x9D
	TypeVerifyRegistration = 0x9E
)

// Error codes
const (
	// Protocol errors (1xxx)
	ErrCodeInvalidFormat     = 1000
	ErrCodeUnsupportedVersion = 1001
	ErrCodeInvalidFrame       = 1002

	// Authentication errors (2xxx)
	ErrCodeAuthRequired = 2000

	// Authorization errors (3xxx)
	ErrCodePermissionDenied = 3000

	// Resource errors (4xxx)
	ErrCodeNotFound        = 4000
	ErrCodeChannelNotFound = 4001
	ErrCodeMessageNotFound = 4002
	ErrCodeThreadNotFound  = 4003
	ErrCodeSubchannelNotFound = 4004

	// Rate limit errors (5xxx)
	ErrCodeRateLimitExceeded = 5000
	ErrCodeMessageRateLimit  = 5001
	ErrCodeThreadSubscriptionLimit = 5004
	ErrCodeChannelSubscriptionLimit = 5005

	// Validation errors (6xxx)
	ErrCodeInvalidInput   = 6000
	ErrCodeMessageTooLong = 6001
	ErrCodeInvalidNickname = 6003
	ErrCodeNicknameRequired = 6004

	// Server errors (9xxx)
	ErrCodeInternalError = 9000
	ErrCodeDatabaseError = 9001
)

var (
	ErrNicknameTooShort = errors.New("nickname must be at least 3 characters")
	ErrNicknameTooLong  = errors.New("nickname must be at most 20 characters")
	ErrMessageTooLong   = errors.New("message content exceeds maximum length (4096 bytes)")
	ErrEmptyContent     = errors.New("message content cannot be empty")
)

// AuthRequestMessage (0x01) - Authenticate with password
type AuthRequestMessage struct {
	Nickname string
	Password string
}

func (m *AuthRequestMessage) EncodeTo(w io.Writer) error {
	if err := WriteString(w, m.Nickname); err != nil {
		return err
	}
	return WriteString(w, m.Password)
}

func (m *AuthRequestMessage) Encode() ([]byte, error) {
	buf := new(bytes.Buffer)
	if err := m.EncodeTo(buf); err != nil {
		return nil, err
	}
	return buf.Bytes(), nil
}

func (m *AuthRequestMessage) Decode(payload []byte) error {
	buf := bytes.NewReader(payload)
	nickname, err := ReadString(buf)
	if err != nil {
		return err
	}
	password, err := ReadString(buf)
	if err != nil {
		return err
	}

	m.Nickname = nickname
	m.Password = password
	return nil
}

// AuthResponseMessage (0x81) - Authentication result
type AuthResponseMessage struct {
	Success  bool
	UserID   uint64 // Only present if success=true
	Nickname string // Only present if success=true
	Message  string
}

func (m *AuthResponseMessage) EncodeTo(w io.Writer) error {
	if err := WriteBool(w, m.Success); err != nil {
		return err
	}
	if m.Success {
		if err := WriteUint64(w, m.UserID); err != nil {
			return err
		}
		if err := WriteString(w, m.Nickname); err != nil {
			return err
		}
	}
	return WriteString(w, m.Message)
}

func (m *AuthResponseMessage) Encode() ([]byte, error) {
	buf := new(bytes.Buffer)
	if err := m.EncodeTo(buf); err != nil {
		return nil, err
	}
	return buf.Bytes(), nil
}

func (m *AuthResponseMessage) Decode(payload []byte) error {
	buf := bytes.NewReader(payload)
	success, err := ReadBool(buf)
	if err != nil {
		return err
	}

	m.Success = success

	if success {
		userID, err := ReadUint64(buf)
		if err != nil {
			return err
		}
		m.UserID = userID

		nickname, err := ReadString(buf)
		if err != nil {
			return err
		}
		m.Nickname = nickname
	}

	message, err := ReadString(buf)
	if err != nil {
		return err
	}
	m.Message = message

	return nil
}

// SetNicknameMessage (0x02) - Set/change nickname
type SetNicknameMessage struct {
	Nickname string
}

func (m *SetNicknameMessage) EncodeTo(w io.Writer) error {
	// Validate nickname
	if len(m.Nickname) < 3 {
		return ErrNicknameTooShort
	}
	if len(m.Nickname) > 20 {
		return ErrNicknameTooLong
	}

	return WriteString(w, m.Nickname)
}

func (m *SetNicknameMessage) Encode() ([]byte, error) {
	buf := new(bytes.Buffer)
	if err := m.EncodeTo(buf); err != nil {
		return nil, err
	}
	return buf.Bytes(), nil
}

func (m *SetNicknameMessage) Decode(payload []byte) error {
	buf := bytes.NewReader(payload)
	nickname, err := ReadString(buf)
	if err != nil {
		return err
	}

	// Validate nickname
	if len(nickname) < 3 {
		return ErrNicknameTooShort
	}
	if len(nickname) > 20 {
		return ErrNicknameTooLong
	}

	m.Nickname = nickname
	return nil
}

// NicknameResponseMessage (0x82) - Response to SET_NICKNAME
type NicknameResponseMessage struct {
	Success bool
	Message string
}

func (m *NicknameResponseMessage) EncodeTo(w io.Writer) error {
	if err := WriteBool(w, m.Success); err != nil {
		return err
	}
	return WriteString(w, m.Message)
}

func (m *NicknameResponseMessage) Encode() ([]byte, error) {
	buf := new(bytes.Buffer)
	if err := m.EncodeTo(buf); err != nil {
		return nil, err
	}
	return buf.Bytes(), nil
}

func (m *NicknameResponseMessage) Decode(payload []byte) error {
	buf := bytes.NewReader(payload)
	success, err := ReadBool(buf)
	if err != nil {
		return err
	}
	message, err := ReadString(buf)
	if err != nil {
		return err
	}

	m.Success = success
	m.Message = message
	return nil
}

// RegisterUserMessage (0x03) - Register current nickname with password
type RegisterUserMessage struct {
	Password string
}

func (m *RegisterUserMessage) EncodeTo(w io.Writer) error {
	return WriteString(w, m.Password)
}

func (m *RegisterUserMessage) Encode() ([]byte, error) {
	buf := new(bytes.Buffer)
	if err := m.EncodeTo(buf); err != nil {
		return nil, err
	}
	return buf.Bytes(), nil
}

func (m *RegisterUserMessage) Decode(payload []byte) error {
	buf := bytes.NewReader(payload)
	password, err := ReadString(buf)
	if err != nil {
		return err
	}

	m.Password = password
	return nil
}

// RegisterResponseMessage (0x83) - Registration result
type RegisterResponseMessage struct {
	Success bool
	UserID  uint64 // Only present if success=true
	Message string
}

func (m *RegisterResponseMessage) EncodeTo(w io.Writer) error {
	if err := WriteBool(w, m.Success); err != nil {
		return err
	}
	if m.Success {
		if err := WriteUint64(w, m.UserID); err != nil {
			return err
		}
	}
	return WriteString(w, m.Message)
}

func (m *RegisterResponseMessage) Encode() ([]byte, error) {
	buf := new(bytes.Buffer)
	if err := m.EncodeTo(buf); err != nil {
		return nil, err
	}
	return buf.Bytes(), nil
}

func (m *RegisterResponseMessage) Decode(payload []byte) error {
	buf := bytes.NewReader(payload)
	success, err := ReadBool(buf)
	if err != nil {
		return err
	}

	m.Success = success

	if success {
		userID, err := ReadUint64(buf)
		if err != nil {
			return err
		}
		m.UserID = userID
	}

	message, err := ReadString(buf)
	if err != nil {
		return err
	}
	m.Message = message

	return nil
}

// LogoutMessage (0x15) - Clear authentication and become anonymous
type LogoutMessage struct{}

func (m *LogoutMessage) EncodeTo(w io.Writer) error {
	// Empty message
	return nil
}

func (m *LogoutMessage) Encode() ([]byte, error) {
	return []byte{}, nil
}

func (m *LogoutMessage) Decode(payload []byte) error {
	// Empty message - nothing to decode
	return nil
}

// ListChannelsMessage (0x04) - Request channel list
type ListChannelsMessage struct {
	FromChannelID uint64
	Limit         uint16
}

func (m *ListChannelsMessage) EncodeTo(w io.Writer) error {
	if err := WriteUint64(w, m.FromChannelID); err != nil {
		return err
	}
	return WriteUint16(w, m.Limit)
}

func (m *ListChannelsMessage) Encode() ([]byte, error) {
	buf := new(bytes.Buffer)
	if err := m.EncodeTo(buf); err != nil {
		return nil, err
	}
	return buf.Bytes(), nil
}

func (m *ListChannelsMessage) Decode(payload []byte) error {
	buf := bytes.NewReader(payload)
	fromID, err := ReadUint64(buf)
	if err != nil {
		return err
	}
	limit, err := ReadUint16(buf)
	if err != nil {
		return err
	}

	m.FromChannelID = fromID
	m.Limit = limit
	return nil
}

// Channel represents a channel in CHANNEL_LIST
type Channel struct {
	ID           uint64
	Name         string
	Description  string
	UserCount    uint32
	IsOperator   bool
	Type         uint8
	RetentionHours uint32
}

// ChannelListMessage (0x84) - List of channels
type ChannelListMessage struct {
	Channels []Channel
}

func (m *ChannelListMessage) EncodeTo(w io.Writer) error {
	// Write channel count
	if err := WriteUint16(w, uint16(len(m.Channels))); err != nil {
		return err
	}

	// Write each channel
	for _, ch := range m.Channels {
		if err := WriteUint64(w, ch.ID); err != nil {
			return err
		}
		if err := WriteString(w, ch.Name); err != nil {
			return err
		}
		if err := WriteString(w, ch.Description); err != nil {
			return err
		}
		if err := WriteUint32(w, ch.UserCount); err != nil {
			return err
		}
		if err := WriteBool(w, ch.IsOperator); err != nil {
			return err
		}
		if err := WriteUint8(w, ch.Type); err != nil {
			return err
		}
		if err := WriteUint32(w, ch.RetentionHours); err != nil {
			return err
		}
	}

	return nil
}

func (m *ChannelListMessage) Encode() ([]byte, error) {
	buf := new(bytes.Buffer)
	if err := m.EncodeTo(buf); err != nil {
		return nil, err
	}
	return buf.Bytes(), nil
}

func (m *ChannelListMessage) Decode(payload []byte) error {
	buf := bytes.NewReader(payload)

	// Read channel count
	count, err := ReadUint16(buf)
	if err != nil {
		return err
	}

	// Read each channel
	m.Channels = make([]Channel, count)
	for i := uint16(0); i < count; i++ {
		id, err := ReadUint64(buf)
		if err != nil {
			return err
		}
		name, err := ReadString(buf)
		if err != nil {
			return err
		}
		desc, err := ReadString(buf)
		if err != nil {
			return err
		}
		userCount, err := ReadUint32(buf)
		if err != nil {
			return err
		}
		isOp, err := ReadBool(buf)
		if err != nil {
			return err
		}
		chType, err := ReadUint8(buf)
		if err != nil {
			return err
		}
		retention, err := ReadUint32(buf)
		if err != nil {
			return err
		}

		m.Channels[i] = Channel{
			ID:              id,
			Name:            name,
			Description:     desc,
			UserCount:       userCount,
			IsOperator:      isOp,
			Type:            chType,
			RetentionHours:  retention,
		}
	}

	return nil
}

// JoinChannelMessage (0x05) - Join a channel
type JoinChannelMessage struct {
	ChannelID    uint64
	SubchannelID *uint64 // V1: always nil (no subchannels)
}

func (m *JoinChannelMessage) EncodeTo(w io.Writer) error {
	if err := WriteUint64(w, m.ChannelID); err != nil {
		return err
	}
	return WriteOptionalUint64(w, m.SubchannelID)
}

func (m *JoinChannelMessage) Encode() ([]byte, error) {
	buf := new(bytes.Buffer)
	if err := m.EncodeTo(buf); err != nil {
		return nil, err
	}
	return buf.Bytes(), nil
}

func (m *JoinChannelMessage) Decode(payload []byte) error {
	buf := bytes.NewReader(payload)
	channelID, err := ReadUint64(buf)
	if err != nil {
		return err
	}
	subchannelID, err := ReadOptionalUint64(buf)
	if err != nil {
		return err
	}

	m.ChannelID = channelID
	m.SubchannelID = subchannelID
	return nil
}

// JoinResponseMessage (0x85) - Response to JOIN_CHANNEL
type JoinResponseMessage struct {
	Success      bool
	ChannelID    uint64
	SubchannelID *uint64
	Message      string
}

func (m *JoinResponseMessage) EncodeTo(w io.Writer) error {
	if err := WriteBool(w, m.Success); err != nil {
		return err
	}
	if err := WriteUint64(w, m.ChannelID); err != nil {
		return err
	}
	if err := WriteOptionalUint64(w, m.SubchannelID); err != nil {
		return err
	}
	return WriteString(w, m.Message)
}

func (m *JoinResponseMessage) Encode() ([]byte, error) {
	buf := new(bytes.Buffer)
	if err := m.EncodeTo(buf); err != nil {
		return nil, err
	}
	return buf.Bytes(), nil
}

func (m *JoinResponseMessage) Decode(payload []byte) error {
	buf := bytes.NewReader(payload)
	success, err := ReadBool(buf)
	if err != nil {
		return err
	}
	channelID, err := ReadUint64(buf)
	if err != nil {
		return err
	}
	subchannelID, err := ReadOptionalUint64(buf)
	if err != nil {
		return err
	}
	message, err := ReadString(buf)
	if err != nil {
		return err
	}

	m.Success = success
	m.ChannelID = channelID
	m.SubchannelID = subchannelID
	m.Message = message
	return nil
}

// CreateChannelMessage (0x07) - Create a new channel (V2+, requires registered user)
type CreateChannelMessage struct {
	Name              string // URL-friendly name (e.g., "general", "random")
	DisplayName       string // Human-readable name (e.g., "#general", "#random")
	Description       *string
	ChannelType       uint8  // 1=forum, 2=chat (V2+ only supports forum)
	RetentionHours    uint32 // Message retention in hours
}

func (m *CreateChannelMessage) EncodeTo(w io.Writer) error {
	if err := WriteString(w, m.Name); err != nil {
		return err
	}
	if err := WriteString(w, m.DisplayName); err != nil {
		return err
	}
	if err := WriteOptionalString(w, m.Description); err != nil {
		return err
	}
	if err := WriteUint8(w, m.ChannelType); err != nil {
		return err
	}
	return WriteUint32(w, m.RetentionHours)
}

func (m *CreateChannelMessage) Encode() ([]byte, error) {
	buf := new(bytes.Buffer)
	if err := m.EncodeTo(buf); err != nil {
		return nil, err
	}
	return buf.Bytes(), nil
}

func (m *CreateChannelMessage) Decode(payload []byte) error {
	buf := bytes.NewReader(payload)
	name, err := ReadString(buf)
	if err != nil {
		return err
	}
	displayName, err := ReadString(buf)
	if err != nil {
		return err
	}
	description, err := ReadOptionalString(buf)
	if err != nil {
		return err
	}
	channelType, err := ReadUint8(buf)
	if err != nil {
		return err
	}
	retentionHours, err := ReadUint32(buf)
	if err != nil {
		return err
	}

	m.Name = name
	m.DisplayName = displayName
	m.Description = description
	m.ChannelType = channelType
	m.RetentionHours = retentionHours
	return nil
}

// ChannelCreatedMessage (0x87) - Response to CREATE_CHANNEL + broadcast to all connected clients
// Hybrid message: sent to creator as confirmation, also broadcast to all others if success=true
type ChannelCreatedMessage struct {
	Success        bool
	ChannelID      uint64 // Only present if Success=true
	Name           string // Only present if Success=true
	Description    string // Only present if Success=true
	Type           uint8  // Only present if Success=true
	RetentionHours uint32 // Only present if Success=true
	Message        string // Error if failed, confirmation if success
}

func (m *ChannelCreatedMessage) EncodeTo(w io.Writer) error {
	if err := WriteBool(w, m.Success); err != nil {
		return err
	}

	// Only write channel data if success=true
	if m.Success {
		if err := WriteUint64(w, m.ChannelID); err != nil {
			return err
		}
		if err := WriteString(w, m.Name); err != nil {
			return err
		}
		if err := WriteString(w, m.Description); err != nil {
			return err
		}
		if err := WriteUint8(w, m.Type); err != nil {
			return err
		}
		if err := WriteUint32(w, m.RetentionHours); err != nil {
			return err
		}
	}

	return WriteString(w, m.Message)
}

func (m *ChannelCreatedMessage) Encode() ([]byte, error) {
	buf := new(bytes.Buffer)
	if err := m.EncodeTo(buf); err != nil {
		return nil, err
	}
	return buf.Bytes(), nil
}

func (m *ChannelCreatedMessage) Decode(payload []byte) error {
	buf := bytes.NewReader(payload)
	success, err := ReadBool(buf)
	if err != nil {
		return err
	}

	m.Success = success

	// Only read channel data if success=true
	if success {
		channelID, err := ReadUint64(buf)
		if err != nil {
			return err
		}
		name, err := ReadString(buf)
		if err != nil {
			return err
		}
		description, err := ReadString(buf)
		if err != nil {
			return err
		}
		channelType, err := ReadUint8(buf)
		if err != nil {
			return err
		}
		retentionHours, err := ReadUint32(buf)
		if err != nil {
			return err
		}

		m.ChannelID = channelID
		m.Name = name
		m.Description = description
		m.Type = channelType
		m.RetentionHours = retentionHours
	}

	message, err := ReadString(buf)
	if err != nil {
		return err
	}
	m.Message = message

	return nil
}

// ListMessagesMessage (0x09) - Request messages
type ListMessagesMessage struct {
	ChannelID    uint64
	SubchannelID *uint64
	Limit        uint16
	BeforeID     *uint64
	ParentID     *uint64
	AfterID      *uint64
}

func (m *ListMessagesMessage) EncodeTo(w io.Writer) error {
	if err := WriteUint64(w, m.ChannelID); err != nil {
		return err
	}
	if err := WriteOptionalUint64(w, m.SubchannelID); err != nil {
		return err
	}
	if err := WriteUint16(w, m.Limit); err != nil {
		return err
	}
	if err := WriteOptionalUint64(w, m.BeforeID); err != nil {
		return err
	}
	if err := WriteOptionalUint64(w, m.ParentID); err != nil {
		return err
	}
	return WriteOptionalUint64(w, m.AfterID)
}

func (m *ListMessagesMessage) Encode() ([]byte, error) {
	buf := new(bytes.Buffer)
	if err := m.EncodeTo(buf); err != nil {
		return nil, err
	}
	return buf.Bytes(), nil
}

func (m *ListMessagesMessage) Decode(payload []byte) error {
	buf := bytes.NewReader(payload)
	channelID, err := ReadUint64(buf)
	if err != nil {
		return err
	}
	subchannelID, err := ReadOptionalUint64(buf)
	if err != nil {
		return err
	}
	limit, err := ReadUint16(buf)
	if err != nil {
		return err
	}
	beforeID, err := ReadOptionalUint64(buf)
	if err != nil {
		return err
	}
	parentID, err := ReadOptionalUint64(buf)
	if err != nil {
		return err
	}
	afterID, err := ReadOptionalUint64(buf)
	if err != nil {
		return err
	}

	m.ChannelID = channelID
	m.SubchannelID = subchannelID
	m.Limit = limit
	m.BeforeID = beforeID
	m.ParentID = parentID
	m.AfterID = afterID
	return nil
}

// Message represents a single message
type Message struct {
	ID             uint64
	ChannelID      uint64
	SubchannelID   *uint64
	ParentID       *uint64
	AuthorUserID   *uint64
	AuthorNickname string // Only populated for anonymous users (when AuthorUserID IS NULL)
	Content        string
	CreatedAt      time.Time
	EditedAt       *time.Time
	ReplyCount     uint32
}

// MessageListMessage (0x89) - List of messages
type MessageListMessage struct {
	ChannelID    uint64
	SubchannelID *uint64
	ParentID     *uint64
	Messages     []Message
}

func (m *MessageListMessage) EncodeTo(w io.Writer) error {
	if err := WriteUint64(w, m.ChannelID); err != nil {
		return err
	}
	if err := WriteOptionalUint64(w, m.SubchannelID); err != nil {
		return err
	}
	if err := WriteOptionalUint64(w, m.ParentID); err != nil {
		return err
	}
	if err := WriteUint16(w, uint16(len(m.Messages))); err != nil {
		return err
	}

	for _, msg := range m.Messages {
		if err := WriteUint64(w, msg.ID); err != nil {
			return err
		}
		if err := WriteUint64(w, msg.ChannelID); err != nil {
			return err
		}
		if err := WriteOptionalUint64(w, msg.SubchannelID); err != nil {
			return err
		}
		if err := WriteOptionalUint64(w, msg.ParentID); err != nil {
			return err
		}
		if err := WriteOptionalUint64(w, msg.AuthorUserID); err != nil {
			return err
		}
		if err := WriteString(w, msg.AuthorNickname); err != nil {
			return err
		}
		if err := WriteString(w, msg.Content); err != nil {
			return err
		}
		if err := WriteTimestamp(w, msg.CreatedAt); err != nil {
			return err
		}
		if err := WriteOptionalTimestamp(w, msg.EditedAt); err != nil {
			return err
		}
		if err := WriteUint32(w, msg.ReplyCount); err != nil {
			return err
		}
	}

	return nil
}

func (m *MessageListMessage) Encode() ([]byte, error) {
	buf := new(bytes.Buffer)
	if err := m.EncodeTo(buf); err != nil {
		return nil, err
	}
	return buf.Bytes(), nil
}

func (m *MessageListMessage) Decode(payload []byte) error {
	buf := bytes.NewReader(payload)

	channelID, err := ReadUint64(buf)
	if err != nil {
		return err
	}
	subchannelID, err := ReadOptionalUint64(buf)
	if err != nil {
		return err
	}
	parentID, err := ReadOptionalUint64(buf)
	if err != nil {
		return err
	}
	count, err := ReadUint16(buf)
	if err != nil {
		return err
	}

	m.ChannelID = channelID
	m.SubchannelID = subchannelID
	m.ParentID = parentID
	m.Messages = make([]Message, count)

	for i := uint16(0); i < count; i++ {
		id, err := ReadUint64(buf)
		if err != nil {
			return err
		}
		chID, err := ReadUint64(buf)
		if err != nil {
			return err
		}
		subID, err := ReadOptionalUint64(buf)
		if err != nil {
			return err
		}
		parID, err := ReadOptionalUint64(buf)
		if err != nil {
			return err
		}
		authorID, err := ReadOptionalUint64(buf)
		if err != nil {
			return err
		}
		authorNick, err := ReadString(buf)
		if err != nil {
			return err
		}
		content, err := ReadString(buf)
		if err != nil {
			return err
		}
		createdAt, err := ReadTimestamp(buf)
		if err != nil {
			return err
		}
		editedAt, err := ReadOptionalTimestamp(buf)
		if err != nil {
			return err
		}
		replyCount, err := ReadUint32(buf)
		if err != nil {
			return err
		}

		m.Messages[i] = Message{
			ID:             id,
			ChannelID:      chID,
			SubchannelID:   subID,
			ParentID:       parID,
			AuthorUserID:   authorID,
			AuthorNickname: authorNick,
			Content:        content,
			CreatedAt:      createdAt,
			EditedAt:       editedAt,
			ReplyCount:     replyCount,
		}
	}

	return nil
}

// PostMessageMessage (0x0A) - Post a new message
type PostMessageMessage struct {
	ChannelID    uint64
	SubchannelID *uint64
	ParentID     *uint64
	Content      string
}

func (m *PostMessageMessage) EncodeTo(w io.Writer) error {
	// Validate content
	if len(m.Content) == 0 {
		return ErrEmptyContent
	}
	if len(m.Content) > 4096 {
		return ErrMessageTooLong
	}

	if err := WriteUint64(w, m.ChannelID); err != nil {
		return err
	}
	if err := WriteOptionalUint64(w, m.SubchannelID); err != nil {
		return err
	}
	if err := WriteOptionalUint64(w, m.ParentID); err != nil {
		return err
	}
	return WriteString(w, m.Content)
}

func (m *PostMessageMessage) Encode() ([]byte, error) {
	buf := new(bytes.Buffer)
	if err := m.EncodeTo(buf); err != nil {
		return nil, err
	}
	return buf.Bytes(), nil
}

func (m *PostMessageMessage) Decode(payload []byte) error {
	buf := bytes.NewReader(payload)
	channelID, err := ReadUint64(buf)
	if err != nil {
		return err
	}
	subchannelID, err := ReadOptionalUint64(buf)
	if err != nil {
		return err
	}
	parentID, err := ReadOptionalUint64(buf)
	if err != nil {
		return err
	}
	content, err := ReadString(buf)
	if err != nil {
		return err
	}

	// Validate content
	if len(content) == 0 {
		return ErrEmptyContent
	}
	if len(content) > 4096 {
		return ErrMessageTooLong
	}

	m.ChannelID = channelID
	m.SubchannelID = subchannelID
	m.ParentID = parentID
	m.Content = content
	return nil
}

// MessagePostedMessage (0x8A) - Confirmation of message post
type MessagePostedMessage struct {
	Success   bool
	MessageID uint64
	Message   string
}

func (m *MessagePostedMessage) EncodeTo(w io.Writer) error {
	if err := WriteBool(w, m.Success); err != nil {
		return err
	}
	if err := WriteUint64(w, m.MessageID); err != nil {
		return err
	}
	return WriteString(w, m.Message)
}

func (m *MessagePostedMessage) Encode() ([]byte, error) {
	buf := new(bytes.Buffer)
	if err := m.EncodeTo(buf); err != nil {
		return nil, err
	}
	return buf.Bytes(), nil
}

func (m *MessagePostedMessage) Decode(payload []byte) error {
	buf := bytes.NewReader(payload)
	success, err := ReadBool(buf)
	if err != nil {
		return err
	}
	messageID, err := ReadUint64(buf)
	if err != nil {
		return err
	}
	message, err := ReadString(buf)
	if err != nil {
		return err
	}

	m.Success = success
	m.MessageID = messageID
	m.Message = message
	return nil
}

// EditMessageMessage (0x0B) - Edit an existing message
type EditMessageMessage struct {
	MessageID  uint64
	NewContent string
}

func (m *EditMessageMessage) EncodeTo(w io.Writer) error {
	// Validate content
	if len(m.NewContent) == 0 {
		return ErrEmptyContent
	}
	if len(m.NewContent) > 4096 {
		return ErrMessageTooLong
	}

	if err := WriteUint64(w, m.MessageID); err != nil {
		return err
	}
	return WriteString(w, m.NewContent)
}

func (m *EditMessageMessage) Encode() ([]byte, error) {
	buf := new(bytes.Buffer)
	if err := m.EncodeTo(buf); err != nil {
		return nil, err
	}
	return buf.Bytes(), nil
}

func (m *EditMessageMessage) Decode(payload []byte) error {
	buf := bytes.NewReader(payload)
	messageID, err := ReadUint64(buf)
	if err != nil {
		return err
	}
	content, err := ReadString(buf)
	if err != nil {
		return err
	}

	// Validate content
	if len(content) == 0 {
		return ErrEmptyContent
	}
	if len(content) > 4096 {
		return ErrMessageTooLong
	}

	m.MessageID = messageID
	m.NewContent = content
	return nil
}

// MessageEditedMessage (0x8B) - Edit confirmation + real-time broadcast
type MessageEditedMessage struct {
	Success    bool
	MessageID  uint64
	EditedAt   time.Time
	NewContent string
	Message    string // Error message if failed
}

func (m *MessageEditedMessage) EncodeTo(w io.Writer) error {
	if err := WriteBool(w, m.Success); err != nil {
		return err
	}
	if err := WriteUint64(w, m.MessageID); err != nil {
		return err
	}
	if m.Success {
		if err := WriteTimestamp(w, m.EditedAt); err != nil {
			return err
		}
		if err := WriteString(w, m.NewContent); err != nil {
			return err
		}
	}
	return WriteString(w, m.Message)
}

func (m *MessageEditedMessage) Encode() ([]byte, error) {
	buf := new(bytes.Buffer)
	if err := m.EncodeTo(buf); err != nil {
		return nil, err
	}
	return buf.Bytes(), nil
}

func (m *MessageEditedMessage) Decode(payload []byte) error {
	buf := bytes.NewReader(payload)
	success, err := ReadBool(buf)
	if err != nil {
		return err
	}
	messageID, err := ReadUint64(buf)
	if err != nil {
		return err
	}

	m.Success = success
	m.MessageID = messageID

	if success {
		editedAt, err := ReadTimestamp(buf)
		if err != nil {
			return err
		}
		newContent, err := ReadString(buf)
		if err != nil {
			return err
		}
		m.EditedAt = editedAt
		m.NewContent = newContent
	}

	message, err := ReadString(buf)
	if err != nil {
		return err
	}
	m.Message = message

	return nil
}

// DeleteMessageMessage (0x0C) - Delete a message
type DeleteMessageMessage struct {
	MessageID uint64
}

func (m *DeleteMessageMessage) EncodeTo(w io.Writer) error {
	return WriteUint64(w, m.MessageID)
}

func (m *DeleteMessageMessage) Encode() ([]byte, error) {
	buf := new(bytes.Buffer)
	if err := m.EncodeTo(buf); err != nil {
		return nil, err
	}
	return buf.Bytes(), nil
}

func (m *DeleteMessageMessage) Decode(payload []byte) error {
	buf := bytes.NewReader(payload)
	messageID, err := ReadUint64(buf)
	if err != nil {
		return err
	}

	m.MessageID = messageID
	return nil
}

// MessageDeletedMessage (0x8C) - Confirmation of deletion + broadcast
type MessageDeletedMessage struct {
	Success   bool
	MessageID uint64
	DeletedAt time.Time
	Message   string
}

func (m *MessageDeletedMessage) EncodeTo(w io.Writer) error {
	if err := WriteBool(w, m.Success); err != nil {
		return err
	}
	if err := WriteUint64(w, m.MessageID); err != nil {
		return err
	}
	if m.Success {
		if err := WriteTimestamp(w, m.DeletedAt); err != nil {
			return err
		}
	}
	return WriteString(w, m.Message)
}

func (m *MessageDeletedMessage) Encode() ([]byte, error) {
	buf := new(bytes.Buffer)
	if err := m.EncodeTo(buf); err != nil {
		return nil, err
	}
	return buf.Bytes(), nil
}

func (m *MessageDeletedMessage) Decode(payload []byte) error {
	buf := bytes.NewReader(payload)
	success, err := ReadBool(buf)
	if err != nil {
		return err
	}
	messageID, err := ReadUint64(buf)
	if err != nil {
		return err
	}

	m.Success = success
	m.MessageID = messageID

	if success {
		deletedAt, err := ReadTimestamp(buf)
		if err != nil {
			return err
		}
		m.DeletedAt = deletedAt
	}

	message, err := ReadString(buf)
	if err != nil {
		return err
	}
	m.Message = message

	return nil
}

// PingMessage (0x10) - Keepalive ping
type PingMessage struct {
	Timestamp int64
}

func (m *PingMessage) EncodeTo(w io.Writer) error {
	return WriteInt64(w, m.Timestamp)
}

func (m *PingMessage) Encode() ([]byte, error) {
	buf := new(bytes.Buffer)
	if err := m.EncodeTo(buf); err != nil {
		return nil, err
	}
	return buf.Bytes(), nil
}

func (m *PingMessage) Decode(payload []byte) error {
	buf := bytes.NewReader(payload)
	timestamp, err := ReadInt64(buf)
	if err != nil {
		return err
	}

	m.Timestamp = timestamp
	return nil
}

// PongMessage (0x90) - Ping response
type PongMessage struct {
	ClientTimestamp int64
}

func (m *PongMessage) EncodeTo(w io.Writer) error {
	return WriteInt64(w, m.ClientTimestamp)
}

func (m *PongMessage) Encode() ([]byte, error) {
	buf := new(bytes.Buffer)
	if err := m.EncodeTo(buf); err != nil {
		return nil, err
	}
	return buf.Bytes(), nil
}

func (m *PongMessage) Decode(payload []byte) error {
	buf := bytes.NewReader(payload)
	timestamp, err := ReadInt64(buf)
	if err != nil {
		return err
	}

	m.ClientTimestamp = timestamp
	return nil
}

// ErrorMessage (0x91) - Generic error response
type ErrorMessage struct {
	ErrorCode uint16
	Message   string
}

func (m *ErrorMessage) EncodeTo(w io.Writer) error {
	if err := WriteUint16(w, m.ErrorCode); err != nil {
		return err
	}
	return WriteString(w, m.Message)
}

func (m *ErrorMessage) Encode() ([]byte, error) {
	buf := new(bytes.Buffer)
	if err := m.EncodeTo(buf); err != nil {
		return nil, err
	}
	return buf.Bytes(), nil
}

func (m *ErrorMessage) Decode(payload []byte) error {
	buf := bytes.NewReader(payload)
	errorCode, err := ReadUint16(buf)
	if err != nil {
		return err
	}
	message, err := ReadString(buf)
	if err != nil {
		return err
	}

	m.ErrorCode = errorCode
	m.Message = message
	return nil
}

// ServerConfigMessage (0x98) - Server configuration and limits
type ServerConfigMessage struct {
	ProtocolVersion         uint8
	MaxMessageRate          uint16
	MaxChannelCreates       uint16
	InactiveCleanupDays     uint16
	MaxConnectionsPerIP     uint8
	MaxMessageLength        uint32
	MaxThreadSubscriptions  uint16
	MaxChannelSubscriptions uint16
	DirectoryEnabled        bool
}

func (m *ServerConfigMessage) EncodeTo(w io.Writer) error {
	if err := WriteUint8(w, m.ProtocolVersion); err != nil {
		return err
	}
	if err := WriteUint16(w, m.MaxMessageRate); err != nil {
		return err
	}
	if err := WriteUint16(w, m.MaxChannelCreates); err != nil {
		return err
	}
	if err := WriteUint16(w, m.InactiveCleanupDays); err != nil {
		return err
	}
	if err := WriteUint8(w, m.MaxConnectionsPerIP); err != nil {
		return err
	}
	if err := WriteUint32(w, m.MaxMessageLength); err != nil {
		return err
	}
	if err := WriteUint16(w, m.MaxThreadSubscriptions); err != nil {
		return err
	}
	if err := WriteUint16(w, m.MaxChannelSubscriptions); err != nil {
		return err
	}
	return WriteBool(w, m.DirectoryEnabled)
}

func (m *ServerConfigMessage) Encode() ([]byte, error) {
	buf := new(bytes.Buffer)
	if err := m.EncodeTo(buf); err != nil {
		return nil, err
	}
	return buf.Bytes(), nil
}

func (m *ServerConfigMessage) Decode(payload []byte) error {
	buf := bytes.NewReader(payload)
	protocolVersion, err := ReadUint8(buf)
	if err != nil {
		return err
	}
	maxMessageRate, err := ReadUint16(buf)
	if err != nil {
		return err
	}
	maxChannelCreates, err := ReadUint16(buf)
	if err != nil {
		return err
	}
	inactiveCleanup, err := ReadUint16(buf)
	if err != nil {
		return err
	}
	maxConnsPerIP, err := ReadUint8(buf)
	if err != nil {
		return err
	}
	maxMsgLen, err := ReadUint32(buf)
	if err != nil {
		return err
	}
	maxThreadSubs, err := ReadUint16(buf)
	if err != nil {
		return err
	}
	maxChannelSubs, err := ReadUint16(buf)
	if err != nil {
		return err
	}

	m.ProtocolVersion = protocolVersion
	m.MaxMessageRate = maxMessageRate
	m.MaxChannelCreates = maxChannelCreates
	m.InactiveCleanupDays = inactiveCleanup
	m.MaxConnectionsPerIP = maxConnsPerIP
	m.MaxMessageLength = maxMsgLen
	m.MaxThreadSubscriptions = maxThreadSubs
	m.MaxChannelSubscriptions = maxChannelSubs

	directoryEnabled, err := ReadBool(buf)
	if err != nil {
		return err
	}
	m.DirectoryEnabled = directoryEnabled

	return nil
}

// NewMessageMessage (0x8D) - Real-time new message broadcast
// Uses the same format as Message in MESSAGE_LIST
type NewMessageMessage Message

func (m *NewMessageMessage) EncodeTo(w io.Writer) error {
	if err := WriteUint64(w, m.ID); err != nil {
		return err
	}
	if err := WriteUint64(w, m.ChannelID); err != nil {
		return err
	}
	if err := WriteOptionalUint64(w, m.SubchannelID); err != nil {
		return err
	}
	if err := WriteOptionalUint64(w, m.ParentID); err != nil {
		return err
	}
	if err := WriteOptionalUint64(w, m.AuthorUserID); err != nil {
		return err
	}
	if err := WriteString(w, m.AuthorNickname); err != nil {
		return err
	}
	if err := WriteString(w, m.Content); err != nil {
		return err
	}
	if err := WriteTimestamp(w, m.CreatedAt); err != nil {
		return err
	}
	if err := WriteOptionalTimestamp(w, m.EditedAt); err != nil {
		return err
	}
	return WriteUint32(w, m.ReplyCount)
}

func (m *NewMessageMessage) Encode() ([]byte, error) {
	buf := new(bytes.Buffer)
	if err := m.EncodeTo(buf); err != nil {
		return nil, err
	}
	return buf.Bytes(), nil
}

func (m *NewMessageMessage) Decode(payload []byte) error {
	buf := bytes.NewReader(payload)

	id, err := ReadUint64(buf)
	if err != nil {
		return err
	}
	channelID, err := ReadUint64(buf)
	if err != nil {
		return err
	}
	subchannelID, err := ReadOptionalUint64(buf)
	if err != nil {
		return err
	}
	parentID, err := ReadOptionalUint64(buf)
	if err != nil {
		return err
	}
	authorUserID, err := ReadOptionalUint64(buf)
	if err != nil {
		return err
	}
	authorNickname, err := ReadString(buf)
	if err != nil {
		return err
	}
	content, err := ReadString(buf)
	if err != nil {
		return err
	}
	createdAt, err := ReadTimestamp(buf)
	if err != nil {
		return err
	}
	editedAt, err := ReadOptionalTimestamp(buf)
	if err != nil {
		return err
	}
	replyCount, err := ReadUint32(buf)
	if err != nil {
		return err
	}

	m.ID = id
	m.ChannelID = channelID
	m.SubchannelID = subchannelID
	m.ParentID = parentID
	m.AuthorUserID = authorUserID
	m.AuthorNickname = authorNickname
	m.Content = content
	m.CreatedAt = createdAt
	m.EditedAt = editedAt
	m.ReplyCount = replyCount

	return nil
}

// DisconnectMessage (0x11) - Graceful disconnect notification
type DisconnectMessage struct {
	// Empty message - just signals intent to disconnect
}

func (m *DisconnectMessage) EncodeTo(w io.Writer) error {
	// No payload
	return nil
}

func (m *DisconnectMessage) Encode() ([]byte, error) {
	return []byte{}, nil
}

func (m *DisconnectMessage) Decode(payload []byte) error {
	// No payload to decode
	return nil
}

// SubscribeThreadMessage (0x51) - Subscribe to a thread
type SubscribeThreadMessage struct {
	ThreadID uint64
}

func (m *SubscribeThreadMessage) EncodeTo(w io.Writer) error {
	return WriteUint64(w, m.ThreadID)
}

func (m *SubscribeThreadMessage) Encode() ([]byte, error) {
	buf := new(bytes.Buffer)
	if err := m.EncodeTo(buf); err != nil {
		return nil, err
	}
	return buf.Bytes(), nil
}

func (m *SubscribeThreadMessage) Decode(payload []byte) error {
	buf := bytes.NewReader(payload)
	threadID, err := ReadUint64(buf)
	if err != nil {
		return err
	}
	m.ThreadID = threadID
	return nil
}

// UnsubscribeThreadMessage (0x52) - Unsubscribe from a thread
type UnsubscribeThreadMessage struct {
	ThreadID uint64
}

func (m *UnsubscribeThreadMessage) EncodeTo(w io.Writer) error {
	return WriteUint64(w, m.ThreadID)
}

func (m *UnsubscribeThreadMessage) Encode() ([]byte, error) {
	buf := new(bytes.Buffer)
	if err := m.EncodeTo(buf); err != nil {
		return nil, err
	}
	return buf.Bytes(), nil
}

func (m *UnsubscribeThreadMessage) Decode(payload []byte) error {
	buf := bytes.NewReader(payload)
	threadID, err := ReadUint64(buf)
	if err != nil {
		return err
	}
	m.ThreadID = threadID
	return nil
}

// SubscribeChannelMessage (0x53) - Subscribe to a channel/subchannel
type SubscribeChannelMessage struct {
	ChannelID    uint64
	SubchannelID *uint64
}

func (m *SubscribeChannelMessage) EncodeTo(w io.Writer) error {
	if err := WriteUint64(w, m.ChannelID); err != nil {
		return err
	}
	return WriteOptionalUint64(w, m.SubchannelID)
}

func (m *SubscribeChannelMessage) Encode() ([]byte, error) {
	buf := new(bytes.Buffer)
	if err := m.EncodeTo(buf); err != nil {
		return nil, err
	}
	return buf.Bytes(), nil
}

func (m *SubscribeChannelMessage) Decode(payload []byte) error {
	buf := bytes.NewReader(payload)
	channelID, err := ReadUint64(buf)
	if err != nil {
		return err
	}
	subchannelID, err := ReadOptionalUint64(buf)
	if err != nil {
		return err
	}
	m.ChannelID = channelID
	m.SubchannelID = subchannelID
	return nil
}

// UnsubscribeChannelMessage (0x54) - Unsubscribe from a channel/subchannel
type UnsubscribeChannelMessage struct {
	ChannelID    uint64
	SubchannelID *uint64
}

func (m *UnsubscribeChannelMessage) EncodeTo(w io.Writer) error {
	if err := WriteUint64(w, m.ChannelID); err != nil {
		return err
	}
	return WriteOptionalUint64(w, m.SubchannelID)
}

func (m *UnsubscribeChannelMessage) Encode() ([]byte, error) {
	buf := new(bytes.Buffer)
	if err := m.EncodeTo(buf); err != nil {
		return nil, err
	}
	return buf.Bytes(), nil
}

func (m *UnsubscribeChannelMessage) Decode(payload []byte) error {
	buf := bytes.NewReader(payload)
	channelID, err := ReadUint64(buf)
	if err != nil {
		return err
	}
	subchannelID, err := ReadOptionalUint64(buf)
	if err != nil {
		return err
	}
	m.ChannelID = channelID
	m.SubchannelID = subchannelID
	return nil
}

// SubscribeOkMessage (0x99) - Subscription confirmed
type SubscribeOkMessage struct {
	Type         uint8   // 1=thread, 2=channel
	ID           uint64  // thread_id or channel_id
	SubchannelID *uint64 // Present if subscribing to subchannel
}

func (m *SubscribeOkMessage) EncodeTo(w io.Writer) error {
	if err := WriteUint8(w, m.Type); err != nil {
		return err
	}
	if err := WriteUint64(w, m.ID); err != nil {
		return err
	}
	return WriteOptionalUint64(w, m.SubchannelID)
}

func (m *SubscribeOkMessage) Encode() ([]byte, error) {
	buf := new(bytes.Buffer)
	if err := m.EncodeTo(buf); err != nil {
		return nil, err
	}
	return buf.Bytes(), nil
}

func (m *SubscribeOkMessage) Decode(payload []byte) error {
	buf := bytes.NewReader(payload)
	subType, err := ReadUint8(buf)
	if err != nil {
		return err
	}
	id, err := ReadUint64(buf)
	if err != nil {
		return err
	}
	subchannelID, err := ReadOptionalUint64(buf)
	if err != nil {
		return err
	}
	m.Type = subType
	m.ID = id
	m.SubchannelID = subchannelID
	return nil
}

// GetUserInfoMessage (0x0F) - Request user information by nickname
type GetUserInfoMessage struct {
	Nickname string
}

func (m *GetUserInfoMessage) EncodeTo(w io.Writer) error {
	return WriteString(w, m.Nickname)
}

func (m *GetUserInfoMessage) Encode() ([]byte, error) {
	buf := new(bytes.Buffer)
	if err := m.EncodeTo(buf); err != nil {
		return nil, err
	}
	return buf.Bytes(), nil
}

func (m *GetUserInfoMessage) Decode(payload []byte) error {
	buf := bytes.NewReader(payload)
	nickname, err := ReadString(buf)
	if err != nil {
		return err
	}
	m.Nickname = nickname
	return nil
}

// UserInfoMessage (0x8F) - User information response
type UserInfoMessage struct {
	Nickname     string
	IsRegistered bool
	UserID       *uint64 // Only present if IsRegistered = true
	Online       bool
}

func (m *UserInfoMessage) EncodeTo(w io.Writer) error {
	if err := WriteString(w, m.Nickname); err != nil {
		return err
	}
	if err := WriteBool(w, m.IsRegistered); err != nil {
		return err
	}
	if err := WriteOptionalUint64(w, m.UserID); err != nil {
		return err
	}
	return WriteBool(w, m.Online)
}

func (m *UserInfoMessage) Encode() ([]byte, error) {
	buf := new(bytes.Buffer)
	if err := m.EncodeTo(buf); err != nil {
		return nil, err
	}
	return buf.Bytes(), nil
}

func (m *UserInfoMessage) Decode(payload []byte) error {
	buf := bytes.NewReader(payload)
	nickname, err := ReadString(buf)
	if err != nil {
		return err
	}
	isRegistered, err := ReadBool(buf)
	if err != nil {
		return err
	}
	userID, err := ReadOptionalUint64(buf)
	if err != nil {
		return err
	}
	online, err := ReadBool(buf)
	if err != nil {
		return err
	}
	m.Nickname = nickname
	m.IsRegistered = isRegistered
	m.UserID = userID
	m.Online = online
	return nil
}

// ListUsersMessage (0x16) - Request list of online users
type ListUsersMessage struct {
	Limit uint16
}

func (m *ListUsersMessage) EncodeTo(w io.Writer) error {
	return WriteUint16(w, m.Limit)
}

func (m *ListUsersMessage) Encode() ([]byte, error) {
	buf := new(bytes.Buffer)
	if err := m.EncodeTo(buf); err != nil {
		return nil, err
	}
	return buf.Bytes(), nil
}

func (m *ListUsersMessage) Decode(payload []byte) error {
	buf := bytes.NewReader(payload)
	limit, err := ReadUint16(buf)
	if err != nil {
		return err
	}
	m.Limit = limit
	return nil
}

// UserListEntry represents a single user in the user list
type UserListEntry struct {
	Nickname     string
	IsRegistered bool
	UserID       *uint64 // Only present if IsRegistered = true
}

// UserListMessage (0x9A) - List of online users response
type UserListMessage struct {
	Users []UserListEntry
}

func (m *UserListMessage) EncodeTo(w io.Writer) error {
	if err := WriteUint16(w, uint16(len(m.Users))); err != nil {
		return err
	}
	for _, user := range m.Users {
		if err := WriteString(w, user.Nickname); err != nil {
			return err
		}
		if err := WriteBool(w, user.IsRegistered); err != nil {
			return err
		}
		if err := WriteOptionalUint64(w, user.UserID); err != nil {
			return err
		}
	}
	return nil
}

func (m *UserListMessage) Encode() ([]byte, error) {
	buf := new(bytes.Buffer)
	if err := m.EncodeTo(buf); err != nil {
		return nil, err
	}
	return buf.Bytes(), nil
}

func (m *UserListMessage) Decode(payload []byte) error {
	buf := bytes.NewReader(payload)
	userCount, err := ReadUint16(buf)
	if err != nil {
		return err
	}

	users := make([]UserListEntry, userCount)
	for i := uint16(0); i < userCount; i++ {
		nickname, err := ReadString(buf)
		if err != nil {
			return err
		}
		isRegistered, err := ReadBool(buf)
		if err != nil {
			return err
		}
		userID, err := ReadOptionalUint64(buf)
		if err != nil {
			return err
		}
		users[i] = UserListEntry{
			Nickname:     nickname,
			IsRegistered: isRegistered,
			UserID:       userID,
		}
	}

	m.Users = users
	return nil
}

// ===== Server Discovery Messages =====

// ListServersMessage (0x55) - Request server list from directory
type ListServersMessage struct {
	Limit uint16
}

func (m *ListServersMessage) EncodeTo(w io.Writer) error {
	return WriteUint16(w, m.Limit)
}

func (m *ListServersMessage) Encode() ([]byte, error) {
	buf := new(bytes.Buffer)
	if err := m.EncodeTo(buf); err != nil {
		return nil, err
	}
	return buf.Bytes(), nil
}

func (m *ListServersMessage) Decode(payload []byte) error {
	buf := bytes.NewReader(payload)
	limit, err := ReadUint16(buf)
	if err != nil {
		return err
	}
	m.Limit = limit
	return nil
}

// ServerInfo represents a single server in the server list
type ServerInfo struct {
	Hostname       string
	Port           uint16
	Name           string
	Description    string
	UserCount      uint32
	MaxUsers       uint32
	UptimeSeconds  uint64
	IsPublic       bool
	ChannelCount   uint32
}

// ServerListMessage (0x9B) - List of discoverable servers
type ServerListMessage struct {
	Servers []ServerInfo
}

func (m *ServerListMessage) EncodeTo(w io.Writer) error {
	if err := WriteUint16(w, uint16(len(m.Servers))); err != nil {
		return err
	}
	for _, server := range m.Servers {
		if err := WriteString(w, server.Hostname); err != nil {
			return err
		}
		if err := WriteUint16(w, server.Port); err != nil {
			return err
		}
		if err := WriteString(w, server.Name); err != nil {
			return err
		}
		if err := WriteString(w, server.Description); err != nil {
			return err
		}
		if err := WriteUint32(w, server.UserCount); err != nil {
			return err
		}
		if err := WriteUint32(w, server.MaxUsers); err != nil {
			return err
		}
		if err := WriteUint64(w, server.UptimeSeconds); err != nil {
			return err
		}
		if err := WriteBool(w, server.IsPublic); err != nil {
			return err
		}
		if err := WriteUint32(w, server.ChannelCount); err != nil {
			return err
		}
	}
	return nil
}

func (m *ServerListMessage) Encode() ([]byte, error) {
	buf := new(bytes.Buffer)
	if err := m.EncodeTo(buf); err != nil {
		return nil, err
	}
	return buf.Bytes(), nil
}

func (m *ServerListMessage) Decode(payload []byte) error {
	buf := bytes.NewReader(payload)
	serverCount, err := ReadUint16(buf)
	if err != nil {
		return err
	}

	servers := make([]ServerInfo, serverCount)
	for i := uint16(0); i < serverCount; i++ {
		hostname, err := ReadString(buf)
		if err != nil {
			return err
		}
		port, err := ReadUint16(buf)
		if err != nil {
			return err
		}
		name, err := ReadString(buf)
		if err != nil {
			return err
		}
		description, err := ReadString(buf)
		if err != nil {
			return err
		}
		userCount, err := ReadUint32(buf)
		if err != nil {
			return err
		}
		maxUsers, err := ReadUint32(buf)
		if err != nil {
			return err
		}
		uptimeSeconds, err := ReadUint64(buf)
		if err != nil {
			return err
		}
		isPublic, err := ReadBool(buf)
		if err != nil {
			return err
		}
		channelCount, err := ReadUint32(buf)
		if err != nil {
			return err
		}

		servers[i] = ServerInfo{
			Hostname:      hostname,
			Port:          port,
			Name:          name,
			Description:   description,
			UserCount:     userCount,
			MaxUsers:      maxUsers,
			UptimeSeconds: uptimeSeconds,
			IsPublic:      isPublic,
			ChannelCount:  channelCount,
		}
	}

	m.Servers = servers
	return nil
}

// RegisterServerMessage (0x56) - Register server with directory
type RegisterServerMessage struct {
	Hostname     string
	Port         uint16
	Name         string
	Description  string
	MaxUsers     uint32
	IsPublic     bool
	ChannelCount uint32
}

func (m *RegisterServerMessage) EncodeTo(w io.Writer) error {
	if err := WriteString(w, m.Hostname); err != nil {
		return err
	}
	if err := WriteUint16(w, m.Port); err != nil {
		return err
	}
	if err := WriteString(w, m.Name); err != nil {
		return err
	}
	if err := WriteString(w, m.Description); err != nil {
		return err
	}
	if err := WriteUint32(w, m.MaxUsers); err != nil {
		return err
	}
	if err := WriteBool(w, m.IsPublic); err != nil {
		return err
	}
	return WriteUint32(w, m.ChannelCount)
}

func (m *RegisterServerMessage) Encode() ([]byte, error) {
	buf := new(bytes.Buffer)
	if err := m.EncodeTo(buf); err != nil {
		return nil, err
	}
	return buf.Bytes(), nil
}

func (m *RegisterServerMessage) Decode(payload []byte) error {
	buf := bytes.NewReader(payload)
	hostname, err := ReadString(buf)
	if err != nil {
		return err
	}
	port, err := ReadUint16(buf)
	if err != nil {
		return err
	}
	name, err := ReadString(buf)
	if err != nil {
		return err
	}
	description, err := ReadString(buf)
	if err != nil {
		return err
	}
	maxUsers, err := ReadUint32(buf)
	if err != nil {
		return err
	}
	isPublic, err := ReadBool(buf)
	if err != nil {
		return err
	}
	channelCount, err := ReadUint32(buf)
	if err != nil {
		return err
	}

	m.Hostname = hostname
	m.Port = port
	m.Name = name
	m.Description = description
	m.MaxUsers = maxUsers
	m.IsPublic = isPublic
	m.ChannelCount = channelCount
	return nil
}

// RegisterAckMessage (0x9C) - Server registration acknowledgment
type RegisterAckMessage struct {
	Success           bool
	HeartbeatInterval uint32 // Only present if success = true
	Message           string
}

func (m *RegisterAckMessage) EncodeTo(w io.Writer) error {
	if err := WriteBool(w, m.Success); err != nil {
		return err
	}
	if m.Success {
		if err := WriteUint32(w, m.HeartbeatInterval); err != nil {
			return err
		}
	}
	return WriteString(w, m.Message)
}

func (m *RegisterAckMessage) Encode() ([]byte, error) {
	buf := new(bytes.Buffer)
	if err := m.EncodeTo(buf); err != nil {
		return nil, err
	}
	return buf.Bytes(), nil
}

func (m *RegisterAckMessage) Decode(payload []byte) error {
	buf := bytes.NewReader(payload)
	success, err := ReadBool(buf)
	if err != nil {
		return err
	}
	m.Success = success

	if success {
		heartbeatInterval, err := ReadUint32(buf)
		if err != nil {
			return err
		}
		m.HeartbeatInterval = heartbeatInterval
	}

	message, err := ReadString(buf)
	if err != nil {
		return err
	}
	m.Message = message
	return nil
}

// VerifyRegistrationMessage (0x9E) - Verification challenge
type VerifyRegistrationMessage struct {
	Challenge uint64
}

func (m *VerifyRegistrationMessage) EncodeTo(w io.Writer) error {
	return WriteUint64(w, m.Challenge)
}

func (m *VerifyRegistrationMessage) Encode() ([]byte, error) {
	buf := new(bytes.Buffer)
	if err := m.EncodeTo(buf); err != nil {
		return nil, err
	}
	return buf.Bytes(), nil
}

func (m *VerifyRegistrationMessage) Decode(payload []byte) error {
	buf := bytes.NewReader(payload)
	challenge, err := ReadUint64(buf)
	if err != nil {
		return err
	}
	m.Challenge = challenge
	return nil
}

// VerifyResponseMessage (0x58) - Response to verification challenge
type VerifyResponseMessage struct {
	Challenge uint64
}

func (m *VerifyResponseMessage) EncodeTo(w io.Writer) error {
	return WriteUint64(w, m.Challenge)
}

func (m *VerifyResponseMessage) Encode() ([]byte, error) {
	buf := new(bytes.Buffer)
	if err := m.EncodeTo(buf); err != nil {
		return nil, err
	}
	return buf.Bytes(), nil
}

func (m *VerifyResponseMessage) Decode(payload []byte) error {
	buf := bytes.NewReader(payload)
	challenge, err := ReadUint64(buf)
	if err != nil {
		return err
	}
	m.Challenge = challenge
	return nil
}

// HeartbeatMessage (0x57) - Periodic heartbeat to directory
type HeartbeatMessage struct {
	Hostname      string
	Port          uint16
	UserCount     uint32
	UptimeSeconds uint64
	ChannelCount  uint32
}

func (m *HeartbeatMessage) EncodeTo(w io.Writer) error {
	if err := WriteString(w, m.Hostname); err != nil {
		return err
	}
	if err := WriteUint16(w, m.Port); err != nil {
		return err
	}
	if err := WriteUint32(w, m.UserCount); err != nil {
		return err
	}
	if err := WriteUint64(w, m.UptimeSeconds); err != nil {
		return err
	}
	return WriteUint32(w, m.ChannelCount)
}

func (m *HeartbeatMessage) Encode() ([]byte, error) {
	buf := new(bytes.Buffer)
	if err := m.EncodeTo(buf); err != nil {
		return nil, err
	}
	return buf.Bytes(), nil
}

func (m *HeartbeatMessage) Decode(payload []byte) error {
	buf := bytes.NewReader(payload)
	hostname, err := ReadString(buf)
	if err != nil {
		return err
	}
	port, err := ReadUint16(buf)
	if err != nil {
		return err
	}
	userCount, err := ReadUint32(buf)
	if err != nil {
		return err
	}
	uptimeSeconds, err := ReadUint64(buf)
	if err != nil {
		return err
	}
	channelCount, err := ReadUint32(buf)
	if err != nil {
		return err
	}

	m.Hostname = hostname
	m.Port = port
	m.UserCount = userCount
	m.UptimeSeconds = uptimeSeconds
	m.ChannelCount = channelCount
	return nil
}

// HeartbeatAckMessage (0x9D) - Heartbeat acknowledgment with interval
type HeartbeatAckMessage struct {
	HeartbeatInterval uint32
}

func (m *HeartbeatAckMessage) EncodeTo(w io.Writer) error {
	return WriteUint32(w, m.HeartbeatInterval)
}

func (m *HeartbeatAckMessage) Encode() ([]byte, error) {
	buf := new(bytes.Buffer)
	if err := m.EncodeTo(buf); err != nil {
		return nil, err
	}
	return buf.Bytes(), nil
}

func (m *HeartbeatAckMessage) Decode(payload []byte) error {
	buf := bytes.NewReader(payload)
	heartbeatInterval, err := ReadUint32(buf)
	if err != nil {
		return err
	}
	m.HeartbeatInterval = heartbeatInterval
	return nil
}

// ===== CHANGE_PASSWORD (0x0E) - Client → Server =====

// ChangePasswordRequest is sent by clients to change their password
type ChangePasswordRequest struct {
	OldPassword string // Empty for SSH-registered users changing password for first time
	NewPassword string
}

func (m *ChangePasswordRequest) EncodeTo(w io.Writer) error {
	if err := WriteString(w, m.OldPassword); err != nil {
		return err
	}
	return WriteString(w, m.NewPassword)
}

func (m *ChangePasswordRequest) Encode() ([]byte, error) {
	buf := new(bytes.Buffer)
	if err := m.EncodeTo(buf); err != nil {
		return nil, err
	}
	return buf.Bytes(), nil
}

func (m *ChangePasswordRequest) Decode(payload []byte) error {
	buf := bytes.NewReader(payload)
	oldPassword, err := ReadString(buf)
	if err != nil {
		return err
	}
	newPassword, err := ReadString(buf)
	if err != nil {
		return err
	}
	m.OldPassword = oldPassword
	m.NewPassword = newPassword
	return nil
}

// ===== PASSWORD_CHANGED (0x8E) - Server → Client =====

// PasswordChangedResponse is sent by server after password change attempt
type PasswordChangedResponse struct {
	Success      bool
	ErrorMessage string // Empty if success=true
}

func (m *PasswordChangedResponse) EncodeTo(w io.Writer) error {
	if err := WriteBool(w, m.Success); err != nil {
		return err
	}
	return WriteString(w, m.ErrorMessage)
}

func (m *PasswordChangedResponse) Encode() ([]byte, error) {
	buf := new(bytes.Buffer)
	if err := m.EncodeTo(buf); err != nil {
		return nil, err
	}
	return buf.Bytes(), nil
}

func (m *PasswordChangedResponse) Decode(payload []byte) error {
	buf := bytes.NewReader(payload)
	success, err := ReadBool(buf)
	if err != nil {
		return err
	}
	errorMessage, err := ReadString(buf)
	if err != nil {
		return err
	}
	m.Success = success
	m.ErrorMessage = errorMessage
	return nil
}

// ===== ADD_SSH_KEY (0x0D) - Client → Server =====

// AddSSHKeyRequest is sent by clients to add a new SSH public key to their account
type AddSSHKeyRequest struct {
	PublicKey string // Full SSH public key (e.g., "ssh-rsa AAAA... user@host")
	Label     string // Optional user-friendly label (e.g., "Work Laptop")
}

func (m *AddSSHKeyRequest) EncodeTo(w io.Writer) error {
	if err := WriteString(w, m.PublicKey); err != nil {
		return err
	}
	return WriteString(w, m.Label)
}

func (m *AddSSHKeyRequest) Encode() ([]byte, error) {
	buf := new(bytes.Buffer)
	if err := m.EncodeTo(buf); err != nil {
		return nil, err
	}
	return buf.Bytes(), nil
}

func (m *AddSSHKeyRequest) Decode(payload []byte) error {
	buf := bytes.NewReader(payload)
	publicKey, err := ReadString(buf)
	if err != nil {
		return err
	}
	label, err := ReadString(buf)
	if err != nil {
		return err
	}
	m.PublicKey = publicKey
	m.Label = label
	return nil
}

// ===== SSH_KEY_ADDED (0x95) - Server → Client =====

// SSHKeyAddedResponse is sent by server after adding an SSH key
type SSHKeyAddedResponse struct {
	Success      bool
	KeyID        int64  // Database ID of the added key
	Fingerprint  string // SHA256 fingerprint
	ErrorMessage string // Empty if success=true
}

func (m *SSHKeyAddedResponse) EncodeTo(w io.Writer) error {
	if err := WriteBool(w, m.Success); err != nil {
		return err
	}
	if err := WriteInt64(w, m.KeyID); err != nil {
		return err
	}
	if err := WriteString(w, m.Fingerprint); err != nil {
		return err
	}
	return WriteString(w, m.ErrorMessage)
}

func (m *SSHKeyAddedResponse) Encode() ([]byte, error) {
	buf := new(bytes.Buffer)
	if err := m.EncodeTo(buf); err != nil {
		return nil, err
	}
	return buf.Bytes(), nil
}

func (m *SSHKeyAddedResponse) Decode(payload []byte) error {
	buf := bytes.NewReader(payload)
	success, err := ReadBool(buf)
	if err != nil {
		return err
	}
	keyID, err := ReadInt64(buf)
	if err != nil {
		return err
	}
	fingerprint, err := ReadString(buf)
	if err != nil {
		return err
	}
	errorMessage, err := ReadString(buf)
	if err != nil {
		return err
	}
	m.Success = success
	m.KeyID = keyID
	m.Fingerprint = fingerprint
	m.ErrorMessage = errorMessage
	return nil
}

// ===== LIST_SSH_KEYS (0x14) - Client → Server =====

// ListSSHKeysRequest is sent by clients to retrieve their SSH keys
type ListSSHKeysRequest struct {
	// No fields - user is identified from session
}

func (m *ListSSHKeysRequest) EncodeTo(w io.Writer) error {
	// No data to encode
	return nil
}

func (m *ListSSHKeysRequest) Encode() ([]byte, error) {
	buf := new(bytes.Buffer)
	if err := m.EncodeTo(buf); err != nil {
		return nil, err
	}
	return buf.Bytes(), nil
}

func (m *ListSSHKeysRequest) Decode(payload []byte) error {
	// No data to decode
	return nil
}

// ===== SSH_KEY_LIST (0x94) - Server → Client =====

// SSHKeyInfo represents a single SSH key in the list
type SSHKeyInfo struct {
	ID          int64
	Fingerprint string
	KeyType     string // ssh-rsa, ssh-ed25519, etc.
	Label       string // May be empty
	AddedAt     int64  // Unix milliseconds
	LastUsedAt  int64  // Unix milliseconds (0 if never used)
}

// SSHKeyListResponse is sent by server with list of user's SSH keys
type SSHKeyListResponse struct {
	Keys []SSHKeyInfo
}

func (m *SSHKeyListResponse) EncodeTo(w io.Writer) error {
	// Write number of keys
	if err := WriteUint32(w, uint32(len(m.Keys))); err != nil {
		return err
	}

	// Write each key
	for _, key := range m.Keys {
		if err := WriteInt64(w, key.ID); err != nil {
			return err
		}
		if err := WriteString(w, key.Fingerprint); err != nil {
			return err
		}
		if err := WriteString(w, key.KeyType); err != nil {
			return err
		}
		if err := WriteString(w, key.Label); err != nil {
			return err
		}
		if err := WriteInt64(w, key.AddedAt); err != nil {
			return err
		}
		if err := WriteInt64(w, key.LastUsedAt); err != nil {
			return err
		}
	}
	return nil
}

func (m *SSHKeyListResponse) Encode() ([]byte, error) {
	buf := new(bytes.Buffer)
	if err := m.EncodeTo(buf); err != nil {
		return nil, err
	}
	return buf.Bytes(), nil
}

func (m *SSHKeyListResponse) Decode(payload []byte) error {
	buf := bytes.NewReader(payload)

	// Read number of keys
	count, err := ReadUint32(buf)
	if err != nil {
		return err
	}

	m.Keys = make([]SSHKeyInfo, count)

	// Read each key
	for i := uint32(0); i < count; i++ {
		id, err := ReadInt64(buf)
		if err != nil {
			return err
		}
		fingerprint, err := ReadString(buf)
		if err != nil {
			return err
		}
		keyType, err := ReadString(buf)
		if err != nil {
			return err
		}
		label, err := ReadString(buf)
		if err != nil {
			return err
		}
		addedAt, err := ReadInt64(buf)
		if err != nil {
			return err
		}
		lastUsedAt, err := ReadInt64(buf)
		if err != nil {
			return err
		}

		m.Keys[i] = SSHKeyInfo{
			ID:          id,
			Fingerprint: fingerprint,
			KeyType:     keyType,
			Label:       label,
			AddedAt:     addedAt,
			LastUsedAt:  lastUsedAt,
		}
	}
	return nil
}

// ===== UPDATE_SSH_KEY_LABEL (0x12) - Client → Server =====

// UpdateSSHKeyLabelRequest is sent by clients to update an SSH key's label
type UpdateSSHKeyLabelRequest struct {
	KeyID    int64
	NewLabel string
}

func (m *UpdateSSHKeyLabelRequest) EncodeTo(w io.Writer) error {
	if err := WriteInt64(w, m.KeyID); err != nil {
		return err
	}
	return WriteString(w, m.NewLabel)
}

func (m *UpdateSSHKeyLabelRequest) Encode() ([]byte, error) {
	buf := new(bytes.Buffer)
	if err := m.EncodeTo(buf); err != nil {
		return nil, err
	}
	return buf.Bytes(), nil
}

func (m *UpdateSSHKeyLabelRequest) Decode(payload []byte) error {
	buf := bytes.NewReader(payload)
	keyID, err := ReadInt64(buf)
	if err != nil {
		return err
	}
	newLabel, err := ReadString(buf)
	if err != nil {
		return err
	}
	m.KeyID = keyID
	m.NewLabel = newLabel
	return nil
}

// ===== SSH_KEY_LABEL_UPDATED (0x92) - Server → Client =====

// SSHKeyLabelUpdatedResponse is sent by server after updating an SSH key label
type SSHKeyLabelUpdatedResponse struct {
	Success      bool
	ErrorMessage string // Empty if success=true
}

func (m *SSHKeyLabelUpdatedResponse) EncodeTo(w io.Writer) error {
	if err := WriteBool(w, m.Success); err != nil {
		return err
	}
	return WriteString(w, m.ErrorMessage)
}

func (m *SSHKeyLabelUpdatedResponse) Encode() ([]byte, error) {
	buf := new(bytes.Buffer)
	if err := m.EncodeTo(buf); err != nil {
		return nil, err
	}
	return buf.Bytes(), nil
}

func (m *SSHKeyLabelUpdatedResponse) Decode(payload []byte) error {
	buf := bytes.NewReader(payload)
	success, err := ReadBool(buf)
	if err != nil {
		return err
	}
	errorMessage, err := ReadString(buf)
	if err != nil {
		return err
	}
	m.Success = success
	m.ErrorMessage = errorMessage
	return nil
}

// ===== DELETE_SSH_KEY (0x13) - Client → Server =====

// DeleteSSHKeyRequest is sent by clients to delete an SSH key
type DeleteSSHKeyRequest struct {
	KeyID int64
}

func (m *DeleteSSHKeyRequest) EncodeTo(w io.Writer) error {
	return WriteInt64(w, m.KeyID)
}

func (m *DeleteSSHKeyRequest) Encode() ([]byte, error) {
	buf := new(bytes.Buffer)
	if err := m.EncodeTo(buf); err != nil {
		return nil, err
	}
	return buf.Bytes(), nil
}

func (m *DeleteSSHKeyRequest) Decode(payload []byte) error {
	buf := bytes.NewReader(payload)
	keyID, err := ReadInt64(buf)
	if err != nil {
		return err
	}
	m.KeyID = keyID
	return nil
}

// ===== SSH_KEY_DELETED (0x93) - Server → Client =====

// SSHKeyDeletedResponse is sent by server after deleting an SSH key
type SSHKeyDeletedResponse struct {
	Success      bool
	ErrorMessage string // Empty if success=true
}

func (m *SSHKeyDeletedResponse) EncodeTo(w io.Writer) error {
	if err := WriteBool(w, m.Success); err != nil {
		return err
	}
	return WriteString(w, m.ErrorMessage)
}

func (m *SSHKeyDeletedResponse) Encode() ([]byte, error) {
	buf := new(bytes.Buffer)
	if err := m.EncodeTo(buf); err != nil {
		return nil, err
	}
	return buf.Bytes(), nil
}

func (m *SSHKeyDeletedResponse) Decode(payload []byte) error {
	buf := bytes.NewReader(payload)
	success, err := ReadBool(buf)
	if err != nil {
		return err
	}
	errorMessage, err := ReadString(buf)
	if err != nil {
		return err
	}
	m.Success = success
	m.ErrorMessage = errorMessage
	return nil
}

// Compile-time checks to ensure all message types implement the ProtocolMessage interface
// This will cause a compile error if any message type is missing Encode(), EncodeTo(), or Decode()
var (
	// Client → Server messages
	_ ProtocolMessage = (*AuthRequestMessage)(nil)
	_ ProtocolMessage = (*SetNicknameMessage)(nil)
	_ ProtocolMessage = (*RegisterUserMessage)(nil)
	_ ProtocolMessage = (*LogoutMessage)(nil)
	_ ProtocolMessage = (*ListChannelsMessage)(nil)
	_ ProtocolMessage = (*JoinChannelMessage)(nil)
	_ ProtocolMessage = (*CreateChannelMessage)(nil)
	_ ProtocolMessage = (*ListMessagesMessage)(nil)
	_ ProtocolMessage = (*PostMessageMessage)(nil)
	_ ProtocolMessage = (*EditMessageMessage)(nil)
	_ ProtocolMessage = (*DeleteMessageMessage)(nil)
	_ ProtocolMessage = (*PingMessage)(nil)
	_ ProtocolMessage = (*DisconnectMessage)(nil)
	_ ProtocolMessage = (*SubscribeThreadMessage)(nil)
	_ ProtocolMessage = (*UnsubscribeThreadMessage)(nil)
	_ ProtocolMessage = (*SubscribeChannelMessage)(nil)
	_ ProtocolMessage = (*UnsubscribeChannelMessage)(nil)
	_ ProtocolMessage = (*GetUserInfoMessage)(nil)
	_ ProtocolMessage = (*ListUsersMessage)(nil)
	_ ProtocolMessage = (*ListServersMessage)(nil)
	_ ProtocolMessage = (*RegisterServerMessage)(nil)
	_ ProtocolMessage = (*VerifyRegistrationMessage)(nil)
	_ ProtocolMessage = (*HeartbeatMessage)(nil)
	_ ProtocolMessage = (*ChangePasswordRequest)(nil)
	_ ProtocolMessage = (*AddSSHKeyRequest)(nil)
	_ ProtocolMessage = (*ListSSHKeysRequest)(nil)
	_ ProtocolMessage = (*UpdateSSHKeyLabelRequest)(nil)
	_ ProtocolMessage = (*DeleteSSHKeyRequest)(nil)

	// Server → Client messages
	_ ProtocolMessage = (*AuthResponseMessage)(nil)
	_ ProtocolMessage = (*NicknameResponseMessage)(nil)
	_ ProtocolMessage = (*RegisterResponseMessage)(nil)
	_ ProtocolMessage = (*ChannelListMessage)(nil)
	_ ProtocolMessage = (*JoinResponseMessage)(nil)
	_ ProtocolMessage = (*ChannelCreatedMessage)(nil)
	_ ProtocolMessage = (*MessageListMessage)(nil)
	_ ProtocolMessage = (*MessagePostedMessage)(nil)
	_ ProtocolMessage = (*MessageEditedMessage)(nil)
	_ ProtocolMessage = (*MessageDeletedMessage)(nil)
	_ ProtocolMessage = (*PongMessage)(nil)
	_ ProtocolMessage = (*ErrorMessage)(nil)
	_ ProtocolMessage = (*ServerConfigMessage)(nil)
	_ ProtocolMessage = (*SubscribeOkMessage)(nil)
	_ ProtocolMessage = (*UserInfoMessage)(nil)
	_ ProtocolMessage = (*UserListMessage)(nil)
	_ ProtocolMessage = (*ServerListMessage)(nil)
	_ ProtocolMessage = (*RegisterAckMessage)(nil)
	_ ProtocolMessage = (*VerifyResponseMessage)(nil)
	_ ProtocolMessage = (*HeartbeatAckMessage)(nil)
	_ ProtocolMessage = (*PasswordChangedResponse)(nil)
	_ ProtocolMessage = (*SSHKeyAddedResponse)(nil)
	_ ProtocolMessage = (*SSHKeyListResponse)(nil)
	_ ProtocolMessage = (*SSHKeyLabelUpdatedResponse)(nil)
	_ ProtocolMessage = (*SSHKeyDeletedResponse)(nil)
)
