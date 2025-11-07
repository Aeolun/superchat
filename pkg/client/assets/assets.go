// ABOUTME: Embedded assets for the SuperChat client
// ABOUTME: Includes notification icon and other static resources
package assets

import (
	"crypto/sha256"
	_ "embed"
	"encoding/hex"
	"os"
	"path/filepath"
)

//go:embed icon.png
var IconPNG []byte

// StateInterface defines the methods needed for icon hash storage
type StateInterface interface {
	GetConfig(key string) (string, error)
	SetConfig(key, value string) error
}

// GetIconPath writes the embedded icon to the data directory if needed and returns its path
// Only writes if:
// 1. Icon file doesn't exist, OR
// 2. Hash of embedded icon differs from stored hash
func GetIconPath(dataDir string, state StateInterface) (string, error) {
	iconPath := filepath.Join(dataDir, "icon.png")

	// Calculate hash of embedded icon
	embeddedHash := calculateHash(IconPNG)

	// Get stored hash (if any)
	storedHash, _ := state.GetConfig("icon_hash")

	// Check if we need to write the icon
	needsWrite := false

	// Check if file exists
	if _, err := os.Stat(iconPath); os.IsNotExist(err) {
		needsWrite = true
	} else if storedHash != embeddedHash {
		// Hash changed - embedded icon was updated
		needsWrite = true
	}

	if needsWrite {
		// Write embedded icon to data directory
		if err := os.WriteFile(iconPath, IconPNG, 0644); err != nil {
			return "", err
		}

		// Store the hash
		_ = state.SetConfig("icon_hash", embeddedHash)
	}

	return iconPath, nil
}

// calculateHash returns the SHA256 hash of data as a hex string
func calculateHash(data []byte) string {
	hash := sha256.Sum256(data)
	return hex.EncodeToString(hash[:])
}
