package modal

import (
	"strconv"
	"strings"

	tea "github.com/charmbracelet/bubbletea"
	"github.com/charmbracelet/lipgloss"
	"github.com/aeolun/superchat/pkg/protocol"
)

// BanUserModal handles banning a user
type BanUserModal struct {
	activeField  int // 0=nickname, 1=reason, 2=duration, 3=shadowban
	nickname     string
	reason       string
	duration     string // Empty for permanent, or number of seconds
	shadowban    bool
	errorMessage string
	onSubmit     func(*protocol.BanUserMessage) tea.Cmd
}

// NewBanUserModal creates a new ban user modal
func NewBanUserModal() *BanUserModal {
	return &BanUserModal{
		activeField: 0,
		reason:      "Spam", // Default reason
		duration:    "",     // Permanent by default
		shadowban:   false,
	}
}

// SetSubmitHandler sets the callback for when the form is submitted
func (m *BanUserModal) SetSubmitHandler(handler func(*protocol.BanUserMessage) tea.Cmd) {
	m.onSubmit = handler
}

// SetNickname pre-fills the nickname field
func (m *BanUserModal) SetNickname(nickname string) {
	m.nickname = nickname
}

// Type returns the modal type
func (m *BanUserModal) Type() ModalType {
	return ModalBanUser
}

// HandleKey processes keyboard input
func (m *BanUserModal) HandleKey(msg tea.KeyMsg) (bool, Modal, tea.Cmd) {
	switch msg.String() {
	case "esc":
		// Close modal and return to admin panel
		return true, nil, nil

	case "tab", "down":
		m.activeField = (m.activeField + 1) % 4
		m.errorMessage = ""
		return true, m, nil

	case "shift+tab", "up":
		m.activeField = (m.activeField - 1 + 4) % 4
		m.errorMessage = ""
		return true, m, nil

	case "enter":
		if m.activeField == 3 { // On shadowban field, submit
			return m.submit()
		}
		// Otherwise, move to next field
		m.activeField = (m.activeField + 1) % 4
		return true, m, nil

	case "ctrl+enter":
		// Submit from any field
		return m.submit()

	case " ":
		if m.activeField == 3 { // Shadowban checkbox
			m.shadowban = !m.shadowban
			return true, m, nil
		}
		fallthrough

	case "backspace":
		switch m.activeField {
		case 0: // nickname
			if len(m.nickname) > 0 {
				m.nickname = m.nickname[:len(m.nickname)-1]
			}
		case 1: // reason
			if len(m.reason) > 0 {
				m.reason = m.reason[:len(m.reason)-1]
			}
		case 2: // duration
			if len(m.duration) > 0 {
				m.duration = m.duration[:len(m.duration)-1]
			}
		}
		m.errorMessage = ""
		return true, m, nil

	default:
		// Type into active field
		if len(msg.String()) == 1 {
			switch m.activeField {
			case 0: // nickname
				if len(m.nickname) < 20 {
					m.nickname += msg.String()
				}
			case 1: // reason
				if len(m.reason) < 200 {
					m.reason += msg.String()
				}
			case 2: // duration
				// Only allow digits
				if msg.String() >= "0" && msg.String() <= "9" {
					if len(m.duration) < 10 {
						m.duration += msg.String()
					}
				}
			}
			m.errorMessage = ""
		}
		return true, m, nil
	}
}

func (m *BanUserModal) submit() (bool, Modal, tea.Cmd) {
	// Validate
	if strings.TrimSpace(m.nickname) == "" {
		m.errorMessage = "Nickname is required"
		m.activeField = 0
		return true, m, nil
	}

	if strings.TrimSpace(m.reason) == "" {
		m.errorMessage = "Reason is required"
		m.activeField = 1
		return true, m, nil
	}

	// Parse duration
	var durationSeconds *uint64
	if m.duration != "" {
		seconds, err := strconv.ParseUint(m.duration, 10, 64)
		if err != nil {
			m.errorMessage = "Invalid duration (must be seconds)"
			m.activeField = 2
			return true, m, nil
		}
		durationSeconds = &seconds
	}

	// Create message
	nickname := m.nickname
	msg := &protocol.BanUserMessage{
		Nickname:        &nickname,
		Reason:          m.reason,
		DurationSeconds: durationSeconds,
		Shadowban:       m.shadowban,
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
func (m *BanUserModal) Render(width, height int) string {
	titleStyle := lipgloss.NewStyle().
		Bold(true).
		Foreground(lipgloss.Color("196")).
		MarginBottom(1)

	labelStyle := lipgloss.NewStyle().
		Foreground(lipgloss.Color("252")).
		Width(15)

	activeInputStyle := lipgloss.NewStyle().
		Foreground(lipgloss.Color("15")).
		Background(lipgloss.Color("238")).
		Padding(0, 1)

	inactiveInputStyle := lipgloss.NewStyle().
		Foreground(lipgloss.Color("245")).
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

	// Build form fields
	var nicknameField, reasonField, durationField, shadowbanField string

	if m.activeField == 0 {
		nicknameField = activeInputStyle.Render(m.nickname + "█")
	} else {
		nicknameField = inactiveInputStyle.Render(m.nickname)
	}

	if m.activeField == 1 {
		reasonField = activeInputStyle.Render(m.reason + "█")
	} else {
		reasonField = inactiveInputStyle.Render(m.reason)
	}

	if m.activeField == 2 {
		durationField = activeInputStyle.Render(m.duration + "█")
	} else {
		durationField = inactiveInputStyle.Render(m.duration)
	}

	checkbox := "[ ]"
	if m.shadowban {
		checkbox = "[✓]"
	}
	if m.activeField == 3 {
		shadowbanField = activeInputStyle.Render(checkbox + " Shadowban (messages hidden from others)")
	} else {
		shadowbanField = inactiveInputStyle.Render(checkbox + " Shadowban (messages hidden from others)")
	}

	// Build content
	title := titleStyle.Render("Ban User")

	form := lipgloss.JoinVertical(
		lipgloss.Left,
		labelStyle.Render("Nickname:")+"  "+nicknameField,
		"",
		labelStyle.Render("Reason:")+"  "+reasonField,
		"",
		labelStyle.Render("Duration:")+"  "+durationField,
		hintStyle.Render("               (seconds, leave empty for permanent)"),
		"",
		shadowbanField,
	)

	var errorLine string
	if m.errorMessage != "" {
		errorLine = "\n" + errorStyle.Render("✗ "+m.errorMessage) + "\n"
	}

	content := lipgloss.JoinVertical(
		lipgloss.Left,
		title,
		"",
		form,
		errorLine,
		hintStyle.Render("[Tab] Next field  [Ctrl+Enter] Submit  [Esc] Cancel"),
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
func (m *BanUserModal) IsBlockingInput() bool {
	return true
}
