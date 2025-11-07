// ABOUTME: Shared command definitions used by both terminal and GUI clients
// ABOUTME: Defines keyboard shortcuts, help text, and availability conditions
package commands

import (
	"sort"
	"strings"
)

// CommandDefinition represents a keyboard command shared across clients
type CommandDefinition struct {
	// Keys that trigger this command (e.g., "r", "n", "ctrl+d")
	Keys []string

	// Name of the command for display (e.g., "Reply", "New Thread")
	Name string

	// Help text description for help modal
	HelpText string

	// Scope defines where this command is available
	Scope CommandScope

	// ViewStates lists specific views where this command is active
	// Empty means available in all views matching the scope
	ViewStates []ViewID

	// ModalStates lists specific modals where this command is active
	// nil or empty means available in all modals
	// Use []ModalType{ModalNone} to explicitly disable in all modals
	ModalStates []ModalType

	// ActionID is the unique identifier for this command's action
	// Used by ExecuteAction to dispatch to client-specific implementation
	ActionID string

	// IsAvailable checks if command should be active given current state
	// nil means always available (within scope/view/modal constraints)
	IsAvailable func(CommandExecutor) bool

	// Priority for display ordering (lower = higher priority in footer/help)
	Priority int
}

// CommandScope defines the availability scope of a command
type CommandScope int

const (
	ScopeGlobal CommandScope = iota // Available everywhere
	ScopeView                        // Limited to specific views
	ScopeModal                       // Limited to specific modals
)

// SharedCommands contains all keyboard commands shared between clients
var SharedCommands = []CommandDefinition{
	// === Global Commands ===

	{
		Keys:        []string{"h", "?"},
		Name:        "Help",
		HelpText:    "Show keyboard shortcuts",
		Scope:       ScopeGlobal,
		ModalStates: []ModalType{ModalNone}, // Only when no modal open
		ActionID:    ActionHelp,
		Priority:    950,
	},

	{
		Keys:        []string{"q"},
		Name:        "Quit",
		HelpText:    "Exit application",
		Scope:       ScopeGlobal,
		ModalStates: []ModalType{ModalNone}, // Only when no modal open
		ActionID:    ActionQuit,
		Priority:    999,
	},

	{
		Keys:     []string{"ctrl+l"},
		Name:     "Server List",
		HelpText: "List available servers",
		Scope:    ScopeGlobal,
		ActionID: ActionServerList,
		Priority: 900,
	},

	// === Navigation Commands ===

	{
		Keys:        []string{"up", "k"},
		Name:        "Up",
		HelpText:    "Move selection up",
		Scope:       ScopeView,
		ViewStates:  []ViewID{ViewChannelList, ViewThreadList, ViewThreadView},
		ModalStates: []ModalType{ModalNone},
		ActionID:    ActionNavigateUp,
		Priority:    10,
	},

	{
		Keys:        []string{"down", "j"},
		Name:        "Down",
		HelpText:    "Move selection down",
		Scope:       ScopeView,
		ViewStates:  []ViewID{ViewChannelList, ViewThreadList, ViewThreadView},
		ModalStates: []ModalType{ModalNone},
		ActionID:    ActionNavigateDown,
		Priority:    11,
	},

	{
		Keys:        []string{"enter"},
		Name:        "Select",
		HelpText:    "Select current item",
		Scope:       ScopeView,
		ViewStates:  []ViewID{ViewChannelList, ViewThreadList},
		ModalStates: []ModalType{ModalNone},
		ActionID:    ActionSelect,
		Priority:    20,
	},

	{
		Keys:     []string{"esc"},
		Name:     "Back",
		HelpText: "Go back / Close modal",
		Scope:    ScopeGlobal,
		ActionID: ActionGoBack,
		IsAvailable: func(e CommandExecutor) bool {
			// Available if modal is open or can go back
			return e.GetActiveModal() != ModalNone || e.CanGoBack()
		},
		Priority: 30,
	},

	// === Messaging Commands ===

	{
		Keys:        []string{"n"},
		Name:        "New Thread",
		HelpText:    "Create a new thread",
		Scope:       ScopeView,
		ViewStates:  []ViewID{ViewThreadList},
		ModalStates: []ModalType{ModalNone},
		ActionID:    ActionComposeNewThread,
		IsAvailable: func(e CommandExecutor) bool {
			return e.HasSelectedChannel()
		},
		Priority: 100,
	},

	{
		Keys:        []string{"r"},
		Name:        "Reply",
		HelpText:    "Reply to selected message",
		Scope:       ScopeView,
		ViewStates:  []ViewID{ViewThreadView},
		ModalStates: []ModalType{ModalNone},
		ActionID:    ActionComposeReply,
		IsAvailable: func(e CommandExecutor) bool {
			return e.HasSelectedMessage()
		},
		Priority: 101,
	},

	{
		Keys:        []string{"ctrl+d", "ctrl+enter"},
		Name:        "Send",
		HelpText:    "Send message",
		Scope:       ScopeModal,
		ModalStates: []ModalType{ModalCompose},
		ActionID:    ActionSendMessage,
		IsAvailable: func(e CommandExecutor) bool {
			return e.HasComposeContent()
		},
		Priority: 1,
	},

	{
		Keys:        []string{"e"},
		Name:        "Edit",
		HelpText:    "Edit selected message",
		Scope:       ScopeView,
		ViewStates:  []ViewID{ViewThreadView},
		ModalStates: []ModalType{ModalNone},
		ActionID:    ActionEditMessage,
		IsAvailable: func(e CommandExecutor) bool {
			// TODO: Check if message is owned by current user
			return e.HasSelectedMessage()
		},
		Priority: 102,
	},

	{
		Keys:        []string{"d"},
		Name:        "Delete",
		HelpText:    "Delete selected message",
		Scope:       ScopeView,
		ViewStates:  []ViewID{ViewThreadView},
		ModalStates: []ModalType{ModalNone},
		ActionID:    ActionDeleteMessage,
		IsAvailable: func(e CommandExecutor) bool {
			// TODO: Check if message is owned by current user
			return e.HasSelectedMessage()
		},
		Priority: 103,
	},

	// === Admin Commands ===

	{
		Keys:        []string{"a"},
		Name:        "Admin Panel",
		HelpText:    "Open admin panel",
		Scope:       ScopeGlobal,
		ModalStates: []ModalType{ModalNone},
		ActionID:    ActionAdminPanel,
		IsAvailable: func(e CommandExecutor) bool {
			return e.IsAdmin()
		},
		Priority: 800,
	},

	{
		Keys:        []string{"c"},
		Name:        "Create Channel",
		HelpText:    "Create a new channel",
		Scope:       ScopeView,
		ViewStates:  []ViewID{ViewChannelList},
		ModalStates: []ModalType{ModalNone},
		ActionID:    ActionCreateChannel,
		IsAvailable: func(e CommandExecutor) bool {
			return e.IsAdmin()
		},
		Priority: 801,
	},
}

