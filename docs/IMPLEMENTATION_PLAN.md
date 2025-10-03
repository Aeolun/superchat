# SuperChat Implementation Plan

## Project Overview

SuperChat is a terminal-based threaded chat/forum application inspired by old-school IRC and newsgroups, but with modern threading capabilities. It consists of a single-binary server and client applications written in Go.

## Core Philosophy

- **Old-school aesthetic**: Terminal UI with keyboard navigation, efficient and minimal
- **Text-only**: No file attachments, emoji reactions, or rich text formatting
- **Lightweight protocol**: Binary protocol optimized for efficiency
- **Optional registration**: Anonymous users can read and post; registration provides identity and persistence
- **Threaded conversations**: Newsgroup-style threading with proper parent-child relationships

## Technology Stack

### Language
- **Go**: Excellent for single binaries, cross-platform, good concurrency, runs everywhere

### Key Libraries (Go)
- SSH: `golang.org/x/crypto/ssh`
- TUI: `bubbletea` + `lipgloss` or `tview`
- Database: SQLite embedded (via `modernc.org/sqlite` or `mattn/go-sqlite3`)
- Custom protocol: Raw TCP sockets

### Database
- SQLite embedded
- Default location: `~/.config/superchat/superchat.db`
- Configurable via config file

## Architecture

### Server Component
- Single binary that handles:
  - SSH connections (automatic authentication via SSH keys)
  - TCP connections (custom binary protocol)
  - Multi-user support with real-time message broadcasting
  - Message storage and threading
  - User authentication and session management

### Client Component
- Terminal UI (TUI) with full keyboard navigation
- Can connect via:
  - SSH (seamless authentication with keys)
  - Custom TCP protocol
- Local state storage for anonymous users (`~/.config/superchat-client/state.db`)
- Displays threaded conversations in newsgroup style

## Channel Architecture

### Two-Level Hierarchy

Channels can optionally contain subchannels:

```
#tech-community (channel, forum type, 7 days retention)
├─ Messages posted directly in #tech-community
├─ /announcements (subchannel, forum, 30 days)
├─ /help (subchannel, forum, 7 days)
└─ /random (subchannel, chat, 1 hour)

#random (channel, chat type, 1 hour retention)
└─ Messages posted directly in #random
```

**Key points:**
- Subchannels are optional
- Can always post at channel level regardless of whether subchannels exist
- Each channel/subchannel has independent type and retention settings

### Channel Types

- **Chat (0x00)**: Intended for real-time conversation
  - Client UI emphasizes chronological flow
  - Threading still supported but may be de-emphasized in UI
  - Typically short retention (but configurable)

- **Forum (0x01)**: Intended for threaded discussions
  - Client UI emphasizes thread structure
  - Threading is expected and encouraged
  - Typically longer retention (but configurable)

**Important**: All clients MUST support displaying threaded messages in both types. Type is a UI hint, not a protocol restriction.

## User Authentication

### Anonymous Users
- No registration required
- Can connect, browse, and read immediately
- Must set nickname before posting (but not before connecting)
- No persistent state across sessions (except client-side local storage)
- Multiple anonymous users can use the same nickname simultaneously

### Registered Users (Password)
- Choose nickname and password via `/register` (or keyboard shortcut like Ctrl+R)
- Nickname becomes unique and protected
- Server-side state (unread counts, etc.) syncs across devices
- Can add SSH keys later for seamless authentication

### Registered Users (SSH)
- Connect via `ssh username@superchat.example.com`
- **First connection with new key**:
  - If username is available: auto-register username to that SSH key
  - If username is taken: reject connection with error
- **Subsequent connections**:
  - SSH key fingerprint is looked up
  - User is authenticated as the registered user for that key
  - SSH username is ignored (key is source of truth)
- Can add multiple SSH keys to same account
- Can set password later for non-SSH access

## Message Threading

### Thread Structure
- Messages form a tree (parent-child relationships)
- Root messages have `parent_id = null`
- Replies have `parent_id` set to their parent message
- Thread depth is cached for performance (0 = root, 1 = direct reply, etc.)

### Display Rules
- Depth 0-5: Indent proportionally
- Depth 6+: Stay at depth 5 indent level
- Show actual depth number in UI for clarity (e.g., "[7]")

### Message Retrieval
- **Without `parent_id` filter**: Returns root messages only (thread list)
  - Sorted newest first
  - Includes `reply_count` for each thread
- **With `parent_id` filter**: Returns all replies in that thread
  - Does NOT include the parent message itself (client already has it)
  - Sorted in depth-first order for proper tree display

## Read State Tracking

### Registered Users (Server-Side)
- Server tracks `last_read_at` per channel/subchannel in `UserChannelState` table
- Syncs across all devices
- State is cleaned up for inactive users (e.g., no connection in 90 days)

### Anonymous Users (Client-Side)
- Client stores `last_read_at` locally per channel/subchannel
- Persists across reconnections from same client (even with different nicknames)
- Different device = fresh start

