package modal

import (
	"fmt"
	"os"
	"path/filepath"
	"strings"
	"time"

	"github.com/76creates/stickers/flexbox"
	"github.com/charmbracelet/bubbles/textinput"
	"github.com/charmbracelet/bubbles/viewport"
	tea "github.com/charmbracelet/bubbletea"
	"github.com/charmbracelet/lipgloss"
)

// Styles for SSH key manager
var (
	primaryColor   = lipgloss.Color("#00D0D0")
	mutedTextStyle = lipgloss.NewStyle().Foreground(lipgloss.Color("240"))
	boldStyle      = lipgloss.NewStyle().Bold(true)
	highlightStyle = lipgloss.NewStyle().Background(lipgloss.Color("236"))
	errorStyle     = lipgloss.NewStyle().Foreground(lipgloss.Color("#FF6B6B"))
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
	loading       bool // True while waiting for server response
	viewport      viewport.Model
	viewportReady bool

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
	deleteKeyID    uint64
	deleteKeyLabel string
	deleteErrorMsg string
	deleteFocusYes bool

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
		loading:        keys == nil, // Loading if keys not provided yet
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
	// Create flexbox layout - responsive to terminal size
	modalWidth := min(74, m.width-4)

	// Build key list content
	var keyListItems []string

	if m.loading {
		keyListItems = append(keyListItems, mutedTextStyle.Render("Loading SSH keys..."))
	} else if len(m.keys) == 0 {
		keyListItems = append(keyListItems,
			mutedTextStyle.Render("No SSH keys configured."),
			mutedTextStyle.Render("Add a key to enable SSH authentication."),
		)
	} else {
		for i, key := range m.keys {
			// Build key item
			indicator := "  "
			if i == m.selectedIndex {
				indicator = lipgloss.NewStyle().Foreground(primaryColor).Render("► ")
			}

			// First line: label with type right-aligned
			labelWidth := modalWidth - 2
			labelText := boldStyle.Render(key.Label)
			typeText := mutedTextStyle.Render(key.KeyType)
			spacing := labelWidth - lipgloss.Width(key.Label) - lipgloss.Width(key.KeyType)
			if spacing < 1 {
				spacing = 1
			}
			firstLine := labelText + strings.Repeat(" ", spacing) + typeText

			keyInfo := lipgloss.JoinVertical(lipgloss.Left,
				firstLine,
				mutedTextStyle.Render("  Fingerprint: "+truncateFingerprint(key.Fingerprint)),
				mutedTextStyle.Render("  "+formatLastUsed(key.LastUsedAt)),
			)

			item := indicator + keyInfo
			keyListItems = append(keyListItems, item)

			// Add blank line between keys (except last)
			if i < len(m.keys)-1 {
				keyListItems = append(keyListItems, "")
			}
		}
	}

	modalHeight := min(18, m.height-4)
	contentHeight := modalHeight - 4 // title(1) + separator(1) + footer(1) + margin(1)

	// Build key list string
	keyListContent := lipgloss.JoinVertical(lipgloss.Left, keyListItems...)

	// Initialize or update viewport
	viewportWidth := modalWidth
	if !m.viewportReady {
		m.viewport = viewport.New(viewportWidth, contentHeight)
		m.viewport.SetContent(keyListContent)
		m.viewportReady = true
	} else {
		m.viewport.Width = viewportWidth
		m.viewport.Height = contentHeight
		m.viewport.SetContent(keyListContent)
	}

	layout := flexbox.New(modalWidth, modalHeight)

	// Row 1: Title
	titleRow := layout.NewRow().AddCells(
		flexbox.NewCell(1, 1).SetContent(
			lipgloss.NewStyle().Bold(true).Foreground(primaryColor).
				Align(lipgloss.Center).Render("SSH Key Manager"),
		),
	)

	// Row 2: Key list viewport (flexible height)
	contentRow := layout.NewRow().AddCells(
		flexbox.NewCell(1, contentHeight).SetContent(
			m.viewport.View(),
		),
	)

	// Row 3: Separator (match viewport width)
	separatorRow := layout.NewRow().AddCells(
		flexbox.NewCell(1, 1).SetContent(
			mutedTextStyle.Render(strings.Repeat("─", viewportWidth)),
		),
	)

	// Row 4: Footer with help text
	footerRow := layout.NewRow().AddCells(
		flexbox.NewCell(1, 1).SetContent(
			mutedTextStyle.Align(lipgloss.Center).
				Render("[a] Add key  [r] Rename  [d] Delete  [Esc] Close"),
		),
	)

	layout.AddRows([]*flexbox.Row{titleRow, contentRow, separatorRow, footerRow})

	box := lipgloss.NewStyle().
		Border(lipgloss.RoundedBorder()).
		BorderForeground(primaryColor).
		Padding(1, 1). // Reduced horizontal padding from 2 to 1
		Render(layout.Render())

	return lipgloss.Place(m.width, m.height, lipgloss.Center, lipgloss.Center, box)
}

func formatLastUsed(lastUsedAt *time.Time) string {
	if lastUsedAt == nil {
		return "Never used"
	}
	return "Last used: " + formatTimeAgo(*lastUsedAt)
}

