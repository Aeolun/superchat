# SuperChat Improvements Roadmap

This document tracks needed improvements for server operations documentation and user experience, based on comprehensive technical architecture and UX evaluations.

## Priority 0: Critical Blockers (Ship-stoppers)

### UX - User Experience

#### 1. Server Discovery Problem ✅
- **Problem**: Users cannot find servers beyond superchat.win; if it's down, they're stuck
- **Status**: COMPLETE
- **Fix**:
  - [x] Show server selector modal on first-ever launch (before connection attempt)
  - [x] Add explanatory text: "Servers announce themselves to the directory as they come online"
  - [x] Auto-fallback to server selector if default connection fails (via ConnectionFailedModal "Switch Server" option)
  - [x] Add "[Ctrl+L] Switch Server" to footer hints (automatically shown via global command registration)
  - [x] Document Ctrl+L shortcut in splash screen and channel list welcome
  - [x] Public server list endpoint: `/servers.json` HTTP endpoint on port 9090 (for external websites)

#### 2. Connection Errors Crash the App ✅
- **Problem**: Connection failure → Process exits, no recovery path
- **Status**: COMPLETE
- **Fix**:
  - [x] Remove fatal errors on connection failure
  - [x] Create ConnectionFailedModal with options: [R] Retry [S] Switch Server [Q] Quit
  - [x] Show context-appropriate error messages (not just "connection refused")
  - [x] Stay running and allow user to choose next action

#### 3. Enter Key Behavior ✅
- **Status**: WORKING AS INTENDED - Context-aware behavior already implemented
- **Current behavior:**
  - **Chat channels (type 0)**: Enter sends message (like IRC/Slack)
  - **Forum channels (type 1)**: Enter adds newline, Ctrl+Enter sends (for long-form posts)
- **Rationale**: Different channel types have different UX needs. Chat = quick messages, Forum = thoughtful multi-paragraph posts.
- **Future consideration**: Could add Cmd+Enter support for macOS users (in addition to Ctrl+Enter)

---

## Priority 1: High Priority (Significant Friction)

### UX - User Experience

#### 4. Installation PATH Warning ✅
- **Problem**: Users don't know how to fix PATH issue after install
- **Status**: COMPLETE
- **Fix**:
  - [x] Show shell-specific commands to add to PATH (Bash, Zsh, Fish)
  - [x] Auto-detect current shell and show appropriate command
  - [x] Show "for this session only" option
- **Implementation**: install.sh:171-220

#### 5. Add Installation Verification ✅
- **Problem**: Install completes with no verification step
- **Status**: COMPLETE
- **Fix**:
  - [x] Show verification steps after installation
  - [x] Display installed paths with checkmarks
  - [x] Show quick-start commands
  - [x] Show server commands
- **Implementation**: install.sh:222-254

#### 6. Server Selector on First Launch ✅
- **Problem**: Hard-coded dependency on superchat.win
- **Status**: COMPLETE
- **Fix**:
  - [x] On first-ever launch, show modal: "Welcome! Choose a server:"
  - [x] List: superchat.win (default), [other public servers], "Enter custom server"
  - [x] Save choice as default
  - [x] Gives users agency and teaches that servers exist
  - [x] Welcoming tone on first launch ("Welcome! Choose a server:")
  - [x] Normal tone on subsequent launches ("Available Servers")
  - [x] Custom server input option (always available at end of list)
  - [x] Extended first-launch explanation about directory and custom servers
- **Implementation**:
  - First launch (no saved server) automatically uses directory mode, showing server selector
  - Selected server is saved to `directory_selected_server` config and used for subsequent launches
  - Custom server option allows entering unlisted servers (format: hostname:port)
  - Modal adapts messaging based on whether it's first launch or manual switch (Ctrl+L)

#### 6a. WebSocket Fallback for Firewall-Restricted Networks ✅
- **Problem**: Some firewalls block binary TCP traffic but allow HTTP/WebSocket
- **Status**: COMPLETE
- **Fix**:
  - [x] Server: WebSocket endpoint on HTTP port 6467 (`/ws`)
  - [x] Client: Automatic fallback (TCP → WebSocket on connection failure)
  - [x] Connection type indicator in client UI (shows [TCP], [SSH], or [WS])
  - [x] Server startup shows available connection methods
