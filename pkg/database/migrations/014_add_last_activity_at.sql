-- Add last_activity_at column to Message table
-- For root messages, this tracks when the last reply was posted (or creation time if no replies)
-- For non-root messages, this is unused (defaults to created_at)
ALTER TABLE Message ADD COLUMN last_activity_at INTEGER;

-- Backfill: for root messages, set to the latest reply's created_at, or own created_at if no replies
UPDATE Message SET last_activity_at = COALESCE(
    (SELECT MAX(r.created_at) FROM Message r WHERE r.thread_root_id = Message.id AND r.id != Message.id),
    created_at
)
WHERE parent_id IS NULL;

-- Backfill: for non-root messages, just use created_at
UPDATE Message SET last_activity_at = created_at WHERE parent_id IS NOT NULL;

-- Index for sorting root messages by activity
CREATE INDEX IF NOT EXISTS idx_message_channel_activity ON Message(channel_id, last_activity_at DESC) WHERE parent_id IS NULL;
