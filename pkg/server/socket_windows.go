// ABOUTME: Windows-specific socket options for SO_REUSEADDR
// ABOUTME: Allows quick server restart by reusing the address immediately
//go:build windows

package server

import (
	"syscall"
)

// setSocketOptions sets platform-specific socket options
func setSocketOptions(fd uintptr) error {
	// Set SO_REUSEADDR to allow quick restart
	// On Windows, fd needs to be cast to syscall.Handle
	return syscall.SetsockoptInt(syscall.Handle(fd), syscall.SOL_SOCKET, syscall.SO_REUSEADDR, 1)
}
