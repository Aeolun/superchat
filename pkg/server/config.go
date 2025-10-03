package server

import (
	"fmt"
	"os"
	"path/filepath"
	"strings"

	"github.com/BurntSushi/toml"
)

// TOMLConfig represents the structure of the server config file
type TOMLConfig struct {
	Server    ServerSection    `toml:"server"`
	Limits    LimitsSection    `toml:"limits"`
	Retention RetentionSection `toml:"retention"`
	Channels  ChannelsSection  `toml:"channels"`
}

type ServerSection struct {
	TCPPort      int    `toml:"tcp_port"`
	SSHPort      int    `toml:"ssh_port"`
	SSHHostKey   string `toml:"ssh_host_key"`
	DatabasePath string `toml:"database_path"`
}

type LimitsSection struct {
	MaxConnectionsPerIP   int `toml:"max_connections_per_ip"`
	MessageRateLimit      int `toml:"message_rate_limit"`
	MaxMessageLength      int `toml:"max_message_length"`
	MaxNicknameLength     int `toml:"max_nickname_length"`
	SessionTimeoutSeconds int `toml:"session_timeout_seconds"`
}

type RetentionSection struct {
	DefaultRetentionHours  int `toml:"default_retention_hours"`
	CleanupIntervalMinutes int `toml:"cleanup_interval_minutes"`
}

type ChannelsSection struct {
	SeedChannels []SeedChannel `toml:"seed_channels"`
}

type SeedChannel struct {
	Name        string `toml:"name"`
	Description string `toml:"description"`
}

// DefaultTOMLConfig returns the default TOML configuration
func DefaultTOMLConfig() TOMLConfig {
	return TOMLConfig{
		Server: ServerSection{
			TCPPort:      6465,
			SSHPort:      6466,
			SSHHostKey:   "~/.superchat/ssh_host_key",
			DatabasePath: "~/.superchat/superchat.db",
		},
		Limits: LimitsSection{
			MaxConnectionsPerIP:   10,
			MessageRateLimit:      10,
			MaxMessageLength:      4096,
			MaxNicknameLength:     20,
			SessionTimeoutSeconds: 60,
		},
		Retention: RetentionSection{
			DefaultRetentionHours:  168, // 7 days
			CleanupIntervalMinutes: 60,
		},
		Channels: ChannelsSection{
			SeedChannels: []SeedChannel{
				{Name: "general", Description: "General discussion"},
				{Name: "tech", Description: "Technical topics"},
				{Name: "random", Description: "Off-topic chat"},
				{Name: "feedback", Description: "Bug reports and feature requests"},
			},
		},
	}
}

// LoadConfig loads configuration from a TOML file, creates default if not found
func LoadConfig(path string) (TOMLConfig, error) {
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
	header := `# SuperChat Server Configuration
# This file was auto-generated with default values
# Edit as needed and restart the server for changes to take effect

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

// ToServerConfig converts TOMLConfig to ServerConfig
func (c *TOMLConfig) ToServerConfig() ServerConfig {
	cfg := DefaultConfig()

	if c.Server.TCPPort != 0 {
		cfg.TCPPort = c.Server.TCPPort
	}

	if c.Server.SSHPort != 0 {
		cfg.SSHPort = c.Server.SSHPort
	}

	if strings.TrimSpace(c.Server.SSHHostKey) != "" {
		cfg.SSHHostKeyPath = c.Server.SSHHostKey
	}

	if c.Limits.MaxConnectionsPerIP != 0 {
		cfg.MaxConnectionsPerIP = uint8(c.Limits.MaxConnectionsPerIP)
	}

	if c.Limits.MessageRateLimit != 0 {
		cfg.MessageRateLimit = uint16(c.Limits.MessageRateLimit)
	}

	if c.Limits.MaxMessageLength != 0 {
		cfg.MaxMessageLength = uint32(c.Limits.MaxMessageLength)
	}

	if c.Limits.SessionTimeoutSeconds != 0 {
		cfg.SessionTimeoutSeconds = c.Limits.SessionTimeoutSeconds
	}

	return cfg
}

// GetDatabasePath returns the database path with ~ expanded
func (c *TOMLConfig) GetDatabasePath() (string, error) {
	path := c.Server.DatabasePath
	if strings.HasPrefix(path, "~/") {
		homeDir, err := os.UserHomeDir()
		if err != nil {
			return "", fmt.Errorf("failed to get home directory: %w", err)
		}
		path = filepath.Join(homeDir, path[2:])
	}
	return path, nil
}