// GetCommandsForContext returns commands available in the current context
// Sorted by priority (lower priority = shown first)
func GetCommandsForContext(executor CommandExecutor) []CommandDefinition {
	currentView := executor.GetCurrentView()
	activeModal := executor.GetActiveModal()

	var available []CommandDefinition

	for _, cmd := range SharedCommands {
		if isCommandAvailable(cmd, currentView, activeModal, executor) {
			available = append(available, cmd)
		}
	}

	// Sort by priority
	sort.Slice(available, func(i, j int) bool {
		return available[i].Priority < available[j].Priority
	})

	return available
}

// FindCommandForKey returns the first available command matching the key
// Returns nil if no command matches
func FindCommandForKey(key string, executor CommandExecutor) *CommandDefinition {
	currentView := executor.GetCurrentView()
	activeModal := executor.GetActiveModal()

	for i := range SharedCommands {
		cmd := &SharedCommands[i]
		if keyMatches(key, cmd.Keys) && isCommandAvailable(*cmd, currentView, activeModal, executor) {
			return cmd
		}
	}

	return nil
}

// isCommandAvailable checks if a command is available in the current context
func isCommandAvailable(cmd CommandDefinition, view ViewID, modal ModalType, executor CommandExecutor) bool {
	// Check modal compatibility
	if len(cmd.ModalStates) > 0 {
		found := false
		for _, m := range cmd.ModalStates {
			if m == modal {
				found = true
				break
			}
		}
		if !found {
			return false
		}
	}

	// Check scope and view compatibility
	switch cmd.Scope {
	case ScopeGlobal:
		// Global commands are always in scope
	case ScopeView:
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
	case ScopeModal:
		// Modal-scoped commands already checked above
	}

	// Check custom availability condition
	if cmd.IsAvailable != nil {
		return cmd.IsAvailable(executor)
	}

	return true
}

// keyMatches checks if a key string matches any of the command's keys
func keyMatches(key string, commandKeys []string) bool {
	keyLower := strings.ToLower(key)
	for _, cmdKey := range commandKeys {
		if strings.ToLower(cmdKey) == keyLower {
			return true
		}
	}
	return false
}

// FormatKey converts a key string to display format
// Examples: "ctrl+d" -> "Ctrl+D", "esc" -> "Esc", "up" -> "↑"
func FormatKey(key string) string {
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
	case "ctrl+l":
		return "Ctrl+L"
	case "ctrl+enter":
		return "Ctrl+Enter"
	default:
		// For single letters, return uppercase
		if len(key) == 1 {
			return strings.ToUpper(key)
		}
		// For ctrl+letter combinations, capitalize
		if strings.HasPrefix(strings.ToLower(key), "ctrl+") {
			rest := key[5:]
			if len(rest) == 1 {
				return "Ctrl+" + strings.ToUpper(rest)
			}
		}
		return key
	}
}

// FooterText generates the footer display text for a command
// Examples: "[R] Reply", "[Ctrl+D] Send", "[↑↓] Navigate"
func (c *CommandDefinition) FooterText() string {
	if c.Name == "" || len(c.Keys) == 0 {
		return ""
	}

	// Format keys for display
	var keyDisplay string
	if len(c.Keys) == 1 {
		keyDisplay = FormatKey(c.Keys[0])
	} else {
		// Multiple keys: show first two separated by /
		formatted := make([]string, len(c.Keys))
		for i, k := range c.Keys {
			formatted[i] = FormatKey(k)
		}
		if len(formatted) <= 2 {
			keyDisplay = strings.Join(formatted, "/")
		} else {
			keyDisplay = formatted[0] + "/" + formatted[1]
		}
	}

	return "[" + keyDisplay + "] " + c.Name
}

// GenerateHelpContent returns help text formatted for display
// Returns [][]string where each entry is [key, description]
func GenerateHelpContent(executor CommandExecutor) [][]string {
	commands := GetCommandsForContext(executor)

	var help [][]string
	for _, cmd := range commands {
		keyStr := strings.Join(cmd.Keys, ", ")
		help = append(help, []string{keyStr, cmd.HelpText})
	}

	return help
}
