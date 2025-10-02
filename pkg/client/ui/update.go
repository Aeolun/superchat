package ui

import (
	"fmt"
	"sort"
	"time"

	"github.com/charmbracelet/bubbles/viewport"
	tea "github.com/charmbracelet/bubbletea"
	"github.com/aeolun/superchat/pkg/protocol"
)

// Update handles messages and updates the model
func (m Model) Update(msg tea.Msg) (tea.Model, tea.Cmd) {
	switch msg := msg.(type) {
	case tea.KeyMsg:
		return m.handleKeyPress(msg)

	case tea.WindowSizeMsg:
		m.width = msg.Width
		m.height = msg.Height

		// Initialize or resize thread view viewport
		if m.threadViewport.Width == 0 || m.threadViewport.Height == 0 {
			m.threadViewport = viewport.New(msg.Width-2, msg.Height-6)
			m.threadViewport.SetContent(m.buildThreadContent())
		} else {
			m.threadViewport.Width = msg.Width - 2
			m.threadViewport.Height = msg.Height - 6
		}

		// Initialize or resize thread list viewport
		threadListWidth := msg.Width - msg.Width/4 - 1 - 4 // Account for channel pane, space, and border+padding
		if threadListWidth < 30 {
			threadListWidth = 30
		}
		if m.threadListViewport.Width == 0 || m.threadListViewport.Height == 0 {
			m.threadListViewport = viewport.New(threadListWidth, msg.Height-6)
			m.threadListViewport.SetContent(m.buildThreadListContent())
		} else {
			m.threadListViewport.Width = threadListWidth
			m.threadListViewport.Height = msg.Height - 6
		}

		return m, nil

	case ServerFrameMsg:
		return m.handleServerFrame(msg.Frame)

	case ErrorMsg:
		// Only show non-disconnect errors (disconnect is handled by DisconnectedMsg)
		if msg.Err.Error() != "disconnected from server" {
			m.errorMessage = msg.Err.Error()
		}
		return m, listenForServerFrames(m.conn)

	case ConnectedMsg:
		return m.handleReconnected()

	case DisconnectedMsg:
		m.connectionState = StateDisconnected
		m.errorMessage = ""
		return m, listenForServerFrames(m.conn)

	case ReconnectingMsg:
		m.connectionState = StateReconnecting
		m.reconnectAttempt = msg.Attempt
		m.errorMessage = ""
		return m, listenForServerFrames(m.conn)

	case TickMsg:
		// Check if we need to send a ping (only if connected)
		if m.connectionState == StateConnected {
			now := time.Time(msg)
			if now.Sub(m.lastPingSent) >= m.pingInterval {
				m.lastPingSent = now
				return m, tea.Batch(tickCmd(), m.sendPing())
			}
		}
		return m, tickCmd()
	}

	return m, nil
}

// handleKeyPress handles keyboard input
func (m Model) handleKeyPress(msg tea.KeyMsg) (tea.Model, tea.Cmd) {
	// Global shortcuts
	switch msg.String() {
	case "ctrl+c":
		return m, tea.Quit
	case "q":
		// Allow quit from anywhere except compose mode
		if m.currentView != ViewCompose && m.currentView != ViewNicknameSetup {
			return m, tea.Quit
		}
	case "?", "h":
		if m.currentView != ViewCompose {
			m.showHelp = !m.showHelp
			return m, nil
		}
	}

	// View-specific handling
	switch m.currentView {
	case ViewSplash:
		return m.handleSplashKeys(msg)
	case ViewNicknameSetup:
		return m.handleNicknameSetupKeys(msg)
	case ViewChannelList:
		return m.handleChannelListKeys(msg)
	case ViewThreadList:
		return m.handleThreadListKeys(msg)
	case ViewThreadView:
		return m.handleThreadViewKeys(msg)
	case ViewCompose:
		return m.handleComposeKeys(msg)
	}

	return m, nil
}

// handleSplashKeys handles splash screen keys
func (m Model) handleSplashKeys(msg tea.KeyMsg) (tea.Model, tea.Cmd) {
	// Any key continues - go straight to browsing
	m.currentView = ViewChannelList

	// Send SET_NICKNAME if we have one from last time
	if m.nickname != "" {
		return m, tea.Batch(
			m.sendSetNickname(),
			m.requestChannelList(),
		)
	}

	// No nickname - browse anonymously
	return m, m.requestChannelList()
}

