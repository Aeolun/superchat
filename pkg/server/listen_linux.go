// +build linux

package server

import (
	"bufio"
	"fmt"
	"log"
	"os"
	"strings"
	"time"
)

// logListenBacklog logs the kernel's listen backlog limit (Linux-specific)
func logListenBacklog(addr string) {
	var somaxconn int
	if data, err := os.ReadFile("/proc/sys/net/core/somaxconn"); err == nil {
		fmt.Sscanf(string(data), "%d", &somaxconn)
	}

	log.Printf("TCP server listening on %s (kernel listen backlog: %d)", addr, somaxconn)
	if somaxconn > 0 && somaxconn < 10000 {
		log.Printf("WARNING: net.core.somaxconn=%d may be too low for high connection rates", somaxconn)
		log.Printf("  Consider: sudo sysctl -w net.core.somaxconn=65535")
	}
}

// monitorListenOverflows periodically checks for listen queue overflows (Linux-specific)
func (s *Server) monitorListenOverflows() {
	ticker := time.NewTicker(10 * time.Second)
	defer ticker.Stop()

	var lastOverflows uint64

	for {
		select {
		case <-ticker.C:
			overflows := getListenOverflows()
			if overflows > lastOverflows {
				delta := overflows - lastOverflows
				log.Printf("WARNING: %d connection(s) rejected due to listen backlog overflow (total: %d)", delta, overflows)
				log.Printf("  Consider increasing: sudo sysctl -w net.core.somaxconn=65535")
			}
			lastOverflows = overflows

		case <-s.shutdown:
			return
		}
	}
}

// getListenOverflows reads the ListenOverflows counter from /proc/net/netstat
func getListenOverflows() uint64 {
	file, err := os.Open("/proc/net/netstat")
	if err != nil {
		return 0
	}
	defer file.Close()

	scanner := bufio.NewScanner(file)
	var headers []string
	var values []string

	for scanner.Scan() {
		line := scanner.Text()
		if strings.HasPrefix(line, "TcpExt:") {
			fields := strings.Fields(line)
			if len(headers) == 0 {
				headers = fields[1:] // Skip "TcpExt:" prefix
			} else {
				values = fields[1:]
				break
			}
		}
	}

	// Find ListenOverflows column
	for i, header := range headers {
		if header == "ListenOverflows" && i < len(values) {
			var overflows uint64
			fmt.Sscanf(values[i], "%d", &overflows)
			return overflows
		}
	}

	return 0
}
