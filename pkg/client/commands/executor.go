// ABOUTME: CommandExecutor interface for shared command system
// ABOUTME: Both terminal and GUI clients implement this interface
package commands

// CommandExecutor is implemented by both terminal and GUI clients
// It provides state queries and action execution for keyboard commands
type CommandExecutor interface {
	// === State Queries (for IsAvailable checks) ===

	// View and modal state
	GetCurrentView() ViewID
	GetActiveModal() ModalType

	// Navigation state
	HasSelectedMessage() bool   // True if a message is selected in thread view
	HasSelectedChannel() bool   // True if a channel is selected
	HasSelectedThread() bool    // True if a thread is selected in thread list
	GetSelectedMessageIndex() int // Returns current message selection index (-1 if none)

	// Compose modal state
	IsComposing() bool         // True if compose modal is open
	HasComposeContent() bool   // True if compose editor has content

	// User permissions and state
	IsAdmin() bool             // True if current user is admin
	IsRegisteredUser() bool    // True if logged in (not anonymous)
	IsConnected() bool         // True if connected to server

	// Content state
	HasThreads() bool          // True if thread list has items
	HasChannels() bool         // True if channel list has items
	CanGoBack() bool           // True if back navigation is possible

	// === Action Execution ===

	// ExecuteAction performs the given action
	// Returns error if action is not implemented or fails
	// Terminal client: modifies model and returns tea.Cmd
	// GUI client: modifies app state and calls window.Invalidate()
	ExecuteAction(actionID string) error
}

// Standard action IDs (used by shared commands)
const (
	// Global actions
	ActionHelp       = "help"
	ActionQuit       = "quit"
	ActionServerList = "server_list"

	// Navigation actions
	ActionNavigateUp   = "navigate_up"
	ActionNavigateDown = "navigate_down"
	ActionSelect       = "select"
	ActionGoBack       = "go_back"

	// Messaging actions
	ActionComposeNewThread = "compose_new_thread"
	ActionComposeReply     = "compose_reply"
	ActionSendMessage      = "send_message"
	ActionCancelCompose    = "cancel_compose"
	ActionEditMessage      = "edit_message"
	ActionDeleteMessage    = "delete_message"

	// Admin actions
	ActionAdminPanel   = "admin_panel"
	ActionCreateChannel = "create_channel"
	ActionBanUser      = "ban_user"
	ActionUnbanUser    = "unban_user"

	// User actions
	ActionChangeNickname = "change_nickname"
	ActionChangePassword = "change_password"
	ActionRegister       = "register"
)
