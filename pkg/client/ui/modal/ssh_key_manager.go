package modal

import (
	"fmt"
	"os"
	"path/filepath"
	"strings"
	"time"

	"github.com/charmbracelet/bubbles/textinput"
	tea "github.com/charmbracelet/bubbletea"
	"github.com/charmbracelet/lipgloss"
)

// Styles for SSH key manager
var (
	primaryColor    = lipgloss.Color("#00D0D0")
	mutedTextStyle  = lipgloss.NewStyle().Foreground(lipgloss.Color("240"))
	boldStyle       = lipgloss.NewStyle().Bold(true)
	highlightStyle  = lipgloss.NewStyle().Background(lipgloss.Color("236"))
	errorStyle      = lipgloss.NewStyle().Foreground(lipgloss.Color("#FF6B6B"))
)

// SSHKeyInfo represents an SSH key from the server
type SSHKeyInfo struct {
	ID          uint64
	Fingerprint string
	KeyType     string
	Label       string
	AddedAt     time.Time
	LastUsedAt  *time.Time
}

// SSHKeyManagerModal manages SSH keys for the authenticated user
type SSHKeyManagerModal struct {
	width  int
	height int

	// View state
	view string // "list", "add", "edit_label", "delete_confirm"

	// List view
	keys          []SSHKeyInfo
	selectedIndex int

	// Add key view
	addKeyInput   textinput.Model
	addLabelInput textinput.Model
	addFocusIndex int
	addErrorMsg   string
	pubKeyFiles   []string // Available .pub files in ~/.ssh/

	// Edit label view
	editLabelInput textinput.Model
	editKeyID      uint64
	editErrorMsg   string

	// Delete confirm view
	deleteKeyID     uint64
	deleteKeyLabel  string
	deleteErrorMsg  string
	deleteFocusYes  bool

	// Callbacks
	onAddKey    func(publicKey, label string) tea.Cmd
	onEditLabel func(keyID uint64, newLabel string) tea.Cmd
	onDeleteKey func(keyID uint64) tea.Cmd
	onClose     func() tea.Cmd
}

func NewSSHKeyManagerModal(
	keys []SSHKeyInfo,
	onAddKey func(publicKey, label string) tea.Cmd,
	onEditLabel func(keyID uint64, newLabel string) tea.Cmd,
	onDeleteKey func(keyID uint64) tea.Cmd,
	onClose func() tea.Cmd,
) *SSHKeyManagerModal {
	addKeyInput := textinput.New()
	addKeyInput.Placeholder = "Paste SSH public key or select file below"
	addKeyInput.Width = 60

	addLabelInput := textinput.New()
	addLabelInput.Placeholder = "Label (e.g., 'laptop', 'work')"
	addLabelInput.Width = 60

	editLabelInput := textinput.New()
	editLabelInput.Placeholder = "New label"
	editLabelInput.Width = 40

	// Find available .pub files
	pubKeyFiles := findPublicKeyFiles()

	return &SSHKeyManagerModal{
		view:           "list",
		keys:           keys,
		selectedIndex:  0,
		addKeyInput:    addKeyInput,
		addLabelInput:  addLabelInput,
		editLabelInput: editLabelInput,
		pubKeyFiles:    pubKeyFiles,
		onAddKey:       onAddKey,
		onEditLabel:    onEditLabel,
		onDeleteKey:    onDeleteKey,
		onClose:        onClose,
	}
}

func (m *SSHKeyManagerModal) Type() ModalType {
	return ModalTypeSSHKeyManager
}

func (m *SSHKeyManagerModal) Render(width, height int) string {
	m.width = width
	m.height = height

	switch m.view {
	case "list":
		return m.renderList()
	case "add":
		return m.renderAddKey()
	case "edit_label":
		return m.renderEditLabel()
	case "delete_confirm":
		return m.renderDeleteConfirm()
	default:
		return m.renderList()
	}
}

