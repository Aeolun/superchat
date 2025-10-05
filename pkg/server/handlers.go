package server

import (
	"bytes"
	"errors"
	"fmt"
	"log"
	"regexp"
	"time"

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
			Description: *dbCh.Description,
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

	deletedAt := time.UnixMilli(*dbMsg.DeletedAt)
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

	// Create frame
	frame := &protocol.Frame{
		Version: protocol.ProtocolVersion,
		Type:    msgType,
		Flags:   0,
		Payload: payload,
	}

	// Broadcast to all sessions in channel
	s.sessions.BroadcastToChannel(channelID, frame)
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
	s.metrics.RecordMessageBroadcast()
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
	s.metrics.RecordBroadcastFanout(broadcastType, recipientCount)
	s.metrics.RecordBroadcastDuration(broadcastType, time.Since(startTime).Seconds())

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

	// Count replies
	replyCount := uint32(0)
	if dbMsg.ParentID == nil { // Only count for root messages
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
		AuthorNickname: dbMsg.AuthorNickname,
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
