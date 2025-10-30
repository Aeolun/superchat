-- Fix UserChannelState to use 0 instead of NULL for subchannel_id
-- This ensures ON CONFLICT works correctly (NULL values don't conflict in SQLite)

-- First, delete duplicate rows, keeping only the one with the latest timestamp
DELETE FROM UserChannelState
WHERE rowid NOT IN (
    SELECT MAX(rowid)
    FROM UserChannelState
    GROUP BY user_id, channel_id, COALESCE(subchannel_id, 0)
);

-- Drop the old table
DROP TABLE IF EXISTS UserChannelState;

-- Recreate with subchannel_id defaulting to 0 instead of NULL
CREATE TABLE UserChannelState (
    user_id INTEGER NOT NULL,
    channel_id INTEGER NOT NULL,
    subchannel_id INTEGER NOT NULL DEFAULT 0,  -- 0 for main channel, >0 for subchannels
    last_read_at INTEGER NOT NULL DEFAULT 0,
    updated_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now')),

    PRIMARY KEY (user_id, channel_id, subchannel_id),
    FOREIGN KEY (user_id) REFERENCES User(id) ON DELETE CASCADE,
    FOREIGN KEY (channel_id) REFERENCES Channel(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_user_channel_state_user
    ON UserChannelState(user_id, channel_id);

CREATE INDEX IF NOT EXISTS idx_user_channel_state_updated
    ON UserChannelState(updated_at);
