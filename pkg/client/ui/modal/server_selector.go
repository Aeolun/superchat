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
	servers        []protocol.ServerInfo
	localServers   []protocol.ServerInfo // Servers saved locally (not from directory)
	cursor         int
	loading        bool
	errorMessage   string
	viewport       viewport.Model
	ready          bool
	isFirstLaunch  bool // Show welcoming message on first launch
	customInput    string
	showingCustomInput bool
	connectionType string // Connection type being used (tcp, ssh, websocket)
}

// NewServerSelectorModal creates a new server selector modal
func NewServerSelectorModal(servers []protocol.ServerInfo, localServers []protocol.ServerInfo, isFirstLaunch bool) *ServerSelectorModal {
	return &ServerSelectorModal{
		servers:       servers,
		localServers:  localServers,
		cursor:        0,
		loading:       false,
		isFirstLaunch: isFirstLaunch,
	}
}

// NewServerSelectorLoading creates a loading server selector modal
func NewServerSelectorLoading(isFirstLaunch bool, connectionType string) *ServerSelectorModal {
	return &ServerSelectorModal{
		servers:        []protocol.ServerInfo{},
		localServers:   []protocol.ServerInfo{},
		cursor:         0,
		loading:        true,
		isFirstLaunch:  isFirstLaunch,
		connectionType: connectionType,
	}
}

// SetServers updates the server list
func (m *ServerSelectorModal) SetServers(servers []protocol.ServerInfo) {
	m.servers = servers
	m.loading = false

	// Recalculate cursor position based on merged list
	totalServers := len(m.getMergedServers())
	if m.cursor >= totalServers && totalServers > 0 {
		m.cursor = totalServers - 1
	}
}

// getMergedServers returns directory servers + local servers + custom option
func (m *ServerSelectorModal) getMergedServers() []protocol.ServerInfo {
	merged := make([]protocol.ServerInfo, 0, len(m.servers)+len(m.localServers)+1)

	// Add directory servers
	merged = append(merged, m.servers...)

	// Add local servers (mark them as local by setting a flag in name)
	merged = append(merged, m.localServers...)

	// Add "Custom server" option at the end
	merged = append(merged, protocol.ServerInfo{
		Name:        "Enter custom server address",
		Description: "Connect to a server not listed above",
		Hostname:    "__custom__",
	})

	return merged
}

