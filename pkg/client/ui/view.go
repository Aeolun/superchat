package ui

import (
	"fmt"
	"strings"
	"time"

	"github.com/aeolun/superchat/pkg/protocol"
	"github.com/charmbracelet/lipgloss"
)

// View renders the current view
func (m Model) View() string {
	// Don't render until we have dimensions
	if m.width == 0 || m.height == 0 {
		return "Loading..."
	}

	// Render disconnection/reconnecting overlay if not connected
	if m.connectionState == StateDisconnected {
		return m.renderDisconnectedOverlay()
	}
	if m.connectionState == StateReconnecting {
		return m.renderReconnectingOverlay()
	}

	if m.showHelp {
		return m.renderHelp()
	}

	switch m.currentView {
	case ViewSplash:
		return m.renderSplash()
	case ViewNicknameSetup:
		return m.renderNicknameSetup()
	case ViewChannelList:
		return m.renderChannelList()
	case ViewThreadList:
		return m.renderThreadList()
	case ViewThreadView:
		return m.renderThreadView()
	case ViewCompose:
		return m.renderCompose()
	default:
		return "Unknown view"
	}
}

// renderSplash renders the splash screen
func (m Model) renderSplash() string {
	var s strings.Builder

	title := splashTitleStyle.Render(fmt.Sprintf("SuperChat %s", m.currentVersion))
	subtitle := lipgloss.NewStyle().
		Foreground(lipgloss.Color("252")).
		Align(lipgloss.Center).
		MarginBottom(1).
		Render("A terminal-based threaded chat application")

	body := splashBodyStyle.Render(`Getting Started:
• Use arrow keys (↑↓←→) to navigate
• Press [Enter] to select channels and threads
• Press [h] or [?] anytime for help
• Press [n] to start a new thread

You can browse anonymously without setting a nickname.
When you want to post, you'll be prompted to set one.`)

	prompt := splashPromptStyle.Render("[Press any key to continue]")

	content := lipgloss.JoinVertical(
		lipgloss.Left,
		title,
		subtitle,
		"",
		body,
		"",
		prompt,
	)

	box := modalStyle.Render(content)
	s.WriteString("\n\n")
	s.WriteString(lipgloss.Place(m.width, m.height-4, lipgloss.Center, lipgloss.Center, box))

	return s.String()
}

// renderNicknameSetup renders the nickname setup screen
func (m Model) renderNicknameSetup() string {
	var s strings.Builder

	title := modalTitleStyle.Render("Set Your Nickname")
	prompt := "Enter a nickname (3-20 characters, alphanumeric plus - and _):"

	input := inputFocusedStyle.Render(m.nickname + "█")

	var errorMsg string
	if m.errorMessage != "" {
		errorMsg = "\n" + RenderError(m.errorMessage)
	}

	content := lipgloss.JoinVertical(
		lipgloss.Left,
		title,
		"",
		prompt,
		"",
		input,
		errorMsg,
		"",
		mutedTextStyle.Render("[Enter] Confirm  [Esc] Quit"),
	)

	box := modalStyle.Render(content)
	s.WriteString("\n\n")
	s.WriteString(lipgloss.Place(m.width, m.height-4, lipgloss.Center, lipgloss.Center, box))

	return s.String()
}

// renderChannelList renders the channel list view
func (m Model) renderChannelList() string {
	var s strings.Builder

	// Header
	header := m.renderHeader()
	s.WriteString(header)
	s.WriteString("\n")

	// Channel list
	channelList := m.renderChannelPane()

	// Main content area (instructions when no channel selected)
	welcomeLines := []string{
		"Welcome to SuperChat!",
		"",
	}

	// Add update notification if available
	if m.updateAvailable {
		updateNotice := lipgloss.NewStyle().
			Foreground(warningColor).
			Bold(true).
			Render(fmt.Sprintf("⚠ Update available: %s → %s", m.currentVersion, m.latestVersion))

		updateInstr := lipgloss.NewStyle().
			Foreground(mutedColor).
			Render("Run 'sc update' in your terminal to update")

		welcomeLines = append(welcomeLines, updateNotice, updateInstr, "", "")
	}

	welcomeLines = append(welcomeLines,
		"Select a channel from the left to start browsing.",
		"",
		"Press [n] to create a new thread once in a channel.",
		"Press [h] or [?] for help.",
	)

	instructions := lipgloss.NewStyle().
		PaddingLeft(2).
		Render(lipgloss.JoinVertical(lipgloss.Left, welcomeLines...))

	// Use 75% of width for main pane (channel is 25%)
	// Subtract 2 for border (lipgloss adds border on top of width)
	threadWidth := m.width - m.width/4 - 1 - 2 // Total width - channel - space - border
	if threadWidth < 30 {
		threadWidth = 30
	}

	mainPane := threadPaneStyle.
		Width(threadWidth).
		Height(m.height - 4).
		Render(instructions)

	content := lipgloss.JoinHorizontal(
		lipgloss.Top,
		channelList,
		" ",
		mainPane,
	)

	s.WriteString(content)
	s.WriteString("\n")

	// Footer
	footer := m.renderFooter("[↑↓] Navigate  [Enter] Select  [r] Refresh  [h] Help  [q/Esc] Quit")
	s.WriteString(footer)

	return s.String()
}

