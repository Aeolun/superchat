package ui

import (
	"time"

	tea "github.com/charmbracelet/bubbletea"
	"github.com/aeolun/superchat/pkg/client"
	"github.com/aeolun/superchat/pkg/protocol"
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

// Model represents the application state
type Model struct {
	// Connection and state
	conn  *client.Connection
	state *client.State

	// Current view
	currentView ViewState

	// Server state
	serverConfig    *protocol.ServerConfigMessage
	channels        []protocol.Channel
	currentChannel  *protocol.Channel
	threads         []protocol.Message  // Root messages
	currentThread   *protocol.Message
	threadReplies   []protocol.Message  // All replies in current thread
	onlineUsers     uint32

	// UI state
	width           int
	height          int
	channelCursor   int
	threadCursor    int
	replyCursor     int

	// Input state
	nickname        string
	composeInput    string
	composeCursor   int
	composeMode     ComposeMode
	composeParentID *uint64
	returnToView    ViewState  // Where to return after nickname setup

	// Error and status
	errorMessage    string
	statusMessage   string
	showHelp        bool
	firstRun        bool

	// Real-time updates
	pendingUpdates  []protocol.Message

	// Keepalive
	lastPingSent    time.Time
	pingInterval    time.Duration
}

// ComposeMode indicates what we're composing
type ComposeMode int

const (
	ComposeModeNewThread ComposeMode = iota
	ComposeModeReply
)

// NewModel creates a new application model
func NewModel(conn *client.Connection, state *client.State) Model {
	firstRun := state.GetFirstRun()
	initialView := ViewChannelList
	if firstRun {
		initialView = ViewSplash
	}

	nickname := state.GetLastNickname()

	return Model{
		conn:          conn,
		state:         state,
		currentView:   initialView,
		firstRun:      firstRun,
		nickname:      nickname,
		channels:      []protocol.Channel{},
		threads:       []protocol.Message{},
		threadReplies: []protocol.Message{},
		pingInterval:  30 * time.Second,  // Send ping every 30 seconds
		lastPingSent:  time.Now(),
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

// TickMsg is sent periodically
type TickMsg time.Time

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

// listenForServerFrames listens for incoming server frames
func listenForServerFrames(conn *client.Connection) tea.Cmd {
	return func() tea.Msg {
		select {
		case frame := <-conn.Incoming():
			return ServerFrameMsg{Frame: frame}
		case err := <-conn.Errors():
			return ErrorMsg{Err: err}
		}
	}
}

// tickCmd returns a command that sends a tick message every second
func tickCmd() tea.Cmd {
	return tea.Tick(time.Second, func(t time.Time) tea.Msg {
		return TickMsg(t)
	})
}