func (m *SSHKeyManagerModal) renderAddKey() string {
	// Responsive to terminal size
	modalWidth := min(74, m.width-4)
	modalHeight := min(20, m.height-4)
	layout := flexbox.New(modalWidth, modalHeight)

	// Row 1: Title
	titleRow := layout.NewRow().AddCells(
		flexbox.NewCell(1, 1).SetContent(
			lipgloss.NewStyle().Bold(true).Foreground(primaryColor).
				Align(lipgloss.Center).Render("Add SSH Key"),
		),
	)

	// Build content items
	var contentItems []string

	// Public key input
	keyInputView := m.addKeyInput.View()
	keyInputStyle := lipgloss.NewStyle().
		Border(lipgloss.RoundedBorder()).
		BorderForeground(lipgloss.Color("240"))
	if m.addFocusIndex == 0 {
		keyInputStyle = keyInputStyle.BorderForeground(primaryColor)
	}
	contentItems = append(contentItems,
		boldStyle.Render("Public Key:"),
		keyInputStyle.Render(keyInputView),
		"",
	)

	// Quick select files
	if len(m.pubKeyFiles) > 0 {
		contentItems = append(contentItems, "Quick select from ~/.ssh/:")
		for i, file := range m.pubKeyFiles {
			contentItems = append(contentItems,
				fmt.Sprintf("  [%d] %s", i+1, filepath.Base(file)),
			)
		}
		contentItems = append(contentItems, "")
	}

	// Label input
	labelInputView := m.addLabelInput.View()
	labelInputStyle := lipgloss.NewStyle().
		Border(lipgloss.RoundedBorder()).
		BorderForeground(lipgloss.Color("240"))
	if m.addFocusIndex == 1 {
		labelInputStyle = labelInputStyle.BorderForeground(primaryColor)
	}
	contentItems = append(contentItems,
		boldStyle.Render("Label:"),
		labelInputStyle.Render(labelInputView),
	)

	// Error message
	if m.addErrorMsg != "" {
		contentItems = append(contentItems, "", errorStyle.Render("Error: "+m.addErrorMsg))
	}

	// Row 2: Content
	contentHeight := modalHeight - 4
	contentRow := layout.NewRow().AddCells(
		flexbox.NewCell(1, contentHeight).SetContent(
			lipgloss.JoinVertical(lipgloss.Left, contentItems...),
		),
	)

	// Row 3: Separator
	separatorRow := layout.NewRow().AddCells(
		flexbox.NewCell(1, 1).SetContent(
			mutedTextStyle.Render(strings.Repeat("─", modalWidth-4)),
		),
	)

	// Row 4: Footer
	footerRow := layout.NewRow().AddCells(
		flexbox.NewCell(1, 1).SetContent(
			mutedTextStyle.Align(lipgloss.Center).
				Render("[Tab] Next field  [Enter] Add  [Esc] Cancel"),
		),
	)

	layout.AddRows([]*flexbox.Row{titleRow, contentRow, separatorRow, footerRow})

	box := lipgloss.NewStyle().
		Border(lipgloss.RoundedBorder()).
		BorderForeground(primaryColor).
		Padding(1, 1).
		Render(layout.Render())

	return lipgloss.Place(m.width, m.height, lipgloss.Center, lipgloss.Center, box)
}

func (m *SSHKeyManagerModal) renderEditLabel() string {
	// Responsive to terminal size
	modalWidth := min(54, m.width-4)
	modalHeight := min(10, m.height-4)
	layout := flexbox.New(modalWidth, modalHeight)

	// Row 1: Title
	titleRow := layout.NewRow().AddCells(
		flexbox.NewCell(1, 1).SetContent(
			lipgloss.NewStyle().Bold(true).Foreground(primaryColor).
				Align(lipgloss.Center).Render("Edit Key Label"),
		),
	)

	// Build content items
	editInputStyle := lipgloss.NewStyle().
		Border(lipgloss.RoundedBorder()).
		BorderForeground(primaryColor)

	contentItems := []string{
		"Enter new label for this key:",
		"",
		editInputStyle.Render(m.editLabelInput.View()),
	}

	if m.editErrorMsg != "" {
		contentItems = append(contentItems, "", errorStyle.Render("Error: "+m.editErrorMsg))
	}

	// Row 2: Content
	contentHeight := modalHeight - 4
	contentRow := layout.NewRow().AddCells(
		flexbox.NewCell(1, contentHeight).SetContent(
			lipgloss.JoinVertical(lipgloss.Left, contentItems...),
		),
	)

	// Row 3: Separator
	separatorRow := layout.NewRow().AddCells(
		flexbox.NewCell(1, 1).SetContent(
			mutedTextStyle.Render(strings.Repeat("─", modalWidth-4)),
		),
	)

	// Row 4: Footer
	footerRow := layout.NewRow().AddCells(
		flexbox.NewCell(1, 1).SetContent(
			mutedTextStyle.Align(lipgloss.Center).
				Render("[Enter] Save  [Esc] Cancel"),
		),
	)

	layout.AddRows([]*flexbox.Row{titleRow, contentRow, separatorRow, footerRow})

	box := lipgloss.NewStyle().
		Border(lipgloss.RoundedBorder()).
		BorderForeground(primaryColor).
		Padding(1, 1).
		Render(layout.Render())

	return lipgloss.Place(m.width, m.height, lipgloss.Center, lipgloss.Center, box)
}

