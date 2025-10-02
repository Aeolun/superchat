# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

SuperChat is a terminal-based threaded chat application with a custom binary protocol. The V1 implementation focuses on anonymous users, TCP connections, and forum-style threading. The codebase is designed for forward compatibility with V2 features (user registration, SSH, DMs, encryption) through extensible protocol design and forward-compatible database schemas.

## Build Commands

```bash
# Build both server and client
make build

# Build server only
go build -o superchat-server ./cmd/server

# Build client only
go build -o superchat ./cmd/client

# Run server
go run ./cmd/server

# Run client
go run ./cmd/client
```

## Testing

```bash
# Run all tests with race detector
make test

# Generate coverage for all packages (combined report)
make coverage

# Generate HTML coverage report
make coverage-html

# Generate separate LCOV files per package (protocol, server, client)
make coverage-lcov

# Check protocol package has 100% coverage (enforced)
make coverage-protocol

# View coverage summary
make coverage-summary

# Run fuzzing tests
make fuzz

# Clean coverage artifacts
make clean
```

### Coverage Requirements

- **Protocol package (`pkg/protocol/*`)**: **100% coverage required** - build fails if not met
- Server package (`pkg/server/*`): 80-90% target
- Client package (`pkg/client/*`): 70-80% target

The protocol package has strict 100% coverage because it's the foundation of client-server communication and must be completely tested.

## Architecture

### Three-Layer Structure

1. **Protocol Layer** (`pkg/protocol/`): Binary protocol encoding/decoding
   - Frame-based wire format with length prefix
   - Message type definitions (0x01-0x98)
   - All encoding uses `EncodeTo(io.Writer)` pattern for efficiency
   - Zero message types between client→server and server→client

2. **Server Layer** (`pkg/server/`): TCP server and message handlers
   - Session management (anonymous and registered users)
   - Database operations (SQLite)
   - Real-time message broadcasting to connected clients
   - Rate limiting and timeout enforcement

3. **Client Layer** (`pkg/client/`): TUI client with bubbletea
   - Connection management with auto-reconnect
   - Local state persistence (SQLite in `~/.config/superchat-client/`)
   - Keyboard-driven navigation with vim-like keys
   - Multiple views: channel list, thread list, thread view, compose

### Protocol Design

**Wire Format:**
```
[Length (4B)][Version (1B)][Type (1B)][Flags (1B)][Payload (N bytes)]
```

- Length excludes itself, includes Version+Type+Flags+Payload
- Protocol version is **always validated** on both encode and decode
- Max frame size: 1MB
- Flags: bit 0 = compression, bit 1 = encryption

**Key Protocol Principles:**
- **V1 subset**: Not all message types are implemented in V1. Unimplemented messages return ERROR 1001.
- **Forward compatibility**: V1 clients ignore unknown server message types (for V2 compatibility)
- **Encoding pattern**: All message types use `EncodeTo(io.Writer)` and `Decode([]byte)` methods
- **Optional fields**: Use `(bool present, value)` encoding (wastes 7 bits but much simpler)

See `docs/PROTOCOL.md` for full specification.

### Database Schema

**V1 Tables** (anonymous-only):
- `Channel`: Top-level containers (admin-created only in V1)
- `Session`: Active TCP connections (no persistent users)
- `Message`: All messages with threading (parent_id, thread_depth)
- `MessageVersion`: Edit/delete history for moderation

**Key Schema Decisions:**
- `Message.author_user_id` is NULL for V1 (anonymous), populated in V2 (registered)
- `Message.thread_depth` is denormalized (0-5+) for fast display
- Soft-delete via `deleted_at`, hard-delete via retention policy
- All foreign keys have explicit CASCADE/SET NULL behavior

See `docs/DATA_MODEL.md` for full schema.

### Client UI Architecture

**Bubbletea Model-View-Update:**
- `Model` holds all application state (connection, server data, UI state, input state)
- `Update()` handles all events (keyboard, server messages, timer ticks)
- `View()` renders current view based on `currentView` state

