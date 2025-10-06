package ui

import (
	"time"

	"github.com/aeolun/superchat/pkg/client"
	"github.com/aeolun/superchat/pkg/client/ui/commands"
	"github.com/aeolun/superchat/pkg/client/ui/modal"
	"github.com/aeolun/superchat/pkg/protocol"
	"github.com/aeolun/superchat/pkg/updater"
	"github.com/charmbracelet/bubbles/viewport"
	tea "github.com/charmbracelet/bubbletea"
)

// ViewState represents the current view
type ViewState int

const (
	ViewSplash ViewState = iota
	ViewNicknameSetup
	ViewChannelList
	ViewThreadList
	ViewThreadView
	ViewCompose
	ViewHelp
)

// ConnectionState represents the connection status
type ConnectionState int

const (
	StateConnected ConnectionState = iota
	StateDisconnected
	StateReconnecting
)

// AuthState represents the authentication status
type AuthState int

const (
	AuthStateNone AuthState = iota       // No auth attempted
	AuthStatePrompting                    // Password modal shown
	AuthStateAuthenticating               // Waiting for server response
	AuthStateAuthenticated                // Successfully authenticated
	AuthStateFailed                       // Last attempt failed
	AuthStateAnonymous                    // Explicitly chose anonymous
	AuthStateRegistering                  // Registration in progress
)

// Model represents the application state
type Model struct {
	// Connection and state
	conn             client.ConnectionInterface
	state            client.StateInterface
	connectionState  ConnectionState
	reconnectAttempt int

	// Current view and modals
	mainView    MainView
	modalStack  modal.ModalStack
	currentView ViewState // DEPRECATED: will be removed during migration

	// Server state
	serverConfig   *protocol.ServerConfigMessage
	channels       []protocol.Channel
	currentChannel *protocol.Channel
	threads        []protocol.Message // Root messages
	currentThread  *protocol.Message
	threadReplies  []protocol.Message // All replies in current thread
	onlineUsers    uint32
	loadingMore    bool // True if we're currently loading more threads
	allThreadsLoaded bool // True if we've reached the end of threads

	// UI state
	width              int
	height             int
	channelCursor      int
	threadCursor       int
	replyCursor        int
	threadViewport     viewport.Model  // Viewport for thread view
	threadListViewport viewport.Model  // Viewport for thread list
	newMessageIDs      map[uint64]bool // Track new messages in current thread
	confirmingDelete   bool
	pendingDeleteID    uint64

	// Input state
	nickname         string
	userID           *uint64   // Set when authenticated (V2), nil for anonymous
	composeInput     string
	composeCursor    int
	composeMode      ComposeMode
	composeParentID  *uint64
	composeMessageID *uint64   // Message ID when editing
	returnToView     ViewState // Where to return after nickname setup

	// Auth state (V2)
	authState           AuthState
	passwordInput       []byte    // Temporary, cleared after use
	passwordCursor      int
	authAttempts        int
	authCooldownUntil   time.Time
	authErrorMessage    string

	// Registration state (V2)
	registrationMode    bool
	regPasswordInput    []byte
	regPasswordCursor   int
	regConfirmInput     []byte
	regConfirmCursor    int
	regErrorMessage     string

	// Nickname change state
	nicknameChangeMode  bool
	nicknameChangeInput string
	nicknameChangeError string

	// Error and status
	errorMessage  string
	statusMessage string
	showHelp      bool
	firstRun      bool

	// Version tracking
	currentVersion  string
	latestVersion   string
	updateAvailable bool

	// Real-time updates
	pendingUpdates []protocol.Message

	// Keepalive
	lastPingSent time.Time
	pingInterval time.Duration

	// Command system
	commands *commands.Registry
}

// ComposeMode indicates what we're composing
type ComposeMode int

const (
	ComposeModeNewThread ComposeMode = iota
	ComposeModeReply
	ComposeModeEdit
)

