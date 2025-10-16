package modal

import (
	"fmt"
	"strings"

	tea "github.com/charmbracelet/bubbletea"
	"github.com/charmbracelet/lipgloss"
	"github.com/aeolun/superchat/pkg/protocol"
)

// DeleteChannelModal handles deleting a channel
type DeleteChannelModal struct {
	channels       []ChannelInfo
	allChannels    []ChannelInfo // Unfiltered list
	selectedIndex  int
	searchInput    string
	confirmText    string
	showingConfirm bool
	activeField    int // 0=search, 1=list
	errorMessage   string
	onSubmit       func(*protocol.DeleteChannelMessage) tea.Cmd
}

type ChannelInfo struct {
	ID   uint64
	Name string
}

// NewDeleteChannelModal creates a new delete channel modal
func NewDeleteChannelModal() *DeleteChannelModal {
	return &DeleteChannelModal{
		channels:       []ChannelInfo{}, // Will be populated externally
		allChannels:    []ChannelInfo{},
		selectedIndex:  0,
		showingConfirm: false,
		activeField:    0, // Start in search field
	}
}

// SetChannels sets the available channels to choose from
func (m *DeleteChannelModal) SetChannels(channels []ChannelInfo) {
	m.allChannels = channels
	m.channels = channels // Initially show all
	if len(channels) > 0 && m.selectedIndex >= len(channels) {
		m.selectedIndex = len(channels) - 1
	}
}

// filterChannels updates the displayed channel list based on search input
func (m *DeleteChannelModal) filterChannels() {
	if m.searchInput == "" {
		m.channels = m.allChannels
	} else {
		filtered := []ChannelInfo{}
		searchLower := strings.ToLower(m.searchInput)
		for _, ch := range m.allChannels {
			if strings.Contains(strings.ToLower(ch.Name), searchLower) {
				filtered = append(filtered, ch)
			}
		}
		m.channels = filtered
	}
	// Reset selection if out of bounds
	if m.selectedIndex >= len(m.channels) {
		m.selectedIndex = 0
	}
}

// SetSubmitHandler sets the callback for when the form is submitted
func (m *DeleteChannelModal) SetSubmitHandler(handler func(*protocol.DeleteChannelMessage) tea.Cmd) {
	m.onSubmit = handler
}

// Type returns the modal type
func (m *DeleteChannelModal) Type() ModalType {
	return ModalDeleteChannel
}

// HandleKey processes keyboard input
func (m *DeleteChannelModal) HandleKey(msg tea.KeyMsg) (bool, Modal, tea.Cmd) {
	if !m.showingConfirm {
		// Channel selection mode
		switch msg.String() {
		case "esc":
			// Cancel - close modal and return to admin panel
			return true, nil, nil

		case "tab":
			// Switch between search field and list
			m.activeField = 1 - m.activeField
			return true, m, nil

		case "up", "k":
			if m.activeField == 0 {
				// In search field, move to list
				m.activeField = 1
			} else {
				// In list, navigate up
				if m.selectedIndex > 0 {
					m.selectedIndex--
				}
			}
			return true, m, nil

		case "down", "j":
			if m.activeField == 0 {
				// In search field, move to list
				m.activeField = 1
			} else {
				// In list, navigate down
				if m.selectedIndex < len(m.channels)-1 {
					m.selectedIndex++
				}
			}
			return true, m, nil

		case "enter":
			if m.activeField == 0 && m.searchInput != "" {
				// In search field with text, move to list
				m.activeField = 1
			} else if len(m.channels) > 0 {
				// In list or empty search, show confirmation
				m.showingConfirm = true
			}
			return true, m, nil

		case "backspace":
			if m.activeField == 0 && len(m.searchInput) > 0 {
				m.searchInput = m.searchInput[:len(m.searchInput)-1]
				m.filterChannels()
			}
			return true, m, nil

		default:
			// Type into search field
			if m.activeField == 0 && len(msg.String()) == 1 && len(m.searchInput) < 50 {
				m.searchInput += msg.String()
				m.filterChannels()
			}
			return true, m, nil
		}
	} else {
		// Confirmation mode
		switch msg.String() {
		case "esc", "n":
			// Go back to channel selection
			m.showingConfirm = false
			m.confirmText = ""
			m.errorMessage = ""
			return true, m, nil

		case "enter", "y":
			// Check if user typed "DELETE"
			if m.confirmText == "DELETE" {
				return m.submit()
			}
			// If they just pressed enter without typing, show error
			if m.confirmText == "" {
				m.errorMessage = "Type DELETE to confirm"
			} else {
				m.errorMessage = "Must type exactly 'DELETE'"
			}
			return true, m, nil

		case "backspace":
			if len(m.confirmText) > 0 {
				m.confirmText = m.confirmText[:len(m.confirmText)-1]
			}
			m.errorMessage = ""
			return true, m, nil

		default:
			// Type confirmation text
			if len(msg.String()) == 1 && len(m.confirmText) < 10 {
				m.confirmText += msg.String()
				m.errorMessage = ""
			}
			return true, m, nil
		}
	}
}

