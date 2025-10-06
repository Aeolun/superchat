-- V2 Migration: Add User table and user flags support
-- Adds user registration with passwords and user flags (admin/moderator bits)

-- User table for registered accounts
CREATE TABLE IF NOT EXISTS User (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    nickname TEXT UNIQUE NOT NULL,
    user_flags INTEGER NOT NULL DEFAULT 0,  -- Bit flags: 0x01=admin, 0x02=moderator
    password_hash TEXT,  -- bcrypt hash, NULL for SSH-only users
    created_at INTEGER NOT NULL,
    last_seen INTEGER NOT NULL
);

-- Index for fast login lookups
CREATE UNIQUE INDEX IF NOT EXISTS idx_users_nickname ON User(nickname);

-- Note on author_nickname in Message table:
-- author_nickname is only used for anonymous users (when author_user_id IS NULL)
-- For registered users (author_user_id IS NOT NULL), nickname and flags are
-- looked up from User table to always show current identity

-- Foreign key constraints for User table
-- Session.user_id already exists (nullable), add FK if not exists
-- Message.author_user_id already exists (nullable), add FK if not exists
-- Note: SQLite doesn't support adding FKs to existing columns, so these are logical constraints only
