# Admin System Design

## Overview

The admin system provides server operators with in-client moderation and administration capabilities. Admins are regular registered users with elevated permissions, configured via the server config file.

## Design Principles

1. **Reuse existing commands** - No separate admin commands, just elevated permissions
2. **In-client interface** - Admins use the same TUI client, not a separate CLI tool
3. **Permission-based** - Check `isAdmin()` in command handlers
4. **Auditable** - All admin actions logged to database
5. **Transparent** - Ban reasons shown to affected users

## Configuration

### Server Config (`config.toml`)

```toml
[server]
admin_users = ["alice", "bob"]  # List of admin nicknames
```

**Notes:**
- Only registered users can be admins (anonymous users excluded)
- Admins must authenticate with password or SSH key
- Config reload requires server restart (or SIGHUP handler in future)

## Database Schema

### Ban Table

Stores user and IP bans with expiration and shadowban support.

```sql
CREATE TABLE Ban (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  ban_type TEXT NOT NULL CHECK(ban_type IN ('user', 'ip')),

  -- User bans
  user_id INTEGER,  -- NULL for IP bans
  nickname TEXT,    -- Nickname at time of ban (for audit trail)

  -- IP bans (CIDR notation)
  ip_cidr TEXT,     -- NULL for user bans, e.g., "192.168.1.0/24" or "10.0.0.5/32"

  -- Ban details
  reason TEXT NOT NULL,
  shadowban INTEGER NOT NULL DEFAULT 0,  -- 0 = normal ban, 1 = shadowban
  banned_at INTEGER NOT NULL,            -- Unix timestamp
  banned_until INTEGER,                   -- NULL = permanent, Unix timestamp for timed bans
  banned_by TEXT NOT NULL,               -- Admin nickname who created the ban

  FOREIGN KEY (user_id) REFERENCES User(id) ON DELETE CASCADE
);

CREATE INDEX idx_ban_user ON Ban(user_id) WHERE ban_type = 'user';
CREATE INDEX idx_ban_ip ON Ban(ip_cidr) WHERE ban_type = 'ip';
CREATE INDEX idx_ban_expiry ON Ban(banned_until) WHERE banned_until IS NOT NULL;
```

**Notes:**
- `ban_type` discriminates between user bans and IP bans
- **User bans**: `user_id` populated, `ip_cidr` NULL
- **IP bans**: `ip_cidr` populated (CIDR notation), `user_id` NULL
- `nickname` stores the user's nickname at time of ban (even if they change nickname later)
- `ip_cidr` uses CIDR notation: single IP = `"10.0.0.5/32"`, range = `"192.168.1.0/24"`
- `shadowban = 1`: User can post but messages only visible to themselves
- `banned_until = NULL`: Permanent ban
- `banned_until = timestamp`: Ban expires at timestamp
- Expired bans are automatically ignored by ban check logic (lazy cleanup)
- Hard cleanup of expired bans can run periodically (e.g., daily cron)

### AdminAction Table

Audit log for all admin actions.

```sql
CREATE TABLE AdminAction (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  admin_nickname TEXT NOT NULL,    -- Who performed the action
  action_type TEXT NOT NULL,       -- 'ban_user', 'ban_ip', 'unban_user', 'unban_ip',
                                   -- 'delete_message', 'delete_channel', 'delete_user'
  target_type TEXT NOT NULL,       -- 'user', 'ip', 'message', 'channel'
  target_id INTEGER,               -- User ID, Message ID, Channel ID, or Ban ID
  target_identifier TEXT,          -- Nickname, IP address, message content preview, channel name
  details TEXT,                    -- JSON or text with action details (ban reason, etc.)
  performed_at INTEGER NOT NULL,   -- Unix timestamp
  ip_address TEXT NOT NULL         -- Admin's IP address when action was performed
);

CREATE INDEX idx_admin_action_admin ON AdminAction(admin_nickname, performed_at DESC);
CREATE INDEX idx_admin_action_target ON AdminAction(target_type, target_id);
CREATE INDEX idx_admin_action_time ON AdminAction(performed_at DESC);
```

