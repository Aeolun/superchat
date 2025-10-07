package modal

import (
	tea "github.com/charmbracelet/bubbletea"
	"github.com/charmbracelet/lipgloss"
)

type PasswordChangeModal struct {
	oldPassword     string
	newPassword     string
	confirmPassword string
	focusIndex      int
	skipOldPassword bool // True for SSH-registered users
	errorMessage    string
	onConfirm       func(oldPassword, newPassword string) tea.Cmd
	onCancel        func() tea.Cmd
}

func NewPasswordChangeModal(skipOldPassword bool, onConfirm func(string, string) tea.Cmd, onCancel func() tea.Cmd) *PasswordChangeModal {
	focusIndex := 0
	if skipOldPassword {
		focusIndex = 1
	}

	return &PasswordChangeModal{
		focusIndex:      focusIndex,
		skipOldPassword: skipOldPassword,
		onConfirm:       onConfirm,
		onCancel:        onCancel,
	}
}

func (m *PasswordChangeModal) Type() ModalType {
	return ModalTypePasswordChange
}

func (m *PasswordChangeModal) HandleKey(msg tea.KeyMsg) (bool, Modal, tea.Cmd) {
	switch msg.String() {
	case "enter":
		return m.submit()

	case "esc":
		var cmd tea.Cmd
		if m.onCancel != nil {
			cmd = m.onCancel()
		}
		return true, nil, cmd

	case "tab", "down":
		m.cycleForward()
		return true, m, nil

	case "shift+tab", "up":
		m.cycleBackward()
		return true, m, nil

	case "backspace":
		m.deleteChar()
		return true, m, nil

	default:
		// Handle text input
		if msg.Type == tea.KeyRunes {
			m.addRunes(msg.Runes)
			return true, m, nil
		}
		return true, m, nil
	}
}

func (m *PasswordChangeModal) cycleForward() {
	m.focusIndex++
	start := 0
	if m.skipOldPassword {
		start = 1
	}
	if m.focusIndex > 2 {
		m.focusIndex = start
	}
}

func (m *PasswordChangeModal) cycleBackward() {
	m.focusIndex--
	start := 0
	if m.skipOldPassword {
		start = 1
	}
	if m.focusIndex < start {
		m.focusIndex = 2
	}
}

func (m *PasswordChangeModal) addRunes(runes []rune) {
	str := string(runes)
	switch m.focusIndex {
	case 0:
		if len(m.oldPassword) < 128 {
			m.oldPassword += str
		}
	case 1:
		if len(m.newPassword) < 128 {
			m.newPassword += str
		}
	case 2:
		if len(m.confirmPassword) < 128 {
			m.confirmPassword += str
		}
	}
}

func (m *PasswordChangeModal) deleteChar() {
	switch m.focusIndex {
	case 0:
		if len(m.oldPassword) > 0 {
			m.oldPassword = m.oldPassword[:len(m.oldPassword)-1]
		}
	case 1:
		if len(m.newPassword) > 0 {
			m.newPassword = m.newPassword[:len(m.newPassword)-1]
		}
	case 2:
		if len(m.confirmPassword) > 0 {
			m.confirmPassword = m.confirmPassword[:len(m.confirmPassword)-1]
		}
	}
}

func (m *PasswordChangeModal) submit() (bool, Modal, tea.Cmd) {
	// Validate
	if len(m.newPassword) < 8 {
		m.errorMessage = "Password must be at least 8 characters"
		return true, m, nil
	}

	if m.newPassword != m.confirmPassword {
		m.errorMessage = "Passwords do not match"
		return true, m, nil
	}

	var cmd tea.Cmd
	if m.onConfirm != nil {
		cmd = m.onConfirm(m.oldPassword, m.newPassword)
	}
	return true, nil, cmd
}

func (m *PasswordChangeModal) Render(width, height int) string {
	inputFocusedStyle := lipgloss.NewStyle().
		Border(lipgloss.RoundedBorder()).
		BorderForeground(lipgloss.Color("170")).
		Padding(0, 1)

	inputBlurredStyle := lipgloss.NewStyle().
		Border(lipgloss.RoundedBorder()).
		BorderForeground(lipgloss.Color("240")).
		Padding(0, 1)

	errorStyle := lipgloss.NewStyle().
		Foreground(lipgloss.Color("196")).
		Bold(true)

	mutedTextStyle := lipgloss.NewStyle().
		Foreground(lipgloss.Color("240"))

	boldStyle := lipgloss.NewStyle().Bold(true)

	title := "Change Password"
	if m.skipOldPassword {
		title = "Set Password (SSH Account)"
	}

	content := boldStyle.Render(title) + "\n\n"

	// Old password field (skip for SSH users)
	if !m.skipOldPassword {
		label := "Current Password:"
		fieldContent := ""
		for i := 0; i < len(m.oldPassword); i++ {
			fieldContent += "•"
		}
		if m.focusIndex == 0 {
			content += label + "\n" + inputFocusedStyle.Render(fieldContent) + "\n\n"
		} else {
			content += label + "\n" + inputBlurredStyle.Render(fieldContent) + "\n\n"
		}
	}

	// New password field
	newLabel := "New Password:"
	newFieldContent := ""
	for i := 0; i < len(m.newPassword); i++ {
		newFieldContent += "•"
	}
	if m.focusIndex == 1 {
		content += newLabel + "\n" + inputFocusedStyle.Render(newFieldContent) + "\n\n"
	} else {
		content += newLabel + "\n" + inputBlurredStyle.Render(newFieldContent) + "\n\n"
	}

	// Confirm password field
	confirmLabel := "Confirm Password:"
	confirmFieldContent := ""
	for i := 0; i < len(m.confirmPassword); i++ {
		confirmFieldContent += "•"
	}
	if m.focusIndex == 2 {
		content += confirmLabel + "\n" + inputFocusedStyle.Render(confirmFieldContent) + "\n\n"
	} else {
		content += confirmLabel + "\n" + inputBlurredStyle.Render(confirmFieldContent) + "\n\n"
	}

	// Error message
	if m.errorMessage != "" {
		content += errorStyle.Render(m.errorMessage) + "\n\n"
	}

	// Help text
	content += mutedTextStyle.Render("[Enter] Submit • [Esc] Cancel • [Tab] Next Field")

	modalStyle := lipgloss.NewStyle().
		Border(lipgloss.RoundedBorder()).
		BorderForeground(lipgloss.Color("205")).
		Padding(1, 2).
		Width(60)

	box := modalStyle.Render(content)
	return lipgloss.Place(width, height, lipgloss.Center, lipgloss.Center, box)
}

func (m *PasswordChangeModal) IsBlockingInput() bool {
	return true
}
