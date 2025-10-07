package view

import (
	"fmt"
	"strings"

	"github.com/aeolun/superchat/pkg/client/ui"
	"github.com/charmbracelet/lipgloss"
)

// RenderSplash renders the splash screen
func RenderSplash(width, height int, currentVersion string) string {
	var s strings.Builder

	title := ui.SplashTitleStyle.Render(fmt.Sprintf("SuperChat %s", currentVersion))
	subtitle := lipgloss.NewStyle().
		Foreground(lipgloss.Color("252")).
		Align(lipgloss.Center).
		MarginBottom(1).
		Render("A terminal-based threaded chat application")

	body := ui.SplashBodyStyle.Render(`Getting Started:
• Use arrow keys (↑↓←→) to navigate
• Press [Enter] to select channels and threads
• Press [h] or [?] anytime for help
• Press [n] to start a new thread

Anonymous vs Registered:
• Anonymous: Post as ~username (no password required)
• Registered: Post as username (use [Ctrl+R] to register)
• Registering secures your nickname with a password

You can browse anonymously without setting a nickname.
When you want to post, you'll be prompted to set one.`)

	prompt := ui.SplashPromptStyle.Render("[Press any key to continue]")

	content := lipgloss.JoinVertical(
		lipgloss.Left,
		title,
		subtitle,
		"",
		body,
		"",
		prompt,
	)

	box := ui.ModalStyle.Render(content)
	s.WriteString("\n\n")
	s.WriteString(lipgloss.Place(width, height-4, lipgloss.Center, lipgloss.Center, box))

	return s.String()
}