**Action Types:**
- `ban_user` - User banned
- `ban_ip` - IP/CIDR range banned
- `unban_user` - User unbanned
- `unban_ip` - IP/CIDR unbanned
- `delete_message` - Message deleted by admin (not message owner)
- `delete_channel` - Channel deleted by admin (not channel owner)
- `delete_user` - User account deleted

**Details Field (JSON):**
```json
{
  "reason": "Spam",
  "shadowban": true,
  "banned_until": 1234567890,
  "original_content": "Spam message here..." // for delete_message
}
```

## Permission Checks

### Server-side Permission Check

```go
func (s *Server) isAdmin(session *Session) bool {
    if session.UserID == nil {
        return false // Anonymous users can never be admin
    }

    for _, adminNick := range s.config.AdminUsers {
        if session.Nickname == adminNick {
            return true
        }
    }
    return false
}
```

### Ban Checks

**On authentication (AUTHENTICATE or SET_NICKNAME):**
```go
func (s *Server) checkUserBan(userID uint64, nickname string, clientIP string) (*Ban, error) {
    // Check user ban (by user_id or nickname)
    userBan := s.db.GetActiveBan("user", userID, nickname)
    if userBan != nil && !userBan.IsExpired() {
        return userBan, fmt.Errorf("banned")
    }

    // Check IP ban (CIDR matching)
    ipBan := s.db.GetActiveIPBan(clientIP)
    if ipBan != nil && !ipBan.IsExpired() {
        return ipBan, fmt.Errorf("banned")
    }

    return nil, nil
}
```

**On message post (for shadowban filtering):**
```go
func (s *Server) isUserShadowbanned(session *Session) bool {
    if session.UserID == nil {
        return false // Anonymous users can't be shadowbanned
    }

    ban := s.db.GetActiveBan("user", *session.UserID, "")
    return ban != nil && ban.Shadowban && !ban.IsExpired()
}
```

## Protocol Messages

### BAN_USER (0x?? - Client → Server)

Ban a user by user ID or nickname.

**Fields:**
- `user_id` (Optional): User ID to ban (takes precedence if provided)
- `nickname` (Optional): Nickname to ban (if user_id not provided)
- `reason` (String): Ban reason (shown to user)
- `shadowban` (Bool): True for shadowban, false for normal ban
- `duration_seconds` (Optional): Ban duration in seconds, NULL for permanent

**Response:** `USER_BANNED` (success) or `ERROR` (unauthorized, user not found)

**Notes:**
- Requires admin permission
- At least one of `user_id` or `nickname` must be provided
- If both provided, `user_id` takes precedence
- Creates Ban record and AdminAction audit log

### BAN_IP (0x?? - Client → Server)

Ban an IP address or CIDR range.

**Fields:**
- `ip_cidr` (String): IP address or CIDR range (e.g., "10.0.0.5/32", "192.168.1.0/24")
- `reason` (String): Ban reason
- `duration_seconds` (Optional): Ban duration in seconds, NULL for permanent

**Response:** `IP_BANNED` (success) or `ERROR` (invalid CIDR, unauthorized)

**Notes:**
- Requires admin permission
- Validates CIDR notation
- Single IP should use /32 suffix (e.g., "10.0.0.5/32")
- Creates Ban record and AdminAction audit log

### UNBAN_USER (0x?? - Client → Server)

Remove user ban.

**Fields:**
- `user_id` (Optional): User ID to unban
- `nickname` (Optional): Nickname to unban

**Response:** `USER_UNBANNED` (success) or `ERROR` (no active ban, unauthorized)

**Notes:**
- Requires admin permission
- Deletes Ban record and creates AdminAction audit log

### UNBAN_IP (0x?? - Client → Server)

Remove IP ban.

**Fields:**
- `ip_cidr` (String): IP address or CIDR range to unban

**Response:** `IP_UNBANNED` (success) or `ERROR` (no active ban, unauthorized)

