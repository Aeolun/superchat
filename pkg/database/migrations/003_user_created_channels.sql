-- @foreign_keys=off
-- 003: User-created channels
-- Allow registered users to create their own channels

-- Add foreign key constraint from Channel.created_by to User.id
-- The created_by column already exists from v1, but was not constrained
-- NULL values are allowed (for admin-created channels in v1)

-- SQLite doesn't support ADD CONSTRAINT, so we need to recreate the table
-- The @foreign_keys=off header disables foreign keys to prevent CASCADE deletes during table recreation

-- 1. Create new table with constraint
CREATE TABLE IF NOT EXISTS Channel_new (
	id INTEGER PRIMARY KEY AUTOINCREMENT,
	name TEXT NOT NULL UNIQUE,
	display_name TEXT NOT NULL,
	description TEXT,
	channel_type INTEGER NOT NULL DEFAULT 1,
	message_retention_hours INTEGER NOT NULL DEFAULT 168,
	created_by INTEGER,
	created_at INTEGER NOT NULL,
	is_private INTEGER NOT NULL DEFAULT 0,
	FOREIGN KEY (created_by) REFERENCES User(id) ON DELETE SET NULL
);

-- 2. Copy data from old table
INSERT INTO Channel_new (id, name, display_name, description, channel_type, message_retention_hours, created_by, created_at, is_private)
SELECT id, name, display_name, description, channel_type, message_retention_hours, created_by, created_at, is_private
FROM Channel;

-- 3. Drop old table
DROP TABLE Channel;

-- 4. Rename new table
ALTER TABLE Channel_new RENAME TO Channel;

-- 5. Recreate indexes (they were on the old table)
CREATE UNIQUE INDEX IF NOT EXISTS idx_channel_name ON Channel(name);
