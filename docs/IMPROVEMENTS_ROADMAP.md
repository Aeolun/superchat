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

#### 4. Installation PATH Warning
- **Problem**: Users don't know how to fix PATH issue after install
- **Current**: Warning shown but no actionable steps
- **Fix**:
  - [ ] Show shell-specific commands to add to PATH:
    ```bash
    For Bash:
      echo 'export PATH="$PATH:$HOME/.local/bin"' >> ~/.bashrc
      source ~/.bashrc

    For Zsh:
      echo 'export PATH="$PATH:$HOME/.local/bin"' >> ~/.zshrc
      source ~/.zshrc
    ```
  - [ ] Or offer to add automatically (prompt user for permission)

#### 5. Add Installation Verification
- **Problem**: Install completes with no verification step
- **Fix**:
  - [ ] Update install.sh to show post-install verification:
    ```
    ✓ Installation complete!

    Verify installation:
      sc --version

    Get started:
      sc                    # Connect to default server
      sc --help            # View all options
    ```

#### 6. Server Selector on First Launch
- **Problem**: Hard-coded dependency on superchat.win
- **Fix**:
  - [ ] On first-ever launch, show modal: "Welcome! Choose a server:"
  - [ ] List: superchat.win (default), [other public servers], "Enter custom server"
  - [ ] Save choice as default
  - [ ] Gives users agency and teaches that servers exist

#### 7. Add Channel Symbol Legend
- **Problem**: `>` and `#` prefixes unexplained
- **Fix**:
  - [ ] Add to channel list welcome screen:
    ```
    Channel Types:
    > Chat channels - Linear conversation (like IRC)
    # Forum channels - Threaded discussion (like Reddit)
    ```

#### 8. Improve Registration Prompts
- **Problem**: Registration mentioned in splash screen, easy to miss
- **Fix**:
  - [ ] After first successful post, show toast notification:
    ```
    Message posted as ~alice (anonymous)

    Tip: Register to secure your nickname and enable
         message editing. Press Ctrl+R anytime.
    ```
  - [ ] Show registration benefit in status bar: "You: ~alice (anonymous)"

### Operations - Documentation

#### 9. Create docs/ops/DEPLOYMENT.md
- **Critical**: Complete deployment guide
- [ ] Prerequisites (system requirements, ports, OS recommendations)
- [ ] Deployment methods:
  - [ ] Binary installation (recommended)
  - [ ] Docker (expand DOCKER.md)
  - [ ] Source build
- [ ] Initial setup (system user, directories, permissions)
- [ ] Process management (systemd service file)
- [ ] Verification steps
- [ ] Quick-start checklist
- **Deliverables**:
  - [ ] Sample systemd service file
  - [ ] Post-installation verification script

#### 10. Create docs/ops/CONFIGURATION.md
- **Critical**: Complete configuration reference
- [ ] Configuration file location and precedence
- [ ] Complete parameter reference:
  - [ ] `[server]` section (tcp_port, ssh_port, database_path)
  - [ ] `[limits]` section (rate limits, connection limits, timeouts)
  - [ ] `[retention]` section (message retention, cleanup intervals)
  - [ ] `[channels]` section (seed channels, custom configs)
  - [ ] `[discovery]` section (directory features)
- [ ] Performance tuning recommendations by scale
- [ ] Environment-specific configs (dev/staging/prod)

#### 11. Create docs/ops/SECURITY.md
- **Critical**: Security hardening guide
- [ ] System security (non-root user, file permissions, SELinux/AppArmor)
- [ ] Network security:
  - [ ] Firewall rules (iptables/ufw examples)
  - [ ] Allow: 6465 (TCP), 6466 (SSH)
  - [ ] **DENY: 9090 (metrics), 6060 (pprof)** - never expose publicly
  - [ ] Reverse proxy considerations
