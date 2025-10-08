# SuperChat Backup and Recovery Guide

Complete guide for backing up and restoring SuperChat server data.

## Table of Contents

- [What to Backup](#what-to-backup)
- [Database Backup Strategies](#database-backup-strategies)
- [Automatic Migration Backups](#automatic-migration-backups)
- [Backup Automation](#backup-automation)
- [Off-Site Backups](#off-site-backups)
- [Recovery Procedures](#recovery-procedures)
- [Testing Backups](#testing-backups)
- [Disaster Recovery Scenarios](#disaster-recovery-scenarios)

## What to Backup

### Critical Data (Must Backup)

**1. Database File**
- **Location:** `~/.local/share/superchat/superchat.db` or `$XDG_DATA_HOME/superchat/superchat.db`
- **Contains:** All messages, users, channels, SSH keys, message history
- **Backup frequency:** Daily (minimum), hourly (recommended for active servers)
- **Retention:** 7-30 days minimum

**2. SSH Host Key**
- **Location:** `~/.superchat/ssh_host_key` or configured path
- **Contains:** Server's SSH private key
- **Backup frequency:** Once (after generation), then whenever rotated
- **Retention:** Permanent (until rotated)
- **Critical:** Losing this requires all SSH users to re-trust the server

### Important Data (Should Backup)

**3. Configuration File**
- **Location:** `~/.superchat/config.toml` or `/etc/superchat/config.toml`
- **Contains:** Server settings, rate limits, retention policy
- **Backup frequency:** After changes
- **Retention:** Keep historical versions for rollback

**4. Log Files (Optional)**
- **Location:** `~/.local/share/superchat/*.log`
- **Contains:** Server activity, errors, debug info
- **Backup frequency:** Weekly (or use log rotation + archival)
- **Retention:** 30-90 days for compliance/debugging

### Backup Priority

| Item | Priority | Frequency | Retention | Size |
|------|----------|-----------|-----------|------|
| Database | **Critical** | Hourly | 30 days | Varies (MB-GB) |
| SSH Host Key | **Critical** | Once | Permanent | 4KB |
| Config File | Important | On change | 1 year | 1KB |
| Log Files | Optional | Weekly | 90 days | MB-GB |

## Database Backup Strategies

### Hot Backup (Recommended)

**Hot backup** = Backup while server is running.

**Method 1: SQLite `.backup` command (Best)**

```bash
#!/bin/bash
# hot-backup.sh - Hot backup using SQLite .backup command

set -e

DB_PATH="/var/lib/superchat/superchat.db"
BACKUP_DIR="/var/backups/superchat"
TIMESTAMP=$(date +%Y%m%d-%H%M%S)
BACKUP_FILE="$BACKUP_DIR/superchat-$TIMESTAMP.db"

# Ensure backup directory exists
mkdir -p "$BACKUP_DIR"

# Perform hot backup using SQLite .backup
sqlite3 "$DB_PATH" ".backup '$BACKUP_FILE'"

# Verify backup integrity
if sqlite3 "$BACKUP_FILE" "PRAGMA integrity_check;" | grep -q "ok"; then
  echo "Backup successful: $BACKUP_FILE"

  # Compress backup
  gzip "$BACKUP_FILE"
  echo "Compressed: $BACKUP_FILE.gz"
else
  echo "ERROR: Backup verification failed!"
  rm -f "$BACKUP_FILE"
  exit 1
fi
```

**Benefits:**
- Consistent backup (SQLite handles locking)
- Works while server is running
- No downtime required

**Method 2: WAL checkpoint + file copy**

```bash
#!/bin/bash
# wal-checkpoint-backup.sh

set -e

DB_PATH="/var/lib/superchat/superchat.db"
BACKUP_DIR="/var/backups/superchat"
TIMESTAMP=$(date +%Y%m%d-%H%M%S)

mkdir -p "$BACKUP_DIR"

# Checkpoint WAL (merge WAL into main database)
sqlite3 "$DB_PATH" "PRAGMA wal_checkpoint(FULL);"

# Copy database file
cp "$DB_PATH" "$BACKUP_DIR/superchat-$TIMESTAMP.db"

# Verify
sqlite3 "$BACKUP_DIR/superchat-$TIMESTAMP.db" "PRAGMA integrity_check;"

# Compress
gzip "$BACKUP_DIR/superchat-$TIMESTAMP.db"
```

**Note:** This method may briefly block writes during checkpoint.

### Cold Backup

**Cold backup** = Backup while server is stopped.

```bash
#!/bin/bash
# cold-backup.sh

set -e

DB_PATH="/var/lib/superchat/superchat.db"
BACKUP_DIR="/var/backups/superchat"
TIMESTAMP=$(date +%Y%m%d-%H%M%S)

# Stop server
sudo systemctl stop superchat

# Copy database
cp "$DB_PATH" "$BACKUP_DIR/superchat-$TIMESTAMP.db"

# Restart server
sudo systemctl start superchat

# Compress backup
gzip "$BACKUP_DIR/superchat-$TIMESTAMP.db"
```

**Use case:** Maintenance windows, low-traffic periods.

### Incremental Backup (Advanced)

**Using WAL mode for incremental backups:**

SQLite's WAL (Write-Ahead Log) mode allows incremental backups by backing up the WAL file.

```bash
# Main database backup (full)
cp /var/lib/superchat/superchat.db /backups/superchat.db

# Incremental: Backup WAL file
cp /var/lib/superchat/superchat.db-wal /backups/superchat-$(date +%H%M).db-wal

# To restore: Copy both main + WAL files, then checkpoint
```

**Note:** SuperChat uses WAL mode by default.

## Automatic Migration Backups

SuperChat **automatically creates backups before applying migrations**.

### Backup Format

**Filename:** `superchat.db.backup-v{version}-{timestamp}`

**Example:** `superchat.db.backup-v1-20250108-143022`

**Location:** Same directory as database file

### How It Works

1. Server starts
2. Checks for pending migrations
3. **Before applying:** Creates timestamped backup
4. Applies migrations
5. If migration fails: Backup remains for manual restoration

### Example

```
/var/lib/superchat/
├── superchat.db                          # Current database (v3)
├── superchat.db.backup-v1-20250101-120000  # Backup before v2 migration
├── superchat.db.backup-v2-20250105-140000  # Backup before v3 migration
└── superchat.db-wal                      # WAL file (if server running)
```

### Manual Cleanup

Migration backups persist indefinitely. Clean up old backups manually:

```bash
# List migration backups
ls -lh /var/lib/superchat/*.backup-*

# Delete backups older than 90 days
find /var/lib/superchat -name "*.backup-*" -mtime +90 -delete
```

**Recommendation:** Keep at least 2 most recent migration backups permanently (in case you need to rollback multiple versions).

## Backup Automation

### Cron Job (Hourly Backups)

Create `/etc/cron.d/superchat-backup`:

```bash
# SuperChat hourly backup
0 * * * * superchat /usr/local/bin/superchat-backup.sh >> /var/log/superchat-backup.log 2>&1
```

**Backup script** (`/usr/local/bin/superchat-backup.sh`):

```bash
#!/bin/bash
# superchat-backup.sh - Automated database backup with rotation

set -e

DB_PATH="/var/lib/superchat/superchat.db"
BACKUP_DIR="/var/backups/superchat"
RETENTION_DAYS=30

# Ensure backup directory exists
mkdir -p "$BACKUP_DIR"

# Timestamp for backup file
TIMESTAMP=$(date +%Y%m%d-%H%M%S)
BACKUP_FILE="$BACKUP_DIR/superchat-$TIMESTAMP.db"

# Perform backup
if sqlite3 "$DB_PATH" ".backup '$BACKUP_FILE'" 2>&1; then
  # Verify backup
  if sqlite3 "$BACKUP_FILE" "PRAGMA integrity_check;" | grep -q "ok"; then
    # Compress
    gzip "$BACKUP_FILE"
    echo "[$(date)] Backup successful: $BACKUP_FILE.gz"

    # Rotate old backups (delete files older than RETENTION_DAYS)
    find "$BACKUP_DIR" -name "superchat-*.db.gz" -mtime +$RETENTION_DAYS -delete
    echo "[$(date)] Rotated backups (retention: $RETENTION_DAYS days)"
  else
    echo "[$(date)] ERROR: Backup verification failed!"
    rm -f "$BACKUP_FILE"
    exit 1
  fi
else
  echo "[$(date)] ERROR: Backup command failed!"
  exit 1
fi
```

**Make executable:**
```bash
sudo chmod +x /usr/local/bin/superchat-backup.sh
```

### systemd Timer (Alternative to Cron)

**Service file** (`/etc/systemd/system/superchat-backup.service`):

```ini
[Unit]
Description=SuperChat Database Backup
After=network.target

[Service]
Type=oneshot
User=superchat
ExecStart=/usr/local/bin/superchat-backup.sh
StandardOutput=journal
StandardError=journal
```

**Timer file** (`/etc/systemd/system/superchat-backup.timer`):

```ini
[Unit]
Description=SuperChat Backup Timer (Hourly)

[Timer]
OnCalendar=hourly
Persistent=true

[Install]
WantedBy=timers.target
```

**Enable timer:**
```bash
sudo systemctl daemon-reload
sudo systemctl enable superchat-backup.timer
sudo systemctl start superchat-backup.timer

# Check timer status
sudo systemctl list-timers | grep superchat-backup
```

## Off-Site Backups

**Critical:** Always maintain off-site backups (separate from server).

### rsync to Remote Server

```bash
#!/bin/bash
# offsite-sync.sh - Sync backups to remote server

BACKUP_DIR="/var/backups/superchat"
REMOTE_USER="backup"
REMOTE_HOST="backup.example.com"
REMOTE_DIR="/backups/superchat"

# Sync backups via rsync over SSH
rsync -avz --delete \
  "$BACKUP_DIR/" \
  "$REMOTE_USER@$REMOTE_HOST:$REMOTE_DIR/"

# Sync SSH host key (once per day is enough)
if [ $(date +%H) -eq 03 ]; then
  rsync -avz /var/lib/superchat/ssh_host_key \
    "$REMOTE_USER@$REMOTE_HOST:$REMOTE_DIR/ssh_host_key.backup"
fi
```

**Run daily at 2 AM:**
```bash
# /etc/cron.d/superchat-offsite
0 2 * * * superchat /usr/local/bin/offsite-sync.sh >> /var/log/offsite-sync.log 2>&1
```

### S3 / Object Storage

```bash
#!/bin/bash
# s3-backup.sh - Upload backups to S3

BACKUP_DIR="/var/backups/superchat"
S3_BUCKET="s3://my-backups/superchat/"

# Upload all .gz files to S3
aws s3 sync "$BACKUP_DIR" "$S3_BUCKET" \
  --exclude "*" \
  --include "*.db.gz" \
  --storage-class STANDARD_IA

# Upload SSH host key
aws s3 cp /var/lib/superchat/ssh_host_key \
  "$S3_BUCKET/ssh_host_key.backup"
```

**Prerequisites:**
```bash
sudo apt-get install awscli
aws configure  # Set access key, secret, region
```

### Backup to External Drive

```bash
#!/bin/bash
# external-backup.sh - Copy to mounted external drive

BACKUP_DIR="/var/backups/superchat"
EXTERNAL="/mnt/backup-drive/superchat"

# Check if external drive is mounted
if mountpoint -q /mnt/backup-drive; then
  # Copy backups
  rsync -avz "$BACKUP_DIR/" "$EXTERNAL/"
  echo "[$(date)] External backup successful"
else
  echo "[$(date)] ERROR: External drive not mounted!"
  exit 1
fi
```

## Recovery Procedures

### Scenario 1: Restore from Regular Backup

**When:** Database corruption, accidental deletion, rolling back changes.

**Steps:**

```bash
# 1. Stop server
sudo systemctl stop superchat

# 2. Move current database (don't delete yet!)
sudo mv /var/lib/superchat/superchat.db /var/lib/superchat/superchat.db.corrupted

# 3. Decompress backup
sudo gunzip -c /var/backups/superchat/superchat-20250108-140000.db.gz > /var/lib/superchat/superchat.db

# 4. Verify integrity
sudo -u superchat sqlite3 /var/lib/superchat/superchat.db "PRAGMA integrity_check;"
# Should output: ok

# 5. Set ownership
sudo chown superchat:superchat /var/lib/superchat/superchat.db
sudo chmod 640 /var/lib/superchat/superchat.db

# 6. Start server
sudo systemctl start superchat

# 7. Verify server started
sudo systemctl status superchat

# 8. Test connection
sc --server localhost:6465
```

**Data loss:** Any messages posted between backup time and restore time are lost.

### Scenario 2: Restore from Migration Backup

**When:** Migration failed, need to rollback schema version.

**Steps:**

```bash
# 1. Stop server
sudo systemctl stop superchat

# 2. List available migration backups
ls -lh /var/lib/superchat/*.backup-*

# Example output:
# superchat.db.backup-v1-20250101-120000
# superchat.db.backup-v2-20250105-140000

# 3. Choose backup (e.g., v2 to rollback from v3)
sudo cp /var/lib/superchat/superchat.db.backup-v2-20250105-140000 /var/lib/superchat/superchat.db

# 4. Verify
sudo -u superchat sqlite3 /var/lib/superchat/superchat.db "PRAGMA integrity_check;"

# 5. Start server
sudo systemctl start superchat
```

**Warning:** Server will attempt to re-apply migrations on next startup. If the failed migration keeps failing, you'll need to fix the migration SQL or manually apply schema changes.

### Scenario 3: Database Corruption Recovery

**When:** `PRAGMA integrity_check` fails, SQLite reports corruption.

**Option A: Restore from backup (preferred)**

Follow "Scenario 1: Restore from Regular Backup" above.

**Option B: SQLite .recover (last resort)**

```bash
# 1. Stop server
sudo systemctl stop superchat

# 2. Attempt to recover data
sudo -u superchat sqlite3 /var/lib/superchat/superchat.db ".recover" | \
  sudo -u superchat sqlite3 /var/lib/superchat/superchat-recovered.db

# 3. Verify recovered database
sudo -u superchat sqlite3 /var/lib/superchat/superchat-recovered.db "PRAGMA integrity_check;"

# 4. If OK, replace corrupted database
sudo mv /var/lib/superchat/superchat.db /var/lib/superchat/superchat.db.corrupted
sudo mv /var/lib/superchat/superchat-recovered.db /var/lib/superchat/superchat.db

# 5. Start server
sudo systemctl start superchat
```

**Warning:** `.recover` may lose data. Use backups instead if possible.

### Scenario 4: Complete Server Failure

**When:** Hardware failure, server loss, moving to new hardware.

**Steps:**

```bash
# On new server:

# 1. Install SuperChat
curl -fsSL https://raw.githubusercontent.com/aeolun/superchat/main/install.sh | sudo sh -s -- --global

# 2. Create directories
sudo useradd -r -s /bin/false -d /var/lib/superchat superchat
sudo mkdir -p /var/lib/superchat /etc/superchat
sudo chown superchat:superchat /var/lib/superchat

# 3. Restore configuration
sudo cp /path/to/backup/config.toml /etc/superchat/config.toml
sudo chown superchat:superchat /etc/superchat/config.toml
sudo chmod 640 /etc/superchat/config.toml

# 4. Restore SSH host key (CRITICAL!)
sudo cp /path/to/backup/ssh_host_key /var/lib/superchat/ssh_host_key
sudo chown superchat:superchat /var/lib/superchat/ssh_host_key
sudo chmod 600 /var/lib/superchat/ssh_host_key

# 5. Restore database
sudo gunzip -c /path/to/backup/superchat-latest.db.gz > /var/lib/superchat/superchat.db
sudo chown superchat:superchat /var/lib/superchat/superchat.db
sudo chmod 640 /var/lib/superchat/superchat.db

# 6. Set up systemd service
# (copy from DEPLOYMENT.md)

# 7. Start server
sudo systemctl start superchat

# 8. Verify
sudo systemctl status superchat
sc --server localhost:6465
```

**RTO (Recovery Time Objective):** ~15-30 minutes with good backups.

**RPO (Recovery Point Objective):** Last backup (1 hour with hourly backups).

## Testing Backups

**Critical:** Untested backups are not backups!

### Monthly Restore Test

**Schedule:** Run on first day of each month.

```bash
#!/bin/bash
# test-restore.sh - Verify backup can be restored

set -e

BACKUP_FILE=$(ls -t /var/backups/superchat/*.db.gz | head -1)
TEST_DB="/tmp/superchat-restore-test.db"

echo "Testing restore of: $BACKUP_FILE"

# Decompress
gunzip -c "$BACKUP_FILE" > "$TEST_DB"

# Verify integrity
if sqlite3 "$TEST_DB" "PRAGMA integrity_check;" | grep -q "ok"; then
  echo "✓ Backup integrity OK"
else
  echo "✗ Backup integrity FAILED!"
  rm -f "$TEST_DB"
  exit 1
fi

# Check schema version
VERSION=$(sqlite3 "$TEST_DB" "SELECT MAX(version) FROM schema_migrations;")
echo "✓ Schema version: $VERSION"

# Check record counts
USERS=$(sqlite3 "$TEST_DB" "SELECT COUNT(*) FROM User;")
CHANNELS=$(sqlite3 "$TEST_DB" "SELECT COUNT(*) FROM Channel;")
MESSAGES=$(sqlite3 "$TEST_DB" "SELECT COUNT(*) FROM Message;")

echo "✓ Users: $USERS"
echo "✓ Channels: $CHANNELS"
echo "✓ Messages: $MESSAGES"

# Cleanup
rm -f "$TEST_DB"

echo "✓ Backup restore test PASSED"
```

**Add to cron:**
```bash
# /etc/cron.d/superchat-restore-test
0 3 1 * * root /usr/local/bin/test-restore.sh >> /var/log/restore-test.log 2>&1
```

### Quarterly Disaster Recovery Drill

**Full server rebuild test:**

1. Provision new VM/container
2. Restore from backup (follow "Scenario 4: Complete Server Failure")
3. Verify all functionality:
   - Client can connect
   - Messages can be posted
   - SSH authentication works
   - User registration works
4. Document time taken (RTO)
5. Document any issues encountered

**Goal:** Complete recovery in < 30 minutes.

## Disaster Recovery Scenarios

### Lost SSH Host Key

**Impact:** All SSH clients see "WARNING: REMOTE HOST IDENTIFICATION HAS CHANGED!" error.

**Recovery:**

1. **If you have backup:** Restore SSH host key from backup (see "Scenario 4")
2. **If no backup:** Generate new key (users must re-trust server):

```bash
sudo ssh-keygen -t ed25519 -f /var/lib/superchat/ssh_host_key -N ""
sudo chmod 600 /var/lib/superchat/ssh_host_key
sudo chown superchat:superchat /var/lib/superchat/ssh_host_key
sudo systemctl restart superchat

# Notify users: They must run:
# ssh-keygen -R chat.example.com:6466
```

**Prevention:** Always backup SSH host key to off-site location.

### Database Size Exceeds Disk Space

**Impact:** Server can't write new messages, database may become corrupted.

**Recovery:**

1. Immediately stop writes:
```bash
# Emergency: Stop server to prevent corruption
sudo systemctl stop superchat
```

2. Free up space:
```bash
# Delete old migration backups
sudo find /var/lib/superchat -name "*.backup-*" -mtime +30 -delete

# Compress old log files
sudo gzip /var/lib/superchat/*.log

# Move backups to external storage
sudo mv /var/backups/superchat/*.db.gz /mnt/external/
```

3. Reduce retention (if appropriate):
```toml
# /etc/superchat/config.toml
[retention]
default_retention_hours = 72  # Reduce from 168 (7 days) to 72 (3 days)
```

4. Restart server and run cleanup:
```bash
sudo systemctl start superchat
# Wait for retention cleanup to run (every 60 minutes by default)
```

**Prevention:** Monitor disk usage, set up alerts at 80% full.

### All Backups Corrupted/Lost

**Impact:** Cannot restore from backup.

**Recovery:**

1. Attempt SQLite .recover (see "Scenario 3: Database Corruption Recovery")
2. Check for WAL file (`superchat.db-wal`):
```bash
# If WAL exists, checkpoint it
sqlite3 /var/lib/superchat/superchat.db "PRAGMA wal_checkpoint(FULL);"
```
3. Check for migration backups (automatic backups before migrations)
4. Last resort: Start fresh database (data loss)

**Prevention:**
- Multiple backup locations (local + off-site)
- Test backups monthly
- Monitor backup success/failure

## Next Steps

- [DEPLOYMENT.md](DEPLOYMENT.md) - Server deployment guide
- [CONFIGURATION.md](CONFIGURATION.md) - Configuration reference
- [SECURITY.md](SECURITY.md) - Security hardening
- [MONITORING.md](MONITORING.md) - Monitoring and observability
