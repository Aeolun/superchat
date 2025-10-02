package main

import (
	"flag"
	"fmt"
	"log"
	"os"
	"path/filepath"

	tea "github.com/charmbracelet/bubbletea"
	"github.com/aeolun/superchat/pkg/client"
	"github.com/aeolun/superchat/pkg/client/ui"
)

func main() {
	// Command line flags
	server := flag.String("server", "localhost:7070", "Server address (host:port)")
	statePath := flag.String("state", "", "Path to state database (default: ~/.superchat-client/state.db)")
	flag.Parse()

	// Default state path
	if *statePath == "" {
		homeDir, err := os.UserHomeDir()
		if err != nil {
			log.Fatalf("Failed to get home directory: %v", err)
		}
		*statePath = filepath.Join(homeDir, ".superchat-client", "state.db")
	}

	// Open state database
	state, err := client.OpenState(*statePath)
	if err != nil {
		log.Fatalf("Failed to open state database: %v", err)
	}
	defer state.Close()

	// Create connection
	conn := client.NewConnection(*server)

	// Connect to server
	if err := conn.Connect(); err != nil {
		log.Fatalf("Failed to connect to %s: %v", *server, err)
	}
	defer conn.Close()

	// Create bubbletea program
	model := ui.NewModel(conn, state)
	p := tea.NewProgram(model, tea.WithAltScreen())

	// Run the program
	if _, err := p.Run(); err != nil {
		fmt.Printf("Error running program: %v\n", err)
		os.Exit(1)
	}
}
