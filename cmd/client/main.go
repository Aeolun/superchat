package main

import (
	"flag"
	"fmt"
	"log"
	"net"
	"os"
	"path/filepath"
	"strings"

	"github.com/aeolun/superchat/pkg/client"
	"github.com/aeolun/superchat/pkg/client/ui"
	"github.com/aeolun/superchat/pkg/updater"
	tea "github.com/charmbracelet/bubbletea"
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
	server := flag.String("server", "", "Server address (host:port, sc://host:port, ssh://user@host:port, ws://host:port; default port varies by scheme)")
	directory := flag.String("directory", "", "Directory server address (host:port) to fetch server list from")
	profile := flag.String("profile", "", "Profile name for separate configuration (default: none)")
	statePath := flag.String("state", "", "Path to state database (overrides config)")
	throttle := flag.Int("throttle", 0, "Bandwidth limit in bytes/sec (e.g., 3600 for 28.8kbps dial-up, 0=unlimited)")
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

	// Determine connection mode:
	// - If --server flag: connect directly to that server
	// - If --directory flag: connect to directory server to fetch server list
	// - If saved server exists: connect directly to that server
	// - Otherwise: use directory mode with default/config directory server
	var serverAddr string
	var directoryServerAddr string
	useDirectory := false

	if *server != "" {
		// Explicit --server flag: direct connection
		// If no scheme specified, check connection history to use last successful method
		if !strings.Contains(*server, "://") {
			// Try exact match first, then try with common ports
			lookupAddrs := []string{*server, *server + ":6465", *server + ":8080"}
			var lastMethod string
			for _, addr := range lookupAddrs {
				method, err := state.GetLastSuccessfulMethod(addr)
				if err == nil && method != "" {
					lastMethod = method
					break
				}
			}

			if lastMethod != "" {
				// Use last successful method
				switch lastMethod {
				case "ssh":
					serverAddr = "ssh://" + *server
				case "wss":
					serverAddr = "wss://" + *server
				case "ws", "websocket":
					serverAddr = "ws://" + *server
				default:
					serverAddr = *server // Default to TCP
				}
			} else {
				serverAddr = *server
			}
		} else {
			serverAddr = *server
		}
	} else if *directory != "" {
		// Explicit --directory flag: use directory mode
		// Check connection history if no scheme specified
		if !strings.Contains(*directory, "://") {
			lastMethod, err := state.GetLastSuccessfulMethod(*directory)
			if err == nil && lastMethod != "" {
				switch lastMethod {
				case "ssh":
					directoryServerAddr = "ssh://" + *directory
				case "wss":
					directoryServerAddr = "wss://" + *directory
				case "ws", "websocket":
					directoryServerAddr = "ws://" + *directory
				default:
					directoryServerAddr = *directory
				}
			} else {
				directoryServerAddr = *directory
			}
		} else {
			directoryServerAddr = *directory
		}
		useDirectory = true
	} else {
		// Check if we have a saved server from previous directory selection
		savedServer, err := state.GetConfig("directory_selected_server")
		if err == nil && savedServer != "" {
			// User has previously selected a server, connect directly to it
			// Check connection history if no scheme in saved address
			if !strings.Contains(savedServer, "://") {
				// Try exact match first, then try with common ports
				lookupAddrs := []string{savedServer, savedServer + ":8080"}
				// Also try without port if it has one
				if host, _, err := net.SplitHostPort(savedServer); err == nil {
					lookupAddrs = append(lookupAddrs, host, host+":8080", host+":6465")
				}

				var lastMethod string
				for _, addr := range lookupAddrs {
					method, err := state.GetLastSuccessfulMethod(addr)
					if err == nil && method != "" {
						lastMethod = method
						break
					}
				}

				if lastMethod != "" {
					// Use last successful method
					switch lastMethod {
					case "ssh":
						serverAddr = "ssh://" + savedServer
					case "wss":
						serverAddr = "wss://" + savedServer
					case "ws", "websocket":
						serverAddr = "ws://" + savedServer
					default:
						serverAddr = savedServer
					}
				} else {
					serverAddr = savedServer
				}
			} else {
				serverAddr = savedServer
			}
		} else {
			// No saved server (first run or reset) - use directory mode
			// This shows the server selector and lets user choose
			directoryServerAddr = config.GetServerAddress()
			if directoryServerAddr == "" {
				directoryServerAddr = "superchat.win:6465" // Default directory server
			}
			// Check connection history for directory server
			if !strings.Contains(directoryServerAddr, "://") {
				lastMethod, err := state.GetLastSuccessfulMethod(directoryServerAddr)
				if err == nil && lastMethod != "" {
					switch lastMethod {
					case "ssh":
						directoryServerAddr = "ssh://" + directoryServerAddr
					case "wss":
						directoryServerAddr = "wss://" + directoryServerAddr
					case "ws", "websocket":
						directoryServerAddr = "ws://" + directoryServerAddr
					}
					// else: keep default TCP address
				}
			}
			useDirectory = true
		}
	}

	// Set up debug logger
	logger, logFile, err := setupLogger(state.GetStateDir())
	if err != nil {
		log.Printf("Warning: Failed to set up debug logging: %v", err)
		// Continue without logging - not a fatal error
	}
	if logFile != nil {
		defer logFile.Close()
	}

	// Create connection - either to chat server directly or to directory server
	var conn client.ConnectionInterface
	var connectAddr string
	if useDirectory {
		connectAddr = directoryServerAddr
		if logger != nil {
			logger.Printf("Directory mode: connecting to directory server: %s", connectAddr)
		}
	} else {
		connectAddr = serverAddr
		if logger != nil {
			logger.Printf("Direct mode: connecting to server: %s", connectAddr)
		}
	}

	// Create connection (returns concrete type)
	c, err := client.NewConnection(connectAddr)
	if err != nil {
		log.Fatalf("Invalid server address %q: %v", connectAddr, err)
	}

	// Configure connection using concrete type methods
	if logger != nil {
		c.SetLogger(logger)
	}

	// Apply bandwidth throttling if requested
	if *throttle > 0 {
		c.SetThrottle(*throttle)
		if logger != nil {
			logger.Printf("Bandwidth throttling enabled: %d bytes/sec", *throttle)
		}
	}

	// Connect to server (don't fail if connection fails - let UI handle it)
	var initialConnErr error
	if err := c.Connect(); err != nil {
		if logger != nil {
			logger.Printf("Initial connection failed: %v", err)
		}
		// Don't exit - let UI show error and offer recovery options
		initialConnErr = err
	} else {
		// Connection successful - save the connection method for future use
		connType := c.GetConnectionType()
		connAddr := c.GetAddress()
		if connType == "websocket" {
			if strings.HasPrefix(connAddr, "wss://") {
				connType = "wss"
			} else if strings.HasPrefix(connAddr, "ws://") {
				connType = "ws"
			}
		}
		serverAddr := c.GetRawAddress()
		if err := state.SaveSuccessfulConnection(serverAddr, connType); err != nil && logger != nil {
			logger.Printf("Failed to save successful connection method: %v", err)
		} else if logger != nil {
			logger.Printf("Saved successful connection method: %s for %s", connType, serverAddr)
		}
	}
	defer c.Close()

	// Now assign to interface
	conn = c

	// Create bubbletea program (pass connection error if any)
	model := ui.NewModel(conn, state, Version, useDirectory, *throttle, logger, initialConnErr)
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
