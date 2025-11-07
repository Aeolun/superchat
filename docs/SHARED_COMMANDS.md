# Shared Command System

## Overview

SuperChat has two clients (terminal and GUI) that share the same keyboard command definitions but implement execution differently. This document describes the shared command system architecture and tracks implementation progress.

## Architecture

### Core Concept

**Command definitions are shared, execution is client-specific.**

- **Command Definition**: Keys, name, help text, scope, availability conditions
- **Command Execution**: Each client implements `CommandExecutor` interface with UI-specific logic
- **Action IDs**: String identifiers that map shared commands to client implementations

### Components

```
pkg/client/commands/
├── shared.go          # Shared command definitions
├── executor.go        # CommandExecutor interface
├── views.go           # Shared view/modal constants
├── types.go           # Existing terminal command types (kept for backward compat)
└── registry.go        # Existing terminal command registry (kept for backward compat)

pkg/client/ui/         # Terminal client - implements CommandExecutor
cmd/client-gui/ui/     # GUI client - implements CommandExecutor
```

## File Structure

### `pkg/client/commands/shared.go`

```go
// CommandDefinition represents a keyboard command shared across clients
type CommandDefinition struct {
    Keys        []string       // Key bindings (e.g., "r", "n", "ctrl+d")
    Name        string         // Display name (e.g., "Reply")
    HelpText    string         // Help description
    Scope       CommandScope   // Global or View-specific
    ViewStates  []ViewID       // Which views it's available in
    ModalStates []ModalType    // Which modals it's available in
    ActionID    string         // Unique action identifier
    IsAvailable func(CommandExecutor) bool  // Conditional availability
    Priority    int            // Display priority (lower = higher priority)
}

// Shared command list
var SharedCommands = []CommandDefinition{
    // Global commands
    {ActionID: "help", Keys: []string{"h", "?"}, Name: "Help", ...},
    {ActionID: "quit", Keys: []string{"q"}, Name: "Quit", ...},

    // Navigation
    {ActionID: "navigate_up", Keys: []string{"up", "k"}, Name: "Up", ...},
    {ActionID: "navigate_down", Keys: []string{"down", "j"}, Name: "Down", ...},
    {ActionID: "select", Keys: []string{"enter"}, Name: "Select", ...},
    {ActionID: "go_back", Keys: []string{"esc"}, Name: "Back", ...},

    // Messaging
    {ActionID: "compose_new_thread", Keys: []string{"n"}, Name: "New Thread", ...},
    {ActionID: "compose_reply", Keys: []string{"r"}, Name: "Reply", ...},
    {ActionID: "send_message", Keys: []string{"ctrl+d", "ctrl+enter"}, Name: "Send", ...},

    // ... more commands
}
```

### `pkg/client/commands/executor.go`

```go
// CommandExecutor is implemented by both terminal and GUI clients
type CommandExecutor interface {
    // === State Queries (for IsAvailable checks) ===

    GetCurrentView() ViewID
    GetActiveModal() ModalType

    // Navigation state
    HasSelectedMessage() bool
    HasSelectedChannel() bool
    HasSelectedThread() bool

    // Compose modal state
    IsComposing() bool
    HasComposeContent() bool

    // User permissions
    IsAdmin() bool
    IsRegisteredUser() bool

    // === Action Execution ===

    // Each client implements this to dispatch actions
    // Terminal returns (Model, tea.Cmd), GUI just modifies state
    ExecuteAction(actionID string) error
}
```

### `pkg/client/commands/views.go`

```go
// Shared view identifiers (both clients use these)
type ViewID int

const (
    ViewSplash ViewID = iota
    ViewChannelList
    ViewThreadList
    ViewThreadView
    ViewChatChannel
)

// Shared modal identifiers
type ModalType int

const (
    ModalNone ModalType = iota
    ModalCompose
    ModalHelp
    ModalServerSelector
    // ... other modals
)
```

## Client Implementation

### Terminal Client (`pkg/client/ui/model.go`)

```go
// Implement CommandExecutor interface
func (m Model) GetCurrentView() commands.ViewID {
    return commands.ViewID(m.currentView)
}

func (m Model) HasSelectedMessage() bool {
    return m.currentThread != nil
}

func (m Model) ExecuteAction(actionID string) error {
    // Map action ID to terminal-specific implementation
    switch actionID {
    case "compose_reply":
        m, _ := m.openReplyModal()
        return nil
    case "compose_new_thread":
        m, _ := m.openComposeModal()
        return nil
    // ... more actions
    }
}

// Keyboard handler uses shared commands
func (m Model) handleKeyPress(msg tea.KeyMsg) (tea.Model, tea.Cmd) {
    key := msg.String()

    // Find matching command
    for _, cmd := range commands.SharedCommands {
        if m.keyMatches(key, cmd.Keys) && m.commandAvailable(cmd) {
            err := m.ExecuteAction(cmd.ActionID)
            if err != nil {
                // Handle error
            }
            return m, nil
        }
    }

    // Fall through to legacy handlers
    return m.handleLegacyKeyPress(msg)
}
```