func (m *SSHKeyManagerModal) renderList() string {
	var content strings.Builder

	if len(m.keys) == 0 {
		content.WriteString(mutedTextStyle.Render("No SSH keys configured.\n"))
		content.WriteString(mutedTextStyle.Render("Add a key to enable SSH authentication.\n\n"))
	} else {
		for i, key := range m.keys {
			var line strings.Builder

			// Selection indicator
			if i == m.selectedIndex {
				line.WriteString(lipgloss.NewStyle().Foreground(primaryColor).Render("► "))
			} else {
				line.WriteString("  ")
			}

			// Key info
			line.WriteString(boldStyle.Render(key.Label))
			line.WriteString("\n  ")
			line.WriteString(mutedTextStyle.Render(fmt.Sprintf("Type: %s", key.KeyType)))
			line.WriteString("\n  ")
			line.WriteString(mutedTextStyle.Render(fmt.Sprintf("Fingerprint: %s", truncateFingerprint(key.Fingerprint))))
			line.WriteString("\n  ")

			if key.LastUsedAt != nil {
				line.WriteString(mutedTextStyle.Render(fmt.Sprintf("Last used: %s", formatTimeAgo(*key.LastUsedAt))))
			} else {
				line.WriteString(mutedTextStyle.Render("Never used"))
			}

			if i == m.selectedIndex {
				content.WriteString(highlightStyle.Render(line.String()))
			} else {
				content.WriteString(line.String())
			}
			content.WriteString("\n\n")
		}
	}

	// Help text
	content.WriteString(mutedTextStyle.Render("──────────────────────────────────────────────────\n"))
	content.WriteString(mutedTextStyle.Render("[a] Add key  [r] Rename  [d] Delete  [Esc] Close"))

	box := lipgloss.NewStyle().
		Border(lipgloss.RoundedBorder()).
		BorderForeground(primaryColor).
		Padding(1, 2).
		Width(70).
		Render(boldStyle.Render("SSH Key Manager") + "\n\n" + content.String())

	return lipgloss.Place(m.width, m.height, lipgloss.Center, lipgloss.Center, box)
}

func (m *SSHKeyManagerModal) renderAddKey() string {
	var content strings.Builder

	// Public key input
	content.WriteString(boldStyle.Render("Public Key:") + "\n")
	if m.addFocusIndex == 0 {
		content.WriteString(highlightStyle.Render(m.addKeyInput.View()))
	} else {
		content.WriteString(m.addKeyInput.View())
	}
	content.WriteString("\n\n")

	// Available .pub files
	if len(m.pubKeyFiles) > 0 {
		content.WriteString(mutedTextStyle.Render("Quick select from ~/.ssh/:") + "\n")
		for i, file := range m.pubKeyFiles {
			prefix := fmt.Sprintf("[%d] ", i+1)
			content.WriteString(mutedTextStyle.Render(prefix + filepath.Base(file)) + "\n")
		}
		content.WriteString("\n")
	}

	// Label input
	content.WriteString(boldStyle.Render("Label:") + "\n")
	if m.addFocusIndex == 1 {
		content.WriteString(highlightStyle.Render(m.addLabelInput.View()))
	} else {
		content.WriteString(m.addLabelInput.View())
	}
	content.WriteString("\n\n")

	// Error message
	if m.addErrorMsg != "" {
		content.WriteString(errorStyle.Render("Error: "+m.addErrorMsg) + "\n\n")
	}

	// Help text
	content.WriteString(mutedTextStyle.Render("──────────────────────────────────────────────────\n"))
	content.WriteString(mutedTextStyle.Render("[Tab] Next field  [Enter] Add  [Esc] Cancel"))

	box := lipgloss.NewStyle().
		Border(lipgloss.RoundedBorder()).
		BorderForeground(primaryColor).
		Padding(1, 2).
		Width(70).
		Render(boldStyle.Render("Add SSH Key") + "\n\n" + content.String())

	return lipgloss.Place(m.width, m.height, lipgloss.Center, lipgloss.Center, box)
}

func (m *SSHKeyManagerModal) renderEditLabel() string {
	var content strings.Builder

	content.WriteString("Enter new label for this key:\n\n")
	content.WriteString(m.editLabelInput.View() + "\n\n")

	if m.editErrorMsg != "" {
		content.WriteString(errorStyle.Render("Error: "+m.editErrorMsg) + "\n\n")
	}

	content.WriteString(mutedTextStyle.Render("[Enter] Save  [Esc] Cancel"))

	box := lipgloss.NewStyle().
		Border(lipgloss.RoundedBorder()).
		BorderForeground(primaryColor).
		Padding(1, 2).
		Width(50).
		Render(boldStyle.Render("Edit Key Label") + "\n\n" + content.String())

	return lipgloss.Place(m.width, m.height, lipgloss.Center, lipgloss.Center, box)
}

