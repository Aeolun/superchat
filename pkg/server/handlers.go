package server

import (
	"errors"
	"fmt"
	"log"
	"regexp"
	"time"

	"github.com/aeolun/superchat/pkg/database"
	"github.com/aeolun/superchat/pkg/protocol"
)

var nicknameRegex = regexp.MustCompile(`^[a-zA-Z0-9_-]{3,20}$`)

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

	// Get channels from database
	channels, err := s.db.ListChannels()
	if err != nil {
		return s.sendError(sess, 9001, "Database error")
	}

	// Convert to protocol channel list
	channelList := make([]protocol.Channel, 0, len(channels))
	for _, ch := range channels {
		desc := ""
		if ch.Description != nil {
			desc = *ch.Description
		}

		info := protocol.Channel{
			ID:             uint64(ch.ID),
			Name:           ch.Name,
			Description:    desc,
			UserCount:      0,     // TODO: Count sessions in channel
			IsOperator:     false, // TODO: Check if user is operator
			Type:           ch.ChannelType,
			RetentionHours: ch.MessageRetentionHours,
		}
		channelList = append(channelList, info)
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

	// Check if channel exists
	channel, err := s.db.GetChannel(int64(msg.ChannelID))
	if err != nil {
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
		Message:      fmt.Sprintf("Joined %s", channel.DisplayName),
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
			return s.sendError(sess, 9001, "Database error")
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
			return s.sendError(sess, 9001, "Database error")
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

	// Post message to database
	messageID, err := s.db.PostMessage(
		int64(msg.ChannelID),
		subchannelID,
		parentID,
		sess.UserID,
		nickname,
		msg.Content,
	)

	if err != nil {
		return s.sendError(sess, 9001, fmt.Sprintf("Failed to post message: %v", err))
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

	// Broadcast NEW_MESSAGE to all sessions in the channel
	dbMsg, err := s.db.GetMessage(uint64(messageID))
	if err != nil {
		return nil // Already sent confirmation, log but don't fail
	}

	newMsg := convertDBMessageToProtocol(dbMsg, s.db)
	broadcastMsg := (*protocol.NewMessageMessage)(newMsg)

	if err := s.broadcastToChannel(int64(msg.ChannelID), protocol.TypeNewMessage, broadcastMsg); err != nil {
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

	// Send PONG
	resp := &protocol.PongMessage{
		ClientTimestamp: msg.Timestamp,
	}

	return s.sendMessage(sess, protocol.TypePong, resp)
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

	// Send frame
	log.Printf("Session %d → SEND: Type=0x%02X Flags=0x%02X PayloadLen=%d", sess.ID, msgType, 0, len(payload))
	return protocol.EncodeFrame(sess.Conn, frame)
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

// convertDBMessagesToProtocol converts database messages to protocol messages
func convertDBMessagesToProtocol(dbMessages []*database.Message, db *database.DB) []protocol.Message {
	messages := make([]protocol.Message, len(dbMessages))
	for i, dbMsg := range dbMessages {
		messages[i] = *convertDBMessageToProtocol(dbMsg, db)
	}
	return messages
}

// convertDBMessageToProtocol converts a database message to protocol message
func convertDBMessageToProtocol(dbMsg *database.Message, db *database.DB) *protocol.Message {
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
		ThreadDepth:    dbMsg.ThreadDepth,
		ReplyCount:     replyCount,
	}
}
