package ui

import (
	"fmt"
	"strings"
	"time"

	"github.com/charmbracelet/lipgloss"
	"github.com/aeolun/superchat/pkg/protocol"
)

// View renders the current view
func (m Model) View() string {
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

	title := splashTitleStyle.Render("SuperChat v1.0")
	subtitle := splashBodyStyle.Render("A terminal-based threaded chat application")

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
	instructions := lipgloss.JoinVertical(
		lipgloss.Left,
		"Welcome to SuperChat!",
		"",
		"Select a channel from the left to start browsing.",
		"",
		"Press [n] to create a new thread once in a channel.",
		"Press [h] or [?] for help.",
	)

	mainPane := threadPaneStyle.
		Width(m.width - 40).
		Height(m.height - 6).
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
	footer := m.renderFooter("[↑↓] Navigate  [Enter] Select  [r] Refresh  [h] Help  [q] Quit")
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
	footer := m.renderFooter("[↑↓] Navigate  [Enter] Open  [n] New Thread  [r] Refresh  [Esc] Back  [h] Help")
	s.WriteString(footer)

	return s.String()
}

// renderThreadView renders the thread view
func (m Model) renderThreadView() string {
	var s strings.Builder

	// Header
	header := m.renderHeader()
	s.WriteString(header)
	s.WriteString("\n")

	// Thread content
	threadContent := m.renderThreadContent()

	s.WriteString(threadContent)
	s.WriteString("\n")

	// Footer
	footer := m.renderFooter("[↑↓] Navigate  [r] Reply  [Esc] Back  [h] Help")
	s.WriteString(footer)

	return s.String()
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

	inputBox := inputFocusedStyle.
		Width(56).
		Height(10).
		Render(preview + "█")

	instructions := mutedTextStyle.Render("[Ctrl+D or Ctrl+Enter] Send  [Esc] Cancel")

	content := lipgloss.JoinVertical(
		lipgloss.Left,
		titleRender,
		"",
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
	left := headerStyle.Render("SuperChat v1.0")

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

	var items []string
	for i, channel := range m.channels {
		item := channel.Name
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
		strings.Join(items, "\n"),
	)

	return channelPaneStyle.
		Width(36).
		Height(m.height - 6).
		Render(content)
}

// renderThreadPane renders the thread list pane
func (m Model) renderThreadPane() string {
	var title string
	if m.currentChannel != nil {
		title = threadTitleStyle.Render(m.currentChannel.Name + " - Threads")
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

	content := lipgloss.JoinVertical(
		lipgloss.Left,
		title,
		strings.Join(items, "\n"),
	)

	return threadPaneStyle.
		Width(m.width - 40).
		Height(m.height - 6).
		Render(content)
}

// renderThreadContent renders the thread and its replies
func (m Model) renderThreadContent() string {
	var content strings.Builder

	if m.currentThread == nil {
		return threadPaneStyle.
			Width(m.width - 4).
			Height(m.height - 6).
			Render("No thread selected")
	}

	// Render root message
	rootMsg := m.formatMessage(*m.currentThread, 0, m.replyCursor == 0)
	content.WriteString(rootMsg)
	content.WriteString("\n\n")

	// Render replies
	for i, reply := range m.threadReplies {
		msg := m.formatMessage(reply, int(reply.ThreadDepth), m.replyCursor == i+1)
		content.WriteString(msg)
		content.WriteString("\n")
	}

	return threadPaneStyle.
		Width(m.width - 4).
		Height(m.height - 6).
		Render(content.String())
}

// formatThreadItem formats a thread list item
func (m Model) formatThreadItem(thread protocol.Message) string {
	author := thread.AuthorNickname
	if thread.AuthorUserID == nil {
		author = "~" + author
	}

	// Truncate content for display
	preview := thread.Content
	if len(preview) > 60 {
		preview = preview[:60] + "..."
	}
	preview = strings.ReplaceAll(preview, "\n", " ")

	timeStr := formatTime(thread.CreatedAt)

	replyCount := ""
	if thread.ReplyCount > 0 {
		replyCount = fmt.Sprintf(" (%d)", thread.ReplyCount)
	}

	return fmt.Sprintf("%s %s  %s%s",
		messageAuthorStyle.Render(author),
		preview,
		messageTimeStyle.Render(timeStr),
		mutedTextStyle.Render(replyCount),
	)
}

// formatMessage formats a message for display in thread view
func (m Model) formatMessage(msg protocol.Message, depth int, selected bool) string {
	indent := strings.Repeat("  ", depth)

	author := msg.AuthorNickname
	if msg.AuthorUserID == nil {
		author = messageAnonymousStyle.Render("~" + author)
	} else {
		author = messageAuthorStyle.Render(author)
	}

	timeStr := formatTime(msg.CreatedAt)
	timestamp := messageTimeStyle.Render(timeStr)

	depthIndicator := ""
	if depth > 0 {
		depthIndicator = messageDepthStyle.Render(fmt.Sprintf("[%d] ", depth))
	}

	header := fmt.Sprintf("%s%s%s  %s", indent, depthIndicator, author, timestamp)

	// Content with indent
	contentLines := strings.Split(msg.Content, "\n")
	var indentedContent []string
	for _, line := range contentLines {
		indentedContent = append(indentedContent, indent+messageContentStyle.Render(line))
	}

	content := strings.Join(indentedContent, "\n")

	full := header + "\n" + content

	if selected {
		return selectedItemStyle.Render("▶ " + full)
	}

	return unselectedItemStyle.Render("  " + full)
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
