package ui

import (
	"log"
	"strings"
	"time"

	"github.com/aeolun/superchat/pkg/client"
	"github.com/aeolun/superchat/pkg/client/ui/commands"
	"github.com/aeolun/superchat/pkg/client/ui/modal"
	"github.com/aeolun/superchat/pkg/protocol"
	"github.com/aeolun/superchat/pkg/updater"
	"github.com/charmbracelet/bubbles/spinner"
	"github.com/charmbracelet/bubbles/textarea"
	"github.com/charmbracelet/bubbles/viewport"
	tea "github.com/charmbracelet/bubbletea"
	"github.com/charmbracelet/lipgloss"
)

// ViewState represents the current view
type ViewState int

const (
	ViewSplash ViewState = iota
	ViewChannelList
	ViewThreadList
	ViewThreadView
	ViewChatChannel
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
	AuthStateNone           AuthState = iota // No auth attempted
	AuthStatePrompting                       // Password modal shown
	AuthStateAuthenticating                  // Waiting for server response
	AuthStateAuthenticated                   // Successfully authenticated
	AuthStateFailed                          // Last attempt failed
	AuthStateAnonymous                       // Explicitly chose anonymous
	AuthStateRegistering                     // Registration in progress
)

// Model represents the application state
type Model struct {
	// Connection and state
	conn                  client.ConnectionInterface
	state                 client.StateInterface
	connectionState       ConnectionState
	reconnectAttempt      int
	switchingMethod       bool   // True when user is trying a different connection method
	connGeneration        uint64 // Incremented each time we replace the connection

	// Directory mode (for server discovery)
	directoryMode      bool
	throttle           int
	logger             *log.Logger
	awaitingServerList bool                  // True when we've requested LIST_SERVERS
	availableServers   []protocol.ServerInfo // Servers from directory

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

	// Loading states
	loadingChannels      bool // True if fetching channel list
	loadingThreadList    bool // True if fetching initial thread list
	loadingThreadReplies bool // True if fetching thread replies
	loadingMore          bool // True if we're currently loading more threads
	loadingMoreReplies   bool // True if we're currently loading more replies
	sendingMessage       bool // True if posting/editing a message
	allThreadsLoaded     bool // True if we've reached the end of threads
	allRepliesLoaded     bool // True if we've reached the end of replies in current thread

	// UI state
	width              int
	height             int
	channelCursor      int
	threadCursor       int
	replyCursor        int
	threadViewport     viewport.Model  // Viewport for thread view
	threadListViewport viewport.Model  // Viewport for thread list
	chatViewport       viewport.Model  // Viewport for chat channel view
	splashViewport     viewport.Model  // Viewport for splash screen
	spinner            spinner.Model   // Loading spinner
	newMessageIDs      map[uint64]bool // Track new messages in current thread
	confirmingDelete   bool
	pendingDeleteID    uint64

	// Chat channel state
	chatMessages  []protocol.Message // Linear list of all messages in chat channel
	chatInput     string             // Current input in chat channel (deprecated - use chatTextarea)
	chatTextarea  textarea.Model     // Textarea for chat input
	loadingChat   bool               // True if loading chat messages
	allChatLoaded bool               // True if we've reached the beginning of chat history

	// Input state
	nickname             string
	pendingNickname      string  // Nickname we sent to server, waiting for confirmation
	nicknameIsRegistered bool    // True if current nickname belongs to a registered user
	userID               *uint64 // Set when authenticated (V2), nil for anonymous
	composeInput         string  // Temporary storage for compose state
	composeParentID      *uint64
	composeMessageID     *uint64 // Message ID when editing

	// Auth state (V2)
	authState         AuthState
	authAttempts      int       // For rate limiting
	authCooldownUntil time.Time // For rate limiting
	authErrorMessage  string    // For displaying errors in password modal

	// First post warning (session-level, resets on restart)
	firstPostWarningAskedThisSession bool // True if warning was shown this session

	// Initialization state machine
	initStateMachine *InitStateMachine

	// Error and status
	errorMessage           string
	statusMessage          string
	serverDisconnectReason string // Reason provided by server in DISCONNECT message
	showHelp               bool
	firstRun               bool

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

	// Bandwidth optimization
	threadRepliesCache     map[uint64][]protocol.Message // Cached thread replies
	threadHighestMessageID map[uint64]uint64             // Highest message ID seen per thread
}

