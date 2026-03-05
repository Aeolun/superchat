# Archive Feature - Implementation Complete

All 7 phases of the archive feature have been implemented.

## What was built

### 1. Archive Protocol Schema (`pkg/archive/`)
- `archive.schema.json5`: binschema JSON5 schema
- `generated/generated.go`: Auto-generated Go encoder/decoder
- `framing.go`: Length-prefixed frame protocol, thread-safe writes
- `client.go`: Non-blocking async client with 10k buffer, auto-reconnect, handshake + backfill
- `errors.go`: Error types

### 2. Database Migration
- `pkg/database/migrations/015_add_archive_enabled.sql`
- NULL = inherit server default, 0 = disabled, 1 = enabled

### 3. Protocol Changes
- `ArchiveEnabled bool` added to `Channel` and `ChannelCreatedMessage`
- Web client codecs updated
- `docs/PROTOCOL.md` updated

### 4. Server Integration
- `[archive]` TOML config section (config.go)
- ArchiveClient lifecycle in server.go
- `archive.go`: BackfillProvider, resolveArchiveEnabled, hook methods
- handlers.go: archive forwarding after post/edit/delete

### 5. Archive Service (`cmd/archiver/`, `pkg/archiver/`)
- TCP listener + handshake handler
- SQLite storage with upsert operations
- Static HTML generation with embedded templates

### 6. Client UI
- Web: "Archived" indicator in channel header
- TUI: `[ARCHIVED]` in thread list title

### 7. Tests
- Framing round-trips, storage tests, HTML generator test
- Protocol rapid tests updated for ArchiveEnabled

## Configuration

```toml
[archive]
enabled = true
endpoint = "localhost:6470"
```

## Running

```bash
./superchat-archiver --listen :6470 --db archive.db --output ./archive-html
./superchat-server  # with [archive] section in config.toml
```
