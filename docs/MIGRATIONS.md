# Database Migrations

SuperChat uses a simple migration system to evolve the database schema over time.

## How It Works

1. **Automatic Execution**: Migrations run automatically on server startup, before loading data into MemDB
2. **Automatic Backup**: Before applying any pending migrations, the database is automatically backed up
3. **Version Tracking**: Applied migrations are tracked in the `schema_migrations` table
4. **Embedded Files**: Migration SQL files are embedded in the binary using Go embed

## Migration Files

Migrations are stored in `pkg/database/migrations/` and follow this naming convention:

```
001_initial.sql
002_add_thread_root.sql
003_add_user_table.sql
```

### Format

- **Filename**: `<version>_<name>.sql` where version is a sequential integer
- **Version**: Must be unique and sequential (001, 002, 003, etc.)
- **Name**: Descriptive name using snake_case

### Example Migration

```sql
-- Add column for tracking message reactions
ALTER TABLE Message ADD COLUMN reactions TEXT;

-- Index for faster reaction queries
CREATE INDEX idx_messages_reactions ON Message(reactions) WHERE reactions IS NOT NULL;
```

## Creating a New Migration

### 1. Determine Next Version Number

```bash
# Check current version
sqlite3 ~/.superchat/superchat.db "SELECT MAX(version) FROM schema_migrations"
```

### 2. Create Migration File

Create a new file in `pkg/database/migrations/` with the next version number:

```bash
# Example: Creating migration 002
touch pkg/database/migrations/002_add_reactions.sql
```

### 3. Write Migration SQL

Write the SQL statements to modify the schema:

```sql
-- Add reactions support to messages
ALTER TABLE Message ADD COLUMN reactions TEXT;
CREATE INDEX IF NOT EXISTS idx_messages_reactions ON Message(reactions) WHERE reactions IS NOT NULL;
```

### 4. Test Migration

```bash
# Build the server
make build

# Run with a test database
./superchat-server --db /tmp/test.db --port 9999
```

Check the logs for:
```
Created database backup: test.db.backup-v1-20241006-123456
Running 1 pending migration(s) from version 1 to 2
Applied migration 2: add_reactions
```

### 5. Update Migration Path Tests

**CRITICAL**: Update `pkg/database/migration_path_test.go` to validate your migration!

```go
// In TestMigrationPath, add a new test case:
{
    name:        "v1 → v2: Add reactions",
    fromVersion: 1,
    toVersion:   2,
    setupData: func(db *sql.DB) error {
        // Create sample messages in v1 schema (without reactions)
        _, err := db.Exec(`
            INSERT INTO Channel (id, name, display_name, created_at, is_private)
            VALUES (1, 'test', 'Test', ?, 0)
        `, time.Now().UnixMilli())
        if err != nil {
            return err
        }

        _, err = db.Exec(`
            INSERT INTO Message (id, channel_id, author_nickname, content, created_at)
            VALUES (1, 1, 'user', 'Test message', ?)
        `, time.Now().UnixMilli())
        return err
    },
    validateData: func(db *sql.DB, t *testing.T) {
        // Verify old messages still exist and reactions column is NULL
        var content string
        var reactions *string
        err := db.QueryRow(`
            SELECT content, reactions FROM Message WHERE id = 1
        `).Scan(&content, &reactions)
        if err != nil {
            t.Fatalf("Failed to query message: %v", err)
        }
        if content != "Test message" {
            t.Errorf("Message content changed during migration")
        }
        if reactions != nil {
            t.Errorf("Expected NULL reactions, got %v", *reactions)
        }
    },
    validateSchema: func(db *sql.DB, t *testing.T) {
        // Verify reactions column exists
        var count int
        err := db.QueryRow(`
            SELECT COUNT(*) FROM pragma_table_info('Message')
            WHERE name='reactions'
        `).Scan(&count)
        if err != nil {
            t.Fatalf("Failed to check reactions column: %v", err)
        }
        if count != 1 {
            t.Errorf("reactions column not found after migration")
        }
    },
},
```

This ensures:
- Old data survives the migration ✓
- New column is added correctly ✓
- Default values are appropriate ✓

### 6. Run Tests