// NewModel creates a new application model
func NewModel(conn client.ConnectionInterface, state client.StateInterface, currentVersion string, directoryMode bool, throttle int, logger *log.Logger, initialConnErr error) Model {

	firstRun := state.GetFirstRun()
	initialView := ViewChannelList
	initialMainView := MainViewChannelList
	if firstRun {
		initialView = ViewSplash
		initialMainView = MainViewSplash
	}

	nickname := state.GetLastNickname()
	userID := state.GetUserID()

	// Create spinner
	s := spinner.New()
	s.Spinner = spinner.Dot
	s.Style = Styles.Spinner

	// Create textarea for chat input
	ta := textarea.New()
	ta.Placeholder = "Type a message..."
	ta.Prompt = ""
	ta.CharLimit = 0 // No limit (server will enforce max message length)
	ta.SetWidth(80)  // Will be resized dynamically
	ta.SetHeight(3)
	ta.FocusedStyle.CursorLine = lipgloss.NewStyle() // Remove cursor line styling
	ta.ShowLineNumbers = false
	ta.KeyMap.InsertNewline.SetEnabled(false) // Disable multiline (Enter sends message)

	// Style the textarea with a border
	ta.FocusedStyle.Base = lipgloss.NewStyle().
		Border(lipgloss.RoundedBorder()).
		BorderForeground(lipgloss.Color("205")). // Primary color
		Padding(0, 1)
	ta.BlurredStyle.Base = lipgloss.NewStyle().
		Border(lipgloss.RoundedBorder()).
		BorderForeground(lipgloss.Color("240")). // Muted color
		Padding(0, 1)

	m := Model{
		conn:                   conn,
		state:                  state,
		connectionState:        StateConnected, // Always connected (either to directory or chat server)
		reconnectAttempt:       0,
		directoryMode:          directoryMode,
		throttle:               throttle,
		logger:                 logger,
		awaitingServerList:     false,
		availableServers:       nil,
		mainView:               initialMainView,
		modalStack:             modal.ModalStack{},
		currentView:            initialView, // DEPRECATED
		firstRun:               firstRun,
		nickname:               nickname,
		userID:                 userID,
		currentVersion:         currentVersion,
		channels:               []protocol.Channel{},
		threads:                []protocol.Message{},
		threadReplies:          []protocol.Message{},
		spinner:                s,
		chatTextarea:           ta,
		newMessageIDs:          make(map[uint64]bool),
		threadRepliesCache:     make(map[uint64][]protocol.Message),
		threadHighestMessageID: make(map[uint64]uint64),
		pingInterval:           18 * time.Second, // Send ping every 18 seconds (3 pings within 60s timeout)
		lastPingSent:           time.Now(),
	}

	// Initialize state machine - detect SSH connection by address prefix
	isSSH := strings.HasPrefix(conn.GetAddress(), "ssh://")
	m.initStateMachine = NewInitStateMachine(isSSH)

	// Initialize command registry
	m.commands = commands.NewRegistry()
	m.registerCommands()

	// If initial connection failed, show connection failed modal
	if initialConnErr != nil {
		// Show connection failed modal with retry/switch/quit options
		m.modalStack.Push(modal.NewConnectionFailedModal(conn.GetAddress(), initialConnErr.Error()))
		m.connectionState = StateDisconnected
	} else if directoryMode {
		// If in directory mode, show server selector immediately
		// Check if this is first launch (no saved server)
		savedServer, _ := state.GetConfig("directory_selected_server")
		isFirstLaunch := savedServer == ""
		connType := conn.GetConnectionType()
		m.modalStack.Push(modal.NewServerSelectorLoading(isFirstLaunch, connType))
		m.awaitingServerList = true
	}

	return m
}

