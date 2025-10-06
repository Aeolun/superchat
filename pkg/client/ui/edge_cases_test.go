package ui

import (
	"strings"
	"testing"

	"github.com/aeolun/superchat/pkg/protocol"
	tea "github.com/charmbracelet/bubbletea"
)

// Test edge cases and error states

func TestView_EmptyState(t *testing.T) {
	// Model with no data
	m := SetupTestModelWithDimensions(80, 24)
	m.currentView = ViewChannelList
	m.channels = []protocol.Channel{}

	output := m.View()

	if !strings.Contains(output, "(no channels)") {
		t.Error("Empty channel list should show '(no channels)'")
	}
}

func TestView_VerySmallWindow(t *testing.T) {
	// Very small terminal
	m := SetupTestModelWithDimensions(40, 10)
	m.currentView = ViewChannelList
	m.channels = []protocol.Channel{
		CreateTestChannel(1, "general"),
	}

	output := m.View()

	// Should not panic or error, just render with constraints
	if output == "" {
		t.Error("View should render even with small dimensions")
	}
}

func TestView_VeryLargeWindow(t *testing.T) {
	// Very large terminal
	m := SetupTestModelWithDimensions(300, 100)
	m.currentView = ViewChannelList
	m.channels = []protocol.Channel{
		CreateTestChannel(1, "general"),
	}

	output := m.View()

	if output == "" {
		t.Error("View should render even with large dimensions")
	}
}

func TestFormatThreadItem_LongContent(t *testing.T) {
	m := SetupTestModelWithDimensions(80, 24)

	// Very long message content
	longContent := strings.Repeat("This is a very long message content that should be truncated. ", 10)
	msg := CreateTestMessage(1, 1, "alice", longContent, nil)

	formatted := m.formatThreadItem(msg)

	// Should truncate with "..."
	if !strings.Contains(formatted, "...") {
		t.Error("Long thread item should be truncated with '...'")
	}
}

func TestFormatThreadItem_WithNewlines(t *testing.T) {
	m := SetupTestModelWithDimensions(80, 24)

	// Message with newlines (should be replaced with spaces)
	msg := CreateTestMessage(1, 1, "alice", "Line 1\nLine 2\nLine 3", nil)

	formatted := m.formatThreadItem(msg)

	if strings.Contains(formatted, "\n") {
		// The formatted string may contain newlines from wrapping, but the original newlines should be replaced
		if strings.Contains(formatted, "Line 1\nLine 2") {
			t.Error("Thread item should replace newlines with spaces in content")
		}
	}
}

func TestFormatMessage_MultilineContent(t *testing.T) {
	m := SetupTestModelWithDimensions(100, 30)

	// Message with multiple lines
	msg := CreateTestMessage(1, 1, "alice", "Line 1\nLine 2\nLine 3", nil)

	formatted := m.formatMessage(msg, 0, false)

	if !strings.Contains(formatted, "Line 1") {
		t.Error("Formatted message should contain first line")
	}
	if !strings.Contains(formatted, "Line 2") {
		t.Error("Formatted message should contain second line")
	}
	if !strings.Contains(formatted, "Line 3") {
		t.Error("Formatted message should contain third line")
	}
}

func TestFormatMessage_VeryLongLine(t *testing.T) {
	m := SetupTestModelWithDimensions(80, 24)

	// Very long single line (should wrap)
	longLine := strings.Repeat("word ", 100)
	msg := CreateTestMessage(1, 1, "alice", longLine, nil)

	formatted := m.formatMessage(msg, 0, false)

	// Should contain the content (possibly wrapped)
	if !strings.Contains(formatted, "word") {
		t.Error("Formatted message should contain content")
	}
}

func TestFormatMessage_DeepNesting(t *testing.T) {
	m := SetupTestModelWithDimensions(100, 30)

	// Very deep nesting level
	msg := CreateTestMessage(1, 1, "alice", "Deeply nested reply", nil)

	formatted := m.formatMessage(msg, 10, false) // depth 10

	if !strings.Contains(formatted, "[10]") {
		t.Error("Deep nesting should show depth indicator")
	}
}

