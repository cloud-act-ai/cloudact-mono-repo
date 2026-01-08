-- Migration 36: Onboarding Distributed Locks
-- Date: 2026-01-08
-- Purpose: FIX GAP-003 - Prevent concurrent onboarding from multiple browser tabs
--
-- This table acts as a distributed lock to ensure only one tab/process
-- completes onboarding for a given session at a time.
--
-- Lock lifecycle:
-- 1. Insert lock with session_id (unique constraint prevents duplicates)
-- 2. Process onboarding
-- 3. Delete lock on completion (success or failure)
-- 4. Stale locks auto-expire after 60 seconds

-- Create onboarding_locks table
CREATE TABLE IF NOT EXISTS onboarding_locks (
  lock_id TEXT PRIMARY KEY,           -- Format: "onboarding_{session_id}"
  session_id TEXT NOT NULL,           -- Stripe checkout session ID
  user_id UUID NOT NULL,              -- User attempting onboarding
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMP WITH TIME ZONE NOT NULL
);

-- Index on expires_at for cleanup queries
CREATE INDEX IF NOT EXISTS idx_onboarding_locks_expires
  ON onboarding_locks(expires_at);

-- Index on session_id for lookups
CREATE INDEX IF NOT EXISTS idx_onboarding_locks_session
  ON onboarding_locks(session_id);

-- Index on user_id for user-specific queries
CREATE INDEX IF NOT EXISTS idx_onboarding_locks_user
  ON onboarding_locks(user_id);

-- Auto-cleanup function for expired locks (runs periodically)
CREATE OR REPLACE FUNCTION cleanup_expired_onboarding_locks()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  DELETE FROM onboarding_locks
  WHERE expires_at < NOW();
END;
$$;

-- Grant necessary permissions
-- Note: This table should only be accessible via server-side service role
-- No RLS policies needed as it's not user-facing
GRANT SELECT, INSERT, DELETE ON onboarding_locks TO service_role;

-- Add comment for documentation
COMMENT ON TABLE onboarding_locks IS
  'Distributed locks for onboarding process to prevent concurrent execution from multiple tabs';

COMMENT ON COLUMN onboarding_locks.lock_id IS
  'Unique lock identifier (format: onboarding_{session_id})';

COMMENT ON COLUMN onboarding_locks.session_id IS
  'Stripe checkout session ID being processed';

COMMENT ON COLUMN onboarding_locks.expires_at IS
  'Lock expiration timestamp (60 seconds from creation)';

-- Register migration
INSERT INTO migration_tracking (migration_name, description)
VALUES (
  '36_onboarding_locks',
  'Create distributed locks table for onboarding to prevent concurrent processing'
)
ON CONFLICT (migration_name) DO NOTHING;