// registerCommands sets up all keyboard commands
func (m *Model) registerCommands() {
	// === Global Commands ===

	// Quit application
	m.commands.Register(commands.NewCommand().
		Keys("q").
		Name("Quit").
		Aliases("Exit").
		Help("Quit the application").
		Global().
		InModals(modal.ModalNone). // Only available when no modal is open
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

	// Server selector
	m.commands.Register(commands.NewCommand().
		Keys("ctrl+l").
		Name("Server List").
		Help("List available servers").
		Global().
		InModals(modal.ModalNone). // Only available when no modal is open
		Do(func(i interface{}) (interface{}, tea.Cmd) {
			model := i.(*Model)
			// Show loading modal immediately and request server list
			// If server doesn't support directory, error will show in modal
			// Not first launch when using Ctrl+L (they're switching servers)
			connType := model.conn.GetConnectionType()
			serverModal := modal.NewServerSelectorLoading(false, connType)
			model.modalStack.Push(serverModal)
			return model, model.requestServerList()
		}).
		Priority(940).
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

				// Load more replies if needed
				if !model.loadingMoreReplies && !model.allRepliesLoaded && len(model.threadReplies) > 0 {
					remainingReplies := len(model.threadReplies) - model.replyCursor
					if remainingReplies <= 3 {
						model.loadingMoreReplies = true
						return model, model.loadMoreReplies()
					}
				}
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

			// Store parent ID for when compose modal sends
			model.composeParentID = &parentID

			if model.nickname == "" {
				// Need to set nickname first
				model.showNicknameSetupModal()
				return model, nil
			}

			model.showComposeWithWarning(modal.ComposeModeReply, "")
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

			// Store message ID for when compose modal sends
			model.composeMessageID = &msg.ID
			model.composeParentID = nil

			model.showComposeModal(modal.ComposeModeEdit, msg.Content)
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
						listenForServerFrames(model.conn, model.connGeneration),
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
			model.allRepliesLoaded = false
			model.loadingMoreReplies = false
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
				model.allRepliesLoaded = false // Reset pagination state

				// Check if we have cached data
				var cmd tea.Cmd
				if cachedReplies, ok := model.threadRepliesCache[selectedThread.ID]; ok {
					// Load cached replies immediately
					model.threadReplies = cachedReplies
					model.threadViewport.GotoTop()

					// Fetch only new messages since last cache (no loading indicator for incremental)
					highestID := model.threadHighestMessageID[selectedThread.ID]
					cmd = tea.Batch(
						model.requestThreadRepliesAfter(selectedThread.ID, highestID),
						model.sendSubscribeThread(selectedThread.ID),
					)
				} else {
					// No cache, fetch all from server
					model.loadingThreadReplies = true
					model.threadViewport.SetContent(model.buildThreadContent()) // Show initial spinner
					model.threadViewport.GotoTop()
					cmd = tea.Batch(
						model.requestThreadReplies(selectedThread.ID),
						model.sendSubscribeThread(selectedThread.ID),
					)
				}
				return model, cmd
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

			// Clear parent ID for new thread
			model.composeParentID = nil

			if model.nickname == "" {
				// Need to set nickname first
				model.showNicknameSetupModal()
				return model, nil
			}

			model.showComposeWithWarning(modal.ComposeModeNewThread, "")
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
				model.loadingThreadList = true
				model.threads = []protocol.Message{}                                // Clear threads
				model.threadListViewport.SetContent(model.buildThreadListContent()) // Show initial spinner
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

				// Check channel type and route to appropriate view
				if selectedChannel.Type == 0 {
					// Chat channel (type 0) - go to chat view
					model.currentView = ViewChatChannel
					model.loadingChat = true
					model.chatMessages = []protocol.Message{} // Clear chat messages
					model.chatTextarea.Reset()                // Clear textarea
					model.chatTextarea.Focus()                // Focus textarea for immediate typing
					model.chatViewport.SetContent(model.buildChatMessages())
					return model, tea.Batch(
						model.sendJoinChannel(selectedChannel.ID),
						model.requestChatMessages(selectedChannel.ID),
						model.sendSubscribeChannel(selectedChannel.ID),
						textarea.Blink, // Start cursor blinking
					)
				} else {
					// Forum channel (type 1) - go to thread list view
					model.currentView = ViewThreadList
					model.loadingMore = false
					model.allThreadsLoaded = false
					model.loadingThreadList = true
					model.threads = []protocol.Message{}                                // Clear threads
					model.threadListViewport.SetContent(model.buildThreadListContent()) // Show initial spinner
					return model, tea.Batch(
						model.sendJoinChannel(selectedChannel.ID),
						model.requestThreadList(selectedChannel.ID),
						model.sendSubscribeChannel(selectedChannel.ID),
					)
				}
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
			model.loadingChannels = true
			return model, model.requestChannelList()
		}).
		Priority(70).
		Build())

	// Create new channel
	m.commands.Register(commands.NewCommand().
		Keys("c").
		Name("Create Channel").
		Help("Create a new channel (registered users only)").
		InViews(int(ViewChannelList)).
		When(func(i interface{}) bool {
			model := i.(*Model)
			// Only allow channel creation for registered users
			return model.authState == AuthStateAuthenticated && model.userID != nil
		}).
		Do(func(i interface{}) (interface{}, tea.Cmd) {
			model := i.(*Model)
			model.showCreateChannelModal()
			return model, nil
		}).
		Priority(80).
		Build())

	// Ctrl+R to open registration modal
	m.commands.Register(commands.NewCommand().
		Keys("ctrl+r").
		Name("Register").
		Help("Register this nickname").
		Global().
		When(func(i interface{}) bool {
			model := i.(*Model)
			// Allow registration for anonymous users with a nickname that is NOT already registered
			return model.authState == AuthStateAnonymous &&
				model.nickname != "" &&
				!model.nicknameIsRegistered
		}).
		Do(func(i interface{}) (interface{}, tea.Cmd) {
			model := i.(*Model)
			model.showRegistrationModal()
			return model, nil
		}).
		Priority(10).
		Build())

	// Ctrl+S to sign in (when nickname is registered)
	m.commands.Register(commands.NewCommand().
		Keys("ctrl+s").
		Name("Sign In").
		Help("Sign in with password").
		Global().
		When(func(i interface{}) bool {
			model := i.(*Model)
			// Only for anonymous users with registered nickname
			return model.authState != AuthStateAuthenticated &&
				model.nickname != "" &&
				model.nicknameIsRegistered
		}).
		Do(func(i interface{}) (interface{}, tea.Cmd) {
			model := i.(*Model)
			model.showPasswordModal()
			return model, nil
		}).
		Priority(10).
		Build())

	// Ctrl+A to go anonymous
	m.commands.Register(commands.NewCommand().
		Keys("ctrl+a").
		Name("Go Anonymous").
		Help("Post anonymously").
		Global().
		When(func(i interface{}) bool {
			model := i.(*Model)
			// Only available when authenticated
			return model.authState == AuthStateAuthenticated
		}).
		Do(func(i interface{}) (interface{}, tea.Cmd) {
			model := i.(*Model)
			model.showGoAnonymousModal()
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
			return model.nickname != ""
		}).
		Do(func(i interface{}) (interface{}, tea.Cmd) {
			model := i.(*Model)
			model.showNicknameChangeModal()
			return model, nil
		}).
		Priority(10).
		Build())

	// Ctrl+K to manage SSH keys
	m.commands.Register(commands.NewCommand().
		Keys("ctrl+k").
		Name("SSH Keys").
		Help("Manage SSH keys").
		Global().
		When(func(i interface{}) bool {
			model := i.(*Model)
			// Only available when authenticated
			return model.authState == AuthStateAuthenticated
		}).
		Do(func(i interface{}) (interface{}, tea.Cmd) {
			model := i.(*Model)
			if model.logger != nil {
				model.logger.Printf("[DEBUG] Ctrl+K pressed, authState=%d, showing modal and requesting keys", model.authState)
			}
			// Show modal immediately with empty keys (loading state)
			model.showSSHKeyManagerModal(nil)
			// Request SSH key list from server
			return model, model.sendListSSHKeys()
		}).
		Priority(10).
		Build())

	// Admin panel with A key
	m.commands.Register(commands.NewCommand().
		Keys("A").
		Name("Admin Panel").
		Help("Open admin panel").
		Global().
		InModals(modal.ModalNone). // Only available when no modal is open
		Do(func(i interface{}) (interface{}, tea.Cmd) {
			model := i.(*Model)
			model.showAdminPanel()
			return model, nil
		}).
		Priority(910).
		Build())

	// Command palette with / (IRC-style)
	m.commands.Register(commands.NewCommand().
		Keys("/").
		Name("Command").
		Help("Open command palette (IRC-style)").
		Global().
		InModals(modal.ModalNone). // Only available when no modal is open
		Do(func(i interface{}) (interface{}, tea.Cmd) {
			model := i.(*Model)
			model.showCommandPalette("/")
			return model, nil
		}).
		Priority(930).
		Build())

	// Command palette with : (vim-style)
	m.commands.Register(commands.NewCommand().
		Keys(":").
		Name("Command").
		Help("Open command palette (vim-style)").
		Global().
		InModals(modal.ModalNone). // Only available when no modal is open
		Do(func(i interface{}) (interface{}, tea.Cmd) {
			model := i.(*Model)
			model.showCommandPalette(":")
			return model, nil
		}).
		Priority(920).
		Build())
}

