-- Initial schema for SuperChat V1
-- This migration captures the current schema as of the first migration system deployment

-- Channel table
CREATE TABLE IF NOT EXISTS Channel (
	id INTEGER PRIMARY KEY AUTOINCREMENT,
	name TEXT NOT NULL UNIQUE,
	display_name TEXT NOT NULL,
	description TEXT,
	channel_type INTEGER NOT NULL DEFAULT 1,
	message_retention_hours INTEGER NOT NULL DEFAULT 168,
	created_by INTEGER,
	created_at INTEGER NOT NULL,
	is_private INTEGER NOT NULL DEFAULT 0
);

-- Session table (uses Snowflake IDs for performance)
CREATE TABLE IF NOT EXISTS Session (
	id INTEGER PRIMARY KEY,
	user_id INTEGER,
	nickname TEXT NOT NULL,
	connection_type TEXT NOT NULL,
	connected_at INTEGER NOT NULL,
	last_activity INTEGER NOT NULL
);

-- Message table
CREATE TABLE IF NOT EXISTS Message (
	id INTEGER PRIMARY KEY,
	channel_id INTEGER NOT NULL,
	subchannel_id INTEGER,
	parent_id INTEGER,
	thread_root_id INTEGER,
	author_user_id INTEGER,
	author_nickname TEXT NOT NULL,
	content TEXT NOT NULL,
	created_at INTEGER NOT NULL,
	edited_at INTEGER,
	deleted_at INTEGER,
	FOREIGN KEY (channel_id) REFERENCES Channel(id) ON DELETE CASCADE,
	FOREIGN KEY (parent_id) REFERENCES Message(id) ON DELETE CASCADE,
	FOREIGN KEY (thread_root_id) REFERENCES Message(id) ON DELETE CASCADE
);

-- MessageVersion table
CREATE TABLE IF NOT EXISTS MessageVersion (
	id INTEGER PRIMARY KEY AUTOINCREMENT,
	message_id INTEGER NOT NULL,
	content TEXT NOT NULL,
	author_nickname TEXT NOT NULL,
	created_at INTEGER NOT NULL,
	version_type TEXT NOT NULL,
	FOREIGN KEY (message_id) REFERENCES Message(id) ON DELETE CASCADE
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_messages_channel ON Message(channel_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_messages_parent ON Message(parent_id) WHERE parent_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_messages_thread_root ON Message(thread_root_id) WHERE thread_root_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_messages_retention ON Message(created_at, parent_id);
CREATE INDEX IF NOT EXISTS idx_sessions_activity ON Session(last_activity);