**Notes:**
- Requires admin permission
- Deletes Ban record and creates AdminAction audit log

### LIST_BANS (0x?? - Client → Server)

Get list of all active bans.

**Fields:**
- `include_expired` (Bool): If true, include expired bans (default: false)

**Response:** `BAN_LIST` with array of bans

**BAN_LIST Structure:**
```
[
  {
    "id": 1,
    "type": "user",
    "user_id": 123,
    "nickname": "spammer",
    "ip_cidr": null,
    "reason": "Spam",
    "shadowban": false,
    "banned_at": 1234567890,
    "banned_until": 1234657890,
    "banned_by": "alice"
  },
  {
    "id": 2,
    "type": "ip",
    "user_id": null,
    "nickname": null,
    "ip_cidr": "10.0.0.5/32",
    "reason": "Automated attack",
    "shadowban": false,
    "banned_at": 1234567890,
    "banned_until": null,
    "banned_by": "bob"
  }
]
```

### DELETE_USER (0x?? - Client → Server)

Permanently delete a user account.

**Fields:**
- `user_id` (Uint64): User ID to delete

**Response:** `USER_DELETED` (success) or `ERROR` (unauthorized, user not found)

**Notes:**
- Requires admin permission
- CASCADE deletes: Sessions, ChannelAccess, UserChannelState, SSHKeys
- SET NULL on: Message.author_user_id, Channel.created_by
- Messages remain but become "anonymous-like" (author_user_id = NULL)
- Creates AdminAction audit log

### LIST_USERS (0x?? - Client → Server) - ENHANCED

Enhanced version of existing command with admin-only flag.

**Fields (NEW):**
- `include_offline` (Bool): If true, list all registered users (admin-only, default: false)

**Response:** `USER_LIST` with array of users

**Behavior:**
- Non-admins: Always returns only online users (ignores `include_offline`)
- Admins: If `include_offline = true`, returns all registered users with last_seen timestamp

## Enhanced Command Handlers

### DELETE_MESSAGE - Admin Override

**Current behavior:**
- Users can only delete their own messages
- Check: `message.author_user_id == session.user_id`

**Enhanced behavior:**
```go
func (s *Server) handleDeleteMessage(session *Session, msg *DeleteMessageMessage) {
    message := s.db.GetMessage(msg.MessageID)

    isOwner := message.AuthorUserID != nil && session.UserID != nil &&
                *message.AuthorUserID == *session.UserID
    isAdmin := s.isAdmin(session)

    if !isOwner && !isAdmin {
        s.sendError(session, ErrorUnauthorized, "Cannot delete others' messages")
        return
    }

    // Soft-delete the message
    s.db.DeleteMessage(msg.MessageID)

    // Log admin action if not owner
    if !isOwner && isAdmin {
        s.logAdminAction(session, "delete_message", "message", message.ID,
            message.Content[:50], // Preview of deleted content
            map[string]interface{}{
                "channel_id": message.ChannelID,
                "original_author": message.AuthorNickname,
            })
    }

    s.sendSuccess(session, "Message deleted")
}
```

### DELETE_CHANNEL - Admin Override

**Current behavior:**
- Users can only delete channels they created
- Check: `channel.created_by == session.user_id`

**Enhanced behavior:**
```go
func (s *Server) handleDeleteChannel(session *Session, msg *DeleteChannelMessage) {
    channel := s.db.GetChannel(msg.ChannelID)

    isOwner := channel.CreatedBy != nil && session.UserID != nil &&
                *channel.CreatedBy == *session.UserID
    isAdmin := s.isAdmin(session)

    if !isOwner && !isAdmin {
        s.sendError(session, ErrorUnauthorized, "Cannot delete others' channels")
        return
    }

    // Delete the channel (CASCADE deletes messages, subchannels, access records)
    s.db.DeleteChannel(msg.ChannelID)

    // Log admin action if not owner
    if !isOwner && isAdmin {
        s.logAdminAction(session, "delete_channel", "channel", channel.ID,
            channel.Name, nil)
    }

    s.sendSuccess(session, "Channel deleted")
}
```