// showCommandPalette displays the command palette modal
func (m *Model) showCommandPalette(prefix string) {
	// Get available command names for current context
	availableCommands := m.commands.GetCommandNames(int(m.currentView), m.modalStack.TopType(), m)

	commandPalette := modal.NewCommandPaletteModal(
		prefix,
		availableCommands,
		func(commandName string) tea.Cmd {
			// Return a message to execute the command in the main update loop
			// This allows the model to be properly updated
			return func() tea.Msg {
				return ExecuteCommandMsg{CommandName: commandName}
			}
		},
		func() tea.Cmd {
			// Canceled
			return nil
		},
	)
	m.modalStack.Push(commandPalette)
}

// Modal helper methods

// showPasswordModal displays the password authentication modal
func (m *Model) showPasswordModal() {
	passwordModal := modal.NewPasswordAuthModal(
		m.nickname,
		m.authErrorMessage,
		m.authCooldownUntil,
		false, // not authenticating initially
		func(password []byte) tea.Cmd {
			m.authState = AuthStateAuthenticating
			m.authErrorMessage = ""
			return m.sendAuthRequest(password)
		},
		func() tea.Cmd {
			// Browse anonymously - show nickname setup to pick a different name
			m.authState = AuthStateAnonymous
			m.nickname = ""
			m.showNicknameSetupModal()
			return nil
		},
	)
	m.modalStack.Push(passwordModal)
}

