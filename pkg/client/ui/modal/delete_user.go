package modal

import (
	"strings"

	tea "github.com/charmbracelet/bubbletea"
	"github.com/charmbracelet/lipgloss"
	"github.com/aeolun/superchat/pkg/protocol"
)

// DeleteUserModal handles deleting a user
type DeleteUserModal struct {
	nickname     string
	errorMessage string
	onSubmit     func(*protocol.DeleteUserMessage) tea.Cmd
}

// NewDeleteUserModal creates a new delete user modal
func NewDeleteUserModal() *DeleteUserModal {
	return &DeleteUserModal{}
}

// SetSubmitHandler sets the callback for when the form is submitted
func (m *DeleteUserModal) SetSubmitHandler(handler func(*protocol.DeleteUserMessage) tea.Cmd) {
	m.onSubmit = handler
}

// SetNickname pre-fills the nickname field
func (m *DeleteUserModal) SetNickname(nickname string) {
	m.nickname = nickname
}

// Type returns the modal type
func (m *DeleteUserModal) Type() ModalType {
	return ModalDeleteUser
}

// HandleKey processes keyboard input
func (m *DeleteUserModal) HandleKey(msg tea.KeyMsg) (bool, Modal, tea.Cmd) {
	switch msg.String() {
	case "esc", "n":
		// Cancel - close modal and return to admin panel
		return true, nil, nil

	case "enter", "y":
		return m.submit()

	case "backspace":
		if len(m.nickname) > 0 {
			m.nickname = m.nickname[:len(m.nickname)-1]
		}
		m.errorMessage = ""
		return true, m, nil

	default:
		// Type nickname
		if len(msg.String()) == 1 && len(m.nickname) < 20 {
			m.nickname += msg.String()
			m.errorMessage = ""
		}
		return true, m, nil
	}
}

func (m *DeleteUserModal) submit() (bool, Modal, tea.Cmd) {
	// Validate
	if strings.TrimSpace(m.nickname) == "" {
		m.errorMessage = "Nickname is required"
		return true, m, nil
	}

	// Create message (we don't have user ID, server will look it up)
	// Note: We'll need to enhance this to work with user IDs from ban list
	// For now, this is a stub that assumes nickname lookup
	msg := &protocol.DeleteUserMessage{
		UserID: 0, // TODO: Server needs to support nickname-based deletion or we need user ID
	}

	// Call submit handler if set and get the command
	var cmd tea.Cmd
	if m.onSubmit != nil {
		cmd = m.onSubmit(msg)
	}

	// Close modal and return the command to be executed
	return true, nil, cmd
}

// Render returns the modal content
func (m *DeleteUserModal) Render(width, height int) string {
	titleStyle := lipgloss.NewStyle().
		Bold(true).
		Foreground(lipgloss.Color("196")).
		MarginBottom(1)

	warningStyle := lipgloss.NewStyle().
		Foreground(lipgloss.Color("208")).
		Bold(true)

	labelStyle := lipgloss.NewStyle().
		Foreground(lipgloss.Color("252"))

	activeInputStyle := lipgloss.NewStyle().
		Foreground(lipgloss.Color("15")).
		Background(lipgloss.Color("238")).
		Padding(0, 1)

	errorStyle := lipgloss.NewStyle().
		Foreground(lipgloss.Color("196")).
		Bold(true)

	hintStyle := lipgloss.NewStyle().
		Foreground(lipgloss.Color("240")).
		Italic(true)

	modalStyle := lipgloss.NewStyle().
		Border(lipgloss.RoundedBorder()).
		BorderForeground(lipgloss.Color("196")).
		Padding(1, 2).
		Width(70)

	// Build content
	title := titleStyle.Render("⚠ DELETE USER ⚠")

	warning := warningStyle.Render("WARNING: This action is PERMANENT!")

	description := labelStyle.Render(
		"This will:\n" +
			"  • Delete the user account\n" +
			"  • Anonymize all their messages (author_user_id → NULL)\n" +
			"  • Disconnect all active sessions\n" +
			"  • Delete SSH keys and bans")

	nicknameField := activeInputStyle.Render(m.nickname + "█")

	var errorLine string
	if m.errorMessage != "" {
		errorLine = "\n" + errorStyle.Render("✗ "+m.errorMessage)
	}

	content := lipgloss.JoinVertical(
		lipgloss.Left,
		title,
		"",
		warning,
		"",
		description,
		"",
		labelStyle.Render("Enter nickname to delete:"),
		nicknameField,
		errorLine,
		"",
		hintStyle.Render("[Enter/Y] Confirm  [Esc/N] Cancel"),
	)

	modal := modalStyle.Render(content)

	// Center the modal
	return lipgloss.Place(
		width,
		height,
		lipgloss.Center,
		lipgloss.Center,
		modal,
	)
}

// IsBlockingInput returns true (this modal blocks all input)
func (m *DeleteUserModal) IsBlockingInput() bool {
	return true
}
