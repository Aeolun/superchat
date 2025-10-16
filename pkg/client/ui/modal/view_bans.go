package modal

import (
	"fmt"
	"time"

	tea "github.com/charmbracelet/bubbletea"
	"github.com/charmbracelet/lipgloss"
)

// ViewBansModal displays the list of bans
type ViewBansModal struct {
	bans          []BanEntry
	selectedIndex int
	showExpired   bool
	loading       bool
	errorMessage  string
	onRefresh     func(includeExpired bool) tea.Cmd
}

type BanEntry struct {
	BanType       string // "user" or "ip"
	TargetID      *uint64
	Nickname      *string
	IPCIDR        *string
	Reason        string
	BannedAt      int64
	BannedUntil   *int64
	BannedBy      string
	IsShadowban   bool
}

// NewViewBansModal creates a new view bans modal
func NewViewBansModal() *ViewBansModal {
	return &ViewBansModal{
		bans:          []BanEntry{},
		selectedIndex: 0,
		showExpired:   false,
		loading:       true, // Start in loading state
	}
}

// SetBans sets the ban list
func (m *ViewBansModal) SetBans(bans []BanEntry) {
	m.bans = bans
	m.loading = false
	if len(bans) > 0 && m.selectedIndex >= len(bans) {
		m.selectedIndex = len(bans) - 1
	}
}

// SetRefreshHandler sets the callback for refreshing the ban list
func (m *ViewBansModal) SetRefreshHandler(handler func(includeExpired bool) tea.Cmd) {
	m.onRefresh = handler
	// Note: initial load is triggered by returning a command from createViewBansModal
}

// Type returns the modal type
func (m *ViewBansModal) Type() ModalType {
	return ModalViewBans
}

// HandleKey processes keyboard input
func (m *ViewBansModal) HandleKey(msg tea.KeyMsg) (bool, Modal, tea.Cmd) {
	switch msg.String() {
	case "esc", "q":
		// Close modal and return to admin panel
		return true, nil, nil

	case "up", "k":
		if m.selectedIndex > 0 {
			m.selectedIndex--
		}
		return true, m, nil

	case "down", "j":
		if m.selectedIndex < len(m.bans)-1 {
			m.selectedIndex++
		}
		return true, m, nil

	case "e":
		// Toggle show expired
		m.showExpired = !m.showExpired
		m.loading = true
		if m.onRefresh != nil {
			// Add small delay to make loading indicator visible
			return true, m, tea.Sequence(
				tea.Tick(50*time.Millisecond, func(t time.Time) tea.Msg { return nil }),
				m.onRefresh(m.showExpired),
			)
		}
		return true, m, nil

	case "r":
		// Refresh
		m.loading = true
		if m.onRefresh != nil {
			// Add small delay to make loading indicator visible
			return true, m, tea.Sequence(
				tea.Tick(50*time.Millisecond, func(t time.Time) tea.Msg { return nil }),
				m.onRefresh(m.showExpired),
			)
		}
		return true, m, nil

	default:
		return true, m, nil
	}
}

// Render returns the modal content
func (m *ViewBansModal) Render(width, height int) string {
	titleStyle := lipgloss.NewStyle().
		Bold(true).
		Foreground(lipgloss.Color("196")).
		MarginBottom(1)

	selectedStyle := lipgloss.NewStyle().
		Foreground(lipgloss.Color("15")).
		Background(lipgloss.Color("196")).
		Bold(true).
		Padding(0, 1)

	unselectedStyle := lipgloss.NewStyle().
		Foreground(lipgloss.Color("252")).
		Padding(0, 1)

	hintStyle := lipgloss.NewStyle().
		Foreground(lipgloss.Color("240")).
		Italic(true)

	shadowbanStyle := lipgloss.NewStyle().
		Foreground(lipgloss.Color("208")).
		Italic(true)

	modalStyle := lipgloss.NewStyle().
		Border(lipgloss.RoundedBorder()).
		BorderForeground(lipgloss.Color("196")).
		Padding(1, 2).
		Width(80).
		Height(min(height-4, 30))

	// Build title
	var title string
	if m.showExpired {
		title = titleStyle.Render("Ban List (All Bans)")
	} else {
		title = titleStyle.Render("Ban List (Active Only)")
	}

	// Build ban list
	var banLines []string
	if m.loading {
		banLines = append(banLines, hintStyle.Render("Loading..."))
	} else if len(m.bans) == 0 {
		if m.showExpired {
			banLines = append(banLines, hintStyle.Render("No bans found"))
		} else {
			banLines = append(banLines, hintStyle.Render("No active bans (press E to show expired)"))
		}
	} else {
		for i, ban := range m.bans {
			// Format ban entry
			var target string
			if ban.BanType == "user" && ban.Nickname != nil {
				target = fmt.Sprintf("User: %s", *ban.Nickname)
			} else if ban.BanType == "ip" && ban.IPCIDR != nil {
				target = fmt.Sprintf("IP: %s", *ban.IPCIDR)
			} else {
				target = "Unknown"
			}

			// Format duration
			var duration string
			if ban.BannedUntil == nil {
				duration = "Permanent"
			} else {
				untilTime := time.Unix(*ban.BannedUntil/1000, 0)
				if time.Now().After(untilTime) {
					duration = "EXPIRED"
				} else {
					duration = fmt.Sprintf("Until %s", untilTime.Format("2006-01-02 15:04"))
				}
			}

			// Format shadowban indicator
			var shadowbanIndicator string
			if ban.IsShadowban {
				shadowbanIndicator = shadowbanStyle.Render(" [SHADOWBAN]")
			}

			line := fmt.Sprintf("%s | %s | By: %s | Reason: %s%s",
				target, duration, ban.BannedBy, ban.Reason, shadowbanIndicator)

			if i == m.selectedIndex {
				banLines = append(banLines, selectedStyle.Render(line))
			} else {
				banLines = append(banLines, unselectedStyle.Render(line))
			}
		}
	}

	// Build footer hints
	var hints string
	if m.showExpired {
		hints = "[e] Hide expired  [r] Refresh  [↑/↓] Navigate  [Esc/q] Close"
	} else {
		hints = "[e] Show expired  [r] Refresh  [↑/↓] Navigate  [Esc/q] Close"
	}

	content := lipgloss.JoinVertical(
		lipgloss.Left,
		title,
		"",
		lipgloss.JoinVertical(lipgloss.Left, banLines...),
		"",
		hintStyle.Render(hints),
	)

	modal := modalStyle.Render(content)

	// Center the modal
	return lipgloss.Place(
		width,
		height,
		lipgloss.Center,
		lipgloss.Center,
		modal,
	)
}

// IsBlockingInput returns true (this modal blocks all input)
func (m *ViewBansModal) IsBlockingInput() bool {
	return true
}
