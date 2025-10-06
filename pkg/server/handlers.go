package server

import (
	"bytes"
	"database/sql"
	"errors"
	"fmt"
	"log"
	"regexp"
	"strings"
	"time"

	"golang.org/x/crypto/bcrypt"

	"github.com/aeolun/superchat/pkg/database"
	"github.com/aeolun/superchat/pkg/protocol"
)

var (
	nicknameRegex = regexp.MustCompile(`^[a-zA-Z0-9_-]{3,20}$`)

	// ErrClientDisconnecting is returned when client sends graceful disconnect
	ErrClientDisconnecting = errors.New("client disconnecting")
)

// dbError logs a database error and sends an error response to the client
func (s *Server) dbError(sess *Session, operation string, err error) error {
	errorLog.Printf("Session %d: %s failed: %v", sess.ID, operation, err)
	return s.sendError(sess, 9001, "Database error")
}

// handleAuthRequest handles AUTH_REQUEST message (login)
func (s *Server) handleAuthRequest(sess *Session, frame *protocol.Frame) error {
	// Decode message
	msg := &protocol.AuthRequestMessage{}
	if err := msg.Decode(frame.Payload); err != nil {
		return s.sendError(sess, 1000, "Invalid message format")
	}

	// Get user from database
	user, err := s.db.GetUserByNickname(msg.Nickname)
	if err != nil {
		if err == sql.ErrNoRows {
			resp := &protocol.AuthResponseMessage{
				Success: false,
				Message: "Invalid credentials",
			}
			return s.sendMessage(sess, protocol.TypeAuthResponse, resp)
		}
		return s.dbError(sess, "GetUserByNickname", err)
	}

	// Verify password
	err = bcrypt.CompareHashAndPassword([]byte(user.PasswordHash), []byte(msg.Password))
	if err != nil {
		resp := &protocol.AuthResponseMessage{
			Success: false,
			Message: "Invalid credentials",
		}
		return s.sendMessage(sess, protocol.TypeAuthResponse, resp)
	}

	// Update session with user ID and flags
	sess.mu.Lock()
	sess.UserID = &user.ID
	sess.Nickname = user.Nickname
	sess.UserFlags = user.UserFlags
	sess.mu.Unlock()

	// Update database session
	if err := s.db.UpdateSessionUserID(sess.DBSessionID, user.ID); err != nil {
		log.Printf("Session %d: failed to update session user_id: %v", sess.ID, err)
	}

	// Update last_seen
	if err := s.db.UpdateUserLastSeen(user.ID); err != nil {
		log.Printf("Session %d: failed to update user last_seen: %v", sess.ID, err)
	}

	// Send success response
	resp := &protocol.AuthResponseMessage{
		Success: true,
		UserID:  uint64(user.ID),
		Message: fmt.Sprintf("Welcome back, %s!", user.Nickname),
	}
	return s.sendMessage(sess, protocol.TypeAuthResponse, resp)
}

// handleRegisterUser handles REGISTER_USER message
func (s *Server) handleRegisterUser(sess *Session, frame *protocol.Frame) error {
	// Decode message
	msg := &protocol.RegisterUserMessage{}
	if err := msg.Decode(frame.Payload); err != nil {
		return s.sendError(sess, 1000, "Invalid message format")
	}

	// Check if session has a nickname set
	sess.mu.RLock()
	nickname := sess.Nickname
	sess.mu.RUnlock()

	if nickname == "" {
		resp := &protocol.RegisterResponseMessage{
			Success: false,
			Message: "Must set nickname before registering",
		}
		return s.sendMessage(sess, protocol.TypeRegisterResponse, resp)
	}

	// Validate password (minimum 6 characters)
	if len(msg.Password) < 6 {
		resp := &protocol.RegisterResponseMessage{
			Success: false,
			Message: "Password must be at least 6 characters",
		}
		return s.sendMessage(sess, protocol.TypeRegisterResponse, resp)
	}

	// Hash password
	hashedPassword, err := bcrypt.GenerateFromPassword([]byte(msg.Password), bcrypt.DefaultCost)
	if err != nil {
		log.Printf("Session %d: bcrypt.GenerateFromPassword failed: %v", sess.ID, err)
		return s.sendError(sess, 9000, "Failed to hash password")
	}

	// Create user in database
	userID, err := s.db.CreateUser(nickname, string(hashedPassword), 0) // 0 = no special flags
	if err != nil {
		// Check for unique constraint violation
		if strings.Contains(err.Error(), "UNIQUE constraint") {
			resp := &protocol.RegisterResponseMessage{
				Success: false,
				Message: "Nickname already registered",
			}
			return s.sendMessage(sess, protocol.TypeRegisterResponse, resp)
		}
		return s.dbError(sess, "CreateUser", err)
	}

	// Update session with user ID
	sess.mu.Lock()
	sess.UserID = &userID
	sess.UserFlags = 0 // Regular user
	sess.mu.Unlock()

	// Update database session
	if err := s.db.UpdateSessionUserID(sess.DBSessionID, userID); err != nil {
		log.Printf("Session %d: failed to update session user_id: %v", sess.ID, err)
	}

	// Send success response
	resp := &protocol.RegisterResponseMessage{
		Success: true,
		UserID:  uint64(userID),
		Message: fmt.Sprintf("Successfully registered %s!", nickname),
	}
	return s.sendMessage(sess, protocol.TypeRegisterResponse, resp)
}

