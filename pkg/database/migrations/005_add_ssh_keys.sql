-- @foreign_keys=on
-- Migration 005: Add SSH key authentication support

-- SSH keys table for public key authentication
CREATE TABLE IF NOT EXISTS SSHKey (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  fingerprint TEXT UNIQUE NOT NULL,     -- SHA256:base64 format (e.g., SHA256:abc123...)
  public_key TEXT NOT NULL,              -- Full SSH public key in authorized_keys format
  key_type TEXT NOT NULL,                -- Key algorithm: 'ssh-rsa', 'ssh-ed25519', 'ecdsa-sha2-nistp256'
  label TEXT,                            -- User-friendly name (e.g., "laptop", "work", "auto-registered")
  added_at INTEGER NOT NULL,             -- Unix timestamp (milliseconds) when key was added
  last_used_at INTEGER,                  -- Unix timestamp (milliseconds) of last successful auth
  FOREIGN KEY (user_id) REFERENCES User(id) ON DELETE CASCADE
);

-- Index for fast fingerprint lookups during SSH authentication
CREATE UNIQUE INDEX IF NOT EXISTS idx_ssh_fingerprint ON SSHKey(fingerprint);

-- Index for listing a user's keys
CREATE INDEX IF NOT EXISTS idx_ssh_user ON SSHKey(user_id);
