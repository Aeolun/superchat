package ui

import (
	"fmt"
	"strings"
	"time"

	"github.com/aeolun/superchat/pkg/client/ui/modal"
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

	// Render base view (help is now a modal, not a separate view)
	var baseView string
	switch m.currentView {
	case ViewSplash:
		baseView = m.renderSplash()
	case ViewNicknameSetup:
		baseView = m.renderNicknameSetup()
	case ViewChannelList:
		baseView = m.renderChannelList()
	case ViewThreadList:
		baseView = m.renderThreadList()
	case ViewThreadView:
		baseView = m.renderThreadView()
	case ViewCompose:
		baseView = m.renderCompose()
	default:
		baseView = "Unknown view"
	}

	// Render password modal overlay if prompting for auth (LEGACY)
	if m.authState == AuthStatePrompting || m.authState == AuthStateAuthenticating {
		return m.renderPasswordModalOverlay(baseView)
	}

	// Render registration modal overlay if in registration mode (LEGACY)
	if m.registrationMode {
		return m.renderRegistrationModalOverlay(baseView)
	}

	// Render nickname change modal overlay (LEGACY)
	if m.nicknameChangeMode {
		return m.renderNicknameChangeModalOverlay(baseView)
	}

	// Apply modal overlays from the modal stack
	result := baseView
	if !m.modalStack.IsEmpty() {
		if activeModal := m.modalStack.Top(); activeModal != nil {
			result = m.renderModalOverlay(result, activeModal)
		}
	}

	return result
}

// renderModalOverlay overlays a modal on top of the base view
func (m Model) renderModalOverlay(baseView string, activeModal modal.Modal) string {
	// Get the modal content
	modalContent := activeModal.Render(m.width, m.height)

	// For now, just return the modal content overlaid
	// In the future, we could dim the background or do more sophisticated layering
	return modalContent
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

Anonymous vs Registered:
• Anonymous: Post as ~username (no password required)
• Registered: Post as username (use [Ctrl+R] to register)
• Registering secures your nickname with a password

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

	// Input field with max width (52 chars to fit in 60-char modal with padding)
	input := inputFocusedStyle.Width(52).Render(m.nickname + "█")

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
		"Anonymous vs Registered:",
		"• Anonymous: Post as ~username (no password)",
		"• Registered: Post as username (press [Ctrl+R] to register)",
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
	footer := m.renderFooter(m.commands.GenerateFooter(int(m.currentView), m.modalStack.TopType(), &m))
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
	footer := m.renderFooter(m.commands.GenerateFooter(int(m.currentView), m.modalStack.TopType(), &m))
	s.WriteString(footer)

	return s.String()
}

// renderThreadView renders the thread view
func (m Model) renderThreadView() string {
	header := m.renderHeader()
	threadContent := m.renderThreadContent()
	footer := m.renderFooter(m.commands.GenerateFooter(int(m.currentView), m.modalStack.TopType(), &m))

	body := lipgloss.JoinVertical(
		lipgloss.Left,
		header,
		"",
		threadContent,
		"",
		footer,
	)

	base := lipgloss.Place(m.width, m.height, lipgloss.Top, lipgloss.Left, body)

	// Delete confirmation now handled by DeleteConfirmModal in modal stack
	return base
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
	} else if m.composeMode == ComposeModeEdit {
		title = "Edit Message"
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

	// Auto-generate shortcuts from command registry (context-aware)
	shortcuts := m.commands.GenerateHelp(int(m.currentView), m.modalStack.TopType(), &m)

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
			// Show auth status: ~ for anonymous, no prefix for authenticated
			prefix := ""
			if m.authState == AuthStateAnonymous || m.authState == AuthStateNone {
				prefix = "~"
			}
			status = fmt.Sprintf("Connected: %s%s", prefix, m.nickname)

			// Show registration hint for anonymous users
			if m.authState == AuthStateAnonymous {
				status += "  [Ctrl+R] Register"
			}
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
	// Server already prefixes anonymous users with ~
	author := thread.AuthorNickname

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
		// Server already prefixes anonymous users with ~
		author = messageAnonymousStyle.Render(author)
	} else {
		author = messageAuthorStyle.Render(author)
	}

	timeStr := formatTime(msg.CreatedAt)
	timestamp := messageTimeStyle.Render(timeStr)

	// Add edited indicator if message was edited
	editedIndicator := ""
	if msg.EditedAt != nil {
		editedIndicator = "  " + messageTimeStyle.Render("(edited)")
	}

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

	header := author + "  " + timestamp + editedIndicator + newIndicator + depthIndicator

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

	// Calculate depths once for all messages
	depths := m.calculateThreadDepths()

	// Render root message
	rootMsg := m.formatMessage(*m.currentThread, 0, m.replyCursor == 0)
	content.WriteString(rootMsg)
	content.WriteString("\n\n")

	// Render replies
	for i, reply := range m.threadReplies {
		depth := depths[reply.ID]
		msg := m.formatMessage(reply, depth, m.replyCursor == i+1)
		content.WriteString(msg)
		content.WriteString("\n\n")
	}

	return content.String()
}

