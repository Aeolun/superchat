-- Migration 007: Add admin tables (Ban and AdminAction)
-- Adds ban system with user bans, IP bans (CIDR), shadowban support, and admin audit logging

-- Ban table: Stores user and IP bans with expiration and shadowban support
CREATE TABLE IF NOT EXISTS Ban (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  ban_type TEXT NOT NULL CHECK(ban_type IN ('user', 'ip')),

  -- User bans (ban_type = 'user')
  user_id INTEGER,  -- NULL for IP bans, foreign key to User.id
  nickname TEXT,    -- Nickname at time of ban (for audit trail, preserved even if user changes nickname)

  -- IP bans (ban_type = 'ip')
  ip_cidr TEXT,     -- NULL for user bans, CIDR notation (e.g., "192.168.1.0/24" or "10.0.0.5/32")

  -- Ban details
  reason TEXT NOT NULL,
  shadowban INTEGER NOT NULL DEFAULT 0,  -- 0 = normal ban, 1 = shadowban (messages only visible to author)
  banned_at INTEGER NOT NULL,            -- Unix timestamp (milliseconds)
  banned_until INTEGER,                   -- NULL = permanent, Unix timestamp (milliseconds) for timed bans
  banned_by TEXT NOT NULL,               -- Admin nickname who created the ban

  FOREIGN KEY (user_id) REFERENCES User(id) ON DELETE CASCADE
);

-- Indexes for ban lookups
CREATE INDEX IF NOT EXISTS idx_ban_user ON Ban(user_id) WHERE ban_type = 'user';
CREATE INDEX IF NOT EXISTS idx_ban_ip ON Ban(ip_cidr) WHERE ban_type = 'ip';
CREATE INDEX IF NOT EXISTS idx_ban_expiry ON Ban(banned_until) WHERE banned_until IS NOT NULL;

-- AdminAction table: Audit log for all admin actions
CREATE TABLE IF NOT EXISTS AdminAction (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  admin_nickname TEXT NOT NULL,    -- Who performed the action
  action_type TEXT NOT NULL,       -- 'ban_user', 'ban_ip', 'unban_user', 'unban_ip',
                                   -- 'delete_message', 'delete_channel', 'delete_user'
  target_type TEXT NOT NULL,       -- 'user', 'ip', 'message', 'channel'
  target_id INTEGER,               -- User ID, Message ID, Channel ID, or Ban ID (NULL if not applicable)
  target_identifier TEXT,          -- Nickname, IP address, message content preview, channel name
  details TEXT,                    -- JSON or text with action details (ban reason, duration, etc.)
  performed_at INTEGER NOT NULL,   -- Unix timestamp (milliseconds)
  ip_address TEXT NOT NULL         -- Admin's IP address when action was performed
);

-- Indexes for admin action queries
CREATE INDEX IF NOT EXISTS idx_admin_action_admin ON AdminAction(admin_nickname, performed_at DESC);
CREATE INDEX IF NOT EXISTS idx_admin_action_target ON AdminAction(target_type, target_id);
CREATE INDEX IF NOT EXISTS idx_admin_action_time ON AdminAction(performed_at DESC);
