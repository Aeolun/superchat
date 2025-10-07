package view

import (
	"fmt"
	"strings"

	"github.com/aeolun/superchat/pkg/client"
	"github.com/aeolun/superchat/pkg/client/ui"
	"github.com/charmbracelet/lipgloss"
)

// RenderHeader renders the application header
func RenderHeader(width int, currentVersion string, conn client.ConnectionInterface, nickname string, authState int, onlineUsers uint32) string {
	left := ui.HeaderStyle.Render(fmt.Sprintf("SuperChat %s", currentVersion))

	status := "Disconnected"
	if conn.IsConnected() {
		if nickname != "" {
			// Show auth status: ~ for anonymous, no prefix for authenticated
			prefix := ""
			// AuthStateAnonymous=5, AuthStateNone=0
			if authState == 5 || authState == 0 {
				prefix = "~"
			}
			status = fmt.Sprintf("Connected: %s%s", prefix, nickname)
		} else {
			status = "Connected (anonymous)"
		}
		if onlineUsers > 0 {
			status += fmt.Sprintf("  %d users", onlineUsers)
		}

		// Add traffic counter
		sent := formatBytes(conn.GetBytesSent())
		recv := formatBytes(conn.GetBytesReceived())
		traffic := ui.MutedTextStyle.Render(fmt.Sprintf("  ↑%s ↓%s", sent, recv))
		status += traffic
	}

	right := ui.StatusStyle.Render(status)

	spacer := strings.Repeat(" ", max(0, width-lipgloss.Width(left)-lipgloss.Width(right)))

	return left + spacer + right
}

// RenderFooter renders the footer with shortcuts and messages
func RenderFooter(width int, shortcuts string, statusMessage string, errorMessage string) string {
	// Build footer content
	footerContent := shortcuts

	if statusMessage != "" {
		footerContent += "  " + ui.SuccessStyle.Render(statusMessage)
	}

	if errorMessage != "" {
		footerContent += "  " + ui.RenderError(errorMessage)
	}

	// Truncate if too long (account for padding in footerStyle)
	// footerStyle has Padding(0, 1) which adds 2 chars total
	maxWidth := width - 2
	suffix := " [?/h] for more…"
	fadeLength := 3

	if lipgloss.Width(footerContent) > maxWidth {
		// Truncate, leaving room for fade effect and suffix
		truncateAt := maxWidth - lipgloss.Width(suffix) - fadeLength
		truncated := truncateString(footerContent, truncateAt)

		// Trim trailing spaces so we don't fade invisible characters
		trimmed := strings.TrimRight(truncated, " ")
		trimmedWidth := lipgloss.Width(trimmed)

		// Extract the next fadeLength visible (non-space) characters for fading
		remainingContent := getVisibleSubstring(footerContent, trimmedWidth, fadeLength)

		// Apply fade effect to these characters
		// Colors: #666666 -> #444444 -> #222222
		fadeColors := []string{"#666666", "#444444", "#222222"}
		var faded strings.Builder
		for i, r := range []rune(remainingContent) {
			if i < len(fadeColors) {
				faded.WriteString(lipgloss.NewStyle().Foreground(lipgloss.Color(fadeColors[i])).Render(string(r)))
			} else {
				faded.WriteRune(r)
			}
		}

		footerContent = trimmed + faded.String() + suffix
	}

	footer := ui.FooterStyle.Render(footerContent)
	return footer
}

// RenderDisconnectedOverlay renders a full-screen overlay when disconnected
func RenderDisconnectedOverlay(width, height int) string {
	title := lipgloss.NewStyle().
		Bold(true).
		Foreground(ui.ErrorColor).
		Align(lipgloss.Center).
		MarginBottom(2).
		Render("⚠  CONNECTION LOST  ⚠")

	message := lipgloss.NewStyle().
		Foreground(lipgloss.Color("252")).
		Align(lipgloss.Center).
		MarginBottom(1).
		Render("The connection to the server has been lost.")

	info := lipgloss.NewStyle().
		Foreground(ui.MutedColor).
		Align(lipgloss.Center).
		Render("Attempting to reconnect...")

	content := lipgloss.JoinVertical(
		lipgloss.Center,
		"",
		title,
		message,
		info,
		"",
	)

	box := lipgloss.NewStyle().
		Border(lipgloss.DoubleBorder()).
		BorderForeground(ui.ErrorColor).
		Padding(2, 4).
		Render(content)

	return lipgloss.Place(width, height, lipgloss.Center, lipgloss.Center, box)
}

// RenderReconnectingOverlay renders a full-screen overlay when reconnecting
func RenderReconnectingOverlay(width, height int, reconnectAttempt int) string {
	title := lipgloss.NewStyle().
		Bold(true).
		Foreground(ui.WarningColor).
		Align(lipgloss.Center).
		MarginBottom(2).
		Render("RECONNECTING...")

	attemptMsg := fmt.Sprintf("Attempt %d", reconnectAttempt)
	message := lipgloss.NewStyle().
		Foreground(lipgloss.Color("252")).
		Align(lipgloss.Center).
		MarginBottom(1).
		Render(attemptMsg)

	info := lipgloss.NewStyle().
		Foreground(ui.MutedColor).
		Align(lipgloss.Center).
		Render("Please wait while we restore your connection...")

	// Animated dots based on attempt number
	dots := strings.Repeat(".", (reconnectAttempt % 4))
	spinner := lipgloss.NewStyle().
		Foreground(ui.PrimaryColor).
		Align(lipgloss.Center).
		MarginTop(1).
		Render(dots)

	content := lipgloss.JoinVertical(
		lipgloss.Center,
		"",
		title,
		message,
		info,
		spinner,
		"",
	)

	box := lipgloss.NewStyle().
		Border(lipgloss.DoubleBorder()).
		BorderForeground(ui.WarningColor).
		Padding(2, 4).
		Render(content)

	return lipgloss.Place(width, height, lipgloss.Center, lipgloss.Center, box)
}
