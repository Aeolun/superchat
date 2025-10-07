package ui

import (
	"github.com/charmbracelet/lipgloss"
)

var (
	// Color scheme (exported for view package)
	PrimaryColor   = lipgloss.Color("39")  // Blue
	SecondaryColor = lipgloss.Color("213") // Pink
	SuccessColor   = lipgloss.Color("42")  // Green
	ErrorColor     = lipgloss.Color("196") // Red
	WarningColor   = lipgloss.Color("214") // Orange
	MutedColor     = lipgloss.Color("243") // Gray
	BorderColor    = lipgloss.Color("238") // Dark gray

	// Base styles
	BaseStyle = lipgloss.NewStyle()

	// Header styles (exported for view package)
	HeaderStyle = BaseStyle.Copy().
			Bold(true).
			Foreground(PrimaryColor).
			Padding(0, 1)

	StatusStyle = BaseStyle.Copy().
			Foreground(MutedColor).
			Padding(0, 1)

	// Footer styles (exported for view package)
	FooterStyle = BaseStyle.Copy().
			Foreground(MutedColor).
			Padding(0, 1)

	ShortcutKeyStyle = BaseStyle.Copy().
				Foreground(PrimaryColor).
				Bold(true)

	ShortcutDescStyle = BaseStyle.Copy().
				Foreground(lipgloss.Color("252"))

	// List styles (exported for view package)
	SelectedItemStyle = BaseStyle.Copy().
				Foreground(PrimaryColor).
				Bold(true)

	UnselectedItemStyle = BaseStyle.Copy().
				Foreground(lipgloss.Color("252"))

	// Channel list styles (exported for view package)
	ChannelPaneStyle = BaseStyle.Copy().
				Border(lipgloss.RoundedBorder()).
				BorderForeground(BorderColor).
				Padding(0, 1)

	ChannelTitleStyle = BaseStyle.Copy().
				Bold(true).
				Foreground(PrimaryColor)

	ChannelItemStyle = BaseStyle.Copy()

	// Thread list styles (exported for view package)
	ThreadPaneStyle = BaseStyle.Copy().
			Border(lipgloss.RoundedBorder()).
			BorderForeground(BorderColor)

	ActualThreadStyle = BaseStyle.Copy().
				Border(lipgloss.RoundedBorder()).
				BorderForeground(BorderColor).
				Padding(0, 1) // Top/bottom padding only, no left/right padding

	ThreadTitleStyle = BaseStyle.Copy().
				Bold(true).
				Foreground(PrimaryColor).
				MarginBottom(1)

	// Message styles (exported for view package)
	MessageAuthorStyle = BaseStyle.Copy().
				Foreground(SecondaryColor)

	MessageAnonymousStyle = BaseStyle.Copy().
				Foreground(SecondaryColor)

	MessageOwnAuthorStyle = BaseStyle.Copy().
				Foreground(SuccessColor).
				Bold(true)

	MessageTimeStyle = BaseStyle.Copy().
				Foreground(MutedColor).
				Italic(true)

	MessageContentStyle = BaseStyle.Copy().
				Foreground(lipgloss.Color("252"))

	MessageDepthStyle = BaseStyle.Copy().
				Foreground(MutedColor)

	// Modal styles (exported for view package)
	// Note: Width sets content width, border (2 chars) is added on top
	ModalStyle = BaseStyle.Copy().
			Border(lipgloss.DoubleBorder()).
			BorderForeground(PrimaryColor).
			Padding(1, 2).
			Width(58) // 58 + 2 (border) = 60 total

	ModalTitleStyle = BaseStyle.Copy().
			Bold(true).
			Foreground(PrimaryColor).
			MarginBottom(1)

	// Input styles (exported for view package)
	InputStyle = BaseStyle.Copy().
			Border(lipgloss.RoundedBorder()).
			BorderForeground(BorderColor).
			Padding(0, 1)

	InputFocusedStyle = BaseStyle.Copy().
				Border(lipgloss.RoundedBorder()).
				BorderForeground(PrimaryColor).
				Padding(0, 1)

	InputBlurredStyle = BaseStyle.Copy().
				Border(lipgloss.RoundedBorder()).
				BorderForeground(BorderColor).
				Foreground(MutedColor).
				Padding(0, 1)

	// Error/success styles (exported for view package)
	ErrorStyle = BaseStyle.Copy().
			Foreground(ErrorColor).
			Bold(true)

	SuccessStyle = BaseStyle.Copy().
			Foreground(SuccessColor).
			Bold(true)

	WarningStyle = BaseStyle.Copy().
			Foreground(WarningColor).
			Bold(true)

	// Help styles (exported for view package)
	HelpTitleStyle = BaseStyle.Copy().
			Bold(true).
			Foreground(PrimaryColor).
			MarginBottom(1)

	HelpKeyStyle = BaseStyle.Copy().
			Foreground(PrimaryColor).
			Bold(true).
			Width(12)

	HelpDescStyle = BaseStyle.Copy().
			Foreground(lipgloss.Color("252"))

	// Splash screen styles (exported for view package)
	SplashTitleStyle = BaseStyle.Copy().
				Bold(true).
				Foreground(PrimaryColor).
				Align(lipgloss.Center).
				MarginBottom(2)

	SplashBodyStyle = BaseStyle.Copy().
			Foreground(lipgloss.Color("252")).
			Align(lipgloss.Left).
			MarginBottom(1)

	SplashPromptStyle = BaseStyle.Copy().
				Foreground(MutedColor).
				Italic(true).
				Align(lipgloss.Center).
				MarginTop(2)

	// Muted text style (exported for view package)
	MutedTextStyle = BaseStyle.Copy().
			Foreground(MutedColor)

	// Spinner style (exported for view package)
	SpinnerStyle = BaseStyle.Copy().
			Foreground(PrimaryColor)
)

// Styles holds all UI styles including spinner
var Styles = struct {
	Spinner lipgloss.Style
}{
	Spinner: SpinnerStyle,
}

// RenderShortcut renders a keyboard shortcut
func RenderShortcut(key, desc string) string {
	return ShortcutKeyStyle.Render("["+key+"]") + " " + ShortcutDescStyle.Render(desc)
}

// RenderError renders an error message
func RenderError(msg string) string {
	return ErrorStyle.Render("✗ " + msg)
}

// RenderSuccess renders a success message
func RenderSuccess(msg string) string {
	return SuccessStyle.Render("✓ " + msg)
}

// RenderWarning renders a warning message
func RenderWarning(msg string) string {
	return WarningStyle.Render("⚠ " + msg)
}
