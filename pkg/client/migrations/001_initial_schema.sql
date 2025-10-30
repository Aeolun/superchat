-- Migration 001: Initial client-side schema
-- Creates Config, ReadState, and ConnectionHistory tables

CREATE TABLE IF NOT EXISTS Config (
	key TEXT PRIMARY KEY,
	value TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS ReadState (
	channel_id INTEGER PRIMARY KEY,
	last_read_at INTEGER NOT NULL,
	last_read_message_id INTEGER
);

CREATE TABLE IF NOT EXISTS ConnectionHistory (
	server_address TEXT PRIMARY KEY,
	last_successful_method TEXT NOT NULL,
	last_success_at INTEGER NOT NULL
);