// handleSetNickname handles SET_NICKNAME message
func (s *Server) handleSetNickname(sess *Session, frame *protocol.Frame) error {
	// Decode message
	msg := &protocol.SetNicknameMessage{}
	if err := msg.Decode(frame.Payload); err != nil {
		return s.sendError(sess, 1000, "Invalid message format")
	}

	// Validate nickname
	if !nicknameRegex.MatchString(msg.Nickname) {
		resp := &protocol.NicknameResponseMessage{
			Success: false,
			Message: "Invalid nickname. Must be 3-20 characters, alphanumeric plus - and _",
		}
		return s.sendMessage(sess, protocol.TypeNicknameResponse, resp)
	}

	// Update session nickname
	if err := s.sessions.UpdateNickname(sess.ID, msg.Nickname); err != nil {
		log.Printf("Session %d: UpdateNickname failed: %v", sess.ID, err)
		return s.sendError(sess, 9000, "Failed to update nickname")
	}

	// Send success response
	resp := &protocol.NicknameResponseMessage{
		Success: true,
		Message: fmt.Sprintf("Nickname set to %s", msg.Nickname),
	}
	return s.sendMessage(sess, protocol.TypeNicknameResponse, resp)
}

// handleListChannels handles LIST_CHANNELS message
func (s *Server) handleListChannels(sess *Session, frame *protocol.Frame) error {
	// Decode message
	msg := &protocol.ListChannelsMessage{}
	if err := msg.Decode(frame.Payload); err != nil {
		return s.sendError(sess, 1000, "Invalid message format")
	}

	// Get channels from MemDB (already in memory, instant)
	dbChannels, err := s.db.ListChannels()
	if err != nil {
		return s.sendError(sess, 1002, "Failed to list channels")
	}

	// Apply pagination
	channelList := make([]protocol.Channel, 0, len(dbChannels))
	for _, dbCh := range dbChannels {
		// Skip channels before cursor
		if msg.FromChannelID > 0 && uint64(dbCh.ID) <= msg.FromChannelID {
			continue
		}

		// Convert to protocol format
		ch := protocol.Channel{
			ID:          uint64(dbCh.ID),
			Name:        dbCh.Name,
			Description: safeDeref(dbCh.Description, ""),
			UserCount:   0, // TODO: Track active user count
			IsOperator:   false,
		}
		channelList = append(channelList, ch)

		// Stop if we've reached the limit
		if msg.Limit > 0 && len(channelList) >= int(msg.Limit) {
			break
		}
	}

	// Send response
	resp := &protocol.ChannelListMessage{
		Channels: channelList,
	}

	return s.sendMessage(sess, protocol.TypeChannelList, resp)
}

// handleJoinChannel handles JOIN_CHANNEL message
func (s *Server) handleJoinChannel(sess *Session, frame *protocol.Frame) error {
	// Decode message
	msg := &protocol.JoinChannelMessage{}
	if err := msg.Decode(frame.Payload); err != nil {
		return s.sendError(sess, 1000, "Invalid message format")
	}

	// Check if channel exists in MemDB (instant lookup)
	exists, err := s.db.ChannelExists(int64(msg.ChannelID))
	if err != nil || !exists {
		errorLog.Printf("Session %d: Channel %d not found", sess.ID, msg.ChannelID)
		resp := &protocol.JoinResponseMessage{
			Success:      false,
			ChannelID:    msg.ChannelID,
			SubchannelID: nil,
			Message:      "Channel not found",
		}
		return s.sendMessage(sess, protocol.TypeJoinResponse, resp)
	}

	// Update session's joined channel
	channelID := int64(msg.ChannelID)
	if err := s.sessions.SetJoinedChannel(sess.ID, &channelID); err != nil {
		return s.sendError(sess, 9000, "Failed to join channel")
	}

	// Send success response
	resp := &protocol.JoinResponseMessage{
		Success:      true,
		ChannelID:    msg.ChannelID,
		SubchannelID: msg.SubchannelID,
		Message:      "Joined channel",
	}

	return s.sendMessage(sess, protocol.TypeJoinResponse, resp)
}

