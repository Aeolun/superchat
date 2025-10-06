package ui

import (
	"testing"

	"github.com/aeolun/superchat/pkg/protocol"
	tea "github.com/charmbracelet/bubbletea"
)

// Test keyboard handlers

func TestHandleKeyPress_GlobalShortcuts(t *testing.T) {
	m := SetupTestModelWithDimensions(100, 30)
	m.currentView = ViewChannelList

	// Test help toggle
	newModel, _ := m.Update(tea.KeyMsg{Type: tea.KeyRunes, Runes: []rune{'h'}})
	m2 := newModel.(Model)
	if !m2.showHelp {
		t.Error("Pressing 'h' should toggle help")
	}

	// Toggle help off
	newModel, _ = m2.Update(tea.KeyMsg{Type: tea.KeyRunes, Runes: []rune{'h'}})
	m3 := newModel.(Model)
	if m3.showHelp {
		t.Error("Pressing 'h' again should toggle help off")
	}
}

func TestHandleKeyPress_HelpWithEscape(t *testing.T) {
	m := SetupTestModelWithDimensions(100, 30)
	m.showHelp = true

	newModel, _ := m.Update(tea.KeyMsg{Type: tea.KeyEsc})
	m2 := newModel.(Model)

	if m2.showHelp {
		t.Error("Pressing Esc in help should close help")
	}
}

func TestHandleSplashKeys(t *testing.T) {
	m := SetupTestModelWithDimensions(100, 30)
	m.currentView = ViewSplash

	// Any key should advance
	newModel, _ := m.handleSplashKeys(tea.KeyMsg{Type: tea.KeyEnter})
	m2 := newModel.(Model)

	if m2.currentView != ViewChannelList {
		t.Errorf("Splash key handler should advance to ViewChannelList, got %v", m2.currentView)
	}
}

func TestHandleSplashKeys_WithNickname(t *testing.T) {
	m := SetupTestModelWithDimensions(100, 30)
	m.currentView = ViewSplash
	m.nickname = "testuser"

	newModel, cmd := m.handleSplashKeys(tea.KeyMsg{Type: tea.KeyEnter})
	m2 := newModel.(Model)

	if m2.currentView != ViewChannelList {
		t.Error("Splash should advance to channel list")
	}
	if cmd == nil {
		t.Error("Splash with nickname should return command to send nickname")
	}
}

func TestHandleNicknameSetupKeys_ValidNickname(t *testing.T) {
	m := SetupTestModelWithDimensions(100, 30)
	m.currentView = ViewNicknameSetup
	m.nickname = "testuser"

	// Press Enter
	newModel, cmd := m.handleNicknameSetupKeys(tea.KeyMsg{Type: tea.KeyEnter})
	m2 := newModel.(Model)

	if m2.currentView != ViewChannelList {
		t.Errorf("Valid nickname should advance to ViewChannelList, got %v", m2.currentView)
	}
	if cmd == nil {
		t.Error("Valid nickname should return command to send SET_NICKNAME")
	}
}

func TestHandleNicknameSetupKeys_TooShort(t *testing.T) {
	m := SetupTestModelWithDimensions(100, 30)
	m.currentView = ViewNicknameSetup
	m.nickname = "ab" // Too short

	newModel, _ := m.handleNicknameSetupKeys(tea.KeyMsg{Type: tea.KeyEnter})
	m2 := newModel.(Model)

	if m2.currentView != ViewNicknameSetup {
		t.Error("Too short nickname should stay in nickname setup")
	}
	if m2.errorMessage == "" {
		t.Error("Too short nickname should set error message")
	}
}

func TestHandleNicknameSetupKeys_Backspace(t *testing.T) {
	m := SetupTestModelWithDimensions(100, 30)
	m.currentView = ViewNicknameSetup
	m.nickname = "test"

	newModel, _ := m.handleNicknameSetupKeys(tea.KeyMsg{Type: tea.KeyBackspace})
	m2 := newModel.(Model)

	if m2.nickname != "tes" {
		t.Errorf("Backspace should remove character, got %q", m2.nickname)
	}
}

func TestHandleNicknameSetupKeys_AddCharacter(t *testing.T) {
	m := SetupTestModelWithDimensions(100, 30)
	m.currentView = ViewNicknameSetup
	m.nickname = "test"

	newModel, _ := m.handleNicknameSetupKeys(tea.KeyMsg{
		Type:  tea.KeyRunes,
		Runes: []rune{'x'},
	})
	m2 := newModel.(Model)

	if m2.nickname != "testx" {
		t.Errorf("Typing should add character, got %q", m2.nickname)
	}
}

