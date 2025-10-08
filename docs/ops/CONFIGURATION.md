# SuperChat Configuration Reference

Complete reference for all SuperChat server configuration options.

## Table of Contents

- [Configuration File Location](#configuration-file-location)
- [Configuration Format](#configuration-format)
- [Server Section](#server-section)
- [Limits Section](#limits-section)
- [Retention Section](#retention-section)
- [Channels Section](#channels-section)
- [Discovery Section](#discovery-section)
- [Environment Variable Overrides](#environment-variable-overrides)
- [Command-Line Flags](#command-line-flags)
- [Example Configurations](#example-configurations)
- [Performance Tuning](#performance-tuning)

## Configuration File Location

**Default path:** `~/.superchat/config.toml`

**Custom path:**
```bash
scd --config /path/to/config.toml
```

**Config file precedence:**
1. Command-line flags (highest priority)
2. Environment variables
3. Config file values
4. Default values (lowest priority)

If the config file doesn't exist, SuperChat creates it with default values on first startup.

## Configuration Format

SuperChat uses TOML format for configuration files.

**Full configuration example:**
```toml
[server]
tcp_port = 6465
ssh_port = 6466
http_port = 6467
ssh_host_key = "~/.superchat/ssh_host_key"
database_path = "~/.superchat/superchat.db"

[limits]
max_connections_per_ip = 10
message_rate_limit = 10
max_message_length = 4096
max_nickname_length = 20
session_timeout_seconds = 120

[retention]
default_retention_hours = 168
cleanup_interval_minutes = 60

[channels]
seed_channels = [
  { name = "general", description = "General discussion" },
  { name = "tech", description = "Technical topics" },
  { name = "random", description = "Off-topic chat" },
  { name = "feedback", description = "Bug reports and feature requests" }
]

[discovery]
directory_enabled = true
public_hostname = ""
server_name = "SuperChat Server"
server_description = "A SuperChat community server"
max_users = 0
```

## Server Section

Controls core server behavior and network settings.

### `tcp_port`
- **Type:** Integer
- **Default:** `6465`
- **Description:** Port for binary TCP connections (main protocol)
- **Range:** 1024-65535 (recommend 1024+ for non-root)
- **Example:**
  ```toml
  tcp_port = 6465
  ```

### `ssh_port`
- **Type:** Integer
- **Default:** `6466`
- **Description:** Port for SSH connections (V2 SSH authentication)
- **Range:** 1024-65535
- **Notes:** Only active if SSH is enabled; clients connect via `ssh://user@host:6466`
- **Example:**
  ```toml
  ssh_port = 6466
  ```

### `http_port`
- **Type:** Integer
- **Default:** `6467`
- **Description:** Port for HTTP/WebSocket connections
- **Range:** 1024-65535
- **Notes:** Serves WebSocket endpoint at `/ws` for firewall-restricted clients
- **Example:**
  ```toml
  http_port = 6467
  ```

### `ssh_host_key`
- **Type:** String (file path)
- **Default:** `"~/.superchat/ssh_host_key"`
- **Description:** Path to SSH host private key (auto-generated if missing)
- **Notes:**
  - Supports `~` expansion
  - Key type: Ed25519
  - File permissions: 600 recommended
  - Regenerating this key will cause "host key changed" warnings for SSH clients
- **Example:**
  ```toml
  ssh_host_key = "/var/lib/superchat/ssh_host_key"
  ```

### `database_path`
- **Type:** String (file path)
- **Default:** `"~/.superchat/superchat.db"`
- **Description:** Path to SQLite database file
- **Notes:**
  - Supports `~` expansion
  - Parent directory must exist and be writable
  - Database is auto-created on first startup
  - Migrations run automatically before loading
- **Example:**
  ```toml
  database_path = "/var/lib/superchat/superchat.db"
  ```

## Limits Section

Controls rate limiting, connection limits, and resource constraints.

### `max_connections_per_ip`
- **Type:** Integer
- **Default:** `10`
- **Description:** Maximum concurrent connections from a single IP address
- **Range:** 1-255
- **Use case:** Prevent single-IP abuse while allowing shared IPs (NAT, VPN)
- **Tuning:**
  - Home/small server: 10-20
  - Public server: 50-100 (allow shared IPs)
  - Corporate/NAT: 100+ (many users behind one IP)
- **Example:**
  ```toml
  max_connections_per_ip = 50
  ```

### `message_rate_limit`
- **Type:** Integer
- **Default:** `10`
- **Description:** Maximum messages per minute per session
- **Range:** 1-65535
- **Use case:** Prevent spam and flooding
- **Tuning:**
  - Strict anti-spam: 5-10 messages/min
  - Balanced: 10-20 messages/min
  - Permissive/chat: 30-60 messages/min
- **Example:**
  ```toml
  message_rate_limit = 20
  ```

### `max_message_length`
- **Type:** Integer
- **Default:** `4096`
- **Description:** Maximum message content length in bytes
- **Range:** 1-65535 (protocol limit: 1MB frame size)
- **Use case:** Balance between expressiveness and DoS protection
- **Notes:**
  - Includes message content only (not protocol overhead)
  - UTF-8 characters may use multiple bytes
- **Tuning:**
  - Chat-style: 512-1024 bytes
  - Forum-style: 4096-8192 bytes
  - Long-form: 16384-32768 bytes
- **Example:**
  ```toml
  max_message_length = 8192
  ```

### `max_nickname_length`
- **Type:** Integer
- **Default:** `20`
- **Description:** Maximum nickname length in characters
- **Range:** 3-255
- **Protocol constraint:** Minimum 3 characters (enforced in validation)
- **Example:**
  ```toml
  max_nickname_length = 20
  ```

### `session_timeout_seconds`
- **Type:** Integer
- **Default:** `120`
- **Description:** Seconds of inactivity before session timeout
- **Range:** 60-3600
- **Notes:**
  - Client sends PING every 30 seconds to keep alive
  - Timeout should be 2-4x the PING interval
  - Lower values free resources faster
  - Higher values handle network hiccups better
- **Tuning:**
  - Aggressive cleanup: 60-90 seconds
  - Balanced: 120 seconds (default)
  - Lenient: 180-300 seconds
- **Example:**
  ```toml
  session_timeout_seconds = 180
  ```

## Retention Section

Controls message retention and cleanup behavior.

### `default_retention_hours`
- **Type:** Integer
- **Default:** `168` (7 days)
- **Description:** Default message retention period in hours
- **Range:** 1-8760 (1 hour to 1 year)
- **Notes:**
  - Per-channel retention can override this
  - Deleted messages (soft-deleted) are still cleaned up after retention expires
  - Setting retention too low may frustrate users
  - Setting retention too high increases database size
- **Tuning:**
  - Chat channels: 24-168 hours (1-7 days)
  - Forum channels: 720-4320 hours (30-180 days)
  - Archive channels: 8760 hours (1 year)
- **Example:**
  ```toml
  default_retention_hours = 720  # 30 days
  ```

### `cleanup_interval_minutes`
- **Type:** Integer
- **Default:** `60`
- **Description:** How often to run the message cleanup task
- **Range:** 1-1440 (1 minute to 1 day)
- **Notes:**
  - Cleanup deletes messages older than retention period
  - Lower values keep database smaller but use more CPU
  - Higher values use less CPU but allow temporary overgrowth
- **Tuning:**
  - High-traffic: 30-60 minutes
  - Low-traffic: 120-360 minutes
  - Very low-traffic: 1440 minutes (daily)
- **Example:**
  ```toml
  cleanup_interval_minutes = 120
  ```

## Channels Section

Controls initial channel creation (seed channels).

### `seed_channels`
- **Type:** Array of {name, description} objects
- **Default:** 4 channels (general, tech, random, feedback)
- **Description:** Channels to create on first server startup
- **Notes:**
  - Only created if database is empty (first run)
  - Channel names must be unique, 3-50 characters, lowercase letters/numbers/hyphens
  - Description is optional, max 500 characters
  - All seed channels are forum type (type 1, threaded)
- **Example:**
  ```toml
  seed_channels = [
    { name = "announcements", description = "Server announcements and updates" },
    { name = "general", description = "General discussion" },
    { name = "help", description = "Get help with SuperChat" },
    { name = "meta", description = "Discuss the server itself" }
  ]
  ```

**To disable seed channels** (empty server on first start):
```toml
seed_channels = []
```

## Discovery Section

Controls server directory listing and discoverability.

### `directory_enabled`
- **Type:** Boolean
- **Default:** `true`
- **Description:** Enable directory mode (accept server announcements)
- **Notes:**
  - If `true`, this server acts as a directory (other servers can announce to it)
  - If `false`, this server does not accept announcements
  - Does not affect this server's ability to announce to other directories
- **Use case:**
  - Directory servers: `true` (e.g., superchat.win)
  - Regular servers: `true` or `false` (no effect)
- **Example:**
  ```toml
  directory_enabled = false  # Don't accept server listings
  ```

### `public_hostname`
- **Type:** String
- **Default:** `""` (auto-detect)
- **Description:** Public hostname/IP for directory listings
- **Notes:**
  - If empty, server auto-detects public IP
  - Should be the hostname/IP clients will use to connect
  - Include port if non-standard: `example.com:6465`
- **Example:**
  ```toml
  public_hostname = "chat.example.com"
  ```

### `server_name`
- **Type:** String
- **Default:** `"SuperChat Server"`
- **Description:** Human-readable server name for directory listings
- **Length:** Max 100 characters
- **Example:**
  ```toml
  server_name = "My Awesome Community"
  ```

### `server_description`
- **Type:** String
- **Default:** `"A SuperChat community server"`
- **Description:** Server description for directory listings
- **Length:** Max 500 characters
- **Example:**
  ```toml
  server_description = "A friendly community for discussing technology, science, and open source software."
  ```

### `max_users`
- **Type:** Integer
- **Default:** `0` (unlimited)
- **Description:** Maximum concurrent users (shown in directory)
- **Range:** 0-4294967295 (0 = unlimited)
- **Notes:**
  - This is informational for directory listings
  - Server does not enforce this limit (use `max_connections_per_ip` for rate limiting)
  - Helps users choose servers with capacity
- **Example:**
  ```toml
  max_users = 1000  # Show capacity of 1000 users
  ```

## Environment Variable Overrides

All configuration options can be overridden with environment variables.

**Format:** `SUPERCHAT_SECTION_KEY=value`

**Examples:**
```bash
# Server section
export SUPERCHAT_SERVER_TCP_PORT=7000
export SUPERCHAT_SERVER_SSH_PORT=7001
export SUPERCHAT_SERVER_HTTP_PORT=7002
export SUPERCHAT_SERVER_SSH_HOST_KEY="/etc/superchat/ssh_host_key"
export SUPERCHAT_SERVER_DATABASE_PATH="/var/lib/superchat/db.sqlite"

# Limits section
export SUPERCHAT_LIMITS_MAX_CONNECTIONS_PER_IP=50
export SUPERCHAT_LIMITS_MESSAGE_RATE_LIMIT=20
export SUPERCHAT_LIMITS_MAX_MESSAGE_LENGTH=8192
export SUPERCHAT_LIMITS_MAX_NICKNAME_LENGTH=30
export SUPERCHAT_LIMITS_SESSION_TIMEOUT_SECONDS=180

# Retention section
export SUPERCHAT_RETENTION_DEFAULT_RETENTION_HOURS=720
export SUPERCHAT_RETENTION_CLEANUP_INTERVAL_MINUTES=120

# Discovery section
export SUPERCHAT_DISCOVERY_DIRECTORY_ENABLED=true
export SUPERCHAT_DISCOVERY_PUBLIC_HOSTNAME="chat.example.com"
export SUPERCHAT_DISCOVERY_SERVER_NAME="My Server"
export SUPERCHAT_DISCOVERY_SERVER_DESCRIPTION="A friendly community"
export SUPERCHAT_DISCOVERY_MAX_USERS=1000

# Start server (env vars override config file)
scd --config /etc/superchat/config.toml
```

**Use case:** Docker containers, Kubernetes, CI/CD pipelines where env vars are easier than config files.

## Command-Line Flags

Override config file and environment variables with command-line flags.

### Available Flags

```bash
scd [flags]

Flags:
  --config PATH              Path to config file (default: ~/.superchat/config.toml)
  --port PORT               TCP port (overrides config tcp_port)
  --db PATH                 Database path (overrides config database_path)
  --debug                   Enable debug logging
  --version                 Show version and exit
  --disable-directory       Disable directory mode (don't accept announcements)
  --announce-to SERVERS     Announce to directory servers (comma-separated)
  --server-name NAME        Server name for directory listing
  --server-description DESC Server description for directory listing
```

### Examples

**Simple startup:**
```bash
scd
```

**Custom port:**
```bash
scd --port 7000
```

**Custom config and database:**
```bash
scd --config /etc/superchat/config.toml --db /var/lib/superchat/db.sqlite
```

**Debug logging:**
```bash
scd --debug
```

**Announce to directory server:**
```bash
scd --announce-to superchat.win:6465 \
    --server-name "My Community" \
    --server-description "A friendly place to chat"
```

**Disable directory (don't accept announcements):**
```bash
scd --disable-directory
```

## Example Configurations

### Development Environment

**Minimal local development:**
```toml
[server]
tcp_port = 6465
ssh_port = 6466
http_port = 6467
database_path = "./superchat.db"

[limits]
max_connections_per_ip = 100
message_rate_limit = 100
session_timeout_seconds = 300

[retention]
default_retention_hours = 24
cleanup_interval_minutes = 60

[channels]
seed_channels = [
  { name = "test", description = "Test channel" }
]

[discovery]
directory_enabled = false
```

### Small Community Server

**10-100 users, casual moderation:**
```toml
[server]
tcp_port = 6465
ssh_port = 6466
http_port = 6467
ssh_host_key = "/var/lib/superchat/ssh_host_key"
database_path = "/var/lib/superchat/superchat.db"

[limits]
max_connections_per_ip = 20
message_rate_limit = 15
max_message_length = 4096
session_timeout_seconds = 120

[retention]
default_retention_hours = 168  # 7 days
cleanup_interval_minutes = 60

[channels]
seed_channels = [
  { name = "general", description = "General discussion" },
  { name = "announcements", description = "Server announcements" },
  { name = "feedback", description = "Suggestions and bug reports" }
]

[discovery]
directory_enabled = true
public_hostname = "chat.example.com"
server_name = "Example Community"
server_description = "A friendly community for discussing technology and open source"
max_users = 100
```

### Large Public Server

**1000+ users, strict moderation:**
```toml
[server]
tcp_port = 6465
ssh_port = 6466
http_port = 6467
ssh_host_key = "/var/lib/superchat/ssh_host_key"
database_path = "/var/lib/superchat/superchat.db"

[limits]
max_connections_per_ip = 100  # Allow shared IPs (NAT, VPN)
message_rate_limit = 10  # Strict anti-spam
max_message_length = 4096
max_nickname_length = 20
session_timeout_seconds = 120

[retention]
default_retention_hours = 720  # 30 days
cleanup_interval_minutes = 30  # Frequent cleanup

[channels]
seed_channels = [
  { name = "welcome", description = "Welcome and rules" },
  { name = "general", description = "General discussion" },
  { name = "help", description = "Get help using SuperChat" }
]

[discovery]
directory_enabled = true
public_hostname = "chat.example.com"
server_name = "Large Public Community"
server_description = "A welcoming community for everyone"
max_users = 10000
```

### Private Internal Server

**Corporate/internal use, no public listing:**
```toml
[server]
tcp_port = 6465
ssh_port = 6466
http_port = 6467
ssh_host_key = "/var/lib/superchat/ssh_host_key"
database_path = "/var/lib/superchat/superchat.db"

[limits]
max_connections_per_ip = 200  # Many users behind corporate NAT
message_rate_limit = 30  # Internal users are trusted
max_message_length = 8192  # Allow longer messages
session_timeout_seconds = 300  # Lenient timeout

[retention]
default_retention_hours = 4320  # 180 days (compliance)
cleanup_interval_minutes = 1440  # Daily cleanup

[channels]
seed_channels = [
  { name = "announcements", description = "Company announcements" },
  { name = "general", description = "General discussion" },
  { name = "tech", description = "Technical discussions" },
  { name = "random", description = "Off-topic" }
]

[discovery]
directory_enabled = false  # Private server, no public listing
server_name = "Internal Chat"
server_description = "Internal company communication"
```

## Performance Tuning

### By Server Scale

**Small (< 100 users):**
- `max_connections_per_ip`: 20-50
- `message_rate_limit`: 10-20
- `session_timeout_seconds`: 120-180
- `cleanup_interval_minutes`: 60-120

**Medium (100-1000 users):**
- `max_connections_per_ip`: 50-100
- `message_rate_limit`: 10-15
- `session_timeout_seconds`: 120
- `cleanup_interval_minutes`: 30-60

**Large (1000-10000 users):**
- `max_connections_per_ip`: 100-200
- `message_rate_limit`: 5-10 (strict anti-spam)
- `session_timeout_seconds`: 90-120
- `cleanup_interval_minutes`: 15-30

**Very Large (10000+ users):**
- `max_connections_per_ip`: 200+
- `message_rate_limit`: 5-10
- `session_timeout_seconds`: 60-90
- `cleanup_interval_minutes`: 15
- **Note:** Current tested limit is ~10k concurrent connections (CPU-bound)

### Resource Optimization

**CPU-bound (high user count):**
- Reduce `cleanup_interval_minutes` to 60-120 (less frequent cleanup)
- Reduce `session_timeout_seconds` to 60-90 (faster cleanup of dead sessions)
- Consider horizontal scaling (V4 feature, not yet implemented)

**Memory-bound (limited RAM):**
- Reduce `max_connections_per_ip` (fewer concurrent sessions)
- Reduce `default_retention_hours` (smaller database)
- Increase `cleanup_interval_minutes` to 15-30 (more aggressive cleanup)

**Disk I/O-bound:**
- Increase `cleanup_interval_minutes` to 120+ (less frequent writes)
- Use SSD for database storage
- Consider WAL mode (SQLite default in SuperChat)

## Next Steps

- [DEPLOYMENT.md](DEPLOYMENT.md) - Server deployment guide
- [SECURITY.md](SECURITY.md) - Security hardening
- [MONITORING.md](MONITORING.md) - Monitoring configuration
- [BACKUP_AND_RECOVERY.md](BACKUP_AND_RECOVERY.md) - Backup strategies
