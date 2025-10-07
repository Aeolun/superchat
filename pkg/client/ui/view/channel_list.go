package view

import (
	"fmt"
	"strings"

	"github.com/76creates/stickers/flexbox"
	"github.com/aeolun/superchat/pkg/client"
	"github.com/aeolun/superchat/pkg/client/ui"
	"github.com/aeolun/superchat/pkg/protocol"
	"github.com/charmbracelet/bubbles/spinner"
	"github.com/charmbracelet/lipgloss"
)

// RenderChannelList renders the channel list view
func RenderChannelList(
	width, height int,
	currentVersion, latestVersion string,
	updateAvailable bool,
	conn client.ConnectionInterface,
	nickname string,
	authState int,
	onlineUsers uint32,
	channels []protocol.Channel,
	channelCursor int,
	loadingChannels bool,
	spin spinner.Model,
	shortcuts string,
	statusMessage string,
	errorMessage string,
) string {
	// Create flexbox layout (vertical: header, body, footer)
	layout := NewVerticalLayout(width, height)

	// Row 1: Header (fixed height = 1 line)
	headerRow := layout.NewRow().AddCells(
		flexbox.NewCell(1, 1).SetContent(
			RenderHeader(width, currentVersion, conn, nickname, authState, onlineUsers),
		),
	)

	// Row 2: Main content area (flex = remaining space)
	// This row contains 2 columns: channel list (25%) + main pane (75%)
	contentHeight := height - 4 // Subtract header(1) + blank(1) + footer(1) + blank(1)

	// Build channel pane content
	channelContent := buildChannelPaneContent(conn, channels, channelCursor, loadingChannels, spin)

	// Build main pane content (instructions)
	mainContent := buildChannelListInstructions(updateAvailable, currentVersion, latestVersion)

	// Create horizontal layout for the content row
	contentLayout := flexbox.NewHorizontal(width, contentHeight)

	// Column 1: Channel pane (ratio 1 = 25%)
	channelCol := contentLayout.NewColumn().AddCells(
		flexbox.NewCell(1, 1).
			SetStyle(ui.ChannelPaneStyle).
			SetContentGenerator(func(w, h int) string {
				return channelContent
			}),
	)

	// Column 2: Main pane (ratio 3 = 75%)
	mainCol := contentLayout.NewColumn().AddCells(
		flexbox.NewCell(1, 1).
			SetStyle(ui.ThreadPaneStyle).
			SetContentGenerator(func(w, h int) string {
				return mainContent
			}),
	)

	contentLayout.AddColumns([]*flexbox.Column{channelCol, mainCol})

	contentRow := layout.NewRow().AddCells(
		flexbox.NewCell(1, contentHeight).SetContent(contentLayout.Render()),
	)

	// Row 3: Footer (fixed height = 1 line)
	footerRow := layout.NewRow().AddCells(
		flexbox.NewCell(1, 1).SetContent(
			RenderFooter(width, shortcuts, statusMessage, errorMessage),
		),
	)

	layout.AddRows([]*flexbox.Row{headerRow, contentRow, footerRow})

	return layout.Render()
}

// buildChannelPaneContent builds the channel list content
func buildChannelPaneContent(
	conn client.ConnectionInterface,
	channels []protocol.Channel,
	channelCursor int,
	loadingChannels bool,
	spin spinner.Model,
) string {
	title := ui.ChannelTitleStyle.Render("Channels")

	// Format server address, hiding default port (6465)
	addr := conn.GetAddress()
	if idx := strings.LastIndex(addr, ":6465"); idx != -1 {
		addr = addr[:idx]
	}
	serverAddr := ui.MutedTextStyle.MarginBottom(1).Render(addr)

	var items []string

	// Show loading indicator if loading channels
	if loadingChannels {
		items = append(items, ui.MutedTextStyle.Render("  "+spin.View()+" Loading channels..."))
	} else {
		for i, channel := range channels {
			// Use '>' prefix for chat channels (type 0), '#' for forum channels (type 1)
			var prefix string
			if channel.Type == 0 {
				prefix = ">"
			} else {
				prefix = "#"
			}
			item := prefix + channel.Name
			if i == channelCursor {
				item = ui.SelectedItemStyle.Render("▶ " + item)
			} else {
				item = ui.UnselectedItemStyle.Render("  " + item)
			}
			items = append(items, item)
		}

		if len(items) == 0 {
			items = append(items, ui.MutedTextStyle.Render("  (no channels)"))
		}
	}

	return lipgloss.JoinVertical(
		lipgloss.Left,
		title,
		serverAddr,
		strings.Join(items, "\n"),
	)
}

// buildChannelListInstructions builds the welcome instructions for channel list view
func buildChannelListInstructions(updateAvailable bool, currentVersion, latestVersion string) string {
	welcomeLines := []string{
		"Welcome to SuperChat!",
		"",
	}

	// Add update notification if available
	if updateAvailable {
		updateNotice := lipgloss.NewStyle().
			Foreground(ui.WarningColor).
			Bold(true).
			Render(fmt.Sprintf("⚠ Update available: %s → %s", currentVersion, latestVersion))

		updateInstr := lipgloss.NewStyle().
			Foreground(ui.MutedColor).
			Render("Run 'sc update' in your terminal to update")

		welcomeLines = append(welcomeLines, updateNotice, updateInstr, "", "")
	}

	welcomeLines = append(welcomeLines,
		"Select a channel from the left to start browsing.",
		"",
		"Anonymous vs Registered:",
		"• Anonymous: Post as ~username (no password)",
		"• Registered: Post as username (press [Ctrl+R] to register)",
		"",
		"Useful shortcuts:",
		"• [n] to create a new thread once in a channel",
		"• [Ctrl+L] to switch servers",
		"• [h] or [?] for help",
	)

	return lipgloss.NewStyle().
		PaddingLeft(2).
		Render(lipgloss.JoinVertical(lipgloss.Left, welcomeLines...))
}
