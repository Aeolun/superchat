package modal

import (
	"fmt"
	"strings"

	"github.com/aeolun/superchat/pkg/protocol"
	"github.com/charmbracelet/bubbles/viewport"
	tea "github.com/charmbracelet/bubbletea"
	"github.com/charmbracelet/lipgloss"
)

// ServerSelectedMsg is sent when user selects a server
type ServerSelectedMsg struct {
	Server protocol.ServerInfo
}

// ServerSelectorCancelledMsg is sent when user cancels server selection
type ServerSelectorCancelledMsg struct{}

// ServerSelectorModal displays a list of available servers
type ServerSelectorModal struct {
	servers      []protocol.ServerInfo
	cursor       int
	loading      bool
	errorMessage string
	viewport     viewport.Model
	ready        bool
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
			// User cancelled while loading
			return true, nil, func() tea.Msg {
				return ServerSelectorCancelledMsg{}
			}
		default:
			return true, m, nil
		}
	}

	switch msg.String() {
	case "esc", "q":
		// User cancelled server selection
		return true, nil, func() tea.Msg {
			return ServerSelectorCancelledMsg{}
		}

	case "up", "k":
		if m.cursor > 0 {
			m.cursor--
			// Scroll viewport if needed
			m.scrollToSelected()
		}
		return true, m, nil

	case "down", "j":
		if m.cursor < len(m.servers)-1 {
			m.cursor++
			// Scroll viewport if needed
			m.scrollToSelected()
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
	// Styles (matching SSH key manager modal)
	primaryColor := lipgloss.Color("#00D0D0")

	titleStyle := lipgloss.NewStyle().
		Bold(true).
		Foreground(primaryColor).
		MarginBottom(1).
		Align(lipgloss.Center)

	serverNameStyle := lipgloss.NewStyle().
		Bold(true)

	serverDescStyle := lipgloss.NewStyle().
		Foreground(lipgloss.Color("252"))

	serverStatsStyle := lipgloss.NewStyle().
		Foreground(lipgloss.Color("240")).
		Italic(true)

	errorStyle := lipgloss.NewStyle().
		Foreground(lipgloss.Color("#FF6B6B")).
		Bold(true)

	mutedTextStyle := lipgloss.NewStyle().
		Foreground(lipgloss.Color("240")).
		Italic(true)

	// Build content
	title := titleStyle.Render("Available Servers")

	// Add explanation about server discovery
	discoveryInfo := mutedTextStyle.Render("Servers announce themselves to the directory as they come online")

	var content string

	// Calculate available space for content
	titleHeight := lipgloss.Height(title)
	discoveryHeight := lipgloss.Height(discoveryInfo)
	footerText := mutedTextStyle.Render("[↑/↓ or j/k to navigate, Enter to connect, ESC to close]")
	footerHeight := lipgloss.Height(footerText)

	// Account for: title + discovery info + 1 line spacing + footer + 1 line spacing + padding + border
	availableHeight := height - titleHeight - discoveryHeight - footerHeight - 7

	var serverList string
	if m.loading {
		serverList = "Loading servers..."
		footerText = mutedTextStyle.Render("[Press ESC to close]")
	} else if m.errorMessage != "" {
		serverList = errorStyle.Render("Error: " + m.errorMessage)
		footerText = mutedTextStyle.Render("[Press ESC to close]")
	} else if len(m.servers) == 0 {
		serverList = mutedTextStyle.Render("No servers available")
		footerText = mutedTextStyle.Render("[Press ESC to close]")
	} else {
		var lines []string
		for i, server := range m.servers {
			// Indicator for selected item (matching SSH key manager)
			indicator := "  "
			if i == m.cursor {
				indicator = lipgloss.NewStyle().Foreground(primaryColor).Render("► ")
			}

			// Format server info
			name := serverNameStyle.Render(server.Name)
			desc := serverDescStyle.Render("  " + server.Description) // Indent description

			// Stats line
			stats := fmt.Sprintf("Users: %d", server.UserCount)
			if server.MaxUsers > 0 {
				stats = fmt.Sprintf("Users: %d/%d", server.UserCount, server.MaxUsers)
			}
			stats = fmt.Sprintf("%s • Channels: %d", stats, server.ChannelCount)
			statsLine := serverStatsStyle.Render(stats)

			// Address line
			address := serverStatsStyle.Render(fmt.Sprintf("%s:%d", server.Hostname, server.Port))

			// Combine into server block (with indicator on first line, subsequent lines indented)
			serverInfo := lipgloss.JoinVertical(lipgloss.Left,
				name,
				desc,
				serverStatsStyle.Render("  "+statsLine+" • "+address), // Indent stats line
			)

			serverBlock := indicator + serverInfo

			lines = append(lines, serverBlock)
			if i < len(m.servers)-1 {
				lines = append(lines, "") // Add spacing between servers
			}
		}

		serverList = strings.Join(lines, "\n")
	}

	// Initialize or update viewport
	if !m.ready {
		m.viewport = viewport.New(66, availableHeight) // Width accounts for modal padding
		m.viewport.SetContent(serverList)
		m.ready = true
	} else {
		m.viewport.Width = 66
		m.viewport.Height = availableHeight
		m.viewport.SetContent(serverList)
	}

	content = lipgloss.JoinVertical(
		lipgloss.Left,
		title,
		discoveryInfo,
		"", // Blank line for spacing
		m.viewport.View(),
		footerText,
	)

	// Apply modal styling with reduced horizontal padding
	modalStyleWithPadding := lipgloss.NewStyle().
		Border(lipgloss.RoundedBorder()).
		BorderForeground(primaryColor).
		Padding(1, 1) // Reduced from (1, 2) to match SSH key manager

	modal := modalStyleWithPadding.Render(content)

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

// scrollToSelected scrolls the viewport to keep the selected server visible
func (m *ServerSelectorModal) scrollToSelected() {
	if !m.ready || len(m.servers) == 0 {
		return
	}

	// Each server takes 4 lines (name + desc + stats + blank line spacing)
	lineHeight := 4
	selectedLine := m.cursor * lineHeight

	// Scroll viewport to show selected item
	if selectedLine < m.viewport.YOffset {
		// Selected item is above viewport, scroll up
		m.viewport.SetYOffset(selectedLine)
	} else if selectedLine+lineHeight > m.viewport.YOffset+m.viewport.Height {
		// Selected item is below viewport, scroll down
		m.viewport.SetYOffset(selectedLine + lineHeight - m.viewport.Height)
	}
}
