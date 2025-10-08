package client

import (
	"log"
	"net"
	"strings"
)

// ResolveConnectionMethod determines the best connection method for a given address
// based on connection history. It tries multiple port variations and returns
// the address with the appropriate scheme prefix (ssh://, ws://, wss://, or plain TCP).
//
// The function attempts to find connection history for:
//   - The exact address as provided
//   - The address with common ports (:8080, :6465) if no port specified
//   - The host without port (if a port was provided)
//   - The host with common ports
//
// If no connection history is found, the original address is returned unchanged.
func ResolveConnectionMethod(address string, state StateInterface, logger *log.Logger) string {
	// If already has a scheme, return as-is
	if strings.Contains(address, "://") {
		return address
	}

	// Build list of addresses to check for connection history
	lookupAddrs := buildLookupAddresses(address)

	// Try to find connection history for any of the address variations
	var lastMethod string
	for _, addr := range lookupAddrs {
		method, err := state.GetLastSuccessfulMethod(addr)
		if err == nil && method != "" {
			lastMethod = method
			if logger != nil {
				logger.Printf("Found connection history for %s: %s", addr, method)
			}
			break
		}
	}

	// Apply the appropriate scheme based on last successful method
	if lastMethod != "" {
		return applyConnectionScheme(address, lastMethod)
	}

	// No connection history found, return original address
	return address
}

// buildLookupAddresses creates a list of address variations to check for connection history
func buildLookupAddresses(address string) []string {
	var lookupAddrs []string

	// Always try the exact address first
	lookupAddrs = append(lookupAddrs, address)

	// Check if address has a port
	host, port, err := net.SplitHostPort(address)
	if err != nil {
		// No port specified, try with common ports
		lookupAddrs = append(lookupAddrs,
			address+":6465", // Default SuperChat port
			address+":8080", // Common WebSocket port
		)
	} else {
		// Has a port, also try without port and with other common ports
		lookupAddrs = append(lookupAddrs, host)
		
		// Only add alternative ports if they're different from what we have
		if port != "8080" {
			lookupAddrs = append(lookupAddrs, host+":8080")
		}
		if port != "6465" {
			lookupAddrs = append(lookupAddrs, host+":6465")
		}
	}

	return lookupAddrs
}

// applyConnectionScheme adds the appropriate scheme prefix based on the connection method
func applyConnectionScheme(address string, method string) string {
	switch method {
	case "ssh":
		return "ssh://" + address
	case "wss":
		return "wss://" + address
	case "ws", "websocket":
		return "ws://" + address
	default:
		// TCP or unknown, return without scheme
		return address
	}
}
