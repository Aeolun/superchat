package modal

import (
	"strings"

	tea "github.com/charmbracelet/bubbletea"
	"github.com/charmbracelet/lipgloss"
)

// CommandPaletteModal provides command search with autocomplete
type CommandPaletteModal struct {
	prefix          string   // "/" or ":"
	input           string   // User input (without prefix)
	availableCommands []string // All available command names
	filteredCommands  []string // Commands matching current input
	cursor          int      // Selected command in filtered list
	onExecute       func(commandName string) tea.Cmd
	onCancel        func() tea.Cmd
}

// NewCommandPaletteModal creates a new command palette modal
func NewCommandPaletteModal(
	prefix string,
	availableCommands []string,
	onExecute func(commandName string) tea.Cmd,
	onCancel func() tea.Cmd,
) *CommandPaletteModal {
	m := &CommandPaletteModal{
		prefix:            prefix,
		input:             "",
		availableCommands: availableCommands,
		filteredCommands:  availableCommands, // Show all initially
		cursor:            0,
		onExecute:         onExecute,
		onCancel:          onCancel,
	}
	return m
}

// Type returns the modal type
func (m *CommandPaletteModal) Type() ModalType {
	return ModalCommandPalette
}

// HandleKey processes keyboard input
func (m *CommandPaletteModal) HandleKey(msg tea.KeyMsg) (bool, Modal, tea.Cmd) {
	switch msg.String() {
	case "enter":
		// Execute selected command
		if len(m.filteredCommands) > 0 && m.cursor < len(m.filteredCommands) {
			selectedCommand := m.filteredCommands[m.cursor]
			var cmd tea.Cmd
			if m.onExecute != nil {
				cmd = m.onExecute(selectedCommand)
			}
			return true, nil, cmd // Close modal
		}
		// If no commands match, just close
		var cmd tea.Cmd
		if m.onCancel != nil {
			cmd = m.onCancel()
		}
		return true, nil, cmd

	case "esc":
		// Cancel
		var cmd tea.Cmd
		if m.onCancel != nil {
			cmd = m.onCancel()
		}
		return true, nil, cmd

	case "up", "ctrl+p":
		// Move cursor up
		if m.cursor > 0 {
			m.cursor--
		}
		return true, m, nil

	case "down", "ctrl+n":
		// Move cursor down
		if m.cursor < len(m.filteredCommands)-1 {
			m.cursor++
		}
		return true, m, nil

	case "backspace":
		// Delete character
		if len(m.input) > 0 {
			m.input = m.input[:len(m.input)-1]
			m.updateFilter()
		}
		return true, m, nil

	default:
		// Handle text input
		if msg.Type == tea.KeyRunes {
			m.input += string(msg.Runes)
			m.updateFilter()
			return true, m, nil
		}

		// Consume all other keys
		return true, m, nil
	}
}

// updateFilter updates the filtered commands list based on current input
func (m *CommandPaletteModal) updateFilter() {
	m.cursor = 0 // Reset cursor when filter changes

	if m.input == "" {
		// No input, show all commands
		m.filteredCommands = m.availableCommands
		return
	}

	lowerInput := strings.ToLower(m.input)
	filtered := []string{}

	for _, cmd := range m.availableCommands {
		// Match if command starts with input (prefix match)
		if strings.HasPrefix(strings.ToLower(cmd), lowerInput) {
			filtered = append(filtered, cmd)
		}
	}

	// If no prefix matches, try substring match
	if len(filtered) == 0 {
		for _, cmd := range m.availableCommands {
			if strings.Contains(strings.ToLower(cmd), lowerInput) {
				filtered = append(filtered, cmd)
			}
		}
	}

	m.filteredCommands = filtered
}

// Render returns the modal content
func (m *CommandPaletteModal) Render(width, height int) string {
	primaryColor := lipgloss.Color("205")
	mutedColor := lipgloss.Color("240")
	selectedColor := lipgloss.Color("170")

	title := lipgloss.NewStyle().
		Bold(true).
		Foreground(primaryColor).
		Align(lipgloss.Center).
		MarginBottom(1).
		Render("Command Palette")

	// Input field with prefix
	inputText := m.prefix + m.input + "█"
	inputField := lipgloss.NewStyle().
		Border(lipgloss.RoundedBorder()).
		BorderForeground(selectedColor).
		Padding(0, 1).
		Width(50).
		Render(inputText)

	// Suggestions list (max 8 items)
	var suggestions []string
	maxSuggestions := 8
	start := 0
	end := len(m.filteredCommands)

	if end > maxSuggestions {
		// Keep cursor visible in viewport
		if m.cursor >= maxSuggestions {
			start = m.cursor - maxSuggestions + 1
		}
		end = start + maxSuggestions
		if end > len(m.filteredCommands) {
			end = len(m.filteredCommands)
			start = end - maxSuggestions
			if start < 0 {
				start = 0
			}
		}
	}

	if len(m.filteredCommands) == 0 {
		suggestions = append(suggestions, lipgloss.NewStyle().
			Foreground(mutedColor).
			Render("  (no matching commands)"))
	} else {
		for i := start; i < end; i++ {
			cmd := m.filteredCommands[i]
			if i == m.cursor {
				suggestions = append(suggestions, lipgloss.NewStyle().
					Foreground(selectedColor).
					Bold(true).
					Render("▶ "+cmd))
			} else {
				suggestions = append(suggestions, "  "+cmd)
			}
		}
	}

	suggestionList := strings.Join(suggestions, "\n")

	// Help text
	helpText := lipgloss.NewStyle().
		Foreground(mutedColor).
		Align(lipgloss.Center).
		MarginTop(1).
		Render("[↑↓] Navigate  [Enter] Execute  [Esc] Cancel")

	content := lipgloss.JoinVertical(
		lipgloss.Center,
		"",
		title,
		inputField,
		"",
		suggestionList,
		helpText,
		"",
	)

	modal := lipgloss.NewStyle().
		Border(lipgloss.RoundedBorder()).
		BorderForeground(primaryColor).
		Padding(1, 2).
		Width(60).
		Render(content)

	return lipgloss.Place(width, height, lipgloss.Center, lipgloss.Center, modal)
}

// IsBlockingInput returns true (this modal blocks all input)
func (m *CommandPaletteModal) IsBlockingInput() bool {
	return true
}