// showRegistrationModal displays the registration modal
func (m *Model) showRegistrationModal() {
	registrationModal := modal.NewRegistrationModal(
		m.nickname,
		func(password []byte) tea.Cmd {
			m.authState = AuthStateRegistering
			return m.sendRegisterUser(password)
		},
		func() tea.Cmd {
			// Canceled registration
			return nil
		},
	)
	m.modalStack.Push(registrationModal)
}

// showNicknameChangeModal displays the nickname change modal
func (m *Model) showNicknameChangeModal() {
	nicknameChangeModal := modal.NewNicknameChangeModal(
		m.nickname,
		func(newNickname string) tea.Cmd {
			// Don't modify m.nickname here due to bubbletea value semantics
			// It will be updated in handleNicknameResponse when server confirms
			m.state.SetLastNickname(newNickname)
			return tea.Batch(
				m.sendSetNicknameWith(newNickname),
				m.sendGetUserInfo(newNickname),
			)
		},
		func() tea.Cmd {
			// Canceled nickname change
			return nil
		},
	)
	m.modalStack.Push(nicknameChangeModal)
}

// showGoAnonymousModal displays a modal to go anonymous (for registered users)
func (m *Model) showGoAnonymousModal() {
	// Create a modal asking for new anonymous nickname
	nicknameModal := modal.NewNicknameChangeModal(
		"", // Don't pre-fill with current nickname
		func(newNickname string) tea.Cmd {
			// Clear authentication locally first
			m.userID = nil
			m.authState = AuthStateAnonymous
			m.state.SetUserID(nil)
			m.state.SetLastNickname(newNickname)

			// Send LOGOUT first, then SET_NICKNAME
			// TCP guarantees these arrive in order, so server will process LOGOUT before SET_NICKNAME
			return tea.Batch(
				m.sendLogout(),
				m.sendSetNicknameWith(newNickname),
			)
		},
		func() tea.Cmd {
			// Canceled
			return nil
		},
	)
	m.modalStack.Push(nicknameModal)
}