func TestHandleChannelListKeys_Navigation(t *testing.T) {
	m := SetupTestModelWithDimensions(100, 30)
	m.currentView = ViewChannelList
	m.channels = []protocol.Channel{
		CreateTestChannel(1, "general"),
		CreateTestChannel(2, "random"),
		CreateTestChannel(3, "dev"),
	}
	m.channelCursor = 0

	// Test down arrow
	newModel, _ := m.handleChannelListKeys(tea.KeyMsg{Type: tea.KeyDown})
	m2 := newModel.(Model)
	if m2.channelCursor != 1 {
		t.Errorf("Down arrow should move cursor, got %d", m2.channelCursor)
	}

	// Test 'j' (vim-style down)
	newModel, _ = m2.handleChannelListKeys(tea.KeyMsg{Type: tea.KeyRunes, Runes: []rune{'j'}})
	m3 := newModel.(Model)
	if m3.channelCursor != 2 {
		t.Errorf("'j' should move cursor down, got %d", m3.channelCursor)
	}

	// Test up arrow
	newModel, _ = m3.handleChannelListKeys(tea.KeyMsg{Type: tea.KeyUp})
	m4 := newModel.(Model)
	if m4.channelCursor != 1 {
		t.Errorf("Up arrow should move cursor up, got %d", m4.channelCursor)
	}

	// Test 'k' (vim-style up)
	newModel, _ = m4.handleChannelListKeys(tea.KeyMsg{Type: tea.KeyRunes, Runes: []rune{'k'}})
	m5 := newModel.(Model)
	if m5.channelCursor != 0 {
		t.Errorf("'k' should move cursor up, got %d", m5.channelCursor)
	}
}

func TestHandleChannelListKeys_Boundaries(t *testing.T) {
	m := SetupTestModelWithDimensions(100, 30)
	m.currentView = ViewChannelList
	m.channels = []protocol.Channel{
		CreateTestChannel(1, "general"),
		CreateTestChannel(2, "random"),
	}

	// Test up at top
	m.channelCursor = 0
	newModel, _ := m.handleChannelListKeys(tea.KeyMsg{Type: tea.KeyUp})
	m2 := newModel.(Model)
	if m2.channelCursor != 0 {
		t.Error("Up at top should not move cursor")
	}

	// Test down at bottom
	m.channelCursor = 1
	newModel, _ = m.handleChannelListKeys(tea.KeyMsg{Type: tea.KeyDown})
	m3 := newModel.(Model)
	if m3.channelCursor != 1 {
		t.Error("Down at bottom should not move cursor")
	}
}

func TestHandleChannelListKeys_SelectChannel(t *testing.T) {
	m := SetupTestModelWithDimensions(100, 30)
	m.currentView = ViewChannelList
	m.channels = []protocol.Channel{
		CreateTestChannel(1, "general"),
		CreateTestChannel(2, "random"),
	}
	m.channelCursor = 1

	// Press Enter
	newModel, cmd := m.handleChannelListKeys(tea.KeyMsg{Type: tea.KeyEnter})
	m2 := newModel.(Model)

	if m2.currentView != ViewThreadList {
		t.Errorf("Enter should go to ViewThreadList, got %v", m2.currentView)
	}
	if m2.currentChannel == nil {
		t.Error("Enter should set currentChannel")
	}
	if m2.currentChannel.ID != 2 {
		t.Errorf("Should select channel at cursor position, got ID %d", m2.currentChannel.ID)
	}
	if cmd == nil {
		t.Error("Enter should return command to request threads")
	}
}

func TestHandleThreadListKeys_Navigation(t *testing.T) {
	m := SetupTestModelWithDimensions(100, 30)
	m.currentView = ViewThreadList
	m.threads = []protocol.Message{
		CreateTestMessage(1, 1, "alice", "Thread 1", nil),
		CreateTestMessage(2, 1, "bob", "Thread 2", nil),
		CreateTestMessage(3, 1, "charlie", "Thread 3", nil),
	}
	m.threadCursor = 0

	// Test down
	newModel, _ := m.handleThreadListKeys(tea.KeyMsg{Type: tea.KeyDown})
	m2 := newModel.(Model)
	if m2.threadCursor != 1 {
		t.Errorf("Down should move thread cursor, got %d", m2.threadCursor)
	}

	// Test up
	newModel, _ = m2.handleThreadListKeys(tea.KeyMsg{Type: tea.KeyUp})
	m3 := newModel.(Model)
	if m3.threadCursor != 0 {
		t.Errorf("Up should move thread cursor, got %d", m3.threadCursor)
	}
}

