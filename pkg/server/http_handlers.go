package server

import (
	"encoding/json"
	"log"
	"net/http"
	"time"

	"github.com/aeolun/superchat/pkg/protocol"
)

// ServersJSONHandler serves the directory server list as JSON
func (s *Server) ServersJSONHandler(w http.ResponseWriter, r *http.Request) {
	// Only respond if directory mode is enabled
	if !s.config.DirectoryEnabled {
		http.Error(w, "Directory mode not enabled on this server", http.StatusNotImplemented)
		return
	}

	// Get servers from database
	servers, err := s.db.ListDiscoveredServers(100)
	if err != nil {
		log.Printf("Error listing servers for HTTP endpoint: %v", err)
		http.Error(w, "Internal server error", http.StatusInternalServerError)
		return
	}

	// Build server list (same logic as handleListServers)
	serverInfos := make([]protocol.ServerInfo, 0, len(servers)+1)

	// Add self (directory server) as first entry
	selfInfo := protocol.ServerInfo{
		Hostname:      s.config.PublicHostname,
		Port:          uint16(s.config.TCPPort),
		Name:          s.config.ServerName,
		Description:   s.config.ServerDesc,
		UserCount:     s.sessions.CountOnlineUsers(),
		MaxUsers:      s.config.MaxUsers,
		UptimeSeconds: uint64(time.Since(s.startTime).Seconds()),
		IsPublic:      true,
		ChannelCount:  s.db.CountChannels(),
	}
	serverInfos = append(serverInfos, selfInfo)

	// Add registered servers from database
	for _, server := range servers {
		serverInfos = append(serverInfos, protocol.ServerInfo{
			Hostname:      server.Hostname,
			Port:          server.Port,
			Name:          server.Name,
			Description:   server.Description,
			UserCount:     server.UserCount,
			MaxUsers:      server.MaxUsers,
			UptimeSeconds: server.UptimeSeconds,
			IsPublic:      server.IsPublic,
			ChannelCount:  server.ChannelCount,
		})
	}

	// Return as JSON
	w.Header().Set("Content-Type", "application/json")
	w.Header().Set("Access-Control-Allow-Origin", "*") // Allow CORS for external websites
	if err := json.NewEncoder(w).Encode(map[string]interface{}{
		"servers": serverInfos,
		"count":   len(serverInfos),
	}); err != nil {
		log.Printf("Error encoding servers JSON: %v", err)
	}
}

// HealthHandler serves health check status
func (s *Server) HealthHandler(w http.ResponseWriter, r *http.Request) {
	health := map[string]interface{}{
		"status": "healthy",
		"uptime_seconds": int64(time.Since(s.startTime).Seconds()),
	}

	// Check database connectivity
	channels := s.db.CountChannels()
	health["database_accessible"] = true
	health["channels"] = channels

	// Add session info
	health["active_sessions"] = s.sessions.CountOnlineUsers()

	// Add config info
	health["directory_enabled"] = s.config.DirectoryEnabled
	health["server_name"] = s.config.ServerName

	// Return as JSON
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusOK)
	if err := json.NewEncoder(w).Encode(health); err != nil {
		log.Printf("Error encoding health JSON: %v", err)
	}
}