// showComposeModal displays the compose modal
func (m *Model) showComposeModal(mode modal.ComposeMode, initialContent string) {
	composeModal := modal.NewComposeModal(
		mode,
		initialContent,
		func(content string) tea.Cmd {
			// Determine what to do based on mode
			var cmd tea.Cmd
			m.sendingMessage = true
			if mode == modal.ComposeModeEdit {
				if m.composeMessageID != nil {
					cmd = m.sendEditMessage(*m.composeMessageID, content)
				}
			} else {
				if m.currentChannel != nil {
					cmd = m.sendPostMessage(m.currentChannel.ID, m.composeParentID, content)
				}
			}
			// Clear compose state
			m.composeInput = ""
			m.composeMessageID = nil
			m.composeParentID = nil
			m.statusMessage = m.spinner.View() + " Sending..."
			return cmd
		},
		func() tea.Cmd {
			// Canceled compose
			m.composeInput = ""
			m.composeMessageID = nil
			m.composeParentID = nil
			return nil
		},
	)
	m.modalStack.Push(composeModal)
}

// showNicknameSetupModal displays the nickname setup modal (first run or nickname needed)
func (m *Model) showNicknameSetupModal() {
	nicknameSetupModal := modal.NewNicknameSetupModal(
		m.nickname,
		func(nickname string) tea.Cmd {
			m.nickname = nickname
			m.state.SetLastNickname(nickname)
			if m.firstRun {
				m.state.SetFirstRunComplete()
				m.firstRun = false
			}
			return tea.Batch(
				m.sendSetNickname(),
				m.sendGetUserInfo(nickname),
			)
		},
		func() tea.Cmd {
			// Quit if they cancel nickname setup
			return tea.Quit
		},
	)
	m.modalStack.Push(nicknameSetupModal)
}

// showSSHKeyManagerModal displays the SSH key manager modal
func (m *Model) showSSHKeyManagerModal(keys []modal.SSHKeyInfo) {
	sshKeyManagerModal := modal.NewSSHKeyManagerModal(
		keys,
		func(publicKey, label string) tea.Cmd {
			// Send ADD_SSH_KEY request
			return m.sendAddSSHKey(publicKey, label)
		},
		func(keyID uint64, newLabel string) tea.Cmd {
			// Send UPDATE_SSH_KEY_LABEL request
			return m.sendUpdateSSHKeyLabel(keyID, newLabel)
		},
		func(keyID uint64) tea.Cmd {
			// Send DELETE_SSH_KEY request
			return m.sendDeleteSSHKey(keyID)
		},
		func() tea.Cmd {
			// Remove password (send CHANGE_PASSWORD with empty new password)
			return m.sendChangePassword([]byte{}, []byte{})
		},
		func() tea.Cmd {
			// Close modal
			return nil
		},
	)
	m.modalStack.Push(sshKeyManagerModal)
}

// showCreateChannelModal displays the channel creation modal
func (m *Model) showCreateChannelModal() {
	createChannelModal := modal.NewCreateChannelModal(
		func(name, displayName, description string, channelType uint8) tea.Cmd {
			m.statusMessage = "Creating channel..."
			return tea.Batch(
				listenForServerFrames(m.conn, m.connGeneration),
				m.sendCreateChannel(name, displayName, description, channelType),
			)
		},
		func() tea.Cmd {
			// Canceled channel creation
			return nil
		},
	)
	m.modalStack.Push(createChannelModal)
}

// showRegistrationWarningModal displays the first post warning modal
func (m *Model) showRegistrationWarningModal(onProceed func() tea.Cmd) {
	registrationWarningModal := modal.NewRegistrationWarningModal(
		func() tea.Cmd {
			// Post anonymously and don't ask again
			m.state.SetFirstPostWarningDismissed()
			m.firstPostWarningAskedThisSession = true
			if onProceed != nil {
				return onProceed()
			}
			return nil
		},
		func() tea.Cmd {
			// Post anonymously but ask again later
			m.firstPostWarningAskedThisSession = true
			if onProceed != nil {
				return onProceed()
			}
			return nil
		},
		func() tea.Cmd {
			// Register first
			m.showRegistrationModal()
			return nil
		},
		func() tea.Cmd {
			// Cancel posting
			return nil
		},
	)
	m.modalStack.Push(registrationWarningModal)
}