func (m *DeleteChannelModal) submit() (bool, Modal, tea.Cmd) {
	if len(m.channels) == 0 || m.selectedIndex >= len(m.channels) {
		m.errorMessage = "No channel selected"
		return true, m, nil
	}

	// Create message
	msg := &protocol.DeleteChannelMessage{
		ChannelID: m.channels[m.selectedIndex].ID,
		Reason:    "Deleted by admin",
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
func (m *DeleteChannelModal) Render(width, height int) string {
	titleStyle := lipgloss.NewStyle().
		Bold(true).
		Foreground(lipgloss.Color("196")).
		MarginBottom(1)

	selectedStyle := lipgloss.NewStyle().
		Foreground(lipgloss.Color("15")).
		Background(lipgloss.Color("196")).
		Bold(true).
		Padding(0, 1)

	unselectedStyle := lipgloss.NewStyle().
		Foreground(lipgloss.Color("252")).
		Padding(0, 1)

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

	if !m.showingConfirm {
		// Channel selection view
		title := titleStyle.Render("Delete Channel - Select Channel")

		// Search field
		searchLabel := labelStyle.Render("Search:")
		var searchField string
		if m.activeField == 0 {
			searchField = activeInputStyle.Render(m.searchInput + "█")
		} else {
			searchField = labelStyle.Render(m.searchInput)
		}

		// Channel list
		var channelLines []string
		if len(m.channels) == 0 {
			if m.searchInput != "" {
				channelLines = append(channelLines, labelStyle.Render("No channels match your search"))
			} else {
				channelLines = append(channelLines, labelStyle.Render("No channels available"))
			}
		} else {
			// Show first 10 channels (or fewer if filtered list is smaller)
			maxDisplay := 10
			if len(m.channels) < maxDisplay {
				maxDisplay = len(m.channels)
			}
			for i := 0; i < maxDisplay; i++ {
				ch := m.channels[i]
				if i == m.selectedIndex && m.activeField == 1 {
					channelLines = append(channelLines, selectedStyle.Render(fmt.Sprintf("▸ %s", ch.Name)))
				} else {
					channelLines = append(channelLines, unselectedStyle.Render(fmt.Sprintf("  %s", ch.Name)))
				}
			}
			if len(m.channels) > maxDisplay {
				channelLines = append(channelLines, hintStyle.Render(fmt.Sprintf("  ... and %d more", len(m.channels)-maxDisplay)))
			}
		}

		// Result count
		resultCount := ""
		if m.searchInput != "" {
			resultCount = hintStyle.Render(fmt.Sprintf("(%d of %d channels)", len(m.channels), len(m.allChannels)))
		} else {
			resultCount = hintStyle.Render(fmt.Sprintf("(%d channels)", len(m.channels)))
		}

		content := lipgloss.JoinVertical(
			lipgloss.Left,
			title,
			"",
			searchLabel+"  "+searchField,
			resultCount,
			"",
			lipgloss.JoinVertical(lipgloss.Left, channelLines...),
			"",
			hintStyle.Render("[Tab] Switch field  [↑/↓] Navigate  [Enter] Select  [Esc] Cancel"),
		)

		modal := modalStyle.Render(content)
		return lipgloss.Place(width, height, lipgloss.Center, lipgloss.Center, modal)
	} else {
		// Confirmation view
		title := titleStyle.Render("⚠ DELETE CHANNEL ⚠")
		warning := warningStyle.Render("WARNING: This action is PERMANENT!")

		selectedChannel := ""
		if m.selectedIndex < len(m.channels) {
			selectedChannel = m.channels[m.selectedIndex].Name
		}

		description := labelStyle.Render(
			fmt.Sprintf("You are about to delete channel: %s\n\n", selectedChannel) +
				"This will:\n" +
				"  • Delete the channel permanently\n" +
				"  • Delete ALL messages in the channel\n" +
				"  • Delete all subchannels\n" +
				"  • Remove all subscriptions\n\n" +
				"Type DELETE to confirm:")

		confirmField := activeInputStyle.Render(m.confirmText + "█")

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
			confirmField,
			errorLine,
			"",
			hintStyle.Render("[Enter/Y] Confirm  [Esc/N] Cancel"),
		)

		modal := modalStyle.Render(content)
		return lipgloss.Place(width, height, lipgloss.Center, lipgloss.Center, modal)
	}
}

// IsBlockingInput returns true (this modal blocks all input)
func (m *DeleteChannelModal) IsBlockingInput() bool {
	return true
}
