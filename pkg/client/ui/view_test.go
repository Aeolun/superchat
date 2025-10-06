package ui

import (
	"strings"
	"testing"

	"github.com/aeolun/superchat/pkg/protocol"
	tea "github.com/charmbracelet/bubbletea"
)

// Test View() rendering for all view states

func TestView_NoWindowSize(t *testing.T) {
	m := NewTestModel()
	m.width = 0
	m.height = 0

	output := m.View()

	if output != "Loading..." {
		t.Errorf("View() with no dimensions = %q, want %q", output, "Loading...")
	}
}

func TestView_DisconnectedOverlay(t *testing.T) {
	m := SetupTestModelWithDimensions(80, 24)
	m.connectionState = StateDisconnected

	output := m.View()

	if !strings.Contains(output, "CONNECTION LOST") {
		t.Error("Disconnected overlay should contain 'CONNECTION LOST'")
	}
	if !strings.Contains(output, "Attempting to reconnect") {
		t.Error("Disconnected overlay should show reconnection message")
	}
}

func TestView_ReconnectingOverlay(t *testing.T) {
	m := SetupTestModelWithDimensions(80, 24)
	m.connectionState = StateReconnecting
	m.reconnectAttempt = 3

	output := m.View()

	if !strings.Contains(output, "RECONNECTING") {
		t.Error("Reconnecting overlay should contain 'RECONNECTING'")
	}
	if !strings.Contains(output, "Attempt 3") {
		t.Error("Reconnecting overlay should show attempt number")
	}
}

func TestView_HelpOverlay(t *testing.T) {
	m := SetupTestModelWithDimensions(80, 24)
	m.showHelp = true

	output := m.View()

	if !strings.Contains(output, "Keyboard Shortcuts") {
		t.Error("Help overlay should contain 'Keyboard Shortcuts' title")
	}
	if !strings.Contains(output, "Move selection up") {
		t.Error("Help overlay should show shortcuts")
	}
}

func TestView_Splash(t *testing.T) {
	m := SetupTestModelWithDimensions(80, 24)
	m.currentView = ViewSplash
	m.currentVersion = "1.0.0"

	output := m.View()

	if !strings.Contains(output, "SuperChat 1.0.0") {
		t.Error("Splash screen should show version")
	}
	if !strings.Contains(output, "terminal-based threaded chat") {
		t.Error("Splash screen should show subtitle")
	}
	if !strings.Contains(output, "Getting Started") {
		t.Error("Splash screen should show getting started section")
	}
	if !strings.Contains(output, "Press any key to continue") {
		t.Error("Splash screen should show continue prompt")
	}
}

func TestView_NicknameSetup(t *testing.T) {
	m := SetupTestModelWithDimensions(80, 24)
	m.currentView = ViewNicknameSetup
	m.nickname = "testuser"

	output := m.View()

	if !strings.Contains(output, "Set Your Nickname") {
		t.Error("Nickname setup should show title")
	}
	if !strings.Contains(output, "testuser") {
		t.Error("Nickname setup should show current input")
	}
	if !strings.Contains(output, "Enter] Confirm") {
		t.Error("Nickname setup should show confirm instruction")
	}
}

func TestView_NicknameSetup_WithError(t *testing.T) {
	m := SetupTestModelWithDimensions(80, 24)
	m.currentView = ViewNicknameSetup
	m.errorMessage = "Invalid nickname"

	output := m.View()

	if !strings.Contains(output, "Invalid nickname") {
		t.Error("Nickname setup should display error message")
	}
}

