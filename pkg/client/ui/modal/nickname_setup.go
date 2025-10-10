package modal

import (
	"fmt"

	tea "github.com/charmbracelet/bubbletea"
	"github.com/charmbracelet/lipgloss"
)

// NicknameSetupModal is shown on first run to set up a nickname
type NicknameSetupModal struct {
	input        string
	errorMessage string
	onConfirm    func(nickname string) tea.Cmd
	onCancel     func() tea.Cmd
}

// NewNicknameSetupModal creates a new nickname setup modal
func NewNicknameSetupModal(initialNickname string, onConfirm func(string) tea.Cmd, onCancel func() tea.Cmd) *NicknameSetupModal {
	return &NicknameSetupModal{
		input:        initialNickname,
		errorMessage: "",
		onConfirm:    onConfirm,
		onCancel:     onCancel,
	}
}

// Type returns the modal type
func (m *NicknameSetupModal) Type() ModalType {
	return ModalNicknameSetup
}

// HandleKey processes keyboard input
func (m *NicknameSetupModal) HandleKey(msg tea.KeyMsg) (bool, Modal, tea.Cmd) {
	switch msg.String() {
	case "enter":
		// Validate nickname length
		if len(m.input) < 3 {
			m.errorMessage = "Nickname must be at least 3 characters"
			return true, m, nil
		}

		// Confirm nickname
		var cmd tea.Cmd
		if m.onConfirm != nil {
			cmd = m.onConfirm(m.input)
		}
		return true, nil, cmd // Close modal

	case "esc":
		// Cancel/quit
		var cmd tea.Cmd
		if m.onCancel != nil {
			cmd = m.onCancel()
		}
		return true, nil, cmd

	case "backspace":
		if len(m.input) > 0 {
			m.input = m.input[:len(m.input)-1]
		}
		return true, m, nil

	default:
		// Handle text input (single character, up to 20 chars)
		if len(msg.String()) == 1 && len(m.input) < 20 {
			m.input += msg.String()
			return true, m, nil
		}

		// Consume all other keys
		return true, m, nil
	}
}

// Render returns the modal content
func (m *NicknameSetupModal) Render(width, height int) string {
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
	title := modalTitleStyle.Render("Set Your Nickname")
	prompt := "Enter a nickname:"

	// Input field with cursor and max width (52 chars to fit in 60-char modal with padding)
	input := inputFocusedStyle.Width(52).Render(m.input + "█")

	// Helper text with validation rules and character count
	charCountText := fmt.Sprintf("Characters: %d/20", len(m.input))
	helperText := lipgloss.NewStyle().
		Foreground(lipgloss.Color("252")).
		Render(lipgloss.JoinVertical(
			lipgloss.Left,
			"Allowed: letters, numbers, - and _",
			mutedTextStyle.Render(charCountText),
		))

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
		input,
		"",
		helperText,
		errorMsg,
		"",
		mutedTextStyle.Render("[Enter] Confirm  [Esc] Quit"),
	)

	modal := modalStyle.Render(content)

	// Center the modal
	return lipgloss.Place(width, height, lipgloss.Center, lipgloss.Center, modal)
}

// IsBlockingInput returns true (this modal blocks all input)
func (m *NicknameSetupModal) IsBlockingInput() bool {
	return true
}