### Update Behavior
- **Recommended**: Update on channel leave to newest displayed message
  - Only if newer than current `last_read_message_id` (don't move backwards)
- **Manual**: User can press shortcut to mark as read up to current position
- **Protocol**: Server accepts any position (allows custom client behavior)
  - Protocol is flexible; client implements sensible defaults

## Direct Messages (DMs)

### Key Features
- Private channels between users (not in public channel list)
- Optional end-to-end encryption
- Support for both registered and anonymous users
- Flexible key setup flow

### Encryption Options
When starting a DM, users can choose:
1. **Set up encryption** (generate/import key)
2. **Allow unencrypted now** (one-time for this DM)
3. **Allow unencrypted forever** (set permanent preference)

### Key Management
- **SSH users**: SSH key automatically used for encryption
- **Password users**: Can generate/upload public key
- **Anonymous users**: Can generate session-only keypair (lost on disconnect)
- **Multiple keys**: Server re-encrypts channel keys when new key added

### Encryption Details
- Each DM has unique symmetric key (AES-256)
- Symmetric key encrypted with each participant's public key
- Stored in `ChannelAccess` table (one entry per participant per channel)
- Messages encrypted with AES-256-GCM
- Anonymous users receive channel key in plaintext (no way to encrypt it persistently)

## Real-Time Features

### Server Broadcasts
The server pushes these messages to connected clients in real-time:

- **NEW_MESSAGE**: When someone posts in a channel you're in
- **CHANNEL_CREATED**: When any public channel is created
- **SUBCHANNEL_CREATED**: When a subchannel is added to any channel
- **MESSAGE_EDITED**: When someone edits a message
- **SERVER_STATS**: Periodically (e.g., every 30 seconds) with online user counts

### Client Considerations
- Maintain persistent TCP connection
- Implement automatic reconnection with exponential backoff
- Buffer outgoing messages during disconnection
- Update UI in real-time when broadcasts arrive

## UI/UX Design Notes

### Keyboard Navigation
- Everything must be accessible via keyboard
- Context-aware shortcuts (different in channel list vs message view)
- Press `h` or `?` to show available commands in current context
- Shortcuts can have optional slash command equivalents

### Screen Layout Ideas
```
┌─────────────────────────────────────────────────────────────┐
│ SuperChat - Connected as: alice                  142 online │
├──────────────┬──────────────────────────────────────────────┤
│ Channels     │ #tech-community / /help                      │
│              ├──────────────────────────────────────────────┤
│ #general     │ [Root] How do I configure vim mode? (5)      │
│ #tech        │ └─[1] Check the KEYBINDINGS.md file          │
│ ├/announce   │   └─[2] Thanks! Found it.                    │
│ ├/help    *  │ [Root] Bug in message threading (12)         │
│ └/random     │ [Root] Welcome new users! (3)                │
│ #random      │                                              │
│              │                                              │
│              │                                              │
├──────────────┴──────────────────────────────────────────────┤
│ [h] Help  [n] New thread  [r] Reply  [Ctrl+R] Register      │
└─────────────────────────────────────────────────────────────┘
```

### Visual Indicators
- `*` next to channel/subchannel name = unread messages
- Numbers in parentheses = reply count for threads
- `[depth]` prefix = thread depth for messages
- Different visual style for registered vs anonymous users:
  - Registered: `alice` (plain nickname)
  - Anonymous: `~bob` (tilde prefix)
  - Clients check `author_user_id`: if null, display with `~` prefix

### Notification on SSH Username Mismatch
If user connects as `bloopie@host` but key is registered to `elegant`:
- Show notification: "Connected as 'bloopie@host' but authenticated as 'elegant' (SSH key registered to 'elegant')"
- Display authenticated nickname prominently in UI
- Prevents confusion about identity

## Configuration

### Server Config
Default location: `~/.config/superchat/config.toml`

Suggested settings:
```toml
[server]
tcp_port = 6465
ssh_port = 2222
database_path = "~/.config/superchat/superchat.db"

[retention]
default_chat_hours = 1
default_forum_hours = 168  # 7 days

[limits]
max_connections_per_ip = 10
message_rate_limit = 10  # per minute
max_message_length = 4096
```

### Client Config
Default location: `~/.config/superchat-client/config.toml`

Suggested settings:
```toml
[connection]
default_server = "chat.example.com"
default_port = 6465
auto_reconnect = true

[local]
state_db = "~/.config/superchat-client/state.db"
last_nickname = "alice"
auto_set_nickname = true  # Use last_nickname on connect
```

## Binary Protocol Notes

### Frame Structure
```
[4-byte length][1-byte type][1-byte flags][payload]
```

### Flags Byte
- Bit 0: Compression (gzip)
- Bit 1: Encryption
- Bits 2-7: Reserved

### Compression
- Apply to payloads > 512 bytes
- Use gzip
- Compress before encryption (if both are used)

### Message Size Limits
- Max frame: 1 MB (prevent DoS)
- Recommended max message content: 4 KB

## Implementation Phases

### Phase 1: Core Server (MVP)
- [ ] SQLite database setup with schema
- [ ] TCP server with custom binary protocol
- [ ] User authentication (password-based)
- [ ] Channel and message CRUD operations
- [ ] Real-time message broadcasting
- [ ] Message threading support

### Phase 2: Core Client (MVP)
- [ ] TUI framework setup (bubbletea)
- [ ] TCP connection to server
- [ ] Channel list view
- [ ] Message list view (threaded display)
- [ ] Message composition
- [ ] Basic keyboard navigation

### Phase 3: SSH Support
- [ ] SSH server integration
- [ ] SSH key authentication (client verifies banner, stores keys with comment)
- [ ] Auto-registration on first SSH connection
- [ ] Multiple key support per user

### Phase 4: Enhanced Features
- [ ] Read state tracking (server and client)
- [ ] Unread count indicators
- [ ] Message editing
- [ ] Subchannel support
- [ ] Message retention/cleanup jobs

### Phase 5: Direct Messages
- [ ] DM initiation flow
- [ ] Key setup UI
- [ ] Encryption implementation (AES-256-GCM)
- [ ] Key management (upload, multiple keys, rotation)
- [ ] Unencrypted DM support

### Phase 6: Polish
- [ ] Compression support
- [ ] Improved error handling
- [ ] Graceful shutdown
- [ ] Admin tools (user management, channel moderation)
- [ ] Performance optimization
- [ ] Documentation for server operators

## Security Considerations

### Implementation Priorities
- Validate all string inputs for length and content
- Sanitize message content (strip control characters)
- Rate limit message posting (e.g., 10 messages/minute per user)
- Limit max connections per IP address
- Implement flood protection for channel creation
- Use TLS for TCP connections (or recommend SSH tunneling)
- Never log private message content
- Implement proper key storage (encrypted at rest)

### Encryption
- Use established libraries (Go's `crypto` package)
- AES-256-GCM for symmetric encryption
- Proper random number generation for keys/nonces
- Secure key exchange using public key cryptography

## Testing Strategy

### Unit Tests
- Protocol encoding/decoding
- Message threading logic
- Authentication flows
- Database operations

### Integration Tests
- Full client-server communication
- Multi-client scenarios (race conditions)
- Connection drops and reconnection
- Message ordering and consistency

### Manual Testing
- Different terminal sizes and environments
- SSH key authentication on various platforms
- Thread display with deep nesting
- High-latency connections

## Deployment Considerations

### Single Binary Distribution
- Cross-compile for: Linux (amd64, arm64), macOS (amd64, arm64), Windows (amd64)
- Distribute via GitHub releases
- Include systemd service file for Linux servers

### Server Setup
- Provide Docker image for easy deployment
- Document firewall rules (TCP and SSH ports)
- Provide sample config files
- Document backup procedures (just copy SQLite file)

### Client Installation
- Package managers: Homebrew (macOS), apt/yum (Linux)
- Standalone binaries with install script
- Configuration wizard on first run

## Future Considerations (Post-MVP)

### Features to Consider Later
- Typing indicators
- Read receipts (opt-in)
- Multi-party DMs (3+ participants)
- Channel moderation tools (kick, ban, mute)
- Server-to-server federation (IRC-style networks)
- Import/export from other platforms

### Explicitly Not Planned
- File attachments / binary blobs (keeps it simple, prevents abuse)
- Emoji reactions (old-school: reply with "+1" instead)
- Rich text / markdown (plain text only)
- Voice/video chat (scope creep)
- Mobile apps (terminal-focused)

## Notes and Decisions

### Design Decisions Made

1. **Anonymous posting requires nickname**: Allows some identity without forcing registration
2. **SSH username only matters on first connect**: Key fingerprint is source of truth thereafter
3. **Client-side state for anonymous users**: Good UX without server complexity
4. **Type is UI hint, not restriction**: Protocol allows threading everywhere, clients decide presentation
5. **Flexible read state protocol**: Server doesn't enforce forward-only, trusts clients
6. **Three-tier encryption choice**: Setup key / allow once / allow forever - balances security and UX
7. **Per-DM encryption preference**: Each conversation can be encrypted or not independently
8. **Flags byte in protocol**: Room for future features (compression, encryption, etc.)

### Open Questions for Implementation

1. Should we implement a web-based admin panel, or keep it CLI-only?
2. What's the best strategy for schema migrations as the protocol evolves?
3. Should we support connecting to multiple servers from one client?
4. How do we handle clock skew between client and server for timestamps?
5. Should we add a "mark all as read" bulk operation?

## Success Criteria

The project is successful when:

- [ ] A user can SSH into the server and immediately start chatting
- [ ] Anonymous users can lurk without friction
- [ ] Threaded conversations are easy to read and navigate
- [ ] The client is responsive even on slow connections
- [ ] Setting up a server takes < 5 minutes
- [ ] The binary runs on a Raspberry Pi without issues
- [ ] Users find it nostalgic and fun to use

## Resources and References

### Inspiration
- IRC (Internet Relay Chat)
- Usenet newsgroups
- BBS systems
- Terminal-based email clients (mutt, alpine)

### Technical References
- SSH protocol: RFC 4253
- Bubbletea examples: https://github.com/charmbracelet/bubbletea
- SQLite best practices for Go
- Binary protocol design patterns
