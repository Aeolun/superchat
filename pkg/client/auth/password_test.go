package auth

import (
	"testing"
)

func TestHashPassword(t *testing.T) {
	tests := []struct {
		name     string
		password string
		nickname string
		wantLen  int // Expected hash length in base64
	}{
		{
			name:     "standard password and nickname",
			password: "mySecurePassword123",
			nickname: "alice",
			wantLen:  43, // 32 bytes -> 43 chars in base64 (no padding)
		},
		{
			name:     "same password different nickname produces different hash",
			password: "password123",
			nickname: "bob",
			wantLen:  43,
		},
		{
			name:     "minimum length password",
			password: "12345678",
			nickname: "charlie",
			wantLen:  43,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			hash := HashPassword(tt.password, tt.nickname)

			// Check hash is not empty
			if hash == "" {
				t.Error("HashPassword returned empty string")
			}

			// Check hash length
			if len(hash) != tt.wantLen {
				t.Errorf("HashPassword hash length = %d, want %d", len(hash), tt.wantLen)
			}
		})
	}
}

func TestHashPassword_Deterministic(t *testing.T) {
	// Same password + nickname should always produce same hash
	password := "testPassword"
	nickname := "testUser"

	hash1 := HashPassword(password, nickname)
	hash2 := HashPassword(password, nickname)

	if hash1 != hash2 {
		t.Errorf("HashPassword not deterministic: hash1=%s, hash2=%s", hash1, hash2)
	}
}

func TestHashPassword_DifferentNicknames(t *testing.T) {
	// Same password with different nicknames should produce different hashes
	password := "samePassword"

	hash1 := HashPassword(password, "alice")
	hash2 := HashPassword(password, "bob")

	if hash1 == hash2 {
		t.Error("HashPassword produced same hash for different nicknames")
	}
}

func TestHashPassword_DifferentPasswords(t *testing.T) {
	// Different passwords should produce different hashes
	nickname := "alice"

	hash1 := HashPassword("password1", nickname)
	hash2 := HashPassword("password2", nickname)

	if hash1 == hash2 {
		t.Error("HashPassword produced same hash for different passwords")
	}
}

func TestValidatePasswordFormat(t *testing.T) {
	tests := []struct {
		name     string
		password string
		wantErr  bool
	}{
		{
			name:     "valid minimum length",
			password: "12345678",
			wantErr:  false,
		},
		{
			name:     "valid normal password",
			password: "mySecurePassword123!",
			wantErr:  false,
		},
		{
			name:     "too short",
			password: "1234567",
			wantErr:  true,
		},
		{
			name:     "empty password",
			password: "",
			wantErr:  true,
		},
		{
			name:     "exactly 128 characters (max)",
			password: "a" + string(make([]byte, 127)), // 128 total
			wantErr:  false,
		},
		{
			name:     "too long (129 characters)",
			password: string(make([]byte, 129)),
			wantErr:  true,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			err := ValidatePasswordFormat(tt.password)
			if (err != nil) != tt.wantErr {
				t.Errorf("ValidatePasswordFormat() error = %v, wantErr %v", err, tt.wantErr)
			}
		})
	}
}

func TestValidateNicknameFormat(t *testing.T) {
	tests := []struct {
		name     string
		nickname string
		wantErr  bool
	}{
		{
			name:     "valid nickname",
			nickname: "alice",
			wantErr:  false,
		},
		{
			name:     "valid single character",
			nickname: "a",
			wantErr:  false,
		},
		{
			name:     "valid max length (20)",
			nickname: "12345678901234567890",
			wantErr:  false,
		},
		{
			name:     "empty nickname",
			nickname: "",
			wantErr:  true,
		},
		{
			name:     "too long (21 characters)",
			nickname: "123456789012345678901",
			wantErr:  true,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			err := ValidateNicknameFormat(tt.nickname)
			if (err != nil) != tt.wantErr {
				t.Errorf("ValidateNicknameFormat() error = %v, wantErr %v", err, tt.wantErr)
			}
		})
	}
}

// Benchmark the hashing function to ensure it's not too slow for interactive use
func BenchmarkHashPassword(b *testing.B) {
	password := "mySecurePassword123"
	nickname := "alice"

	b.ResetTimer()
	for i := 0; i < b.N; i++ {
		_ = HashPassword(password, nickname)
	}
}