// renderThreadList renders the thread list view
func (m Model) renderThreadList() string {
	var s strings.Builder

	// Header
	header := m.renderHeader()
	s.WriteString(header)
	s.WriteString("\n")

	// Channel list (left pane)
	channelList := m.renderChannelPane()

	// Thread list (right pane)
	// Account for channel pane (40) + space (1) + border/padding (4)
	threadList := m.renderThreadPane()

	content := lipgloss.JoinHorizontal(
		lipgloss.Top,
		channelList,
		" ",
		threadList,
	)

	s.WriteString(content)
	s.WriteString("\n")

	// Footer
	footer := m.renderFooter("[↑↓] Navigate  [Enter] Open  [n] New Thread  [r] Refresh  [Esc] Back  [q] Quit  [h] Help")
	s.WriteString(footer)

	return s.String()
}

// renderThreadView renders the thread view
func (m Model) renderThreadView() string {
	header := m.renderHeader()
	threadContent := m.renderThreadContent()
	footerShortcuts := "[↑↓] Navigate  [r] Reply  [Esc] Back  [q] Quit  [h] Help"
	if !m.selectedMessageDeleted() {
		footerShortcuts = "[↑↓] Navigate  [r] Reply  [d] Delete  [Esc] Back  [q] Quit  [h] Help"
	}
	footer := m.renderFooter(footerShortcuts)

	body := lipgloss.JoinVertical(
		lipgloss.Left,
		header,
		"",
		threadContent,
		"",
		footer,
	)

	base := lipgloss.Place(m.width, m.height, lipgloss.Top, lipgloss.Left, body)

	if !m.confirmingDelete {
		return base
	}

	available := max(20, m.width-2)
	modalWidth := max(24, m.width-4)
	modalWidth = min(modalWidth, available)
	modalWidth = min(modalWidth, 52)

	modal := modalStyle.
		Width(modalWidth).
		Render("Delete this message?\n\n[y] Confirm    [n] Cancel")

	overlay := lipgloss.Place(m.width, m.height, lipgloss.Center, lipgloss.Center, modal)
	return mergeOverlay(base, overlay)
}

func mergeOverlay(base, overlay string) string {
	baseLines := strings.Split(base, "\n")
	overlayLines := strings.Split(overlay, "\n")
	limit := len(baseLines)
	if len(overlayLines) < limit {
		limit = len(overlayLines)
	}

	for i := 0; i < limit; i++ {
		if strings.TrimSpace(overlayLines[i]) != "" {
			baseLines[i] = overlayLines[i]
		}
	}

	return strings.Join(baseLines, "\n")
}

// renderCompose renders the composition modal
func (m Model) renderCompose() string {
	title := "Compose New Thread"
	if m.composeMode == ComposeModeReply {
		title = "Compose Reply"
	}

	titleRender := modalTitleStyle.Render(title)

	preview := m.composeInput
	if len(preview) > 200 {
		preview = preview[:200] + "..."
	}

	// Subtract 2 for border (lipgloss adds border on top of width)
	inputBox := inputFocusedStyle.
		Width(52).
		Height(11).
		Render(preview + "█")

	instructions := mutedTextStyle.Render("[Ctrl+D or Ctrl+Enter] Send  [Esc] Cancel")

	content := lipgloss.JoinVertical(
		lipgloss.Left,
		titleRender,
		inputBox,
		"",
		instructions,
	)

	modal := modalStyle.Render(content)

	// Overlay modal on base view (simple version - just place centered)
	return lipgloss.Place(
		m.width,
		m.height,
		lipgloss.Center,
		lipgloss.Center,
		modal,
	)
}