func TestView_ChannelList(t *testing.T) {
	m := SetupTestModelWithDimensions(100, 30)
	m.currentView = ViewChannelList
	m.currentVersion = "1.0.0"
	m.channels = []protocol.Channel{
		CreateTestChannel(1, "general"),
		CreateTestChannel(2, "random"),
	}
	m.channelCursor = 0

	output := m.View()

	if !strings.Contains(output, "SuperChat 1.0.0") {
		t.Error("Channel list should show header with version")
	}
	if !strings.Contains(output, "#general") {
		t.Error("Channel list should show channel names")
	}
	if !strings.Contains(output, "#random") {
		t.Error("Channel list should show all channels")
	}
	if !strings.Contains(output, "Welcome to SuperChat") {
		t.Error("Channel list should show welcome message when no channel selected")
	}
	if !strings.Contains(output, "Navigate") {
		t.Error("Channel list should show keyboard shortcuts in footer")
	}
}

func TestView_ChannelList_WithUpdateAvailable(t *testing.T) {
	m := SetupTestModelWithDimensions(100, 30)
	m.currentView = ViewChannelList
	m.currentVersion = "1.0.0"
	m.latestVersion = "1.1.0"
	m.updateAvailable = true

	output := m.View()

	if !strings.Contains(output, "Update available") {
		t.Error("Channel list should show update notification")
	}
	if !strings.Contains(output, "1.0.0") && !strings.Contains(output, "1.1.0") {
		t.Error("Channel list should show version numbers in update notice")
	}
}

func TestView_ChannelList_Empty(t *testing.T) {
	m := SetupTestModelWithDimensions(100, 30)
	m.currentView = ViewChannelList
	m.channels = []protocol.Channel{}

	output := m.View()

	if !strings.Contains(output, "(no channels)") {
		t.Error("Channel list should show '(no channels)' when empty")
	}
}

func TestView_ThreadList(t *testing.T) {
	m := SetupTestModelWithDimensions(100, 30)
	m.currentView = ViewThreadList
	m.currentChannel = &protocol.Channel{
		ID:          1,
		Name:        "general",
		Description: "General discussion",
	}
	m.threads = []protocol.Message{
		CreateTestMessage(1, 1, "alice", "First thread", nil),
		CreateTestMessage(2, 1, "bob", "Second thread", nil),
	}
	m.threadCursor = 0

	// Build thread list content
	m.threadListViewport.SetContent(m.buildThreadListContent())

	output := m.View()

	if !strings.Contains(output, "#general") {
		t.Error("Thread list should show channel name")
	}
	if !strings.Contains(output, "First thread") {
		t.Error("Thread list should show thread content")
	}
	if !strings.Contains(output, "alice") {
		t.Error("Thread list should show author")
	}
}

func TestView_ThreadList_Empty(t *testing.T) {
	m := SetupTestModelWithDimensions(100, 30)
	m.currentView = ViewThreadList
	m.currentChannel = &protocol.Channel{ID: 1, Name: "general"}
	m.threads = []protocol.Message{}

	m.threadListViewport.SetContent(m.buildThreadListContent())

	output := m.View()

	if !strings.Contains(output, "(no threads)") {
		t.Error("Thread list should show '(no threads)' when empty")
	}
}

func TestView_ThreadView(t *testing.T) {
	m := SetupTestModelWithDimensions(100, 30)
	m.currentView = ViewThreadView

	rootMsg := CreateTestMessage(1, 1, "alice", "Root message", nil)
	m.currentThread = &rootMsg
	m.replyCursor = 0

	// Build thread content
	m.threadViewport.SetContent(m.buildThreadContent())

	output := m.View()

	if !strings.Contains(output, "Root message") {
		t.Error("Thread view should show root message content")
	}
	if !strings.Contains(output, "alice") {
		t.Error("Thread view should show author")
	}
	if !strings.Contains(output, "Reply") {
		t.Error("Thread view should show reply shortcut in footer")
	}
}

