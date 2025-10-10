package modal

import (
	"fmt"
	"strings"

	tea "github.com/charmbracelet/bubbletea"
	"github.com/charmbracelet/lipgloss"
)

// RegistrationModal allows users to register their nickname with a password
type RegistrationModal struct {
	nickname         string
	passwordInput    []byte
	confirmInput     []byte
	focusedField     int // 0 = password, 1 = confirm
	errorMessage     string
	onConfirm        func(password []byte) tea.Cmd
	onCancel         func() tea.Cmd
}

// NewRegistrationModal creates a new registration modal
func NewRegistrationModal(nickname string, onConfirm func([]byte) tea.Cmd, onCancel func() tea.Cmd) *RegistrationModal {
	return &RegistrationModal{
		nickname:      nickname,
		passwordInput: []byte{},
		confirmInput:  []byte{},
		focusedField:  0,
		errorMessage:  "",
		onConfirm:     onConfirm,
		onCancel:      onCancel,
	}
}

// Type returns the modal type
func (m *RegistrationModal) Type() ModalType {
	return ModalRegistration
}

// HandleKey processes keyboard input
func (m *RegistrationModal) HandleKey(msg tea.KeyMsg) (bool, Modal, tea.Cmd) {
	switch msg.String() {
	case "tab":
		// Switch between password and confirm fields
		if m.focusedField == 0 {
			m.focusedField = 1
		} else {
			m.focusedField = 0
		}
		return true, m, nil

	case "enter":
		// Validate password length
		if len(m.passwordInput) < 8 {
			m.errorMessage = "Password must be at least 8 characters"
			return true, m, nil
		}

		// Validate passwords match
		if string(m.passwordInput) != string(m.confirmInput) {
			m.errorMessage = "Passwords do not match"
			return true, m, nil
		}

		// Submit registration
		var cmd tea.Cmd
		if m.onConfirm != nil {
			// Make a copy of the password before passing it
			passwordCopy := make([]byte, len(m.passwordInput))
			copy(passwordCopy, m.passwordInput)
			cmd = m.onConfirm(passwordCopy)
		}

		// Clear passwords from memory
		for i := range m.passwordInput {
			m.passwordInput[i] = 0
		}
		for i := range m.confirmInput {
			m.confirmInput[i] = 0
		}

		return true, nil, cmd // Close modal

	case "esc":
		// Cancel registration
		// Clear passwords from memory
		for i := range m.passwordInput {
			m.passwordInput[i] = 0
		}
		for i := range m.confirmInput {
			m.confirmInput[i] = 0
		}
		m.passwordInput = []byte{}
		m.confirmInput = []byte{}

		var cmd tea.Cmd
		if m.onCancel != nil {
			cmd = m.onCancel()
		}
		return true, nil, cmd // Close modal

	case "backspace":
		if m.focusedField == 0 {
			if len(m.passwordInput) > 0 {
				m.passwordInput = m.passwordInput[:len(m.passwordInput)-1]
			}
		} else {
			if len(m.confirmInput) > 0 {
				m.confirmInput = m.confirmInput[:len(m.confirmInput)-1]
			}
		}
		return true, m, nil

	default:
		// Handle text input
		if msg.Type == tea.KeyRunes {
			if m.focusedField == 0 {
				m.passwordInput = append(m.passwordInput, []byte(string(msg.Runes))...)
			} else {
				m.confirmInput = append(m.confirmInput, []byte(string(msg.Runes))...)
			}
			return true, m, nil
		}

		// Consume all other keys
		return true, m, nil
	}
}

// Render returns the modal content
func (m *RegistrationModal) Render(width, height int) string {
	primaryColor := lipgloss.Color("205")
	mutedColor := lipgloss.Color("240")
	errorColor := lipgloss.Color("196")

	title := lipgloss.NewStyle().
		Bold(true).
		Foreground(primaryColor).
		Align(lipgloss.Center).
		MarginBottom(1).
		Render(fmt.Sprintf("📝 Register '%s'", m.nickname))

	prompt := lipgloss.NewStyle().
		Foreground(lipgloss.Color("252")).
		Align(lipgloss.Center).
		Render("Choose a password:")

	// Helper text for password requirements
	helperText := lipgloss.NewStyle().
		Foreground(mutedColor).
		Align(lipgloss.Center).
		MarginBottom(1).
		Render("Minimum 8 characters")

	inputFocusedStyle := lipgloss.NewStyle().
		Border(lipgloss.RoundedBorder()).
		BorderForeground(lipgloss.Color("170")).
		Padding(0, 1)

	inputBlurredStyle := lipgloss.NewStyle().
		Border(lipgloss.RoundedBorder()).
		BorderForeground(lipgloss.Color("240")).
		Padding(0, 1)

	// Password input (hidden)
	passwordDisplay := strings.Repeat("•", len(m.passwordInput))
	if m.focusedField == 0 {
		passwordDisplay += "█" // Cursor on password field
	}
	var passwordStyle lipgloss.Style
	if m.focusedField == 0 {
		passwordStyle = inputFocusedStyle
	} else {
		passwordStyle = inputBlurredStyle
	}
	passwordField := passwordStyle.Render("Password: " + passwordDisplay)

	// Confirm password input (hidden)
	confirmDisplay := strings.Repeat("•", len(m.confirmInput))
	if m.focusedField == 1 {
		confirmDisplay += "█" // Cursor on confirm field
	}
	var confirmStyle lipgloss.Style
	if m.focusedField == 1 {
		confirmStyle = inputFocusedStyle
	} else {
		confirmStyle = inputBlurredStyle
	}
	confirmField := confirmStyle.Render("Confirm:  " + confirmDisplay)

	// Error message if registration failed
	var errorMsg string
	if m.errorMessage != "" {
		errorMsg = "\n" + lipgloss.NewStyle().
			Foreground(errorColor).
			Align(lipgloss.Center).
			Render(m.errorMessage)
	}

	// Character count for password
	charCountText := fmt.Sprintf("Characters: %d (min 8)", len(m.passwordInput))
	charCount := lipgloss.NewStyle().
		Foreground(mutedColor).
		Align(lipgloss.Center).
		MarginTop(1).
		Render(charCountText)

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
		helperText,
		passwordField,
		confirmField,
		charCount,
		errorMsg,
		statusMsg,
		"",
	)

	modal := lipgloss.NewStyle().
		Border(lipgloss.RoundedBorder()).
		BorderForeground(primaryColor).
		Padding(1, 3).
		Width(60).
		Render(content)

	return lipgloss.Place(width, height, lipgloss.Center, lipgloss.Center, modal)
}

// IsBlockingInput returns true (this modal blocks all input)
func (m *RegistrationModal) IsBlockingInput() bool {
	return true
}