## Shadowban Implementation

### Message Broadcasting with Shadowban Filter

```go
func (s *Server) broadcastMessage(message *Message, channelID uint64) {
    // Check if author is shadowbanned
    isShadowbanned := false
    if message.AuthorUserID != nil {
        ban := s.db.GetActiveBan("user", *message.AuthorUserID, "")
        isShadowbanned = ban != nil && ban.Shadowban && !ban.IsExpired()
    }

    // Get all sessions subscribed to this channel
    subscribers := s.getChannelSubscribers(channelID)

    for _, subscriber := range subscribers {
        // Shadowban: only show message to the author themselves
        if isShadowbanned {
            if subscriber.UserID != nil && message.AuthorUserID != nil &&
               *subscriber.UserID == *message.AuthorUserID {
                s.sendFrame(subscriber, protocol.NewMessageFrame(message))
            }
            // Skip sending to everyone else
        } else {
            // Normal broadcast
            s.sendFrame(subscriber, protocol.NewMessageFrame(message))
        }
    }
}
```

## Client UI

### Admin Panel Modal (Press 'A' key)

Modal with tabs:
- **Bans** - List active bans, create new bans, lift bans
- **Users** - List all users (offline + online), delete users
- **Stats** - Server statistics (total users, messages, channels)

**Ban Tab:**
```
┌─────────────────── Admin Panel - Bans ────────────────────┐
│                                                            │
│  Active Bans (3):                                          │
│                                                            │
│  ▶ [User] spammer - Spam - Until: 2025-10-15 14:30       │
│    [IP] 10.0.0.5/32 - Automated attack - Permanent        │
│    [User] troll - Harassment (shadowban) - Permanent      │
│                                                            │
│  [B] Ban User  [I] Ban IP  [U] Unban  [Esc] Close        │
└────────────────────────────────────────────────────────────┘
```

**Ban User Dialog:**
```
┌─────────────────── Ban User ───────────────────┐
│                                                 │
│  Nickname: [spammer____________]                │
│  Reason: [Posting spam links____]               │
│  Duration: [●] 7 days  [ ] Permanent            │
│  Shadowban: [x] Yes  [ ] No                     │
│                                                 │
│  [Enter] Confirm  [Esc] Cancel                  │
└─────────────────────────────────────────────────┘
```

### Ban Error Message (When Banned User Tries to Connect)

```
┌──────────────── Connection Failed ─────────────────┐
│                                                     │
│  You have been banned from this server.            │
│                                                     │
│  Reason: Posting spam links                        │
│  Banned by: alice                                  │
│  Expires: 2025-10-15 14:30 (in 6 days)            │
│                                                     │
│  [Q] Quit                                          │
└─────────────────────────────────────────────────────┘
```

## Implementation Order

1. ✅ Design admin system and data model
2. [ ] Add `admin_users` to server config
3. [ ] Create database migration for Ban and AdminAction tables
4. [ ] Implement `isAdmin()` permission check
5. [ ] Add ban checking to authentication flow
6. [ ] Implement BAN_USER, BAN_IP, UNBAN_USER, UNBAN_IP protocol messages
7. [ ] Implement DELETE_USER protocol message
8. [ ] Implement LIST_BANS protocol message
9. [ ] Enhance DELETE_MESSAGE handler with admin override
10. [ ] Enhance DELETE_CHANNEL handler with admin override
11. [ ] Enhance LIST_USERS with `include_offline` flag
12. [ ] Implement shadowban message filtering
13. [ ] Create admin panel modal in client
14. [ ] Update PROTOCOL.md with new messages
15. [ ] Test admin functionality

## Future Enhancements

- Rate limits for admin actions (prevent accidental mass-bans)
- Ban templates (common reasons: "Spam", "Harassment", "Off-topic")
- Batch operations (ban multiple IPs at once)
- Admin roles (moderator vs full admin)
- Ban appeals system
- IP geolocation display in ban list
- Export admin audit log (CSV, JSON)
