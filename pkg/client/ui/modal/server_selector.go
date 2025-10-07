package modal

import (
	"fmt"
	"strings"

	"github.com/aeolun/superchat/pkg/protocol"
	tea "github.com/charmbracelet/bubbletea"
	"github.com/charmbracelet/lipgloss"
)

// ServerSelectedMsg is sent when user selects a server
type ServerSelectedMsg struct {
	Server protocol.ServerInfo
}

// ServerSelectorModal displays a list of available servers
type ServerSelectorModal struct {
	servers      []protocol.ServerInfo
	cursor       int
	loading      bool
	errorMessage string
}

// NewServerSelectorModal creates a new server selector modal
func NewServerSelectorModal(servers []protocol.ServerInfo) *ServerSelectorModal {
	return &ServerSelectorModal{
		servers: servers,
		cursor:  0,
		loading: false,
	}
}

// NewServerSelectorLoading creates a loading server selector modal
func NewServerSelectorLoading() *ServerSelectorModal {
	return &ServerSelectorModal{
		servers: []protocol.ServerInfo{},
		cursor:  0,
		loading: true,
	}
}

// SetServers updates the server list
func (m *ServerSelectorModal) SetServers(servers []protocol.ServerInfo) {
	m.servers = servers
	m.loading = false
	if m.cursor >= len(servers) && len(servers) > 0 {
		m.cursor = len(servers) - 1
	}
}

// SetError sets an error message
func (m *ServerSelectorModal) SetError(msg string) {
	m.errorMessage = msg
	m.loading = false
}

// Type returns the modal type
func (m *ServerSelectorModal) Type() ModalType {
	return ModalServerSelector
}

// HandleKey processes keyboard input
func (m *ServerSelectorModal) HandleKey(msg tea.KeyMsg) (bool, Modal, tea.Cmd) {
	// If loading, only allow escape
	if m.loading {
		switch msg.String() {
		case "esc", "q":
			return true, nil, nil
		default:
			return true, m, nil
		}
	}

	switch msg.String() {
	case "esc", "q":
		// Close modal
		return true, nil, nil

	case "up", "k":
		if m.cursor > 0 {
			m.cursor--
		}
		return true, m, nil

	case "down", "j":
		if m.cursor < len(m.servers)-1 {
			m.cursor++
		}
		return true, m, nil

	case "enter":
		// Select current server
		if m.cursor >= 0 && m.cursor < len(m.servers) {
			server := m.servers[m.cursor]
			return true, nil, func() tea.Msg {
				return ServerSelectedMsg{Server: server}
			}
		}
		return true, m, nil

	default:
		// Consume all other keys
		return true, m, nil
	}
}

// Render returns the modal content
func (m *ServerSelectorModal) Render(width, height int) string {
	// Styles
	titleStyle := lipgloss.NewStyle().
		Bold(true).
		Foreground(lipgloss.Color("205")).
		MarginBottom(1).
		Align(lipgloss.Center)

	serverNameStyle := lipgloss.NewStyle().
		Bold(true).
		Foreground(lipgloss.Color("170"))

	serverDescStyle := lipgloss.NewStyle().
		Foreground(lipgloss.Color("252"))

	serverStatsStyle := lipgloss.NewStyle().
		Foreground(lipgloss.Color("240")).
		Italic(true)

	selectedStyle := lipgloss.NewStyle().
		Background(lipgloss.Color("62")).
		Foreground(lipgloss.Color("230"))

	errorStyle := lipgloss.NewStyle().
		Foreground(lipgloss.Color("196")).
		Bold(true)

	mutedTextStyle := lipgloss.NewStyle().
		Foreground(lipgloss.Color("240")).
		Italic(true)

	modalStyle := lipgloss.NewStyle().
		Border(lipgloss.RoundedBorder()).
		BorderForeground(lipgloss.Color("205")).
		Padding(1, 2).
		Width(70)

	// Build content
	title := titleStyle.Render("Available Servers")

	var content string

	if m.loading {
		content = lipgloss.JoinVertical(
			lipgloss.Left,
			title,
			"",
			"Loading servers...",
			"",
			mutedTextStyle.Render("[Press ESC to close]"),
		)
	} else if m.errorMessage != "" {
		content = lipgloss.JoinVertical(
			lipgloss.Left,
			title,
			"",
			errorStyle.Render("Error: "+m.errorMessage),
			"",
			mutedTextStyle.Render("[Press ESC to close]"),
		)
	} else if len(m.servers) == 0 {
		content = lipgloss.JoinVertical(
			lipgloss.Left,
			title,
			"",
			mutedTextStyle.Render("No servers available"),
			"",
			mutedTextStyle.Render("[Press ESC to close]"),
		)
	} else {
		var lines []string
		for i, server := range m.servers {
			// Format server info
			name := serverNameStyle.Render(server.Name)
			desc := serverDescStyle.Render(server.Description)

			// Stats line
			stats := fmt.Sprintf("Users: %d", server.UserCount)
			if server.MaxUsers > 0 {
				stats = fmt.Sprintf("Users: %d/%d", server.UserCount, server.MaxUsers)
			}
			statsLine := serverStatsStyle.Render(stats)

			// Address line
			address := serverStatsStyle.Render(fmt.Sprintf("%s:%d", server.Hostname, server.Port))

			// Combine into server block
			serverBlock := fmt.Sprintf("%s\n%s\n%s • %s", name, desc, statsLine, address)

			// Highlight if selected
			if i == m.cursor {
				serverBlock = selectedStyle.Render(serverBlock)
			}

			lines = append(lines, serverBlock)
			if i < len(m.servers)-1 {
				lines = append(lines, "") // Add spacing between servers
			}
		}

		serverList := strings.Join(lines, "\n")

		content = lipgloss.JoinVertical(
			lipgloss.Left,
			title,
			"",
			serverList,
			"",
			mutedTextStyle.Render("[↑/↓ or j/k to navigate, Enter to connect, ESC to close]"),
		)
	}

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
func (m *ServerSelectorModal) IsBlockingInput() bool {
	return true
}
