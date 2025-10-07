package modal

import (
	"fmt"
	"strings"
	"time"

	tea "github.com/charmbracelet/bubbletea"
	"github.com/charmbracelet/lipgloss"
)

// PasswordAuthModal prompts for password authentication
type PasswordAuthModal struct {
	nickname         string
	passwordInput    []byte
	errorMessage     string
	cooldownUntil    time.Time
	isAuthenticating bool
	onConfirm        func(password []byte) tea.Cmd
	onCancel         func() tea.Cmd
}

// NewPasswordAuthModal creates a new password authentication modal
func NewPasswordAuthModal(
	nickname string,
	errorMessage string,
	cooldownUntil time.Time,
	isAuthenticating bool,
	onConfirm func([]byte) tea.Cmd,
	onCancel func() tea.Cmd,
) *PasswordAuthModal {
	return &PasswordAuthModal{
		nickname:         nickname,
		passwordInput:    []byte{},
		errorMessage:     errorMessage,
		cooldownUntil:    cooldownUntil,
		isAuthenticating: isAuthenticating,
		onConfirm:        onConfirm,
		onCancel:         onCancel,
	}
}

// Type returns the modal type
func (m *PasswordAuthModal) Type() ModalType {
	return ModalPasswordAuth
}

// HandleKey processes keyboard input
func (m *PasswordAuthModal) HandleKey(msg tea.KeyMsg) (bool, Modal, tea.Cmd) {
	switch msg.String() {
	case "enter":
		// Check if we're in cooldown
		if time.Now().Before(m.cooldownUntil) {
			return true, m, nil
		}

		// Validate password
		if len(m.passwordInput) == 0 {
			m.errorMessage = "Password cannot be empty"
			return true, m, nil
		}

		// Submit authentication
		var cmd tea.Cmd
		if m.onConfirm != nil {
			// Make a copy of the password before passing it
			passwordCopy := make([]byte, len(m.passwordInput))
			copy(passwordCopy, m.passwordInput)
			cmd = m.onConfirm(passwordCopy)
		}

		// Mark as authenticating (parent will replace modal or close it when done)
		m.isAuthenticating = true
		return true, m, cmd

	case "esc":
		// Cancel authentication - browse anonymously
		// Clear password from memory
		for i := range m.passwordInput {
			m.passwordInput[i] = 0
		}
		m.passwordInput = []byte{}

		var cmd tea.Cmd
		if m.onCancel != nil {
			cmd = m.onCancel()
		}
		return true, nil, cmd // Close modal

	case "backspace":
		if len(m.passwordInput) > 0 {
			m.passwordInput = m.passwordInput[:len(m.passwordInput)-1]
		}
		return true, m, nil

	default:
		// Don't accept input while authenticating
		if m.isAuthenticating {
			return true, m, nil
		}

		// Handle text input
		if msg.Type == tea.KeyRunes {
			m.passwordInput = append(m.passwordInput, []byte(string(msg.Runes))...)
			return true, m, nil
		}

		// Consume all other keys
		return true, m, nil
	}
}

// Render returns the modal content
func (m *PasswordAuthModal) Render(width, height int) string {
	primaryColor := lipgloss.Color("205")
	mutedColor := lipgloss.Color("240")
	errorColor := lipgloss.Color("196")
	warningColor := lipgloss.Color("214")

	title := lipgloss.NewStyle().
		Bold(true).
		Foreground(primaryColor).
		Align(lipgloss.Left).
		MarginBottom(1).
		Render(fmt.Sprintf("🔐 Authenticate as '%s'", m.nickname))

	prompt := lipgloss.NewStyle().
		Foreground(lipgloss.Color("252")).
		Align(lipgloss.Left).
		MarginBottom(1).
		Render("This nickname is registered. Enter password:")

	// Password input (hidden) - fixed width
	inputFocusedStyle := lipgloss.NewStyle().
		Border(lipgloss.RoundedBorder()).
		BorderForeground(lipgloss.Color("170")).
		Padding(0, 1).
		Width(40)

	passwordDisplay := strings.Repeat("•", len(m.passwordInput))
	if !m.isAuthenticating {
		passwordDisplay += "█" // Cursor
	}
	passwordField := inputFocusedStyle.Render(passwordDisplay)

	// Error message if auth failed
	var errorMsg string
	if m.errorMessage != "" {
		errorMsg = "\n" + lipgloss.NewStyle().
			Foreground(errorColor).
			Align(lipgloss.Left).
			Render(m.errorMessage)
	}

	// Cooldown message if rate limited
	var cooldownMsg string
	if time.Now().Before(m.cooldownUntil) {
		remaining := int(time.Until(m.cooldownUntil).Seconds()) + 1
		cooldownMsg = "\n" + lipgloss.NewStyle().
			Foreground(warningColor).
			Align(lipgloss.Left).
			Render(fmt.Sprintf("⏳ Please wait %d seconds before trying again", remaining))
	}

	// Status message
	var statusMsg string
	if m.isAuthenticating {
		statusMsg = lipgloss.NewStyle().
			Foreground(mutedColor).
			Align(lipgloss.Left).
			MarginTop(1).
			Render("Authenticating...")
	} else {
		statusMsg = lipgloss.NewStyle().
			Foreground(mutedColor).
			Align(lipgloss.Left).
			MarginTop(1).
			Render("[Enter] Authenticate  [ESC] Browse anonymously")
	}

	content := lipgloss.JoinVertical(
		lipgloss.Left,
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

	return lipgloss.Place(width, height, lipgloss.Center, lipgloss.Center, modal)
}

// IsBlockingInput returns true (this modal blocks all input)
func (m *PasswordAuthModal) IsBlockingInput() bool {
	return true
}
