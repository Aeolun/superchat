package server

import "testing"

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
