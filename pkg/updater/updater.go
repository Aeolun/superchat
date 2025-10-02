package updater

import (
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"os"
	"os/exec"
	"path/filepath"
	"runtime"
	"strings"
	"syscall"
)

const (
	GitHubRepo   = "aeolun/superchat"
	InstallScript = "https://raw.githubusercontent.com/aeolun/superchat/main/install.sh"
)

// Release represents a GitHub release
type Release struct {
	TagName string `json:"tag_name"`
	Name    string `json:"name"`
}

// CheckLatestVersion fetches the latest version from GitHub
func CheckLatestVersion() (string, error) {
	url := fmt.Sprintf("https://api.github.com/repos/%s/releases/latest", GitHubRepo)

	resp, err := http.Get(url)
	if err != nil {
		return "", fmt.Errorf("failed to fetch release info: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return "", fmt.Errorf("GitHub API returned status %d", resp.StatusCode)
	}

	var release Release
	if err := json.NewDecoder(resp.Body).Decode(&release); err != nil {
		return "", fmt.Errorf("failed to parse release info: %w", err)
	}

	return release.TagName, nil
}

// CompareVersions returns true if newVersion is newer than currentVersion
func CompareVersions(currentVersion, newVersion string) bool {
	// Simple string comparison for now (works for semantic versions like v1.2.3)
	// Strip "v" prefix if present
	current := strings.TrimPrefix(currentVersion, "v")
	new := strings.TrimPrefix(newVersion, "v")

	if current == "dev" {
		return true // Always update dev versions
	}

	return new > current
}

// Update checks for updates and installs if available
func Update(currentVersion, exePath string, args []string) error {
	// Check latest version
	latestVersion, err := CheckLatestVersion()
	if err != nil {
		return err
	}

	fmt.Printf("Latest version: %s\n", latestVersion)

	// Compare versions
	if !CompareVersions(currentVersion, latestVersion) {
		fmt.Println("You're already on the latest version!")
		return nil
	}

	fmt.Printf("New version available: %s\n", latestVersion)
	fmt.Println("Downloading and installing update...")

	// Determine install directory from executable path
	installDir := filepath.Dir(exePath)

	// Download and run install script
	if err := runInstallScript(installDir); err != nil {
		return fmt.Errorf("failed to run install script: %w", err)
	}

	fmt.Println("Update installed successfully!")
	fmt.Println("Restarting with new version...")

	// Exec the new binary
	return execNewBinary(exePath, args)
}

// runInstallScript downloads and executes the install script
func runInstallScript(installDir string) error {
	// Download install script
	resp, err := http.Get(InstallScript)
	if err != nil {
		return fmt.Errorf("failed to download install script: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return fmt.Errorf("failed to download install script: HTTP %d", resp.StatusCode)
	}

	// Write to temporary file
	tmpFile, err := os.CreateTemp("", "superchat-install-*.sh")
	if err != nil {
		return fmt.Errorf("failed to create temp file: %w", err)
	}
	defer os.Remove(tmpFile.Name())

	if _, err := io.Copy(tmpFile, resp.Body); err != nil {
		tmpFile.Close()
		return fmt.Errorf("failed to write install script: %w", err)
	}
	tmpFile.Close()

	// Make executable
	if err := os.Chmod(tmpFile.Name(), 0755); err != nil {
		return fmt.Errorf("failed to make install script executable: %w", err)
	}

	// Determine if we need sudo (if installing to system directory)
	needsSudo := false
	if strings.HasPrefix(installDir, "/usr/") {
		needsSudo = true
	}

	// Run install script
	var cmd *exec.Cmd
	if needsSudo {
		fmt.Println("System-wide installation detected. You may be prompted for sudo password.")
		cmd = exec.Command("sudo", "sh", tmpFile.Name(), "--global")
	} else {
		// Set INSTALL_DIR environment variable to preserve install location
		cmd = exec.Command("sh", tmpFile.Name())
		cmd.Env = append(os.Environ(), fmt.Sprintf("INSTALL_DIR=%s", installDir))
	}

	cmd.Stdout = os.Stdout
	cmd.Stderr = os.Stderr
	cmd.Stdin = os.Stdin

	if err := cmd.Run(); err != nil {
		return fmt.Errorf("install script failed: %w", err)
	}

	return nil
}

// execNewBinary replaces the current process with the new binary
func execNewBinary(exePath string, args []string) error {
	// On Windows, we can't replace a running executable, so just inform the user
	if runtime.GOOS == "windows" {
		fmt.Println("\nUpdate complete! Please restart the application manually.")
		os.Exit(0)
	}

	// Get the binary name (sc or superchat)
	binName := filepath.Base(exePath)

	// Build new args (remove "update" subcommand if present)
	newArgs := []string{binName}
	skipNext := false
	for i, arg := range args {
		if i == 0 {
			continue // Skip program name
		}
		if skipNext {
			skipNext = false
			continue
		}
		if arg == "update" {
			continue // Skip "update" subcommand
		}
		newArgs = append(newArgs, arg)
	}

	// Exec the new binary (Unix only)
	return syscall.Exec(exePath, newArgs, os.Environ())
}
