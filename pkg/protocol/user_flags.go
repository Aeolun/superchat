package protocol

// UserFlags is a bitfield for user permissions and status indicators.
// Stored as uint8 (0-255) with 2 bits currently used, 6 reserved for future use.
type UserFlags uint8

const (
	// UserFlagAdmin indicates a system administrator (bit 0)
	// Display prefix: "$" (e.g., "$admin")
	UserFlagAdmin UserFlags = 1 << 0 // 0x01

	// UserFlagModerator indicates a channel moderator (bit 1)
	// Display prefix: "@" (e.g., "@moderator")
	UserFlagModerator UserFlags = 1 << 1 // 0x02

	// Future flags (bits 2-7 reserved):
	// UserFlagVerified  = 1 << 2  // 0x04 - Verified account
	// UserFlagBot       = 1 << 3  // 0x08 - Bot account
	// UserFlagMuted     = 1 << 4  // 0x10 - User is muted
	// UserFlagBanned    = 1 << 5  // 0x20 - User is banned
)

// IsAdmin returns true if the admin flag is set
func (f UserFlags) IsAdmin() bool {
	return f&UserFlagAdmin != 0
}

// IsModerator returns true if the moderator flag is set
func (f UserFlags) IsModerator() bool {
	return f&UserFlagModerator != 0
}

// IsSystem returns true if the user has any system flags (admin or moderator)
func (f UserFlags) IsSystem() bool {
	return f&(UserFlagAdmin|UserFlagModerator) != 0
}

// DisplayPrefix returns the appropriate prefix for the user's flags
// Returns "$" for admins, "@" for moderators, "" for regular users
func (f UserFlags) DisplayPrefix() string {
	if f.IsAdmin() {
		return "$"
	}
	if f.IsModerator() {
		return "@"
	}
	return ""
}
