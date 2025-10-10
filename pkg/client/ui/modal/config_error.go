package modal

import (
	"bufio"
	"fmt"
	"os"
	"strings"
	"time"

	tea "github.com/charmbracelet/bubbletea"
	"github.com/charmbracelet/lipgloss"
)

// ConfigErrorModal shows configuration errors with helpful options
type ConfigErrorModal struct {
	configPath   string
	errorMessage string
	lineNumber   int // 0 if not a parse error
	fileContent  []string
	onReset      func(backup bool) tea.Cmd
	onQuit       func() tea.Cmd
	showBackupOption bool
}

// NewConfigErrorModal creates a new config error modal
func NewConfigErrorModal(
	configPath string,
	errorMessage string,
	lineNumber int,
	onReset func(backup bool) tea.Cmd,
	onQuit func() tea.Cmd,
) *ConfigErrorModal {
	m := &ConfigErrorModal{
		configPath:       configPath,
		errorMessage:     errorMessage,
		lineNumber:       lineNumber,
		onReset:          onReset,
		onQuit:           onQuit,
		showBackupOption: false,
	}

	// Try to read file content if we have a line number
	if lineNumber > 0 {
		m.fileContent = readFileLines(configPath)
	}

	return m
}

// readFileLines reads a file and returns all lines
func readFileLines(path string) []string {
	file, err := os.Open(path)
	if err != nil {
		return nil
	}
	defer file.Close()

	var lines []string
	scanner := bufio.NewScanner(file)
	for scanner.Scan() {
		lines = append(lines, scanner.Text())
	}
	return lines
}

// Type returns the modal type
func (m *ConfigErrorModal) Type() ModalType {
	return ModalConfigError
}

// HandleKey processes keyboard input
func (m *ConfigErrorModal) HandleKey(msg tea.KeyMsg) (bool, Modal, tea.Cmd) {
	if m.showBackupOption {
		// In backup confirmation mode
		switch msg.String() {
		case "y", "Y":
			// Reset with backup
			var cmd tea.Cmd
			if m.onReset != nil {
				cmd = m.onReset(true)
			}
			return true, nil, cmd
		case "n", "N":
			// Reset without backup
			var cmd tea.Cmd
			if m.onReset != nil {
				cmd = m.onReset(false)
			}
			return true, nil, cmd
		case "esc", "c", "C":
			// Cancel - go back to error screen
			m.showBackupOption = false
			return true, m, nil
		}
		return true, m, nil
	}

	// Normal error screen mode
	switch msg.String() {
	case "r", "R":
		// Show backup confirmation
		m.showBackupOption = true
		return true, m, nil
	case "q", "Q", "esc":
		// Quit
		var cmd tea.Cmd
		if m.onQuit != nil {
			cmd = m.onQuit()
		}
		return true, nil, cmd
	}

	return true, m, nil
}

