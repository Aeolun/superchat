# SuperChat Binary Protocol Specification

## Overview

This document defines the binary protocol used for communication between SuperChat clients and servers. The protocol is designed to be lightweight, efficient, and easy to implement.

## Connection Types

SuperChat supports two connection methods:

1. **SSH Connection**: Automatic authentication via SSH key
2. **TCP Connection**: Direct TCP socket with manual authentication

Both use the same binary protocol after connection is established.

## Frame Format

All messages use a simple frame-based format:

```
+-------------------+-------------------+------------------+------------------+------------------------+
| Length (4 bytes)  | Version (1 byte)  | Type (1 byte)    | Flags (1 byte)   | Payload (N bytes)      |
+-------------------+-------------------+------------------+------------------+------------------------+
| uint32 big-endian | uint8             | uint8            | uint8            | variable length        |
+-------------------+-------------------+------------------+------------------+------------------------+
```

- **Length**: Total size of Version + Type + Flags + Payload (excludes the length field itself)
- **Version**: Protocol version (current version: 1)
- **Type**: Message type identifier (see Message Types below)
- **Flags**: Bit flags for compression, encryption, and future extensions
- **Payload**: Message-specific data

**Protocol Version:**
- Current protocol version is **1**
- Server sends its protocol version in SERVER_CONFIG (first field)
- Both client and server must validate version on every message

**Versioning Philosophy:**
- Protocol versions aim to be **backwards compatible via extension**, not modification
- New versions add new message types and fields, but don't change existing ones
- **Forward compatibility:** Newer clients should work with older servers
  - Client can detect server version from SERVER_CONFIG
  - Client gracefully degrades features not supported by older server
  - Client doesn't send message types the server doesn't understand
- **Backward compatibility:** Older clients may work with newer servers
  - Server can detect client version from frame headers
  - Unknown message types should be ignored or return ERROR 1001 (unsupported version)
- If a breaking change is absolutely necessary, increment major version and treat as new protocol
- Goal: Avoid forcing synchronized upgrades of all clients and servers

**Flags Byte (bits):**
- Bit 0 (rightmost): Compression (0 = uncompressed, 1 = LZ4 compressed)
- Bit 1: Encryption (0 = plaintext, 1 = encrypted payload)
- Bits 2-7: Reserved for future use (must be 0)

**Examples:**
- `0x00` = No compression, no encryption
- `0x01` = Compressed, not encrypted
- `0x02` = Not compressed, encrypted
- `0x03` = Compressed and encrypted

**Max Frame Size**: 1 MB (1,048,576 bytes) to prevent DoS attacks

**Compression:**
- Applied to the entire payload after the Flags byte
- Uses **LZ4 block format** (much faster than gzip for real-time messaging)
- Structure: `[Uncompressed Size (u32)][LZ4 Compressed Data]`
- Recommended for payloads larger than 512 bytes
- Decompress before parsing payload structure
- LZ4 chosen for low latency and minimal CPU overhead

**Encryption:**
- Applied to the entire payload after optional compression
- Used for private/DM channels with end-to-end encryption
- Encryption details covered in DM section below

## Data Types

### Primitive Types

- `uint8`: 1-byte unsigned integer
- `uint16`: 2-byte unsigned integer (big-endian)
- `uint32`: 4-byte unsigned integer (big-endian)
- `uint64`: 8-byte unsigned integer (big-endian)
- `int64`: 8-byte signed integer (big-endian)
- `bool`: 1-byte (0x00 = false, 0x01 = true)

### Composite Types

**String** (length-prefixed UTF-8):
```
+-------------------+------------------------+
| Length (uint16)   | Data (N bytes UTF-8)   |
+-------------------+------------------------+
```

**Timestamp** (Unix epoch in milliseconds):
```
+-------------------+
| int64             |
+-------------------+
```
- Always represents **server time** (not client time)
- Server sets all timestamps (`created_at`, `edited_at`, `deleted_at`, etc.)
- Clients should never send timestamps (except PING for RTT calculation)
- This eliminates clock skew issues between clients and ensures consistent message ordering

**Optional Field** (nullable):
```
+-------------------+------------------------+
| Present (bool)    | Value (if present)     |
+-------------------+------------------------+
```
- Uses full byte (bool) for presence flag instead of bit-packing
- **Tradeoff**: Wastes 7 bits per optional field, but much simpler to encode/decode
- Byte-aligned fields are faster to parse and easier to implement correctly
- For a chat protocol, the bandwidth savings from bit-packing are negligible
- Simplicity and implementation speed prioritized over micro-optimization

**Compressed Payload** (when Flags bit 0 is set):
```
+---------------------------+---------------------------+
| Uncompressed Size (u32)   | LZ4 Compressed Data       |
+---------------------------+---------------------------+
```
- `Uncompressed Size`: Size of data after decompression (for buffer allocation)
- `LZ4 Compressed Data`: Payload compressed using LZ4 block format
- After decompression, parse as normal payload structure based on message type

## Message Types

### Client → Server Messages

| Type | Name | Description |
|------|------|-------------|
| 0x01 | AUTH_REQUEST | Authenticate with password |
| 0x02 | SET_NICKNAME | Set/change nickname |
| 0x03 | REGISTER_USER | Register current nickname |
| 0x04 | LIST_CHANNELS | Request channel list |
| 0x05 | JOIN_CHANNEL | Join a channel/subchannel |
| 0x06 | LEAVE_CHANNEL | Leave a channel/subchannel |
| 0x07 | CREATE_CHANNEL | Create new channel |
| 0x08 | CREATE_SUBCHANNEL | Create new subchannel |
| 0x09 | LIST_MESSAGES | Request messages (with filters) |
| 0x0A | POST_MESSAGE | Post a new message |
| 0x0B | EDIT_MESSAGE | Edit an existing message |
| 0x0C | DELETE_MESSAGE | Delete a message (soft-delete) |
| 0x0D | UPDATE_READ_STATE | Update last read position |
| 0x0E | GET_UNREAD_COUNTS | Request unread counts for specific channels |
| 0x0F | GET_USER_INFO | Get info about a user |
| 0x10 | PING | Keepalive ping |
| 0x11 | DISCONNECT | Graceful disconnect notification |
| 0x12 | START_DM | Initiate a direct message conversation |
| 0x13 | PROVIDE_PUBLIC_KEY | Upload public key for encryption |
| 0x14 | ALLOW_UNENCRYPTED | Explicitly allow unencrypted DMs |
| 0x15 | GET_SUBCHANNELS | Request subchannels for a channel |
| 0x51 | SUBSCRIBE_THREAD | Subscribe to thread updates |
| 0x52 | UNSUBSCRIBE_THREAD | Unsubscribe from thread updates |
| 0x53 | SUBSCRIBE_CHANNEL | Subscribe to new threads in channel |
| 0x54 | UNSUBSCRIBE_CHANNEL | Unsubscribe from channel updates |