func TestHandleThreadListKeys_OpenThread(t *testing.T) {
	m := SetupTestModelWithDimensions(100, 30)
	m.currentView = ViewThreadList
	m.threads = []protocol.Message{
		CreateTestMessage(1, 1, "alice", "Thread 1", nil),
		CreateTestMessage(2, 1, "bob", "Thread 2", nil),
	}
	m.threadCursor = 1

	// Press Enter
	newModel, cmd := m.handleThreadListKeys(tea.KeyMsg{Type: tea.KeyEnter})
	m2 := newModel.(Model)

	if m2.currentView != ViewThreadView {
		t.Errorf("Enter should go to ViewThreadView, got %v", m2.currentView)
	}
	if m2.currentThread == nil {
		t.Error("Enter should set currentThread")
	}
	if m2.currentThread.ID != 2 {
		t.Errorf("Should select thread at cursor, got ID %d", m2.currentThread.ID)
	}
	if cmd == nil {
		t.Error("Enter should return command to request thread messages")
	}
}

func TestHandleThreadListKeys_Back(t *testing.T) {
	m := SetupTestModelWithDimensions(100, 30)
	m.currentView = ViewThreadList
	m.currentChannel = &protocol.Channel{ID: 1, Name: "general"}

	// Press Escape
	newModel, _ := m.handleThreadListKeys(tea.KeyMsg{Type: tea.KeyEsc})
	m2 := newModel.(Model)

	if m2.currentView != ViewChannelList {
		t.Errorf("Escape should go back to ViewChannelList, got %v", m2.currentView)
	}
	if m2.currentChannel != nil {
		t.Error("Going back should clear currentChannel")
	}
}

func TestHandleThreadListKeys_NewThread_WithNickname(t *testing.T) {
	m := SetupTestModelWithDimensions(100, 30)
	m.currentView = ViewThreadList
	m.nickname = "testuser"

	// Press 'n' for new thread
	newModel, _ := m.handleThreadListKeys(tea.KeyMsg{Type: tea.KeyRunes, Runes: []rune{'n'}})
	m2 := newModel.(Model)

	if m2.currentView != ViewCompose {
		t.Errorf("'n' with nickname should go to ViewCompose, got %v", m2.currentView)
	}
	if m2.composeMode != ComposeModeNewThread {
		t.Error("Should set compose mode to new thread")
	}
}

func TestHandleThreadListKeys_NewThread_WithoutNickname(t *testing.T) {
	m := SetupTestModelWithDimensions(100, 30)
	m.currentView = ViewThreadList
	m.nickname = ""

	// Press 'n' for new thread
	newModel, _ := m.handleThreadListKeys(tea.KeyMsg{Type: tea.KeyRunes, Runes: []rune{'n'}})
	m2 := newModel.(Model)

	if m2.currentView != ViewNicknameSetup {
		t.Errorf("'n' without nickname should go to ViewNicknameSetup, got %v", m2.currentView)
	}
	// Note: returnToView is ViewCompose in actual implementation
	if m2.composeMode != ComposeModeNewThread {
		t.Error("Should set compose mode to new thread")
	}
}

func TestHandleThreadViewKeys_Navigation(t *testing.T) {
	m := SetupTestModelWithDimensions(100, 30)
	m.currentView = ViewThreadView

	rootID := uint64(1)
	rootMsg := CreateTestMessage(1, 1, "alice", "Root", nil)
	m.currentThread = &rootMsg
	m.threadReplies = []protocol.Message{
		CreateTestMessage(2, 1, "bob", "Reply 1", &rootID),
		CreateTestMessage(3, 1, "charlie", "Reply 2", &rootID),
	}
	m.replyCursor = 0

	// Test down
	newModel, _ := m.handleThreadViewKeys(tea.KeyMsg{Type: tea.KeyDown})
	m2 := newModel.(Model)
	if m2.replyCursor != 1 {
		t.Errorf("Down should move reply cursor, got %d", m2.replyCursor)
	}

	// Test up
	newModel, _ = m2.handleThreadViewKeys(tea.KeyMsg{Type: tea.KeyUp})
	m3 := newModel.(Model)
	if m3.replyCursor != 0 {
		t.Errorf("Up should move reply cursor, got %d", m3.replyCursor)
	}
}