### GUI Client (`cmd/client-gui/ui/app.go`)

```go
// Implement CommandExecutor interface
func (a *App) GetCurrentView() commands.ViewID {
    return commands.ViewID(a.mainView)
}

func (a *App) HasSelectedMessage() bool {
    // In GUI, we need to track selected message differently
    return a.currentThread != nil && a.selectedMessageIdx >= 0
}

func (a *App) ExecuteAction(actionID string) error {
    defer func() {
        if a.window != nil {
            a.window.Invalidate()
        }
    }()

    switch actionID {
    case "compose_reply":
        msg := a.getSelectedMessage()
        a.openComposeModal(ComposeModeReply, msg)
    case "compose_new_thread":
        a.openComposeModal(ComposeModeNewThread, nil)
    // ... more actions
    }

    return nil
}

// Keyboard event handler (needs to be added to GUI)
func (a *App) handleKeyboard(gtx layout.Context) {
    for {
        ev, ok := gtx.Event(...)
        if !ok {
            break
        }

        if e, ok := ev.(key.Event); ok && e.State == key.Press {
            keyStr := a.keyEventToString(e)

            // Find matching command
            for _, cmd := range commands.SharedCommands {
                if a.keyMatches(keyStr, cmd.Keys) && a.commandAvailable(cmd) {
                    a.ExecuteAction(cmd.ActionID)
                    break
                }
            }
        }
    }
}
```

## Action ID Naming Convention

Action IDs should be descriptive and follow these patterns:

- **Navigation**: `navigate_up`, `navigate_down`, `select`, `go_back`
- **Composition**: `compose_new_thread`, `compose_reply`, `compose_edit`
- **Sending**: `send_message`, `cancel_compose`
- **View Changes**: `open_channel`, `open_thread`, `close_view`
- **Admin**: `admin_panel`, `create_channel`, `ban_user`
- **User**: `change_nickname`, `change_password`, `register`
- **System**: `help`, `quit`, `server_list`

## Command List

### Global Commands (Available Everywhere)

| Keys | Name | Action ID | Description |
|------|------|-----------|-------------|
| `h`, `?` | Help | `help` | Show keyboard shortcuts |
| `q` | Quit | `quit` | Exit application |
| `Ctrl+L` | Server List | `server_list` | List available servers |

### Navigation Commands

| Keys | Name | Action ID | Views | Description |
|------|------|-----------|-------|-------------|
| `↑`, `k` | Up | `navigate_up` | All | Move selection up |
| `↓`, `j` | Down | `navigate_down` | All | Move selection down |
| `Enter` | Select | `select` | ChannelList, ThreadList | Select item |
| `Esc` | Back | `go_back` | All except ChannelList | Go back / Close modal |

### Messaging Commands

| Keys | Name | Action ID | Views | Availability |
|------|------|-----------|-------|--------------|
| `n` | New Thread | `compose_new_thread` | ThreadList | Always |
| `r` | Reply | `compose_reply` | ThreadView | When message selected |
| `Ctrl+D`, `Ctrl+Enter` | Send | `send_message` | Compose Modal | When has content |
| `e` | Edit | `compose_edit` | ThreadView | When own message selected |
| `d` | Delete | `delete_message` | ThreadView | When own message selected |

### Admin Commands

| Keys | Name | Action ID | Views | Availability |
|------|------|-----------|-------|--------------|
| `a` | Admin Panel | `admin_panel` | All | When is admin |
| `c` | Create Channel | `create_channel` | ChannelList | When is admin |

## Implementation Checklist

### Phase 1: Foundation ✅

- [x] Create `pkg/client/commands/views.go` with shared view/modal constants
- [x] Create `pkg/client/commands/executor.go` with `CommandExecutor` interface
- [x] Create `pkg/client/commands/shared.go` with `CommandDefinition` struct
- [x] Define initial set of shared commands (navigation + messaging)
- [x] Add helper functions for key matching and command availability

### Phase 2: Terminal Client Integration ✅

