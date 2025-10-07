-- Migration 004: Add DiscoveredServer table for server discovery
-- This table is used by servers running in directory mode to track known servers

CREATE TABLE IF NOT EXISTS DiscoveredServer (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    hostname TEXT NOT NULL,
    port INTEGER NOT NULL,
    name TEXT NOT NULL,
    description TEXT NOT NULL,
    max_users INTEGER NOT NULL DEFAULT 0,
    is_public INTEGER NOT NULL DEFAULT 1,
    user_count INTEGER NOT NULL DEFAULT 0,
    uptime_seconds INTEGER NOT NULL DEFAULT 0,
    last_heartbeat INTEGER NOT NULL,
    heartbeat_interval INTEGER NOT NULL DEFAULT 300,
    discovered_via TEXT NOT NULL CHECK(discovered_via IN ('registration', 'gossip')),
    source_ip TEXT,
    created_at INTEGER NOT NULL,
    UNIQUE(hostname, port)
);

CREATE INDEX IF NOT EXISTS idx_discovered_server_last_heartbeat ON DiscoveredServer(last_heartbeat DESC);
CREATE INDEX IF NOT EXISTS idx_discovered_server_hostname_port ON DiscoveredServer(hostname, port);
CREATE INDEX IF NOT EXISTS idx_discovered_server_source_ip ON DiscoveredServer(source_ip);
