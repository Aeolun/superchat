package modal

import (
	"strings"

	tea "github.com/charmbracelet/bubbletea"
	"github.com/charmbracelet/lipgloss"
)

// ComposeMode indicates what we're composing
type ComposeMode int

const (
	ComposeModeNewThread ComposeMode = iota
	ComposeModeReply
	ComposeModeEdit
)

// ComposeModal allows users to compose messages
type ComposeModal struct {
	mode      ComposeMode
	input     string
	onSend    func(content string) tea.Cmd
	onCancel  func() tea.Cmd
}

// NewComposeModal creates a new compose modal
func NewComposeModal(mode ComposeMode, initialContent string, onSend func(string) tea.Cmd, onCancel func() tea.Cmd) *ComposeModal {
	return &ComposeModal{
		mode:     mode,
		input:    initialContent,
		onSend:   onSend,
		onCancel: onCancel,
	}
}

// Type returns the modal type
func (m *ComposeModal) Type() ModalType {
	return ModalCompose
}

// HandleKey processes keyboard input
func (m *ComposeModal) HandleKey(msg tea.KeyMsg) (bool, Modal, tea.Cmd) {
	switch msg.String() {
	case "ctrl+d", "ctrl+enter":
		// Send message
		if len(m.input) == 0 {
			// Don't send empty messages, just stay in modal
			return true, m, nil
		}

		var cmd tea.Cmd
		if m.onSend != nil {
			cmd = m.onSend(m.input)
		}
		return true, nil, cmd // Close modal

	case "esc":
		// Cancel compose
		var cmd tea.Cmd
		if m.onCancel != nil {
			cmd = m.onCancel()
		}
		return true, nil, cmd // Close modal

	case "backspace":
		if len(m.input) > 0 {
			m.input = m.input[:len(m.input)-1]
		}
		return true, m, nil

	case "enter":
		// Add newline
		m.input += "\n"
		return true, m, nil

	case " ":
		// Add space
		m.input += " "
		return true, m, nil

	default:
		// Handle text input
		if msg.Type == tea.KeyRunes {
			m.input += string(msg.Runes)
			return true, m, nil
		}

		// Consume all other keys
		return true, m, nil
	}
}

// Render returns the modal content
func (m *ComposeModal) Render(width, height int) string {
	modalTitleStyle := lipgloss.NewStyle().
		Bold(true).
		Foreground(lipgloss.Color("205")).
		MarginBottom(1)

	inputFocusedStyle := lipgloss.NewStyle().
		Border(lipgloss.RoundedBorder()).
		BorderForeground(lipgloss.Color("170")).
		Padding(0, 1)

	mutedTextStyle := lipgloss.NewStyle().
		Foreground(lipgloss.Color("240"))

	modalStyle := lipgloss.NewStyle().
		Border(lipgloss.RoundedBorder()).
		BorderForeground(lipgloss.Color("205")).
		Padding(1, 2)

	// Determine title based on mode
	title := "Compose New Thread"
	if m.mode == ComposeModeReply {
		title = "Compose Reply"
	} else if m.mode == ComposeModeEdit {
		title = "Edit Message"
	}

	titleRender := modalTitleStyle.Render(title)

	// Preview of content (truncate if too long for display)
	preview := m.input
	if len(preview) > 200 {
		preview = preview[:200] + "..."
	}

	// Input box with cursor
	inputBox := inputFocusedStyle.
		Width(52).
		Height(11).
		Render(preview + "█")

	// Build content sections
	var contentSections []string
	contentSections = append(contentSections, titleRender, inputBox)

	// Show thread title preview only for new threads
	if m.mode == ComposeModeNewThread && len(m.input) > 0 {
		// Use a more visible color for the thread title preview
		titlePreviewStyle := lipgloss.NewStyle().
			Foreground(lipgloss.Color("39")). // Bright blue
			Italic(true)

		// Calculate available width for title preview (input box width - prefix "  → " - ellipsis "...")
		const inputWidth = 52
		const prefixLen = 4  // "  → "
		const ellipsisLen = 3 // "..."
		maxTitleLen := inputWidth - prefixLen - ellipsisLen

		// Get the full title (before truncation) to check if it needs ellipsis
		fullTitle := ""
		if doubleNewlineIdx := strings.Index(m.input, "\n\n"); doubleNewlineIdx >= 0 {
			// User set explicit title
			fullTitle = m.input[:doubleNewlineIdx]
		} else {
			// No explicit title, use entire content
			fullTitle = m.input
		}
		// Replace newlines for length check
		fullTitleDisplay := strings.ReplaceAll(fullTitle, "\n", " ")

		// Check if truncation is needed
		titleTruncated := len(fullTitleDisplay) > maxTitleLen

		// Extract and truncate for display
		threadTitle := extractThreadTitle(m.input, maxTitleLen)
		threadTitle = strings.ReplaceAll(threadTitle, "\n", " ")
		if len(threadTitle) > maxTitleLen {
			threadTitle = threadTitle[:maxTitleLen]
		}

		estimateNote := mutedTextStyle.Render("Preview (depends on window width):")
		titlePreview := mutedTextStyle.Render("  → ") +
			titlePreviewStyle.Render(threadTitle)

		// Add ellipsis only if the title itself was truncated
		if titleTruncated {
			titlePreview += mutedTextStyle.Render("...")
		}

		// Wrap the entire preview line to input width
		titlePreview = lipgloss.NewStyle().Width(inputWidth).Render(titlePreview)

		titleHint := mutedTextStyle.Render("Tip: Use double newline to set title manually")

		contentSections = append(contentSections, "", estimateNote, titlePreview, titleHint)
	}

	instructions := mutedTextStyle.Render("[Ctrl+D or Ctrl+Enter] Send  [Esc] Cancel")
	contentSections = append(contentSections, "", instructions)

	content := lipgloss.JoinVertical(
		lipgloss.Left,
		contentSections...,
	)

	modal := modalStyle.Render(content)

	// Center the modal
	return lipgloss.Place(width, height, lipgloss.Center, lipgloss.Center, modal)
}

// IsBlockingInput returns true (this modal blocks all input)
func (m *ComposeModal) IsBlockingInput() bool {
	return true
}

// extractThreadTitle extracts the thread title from message content.
// Title is either:
// - Everything before the first "\n\n" (double newline), or
// - First maxChars characters
// whichever comes first.
func extractThreadTitle(content string, maxChars int) string {
	// Find first double newline
	doubleNewlineIdx := strings.Index(content, "\n\n")

	if doubleNewlineIdx >= 0 {
		// User explicitly ended the title with double newline
		title := content[:doubleNewlineIdx]
		// Still respect maxChars
		if len(title) > maxChars {
			return title[:maxChars]
		}
		return title
	}

	// No double newline, use first maxChars (or entire content if shorter)
	if len(content) > maxChars {
		return content[:maxChars]
	}
	return content
}
