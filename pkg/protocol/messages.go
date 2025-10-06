package protocol

import (
	"bytes"
	"errors"
	"io"
	"time"
)

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
	TypePing               = 0x10
	TypeDisconnect         = 0x11
	TypeSubscribeThread    = 0x51
	TypeUnsubscribeThread  = 0x52
	TypeSubscribeChannel   = 0x53
	TypeUnsubscribeChannel = 0x54
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
	TypePong              = 0x90
	TypeError             = 0x91
	TypeServerConfig      = 0x98
	TypeSubscribeOk       = 0x99
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
	Success bool
	UserID  uint64 // Only present if success=true
	Message string
}

func (m *AuthResponseMessage) EncodeTo(w io.Writer) error {
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
	return WriteOptionalUint64(w, m.ParentID)
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

	m.ChannelID = channelID
	m.SubchannelID = subchannelID
	m.Limit = limit
	m.BeforeID = beforeID
	m.ParentID = parentID
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
	return WriteUint16(w, m.MaxChannelSubscriptions)
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