// handleNicknameSetupKeys handles nickname setup keys
func (m Model) handleNicknameSetupKeys(msg tea.KeyMsg) (tea.Model, tea.Cmd) {
	switch msg.String() {
	case "enter":
		if len(m.nickname) >= 3 {
			// Save nickname and proceed
			m.state.SetLastNickname(m.nickname)
			if m.firstRun {
				m.state.SetFirstRunComplete()
			}

			// Return to the view we came from, or channel list by default
			nextView := ViewChannelList
			if m.returnToView != ViewSplash && m.returnToView != ViewNicknameSetup {
				nextView = m.returnToView
			}
			m.currentView = nextView

			return m, m.sendSetNickname()
		}
		m.errorMessage = "Nickname must be at least 3 characters"
		return m, nil

	case "backspace":
		if len(m.nickname) > 0 {
			m.nickname = m.nickname[:len(m.nickname)-1]
		}
		return m, nil

	case "esc":
		return m, tea.Quit

	default:
		// Add character if valid
		if len(msg.String()) == 1 && len(m.nickname) < 20 {
			m.nickname += msg.String()
		}
		return m, nil
	}
}

// handleChannelListKeys handles channel list navigation
func (m Model) handleChannelListKeys(msg tea.KeyMsg) (tea.Model, tea.Cmd) {
	switch msg.String() {
	case "up", "k":
		if m.channelCursor > 0 {
			m.channelCursor--
		}
		return m, nil

	case "down", "j":
		if m.channelCursor < len(m.channels)-1 {
			m.channelCursor++
		}
		return m, nil

	case "enter":
		if m.channelCursor < len(m.channels) {
			selectedChannel := m.channels[m.channelCursor]
			m.currentChannel = &selectedChannel
			m.currentView = ViewThreadList
			return m, tea.Batch(
				m.sendJoinChannel(selectedChannel.ID),
				m.requestThreadList(selectedChannel.ID),
			)
		}
		return m, nil

	case "r":
		// Refresh channel list
		return m, m.requestChannelList()

	case "esc":
		return m, tea.Quit
	}

	return m, nil
}

// handleThreadListKeys handles thread list navigation
func (m Model) handleThreadListKeys(msg tea.KeyMsg) (tea.Model, tea.Cmd) {
	switch msg.String() {
	case "up", "k":
		if m.threadCursor > 0 {
			m.threadCursor--
			m.threadListViewport.SetContent(m.buildThreadListContent())
		}
		return m, nil

	case "down", "j":
		if m.threadCursor < len(m.threads)-1 {
			m.threadCursor++
			m.threadListViewport.SetContent(m.buildThreadListContent())
		}
		return m, nil

	case "enter":
		if m.threadCursor < len(m.threads) {
			selectedThread := m.threads[m.threadCursor]
			m.currentThread = &selectedThread
			m.currentView = ViewThreadView
			m.replyCursor = 0
			m.newMessageIDs = make(map[uint64]bool) // Clear new message tracking
			m.threadViewport.SetContent(m.buildThreadContent())
			m.threadViewport.GotoTop()
			return m, m.requestThreadReplies(selectedThread.ID)
		}
		return m, nil

	case "n":
		// New thread - check for nickname first
		if m.nickname == "" {
			m.composeMode = ComposeModeNewThread
			m.composeInput = ""
			m.composeParentID = nil
			m.returnToView = ViewCompose
			m.currentView = ViewNicknameSetup
			return m, nil
		}
		m.currentView = ViewCompose
		m.composeMode = ComposeModeNewThread
		m.composeInput = ""
		m.composeParentID = nil
		return m, nil

	case "r":
		// Refresh thread list
		if m.currentChannel != nil {
			return m, m.requestThreadList(m.currentChannel.ID)
		}
		return m, nil

	case "esc":
		// Back to channel list
		m.currentView = ViewChannelList
		if m.currentChannel != nil {
			m.sendLeaveChannel()
		}
		m.currentChannel = nil
		m.threads = []protocol.Message{}
		m.threadCursor = 0
		return m, nil
	}

	return m, nil
}