func (m *SSHKeyManagerModal) renderDeleteConfirm() string {
	var content strings.Builder

	content.WriteString(fmt.Sprintf("Delete SSH key '%s'?\n\n", m.deleteKeyLabel))
	content.WriteString(mutedTextStyle.Render("This action cannot be undone.\n\n"))

	if m.deleteErrorMsg != "" {
		content.WriteString(errorStyle.Render("Error: "+m.deleteErrorMsg) + "\n\n")
	}

	// Yes/No buttons
	yesStyle := lipgloss.NewStyle().Padding(0, 2)
	noStyle := lipgloss.NewStyle().Padding(0, 2)

	if m.deleteFocusYes {
		content.WriteString(highlightStyle.Render(yesStyle.Render("[Yes]")))
		content.WriteString("  ")
		content.WriteString(noStyle.Render("[No]"))
	} else {
		content.WriteString(yesStyle.Render("[Yes]"))
		content.WriteString("  ")
		content.WriteString(highlightStyle.Render(noStyle.Render("[No]")))
	}

	content.WriteString("\n\n")
	content.WriteString(mutedTextStyle.Render("[Tab] Switch  [Enter] Confirm  [Esc] Cancel"))

	box := lipgloss.NewStyle().
		Border(lipgloss.RoundedBorder()).
		BorderForeground(primaryColor).
		Padding(1, 2).
		Width(50).
		Render(boldStyle.Render("Delete SSH Key") + "\n\n" + content.String())

	return lipgloss.Place(m.width, m.height, lipgloss.Center, lipgloss.Center, box)
}

func (m *SSHKeyManagerModal) HandleKey(msg tea.KeyMsg) (bool, Modal, tea.Cmd) {
	// Check for escape key to close/go back
	if msg.String() == "esc" {
		if m.view == "list" {
			// Close the modal entirely
			return true, nil, m.onClose()
		} else {
			// Go back to list view
			m.view = "list"
			return true, m, nil
		}
	}

	switch m.view {
	case "list":
		return m.handleKeyList(msg)
	case "add":
		return m.handleKeyAddKey(msg)
	case "edit_label":
		return m.handleKeyEditLabel(msg)
	case "delete_confirm":
		return m.handleKeyDeleteConfirm(msg)
	}
	return true, m, nil
}

func (m *SSHKeyManagerModal) IsBlockingInput() bool {
	return true
}

func (m *SSHKeyManagerModal) handleKeyList(msg tea.KeyMsg) (bool, Modal, tea.Cmd) {
	switch msg.String() {
	case "up", "k":
		if m.selectedIndex > 0 {
			m.selectedIndex--
		}
	case "down", "j":
		if m.selectedIndex < len(m.keys)-1 {
			m.selectedIndex++
		}
	case "a":
		// Switch to add view
		m.view = "add"
		m.addKeyInput.SetValue("")
		m.addLabelInput.SetValue("")
		m.addErrorMsg = ""
		m.addFocusIndex = 0
		m.addKeyInput.Focus()
		m.addLabelInput.Blur()
	case "r":
		// Switch to edit label view
		if len(m.keys) > 0 {
			key := m.keys[m.selectedIndex]
			m.view = "edit_label"
			m.editKeyID = key.ID
			m.editLabelInput.SetValue(key.Label)
			m.editErrorMsg = ""
			m.editLabelInput.Focus()
		}
	case "d":
		// Switch to delete confirm view
		if len(m.keys) > 0 {
			key := m.keys[m.selectedIndex]
			m.view = "delete_confirm"
			m.deleteKeyID = key.ID
			m.deleteKeyLabel = key.Label
			m.deleteErrorMsg = ""
			m.deleteFocusYes = false
		}
	}
	return true, m, nil
}

