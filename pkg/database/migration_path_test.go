package database

import (
	"database/sql"
	"path/filepath"
	"testing"
	"time"

	_ "modernc.org/sqlite"
)

// TestMigrationPath validates the complete migration path from v0 to latest version.
//
// IMPORTANT: This test MUST be updated every time you add a new migration!
//
// When adding migration N:
// 1. Add a new test case in migrationTests for version N-1 → N
// 2. Create sample data in the "before" state (version N-1 schema)
// 3. Validate data integrity after migration to version N
// 4. Check that data transformations work correctly
//
// This ensures:
// - Old data survives schema changes
// - Data transformations are correct
// - No data loss during migration
// - Full migration path works end-to-end
func TestMigrationPath(t *testing.T) {
	// Test cases for each migration step
	// IMPORTANT: Add new test case for each migration you create!
	migrationTests := []struct {
		name             string
		fromVersion      int
		toVersion        int
		setupData        func(db *sql.DB) error           // Create data in old schema
		validateData     func(db *sql.DB, t *testing.T)   // Verify data after migration
		validateSchema   func(db *sql.DB, t *testing.T)   // Verify schema changes
	}{
		{
			name:        "v0 → v1: Initial schema creation",
			fromVersion: 0,
			toVersion:   1,
			setupData: func(db *sql.DB) error {
				// v0 has no schema - fresh database
				return nil
			},
			validateData: func(db *sql.DB, t *testing.T) {
				// No data to validate in initial migration
			},
			validateSchema: func(db *sql.DB, t *testing.T) {
				// Check all v1 tables exist
				tables := []string{"Channel", "Session", "Message", "MessageVersion", "schema_migrations"}
				for _, table := range tables {
					var count int
					err := db.QueryRow("SELECT COUNT(*) FROM sqlite_master WHERE type='table' AND name=?", table).Scan(&count)
					if err != nil {
						t.Fatalf("Failed to check table %s: %v", table, err)
					}
					if count != 1 {
						t.Errorf("Table %s not found after migration to v1", table)
					}
				}

				// Check key indexes exist
				indexes := []string{
					"idx_messages_channel",
					"idx_messages_parent",
					"idx_messages_thread_root",
					"idx_messages_retention",
					"idx_sessions_activity",
				}
				for _, index := range indexes {
					var count int
					err := db.QueryRow("SELECT COUNT(*) FROM sqlite_master WHERE type='index' AND name=?", index).Scan(&count)
					if err != nil {
						t.Fatalf("Failed to check index %s: %v", index, err)
					}
					if count != 1 {
						t.Errorf("Index %s not found after migration to v1", index)
					}
				}
			},
		},

		{
			name:        "v1 → v2/v3: Add user registration and user-created channels",
			fromVersion: 1,
			toVersion:   3,
			setupData: func(db *sql.DB) error {
				// Create sample data in v1 schema
				now := time.Now().UnixMilli()

				// Insert channels
				_, err := db.Exec(`
					INSERT INTO Channel (id, name, display_name, created_at, is_private)
					VALUES (1, 'general', 'General', ?, 0)
				`, now)
				if err != nil {
					return err
				}

				// Insert anonymous messages (no author_user_id - this is v1)
				_, err = db.Exec(`
					INSERT INTO Message (id, channel_id, author_nickname, content, created_at)
					VALUES (1, 1, 'anonymous1', 'First anonymous message', ?)
				`, now)
				if err != nil {
					return err
				}

				_, err = db.Exec(`
					INSERT INTO Message (id, channel_id, author_nickname, content, created_at)
					VALUES (2, 1, 'anonymous2', 'Second anonymous message', ?)
				`, now)
				return err
			},
			validateData: func(db *sql.DB, t *testing.T) {
				// Verify anonymous messages still exist and author_user_id is NULL
				var count int
				err := db.QueryRow(`
					SELECT COUNT(*) FROM Message
					WHERE author_user_id IS NULL
				`).Scan(&count)
				if err != nil {
					t.Fatalf("Failed to query messages: %v", err)
				}
				if count != 2 {
					t.Errorf("Expected 2 anonymous messages with NULL author_user_id, got %d", count)
				}

				// Verify both specific messages survived migration
				var nickname string
				err = db.QueryRow(`
					SELECT author_nickname FROM Message WHERE id = 1
				`).Scan(&nickname)
				if err != nil {
					t.Fatalf("Failed to query message 1: %v", err)
				}
				if nickname != "anonymous1" {
					t.Errorf("Expected nickname 'anonymous1', got %q", nickname)
				}

				// Test that we can insert a registered user (v2 feature)
				_, err = db.Exec(`
					INSERT INTO User (nickname, user_flags, password_hash, created_at, last_seen)
					VALUES ('testuser', 0, 'hash123', ?, ?)
				`, time.Now().UnixMilli(), time.Now().UnixMilli())
				if err != nil {
					t.Fatalf("Failed to insert user in v2: %v", err)
				}
			},
			validateSchema: func(db *sql.DB, t *testing.T) {
				// Verify User table was created
				var count int
				err := db.QueryRow("SELECT COUNT(*) FROM sqlite_master WHERE type='table' AND name='User'").Scan(&count)
				if err != nil {
					t.Fatalf("Failed to check User table: %v", err)
				}
				if count != 1 {
					t.Errorf("User table not found after migration to v2")
				}

				// Verify User table has correct columns
				columns := []string{"id", "nickname", "user_flags", "password_hash", "created_at", "last_seen"}
				for _, col := range columns {
					var colCount int
					err := db.QueryRow(`
						SELECT COUNT(*) FROM pragma_table_info('User')
						WHERE name = ?
					`, col).Scan(&colCount)
					if err != nil {
						t.Fatalf("Failed to check column %s: %v", col, err)
					}
					if colCount != 1 {
						t.Errorf("Column %s not found in User table", col)
					}
				}

				// Verify nickname index exists
				var idxCount int
				err = db.QueryRow("SELECT COUNT(*) FROM sqlite_master WHERE type='index' AND name='idx_users_nickname'").Scan(&idxCount)
				if err != nil {
					t.Fatalf("Failed to check index: %v", err)
				}
				if idxCount != 1 {
					t.Errorf("idx_users_nickname index not found after migration to v2")
				}
			},
		},

		// WHEN ADDING MIGRATION 003:
		/*
		{
			name:        "v2 → v3: Add subchannels",
			fromVersion: 2,
			toVersion:   3,
			setupData: func(db *sql.DB) error {
				// Create data that should survive subchannel addition
				// ...
			},
			validateData: func(db *sql.DB, t *testing.T) {
				// Verify existing messages have NULL subchannel_id
				// ...
			},
			validateSchema: func(db *sql.DB, t *testing.T) {
				// Verify Subchannel table exists
				// ...
			},
		},
		*/
	}

	for _, tt := range migrationTests {
		t.Run(tt.name, func(t *testing.T) {
			// Create temporary database
			tmpDir := t.TempDir()
			dbPath := filepath.Join(tmpDir, "test.db")

			// Open raw connection without migration system
			rawDB, err := sql.Open("sqlite", dbPath)
			if err != nil {
				t.Fatalf("Failed to open database: %v", err)
			}

			// Enable foreign keys
			if _, err := rawDB.Exec("PRAGMA foreign_keys = ON"); err != nil {
				rawDB.Close()
				t.Fatalf("Failed to enable foreign keys: %v", err)
			}

			// If fromVersion > 0, we need to apply previous migrations manually
			if tt.fromVersion > 0 {
				// Initialize migration table
				if err := initMigrations(rawDB); err != nil {
					rawDB.Close()
					t.Fatalf("Failed to init migrations: %v", err)
				}

				// Load and apply migrations up to fromVersion
				migrations, err := loadMigrations()
				if err != nil {
					rawDB.Close()
					t.Fatalf("Failed to load migrations: %v", err)
				}

				for _, m := range migrations {
					if m.Version <= tt.fromVersion {
						if err := applyMigration(rawDB, m); err != nil {
							rawDB.Close()
							t.Fatalf("Failed to apply migration %d: %v", m.Version, err)
						}
					}
				}
			}

			// Setup test data in old schema
			if err := tt.setupData(rawDB); err != nil {
				rawDB.Close()
				t.Fatalf("Failed to setup test data: %v", err)
			}

			rawDB.Close()

			// Now open with full migration system (will migrate to latest)
			db, err := Open(dbPath)
			if err != nil {
				t.Fatalf("Failed to open database with migrations: %v", err)
			}
			defer db.Close()

			// Validate schema changes
			tt.validateSchema(db.conn, t)

			// Validate data integrity
			tt.validateData(db.conn, t)

			// Verify we're at expected version
			version, err := getCurrentVersion(db.conn)
			if err != nil {
				t.Fatalf("Failed to get current version: %v", err)
			}
			if version < tt.toVersion {
				t.Errorf("Expected version >= %d, got %d", tt.toVersion, version)
			}
		})
	}
}