// handleThreadViewKeys handles thread view navigation
func (m Model) handleThreadViewKeys(msg tea.KeyMsg) (tea.Model, tea.Cmd) {
	var cmd tea.Cmd

	switch msg.String() {
	case "up", "k":
		if m.replyCursor > 0 {
			m.replyCursor--
			m.markCurrentMessageAsRead()
			m.threadViewport.SetContent(m.buildThreadContent())
			m.scrollToKeepCursorVisible()
		}
		return m, nil

	case "down", "j":
		if m.replyCursor < len(m.threadReplies) {
			m.replyCursor++
			m.markCurrentMessageAsRead()
			m.threadViewport.SetContent(m.buildThreadContent())
			m.scrollToKeepCursorVisible()
		}
		return m, nil

	case "r":
		// Reply to selected message - check for nickname first
		var parentID uint64
		if m.replyCursor == 0 {
			// Replying to root
			if m.currentThread != nil {
				parentID = m.currentThread.ID
			}
		} else if m.replyCursor-1 < len(m.threadReplies) {
			parentID = m.threadReplies[m.replyCursor-1].ID
		}

		if m.nickname == "" {
			m.composeMode = ComposeModeReply
			m.composeParentID = &parentID
			m.composeInput = ""
			m.returnToView = ViewCompose
			m.currentView = ViewNicknameSetup
			return m, nil
		}

		m.currentView = ViewCompose
		m.composeMode = ComposeModeReply
		m.composeParentID = &parentID
		m.composeInput = ""
		return m, nil

	case "d":
		// Delete message (not implemented in V1)
		// Just consume the key to prevent viewport scrolling
		return m, nil

	case "esc":
		// Back to thread list
		m.currentView = ViewThreadList
		m.threadReplies = []protocol.Message{}
		m.replyCursor = 0
		return m, nil

	default:
		// Pass unhandled keys to viewport for scrolling (pgup/pgdown/etc)
		m.threadViewport, cmd = m.threadViewport.Update(msg)
		return m, cmd
	}

	return m, nil
}

// handleComposeKeys handles message composition
func (m Model) handleComposeKeys(msg tea.KeyMsg) (tea.Model, tea.Cmd) {
	switch msg.String() {
	case "esc":
		// Cancel compose
		if m.composeMode == ComposeModeNewThread {
			m.currentView = ViewThreadList
		} else {
			m.currentView = ViewThreadView
		}
		m.composeInput = ""
		return m, nil

	case "ctrl+d", "ctrl+enter":
		// Send message
		if len(m.composeInput) == 0 {
			m.errorMessage = "Message cannot be empty"
			return m, nil
		}

		if m.currentChannel == nil {
			m.errorMessage = "No channel selected"
			return m, nil
		}

		cmd := m.sendPostMessage(m.currentChannel.ID, m.composeParentID, m.composeInput)

		// Return to previous view
		if m.composeMode == ComposeModeNewThread {
			m.currentView = ViewThreadList
		} else {
			m.currentView = ViewThreadView
		}
		m.composeInput = ""

		return m, cmd

	case "backspace":
		if len(m.composeInput) > 0 {
			m.composeInput = m.composeInput[:len(m.composeInput)-1]
		}
		return m, nil

	case "enter":
		m.composeInput += "\n"
		return m, nil

	default:
		// Add character
		if len(msg.String()) == 1 {
			m.composeInput += msg.String()
		}
		return m, nil
	}
}

// handleServerFrame processes incoming server frames
func (m Model) handleServerFrame(frame *protocol.Frame) (tea.Model, tea.Cmd) {
	switch frame.Type {
	case protocol.TypeServerConfig:
		return m.handleServerConfig(frame)
	case protocol.TypeNicknameResponse:
		return m.handleNicknameResponse(frame)
	case protocol.TypeChannelList:
		return m.handleChannelList(frame)
	case protocol.TypeJoinResponse:
		return m.handleJoinResponse(frame)
	case protocol.TypeMessageList:
		return m.handleMessageList(frame)
	case protocol.TypeMessagePosted:
		return m.handleMessagePosted(frame)
	case protocol.TypeNewMessage:
		return m.handleNewMessage(frame)
	case protocol.TypeError:
		return m.handleError(frame)
	}

	// Continue listening
	return m, listenForServerFrames(m.conn)
}