### Server → Client Messages

| Type | Name | Description |
|------|------|-------------|
| 0x81 | AUTH_RESPONSE | Authentication result |
| 0x82 | NICKNAME_RESPONSE | Nickname change result |
| 0x83 | REGISTER_RESPONSE | Registration result |
| 0x84 | CHANNEL_LIST | List of channels |
| 0x85 | JOIN_RESPONSE | Join result with channel data |
| 0x86 | LEAVE_RESPONSE | Leave confirmation |
| 0x87 | CHANNEL_CREATED | Channel creation result |
| 0x88 | SUBCHANNEL_CREATED | Subchannel creation result |
| 0x89 | MESSAGE_LIST | List of messages |
| 0x8A | MESSAGE_POSTED | Message post confirmation |
| 0x8B | MESSAGE_EDITED | Edit confirmation |
| 0x8C | MESSAGE_DELETED | Delete confirmation |
| 0x8D | NEW_MESSAGE | Real-time message notification |
| 0x8E | UNREAD_COUNTS | Unread message counts response |
| 0x8F | USER_INFO | User information response |
| 0x90 | PONG | Ping response |
| 0x91 | ERROR | Error response |
| 0x92 | SERVER_STATS | Server statistics (user counts, etc.) |
| 0x93 | KEY_REQUIRED | Server needs encryption key before proceeding |
| 0x94 | DM_READY | DM channel is ready to use |
| 0x95 | DM_PENDING | Waiting for other party to complete key setup |
| 0x96 | DM_REQUEST | Incoming DM request from another user |
| 0x97 | SUBCHANNEL_LIST | List of subchannels for a channel |
| 0x98 | SERVER_CONFIG | Server configuration and limits (sent on connect) |
| 0x99 | SUBSCRIBE_OK | Subscription confirmation |

## Message Payloads

### 0x01 - AUTH_REQUEST (Client → Server)

Used when connecting to use a registered nickname.

```
+-------------------+-------------------+
| nickname (String) | password (String) |
+-------------------+-------------------+
```

### 0x81 - AUTH_RESPONSE (Server → Client)

```
+-------------------+-------------------+----------------------+
| success (bool)    | user_id (uint64)  | message (String)     |
|                   | (only if success) | (error if failed)    |
+-------------------+-------------------+----------------------+
```

If success:
- `user_id`: The registered user's ID
- `message`: Welcome message or empty

If failed:
- `user_id`: Omitted
- `message`: Error description

### 0x02 - SET_NICKNAME (Client → Server)

```
+--------------------+
| nickname (String)  |
+--------------------+
```

### 0x82 - NICKNAME_RESPONSE (Server → Client)

```
+-------------------+-------------------+
| success (bool)    | message (String)  |
+-------------------+-------------------+
```

- If nickname is registered and client is not authenticated: `success = false`, `message = "Nickname registered, password required"`
- If nickname is available: `success = true`
- If nickname is invalid: `success = false`, `message = "Invalid nickname"`

### 0x03 - REGISTER_USER (Client → Server)

Register current nickname with a password.

```
+-------------------+
| password (String) |
+-------------------+
```

### 0x83 - REGISTER_RESPONSE (Server → Client)

```
+-------------------+-------------------+
| success (bool)    | user_id (uint64)  |
|                   | (only if success) |
+-------------------+-------------------+
```

### 0x04 - LIST_CHANNELS (Client → Server)

Request list of channels (without subchannels).

```
+------------------------+-------------------+
| from_channel_id (u64)  | limit (u16)       |
+------------------------+-------------------+
```

**Notes:**
- `from_channel_id`: Start listing from this channel ID (exclusive). Use 0 to start from beginning.
- `limit`: Maximum number of channels to return (default/max: 1000)
- Channels returned in ascending ID order
- Client can stop reading response early if it has enough channels
- For servers with many channels, client can request in batches

### 0x84 - CHANNEL_LIST (Server → Client)

```
+----------------------+----------------+
| channel_count (u16)  | channels []    |
+----------------------+----------------+

Each channel:
+-------------------+----------------------+------------------------+------------------------+
| channel_id (u64)  | name (String)        | description (String)   | user_count (u32)       |
+-------------------+----------------------+------------------------+------------------------+
| is_operator (bool)| type (u8)            | retention_hours(u32)   | has_subchannels (bool) |
+-------------------+----------------------+------------------------+------------------------+
| subchannel_count(u16) |
+----------------------+
```

**Notes:**
- Returns public channels (private channels excluded)
- Channels returned in ascending ID order
- `has_subchannels`: true if channel has subchannels defined
- `subchannel_count`: number of subchannels (0 if none)
- To get subchannels, use GET_SUBCHANNELS request
- If `channel_count < limit`, there are no more channels to fetch

### 0x15 - GET_SUBCHANNELS (Client → Server)

Request subchannels for a specific channel.

```
+-------------------+
| channel_id (u64)  |
+-------------------+
```

### 0x97 - SUBCHANNEL_LIST (Server → Client)

```
+-------------------+----------------------+----------------+
| channel_id (u64)  | subchannel_count(u16)| subchannels [] |
+-------------------+----------------------+----------------+

Each subchannel:
+----------------------+-------------------+------------------------+------------------------+
| subchannel_id (u64)  | name (String)     | description (String)   | type (u8)              |
+----------------------+-------------------+------------------------+------------------------+
| retention_hours(u32) |
+----------------------+
```

**Notes:**
- Response includes `channel_id` so client knows which channel these subchannels belong to
- Allows concurrent requests for multiple channels' subchannels

**Type (both channel and subchannel):**
- 0x00 = chat
- 0x01 = forum

**Type Semantics:**
- `type` is a UI hint for how clients should present the channel
- **Chat (0x00)**: Intended for real-time conversation
  - Client UI may emphasize chronological message flow
  - Threading is still supported by protocol, but may be de-emphasized in UI
  - Typically paired with short retention (but not required)
- **Forum (0x01)**: Intended for threaded discussions
  - Client UI should emphasize thread structure and navigation
  - Threading is expected and encouraged
  - Typically paired with longer retention (but not required)

**Important:** All clients MUST support displaying threaded messages regardless of channel type, since the protocol allows threading in both. The type only suggests the primary UI presentation style.

**Notes:**
- `type` and `retention_hours` on channel apply when channel has no subchannels
- If channel has subchannels, each subchannel has its own `type` and `retention_hours`
- `type` and `retention_hours` are independent - any combination is valid
- Unread counts are NOT included in channel list (use GET_UNREAD_COUNTS instead)

