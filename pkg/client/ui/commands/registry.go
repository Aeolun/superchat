package commands

import (
	"sort"
	"strings"

	"github.com/aeolun/superchat/pkg/client/ui/modal"
)

// Registry manages all registered commands
type Registry struct {
	commands       []Command
	keyMap         map[string][]*Command // key -> commands (for dispatch)
	viewCommands   map[int][]*Command    // view -> commands (for rendering)
	globalCommands []*Command            // cached global commands
}

// NewRegistry creates a new command registry
func NewRegistry() *Registry {
	return &Registry{
		commands:     []Command{},
		keyMap:       make(map[string][]*Command),
		viewCommands: make(map[int][]*Command),
	}
}

// Register adds a command to the registry
func (r *Registry) Register(cmd Command) {
	r.commands = append(r.commands, cmd)
	cmdPtr := &r.commands[len(r.commands)-1]

	// Build key lookup map
	for _, key := range cmd.Keys {
		r.keyMap[key] = append(r.keyMap[key], cmdPtr)
	}

	// Build view lookup map
	if cmd.Scope == ScopeGlobal {
		r.globalCommands = append(r.globalCommands, cmdPtr)
	} else if len(cmd.ViewStates) > 0 {
		for _, view := range cmd.ViewStates {
			r.viewCommands[view] = append(r.viewCommands[view], cmdPtr)
		}
	}
}

// GetCommand finds the first available command for a key in the current context
// Returns nil if no available command matches the key
func (r *Registry) GetCommand(key string, view int, activeModal modal.ModalType, model interface{}) *Command {
	commands, exists := r.keyMap[key]
	if !exists {
		return nil
	}

	// Return the first available command
	// Commands are checked in registration order, with more specific (view) taking precedence
	for _, cmd := range commands {
		if r.isCommandAvailable(cmd, view, activeModal, model) {
			return cmd
		}
	}

	return nil
}

// isCommandAvailable checks if a command is available in the current context
func (r *Registry) isCommandAvailable(cmd *Command, view int, activeModal modal.ModalType, model interface{}) bool {
	// Check modal compatibility
	if activeModal != modal.ModalNone {
		if len(cmd.ModalStates) > 0 {
			// Explicit modal list - must be in list
			found := false
			for _, m := range cmd.ModalStates {
				if m == activeModal {
					found = true
					break
				}
			}
			if !found {
				return false
			}
		}
		// If ModalStates is nil/empty, command works in all modals (backward compatible)
	}

	// Check scope
	switch cmd.Scope {
	case ScopeGlobal:
		// Global commands are always in scope
	case ScopeView:
		// Check if current view matches
		if len(cmd.ViewStates) > 0 {
			found := false
			for _, v := range cmd.ViewStates {
				if v == view {
					found = true
					break
				}
			}
			if !found {
				return false
			}
		}
	}

	// Check custom availability function
	if cmd.IsAvailable != nil && !cmd.IsAvailable(model) {
		return false
	}

	return true
}

// GetAvailableCommands returns all commands available in the current context
// Commands are sorted by priority (lower priority value = shown first)
func (r *Registry) GetAvailableCommands(view int, activeModal modal.ModalType, model interface{}) []*Command {
	var available []*Command

	// Add global commands
	for _, cmd := range r.globalCommands {
		if r.isCommandAvailable(cmd, view, activeModal, model) {
			available = append(available, cmd)
		}
	}

	// Add view-specific commands
	if viewCmds, exists := r.viewCommands[view]; exists {
		for _, cmd := range viewCmds {
			if r.isCommandAvailable(cmd, view, activeModal, model) {
				available = append(available, cmd)
			}
		}
	}

	// Sort by priority
	sort.Slice(available, func(i, j int) bool {
		return available[i].Priority < available[j].Priority
	})

	return available
}

// GenerateFooter creates footer text for the current context
// Returns a string like "[↑↓] Navigate  [e] Edit  [d] Delete  [Esc] Back"
func (r *Registry) GenerateFooter(view int, activeModal modal.ModalType, model interface{}) string {
	commands := r.GetAvailableCommands(view, activeModal, model)

	var parts []string
	for _, cmd := range commands {
		footerText := cmd.FooterText()
		if footerText != "" {
			parts = append(parts, footerText)
		}
	}

	return strings.Join(parts, "  ")
}

// GenerateHelp creates help content for all commands
// Returns a slice of [key, description] pairs sorted by priority
// Now context-aware: only shows commands available in current state
func (r *Registry) GenerateHelp(view int, activeModal modal.ModalType, model interface{}) [][]string {
	var help [][]string
	seen := make(map[string]bool)

	// Get only available commands for current context
	availableCommands := r.GetAvailableCommands(view, activeModal, model)

	for _, cmd := range availableCommands {
		// Avoid duplicates (same keys)
		key := strings.Join(cmd.Keys, "/")
		if seen[key] {
			continue
		}
		seen[key] = true

		if len(cmd.Keys) > 0 && cmd.HelpText != "" {
			// Format keys for help display
			keyDisplay := strings.Join(cmd.Keys, " / ")
			help = append(help, []string{keyDisplay, cmd.HelpText})
		}
	}

	return help
}

// GetCommandByName finds a command by its name or alias (case-insensitive)
// Returns nil if no available command matches the name
func (r *Registry) GetCommandByName(name string, view int, activeModal modal.ModalType, model interface{}) *Command {
	lowerName := strings.ToLower(name)

	// Check all commands
	for i := range r.commands {
		cmd := &r.commands[i]
		if !r.isCommandAvailable(cmd, view, activeModal, model) {
			continue
		}

		// Check primary name
		if strings.ToLower(cmd.Name) == lowerName {
			return cmd
		}

		// Check aliases
		for _, alias := range cmd.Aliases {
			if strings.ToLower(alias) == lowerName {
				return cmd
			}
		}
	}

	return nil
}

// GetCommandNames returns all available command names and aliases for autocomplete
// Names are sorted alphabetically and deduplicated
func (r *Registry) GetCommandNames(view int, activeModal modal.ModalType, model interface{}) []string {
	availableCommands := r.GetAvailableCommands(view, activeModal, model)

	names := make(map[string]bool)
	for _, cmd := range availableCommands {
		// Add primary name
		if cmd.Name != "" {
			names[strings.ToLower(cmd.Name)] = true
		}
		// Add aliases
		for _, alias := range cmd.Aliases {
			if alias != "" {
				names[strings.ToLower(alias)] = true
			}
		}
	}

	result := make([]string, 0, len(names))
	for name := range names {
		result = append(result, name)
	}

	sort.Strings(result)
	return result
}
