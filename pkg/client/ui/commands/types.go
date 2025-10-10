package commands

import (
	tea "github.com/charmbracelet/bubbletea"

	"github.com/aeolun/superchat/pkg/client/ui/modal"
)

// Command represents a single keyboard command
type Command struct {
	// Keys that trigger this command (e.g., "e", "esc", "ctrl+d")
	Keys []string

	// Name of the command (e.g., "Edit", "Send")
	// Footer text is auto-generated from Keys and Name
	Name string

	// Aliases are alternate names for the command (for command palette)
	// Example: Quit command might have alias "Exit"
	Aliases []string

	// Description for help modal
	HelpText string

	// Scope defines where this command is available
	Scope CommandScope

	// ViewStates lists specific views where this command is active
	// Empty means available in all views matching the scope
	ViewStates []int

	// ModalStates lists specific modals where this command is active
	// nil or empty means available in all modals (backward compatible)
	// Use []modal.ModalType{modal.ModalNone} to explicitly disable in all modals
	ModalStates []modal.ModalType

	// IsAvailable checks if command should be active given current model state
	// nil means always available (within scope/view constraints)
	IsAvailable func(interface{}) bool

	// Execute runs the command and returns updated model and optional tea.Cmd
	// The interface{} parameter and return value will be the Model in practice
	Execute func(interface{}) (interface{}, tea.Cmd)

	// Priority for display ordering (lower = higher priority in footer/help)
	Priority int
}

// CommandScope defines the availability scope of a command
type CommandScope int

const (
	ScopeGlobal CommandScope = iota // Available everywhere
	ScopeView                        // Limited to specific views
)

// FooterText generates the footer display text from keys and name
// Examples: "[e] Edit", "[Ctrl+D/Ctrl+Enter] Send", "[↑↓] Navigate"
func (c *Command) FooterText() string {
	if c.Name == "" {
		return ""
	}

	// Format keys for display
	var keyDisplay string
	if len(c.Keys) == 0 {
		return ""
	} else if len(c.Keys) == 1 {
		keyDisplay = formatKey(c.Keys[0])
	} else {
		// Multiple keys: show all separated by /
		formatted := make([]string, len(c.Keys))
		for i, k := range c.Keys {
			formatted[i] = formatKey(k)
		}
		keyDisplay = formatted[0] + "/" + formatted[1]
		if len(formatted) > 2 {
			for i := 2; i < len(formatted); i++ {
				keyDisplay += "/" + formatted[i]
			}
		}
	}

	return "[" + keyDisplay + "] " + c.Name
}

// formatKey converts a key string to display format
// Examples: "ctrl+d" -> "Ctrl+D", "esc" -> "Esc", "up" -> "↑"
func formatKey(key string) string {
	switch key {
	case "up":
		return "↑"
	case "down":
		return "↓"
	case "left":
		return "←"
	case "right":
		return "→"
	case "enter":
		return "Enter"
	case "esc":
		return "Esc"
	case "backspace":
		return "Backspace"
	case "ctrl+c":
		return "Ctrl+C"
	case "ctrl+d":
		return "Ctrl+D"
	case "ctrl+enter":
		return "Ctrl+Enter"
	default:
		// For single letters and other keys, just return uppercase
		if len(key) == 1 {
			return key
		}
		// For ctrl+letter combinations, capitalize
		if len(key) > 5 && key[:5] == "ctrl+" {
			rest := key[5:]
			if len(rest) == 1 {
				return "Ctrl+" + rest
			}
		}
		return key
	}
}

// CommandBuilder provides a fluent interface for building commands
type CommandBuilder struct {
	cmd Command
}

// NewCommand creates a new command builder with sensible defaults
func NewCommand() *CommandBuilder {
	return &CommandBuilder{
		cmd: Command{
			Scope:    ScopeView,
			Priority: 100,
		},
	}
}

// Keys sets the key bindings for this command
func (b *CommandBuilder) Keys(keys ...string) *CommandBuilder {
	b.cmd.Keys = keys
	return b
}

// Name sets the command name (used for footer generation)
func (b *CommandBuilder) Name(name string) *CommandBuilder {
	b.cmd.Name = name
	return b
}

// Aliases sets alternate names for the command (for command palette)
func (b *CommandBuilder) Aliases(aliases ...string) *CommandBuilder {
	b.cmd.Aliases = aliases
	return b
}

// Help sets the help text description
func (b *CommandBuilder) Help(text string) *CommandBuilder {
	b.cmd.HelpText = text
	return b
}

// Global marks this as a global command (available everywhere)
func (b *CommandBuilder) Global() *CommandBuilder {
	b.cmd.Scope = ScopeGlobal
	return b
}

// InViews restricts this command to specific views
func (b *CommandBuilder) InViews(views ...int) *CommandBuilder {
	b.cmd.ViewStates = views
	return b
}

// InModals restricts this command to specific modals
// If not called, command works in all modals (backward compatible)
// Use InModals(modal.ModalNone) to disable in all modals
func (b *CommandBuilder) InModals(modals ...modal.ModalType) *CommandBuilder {
	b.cmd.ModalStates = modals
	return b
}

// When sets the availability condition function
func (b *CommandBuilder) When(fn func(interface{}) bool) *CommandBuilder {
	b.cmd.IsAvailable = fn
	return b
}

// Do sets the command execution function
func (b *CommandBuilder) Do(fn func(interface{}) (interface{}, tea.Cmd)) *CommandBuilder {
	b.cmd.Execute = fn
	return b
}

// Priority sets the display priority (lower = shown first)
func (b *CommandBuilder) Priority(p int) *CommandBuilder {
	b.cmd.Priority = p
	return b
}

// Build returns the constructed Command
func (b *CommandBuilder) Build() Command {
	return b.cmd
}