```bash
go test ./pkg/database -run TestMigrationPath -v
go test ./pkg/database -run TestFullMigrationPath -v
```

### 7. Commit

```bash
git add pkg/database/migrations/002_add_reactions.sql
git add pkg/database/migration_path_test.go
git commit -m "feat: add message reactions schema with migration tests"
```

## Backup Files

Before applying migrations, the system automatically creates a backup:

```
superchat.db.backup-v<version>-<timestamp>
```

Example: `superchat.db.backup-v1-20241006-143022`

### Restoring from Backup

If a migration fails or causes issues:

```bash
# Stop the server
pkill superchat-server

# Restore from backup
cp ~/.superchat/superchat.db.backup-v1-20241006-143022 ~/.superchat/superchat.db

# Restart server
./superchat-server
```

## Migration System Details

### Schema Migrations Table

```sql
CREATE TABLE schema_migrations (
    version INTEGER PRIMARY KEY,
    name TEXT NOT NULL,
    applied_at INTEGER NOT NULL  -- Unix timestamp in milliseconds
);
```

### Migration Process

1. Server starts and opens database connection
2. System checks `schema_migrations` table for current version
3. Loads all migration files from `pkg/database/migrations/`
4. Filters to pending migrations (version > current version)
5. **Creates backup** if pending migrations exist
6. Applies each migration in a transaction:
   - Executes SQL
   - Records migration in `schema_migrations`
   - Commits transaction
7. Continues to load MemDB

### Error Handling

- **Migration SQL fails**: Transaction rolls back, error returned, server stops
- **Backup fails**: Migration aborts, error returned, server stops
- **No pending migrations**: Logs "Database is up to date", continues normally

## V1 to V2 Migration Example

When adding V2 features (user registration, etc.), you would create migrations like:

```sql
-- 002_add_user_table.sql
CREATE TABLE User (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    nickname TEXT UNIQUE,
    registered INTEGER NOT NULL DEFAULT 0,
    password_hash TEXT,
    created_at INTEGER NOT NULL,
    last_seen INTEGER NOT NULL
);

-- 003_add_ssh_keys.sql
CREATE TABLE SSHKey (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    fingerprint TEXT UNIQUE NOT NULL,
    public_key TEXT NOT NULL,
    key_type TEXT NOT NULL,
    added_at INTEGER NOT NULL,
    FOREIGN KEY (user_id) REFERENCES User(id) ON DELETE CASCADE
);

-- 004_add_subchannels.sql
CREATE TABLE Subchannel (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    channel_id INTEGER NOT NULL,
    name TEXT NOT NULL,
    display_name TEXT NOT NULL,
    created_at INTEGER NOT NULL,
    FOREIGN KEY (channel_id) REFERENCES Channel(id) ON DELETE CASCADE
);
```

Each migration is applied in order, and the database automatically backs up before each set of changes.

## Best Practices

1. **Test migrations** on a copy of production data before deploying
2. **Keep migrations small** and focused on one change
3. **Use transactions** (automatic in our system)
4. **Never modify** existing migration files - create a new one to fix issues
5. **Include indexes** in the same migration as table changes
6. **Document complex migrations** with comments in the SQL
7. **ALWAYS update migration path tests** (`migration_path_test.go`) - this is required, not optional!
8. **Use IF NOT EXISTS** for backwards compatibility with existing databases
9. **Test data transformation** migrations with real data samples
10. **Commit migration + test together** so they're never out of sync

## Troubleshooting

### Migration Not Running

Check that:
- Filename follows `<version>_<name>.sql` pattern
- Version number is sequential
- File is in `pkg/database/migrations/` directory
- Binary was rebuilt after adding migration

### Multiple Servers

If running multiple server instances:
- First server to start will apply migrations
- Other servers will wait (SQLite busy timeout: 5 seconds)
- If backup takes a long time, increase busy timeout

### Corrupted Migration State

If `schema_migrations` table is corrupted:

```bash
# Connect to database
sqlite3 ~/.superchat/superchat.db

-- Check current state
SELECT * FROM schema_migrations;

-- Manually insert missing migration (if needed)
INSERT INTO schema_migrations (version, name, applied_at)
VALUES (1, 'initial', 1234567890000);
```
