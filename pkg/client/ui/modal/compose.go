package modal

import (
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

	instructions := mutedTextStyle.Render("[Ctrl+D or Ctrl+Enter] Send  [Esc] Cancel")

	content := lipgloss.JoinVertical(
		lipgloss.Left,
		titleRender,
		inputBox,
		"",
		instructions,
	)

	modal := modalStyle.Render(content)

	// Center the modal
	return lipgloss.Place(width, height, lipgloss.Center, lipgloss.Center, modal)
}

// IsBlockingInput returns true (this modal blocks all input)
func (m *ComposeModal) IsBlockingInput() bool {
	return true
}
