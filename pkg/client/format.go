// ABOUTME: Formatting utilities for client UIs
// ABOUTME: Shared functions for displaying bandwidth, file sizes, messages, etc.
package client

import (
	"fmt"
	"strings"
	"time"

	"github.com/aeolun/superchat/pkg/protocol"
)

// FormatBytes formats bytes into human-readable form (B, KB, MB, etc.)
func FormatBytes(bytes uint64) string {
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

// FormatBandwidth converts bytes/sec to modem-equivalent display (14.4k, 56k, etc.)
func FormatBandwidth(bytesPerSec int) string {
	// Convert bytes/sec to bits/sec (multiply by 8)
	bitsPerSec := bytesPerSec * 8

	// Common modem speeds in bits/sec
	switch {
	case bitsPerSec <= 14400:
		return "14.4k"
	case bitsPerSec <= 28800:
		return "28.8k"
	case bitsPerSec <= 33600:
		return "33.6k"
	case bitsPerSec <= 56000:
		return "56k"
	case bitsPerSec <= 128000:
		return "128k"
	case bitsPerSec <= 256000:
		return "256k"
	case bitsPerSec <= 512000:
		return "512k"
	case bitsPerSec <= 1024000:
		return "1Mbps"
	case bitsPerSec <= 10240000:
		return fmt.Sprintf("%.1fMbps", float64(bitsPerSec)/1000000)
	default:
		return fmt.Sprintf("%.1fMbps", float64(bitsPerSec)/1000000)
	}
}

// FormatThreadItem formats a thread message for display in a list
// Returns: "author preview  time(replies)"
func FormatThreadItem(thread protocol.Message, maxPreviewChars int) string {
	// Server already prefixes anonymous users with ~
	author := thread.AuthorNickname

	// Extract thread title (respects double newline convention)
	preview := ExtractThreadTitle(thread.Content, maxPreviewChars)
	// Replace newlines with spaces for display
	preview = strings.ReplaceAll(preview, "\n", " ")

	// Format time
	timeStr := FormatRelativeTime(thread.CreatedAt)

	// Format reply count
	replyCount := ""
	if thread.ReplyCount > 0 {
		replyCount = fmt.Sprintf(" (%d)", thread.ReplyCount)
	}

	// Format: "author preview  time(replies)"
	return fmt.Sprintf("%s %s  %s%s", author, preview, timeStr, replyCount)
}

// ExtractThreadTitle extracts the title from thread content
// Respects the double-newline convention for explicit title separation
func ExtractThreadTitle(content string, maxChars int) string {
	// Find first double newline
	doubleNewlineIdx := strings.Index(content, "\n\n")

	if doubleNewlineIdx >= 0 {
		// User explicitly ended the title with double newline
		title := content[:doubleNewlineIdx]
		// Still respect maxChars
		if len(title) > maxChars {
			return title[:maxChars]
		}
		return title
	}

	// No double newline, use first maxChars (or entire content if shorter)
	if len(content) > maxChars {
		return content[:maxChars]
	}
	return content
}

// FormatRelativeTime formats a timestamp relative to now
// Returns strings like "just now", "5m ago", "2h ago", "3d ago"
func FormatRelativeTime(t time.Time) string {
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

// SortThreadReplies sorts messages in depth-first order based on tree structure
// Messages are grouped by parent and sorted by timestamp within each group
func SortThreadReplies(replies []protocol.Message, rootID uint64) []protocol.Message {
	if len(replies) == 0 {
		return replies
	}

	// Build a map of parent_id -> children
	childrenMap := make(map[uint64][]protocol.Message)
	for _, msg := range replies {
		if msg.ParentID != nil {
			parentID := *msg.ParentID
			childrenMap[parentID] = append(childrenMap[parentID], msg)
		}
	}

	// Sort children by creation time within each parent group
	for _, children := range childrenMap {
		// Use stable sort to maintain deterministic ordering
		for i := 0; i < len(children); i++ {
			for j := i + 1; j < len(children); j++ {
				if children[j].CreatedAt.Before(children[i].CreatedAt) {
					children[i], children[j] = children[j], children[i]
				}
			}
		}
	}

	// Depth-first traversal to build final ordered list
	var result []protocol.Message
	var traverse func(parentID uint64)
	traverse = func(parentID uint64) {
		children := childrenMap[parentID]
		for _, child := range children {
			result = append(result, child)
			// Recursively add this child's children
			traverse(child.ID)
		}
	}

	// Start traversal from root
	traverse(rootID)

	return result
}

// CalculateThreadDepths builds a depth map for all messages in the thread
// Root message is depth 0, direct replies are depth 1, etc.
func CalculateThreadDepths(rootID uint64, replies []protocol.Message) map[uint64]int {
	depths := make(map[uint64]int)

	// Root is always depth 0
	depths[rootID] = 0

	// Build parent->children map
	childrenMap := make(map[uint64][]protocol.Message)
	for _, reply := range replies {
		if reply.ParentID != nil {
			childrenMap[*reply.ParentID] = append(childrenMap[*reply.ParentID], reply)
		}
	}

	// BFS traversal to assign depths
	queue := []uint64{rootID}
	for len(queue) > 0 {
		parentID := queue[0]
		queue = queue[1:]
		parentDepth := depths[parentID]

		for _, child := range childrenMap[parentID] {
			depths[child.ID] = parentDepth + 1
			queue = append(queue, child.ID)
		}
	}

	return depths
}