func (m *SSHKeyManagerModal) renderDeleteConfirm() string {
	// Responsive to terminal size
	modalWidth := min(54, m.width-4)
	modalHeight := min(12, m.height-4)
	layout := flexbox.New(modalWidth, modalHeight)

	// Row 1: Title
	titleRow := layout.NewRow().AddCells(
		flexbox.NewCell(1, 1).SetContent(
			lipgloss.NewStyle().Bold(true).Foreground(primaryColor).
				Align(lipgloss.Center).Render("Delete SSH Key"),
		),
	)

	// Build content items
	contentItems := []string{
		fmt.Sprintf("Delete SSH key '%s'?", m.deleteKeyLabel),
		"",
		mutedTextStyle.Render("This action cannot be undone."),
	}

	if m.deleteErrorMsg != "" {
		contentItems = append(contentItems, "", errorStyle.Render("Error: "+m.deleteErrorMsg))
	}

	// Yes/No buttons
	yesButton := "[Yes]"
	noButton := "[No]"
	if m.deleteFocusYes {
		yesButton = highlightStyle.Render(yesButton)
	} else {
		noButton = highlightStyle.Render(noButton)
	}

	buttons := lipgloss.JoinHorizontal(lipgloss.Left,
		yesButton,
		"  ",
		noButton,
	)
	contentItems = append(contentItems, "", buttons)

	// Row 2: Content
	contentHeight := modalHeight - 4
	contentRow := layout.NewRow().AddCells(
		flexbox.NewCell(1, contentHeight).SetContent(
			lipgloss.JoinVertical(lipgloss.Left, contentItems...),
		),
	)

	// Row 3: Separator
	separatorRow := layout.NewRow().AddCells(
		flexbox.NewCell(1, 1).SetContent(
			mutedTextStyle.Render(strings.Repeat("─", modalWidth-4)),
		),
	)

	// Row 4: Footer
	footerRow := layout.NewRow().AddCells(
		flexbox.NewCell(1, 1).SetContent(
			mutedTextStyle.Align(lipgloss.Center).
				Render("[Tab] Switch  [Enter] Confirm  [Esc] Cancel"),
		),
	)

	layout.AddRows([]*flexbox.Row{titleRow, contentRow, separatorRow, footerRow})

	box := lipgloss.NewStyle().
		Border(lipgloss.RoundedBorder()).
		BorderForeground(primaryColor).
		Padding(1, 1).
		Render(layout.Render())

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
	// If still loading, only allow "a" to add a key
	if m.loading {
		if msg.String() == "a" {
			// Allow adding keys even while loading
			m.view = "add"
			m.addKeyInput.SetValue("")
			m.addLabelInput.SetValue("")
			m.addErrorMsg = ""
			m.addFocusIndex = 0
			m.addKeyInput.Focus()
			m.addLabelInput.Blur()
			return true, m, nil
		}
		// Ignore other keys while loading
		return true, m, nil
	}

	switch msg.String() {
	case "up", "k":
		if m.selectedIndex > 0 {
			m.selectedIndex--
			m.scrollToSelectedKey()
		}
	case "down", "j":
		if m.selectedIndex < len(m.keys)-1 {
			m.selectedIndex++
			m.scrollToSelectedKey()
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
				publicKey := strings.TrimSpace(string(content))
				m.addKeyInput.SetValue(publicKey)
				// Auto-set label from key comment (or filename as fallback)
				label := extractSSHKeyComment(publicKey)
				if label == "" {
					baseName := filepath.Base(m.pubKeyFiles[idx])
					label = strings.TrimSuffix(baseName, ".pub")
				}
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

func extractSSHKeyComment(publicKey string) string {
	// SSH public keys have format: <type> <base64-data> <comment>
	// Example: ssh-rsa AAAAB3NzaC1yc2EA... user@hostname
	parts := strings.Fields(publicKey)
	if len(parts) >= 3 {
		// Return everything after the key data (handles multi-word comments)
		return strings.Join(parts[2:], " ")
	}
	return ""
}

// scrollToSelectedKey scrolls the viewport to keep the selected key visible
func (m *SSHKeyManagerModal) scrollToSelectedKey() {
	if !m.viewportReady || len(m.keys) == 0 {
		return
	}

	// Each key takes 4 lines (label + fingerprint + last used + blank line spacing)
	lineHeight := 4
	selectedLine := m.selectedIndex * lineHeight

	// Scroll viewport to show selected item
	if selectedLine < m.viewport.YOffset {
		// Selected item is above viewport, scroll up
		m.viewport.SetYOffset(selectedLine)
	} else if selectedLine+lineHeight > m.viewport.YOffset+m.viewport.Height {
		// Selected item is below viewport, scroll down
		m.viewport.SetYOffset(selectedLine + lineHeight - m.viewport.Height)
	}
}