- **Implementation**:
  - WebSocket adapter implements `net.Conn` interface for complete code reuse
  - Binary protocol transported over WebSocket binary messages
  - Same session handling, same message loop, zero protocol changes
  - Port consolidation: 6465 (Binary TCP), 6466 (SSH), 6467 (HTTP/WS), 9090 (Metrics)
  - Automatic fallback: client tries primary method first, falls back to WebSocket if fails
  - Explicit WebSocket: Use `ws://host:port` or `--server ws://host:port` to force WebSocket
  - Status bar shows connection type: "Connected: ~alice  [WS]" or "[TCP]" or "[SSH]"
  - Server selector shows protocol used: "Loading servers from directory via WebSocket..."

#### 7. Add Channel Symbol Legend ✅
- **Problem**: `>` and `#` prefixes unexplained
- **Status**: COMPLETE
- **Fix**:
  - [x] Added to channel list welcome screen
  - [x] Shows both channel types with clear explanations
- **Implementation**: pkg/client/ui/view/channel_list.go:168-170

#### 8. Improve Registration Prompts ✅
- **Problem**: Registration mentioned in splash screen, easy to miss
- **Status**: COMPLETE
- **Fix**:
  - [x] Modal warning shown before first post (RegistrationWarningModal)
  - [x] Explains benefits: secure nickname, message editing
  - [x] Options: [P] Post anyway, [R] Register first, [C] Cancel
  - [x] Registration hints in splash screen and channel list welcome
  - [x] Ctrl+R shortcut available globally
- **Implementation**:
  - pkg/client/ui/modal/registration_warning.go
  - pkg/client/ui/model.go:1094-1148

### Operations - Documentation

#### 9. Create docs/ops/DEPLOYMENT.md ✅
- **Critical**: Complete deployment guide
- **Status**: COMPLETE
- **Includes**:
  - [x] Prerequisites (system requirements, ports, OS recommendations)
  - [x] Deployment methods (binary, Docker, source build)
  - [x] Initial setup (system user, directories, permissions)
  - [x] Process management (systemd service file)
  - [x] Verification steps
  - [x] Quick-start checklist
  - [x] Sample systemd service file
- **Location**: docs/ops/DEPLOYMENT.md

#### 10. Create docs/ops/CONFIGURATION.md ✅
- **Critical**: Complete configuration reference
- **Status**: COMPLETE
- **Includes**:
  - [x] Configuration file location and precedence
  - [x] Complete parameter reference (all sections)
  - [x] Performance tuning recommendations by scale
  - [x] Environment-specific configs (dev/staging/prod)
- **Location**: docs/ops/CONFIGURATION.md

#### 11. Create docs/ops/SECURITY.md ✅
- **Critical**: Security hardening guide
- **Status**: COMPLETE
- **Includes**:
  - [x] System security (non-root user, file permissions, SELinux/AppArmor)
  - [x] Network security (firewall rules, port security)
  - [x] Protocol security
  - [x] SSH security (V2 feature)
  - [x] Rate limiting configuration
  - [x] Database security
  - [x] Monitoring for abuse
  - [x] Attack mitigation
- **Location**: docs/ops/SECURITY.md

#### 12. Create docs/ops/MONITORING.md ✅
- **Critical**: Monitoring and observability
- **Status**: COMPLETE
- **Includes**:
  - [x] Log files documentation
  - [x] Prometheus metrics (port 9090)
  - [x] Grafana setup
  - [x] Performance profiling (port 6060)
  - [x] Health checks
  - [x] Log aggregation
- **Location**: docs/ops/MONITORING.md

#### 13. Create docs/ops/BACKUP_AND_RECOVERY.md ✅
- **Critical**: Backup and disaster recovery
- **Status**: COMPLETE
- **Includes**:
  - [x] What to backup (database, config, SSH host key, logs)
  - [x] Database backup strategies
  - [x] Backup automation (scripts and cron jobs)
  - [x] Recovery procedures
  - [x] Testing recovery
- **Location**: docs/ops/BACKUP_AND_RECOVERY.md

---

## Priority 2: Medium Priority (Usability & Day-to-Day Ops)