// handleLeaveChannel handles LEAVE_CHANNEL message
func (s *Server) handleLeaveChannel(sess *Session, frame *protocol.Frame) error {
	// Update session to no longer be in a channel
	if err := s.sessions.SetJoinedChannel(sess.ID, nil); err != nil {
		return s.sendError(sess, 9000, "Failed to leave channel")
	}

	// Send confirmation (LEAVE_RESPONSE)
	// Note: LeaveResponseMessage doesn't exist yet in protocol, so we'll just send success via error code 0
	// For now, we'll create a simple response
	return s.sendError(sess, 0, "Left channel")
}

// handleCreateChannel handles CREATE_CHANNEL message (V2+)
func (s *Server) handleCreateChannel(sess *Session, frame *protocol.Frame) error {
	msg := &protocol.CreateChannelMessage{}
	if err := msg.Decode(frame.Payload); err != nil {
		return s.sendMessage(sess, protocol.TypeChannelCreated, &protocol.ChannelCreatedMessage{
			Success: false,
			Message: "Invalid request format",
		})
	}

	// V2 feature: Only registered users can create channels
	sess.mu.RLock()
	userID := sess.UserID
	sess.mu.RUnlock()

	if userID == nil {
		return s.sendMessage(sess, protocol.TypeChannelCreated, &protocol.ChannelCreatedMessage{
			Success: false,
			Message: "Only registered users can create channels. Please register or log in.",
		})
	}

	// Validate channel name (must be URL-friendly)
	if len(msg.Name) < 3 || len(msg.Name) > 50 {
		return s.sendMessage(sess, protocol.TypeChannelCreated, &protocol.ChannelCreatedMessage{
			Success: false,
			Message: "Channel name must be 3-50 characters",
		})
	}

	// Validate display name
	if len(msg.DisplayName) < 1 || len(msg.DisplayName) > 100 {
		return s.sendMessage(sess, protocol.TypeChannelCreated, &protocol.ChannelCreatedMessage{
			Success: false,
			Message: "Display name must be 1-100 characters",
		})
	}

	// Validate description (optional, max 500 chars)
	if msg.Description != nil && len(*msg.Description) > 500 {
		return s.sendMessage(sess, protocol.TypeChannelCreated, &protocol.ChannelCreatedMessage{
			Success: false,
			Message: "Description must be at most 500 characters",
		})
	}

	// V2 only supports forum channels (type 1)
	if msg.ChannelType != 1 {
		return s.sendMessage(sess, protocol.TypeChannelCreated, &protocol.ChannelCreatedMessage{
			Success: false,
			Message: "Only forum channels are supported in V2",
		})
	}

	// Validate retention hours (1 hour to 1 year)
	if msg.RetentionHours < 1 || msg.RetentionHours > 8760 {
		return s.sendMessage(sess, protocol.TypeChannelCreated, &protocol.ChannelCreatedMessage{
			Success: false,
			Message: "Retention hours must be between 1 and 8760 (1 year)",
		})
	}

	// Create channel in database
	err := s.db.CreateChannel(msg.Name, msg.DisplayName, msg.Description, msg.ChannelType, msg.RetentionHours, userID)
	if err != nil {
		// Check if it's a duplicate name error
		if strings.Contains(err.Error(), "UNIQUE constraint failed") || strings.Contains(err.Error(), "already exists") {
			return s.sendMessage(sess, protocol.TypeChannelCreated, &protocol.ChannelCreatedMessage{
				Success: false,
				Message: "Channel name already exists",
			})
		}
		return s.dbError(sess, "CreateChannel", err)
	}

	// Get the created channel to get its ID
	channels, err := s.db.ListChannels()
	if err != nil {
		return s.dbError(sess, "ListChannels", err)
	}

	// Find the newly created channel
	var createdChannel *database.Channel
	for _, ch := range channels {
		if ch.Name == msg.Name {
			createdChannel = ch
			break
		}
	}

	if createdChannel == nil {
		return s.dbError(sess, "GetCreatedChannel", fmt.Errorf("channel created but not found in list"))
	}

	// Build CHANNEL_CREATED message (hybrid response + broadcast)
	channelCreatedMsg := &protocol.ChannelCreatedMessage{
		Success:        true,
		ChannelID:      uint64(createdChannel.ID),
		Name:           createdChannel.Name,
		Description:    safeDeref(createdChannel.Description, ""),
		Type:           createdChannel.ChannelType,
		RetentionHours: createdChannel.MessageRetentionHours,
		Message:        fmt.Sprintf("Channel '%s' created successfully", createdChannel.DisplayName),
	}

	// Send to creator as confirmation
	if err := s.sendMessage(sess, protocol.TypeChannelCreated, channelCreatedMsg); err != nil {
		return err
	}

	// Broadcast to all OTHER connected users (not the creator again)
	s.broadcastChannelCreated(createdChannel, sess.ID)

	return nil
}

