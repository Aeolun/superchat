package modal

import (
	"strconv"
	"strings"

	tea "github.com/charmbracelet/bubbletea"
	"github.com/charmbracelet/lipgloss"
	"github.com/aeolun/superchat/pkg/protocol"
)

// BanIPModal handles banning an IP address or CIDR range
type BanIPModal struct {
	activeField  int // 0=ip, 1=reason, 2=duration
	ipCIDR       string
	reason       string
	duration     string // Empty for permanent, or number of seconds
	errorMessage string
	onSubmit     func(*protocol.BanIPMessage) tea.Cmd
}

// NewBanIPModal creates a new ban IP modal
func NewBanIPModal() *BanIPModal {
	return &BanIPModal{
		activeField: 0,
		reason:      "Spam", // Default reason
		duration:    "",     // Permanent by default
	}
}

// SetSubmitHandler sets the callback for when the form is submitted
func (m *BanIPModal) SetSubmitHandler(handler func(*protocol.BanIPMessage) tea.Cmd) {
	m.onSubmit = handler
}

// Type returns the modal type
func (m *BanIPModal) Type() ModalType {
	return ModalBanIP
}

// HandleKey processes keyboard input
func (m *BanIPModal) HandleKey(msg tea.KeyMsg) (bool, Modal, tea.Cmd) {
	switch msg.String() {
	case "esc":
		// Close modal and return to admin panel
		return true, nil, nil

	case "tab", "down":
		m.activeField = (m.activeField + 1) % 3
		m.errorMessage = ""
		return true, m, nil

	case "shift+tab", "up":
		m.activeField = (m.activeField - 1 + 3) % 3
		m.errorMessage = ""
		return true, m, nil

	case "enter", "ctrl+enter":
		return m.submit()

	case "backspace":
		switch m.activeField {
		case 0: // IP/CIDR
			if len(m.ipCIDR) > 0 {
				m.ipCIDR = m.ipCIDR[:len(m.ipCIDR)-1]
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
			case 0: // IP/CIDR (allow digits, dots, slashes)
				char := msg.String()
				if (char >= "0" && char <= "9") || char == "." || char == "/" {
					if len(m.ipCIDR) < 50 {
						m.ipCIDR += char
					}
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

func (m *BanIPModal) submit() (bool, Modal, tea.Cmd) {
	// Validate
	if strings.TrimSpace(m.ipCIDR) == "" {
		m.errorMessage = "IP address or CIDR range is required"
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
	msg := &protocol.BanIPMessage{
		IPCIDR:          m.ipCIDR,
		Reason:          m.reason,
		DurationSeconds: durationSeconds,
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
func (m *BanIPModal) Render(width, height int) string {
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
	var ipField, reasonField, durationField string

	if m.activeField == 0 {
		ipField = activeInputStyle.Render(m.ipCIDR + "█")
	} else {
		ipField = inactiveInputStyle.Render(m.ipCIDR)
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

	// Build content
	title := titleStyle.Render("Ban IP Address")

	form := lipgloss.JoinVertical(
		lipgloss.Left,
		labelStyle.Render("IP/CIDR:")+"  "+ipField,
		hintStyle.Render("               (e.g., 192.168.1.1 or 10.0.0.0/24)"),
		"",
		labelStyle.Render("Reason:")+"  "+reasonField,
		"",
		labelStyle.Render("Duration:")+"  "+durationField,
		hintStyle.Render("               (seconds, leave empty for permanent)"),
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
func (m *BanIPModal) IsBlockingInput() bool {
	return true
}
