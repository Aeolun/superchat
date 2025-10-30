// ABOUTME: Client-side database migration system for local state management.
// ABOUTME: Handles schema evolution for config, read state, and connection history.

package client

import (
	"database/sql"
	"embed"
	"fmt"
	"log"
	"sort"
	"strings"
	"time"
)

//go:embed migrations/*.sql
var migrationFiles embed.FS

// Migration represents a client database migration
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

// runMigrations applies pending migrations
func runMigrations(db *sql.DB) error {
	// Ensure migrations table exists
	if err := initMigrations(db); err != nil {
		return fmt.Errorf("failed to initialize migrations: %w", err)
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

	// Apply pending migrations
	for _, migration := range migrations {
		if migration.Version <= currentVersion {
			continue // Already applied
		}

		log.Printf("Client: applying migration %03d_%s", migration.Version, migration.Name)

		// Execute migration in transaction
		tx, err := db.Begin()
		if err != nil {
			return fmt.Errorf("failed to begin transaction for migration %d: %w", migration.Version, err)
		}

		// Apply the migration SQL
		if _, err := tx.Exec(migration.SQL); err != nil {
			tx.Rollback()
			return fmt.Errorf("migration %d failed: %w", migration.Version, err)
		}

		// Record migration
		if _, err := tx.Exec(`
			INSERT INTO schema_migrations (version, name, applied_at)
			VALUES (?, ?, ?)
		`, migration.Version, migration.Name, time.Now().Unix()); err != nil {
			tx.Rollback()
			return fmt.Errorf("failed to record migration %d: %w", migration.Version, err)
		}

		if err := tx.Commit(); err != nil {
			return fmt.Errorf("failed to commit migration %d: %w", migration.Version, err)
		}

		log.Printf("Client: migration %03d_%s applied successfully", migration.Version, migration.Name)
	}

	if len(migrations) == 0 || currentVersion >= migrations[len(migrations)-1].Version {
		log.Printf("Client: database schema up to date (version %d)", currentVersion)
	}

	return nil
}
