package client

import (
	"crypto/ed25519"
	"crypto/rand"
	"os"
	"path/filepath"
	"strings"
	"testing"

	"golang.org/x/crypto/ssh"
)

func TestParseServerAddressTCP(t *testing.T) {
	cfg, err := parseServerAddress("example.com:1234")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	if cfg.display != "example.com:1234" {
		t.Fatalf("expected display address example.com:1234, got %s", cfg.display)
	}

	if cfg.dial == nil {
		t.Fatal("expected dial function to be set")
	}

	if cfg.warning != "" {
		t.Fatalf("expected no warning for TCP, got %q", cfg.warning)
	}
}

func TestParseServerAddressTCPDefaultPort(t *testing.T) {
	cfg, err := parseServerAddress("example.com")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	if cfg.display != "example.com:6465" {
		t.Fatalf("expected default port to be appended, got %s", cfg.display)
	}
}

func TestParseServerAddressSSH(t *testing.T) {
	t.Setenv("SUPERCHAT_SSH_USER", "tester")
	t.Setenv("SSH_KNOWN_HOSTS", filepath.Join(t.TempDir(), "missing_known_hosts"))

	cfg, err := parseServerAddress("ssh://example.com")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	if cfg.dial == nil {
		t.Fatal("expected dial function for SSH")
	}

	if expectedPrefix := "ssh://tester@example.com:6466"; cfg.display != expectedPrefix {
		t.Fatalf("expected display %s, got %s", expectedPrefix, cfg.display)
	}

	if cfg.warning == "" {
		t.Fatal("expected warning when known_hosts is missing")
	}
}

func TestParseServerAddressInvalidScheme(t *testing.T) {
	if _, err := parseServerAddress("udp://example.com"); err == nil {
		t.Fatal("expected error for unsupported scheme")
	} else if !strings.Contains(err.Error(), "unsupported") {
		t.Fatalf("unexpected error: %v", err)
	}
}

func TestAppendKnownHostAddsComment(t *testing.T) {
	path := filepath.Join(t.TempDir(), "known_hosts")
	pub, _, err := ed25519.GenerateKey(rand.Reader)
	if err != nil {
		t.Fatalf("failed to generate test key: %v", err)
	}
	key, err := ssh.NewPublicKey(pub)
	if err != nil {
		t.Fatalf("failed to convert test key: %v", err)
	}

	if err := appendKnownHost(path, "example.com", "SSH-2.0-SuperChat", key); err != nil {
		t.Fatalf("appendKnownHost returned error: %v", err)
	}

	data, err := os.ReadFile(path)
	if err != nil {
		t.Fatalf("failed to read known_hosts file: %v", err)
	}

	contents := string(data)
	if !strings.Contains(contents, "SuperChat server") {
		t.Fatalf("expected SuperChat comment in known_hosts entry, got %q", contents)
	}

	if !strings.Contains(contents, "example.com") {
		t.Fatalf("expected hostname in known_hosts entry, got %q", contents)
	}
}
