package main

import (
	"flag"
	"fmt"
	"log"
	"os"
	"os/signal"
	"path/filepath"
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
	srv, err := server.NewServer(finalDBPath, serverConfig)
	if err != nil {
		log.Fatalf("Failed to create server: %v", err)
	}

	if err := srv.Start(); err != nil {
		log.Fatalf("Failed to start server: %v", err)
	}

	log.Printf("SuperChat server started successfully")
	log.Printf("Config: %s (using defaults if not found)", *configPath)
	log.Printf("Database: %s", finalDBPath)
	log.Printf("Port: %d", serverConfig.TCPPort)

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
