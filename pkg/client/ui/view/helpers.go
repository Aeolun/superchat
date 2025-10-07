package view

import (
	"fmt"
	"strings"
	"time"

	"github.com/76creates/stickers/flexbox"
	"github.com/aeolun/superchat/pkg/protocol"
	"github.com/charmbracelet/lipgloss"
)

// formatTime formats a timestamp as relative time
func formatTime(t time.Time) string {
	now := time.Now()
	diff := now.Sub(t)

	if diff < time.Minute {
		return "just now"
	}
	if diff < time.Hour {
		mins := int(diff.Minutes())
		return fmt.Sprintf("%dm ago", mins)
	}
	if diff < 24*time.Hour {
		hours := int(diff.Hours())
		return fmt.Sprintf("%dh ago", hours)
	}
	days := int(diff.Hours() / 24)
	return fmt.Sprintf("%dd ago", days)
}

// formatBytes formats bytes into human-readable form
func formatBytes(bytes uint64) string {
	const unit = 1024
	if bytes < unit {
		return fmt.Sprintf("%dB", bytes)
	}
	div, exp := uint64(unit), 0
	for n := bytes / unit; n >= unit; n /= unit {
		div *= unit
		exp++
	}
	return fmt.Sprintf("%.1f%cB", float64(bytes)/float64(div), "KMGTPE"[exp])
}

// truncateString truncates a string to maxLen runes, accounting for ANSI escape codes
func truncateString(s string, maxLen int) string {
	// Use lipgloss.Width to handle ANSI codes properly
	if lipgloss.Width(s) <= maxLen {
		return s
	}

	// Iterate through runes and truncate when we hit the limit
	var result strings.Builder
	currentWidth := 0
	inEscape := false

	for _, r := range s {
		// Track ANSI escape sequences (don't count toward width)
		if r == '\x1b' {
			inEscape = true
		}

		if inEscape {
			result.WriteRune(r)
			if r == 'm' {
				inEscape = false
			}
			continue
		}

		// Check if adding this rune would exceed the limit
		if currentWidth >= maxLen {
			break
		}

		result.WriteRune(r)
		currentWidth++
	}

	return result.String()
}

// getVisibleSubstring gets a substring of visible characters, skipping ANSI codes
func getVisibleSubstring(s string, start, length int) string {
	var result strings.Builder
	currentPos := 0
	inEscape := false
	collecting := false

	for _, r := range s {
		// Track ANSI escape sequences
		if r == '\x1b' {
			inEscape = true
		}

		if inEscape {
			if collecting {
				result.WriteRune(r)
			}
			if r == 'm' {
				inEscape = false
			}
			continue
		}

		// Start collecting once we reach the start position
		if currentPos >= start {
			if !collecting {
				collecting = true
			}
			result.WriteRune(r)
			if currentPos-start+1 >= length {
				break
			}
		}

		currentPos++
	}

	return result.String()
}

// wrapText wraps text to fit within the specified width
func wrapText(text string, width int) []string {
	if width <= 0 {
		return []string{text}
	}

	var lines []string
	words := strings.Fields(text)
	if len(words) == 0 {
		return []string{""}
	}

	currentLine := ""
	for _, word := range words {
		// If word itself is longer than width, we'll just let it overflow
		if len(word) > width {
			if currentLine != "" {
				lines = append(lines, currentLine)
				currentLine = ""
			}
			lines = append(lines, word)
			continue
		}

		// Check if adding this word would exceed width
		testLine := currentLine
		if testLine != "" {
			testLine += " "
		}
		testLine += word

		if len(testLine) > width {
			// Adding this word would exceed width, so start a new line
			if currentLine != "" {
				lines = append(lines, currentLine)
			}
			currentLine = word
		} else {
			currentLine = testLine
		}
	}

	// Add the last line
	if currentLine != "" {
		lines = append(lines, currentLine)
	}

	return lines
}

// isOwnMessage checks if a message was authored by the current user
func isOwnMessage(msg protocol.Message, userID *uint64, nickname string) bool {
	// For registered users, compare user ID
	if userID != nil && msg.AuthorUserID != nil {
		return *userID == *msg.AuthorUserID
	}

	// For anonymous users, compare nickname (strip prefix from server's AuthorNickname)
	// Server sends "~nickname" for anonymous users
	strippedNickname := strings.TrimPrefix(msg.AuthorNickname, "~")
	return strippedNickname == nickname
}

// NewFlexLayout creates a horizontal flexbox layout with the given width and height
func NewFlexLayout(width, height int) *flexbox.HorizontalFlexBox {
	return flexbox.NewHorizontal(width, height)
}

// NewVerticalLayout creates a vertical flexbox layout with the given width and height
func NewVerticalLayout(width, height int) *flexbox.FlexBox {
	return flexbox.New(width, height)
}

func max(a, b int) int {
	if a > b {
		return a
	}
	return b
}

func min(a, b int) int {
	if a < b {
		return a
	}
	return b
}