func TestView_ThreadView_WithReplies(t *testing.T) {
	m := SetupTestModelWithDimensions(100, 30)
	m.currentView = ViewThreadView

	rootID := uint64(1)
	rootMsg := CreateTestMessage(1, 1, "alice", "Root message", nil)
	m.currentThread = &rootMsg

	m.threadReplies = []protocol.Message{
		CreateTestMessage(2, 1, "bob", "First reply", &rootID),
		CreateTestMessage(3, 1, "charlie", "Second reply", &rootID),
	}
	m.replyCursor = 0

	m.threadViewport.SetContent(m.buildThreadContent())

	output := m.View()

	if !strings.Contains(output, "Root message") {
		t.Error("Thread view should show root message")
	}
	if !strings.Contains(output, "First reply") {
		t.Error("Thread view should show first reply")
	}
	if !strings.Contains(output, "Second reply") {
		t.Error("Thread view should show second reply")
	}
}

func TestView_ThreadView_NoThread(t *testing.T) {
	m := SetupTestModelWithDimensions(100, 30)
	m.currentView = ViewThreadView
	m.currentThread = nil

	output := m.View()

	if !strings.Contains(output, "No thread selected") {
		t.Error("Thread view should show 'No thread selected' when currentThread is nil")
	}
}

func TestView_ThreadView_DeleteConfirmation(t *testing.T) {
	m := SetupTestModelWithDimensions(100, 30)
	m.currentView = ViewThreadView
	m.confirmingDelete = true

	rootMsg := CreateTestMessage(1, 1, "alice", "Root message", nil)
	m.currentThread = &rootMsg
	m.threadViewport.SetContent(m.buildThreadContent())

	output := m.View()

	if !strings.Contains(output, "Delete this message") {
		t.Error("Thread view should show delete confirmation modal")
	}
	if !strings.Contains(output, "[y] Confirm") {
		t.Error("Delete confirmation should show confirm option")
	}
	if !strings.Contains(output, "[n] Cancel") {
		t.Error("Delete confirmation should show cancel option")
	}
}

func TestView_Compose_NewThread(t *testing.T) {
	m := SetupTestModelWithDimensions(100, 30)
	m.currentView = ViewCompose
	m.composeMode = ComposeModeNewThread
	m.composeInput = "Test thread content"

	output := m.View()

	if !strings.Contains(output, "Compose New Thread") {
		t.Error("Compose view should show 'Compose New Thread' title")
	}
	if !strings.Contains(output, "Test thread content") {
		t.Error("Compose view should show input text")
	}
	if !strings.Contains(output, "Send") {
		t.Error("Compose view should show send instruction")
	}
}

func TestView_Compose_Reply(t *testing.T) {
	m := SetupTestModelWithDimensions(100, 30)
	m.currentView = ViewCompose
	m.composeMode = ComposeModeReply
	m.composeInput = "Test reply content"

	output := m.View()

	if !strings.Contains(output, "Compose Reply") {
		t.Error("Compose view should show 'Compose Reply' title")
	}
	if !strings.Contains(output, "Test reply content") {
		t.Error("Compose view should show reply content")
	}
}

func TestView_Compose_LongContent(t *testing.T) {
	m := SetupTestModelWithDimensions(100, 30)
	m.currentView = ViewCompose
	m.composeInput = strings.Repeat("a", 250) // More than 200 chars

	output := m.View()

	// Should truncate with "..."
	if !strings.Contains(output, "...") {
		t.Error("Compose view should truncate long content with '...'")
	}
}

func TestRenderHeader_Connected(t *testing.T) {
	m := SetupTestModelWithDimensions(100, 30)
	m.currentVersion = "1.0.0"
	m.nickname = "testuser"
	m.onlineUsers = 42

	header := m.renderHeader()

	if !strings.Contains(header, "SuperChat 1.0.0") {
		t.Error("Header should show version")
	}
	if !strings.Contains(header, "~testuser") {
		t.Error("Header should show nickname")
	}
	if !strings.Contains(header, "42 users") {
		t.Error("Header should show online user count")
	}
}

func TestRenderHeader_Anonymous(t *testing.T) {
	m := SetupTestModelWithDimensions(100, 30)
	m.nickname = ""

	header := m.renderHeader()

	if !strings.Contains(header, "anonymous") {
		t.Error("Header should show 'anonymous' when no nickname set")
	}
}

