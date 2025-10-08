# SuperChat Security Guide

Complete security hardening guide for SuperChat server deployment.

## Table of Contents

- [Security Overview](#security-overview)
- [System Security](#system-security)
- [Network Security](#network-security)
- [Protocol Security](#protocol-security)
- [SSH Security](#ssh-security)
- [Rate Limiting](#rate-limiting)
- [Database Security](#database-security)
- [Monitoring for Abuse](#monitoring-for-abuse)
- [Attack Mitigation](#attack-mitigation)
- [Security Checklist](#security-checklist)

## Security Overview

Super Chat implements security through multiple layers:

1. **System-level:** Non-root user, file permissions, SELinux/AppArmor
2. **Network-level:** Firewall rules, port restrictions, reverse proxy options
3. **Protocol-level:** Frame size limits, session timeouts, input validation
4. **Application-level:** Rate limiting, authentication, authorization
5. **Data-level:** Password hashing (bcrypt), database permissions

**Threat Model:**
- DoS/DDoS attacks (resource exhaustion)
- Spam and flooding (message spam, connection spam)
- Information disclosure (metrics/pprof exposure)
- Unauthorized access (weak passwords, SSH key theft)
- Data breaches (database exposure)

## System Security

### Run as Non-Root User

**NEVER run SuperChat as root.** Create a dedicated system user.

```bash
# Create dedicated user
sudo useradd -r -s /bin/false -d /var/lib/superchat superchat

# Create directories
sudo mkdir -p /var/lib/superchat
sudo chown superchat:superchat /var/lib/superchat
sudo chmod 750 /var/lib/superchat
```

**Rationale:** If the server is compromised, the attacker is limited to the `superchat` user's permissions, not full system access.

### File Permissions

**Recommended permissions:**

```bash
# Config file (contains sensitive paths, but no secrets)
sudo chmod 640 /etc/superchat/config.toml
sudo chown superchat:superchat /etc/superchat/config.toml

# SSH host key (private key, highly sensitive!)
sudo chmod 600 /var/lib/superchat/ssh_host_key
sudo chown superchat:superchat /var/lib/superchat/ssh_host_key

# Database file
sudo chmod 640 /var/lib/superchat/superchat.db
sudo chown superchat:superchat /var/lib/superchat/superchat.db

# Data directory
sudo chmod 750 /var/lib/superchat
sudo chown superchat:superchat /var/lib/superchat

# Binary (world-executable, but not writable)
sudo chmod 755 /usr/local/bin/scd
sudo chown root:root /usr/local/bin/scd
```

**File permission checklist:**
- [ ] Config file: 640 (owner read/write, group read)
- [ ] SSH host key: 600 (owner read/write only)
- [ ] Database: 640 (owner read/write, group read)
- [ ] Data directory: 750 (owner full, group read/execute)
- [ ] Binary: 755 (world-executable, owner-writable)

### SELinux / AppArmor

**SELinux (RHEL/CentOS/Fedora):**

```bash
# Create SELinux policy (basic example)
sudo semanage fcontext -a -t bin_t '/usr/local/bin/scd'
sudo semanage port -a -t http_port_t -p tcp 6465
sudo semanage port -a -t ssh_port_t -p tcp 6466
sudo semanage port -a -t http_port_t -p tcp 6467
sudo restorecon -v /usr/local/bin/scd

# Set context for data directory
sudo semanage fcontext -a -t var_lib_t '/var/lib/superchat(/.*)?'
sudo restorecon -Rv /var/lib/superchat
```

**AppArmor (Ubuntu/Debian):**

Create `/etc/apparmor.d/usr.local.bin.scd`:

```
#include <tunables/global>

/usr/local/bin/scd {
  #include <abstractions/base>
  #include <abstractions/nameservice>

  # Binary
  /usr/local/bin/scd mr,

  # Config and data
  /etc/superchat/** r,
  /var/lib/superchat/** rw,

  # Temp files
  /tmp/** rw,

  # Network
  network inet stream,
  network inet6 stream,

  # Deny dangerous capabilities
  deny capability sys_admin,
  deny capability sys_module,
}
```

Enable AppArmor profile:
```bash
sudo apparmor_parser -r /etc/apparmor.d/usr.local.bin.scd
sudo aa-enforce /usr.local.bin.scd
```

### systemd Hardening

Add security directives to `/etc/systemd/system/superchat.service`:

```ini
[Service]
# ... other directives ...

# Security hardening
NoNewPrivileges=true
PrivateTmp=true
ProtectSystem=strict
ProtectHome=true
ReadWritePaths=/var/lib/superchat
CapabilityBoundingSet=CAP_NET_BIND_SERVICE
RestrictAddressFamilies=AF_INET AF_INET6
RestrictNamespaces=true
RestrictRealtime=true
RestrictSUIDSGID=true
LockPersonality=true
ProtectKernelTunables=true
ProtectKernelModules=true
ProtectControlGroups=true

# Resource limits
LimitNOFILE=65536
LimitNPROC=512
```

**What these do:**
- `NoNewPrivileges`: Prevents privilege escalation
- `PrivateTmp`: Isolates /tmp directory
- `ProtectSystem=strict`: Mounts /usr and /boot read-only
- `ReadWritePaths`: Only allows writes to /var/lib/superchat
- `CapabilityBoundingSet`: Limits Linux capabilities
- `RestrictNamespaces`: Prevents container breakout

## Network Security

### Firewall Rules

**Critical: NEVER expose ports 9090 (metrics) or 6060 (pprof) publicly!**

#### iptables (Traditional)

```bash
# Flush existing rules (CAREFUL in production!)
# sudo iptables -F

# Allow loopback
sudo iptables -A INPUT -i lo -j ACCEPT

# Allow established connections
sudo iptables -A INPUT -m state --state ESTABLISHED,RELATED -j ACCEPT

# Allow SuperChat ports
sudo iptables -A INPUT -p tcp --dport 6465 -j ACCEPT  # Binary TCP
sudo iptables -A INPUT -p tcp --dport 6466 -j ACCEPT  # SSH
sudo iptables -A INPUT -p tcp --dport 6467 -j ACCEPT  # WebSocket

# DENY metrics and profiling (even from external IPs)
sudo iptables -A INPUT -p tcp --dport 9090 -j DROP
sudo iptables -A INPUT -p tcp --dport 6060 -j DROP

# Allow SSH for management (adjust port if non-standard)
sudo iptables -A INPUT -p tcp --dport 22 -j ACCEPT

# Default: Drop all other input
sudo iptables -P INPUT DROP
sudo iptables -P FORWARD DROP
sudo iptables -P OUTPUT ACCEPT

# Save rules
sudo iptables-save | sudo tee /etc/iptables/rules.v4
```

#### ufw (Ubuntu/Debian)

```bash
# Reset (CAREFUL in production!)
# sudo ufw --force reset

# Default policies
sudo ufw default deny incoming
sudo ufw default allow outgoing

# Allow SuperChat ports
sudo ufw allow 6465/tcp comment 'SuperChat Binary'
sudo ufw allow 6466/tcp comment 'SuperChat SSH'
sudo ufw allow 6467/tcp comment 'SuperChat WebSocket'

# DENY metrics and profiling explicitly
sudo ufw deny 9090/tcp comment 'SuperChat Metrics (internal only)'
sudo ufw deny 6060/tcp comment 'SuperChat pprof (internal only)'

# Allow SSH for management
sudo ufw allow 22/tcp comment 'SSH management'

# Enable firewall
sudo ufw enable

# Verify rules
sudo ufw status numbered
```

#### firewalld (RHEL/CentOS/Fedora)

```bash
# Add SuperChat ports
sudo firewall-cmd --permanent --add-port=6465/tcp  # Binary TCP
sudo firewall-cmd --permanent --add-port=6466/tcp  # SSH
sudo firewall-cmd --permanent --add-port=6467/tcp  # WebSocket

# Block metrics and profiling
sudo firewall-cmd --permanent --add-rich-rule='rule family="ipv4" port port="9090" protocol="tcp" reject'
sudo firewall-cmd --permanent --add-rich-rule='rule family="ipv4" port port="6060" protocol="tcp" reject'

# Reload firewall
sudo firewall-cmd --reload

# Verify
sudo firewall-cmd --list-all
```

### Port Security

**Port Usage Summary:**

| Port | Protocol | Public? | Purpose | Security Level |
|------|----------|---------|---------|----------------|
| 6465 | TCP | ✅ Yes | Binary protocol connections | Public-facing |
| 6466 | TCP | ✅ Yes | SSH connections | Public-facing |
| 6467 | TCP | ✅ Yes | WebSocket connections | Public-facing |
| 9090 | HTTP | ❌ **NO!** | Prometheus metrics | **INTERNAL ONLY** |
| 6060 | HTTP | ❌ **NO!** | pprof profiling | **INTERNAL ONLY** |

**Why ports 9090 and 6060 must be blocked:**
- **Port 9090 (metrics):** Exposes server statistics, connection counts, error rates (information disclosure)
- **Port 6060 (pprof):** Exposes CPU/memory profiles, heap dumps, goroutine stacks (severe information disclosure, potential DoS)

**Accessing metrics/pprof safely:**

Use SSH tunneling:
```bash
# From your local machine
ssh -L 9090:localhost:9090 user@server

# Now access http://localhost:9090/metrics locally
curl http://localhost:9090/metrics
```

### Reverse Proxy Considerations

If using a reverse proxy (nginx, caddy, traefik):

**nginx example (WebSocket):**
```nginx
server {
    listen 80;
    server_name chat.example.com;

    # WebSocket upgrade
    location /ws {
        proxy_pass http://localhost:6467;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "Upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_read_timeout 3600s;
    }
}
```

**Security notes:**
- WebSocket endpoint (`/ws`) can be proxied
- Binary TCP (6465) and SSH (6466) cannot be proxied (not HTTP)
- Use HTTPS/WSS for WebSocket if reverse proxy supports it
- Set appropriate timeouts (`proxy_read_timeout`)

## Protocol Security

### Frame Size Limits

SuperChat enforces a **1MB maximum frame size** to prevent DoS attacks.

**What this prevents:**
- Memory exhaustion (attacker sends huge frames)
- Bandwidth exhaustion
- Processing delays

**Protocol enforcement:**
- Clients sending frames >1MB are disconnected
- Server rejects oversized messages before processing
- No user configuration needed (hardcoded for safety)

### Session Timeouts

**Default:** 120 seconds of inactivity

**How it works:**
- Client sends PING every 30 seconds
- Server expects activity every 120 seconds
- Inactive sessions are disconnected automatically

**Tuning (in config.toml):**
```toml
[limits]
session_timeout_seconds = 120  # 60-300 recommended
```

**Security impact:**
- Lower timeout: Faster cleanup of abandoned connections, but may disconnect slow clients
- Higher timeout: More lenient for slow networks, but resources held longer

### Input Validation

SuperChat validates all user input:

**Nickname validation:**
- Length: 3-20 characters (configurable max)
- Characters: Letters, numbers, `-`, `_`
- Reserved prefixes: `$` (admin), `@` (moderator), `~` (anonymous - server-assigned only)

**Message validation:**
- Max length: 4096 bytes (configurable)
- UTF-8 encoding enforced
- No null bytes

**Channel names:**
- Length: 3-50 characters
- Characters: Lowercase letters, numbers, hyphens
- Unique per server

**Validation is defense-in-depth:** Even if an attacker bypasses client-side validation, server-side validation rejects invalid input.

## SSH Security

### SSH Host Key Management

**Protect the SSH host key!**

```bash
# Set correct permissions
sudo chmod 600 /var/lib/superchat/ssh_host_key
sudo chown superchat:superchat /var/lib/superchat/ssh_host_key

# Backup the host key (important!)
sudo cp /var/lib/superchat/ssh_host_key /var/lib/superchat/ssh_host_key.backup
sudo chmod 600 /var/lib/superchat/ssh_host_key.backup
```

**Why this matters:**
- If host key is regenerated, all SSH clients see "host key changed" warnings
- Attackers could perform MITM attacks if they can replace the host key
- Losing the host key forces all SSH users to re-trust the server

**Host key rotation:**

If you must rotate the host key (e.g., after a breach):

```bash
# Backup old key
sudo mv /var/lib/superchat/ssh_host_key /var/lib/superchat/ssh_host_key.old

# Generate new key
sudo ssh-keygen -t ed25519 -f /var/lib/superchat/ssh_host_key -N ""
sudo chmod 600 /var/lib/superchat/ssh_host_key
sudo chown superchat:superchat /var/lib/superchat/ssh_host_key

# Restart server
sudo systemctl restart superchat

# Notify users: They will see "WARNING: REMOTE HOST IDENTIFICATION HAS CHANGED!"
# They must run: ssh-keygen -R chat.example.com:6466
```

### SSH Public Key Authentication

SuperChat uses **public key authentication only** (no passwords for SSH).

**Security benefits:**
- Immune to password brute-force
- Phishing-resistant
- Supports hardware keys (YubiKey, etc.)

**User key management:**

Users can add/remove their own SSH keys via the client UI:
- Press `Ctrl+K` to open SSH Key Manager
- Add keys: Paste public key or select key file
- List keys: View all registered keys
- Delete keys: Remove compromised/old keys
- Rename keys: Label keys for identification

**Admin key management (direct DB):**

```bash
# List all SSH keys
sudo -u superchat sqlite3 /var/lib/superchat/superchat.db \
  "SELECT user_id, name, fingerprint FROM SSHKey;"

# Delete a specific key
sudo -u superchat sqlite3 /var/lib/superchat/superchat.db \
  "DELETE FROM SSHKey WHERE fingerprint = 'SHA256:...';"

# Delete all keys for a user
sudo -u superchat sqlite3 /var/lib/superchat/superchat.db \
  "DELETE FROM SSHKey WHERE user_id = (SELECT id FROM User WHERE nickname = 'username');"
```

### SSH Auto-Registration Rate Limiting

**TODO:** SSH auto-registration is not currently rate-limited (see V2.md).

**Current behavior:**
- Users connecting via SSH with unknown keys are auto-registered
- No rate limit on auto-registration (potential DoS vector)

**Planned mitigation (not yet implemented):**
- Rate limit auto-registrations to X per IP per hour
- Log auto-registration attempts for monitoring
- Implement CAPTCHA or proof-of-work for auto-registration

**Temporary workaround:**
- Disable SSH auto-registration via code change (requires rebuild)
- Use firewall rate limiting on port 6466:
  ```bash
  sudo iptables -A INPUT -p tcp --dport 6466 -m state --state NEW -m recent --set
  sudo iptables -A INPUT -p tcp --dport 6466 -m state --state NEW -m recent --update --seconds 60 --hitcount 10 -j DROP
  ```

## Rate Limiting

### Message Rate Limiting

**Default:** 10 messages per minute per session

**Configuration:**
```toml
[limits]
message_rate_limit = 10  # messages per minute
```

**How it works:**
- Sliding window: Tracks messages sent in the last 60 seconds
- Per-session: Each connection has independent rate limit
- Exceeded limit: Server returns ERROR 1003 (rate limit exceeded)

**Tuning recommendations:**
- Anti-spam (strict): 5-10 messages/min
- Balanced: 10-20 messages/min
- Chat-heavy: 30-60 messages/min
- Internal (trusted): 100+ messages/min

### Connection Rate Limiting

**Default:** 10 connections per IP

**Configuration:**
```toml
[limits]
max_connections_per_ip = 10
```

**What this prevents:**
- Connection flooding (DoS via connection exhaustion)
- Single-IP abuse (one attacker opening thousands of connections)

**Considerations:**
- Shared IPs (NAT, VPN): Increase limit (50-200)
- Public servers: Balance between usability and security
- Corporate/internal: High limit (200+) for NAT

### Firewall-Level Rate Limiting

**Additional protection: Firewall rate limiting**

**iptables (connection rate limiting):**
```bash
# Limit new connections to 10/minute per IP
sudo iptables -A INPUT -p tcp --dport 6465 -m state --state NEW -m recent --set
sudo iptables -A INPUT -p tcp --dport 6465 -m state --state NEW -m recent --update --seconds 60 --hitcount 10 -j DROP

# Same for SSH and WebSocket
sudo iptables -A INPUT -p tcp --dport 6466 -m state --state NEW -m recent --set
sudo iptables -A INPUT -p tcp --dport 6466 -m state --state NEW -m recent --update --seconds 60 --hitcount 10 -j DROP

sudo iptables -A INPUT -p tcp --dport 6467 -m state --state NEW -m recent --set
sudo iptables -A INPUT -p tcp --dport 6467 -m state --state NEW -m recent --update --seconds 60 --hitcount 10 -j DROP
```

## Database Security

### Password Hashing

SuperChat uses **bcrypt with cost 10** for password hashing.

**Security properties:**
- Slow hashing (prevents brute-force)
- Unique salt per password
- Adaptive cost (can increase in future)

**User password table:**
```sql
CREATE TABLE User (
  id INTEGER PRIMARY KEY,
  nickname TEXT UNIQUE NOT NULL,
  password_hash TEXT,  -- bcrypt hash, NULL for SSH-only users
  ...
);
```

**Hashing implementation:**
```go
import "golang.org/x/crypto/bcrypt"

// Hashing
hash, err := bcrypt.GenerateFromPassword([]byte(password), 10)

// Verification
err := bcrypt.CompareHashAndPassword(hash, []byte(password))
```

**Password policy (enforced client-side):**
- Minimum 8 characters
- No maximum (bcrypt handles long passwords)
- No complexity requirements (length > complexity for security)

**Admin recommendation:** Encourage users to use password managers (diceware passphrases, random strings, etc.).

### Database File Permissions

```bash
# Database file: Read/write for superchat user only
sudo chmod 640 /var/lib/superchat/superchat.db
sudo chown superchat:superchat /var/lib/superchat/superchat.db

# WAL and SHM files (created by SQLite)
sudo chmod 640 /var/lib/superchat/superchat.db-wal
sudo chmod 640 /var/lib/superchat/superchat.db-shm
```

**Why this matters:**
- Database contains password hashes (bcrypt, but still sensitive)
- User data (messages, nicknames, SSH keys)
- Unauthorized access could allow data exfiltration

### Database Encryption at Rest

**SuperChat does not encrypt the database by default.**

**Options for encryption at rest:**

1. **Full-disk encryption (LUKS):**
   ```bash
   # Encrypt the partition containing /var/lib/superchat
   sudo cryptsetup luksFormat /dev/sdX
   sudo cryptsetup open /dev/sdX superchat_data
   sudo mkfs.ext4 /dev/mapper/superchat_data
   sudo mount /dev/mapper/superchat_data /var/lib/superchat
   ```

2. **SQLite encryption extensions:**
   - SQLCipher: Transparent database encryption
   - Requires recompiling SuperChat with SQLCipher support (not default)

3. **Filesystem-level encryption (eCryptfs, EncFS):**
   ```bash
   # Mount encrypted filesystem for /var/lib/superchat
   sudo mount -t ecryptfs /var/lib/superchat /var/lib/superchat
   ```

**Recommendation:** Use full-disk encryption (LUKS) for simplicity and performance.

## Monitoring for Abuse

### Log Monitoring

**Monitor for suspicious patterns:**

```bash
# High connection rate from single IP
sudo journalctl -u superchat | grep "Connection from" | awk '{print $NF}' | sort | uniq -c | sort -rn

# Rate limit violations
sudo journalctl -u superchat | grep "rate limit exceeded"

# Failed authentication attempts
sudo journalctl -u superchat | grep "authentication failed"

# SSH key mismatches
sudo journalctl -u superchat | grep "public key does not match"
```

**Automated alerts (syslog + monitoring tool):**

Use Prometheus alerts or log aggregation (see MONITORING.md).

### Metrics Monitoring

**Key metrics to watch (via Prometheus on port 9090):**

```bash
# Active sessions (sudden spike = potential DoS)
curl -s http://localhost:9090/metrics | grep superchat_active_sessions

# Message rate (sudden spike = spam attack)
curl -s http://localhost:9090/metrics | grep superchat_messages_received_total

# Error rate (high rate = attack or bug)
curl -s http://localhost:9090/metrics | grep superchat_errors_total

# Goroutine count (increasing = goroutine leak)
curl -s http://localhost:9090/metrics | grep go_goroutines
```

See MONITORING.md for full Prometheus/Grafana setup.

## Attack Mitigation

### Denial of Service (DoS)

**Attack vectors:**
1. Connection flooding (many connections from single IP)
2. Message flooding (spam messages)
3. Large frame attacks (send 1MB frames repeatedly)

**Mitigations:**
- [x] Max connections per IP (configurable)
- [x] Message rate limiting (per session)
- [x] Frame size limit (1MB hardcoded)
- [x] Session timeout (disconnect inactive sessions)
- [ ] Firewall rate limiting (manual setup)
- [ ] DDoS protection (Cloudflare, AWS Shield, etc. for HTTP/WS only)

**Note:** Binary TCP (port 6465) and SSH (port 6466) cannot use Cloudflare/CDN. Use firewall-level DDoS protection.

### Distributed Denial of Service (DDoS)

**SuperChat is vulnerable to DDoS without additional protection.**

**Mitigations:**
1. **Firewall-level rate limiting:** (see "Firewall-Level Rate Limiting" above)
2. **Cloud DDoS protection:** AWS Shield, Cloudflare Spectrum (Layer 4)
3. **Upstream filtering:** ISP-level DDoS mitigation
4. **Overprovisioning:** Rent more server capacity than needed

**For WebSocket connections (port 6467):**
- Can use Cloudflare Proxy (HTTP-based, supports WebSocket)
- Enable "Under Attack" mode during DDoS

### Spam and Flooding

**Attack:** User sends many messages to spam channels.

**Mitigations:**
- [x] Message rate limiting (10 msg/min default)
- [x] Max message length (4096 bytes default)
- [ ] Admin tools for message deletion (manual SQL)
- [ ] Automatic spam detection (not implemented)

**Manual spam cleanup:**

```bash
# Soft-delete messages from a user
sudo -u superchat sqlite3 /var/lib/superchat/superchat.db \
  "UPDATE Message SET deleted_at = strftime('%s', 'now') WHERE author_user_id = X;"

# Hard-delete messages (permanent)
sudo -u superchat sqlite3 /var/lib/superchat/superchat.db \
  "DELETE FROM Message WHERE author_user_id = X;"

# Ban user (delete user record - harsh)
sudo -u superchat sqlite3 /var/lib/superchat/superchat.db \
  "DELETE FROM User WHERE id = X;"
```

### Information Disclosure

**Attack:** Attacker accesses metrics/pprof endpoints.

**Mitigations:**
- [x] Firewall blocks ports 9090 and 6060
- [x] Metrics only on localhost by default
- [x] SSH tunneling for safe access
- [ ] Authentication for metrics (not implemented - use firewall)

**Verify firewall:**
```bash
# Should timeout or be refused
curl http://your-server-ip:9090/metrics
curl http://your-server-ip:6060/debug/pprof/
```

### Man-in-the-Middle (MITM)

**Attack:** Attacker intercepts client-server communication.

**SuperChat does not encrypt binary TCP connections (port 6465).**

**Mitigations:**
- [x] SSH connections (port 6466) are encrypted via SSH transport
- [x] WebSocket can use WSS (HTTPS/TLS) via reverse proxy
- [ ] TLS for binary TCP (not implemented)
  - V3 future feature: Add TLS support

**Current recommendations:**
- Use SSH connections for security-sensitive deployments
- Use WebSocket over HTTPS (WSS) via reverse proxy
- Binary TCP is unencrypted (use on trusted networks only)

## Security Checklist

### Pre-Deployment

- [ ] Server runs as non-root user (`superchat`)
- [ ] File permissions set correctly (640 for configs/db, 600 for SSH key)
- [ ] Firewall configured (allow 6465, 6466, 6467; deny 9090, 6060)
- [ ] SELinux or AppArmor enabled and configured
- [ ] systemd service hardened (`NoNewPrivileges`, `ProtectSystem`, etc.)
- [ ] SSH host key generated and backed up
- [ ] Database file permissions set (640, owned by superchat)
- [ ] Config file reviewed (no default passwords, correct paths)

### Post-Deployment

- [ ] Verify ports are accessible (6465, 6466, 6467)
- [ ] Verify metrics port is NOT accessible externally (9090)
- [ ] Verify pprof port is NOT accessible externally (6060)
- [ ] Test connection from client (sc --server your-server:6465)
- [ ] Test SSH connection (sc --server ssh://user@your-server:6466)
- [ ] Test WebSocket connection (sc --server ws://your-server:6467)
- [ ] Monitor logs for errors (sudo journalctl -u superchat -f)
- [ ] Set up monitoring (Prometheus alerts)
- [ ] Set up backups (automated daily backups)
- [ ] Document SSH host key fingerprint (for user verification)

### Ongoing Maintenance

- [ ] Review logs weekly for suspicious activity
- [ ] Monitor metrics for unusual spikes
- [ ] Update SuperChat to latest version (security patches)
- [ ] Rotate SSH host key annually (or after breach)
- [ ] Review user accounts monthly (delete inactive/spam accounts)
- [ ] Test backups quarterly (restore from backup)
- [ ] Review firewall rules quarterly (ensure 9090/6060 still blocked)

## Next Steps

- [DEPLOYMENT.md](DEPLOYMENT.md) - Server deployment guide
- [CONFIGURATION.md](CONFIGURATION.md) - Configuration reference
- [MONITORING.md](MONITORING.md) - Monitoring and alerting
- [BACKUP_AND_RECOVERY.md](BACKUP_AND_RECOVERY.md) - Backup strategies
