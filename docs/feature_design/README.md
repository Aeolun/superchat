# Feature Design Documentation

This directory contains historical design documents and architectural decision records for major SuperChat features. These documents capture the "why" and "how" of implementation decisions and are preserved for historical reference.

## Purpose

- **Architectural Decision Records**: Document why we chose specific approaches
- **Implementation Plans**: Detailed plans that guided feature development
- **Debugging Sessions**: Complex bugs and their root cause analysis
- **Design Rationale**: Trade-offs and considerations for major features

## Documents

### Completed Features

#### `subscription_system.md` ✅
Design and implementation plan for the message subscription/broadcast optimization system. This feature reduced broadcast fan-out from 2000 clients to ~40 clients per channel, improving response time from 978ms to <50ms at scale.

**Key Decisions:**
- Explicit subscription model (not auto-subscribe on JOIN_CHANNEL)
- Client provides thread_root_id to avoid database lookups
- Encode-once optimization (encode frame once, write N times)
- Idempotent subscription operations

**Implementation:** V1, fully complete

---

#### `ssh_authentication.md` ✅
Complete implementation plan for SSH key authentication with auto-registration. Documents all 8 implementation phases from database schema to server discovery.

**Key Decisions:**
- Fingerprint-based identity (SHA256 of public key)
- Auto-registration on first SSH connect
- SSH key management via protocol messages (not just SSH)
- Password change support for SSH-registered users
- Server discovery system for client bootstrapping

**Implementation:** V2, mostly complete (minor TODOs: rate limiting, encrypted key passphrases)

---

#### `loadtest_race_condition_debug.md` ✅
Detailed debugging session documenting a critical race condition discovered during load testing at 50+ concurrent clients.

**Problem:** Corrupted protocol frames causing random disconnections
**Root Cause:** Unsynchronized concurrent writes to `net.Conn` (direct responses vs broadcasts)
**Solution:** Added `Session.writeMu` mutex to serialize all frame writes

**Impact:** Improved success rate from 98.9% to 100% under load

---

## Usage Guidelines

### When to Add Documents Here

Add a document to this directory when:
1. Implementing a major feature (>3 days effort)
2. Making significant architectural decisions
3. Debugging complex, non-obvious bugs
4. Exploring design alternatives and trade-offs

### Document Structure

Each document should include:
- **Status header**: ✅ IMPLEMENTED / ⚠️ IN PROGRESS / ❌ NOT STARTED
- **Summary**: What was implemented and where to find it in the code
- **Historical marker**: Indicate it's a reference document, not active TODO
- **Original content**: Preserve the full design/debug process

### Maintenance

- Mark documents as complete when implementation finishes
- Add code references (file paths, line numbers) to status header
- Update CLAUDE.md's "Key Files" section with new documents
- Do NOT delete historical documents (they provide institutional knowledge)

---

## Related Documentation

- **Active Documentation:** See `docs/` for current specs (PROTOCOL.md, V1.md, V2.md, etc.)
- **Project Guide:** See `CLAUDE.md` for development guidelines
- **Implementation Status:** See `docs/versions/V2.md` for current feature status

---

**Note:** This directory is for completed/historical documentation. For active TODO lists and current implementation status, see `docs/versions/V3.md` and `docs/IMPROVEMENTS_ROADMAP.md`.