### UX - User Experience

#### 14. Better Nickname Validation ✅
- **Problem**: Validation rules only shown after error
- **Status**: COMPLETE
- **Fix**:
  - [x] Show rules proactively in both nickname setup and registration modals
  - [x] Helper text below input field: "Allowed: letters, numbers, - and _"
  - [x] Real-time character count display (e.g., "Characters: 5/20")
  - [x] Password character count in registration modal (e.g., "Characters: 10 (min 8)")
- **Implementation**:
  - pkg/client/ui/modal/nickname_setup.go:107-115
  - pkg/client/ui/modal/registration.go:148-153, 200-206

#### 15. Progressive Shortcut Disclosure ⏭️
- **Problem**: 12+ shortcuts available immediately, overwhelming
- **Status**: SKIPPED
- **Rationale**: Context-aware footer hints already provide relevant shortcuts based on current view. Progressive disclosure would add complexity without clear benefit given current UX patterns (registration warnings, help modal, etc.).

#### 16. Improve Config Error Messages ✅
- **Problem**: Raw TOML parse errors shown to users
- **Status**: COMPLETE
- **Fix**:
  - [x] Created ConfigErrorModal with user-friendly error display
  - [x] Shows error line + 2 lines of context for parse errors
  - [x] Validates config at load time (port ranges, formats, required fields)
  - [x] Options: [R] Reset to default, [Q] Quit
  - [x] Backup confirmation before reset ([Y] backup, [N] no backup, [C] cancel)
  - [x] Automatic backup with timestamp (config.toml.backup-YYYY-MM-DD)
- **Implementation**:
  - pkg/client/ui/modal/config_error.go (modal UI)
  - pkg/client/config.go:40-200 (ConfigError type, validation, reset function)
  - pkg/client/config_error_handler.go (TUI handler)
  - cmd/client/main.go:94-102 (integration)

#### 17. Add Empty State Guidance ✅
- **Problem**: Empty channel list shows "(no channels)", no next steps
- **Status**: COMPLETE
- **Fix**:
  - [x] Different messaging for anonymous vs registered users
  - [x] Anonymous users: Prompted to register (Ctrl+R) then create channel (c)
  - [x] Registered users: Can create channel (c) or switch servers (Ctrl+L)
  - [x] Both groups: Suggested to refresh (r) or switch servers
  - [x] Empty state shown in both channel sidebar and welcome screen
- **Implementation**: pkg/client/ui/view/channel_list.go:132-141, 173-200

#### 18. Add Command Aliases ✅
- **Problem**: Only one way to invoke actions (keyboard shortcuts only)
- **Status**: COMPLETE
- **Fix**:
  - [x] Support IRC-style commands: `/` prefix for command palette
  - [x] Support vim-style: `:` prefix for command palette
  - [x] Autocomplete with prefix/substring matching
  - [x] Context-aware command listing (only shows available commands)
  - [x] Max 8 visible suggestions with scrolling
  - [x] Case-insensitive command matching
  - [x] Different user populations have different mental models
- **Implementation**:
  - pkg/client/ui/commands/registry.go:189-222 (GetCommandByName, GetCommandNames methods)
  - pkg/client/ui/modal/command_palette.go (autocomplete modal)
  - pkg/client/ui/model.go:734-761, 2012-2029 (key handlers, showCommandPalette method)
  - All existing commands work with palette via Command.Name field

---

## Priority 3: Advanced Topics (Nice-to-Have)

### UX - User Experience

#### 22. Add Accessibility Improvements
- [ ] Screen reader support (test with Orca, NVDA)
- [ ] Add `--screen-reader` flag for plain text output
- [ ] Color scheme options for color-blind users
- [ ] High-contrast mode
- [ ] Font size configuration

#### 23. Add Bandwidth Indicator
- [ ] If `--throttle` enabled, show in status bar: "⏱ Limited to X KB/s"

#### 24. Add Update Notifications
- [ ] Show notification in footer when update available (not just welcome screen)
- [ ] "Press U to update now" shortcut

#### 25. Add Session Statistics
- [ ] Show in help or status:
  ```
  Connected for: 2h 34m
  Messages read: 45
  Messages posted: 12
  Data transferred: 2.3 MB
  ```

