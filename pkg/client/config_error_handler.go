package client

import (
	"fmt"

	"github.com/aeolun/superchat/pkg/client/ui/modal"
	tea "github.com/charmbracelet/bubbletea"
)

// ConfigErrorHandler shows a config error modal and handles user actions
type ConfigErrorHandler struct {
	modal      *modal.ConfigErrorModal
	configPath string
	width      int
	height     int
}

// NewConfigErrorHandler creates a new config error handler
func NewConfigErrorHandler(configPath string, err *ConfigError) *ConfigErrorHandler {
	h := &ConfigErrorHandler{
		configPath: configPath,
		width:      80,
		height:     24,
	}

	h.modal = modal.NewConfigErrorModal(
		err.Path,
		err.Message,
		err.LineNumber,
		h.handleReset,
		h.handleQuit,
	)

	return h
}

// Init initializes the handler
func (h *ConfigErrorHandler) Init() tea.Cmd {
	return nil
}

// Update processes messages
func (h *ConfigErrorHandler) Update(msg tea.Msg) (tea.Model, tea.Cmd) {
	switch msg := msg.(type) {
	case tea.WindowSizeMsg:
		h.width = msg.Width
		h.height = msg.Height
		return h, nil

	case tea.KeyMsg:
		handled, newModal, cmd := h.modal.HandleKey(msg)
		if !handled {
			return h, nil
		}
		if newModal == nil {
			// Modal closed, which means either quit or reset
			return h, tea.Quit
		}
		h.modal = newModal.(*modal.ConfigErrorModal)
		return h, cmd

	case resetCompleteMsg:
		// Reset complete, restart the program
		fmt.Println("\n✓ Configuration reset to defaults")
		fmt.Println("Please restart the client to continue")
		return h, tea.Quit

	case resetErrorMsg:
		fmt.Printf("\n✗ Failed to reset config: %v\n", msg.err)
		return h, tea.Quit
	}

	return h, nil
}

// View renders the handler
func (h *ConfigErrorHandler) View() string {
	return h.modal.Render(h.width, h.height)
}

// handleReset resets the config to defaults
func (h *ConfigErrorHandler) handleReset(backup bool) tea.Cmd {
	return func() tea.Msg {
		if err := ResetConfigToDefault(h.configPath, backup); err != nil {
			return resetErrorMsg{err: err}
		}
		return resetCompleteMsg{}
	}
}

// handleQuit quits the program
func (h *ConfigErrorHandler) handleQuit() tea.Cmd {
	return tea.Quit
}

// Messages for reset operations
type resetCompleteMsg struct{}
type resetErrorMsg struct{ err error }

// HandleConfigError shows a TUI for handling config errors
// Returns true if the error was handled and program should exit
func HandleConfigError(configPath string, err error) bool {
	configErr, ok := err.(*ConfigError)
	if !ok {
		// Not a ConfigError, return false to use default error handling
		return false
	}

	handler := NewConfigErrorHandler(configPath, configErr)
	p := tea.NewProgram(handler)
	if _, err := p.Run(); err != nil {
		fmt.Printf("Error displaying config error: %v\n", err)
		return true
	}

	return true
}
