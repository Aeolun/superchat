-- Add archive_enabled column to Channel table
-- NULL = inherit server default, 0 = explicitly disabled, 1 = explicitly enabled
ALTER TABLE Channel ADD COLUMN archive_enabled INTEGER;