// NewModel creates a new application model
func NewModel(conn client.ConnectionInterface, state client.StateInterface, currentVersion string) Model {
	firstRun := state.GetFirstRun()
	initialView := ViewChannelList
	initialMainView := MainViewChannelList
	if firstRun {
		initialView = ViewSplash
		initialMainView = MainViewSplash
	}

	nickname := state.GetLastNickname()
	userID := state.GetUserID()

	m := Model{
		conn:             conn,
		state:            state,
		connectionState:  StateConnected,
		reconnectAttempt: 0,
		mainView:         initialMainView,
		modalStack:       modal.ModalStack{},
		currentView:      initialView, // DEPRECATED
		firstRun:         firstRun,
		nickname:         nickname,
		userID:           userID,
		currentVersion:   currentVersion,
		channels:         []protocol.Channel{},
		threads:          []protocol.Message{},
		threadReplies:    []protocol.Message{},
		newMessageIDs:    make(map[uint64]bool),
		pingInterval:     18 * time.Second, // Send ping every 18 seconds (3 pings within 60s timeout)
		lastPingSent:     time.Now(),
	}

	// Initialize command registry
	m.commands = commands.NewRegistry()
	m.registerCommands()

	return m
}

// registerCommands sets up all keyboard commands
func (m *Model) registerCommands() {
	// === Global Commands ===

	// Quit application
	m.commands.Register(commands.NewCommand().
		Keys("q").
		Name("Quit").
		Help("Quit the application").
		Global().
		When(func(i interface{}) bool {
			model := i.(*Model)
			return model.currentView != ViewCompose && model.currentView != ViewNicknameSetup
		}).
		Do(func(i interface{}) (interface{}, tea.Cmd) {
			return i, tea.Quit
		}).
		Priority(900).
		Build())

	// Toggle help
	m.commands.Register(commands.NewCommand().
		Keys("h", "?").
		Name("Help").
		Help("Toggle help screen").
		Global().
		InModals(modal.ModalNone). // Only available when no modal is open
		When(func(i interface{}) bool {
			model := i.(*Model)
			return model.currentView != ViewCompose && model.currentView != ViewNicknameSetup
		}).
		Do(func(i interface{}) (interface{}, tea.Cmd) {
			model := i.(*Model)
			// Generate help content for current context
			helpContent := model.commands.GenerateHelp(int(model.currentView), model.modalStack.TopType(), model)
			helpModal := modal.NewHelpModal(helpContent)
			model.modalStack.Push(helpModal)
			return model, nil
		}).
		Priority(950).
		Build())

	// Close help overlay with ESC - now handled by HelpModal itself

	// === ThreadView Commands ===

	// Navigate up
	m.commands.Register(commands.NewCommand().
		Keys("up", "k").
		Name("Navigate").
		Help("Move selection up").
		InViews(int(ViewThreadView)).
		Do(func(i interface{}) (interface{}, tea.Cmd) {
			model := i.(*Model)
			if model.replyCursor > 0 {
				model.replyCursor--
				model.markCurrentMessageAsRead()
				model.threadViewport.SetContent(model.buildThreadContent())
				model.scrollToKeepCursorVisible()
			}
			return model, nil
		}).
		Priority(10).
		Build())

	// Navigate down
	m.commands.Register(commands.NewCommand().
		Keys("down", "j").
		Name("Navigate").
		Help("Move selection down").
		InViews(int(ViewThreadView)).
		Do(func(i interface{}) (interface{}, tea.Cmd) {
			model := i.(*Model)
			if model.replyCursor < len(model.threadReplies) {
				model.replyCursor++
				model.markCurrentMessageAsRead()
				model.threadViewport.SetContent(model.buildThreadContent())
				model.scrollToKeepCursorVisible()
			}
			return model, nil
		}).
		Priority(10).
		Build())

	// Reply to message
	m.commands.Register(commands.NewCommand().
		Keys("r").
		Name("Reply").
		Help("Reply to the selected message").
		InViews(int(ViewThreadView)).
		Do(func(i interface{}) (interface{}, tea.Cmd) {
			model := i.(*Model)
			var parentID uint64
			if model.replyCursor == 0 {
				if model.currentThread != nil {
					parentID = model.currentThread.ID
				}
			} else if model.replyCursor-1 < len(model.threadReplies) {
				parentID = model.threadReplies[model.replyCursor-1].ID
			}

			if model.nickname == "" {
				model.composeMode = ComposeModeReply
				model.composeParentID = &parentID
				model.composeInput = ""
				model.returnToView = ViewCompose
				model.currentView = ViewNicknameSetup
				return model, nil
			}

			model.currentView = ViewCompose
			model.composeMode = ComposeModeReply
			model.composeParentID = &parentID
			model.composeInput = ""
			return model, nil
		}).
		Priority(20).
		Build())

	// Edit message
	m.commands.Register(commands.NewCommand().
		Keys("e").
		Name("Edit").
		Help("Edit your own message").
		InViews(int(ViewThreadView)).
		When(func(i interface{}) bool {
			model := i.(*Model)
			msg, ok := model.selectedMessage()
			if !ok {
				return false
			}
			if isDeletedMessageContent(msg.Content) {
				return false
			}

			// Only registered users can edit messages (anonymous messages cannot be edited)
			if msg.AuthorUserID == nil {
				return false
			}

			// Check if we're authenticated and own this message
			if model.userID == nil {
				return false
			}
			return *model.userID == *msg.AuthorUserID
		}).
		Do(func(i interface{}) (interface{}, tea.Cmd) {
			model := i.(*Model)
			msg, _ := model.selectedMessage()
			model.currentView = ViewCompose
			model.composeMode = ComposeModeEdit
			model.composeInput = msg.Content
			model.composeMessageID = &msg.ID
			model.composeParentID = nil
			return model, nil
		}).
		Priority(30).
		Build())

	// Delete message
	m.commands.Register(commands.NewCommand().
		Keys("d").
		Name("Delete").
		Help("Delete your own message").
		InViews(int(ViewThreadView)).
		When(func(i interface{}) bool {
			model := i.(*Model)
			msg, ok := model.selectedMessage()
			if !ok {
				return false
			}
			if isDeletedMessageContent(msg.Content) {
				return false
			}

			// Only registered users can delete messages (anonymous messages cannot be deleted)
			if msg.AuthorUserID == nil {
				return false
			}

			// Check if we're authenticated and own this message
			if model.userID == nil {
				return false
			}
			return *model.userID == *msg.AuthorUserID
		}).
		Do(func(i interface{}) (interface{}, tea.Cmd) {
			model := i.(*Model)
			msg, _ := model.selectedMessage()

			// Create delete confirmation modal
			deleteModal := modal.NewDeleteConfirmModal(
				msg.ID,
				func(msgID uint64) tea.Cmd {
					model.statusMessage = "Deleting message..."
					return tea.Batch(
						listenForServerFrames(model.conn),
						model.sendDeleteMessage(msgID),
					)
				},
				func() tea.Cmd {
					model.statusMessage = "Deletion canceled"
					return nil
				},
			)
			model.modalStack.Push(deleteModal)
			model.statusMessage = ""
			return model, nil
		}).
		Priority(40).
		Build())

	// Back to thread list
	m.commands.Register(commands.NewCommand().
		Keys("esc").
		Name("Back").
		Help("Return to thread list").
		InViews(int(ViewThreadView)).
		InModals(modal.ModalNone). // Only available when no modal is open
		When(func(i interface{}) bool {
			// Always available when no modal is open
			return true
		}).
		Do(func(i interface{}) (interface{}, tea.Cmd) {
			model := i.(*Model)
			model.currentView = ViewThreadList
			var cmd tea.Cmd
			if model.currentThread != nil {
				cmd = model.sendUnsubscribeThread(model.currentThread.ID)
			}
			model.threadReplies = []protocol.Message{}
			model.replyCursor = 0
			model.confirmingDelete = false
			model.pendingDeleteID = 0
			return model, cmd
		}).
		Priority(800).
		Build())

	// === ThreadList Commands ===

	// Navigate up in thread list
	m.commands.Register(commands.NewCommand().
		Keys("up", "k").
		Name("Navigate").
		Help("Move selection up").
		InViews(int(ViewThreadList)).
		Do(func(i interface{}) (interface{}, tea.Cmd) {
			model := i.(*Model)
			if model.threadCursor > 0 {
				model.threadCursor--
				model.threadListViewport.SetContent(model.buildThreadListContent())
				model.scrollThreadListToKeepCursorVisible()
			}
			return model, nil
		}).
		Priority(10).
		Build())

	// Navigate down in thread list
	m.commands.Register(commands.NewCommand().
		Keys("down", "j").
		Name("Navigate").
		Help("Move selection down").
		InViews(int(ViewThreadList)).
		Do(func(i interface{}) (interface{}, tea.Cmd) {
			model := i.(*Model)
			if model.threadCursor < len(model.threads)-1 {
				model.threadCursor++
				model.threadListViewport.SetContent(model.buildThreadListContent())
				model.scrollThreadListToKeepCursorVisible()

				// Load more threads if needed
				if !model.loadingMore && !model.allThreadsLoaded && len(model.threads) > 0 {
					remainingThreads := len(model.threads) - model.threadCursor - 1
					if remainingThreads <= 25 {
						model.loadingMore = true
						return model, model.loadMoreThreads()
					}
				}
			}
			return model, nil
		}).
		Priority(10).
		Build())

	// Open thread
	m.commands.Register(commands.NewCommand().
		Keys("enter").
		Name("Open").
		Help("Open the selected thread").
		InViews(int(ViewThreadList)).
		Do(func(i interface{}) (interface{}, tea.Cmd) {
			model := i.(*Model)
			if model.threadCursor < len(model.threads) {
				selectedThread := model.threads[model.threadCursor]
				model.currentThread = &selectedThread
				model.currentView = ViewThreadView
				model.replyCursor = 0
				model.newMessageIDs = make(map[uint64]bool)
				model.confirmingDelete = false
				model.threadViewport.SetContent(model.buildThreadContent())
				model.threadViewport.GotoTop()
				return model, tea.Batch(
					model.requestThreadReplies(selectedThread.ID),
					model.sendSubscribeThread(selectedThread.ID),
				)
			}
			return model, nil
		}).
		Priority(50).
		Build())

	// New thread
	m.commands.Register(commands.NewCommand().
		Keys("n").
		Name("New Thread").
		Help("Create a new thread").
		InViews(int(ViewThreadList)).
		Do(func(i interface{}) (interface{}, tea.Cmd) {
			model := i.(*Model)
			if model.nickname == "" {
				model.composeMode = ComposeModeNewThread
				model.composeInput = ""
				model.composeParentID = nil
				model.returnToView = ViewCompose
				model.currentView = ViewNicknameSetup
				return model, nil
			}
			model.currentView = ViewCompose
			model.composeMode = ComposeModeNewThread
			model.composeInput = ""
			model.composeParentID = nil
			return model, nil
		}).
		Priority(60).
		Build())

	// Refresh thread list
	m.commands.Register(commands.NewCommand().
		Keys("r").
		Name("Refresh").
		Help("Refresh the thread list").
		InViews(int(ViewThreadList)).
		Do(func(i interface{}) (interface{}, tea.Cmd) {
			model := i.(*Model)
			if model.currentChannel != nil {
				return model, model.requestThreadList(model.currentChannel.ID)
			}
			return model, nil
		}).
		Priority(70).
		Build())

	// Back to channel list
	m.commands.Register(commands.NewCommand().
		Keys("esc").
		Name("Back").
		Help("Return to channel list").
		InViews(int(ViewThreadList)).
		Do(func(i interface{}) (interface{}, tea.Cmd) {
			model := i.(*Model)
			model.currentView = ViewChannelList
			model.confirmingDelete = false
			var cmd tea.Cmd
			if model.currentChannel != nil {
				cmd = tea.Batch(
					model.sendLeaveChannel(),
					model.sendUnsubscribeChannel(model.currentChannel.ID),
				)
			}
			model.currentChannel = nil
			model.threads = []protocol.Message{}
			model.threadCursor = 0
			model.loadingMore = false
			model.allThreadsLoaded = false
			return model, cmd
		}).
		Priority(800).
		Build())

	// === ChannelList Commands ===

	// Navigate up in channel list
	m.commands.Register(commands.NewCommand().
		Keys("up", "k").
		Name("Navigate").
		Help("Move selection up").
		InViews(int(ViewChannelList)).
		Do(func(i interface{}) (interface{}, tea.Cmd) {
			model := i.(*Model)
			if model.channelCursor > 0 {
				model.channelCursor--
			}
			return model, nil
		}).
		Priority(10).
		Build())

	// Navigate down in channel list
	m.commands.Register(commands.NewCommand().
		Keys("down", "j").
		Name("Navigate").
		Help("Move selection down").
		InViews(int(ViewChannelList)).
		Do(func(i interface{}) (interface{}, tea.Cmd) {
			model := i.(*Model)
			if model.channelCursor < len(model.channels)-1 {
				model.channelCursor++
			}
			return model, nil
		}).
		Priority(10).
		Build())

	// Select channel
	m.commands.Register(commands.NewCommand().
		Keys("enter").
		Name("Select").
		Help("Select the channel").
		InViews(int(ViewChannelList)).
		Do(func(i interface{}) (interface{}, tea.Cmd) {
			model := i.(*Model)
			if model.channelCursor < len(model.channels) {
				selectedChannel := model.channels[model.channelCursor]
				model.currentChannel = &selectedChannel
				model.currentView = ViewThreadList
				model.loadingMore = false
				model.allThreadsLoaded = false
				return model, tea.Batch(
					model.sendJoinChannel(selectedChannel.ID),
					model.requestThreadList(selectedChannel.ID),
					model.sendSubscribeChannel(selectedChannel.ID),
				)
			}
			return model, nil
		}).
		Priority(50).
		Build())

	// Refresh channel list
	m.commands.Register(commands.NewCommand().
		Keys("r").
		Name("Refresh").
		Help("Refresh the channel list").
		InViews(int(ViewChannelList)).
		Do(func(i interface{}) (interface{}, tea.Cmd) {
			model := i.(*Model)
			return model, model.requestChannelList()
		}).
		Priority(70).
		Build())

	// === Password Modal Commands ===

	// Submit password (Enter)
	m.commands.Register(commands.NewCommand().
		Keys("enter").
		Name("Authenticate").
		Help("Submit password").
		Global().
		When(func(i interface{}) bool {
			model := i.(*Model)
			return model.authState == AuthStatePrompting &&
			       time.Now().After(model.authCooldownUntil)
		}).
		Do(func(i interface{}) (interface{}, tea.Cmd) {
			model := i.(*Model)
			if len(model.passwordInput) == 0 {
				model.authErrorMessage = "Password cannot be empty"
				return model, nil
			}
			model.authState = AuthStateAuthenticating
			model.authErrorMessage = ""
			passwordCopy := make([]byte, len(model.passwordInput))
			copy(passwordCopy, model.passwordInput)
			return model, model.sendAuthRequest(passwordCopy)
		}).
		Priority(1).
		Build())

	// Cancel password modal (ESC)
	m.commands.Register(commands.NewCommand().
		Keys("esc").
		Name("Cancel").
		Help("Browse anonymously").
		Global().
		When(func(i interface{}) bool {
			model := i.(*Model)
			return model.authState == AuthStatePrompting
		}).
		Do(func(i interface{}) (interface{}, tea.Cmd) {
			model := i.(*Model)
			// Clear password
			for i := range model.passwordInput {
				model.passwordInput[i] = 0
			}
			model.passwordInput = []byte{}
			model.authState = AuthStateAnonymous
			model.authErrorMessage = ""
			// Set a different nickname to continue as anonymous
			model.nickname = ""
			model.currentView = ViewNicknameSetup
			return model, nil
		}).
		Priority(1).
		Build())

	// === Registration Modal Commands ===

	// Tab to switch fields
	m.commands.Register(commands.NewCommand().
		Keys("tab").
		Name("Next Field").
		Help("Switch to next field").
		Global().
		When(func(i interface{}) bool {
			model := i.(*Model)
			return model.registrationMode
		}).
		Do(func(i interface{}) (interface{}, tea.Cmd) {
			model := i.(*Model)
			if model.regPasswordCursor == 0 {
				model.regPasswordCursor = 1
			} else {
				model.regPasswordCursor = 0
			}
			return model, nil
		}).
		Priority(1).
		Build())

	// Submit registration (Enter)
	m.commands.Register(commands.NewCommand().
		Keys("enter").
		Name("Register").
		Help("Submit registration").
		Global().
		When(func(i interface{}) bool {
			model := i.(*Model)
			return model.registrationMode
		}).
		Do(func(i interface{}) (interface{}, tea.Cmd) {
			model := i.(*Model)

			// Validate password length
			if len(model.regPasswordInput) < 8 {
				model.regErrorMessage = "Password must be at least 8 characters"
				return model, nil
			}

			// Validate passwords match
			if string(model.regPasswordInput) != string(model.regConfirmInput) {
				model.regErrorMessage = "Passwords do not match"
				return model, nil
			}

			model.authState = AuthStateRegistering
			model.regErrorMessage = ""
			passwordCopy := make([]byte, len(model.regPasswordInput))
			copy(passwordCopy, model.regPasswordInput)
			return model, model.sendRegisterUser(passwordCopy)
		}).
		Priority(1).
		Build())

	// Cancel registration (ESC)
	m.commands.Register(commands.NewCommand().
		Keys("esc").
		Name("Cancel").
		Help("Cancel registration").
		Global().
		When(func(i interface{}) bool {
			model := i.(*Model)
			return model.registrationMode
		}).
		Do(func(i interface{}) (interface{}, tea.Cmd) {
			model := i.(*Model)
			// Clear password inputs
			for i := range model.regPasswordInput {
				model.regPasswordInput[i] = 0
			}
			for i := range model.regConfirmInput {
				model.regConfirmInput[i] = 0
			}
			model.regPasswordInput = []byte{}
			model.regConfirmInput = []byte{}
			model.registrationMode = false
			model.regErrorMessage = ""
			return model, nil
		}).
		Priority(1).
		Build())

	// Ctrl+R to open registration modal
	m.commands.Register(commands.NewCommand().
		Keys("ctrl+r").
		Name("Register").
		Help("Register this nickname").
		Global().
		When(func(i interface{}) bool {
			model := i.(*Model)
			// Allow registration for any anonymous user with a nickname
			return model.authState == AuthStateAnonymous &&
			       model.nickname != "" &&
			       !model.registrationMode
		}).
		Do(func(i interface{}) (interface{}, tea.Cmd) {
			model := i.(*Model)
			model.registrationMode = true
			model.regPasswordInput = []byte{}
			model.regConfirmInput = []byte{}
			model.regPasswordCursor = 0
			model.regErrorMessage = ""
			return model, nil
		}).
		Priority(10).
		Build())

	// Ctrl+N to change nickname
	m.commands.Register(commands.NewCommand().
		Keys("ctrl+n").
		Name("Change Nick").
		Help("Change nickname").
		Global().
		When(func(i interface{}) bool {
			model := i.(*Model)
			// Allow nickname change when user has a nickname set
			return model.nickname != "" &&
			       !model.nicknameChangeMode &&
			       !model.registrationMode &&
			       model.authState != AuthStatePrompting
		}).
		Do(func(i interface{}) (interface{}, tea.Cmd) {
			model := i.(*Model)
			model.nicknameChangeMode = true
			model.nicknameChangeInput = model.nickname // Pre-fill with current nickname
			model.nicknameChangeError = ""
			return model, nil
		}).
		Priority(10).
		Build())

	// Submit nickname change (Enter)
	m.commands.Register(commands.NewCommand().
		Keys("enter").
		Name("Change Nickname").
		Help("Submit nickname change").
		Global().
		When(func(i interface{}) bool {
			model := i.(*Model)
			return model.nicknameChangeMode
		}).
		Do(func(i interface{}) (interface{}, tea.Cmd) {
			model := i.(*Model)
			if model.nicknameChangeInput == "" {
				model.nicknameChangeError = "Nickname cannot be empty"
				return model, nil
			}
			if model.nicknameChangeInput == model.nickname {
				model.nicknameChangeError = "That's already your nickname"
				return model, nil
			}
			model.nicknameChangeMode = false
			model.nickname = model.nicknameChangeInput
			return model, model.sendSetNickname()
		}).
		Priority(1).
		Build())

	// Cancel nickname change (ESC)
	m.commands.Register(commands.NewCommand().
		Keys("esc").
		Name("Cancel").
		Help("Cancel nickname change").
		Global().
		When(func(i interface{}) bool {
			model := i.(*Model)
			return model.nicknameChangeMode
		}).
		Do(func(i interface{}) (interface{}, tea.Cmd) {
			model := i.(*Model)
			model.nicknameChangeMode = false
			model.nicknameChangeInput = ""
			model.nicknameChangeError = ""
			return model, nil
		}).
		Priority(1).
		Build())
}