// handleListMessages handles LIST_MESSAGES message
func (s *Server) handleListMessages(sess *Session, frame *protocol.Frame) error {
	// Decode message
	msg := &protocol.ListMessagesMessage{}
	if err := msg.Decode(frame.Payload); err != nil {
		return s.sendError(sess, 1000, "Invalid message format")
	}

	var messages []protocol.Message

	if msg.ParentID != nil {
		// Get thread replies
		dbMessages, err := s.db.ListThreadReplies(*msg.ParentID)
		if err != nil {
			return s.dbError(sess, "ListThreadReplies", err)
		}
		messages = convertDBMessagesToProtocol(dbMessages, s.db)
	} else {
		// Get root messages
		var subchannelID *int64
		if msg.SubchannelID != nil {
			id := int64(*msg.SubchannelID)
			subchannelID = &id
		}

		dbMessages, err := s.db.ListRootMessages(int64(msg.ChannelID), subchannelID, msg.Limit, msg.BeforeID)
		if err != nil {
			return s.dbError(sess, "ListRootMessages", err)
		}
		messages = convertDBMessagesToProtocol(dbMessages, s.db)
	}

	// Send response
	resp := &protocol.MessageListMessage{
		ChannelID:    msg.ChannelID,
		SubchannelID: msg.SubchannelID,
		ParentID:     msg.ParentID,
		Messages:     messages,
	}

	return s.sendMessage(sess, protocol.TypeMessageList, resp)
}

// handlePostMessage handles POST_MESSAGE message
func (s *Server) handlePostMessage(sess *Session, frame *protocol.Frame) error {
	// Decode message
	msg := &protocol.PostMessageMessage{}
	if err := msg.Decode(frame.Payload); err != nil {
		return s.sendError(sess, 1000, "Invalid message format")
	}

	// Check if session has a nickname
	sess.mu.RLock()
	nickname := sess.Nickname
	sess.mu.RUnlock()

	if nickname == "" {
		log.Printf("Session %d tried to POST without nickname set", sess.ID)
		return s.sendError(sess, 2000, "Nickname required. Use SET_NICKNAME first.")
	}

	// Validate message length
	if uint32(len(msg.Content)) > s.config.MaxMessageLength {
		return s.sendError(sess, 6001, fmt.Sprintf("Message too long (max %d bytes)", s.config.MaxMessageLength))
	}

	// Convert IDs
	var subchannelID, parentID *int64
	if msg.SubchannelID != nil {
		id := int64(*msg.SubchannelID)
		subchannelID = &id
	}
	if msg.ParentID != nil {
		id := int64(*msg.ParentID)
		parentID = &id
	}

	// Post message to in-memory database (instant)
	messageID, dbMsg, err := s.db.PostMessage(
		int64(msg.ChannelID),
		subchannelID,
		parentID,
		sess.UserID,
		nickname,
		msg.Content,
	)

	if err != nil {
		return s.dbError(sess, "PostMessage", err)
	}

	// Send confirmation
	resp := &protocol.MessagePostedMessage{
		Success:   true,
		MessageID: uint64(messageID),
		Message:   "Message posted",
	}

	if err := s.sendMessage(sess, protocol.TypeMessagePosted, resp); err != nil {
		return err
	}

	// Broadcast NEW_MESSAGE to subscribed sessions
	newMsg := convertDBMessageToProtocol(dbMsg, s.db)
	broadcastMsg := (*protocol.NewMessageMessage)(newMsg)

	// Use thread_root_id from database (server owns thread hierarchy)
	var threadRootID *uint64
	if dbMsg.ThreadRootID != nil {
		id := uint64(*dbMsg.ThreadRootID)
		threadRootID = &id
	}

	if err := s.broadcastNewMessage(broadcastMsg, threadRootID); err != nil {
		// Log but don't fail - message was posted successfully
		fmt.Printf("Failed to broadcast new message: %v\n", err)
	}

	return nil
}

