package modal

import (
	"strings"

	tea "github.com/charmbracelet/bubbletea"
	"github.com/charmbracelet/lipgloss"
	"github.com/aeolun/superchat/pkg/protocol"
)

// UnbanModal handles unbanning a user or IP
type UnbanModal struct {
	activeField  int // 0=type, 1=value
	banType      int // 0=user, 1=IP
	value        string
	errorMessage string
	onSubmitUser func(*protocol.UnbanUserMessage) tea.Cmd
	onSubmitIP   func(*protocol.UnbanIPMessage) tea.Cmd
}

// NewUnbanModal creates a new unban modal
func NewUnbanModal() *UnbanModal {
	return &UnbanModal{
		activeField: 0,
		banType:     0, // User by default
	}
}

// SetSubmitHandlers sets the callbacks for when the form is submitted
func (m *UnbanModal) SetSubmitHandlers(userHandler func(*protocol.UnbanUserMessage) tea.Cmd, ipHandler func(*protocol.UnbanIPMessage) tea.Cmd) {
	m.onSubmitUser = userHandler
	m.onSubmitIP = ipHandler
}

// Type returns the modal type
func (m *UnbanModal) Type() ModalType {
	return ModalUnban
}

// HandleKey processes keyboard input
func (m *UnbanModal) HandleKey(msg tea.KeyMsg) (bool, Modal, tea.Cmd) {
	switch msg.String() {
	case "esc":
		// Close modal and return to admin panel
		return true, nil, nil

	case "tab", "down":
		m.activeField = (m.activeField + 1) % 2
		m.errorMessage = ""
		return true, m, nil

	case "shift+tab", "up":
		m.activeField = (m.activeField - 1 + 2) % 2
		m.errorMessage = ""
		return true, m, nil

	case "enter", "ctrl+enter":
		if m.activeField == 0 {
			// Switch ban type
			m.banType = 1 - m.banType
			m.value = "" // Clear value when switching type
			return true, m, nil
		}
		return m.submit()

	case "left", "right":
		if m.activeField == 0 {
			m.banType = 1 - m.banType
			m.value = "" // Clear value when switching type
		}
		return true, m, nil

	case "backspace":
		if m.activeField == 1 && len(m.value) > 0 {
			m.value = m.value[:len(m.value)-1]
		}
		m.errorMessage = ""
		return true, m, nil

	default:
		// Type into value field
		if m.activeField == 1 && len(msg.String()) == 1 {
			if m.banType == 0 { // User nickname
				if len(m.value) < 20 {
					m.value += msg.String()
				}
			} else { // IP/CIDR
				char := msg.String()
				if (char >= "0" && char <= "9") || char == "." || char == "/" {
					if len(m.value) < 50 {
						m.value += char
					}
				}
			}
			m.errorMessage = ""
		}
		return true, m, nil
	}
}

func (m *UnbanModal) submit() (bool, Modal, tea.Cmd) {
	// Validate
	if strings.TrimSpace(m.value) == "" {
		if m.banType == 0 {
			m.errorMessage = "Nickname is required"
		} else {
			m.errorMessage = "IP address is required"
		}
		m.activeField = 1
		return true, m, nil
	}

	// Submit based on type and get the command
	var cmd tea.Cmd
	if m.banType == 0 {
		// Unban user
		msg := &protocol.UnbanUserMessage{
			Nickname: &m.value,
		}
		if m.onSubmitUser != nil {
			cmd = m.onSubmitUser(msg)
		}
	} else {
		// Unban IP
		msg := &protocol.UnbanIPMessage{
			IPCIDR: m.value,
		}
		if m.onSubmitIP != nil {
			cmd = m.onSubmitIP(msg)
		}
	}

	// Close modal and return the command to be executed
	return true, nil, cmd
}

// Render returns the modal content
func (m *UnbanModal) Render(width, height int) string {
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

	selectedStyle := lipgloss.NewStyle().
		Foreground(lipgloss.Color("15")).
		Background(lipgloss.Color("196")).
		Bold(true).
		Padding(0, 1)

	unselectedStyle := lipgloss.NewStyle().
		Foreground(lipgloss.Color("252")).
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

	// Build type selector
	var userButton, ipButton string
	if m.activeField == 0 {
		if m.banType == 0 {
			userButton = selectedStyle.Render("User")
			ipButton = unselectedStyle.Render("IP")
		} else {
			userButton = unselectedStyle.Render("User")
			ipButton = selectedStyle.Render("IP")
		}
	} else {
		userButton = unselectedStyle.Render("User")
		ipButton = unselectedStyle.Render("IP")
	}

	typeSelector := labelStyle.Render("Ban Type:")+"  "+userButton+"  "+ipButton

	// Build value field
	var valueField string
	var valueLabel string
	if m.banType == 0 {
		valueLabel = "Nickname:"
	} else {
		valueLabel = "IP/CIDR:"
	}

	if m.activeField == 1 {
		valueField = activeInputStyle.Render(m.value + "█")
	} else {
		valueField = inactiveInputStyle.Render(m.value)
	}

	// Build content
	title := titleStyle.Render("Remove Ban")

	form := lipgloss.JoinVertical(
		lipgloss.Left,
		typeSelector,
		hintStyle.Render("               ([←/→] Switch type)"),
		"",
		labelStyle.Render(valueLabel)+"  "+valueField,
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
		hintStyle.Render("[Tab] Next field  [Enter] Submit  [Esc] Cancel"),
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
func (m *UnbanModal) IsBlockingInput() bool {
	return true
}