// Message types for bubbletea

// ServerFrameMsg wraps an incoming server frame
type ServerFrameMsg struct {
	Frame *protocol.Frame
}

// ErrorMsg represents an error
type ErrorMsg struct {
	Err error
}

// ConnectedMsg is sent when successfully connected or reconnected
type ConnectedMsg struct{}

// DisconnectedMsg is sent when connection is lost
type DisconnectedMsg struct {
	Err error
}

// ReconnectingMsg is sent when attempting to reconnect
type ReconnectingMsg struct {
	Attempt int
}

// TickMsg is sent periodically
type TickMsg time.Time

// VersionCheckMsg is sent with version check results
type VersionCheckMsg struct {
	LatestVersion   string
	UpdateAvailable bool
}

// WindowSizeMsg is sent when the terminal is resized
type WindowSizeMsg struct {
	Width  int
	Height int
}

// Init initializes the model
func (m Model) Init() tea.Cmd {
	cmds := []tea.Cmd{
		listenForServerFrames(m.conn),
		tickCmd(),
		checkForUpdates(m.currentVersion), // Check for updates in background
	}

	// If we're starting directly at channel list (not first run), request channels
	if m.currentView == ViewChannelList {
		cmds = append(cmds, m.requestChannelList())
		// Also send nickname if we have one
		if m.nickname != "" {
			cmds = append(cmds, m.sendSetNickname())
		}
	}

	return tea.Batch(cmds...)
}

