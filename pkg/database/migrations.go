package database

import (
	"database/sql"
	"embed"
	"fmt"
	"io"
	"log"
	"os"
	"path/filepath"
	"sort"
	"strings"
	"time"
)

//go:embed migrations/*.sql
var migrationFiles embed.FS

// Migration represents a database migration
type Migration struct {
	Version int
	Name    string
	SQL     string
}

// initMigrations ensures the schema_migrations table exists
func initMigrations(db *sql.DB) error {
	_, err := db.Exec(`
		CREATE TABLE IF NOT EXISTS schema_migrations (
			version INTEGER PRIMARY KEY,
			name TEXT NOT NULL,
			applied_at INTEGER NOT NULL
		)
	`)
	return err
}

// getCurrentVersion returns the current schema version
func getCurrentVersion(db *sql.DB) (int, error) {
	var version int
	err := db.QueryRow("SELECT COALESCE(MAX(version), 0) FROM schema_migrations").Scan(&version)
	if err != nil {
		return 0, err
	}
	return version, nil
}

// loadMigrations loads all migration files from the embedded filesystem
func loadMigrations() ([]Migration, error) {
	entries, err := migrationFiles.ReadDir("migrations")
	if err != nil {
		return nil, fmt.Errorf("failed to read migrations directory: %w", err)
	}

	var migrations []Migration
	for _, entry := range entries {
		if entry.IsDir() || !strings.HasSuffix(entry.Name(), ".sql") {
			continue
		}

		// Parse filename: 001_initial.sql
		name := entry.Name()
		var version int

		// Try versioned format: 001_name.sql
		if _, err := fmt.Sscanf(name, "%d_", &version); err != nil {
			continue // Skip files that don't match version pattern
		}

		// Extract name (everything between version and .sql)
		parts := strings.SplitN(name, "_", 2)
		if len(parts) != 2 {
			continue
		}
		migrationName := strings.TrimSuffix(parts[1], ".sql")

		// Read the SQL content
		content, err := migrationFiles.ReadFile("migrations/" + name)
		if err != nil {
			return nil, fmt.Errorf("failed to read migration %s: %w", name, err)
		}

		migrations = append(migrations, Migration{
			Version: version,
			Name:    migrationName,
			SQL:     string(content),
		})
	}

	// Sort by version
	sort.Slice(migrations, func(i, j int) bool {
		return migrations[i].Version < migrations[j].Version
	})

	return migrations, nil
}

// backupDatabase creates a backup of the database file before migrations
func backupDatabase(dbPath string, currentVersion int) error {
	// Don't backup if database doesn't exist yet
	if _, err := os.Stat(dbPath); os.IsNotExist(err) {
		return nil
	}

	// Create backup filename with version and timestamp
	backupPath := fmt.Sprintf("%s.backup-v%d-%s", dbPath, currentVersion, time.Now().Format("20060102-150405"))

	// Copy database file
	src, err := os.Open(dbPath)
	if err != nil {
		return fmt.Errorf("failed to open database for backup: %w", err)
	}
	defer src.Close()

	dst, err := os.Create(backupPath)
	if err != nil {
		return fmt.Errorf("failed to create backup file: %w", err)
	}
	defer dst.Close()

	if _, err := io.Copy(dst, src); err != nil {
		return fmt.Errorf("failed to copy database: %w", err)
	}

	log.Printf("Created database backup: %s", filepath.Base(backupPath))
	return nil
}

// runMigrations runs all pending migrations
func runMigrations(db *sql.DB, dbPath string) error {
	// Ensure migrations table exists
	if err := initMigrations(db); err != nil {
		return fmt.Errorf("failed to initialize migrations table: %w", err)
	}

	// Get current version
	currentVersion, err := getCurrentVersion(db)
	if err != nil {
		return fmt.Errorf("failed to get current version: %w", err)
	}

	// Load all migrations
	migrations, err := loadMigrations()
	if err != nil {
		return fmt.Errorf("failed to load migrations: %w", err)
	}

	// Filter to pending migrations
	var pending []Migration
	for _, m := range migrations {
		if m.Version > currentVersion {
			pending = append(pending, m)
		}
	}

	if len(pending) == 0 {
		log.Printf("Database is up to date (version %d)", currentVersion)
		return nil
	}

	// Backup database before migrating
	if err := backupDatabase(dbPath, currentVersion); err != nil {
		return fmt.Errorf("failed to backup database: %w", err)
	}

	log.Printf("Running %d pending migration(s) from version %d to %d",
		len(pending), currentVersion, pending[len(pending)-1].Version)

	// Apply each migration in a transaction
	for _, m := range pending {
		if err := applyMigration(db, m); err != nil {
			return fmt.Errorf("failed to apply migration %d (%s): %w\nRestore from backup if needed", m.Version, m.Name, err)
		}
		log.Printf("Applied migration %d: %s", m.Version, m.Name)
	}

	return nil
}

// applyMigration applies a single migration in a transaction
func applyMigration(db *sql.DB, m Migration) error {
	tx, err := db.Begin()
	if err != nil {
		return err
	}
	defer tx.Rollback()

	// Execute the migration SQL
	if _, err := tx.Exec(m.SQL); err != nil {
		return fmt.Errorf("migration SQL failed: %w", err)
	}

	// Record the migration
	_, err = tx.Exec(
		"INSERT INTO schema_migrations (version, name, applied_at) VALUES (?, ?, ?)",
		m.Version, m.Name, time.Now().UnixMilli(),
	)
	if err != nil {
		return fmt.Errorf("failed to record migration: %w", err)
	}

	return tx.Commit()
}
