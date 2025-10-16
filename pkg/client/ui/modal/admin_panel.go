package modal

import (
	"fmt"

	tea "github.com/charmbracelet/bubbletea"
	"github.com/charmbracelet/lipgloss"
)

// AdminPanelModal is the main admin panel hub
type AdminPanelModal struct {
	selectedIndex int
	menuItems     []adminMenuItem
}

type adminMenuItem struct {
	label       string
	description string
	action      func() (Modal, tea.Cmd) // Returns the modal to open and optional command
}

// NewAdminPanelModal creates a new admin panel modal
func NewAdminPanelModal() *AdminPanelModal {
	return &AdminPanelModal{
		selectedIndex: 0,
		// Menu items will be set by SetMenuActions
	}
}

// SetMenuActions sets the action functions for each menu item
func (m *AdminPanelModal) SetMenuActions(
	banUserAction func() (Modal, tea.Cmd),
	banIPAction func() (Modal, tea.Cmd),
	listUsersAction func() (Modal, tea.Cmd),
	unbanAction func() (Modal, tea.Cmd),
	viewBansAction func() (Modal, tea.Cmd),
	deleteUserAction func() (Modal, tea.Cmd),
	deleteChannelAction func() (Modal, tea.Cmd),
) {
	m.menuItems = []adminMenuItem{
		{
			label:       "Ban User",
			description: "Ban a user by nickname",
			action:      banUserAction,
		},
		{
			label:       "Ban IP Address",
			description: "Ban an IP address or CIDR range",
			action:      banIPAction,
		},
		{
			label:       "List Users",
			description: "View all users with online status",
			action:      listUsersAction,
		},
		{
			label:       "Unban User/IP",
			description: "Remove a ban from user or IP",
			action:      unbanAction,
		},
		{
			label:       "View Ban List",
			description: "View all active and expired bans",
			action:      viewBansAction,
		},
		{
			label:       "Delete User",
			description: "Permanently delete a user account",
			action:      deleteUserAction,
		},
		{
			label:       "Delete Channel",
			description: "Permanently delete a channel",
			action:      deleteChannelAction,
		},
	}
}

// Type returns the modal type
func (m *AdminPanelModal) Type() ModalType {
	return ModalAdminPanel
}

// HandleKey processes keyboard input
func (m *AdminPanelModal) HandleKey(msg tea.KeyMsg) (bool, Modal, tea.Cmd) {
	switch msg.String() {
	case "up", "k":
		if m.selectedIndex > 0 {
			m.selectedIndex--
		}
		return true, m, nil

	case "down", "j":
		if m.selectedIndex < len(m.menuItems)-1 {
			m.selectedIndex++
		}
		return true, m, nil

	case "enter":
		// Open the selected action's modal
		if m.selectedIndex < len(m.menuItems) {
			newModal, modalCmd := m.menuItems[m.selectedIndex].action()
			// Return a command that pushes the modal onto the stack
			// This ensures the admin panel stays on the stack and the sub-modal overlays it
			pushCmd := func() tea.Msg {
				return PushModalMsg{
					Modal: newModal,
					Cmd:   modalCmd,
				}
			}
			return true, m, pushCmd
		}
		return true, m, nil

	case "esc", "q", "a":
		// Close admin panel
		return true, nil, nil

	default:
		// Consume all other keys
		return true, m, nil
	}
}

// Render returns the modal content
func (m *AdminPanelModal) Render(width, height int) string {
	titleStyle := lipgloss.NewStyle().
		Bold(true).
		Foreground(lipgloss.Color("196")). // Red for admin
		MarginBottom(1).
		Align(lipgloss.Center)

	selectedStyle := lipgloss.NewStyle().
		Foreground(lipgloss.Color("15")).
		Background(lipgloss.Color("196")).
		Bold(true).
		Padding(0, 1)

	unselectedStyle := lipgloss.NewStyle().
		Foreground(lipgloss.Color("252")).
		Padding(0, 1)

	descStyle := lipgloss.NewStyle().
		Foreground(lipgloss.Color("240")).
		Italic(true).
		MarginLeft(3)

	mutedTextStyle := lipgloss.NewStyle().
		Foreground(lipgloss.Color("240")).
		Italic(true)

	modalStyle := lipgloss.NewStyle().
		Border(lipgloss.RoundedBorder()).
		BorderForeground(lipgloss.Color("196")).
		Padding(1, 2).
		Width(60)

	// Build content
	title := titleStyle.Render("⚠ ADMIN PANEL ⚠")

	var menuLines []string
	for i, item := range m.menuItems {
		var line string
		if i == m.selectedIndex {
			line = selectedStyle.Render(fmt.Sprintf("▸ %s", item.label))
		} else {
			line = unselectedStyle.Render(fmt.Sprintf("  %s", item.label))
		}
		menuLines = append(menuLines, line)
		menuLines = append(menuLines, descStyle.Render(item.description))
		if i < len(m.menuItems)-1 {
			menuLines = append(menuLines, "") // Spacing between items
		}
	}

	content := lipgloss.JoinVertical(
		lipgloss.Left,
		title,
		"",
		lipgloss.JoinVertical(lipgloss.Left, menuLines...),
		"",
		mutedTextStyle.Render("[↑/↓] Navigate  [Enter] Select  [Esc/q/a] Close"),
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
func (m *AdminPanelModal) IsBlockingInput() bool {
	return true
}
