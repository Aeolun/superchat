package modal

import (
	"strings"

	tea "github.com/charmbracelet/bubbletea"
	"github.com/charmbracelet/lipgloss"
)

// HelpModal displays keyboard shortcuts
type HelpModal struct {
	helpContent [][]string // [key, description] pairs
}

// NewHelpModal creates a new help modal
func NewHelpModal(helpContent [][]string) *HelpModal {
	return &HelpModal{
		helpContent: helpContent,
	}
}

// Type returns the modal type
func (m *HelpModal) Type() ModalType {
	return ModalHelp
}

// HandleKey processes keyboard input
func (m *HelpModal) HandleKey(msg tea.KeyMsg) (bool, Modal, tea.Cmd) {
	switch msg.String() {
	case "h", "?", "esc":
		// Close help modal
		return true, nil, nil

	default:
		// Consume all other keys (don't let them fall through)
		return true, m, nil
	}
}

// Render returns the modal content
func (m *HelpModal) Render(width, height int) string {
	// Styles
	helpTitleStyle := lipgloss.NewStyle().
		Bold(true).
		Foreground(lipgloss.Color("205")).
		MarginBottom(1).
		Align(lipgloss.Center)

	helpKeyStyle := lipgloss.NewStyle().
		Foreground(lipgloss.Color("170")).
		Width(20)

	helpDescStyle := lipgloss.NewStyle().
		Foreground(lipgloss.Color("252"))

	mutedTextStyle := lipgloss.NewStyle().
		Foreground(lipgloss.Color("240")).
		Italic(true)

	modalStyle := lipgloss.NewStyle().
		Border(lipgloss.RoundedBorder()).
		BorderForeground(lipgloss.Color("205")).
		Padding(1, 2).
		Background(lipgloss.Color("235"))

	// Build content
	title := helpTitleStyle.Render("Keyboard Shortcuts")

	var lines []string
	for _, sc := range m.helpContent {
		line := helpKeyStyle.Render(sc[0]) + "  " + helpDescStyle.Render(sc[1])
		lines = append(lines, line)
	}

	content := lipgloss.JoinVertical(
		lipgloss.Left,
		title,
		"",
		strings.Join(lines, "\n"),
		"",
		mutedTextStyle.Render("[Press h or ? to close]"),
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
func (m *HelpModal) IsBlockingInput() bool {
	return true
}