### Operations - Documentation

#### 26. Create docs/ops/PERFORMANCE_TUNING.md
- **Advanced**: Optimization guide
- [ ] Baseline performance (10k connections, 75ms response, CPU-bound)
- [ ] System-level tuning (TCP settings, kernel limits, file descriptors)
- [ ] Application-level tuning (timeouts, retention, rate limits, connections)
- [ ] Database tuning (SQLite PRAGMA, WAL checkpoint, VACUUM)
- [ ] Memory optimization (MemDB, snapshot interval, GC tuning)
- [ ] Load testing (using built-in loadtest tool)
- [ ] Profiling in production (safe pprof usage)

#### 27. Create docs/ops/SCALING.md
- **Advanced**: Scaling and high availability
- [ ] Current limitations (single-server, SQLite, no load balancing)
- [ ] Vertical scaling (CPU most important, capacity estimates)
- [ ] Single-server capacity (~10k connections tested)
- [ ] Multi-server architecture (future - not implemented yet)
- [ ] Geographic distribution (regional servers, discovery protocol)
- [ ] High availability (future - hot standby, replication, failover)
- [ ] Current best practices (single powerful server recommended)

---

## Priority 4: Tooling and Automation (Critical Missing Tools)

### Operations - Tools to Create

#### 28. Admin System (Protocol-Level) ✅
- **Critical**: Server admin capabilities with audit logging
- **Status**: PARTIALLY COMPLETE (protocol and server complete, client UI pending)
- **Completed**:
  - [x] Admin permission system (config-based admin_users list)
  - [x] isAdmin() permission check for all admin operations
  - [x] Ban table with discriminated union (user bans vs IP bans)
  - [x] AdminAction table for complete audit trail
  - [x] Support for timed bans (duration_seconds) and permanent bans
  - [x] Shadowban functionality (messages only visible to author)
  - [x] CIDR range support for IP bans (e.g., "10.0.0.0/24")
  - [x] Protocol messages (12 new types):
    - Client→Server: BAN_USER (0x59), BAN_IP (0x5A), UNBAN_USER (0x5B), UNBAN_IP (0x5C), LIST_BANS (0x5D), DELETE_USER (0x5E)
    - Server→Client: USER_BANNED (0x9F), IP_BANNED (0xA5), USER_UNBANNED (0xA6), IP_UNBANNED (0xA7), BAN_LIST (0xA8), USER_DELETED (0xA9)
  - [x] Database layer: CreateUserBan, CreateIPBan, DeleteUserBan, DeleteIPBan, ListBans, GetActiveBanForUser, GetActiveBanForIP
  - [x] Server handlers with admin permission checks
  - [x] Migration 007: Ban and AdminAction tables
  - [x] Complete protocol documentation in PROTOCOL.md
  - [x] Complete design documentation in ADMIN_SYSTEM_DESIGN.md
- **Remaining Work**:
  - [ ] Update DELETE_MESSAGE handler to allow admin override (admins can delete any message)
  - [ ] Update DELETE_CHANNEL handler to allow admin override (admins can delete any channel)
  - [ ] Update LIST_USERS to support include_offline flag for admins
  - [ ] Implement ban checking in authentication flow (reject banned users, show ban reason/duration)
  - [ ] Implement shadowban message filtering (filter messages from shadowbanned users)
  - [ ] Create admin panel modal in client (press A key to open)
  - [ ] Client UI for ban management (ban/unban users, ban/unban IPs, view ban list)
- **Implementation**:
  - pkg/protocol/messages.go (12 new message types)
  - pkg/protocol/types.go (WriteOptionalInt64/ReadOptionalInt64)
  - pkg/database/database.go (7 new ban methods)
  - pkg/database/memdb.go (forwarding methods)
  - pkg/database/migrations/007_add_admin_tables.sql
  - pkg/server/config.go (admin_users config field)
  - pkg/server/handlers.go (6 new admin handlers)
  - pkg/server/server.go (isAdmin() check, message routing)
  - docs/ADMIN_SYSTEM_DESIGN.md (complete design documentation)
  - docs/PROTOCOL.md (wire format specifications)