// isLocalServer checks if a server is from local list
func (m *ServerSelectorModal) isLocalServer(server protocol.ServerInfo) bool {
	for _, local := range m.localServers {
		if local.Hostname == server.Hostname && local.Port == server.Port {
			return true
		}
	}
	return false
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

// CustomServerInputMsg is sent when user finishes entering custom server
type CustomServerInputMsg struct {
	Address string
}

// HandleKey processes keyboard input
func (m *ServerSelectorModal) HandleKey(msg tea.KeyMsg) (bool, Modal, tea.Cmd) {
	// If showing custom input, handle text input
	if m.showingCustomInput {
		switch msg.String() {
		case "esc":
			// Cancel custom input
			m.showingCustomInput = false
			m.customInput = ""
			return true, m, nil
		case "enter":
			// Submit custom server address
			if m.customInput != "" {
				addr := m.customInput
				m.showingCustomInput = false
				m.customInput = ""
				return true, nil, func() tea.Msg {
					return CustomServerInputMsg{Address: addr}
				}
			}
			return true, m, nil
		case "backspace":
			if len(m.customInput) > 0 {
				m.customInput = m.customInput[:len(m.customInput)-1]
			}
			return true, m, nil
		default:
			// Add character to input
			if len(msg.String()) == 1 {
				m.customInput += msg.String()
			}
			return true, m, nil
		}
	}

	// If loading, allow escape or custom server input
	if m.loading {
		switch msg.String() {
		case "esc", "q":
			// User cancelled while loading
			return true, nil, func() tea.Msg {
				return ServerSelectorCancelledMsg{}
			}
		case "c":
			// User wants to enter custom server while loading
			m.showingCustomInput = true
			m.customInput = ""
			return true, m, nil
		default:
			return true, m, nil
		}
	}

	// If error state, allow custom server input
	if m.errorMessage != "" {
		switch msg.String() {
		case "esc", "q":
			return true, nil, func() tea.Msg {
				return ServerSelectorCancelledMsg{}
			}
		case "c":
			// User wants to enter custom server after error
			m.showingCustomInput = true
			m.customInput = ""
			return true, m, nil
		default:
			return true, m, nil
		}
	}

	mergedServers := m.getMergedServers()

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
		if m.cursor < len(mergedServers)-1 {
			m.cursor++
			// Scroll viewport if needed
			m.scrollToSelected()
		}
		return true, m, nil

	case "enter":
		// Select current server
		if m.cursor >= 0 && m.cursor < len(mergedServers) {
			server := mergedServers[m.cursor]

			// Check if custom server option
			if server.Hostname == "__custom__" {
				m.showingCustomInput = true
				m.customInput = ""
				return true, m, nil
			}

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
	var title string
	var discoveryInfo string

	if m.isFirstLaunch {
		title = titleStyle.Render("Welcome! Choose a server:")
		discoveryInfo = mutedTextStyle.Render("Servers announce themselves to the directory as they come online.\nYou can also connect to unlisted servers using the custom option.")
	} else {
		title = titleStyle.Render("Available Servers")
		discoveryInfo = mutedTextStyle.Render("Servers announce themselves to the directory as they come online")
	}

	var content string

	// Calculate available space for content
	titleHeight := lipgloss.Height(title)
	discoveryHeight := lipgloss.Height(discoveryInfo)
	footerText := mutedTextStyle.Render("[↑/↓ or j/k to navigate, Enter to connect, ESC to close]")
	footerHeight := lipgloss.Height(footerText)

	// Account for: title + discovery info + 1 line spacing + footer + 1 line spacing + padding + border
	availableHeight := height - titleHeight - discoveryHeight - footerHeight - 7

	var serverList string

	// If showing custom input, render input field
	if m.showingCustomInput {
		serverList = lipgloss.JoinVertical(lipgloss.Left,
			serverNameStyle.Render("Enter server address:"),
			"",
			fmt.Sprintf("> %s_", m.customInput),
			"",
			mutedTextStyle.Render("Format: hostname:port (default port: 6465)"),
			mutedTextStyle.Render("Example: chat.example.com:6465"),
		)
		footerText = mutedTextStyle.Render("[Enter to connect, ESC to cancel]")
	} else if m.loading {
		// Show loading + custom option available
		loadingMsg := "Loading servers from directory..."
		if m.connectionType != "" {
			// Map connection type to display format
			connTypeDisplay := m.connectionType
			switch m.connectionType {
			case "tcp":
				connTypeDisplay = "TCP"
			case "ssh":
				connTypeDisplay = "SSH"
			case "websocket":
				connTypeDisplay = "WebSocket"
			}
			loadingMsg = fmt.Sprintf("Loading servers from directory via %s...", connTypeDisplay)
		}
		serverList = lipgloss.JoinVertical(lipgloss.Left,
			loadingMsg,
			"",
			mutedTextStyle.Render("Or press 'c' to enter a custom server address"),
		)
		footerText = mutedTextStyle.Render("[c] Custom server  [ESC] Cancel")
	} else if m.errorMessage != "" {
		// Show error + custom option available
		serverList = lipgloss.JoinVertical(lipgloss.Left,
			errorStyle.Render("Could not load server list"),
			mutedTextStyle.Render("  "+m.errorMessage),
			"",
			mutedTextStyle.Render("You can still connect to a custom server"),
		)
		footerText = mutedTextStyle.Render("[c] Custom server  [ESC] Cancel")
	} else {
		mergedServers := m.getMergedServers()
		if len(mergedServers) == 0 {
			serverList = mutedTextStyle.Render("No servers available")
			footerText = mutedTextStyle.Render("[Press ESC to close]")
		} else {
			var lines []string
			for i, server := range mergedServers {
				// Indicator for selected item (matching SSH key manager)
				indicator := "  "
				if i == m.cursor {
					indicator = lipgloss.NewStyle().Foreground(primaryColor).Render("► ")
				}

				// Check if this is the custom option
				isCustom := server.Hostname == "__custom__"

				// Check if this is a local server
				isLocal := !isCustom && m.isLocalServer(server)

				// Format server info
				serverName := server.Name
				if isLocal {
					serverName = serverName + " (local)"
				}
				name := serverNameStyle.Render(serverName)
				desc := serverDescStyle.Render("  " + server.Description) // Indent description

				var serverInfo string
				if isCustom {
					// Custom option: simpler display
					serverInfo = lipgloss.JoinVertical(lipgloss.Left,
						name,
						desc,
					)
				} else {
					// Regular server: show stats and address
					stats := fmt.Sprintf("Users: %d", server.UserCount)
					if server.MaxUsers > 0 {
						stats = fmt.Sprintf("Users: %d/%d", server.UserCount, server.MaxUsers)
					}
					stats = fmt.Sprintf("%s • Channels: %d", stats, server.ChannelCount)
					statsLine := serverStatsStyle.Render(stats)

					// Address line
					address := serverStatsStyle.Render(fmt.Sprintf("%s:%d", server.Hostname, server.Port))

					// Combine into server block (with indicator on first line, subsequent lines indented)
					serverInfo = lipgloss.JoinVertical(lipgloss.Left,
						name,
						desc,
						serverStatsStyle.Render("  "+statsLine+" • "+address), // Indent stats line
					)
				}

				serverBlock := indicator + serverInfo

				lines = append(lines, serverBlock)
				if i < len(mergedServers)-1 {
					lines = append(lines, "") // Add spacing between servers
				}
			}

			serverList = strings.Join(lines, "\n")
		}
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
