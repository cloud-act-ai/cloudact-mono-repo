-- Migration 37: Pending Backend Syncs (Compensation Table)
-- Date: 2026-01-08
-- Purpose: FIX GAP-004 - Store failed Supabase updates for retry/manual intervention
--
-- This table stores backend onboarding successes where the Supabase update failed.
-- Allows manual sync or automated retry jobs to recover from partial failures.
--
-- Lifecycle:
-- 1. Backend onboarding succeeds
-- 2. Supabase update fails after 3 retries
-- 3. Record inserted here with status="pending_sync"
-- 4. Manual process or cron job syncs the data
-- 5. Record marked as status="synced" or deleted

-- Create pending_backend_syncs table
CREATE TABLE IF NOT EXISTS pending_backend_syncs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_slug TEXT NOT NULL,
  api_key_fingerprint TEXT,
  backend_onboarded_at TIMESTAMP WITH TIME ZONE NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending_sync',  -- pending_sync, synced, failed
  retry_count INTEGER NOT NULL DEFAULT 0,
  last_error TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  synced_at TIMESTAMP WITH TIME ZONE,
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

-- Index on org_slug for fast lookups
CREATE INDEX IF NOT EXISTS idx_pending_backend_syncs_org
  ON pending_backend_syncs(org_slug);

-- Index on status for filtering pending records
CREATE INDEX IF NOT EXISTS idx_pending_backend_syncs_status
  ON pending_backend_syncs(status);

-- Index on created_at for sorting and cleanup
CREATE INDEX IF NOT EXISTS idx_pending_backend_syncs_created
  ON pending_backend_syncs(created_at);

-- Auto-update updated_at timestamp
CREATE OR REPLACE FUNCTION update_pending_backend_syncs_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

CREATE TRIGGER update_pending_backend_syncs_updated_at_trigger
  BEFORE UPDATE ON pending_backend_syncs
  FOR EACH ROW
  EXECUTE FUNCTION update_pending_backend_syncs_updated_at();

-- Helper function to manually sync a pending record
CREATE OR REPLACE FUNCTION sync_pending_backend_record(record_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  record_data RECORD;
  update_success BOOLEAN;
BEGIN
  -- Get the pending record
  SELECT * INTO record_data
  FROM pending_backend_syncs
  WHERE id = record_id AND status = 'pending_sync';

  IF NOT FOUND THEN
    RAISE NOTICE 'Record not found or already synced: %', record_id;
    RETURN FALSE;
  END IF;

  -- Attempt to update organizations table
  BEGIN
    UPDATE organizations
    SET
      backend_onboarded = TRUE,
      backend_api_key_fingerprint = record_data.api_key_fingerprint,
      backend_onboarded_at = record_data.backend_onboarded_at
    WHERE org_slug = record_data.org_slug;

    IF FOUND THEN
      -- Update successful - mark as synced
      UPDATE pending_backend_syncs
      SET
        status = 'synced',
        synced_at = NOW()
      WHERE id = record_id;

      update_success := TRUE;
      RAISE NOTICE 'Successfully synced record: %', record_id;
    ELSE
      -- Org not found
      UPDATE pending_backend_syncs
      SET
        status = 'failed',
        last_error = 'Organization not found in Supabase',
        retry_count = retry_count + 1
      WHERE id = record_id;

      update_success := FALSE;
      RAISE NOTICE 'Organization not found for record: %', record_id;
    END IF;
  EXCEPTION WHEN OTHERS THEN
    -- Update failed - log error
    UPDATE pending_backend_syncs
    SET
      status = 'failed',
      last_error = SQLERRM,
      retry_count = retry_count + 1
    WHERE id = record_id;

    update_success := FALSE;
    RAISE NOTICE 'Sync failed for record %: %', record_id, SQLERRM;
  END;

  RETURN update_success;
END;
$$;

-- Grant necessary permissions
GRANT SELECT, INSERT, UPDATE, DELETE ON pending_backend_syncs TO service_role;
GRANT EXECUTE ON FUNCTION sync_pending_backend_record TO service_role;

-- Add comments for documentation
COMMENT ON TABLE pending_backend_syncs IS
  'Compensation table for backend onboarding successes where Supabase update failed';

COMMENT ON COLUMN pending_backend_syncs.org_slug IS
  'Organization slug that needs sync';

COMMENT ON COLUMN pending_backend_syncs.status IS
  'Sync status: pending_sync (needs sync), synced (completed), failed (gave up after retries)';

COMMENT ON COLUMN pending_backend_syncs.retry_count IS
  'Number of sync attempts made';

COMMENT ON FUNCTION sync_pending_backend_record IS
  'Manually sync a pending backend record to organizations table';

-- Register migration
INSERT INTO migration_tracking (migration_name, description)
VALUES (
  '37_pending_backend_syncs',
  'Create compensation table for failed Supabase updates after successful backend onboarding'
)
ON CONFLICT (migration_name) DO NOTHING;