// renderHelp renders the help modal
func (m Model) renderHelp() string {
	title := helpTitleStyle.Render("Keyboard Shortcuts")

	shortcuts := [][]string{
		{"↑ / k", "Move up"},
		{"↓ / j", "Move down"},
		{"Enter", "Select / Open"},
		{"n", "New thread (in channel)"},
		{"r", "Reply (in thread) / Refresh"},
		{"Esc", "Go back / Cancel"},
		{"h / ?", "Toggle help"},
		{"q", "Quit (from main view)"},
		{"Ctrl+D", "Send message (in compose)"},
		{"Ctrl+Enter", "Send message (in compose)"},
	}

	var lines []string
	for _, sc := range shortcuts {
		line := helpKeyStyle.Render(sc[0]) + "  " + helpDescStyle.Render(sc[1])
		lines = append(lines, line)
	}

	content := lipgloss.JoinVertical(
		lipgloss.Left,
		title,
		"",
		strings.Join(lines, "\n"),
		"",
		mutedTextStyle.Render("[Press h or ? to close]"),
	)

	modal := modalStyle.Render(content)

	// Overlay modal (simple version - just place centered)
	return lipgloss.Place(
		m.width,
		m.height,
		lipgloss.Center,
		lipgloss.Center,
		modal,
	)
}

// renderHeader renders the header
func (m Model) renderHeader() string {
	left := headerStyle.Render(fmt.Sprintf("SuperChat %s", m.currentVersion))

	status := "Disconnected"
	if m.conn.IsConnected() {
		if m.nickname != "" {
			status = fmt.Sprintf("Connected: ~%s", m.nickname)
		} else {
			status = "Connected (anonymous)"
		}
		if m.onlineUsers > 0 {
			status += fmt.Sprintf("  %d users", m.onlineUsers)
		}
	}

	right := statusStyle.Render(status)

	spacer := strings.Repeat(" ", max(0, m.width-lipgloss.Width(left)-lipgloss.Width(right)))

	return left + spacer + right
}

// renderFooter renders the footer
func (m Model) renderFooter(shortcuts string) string {
	footer := footerStyle.Render(shortcuts)

	if m.statusMessage != "" {
		footer += "  " + successStyle.Render(m.statusMessage)
	}

	if m.errorMessage != "" {
		footer += "  " + RenderError(m.errorMessage)
	}

	return footer
}

// renderChannelPane renders the channel list pane
func (m Model) renderChannelPane() string {
	title := channelTitleStyle.Render("Channels")

	// Format server address, hiding default port (6465)
	addr := m.conn.GetAddress()
	if idx := strings.LastIndex(addr, ":6465"); idx != -1 {
		addr = addr[:idx]
	}
	serverAddr := mutedTextStyle.MarginBottom(1).Render(addr)

	var items []string
	for i, channel := range m.channels {
		item := "#" + channel.Name
		if i == m.channelCursor {
			item = selectedItemStyle.Render("▶ " + item)
		} else {
			item = unselectedItemStyle.Render("  " + item)
		}
		items = append(items, item)
	}

	if len(items) == 0 {
		items = append(items, mutedTextStyle.Render("  (no channels)"))
	}

	content := lipgloss.JoinVertical(
		lipgloss.Left,
		title,
		serverAddr,
		strings.Join(items, "\n"),
	)

	// Use 25% of width for channel pane
	// Subtract 2 for border (lipgloss adds border on top of width)
	channelWidth := m.width/4 - 2
	if channelWidth < 20 {
		channelWidth = 20
	}

	return channelPaneStyle.
		Width(channelWidth).
		Height(m.height - 4).
		Render(content)
}

// renderThreadPane renders the thread list pane
func (m Model) renderThreadPane() string {
	// Use remaining width (75% - channel is 25%)
	// Subtract 2 for border (lipgloss adds border on top of width)
	threadWidth := m.width - m.width/4 - 1 - 2 // Total width - channel - space - border
	if threadWidth < 30 {
		threadWidth = 30
	}

	// Add padding to viewport content
	content := lipgloss.NewStyle().
		PaddingLeft(2).
		Render(m.threadListViewport.View())

	return threadPaneStyle.
		Width(threadWidth).
		Height(m.height - 4).
		Render(content)
}