### 0x05 - JOIN_CHANNEL (Client → Server)

```
+-------------------+-----------------------------+
| channel_id (u64)  | subchannel_id (Optional u64)|
+-------------------+-----------------------------+
```

If `subchannel_id` is not present, join the channel at the root level (for channels without subchannels).

### 0x85 - JOIN_RESPONSE (Server → Client)

```
+-------------------+-------------------+----------------------+
| success (bool)    | channel_id (u64)  | subchannel_id        |
|                   |                   | (Optional u64)       |
+-------------------+-------------------+----------------------+
| message (String)  |
+-------------------+
```

If failed, `message` contains error description.

### 0x09 - LIST_MESSAGES (Client → Server)

Request messages from a channel/subchannel.

```
+-------------------+-----------------------------+------------------------+
| channel_id (u64)  | subchannel_id (Optional u64)| limit (u16)            |
+-------------------+-----------------------------+------------------------+
| before_id (Optional u64)  | parent_id (Optional u64) |
+-------------------------------+-------------------------+
```

**Parameters:**
- `limit`: Max messages to return (default: 50, max: 200)
- `before_id`: Return messages older than this message ID (for pagination)
- `parent_id`: If set, only return replies to this message (thread view)

**Behavior:**
- **Without `parent_id`**: Returns root messages only (thread starters, where `parent_id = null`)
  - Sorted by `created_at` descending (newest first)
  - Each message includes `reply_count` to show thread size
  - Use for displaying thread list in channel/subchannel

- **With `parent_id`**: Returns all replies under that parent message
  - Does NOT include the parent message itself (client already has it)
  - Returns the full thread tree (all descendants)
  - Sorted by thread position (depth-first traversal for proper nesting)
  - Use for displaying a single thread's conversation

**Pagination:**
- Without `before_id`: Returns most recent messages
- With `before_id`: Returns messages older than specified ID
- Allows scrolling backwards through message history

### 0x89 - MESSAGE_LIST (Server → Client)

```
+----------------------+-----------------------------+-------------------+
| channel_id (u64)     | subchannel_id (Optional u64)| parent_id         |
|                      |                             | (Optional u64)    |
+----------------------+-----------------------------+-------------------+
| message_count (u16)  | messages []                 |
+----------------------+-----------------------------+

Each message:
+-------------------+-----------------------------+-------------------+
| message_id (u64)  | channel_id (u64)            | subchannel_id     |
|                   |                             | (Optional u64)    |
+-------------------+-----------------------------+-------------------+
| parent_id (Optional u64) | author_user_id (Optional u64) |
+------------------------------+--------------------------------+
| author_nickname (String)     | content (String)               |
+------------------------------+--------------------------------+
| created_at (Timestamp) | edited_at (Optional Timestamp) |
+------------------------+--------------------------------+
| thread_depth (u8)      | reply_count (u32)              |
+------------------------+--------------------------------+
```

**Notes:**
- Response includes the request context (`channel_id`, `subchannel_id`, `parent_id`) so clients can match responses to requests
- `author_user_id` is null for anonymous users
- `thread_depth`: 0 = root, 1+ = nested
- `reply_count`: Total number of replies (all descendants)

### 0x0A - POST_MESSAGE (Client → Server)

```
+-------------------+-----------------------------+-------------------+
| channel_id (u64)  | subchannel_id (Optional u64)| parent_id         |
|                   |                             | (Optional u64)    |
+-------------------+-----------------------------+-------------------+
| content (String)  |
+-------------------+
```

If `parent_id` is set, this is a reply. Otherwise, it's a root message.

### 0x8A - MESSAGE_POSTED (Server → Client)

Confirmation that message was posted.

```
+-------------------+-------------------+
| success (bool)    | message_id (u64)  |
|                   | (only if success) |
+-------------------+-------------------+
| message (String)  |
+-------------------+
```

If failed, `message` contains error description.

### 0x8D - NEW_MESSAGE (Server → Client)

Real-time notification of a new message (pushed to all users in the channel).

Uses the same format as a single message in MESSAGE_LIST:

```
+-------------------+-----------------------------+-------------------+
| message_id (u64)  | channel_id (u64)            | subchannel_id     |
|                   |                             | (Optional u64)    |
+-------------------+-----------------------------+-------------------+
| parent_id (Optional u64) | author_user_id (Optional u64) |
+------------------------------+--------------------------------+
| author_nickname (String)     | content (String)               |
+------------------------------+--------------------------------+
| created_at (Timestamp) | edited_at (Optional Timestamp) |
+------------------------+--------------------------------+
| thread_depth (u8)      | reply_count (u32)              |
+------------------------+--------------------------------+
```

### 0x0B - EDIT_MESSAGE (Client → Server)

```
+-------------------+-------------------+
| message_id (u64)  | content (String)  |
+-------------------+-------------------+
```

Only the original author can edit a message.

### 0x8B - MESSAGE_EDITED (Server → Client)

Confirmation of edit + real-time notification to all users.

```
+-------------------+-------------------+------------------------+
| success (bool)    | message_id (u64)  | edited_at (Timestamp)  |
|                   |                   | (only if success)      |
+-------------------+-------------------+------------------------+
| new_content (String) | message (String)                        |
| (only if success)    | (error if failed)                       |
+----------------------+------------------------------------------+
```

### 0x0C - DELETE_MESSAGE (Client → Server)

```
+-------------------+
| message_id (u64)  |
+-------------------+
```

Only the original author can delete a message. This performs a soft-delete (sets `deleted_at`),
preserving thread structure. Original content is saved in MessageVersion for moderation.

### 0x8C - MESSAGE_DELETED (Server → Client)

Confirmation of deletion + real-time notification to all users.

```
+-------------------+-------------------+------------------------+
| success (bool)    | message_id (u64)  | deleted_at (Timestamp) |
|                   |                   | (only if success)      |
+-------------------+-------------------+------------------------+
| message (String) (error if failed)                            |
+---------------------------------------------------------------+
```

### 0x0D - UPDATE_READ_STATE (Client → Server)

Update last read position (registered users only).

```
+-------------------+-----------------------------+-------------------+
| channel_id (u64)  | subchannel_id (Optional u64)| message_id (u64)  |
+-------------------+-----------------------------+-------------------+
| timestamp (Timestamp)                                              |
+--------------------------------------------------------------------+
```