// handleDeleteMessage handles DELETE_MESSAGE message
func (s *Server) handleDeleteMessage(sess *Session, frame *protocol.Frame) error {
	msg := &protocol.DeleteMessageMessage{}
	if err := msg.Decode(frame.Payload); err != nil {
		return s.sendError(sess, protocol.ErrCodeInvalidFormat, "Invalid message format")
	}

	sess.mu.RLock()
	nickname := sess.Nickname
	sess.mu.RUnlock()

	if nickname == "" {
		return s.sendError(sess, protocol.ErrCodeNicknameRequired, "Nickname required. Use SET_NICKNAME first.")
	}

	dbMsg, err := s.db.SoftDeleteMessage(msg.MessageID, nickname)
	if err != nil {
		switch {
		case errors.Is(err, database.ErrMessageNotFound):
			return s.sendError(sess, protocol.ErrCodeMessageNotFound, "Message not found")
		case errors.Is(err, database.ErrMessageNotOwned):
			return s.sendError(sess, protocol.ErrCodePermissionDenied, "You can only delete your own messages")
		case errors.Is(err, database.ErrMessageAlreadyDeleted):
			return s.sendError(sess, protocol.ErrCodeInvalidInput, "Message already deleted")
		default:
			return s.sendError(sess, protocol.ErrCodeDatabaseError, "Failed to delete message")
		}
	}

	// DeletedAt should always be set by SoftDeleteMessage, but add defensive check
	deletedAtMs := safeDeref(dbMsg.DeletedAt, time.Now().UnixMilli())
	deletedAt := time.UnixMilli(deletedAtMs)
	resp := &protocol.MessageDeletedMessage{
		Success:   true,
		MessageID: msg.MessageID,
		DeletedAt: deletedAt,
		Message:   dbMsg.Content,
	}

	if err := s.sendMessage(sess, protocol.TypeMessageDeleted, resp); err != nil {
		return err
	}

	if err := s.broadcastToChannel(dbMsg.ChannelID, protocol.TypeMessageDeleted, resp); err != nil {
		log.Printf("Failed to broadcast message deletion: %v", err)
	}

	return nil
}

// handlePing handles PING message
func (s *Server) handlePing(sess *Session, frame *protocol.Frame) error {
	// Decode message
	msg := &protocol.PingMessage{}
	if err := msg.Decode(frame.Payload); err != nil {
		return s.sendError(sess, 1000, "Invalid message format")
	}

	// Update session activity on PING (for idle detection, rate-limited based on session timeout)
	s.sessions.UpdateSessionActivity(sess, time.Now().UnixMilli())

	// Send PONG
	resp := &protocol.PongMessage{
		ClientTimestamp: msg.Timestamp,
	}

	return s.sendMessage(sess, protocol.TypePong, resp)
}

// handleDisconnect handles graceful client disconnect
func (s *Server) handleDisconnect(sess *Session, frame *protocol.Frame) error {
	// Client is disconnecting gracefully - remove from sessions map immediately
	// to prevent broadcasts during the 100ms grace period before connection closes
	s.sessions.RemoveSession(sess.ID)

	// Return error to close the connection
	return ErrClientDisconnecting
}

// sendMessage sends a protocol message to a session
func (s *Server) sendMessage(sess *Session, msgType uint8, msg interface{}) error {
	// Encode message payload
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

	// Create frame
	frame := &protocol.Frame{
		Version: protocol.ProtocolVersion,
		Type:    msgType,
		Flags:   0,
		Payload: payload,
	}

	// Send frame (SafeConn automatically handles write synchronization)
	debugLog.Printf("Session %d → SEND: Type=0x%02X Flags=0x%02X PayloadLen=%d", sess.ID, msgType, 0, len(payload))
	if err := sess.Conn.EncodeFrame(frame); err != nil {
		errorLog.Printf("Session %d: EncodeFrame failed (Type=0x%02X): %v", sess.ID, msgType, err)
		return err
	}
	return nil
}

