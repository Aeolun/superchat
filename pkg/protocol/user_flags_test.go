package protocol

import (
	"testing"

	"github.com/stretchr/testify/assert"
)

func TestUserFlags_IsAdmin(t *testing.T) {
	tests := []struct {
		name string
		flags UserFlags
		want bool
	}{
		{"admin flag set", UserFlagAdmin, true},
		{"moderator flag set", UserFlagModerator, false},
		{"both flags set", UserFlagAdmin | UserFlagModerator, true},
		{"no flags set", UserFlags(0), false},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			assert.Equal(t, tt.want, tt.flags.IsAdmin())
		})
	}
}

func TestUserFlags_IsModerator(t *testing.T) {
	tests := []struct {
		name string
		flags UserFlags
		want bool
	}{
		{"moderator flag set", UserFlagModerator, true},
		{"admin flag set", UserFlagAdmin, false},
		{"both flags set", UserFlagAdmin | UserFlagModerator, true},
		{"no flags set", UserFlags(0), false},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			assert.Equal(t, tt.want, tt.flags.IsModerator())
		})
	}
}

func TestUserFlags_IsSystem(t *testing.T) {
	tests := []struct {
		name string
		flags UserFlags
		want bool
	}{
		{"admin only", UserFlagAdmin, true},
		{"moderator only", UserFlagModerator, true},
		{"both flags", UserFlagAdmin | UserFlagModerator, true},
		{"no flags", UserFlags(0), false},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			assert.Equal(t, tt.want, tt.flags.IsSystem())
		})
	}
}

func TestUserFlags_DisplayPrefix(t *testing.T) {
	tests := []struct {
		name string
		flags UserFlags
		want string
	}{
		{"admin prefix", UserFlagAdmin, "$"},
		{"moderator prefix", UserFlagModerator, "@"},
		{"admin takes precedence", UserFlagAdmin | UserFlagModerator, "$"},
		{"no prefix", UserFlags(0), ""},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			assert.Equal(t, tt.want, tt.flags.DisplayPrefix())
		})
	}
}
