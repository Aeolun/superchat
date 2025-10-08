# SuperChat Deployment Guide

Complete guide for deploying SuperChat server in production.

## Table of Contents

- [Prerequisites](#prerequisites)
- [Deployment Methods](#deployment-methods)
  - [Binary Installation (Recommended)](#binary-installation-recommended)
  - [Docker Deployment](#docker-deployment)
  - [Building from Source](#building-from-source)
- [Initial Setup](#initial-setup)
- [Process Management](#process-management)
- [Verification](#verification)
- [Quick Start Checklist](#quick-start-checklist)
- [Troubleshooting](#troubleshooting)

## Prerequisites

### System Requirements

**Minimum:**
- CPU: 1 core (2.0 GHz)
- RAM: 512 MB
- Disk: 1 GB free space
- OS: Linux (Ubuntu 20.04+, Debian 11+, CentOS 8+, Arch), macOS, FreeBSD

**Recommended for Production:**
- CPU: 4 cores (3.0 GHz+)
- RAM: 4 GB
- Disk: 10 GB free space (for logs and database)
- OS: Linux (Ubuntu 22.04 LTS or Debian 12)

**Performance Targets:**
- Up to 10,000 concurrent connections per server
- Average response time: ~75ms
- CPU is the limiting factor (not memory or I/O)

### Network Requirements

**Required Ports:**
- **6465** (TCP) - Binary protocol connections
- **6466** (TCP) - SSH connections (optional, for V2 SSH auth)
- **6467** (TCP) - WebSocket connections (HTTP/WS)

**Optional Ports:**
- **9090** (TCP) - Prometheus metrics (**NEVER expose publicly!**)
- **6060** (TCP) - pprof profiling (**NEVER expose publicly!**)

### Software Dependencies

- **For binary installation:** None (statically compiled binaries)
- **For Docker:** Docker 20.10+ and Docker Compose 2.0+
- **For source build:** Go 1.23+, make, git

### Firewall Configuration

**iptables example (Ubuntu/Debian):**
```bash
# Allow SuperChat ports
sudo iptables -A INPUT -p tcp --dport 6465 -j ACCEPT  # Binary TCP
sudo iptables -A INPUT -p tcp --dport 6466 -j ACCEPT  # SSH
sudo iptables -A INPUT -p tcp --dport 6467 -j ACCEPT  # WebSocket

# DENY metrics and profiling ports (security critical!)
sudo iptables -A INPUT -p tcp --dport 9090 -j DROP
sudo iptables -A INPUT -p tcp --dport 6060 -j DROP

# Save rules
sudo netfilter-persistent save
```

**ufw example (Ubuntu):**
```bash
sudo ufw allow 6465/tcp comment 'SuperChat Binary'
sudo ufw allow 6466/tcp comment 'SuperChat SSH'
sudo ufw allow 6467/tcp comment 'SuperChat WebSocket'
sudo ufw deny 9090/tcp comment 'SuperChat Metrics (internal only)'
sudo ufw deny 6060/tcp comment 'SuperChat pprof (internal only)'
sudo ufw enable
```

## Deployment Methods

### Binary Installation (Recommended)

Binary installation is the recommended method for production deployments.

#### 1. Create dedicated user (recommended)

```bash
# Create system user for SuperChat
sudo useradd -r -s /bin/false -d /var/lib/superchat superchat

# Create required directories
sudo mkdir -p /var/lib/superchat
sudo mkdir -p /etc/superchat
sudo chown superchat:superchat /var/lib/superchat
```

#### 2. Download and install binaries

**Automated installation (user-level):**
```bash
# Install to ~/.local/bin (no sudo required)
curl -fsSL https://raw.githubusercontent.com/aeolun/superchat/main/install.sh | sh
```

**Automated installation (system-wide):**
```bash
# Install to /usr/bin (requires sudo)
curl -fsSL https://raw.githubusercontent.com/aeolun/superchat/main/install.sh | sudo sh -s -- --global
```

**Manual installation:**
```bash
# Download latest release
VERSION="v1.0.0"  # Replace with latest version
OS="linux"        # linux, darwin, freebsd
ARCH="amd64"      # amd64, arm64

# Download server binary
curl -fsSL -o scd \
  "https://github.com/aeolun/superchat/releases/download/${VERSION}/superchat-server-${OS}-${ARCH}"

# Install binary
sudo mv scd /usr/local/bin/scd
sudo chmod +x /usr/local/bin/scd
sudo chown root:root /usr/local/bin/scd

# Verify installation
scd --version
```

#### 3. Create configuration file

```bash
# Create configuration
sudo tee /etc/superchat/config.toml > /dev/null <<'EOF'
[server]
tcp_port = 6465
ssh_port = 6466
websocket_port = 6467
database_path = "/var/lib/superchat/superchat.db"

[limits]
max_connections = 10000
rate_limit_messages_per_minute = 10
session_timeout_seconds = 60

[retention]
default_message_retention_hours = 168  # 7 days

[discovery]
enabled = true
server_name = "My SuperChat Server"
server_description = "A friendly SuperChat community"
EOF

sudo chown superchat:superchat /etc/superchat/config.toml
sudo chmod 600 /etc/superchat/config.toml
```

#### 4. Test server manually

```bash
# Test as superchat user
sudo -u superchat scd --config /etc/superchat/config.toml

# Server should start and show:
# SuperChat Server v1.0.0
# Binary TCP server listening on :6465
# SSH server listening on :6466
# WebSocket server listening on :6467
# Press Ctrl+C to stop

# Press Ctrl+C to stop
```

### Docker Deployment

Docker deployment provides isolation and easier management.

#### 1. Using Docker Compose (Recommended)

```bash
# Clone repository (for docker-compose.yml)
git clone https://github.com/aeolun/superchat.git
cd superchat

# Create data directory
mkdir -p data

# Start server
docker-compose up -d

# View logs
docker-compose logs -f

# Stop server
docker-compose down
```

**Custom docker-compose.yml:**
```yaml
version: '3.8'

services:
  superchat:
    image: ghcr.io/aeolun/superchat:latest
    container_name: superchat
    restart: unless-stopped
    ports:
      - "6465:6465"  # Binary TCP
      - "6466:6466"  # SSH
      - "6467:6467"  # WebSocket
    volumes:
      - ./data:/var/lib/superchat
      - ./config.toml:/etc/superchat/config.toml:ro
    environment:
      - SUPERCHAT_CONFIG=/etc/superchat/config.toml
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:9090/health"]
      interval: 30s
      timeout: 10s
      retries: 3
```

#### 2. Using Docker directly

```bash
# Pull image
docker pull ghcr.io/aeolun/superchat:latest

# Run server
docker run -d \
  --name superchat \
  --restart unless-stopped \
  -p 6465:6465 \
  -p 6466:6466 \
  -p 6467:6467 \
  -v $(pwd)/data:/var/lib/superchat \
  ghcr.io/aeolun/superchat:latest

# View logs
docker logs -f superchat

# Stop server
docker stop superchat
```

### Building from Source

For development or custom builds.

#### 1. Clone repository

```bash
git clone https://github.com/aeolun/superchat.git
cd superchat
```

#### 2. Build binaries

```bash
# Build both client and server
make build

# Output:
# ./superchat (client)
# ./superchat-server (server)

# Or build individually
go build -o scd ./cmd/server
go build -o sc ./cmd/client
```

#### 3. Run tests (optional)

```bash
# Run all tests
make test

# Run with coverage
make coverage

# Protocol package coverage (enforced 85%+)
make coverage-protocol
```

#### 4. Install binaries

```bash
# Install to /usr/local/bin
sudo make install

# Or copy manually
sudo cp superchat-server /usr/local/bin/scd
sudo cp superchat /usr/local/bin/sc
sudo chmod +x /usr/local/bin/{scd,sc}
```

## Initial Setup

### 1. Database Initialization

The database is automatically created on first startup.

**Location:** `/var/lib/superchat/superchat.db` (configurable)

**Automatic migrations:**
- Run on server startup before loading data
- Create timestamped backup before applying
- Track applied migrations in `schema_migrations` table

**Manual backup before first start (recommended):**
```bash
# No backup needed for first start (database doesn't exist yet)
# Backups are created automatically before migrations
```

### 2. Create Initial Channels

SuperChat doesn't create any channels by default. You must create them.

**Option A: Via SQL (before first start)**
```bash
# Create initial channels
sudo -u superchat sqlite3 /var/lib/superchat/superchat.db <<'EOF'
INSERT INTO Channel (name, display_name, description, channel_type, message_retention_hours, created_at)
VALUES
  ('general', 'General', 'General discussion', 1, 168, strftime('%s', 'now')),
  ('announcements', 'Announcements', 'Server announcements', 1, 720, strftime('%s', 'now'));
EOF
```

**Option B: Via client (after server is running)**
```bash
# Connect as admin user (requires registration + admin flag)
# 1. Register a user
# 2. Manually set admin flag in database:
sudo -u superchat sqlite3 /var/lib/superchat/superchat.db \
  "UPDATE User SET user_flags = 1 WHERE nickname = 'admin';"
# 3. Restart server to reload user data
# 4. Connect and create channels via UI (Ctrl+N)
```

**Option C: Via future admin CLI tool**
```bash
# TODO: Not yet implemented (see IMPROVEMENTS_ROADMAP.md item 28)
# superchat-admin channel create general --description "General discussion"
```

### 3. Configure Admin User

**Create admin user:**
```bash
# 1. Start server
sudo systemctl start superchat

# 2. Connect with client and register
sc --server localhost:6465
# Press Ctrl+R to register

# 3. Grant admin privileges (requires direct DB access)
sudo -u superchat sqlite3 /var/lib/superchat/superchat.db <<EOF
UPDATE User SET user_flags = 1 WHERE nickname = 'yourusername';
EOF

# 4. Restart server to reload user flags
sudo systemctl restart superchat
```

**Admin flag values:**
- `0x01` (1) - Admin (full privileges)
- `0x02` (2) - Moderator (message moderation)
- `0x03` (3) - Admin + Moderator (both)

## Process Management

### systemd Service (Recommended)

**Create service file:**
```bash
sudo tee /etc/systemd/system/superchat.service > /dev/null <<'EOF'
[Unit]
Description=SuperChat Server
After=network.target
Documentation=https://superchat.win/docs

[Service]
Type=simple
User=superchat
Group=superchat
WorkingDirectory=/var/lib/superchat

ExecStart=/usr/local/bin/scd --config /etc/superchat/config.toml

# Security hardening
NoNewPrivileges=true
PrivateTmp=true
ProtectSystem=strict
ProtectHome=true
ReadWritePaths=/var/lib/superchat
CapabilityBoundingSet=CAP_NET_BIND_SERVICE

# Resource limits
LimitNOFILE=65536
LimitNPROC=512

# Restart policy
Restart=on-failure
RestartSec=5s
StartLimitBurst=5
StartLimitIntervalSec=60s

# Logging
StandardOutput=journal
StandardError=journal
SyslogIdentifier=superchat

[Install]
WantedBy=multi-user.target
EOF
```

**Enable and start service:**
```bash
# Reload systemd
sudo systemctl daemon-reload

# Enable service (start on boot)
sudo systemctl enable superchat

# Start service
sudo systemctl start superchat

# Check status
sudo systemctl status superchat

# View logs
sudo journalctl -u superchat -f

# Restart service
sudo systemctl restart superchat

# Stop service
sudo systemctl stop superchat
```

### Manual Process Management (Development)

**Using tmux/screen:**
```bash
# Start in tmux session
tmux new -s superchat
scd --config /etc/superchat/config.toml
# Detach: Ctrl+B, then D

# Reattach
tmux attach -t superchat
```

**Background process:**
```bash
# Start in background
nohup scd --config /etc/superchat/config.toml > /var/log/superchat/server.log 2>&1 &

# Save PID
echo $! > /var/run/superchat.pid

# Stop server
kill $(cat /var/run/superchat.pid)
```

## Verification

### Quick Health Check

```bash
# 1. Check if server is listening
sudo netstat -tlnp | grep scd
# Should show:
# tcp6  0  0 :::6465  :::*  LISTEN  12345/scd
# tcp6  0  0 :::6466  :::*  LISTEN  12345/scd
# tcp6  0  0 :::6467  :::*  LISTEN  12345/scd

# 2. Check health endpoint
curl http://localhost:9090/health
# Should return: {"status":"ok","uptime":123,"sessions":0,"database":"ok","directory_enabled":true}

# 3. Test connection with client
sc --server localhost:6465
# Should connect successfully
```

### Comprehensive Verification

```bash
# 1. Binary TCP connection
telnet localhost 6465
# Should connect (press Ctrl+] then quit)

# 2. WebSocket connection
curl -i -N -H "Connection: Upgrade" -H "Upgrade: websocket" \
  -H "Sec-WebSocket-Version: 13" -H "Sec-WebSocket-Key: test" \
  http://localhost:6467/ws
# Should return HTTP 101 Switching Protocols

# 3. Database accessible
sudo -u superchat sqlite3 /var/lib/superchat/superchat.db "SELECT COUNT(*) FROM Channel;"
# Should return number of channels

# 4. Metrics endpoint (only from localhost!)
curl http://localhost:9090/metrics
# Should return Prometheus metrics

# 5. Check logs for errors
sudo journalctl -u superchat --since "10 minutes ago" | grep -i error
# Should return no errors
```

### Post-Deployment Checklist

- [ ] Server starts without errors
- [ ] All required ports are listening (6465, 6466, 6467)
- [ ] Firewall allows required ports, blocks metrics/pprof
- [ ] Health check endpoint returns `{"status":"ok"}`
- [ ] Client can connect successfully
- [ ] At least one channel exists
- [ ] Admin user can create channels
- [ ] Logs are being written
- [ ] systemd service restarts on failure
- [ ] Database backups are scheduled (see BACKUP_AND_RECOVERY.md)
- [ ] Monitoring is configured (see MONITORING.md)

## Quick Start Checklist

**30-Minute Production Deployment:**

1. **Provision server** (5 min)
   - Ubuntu 22.04 LTS, 4 CPU, 4 GB RAM
   - Configure firewall (6465, 6466, 6467 open; 9090, 6060 blocked)

2. **Install SuperChat** (5 min)
   ```bash
   curl -fsSL https://raw.githubusercontent.com/aeolun/superchat/main/install.sh | sudo sh -s -- --global
   sudo useradd -r -s /bin/false -d /var/lib/superchat superchat
   sudo mkdir -p /var/lib/superchat /etc/superchat
   sudo chown superchat:superchat /var/lib/superchat
   ```

3. **Configure** (5 min)
   ```bash
   # Create config (customize server name/description)
   sudo nano /etc/superchat/config.toml
   ```

4. **Create systemd service** (5 min)
   ```bash
   # Copy service file from this guide
   sudo systemctl daemon-reload
   sudo systemctl enable superchat
   sudo systemctl start superchat
   ```

5. **Create initial channels** (5 min)
   ```bash
   sudo -u superchat sqlite3 /var/lib/superchat/superchat.db <<'EOF'
   INSERT INTO Channel (name, display_name, description, channel_type, message_retention_hours, created_at)
   VALUES ('general', 'General', 'General discussion', 1, 168, strftime('%s', 'now'));
   EOF
   ```

6. **Verify** (5 min)
   ```bash
   sudo systemctl status superchat
   curl http://localhost:9090/health
   sc --server localhost:6465  # Test connection
   ```

**Done!** Your SuperChat server is running.

## Troubleshooting

### Server won't start

**Check logs:**
```bash
sudo journalctl -u superchat -n 50
```

**Common issues:**
- Port already in use: `sudo netstat -tlnp | grep 6465`
- Database locked: `sudo lsof /var/lib/superchat/superchat.db`
- Permission denied: `sudo chown -R superchat:superchat /var/lib/superchat`
- Migration failure: Check `/var/lib/superchat/superchat.db.backup-*` for backup

### Connection refused

**Check if server is listening:**
```bash
sudo netstat -tlnp | grep scd
```

**Check firewall:**
```bash
sudo ufw status
sudo iptables -L -n -v
```

**Test locally first:**
```bash
# From server
sc --server localhost:6465

# If works locally, issue is firewall/network
# If fails locally, issue is server configuration
```

### High CPU usage

**Check connection count:**
```bash
curl http://localhost:9090/metrics | grep superchat_active_sessions
```

**Profile CPU usage:**
```bash
# SSH tunnel to pprof (NEVER expose port 6060 publicly!)
ssh -L 6060:localhost:6060 user@server

# Capture 30s CPU profile
go tool pprof http://localhost:6060/debug/pprof/profile?seconds=30
```

See MONITORING.md for more troubleshooting guidance.

## Next Steps

- [CONFIGURATION.md](CONFIGURATION.md) - Complete configuration reference
- [SECURITY.md](SECURITY.md) - Security hardening guide
- [MONITORING.md](MONITORING.md) - Monitoring and observability
- [BACKUP_AND_RECOVERY.md](BACKUP_AND_RECOVERY.md) - Backup strategies

## Support

- GitHub Issues: https://github.com/aeolun/superchat/issues
- Documentation: https://superchat.win/docs
- Community: Connect to superchat.win with the client