// broadcastToChannel sends a message to all sessions in a channel
func (s *Server) broadcastToChannel(channelID int64, msgType uint8, msg interface{}) error {
	// Encode message payload
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

	// Create and encode frame once
	frame := &protocol.Frame{
		Version: protocol.ProtocolVersion,
		Type:    msgType,
		Flags:   0,
		Payload: payload,
	}

	var buf bytes.Buffer
	if err := protocol.EncodeFrame(&buf, frame); err != nil {
		return fmt.Errorf("failed to encode frame: %w", err)
	}
	frameBytes := buf.Bytes()

	// Collect target sessions: both joined sessions AND channel subscribers
	targetSessionsMap := make(map[uint64]*Session)

	// 1. Get sessions that have joined this channel
	s.sessions.mu.RLock()
	for _, sess := range s.sessions.sessions {
		sess.mu.RLock()
		joined := sess.JoinedChannel
		sess.mu.RUnlock()

		if joined != nil && *joined == channelID {
			targetSessionsMap[sess.ID] = sess
		}
	}
	s.sessions.mu.RUnlock()

	// 2. Get sessions subscribed to this channel (using subscription index)
	channelSub := ChannelSubscription{
		ChannelID:    uint64(channelID),
		SubchannelID: nil,
	}
	subscribedSessions := s.sessions.GetChannelSubscribers(channelSub)
	for _, sess := range subscribedSessions {
		targetSessionsMap[sess.ID] = sess
	}

	// Convert map to slice
	targetSessions := make([]*Session, 0, len(targetSessionsMap))
	for _, sess := range targetSessionsMap {
		targetSessions = append(targetSessions, sess)
	}

	// Broadcast to target sessions
	deadSessions := make([]uint64, 0)
	for _, sess := range targetSessions {
		if writeErr := sess.Conn.WriteBytes(frameBytes); writeErr != nil {
			debugLog.Printf("Session %d: Broadcast write failed: %v", sess.ID, writeErr)
			deadSessions = append(deadSessions, sess.ID)
		}
	}

	// Remove dead sessions
	for _, sessID := range deadSessions {
		s.sessions.RemoveSession(sessID)
	}

	return nil
}

// broadcastNewMessage sends a NEW_MESSAGE to subscribed sessions only (subscription-aware)
func (s *Server) broadcastNewMessage(msg *protocol.NewMessageMessage, threadRootID *uint64) error {
	startTime := time.Now()

	// Encode message payload ONCE (not per recipient)
	payload, err := msg.Encode()
	if err != nil {
		return fmt.Errorf("failed to encode message: %w", err)
	}

	// Create and encode frame ONCE
	frame := &protocol.Frame{
		Version: protocol.ProtocolVersion,
		Type:    protocol.TypeNewMessage,
		Flags:   0,
		Payload: payload,
	}

	// Encode frame to bytes once
	var buf bytes.Buffer
	if err := protocol.EncodeFrame(&buf, frame); err != nil {
		return fmt.Errorf("failed to encode frame: %w", err)
	}
	frameBytes := buf.Bytes()

	// Build channel subscription key
	var subchannelID *uint64
	if msg.SubchannelID != nil {
		id := uint64(*msg.SubchannelID)
		subchannelID = &id
	}

	channelSub := ChannelSubscription{
		ChannelID:    msg.ChannelID,
		SubchannelID: subchannelID,
	}

	// Determine if this is a top-level message
	isTopLevel := msg.ParentID == nil || (msg.ParentID != nil && *msg.ParentID == 0)

	// Metrics: track broadcast
	if s.metrics != nil {
		s.metrics.RecordMessageBroadcast()
	}
	recipientCount := 0
	broadcastType := "thread"
	if isTopLevel {
		broadcastType = "channel"
	}

	// Get subscribers using reverse index (no iteration through all sessions!)
	var targetSessions []*Session
	if isTopLevel {
		// Top-level message: get channel subscribers
		targetSessions = s.sessions.GetChannelSubscribers(channelSub)
	} else if threadRootID != nil {
		// Reply: get thread subscribers
		targetSessions = s.sessions.GetThreadSubscribers(*threadRootID)
	}

	// Broadcast to target sessions synchronously (writes are already buffered by TCP)
	recipientCount = len(targetSessions)
	deadSessions := make([]uint64, 0)
	for _, sess := range targetSessions {
		if writeErr := sess.Conn.WriteBytes(frameBytes); writeErr != nil {
			debugLog.Printf("Session %d: Broadcast write failed: %v", sess.ID, writeErr)
			deadSessions = append(deadSessions, sess.ID)
		}
	}

	// Remove dead sessions
	for _, sessID := range deadSessions {
		s.sessions.RemoveSession(sessID)
	}

	// Metrics: record fan-out and duration
	if s.metrics != nil {
		s.metrics.RecordBroadcastFanout(broadcastType, recipientCount)
		s.metrics.RecordBroadcastDuration(broadcastType, time.Since(startTime).Seconds())
	}

	return nil
}

