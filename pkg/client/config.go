package client

import (
	"fmt"
	"os"
	"path/filepath"
	"regexp"
	"strconv"
	"strings"
	"time"

	"github.com/BurntSushi/toml"
)

// TOMLConfig represents the structure of the client config file
type TOMLConfig struct {
	Connection ConnectionSection `toml:"connection"`
	Local      LocalSection      `toml:"local"`
	UI         UISection         `toml:"ui"`
}

type ConnectionSection struct {
	DefaultServer            string `toml:"default_server"`
	DefaultPort              int    `toml:"default_port"`
	AutoReconnect            bool   `toml:"auto_reconnect"`
	ReconnectMaxDelaySeconds int    `toml:"reconnect_max_delay_seconds"`
}

type LocalSection struct {
	StateDB         string `toml:"state_db"`
	LastNickname    string `toml:"last_nickname"`
	AutoSetNickname bool   `toml:"auto_set_nickname"`
}

type UISection struct {
	ShowTimestamps  bool   `toml:"show_timestamps"`
	TimestampFormat string `toml:"timestamp_format"` // 'relative' or 'absolute'
	Theme           string `toml:"theme"`
}

// ConfigError represents a structured configuration error
type ConfigError struct {
	Path       string
	Message    string
	LineNumber int // 0 if not a parse error
}

func (e *ConfigError) Error() string {
	if e.LineNumber > 0 {
		return fmt.Sprintf("%s (line %d)", e.Message, e.LineNumber)
	}
	return e.Message
}

// getXDGConfigHome returns the XDG config directory
func getXDGConfigHome() string {
	if xdg := os.Getenv("XDG_CONFIG_HOME"); xdg != "" {
		return xdg
	}
	homeDir, err := os.UserHomeDir()
	if err != nil {
		return ""
	}
	return filepath.Join(homeDir, ".config")
}

// getXDGDataHome returns the XDG data directory
func getXDGDataHome() string {
	if xdg := os.Getenv("XDG_DATA_HOME"); xdg != "" {
		return xdg
	}
	homeDir, err := os.UserHomeDir()
	if err != nil {
		return ""
	}
	return filepath.Join(homeDir, ".local", "share")
}

// DefaultTOMLConfig returns the default TOML configuration
func DefaultTOMLConfig() TOMLConfig {
	// Use XDG paths by default
	dataHome := getXDGDataHome()
	stateDB := filepath.Join(dataHome, "superchat", "state.db")

	return TOMLConfig{
		Connection: ConnectionSection{
			DefaultServer:            "superchat.win",
			DefaultPort:              6465,
			AutoReconnect:            true,
			ReconnectMaxDelaySeconds: 30,
		},
		Local: LocalSection{
			StateDB:         stateDB,
			LastNickname:    "",
			AutoSetNickname: true,
		},
		UI: UISection{
			ShowTimestamps:  true,
			TimestampFormat: "relative",
			Theme:           "default",
		},
	}
}

// LoadClientConfig loads configuration from a TOML file, creates default if not found
func LoadClientConfig(path string) (TOMLConfig, error) {
	// Expand ~ in path
	if strings.HasPrefix(path, "~/") {
		homeDir, err := os.UserHomeDir()
		if err != nil {
			return TOMLConfig{}, fmt.Errorf("failed to get home directory: %w", err)
		}
		path = filepath.Join(homeDir, path[2:])
	}

	// Check if file exists
	if _, err := os.Stat(path); os.IsNotExist(err) {
		// File doesn't exist, create default config
		config := DefaultTOMLConfig()
		if err := writeDefaultConfig(path, config); err != nil {
			// If we can't write, just return defaults without error
			// (might be a permissions issue, but we can still run)
			return config, nil
		}
		return config, nil
	}

	// Load from file
	var config TOMLConfig
	if _, err := toml.DecodeFile(path, &config); err != nil {
		// Try to extract line number from TOML error
		lineNum := extractLineNumber(err.Error())
		return TOMLConfig{}, &ConfigError{
			Path:       path,
			Message:    cleanErrorMessage(err.Error()),
			LineNumber: lineNum,
		}
	}

	// Validate config values
	if err := validateConfig(&config); err != nil {
		return TOMLConfig{}, &ConfigError{
			Path:       path,
			Message:    err.Error(),
			LineNumber: 0,
		}
	}

	return config, nil
}