**Recommended client behavior:**
- **On channel/subchannel leave**: Update to the newest message that was displayed
  - Typically only if `message_id > current last_read_message_id` (don't move backwards)
  - Skip if user has already manually marked ahead

- **On manual "mark as read" action**: User presses shortcut to mark up to current position
  - Allows clearing unreads without reading everything
  - Or marking older position as read for custom workflows

**Server behavior:**
- Stores in `UserChannelState` table
- Accepts any `message_id` value (allows moving backwards for custom client logic)
- Simply updates the stored position

**Anonymous users:**
- Handle this locally in client-side database
- Same flexibility applies

### 0x0E - GET_UNREAD_COUNTS (Client → Server)

Request unread counts for specific channels/subchannels (registered users only).

```
+----------------------+----------------+
| target_count (u16)   | targets []     |
+----------------------+----------------+

Each target:
+-------------------+-----------------------------+
| channel_id (u64)  | subchannel_id (Optional u64)|
+-------------------+-----------------------------+
```

Client specifies which channels/subchannels they want unread counts for. Server responds with UNREAD_COUNTS.

**Performance Note:**
- Clients should request counts for one channel at a time (or small batches)
- Server query: `SELECT COUNT(*) FROM Message WHERE channel_id = ? AND subchannel_id = ? AND created_at > last_read_at`
- Uses indexed lookup on `(channel_id, subchannel_id, created_at)` - very fast
- Avoids expensive full-table scans

### 0x8E - UNREAD_COUNTS (Server → Client)

Response with unread message counts (registered users only).

```
+----------------------+----------------+
| count_count (u16)    | counts []      |
+----------------------+----------------+

Each count entry:
+-------------------+-----------------------------+----------------------+
| channel_id (u64)  | subchannel_id (Optional u64)| unread_count (u32)   |
+-------------------+-----------------------------+----------------------+
```

**Notes:**
- Only sent to registered users (anonymous users track locally)
- `unread_count` is calculated from `UserChannelState.last_read_at`
- If user has never read a channel, count is total messages in that channel

### 0x07 - CREATE_CHANNEL (Client → Server)

```
+-------------------+------------------------+------------+------------------------+
| name (String)     | description (String)   | type (u8)  | retention_hours (u32)  |
+-------------------+------------------------+------------+------------------------+
```

**Type:**
- 0x00 = chat
- 0x01 = forum

**Notes:**
- `type` and `retention_hours` are used when channel has no subchannels
- If subchannels are added later, their individual type and retention_hours take precedence

### 0x87 - CHANNEL_CREATED (Server → Client)

Response to CREATE_CHANNEL request + broadcast to all connected clients.

```
+-------------------+-------------------+------------------------+
| success (bool)    | channel_id (u64)  | name (String)          |
|                   | (only if success) | (only if success)      |
+-------------------+-------------------+------------------------+
| description (String) | type (u8)      | retention_hours (u32)  |
| (only if success)    | (success only) | (only if success)      |
+-------------------------+----------------+------------------------+
| message (String)  |
+-------------------+
```

**Broadcast behavior:**
- Sent to the creating client as confirmation
- Also broadcast to ALL other connected clients as a real-time notification
- Clients should add the new channel to their channel list
- If `success = false`, only sent to requesting client (not broadcast)

### 0x08 - CREATE_SUBCHANNEL (Client → Server)

```
+-------------------+-------------------+------------------------+
| channel_id (u64)  | name (String)     | description (String)   |
+-------------------+-------------------+------------------------+
| type (u8)         | retention_hours (u32)                      |
+-------------------+------------------------------------------------+
```

**Type:**
- 0x00 = chat
- 0x01 = forum

### 0x88 - SUBCHANNEL_CREATED (Server → Client)

Response to CREATE_SUBCHANNEL request + broadcast to all connected clients.

```
+-------------------+----------------------+-------------------+
| success (bool)    | channel_id (u64)     | subchannel_id(u64)|
|                   | (only if success)    | (only if success) |
+-------------------+----------------------+-------------------+
| name (String)     | description (String) | type (u8)         |
| (only if success) | (only if success)    | (success only)    |
+-------------------+----------------------+-------------------+
| retention_hours (u32) | message (String)                   |
| (only if success)     |                                    |
+-----------------------+------------------------------------+
```

**Broadcast behavior:**
- Sent to the creating client as confirmation
- Also broadcast to ALL other connected clients as a real-time notification
- Clients should add the new subchannel to the appropriate channel in their list
- `channel_id` indicates which channel this subchannel belongs to
- If `success = false`, only sent to requesting client (not broadcast)

### 0x11 - GET_SERVER_STATS (Client → Server)

Request current server statistics.

No payload (empty).

### 0x12 - START_DM (Client → Server)

Initiate a direct message conversation with another user.

```
+-------------------+---------------------------+-------------------------+
| target_type (u8)  | target_id (varies)        | allow_unencrypted(bool) |
+-------------------+---------------------------+-------------------------+
```

**Target Types:**
- 0x00 = by user_id (target_id is u64 user_id, registered users only)
- 0x01 = by nickname (target_id is String, could be registered or anonymous)
- 0x02 = by session_id (target_id is u64 session_id, for anonymous users)

**allow_unencrypted:**
- If true, initiator is willing to accept unencrypted DMs
- If false, DM must be encrypted or will fail

**Notes:**
- If targeting by nickname and multiple users/sessions have that nickname, server picks first match (prefer registered users)
- For anonymous users, targeting by session_id is more reliable

### 0x13 - PROVIDE_PUBLIC_KEY (Client → Server)

Upload an RSA public key for DM encryption.

```
+-------------------+------------------------+-------------------------+
| key_type (u8)     | public_key (String)    | label (String)          |
+-------------------+------------------------+-------------------------+
```

**Key Types:**
- 0x00 = Companion RSA key (for ed25519/ECDSA SSH users)
- 0x01 = Generated RSA key (for password-only users)
- 0x02 = Ephemeral RSA key (for anonymous users, session-only)

**public_key:**
- RSA public key in PEM format (2048-bit or 4096-bit)
- Used for encrypting DM channel keys via RSA-OAEP

**label:**
- Optional human-readable label (e.g., "laptop", "phone", "work")
- Helps users manage multiple keys

**Notes:**
- Key is stored in `SSHKey.encryption_public_key` field
- For ed25519/ECDSA users: stored alongside SSH key as companion
- For password-only users: stored as primary encryption key
- For anonymous users: stored temporarily (deleted on disconnect)
- Server never receives or stores private keys
- Client stores private key in `~/.superchat/keys/`

### 0x14 - ALLOW_UNENCRYPTED (Client → Server)

Explicitly allow unencrypted DMs for the current user.

```
+------------------------+-------------------+
| dm_channel_id (u64)    | permanent (bool)  |
+------------------------+-------------------+
```

**dm_channel_id:**
- The ID of the DM channel this response applies to
- Provided in the DM_REQUEST or KEY_REQUIRED message
- Ensures response is matched to the correct DM request

**permanent:**
- If true, allow all future DMs to be unencrypted (sets `User.allow_unencrypted_dms = true`)
- If false, only allow for current pending DM request (one-time exception)

**Notes:**
- Used when user doesn't want to set up encryption keys
- If `permanent = true`, server stores preference in `User.allow_unencrypted_dms`
- Permanent preference can be changed later through user settings
- Anonymous users can only use `permanent = false` (no persistent preference)

### 0x93 - KEY_REQUIRED (Server → Client)

Server needs an encryption key before proceeding with DM.

```
+-------------------+---------------------------+
| reason (String)   | dm_channel_id (Optional u64)|
+-------------------+---------------------------+
```

**reason:**
- Human-readable explanation (e.g., "DM encryption requires a key")

**dm_channel_id:**
- If present, this is for a specific DM channel
- If absent, user needs a key for general DM functionality

**Client should:**
1. Display reason to user
2. Prompt user to choose:
   - Generate local keypair (ephemeral, device-specific)
   - Add existing SSH key (paste/select from ~/.ssh/)
   - Generate new SSH key (save to ~/.ssh/)
   - Allow unencrypted (if permitted by other party)
3. Send PROVIDE_PUBLIC_KEY or ALLOW_UNENCRYPTED

### 0x94 - DM_READY (Server → Client)

DM channel is ready to use.

```
+-------------------+-------------------+------------------------+
| channel_id (u64)  | other_user_id     | other_nickname(String) |
|                   | (Optional u64)    |                        |
+-------------------+-------------------+------------------------+
| is_encrypted(bool)| channel_key (Optional String)             |
|                   | (only if encrypted and user has no pubkey)|
+-------------------+-------------------------------------------+
```

**Notes:**
- `other_user_id` is null if other party is anonymous
- `is_encrypted` indicates whether this DM uses encryption
- `channel_key` is the symmetric key for this channel (encrypted with user's public key)
  - Only sent if user has a public key on file
  - If anonymous user with no key, sent in plaintext (session-only)
- Client can now use standard JOIN_CHANNEL, POST_MESSAGE, etc. on this channel

### 0x95 - DM_PENDING (Server → Client)

Waiting for other party to complete key setup.

```
+-------------------+---------------------------+------------------------+
| dm_channel_id(u64)| waiting_for_user_id       | waiting_for_nickname   |
|                   | (Optional u64)            | (String)               |
+-------------------+---------------------------+------------------------+
| reason (String)   |
+-------------------+
```

**reason:**
- "Waiting for <nickname> to set up encryption"
- "Waiting for <nickname> to accept DM request"

**Notes:**
- Sent to initiator while waiting for recipient to respond
- Client should display waiting indicator
- Will be followed by DM_READY or ERROR

### 0x96 - DM_REQUEST (Server → Client)

Incoming DM request from another user.

```
+-------------------+-------------------------+------------------------+
| dm_channel_id(u64)| from_user_id            | from_nickname (String) |
|                   | (Optional u64)          |                        |
+-------------------+-------------------------+------------------------+
| requires_key(bool)| initiator_allows_unencrypted (bool)            |
+-------------------+----------------------------------------------------+
```

**requires_key:**
- True if recipient needs to set up a key before DM can proceed
- False if recipient already has a key or initiator allows unencrypted

**initiator_allows_unencrypted:**
- True if initiator is willing to accept unencrypted DMs
- False if initiator requires encryption

**Client should:**
- Notify user of incoming DM request
- If `requires_key = true`, prompt for key setup or allow unencrypted
- If `requires_key = false`, can accept immediately

### 0x10 - PING (Client → Server)

Keepalive heartbeat to maintain session when idle.

```
+-------------------+
| timestamp (int64) |
+-------------------+
```

**Notes:**
- Client's local timestamp for RTT calculation
- **Session timeout:** Server disconnects if no PING received for 60 seconds
- **CRITICAL: Clients MUST send PING to keep session alive**
  - Server ONLY updates `Session.last_activity` on PING messages
  - Other messages (POST_MESSAGE, LIST_MESSAGES, etc.) do NOT reset the idle timer
  - **Send PING every 30 seconds to maintain session** (regardless of other activity)
  - Failure to send PING will result in disconnection after 60 seconds
- Connection also closed if socket dies

**Rationale:**
- Updating session activity on every message creates excessive DB writes (55% overhead)
- PING provides explicit keepalive signal that is cheap to process
- Active clients posting messages every 100ms still need PING for session tracking

### 0x90 - PONG (Server → Client)

```
+---------------------------+
| client_timestamp (int64)  |
+---------------------------+
```

Echoes back the client's timestamp.

### 0x92 - SERVER_STATS (Server → Client)

Response to GET_SERVER_STATS request or sent periodically as a broadcast.

```
+---------------------------+---------------------------+
| total_users_online (u32)  | total_channels (u32)      |
+---------------------------+---------------------------+
```

**Fields:**
- `total_users_online`: Current number of connected users
- `total_channels`: Total number of public channels

**Delivery:**
- Sent as response to GET_SERVER_STATS request
- Optionally broadcast periodically to all connected clients (e.g., every 30 seconds)
- Periodic broadcast allows clients to show live user counts without polling

### 0x98 - SERVER_CONFIG (Server → Client)

Server configuration and limits. Sent automatically after successful connection (after AUTH_RESPONSE or when anonymous user connects).

```
+---------------------------+---------------------------+
| protocol_version (u8)     | max_message_rate (u16)    |
+---------------------------+---------------------------+
| max_channel_creates (u16) | inactive_cleanup_days(u16)|
| (per hour)                |                           |
+---------------------------+---------------------------+
| max_connections_per_ip(u8)| max_message_length (u32)  |
+---------------------------+---------------------------+
| max_thread_subs (u16)     | max_channel_subs (u16)    |
+---------------------------+---------------------------+
```

**Fields:**
- `protocol_version`: Protocol version server speaks (must match client, currently 1)
- `max_message_rate`: Maximum messages per minute per user (rate limit)
- `max_channel_creates`: Maximum channel creations per user per hour
- `inactive_cleanup_days`: Days of inactivity before user state is purged (for registered users)
- `max_connections_per_ip`: Maximum simultaneous connections allowed per IP address
- `max_message_length`: Maximum length of message content in bytes
- `max_thread_subs`: Maximum thread subscriptions per session (default: 50)
- `max_channel_subs`: Maximum channel subscriptions per session (default: 10)

**Delivery:**
- Sent once automatically after connection is established
- For anonymous users: sent immediately after socket connection
- For authenticated users: sent after successful AUTH_RESPONSE
- For SSH users: sent after SSH authentication completes

**Client Usage:**
- **MUST check protocol_version first** - disconnect if mismatch
- Use rate limit values to implement client-side rate limiting (prevent hitting server limits)
- Display cleanup policy to users so they know their data retention
- Show connection limits in error messages when appropriate
- Validate message length before sending to avoid errors

### 0x51 - SUBSCRIBE_THREAD (Client → Server)

Subscribe to real-time updates for a specific thread. When subscribed, the client will receive NEW_MESSAGE notifications for all new messages posted to this thread (including replies at any depth).

```
+-------------------+
| thread_id (u64)   |
+-------------------+
```

**Notes:**
- `thread_id`: The root message ID of the thread to subscribe to
- Server validates that the thread exists (ERROR 4003 if not found)
- Server checks subscription limit per session (ERROR 5004 if exceeded)
- Client will receive NEW_MESSAGE for any message posted under this thread root
- On success, server responds with SUBSCRIBE_OK

**Recommended client behavior:**
- Subscribe when entering a thread view
- Unsubscribe when leaving the thread view
- Track subscriptions locally to avoid duplicate subscriptions

### 0x52 - UNSUBSCRIBE_THREAD (Client → Server)

Unsubscribe from a previously subscribed thread.

```
+-------------------+
| thread_id (u64)   |
+-------------------+
```

**Notes:**
- `thread_id`: The root message ID to unsubscribe from
- No error if already unsubscribed (idempotent)
- No response sent (fire-and-forget)

### 0x53 - SUBSCRIBE_CHANNEL (Client → Server)

Subscribe to new threads in a channel or subchannel. When subscribed, the client will receive NEW_MESSAGE notifications for new root messages (thread starters) posted to this channel.

```
+-------------------+-----------------------------+
| channel_id (u64)  | subchannel_id (Optional u64)|
+-------------------+-----------------------------+
```

**Notes:**
- Subscribe to root-level messages only (not replies)
- Server validates channel exists (ERROR 4001 if not found)
- Server validates subchannel exists if provided (ERROR 4004 if not found)
- Server checks subscription limit per session (ERROR 5005 if exceeded)
- On success, server responds with SUBSCRIBE_OK

**Recommended client behavior:**
- Subscribe when viewing a channel's thread list
- Unsubscribe when leaving the channel
- Typically combined with thread subscriptions for full coverage

### 0x54 - UNSUBSCRIBE_CHANNEL (Client → Server)

Unsubscribe from a previously subscribed channel.

```
+-------------------+-----------------------------+
| channel_id (u64)  | subchannel_id (Optional u64)|
+-------------------+-----------------------------+
```

**Notes:**
- No error if already unsubscribed (idempotent)
- No response sent (fire-and-forget)

### 0x99 - SUBSCRIBE_OK (Server → Client)

Confirmation that a subscription was successful.

```
+-------------------+-------------------+-----------------------------+
| type (u8)         | id (u64)          | subchannel_id (Optional u64)|
+-------------------+-------------------+-----------------------------+
```

**Type values:**
- 0x51 = Thread subscription confirmed
- 0x53 = Channel subscription confirmed

**Fields:**
- `type`: Indicates which type of subscription was confirmed (matches request type)
- `id`: The ID that was subscribed to (thread_id or channel_id depending on type)
- `subchannel_id`: Only present for channel subscriptions, null for thread subscriptions

**Notes:**
- Sent in response to SUBSCRIBE_THREAD or SUBSCRIBE_CHANNEL
- Client can use this to confirm the subscription was registered
- Not sent for unsubscribe operations

### 0x91 - ERROR (Server → Client)

Generic error response.

```
+-------------------+-------------------+
| error_code (u16)  | message (String)  |
+-------------------+-------------------+
```

**Error Code Categories (1000-9999):**

**1xxx - Protocol Errors:**
- 1000: Invalid message format
- 1001: Unsupported protocol version
- 1002: Invalid frame (malformed, oversized, etc.)
- 1003: Compression error
- 1004: Encryption error

**2xxx - Authentication Errors:**
- 2000: Authentication required
- 2001: Invalid credentials
- 2002: User already exists (registration)
- 2003: SSH key already registered
- 2004: Session expired

**3xxx - Authorization Errors:**
- 3000: Permission denied
- 3001: Not channel operator
- 3002: Not message author
- 3003: Channel is private

**4xxx - Resource Errors:**
- 4000: Resource not found
- 4001: Channel not found
- 4002: Message not found
- 4003: Thread not found
- 4004: Subchannel not found

**5xxx - Rate Limit Errors:**
- 5000: Rate limit exceeded (general)
- 5001: Message rate limit exceeded
- 5002: Channel creation rate limit exceeded
- 5003: Too many connections from IP
- 5004: Thread subscription limit exceeded (max 50 per session)
- 5005: Channel subscription limit exceeded (max 10 per session)

**6xxx - Validation Errors:**
- 6000: Invalid input
- 6001: Message too long
- 6002: Invalid channel name
- 6003: Invalid nickname
- 6004: Nickname already taken

**9xxx - Server Errors:**
- 9000: Internal server error
- 9001: Database error
- 9002: Service unavailable

## Connection Flow

### Anonymous TCP Connection (Read-Only)

```
Client                                  Server
  |                                       |
  |--- TCP Connect ------------------->  |
  |                                       |
  |--- LIST_CHANNELS ------------------>  |
  |<-- CHANNEL_LIST --------------------  |
  |                                       |
  |--- JOIN_CHANNEL ------------------>  |
  |<-- JOIN_RESPONSE -------------------  |
  |<-- MESSAGE_LIST (initial) ----------  |
  |                                       |
  |<-- NEW_MESSAGE (real-time) ---------  |
  |<-- NEW_MESSAGE ---------------------  |
  |                                       |
```

**Note:** Anonymous users can browse and read without setting a nickname. Nickname is only required when posting a message.

### Anonymous TCP Connection (Posting)

```
Client                                  Server
  |                                       |
  |--- (already connected, browsing) --  |
  |                                       |
  |--- POST_MESSAGE ------------------>  |
  |<-- ERROR (nickname required) -------  |
  |                                       |
  |--- SET_NICKNAME ------------------>  |
  |<-- NICKNAME_RESPONSE (success) ----  |
  |                                       |
  |--- POST_MESSAGE ------------------>  |
  |<-- MESSAGE_POSTED -----------------  |
  |                                       |
```

**Note:** Server rejects POST_MESSAGE if session has no nickname set. Client must set nickname before posting.

### Registered User via Password

```
Client                                  Server
  |                                       |
  |--- TCP Connect ------------------->  |
  |                                       |
  |--- SET_NICKNAME ("alice") --------->  |
  |<-- NICKNAME_RESPONSE (fail) --------  |
  |    "Nickname registered"              |
  |                                       |
  |--- AUTH_REQUEST ------------------->  |
  |<-- AUTH_RESPONSE (success) ---------  |
  |                                       |
  |--- LIST_CHANNELS ------------------>  |
  |<-- CHANNEL_LIST (with unread) ------  |
  |                                       |
```

### SSH Connection

```
Client                                  Server
  |                                       |
  |--- SSH Connect (key auth) --------->  |
  |<-- SSH authenticated ---------------  |
  |    (Server checks key fingerprint)    |
  |                                       |
  |<-- AUTH_RESPONSE (success) ---------  |
  |    (nickname auto-set)                |
  |                                       |
  |--- LIST_CHANNELS ------------------>  |
  |<-- CHANNEL_LIST -------------------  |
  |                                       |
```

**SSH Key Authentication Flow:**

1. **Client connects**: `ssh username@superchat.example.com`
2. **SSH protocol authenticates**: Server verifies client has the private key matching their public key
3. **Server receives public key**: Full public key is available after SSH authentication
4. **Server computes fingerprint**: SHA256 hash of the public key
5. **Server looks up fingerprint** in `SSHKey` table:

   **Case A - Key is registered:**
   - Authenticate as the registered user (ignore SSH username)
   - Set session nickname to registered user's nickname
   - Example: Key registered to 'elegant', user connects as `bloopie@host` → signed in as 'elegant'

   **Case B - Key is not registered (first connection):**
   - Check if SSH username is already registered to a different user
     - **If username is taken**: Reject SSH connection with error message
     - **If username is available**: Proceed with auto-registration
   - Auto-register new user with SSH username as nickname
   - Store public key and fingerprint in `SSHKey` table
   - Create `User` record with nickname from SSH username
   - Set session nickname to the new username
   - Example: New key, connects as `bloopie@host`, 'bloopie' available → auto-register 'bloopie' to this key
   - Example: New key, connects as `bloopie@host`, 'bloopie' already registered → reject connection
   - **Race condition handling**: The unique index on `User.nickname` prevents duplicate registrations.
     If two users attempt to register the same nickname simultaneously, the database constraint
     will cause the second INSERT to fail, and that SSH connection will be rejected with an error.

6. **Send AUTH_RESPONSE**: Notify client of successful authentication with user_id

**Key Points:**
- SSH key is the source of truth for identity, not the SSH username
- Public key is stored on first connection for future authentication
- SSH username is only used for auto-registration on first connection
- If SSH username is already taken, connection is rejected (prevents confusion)
- Subsequent connections with the same key always authenticate as the registered user
- Users should connect with an available username on their first SSH connection

## Direct Message (DM) Flow

Direct messages are private, encrypted (optional) channels between users. The flow handles key setup, encryption negotiation, and supports both registered and anonymous users.

### DM Encryption Architecture

SuperChat uses **hybrid encryption** for DMs: RSA for key exchange, AES for message content.

#### Key Management by User Type

**SSH RSA Users:**
- SSH key can be used directly for encryption
- No additional setup needed
- Seamless experience

**SSH ed25519/ECDSA Users:**
- SSH keys only support signing, not encryption
- Server detects this and prompts for companion RSA key
- User generates RSA-2048 keypair (client-side)
- Public key uploaded via PROVIDE_PUBLIC_KEY
- Private key stored in `~/.superchat/keys/` (never sent to server)

**Password-Only Users:**
- Generate RSA-2048 keypair on first DM
- Public key uploaded to server
- Private key stored in `~/.superchat/keys/`

**Anonymous Users:**
- Generate ephemeral RSA-2048 keypair for session
- Keys destroyed on disconnect
- Channel key sent in plaintext (session-only security)

#### Encryption Process

1. **Channel Key Generation:**
   - Server generates unique AES-256 symmetric key for each DM channel
   - This key encrypts all messages in the DM

2. **Key Distribution:**
   - Channel key is encrypted with RSA-OAEP-SHA256 using each participant's public key
   - Encrypted keys stored in `ChannelAccess` table (one per participant)
   - Each user decrypts their copy with their private key (client-side)

3. **Message Encryption:**
   - Messages encrypted with AES-256-GCM using channel's symmetric key
   - Nonce (12 bytes) generated per message
   - Provides both confidentiality and integrity

4. **Wire Format:**
   ```
   Encrypted Message:
   +----------------+------------------+
   | Nonce (12 B)   | Ciphertext (N B) |
   +----------------+------------------+
   ```

#### Security Properties

- **Algorithms:** RSA-2048 + AES-256-GCM (industry standard)
- **Forward Secrecy:** Limited (per-channel keys, not per-message)
- **Authentication:** Via SSH keys or passwords
- **Key Storage:** Private keys never leave client
- **Anonymous Users:** Session-only security (plaintext channel key)

### Flow 1: Both Users Have Keys (Simple Case)

```
User A (has key)                        Server                          User B (has key)
  |                                       |                                       |
  |--- START_DM(target: "bob") -------->  |                                       |
  |                                       |--- DM_REQUEST from "alice" -------->  |
  |                                       |                                       |
  |<-- DM_PENDING (waiting for bob) ----  |                                       |
  |                                       |                                  (B accepts)
  |                                       |<-- (implicit accept via          |
  |                                       |     standard flow)                |
  |                                       |                                       |
  |<-- DM_READY (channel_id, key) ------  |--- DM_READY (channel_id, key) ----->  |
  |                                       |                                       |
```

**Notes:**
- Server creates private channel with `is_private = true`
- Generates symmetric channel key
- Encrypts channel key with both users' public keys
- Stores in `ChannelAccess` table for each user
- Both users can now use standard messaging on this channel

### Flow 2: Initiator Needs Key

```
User A (no key)                         Server
  |                                       |
  |--- START_DM(target: "bob") -------->  |
  |                                       |
  |<-- KEY_REQUIRED -------------------  |
  |                                       |
  |(Client prompts A to set up key)       |
  |                                       |
  |--- PROVIDE_PUBLIC_KEY ------------->  |
  |    or ALLOW_UNENCRYPTED               |
  |                                       |
  |<-- DM_PENDING (waiting for bob) ----  |
  |                                       |
  |(continues as Flow 1)                  |
```

### Flow 3: Recipient Needs Key

```
User A (has key)                        Server                          User B (no key)
  |                                       |                                       |
  |--- START_DM(target: "bob") -------->  |                                       |
  |                                       |--- DM_REQUEST from "alice" -------->  |
  |                                       |--- KEY_REQUIRED ------------------>  |
  |                                       |                                       |
  |<-- DM_PENDING (waiting for bob) ----  |                                  (B sets up key)
  |                                       |                                       |
  |                                       |<-- PROVIDE_PUBLIC_KEY ------------  |
  |                                       |    or ALLOW_UNENCRYPTED              |
  |                                       |                                       |
  |<-- DM_READY (channel_id, key) ------  |--- DM_READY (channel_id, key) ----->  |
  |                                       |                                       |
```

**Notes:**
- User A sees DM_PENDING immediately
- User B sees DM_REQUEST + KEY_REQUIRED simultaneously
- While B is setting up their key, they don't see "waiting for A" (they're busy with key setup)
- Once B completes key setup, both get DM_READY

### Flow 4: Both Users Need Keys

```
User A (no key)                         Server                          User B (no key)
  |                                       |                                       |
  |--- START_DM(target: "bob") -------->  |                                       |
  |                                       |                                       |
  |<-- KEY_REQUIRED -------------------  |                                       |
  |                                       |                                       |
  |(A sets up key)                        |                                       |
  |                                       |                                       |
  |--- PROVIDE_PUBLIC_KEY ------------->  |                                       |
  |                                       |--- DM_REQUEST from "alice" -------->  |
  |                                       |--- KEY_REQUIRED ------------------>  |
  |                                       |                                       |
  |<-- DM_PENDING (waiting for bob) ----  |                                  (B sets up key)
  |                                       |                                       |
  |(A sees waiting indicator)             |                                  (B busy with UI)
  |                                       |                                       |
  |                                       |<-- PROVIDE_PUBLIC_KEY ------------  |
  |                                       |                                       |
  |<-- DM_READY (channel_id, key) ------  |--- DM_READY (channel_id, key) ----->  |
  |                                       |                                       |
```

**Notes:**
- A sets up key first, then waits for B
- B receives DM_REQUEST while setting up key
- Both complete key setup before DM_READY is sent

### Flow 5: Unencrypted DM (Both Allow)

```
User A (no key, allows unencrypted)    Server                          User B (no key, allows unencrypted)
  |                                       |                                       |
  |--- START_DM(target: "bob",        -->  |                                       |
  |     allow_unencrypted: true)          |                                       |
  |                                       |--- DM_REQUEST from "alice" -------->  |
  |                                       |    (initiator_allows_unencrypted:     |
  |                                       |     true, requires_key: false)        |
  |                                       |                                       |
  |                                       |                                  (B accepts)
  |                                       |<-- (implicit accept)               |
  |                                       |                                       |
  |<-- DM_READY (is_encrypted: false) --  |--- DM_READY (is_encrypted: false) -> |
  |                                       |                                       |
```

**Notes:**
- No KEY_REQUIRED sent to either party
- Server creates unencrypted channel
- Messages are sent in plaintext
- Still private (not in public channel list), just not encrypted

### Flow 6: Anonymous User DM

```
User A (registered, has key)            Server                          User B (anonymous, no key)
  |                                       |                                       |
  |--- START_DM(target: session_123) ->  |                                       |
  |                                       |--- DM_REQUEST from "alice" -------->  |
  |                                       |--- KEY_REQUIRED ------------------>  |
  |                                       |                                       |
  |<-- DM_PENDING (waiting for bob) ----  |                                  (B generates local key)
  |                                       |                                       |
  |                                       |<-- PROVIDE_PUBLIC_KEY ------------  |
  |                                       |    (Note: B is still anonymous,      |
  |                                       |     key is session-only)             |
  |                                       |                                       |
  |<-- DM_READY (channel_id, key) ------  |--- DM_READY (channel_id,         -->  |
  |                                       |     key in plaintext for B)          |
  |                                       |                                       |
```

**Notes:**
- Anonymous user B can receive DMs by session_id
- B can generate a local keypair for this session
- B's key is not permanently stored (lost on disconnect)
- B's channel key is sent in plaintext in DM_READY (session-only security)
- Alternatively, B can choose ALLOW_UNENCRYPTED

### Encryption Details

**Key Management:**
- Each DM channel has a unique symmetric key (AES-256)
- Symmetric key is encrypted with each participant's public key
- Stored in `ChannelAccess.encryption_key` (one entry per participant)

**Message Encryption:**
- Messages in encrypted DMs have Flags bit 1 set (0x02 or 0x03)
- Payload is encrypted with AES-256-GCM using the channel's symmetric key
- Each message includes a nonce/IV in the encrypted payload

**Key Rotation:**
- If user adds a new public key, server re-encrypts all their channel keys
- Each `ChannelAccess` entry is updated with key encrypted for new public key
- Old keys can be removed after re-encryption

**Anonymous User Keys:**
- Generated client-side, never sent to server (only public key is sent)
- Private key stored in memory only (lost on disconnect)
- Channel key sent in plaintext in DM_READY for anonymous users (no way to encrypt it)
- Trade-off: session-only privacy vs. no setup burden

## Protocol Extensions

### Future Considerations

- **Typing Indicators**: Real-time typing notifications (optional)
- **Read Receipts**: Show when other party has read your messages (optional)
- **Multi-party DMs**: Group DMs with 3+ participants
- **Channel Moderation**: Tools for channel operators (kick, ban, mute)

### Explicitly Not Supported

To maintain the old-school, text-focused nature of SuperChat:

- **No file attachments / binary blobs**: Text only, keeps it simple and prevents abuse
- **No emoji reactions**: Want to react? Reply with "+1" or "agreed" like the old days
- **No rich text / markdown**: Plain text only, no formatting wars

## Implementation Notes

### Client Implementation
- Maintain persistent TCP connection
- Implement automatic reconnection with exponential backoff
- Buffer outgoing messages during disconnection
- Store local state for anonymous users in `~/.config/superchat-client/state.db`
- **SSH connections**: Notify user if connected username differs from authenticated nickname
  - Example: "Connected as 'bloopie@host' but authenticated as 'elegant' (SSH key registered to 'elegant')"
  - Prevents confusion when SSH username doesn't match registered identity
  - Display authenticated nickname prominently in UI

### Server Implementation
- Use event loop for handling multiple connections (goroutines + channels in Go)
- Implement per-user rate limiting (messages per minute)
- Broadcast NEW_MESSAGE to all sessions in the same channel
- Periodically send SERVER_STATS to all connected clients
- Implement graceful shutdown (notify clients before closing)

### Security Considerations
- Validate all string inputs for length and content
- Sanitize message content (strip control characters)
- Rate limit message posting (e.g., 10 messages/minute per user)
- Limit max connections per IP address
- Implement flood protection for channel creation
- Use TLS for TCP connections (or SSH tunneling)
