package ui

import (
	"github.com/charmbracelet/lipgloss"
)

var (
	// Color scheme
	primaryColor   = lipgloss.Color("39")  // Blue
	secondaryColor = lipgloss.Color("213") // Pink
	successColor   = lipgloss.Color("42")  // Green
	errorColor     = lipgloss.Color("196") // Red
	warningColor   = lipgloss.Color("214") // Orange
	mutedColor     = lipgloss.Color("243") // Gray
	borderColor    = lipgloss.Color("238") // Dark gray

	// Base styles
	baseStyle = lipgloss.NewStyle()

	// Header styles
	headerStyle = baseStyle.Copy().
			Bold(true).
			Foreground(primaryColor).
			Padding(0, 1)

	statusStyle = baseStyle.Copy().
			Foreground(mutedColor).
			Padding(0, 1)

	// Footer styles
	footerStyle = baseStyle.Copy().
			Foreground(mutedColor).
			Padding(0, 1)

	shortcutKeyStyle = baseStyle.Copy().
				Foreground(primaryColor).
				Bold(true)

	shortcutDescStyle = baseStyle.Copy().
				Foreground(lipgloss.Color("252"))

	// List styles
	selectedItemStyle = baseStyle.Copy().
				Foreground(primaryColor).
				Bold(true)

	unselectedItemStyle = baseStyle.Copy().
				Foreground(lipgloss.Color("252"))

	// Channel list styles
	channelPaneStyle = baseStyle.Copy().
				Border(lipgloss.RoundedBorder()).
				BorderForeground(borderColor).
				Padding(1, 2)

	channelTitleStyle = baseStyle.Copy().
				Bold(true).
				Foreground(primaryColor)

	channelItemStyle = baseStyle.Copy()

	// Thread list styles
	threadPaneStyle = baseStyle.Copy().
			Border(lipgloss.RoundedBorder()).
			BorderForeground(borderColor).
			Padding(1, 0) // Top/bottom padding only, no left/right padding

	actualThreadStyle = baseStyle.Copy().
				Border(lipgloss.RoundedBorder()).
				BorderForeground(borderColor).
				Padding(1, 2) // Top/bottom padding only, no left/right padding

	threadTitleStyle = baseStyle.Copy().
				Bold(true).
				Foreground(primaryColor).
				MarginBottom(1)

	// Message styles
	messageAuthorStyle = baseStyle.Copy().
				Foreground(secondaryColor)

	messageAnonymousStyle = baseStyle.Copy().
				Foreground(secondaryColor)

	messageTimeStyle = baseStyle.Copy().
				Foreground(mutedColor).
				Italic(true)

	messageContentStyle = baseStyle.Copy().
				Foreground(lipgloss.Color("252"))

	messageDepthStyle = baseStyle.Copy().
				Foreground(mutedColor)

	// Modal styles
	// Note: Width sets content width, border (2 chars) is added on top
	modalStyle = baseStyle.Copy().
			Border(lipgloss.DoubleBorder()).
			BorderForeground(primaryColor).
			Padding(1, 2).
			Width(58) // 58 + 2 (border) = 60 total

	modalTitleStyle = baseStyle.Copy().
			Bold(true).
			Foreground(primaryColor).
			MarginBottom(1)

	// Input styles
	inputStyle = baseStyle.Copy().
			Border(lipgloss.RoundedBorder()).
			BorderForeground(borderColor).
			Padding(0, 1)

	inputFocusedStyle = baseStyle.Copy().
				Border(lipgloss.RoundedBorder()).
				BorderForeground(primaryColor).
				Padding(0, 1)

	inputBlurredStyle = baseStyle.Copy().
				Border(lipgloss.RoundedBorder()).
				BorderForeground(borderColor).
				Foreground(mutedColor).
				Padding(0, 1)

	// Error/success styles
	errorStyle = baseStyle.Copy().
			Foreground(errorColor).
			Bold(true)

	successStyle = baseStyle.Copy().
			Foreground(successColor).
			Bold(true)

	warningStyle = baseStyle.Copy().
			Foreground(warningColor).
			Bold(true)

	// Help styles
	helpTitleStyle = baseStyle.Copy().
			Bold(true).
			Foreground(primaryColor).
			MarginBottom(1)

	helpKeyStyle = baseStyle.Copy().
			Foreground(primaryColor).
			Bold(true).
			Width(12)

	helpDescStyle = baseStyle.Copy().
			Foreground(lipgloss.Color("252"))

	// Splash screen styles
	splashTitleStyle = baseStyle.Copy().
				Bold(true).
				Foreground(primaryColor).
				Align(lipgloss.Center).
				MarginBottom(2)

	splashBodyStyle = baseStyle.Copy().
			Foreground(lipgloss.Color("252")).
			Align(lipgloss.Left).
			MarginBottom(1)

	splashPromptStyle = baseStyle.Copy().
				Foreground(mutedColor).
				Italic(true).
				Align(lipgloss.Center).
				MarginTop(2)

	// Muted text style
	mutedTextStyle = baseStyle.Copy().
			Foreground(mutedColor)
)

// RenderShortcut renders a keyboard shortcut
func RenderShortcut(key, desc string) string {
	return shortcutKeyStyle.Render("["+key+"]") + " " + shortcutDescStyle.Render(desc)
}

// RenderError renders an error message
func RenderError(msg string) string {
	return errorStyle.Render("✗ " + msg)
}

// RenderSuccess renders a success message
func RenderSuccess(msg string) string {
	return successStyle.Render("✓ " + msg)
}

// RenderWarning renders a warning message
func RenderWarning(msg string) string {
	return warningStyle.Render("⚠ " + msg)
}
