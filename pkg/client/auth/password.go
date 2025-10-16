// ABOUTME: Client-side password hashing utilities for secure authentication
// ABOUTME: Implements argon2id hashing before passwords are sent over the network

package auth

import (
	"encoding/base64"
	"fmt"

	"golang.org/x/crypto/argon2"
)

// Argon2 parameters (matching PROTOCOL.md specification)
const (
	argonTime    = 3       // Number of iterations
	argonMemory  = 64 * 1024 // Memory in KB (64 MB)
	argonThreads = 4       // Number of threads
	argonKeyLen  = 32      // Output key length in bytes
)

// HashPassword hashes a password using argon2id with the nickname as salt
// This is the client-side hash that gets sent over the network
//
// Parameters:
//   - password: The plaintext password
//   - nickname: Used as salt to ensure different hashes for same password on different accounts
//
// Returns: Base64-encoded hash string suitable for transmission
func HashPassword(password, nickname string) string {
	// Use nickname as salt (converted to bytes)
	salt := []byte(nickname)

	// Generate argon2id hash
	hash := argon2.IDKey(
		[]byte(password),
		salt,
		argonTime,
		argonMemory,
		argonThreads,
		argonKeyLen,
	)

	// Encode as base64 for transmission (URL-safe encoding)
	return base64.RawURLEncoding.EncodeToString(hash)
}

// ValidatePasswordFormat validates password meets minimum requirements
// Returns error if password is invalid
func ValidatePasswordFormat(password string) error {
	if len(password) < 8 {
		return fmt.Errorf("password must be at least 8 characters")
	}
	if len(password) > 128 {
		return fmt.Errorf("password must be at most 128 characters")
	}
	return nil
}

// ValidateNicknameFormat validates nickname meets requirements for use as salt
// Returns error if nickname is invalid
func ValidateNicknameFormat(nickname string) error {
	if len(nickname) < 1 {
		return fmt.Errorf("nickname cannot be empty")
	}
	if len(nickname) > 20 {
		return fmt.Errorf("nickname must be at most 20 characters")
	}
	return nil
}
