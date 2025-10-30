-- Migration 002: Extend ReadState to support subchannels and threads
-- Drops and recreates ReadState table with new schema
-- Safe to drop because this is local client state that can be rebuilt

-- Drop old table (local state only, can be rebuilt)
DROP TABLE IF EXISTS ReadState;

-- Create new ReadState table with subchannel and thread support
CREATE TABLE ReadState (
	channel_id INTEGER NOT NULL,
	subchannel_id INTEGER,  -- NULL for main channel
	thread_id INTEGER,      -- NULL for channel-wide, or specific thread root message ID
	last_read_at INTEGER NOT NULL,
	updated_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now')),

	PRIMARY KEY (channel_id, subchannel_id, thread_id)
);

-- Index for fast lookups by channel
CREATE INDEX idx_read_state_channel ON ReadState(channel_id);

-- Index for cleanup queries
CREATE INDEX idx_read_state_updated ON ReadState(updated_at);