// convertDBMessagesToProtocol converts database messages to protocol messages
func convertDBMessagesToProtocol(dbMessages []*database.Message, db *database.MemDB) []protocol.Message {
	messages := make([]protocol.Message, len(dbMessages))
	for i, dbMsg := range dbMessages {
		messages[i] = *convertDBMessageToProtocol(dbMsg, db)
	}
	return messages
}

// convertDBMessageToProtocol converts a database message to protocol message
func convertDBMessageToProtocol(dbMsg *database.Message, db *database.MemDB) *protocol.Message {
	var subchannelID, parentID, authorUserID *uint64
	var editedAt *time.Time

	if dbMsg.SubchannelID != nil {
		id := uint64(*dbMsg.SubchannelID)
		subchannelID = &id
	}
	if dbMsg.ParentID != nil {
		id := uint64(*dbMsg.ParentID)
		parentID = &id
	}
	if dbMsg.AuthorUserID != nil {
		id := uint64(*dbMsg.AuthorUserID)
		authorUserID = &id
	}
	if dbMsg.EditedAt != nil {
		t := time.UnixMilli(*dbMsg.EditedAt)
		editedAt = &t
	}

	// Determine display nickname (with prefix)
	nickname := dbMsg.AuthorNickname
	if dbMsg.AuthorUserID != nil {
		// Registered user - lookup and apply prefix based on flags
		user, err := db.GetUserByID(*dbMsg.AuthorUserID)
		if err == nil {
			prefix := protocol.UserFlags(user.UserFlags).DisplayPrefix()
			nickname = prefix + user.Nickname
		} else {
			// Fallback if user lookup fails (shouldn't happen)
			nickname = "<user:" + fmt.Sprint(*dbMsg.AuthorUserID) + ">"
		}
	} else {
		// Anonymous user - prefix with tilde
		nickname = "~" + dbMsg.AuthorNickname
	}

	// Count replies (only for root messages)
	replyCount := uint32(0)
	if dbMsg.ParentID == nil {
		count, err := db.CountReplies(dbMsg.ID)
		if err == nil {
			replyCount = count
		}
	}

	return &protocol.Message{
		ID:             uint64(dbMsg.ID),
		ChannelID:      uint64(dbMsg.ChannelID),
		SubchannelID:   subchannelID,
		ParentID:       parentID,
		AuthorUserID:   authorUserID,
		AuthorNickname: nickname, // Prefixed for registered users, as-is for anonymous
		Content:        dbMsg.Content,
		CreatedAt:      time.UnixMilli(dbMsg.CreatedAt),
		EditedAt:       editedAt,
		ReplyCount:     replyCount,
	}
}

// handleSubscribeThread handles SUBSCRIBE_THREAD message
func (s *Server) handleSubscribeThread(sess *Session, frame *protocol.Frame) error {
	msg := &protocol.SubscribeThreadMessage{}
	if err := msg.Decode(frame.Payload); err != nil {
		return s.sendError(sess, protocol.ErrCodeInvalidFormat, "Invalid message format")
	}

	// Validate thread exists
	exists, err := s.db.MessageExists(int64(msg.ThreadID))
	if err != nil {
		return s.dbError(sess, "MessageExists", err)
	}
	if !exists {
		return s.sendError(sess, protocol.ErrCodeThreadNotFound, "Thread does not exist")
	}

	// Get thread's channel for tracking
	threadMsg, err := s.db.GetMessage(int64(msg.ThreadID))
	if err != nil {
		return s.dbError(sess, "GetMessage", err)
	}

	var subchannelID *uint64
	if threadMsg.SubchannelID != nil {
		id := uint64(*threadMsg.SubchannelID)
		subchannelID = &id
	}

	channelSub := ChannelSubscription{
		ChannelID:    uint64(threadMsg.ChannelID),
		SubchannelID: subchannelID,
	}

	// Add subscription with limit check
	if sess.ThreadSubscriptionCount() >= int(s.config.MaxThreadSubscriptions) {
		return s.sendError(sess, protocol.ErrCodeThreadSubscriptionLimit, fmt.Sprintf("Thread subscription limit exceeded (max %d per session)", s.config.MaxThreadSubscriptions))
	}

	s.sessions.SubscribeToThread(sess, msg.ThreadID, channelSub)

	// Send success response
	resp := &protocol.SubscribeOkMessage{
		Type:         1, // 1=thread
		ID:           msg.ThreadID,
		SubchannelID: subchannelID,
	}
	return s.sendMessage(sess, protocol.TypeSubscribeOk, resp)
}

