# SuperChat Data Model Specification

## Overview

This document defines the data structures and relationships for SuperChat, a terminal-based threaded chat/forum application.

## Core Entities

### User

Users can be anonymous or registered. Registration is optional and can happen at any time.

```
User {
  id: integer (primary key)
  nickname: string (unique if registered, null if anonymous)
  registered: boolean
  password_hash: string (nullable, bcrypt)
  allow_unencrypted_dms: boolean (default: false)
  created_at: timestamp
  last_seen: timestamp
}
```

**Notes:**
- Anonymous users don't have a User record
- Registered users claim a nickname permanently
- `password_hash` is only set if user registers with password (vs SSH key)
- `allow_unencrypted_dms` indicates user's preference for DM encryption
  - `false` (default): User requires encryption for DMs (or will be prompted per-DM)
  - `true`: User allows all DMs to be unencrypted without prompting

### SSHKey

SSH keys provide automatic authentication for registered users. Also stores encryption keys for DM encryption.

```
SSHKey {
  id: integer (primary key)
  user_id: integer (foreign key -> User.id)
  fingerprint: string (unique, SHA256 fingerprint of public key)
  public_key: text (full SSH public key in OpenSSH format)
  key_type: enum ('ssh_rsa', 'ssh_ed25519', 'ssh_ecdsa', 'generated_rsa', 'ephemeral')
  can_encrypt: boolean (true for RSA keys, false for ed25519/ECDSA)
  encryption_public_key: text (nullable, RSA public key in PEM format for encryption)
  added_at: timestamp
}
```

**Notes:**
- When a user connects via SSH with an unregistered key, we auto-register their nickname
- Users can add multiple SSH keys to their account
- Fingerprint is used for quick lookups during authentication
- **Encryption key handling:**
  - **SSH RSA keys**: Can be used directly for encryption (`can_encrypt = true`, `encryption_public_key = null`)
  - **SSH ed25519/ECDSA keys**: Cannot encrypt, require companion RSA key (`can_encrypt = false`, `encryption_public_key` stores RSA-2048 public key)
  - **Password-only users**: Generate RSA-2048 keypair (`key_type = 'generated_rsa'`, `can_encrypt = true`)
  - **Anonymous users**: Generate ephemeral RSA-2048 keypair (`key_type = 'ephemeral'`, keys lost on disconnect)
- Private encryption keys are NEVER stored on server (client-side only in `~/.superchat/keys/`)
- Server only stores public keys for encrypting channel keys

### Session

Tracks active connections to the server.

```
Session {
  id: integer (primary key)
  user_id: integer (nullable, foreign key -> User.id, null for anonymous)
  nickname: string (current nickname for this session)
  connection_type: enum ('ssh', 'tcp')
  connected_at: timestamp
  last_activity: timestamp
}
```

**Notes:**
- Anonymous sessions have `user_id = null` but still have a nickname
- Anonymous users can post messages using their session nickname
- Multiple anonymous users can use the same nickname simultaneously (no enforcement)
- Used for presence counts and real-time message delivery
- Cleaned up on disconnect

### Channel

Top-level container for conversations. Can optionally contain subchannels.

```
Channel {
  id: integer (primary key)
  name: string (unique, e.g., "tech-community")
  display_name: string (e.g., "#tech-community")
  description: text (nullable)
  channel_type: enum ('chat', 'forum')
  message_retention_hours: integer (default: 168 = 7 days)
  created_by: integer (nullable, foreign key -> User.id)
  created_at: timestamp
  is_private: boolean (default: false, true for DM channels)
}
```