// handleServerConfig processes SERVER_CONFIG
func (m Model) handleServerConfig(frame *protocol.Frame) (tea.Model, tea.Cmd) {
	msg := &protocol.ServerConfigMessage{}
	if err := msg.Decode(frame.Payload); err != nil {
		m.errorMessage = fmt.Sprintf("Failed to decode SERVER_CONFIG: %v", err)
		return m, listenForServerFrames(m.conn)
	}

	m.serverConfig = msg
	m.statusMessage = fmt.Sprintf("Connected (protocol v%d)", msg.ProtocolVersion)

	return m, listenForServerFrames(m.conn)
}

// handleNicknameResponse processes NICKNAME_RESPONSE
func (m Model) handleNicknameResponse(frame *protocol.Frame) (tea.Model, tea.Cmd) {
	msg := &protocol.NicknameResponseMessage{}
	if err := msg.Decode(frame.Payload); err != nil {
		m.errorMessage = fmt.Sprintf("Failed to decode response: %v", err)
		return m, listenForServerFrames(m.conn)
	}

	if msg.Success {
		m.statusMessage = fmt.Sprintf("Nickname set to ~%s", m.nickname)
	} else {
		m.errorMessage = msg.Message
	}

	return m, listenForServerFrames(m.conn)
}

// handleChannelList processes CHANNEL_LIST
func (m Model) handleChannelList(frame *protocol.Frame) (tea.Model, tea.Cmd) {
	msg := &protocol.ChannelListMessage{}
	if err := msg.Decode(frame.Payload); err != nil {
		m.errorMessage = fmt.Sprintf("Failed to decode channel list: %v", err)
		return m, listenForServerFrames(m.conn)
	}

	m.channels = msg.Channels
	m.statusMessage = fmt.Sprintf("Loaded %d channels", len(m.channels))

	return m, listenForServerFrames(m.conn)
}

// handleJoinResponse processes JOIN_RESPONSE
func (m Model) handleJoinResponse(frame *protocol.Frame) (tea.Model, tea.Cmd) {
	msg := &protocol.JoinResponseMessage{}
	if err := msg.Decode(frame.Payload); err != nil {
		m.errorMessage = fmt.Sprintf("Failed to decode join response: %v", err)
		return m, listenForServerFrames(m.conn)
	}

	if msg.Success {
		m.statusMessage = msg.Message
	} else {
		m.errorMessage = msg.Message
	}

	return m, listenForServerFrames(m.conn)
}

// handleMessageList processes MESSAGE_LIST
func (m Model) handleMessageList(frame *protocol.Frame) (tea.Model, tea.Cmd) {
	msg := &protocol.MessageListMessage{}
	if err := msg.Decode(frame.Payload); err != nil {
		m.errorMessage = fmt.Sprintf("Failed to decode message list: %v", err)
		return m, listenForServerFrames(m.conn)
	}

	if msg.ParentID == nil {
		// Root messages (thread list)
		m.threads = msg.Messages
		m.threadListViewport.SetContent(m.buildThreadListContent())
		m.statusMessage = fmt.Sprintf("Loaded %d threads", len(m.threads))
	} else {
		// Thread replies - sort them in depth-first order
		if m.currentThread != nil {
			m.threadReplies = sortThreadReplies(msg.Messages, m.currentThread.ID)
		} else {
			m.threadReplies = msg.Messages
		}
		m.threadViewport.SetContent(m.buildThreadContent())
		m.statusMessage = fmt.Sprintf("Loaded %d replies", len(m.threadReplies))
	}

	return m, listenForServerFrames(m.conn)
}

// handleMessagePosted processes MESSAGE_POSTED
func (m Model) handleMessagePosted(frame *protocol.Frame) (tea.Model, tea.Cmd) {
	msg := &protocol.MessagePostedMessage{}
	if err := msg.Decode(frame.Payload); err != nil {
		m.errorMessage = fmt.Sprintf("Failed to decode response: %v", err)
		return m, listenForServerFrames(m.conn)
	}

	if msg.Success {
		m.statusMessage = "Message posted"
		// Refresh the view
		if m.composeMode == ComposeModeNewThread && m.currentChannel != nil {
			return m, tea.Batch(
				listenForServerFrames(m.conn),
				m.requestThreadList(m.currentChannel.ID),
			)
		} else if m.currentThread != nil {
			return m, tea.Batch(
				listenForServerFrames(m.conn),
				m.requestThreadReplies(m.currentThread.ID),
			)
		}
	} else {
		m.errorMessage = msg.Message
	}

	return m, listenForServerFrames(m.conn)
}

