package main

import (
	"flag"
	"fmt"
	"log"
	"net/http"
	_ "net/http/pprof"
	"os"
	"os/signal"
	"path/filepath"
	"strings"
	"syscall"

	"github.com/aeolun/superchat/pkg/server"
)

var (
	// Version is set at build time via ldflags
	Version = "dev"
)

func main() {
	// Configure logger with microsecond precision
	log.SetFlags(log.Ldate | log.Ltime | log.Lmicroseconds)

	// Command line flags
	configPath := flag.String("config", "~/.superchat/config.toml", "Path to config file")
	port := flag.Int("port", 0, "TCP port to listen on (overrides config)")
	dbPath := flag.String("db", "", "Path to SQLite database (overrides config)")
	version := flag.Bool("version", false, "Show version information")
	flag.Parse()

	// Handle --version flag
	if *version {
		fmt.Printf("SuperChat Server %s\n", Version)
		os.Exit(0)
	}

	// Load configuration (creates default if not found)
	config, err := server.LoadConfig(*configPath)
	if err != nil {
		log.Fatalf("Failed to load config: %v", err)
	}

	resolvedConfigPath := *configPath
	if strings.HasPrefix(resolvedConfigPath, "~/") {
		homeDir, err := os.UserHomeDir()
		if err != nil {
			log.Fatalf("Failed to resolve config path: %v", err)
		}
		resolvedConfigPath = filepath.Join(homeDir, resolvedConfigPath[2:])
	}
	if absPath, err := filepath.Abs(resolvedConfigPath); err == nil {
		resolvedConfigPath = absPath
	}

	// Command-line flags override config file
	if *port != 0 {
		config.Server.TCPPort = *port
	}
	if *dbPath != "" {
		config.Server.DatabasePath = *dbPath
	}

	// Get database path with ~ expansion
	finalDBPath, err := config.GetDatabasePath()
	if err != nil {
		log.Fatalf("Failed to resolve database path: %v", err)
	}

	// Ensure directory exists
	dbDir := filepath.Dir(finalDBPath)
	if err := os.MkdirAll(dbDir, 0755); err != nil {
		log.Fatalf("Failed to create database directory: %v", err)
	}

	// Convert to server config
	serverConfig := config.ToServerConfig()

	// Create and start server
	srv, err := server.NewServer(finalDBPath, serverConfig, resolvedConfigPath)
	if err != nil {
		log.Fatalf("Failed to create server: %v", err)
	}

	log.Printf("Config: %s (resolved to %s, using defaults if not found)", *configPath, resolvedConfigPath)
	log.Printf("Database: %s", finalDBPath)

	if err := srv.Start(); err != nil {
		log.Fatalf("Failed to start server: %v", err)
	}

	log.Printf("SuperChat server %s started successfully", Version)
	log.Printf("Port: %d", serverConfig.TCPPort)
	if serverConfig.SSHPort > 0 {
		log.Printf("SSH Port: %d", serverConfig.SSHPort)
		log.Printf("SSH Host Key: %s", serverConfig.SSHHostKeyPath)
	} else {
		log.Printf("SSH server disabled (ssh_port=%d)", serverConfig.SSHPort)
	}

	// Start pprof HTTP server for profiling
	go func() {
		log.Println("Starting pprof server on http://localhost:6060")
		if err := http.ListenAndServe("localhost:6060", nil); err != nil {
			log.Printf("pprof server error: %v", err)
		}
	}()

	// Display available channels
	channels, err := srv.GetChannels()
	if err != nil {
		log.Printf("Warning: Failed to list channels: %v", err)
	} else if len(channels) == 0 {
		log.Printf("No channels available (use admin tools to create channels)")
	} else {
		log.Printf("Available channels (%d):", len(channels))
		for _, ch := range channels {
			desc := ""
			if ch.Description != nil {
				desc = *ch.Description
			}
			log.Printf("  - #%s: %s", ch.Name, desc)
		}
	}

	// Wait for interrupt signal
	sigChan := make(chan os.Signal, 1)
	signal.Notify(sigChan, os.Interrupt, syscall.SIGTERM)
	<-sigChan

	log.Println("Shutting down server...")
	if err := srv.Stop(); err != nil {
		log.Printf("Error during shutdown: %v", err)
	}
	log.Println("Server stopped")
}