// Render returns the modal content
func (m *ConfigErrorModal) Render(width, height int) string {
	primaryColor := lipgloss.Color("205")
	errorColor := lipgloss.Color("196")
	mutedColor := lipgloss.Color("240")

	if m.showBackupOption {
		// Backup confirmation screen
		title := lipgloss.NewStyle().
			Bold(true).
			Foreground(primaryColor).
			Align(lipgloss.Center).
			MarginBottom(1).
			Render("⚠️  Backup Configuration?")

		message := lipgloss.NewStyle().
			Foreground(lipgloss.Color("252")).
			Align(lipgloss.Center).
			MarginBottom(1).
			Render("Do you want to backup the current config before resetting?")

		backupPath := lipgloss.NewStyle().
			Foreground(mutedColor).
			Align(lipgloss.Center).
			MarginBottom(1).
			Render(fmt.Sprintf("Backup: %s.backup-%s", m.configPath, time.Now().Format("2006-01-02")))

		options := lipgloss.NewStyle().
			Foreground(mutedColor).
			Align(lipgloss.Center).
			MarginTop(1).
			Render("[Y] Yes, backup first  [N] No, just reset  [C] Cancel")

		content := lipgloss.JoinVertical(
			lipgloss.Center,
			"",
			title,
			message,
			backupPath,
			options,
			"",
		)

		modal := lipgloss.NewStyle().
			Border(lipgloss.RoundedBorder()).
			BorderForeground(primaryColor).
			Padding(1, 3).
			Width(70).
			Render(content)

		return lipgloss.Place(width, height, lipgloss.Center, lipgloss.Center, modal)
	}

	// Error screen
	title := lipgloss.NewStyle().
		Bold(true).
		Foreground(errorColor).
		Align(lipgloss.Center).
		MarginBottom(1).
		Render("⚠️  Configuration File Error")

	filePath := lipgloss.NewStyle().
		Foreground(mutedColor).
		Align(lipgloss.Center).
		Render("File: " + m.configPath)

	// Show error message
	errorMsg := lipgloss.NewStyle().
		Foreground(errorColor).
		Align(lipgloss.Left).
		Width(64).
		MarginTop(1).
		MarginBottom(1).
		Render(wrapText(m.errorMessage, 64))

	var contextLines string
	if m.lineNumber > 0 && len(m.fileContent) > 0 {
		// Show the error line and 2 lines around it
		contextLines = m.renderLineContext()
	}

	options := lipgloss.NewStyle().
		Foreground(mutedColor).
		Align(lipgloss.Center).
		MarginTop(1).
		Render("[R] Reset to default  [Q] Quit")

	var content string
	if contextLines != "" {
		content = lipgloss.JoinVertical(
			lipgloss.Center,
			"",
			title,
			filePath,
			errorMsg,
			contextLines,
			"",
			options,
			"",
		)
	} else {
		content = lipgloss.JoinVertical(
			lipgloss.Center,
			"",
			title,
			filePath,
			errorMsg,
			"",
			options,
			"",
		)
	}

	modal := lipgloss.NewStyle().
		Border(lipgloss.RoundedBorder()).
		BorderForeground(primaryColor).
		Padding(1, 3).
		Width(70).
		Render(content)

	return lipgloss.Place(width, height, lipgloss.Center, lipgloss.Center, modal)
}

// renderLineContext renders the error line with 2 lines of context
func (m *ConfigErrorModal) renderLineContext() string {
	if len(m.fileContent) == 0 {
		return ""
	}

	mutedColor := lipgloss.Color("240")
	errorColor := lipgloss.Color("196")
	lineNumStyle := lipgloss.NewStyle().Foreground(mutedColor).Width(4)
	errorLineStyle := lipgloss.NewStyle().Foreground(errorColor).Bold(true)

	var lines []string
	start := max(0, m.lineNumber-3)  // Show 2 lines before
	end := min(len(m.fileContent), m.lineNumber+2)  // Show 2 lines after

	for i := start; i < end; i++ {
		lineNum := i + 1
		lineText := m.fileContent[i]

		// Truncate long lines
		if len(lineText) > 60 {
			lineText = lineText[:57] + "..."
		}

		lineNumStr := lineNumStyle.Render(fmt.Sprintf("%3d│ ", lineNum))

		if lineNum == m.lineNumber {
			// Error line - highlight it
			lines = append(lines, lineNumStr+errorLineStyle.Render(lineText)+" ← Error")
		} else {
			lines = append(lines, lineNumStr+lineText)
		}
	}

	return lipgloss.NewStyle().
		Align(lipgloss.Left).
		MarginTop(1).
		MarginBottom(1).
		Render(strings.Join(lines, "\n"))
}

// wrapText wraps text to fit within the specified width
func wrapText(text string, width int) string {
	if len(text) <= width {
		return text
	}

	var wrapped []string
	words := strings.Fields(text)
	var line string

	for _, word := range words {
		if len(line)+len(word)+1 <= width {
			if line == "" {
				line = word
			} else {
				line += " " + word
			}
		} else {
			if line != "" {
				wrapped = append(wrapped, line)
			}
			line = word
		}
	}

	if line != "" {
		wrapped = append(wrapped, line)
	}

	return strings.Join(wrapped, "\n")
}

// IsBlockingInput returns true (this modal blocks all input)
func (m *ConfigErrorModal) IsBlockingInput() bool {
	return true
}

func min(a, b int) int {
	if a < b {
		return a
	}
	return b
}

func max(a, b int) int {
	if a > b {
		return a
	}
	return b
}