func TestRenderHeader_Disconnected(t *testing.T) {
	m := SetupTestModelWithDimensions(100, 30)
	// Disconnect the mock connection
	mockConn := GetMockConnection(m)
	if mockConn != nil {
		mockConn.Disconnect()
	}

	header := m.renderHeader()

	if !strings.Contains(header, "Disconnected") {
		t.Error("Header should show 'Disconnected' when not connected")
	}
}

func TestRenderFooter_WithStatus(t *testing.T) {
	m := SetupTestModelWithDimensions(100, 30)
	m.statusMessage = "Message sent successfully"

	footer := m.renderFooter("Test shortcuts")

	if !strings.Contains(footer, "Test shortcuts") {
		t.Error("Footer should show shortcuts")
	}
	if !strings.Contains(footer, "Message sent successfully") {
		t.Error("Footer should show status message")
	}
}

func TestRenderFooter_WithError(t *testing.T) {
	m := SetupTestModelWithDimensions(100, 30)
	m.errorMessage = "Something went wrong"

	footer := m.renderFooter("Test shortcuts")

	if !strings.Contains(footer, "Something went wrong") {
		t.Error("Footer should show error message")
	}
}

func TestRenderChannelPane(t *testing.T) {
	m := SetupTestModelWithDimensions(100, 30)
	m.channels = []protocol.Channel{
		CreateTestChannel(1, "general"),
		CreateTestChannel(2, "random"),
	}
	m.channelCursor = 1

	pane := m.renderChannelPane()

	if !strings.Contains(pane, "#general") {
		t.Error("Channel pane should show channel names")
	}
	if !strings.Contains(pane, "#random") {
		t.Error("Channel pane should show all channels")
	}
}

func TestBuildThreadListContent(t *testing.T) {
	m := SetupTestModelWithDimensions(100, 30)
	m.currentChannel = &protocol.Channel{ID: 1, Name: "general"}
	m.threads = []protocol.Message{
		CreateTestMessage(1, 1, "alice", "First thread", nil),
		CreateTestMessage(2, 1, "bob", "Second thread", nil),
	}
	m.threadCursor = 0

	content := m.buildThreadListContent()

	if !strings.Contains(content, "#general - Threads") {
		t.Error("Thread list content should show channel name in title")
	}
	if !strings.Contains(content, "First thread") {
		t.Error("Thread list content should show thread")
	}
}

func TestBuildThreadListContent_Empty(t *testing.T) {
	m := SetupTestModelWithDimensions(100, 30)
	m.currentChannel = &protocol.Channel{ID: 1, Name: "general"}
	m.threads = []protocol.Message{}

	content := m.buildThreadListContent()

	if !strings.Contains(content, "(no threads)") {
		t.Error("Thread list content should show '(no threads)' when empty")
	}
}

func TestBuildThreadContent(t *testing.T) {
	m := SetupTestModelWithDimensions(100, 30)

	rootID := uint64(1)
	rootMsg := CreateTestMessage(1, 1, "alice", "Root message", nil)
	m.currentThread = &rootMsg

	m.threadReplies = []protocol.Message{
		CreateTestMessage(2, 1, "bob", "First reply", &rootID),
	}
	m.replyCursor = 0

	content := m.buildThreadContent()

	if !strings.Contains(content, "Root message") {
		t.Error("Thread content should show root message")
	}
	if !strings.Contains(content, "First reply") {
		t.Error("Thread content should show replies")
	}
}

func TestBuildThreadContent_NoThread(t *testing.T) {
	m := SetupTestModelWithDimensions(100, 30)
	m.currentThread = nil

	content := m.buildThreadContent()

	if content != "" {
		t.Error("Thread content should be empty when no thread selected")
	}
}

