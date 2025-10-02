package client

import (
	"fmt"
	"os"
	"path/filepath"
	"strings"

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
		return TOMLConfig{}, fmt.Errorf("failed to parse config file: %w", err)
	}

	return config, nil
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
	return fmt.Sprintf("%s:%d", c.Connection.DefaultServer, c.Connection.DefaultPort)
}
