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
	"github.com/aeolun/superchat/pkg/updater"
)

var (
	// Version is set at build time via ldflags
	Version = "dev"
)

func setupLogger(stateDir string) (*log.Logger, *os.File, error) {
	logPath := filepath.Join(stateDir, "debug.log")
	logFile, err := os.OpenFile(logPath, os.O_CREATE|os.O_WRONLY|os.O_APPEND, 0644)
	if err != nil {
		return nil, nil, fmt.Errorf("failed to open log file: %w", err)
	}

	logger := log.New(logFile, "", log.LstdFlags)
	logger.Printf("=== SuperChat client started ===")
	return logger, logFile, nil
}

func getDefaultConfigPath() string {
	// Respect XDG_CONFIG_HOME
	xdgConfig := os.Getenv("XDG_CONFIG_HOME")
	if xdgConfig == "" {
		homeDir, err := os.UserHomeDir()
		if err != nil {
			return ""
		}
		xdgConfig = filepath.Join(homeDir, ".config")
	}
	return filepath.Join(xdgConfig, "superchat", "config.toml")
}

func handleUpdate() {
	fmt.Printf("Current version: %s\n", Version)
	fmt.Println("Checking for updates...")

	// Get executable path to preserve install location
	exePath, err := os.Executable()
	if err != nil {
		log.Fatalf("Failed to get executable path: %v", err)
	}

	// Run the updater
	if err := updater.Update(Version, exePath, os.Args); err != nil {
		log.Fatalf("Update failed: %v", err)
	}
}

func main() {
	// Command line flags
	defaultConfig := getDefaultConfigPath()
	configPath := flag.String("config", defaultConfig, "Path to config file")
	server := flag.String("server", "", "Server address (host:port, overrides config)")
	profile := flag.String("profile", "", "Profile name for separate configuration (default: none)")
	statePath := flag.String("state", "", "Path to state database (overrides config)")
	version := flag.Bool("version", false, "Show version information")
	flag.Parse()

	// Handle --version flag
	if *version {
		fmt.Printf("SuperChat %s\n", Version)
		os.Exit(0)
	}

	// Handle subcommands
	if flag.NArg() > 0 {
		switch flag.Arg(0) {
		case "update":
			handleUpdate()
			return
		default:
			log.Fatalf("Unknown command: %s", flag.Arg(0))
		}
	}

	// Load configuration (creates default if not found)
	config, err := client.LoadClientConfig(*configPath)
	if err != nil {
		log.Fatalf("Failed to load config: %v", err)
	}

	// Command-line flags override config
	serverAddr := config.GetServerAddress()
	if *server != "" {
		serverAddr = *server
	}

	// Determine state path
	finalStatePath := ""
	if *statePath != "" {
		// Explicit command-line flag
		finalStatePath = *statePath
	} else if *profile != "" {
		// Profile uses XDG_DATA_HOME/superchat-{profile}/
		xdgData := os.Getenv("XDG_DATA_HOME")
		if xdgData == "" {
			homeDir, err := os.UserHomeDir()
			if err != nil {
				log.Fatalf("Failed to get home directory: %v", err)
			}
			xdgData = filepath.Join(homeDir, ".local", "share")
		}
		finalStatePath = filepath.Join(xdgData, fmt.Sprintf("superchat-%s", *profile), "state.db")
	} else {
		// Use config value
		finalStatePath, err = config.GetStateDBPath()
		if err != nil {
			log.Fatalf("Failed to resolve state path: %v", err)
		}
	}

	// Open state database
	state, err := client.OpenState(finalStatePath)
	if err != nil {
		log.Fatalf("Failed to open state database: %v", err)
	}
	defer state.Close()

	// Set up debug logger
	logger, logFile, err := setupLogger(state.GetStateDir())
	if err != nil {
		log.Printf("Warning: Failed to set up debug logging: %v", err)
		// Continue without logging - not a fatal error
	}
	if logFile != nil {
		defer logFile.Close()
	}

	// Create connection
	conn := client.NewConnection(serverAddr)
	if logger != nil {
		conn.SetLogger(logger)
		logger.Printf("Connecting to server: %s", serverAddr)
	}

	// Connect to server
	if err := conn.Connect(); err != nil {
		if logger != nil {
			logger.Printf("Failed to connect: %v", err)
		}
		log.Fatalf("Failed to connect to %s: %v", serverAddr, err)
	}
	defer conn.Close()

	// Create bubbletea program
	model := ui.NewModel(conn, state, Version)
	p := tea.NewProgram(model, tea.WithAltScreen())

	// Run the program
	if _, err := p.Run(); err != nil {
		if logger != nil {
			logger.Printf("Error running program: %v", err)
		}
		fmt.Printf("Error running program: %v\n", err)
		os.Exit(1)
	}

	if logger != nil {
		logger.Printf("=== SuperChat client exited normally ===")
	}
}