func TestCalculateThreadDepths_ComplexTree(t *testing.T) {
	m := SetupTestModelWithDimensions(100, 30)

	rootID := uint64(1)
	msg2ID := uint64(2)
	msg3ID := uint64(3)
	msg4ID := uint64(4)

	rootMsg := CreateTestMessage(1, 1, "alice", "Root", nil)
	m.currentThread = &rootMsg

	// Complex tree: 1 -> 2 -> 4 -> 6
	//                  -> 3 -> 5
	m.threadReplies = []protocol.Message{
		CreateTestMessage(2, 1, "bob", "Reply to root", &rootID),
		CreateTestMessage(3, 1, "charlie", "Another reply to root", &rootID),
		CreateTestMessage(4, 1, "dave", "Reply to 2", &msg2ID),
		CreateTestMessage(5, 1, "eve", "Reply to 3", &msg3ID),
		CreateTestMessage(6, 1, "frank", "Reply to 4", &msg4ID),
	}

	depths := m.calculateThreadDepths()

	expectedDepths := map[uint64]int{
		1: 0, // Root
		2: 1, // Reply to root
		3: 1, // Reply to root
		4: 2, // Reply to 2
		5: 2, // Reply to 3
		6: 3, // Reply to 4
	}

	for id, expectedDepth := range expectedDepths {
		if depths[id] != expectedDepth {
			t.Errorf("depth[%d] = %d, want %d", id, depths[id], expectedDepth)
		}
	}
}

func TestCalculateThreadDepths_EmptyThread(t *testing.T) {
	m := SetupTestModelWithDimensions(100, 30)
	m.currentThread = nil

	depths := m.calculateThreadDepths()

	if len(depths) != 0 {
		t.Error("Empty thread should return empty depth map")
	}
}

func TestCheckNewMessagesOutsideViewport_NoNew(t *testing.T) {
	m := SetupTestModelWithDimensions(100, 30)

	rootMsg := CreateTestMessage(1, 1, "alice", "Root", nil)
	m.currentThread = &rootMsg
	m.newMessageIDs = map[uint64]bool{} // No new messages

	hasNewAbove, _ := m.checkNewMessagesOutsideViewport()

	if hasNewAbove {
		t.Error("Should not have new messages above when newMessageIDs is empty")
	}
}

func TestCheckNewMessagesOutsideViewport_NewRoot(t *testing.T) {
	m := SetupTestModelWithDimensions(100, 30)

	rootMsg := CreateTestMessage(1, 1, "alice", "Root", nil)
	m.currentThread = &rootMsg
	m.newMessageIDs = map[uint64]bool{1: true} // Root is new
	m.threadViewport.SetContent(m.buildThreadContent())

	// Set viewport scrolled down so root is above visible area
	// The root is at line 0, so if YOffset > 0, it's above the visible area
	if m.threadViewport.TotalLineCount() > 10 {
		m.threadViewport.SetYOffset(10)

		hasNewAbove, _ := m.checkNewMessagesOutsideViewport()

		if !hasNewAbove {
			t.Error("Should detect new message above viewport when scrolled down")
		}
	} else {
		// Skip test if content is too short
		t.Skip("Content too short to test scrolling")
	}
}

func TestScrollToKeepCursorVisible(t *testing.T) {
	m := SetupTestModelWithDimensions(100, 30)

	rootID := uint64(1)
	rootMsg := CreateTestMessage(1, 1, "alice", "Root", nil)
	m.currentThread = &rootMsg

	// Add many replies to make it scrollable
	for i := 0; i < 20; i++ {
		m.threadReplies = append(m.threadReplies,
			CreateTestMessage(uint64(i+2), 1, "user", "Reply", &rootID))
	}

	m.replyCursor = 10 // Select a reply in the middle
	m.threadViewport.SetContent(m.buildThreadContent())

	m.scrollToKeepCursorVisible()

	// Viewport should have been adjusted (non-zero offset)
	if m.threadViewport.YOffset == 0 {
		t.Error("scrollToKeepCursorVisible should adjust viewport offset")
	}
}