// extractLineNumber tries to extract a line number from a TOML parse error
func extractLineNumber(errMsg string) int {
	// TOML errors typically format like "line 12: ..." or "at line 12"
	re := regexp.MustCompile(`line (\d+)`)
	matches := re.FindStringSubmatch(errMsg)
	if len(matches) > 1 {
		if num, err := strconv.Atoi(matches[1]); err == nil {
			return num
		}
	}
	return 0
}

// cleanErrorMessage removes redundant parts from error messages
func cleanErrorMessage(errMsg string) string {
	// Remove "toml: " prefix if present
	errMsg = strings.TrimPrefix(errMsg, "toml: ")
	return errMsg
}

// validateConfig validates configuration values
func validateConfig(config *TOMLConfig) error {
	var errors []string

	// Validate port range
	if config.Connection.DefaultPort < 1 || config.Connection.DefaultPort > 65535 {
		errors = append(errors, fmt.Sprintf("Invalid port number: %d (must be 1-65535)", config.Connection.DefaultPort))
	}

	// Validate reconnect delay
	if config.Connection.ReconnectMaxDelaySeconds < 0 {
		errors = append(errors, "Reconnect max delay cannot be negative")
	}

	// Validate timestamp format
	if config.UI.TimestampFormat != "" && config.UI.TimestampFormat != "relative" && config.UI.TimestampFormat != "absolute" {
		errors = append(errors, fmt.Sprintf("Invalid timestamp format: %q (must be 'relative' or 'absolute')", config.UI.TimestampFormat))
	}

	// Validate state database path is not empty
	if strings.TrimSpace(config.Local.StateDB) == "" {
		errors = append(errors, "State database path cannot be empty")
	}

	if len(errors) > 0 {
		return fmt.Errorf("Configuration validation failed:\n  • %s", strings.Join(errors, "\n  • "))
	}

	return nil
}

// writeDefaultConfig writes the default config to a file
func writeDefaultConfig(path string, config TOMLConfig) error {
	// Ensure directory exists
	dir := filepath.Dir(path)
	if err := os.MkdirAll(dir, 0755); err != nil {
		return fmt.Errorf("failed to create config directory: %w", err)
	}

	// Create file
	f, err := os.Create(path)
	if err != nil {
		return fmt.Errorf("failed to create config file: %w", err)
	}
	defer f.Close()

	// Write header comment
	header := `# SuperChat Client Configuration
# This file was auto-generated with default values
# Edit as needed - changes take effect on next client start

`
	if _, err := f.WriteString(header); err != nil {
		return err
	}

	// Encode config as TOML
	encoder := toml.NewEncoder(f)
	if err := encoder.Encode(config); err != nil {
		return fmt.Errorf("failed to write config: %w", err)
	}

	return nil
}

// GetStateDBPath returns the state database path with ~ expanded
func (c *TOMLConfig) GetStateDBPath() (string, error) {
	path := c.Local.StateDB
	if strings.HasPrefix(path, "~/") {
		homeDir, err := os.UserHomeDir()
		if err != nil {
			return "", fmt.Errorf("failed to get home directory: %w", err)
		}
		path = filepath.Join(homeDir, path[2:])
	}
	return path, nil
}

// GetServerAddress returns the full server address (host:port)
func (c *TOMLConfig) GetServerAddress() string {
	server := strings.TrimSpace(c.Connection.DefaultServer)
	if server == "" {
		return ""
	}

	if strings.Contains(server, "://") {
		return server
	}

	port := c.Connection.DefaultPort
	if port <= 0 {
		return server
	}

	return fmt.Sprintf("%s:%d", server, port)
}

// ResetConfigToDefault resets the config file to default values
// If backup is true, creates a backup with timestamp
func ResetConfigToDefault(path string, backup bool) error {
	// Expand ~ in path
	if strings.HasPrefix(path, "~/") {
		homeDir, err := os.UserHomeDir()
		if err != nil {
			return fmt.Errorf("failed to get home directory: %w", err)
		}
		path = filepath.Join(homeDir, path[2:])
	}

	// Create backup if requested
	if backup {
		backupPath := fmt.Sprintf("%s.backup-%s", path, time.Now().Format("2006-01-02"))
		if err := copyFile(path, backupPath); err != nil {
			return fmt.Errorf("failed to create backup: %w", err)
		}
	}

	// Write default config
	config := DefaultTOMLConfig()
	if err := writeDefaultConfig(path, config); err != nil {
		return fmt.Errorf("failed to write default config: %w", err)
	}

	return nil
}

// copyFile copies a file from src to dst
func copyFile(src, dst string) error {
	data, err := os.ReadFile(src)
	if err != nil {
		return err
	}
	return os.WriteFile(dst, data, 0644)
}