- [x] Update `pkg/client/ui/model.go` to implement `CommandExecutor` interface
- [x] Add `ExecuteAction()` method that maps action IDs to existing functionality
- [x] Update `handleKeyPress()` to check shared commands first
- [ ] Verify all existing keyboard shortcuts still work (needs testing)
- [x] Update help modal to use shared command definitions
- [ ] Remove duplicate command definitions from terminal client (future cleanup)

### Phase 3: GUI Client Integration ✅

- [x] Add keyboard event handling infrastructure to GUI client
- [x] Update `cmd/client-gui/ui/app.go` to implement `CommandExecutor` interface
- [x] Add `ExecuteAction()` method with GUI-specific implementations
- [x] Add keyboard event loop in `Layout()` method
- [x] Add key-to-string conversion helper for Gio key events
- [x] Fix window invalidation in event loop for keyboard events
- [x] Test keyboard shortcuts in GUI - **Working!**
- [ ] Add message selection tracking in thread view (for "r" reply key) (future enhancement)

### Phase 4: Feature Parity

- [ ] Implement `navigate_up` and `navigate_down` in GUI (cursor keys)
- [ ] Implement `select` in GUI (Enter to select items)
- [ ] Implement `go_back` in GUI (Esc to close modals/views)
- [ ] Implement `compose_new_thread` in GUI (already works via button)
- [ ] Implement `compose_reply` in GUI (already works via button)
- [ ] Implement `send_message` in GUI (Ctrl+D/Ctrl+Enter in compose)
- [ ] Implement `help` modal in GUI
- [ ] Implement `quit` in GUI (q key)

### Phase 5: Advanced Commands

- [ ] Add edit message command (`e` key)
- [ ] Add delete message command (`d` key)
- [ ] Add admin panel command (`a` key, admin only)
- [ ] Add create channel command (`c` key, admin only)
- [ ] Add server selector command (Ctrl+L)

### Phase 6: Testing & Documentation

- [ ] Test all commands in terminal client
- [ ] Test all commands in GUI client
- [ ] Verify help text is consistent between clients
- [ ] Update `docs/IMPROVEMENTS_ROADMAP.md` with keyboard navigation status
- [ ] Document how to add new commands (examples for both clients)
- [ ] Add unit tests for command availability logic

## Adding New Commands

### Step 1: Define the Command

Add to `pkg/client/commands/shared.go`:

```go
{
    Keys:        []string{"x"},
    Name:        "New Feature",
    HelpText:    "Description of what this does",
    Scope:       ScopeView,
    ViewStates:  []ViewID{ViewThreadView},
    ActionID:    "new_feature",
    IsAvailable: func(e CommandExecutor) bool {
        return e.SomeCondition()
    },
    Priority:    100,
}
```

### Step 2: Update CommandExecutor Interface

Add state query method if needed:

```go
type CommandExecutor interface {
    // ... existing methods
    SomeCondition() bool  // For IsAvailable check
}
```

### Step 3: Implement in Both Clients

**Terminal Client** (`pkg/client/ui/model.go`):
```go
func (m Model) SomeCondition() bool {
    return m.someState != nil
}

func (m Model) ExecuteAction(actionID string) error {
    switch actionID {
    // ... existing cases
    case "new_feature":
        return m.doNewFeature()
    }
}
```

**GUI Client** (`cmd/client-gui/ui/app.go`):
```go
func (a *App) SomeCondition() bool {
    return a.someState != nil
}

func (a *App) ExecuteAction(actionID string) error {
    switch actionID {
    // ... existing cases
    case "new_feature":
        a.doNewFeature()
        return nil
    }
}
```

### Step 4: Test Both Clients

- Test keyboard shortcut works in terminal client
- Test keyboard shortcut works in GUI client
- Verify availability condition works correctly
- Check help modal shows the command

## Benefits

1. **Single Source of Truth**: Key bindings defined once, used everywhere
2. **Consistency**: Both clients have identical keyboard shortcuts
3. **Type Safety**: Interface enforces implementation in both clients
4. **Discoverability**: Shared help text ensures consistent documentation
5. **Maintainability**: Adding a new command requires updating one place
6. **Testing**: Can test command definitions independently of UI

## Migration Strategy

The terminal client already has a command system (`commands.Registry`). We'll keep it for now and gradually migrate:

1. **Phase 1**: Create shared system alongside existing terminal system
2. **Phase 2**: Terminal client checks shared commands first, falls back to existing
3. **Phase 3**: Migrate terminal commands one-by-one to shared system
4. **Phase 4**: Remove old terminal-specific command system

This allows incremental migration without breaking existing functionality.
