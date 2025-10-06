package ui

import "github.com/aeolun/superchat/pkg/protocol"

// Safe pointer dereference helpers to prevent nil pointer crashes

// SafeChannelID safely gets the channel ID, returning 0 if nil
func SafeChannelID(ch *protocol.Channel) uint64 {
	if ch == nil {
		return 0
	}
	return ch.ID
}

// SafeChannelName safely gets the channel name, returning empty string if nil
func SafeChannelName(ch *protocol.Channel) string {
	if ch == nil {
		return ""
	}
	return ch.Name
}

// SafeThreadID safely gets the thread ID, returning 0 if nil
func SafeThreadID(msg *protocol.Message) uint64 {
	if msg == nil {
		return 0
	}
	return msg.ID
}

// SafeThreadContent safely gets the thread content, returning empty string if nil
func SafeThreadContent(msg *protocol.Message) string {
	if msg == nil {
		return ""
	}
	return msg.Content
}

// HasCurrentChannel checks if model has a current channel set
func (m Model) HasCurrentChannel() bool {
	return m.currentChannel != nil
}

// HasCurrentThread checks if model has a current thread set
func (m Model) HasCurrentThread() bool {
	return m.currentThread != nil
}

// HasServerConfig checks if model has received server config
func (m Model) HasServerConfig() bool {
	return m.serverConfig != nil
}
