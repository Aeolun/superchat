package modal

import (
	"fmt"
	"time"

	tea "github.com/charmbracelet/bubbletea"
	"github.com/charmbracelet/lipgloss"
)

// ListUsersModal displays the list of users with online status
type ListUsersModal struct {
	users         []UserEntry
	selectedIndex int
	showOffline   bool
	loading       bool
	errorMessage  string
	onRefresh     func(includeOffline bool) tea.Cmd
	onBanUser     func(nickname string)
	onDeleteUser  func(UserEntry)
}

type UserEntry struct {
	Nickname     string
	IsRegistered bool
	UserID       *uint64
	Online       bool
}

// NewListUsersModal creates a new list users modal
func NewListUsersModal() *ListUsersModal {
	return &ListUsersModal{
		users:         []UserEntry{},
		selectedIndex: 0,
		showOffline:   true, // Default to showing all users
		loading:       true, // Start in loading state
	}
}

// SetUsers sets the user list
func (m *ListUsersModal) SetUsers(users []UserEntry) {
	m.users = users
	m.loading = false
	if len(users) > 0 && m.selectedIndex >= len(users) {
		m.selectedIndex = len(users) - 1
	}
}

// SetRefreshHandler sets the callback for refreshing the user list
func (m *ListUsersModal) SetRefreshHandler(handler func(includeOffline bool) tea.Cmd) {
	m.onRefresh = handler
}

// SetBanUserHandler sets the callback for banning a user
func (m *ListUsersModal) SetBanUserHandler(handler func(nickname string)) {
	m.onBanUser = handler
}

// SetDeleteUserHandler sets the callback for deleting a user
func (m *ListUsersModal) SetDeleteUserHandler(handler func(UserEntry)) {
	m.onDeleteUser = handler
}

// Type returns the modal type
func (m *ListUsersModal) Type() ModalType {
	return ModalListUsers
}

// HandleKey processes keyboard input
func (m *ListUsersModal) HandleKey(msg tea.KeyMsg) (bool, Modal, tea.Cmd) {
	switch msg.String() {
	case "esc", "q":
		// Close modal and return to admin panel
		return true, nil, nil

	case "up", "k":
		if m.selectedIndex > 0 {
			m.selectedIndex--
		}
		return true, m, nil

	case "down", "j":
		if m.selectedIndex < len(m.users)-1 {
			m.selectedIndex++
		}
		return true, m, nil

	case "t":
		// Toggle show offline
		m.showOffline = !m.showOffline
		m.loading = true
		if m.onRefresh != nil {
			// Add small delay to make loading indicator visible
			return true, m, tea.Sequence(
				tea.Tick(50*time.Millisecond, func(t time.Time) tea.Msg { return nil }),
				m.onRefresh(m.showOffline),
			)
		}
		return true, m, nil

	case "r":
		// Refresh
		m.loading = true
		if m.onRefresh != nil {
			// Add small delay to make loading indicator visible
			return true, m, tea.Sequence(
				tea.Tick(50*time.Millisecond, func(t time.Time) tea.Msg { return nil }),
				m.onRefresh(m.showOffline),
			)
		}
		return true, m, nil

	case "b":
		// Ban selected user
		if len(m.users) > 0 && m.onBanUser != nil {
			selectedUser := m.users[m.selectedIndex]
			m.onBanUser(selectedUser.Nickname)
		}
		return true, m, nil

	case "d":
		// Delete selected user
		if len(m.users) > 0 && m.onDeleteUser != nil {
			selectedUser := m.users[m.selectedIndex]
			if selectedUser.IsRegistered {
				m.onDeleteUser(selectedUser)
			}
		}
		return true, m, nil

	default:
		return true, m, nil
	}
}

// Render returns the modal content
func (m *ListUsersModal) Render(width, height int) string {
	titleStyle := lipgloss.NewStyle().
		Bold(true).
		Foreground(lipgloss.Color("75")).
		MarginBottom(1)

	hintStyle := lipgloss.NewStyle().
		Foreground(lipgloss.Color("240")).
		Italic(true)

	onlineStyle := lipgloss.NewStyle().
		Foreground(lipgloss.Color("46")).
		Bold(true)

	offlineStyle := lipgloss.NewStyle().
		Foreground(lipgloss.Color("240"))

	anonStyle := lipgloss.NewStyle().
		Foreground(lipgloss.Color("208")).
		Italic(true)

	modalStyle := lipgloss.NewStyle().
		Border(lipgloss.RoundedBorder()).
		BorderForeground(lipgloss.Color("75")).
		Padding(1, 2).
		Width(80).
		Height(min(height-4, 30))

	// Count online/offline users
	var onlineCount, offlineCount, anonCount int
	for _, user := range m.users {
		if !user.IsRegistered {
			anonCount++
		} else if user.Online {
			onlineCount++
		} else {
			offlineCount++
		}
	}

	// Build title
	var title string
	if m.showOffline {
		title = titleStyle.Render(fmt.Sprintf("User List (Online: %d, Offline: %d, Anonymous: %d)",
			onlineCount, offlineCount, anonCount))
	} else {
		title = titleStyle.Render(fmt.Sprintf("User List (Online: %d, Anonymous: %d)",
			onlineCount, anonCount))
	}

	// Build user list
	var userLines []string
	if m.loading {
		userLines = append(userLines, hintStyle.Render("Loading..."))
	} else if len(m.users) == 0 {
		if m.showOffline {
			userLines = append(userLines, hintStyle.Render("No users found"))
		} else {
			userLines = append(userLines, hintStyle.Render("No online users (press T to show all)"))
		}
	} else {
		for i, user := range m.users {
			// Format user entry with status indicator
			var statusIndicator string
			var userStyle lipgloss.Style

			if !user.IsRegistered {
				// Anonymous user
				statusIndicator = anonStyle.Render("[anon]")
				userStyle = anonStyle
			} else if user.Online {
				// Online registered user
				statusIndicator = onlineStyle.Render("●")
				userStyle = lipgloss.NewStyle()
			} else {
				// Offline registered user
				statusIndicator = offlineStyle.Render("○")
				userStyle = offlineStyle
			}

			// Format with selection prefix (consistent with channel list)
			var prefix string
			if i == m.selectedIndex {
				prefix = "▶ "
			} else {
				prefix = "  "
			}

			line := fmt.Sprintf("%s%s %s", prefix, statusIndicator, user.Nickname)

			// Apply user-specific styling
			userLines = append(userLines, userStyle.Render(line))
		}
	}

	// Build footer hints
	var hints string
	if m.showOffline {
		hints = "[t] Hide offline  [r] Refresh  [b] Ban  [d] Delete  [↑/↓] Navigate  [Esc/q] Close"
	} else {
		hints = "[t] Show offline  [r] Refresh  [b] Ban  [d] Delete  [↑/↓] Navigate  [Esc/q] Close"
	}

	content := lipgloss.JoinVertical(
		lipgloss.Left,
		title,
		"",
		lipgloss.JoinVertical(lipgloss.Left, userLines...),
		"",
		hintStyle.Render(hints),
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
func (m *ListUsersModal) IsBlockingInput() bool {
	return true
}