func TestScrollThreadListToKeepCursorVisible(t *testing.T) {
	m := SetupTestModelWithDimensions(100, 30)

	// Add many threads to make it scrollable
	for i := 0; i < 50; i++ {
		m.threads = append(m.threads,
			CreateTestMessage(uint64(i+1), 1, "user", "Thread", nil))
	}

	m.threadCursor = 25 // Select a thread in the middle
	m.threadListViewport.SetContent(m.buildThreadListContent())

	m.scrollThreadListToKeepCursorVisible()

	// Viewport should have been adjusted
	if m.threadListViewport.YOffset == 0 {
		t.Error("scrollThreadListToKeepCursorVisible should adjust viewport offset")
	}
}

func TestApplyMessageDeletion_UpdatesContent(t *testing.T) {
	m := SetupTestModelWithDimensions(100, 30)

	rootID := uint64(1)
	rootMsg := CreateTestMessage(1, 1, "alice", "Root", nil)
	m.currentThread = &rootMsg

	m.threadReplies = []protocol.Message{
		CreateTestMessage(2, 1, "bob", "Original content", &rootID),
	}

	m.applyMessageDeletion(2, "[deleted by moderator]")

	if m.threadReplies[0].Content != "[deleted by moderator]" {
		t.Errorf("Content should be updated, got %q", m.threadReplies[0].Content)
	}
}

func TestApplyMessageDeletion_RootMessage(t *testing.T) {
	m := SetupTestModelWithDimensions(100, 30)

	rootMsg := CreateTestMessage(1, 1, "alice", "Root content", nil)
	m.currentThread = &rootMsg
	m.threads = []protocol.Message{rootMsg}

	m.applyMessageDeletion(1, "[deleted by author]")

	if m.currentThread.Content != "[deleted by author]" {
		t.Error("Should update currentThread content")
	}
	if m.threads[0].Content != "[deleted by author]" {
		t.Error("Should update threads list content")
	}
}

func TestHandleChannelListKeys_EmptyChannelList(t *testing.T) {
	m := SetupTestModelWithDimensions(100, 30)
	m.currentView = ViewChannelList
	m.channels = []protocol.Channel{}
	m.channelCursor = 0

	// Try to move down (should not panic)
	newModel, _ := m.handleChannelListKeys(tea.KeyMsg{Type: tea.KeyDown})
	m2 := newModel.(Model)

	if m2.channelCursor != 0 {
		t.Error("Cursor should stay at 0 for empty list")
	}

	// Try to select (should not panic)
	newModel, _ = m.handleChannelListKeys(tea.KeyMsg{Type: tea.KeyEnter})
	m3 := newModel.(Model)

	if m3.currentView != ViewChannelList {
		t.Error("Should stay in channel list when trying to select from empty list")
	}
}

func TestHandleThreadListKeys_EmptyThreadList(t *testing.T) {
	m := SetupTestModelWithDimensions(100, 30)
	m.currentView = ViewThreadList
	m.threads = []protocol.Message{}
	m.threadCursor = 0

	// Try to move down (should not panic)
	newModel, _ := m.handleThreadListKeys(tea.KeyMsg{Type: tea.KeyDown})
	m2 := newModel.(Model)

	if m2.threadCursor != 0 {
		t.Error("Cursor should stay at 0 for empty list")
	}

	// Try to select (should not panic)
	newModel, _ = m.handleThreadListKeys(tea.KeyMsg{Type: tea.KeyEnter})
	m3 := newModel.(Model)

	if m3.currentView != ViewThreadList {
		t.Error("Should stay in thread list when trying to open from empty list")
	}
}