// renderThreadContent renders the thread and its replies
func (m Model) renderThreadContent() string {
	if m.currentThread == nil {
		return threadPaneStyle.
			Width(m.width - 4).
			Height(m.height - 6).
			Render("No thread selected")
	}

	// Get viewport content
	viewportContent := m.threadViewport.View()

	// Check for new messages outside viewport
	hasNewAbove, hasNewBelow := m.checkNewMessagesOutsideViewport()

	// Render the pane first
	pane := actualThreadStyle.
		Width(m.width - 2). // Subtract 2 for border
		Height(m.height - 6).
		Render(viewportContent)

	// Add indicator lines outside the pane if needed
	var components []string
	if hasNewAbove {
		indicator := lipgloss.NewStyle().
			Foreground(warningColor).
			Bold(true).
			Align(lipgloss.Right).
			Width(m.width - 2). // Match pane width
			Render("▲ NEW MESSAGES ABOVE ▲")
		components = append(components, indicator)
	}

	components = append(components, pane)

	if hasNewBelow {
		indicator := lipgloss.NewStyle().
			Foreground(warningColor).
			Bold(true).
			Align(lipgloss.Right).
			Width(m.width - 2). // Match pane width
			Render("▼ NEW MESSAGES BELOW ▼")
		components = append(components, indicator)
	}

	return lipgloss.JoinVertical(lipgloss.Left, components...)
}

// formatThreadItem formats a thread list item
func (m Model) formatThreadItem(thread protocol.Message) string {
	author := thread.AuthorNickname
	if thread.AuthorUserID == nil {
		author = "~" + author
	}

	// Wrap content to available width
	availableWidth := m.threadListViewport.Width - 4 // Account for padding and selection indicator
	if availableWidth < 20 {
		availableWidth = 20
	}

	// Build the line with author, preview, time, and reply count
	preview := thread.Content
	preview = strings.ReplaceAll(preview, "\n", " ")

	timeStr := formatTime(thread.CreatedAt)
	replyCount := ""
	if thread.ReplyCount > 0 {
		replyCount = fmt.Sprintf(" (%d)", thread.ReplyCount)
	}

	// Calculate space for preview
	// Format: "author preview  time(replies)"
	authorRendered := messageAuthorStyle.Render(author)
	metadataRendered := messageTimeStyle.Render(timeStr) + mutedTextStyle.Render(replyCount)

	// Use lipgloss.Width to get actual rendered width (accounting for ANSI codes)
	authorWidth := lipgloss.Width(authorRendered)
	metadataWidth := lipgloss.Width(metadataRendered)

	// Calculate available space for preview (author + space + preview + "  " + metadata)
	previewWidth := availableWidth - authorWidth - metadataWidth - 3 // -3 for spaces
	if previewWidth < 10 {
		previewWidth = 10
	}

	// Truncate preview to fit
	if len(preview) > previewWidth {
		preview = preview[:previewWidth-3] + "..."
	}

	return fmt.Sprintf("%s %s  %s",
		authorRendered,
		preview,
		metadataRendered,
	)
}