#### 28a. Create superchat-admin CLI Tool
- **Critical**: No way to admin without SQL or client
- [ ] Channel management:
  - [ ] `superchat-admin channel list`
  - [ ] `superchat-admin channel create <name> --description "..." --retention-hours 168`
  - [ ] `superchat-admin channel delete <name>`
  - [ ] `superchat-admin channel info <name>`
- [ ] User management (V2):
  - [ ] `superchat-admin user list`
  - [ ] `superchat-admin user info <nickname>`
  - [ ] `superchat-admin user delete <nickname>`
  - [ ] `superchat-admin user reset-password <nickname>`
- [ ] Ban management:
  - [ ] `superchat-admin ban user <nickname> --reason "..." [--duration 3600] [--shadowban]`
  - [ ] `superchat-admin ban ip <ip_or_cidr> --reason "..." [--duration 3600]`
  - [ ] `superchat-admin unban user <nickname>`
  - [ ] `superchat-admin unban ip <ip_or_cidr>`
  - [ ] `superchat-admin ban list [--include-expired]`
- [ ] Message moderation:
  - [ ] `superchat-admin message delete <message-id>`
  - [ ] `superchat-admin message list-deleted --channel <name> --since <date>`
- [ ] Server info:
  - [ ] `superchat-admin stats`
  - [ ] `superchat-admin sessions list`
  - [ ] `superchat-admin sessions kill <session-id>`
- [ ] Database maintenance:
  - [ ] `superchat-admin db backup`
  - [ ] `superchat-admin db vacuum`
  - [ ] `superchat-admin db integrity-check`
- **Note**: CLI tool would use the same protocol messages implemented in #28

#### 29. Create systemd Service File
- **Critical**: Required for production deployment
- [ ] Create `/etc/systemd/system/superchat.service` template
- [ ] Include:
  - [ ] User/Group (dedicated superchat user)
  - [ ] WorkingDirectory (/var/lib/superchat)
  - [ ] ExecStart with --config flag
  - [ ] Restart policy (on-failure)
  - [ ] Security hardening (NoNewPrivileges, PrivateTmp, ProtectSystem)
  - [ ] Resource limits (LimitNOFILE=65536)
- [ ] Document in DEPLOYMENT.md

#### 30. Create superchat-healthcheck Script
- **Important**: For monitoring systems
- [ ] Check TCP port 6465 listening
- [ ] Check SSH port 6466 listening (if enabled)
- [ ] Check database accessible and not corrupted
- [ ] Check metrics endpoint responding
- [ ] Check log file writable
- [ ] Exit 0 for healthy, 1 for unhealthy
- [ ] Output clear status message

#### 31. Create superchat-diagnostics Script
- **Important**: Troubleshooting assistance
- [ ] Gather diagnostic info:
  - [ ] Server version and uptime
  - [ ] Active connection count
  - [ ] Database size and integrity
  - [ ] Recent error log entries (last 100)
  - [ ] Configuration summary (sanitized)
  - [ ] System resource usage (CPU, RAM, disk)
- [ ] Output saved to timestamped file
- [ ] Safe to share for support (no secrets)

#### 32. Create Backup Automation Script
- **Critical**: Data loss prevention
- [ ] Hot backup using sqlite3 `.backup` command
- [ ] Timestamp-based filenames
- [ ] Rotation (keep last N backups, configurable)
- [ ] Off-site sync (optional - rsync/S3)
- [ ] Logging
- [ ] Exit codes for cron monitoring
- [ ] Document in BACKUP_AND_RECOVERY.md

#### 33. Create Prometheus Alert Rules
- **Important**: Proactive monitoring
- [ ] Create `prometheus/alerts.yml` template
- [ ] Alerts:
  - [ ] Server down (no metrics for 5 minutes)
  - [ ] High error rate (>10% of messages)
  - [ ] Active sessions near limit
  - [ ] Database size growing rapidly
  - [ ] Broadcast latency >1s
  - [ ] Goroutine count increasing (leak detection)
- [ ] Document in MONITORING.md

#### 34. Create Grafana Dashboard
- **Important**: Visualization
- [ ] Create `grafana/superchat-dashboard.json` template
- [ ] Panels:
  - [ ] Active sessions over time
  - [ ] Message rate (received/sent)
  - [ ] Error rate
  - [ ] Broadcast latency histogram
  - [ ] Subscriber distribution
  - [ ] Connection/disconnection rate