// handleNewMessage processes NEW_MESSAGE broadcasts
func (m Model) handleNewMessage(frame *protocol.Frame) (tea.Model, tea.Cmd) {
	msg := &protocol.NewMessageMessage{}
	if err := msg.Decode(frame.Payload); err != nil {
		m.errorMessage = fmt.Sprintf("Failed to decode new message: %v", err)
		return m, listenForServerFrames(m.conn)
	}

	// Convert to protocol.Message
	newMsg := protocol.Message(*msg)

	// Add to appropriate list
	if m.currentChannel != nil && newMsg.ChannelID == m.currentChannel.ID {
		if newMsg.ParentID == nil {
			// New root message - add to threads
			m.threads = append([]protocol.Message{newMsg}, m.threads...)
			m.threadListViewport.SetContent(m.buildThreadListContent())
		} else if m.currentThread != nil && newMsg.ParentID != nil {
			// Check if this message belongs to the current thread
			// (either replying to root or to any existing reply)
			belongsToThread := *newMsg.ParentID == m.currentThread.ID
			if !belongsToThread {
				// Check if it's a reply to any existing reply in the thread
				for _, reply := range m.threadReplies {
					if *newMsg.ParentID == reply.ID {
						belongsToThread = true
						break
					}
				}
			}

			if belongsToThread {
				// Reply to current thread - add it
				m.threadReplies = append(m.threadReplies, newMsg)
				// Sort replies in depth-first order based on tree structure
				m.threadReplies = sortThreadReplies(m.threadReplies, m.currentThread.ID)

				if m.currentView == ViewThreadView {
					// Check if this is our own message
					isOwnMessage := newMsg.AuthorNickname == m.nickname

					if isOwnMessage {
						// Scroll to and select our own message
						for i, reply := range m.threadReplies {
							if reply.ID == newMsg.ID {
								m.replyCursor = i + 1 // +1 because 0 is root
								break
							}
						}
						m.threadViewport.SetContent(m.buildThreadContent())
						m.scrollToKeepCursorVisible()
					} else {
						// Mark others' messages as new
						m.newMessageIDs[newMsg.ID] = true
						m.threadViewport.SetContent(m.buildThreadContent())
					}
				} else {
					m.threadViewport.SetContent(m.buildThreadContent())
				}
			}
		}
	}

	return m, listenForServerFrames(m.conn)
}

// handleError processes ERROR messages
func (m Model) handleError(frame *protocol.Frame) (tea.Model, tea.Cmd) {
	msg := &protocol.ErrorMessage{}
	if err := msg.Decode(frame.Payload); err != nil {
		m.errorMessage = fmt.Sprintf("Failed to decode error: %v", err)
		return m, listenForServerFrames(m.conn)
	}

	m.errorMessage = fmt.Sprintf("Error %d: %s", msg.ErrorCode, msg.Message)

	return m, listenForServerFrames(m.conn)
}

// Command helpers

func (m Model) sendSetNickname() tea.Cmd {
	return func() tea.Msg {
		msg := &protocol.SetNicknameMessage{
			Nickname: m.nickname,
		}
		if err := m.conn.SendMessage(protocol.TypeSetNickname, msg); err != nil {
			return ErrorMsg{Err: err}
		}
		return nil
	}
}

func (m Model) requestChannelList() tea.Cmd {
	return func() tea.Msg {
		msg := &protocol.ListChannelsMessage{
			FromChannelID: 0,
			Limit:         1000,
		}
		if err := m.conn.SendMessage(protocol.TypeListChannels, msg); err != nil {
			return ErrorMsg{Err: err}
		}
		return nil
	}
}

func (m Model) sendJoinChannel(channelID uint64) tea.Cmd {
	return func() tea.Msg {
		msg := &protocol.JoinChannelMessage{
			ChannelID:    channelID,
			SubchannelID: nil,
		}
		if err := m.conn.SendMessage(protocol.TypeJoinChannel, msg); err != nil {
			return ErrorMsg{Err: err}
		}
		return nil
	}
}

func (m Model) sendLeaveChannel() tea.Cmd {
	return func() tea.Msg {
		// V1: Leave channel message (not fully implemented on server yet)
		return nil
	}
}

