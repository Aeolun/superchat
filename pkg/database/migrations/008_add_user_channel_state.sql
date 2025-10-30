-- Migration 008: Add UserChannelState table for tracking read state
-- This table stores the last read timestamp for each user in each channel/subchannel.
-- Used to calculate unread message counts and sync read state across devices.

CREATE TABLE IF NOT EXISTS UserChannelState (
    user_id INTEGER NOT NULL,
    channel_id INTEGER NOT NULL,
    subchannel_id INTEGER,  -- NULL for main channel, populated for subchannels (V3)
    last_read_at INTEGER NOT NULL DEFAULT 0,  -- Unix timestamp (seconds)
    updated_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now')),

    PRIMARY KEY (user_id, channel_id, subchannel_id),
    FOREIGN KEY (user_id) REFERENCES User(id) ON DELETE CASCADE,
    FOREIGN KEY (channel_id) REFERENCES Channel(id) ON DELETE CASCADE
);

-- Index for fast unread count lookups by user
CREATE INDEX IF NOT EXISTS idx_user_channel_state_user
    ON UserChannelState(user_id, channel_id);

-- Index for cleanup queries (find stale state for inactive users)
CREATE INDEX IF NOT EXISTS idx_user_channel_state_updated
    ON UserChannelState(updated_at);
