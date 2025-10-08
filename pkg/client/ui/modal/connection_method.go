package modal

import (
	"fmt"
	"strings"

	tea "github.com/charmbracelet/bubbletea"
	"github.com/charmbracelet/lipgloss"
)

// ConnectionMethod represents a way to connect to the server
type ConnectionMethod string

const (
	MethodTCP       ConnectionMethod = "tcp"
	MethodSSH       ConnectionMethod = "ssh"
	MethodWebSocket ConnectionMethod = "websocket"
)

// ConnectionMethodSelectedMsg is sent when user selects a connection method
type ConnectionMethodSelectedMsg struct {
	Method ConnectionMethod
}

// ConnectionMethodCancelledMsg is sent when user cancels method selection
type ConnectionMethodCancelledMsg struct{}

// ConnectionMethodModal displays available connection methods when primary fails
type ConnectionMethodModal struct {
	server           string
	failedMethod     ConnectionMethod
	availableMethods []ConnectionMethod
	cursor           int
	errorMessage     string
}

// NewConnectionMethodModal creates a new connection method selector modal
func NewConnectionMethodModal(server string, failedMethod ConnectionMethod, errorMsg string) *ConnectionMethodModal {
	// Determine available methods based on what failed
	available := []ConnectionMethod{}
	
	switch failedMethod {
	case MethodTCP:
		// TCP failed, offer WebSocket and SSH
		available = append(available, MethodWebSocket, MethodSSH)
	case MethodSSH:
		// SSH failed, offer TCP and WebSocket
		available = append(available, MethodTCP, MethodWebSocket)
	case MethodWebSocket:
		// WebSocket failed, offer TCP and SSH
		available = append(available, MethodTCP, MethodSSH)
	default:
		// Unknown method failed, offer all
		available = append(available, MethodTCP, MethodWebSocket, MethodSSH)
	}
	
	return &ConnectionMethodModal{
		server:           server,
		failedMethod:     failedMethod,
		availableMethods: available,
		cursor:           0,
		errorMessage:     errorMsg,
	}
}

// Type returns the modal type
func (m *ConnectionMethodModal) Type() ModalType {
	return ModalConnectionMethod
}

// HandleKey processes keyboard input
func (m *ConnectionMethodModal) HandleKey(msg tea.KeyMsg) (bool, Modal, tea.Cmd) {
	switch msg.String() {
	case "up", "k":
		if m.cursor > 0 {
			m.cursor--
		}
		return true, m, nil

	case "down", "j":
		if m.cursor < len(m.availableMethods)-1 {
			m.cursor++
		}
		return true, m, nil

	case "enter":
		// User selected a method
		selected := m.availableMethods[m.cursor]
		return true, nil, func() tea.Msg {
			return ConnectionMethodSelectedMsg{Method: selected}
		}

	case "esc", "q":
		// User cancelled
		return true, nil, func() tea.Msg {
			return ConnectionMethodCancelledMsg{}
		}
	}

	return false, m, nil
}

// Render renders the modal
func (m *ConnectionMethodModal) Render(width, height int) string {
	// Styles
	titleStyle := lipgloss.NewStyle().
		Bold(true).
		Foreground(lipgloss.Color("#FF6B6B")).
		MarginBottom(1)

	serverStyle := lipgloss.NewStyle().
		Foreground(lipgloss.Color("240")).
		Italic(true)

	errorStyle := lipgloss.NewStyle().
		Foreground(lipgloss.Color("#FF6B6B")).
		MarginBottom(1)

	methodStyle := lipgloss.NewStyle().
		Padding(0, 2)

	selectedStyle := lipgloss.NewStyle().
		Foreground(lipgloss.Color("#7DAEA3")).
		Bold(true).
		Padding(0, 2)

	mutedTextStyle := lipgloss.NewStyle().
		Foreground(lipgloss.Color("240")).
		Italic(true)

	// Build content
	title := titleStyle.Render("Connection Failed")
	serverInfo := serverStyle.Render(fmt.Sprintf("Server: %s", m.server))
	
	var failedMethodName string
	switch m.failedMethod {
	case MethodTCP:
		failedMethodName = "TCP (binary protocol)"
	case MethodSSH:
		failedMethodName = "SSH"
	case MethodWebSocket:
		failedMethodName = "WebSocket"
	default:
		failedMethodName = string(m.failedMethod)
	}
	
	errorMsg := errorStyle.Render(fmt.Sprintf("Failed method: %s", failedMethodName))
	if m.errorMessage != "" {
		errorMsg += "\n" + errorStyle.Render(m.errorMessage)
	}

	prompt := lipgloss.NewStyle().MarginTop(1).MarginBottom(1).
		Render("Try an alternative connection method:")

	// Build method list
	var methodLines []string
	for i, method := range m.availableMethods {
		var methodName, methodDesc string
		switch method {
		case MethodTCP:
			methodName = "TCP (binary protocol)"
			methodDesc = "Standard connection on port 6465"
		case MethodSSH:
			methodName = "SSH"
			methodDesc = "Encrypted connection on port 6466 (requires keys)"
		case MethodWebSocket:
			methodName = "WebSocket"
			methodDesc = "HTTP-based connection on port 8080 (firewall-friendly)"
		}

		indicator := "  "
		style := methodStyle
		if i == m.cursor {
			indicator = "► "
			style = selectedStyle
		}

		line := indicator + style.Render(methodName)
		desc := mutedTextStyle.Render("  " + methodDesc)
		methodLines = append(methodLines, line, desc)
	}
	methodList := strings.Join(methodLines, "\n")

	footer := mutedTextStyle.Render("[↑/↓] Navigate  [Enter] Try  [Esc] Cancel")

	content := lipgloss.JoinVertical(
		lipgloss.Left,
		title,
		serverInfo,
		errorMsg,
		prompt,
		methodList,
		"",
		footer,
	)

	// Center the modal
	modalWidth := 70

	modalStyle := lipgloss.NewStyle().
		Border(lipgloss.RoundedBorder()).
		BorderForeground(lipgloss.Color("#FF6B6B")).
		Padding(1, 2).
		Width(modalWidth)

	modal := modalStyle.Render(content)

	return lipgloss.Place(width, height, lipgloss.Center, lipgloss.Center, modal)
}

// IsBlockingInput returns true since this modal blocks all input
func (m *ConnectionMethodModal) IsBlockingInput() bool {
	return true
}