// formatMessage formats a message for display in thread view
func (m Model) formatMessage(msg protocol.Message, depth int, selected bool) string {
	selectedIndent := ""
	indent := strings.Repeat("  ", depth)

	if depth > 0 {
		selectedIndent = strings.Repeat("  ", depth-1)
	}

	author := msg.AuthorNickname
	if msg.AuthorUserID == nil {
		author = messageAnonymousStyle.Render("~" + author)
	} else {
		author = messageAuthorStyle.Render(author)
	}

	timeStr := formatTime(msg.CreatedAt)
	timestamp := messageTimeStyle.Render(timeStr)

	// Add NEW indicator if message is unread
	newIndicator := ""
	if m.newMessageIDs[msg.ID] {
		newIndicator = "  " + successStyle.Render("[NEW]")
	}

	// Add depth indicator at the end
	depthIndicator := ""
	if depth > 0 {
		depthIndicator = "  " + messageDepthStyle.Render(fmt.Sprintf("[%d]", depth))
	}

	header := author + "  " + timestamp + newIndicator + depthIndicator

	// Calculate available width for content (viewport width minus borders, padding, indent, and indicator)
	// Viewport width = m.width - 2 (border)
	// Additional indent space = 2 chars for indicator + depth*2 for indentation
	availableWidth := m.threadViewport.Width - 2 - len(indent) - 3 // 3 for "▶ " or "  " prefix
	if availableWidth < 20 {
		availableWidth = 20 // Minimum width
	}

	// Wrap content to available width
	contentLines := strings.Split(msg.Content, "\n")
	var indentedContent []string
	for _, line := range contentLines {
		// Wrap each line to fit available width
		wrapped := lipgloss.NewStyle().Width(availableWidth).Render(line)
		wrappedLines := strings.Split(wrapped, "\n")
		for _, wl := range wrappedLines {
			indentedContent = append(indentedContent, indent+messageContentStyle.Render(wl))
		}
	}

	content := strings.Join(indentedContent, "\n")

	full := header + "\n" + content

	if selected {
		return selectedItemStyle.Render("▶ " + selectedIndent + full)
	}

	return unselectedItemStyle.Render("" + indent + full)
}

// formatTime formats a timestamp as relative time
func formatTime(t time.Time) string {
	now := time.Now()
	diff := now.Sub(t)

	if diff < time.Minute {
		return "just now"
	}
	if diff < time.Hour {
		mins := int(diff.Minutes())
		return fmt.Sprintf("%dm ago", mins)
	}
	if diff < 24*time.Hour {
		hours := int(diff.Hours())
		return fmt.Sprintf("%dh ago", hours)
	}
	days := int(diff.Hours() / 24)
	return fmt.Sprintf("%dd ago", days)
}

func max(a, b int) int {
	if a > b {
		return a
	}
	return b
}

func min(a, b int) int {
	if a < b {
		return a
	}
	return b
}

// buildThreadListContent builds the full content string for the thread list viewport
func (m Model) buildThreadListContent() string {
	var title string
	if m.currentChannel != nil {
		title = threadTitleStyle.Render("#" + m.currentChannel.Name + " - Threads")
	} else {
		title = threadTitleStyle.Render("Threads")
	}

	var items []string
	for i, thread := range m.threads {
		item := m.formatThreadItem(thread)
		if i == m.threadCursor {
			item = selectedItemStyle.Render("▶ " + item)
		} else {
			item = unselectedItemStyle.Render("  " + item)
		}
		items = append(items, item)
	}

	if len(items) == 0 {
		items = append(items, mutedTextStyle.Render("  (no threads)"))
	}

	return lipgloss.JoinVertical(
		lipgloss.Left,
		title,
		strings.Join(items, "\n"),
	)
}

// buildThreadContent builds the full content string for the thread viewport
func (m Model) buildThreadContent() string {
	var content strings.Builder

	if m.currentThread == nil {
		return ""
	}

	// Render root message
	rootMsg := m.formatMessage(*m.currentThread, 0, m.replyCursor == 0)
	content.WriteString(rootMsg)
	content.WriteString("\n\n")

	// Render replies
	for i, reply := range m.threadReplies {
		msg := m.formatMessage(reply, int(reply.ThreadDepth), m.replyCursor == i+1)
		content.WriteString(msg)
		content.WriteString("\n\n")
	}

	return content.String()
}

// calculateCursorLinePosition returns the line number where the cursor is positioned
func (m Model) calculateCursorLinePosition() int {
	if m.currentThread == nil {
		return 0
	}

	linePos := 0

	// If cursor is on root
	if m.replyCursor == 0 {
		return 0
	}

	// Add root message lines + 2 newlines (one for content, one blank separator)
	rootMsg := m.formatMessage(*m.currentThread, 0, false)
	linePos += len(strings.Split(rootMsg, "\n")) + 2 // +2 for \n\n after root

	// Add lines for each reply before cursor
	for i := 0; i < m.replyCursor-1 && i < len(m.threadReplies); i++ {
		reply := m.threadReplies[i]
		msg := m.formatMessage(reply, int(reply.ThreadDepth), false)
		linePos += len(strings.Split(msg, "\n")) + 1 // +1 for blank line separator
	}

	return linePos
}

