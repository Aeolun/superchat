package server

import (
	"os"
	"testing"
)

func TestDefaultTOMLConfigIncludesSSHSettings(t *testing.T) {
	cfg := DefaultTOMLConfig()

	if cfg.Server.SSHPort <= 0 {
		t.Fatalf("expected default SSH port to be positive, got %d", cfg.Server.SSHPort)
	}

	if cfg.Server.SSHHostKey == "" {
		t.Fatal("expected default SSH host key path to be set")
	}
}

func TestToServerConfigMapsSSHSettings(t *testing.T) {
	cfg := DefaultTOMLConfig()
	cfg.Server.SSHPort = 2222
	cfg.Server.SSHHostKey = "/tmp/host_key"

	serverCfg := cfg.ToServerConfig()

	if serverCfg.SSHPort != 2222 {
		t.Fatalf("expected SSHPort 2222, got %d", serverCfg.SSHPort)
	}

	if serverCfg.SSHHostKeyPath != "/tmp/host_key" {
		t.Fatalf("expected SSHHostKeyPath /tmp/host_key, got %s", serverCfg.SSHHostKeyPath)
	}
}

func TestToServerConfigFallsBackToDefaults(t *testing.T) {
	var cfg TOMLConfig

	serverCfg := cfg.ToServerConfig()

	defaults := DefaultConfig()

	if serverCfg.SSHPort != defaults.SSHPort {
		t.Fatalf("expected fallback SSHPort %d, got %d", defaults.SSHPort, serverCfg.SSHPort)
	}

	if serverCfg.SSHHostKeyPath != defaults.SSHHostKeyPath {
		t.Fatalf("expected fallback SSHHostKeyPath %s, got %s", defaults.SSHHostKeyPath, serverCfg.SSHHostKeyPath)
	}

	if serverCfg.MaxConnectionsPerIP != defaults.MaxConnectionsPerIP {
		t.Fatalf("expected fallback MaxConnectionsPerIP %d, got %d", defaults.MaxConnectionsPerIP, serverCfg.MaxConnectionsPerIP)
	}

	if serverCfg.MessageRateLimit != defaults.MessageRateLimit {
		t.Fatalf("expected fallback MessageRateLimit %d, got %d", defaults.MessageRateLimit, serverCfg.MessageRateLimit)
	}

	if serverCfg.MaxMessageLength != defaults.MaxMessageLength {
		t.Fatalf("expected fallback MaxMessageLength %d, got %d", defaults.MaxMessageLength, serverCfg.MaxMessageLength)
	}

	if serverCfg.SessionTimeoutSeconds != defaults.SessionTimeoutSeconds {
		t.Fatalf("expected fallback SessionTimeoutSeconds %d, got %d", defaults.SessionTimeoutSeconds, serverCfg.SessionTimeoutSeconds)
	}
}

func TestToServerConfigMapsDiscoverySettings(t *testing.T) {
	cfg := DefaultTOMLConfig()
	cfg.Discovery.DirectoryEnabled = false
	cfg.Discovery.PublicHostname = "example.com"
	cfg.Discovery.ServerName = "My Test Server"
	cfg.Discovery.ServerDescription = "A cool test server"
	cfg.Discovery.MaxUsers = 100

	serverCfg := cfg.ToServerConfig()

	if serverCfg.DirectoryEnabled != false {
		t.Fatalf("expected DirectoryEnabled false, got %v", serverCfg.DirectoryEnabled)
	}

	if serverCfg.PublicHostname != "example.com" {
		t.Fatalf("expected PublicHostname example.com, got %s", serverCfg.PublicHostname)
	}

	if serverCfg.ServerName != "My Test Server" {
		t.Fatalf("expected ServerName 'My Test Server', got %s", serverCfg.ServerName)
	}

	if serverCfg.ServerDesc != "A cool test server" {
		t.Fatalf("expected ServerDesc 'A cool test server', got %s", serverCfg.ServerDesc)
	}

	if serverCfg.MaxUsers != 100 {
		t.Fatalf("expected MaxUsers 100, got %d", serverCfg.MaxUsers)
	}
}