// shouldShowRegistrationWarning returns true if we should show the registration warning
func (m *Model) shouldShowRegistrationWarning() bool {
	// Don't show if user is authenticated (registered)
	if m.authState == AuthStateAuthenticated && m.userID != nil {
		return false
	}

	// Don't show if permanently dismissed
	if m.state.GetFirstPostWarningDismissed() {
		return false
	}

	// Don't show if already asked this session
	if m.firstPostWarningAskedThisSession {
		return false
	}

	return true
}

// Admin modal helper methods

// showAdminPanel displays the admin panel modal
func (m *Model) showAdminPanel() {
	m.modalStack.Push(m.createConfiguredAdminPanel())
}

// createConfiguredAdminPanel creates a fully configured admin panel
// This is used both when initially opening the panel and when returning from sub-modals
func (m *Model) createConfiguredAdminPanel() modal.Modal {
	adminPanel := modal.NewAdminPanelModal()

	// Wire up menu item actions to create modals with handlers
	adminPanel.SetMenuActions(
		func() (modal.Modal, tea.Cmd) { return m.createBanUserModal() },
		func() (modal.Modal, tea.Cmd) { return m.createBanIPModal() },
		func() (modal.Modal, tea.Cmd) { return m.createListUsersModal() },
		func() (modal.Modal, tea.Cmd) { return m.createUnbanModal() },
		func() (modal.Modal, tea.Cmd) { return m.createViewBansModal() },
		func() (modal.Modal, tea.Cmd) { return m.createDeleteUserModal() },
		func() (modal.Modal, tea.Cmd) { return m.createDeleteChannelModal() },
	)

	return adminPanel
}

// createBanUserModal creates a ban user modal with submit handler
func (m *Model) createBanUserModal() (modal.Modal, tea.Cmd) {
	banUserModal := modal.NewBanUserModal()
	banUserModal.SetSubmitHandler(func(msg *protocol.BanUserMessage) tea.Cmd {
		m.statusMessage = "Banning user..."
		return m.sendBanUser(msg)
	})
	return banUserModal, nil
}

// createBanIPModal creates a ban IP modal with submit handler
func (m *Model) createBanIPModal() (modal.Modal, tea.Cmd) {
	banIPModal := modal.NewBanIPModal()
	banIPModal.SetSubmitHandler(func(msg *protocol.BanIPMessage) tea.Cmd {
		m.statusMessage = "Banning IP..."
		return m.sendBanIP(msg)
	})
	return banIPModal, nil
}

// createUnbanModal creates an unban modal with submit handlers
func (m *Model) createUnbanModal() (modal.Modal, tea.Cmd) {
	unbanModal := modal.NewUnbanModal()
	unbanModal.SetSubmitHandlers(
		func(msg *protocol.UnbanUserMessage) tea.Cmd {
			m.statusMessage = "Unbanning user..."
			return m.sendUnbanUser(msg)
		},
		func(msg *protocol.UnbanIPMessage) tea.Cmd {
			m.statusMessage = "Unbanning IP..."
			return m.sendUnbanIP(msg)
		},
	)
	return unbanModal, nil
}

// createViewBansModal creates a view bans modal with refresh handler
func (m *Model) createViewBansModal() (modal.Modal, tea.Cmd) {
	viewBansModal := modal.NewViewBansModal()
	viewBansModal.SetRefreshHandler(func(includeExpired bool) tea.Cmd {
		return m.sendListBans(includeExpired)
	})
	// Return the modal with initial load command
	return viewBansModal, m.sendListBans(false)
}