func (m *SSHKeyManagerModal) handleKeyAddKey(msg tea.KeyMsg) (bool, Modal, tea.Cmd) {
	switch msg.String() {
	case "tab", "shift+tab":
		m.addFocusIndex = (m.addFocusIndex + 1) % 2
		if m.addFocusIndex == 0 {
			m.addKeyInput.Focus()
			m.addLabelInput.Blur()
		} else {
			m.addKeyInput.Blur()
			m.addLabelInput.Focus()
		}
		return true, m, nil
	case "1", "2", "3", "4", "5", "6", "7", "8", "9":
		// Quick select .pub file
		idx := int(msg.String()[0] - '1')
		if idx < len(m.pubKeyFiles) {
			content, err := os.ReadFile(m.pubKeyFiles[idx])
			if err == nil {
				m.addKeyInput.SetValue(strings.TrimSpace(string(content)))
				// Auto-set label from filename
				baseName := filepath.Base(m.pubKeyFiles[idx])
				label := strings.TrimSuffix(baseName, ".pub")
				m.addLabelInput.SetValue(label)
			}
		}
		return true, m, nil
	case "enter":
		// Validate and submit
		publicKey := strings.TrimSpace(m.addKeyInput.Value())
		label := strings.TrimSpace(m.addLabelInput.Value())

		if publicKey == "" {
			m.addErrorMsg = "Public key is required"
			return true, m, nil
		}

		if label == "" {
			m.addErrorMsg = "Label is required"
			return true, m, nil
		}

		// Send add key request
		m.view = "list"
		return true, m, m.onAddKey(publicKey, label)
	}

	// Update focused input
	var cmd tea.Cmd
	if m.addFocusIndex == 0 {
		m.addKeyInput, cmd = m.addKeyInput.Update(tea.Msg(msg))
	} else {
		m.addLabelInput, cmd = m.addLabelInput.Update(tea.Msg(msg))
	}
	return true, m, cmd
}

func (m *SSHKeyManagerModal) handleKeyEditLabel(msg tea.KeyMsg) (bool, Modal, tea.Cmd) {
	switch msg.String() {
	case "enter":
		newLabel := strings.TrimSpace(m.editLabelInput.Value())
		if newLabel == "" {
			m.editErrorMsg = "Label cannot be empty"
			return true, m, nil
		}

		m.view = "list"
		return true, m, m.onEditLabel(m.editKeyID, newLabel)
	}

	var cmd tea.Cmd
	m.editLabelInput, cmd = m.editLabelInput.Update(tea.Msg(msg))
	return true, m, cmd
}

func (m *SSHKeyManagerModal) handleKeyDeleteConfirm(msg tea.KeyMsg) (bool, Modal, tea.Cmd) {
	switch msg.String() {
	case "tab", "left", "right":
		m.deleteFocusYes = !m.deleteFocusYes
	case "enter":
		if m.deleteFocusYes {
			m.view = "list"
			return true, m, m.onDeleteKey(m.deleteKeyID)
		} else {
			m.view = "list"
		}
	}
	return true, m, nil
}

// Helper functions

func findPublicKeyFiles() []string {
	homeDir, err := os.UserHomeDir()
	if err != nil {
		return nil
	}

	sshDir := filepath.Join(homeDir, ".ssh")
	entries, err := os.ReadDir(sshDir)
	if err != nil {
		return nil
	}

	var pubKeyFiles []string
	for _, entry := range entries {
		if !entry.IsDir() && strings.HasSuffix(entry.Name(), ".pub") {
			pubKeyFiles = append(pubKeyFiles, filepath.Join(sshDir, entry.Name()))
		}
	}
	return pubKeyFiles
}

func truncateFingerprint(fp string) string {
	if len(fp) > 40 {
		return fp[:40] + "..."
	}
	return fp
}

func formatTimeAgo(t time.Time) string {
	duration := time.Since(t)
	if duration < time.Minute {
		return "just now"
	} else if duration < time.Hour {
		mins := int(duration.Minutes())
		if mins == 1 {
			return "1 minute ago"
		}
		return fmt.Sprintf("%d minutes ago", mins)
	} else if duration < 24*time.Hour {
		hours := int(duration.Hours())
		if hours == 1 {
			return "1 hour ago"
		}
		return fmt.Sprintf("%d hours ago", hours)
	} else {
		days := int(duration.Hours() / 24)
		if days == 1 {
			return "1 day ago"
		}
		return fmt.Sprintf("%d days ago", days)
	}
}