func TestFormatThreadItem(t *testing.T) {
	m := SetupTestModelWithDimensions(100, 30)

	msg := CreateTestMessage(1, 1, "alice", "Test message content", nil)
	msg.ReplyCount = 5

	formatted := m.formatThreadItem(msg)

	if !strings.Contains(formatted, "alice") {
		t.Error("Formatted thread item should contain author")
	}
	if !strings.Contains(formatted, "Test message content") {
		t.Error("Formatted thread item should contain message content")
	}
	if !strings.Contains(formatted, "(5)") {
		t.Error("Formatted thread item should show reply count")
	}
}

func TestFormatMessage(t *testing.T) {
	m := SetupTestModelWithDimensions(100, 30)

	msg := CreateTestMessage(1, 1, "alice", "Test content", nil)

	// Test unselected
	formatted := m.formatMessage(msg, 0, false)
	if !strings.Contains(formatted, "alice") {
		t.Error("Formatted message should contain author")
	}
	if !strings.Contains(formatted, "Test content") {
		t.Error("Formatted message should contain content")
	}

	// Test selected
	formatted = m.formatMessage(msg, 0, true)
	if !strings.Contains(formatted, "▶") {
		t.Error("Selected message should contain selection indicator")
	}
}

func TestFormatMessage_WithDepth(t *testing.T) {
	m := SetupTestModelWithDimensions(100, 30)

	msg := CreateTestMessage(1, 1, "alice", "Nested reply", nil)

	formatted := m.formatMessage(msg, 2, false)

	if !strings.Contains(formatted, "[2]") {
		t.Error("Formatted message should show depth indicator")
	}
}

func TestFormatMessage_NewIndicator(t *testing.T) {
	m := SetupTestModelWithDimensions(100, 30)
	m.newMessageIDs = map[uint64]bool{1: true}

	msg := CreateTestMessage(1, 1, "alice", "New message", nil)

	formatted := m.formatMessage(msg, 0, false)

	if !strings.Contains(formatted, "[NEW]") {
		t.Error("New message should have [NEW] indicator")
	}
}

func TestUpdate_WindowSize(t *testing.T) {
	m := NewTestModel()

	newModel, _ := m.Update(tea.WindowSizeMsg{Width: 120, Height: 40})
	m2 := newModel.(Model)

	if m2.width != 120 {
		t.Errorf("Update(WindowSizeMsg) width = %d, want 120", m2.width)
	}
	if m2.height != 40 {
		t.Errorf("Update(WindowSizeMsg) height = %d, want 40", m2.height)
	}
}

func TestUpdate_VersionCheck(t *testing.T) {
	m := NewTestModel()

	newModel, _ := m.Update(VersionCheckMsg{
		LatestVersion:   "2.0.0",
		UpdateAvailable: true,
	})
	m2 := newModel.(Model)

	if m2.latestVersion != "2.0.0" {
		t.Errorf("Update(VersionCheckMsg) latestVersion = %q, want %q", m2.latestVersion, "2.0.0")
	}
	if !m2.updateAvailable {
		t.Error("Update(VersionCheckMsg) updateAvailable = false, want true")
	}
}

func TestUpdate_DisconnectedMsg(t *testing.T) {
	m := SetupTestModelWithDimensions(100, 30)
	m.connectionState = StateConnected

	newModel, _ := m.Update(DisconnectedMsg{})
	m2 := newModel.(Model)

	if m2.connectionState != StateDisconnected {
		t.Error("Update(DisconnectedMsg) should set connectionState to StateDisconnected")
	}
}

func TestUpdate_ReconnectingMsg(t *testing.T) {
	m := SetupTestModelWithDimensions(100, 30)

	newModel, _ := m.Update(ReconnectingMsg{Attempt: 3})
	m2 := newModel.(Model)

	if m2.connectionState != StateReconnecting {
		t.Error("Update(ReconnectingMsg) should set connectionState to StateReconnecting")
	}
	if m2.reconnectAttempt != 3 {
		t.Errorf("Update(ReconnectingMsg) reconnectAttempt = %d, want 3", m2.reconnectAttempt)
	}
}
