// +build !linux

package server

import "log"

// logListenBacklog logs the listen address (non-Linux systems)
func logListenBacklog(addr string) {
	log.Printf("TCP server listening on %s", addr)
}

// monitorListenOverflows is a no-op on non-Linux systems
func (s *Server) monitorListenOverflows() {
	// Not available on non-Linux systems
}
