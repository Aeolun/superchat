-- Migration: Add channel_count to DiscoveredServer table
-- Version: 6
-- Description: Add channel_count column to track the number of channels on remote servers

-- Add channel_count column (defaults to 0 for existing servers)
ALTER TABLE DiscoveredServer ADD COLUMN channel_count INTEGER NOT NULL DEFAULT 0;

-- Note: This column will be populated via REGISTER_SERVER and HEARTBEAT messages