// createListUsersModal creates a list users modal with handlers
func (m *Model) createListUsersModal() (modal.Modal, tea.Cmd) {
	listUsersModal := modal.NewListUsersModal()
	listUsersModal.SetRefreshHandler(func(includeOffline bool) tea.Cmd {
		return m.sendListUsers(includeOffline)
	})
	listUsersModal.SetBanUserHandler(func(nickname string) {
		// Create and push ban user modal with pre-filled nickname
		banModal, _ := m.createBanUserModal()
		if banUserModal, ok := banModal.(*modal.BanUserModal); ok {
			banUserModal.SetNickname(nickname)
		}
		m.modalStack.Push(banModal)
	})
	listUsersModal.SetDeleteUserHandler(func(nickname string) {
		// Create and push delete user modal with pre-filled nickname
		deleteModal, _ := m.createDeleteUserModal()
		if deleteUserModal, ok := deleteModal.(*modal.DeleteUserModal); ok {
			deleteUserModal.SetNickname(nickname)
		}
		m.modalStack.Push(deleteModal)
	})
	// Return the modal with initial load command (show all users by default)
	return listUsersModal, m.sendListUsers(true)
}

// createDeleteUserModal creates a delete user modal with submit handler
func (m *Model) createDeleteUserModal() (modal.Modal, tea.Cmd) {
	deleteUserModal := modal.NewDeleteUserModal()
	deleteUserModal.SetSubmitHandler(func(msg *protocol.DeleteUserMessage) tea.Cmd {
		m.statusMessage = "Deleting user..."
		return m.sendDeleteUser(msg)
	})
	return deleteUserModal, nil
}

// createDeleteChannelModal creates a delete channel modal with submit handler
func (m *Model) createDeleteChannelModal() (modal.Modal, tea.Cmd) {
	deleteChannelModal := modal.NewDeleteChannelModal()

	// Convert protocol.Channel to modal.ChannelInfo
	channels := make([]modal.ChannelInfo, len(m.channels))
	for i, ch := range m.channels {
		channels[i] = modal.ChannelInfo{
			ID:   ch.ID,
			Name: ch.Name,
		}
	}
	deleteChannelModal.SetChannels(channels)

	deleteChannelModal.SetSubmitHandler(func(msg *protocol.DeleteChannelMessage) tea.Cmd {
		m.statusMessage = "Deleting channel..."
		return m.sendDeleteChannel(msg)
	})
	return deleteChannelModal, nil
}

// showComposeWithWarning shows the compose modal, potentially with registration warning first
func (m *Model) showComposeWithWarning(mode modal.ComposeMode, initialContent string) {
	if m.shouldShowRegistrationWarning() {
		// Show warning modal first, then compose modal when user proceeds
		m.showRegistrationWarningModal(func() tea.Cmd {
			m.showComposeModal(mode, initialContent)
			return nil
		})
	} else {
		// Go directly to compose
		m.showComposeModal(mode, initialContent)
	}
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
	Err        error
	Generation uint64 // Which connection generation sent this message
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

// ConnectionAttemptResultMsg is sent when an async connection attempt completes
type ConnectionAttemptResultMsg struct {
	Success bool
	Method  string
	Error   error
}

// ExecuteCommandMsg is sent when a command should be executed (from command palette)
type ExecuteCommandMsg struct {
	CommandName string
}

// Init initializes the model
func (m Model) Init() tea.Cmd {
	cmds := []tea.Cmd{
		listenForServerFrames(m.conn, m.connGeneration), // Always listen for frames
		tickCmd(),
		m.spinner.Tick,
		checkForUpdates(m.currentVersion), // Check for updates in background
	}

	// If in directory mode, request server list (selector modal already shown in NewModel)
	if m.directoryMode {
		// Send LIST_SERVERS request
		cmds = append(cmds, m.requestServerList())
		return tea.Batch(cmds...)
	}

	// Normal mode: proceed with channel list
	// If we're starting directly at channel list (not first run), request channels
	if m.currentView == ViewChannelList {
		m.loadingChannels = true
		cmds = append(cmds, m.requestChannelList())
		// Don't send SET_NICKNAME here - wait for DelayedNicknameMsg after SERVER_CONFIG
	}

	return tea.Batch(cmds...)
}

// listenForServerFrames listens for incoming server frames and connection state changes
func listenForServerFrames(conn client.ConnectionInterface, generation uint64) tea.Cmd {
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
				// DEBUG: Add logging here if we had access to logger
				return DisconnectedMsg{Err: stateUpdate.Err, Generation: generation}
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