func TestHandleThreadViewKeys_Reply_WithNickname(t *testing.T) {
	m := SetupTestModelWithDimensions(100, 30)
	m.currentView = ViewThreadView
	m.nickname = "testuser"

	rootMsg := CreateTestMessage(1, 1, "alice", "Root", nil)
	m.currentThread = &rootMsg
	m.replyCursor = 0

	// Press 'r' for reply
	newModel, _ := m.handleThreadViewKeys(tea.KeyMsg{Type: tea.KeyRunes, Runes: []rune{'r'}})
	m2 := newModel.(Model)

	if m2.currentView != ViewCompose {
		t.Errorf("'r' with nickname should go to ViewCompose, got %v", m2.currentView)
	}
	if m2.composeMode != ComposeModeReply {
		t.Error("Should set compose mode to reply")
	}
}

func TestHandleThreadViewKeys_Reply_WithoutNickname(t *testing.T) {
	m := SetupTestModelWithDimensions(100, 30)
	m.currentView = ViewThreadView
	m.nickname = ""

	rootMsg := CreateTestMessage(1, 1, "alice", "Root", nil)
	m.currentThread = &rootMsg
	m.replyCursor = 0

	// Press 'r' for reply
	newModel, _ := m.handleThreadViewKeys(tea.KeyMsg{Type: tea.KeyRunes, Runes: []rune{'r'}})
	m2 := newModel.(Model)

	if m2.currentView != ViewNicknameSetup {
		t.Errorf("'r' without nickname should go to ViewNicknameSetup, got %v", m2.currentView)
	}
}

func TestHandleThreadViewKeys_Delete(t *testing.T) {
	m := SetupTestModelWithDimensions(100, 30)
	m.currentView = ViewThreadView
	m.nickname = "testuser" // Need nickname to delete

	rootMsg := CreateTestMessage(1, 1, "alice", "Root", nil)
	m.currentThread = &rootMsg
	m.replyCursor = 0

	// Press 'd' for delete
	newModel, _ := m.handleThreadViewKeys(tea.KeyMsg{Type: tea.KeyRunes, Runes: []rune{'d'}})
	m2 := newModel.(Model)

	if !m2.confirmingDelete {
		t.Error("'d' should show delete confirmation")
	}
	if m2.pendingDeleteID != 1 {
		t.Errorf("Should set pending delete ID to selected message, got %d", m2.pendingDeleteID)
	}
}

func TestHandleThreadViewKeys_ConfirmDelete(t *testing.T) {
	m := SetupTestModelWithDimensions(100, 30)
	m.currentView = ViewThreadView
	m.confirmingDelete = true
	m.pendingDeleteID = 1

	rootMsg := CreateTestMessage(1, 1, "alice", "Root", nil)
	m.currentThread = &rootMsg

	// Press 'y' to confirm
	newModel, cmd := m.handleThreadViewKeys(tea.KeyMsg{Type: tea.KeyRunes, Runes: []rune{'y'}})
	m2 := newModel.(Model)

	if m2.confirmingDelete {
		t.Error("Confirming delete should clear confirmation state")
	}
	if cmd == nil {
		t.Error("Confirming delete should return command to send DELETE_MESSAGE")
	}
}

func TestHandleThreadViewKeys_CancelDelete(t *testing.T) {
	m := SetupTestModelWithDimensions(100, 30)
	m.currentView = ViewThreadView
	m.confirmingDelete = true
	m.pendingDeleteID = 1

	// Press 'n' to cancel
	newModel, _ := m.handleThreadViewKeys(tea.KeyMsg{Type: tea.KeyRunes, Runes: []rune{'n'}})
	m2 := newModel.(Model)

	if m2.confirmingDelete {
		t.Error("Cancelling delete should clear confirmation state")
	}
}

func TestHandleThreadViewKeys_Back(t *testing.T) {
	m := SetupTestModelWithDimensions(100, 30)
	m.currentView = ViewThreadView

	rootMsg := CreateTestMessage(1, 1, "alice", "Root", nil)
	m.currentThread = &rootMsg

	// Press Escape
	newModel, _ := m.handleThreadViewKeys(tea.KeyMsg{Type: tea.KeyEsc})
	m2 := newModel.(Model)

	if m2.currentView != ViewThreadList {
		t.Errorf("Escape should go back to ViewThreadList, got %v", m2.currentView)
	}
	// Note: currentThread is NOT cleared in actual implementation (line 465 doesn't set to nil)
	// The threadReplies and cursor are cleared
	if len(m2.threadReplies) != 0 {
		t.Error("Going back should clear threadReplies")
	}
	if m2.replyCursor != 0 {
		t.Error("Going back should reset replyCursor")
	}
}

