package ui

import (
	"fmt"
	"strings"
	"time"

	"github.com/76creates/stickers/flexbox"
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
	// BUT: If there's a modal active (e.g., ConnectionFailedModal), show that instead
	// ALSO: Don't show overlay when switching connection methods (prevent flash)
	if m.connectionState == StateDisconnected && m.modalStack.IsEmpty() {
		if m.switchingMethod {
			// Don't show overlay while switching methods
			if m.logger != nil {
				m.logger.Printf("DEBUG: Suppressing disconnect overlay (switchingMethod=true)")
			}
		} else {
			if m.logger != nil {
				m.logger.Printf("DEBUG: Showing disconnect overlay (switchingMethod=false, modalStack empty)")
			}
			return m.renderDisconnectedOverlay()
		}
	}
	if m.connectionState == StateReconnecting && m.modalStack.IsEmpty() && !m.switchingMethod {
		return m.renderReconnectingOverlay()
	}

	// Render base view
	var baseView string
	switch m.currentView {
	case ViewSplash:
		baseView = m.renderSplash()
	case ViewChannelList:
		baseView = m.renderChannelList()
	case ViewThreadList:
		baseView = m.renderThreadList()
	case ViewThreadView:
		baseView = m.renderThreadView()
	case ViewChatChannel:
		baseView = m.renderChatChannel()
	default:
		baseView = "Unknown view"
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

	title := SplashTitleStyle.Render(fmt.Sprintf("SuperChat %s", m.currentVersion))
	subtitle := lipgloss.NewStyle().
		Foreground(lipgloss.Color("252")).
		Align(lipgloss.Center).
		MarginBottom(1).
		Render("A terminal-based threaded chat application")

	body := SplashBodyStyle.Render(`Getting Started:
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

	prompt := SplashPromptStyle.Render("[Press any key to continue]")

	content := lipgloss.JoinVertical(
		lipgloss.Left,
		title,
		subtitle,
		"",
		body,
		"",
		prompt,
	)

	box := ModalStyle.Render(content)
	s.WriteString("\n\n")
	s.WriteString(lipgloss.Place(m.width, m.height-4, lipgloss.Center, lipgloss.Center, box))

	return s.String()
}

// renderChannelList renders the channel list view using flexbox for stable layout
func (m Model) renderChannelList() string {
	// Import flexbox at the top if not already imported
	layout := flexbox.NewHorizontal(m.width, m.height-3) // Total height minus header(1) + footer(1) + spacing(1)

	// Build channel pane content
	channelPaneContent := m.buildChannelPaneContentString()

	// Build main pane content (instructions)
	welcomeLines := []string{
		"Welcome to SuperChat!",
		"",
	}

	// Add update notification if available
	if m.updateAvailable {
		updateNotice := lipgloss.NewStyle().
			Foreground(WarningColor).
			Bold(true).
			Render(fmt.Sprintf("⚠ Update available: %s → %s", m.currentVersion, m.latestVersion))

		updateInstr := lipgloss.NewStyle().
			Foreground(MutedColor).
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

	// Column 1: Channel pane (ratioX=1 = 25% of width)
	channelCol := layout.NewColumn().AddCells(
		flexbox.NewCell(1, 1).
			SetStyle(ChannelPaneStyle).
			SetContent(channelPaneContent),
	)

	// Column 2: Main pane (ratioX=3 = 75% of width)
	mainCol := layout.NewColumn().AddCells(
		flexbox.NewCell(3, 1).
			SetStyle(ThreadPaneStyle).
			SetContent(instructions),
	)

	layout.AddColumns([]*flexbox.Column{channelCol, mainCol})

	// Combine header, content, and footer
	header := m.renderHeader()
	content := layout.Render()
	footer := m.renderFooter(m.commands.GenerateFooter(int(m.currentView), m.modalStack.TopType(), &m))

	return lipgloss.JoinVertical(
		lipgloss.Left,
		header,
		content,
		footer,
	)
}

// renderThreadList renders the thread list view using flexbox for stable layout
func (m Model) renderThreadList() string {
	layout := flexbox.NewHorizontal(m.width, m.height-3) // Total height minus header(1) + footer(1) + spacing(1)

	// Build channel pane content
	channelPaneContent := m.buildChannelPaneContentString()

	// Build thread list pane content
	threadListContent := lipgloss.NewStyle().
		PaddingLeft(2).
		Render(m.threadListViewport.View())

	// Column 1: Channel pane (ratioX=1 = 25% of width)
	channelCol := layout.NewColumn().AddCells(
		flexbox.NewCell(1, 1).
			SetStyle(ChannelPaneStyle).
			SetContent(channelPaneContent),
	)

	// Column 2: Thread list pane (ratioX=3 = 75% of width)
	threadCol := layout.NewColumn().AddCells(
		flexbox.NewCell(3, 1).
			SetStyle(ThreadPaneStyle).
			SetContent(threadListContent),
	)

	layout.AddColumns([]*flexbox.Column{channelCol, threadCol})

	// Combine header, content, and footer
	header := m.renderHeader()
	content := layout.Render()
	footer := m.renderFooter(m.commands.GenerateFooter(int(m.currentView), m.modalStack.TopType(), &m))

	return lipgloss.JoinVertical(
		lipgloss.Left,
		header,
		content,
		footer,
	)
}

// renderThreadView renders the thread view using flexbox for stable layout
func (m Model) renderThreadView() string {
	// Create vertical layout: header, content, footer
	layout := flexbox.New(m.width, m.height)

	// Row 1: Header (fixed height = 1)
	headerRow := layout.NewRow().AddCells(
		flexbox.NewCell(1, 1).SetContent(m.renderHeader()),
	)

	// Row 2: Thread content (flexible = remaining height)
	contentHeight := m.height - 2 // Subtract header(1) + footer(1)
	threadContent := m.renderThreadContent()

	contentRow := layout.NewRow().AddCells(
		flexbox.NewCell(1, contentHeight).SetContent(threadContent),
	)

	// Row 3: Footer (fixed height = 1)
	footerRow := layout.NewRow().AddCells(
		flexbox.NewCell(1, 1).SetContent(
			m.renderFooter(m.commands.GenerateFooter(int(m.currentView), m.modalStack.TopType(), &m)),
		),
	)

	layout.AddRows([]*flexbox.Row{headerRow, contentRow, footerRow})

	return layout.Render()
}

// renderChatChannel renders the chat channel view using flexbox for stable layout
func (m Model) renderChatChannel() string {
	// Create vertical layout: header, content, footer
	layout := flexbox.New(m.width, m.height)

	// Row 1: Header (fixed height = 1)
	headerRow := layout.NewRow().AddCells(
		flexbox.NewCell(1, 1).SetContent(m.renderHeader()),
	)

	// Row 2: Chat content (flexible = remaining height)
	contentHeight := m.height - 2 // Subtract header(1) + footer(1)
	chatContent := m.renderChatContent()

	contentRow := layout.NewRow().AddCells(
		flexbox.NewCell(1, contentHeight).SetContent(chatContent),
	)

	// Row 3: Footer (fixed height = 1)
	footerRow := layout.NewRow().AddCells(
		flexbox.NewCell(1, 1).SetContent(
			m.renderFooter(m.commands.GenerateFooter(int(m.currentView), m.modalStack.TopType(), &m)),
		),
	)

	layout.AddRows([]*flexbox.Row{headerRow, contentRow, footerRow})

	return layout.Render()
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

// renderHelp renders the help modal
func (m Model) renderHelp() string {
	title := HelpTitleStyle.Render("Keyboard Shortcuts")

	// Auto-generate shortcuts from command registry (context-aware)
	shortcuts := m.commands.GenerateHelp(int(m.currentView), m.modalStack.TopType(), &m)

	var lines []string
	for _, sc := range shortcuts {
		line := HelpKeyStyle.Render(sc[0]) + "  " + HelpDescStyle.Render(sc[1])
		lines = append(lines, line)
	}

	content := lipgloss.JoinVertical(
		lipgloss.Left,
		title,
		"",
		strings.Join(lines, "\n"),
		"",
		MutedTextStyle.Render("[Press h or ? to close]"),
	)

	modal := ModalStyle.Render(content)

	// Overlay modal (simple version - just place centered)
	return lipgloss.Place(
		m.width,
		m.height,
		lipgloss.Center,
		lipgloss.Center,
		modal,
	)
}

// formatBytes formats bytes into human-readable form
func formatBytes(bytes uint64) string {
	const unit = 1024
	if bytes < unit {
		return fmt.Sprintf("%dB", bytes)
	}
	div, exp := uint64(unit), 0
	for n := bytes / unit; n >= unit; n /= unit {
		div *= unit
		exp++
	}
	return fmt.Sprintf("%.1f%cB", float64(bytes)/float64(div), "KMGTPE"[exp])
}

// renderHeader renders the header
func (m Model) renderHeader() string {
	left := HeaderStyle.Render(fmt.Sprintf("SuperChat %s", m.currentVersion))

	status := "Disconnected"
	if m.conn.IsConnected() {
		if m.nickname != "" {
			// Show auth status: ~ for anonymous, no prefix for authenticated
			prefix := ""
			if m.authState == AuthStateAnonymous || m.authState == AuthStateNone {
				prefix = "~"
			}
			status = fmt.Sprintf("Connected: %s%s", prefix, m.nickname)
		} else {
			status = "Connected (anonymous)"
		}
		if m.onlineUsers > 0 {
			status += fmt.Sprintf("  %d users", m.onlineUsers)
		}

		// Add traffic counter
		sent := formatBytes(m.conn.GetBytesSent())
		recv := formatBytes(m.conn.GetBytesReceived())
		traffic := MutedTextStyle.Render(fmt.Sprintf("  ↑%s ↓%s", sent, recv))
		status += traffic
	}

	right := StatusStyle.Render(status)

	spacer := strings.Repeat(" ", max(0, m.width-lipgloss.Width(left)-lipgloss.Width(right)))

	return left + spacer + right
}

// getVisibleSubstring gets a substring of visible characters, skipping ANSI codes
func getVisibleSubstring(s string, start, length int) string {
	var result strings.Builder
	currentPos := 0
	inEscape := false
	collecting := false

	for _, r := range s {
		// Track ANSI escape sequences
		if r == '\x1b' {
			inEscape = true
		}

		if inEscape {
			if collecting {
				result.WriteRune(r)
			}
			if r == 'm' {
				inEscape = false
			}
			continue
		}

		// Start collecting once we reach the start position
		if currentPos >= start {
			if !collecting {
				collecting = true
			}
			result.WriteRune(r)
			if currentPos-start+1 >= length {
				break
			}
		}

		currentPos++
	}

	return result.String()
}

// truncateString truncates a string to maxLen runes, accounting for ANSI escape codes
func truncateString(s string, maxLen int) string {
	// Use lipgloss.Width to handle ANSI codes properly
	if lipgloss.Width(s) <= maxLen {
		return s
	}

	// Iterate through runes and truncate when we hit the limit
	var result strings.Builder
	currentWidth := 0
	inEscape := false

	for _, r := range s {
		// Track ANSI escape sequences (don't count toward width)
		if r == '\x1b' {
			inEscape = true
		}

		if inEscape {
			result.WriteRune(r)
			if r == 'm' {
				inEscape = false
			}
			continue
		}

		// Check if adding this rune would exceed the limit
		if currentWidth >= maxLen {
			break
		}

		result.WriteRune(r)
		currentWidth++
	}

	return result.String()
}

// renderFooter renders the footer
func (m Model) renderFooter(shortcuts string) string {
	// Build footer content
	footerContent := shortcuts

	if m.statusMessage != "" {
		footerContent += "  " + SuccessStyle.Render(m.statusMessage)
	}

	if m.errorMessage != "" {
		footerContent += "  " + RenderError(m.errorMessage)
	}

	// Truncate if too long (account for padding in FooterStyle)
	// FooterStyle has Padding(0, 1) which adds 2 chars total
	maxWidth := m.width - 2
	suffix := " [?/h] for more…"
	fadeLength := 3

	if lipgloss.Width(footerContent) > maxWidth {
		// Truncate, leaving room for fade effect and suffix
		truncateAt := maxWidth - lipgloss.Width(suffix) - fadeLength
		truncated := truncateString(footerContent, truncateAt)

		// Trim trailing spaces so we don't fade invisible characters
		trimmed := strings.TrimRight(truncated, " ")
		trimmedWidth := lipgloss.Width(trimmed)

		// Extract the next fadeLength visible (non-space) characters for fading
		remainingContent := getVisibleSubstring(footerContent, trimmedWidth, fadeLength)

		// Apply fade effect to these characters
		// Colors: #666666 -> #444444 -> #222222
		fadeColors := []string{"#666666", "#444444", "#222222"}
		var faded strings.Builder
		for i, r := range []rune(remainingContent) {
			if i < len(fadeColors) {
				faded.WriteString(lipgloss.NewStyle().Foreground(lipgloss.Color(fadeColors[i])).Render(string(r)))
			} else {
				faded.WriteRune(r)
			}
		}

		footerContent = trimmed + faded.String() + suffix
	}

	footer := FooterStyle.Render(footerContent)
	return footer
}

// buildChannelPaneContentString builds the channel list content without styling
func (m Model) buildChannelPaneContentString() string {
	title := ChannelTitleStyle.Render("Channels")

	// Format server address, hiding default port (6465)
	addr := m.conn.GetAddress()
	if idx := strings.LastIndex(addr, ":6465"); idx != -1 {
		addr = addr[:idx]
	}
	serverAddr := MutedTextStyle.MarginBottom(1).Render(addr)

	var items []string

	// Show loading indicator if loading channels
	if m.loadingChannels {
		items = append(items, MutedTextStyle.Render("  "+m.spinner.View()+" Loading channels..."))
	} else {
		for i, channel := range m.channels {
			// Use '>' prefix for chat channels (type 0), '#' for forum channels (type 1)
			var prefix string
			if channel.Type == 0 {
				prefix = ">"
			} else {
				prefix = "#"
			}
			item := prefix + channel.Name
			if i == m.channelCursor {
				item = SelectedItemStyle.Render("▶ " + item)
			} else {
				item = UnselectedItemStyle.Render("  " + item)
			}
			items = append(items, item)
		}

		if len(items) == 0 {
			items = append(items, MutedTextStyle.Render("  (no channels)"))
		}
	}

	return lipgloss.JoinVertical(
		lipgloss.Left,
		title,
		serverAddr,
		strings.Join(items, "\n"),
	)
}

// renderChannelPane renders the channel list pane (used by thread list view)
func (m Model) renderChannelPane() string {
	content := m.buildChannelPaneContentString()

	// Use 25% of width for channel pane
	// Subtract 2 for border (lipgloss adds border on top of width)
	channelWidth := m.width/4 - 2
	if channelWidth < 20 {
		channelWidth = 20
	}

	return ChannelPaneStyle.
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

	return ThreadPaneStyle.
		Width(threadWidth).
		Height(m.height - 4).
		Render(content)
}

// renderThreadContent renders the thread and its replies using flexbox
func (m Model) renderThreadContent() string {
	if m.currentThread == nil {
		return ThreadPaneStyle.
			Width(m.width - 4).
			Height(m.height - 2). // Just header and footer
			Render("No thread selected")
	}

	// Get viewport content
	viewportContent := m.threadViewport.View()

	// Check for new messages outside viewport
	hasNewAbove, hasNewBelow := m.checkNewMessagesOutsideViewport()

	// Available height for thread content area (excludes header and footer)
	contentHeight := m.height - 2
	layout := flexbox.New(m.width, contentHeight)

	var rows []*flexbox.Row

	// Row 1 (optional): "NEW MESSAGES ABOVE" indicator (1 line if present)
	if hasNewAbove {
		indicator := lipgloss.NewStyle().
			Foreground(WarningColor).
			Bold(true).
			Align(lipgloss.Right).
			Render("▲ NEW MESSAGES ABOVE ▲")

		indicatorRow := layout.NewRow().AddCells(
			flexbox.NewCell(1, 1).SetContent(indicator),
		)
		rows = append(rows, indicatorRow)
	}

	// Row 2: Thread viewport (flexible - takes remaining space)
	// Calculate height: total - indicators (1 line each if present)
	indicatorLines := 0
	if hasNewAbove {
		indicatorLines++
	}
	if hasNewBelow {
		indicatorLines++
	}
	threadHeight := contentHeight - indicatorLines

	threadRow := layout.NewRow().AddCells(
		flexbox.NewCell(1, threadHeight).
			SetStyle(ActualThreadStyle).
			SetContent(viewportContent),
	)
	rows = append(rows, threadRow)

	// Row 3 (optional): "NEW MESSAGES BELOW" indicator (1 line if present)
	if hasNewBelow {
		indicator := lipgloss.NewStyle().
			Foreground(WarningColor).
			Bold(true).
			Align(lipgloss.Right).
			Render("▼ NEW MESSAGES BELOW ▼")

		indicatorRow := layout.NewRow().AddCells(
			flexbox.NewCell(1, 1).SetContent(indicator),
		)
		rows = append(rows, indicatorRow)
	}

	layout.AddRows(rows)

	return layout.Render()
}

// formatThreadItem formats a thread list item
// isOwnMessage checks if a message was authored by the current user
func (m Model) isOwnMessage(msg protocol.Message) bool {
	// For registered users, compare user ID
	if m.userID != nil && msg.AuthorUserID != nil {
		return *m.userID == *msg.AuthorUserID
	}

	// For anonymous users, compare nickname (strip prefix from server's AuthorNickname)
	// Server sends "~nickname" for anonymous users
	strippedNickname := strings.TrimPrefix(msg.AuthorNickname, "~")
	return strippedNickname == m.nickname
}

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
	authorStyle := MessageAuthorStyle
	if m.isOwnMessage(thread) {
		authorStyle = MessageOwnAuthorStyle
	}
	authorRendered := authorStyle.Render(author)
	metadataRendered := MessageTimeStyle.Render(timeStr) + MutedTextStyle.Render(replyCount)

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

	// Choose style based on whether this is the current user's message
	var authorStyle lipgloss.Style
	if m.isOwnMessage(msg) {
		authorStyle = MessageOwnAuthorStyle
	} else if msg.AuthorUserID == nil {
		// Anonymous user (not current user)
		authorStyle = MessageAnonymousStyle
	} else {
		// Registered user (not current user)
		authorStyle = MessageAuthorStyle
	}
	author = authorStyle.Render(author)

	timeStr := formatTime(msg.CreatedAt)
	timestamp := MessageTimeStyle.Render(timeStr)

	// Add edited indicator if message was edited
	editedIndicator := ""
	if msg.EditedAt != nil {
		editedIndicator = "  " + MessageTimeStyle.Render("(edited)")
	}

	// Add NEW indicator if message is unread
	newIndicator := ""
	if m.newMessageIDs[msg.ID] {
		newIndicator = "  " + SuccessStyle.Render("[NEW]")
	}

	// Add depth indicator at the end
	depthIndicator := ""
	if depth > 0 {
		depthIndicator = "  " + MessageDepthStyle.Render(fmt.Sprintf("[%d]", depth))
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
			indentedContent = append(indentedContent, indent+MessageContentStyle.Render(wl))
		}
	}

	content := strings.Join(indentedContent, "\n")

	full := header + "\n" + content

	if selected {
		return SelectedItemStyle.Render("▶ " + selectedIndent + full)
	}

	return UnselectedItemStyle.Render("" + indent + full)
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
		title = ThreadTitleStyle.Render("#" + m.currentChannel.Name + " - Threads")
	} else {
		title = ThreadTitleStyle.Render("Threads")
	}

	var items []string

	// Show loading indicator if initially loading
	if m.loadingThreadList {
		items = append(items, MutedTextStyle.Render("  "+m.spinner.View()+" Loading threads..."))
	} else {
		for i, thread := range m.threads {
			item := m.formatThreadItem(thread)
			if i == m.threadCursor {
				item = SelectedItemStyle.Render("▶ " + item)
			} else {
				item = UnselectedItemStyle.Render("  " + item)
			}
			items = append(items, item)
		}

		if len(items) == 0 {
			items = append(items, MutedTextStyle.Render("  (no threads)"))
		}

		// Show "loading more" indicator at bottom if appropriate
		if m.loadingMore {
			items = append(items, "", MutedTextStyle.Render("  "+m.spinner.View()+" Loading more threads..."))
		}
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

	// Show loading indicator if loading initial replies
	if m.loadingThreadReplies {
		content.WriteString(MutedTextStyle.Render(m.spinner.View() + " Loading replies..."))
		return content.String()
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

	// Show "loading more" indicator at bottom if appropriate
	if m.loadingMoreReplies {
		content.WriteString(MutedTextStyle.Render(m.spinner.View() + " Loading more replies..."))
		content.WriteString("\n\n")
	}

	return content.String()
}

// renderChatContent renders the chat channel content with message area and input field using flexbox
func (m Model) renderChatContent() string {
	if m.currentChannel == nil {
		return ThreadPaneStyle.
			Width(m.width - 4).
			Height(m.height - 2). // Just header and footer
			Render("No channel selected")
	}

	// Create vertical layout for message area + input field
	// Available height excludes header and footer
	contentHeight := m.height - 2
	layout := flexbox.New(m.width, contentHeight)

	// Build message area content
	messageContent := m.chatViewport.View()

	// Build input field content
	inputContent := m.buildChatInputField()

	// Row 1: Message area (flexible - takes remaining space after input)
	// The input field has fixed height of 5 lines (3 content + 2 border)
	// So message area gets: contentHeight - 5
	messageRow := layout.NewRow().AddCells(
		flexbox.NewCell(1, contentHeight-5).
			SetStyle(ThreadPaneStyle).
			SetContent(messageContent),
	)

	// Row 2: Input field (fixed height = 5 lines)
	inputRow := layout.NewRow().AddCells(
		flexbox.NewCell(1, 5).
			SetContent(inputContent),
	)

	layout.AddRows([]*flexbox.Row{messageRow, inputRow})

	return layout.Render()
}

// buildChatMessages builds the chat message list for the viewport
func (m Model) buildChatMessages() string {
	// Show loading indicator if initially loading
	if m.loadingChat {
		return MutedTextStyle.Render("  " + m.spinner.View() + " Loading messages...")
	}

	// Render messages in chronological order (oldest first, newest last)
	if len(m.chatMessages) == 0 {
		return MutedTextStyle.Render("  (no messages yet)")
	}

	var lines []string
	for _, msg := range m.chatMessages {
		chatLine := m.formatChatMessage(msg)
		lines = append(lines, chatLine)
	}

	return strings.Join(lines, "\n")
}

// formatChatMessage formats a single chat message as: [time] nickname message
func (m Model) formatChatMessage(msg protocol.Message) string {
	// Format timestamp (HH:MM)
	timestamp := msg.CreatedAt.Format("15:04")
	timeStyle := lipgloss.NewStyle().Foreground(MutedColor)

	// Format nickname with same styling as threaded view
	nickname := msg.AuthorNickname

	// Choose style based on whether this is the current user's message
	var nicknameStyle lipgloss.Style
	if m.isOwnMessage(msg) {
		nicknameStyle = MessageOwnAuthorStyle // Green + bold for own messages
	} else if msg.AuthorUserID == nil {
		// Anonymous user (not current user)
		nicknameStyle = MessageAnonymousStyle // Secondary color
	} else {
		// Registered user (not current user)
		nicknameStyle = MessageAuthorStyle // Secondary color
	}

	// Build first line with timestamp and nickname
	timestampRendered := timeStyle.Render("[" + timestamp + "]")
	nicknameRendered := nicknameStyle.Render(nickname)
	firstLinePrefix := timestampRendered + " " + nicknameRendered + " "

	// Calculate available width for message content
	// Account for viewport width minus some padding
	availableWidth := m.chatViewport.Width - 4 // Some padding
	if availableWidth < 20 {
		availableWidth = 20
	}

	// Calculate prefix width (using lipgloss.Width to account for ANSI codes)
	prefixWidth := lipgloss.Width(firstLinePrefix)
	contentWidth := availableWidth - prefixWidth

	// Wrap the message content
	wrappedLines := wrapText(msg.Content, contentWidth)

	// Format content with proper indentation for continuation lines
	contentStyle := lipgloss.NewStyle().Foreground(lipgloss.Color("252"))
	if len(wrappedLines) == 0 {
		return firstLinePrefix
	}

	// First line includes timestamp and nickname
	result := firstLinePrefix + contentStyle.Render(wrappedLines[0])

	// Continuation lines are indented to align with first line content
	indent := strings.Repeat(" ", prefixWidth)
	for i := 1; i < len(wrappedLines); i++ {
		result += "\n" + indent + contentStyle.Render(wrappedLines[i])
	}

	return result
}

// wrapText wraps text to fit within the specified width
func wrapText(text string, width int) []string {
	if width <= 0 {
		return []string{text}
	}

	var lines []string
	words := strings.Fields(text)
	if len(words) == 0 {
		return []string{""}
	}

	currentLine := ""
	for _, word := range words {
		// If word itself is longer than width, we'll just let it overflow
		if len(word) > width {
			if currentLine != "" {
				lines = append(lines, currentLine)
				currentLine = ""
			}
			lines = append(lines, word)
			continue
		}

		// Check if adding this word would exceed width
		testLine := currentLine
		if testLine != "" {
			testLine += " "
		}
		testLine += word

		if len(testLine) > width {
			// Adding this word would exceed width, so start a new line
			if currentLine != "" {
				lines = append(lines, currentLine)
			}
			currentLine = word
		} else {
			currentLine = testLine
		}
	}

	// Add the last line
	if currentLine != "" {
		lines = append(lines, currentLine)
	}

	return lines
}

// buildChatInputField builds the input field at the bottom of chat view
func (m Model) buildChatInputField() string {
	// The textarea handles all the rendering internally
	return m.chatTextarea.View()
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
		Foreground(ErrorColor).
		Align(lipgloss.Center).
		MarginBottom(2).
		Render("⚠  CONNECTION LOST  ⚠")

	message := lipgloss.NewStyle().
		Foreground(lipgloss.Color("252")).
		Align(lipgloss.Center).
		MarginBottom(1).
		Render("The connection to the server has been lost.")

	// Show what methods have been tried
	connType := m.conn.GetConnectionType()
	var methodInfo string
	if connType != "" {
		var methodName string
		switch connType {
		case "tcp":
			methodName = "TCP (binary protocol)"
		case "ssh":
			methodName = "SSH"
		case "websocket":
			methodName = "WebSocket"
		default:
			methodName = connType
		}
		methodInfo = fmt.Sprintf("Tried: %s + WebSocket fallback", methodName)
	}

	var contentParts []string
	contentParts = append(contentParts, "")
	contentParts = append(contentParts, title)
	contentParts = append(contentParts, message)

	if methodInfo != "" {
		methods := lipgloss.NewStyle().
			Foreground(MutedColor).
			Align(lipgloss.Center).
			MarginBottom(1).
			Render(methodInfo)
		contentParts = append(contentParts, methods)
	}

	info := lipgloss.NewStyle().
		Foreground(MutedColor).
		Align(lipgloss.Center).
		Render("Attempting to reconnect...")
	contentParts = append(contentParts, info)
	contentParts = append(contentParts, "")

	content := lipgloss.JoinVertical(
		lipgloss.Center,
		contentParts...,
	)

	box := lipgloss.NewStyle().
		Border(lipgloss.DoubleBorder()).
		BorderForeground(ErrorColor).
		Padding(2, 4).
		Render(content)

	return lipgloss.Place(m.width, m.height, lipgloss.Center, lipgloss.Center, box)
}

// renderReconnectingOverlay renders a full-screen overlay when reconnecting
func (m Model) renderReconnectingOverlay() string {
	title := lipgloss.NewStyle().
		Bold(true).
		Foreground(WarningColor).
		Align(lipgloss.Center).
		MarginBottom(2).
		Render("RECONNECTING...")

	attemptMsg := fmt.Sprintf("Attempt %d", m.reconnectAttempt)
	message := lipgloss.NewStyle().
		Foreground(lipgloss.Color("252")).
		Align(lipgloss.Center).
		MarginBottom(1).
		Render(attemptMsg)

	// Show what methods have been tried
	methodInfo := ""
	connType := m.conn.GetConnectionType()
	if connType != "" {
		var methodName string
		switch connType {
		case "tcp":
			methodName = "TCP (binary protocol)"
		case "ssh":
			methodName = "SSH"
		case "websocket":
			methodName = "WebSocket"
		default:
			methodName = connType
		}

		if m.reconnectAttempt > 1 {
			methodInfo = fmt.Sprintf("Tried: %s + WebSocket fallback", methodName)
		} else {
			methodInfo = fmt.Sprintf("Trying: %s", methodName)
		}
	}

	var contentParts []string
	contentParts = append(contentParts, "")
	contentParts = append(contentParts, title)
	contentParts = append(contentParts, message)

	if methodInfo != "" {
		methods := lipgloss.NewStyle().
			Foreground(MutedColor).
			Align(lipgloss.Center).
			MarginBottom(1).
			Render(methodInfo)
		contentParts = append(contentParts, methods)
	}

	info := lipgloss.NewStyle().
		Foreground(MutedColor).
		Align(lipgloss.Center).
		Render("Please wait while we restore your connection...")
	contentParts = append(contentParts, info)

	// Animated dots based on attempt number
	dots := strings.Repeat(".", (m.reconnectAttempt % 4))
	spinner := lipgloss.NewStyle().
		Foreground(PrimaryColor).
		Align(lipgloss.Center).
		MarginTop(1).
		Render(dots)
	contentParts = append(contentParts, spinner)
	contentParts = append(contentParts, "")

	content := lipgloss.JoinVertical(
		lipgloss.Center,
		contentParts...,
	)

	box := lipgloss.NewStyle().
		Border(lipgloss.DoubleBorder()).
		BorderForeground(WarningColor).
		Padding(2, 4).
		Render(content)

	return lipgloss.Place(m.width, m.height, lipgloss.Center, lipgloss.Center, box)
}