- [ ] Protocol security (no TLS on main port, SSH encryption)
- [ ] SSH security (V2 feature - host keys, public key auth only)
- [ ] Rate limiting configuration
- [ ] Database security (file permissions, password hashing)
- [ ] Monitoring for abuse
- [ ] Attack mitigation (DoS, max frame size, session timeouts)

#### 12. Create docs/ops/MONITORING.md
- **Critical**: Monitoring and observability
- [ ] Log files:
  - [ ] server.log (all activity, truncated on restart)
  - [ ] errors.log (errors only, append mode)
  - [ ] debug.log (verbose, --debug flag only)
- [ ] Prometheus metrics (port 9090):
  - [ ] Document all available metrics
  - [ ] Sample prometheus.yml configuration
  - [ ] Alert rules for common issues
  - [ ] Recommended recording rules
- [ ] Grafana setup:
  - [ ] Sample dashboard JSON
  - [ ] Key panels (active users, message rate, error rate, latency)
  - [ ] Alert configuration examples
- [ ] Performance profiling (port 6060):
  - [ ] CPU/memory/goroutine profiling commands
  - [ ] **Security warning**: Never expose pprof publicly
  - [ ] SSH tunneling for remote access
- [ ] Health checks (TCP, client test, database, metrics)
- [ ] Log aggregation (syslog, logrotate)

#### 13. Create docs/ops/BACKUP_AND_RECOVERY.md
- **Critical**: Backup and disaster recovery
- [ ] What to backup (database, config, SSH host key, logs)
- [ ] Database backup strategies:
  - [ ] Automatic migration backups (already exists)
  - [ ] Regular backups (hot/cold methods)
  - [ ] WAL mode considerations
- [ ] Backup automation:
  - [ ] Sample cron job
  - [ ] Backup rotation script
  - [ ] Off-site backup recommendations
  - [ ] Backup verification
- [ ] Recovery procedures:
  - [ ] Minor data loss (restore from backup)
  - [ ] Database corruption (sqlite3 .recover)
  - [ ] Migration failure (rollback)
  - [ ] Complete server failure (new hardware setup)
- [ ] Testing recovery (quarterly drills, RTO documentation)

---

## Priority 2: Medium Priority (Usability & Day-to-Day Ops)

### UX - User Experience

#### 14. Better Nickname Validation
- **Problem**: Validation rules only shown after error
- **Fix**:
  - [ ] Show rules proactively in prompt:
    ```
    Enter a nickname (3-20 characters)
    Allowed: letters, numbers, - and _
    ```

#### 15. Progressive Shortcut Disclosure
- **Problem**: 12+ shortcuts available immediately, overwhelming
- **Fix**:
  - [ ] Show "core 4" in footer by default: [↑/↓] Navigate [Enter] Select [Esc] Back [h] Help
  - [ ] After 1 minute: "Tip: Press 'n' to start a new thread"
  - [ ] After first post: "Tip: Press 'r' to reply to messages"
  - [ ] After first week: "Tip: Press Ctrl+R to register"

#### 16. Improve Config Error Messages
- **Problem**: Raw TOML parse errors shown to users
- **Fix**:
  - [ ] Create ConfigErrorModal with options:
    ```
    Configuration file error:
      File: ~/.config/superchat/config.toml
      Problem: Invalid TOML syntax on line 12

    Options:
    [R] Reset to default config
    [E] Edit config file (opens $EDITOR)
    [Q] Quit
    ```

#### 17. Add Empty State Guidance
- **Problem**: Empty channel list shows "(no channels)", no next steps
- **Fix**:
  - [ ] Show guidance:
    ```
    This server has no channels yet.

    Options:
    • Create a channel (Ctrl+C) [if registered]
    • Switch to a different server (Ctrl+L)
    • Wait for admin to create channels
    ```

#### 18. Add Command Aliases
- **Problem**: Only one way to invoke actions
- **Fix**:
  - [ ] Support IRC-style commands: `/help`, `/register`, `/quit`
  - [ ] Support vim-style: `:q`, `:help`
  - [ ] Different user populations have different mental models