- [ ] Document in MONITORING.md

---

## Priority 5: Operations Documentation (After Tooling)

### Operations - Documentation

**Note**: These docs should be written AFTER Priority 4 tooling is complete, so they can reference actual tools and commands.

#### 35. Create docs/ops/ADMINISTRATION.md
- **Day-to-day**: Administrative tasks
- [ ] User management (V2 feature - using superchat-admin tool)
- [ ] Channel management (using superchat-admin tool)
- [ ] Message moderation (soft delete, edit history, hard delete)
- [ ] SSH key management (V2 feature)
- [ ] Direct SQL administration (safe queries, backup-before-edit)
- [ ] Monitoring active sessions
- **Deliverables**:
  - [ ] Admin CLI tool usage guide (after #28 complete)
  - [ ] SQL query cookbook

#### 36. Create docs/ops/TROUBLESHOOTING.md
- **Day-to-day**: Common issues and solutions
- [ ] Server won't start (port in use, db locked, permissions, migration failure)
- [ ] Connection issues (firewall, port confusion, version mismatch, timeout)
- [ ] Performance issues (CPU, db bottleneck, broadcast latency, goroutine leaks)
- [ ] Database issues (corruption, WAL growth, disk space, rollback)
- [ ] SSH issues (V2 - host key changed, auth failures)
- [ ] Log analysis (common error patterns)
- [ ] Diagnostic commands (netstat, telnet, sqlite3, curl metrics)
- **Deliverables**:
  - [ ] Usage guide for superchat-diagnostics script (after #31 complete)
  - [ ] Usage guide for superchat-healthcheck script (after #30 complete)
  - [ ] Log analyzer script usage

#### 37. Create docs/ops/UPGRADES.md
- **Day-to-day**: Version upgrades and migrations
- [ ] Upgrade procedure (pre-upgrade checklist, steps, rollback)
- [ ] Migration system (automatic on startup, backups, file structure)
- [ ] Version compatibility (protocol, database, V1→V2 notes)
- [ ] Zero-downtime upgrades (future - requires multi-server)
- **Deliverables**:
  - [ ] Backup/restore procedures using superchat-admin tool (after #28 complete)

---

## Code Improvements (Infrastructure Gaps)

### Missing Infrastructure

#### 38. Add Health Check Endpoint ✅
- **Problem**: External monitoring must parse logs
- **Status**: COMPLETE
- **Fix**:
  - [x] Add HTTP `/health` endpoint on metrics port (9090)
  - [x] Return 200 OK if healthy (returns JSON with status, uptime, sessions, db status)
  - [x] Include: database accessible, active sessions, uptime, directory enabled status
  - [ ] Document in MONITORING.md (future)

#### 39. Add Graceful Shutdown Signal Handling ✅
- **Problem**: Server had basic signal handling but no client notification or detailed logging
- **Status**: COMPLETE
- **Fix**:
  - [x] Signal handler for SIGTERM/SIGINT (already existed in cmd/server/main.go)
  - [x] Send DISCONNECT message to all connected clients before shutdown
  - [x] Close active connections cleanly
  - [x] Flush MemDB to disk (final snapshot triggered by db.Close())
  - [x] Log detailed shutdown progress (listener close, client notification, session cleanup, DB flush)
- **Implementation**:
  - pkg/server/server.go:329-407 (enhanced Stop() method with notifyClientsOfShutdown())
  - Signal handling in cmd/server/main.go:182-190
  - MemDB final snapshot in pkg/database/memdb.go:218-230 (snapshotLoop shutdown case)
- **Note**: No explicit timeout needed - shutdown completes once all goroutines finish naturally after listener closes and sessions are cleaned up

#### 40. Add Log Rotation Support
- **Problem**: server.log grows unbounded (until restart)
- **Fix**:
  - [ ] Add built-in log rotation (max size, max files)
  - [ ] Or document external tool usage (logrotate)
  - [ ] Document in DEPLOYMENT.md

#### 41. Add Structured Logging Option
- **Problem**: Log parsing difficult for automation
- **Fix**:
  - [ ] Add `--log-format json` flag
  - [ ] Output JSON logs with structured fields
  - [ ] Keep human-readable as default
  - [ ] Document in MONITORING.md

#### 42. Add Configuration Validation
- **Problem**: Invalid config discovered at runtime
- **Fix**:
  - [ ] Validate configuration on startup
  - [ ] Show clear errors with suggestions
  - [ ] Add `--validate-config` flag to check without starting
  - [ ] Document in CONFIGURATION.md

#### 43. Add Configuration Hot-Reload
- **Problem**: Config changes require restart
- **Fix**:
  - [ ] Add SIGHUP handler to reload config
  - [ ] Only reload safe parameters (not ports, not database path)
  - [ ] Log reload success/failure
  - [ ] Document in ADMINISTRATION.md

#### 44. Add Admin API
- **Future**: HTTP/gRPC API for management
- **Fix**:
  - [ ] Design admin API (REST or gRPC)
  - [ ] Authentication/authorization
  - [ ] Endpoints for channel/user/message management
  - [ ] Powers superchat-admin CLI tool
  - [ ] Document in ADMINISTRATION.md

---

## Documentation Quality Standards

All documentation should follow these principles:
- [ ] Tested on real systems (no theoretical procedures)
- [ ] Copy-paste ready (exact commands that work)
- [ ] Explained, not just shown (why, not just how)
- [ ] Error-aware (what could go wrong and how to fix)
- [ ] Platform-specific (Ubuntu, Debian, CentOS, Arch examples)
- [ ] Version-aware (note what changed between versions)
- [ ] Indexed (table of contents, good headings)
- [ ] Searchable (common terms and error messages)
- [ ] Maintained (kept up-to-date with code)
- [ ] Validated (peer-reviewed by actual operators)

---

## Implementation Timeline (Suggested)

### Week 1: Critical Path
- Items 9-13 (P1 operations docs)
- Items 29, 32 (systemd service, backup script)
- Items 1-3 (P0 UX fixes)

### Week 2: High Priority
- Items 14-18 (P1 UX improvements)
- Items 19-21 (P2 operations docs)
- Items 28, 30, 31 (admin CLI, health check, diagnostics)

### Week 3: Advanced Topics
- Items 26-27 (P3 operations docs)
- Items 33-34 (Prometheus/Grafana)
- Items 35-39 (code improvements)

### Week 4: Testing and Polish
- Test all procedures on fresh systems
- Peer review all documentation
- Create quick-start guide
- Update README.md with links
- Optional: Video walkthrough

---

## Success Metrics

After implementing this roadmap, we should be able to:

### For Server Operators:
- [ ] Deploy a production server in <30 minutes (Scenario A/B)
- [ ] Restore from backup in <5 minutes
- [ ] Diagnose common issues in <10 minutes using troubleshooting guide
- [ ] Perform routine maintenance without developer assistance
- [ ] Monitor server health with clear metrics and alerts
- [ ] Upgrade safely with confidence in rollback procedures
- [ ] Scale by understanding current limits and future options

### For End Users:
- [ ] Install and connect in <2 minutes
- [ ] Post first message within 5 minutes of installation
- [ ] Understand channel types and navigation
- [ ] Recover from errors without external help
- [ ] Discover and switch servers easily
- [ ] Understand registration benefits and process

---

## Notes and Context

- **Audience**: Server operators docs target experienced sysadmins; user docs target terminal-comfortable users
- **Scope**: V1 complete, V2 partially complete (user registration, user-created channels, message editing done; SSH auth, subchannels, chat channels pending)
- **Current Scale**: Tested to 10k concurrent connections (CPU-bound)
- **Priority Rationale**: P0/P1 items are blockers for production deployment or critical UX friction; P2/P3 are improvements for mature product

---

## Related Documents

- `CLAUDE.md` - Project architecture and development guidelines
- `docs/versions/V2.md` - V2 feature summary (COMPLETE)
- `docs/versions/V3.md` - V3 planned features
- `docs/PROTOCOL.md` - Binary protocol specification
- `docs/DATA_MODEL.md` - Database schema
- `docs/MIGRATIONS.md` - Database migration system