// calculateThreadDepths builds a depth map for all messages in the thread (single pass)
func (m Model) calculateThreadDepths() map[uint64]int {
	depths := make(map[uint64]int)

	if m.currentThread == nil {
		return depths
	}

	// Root is always depth 0
	depths[m.currentThread.ID] = 0

	// Build parent->children map
	childrenMap := make(map[uint64][]protocol.Message)
	for _, reply := range m.threadReplies {
		if reply.ParentID != nil {
			childrenMap[*reply.ParentID] = append(childrenMap[*reply.ParentID], reply)
		}
	}

	// BFS traversal to assign depths
	queue := []uint64{m.currentThread.ID}
	for len(queue) > 0 {
		parentID := queue[0]
		queue = queue[1:]
		parentDepth := depths[parentID]

		for _, child := range childrenMap[parentID] {
			depths[child.ID] = parentDepth + 1
			queue = append(queue, child.ID)
		}
	}

	return depths
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

	// Calculate depths once
	depths := m.calculateThreadDepths()

	// Add root message lines + 2 newlines (one for content, one blank separator)
	rootMsg := m.formatMessage(*m.currentThread, 0, false)
	linePos += len(strings.Split(rootMsg, "\n")) + 2 // +2 for \n\n after root

	// Add lines for each reply before cursor
	for i := 0; i < m.replyCursor-1 && i < len(m.threadReplies); i++ {
		reply := m.threadReplies[i]
		depth := depths[reply.ID]
		msg := m.formatMessage(reply, depth, false)
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

	// Calculate depths once
	depths := m.calculateThreadDepths()

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
		depth := depths[reply.ID]
		msg := m.formatMessage(reply, depth, false)
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

// scrollThreadListToKeepCursorVisible adjusts thread list viewport to center the cursor
func (m *Model) scrollThreadListToKeepCursorVisible() {
	// Each thread item is 1 line
	cursorLine := m.threadCursor

	// Calculate offset to center the selected thread
	targetOffset := cursorLine - (m.threadListViewport.Height / 2)

	// Ensure we don't scroll past the beginning
	if targetOffset < 0 {
		targetOffset = 0
	}

	m.threadListViewport.SetYOffset(targetOffset)
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

// renderPasswordModalOverlay renders the password input modal over the base view
func (m Model) renderPasswordModalOverlay(baseView string) string {
	title := lipgloss.NewStyle().
		Bold(true).
		Foreground(primaryColor).
		Align(lipgloss.Center).
		MarginBottom(1).
		Render(fmt.Sprintf("🔐 Authenticate as '%s'", m.nickname))

	prompt := lipgloss.NewStyle().
		Foreground(lipgloss.Color("252")).
		Align(lipgloss.Center).
		MarginBottom(1).
		Render("This nickname is registered. Enter password:")

	// Password input (hidden)
	passwordDisplay := strings.Repeat("•", len(m.passwordInput))
	if m.authState == AuthStatePrompting {
		passwordDisplay += "█" // Cursor
	}
	passwordField := inputFocusedStyle.Render(passwordDisplay)

	// Error message if auth failed
	var errorMsg string
	if m.authErrorMessage != "" {
		errorMsg = "\n" + lipgloss.NewStyle().
			Foreground(errorColor).
			Align(lipgloss.Center).
			Render(m.authErrorMessage)
	}

	// Cooldown message if rate limited
	var cooldownMsg string
	if time.Now().Before(m.authCooldownUntil) {
		remaining := int(time.Until(m.authCooldownUntil).Seconds()) + 1
		cooldownMsg = "\n" + lipgloss.NewStyle().
			Foreground(warningColor).
			Align(lipgloss.Center).
			Render(fmt.Sprintf("⏳ Please wait %d seconds before trying again", remaining))
	}

	// Status message
	var statusMsg string
	if m.authState == AuthStateAuthenticating {
		statusMsg = lipgloss.NewStyle().
			Foreground(mutedColor).
			Align(lipgloss.Center).
			MarginTop(1).
			Render("Authenticating...")
	} else {
		statusMsg = lipgloss.NewStyle().
			Foreground(mutedColor).
			Align(lipgloss.Center).
			MarginTop(1).
			Render("[Enter] Authenticate  [ESC] Browse anonymously")
	}

	content := lipgloss.JoinVertical(
		lipgloss.Center,
		"",
		title,
		prompt,
		passwordField,
		errorMsg,
		cooldownMsg,
		statusMsg,
		"",
	)

	modal := lipgloss.NewStyle().
		Border(lipgloss.RoundedBorder()).
		BorderForeground(primaryColor).
		Padding(1, 3).
		Width(60).
		Render(content)

	return lipgloss.Place(m.width, m.height, lipgloss.Center, lipgloss.Center, modal)
}

// renderRegistrationModalOverlay renders the registration modal over the base view
func (m Model) renderRegistrationModalOverlay(baseView string) string {
	title := lipgloss.NewStyle().
		Bold(true).
		Foreground(primaryColor).
		Align(lipgloss.Center).
		MarginBottom(1).
		Render(fmt.Sprintf("📝 Register '%s'", m.nickname))

	prompt := lipgloss.NewStyle().
		Foreground(lipgloss.Color("252")).
		Align(lipgloss.Center).
		MarginBottom(1).
		Render("Choose a password (minimum 8 characters):")

	// Password input (hidden)
	passwordDisplay := strings.Repeat("•", len(m.regPasswordInput))
	if m.regPasswordCursor == 0 {
		passwordDisplay += "█" // Cursor on password field
	}
	passwordField := inputFocusedStyle.Render("Password: " + passwordDisplay)

	// Confirm password input (hidden)
	confirmDisplay := strings.Repeat("•", len(m.regConfirmInput))
	if m.regConfirmCursor == 1 {
		confirmDisplay += "█" // Cursor on confirm field
	}
	var confirmStyle lipgloss.Style
	if m.regPasswordCursor == 1 {
		confirmStyle = inputFocusedStyle
	} else {
		confirmStyle = inputBlurredStyle
	}
	confirmField := confirmStyle.Render("Confirm:  " + confirmDisplay)

	// Error message if registration failed
	var errorMsg string
	if m.regErrorMessage != "" {
		errorMsg = "\n" + lipgloss.NewStyle().
			Foreground(errorColor).
			Align(lipgloss.Center).
			Render(m.regErrorMessage)
	}

	// Requirements
	requirements := lipgloss.NewStyle().
		Foreground(mutedColor).
		Align(lipgloss.Center).
		MarginTop(1).
		Render("Requirements: 8+ characters")

	// Status message
	statusMsg := lipgloss.NewStyle().
		Foreground(mutedColor).
		Align(lipgloss.Center).
		MarginTop(1).
		Render("[Tab] Next field  [Enter] Register  [ESC] Cancel")

	content := lipgloss.JoinVertical(
		lipgloss.Center,
		"",
		title,
		prompt,
		passwordField,
		confirmField,
		errorMsg,
		requirements,
		statusMsg,
		"",
	)

	modal := lipgloss.NewStyle().
		Border(lipgloss.RoundedBorder()).
		BorderForeground(primaryColor).
		Padding(1, 3).
		Width(60).
		Render(content)

	return lipgloss.Place(m.width, m.height, lipgloss.Center, lipgloss.Center, modal)
}

// renderNicknameChangeModalOverlay renders the nickname change modal over the base view
func (m Model) renderNicknameChangeModalOverlay(baseView string) string {
	title := modalTitleStyle.Render("Change Nickname")
	prompt := "Enter new nickname (3-20 characters, alphanumeric plus - and _):"

	// Nickname input with cursor and max width (52 chars to fit in 60-char modal with padding)
	nicknameDisplay := m.nicknameChangeInput + "█"
	nicknameField := inputFocusedStyle.Width(52).Render(nicknameDisplay)

	// Error message if change failed
	var errorMsg string
	if m.nicknameChangeError != "" {
		errorMsg = "\n" + RenderError(m.nicknameChangeError)
	}

	content := lipgloss.JoinVertical(
		lipgloss.Left,
		title,
		"",
		prompt,
		"",
		nicknameField,
		errorMsg,
		"",
		mutedTextStyle.Render("[Enter] Change  [ESC] Cancel"),
	)

	modal := modalStyle.Render(content)

	return lipgloss.Place(m.width, m.height, lipgloss.Center, lipgloss.Center, modal)
}
