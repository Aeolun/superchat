package modal

import (
	tea "github.com/charmbracelet/bubbletea"
	"github.com/charmbracelet/lipgloss"
)

// NicknameChangeModal allows users to change their nickname
type NicknameChangeModal struct {
	currentNickname string
	input           string
	errorMessage    string
	onConfirm       func(newNickname string) tea.Cmd
	onCancel        func() tea.Cmd
}

// NewNicknameChangeModal creates a new nickname change modal
func NewNicknameChangeModal(currentNickname string, onConfirm func(string) tea.Cmd, onCancel func() tea.Cmd) *NicknameChangeModal {
	return &NicknameChangeModal{
		currentNickname: currentNickname,
		input:           currentNickname, // Pre-fill with current nickname
		errorMessage:    "",
		onConfirm:       onConfirm,
		onCancel:        onCancel,
	}
}

// Type returns the modal type
func (m *NicknameChangeModal) Type() ModalType {
	return ModalNicknameChange
}

// HandleKey processes keyboard input
func (m *NicknameChangeModal) HandleKey(msg tea.KeyMsg) (bool, Modal, tea.Cmd) {
	switch msg.String() {
	case "enter":
		// Validate nickname
		if m.input == "" {
			m.errorMessage = "Nickname cannot be empty"
			return true, m, nil
		}
		if m.input == m.currentNickname {
			m.errorMessage = "That's already your nickname"
			return true, m, nil
		}

		// Confirm change
		var cmd tea.Cmd
		if m.onConfirm != nil {
			cmd = m.onConfirm(m.input)
		}
		return true, nil, cmd // Close modal

	case "esc":
		// Cancel change
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

	default:
		// Handle text input
		if msg.Type == tea.KeyRunes && len(m.input) < 20 {
			m.input += string(msg.Runes)
			return true, m, nil
		}
		// Consume all other keys
		return true, m, nil
	}
}

// Render returns the modal content
func (m *NicknameChangeModal) Render(width, height int) string {
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

	errorStyle := lipgloss.NewStyle().
		Foreground(lipgloss.Color("196")).
		Bold(true)

	modalStyle := lipgloss.NewStyle().
		Border(lipgloss.RoundedBorder()).
		BorderForeground(lipgloss.Color("205")).
		Padding(1, 2)

	// Build content
	title := modalTitleStyle.Render("Change Nickname")
	prompt := "Enter new nickname (3-20 characters, alphanumeric plus - and _):"

	// Nickname input with cursor and max width (52 chars to fit in 60-char modal with padding)
	nicknameDisplay := m.input + "█"
	nicknameField := inputFocusedStyle.Width(52).Render(nicknameDisplay)

	// Error message if any
	var errorMsg string
	if m.errorMessage != "" {
		errorMsg = "\n" + errorStyle.Render("⚠ " + m.errorMessage)
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

	// Center the modal
	return lipgloss.Place(width, height, lipgloss.Center, lipgloss.Center, modal)
}

// IsBlockingInput returns true (this modal blocks all input)
func (m *NicknameChangeModal) IsBlockingInput() bool {
	return true
}
