-- =============================================
-- Migration: Add Backend Quota Sync Tracking Column
-- Purpose: Track whether subscription quotas have been synced to backend BigQuery
-- Created: 2025-12-14
-- Related: Stripe webhook backend sync fix
-- =============================================

-- Add column to track whether subscription quotas have been synced to backend
-- This fixes the issue where backend_onboarded check was blocking quota sync
-- Now we track sync status separately and always attempt sync when org_slug exists

ALTER TABLE organizations ADD COLUMN IF NOT EXISTS backend_quota_synced BOOLEAN DEFAULT FALSE;

-- Add index for querying sync status
CREATE INDEX IF NOT EXISTS idx_organizations_backend_quota_synced ON organizations(backend_quota_synced);

-- Add comment for documentation
COMMENT ON COLUMN organizations.backend_quota_synced IS 'Whether subscription quotas have been synced to backend BigQuery (org_subscriptions table)';

-- =============================================
-- Verification Query
-- =============================================

-- Check sync status:
-- SELECT org_slug,
--        backend_onboarded,
--        backend_quota_synced,
--        billing_status,
--        plan
-- FROM organizations
-- WHERE backend_onboarded = true
-- LIMIT 10;

-- Find orgs that need quota sync:
-- SELECT org_slug,
--        backend_onboarded,
--        backend_quota_synced,
--        billing_status,
--        plan
-- FROM organizations
-- WHERE backend_onboarded = true
--   AND (backend_quota_synced = false OR backend_quota_synced IS NULL)
--   AND billing_status IN ('active', 'trialing')
-- LIMIT 10;