func TestHandleThreadViewKeys_EmptyReplies(t *testing.T) {
	m := SetupTestModelWithDimensions(100, 30)
	m.currentView = ViewThreadView

	rootMsg := CreateTestMessage(1, 1, "alice", "Root", nil)
	m.currentThread = &rootMsg
	m.threadReplies = []protocol.Message{}
	m.replyCursor = 0

	// Try to move down (should not panic or move beyond root)
	newModel, _ := m.handleThreadViewKeys(tea.KeyMsg{Type: tea.KeyDown})
	m2 := newModel.(Model)

	if m2.replyCursor != 0 {
		t.Error("Cursor should stay at 0 when no replies")
	}
}

func TestSelectedMessage_CursorOutOfBounds(t *testing.T) {
	m := SetupTestModelWithDimensions(100, 30)

	rootMsg := CreateTestMessage(1, 1, "alice", "Root", nil)
	m.currentThread = &rootMsg
	m.threadReplies = []protocol.Message{}
	m.replyCursor = 999 // Way out of bounds

	_, ok := m.selectedMessage()

	if ok {
		t.Error("selectedMessage should return false when cursor is out of bounds")
	}
}

func TestMergeOverlay_DifferentLengths(t *testing.T) {
	// Base longer than overlay
	base := "line1\nline2\nline3\nline4\nline5"
	overlay := "OVERLAY\n"

	result := mergeOverlay(base, overlay)
	lines := strings.Split(result, "\n")

	if len(lines) != 5 {
		t.Errorf("Result should have same length as base, got %d lines", len(lines))
	}
	if lines[0] != "OVERLAY" {
		t.Error("First line should be from overlay")
	}

	// Overlay longer than base
	base = "line1\nline2"
	overlay = "OVER1\nOVER2\nOVER3\nOVER4"

	result = mergeOverlay(base, overlay)
	lines = strings.Split(result, "\n")

	if len(lines) != 2 {
		t.Errorf("Result should have same length as base, got %d lines", len(lines))
	}
}

func TestBuildThreadContent_WithDeletedMessages(t *testing.T) {
	m := SetupTestModelWithDimensions(100, 30)

	rootID := uint64(1)
	rootMsg := CreateTestMessage(1, 1, "alice", "[deleted by author]", nil)
	m.currentThread = &rootMsg

	m.threadReplies = []protocol.Message{
		CreateTestMessage(2, 1, "bob", "Normal reply", &rootID),
		CreateTestMessage(3, 1, "charlie", "[deleted by moderator]", &rootID),
	}

	content := m.buildThreadContent()

	if !strings.Contains(content, "[deleted by author]") {
		t.Error("Thread content should show deleted root message")
	}
	if !strings.Contains(content, "Normal reply") {
		t.Error("Thread content should show normal reply")
	}
	if !strings.Contains(content, "[deleted by moderator]") {
		t.Error("Thread content should show deleted reply")
	}
}

func TestHandleNicknameSetupKeys_MaxLength(t *testing.T) {
	m := SetupTestModelWithDimensions(100, 30)
	m.currentView = ViewNicknameSetup
	m.nickname = strings.Repeat("a", 20) // Max length

	// Try to add another character
	newModel, _ := m.handleNicknameSetupKeys(tea.KeyMsg{
		Type:  tea.KeyRunes,
		Runes: []rune{'b'},
	})
	m2 := newModel.(Model)

	if len(m2.nickname) > 20 {
		t.Error("Nickname should not exceed max length of 20")
	}
}

func TestHandleComposeKeys_EmptyBackspace(t *testing.T) {
	m := SetupTestModelWithDimensions(100, 30)
	m.currentView = ViewCompose
	m.composeInput = ""

	// Try to backspace on empty input
	newModel, _ := m.handleComposeKeys(tea.KeyMsg{Type: tea.KeyBackspace})
	m2 := newModel.(Model)

	if m2.composeInput != "" {
		t.Error("Backspace on empty input should stay empty")
	}
}

func TestUpdate_UnknownViewState(t *testing.T) {
	m := SetupTestModelWithDimensions(100, 30)
	m.currentView = ViewState(999) // Invalid view state

	// Should not panic
	output := m.View()

	if output != "Unknown view" {
		t.Errorf("Unknown view state should return 'Unknown view', got %q", output)
	}
}