// checkNewMessagesOutsideViewport checks if there are new messages above or below the visible viewport
func (m Model) checkNewMessagesOutsideViewport() (hasNewAbove bool, hasNewBelow bool) {
	if len(m.newMessageIDs) == 0 {
		return false, false
	}

	viewTop := m.threadViewport.YOffset
	viewBottom := viewTop + m.threadViewport.Height

	// Check root message if it's new
	if m.currentThread != nil && m.newMessageIDs[m.currentThread.ID] {
		// Root is always at line 0
		if 0 < viewTop {
			hasNewAbove = true
		}
	}

	// Check each reply
	linePos := 0
	if m.currentThread != nil {
		rootMsg := m.formatMessage(*m.currentThread, 0, false)
		linePos = len(strings.Split(rootMsg, "\n")) + 2 // +2 for \n\n after root
	}

	for _, reply := range m.threadReplies {
		if m.newMessageIDs[reply.ID] {
			// Check if this message is above or below viewport
			if linePos < viewTop {
				hasNewAbove = true
			} else if linePos >= viewBottom {
				hasNewBelow = true
			}
		}

		// Update line position for next message
		msg := m.formatMessage(reply, int(reply.ThreadDepth), false)
		linePos += len(strings.Split(msg, "\n")) + 1 // +1 for blank line
	}

	return hasNewAbove, hasNewBelow
}

// scrollToKeepCursorVisible adjusts viewport to center the cursor
func (m *Model) scrollToKeepCursorVisible() {
	cursorLine := m.calculateCursorLinePosition()

	// Calculate offset to center the message
	// Target: message starts at roughly 1/3 of viewport height (not exactly center for better context)
	targetOffset := cursorLine - (m.threadViewport.Height / 3)

	// Ensure we don't scroll past the beginning
	if targetOffset < 0 {
		targetOffset = 0
	}

	m.threadViewport.SetYOffset(targetOffset)
}

// renderDisconnectedOverlay renders a full-screen overlay when disconnected
func (m Model) renderDisconnectedOverlay() string {
	title := lipgloss.NewStyle().
		Bold(true).
		Foreground(errorColor).
		Align(lipgloss.Center).
		MarginBottom(2).
		Render("⚠  CONNECTION LOST  ⚠")

	message := lipgloss.NewStyle().
		Foreground(lipgloss.Color("252")).
		Align(lipgloss.Center).
		MarginBottom(1).
		Render("The connection to the server has been lost.")

	info := lipgloss.NewStyle().
		Foreground(mutedColor).
		Align(lipgloss.Center).
		Render("Attempting to reconnect...")

	content := lipgloss.JoinVertical(
		lipgloss.Center,
		"",
		title,
		message,
		info,
		"",
	)

	box := lipgloss.NewStyle().
		Border(lipgloss.DoubleBorder()).
		BorderForeground(errorColor).
		Padding(2, 4).
		Render(content)

	return lipgloss.Place(m.width, m.height, lipgloss.Center, lipgloss.Center, box)
}

// renderReconnectingOverlay renders a full-screen overlay when reconnecting
func (m Model) renderReconnectingOverlay() string {
	title := lipgloss.NewStyle().
		Bold(true).
		Foreground(warningColor).
		Align(lipgloss.Center).
		MarginBottom(2).
		Render("RECONNECTING...")

	attemptMsg := fmt.Sprintf("Attempt %d", m.reconnectAttempt)
	message := lipgloss.NewStyle().
		Foreground(lipgloss.Color("252")).
		Align(lipgloss.Center).
		MarginBottom(1).
		Render(attemptMsg)

	info := lipgloss.NewStyle().
		Foreground(mutedColor).
		Align(lipgloss.Center).
		Render("Please wait while we restore your connection...")

	// Animated dots based on attempt number
	dots := strings.Repeat(".", (m.reconnectAttempt % 4))
	spinner := lipgloss.NewStyle().
		Foreground(primaryColor).
		Align(lipgloss.Center).
		MarginTop(1).
		Render(dots)

	content := lipgloss.JoinVertical(
		lipgloss.Center,
		"",
		title,
		message,
		info,
		spinner,
		"",
	)

	box := lipgloss.NewStyle().
		Border(lipgloss.DoubleBorder()).
		BorderForeground(warningColor).
		Padding(2, 4).
		Render(content)

	return lipgloss.Place(m.width, m.height, lipgloss.Center, lipgloss.Center, box)
}