func TestHandleComposeKeys_Send(t *testing.T) {
	m := SetupTestModelWithDimensions(100, 30)
	m.currentView = ViewCompose
	m.composeMode = ComposeModeNewThread
	m.composeInput = "Test thread content"
	m.currentChannel = &protocol.Channel{ID: 1, Name: "general"} // Need channel to send

	// Press Ctrl+D to send
	newModel, cmd := m.handleComposeKeys(tea.KeyMsg{Type: tea.KeyCtrlD})
	m2 := newModel.(Model)

	if m2.currentView != ViewThreadList {
		t.Errorf("Sending should return to ViewThreadList, got %v", m2.currentView)
	}
	if m2.composeInput != "" {
		t.Error("Sending should clear compose input")
	}
	if cmd == nil {
		t.Error("Sending should return command to send POST_MESSAGE")
	}
}

func TestHandleComposeKeys_Cancel(t *testing.T) {
	m := SetupTestModelWithDimensions(100, 30)
	m.currentView = ViewCompose
	m.composeInput = "Draft content"
	m.returnToView = ViewThreadList

	// Press Escape to cancel
	newModel, _ := m.handleComposeKeys(tea.KeyMsg{Type: tea.KeyEsc})
	m2 := newModel.(Model)

	if m2.currentView != ViewThreadList {
		t.Errorf("Cancel should return to previous view, got %v", m2.currentView)
	}
	if m2.composeInput != "" {
		t.Error("Cancel should clear compose input")
	}
}

func TestHandleComposeKeys_Typing(t *testing.T) {
	m := SetupTestModelWithDimensions(100, 30)
	m.currentView = ViewCompose
	m.composeInput = "Hello"

	// Type a character
	newModel, _ := m.handleComposeKeys(tea.KeyMsg{
		Type:  tea.KeyRunes,
		Runes: []rune{'!'},
	})
	m2 := newModel.(Model)

	if m2.composeInput != "Hello!" {
		t.Errorf("Typing should add character, got %q", m2.composeInput)
	}
}

func TestHandleComposeKeys_Backspace(t *testing.T) {
	m := SetupTestModelWithDimensions(100, 30)
	m.currentView = ViewCompose
	m.composeInput = "Hello"

	// Press backspace
	newModel, _ := m.handleComposeKeys(tea.KeyMsg{Type: tea.KeyBackspace})
	m2 := newModel.(Model)

	if m2.composeInput != "Hell" {
		t.Errorf("Backspace should remove character, got %q", m2.composeInput)
	}
}

func TestHandleComposeKeys_Enter_Newline(t *testing.T) {
	m := SetupTestModelWithDimensions(100, 30)
	m.currentView = ViewCompose
	m.composeInput = "Line 1"

	// Press Enter (should add newline, not send)
	newModel, _ := m.handleComposeKeys(tea.KeyMsg{Type: tea.KeyEnter})
	m2 := newModel.(Model)

	if m2.composeInput != "Line 1\n" {
		t.Errorf("Enter should add newline, got %q", m2.composeInput)
	}
	if m2.currentView != ViewCompose {
		t.Error("Enter should not send message (use Ctrl+D or Ctrl+Enter)")
	}
}

func TestSelectedMessage(t *testing.T) {
	m := SetupTestModelWithDimensions(100, 30)

	rootID := uint64(1)
	rootMsg := CreateTestMessage(1, 1, "alice", "Root", nil)
	m.currentThread = &rootMsg

	m.threadReplies = []protocol.Message{
		CreateTestMessage(2, 1, "bob", "Reply 1", &rootID),
		CreateTestMessage(3, 1, "charlie", "Reply 2", &rootID),
	}

	// Test selecting root
	m.replyCursor = 0
	msg, ok := m.selectedMessage()
	if !ok {
		t.Error("selectedMessage() should return true for root")
	}
	if msg.ID != 1 {
		t.Errorf("Selected root message ID = %d, want 1", msg.ID)
	}

	// Test selecting first reply
	m.replyCursor = 1
	msg, ok = m.selectedMessage()
	if !ok {
		t.Error("selectedMessage() should return true for reply")
	}
	if msg.ID != 2 {
		t.Errorf("Selected reply ID = %d, want 2", msg.ID)
	}
}

func TestSelectedMessageDeleted(t *testing.T) {
	m := SetupTestModelWithDimensions(100, 30)

	rootMsg := CreateTestMessage(1, 1, "alice", "[deleted by author]", nil)
	m.currentThread = &rootMsg
	m.replyCursor = 0

	if !m.selectedMessageDeleted() {
		t.Error("selectedMessageDeleted() should return true for deleted message")
	}

	rootMsg.Content = "Normal message"
	m.currentThread = &rootMsg

	if m.selectedMessageDeleted() {
		t.Error("selectedMessageDeleted() should return false for normal message")
	}
}
