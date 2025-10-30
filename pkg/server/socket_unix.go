// ABOUTME: Unix-specific socket options for SO_REUSEADDR
// ABOUTME: Allows quick server restart by reusing the address immediately
//go:build unix || linux || darwin

package server

import (
	"syscall"
)

// setSocketOptions sets platform-specific socket options
func setSocketOptions(fd uintptr) error {
	// Set SO_REUSEADDR to allow quick restart
	return syscall.SetsockoptInt(int(fd), syscall.SOL_SOCKET, syscall.SO_REUSEADDR, 1)
}
