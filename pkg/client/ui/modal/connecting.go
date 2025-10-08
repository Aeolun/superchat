package modal

import (
	"github.com/charmbracelet/bubbles/spinner"
	tea "github.com/charmbracelet/bubbletea"
	"github.com/charmbracelet/lipgloss"
)

// ConnectingModal displays a connecting message with spinner
type ConnectingModal struct {
	method  string
	address string
	spinner spinner.Model
}

// NewConnectingModal creates a new connecting modal
func NewConnectingModal(method string, address string) *ConnectingModal {
	s := spinner.New()
	s.Spinner = spinner.Dot
	s.Style = lipgloss.NewStyle().Foreground(lipgloss.Color("#7D56F4"))

	return &ConnectingModal{
		method:  method,
		address: address,
		spinner: s,
	}
}

// Type returns the modal type
func (m *ConnectingModal) Type() ModalType {
	return ModalConnecting
}

// HandleKey processes keyboard input (blocked during connection)
func (m *ConnectingModal) HandleKey(msg tea.KeyMsg) (bool, Modal, tea.Cmd) {
	// Block all input during connection attempt
	return true, m, nil
}

// Update handles bubbletea messages for animation
func (m *ConnectingModal) Update(msg tea.Msg) tea.Cmd {
	var cmd tea.Cmd
	m.spinner, cmd = m.spinner.Update(msg)
	return cmd
}

// Init returns the initial command to start the spinner
func (m *ConnectingModal) Init() tea.Cmd {
	return m.spinner.Tick
}

// Render returns the modal content
func (m *ConnectingModal) Render(width, height int) string {
	primaryColor := lipgloss.Color("#7D56F4") // Purple for connecting

	titleStyle := lipgloss.NewStyle().
		Bold(true).
		Foreground(primaryColor).
		MarginBottom(1).
		Align(lipgloss.Center)

	methodStyle := lipgloss.NewStyle().
		Foreground(lipgloss.Color("252")).
		Bold(true)

	addressStyle := lipgloss.NewStyle().
		Foreground(lipgloss.Color("240")).
		Italic(true).
		MarginBottom(1)

	// Build content
	var content string

	// Title with spinner
	content += titleStyle.Render(m.spinner.View()+" Connecting...") + "\n\n"

	// Method and address
	content += "Method: " + methodStyle.Render(m.method) + "\n"
	content += addressStyle.Render("Server: "+m.address) + "\n\n"

	// Hint
	content += lipgloss.NewStyle().
		Foreground(lipgloss.Color("240")).
		Render("Please wait...")

	// Create border style
	borderStyle := lipgloss.NewStyle().
		Border(lipgloss.RoundedBorder()).
		BorderForeground(primaryColor).
		Padding(1, 2)

	// Calculate modal size (fixed width, auto height)
	modalWidth := 50
	if width < modalWidth+4 {
		modalWidth = width - 4
	}

	// Render in bordered box
	box := borderStyle.Width(modalWidth - 4).Render(content)

	// Center the modal
	return lipgloss.Place(
		width,
		height,
		lipgloss.Center,
		lipgloss.Center,
		box,
	)
}

// IsBlockingInput returns whether this modal blocks input to the main view
func (m *ConnectingModal) IsBlockingInput() bool {
	return true
}