**View States:**
- `ViewSplash`: First-run welcome screen
- `ViewNicknameSetup`: Nickname input modal
- `ViewChannelList`: Channel sidebar + instructions
- `ViewThreadList`: Channel sidebar + thread list (root messages)
- `ViewThreadView`: Single thread with nested replies
- `ViewCompose`: Message composition modal

**Lipgloss Width Handling:**
- `.Width(x)` sets **content width**, borders are added **on top**
- A pane with `.Width(50).Border(RoundedBorder())` renders at **52 characters** total
- Always subtract border width (2) from desired total width when using borders

### Real-Time Updates

Server broadcasts these message types to relevant clients:
- `NEW_MESSAGE`: Sent to all users in a channel when someone posts
- `CHANNEL_CREATED`: Sent to all users when admin creates channel
- `SERVER_STATS`: Periodic broadcast (every 30s) with online user count

Client buffers broadcasts during message composition to avoid disrupting the user.

## Common Patterns

### Adding a New Message Type

1. Define message type constant in `pkg/protocol/messages.go`
2. Add struct with `EncodeTo(io.Writer)` and `Decode([]byte)` methods
3. Write comprehensive tests (table-driven, round-trip, error cases)
4. Add handler in `pkg/server/handlers.go` (or stub with ERROR 1001 for V2)
5. Add client handling in `pkg/client/ui/update.go`

### Protocol Encoding Pattern

All message encoding follows this pattern:
```go
func (m *MessageType) EncodeTo(w io.Writer) error {
    if err := WriteUint64(w, m.Field1); err != nil {
        return err
    }
    if err := WriteString(w, m.Field2); err != nil {
        return err
    }
    return WriteOptionalUint64(w, m.OptionalField)
}
```

Never allocate intermediate buffers - write directly to io.Writer for efficiency.

### Database Transactions

Always wrap multi-table operations in transactions:
```go
tx, err := db.Begin()
if err != nil {
    return err
}
defer tx.Rollback() // Safe to call even after Commit

// ... multiple operations ...

if err := tx.Commit(); err != nil {
    return err
}
```

Critical for: user registration, channel creation, message posting with versions.

## V1 vs V2 Compatibility

**V1 Scope (Current):**
- Anonymous users only (no User table)
- TCP connections only (no SSH)
- Flat channels (no subchannels)
- Forum threading (no chat type)
- Client-side state (no server sync)

**V2 Additions (Future):**
- User registration with passwords
- SSH key authentication
- Subchannels (two-level hierarchy)
- Message editing
- User-created channels
- Direct messages with encryption

**Compatibility Strategy:**
- Protocol messages 0x01-0x98 are defined but many return ERROR 1001 in V1
- Database has nullable fields for V2 features (`author_user_id`, `subchannel_id`)
- V1 leaves these NULL, V2 populates them
- No schema migration needed for V1→V2 upgrade

## Key Files

- `docs/PROTOCOL.md`: Complete binary protocol specification
- `docs/V1.md`: V1 feature scope and implementation phases
- `docs/DATA_MODEL.md`: Database schema and relationships
- `pkg/protocol/frame.go`: Frame encoding/decoding
- `pkg/protocol/messages.go`: All message type definitions
- `pkg/server/handlers.go`: Server message handlers
- `pkg/client/ui/model.go`: Client state model
- `pkg/client/ui/update.go`: Event handling and server message processing
- `pkg/client/ui/view.go`: TUI rendering

## Important Constraints

- **Max frame size**: 1MB (prevents DoS)
- **Session timeout**: 60 seconds of inactivity (client sends PING every 30s)
- **Message retention**: 7 days default (configurable per channel)
- **Rate limiting**: 10 messages/minute per session (V1 default)

## Testing Philosophy

- **Protocol package**: 100% coverage required, no exceptions
- Use table-driven tests for all message encode/decode
- Test both success and error paths (especially io.Writer failures)
- Property-based tests (rapid) for serialization round-trips
- Fuzzing for malformed input handling
- Integration tests for multi-client real-time broadcasts
