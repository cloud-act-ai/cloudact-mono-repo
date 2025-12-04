-- ============================================================================
-- Migration Tracking Table
-- ============================================================================
-- This table tracks which migrations have been applied to the database.
-- Run this FIRST before using the migration runner.
-- ============================================================================

CREATE TABLE IF NOT EXISTS schema_migrations (
  id SERIAL PRIMARY KEY,
  filename VARCHAR(255) NOT NULL UNIQUE,
  applied_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  checksum VARCHAR(64),  -- SHA256 of file content for integrity
  execution_time_ms INTEGER,
  applied_by VARCHAR(255) DEFAULT current_user
);

-- Index for faster lookups
CREATE INDEX IF NOT EXISTS idx_schema_migrations_filename ON schema_migrations(filename);

-- Comment for documentation
COMMENT ON TABLE schema_migrations IS 'Tracks applied database migrations to prevent re-running';

-- Verify table created
SELECT 'schema_migrations table ready' as status, COUNT(*) as migrations_applied
FROM schema_migrations;
