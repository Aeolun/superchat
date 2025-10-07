package ui

import "time"

// InitState represents client initialization phases
type InitState int

const (
	InitStateConnecting     InitState = iota // Socket connected, waiting for SERVER_CONFIG
	InitStateAwaitingAuth                    // SERVER_CONFIG received, waiting for AUTH_RESPONSE (SSH only)
	InitStateNeedsNickname                   // Not SSH, need nickname before posting
	InitStateReady                           // Fully initialized, can perform operations
)

func (s InitState) String() string {
	switch s {
	case InitStateConnecting:
		return "Connecting"
	case InitStateAwaitingAuth:
		return "AwaitingAuth"
	case InitStateNeedsNickname:
		return "NeedsNickname"
	case InitStateReady:
		return "Ready"
	default:
		return "Unknown"
	}
}

// InitStateMachine handles client initialization flow
type InitStateMachine struct {
	state          InitState
	timeout        time.Time
	startTime      time.Time
	isSSH          bool
	nextCheckDelay time.Duration // Exponential backoff for timeout checking
}

func NewInitStateMachine(isSSH bool) *InitStateMachine {
	return &InitStateMachine{
		state:          InitStateConnecting,
		startTime:      time.Now(),
		isSSH:          isSSH,
		nextCheckDelay: 5 * time.Millisecond, // Start with 5ms
	}
}

func (sm *InitStateMachine) OnServerConfig() {
	if sm.isSSH {
		sm.state = InitStateAwaitingAuth
		sm.timeout = time.Now().Add(5 * time.Second)
	} else {
		sm.state = InitStateNeedsNickname
	}
}

func (sm *InitStateMachine) OnAuthResponse() bool {
	if sm.state == InitStateAwaitingAuth {
		sm.state = InitStateReady
		return true // Transition occurred
	}
	return false
}

func (sm *InitStateMachine) OnTimeout() bool {
	if sm.state == InitStateAwaitingAuth && time.Now().After(sm.timeout) {
		// Assume TCP connection if AUTH_RESPONSE didn't arrive
		sm.state = InitStateNeedsNickname
		return true
	}
	return false
}

func (sm *InitStateMachine) IsReady() bool {
	return sm.state == InitStateReady
}

func (sm *InitStateMachine) NeedsNickname() bool {
	return sm.state == InitStateNeedsNickname
}

func (sm *InitStateMachine) State() InitState {
	return sm.state
}

// NextCheckDelay returns the current check delay and advances it exponentially
// Starts at 5ms, doubles each time: 5, 10, 20, 40, 80, 160ms, capped at 200ms
func (sm *InitStateMachine) NextCheckDelay() time.Duration {
	current := sm.nextCheckDelay
	// Double for next time, cap at 200ms
	sm.nextCheckDelay *= 2
	if sm.nextCheckDelay > 200*time.Millisecond {
		sm.nextCheckDelay = 200 * time.Millisecond
	}
	return current
}
