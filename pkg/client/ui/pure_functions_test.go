package ui

import (
	"strings"
	"testing"
	"time"

	"github.com/aeolun/superchat/pkg/protocol"
)

// Test pure functions (no dependencies on Model state)

func TestFormatTime(t *testing.T) {
	now := time.Now()

	tests := []struct {
		name     string
		time     time.Time
		expected string
	}{
		{
			name:     "just now",
			time:     now.Add(-30 * time.Second),
			expected: "just now",
		},
		{
			name:     "5 minutes ago",
			time:     now.Add(-5 * time.Minute),
			expected: "5m ago",
		},
		{
			name:     "2 hours ago",
			time:     now.Add(-2 * time.Hour),
			expected: "2h ago",
		},
		{
			name:     "3 days ago",
			time:     now.Add(-3 * 24 * time.Hour),
			expected: "3d ago",
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			result := formatTime(tt.time)
			if result != tt.expected {
				t.Errorf("formatTime(%v) = %q, want %q", tt.time, result, tt.expected)
			}
		})
	}
}

func TestSortThreadReplies(t *testing.T) {
	now := time.Now()
	rootID := uint64(1)

	tests := []struct {
		name     string
		replies  []protocol.Message
		expected []uint64 // Expected order of message IDs
	}{
		{
			name:     "empty list",
			replies:  []protocol.Message{},
			expected: []uint64{},
		},
		{
			name: "flat replies (all reply to root)",
			replies: []protocol.Message{
				{ID: 3, ParentID: &rootID, CreatedAt: now.Add(2 * time.Second)},
				{ID: 2, ParentID: &rootID, CreatedAt: now.Add(1 * time.Second)},
				{ID: 4, ParentID: &rootID, CreatedAt: now.Add(3 * time.Second)},
			},
			expected: []uint64{2, 3, 4}, // Sorted by time
		},
		{
			name: "nested replies (depth-first)",
			replies: func() []protocol.Message {
				msg2ID := uint64(2)
				msg3ID := uint64(3)
				return []protocol.Message{
					{ID: 2, ParentID: &rootID, CreatedAt: now.Add(1 * time.Second)},
					{ID: 3, ParentID: &rootID, CreatedAt: now.Add(2 * time.Second)},
					{ID: 4, ParentID: &msg2ID, CreatedAt: now.Add(3 * time.Second)}, // Reply to 2
					{ID: 5, ParentID: &msg3ID, CreatedAt: now.Add(4 * time.Second)}, // Reply to 3
					{ID: 6, ParentID: &msg2ID, CreatedAt: now.Add(5 * time.Second)}, // Another reply to 2
				}
			}(),
			expected: []uint64{2, 4, 6, 3, 5}, // Depth-first: 2 and its children, then 3 and its children
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			result := sortThreadReplies(tt.replies, rootID)

			if len(result) != len(tt.expected) {
				t.Fatalf("sortThreadReplies() returned %d messages, want %d", len(result), len(tt.expected))
			}

			for i, msg := range result {
				if msg.ID != tt.expected[i] {
					t.Errorf("sortThreadReplies()[%d].ID = %d, want %d", i, msg.ID, tt.expected[i])
				}
			}
		})
	}
}

func TestIsDeletedMessageContent(t *testing.T) {
	tests := []struct {
		name     string
		content  string
		expected bool
	}{
		{
			name:     "deleted message",
			content:  "[deleted by author]",
			expected: true,
		},
		{
			name:     "deleted by moderator",
			content:  "[deleted by moderator]",
			expected: true,
		},
		{
			name:     "normal message",
			content:  "This is a normal message",
			expected: false,
		},
		{
			name:     "message mentioning deletion",
			content:  "I will delete this later",
			expected: false,
		},
		{
			name:     "empty message",
			content:  "",
			expected: false,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			result := isDeletedMessageContent(tt.content)
			if result != tt.expected {
				t.Errorf("isDeletedMessageContent(%q) = %v, want %v", tt.content, result, tt.expected)
			}
		})
	}
}

func TestMaxMin(t *testing.T) {
	tests := []struct {
		name string
		a    int
		b    int
		max  int
		min  int
	}{
		{"both positive", 5, 3, 5, 3},
		{"both negative", -5, -3, -3, -5},
		{"mixed", -5, 3, 3, -5},
		{"equal", 5, 5, 5, 5},
		{"zero", 0, 5, 5, 0},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			maxResult := max(tt.a, tt.b)
			if maxResult != tt.max {
				t.Errorf("max(%d, %d) = %d, want %d", tt.a, tt.b, maxResult, tt.max)
			}

			minResult := min(tt.a, tt.b)
			if minResult != tt.min {
				t.Errorf("min(%d, %d) = %d, want %d", tt.a, tt.b, minResult, tt.min)
			}
		})
	}
}

func TestMergeOverlay(t *testing.T) {
	base := "line1\nline2\nline3\nline4"
	overlay := "\n\nOVERLAY\n"

	result := mergeOverlay(base, overlay)

	lines := strings.Split(result, "\n")
	if len(lines) != 4 {
		t.Errorf("mergeOverlay() returned %d lines, want 4", len(lines))
	}

	if lines[0] != "line1" {
		t.Errorf("line 0 = %q, want %q", lines[0], "line1")
	}

	if lines[2] != "OVERLAY" {
		t.Errorf("line 2 = %q, want %q", lines[2], "OVERLAY")
	}
}
