package modal

import (
	tea "github.com/charmbracelet/bubbletea"
	"github.com/charmbracelet/lipgloss"
)

// RegistrationWarningModal warns users about posting anonymously before their first post
type RegistrationWarningModal struct {
	onPostAnonymouslyDontAsk func() tea.Cmd // Post anonymously and don't ask again
	onPostAnonymouslyAskLater func() tea.Cmd // Post anonymously but ask again next session
	onRegisterFirst func() tea.Cmd // Go to registration flow
	onCancel func() tea.Cmd // Cancel posting
	selectedOption int // 0 = post (don't ask), 1 = post (ask later), 2 = register, 3 = cancel
}

// NewRegistrationWarningModal creates a new registration warning modal
func NewRegistrationWarningModal(
	onPostAnonymouslyDontAsk func() tea.Cmd,
	onPostAnonymouslyAskLater func() tea.Cmd,
	onRegisterFirst func() tea.Cmd,
	onCancel func() tea.Cmd,
) *RegistrationWarningModal {
	return &RegistrationWarningModal{
		onPostAnonymouslyDontAsk: onPostAnonymouslyDontAsk,
		onPostAnonymouslyAskLater: onPostAnonymouslyAskLater,
		onRegisterFirst: onRegisterFirst,
		onCancel: onCancel,
		selectedOption: 0, // Default to first option
	}
}

// Type returns the modal type
func (m *RegistrationWarningModal) Type() ModalType {
	return ModalRegistrationWarning
}

// HandleKey processes keyboard input
func (m *RegistrationWarningModal) HandleKey(msg tea.KeyMsg) (bool, Modal, tea.Cmd) {
	switch msg.String() {
	case "up", "k":
		if m.selectedOption > 0 {
			m.selectedOption--
		}
		return true, m, nil

	case "down", "j":
		if m.selectedOption < 3 {
			m.selectedOption++
		}
		return true, m, nil

	case "enter":
		var cmd tea.Cmd
		switch m.selectedOption {
		case 0:
			if m.onPostAnonymouslyDontAsk != nil {
				cmd = m.onPostAnonymouslyDontAsk()
			}
		case 1:
			if m.onPostAnonymouslyAskLater != nil {
				cmd = m.onPostAnonymouslyAskLater()
			}
		case 2:
			if m.onRegisterFirst != nil {
				cmd = m.onRegisterFirst()
			}
		case 3:
			if m.onCancel != nil {
				cmd = m.onCancel()
			}
		}
		return true, nil, cmd // Close modal

	case "esc":
		// Escape = cancel
		var cmd tea.Cmd
		if m.onCancel != nil {
			cmd = m.onCancel()
		}
		return true, nil, cmd

	case "1":
		// Shortcut: 1 = post anonymously (don't ask)
		var cmd tea.Cmd
		if m.onPostAnonymouslyDontAsk != nil {
			cmd = m.onPostAnonymouslyDontAsk()
		}
		return true, nil, cmd

	case "2":
		// Shortcut: 2 = post anonymously (ask later)
		var cmd tea.Cmd
		if m.onPostAnonymouslyAskLater != nil {
			cmd = m.onPostAnonymouslyAskLater()
		}
		return true, nil, cmd

	case "3":
		// Shortcut: 3 = register first
		var cmd tea.Cmd
		if m.onRegisterFirst != nil {
			cmd = m.onRegisterFirst()
		}
		return true, nil, cmd

	default:
		// Consume all other keys
		return true, m, nil
	}
}

// Render returns the modal content
func (m *RegistrationWarningModal) Render(width, height int) string {
	modalStyle := lipgloss.NewStyle().
		Border(lipgloss.RoundedBorder()).
		BorderForeground(lipgloss.Color("205")).
		Padding(1, 2)

	titleStyle := lipgloss.NewStyle().
		Bold(true).
		Foreground(lipgloss.Color("205"))

	selectedStyle := lipgloss.NewStyle().
		Foreground(lipgloss.Color("205")).
		Bold(true)

	unselectedStyle := lipgloss.NewStyle().
		Foreground(lipgloss.Color("240"))

	title := titleStyle.Render("Post Anonymously?")

	message := "You won't be able to edit or delete your post afterwards without\nregistering your nickname."

	// Build options
	options := []string{
		"Post Anonymously (don't ask again)",
		"Post Anonymously (ask later)",
		"Register First",
		"Cancel",
	}

	optionLines := []string{}
	for i, opt := range options {
		prefix := "  "
		if i == m.selectedOption {
			prefix = "> "
			optionLines = append(optionLines, selectedStyle.Render(prefix+opt))
		} else {
			optionLines = append(optionLines, unselectedStyle.Render(prefix+opt))
		}
	}

	help := lipgloss.NewStyle().
		Foreground(lipgloss.Color("240")).
		Render("\n[↑/↓] Navigate  [Enter] Select  [1-4] Quick select  [Esc] Cancel")

	content := title + "\n\n" + message + "\n\n" +
		lipgloss.JoinVertical(lipgloss.Left, optionLines...) +
		help

	modal := modalStyle.Render(content)

	// Center the modal
	return lipgloss.Place(width, height, lipgloss.Center, lipgloss.Center, modal)
}

// IsBlockingInput returns true (this modal blocks all input)
func (m *RegistrationWarningModal) IsBlockingInput() bool {
	return true
}