// listenForServerFrames listens for incoming server frames and connection state changes
func listenForServerFrames(conn client.ConnectionInterface) tea.Cmd {
	return func() tea.Msg {
		select {
		case frame := <-conn.Incoming():
			return ServerFrameMsg{Frame: frame}
		case err := <-conn.Errors():
			return ErrorMsg{Err: err}
		case stateUpdate := <-conn.StateChanges():
			switch stateUpdate.State {
			case client.StateTypeConnected:
				return ConnectedMsg{}
			case client.StateTypeDisconnected:
				return DisconnectedMsg{Err: stateUpdate.Err}
			case client.StateTypeReconnecting:
				return ReconnectingMsg{Attempt: stateUpdate.Attempt}
			}
		}
		return nil
	}
}

// tickCmd returns a command that sends a tick message every second
func tickCmd() tea.Cmd {
	return tea.Tick(time.Second, func(t time.Time) tea.Msg {
		return TickMsg(t)
	})
}

// checkForUpdates checks for available updates in the background
func checkForUpdates(currentVersion string) tea.Cmd {
	return func() tea.Msg {
		// Check for updates in background (non-blocking)
		latestVersion, err := updater.CheckLatestVersion()
		if err != nil {
			// Silently fail - don't bother user with update check failures
			return nil
		}

		updateAvailable := updater.CompareVersions(currentVersion, latestVersion)

		return VersionCheckMsg{
			LatestVersion:   latestVersion,
			UpdateAvailable: updateAvailable,
		}
	}
}
