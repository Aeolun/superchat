package modal

import (
	tea "github.com/charmbracelet/bubbletea"
)

// ModalType uniquely identifies each modal type
type ModalType int

const (
	ModalNone ModalType = iota // Special value: no modal active
	ModalPasswordAuth
	ModalRegistration
	ModalNicknameChange
	ModalDeleteConfirm
	ModalHelp
	ModalCompose
	ModalNicknameSetup
	ModalCreateChannel
	ModalServerSelector
	ModalTypePasswordChange
	ModalTypeSSHKeyManager
)

// String returns the string representation of the modal type
func (m ModalType) String() string {
	switch m {
	case ModalNone:
		return "None"
	case ModalPasswordAuth:
		return "PasswordAuth"
	case ModalRegistration:
		return "Registration"
	case ModalNicknameChange:
		return "NicknameChange"
	case ModalDeleteConfirm:
		return "DeleteConfirm"
	case ModalHelp:
		return "Help"
	case ModalCompose:
		return "Compose"
	case ModalNicknameSetup:
		return "NicknameSetup"
	case ModalCreateChannel:
		return "CreateChannel"
	case ModalServerSelector:
		return "ServerSelector"
	case ModalTypePasswordChange:
		return "PasswordChange"
	case ModalTypeSSHKeyManager:
		return "SSHKeyManager"
	default:
		return "Unknown"
	}
}

// Modal represents a modal dialog
type Modal interface {
	// Type returns the modal type identifier
	Type() ModalType

	// HandleKey processes keyboard input when this modal is active
	// Returns (handled, newModal, cmd)
	// - handled: true if the key was consumed by this modal
	// - newModal: nil to close modal, same modal to stay open, different modal to replace
	// - cmd: bubbletea command to execute
	HandleKey(msg tea.KeyMsg) (handled bool, newModal Modal, cmd tea.Cmd)

	// Render returns the modal content to be overlaid
	Render(width, height int) string

	// IsBlockingInput returns true if this modal blocks all input to underlying views
	// If false, unhandled keys fall through to the main view
	IsBlockingInput() bool
}

// ModalStack manages the stack of active modals
type ModalStack struct {
	stack []Modal
}

// Push adds a modal to the top of the stack
// If a modal of the same type already exists, it is removed first
func (ms *ModalStack) Push(m Modal) {
	// Remove any existing instance of the same modal type
	ms.stack = ms.removeByType(m.Type())
	ms.stack = append(ms.stack, m)
}

// Pop removes and returns the top modal
// Returns nil if stack is empty
func (ms *ModalStack) Pop() Modal {
	if len(ms.stack) == 0 {
		return nil
	}
	m := ms.stack[len(ms.stack)-1]
	ms.stack = ms.stack[:len(ms.stack)-1]
	return m
}

// Top returns the active (topmost) modal without removing it
// Returns nil if stack is empty
func (ms *ModalStack) Top() Modal {
	if len(ms.stack) == 0 {
		return nil
	}
	return ms.stack[len(ms.stack)-1]
}

// TopType returns the type of the active modal, or ModalNone if empty
func (ms *ModalStack) TopType() ModalType {
	if m := ms.Top(); m != nil {
		return m.Type()
	}
	return ModalNone
}

// removeByType removes all modals of a specific type
func (ms *ModalStack) removeByType(t ModalType) []Modal {
	filtered := []Modal{}
	for _, m := range ms.stack {
		if m.Type() != t {
			filtered = append(filtered, m)
		}
	}
	return filtered
}

// RemoveByType removes all modals of a specific type from the stack
func (ms *ModalStack) RemoveByType(t ModalType) {
	ms.stack = ms.removeByType(t)
}

// Clear removes all modals
func (ms *ModalStack) Clear() {
	ms.stack = []Modal{}
}

// IsEmpty returns true if no modals are active
func (ms *ModalStack) IsEmpty() bool {
	return len(ms.stack) == 0
}

// Size returns the number of modals in the stack
func (ms *ModalStack) Size() int {
	return len(ms.stack)
}