**Notes:**
- `name` is the canonical identifier (no # prefix)
- `display_name` includes formatting for UI (with # prefix)
- `is_private` marks DM channels (hidden from public channel list)
- `created_by` is the channel operator (admin)
- `channel_type` and `message_retention_hours` are used when channel has no subchannels
- If channel has subchannels, each subchannel's type and retention take precedence

### Subchannel

Optional organizational layer within a channel.

```
Subchannel {
  id: integer (primary key)
  channel_id: integer (foreign key -> Channel.id)
  name: string (e.g., "announcements")
  display_name: string (e.g., "/announcements")
  description: text (nullable)
  message_retention_hours: integer (default: 168 = 7 days)
  subchannel_type: enum ('chat', 'forum')
  created_at: timestamp
}
```

**Notes:**
- `name` is unique within a channel
- `message_retention_hours` determines how long messages are kept
  - Chat: 1 hour (configurable)
  - Forum: 168 hours / 7 days (configurable)
- Messages older than retention period are automatically purged
- Channels without subchannels have messages directly in the channel

### Message

Individual messages in a channel or subchannel. Can be threaded.

```
Message {
  id: integer (primary key)
  channel_id: integer (foreign key -> Channel.id)
  subchannel_id: integer (nullable, foreign key -> Subchannel.id)
  parent_id: integer (nullable, foreign key -> Message.id, for threading)
  author_user_id: integer (nullable, foreign key -> User.id)
  author_nickname: string (nickname at time of posting)
  content: text
  created_at: timestamp
  edited_at: timestamp (nullable)
  deleted_at: timestamp (nullable)
  thread_depth: integer (computed, 0-5+)
}
```

**Notes:**
- `parent_id = null` means this is a root message (thread starter)
- `parent_id != null` means this is a reply in a thread
- `thread_depth` indicates nesting level (0 = root, 1 = direct reply, etc.)
  - Calculated on INSERT: if parent_id is null, depth = 0; else depth = parent.thread_depth + 1
  - Simple lookup: `SELECT thread_depth FROM Message WHERE id = parent_id`, then add 1
  - Stored denormalized for display performance (avoid recursive queries)
  - Immutable once set (parent_id cannot be changed)
  - Max display depth: 5 (deeper messages stay at indent level 5)
- `author_user_id` is null for anonymous users (no User record exists)
- `author_user_id` is set for registered users (links to User record)
- `author_nickname` always preserves the nickname at time of posting
  - For registered users: shows their registered nickname
  - For anonymous users: shows whatever nickname they chose in their session
- Multiple messages can have the same `author_nickname` but different (or null) `author_user_id`
- UI should distinguish registered vs anonymous users (e.g., "bob" vs "bob*")
- If `subchannel_id` is null, message is directly in the channel

**Anonymous vs Registered Message Authors:**
```
author_user_id | author_nickname | Meaning
---------------|-----------------|------------------------------------------
123            | "alice"         | Registered user alice (verified identity)
NULL           | "bob"           | Anonymous user calling themselves bob
NULL           | "bob"           | Different anonymous user, also using bob
456            | "bob"           | Registered user bob (different from above)
```

**Soft Deletion:**
- `deleted_at` marks when a message was deleted
- **Server overwrites `content` field with `"[deleted]"` immediately** (no deleted content sent to clients)
- Original content is preserved in MessageVersion table for moderation
- Thread structure maintained (message record remains)
- Hard deletion only happens via retention policy (based on `created_at`), which removes entire Message record and all MessageVersion records

### MessageVersion

Stores edit and deletion history for moderation and accountability.

```
MessageVersion {
  id: integer (primary key)
  message_id: integer (foreign key -> Message.id)
  content: text (content at this version)
  author_nickname: string (nickname at time of this version)
  created_at: timestamp (when this version was created)
  version_type: enum ('created', 'edited', 'deleted')
}
```

**Notes:**
- Automatically created on POST_MESSAGE (`version_type = 'created'`)
- Created on EDIT_MESSAGE (`version_type = 'edited'`)
- Created on DELETE_MESSAGE (`version_type = 'deleted'`)
- When Message is hard-deleted (retention policy), all MessageVersion records CASCADE delete
- Prevents abuse where users edit offensive content before deleting
- Available for moderation review
- Not exposed to regular users via protocol (admin/moderation tool only)

### ChannelAccess

Controls access to private channels (primarily for DMs).

```
ChannelAccess {
  id: integer (primary key)
  channel_id: integer (foreign key -> Channel.id)
  user_id: integer (foreign key -> User.id)
  encryption_key: text (nullable, for E2E encrypted DMs)
  added_at: timestamp
}
```

**Notes:**
- Only used for private channels (DMs)
- `encryption_key` stores the channel's symmetric AES-256 key, encrypted with the user's RSA public key
- **Encryption approach:**
  - Each DM channel has a unique AES-256 symmetric key for encrypting messages
  - This symmetric key is encrypted with RSA-OAEP using each participant's public key
  - One ChannelAccess record per participant stores their encrypted copy of the channel key
  - Messages are encrypted with AES-256-GCM using the channel's symmetric key
  - For anonymous users with no persistent key: `encryption_key` is plaintext (session-only security)
- For public channels, this table is not used (implicit access for all)
- When a new participant is added, server re-encrypts channel key with their public key

### UserChannelState

Tracks per-user state for channels (last read position, etc.) - **server-side only for registered users**.

```
UserChannelState {
  id: integer (primary key)
  user_id: integer (foreign key -> User.id)
  channel_id: integer (foreign key -> Channel.id)
  subchannel_id: integer (nullable, foreign key -> Subchannel.id)
  last_read_at: timestamp
  last_read_message_id: integer (nullable, foreign key -> Message.id)
}
```

**Notes:**
- **Server-side state for registered users only**
- Used to calculate unread counts and sync read state across devices
- One record per user per subchannel (or per channel if no subchannels)
- State is periodically cleaned up for inactive users (e.g., no connection in 90 days)
- **Anonymous users**: Clients should implement local state tracking
  - Store `last_read_at` per channel/subchannel in client-side database
  - Persists across reconnections from the same client (even with different nicknames)
  - Not synced to server, not shared across devices
  - Provides good UX on regular device while incentivizing registration for multi-device sync

## Relationships

### User Relationships
- User → SSHKey: one-to-many
- User → Session: one-to-many (can be connected from multiple devices)
- User → Channel: one-to-many (channels created by user)
- User → ChannelAccess: one-to-many (private channels user can access)
- User → UserChannelState: one-to-many (read state per channel/subchannel)

### Channel Relationships
- Channel → Subchannel: one-to-many (optional)
- Channel → Message: one-to-many
- Channel → ChannelAccess: one-to-many (for private channels)

### Subchannel Relationships
- Subchannel → Message: one-to-many

### Message Relationships
- Message → Message: one-to-many (parent → replies, recursive)

## Threading Model

Messages form a tree structure:

```
Message (id: 1, parent_id: null, depth: 0)  [root]
├─ Message (id: 2, parent_id: 1, depth: 1)
│  ├─ Message (id: 3, parent_id: 2, depth: 2)
│  │  └─ Message (id: 4, parent_id: 3, depth: 3)
│  │     └─ Message (id: 5, parent_id: 4, depth: 4)
│  │        └─ Message (id: 6, parent_id: 5, depth: 5)
│  │           └─ Message (id: 7, parent_id: 6, depth: 6) [displays at depth 5]
│  └─ Message (id: 8, parent_id: 2, depth: 2)
└─ Message (id: 9, parent_id: 1, depth: 1)
```

**Display Rules:**
- Depth 0-5: Indent proportionally
- Depth 6+: Display at depth 5 indent level
- Show actual depth number in UI for clarity

## Data Lifecycle

### Message Retention
- Messages are automatically hard-deleted based on `Subchannel.message_retention_hours` (or `Channel.message_retention_hours` if no subchannel)
- Retention policy runs periodically (e.g., hourly cron job)
- **Thread-aware deletion policy:**
  - A message is eligible for deletion when `created_at < (now - retention_hours)`
  - **Root messages:** Only deleted when ALL descendants are also eligible for deletion
  - **Reply messages:** Deleted when eligible, regardless of siblings
  - This preserves thread structure: recent replies keep the entire thread alive
  - When a root is deleted, all descendants are CASCADE deleted (entire thread removed atomically)
- **Example:**
  ```
  Root message (8 days old, retention: 7 days) -> eligible
  ├─ Reply (7 days old) -> eligible
  └─ Reply (1 day old) -> NOT eligible

  Result: Root is NOT deleted because it has a non-eligible child
  The entire thread is retained until all messages exceed retention period
  ```
- Hard deletion removes Message record and all associated MessageVersion records (CASCADE)

### Session Cleanup
- Sessions are deleted when connection closes (socket dies)
- **Timeout:** Sessions with no activity for 60 seconds are automatically disconnected
  - Activity = any message received from client (PING, POST_MESSAGE, etc.)
  - Server updates `Session.last_activity` on every message
  - Clients send PING every 30 seconds during idle periods to keep session alive
- Cleanup job runs periodically (e.g., every 30 seconds) to disconnect stale sessions

### UserChannelState Cleanup
- State for inactive registered users is purged periodically (e.g., no connection in 90 days)
- Reduces database size for users who have abandoned the server
- Configurable retention period per server

### Anonymous User Lifecycle
- Anonymous users can connect, choose a nickname, and post messages
- No User record is created for anonymous users
- Anonymous sessions have no persistent state across disconnects
- Messages posted by anonymous users remain (with `author_user_id = null`)
- Anonymous users provide incentive to register (verified identity, persistent nickname)

## Indexes

Performance-critical indexes:

```sql
-- Fast user lookups and prevents duplicate registrations
-- This index serves as the locking mechanism for SSH auto-registration:
-- If two users try to register the same nickname simultaneously,
-- the second INSERT will fail with a constraint violation
CREATE UNIQUE INDEX idx_users_nickname ON User(nickname) WHERE registered = true;

-- Fast SSH key authentication
CREATE UNIQUE INDEX idx_sshkeys_fingerprint ON SSHKey(fingerprint);

-- Fast message retrieval
CREATE INDEX idx_messages_channel_subchannel ON Message(channel_id, subchannel_id, created_at DESC);
CREATE INDEX idx_messages_parent ON Message(parent_id) WHERE parent_id IS NOT NULL;

-- Fast retention cleanup queries (find messages older than retention period)
CREATE INDEX idx_messages_retention ON Message(created_at, parent_id);

-- Fast channel access checks
CREATE INDEX idx_channel_access_user ON ChannelAccess(user_id, channel_id);

-- Fast unread state lookups
CREATE UNIQUE INDEX idx_user_channel_state ON UserChannelState(user_id, channel_id, subchannel_id);

-- Fast message version lookups for moderation
CREATE INDEX idx_message_version_message ON MessageVersion(message_id, created_at DESC);
```

## Transaction Boundaries

Multi-table operations MUST be wrapped in transactions to maintain data integrity:

### User Registration (Password or SSH)
```sql
BEGIN TRANSACTION;
  INSERT INTO User (nickname, registered, password_hash, ...) VALUES (...);
  INSERT INTO SSHKey (user_id, fingerprint, public_key, ...) VALUES (...);  -- if SSH
COMMIT;
```
- On constraint violation (duplicate nickname), ROLLBACK occurs automatically
- Ensures User and SSHKey are created atomically

### Channel Creation (Private/DM)
```sql
BEGIN TRANSACTION;
  INSERT INTO Channel (name, is_private, ...) VALUES (...);
  INSERT INTO ChannelAccess (channel_id, user_id, ...) VALUES (...);  -- for each participant
COMMIT;
```
- Ensures private channels always have access records
- Prevents orphaned channels

### DM Setup with Encryption
```sql
BEGIN TRANSACTION;
  INSERT INTO Channel (name, is_private, ...) VALUES (...);
  INSERT INTO ChannelAccess (channel_id, user_id, encryption_key, ...) VALUES (...);  -- participant 1
  INSERT INTO ChannelAccess (channel_id, user_id, encryption_key, ...) VALUES (...);  -- participant 2
COMMIT;
```
- Ensures all participants have encrypted channel keys
- Atomic DM creation

### Message Posting with Version History
```sql
BEGIN TRANSACTION;
  INSERT INTO Message (channel_id, content, author_nickname, ...) VALUES (...);
  INSERT INTO MessageVersion (message_id, content, version_type, ...) VALUES (..., 'created');
COMMIT;
```
- Ensures message and initial version are created together

### Message Editing with Version History
```sql
BEGIN TRANSACTION;
  UPDATE Message SET content = ?, edited_at = ? WHERE id = ?;
  INSERT INTO MessageVersion (message_id, content, version_type, ...) VALUES (..., 'edited');
COMMIT;
```
- Preserves edit history atomically

### Message Deletion (Soft)
```sql
BEGIN TRANSACTION;
  -- First, save original content to MessageVersion
  INSERT INTO MessageVersion (message_id, content, version_type, ...)
    SELECT id, content, 'deleted', ... FROM Message WHERE id = ?;

  -- Then overwrite the message content (server never sends deleted content to clients)
  UPDATE Message SET deleted_at = ?, content = '[deleted]' WHERE id = ?;
COMMIT;
```
- Saves original content to MessageVersion first (for moderation)
- Overwrites Message.content with '[deleted]' (server never sends deleted content to clients)
- Maintains thread structure (message record remains with deleted_at timestamp)

## Foreign Key Cascade Behavior

```sql
-- User deletion: preserve anonymous-like messages
User.id -> Message.author_user_id: SET NULL

-- User deletion: preserve channels they created
User.id -> Channel.created_by: SET NULL

-- User deletion: clean up sessions
User.id -> Session.user_id: CASCADE DELETE

-- User deletion: remove their channel access
User.id -> ChannelAccess.user_id: CASCADE DELETE

-- Channel deletion: remove all subchannels
Channel.id -> Subchannel.channel_id: CASCADE DELETE

-- Channel deletion: remove all messages
Channel.id -> Message.channel_id: CASCADE DELETE

-- Channel deletion: remove access records
Channel.id -> ChannelAccess.channel_id: CASCADE DELETE

-- Message deletion: cascade to children (preserves thread structure via deleted_at soft-delete)
Message.id -> Message.parent_id: CASCADE DELETE

-- Message deletion: remove version history
Message.id -> MessageVersion.message_id: CASCADE DELETE
```

**Important:** Message soft-deletion (setting `deleted_at`) is the normal user-facing delete operation.
Hard deletion (CASCADE DELETE) only occurs during retention policy cleanup, which removes the entire
Message record and all associated MessageVersion records.

## Notes on Implementation

- Use SQLite for embedded database
- Store database in `~/.config/superchat/superchat.db` by default
- Allow custom path via config file
- Use foreign key constraints for referential integrity
- Use transactions for all multi-table operations (see Transaction Boundaries above)
- Consider VACUUM periodically after message deletion

### Schema Migrations

- Use a Go migration library for SQLite (e.g., `golang-migrate/migrate`, `pressly/goose`, or `rubenv/sql-migrate`)
- Store migration files in `server/migrations/` directory
- Track current schema version in database (migrations table)
- Run migrations automatically on server startup
- Support both up and down migrations for rollback capability
- Example migration naming: `001_initial_schema.sql`, `002_add_message_version.sql`, etc.