func (m Model) requestThreadList(channelID uint64) tea.Cmd {
	return func() tea.Msg {
		msg := &protocol.ListMessagesMessage{
			ChannelID:    channelID,
			SubchannelID: nil,
			Limit:        50,
			BeforeID:     nil,
			ParentID:     nil,
		}
		if err := m.conn.SendMessage(protocol.TypeListMessages, msg); err != nil {
			return ErrorMsg{Err: err}
		}
		return nil
	}
}

func (m Model) requestThreadReplies(threadID uint64) tea.Cmd {
	return func() tea.Msg {
		msg := &protocol.ListMessagesMessage{
			ChannelID:    m.currentChannel.ID,
			SubchannelID: nil,
			Limit:        200,
			BeforeID:     nil,
			ParentID:     &threadID,
		}
		if err := m.conn.SendMessage(protocol.TypeListMessages, msg); err != nil {
			return ErrorMsg{Err: err}
		}
		return nil
	}
}

func (m Model) sendPostMessage(channelID uint64, parentID *uint64, content string) tea.Cmd {
	return func() tea.Msg {
		msg := &protocol.PostMessageMessage{
			ChannelID:    channelID,
			SubchannelID: nil,
			ParentID:     parentID,
			Content:      content,
		}
		if err := m.conn.SendMessage(protocol.TypePostMessage, msg); err != nil {
			return ErrorMsg{Err: err}
		}
		return nil
	}
}

func (m Model) sendPing() tea.Cmd {
	return func() tea.Msg {
		msg := &protocol.PingMessage{
			Timestamp: time.Now().UnixMilli(),
		}
		if err := m.conn.SendMessage(protocol.TypePing, msg); err != nil {
			return ErrorMsg{Err: err}
		}
		return nil
	}
}

// markCurrentMessageAsRead removes the "new" indicator from the currently selected message
func (m *Model) markCurrentMessageAsRead() {
	if m.replyCursor == 0 && m.currentThread != nil {
		// Root message selected
		delete(m.newMessageIDs, m.currentThread.ID)
	} else if m.replyCursor > 0 && m.replyCursor-1 < len(m.threadReplies) {
		// Reply message selected
		reply := m.threadReplies[m.replyCursor-1]
		delete(m.newMessageIDs, reply.ID)
	}
}

// sortThreadReplies sorts messages in depth-first order based on tree structure
// Messages are grouped by parent and sorted by timestamp within each group
func sortThreadReplies(replies []protocol.Message, rootID uint64) []protocol.Message {
	if len(replies) == 0 {
		return replies
	}

	// Build a map of parent_id -> children
	childrenMap := make(map[uint64][]protocol.Message)
	for _, msg := range replies {
		if msg.ParentID != nil {
			parentID := *msg.ParentID
			childrenMap[parentID] = append(childrenMap[parentID], msg)
		}
	}

	// Sort children by creation time within each parent group
	for _, children := range childrenMap {
		sort.Slice(children, func(i, j int) bool {
			return children[i].CreatedAt.Before(children[j].CreatedAt)
		})
	}

	// Depth-first traversal to build final ordered list
	var result []protocol.Message
	var traverse func(parentID uint64)
	traverse = func(parentID uint64) {
		children := childrenMap[parentID]
		for _, child := range children {
			result = append(result, child)
			// Recursively add this child's children
			traverse(child.ID)
		}
	}

	// Start traversal from root
	traverse(rootID)

	return result
}

// handleReconnected handles successful reconnection
func (m Model) handleReconnected() (tea.Model, tea.Cmd) {
	m.connectionState = StateConnected
	m.reconnectAttempt = 0
	m.errorMessage = ""
	m.statusMessage = "Reconnected successfully"

	// Re-request data based on current view
	cmds := []tea.Cmd{listenForServerFrames(m.conn)}

	// Re-send nickname if we have one
	if m.nickname != "" {
		cmds = append(cmds, m.sendSetNickname())
	}

	// Re-request channel list
	cmds = append(cmds, m.requestChannelList())

	// If we're in a channel, rejoin and reload threads
	if m.currentChannel != nil {
		cmds = append(cmds, m.sendJoinChannel(m.currentChannel.ID))
		cmds = append(cmds, m.requestThreadList(m.currentChannel.ID))

		// If we're viewing a specific thread, reload replies
		if m.currentThread != nil && m.currentView == ViewThreadView {
			cmds = append(cmds, m.requestThreadReplies(m.currentThread.ID))
		}
	}

	return m, tea.Batch(cmds...)
}
