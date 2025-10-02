package main

import (
	"flag"
	"log"
	"os"
	"os/signal"
	"path/filepath"
	"syscall"

	"github.com/aeolun/superchat/pkg/server"
)

func main() {
	// Command line flags
	port := flag.Int("port", 7070, "TCP port to listen on")
	dbPath := flag.String("db", "", "Path to SQLite database (default: ~/.superchat/superchat.db)")
	flag.Parse()

	// Default database path
	if *dbPath == "" {
		homeDir, err := os.UserHomeDir()
		if err != nil {
			log.Fatalf("Failed to get home directory: %v", err)
		}
		*dbPath = filepath.Join(homeDir, ".superchat", "superchat.db")
	}

	// Ensure directory exists
	dbDir := filepath.Dir(*dbPath)
	if err := os.MkdirAll(dbDir, 0755); err != nil {
		log.Fatalf("Failed to create database directory: %v", err)
	}

	// Create server configuration
	config := server.DefaultConfig()
	config.TCPPort = *port

	// Create and start server
	srv, err := server.NewServer(*dbPath, config)
	if err != nil {
		log.Fatalf("Failed to create server: %v", err)
	}

	if err := srv.Start(); err != nil {
		log.Fatalf("Failed to start server: %v", err)
	}

	log.Printf("SuperChat server started successfully")
	log.Printf("Database: %s", *dbPath)

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