func TestEnvOverridesDiscoverySettings(t *testing.T) {
	// Save original env vars
	origName := os.Getenv("SUPERCHAT_DISCOVERY_SERVER_NAME")
	origDesc := os.Getenv("SUPERCHAT_DISCOVERY_SERVER_DESCRIPTION")
	origHostname := os.Getenv("SUPERCHAT_DISCOVERY_PUBLIC_HOSTNAME")

	// Clean up after test
	defer func() {
		os.Setenv("SUPERCHAT_DISCOVERY_SERVER_NAME", origName)
		os.Setenv("SUPERCHAT_DISCOVERY_SERVER_DESCRIPTION", origDesc)
		os.Setenv("SUPERCHAT_DISCOVERY_PUBLIC_HOSTNAME", origHostname)
	}()

	// Set test env vars
	os.Setenv("SUPERCHAT_DISCOVERY_SERVER_NAME", "Env Override Server")
	os.Setenv("SUPERCHAT_DISCOVERY_SERVER_DESCRIPTION", "Env override description")
	os.Setenv("SUPERCHAT_DISCOVERY_PUBLIC_HOSTNAME", "env.example.com")

	// Start with default config and apply env overrides
	cfg := DefaultTOMLConfig()
	cfg = applyEnvOverrides(cfg)

	// Verify env overrides were applied to TOML config
	if cfg.Discovery.ServerName != "Env Override Server" {
		t.Fatalf("expected ServerName 'Env Override Server', got %s", cfg.Discovery.ServerName)
	}

	if cfg.Discovery.ServerDescription != "Env override description" {
		t.Fatalf("expected ServerDescription 'Env override description', got %s", cfg.Discovery.ServerDescription)
	}

	if cfg.Discovery.PublicHostname != "env.example.com" {
		t.Fatalf("expected PublicHostname 'env.example.com', got %s", cfg.Discovery.PublicHostname)
	}

	// Verify they make it through to ServerConfig
	serverCfg := cfg.ToServerConfig()

	if serverCfg.ServerName != "Env Override Server" {
		t.Fatalf("expected ServerConfig.ServerName 'Env Override Server', got %s", serverCfg.ServerName)
	}

	if serverCfg.ServerDesc != "Env override description" {
		t.Fatalf("expected ServerConfig.ServerDesc 'Env override description', got %s", serverCfg.ServerDesc)
	}

	if serverCfg.PublicHostname != "env.example.com" {
		t.Fatalf("expected ServerConfig.PublicHostname 'env.example.com', got %s", serverCfg.PublicHostname)
	}
}

func TestOldConfigWithoutDiscoverySectionKeepsDefaultDirectoryEnabled(t *testing.T) {
	// Simulate old config file without Discovery section (all zero values)
	var oldConfig TOMLConfig
	oldConfig.Server.TCPPort = 6465

	serverCfg := oldConfig.ToServerConfig()

	// DirectoryEnabled should remain true (from DefaultConfig)
	if !serverCfg.DirectoryEnabled {
		t.Fatalf("expected DirectoryEnabled true for old config without Discovery section, got false")
	}
}

func TestEnvVarCanDisableDirectoryMode(t *testing.T) {
	// Save and restore env var
	origEnabled := os.Getenv("SUPERCHAT_DISCOVERY_DIRECTORY_ENABLED")
	origName := os.Getenv("SUPERCHAT_DISCOVERY_SERVER_NAME")
	defer func() {
		os.Setenv("SUPERCHAT_DISCOVERY_DIRECTORY_ENABLED", origEnabled)
		os.Setenv("SUPERCHAT_DISCOVERY_SERVER_NAME", origName)
	}()

	// Set env vars (setting ServerName makes Discovery section "exist")
	os.Setenv("SUPERCHAT_DISCOVERY_DIRECTORY_ENABLED", "false")
	os.Setenv("SUPERCHAT_DISCOVERY_SERVER_NAME", "Test Server")

	cfg := DefaultTOMLConfig()
	cfg = applyEnvOverrides(cfg)
	serverCfg := cfg.ToServerConfig()

	if serverCfg.DirectoryEnabled {
		t.Fatalf("expected DirectoryEnabled false from env var, got true")
	}
}

func TestAdminUsersEnvVar(t *testing.T) {
	// Save and restore env var
	origAdminUsers := os.Getenv("SUPERCHAT_SERVER_ADMIN_USERS")
	defer os.Setenv("SUPERCHAT_SERVER_ADMIN_USERS", origAdminUsers)

	// Set up test environment variable
	os.Setenv("SUPERCHAT_SERVER_ADMIN_USERS", "alice, bob,  charlie")

	// Create empty config and apply env overrides
	config := TOMLConfig{}
	config = applyEnvOverrides(config)

	// Verify admin users were parsed correctly
	expected := []string{"alice", "bob", "charlie"}
	if len(config.Server.AdminUsers) != len(expected) {
		t.Errorf("Expected %d admin users, got %d", len(expected), len(config.Server.AdminUsers))
	}

	for i, expectedUser := range expected {
		if config.Server.AdminUsers[i] != expectedUser {
			t.Errorf("Admin user %d: expected '%s', got '%s'", i, expectedUser, config.Server.AdminUsers[i])
		}
	}

	// Verify they make it through to ServerConfig
	serverCfg := config.ToServerConfig()
	if len(serverCfg.AdminUsers) != len(expected) {
		t.Errorf("ServerConfig: Expected %d admin users, got %d", len(expected), len(serverCfg.AdminUsers))
	}
}

func TestAdminUsersEnvVarWithWhitespace(t *testing.T) {
	// Save and restore env var
	origAdminUsers := os.Getenv("SUPERCHAT_SERVER_ADMIN_USERS")
	defer os.Setenv("SUPERCHAT_SERVER_ADMIN_USERS", origAdminUsers)

	// Test with various whitespace patterns
	os.Setenv("SUPERCHAT_SERVER_ADMIN_USERS", "  alice  ,bob,   charlie   ,  dave")

	config := TOMLConfig{}
	config = applyEnvOverrides(config)

	expected := []string{"alice", "bob", "charlie", "dave"}
	if len(config.Server.AdminUsers) != len(expected) {
		t.Errorf("Expected %d admin users, got %d", len(expected), len(config.Server.AdminUsers))
	}

	for i, expectedUser := range expected {
		if config.Server.AdminUsers[i] != expectedUser {
			t.Errorf("Admin user %d: expected '%s', got '%s'", i, expectedUser, config.Server.AdminUsers[i])
		}
	}
}
