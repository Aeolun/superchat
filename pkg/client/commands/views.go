// ABOUTME: Shared view and modal type constants for command system
// ABOUTME: Used by both terminal and GUI clients for keyboard commands
package commands

// ViewID represents a view state (shared across clients)
type ViewID int

const (
	ViewSplash ViewID = iota
	ViewChannelList
	ViewThreadList
	ViewThreadView
	ViewChatChannel
)

// ViewIDFromInt converts an integer to ViewID (for client compatibility)
func ViewIDFromInt(v int) ViewID {
	return ViewID(v)
}

// String returns the view name for debugging
func (v ViewID) String() string {
	switch v {
	case ViewSplash:
		return "Splash"
	case ViewChannelList:
		return "ChannelList"
	case ViewThreadList:
		return "ThreadList"
	case ViewThreadView:
		return "ThreadView"
	case ViewChatChannel:
		return "ChatChannel"
	default:
		return "Unknown"
	}
}

// ModalType represents a modal state (shared across clients)
type ModalType int

const (
	ModalNone ModalType = iota
	ModalCompose
	ModalHelp
	ModalServerSelector
	ModalAdminPanel
	ModalCreateChannel
	ModalNicknameSetup
	ModalPasswordAuth
	ModalRegistration
	ModalDeleteConfirm
)

// String returns the modal name for debugging
func (m ModalType) String() string {
	switch m {
	case ModalNone:
		return "None"
	case ModalCompose:
		return "Compose"
	case ModalHelp:
		return "Help"
	case ModalServerSelector:
		return "ServerSelector"
	case ModalAdminPanel:
		return "AdminPanel"
	case ModalCreateChannel:
		return "CreateChannel"
	case ModalNicknameSetup:
		return "NicknameSetup"
	case ModalPasswordAuth:
		return "PasswordAuth"
	case ModalRegistration:
		return "Registration"
	case ModalDeleteConfirm:
		return "DeleteConfirm"
	default:
		return "Unknown"
	}
}