// handleUnsubscribeThread handles UNSUBSCRIBE_THREAD message
func (s *Server) handleUnsubscribeThread(sess *Session, frame *protocol.Frame) error {
	msg := &protocol.UnsubscribeThreadMessage{}
	if err := msg.Decode(frame.Payload); err != nil {
		return s.sendError(sess, protocol.ErrCodeInvalidFormat, "Invalid message format")
	}

	// Remove subscription (idempotent - no error if not subscribed)
	s.sessions.UnsubscribeFromThread(sess, msg.ThreadID)

	// Send success response
	resp := &protocol.SubscribeOkMessage{
		Type: 1, // 1=thread
		ID:   msg.ThreadID,
	}
	return s.sendMessage(sess, protocol.TypeSubscribeOk, resp)
}

// handleSubscribeChannel handles SUBSCRIBE_CHANNEL message
func (s *Server) handleSubscribeChannel(sess *Session, frame *protocol.Frame) error {
	msg := &protocol.SubscribeChannelMessage{}
	if err := msg.Decode(frame.Payload); err != nil {
		return s.sendError(sess, protocol.ErrCodeInvalidFormat, "Invalid message format")
	}

	// Validate channel exists in MemDB (instant lookup)
	exists, err := s.db.ChannelExists(int64(msg.ChannelID))
	if err != nil || !exists {
		return s.sendError(sess, protocol.ErrCodeChannelNotFound, "Channel does not exist")
	}

	// Validate subchannel if provided (still uses DB - subchannels not cached yet)
	if msg.SubchannelID != nil {
		exists, err := s.db.SubchannelExists(int64(*msg.SubchannelID))
		if err != nil {
			return s.dbError(sess, "SubchannelExists", err)
		}
		if !exists {
			return s.sendError(sess, protocol.ErrCodeSubchannelNotFound, "Subchannel does not exist")
		}
	}

	channelSub := ChannelSubscription{
		ChannelID:    msg.ChannelID,
		SubchannelID: msg.SubchannelID,
	}

	// Add subscription with limit check
	if sess.ChannelSubscriptionCount() >= int(s.config.MaxChannelSubscriptions) {
		return s.sendError(sess, protocol.ErrCodeChannelSubscriptionLimit, fmt.Sprintf("Channel subscription limit exceeded (max %d per session)", s.config.MaxChannelSubscriptions))
	}

	s.sessions.SubscribeToChannel(sess, channelSub)

	// Send success response
	resp := &protocol.SubscribeOkMessage{
		Type:         2, // 2=channel
		ID:           msg.ChannelID,
		SubchannelID: msg.SubchannelID,
	}
	return s.sendMessage(sess, protocol.TypeSubscribeOk, resp)
}

// handleUnsubscribeChannel handles UNSUBSCRIBE_CHANNEL message
func (s *Server) handleUnsubscribeChannel(sess *Session, frame *protocol.Frame) error {
	msg := &protocol.UnsubscribeChannelMessage{}
	if err := msg.Decode(frame.Payload); err != nil {
		return s.sendError(sess, protocol.ErrCodeInvalidFormat, "Invalid message format")
	}

	channelSub := ChannelSubscription{
		ChannelID:    msg.ChannelID,
		SubchannelID: msg.SubchannelID,
	}

	// Remove subscription (idempotent - no error if not subscribed)
	s.sessions.UnsubscribeFromChannel(sess, channelSub)

	// Send success response
	resp := &protocol.SubscribeOkMessage{
		Type:         2, // 2=channel
		ID:           msg.ChannelID,
		SubchannelID: msg.SubchannelID,
	}
	return s.sendMessage(sess, protocol.TypeSubscribeOk, resp)
}

// broadcastChannelCreated broadcasts a CHANNEL_CREATED message to all connected users (except creator)
func (s *Server) broadcastChannelCreated(ch *database.Channel, creatorSessionID uint64) {
	msg := &protocol.ChannelCreatedMessage{
		Success:        true,
		ChannelID:      uint64(ch.ID),
		Name:           ch.Name,
		Description:    safeDeref(ch.Description, ""),
		Type:           ch.ChannelType,
		RetentionHours: ch.MessageRetentionHours,
		Message:        fmt.Sprintf("New channel '%s' created", ch.DisplayName),
	}

	// Broadcast to all connected sessions EXCEPT the creator (they already got the response)
	allSessions := s.sessions.GetAllSessions()
	for _, sess := range allSessions {
		if sess.ID == creatorSessionID {
			continue // Skip creator - they already received the response
		}
		if err := s.sendMessage(sess, protocol.TypeChannelCreated, msg); err != nil {
			log.Printf("Failed to broadcast CHANNEL_CREATED to session %d: %v", sess.ID, err)
		}
	}
}
