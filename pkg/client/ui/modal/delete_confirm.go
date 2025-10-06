package modal

import (
	tea "github.com/charmbracelet/bubbletea"
	"github.com/charmbracelet/lipgloss"
)

// DeleteConfirmModal is a modal for confirming message deletion
type DeleteConfirmModal struct {
	messageID uint64
	onConfirm func(uint64) tea.Cmd
	onCancel  func() tea.Cmd
}

// NewDeleteConfirmModal creates a new delete confirmation modal
func NewDeleteConfirmModal(messageID uint64, onConfirm func(uint64) tea.Cmd, onCancel func() tea.Cmd) *DeleteConfirmModal {
	return &DeleteConfirmModal{
		messageID: messageID,
		onConfirm: onConfirm,
		onCancel:  onCancel,
	}
}

// Type returns the modal type
func (m *DeleteConfirmModal) Type() ModalType {
	return ModalDeleteConfirm
}

// HandleKey processes keyboard input
func (m *DeleteConfirmModal) HandleKey(msg tea.KeyMsg) (bool, Modal, tea.Cmd) {
	switch msg.String() {
	case "y", "enter":
		// Confirm deletion
		var cmd tea.Cmd
		if m.onConfirm != nil {
			cmd = m.onConfirm(m.messageID)
		}
		return true, nil, cmd // nil modal means close this modal

	case "n", "esc":
		// Cancel deletion
		var cmd tea.Cmd
		if m.onCancel != nil {
			cmd = m.onCancel()
		}
		return true, nil, cmd // Close modal without deletion

	default:
		// Consume all other keys (don't let them fall through)
		return true, m, nil
	}
}

// Render returns the modal content
func (m *DeleteConfirmModal) Render(width, height int) string {
	modalStyle := lipgloss.NewStyle().
		Border(lipgloss.RoundedBorder()).
		BorderForeground(lipgloss.Color("205")).
		Padding(1, 2).
		Background(lipgloss.Color("235"))

	content := "Delete this message?\n\n[y] Confirm    [n] Cancel"

	modal := modalStyle.Render(content)

	// Center the modal
	return lipgloss.Place(width, height, lipgloss.Center, lipgloss.Center, modal)
}

// IsBlockingInput returns true (this modal blocks all input)
func (m *DeleteConfirmModal) IsBlockingInput() bool {
	return true
}
