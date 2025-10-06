package database

import (
	"database/sql"
	"os"
	"path/filepath"
	"testing"

	_ "modernc.org/sqlite"
)

func TestMigrations(t *testing.T) {
	// Create temporary directory for test databases
	tmpDir := t.TempDir()
	dbPath := filepath.Join(tmpDir, "test.db")

	// Open database (should run migration 001)
	db, err := Open(dbPath)
	if err != nil {
		t.Fatalf("Failed to open database: %v", err)
	}
	defer db.Close()

	// Check that schema_migrations table exists
	var tableName string
	err = db.conn.QueryRow("SELECT name FROM sqlite_master WHERE type='table' AND name='schema_migrations'").Scan(&tableName)
	if err != nil {
		t.Fatalf("schema_migrations table not found: %v", err)
	}

	// Check that migration 001 was applied
	var version int
	var name string
	err = db.conn.QueryRow("SELECT version, name FROM schema_migrations WHERE version=1").Scan(&version, &name)
	if err != nil {
		t.Fatalf("Migration 001 not found: %v", err)
	}
	if version != 1 {
		t.Errorf("Expected version 1, got %d", version)
	}
	if name != "initial" {
		t.Errorf("Expected name 'initial', got '%s'", name)
	}

	// Check that all tables were created
	tables := []string{"Channel", "Session", "Message", "MessageVersion"}
	for _, table := range tables {
		var count int
		err := db.conn.QueryRow("SELECT COUNT(*) FROM sqlite_master WHERE type='table' AND name=?", table).Scan(&count)
		if err != nil {
			t.Fatalf("Failed to check for table %s: %v", table, err)
		}
		if count != 1 {
			t.Errorf("Table %s not found", table)
		}
	}
}

func TestMigrationBackup(t *testing.T) {
	// Create temporary directory for test databases
	tmpDir := t.TempDir()
	dbPath := filepath.Join(tmpDir, "test.db")

	// Create initial database without migration system (simulate old version)
	conn, err := sql.Open("sqlite", dbPath)
	if err != nil {
		t.Fatalf("Failed to create database: %v", err)
	}

	// Create a simple table
	_, err = conn.Exec("CREATE TABLE test_table (id INTEGER PRIMARY KEY)")
	if err != nil {
		t.Fatalf("Failed to create test table: %v", err)
	}
	conn.Close()

	// Now open with migration system (should create backup)
	db, err := Open(dbPath)
	if err != nil {
		t.Fatalf("Failed to open database: %v", err)
	}
	defer db.Close()

	// Check that backup file was created
	files, err := os.ReadDir(tmpDir)
	if err != nil {
		t.Fatalf("Failed to read temp directory: %v", err)
	}

	backupFound := false
	for _, file := range files {
		// Backup file should be named like: test.db.backup-v0-<timestamp>
		if len(file.Name()) > len("test.db.backup") && file.Name()[:len("test.db.backup")] == "test.db.backup" {
			backupFound = true
			break
		}
	}

	if !backupFound {
		var fileNames []string
		for _, f := range files {
			fileNames = append(fileNames, f.Name())
		}
		t.Errorf("Backup file not created. Found files: %v", fileNames)
	}
}

func TestMigrationIdempotent(t *testing.T) {
	// Create temporary directory for test databases
	tmpDir := t.TempDir()
	dbPath := filepath.Join(tmpDir, "test.db")

	// Open database first time
	db1, err := Open(dbPath)
	if err != nil {
		t.Fatalf("Failed to open database first time: %v", err)
	}
	db1.Close()

	// Get migration count
	conn, err := sql.Open("sqlite", dbPath)
	if err != nil {
		t.Fatalf("Failed to open database: %v", err)
	}
	defer conn.Close()

	var count1 int
	err = conn.QueryRow("SELECT COUNT(*) FROM schema_migrations").Scan(&count1)
	if err != nil {
		t.Fatalf("Failed to count migrations: %v", err)
	}

	conn.Close()

	// Open database second time
	db2, err := Open(dbPath)
	if err != nil {
		t.Fatalf("Failed to open database second time: %v", err)
	}
	defer db2.Close()

	// Get migration count again
	var count2 int
	err = db2.conn.QueryRow("SELECT COUNT(*) FROM schema_migrations").Scan(&count2)
	if err != nil {
		t.Fatalf("Failed to count migrations second time: %v", err)
	}

	// Should be the same (migrations should not re-run)
	if count1 != count2 {
		t.Errorf("Migration count changed: %d -> %d (migrations re-ran)", count1, count2)
	}
}

func TestLoadMigrations(t *testing.T) {
	migrations, err := loadMigrations()
	if err != nil {
		t.Fatalf("Failed to load migrations: %v", err)
	}

	if len(migrations) == 0 {
		t.Fatalf("No migrations found")
	}

	// Check that migrations are sorted by version
	for i := 0; i < len(migrations)-1; i++ {
		if migrations[i].Version >= migrations[i+1].Version {
			t.Errorf("Migrations not sorted: %d >= %d", migrations[i].Version, migrations[i+1].Version)
		}
	}

	// Check that migration 001 exists
	found := false
	for _, m := range migrations {
		if m.Version == 1 && m.Name == "initial" {
			found = true
			if m.SQL == "" {
				t.Errorf("Migration 001 has empty SQL")
			}
			break
		}
	}
	if !found {
		t.Errorf("Migration 001 (initial) not found")
	}
}