// TestFullMigrationPath tests the complete migration path from v0 to latest
// by running through all migrations in sequence with sample data.
//
// IMPORTANT: Update this test when adding migrations that transform data!
func TestFullMigrationPath(t *testing.T) {
	tmpDir := t.TempDir()
	dbPath := filepath.Join(tmpDir, "test.db")

	// Start with v0 (empty database)
	rawDB, err := sql.Open("sqlite", dbPath)
	if err != nil {
		t.Fatalf("Failed to open database: %v", err)
	}
	rawDB.Close()

	// Open with migration system (applies all migrations)
	db, err := Open(dbPath)
	if err != nil {
		t.Fatalf("Failed to open database: %v", err)
	}
	defer db.Close()

	// Insert sample data in current schema
	// This data will be used to test future migrations
	now := time.Now().UnixMilli()

	// Create a channel
	_, err = db.writeConn.Exec(`
		INSERT INTO Channel (id, name, display_name, created_at, is_private)
		VALUES (1, 'general', 'General Discussion', ?, 0)
	`, now)
	if err != nil {
		t.Fatalf("Failed to insert channel: %v", err)
	}

	// Create a session
	_, err = db.writeConn.Exec(`
		INSERT INTO Session (id, nickname, connection_type, connected_at, last_activity)
		VALUES (1, 'testuser', 'tcp', ?, ?)
	`, now, now)
	if err != nil {
		t.Fatalf("Failed to insert session: %v", err)
	}

	// Create a root message
	_, err = db.writeConn.Exec(`
		INSERT INTO Message (id, channel_id, author_nickname, content, created_at)
		VALUES (1, 1, 'testuser', 'Root message', ?)
	`, now)
	if err != nil {
		t.Fatalf("Failed to insert message: %v", err)
	}

	// Create a reply
	_, err = db.writeConn.Exec(`
		INSERT INTO Message (id, channel_id, parent_id, thread_root_id, author_nickname, content, created_at)
		VALUES (2, 1, 1, 1, 'testuser', 'Reply message', ?)
	`, now)
	if err != nil {
		t.Fatalf("Failed to insert reply: %v", err)
	}

	// Verify data exists
	var messageCount int
	err = db.conn.QueryRow("SELECT COUNT(*) FROM Message").Scan(&messageCount)
	if err != nil {
		t.Fatalf("Failed to count messages: %v", err)
	}
	if messageCount != 2 {
		t.Errorf("Expected 2 messages, got %d", messageCount)
	}

	// Get current version
	version, err := getCurrentVersion(db.conn)
	if err != nil {
		t.Fatalf("Failed to get version: %v", err)
	}
	t.Logf("Database migrated successfully to version %d", version)

	// Validate v2+ features if present
	if version >= 2 {
		// Verify User table exists
		var tableCount int
		err = db.conn.QueryRow("SELECT COUNT(*) FROM sqlite_master WHERE type='table' AND name='User'").Scan(&tableCount)
		if err != nil {
			t.Fatalf("Failed to check User table: %v", err)
		}
		if tableCount != 1 {
			t.Errorf("User table not found in v2+")
		}

		// Verify anonymous messages still have NULL author_user_id
		var nullUserCount int
		err = db.conn.QueryRow(`
			SELECT COUNT(*) FROM Message WHERE author_user_id IS NULL
		`).Scan(&nullUserCount)
		if err != nil {
			t.Fatalf("Failed to check null user_id: %v", err)
		}
		if nullUserCount != 2 {
			t.Errorf("Expected 2 messages with NULL author_user_id, got %d", nullUserCount)
		}
	}
}