### Operations - Documentation

#### 19. Create docs/ops/ADMINISTRATION.md
- **Day-to-day**: Administrative tasks
- [ ] User management (V2 feature - currently no admin tools)
- [ ] Channel management (currently no admin tools)
- [ ] Message moderation (soft delete, edit history, hard delete)
- [ ] SSH key management (V2 feature)
- [ ] Direct SQL administration (safe queries, backup-before-edit)
- [ ] Monitoring active sessions
- **Deliverables**:
  - [ ] Admin CLI tool (see Priority 4)
  - [ ] SQL query cookbook

#### 20. Create docs/ops/TROUBLESHOOTING.md
- **Day-to-day**: Common issues and solutions
- [ ] Server won't start (port in use, db locked, permissions, migration failure)
- [ ] Connection issues (firewall, port confusion, version mismatch, timeout)
- [ ] Performance issues (CPU, db bottleneck, broadcast latency, goroutine leaks)
- [ ] Database issues (corruption, WAL growth, disk space, rollback)
- [ ] SSH issues (V2 - host key changed, auth failures)
- [ ] Log analysis (common error patterns)
- [ ] Diagnostic commands (netstat, telnet, sqlite3, curl metrics)
- **Deliverables**:
  - [ ] Diagnostic script that runs all health checks
  - [ ] Log analyzer script

#### 21. Create docs/ops/UPGRADES.md
- **Day-to-day**: Version upgrades and migrations
- [ ] Upgrade procedure (pre-upgrade checklist, steps, rollback)
- [ ] Migration system (automatic on startup, backups, file structure)
- [ ] Version compatibility (protocol, database, V1→V2 notes)
- [ ] Zero-downtime upgrades (future - requires multi-server)

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

#### 28. Create superchat-admin CLI Tool
- **Critical**: No way to admin without SQL
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

## Code Improvements (Infrastructure Gaps)

### Missing Infrastructure

#### 35. Add Health Check Endpoint ✅
- **Problem**: External monitoring must parse logs
- **Status**: COMPLETE
- **Fix**:
  - [x] Add HTTP `/health` endpoint on metrics port (9090)
  - [x] Return 200 OK if healthy (returns JSON with status, uptime, sessions, db status)
  - [x] Include: database accessible, active sessions, uptime, directory enabled status
  - [ ] Document in MONITORING.md (future)

#### 36. Add Graceful Shutdown Signal Handling
- **Problem**: Server relies on OS SIGTERM, no cleanup
- **Fix**:
  - [ ] Add signal handler for SIGTERM/SIGINT
  - [ ] Graceful shutdown timeout (30 seconds)
  - [ ] Close active connections cleanly
  - [ ] Flush MemDB to disk
  - [ ] Log shutdown completion

#### 37. Add Log Rotation Support
- **Problem**: server.log grows unbounded (until restart)
- **Fix**:
  - [ ] Add built-in log rotation (max size, max files)
  - [ ] Or document external tool usage (logrotate)
  - [ ] Document in DEPLOYMENT.md

#### 38. Add Structured Logging Option
- **Problem**: Log parsing difficult for automation
- **Fix**:
  - [ ] Add `--log-format json` flag
  - [ ] Output JSON logs with structured fields
  - [ ] Keep human-readable as default
  - [ ] Document in MONITORING.md

#### 39. Add Configuration Validation
- **Problem**: Invalid config discovered at runtime
- **Fix**:
  - [ ] Validate configuration on startup
  - [ ] Show clear errors with suggestions
  - [ ] Add `--validate-config` flag to check without starting
  - [ ] Document in CONFIGURATION.md

#### 40. Add Configuration Hot-Reload
- **Problem**: Config changes require restart
- **Fix**:
  - [ ] Add SIGHUP handler to reload config
  - [ ] Only reload safe parameters (not ports, not database path)
  - [ ] Log reload success/failure
  - [ ] Document in ADMINISTRATION.md

#### 41. Add Admin API
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
