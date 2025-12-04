-- =============================================
-- CLOUDACT.AI - SOFT DELETE MIGRATION
-- Run this AFTER 02_stripe_first_migration.sql
-- =============================================
-- Version: 1.0.0
-- Date: 2025-01-26
-- Purpose: Add soft-delete support for organizations
-- =============================================

-- =============================================
-- STEP 1: Add soft-delete columns to organizations
-- =============================================
ALTER TABLE organizations
ADD COLUMN IF NOT EXISTS is_deleted BOOLEAN NOT NULL DEFAULT FALSE;

ALTER TABLE organizations
ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ DEFAULT NULL;

-- Add comments
COMMENT ON COLUMN organizations.is_deleted IS
'Soft-delete flag. When true, organization is considered deleted.';

COMMENT ON COLUMN organizations.deleted_at IS
'Timestamp when the organization was soft-deleted.';

-- =============================================
-- STEP 2: Update billing_status constraint to include 'deleted'
-- =============================================
-- First drop existing constraint
ALTER TABLE organizations
DROP CONSTRAINT IF EXISTS organizations_billing_status_check;

-- Re-add with 'deleted' status
ALTER TABLE organizations
ADD CONSTRAINT organizations_billing_status_check
CHECK (billing_status IN (
  'trialing',           -- In free trial period
  'active',             -- Paid and current
  'past_due',           -- Payment failed, grace period
  'canceled',           -- Subscription canceled
  'incomplete',         -- Initial payment failed
  'incomplete_expired', -- Initial payment expired
  'paused',             -- Subscription paused
  'unpaid',             -- Multiple payment failures
  'deleted'             -- Organization soft-deleted
));

-- =============================================
-- STEP 3: Add indexes for soft-delete queries
-- =============================================
-- Index for filtering out deleted orgs (most common query pattern)
CREATE INDEX IF NOT EXISTS idx_organizations_not_deleted
ON organizations(id)
WHERE is_deleted = FALSE;

-- Index for deleted_at timestamp queries
CREATE INDEX IF NOT EXISTS idx_organizations_deleted_at
ON organizations(deleted_at)
WHERE deleted_at IS NOT NULL;

-- =============================================
-- STEP 4: Update RLS policies to exclude deleted organizations
-- =============================================
-- Drop and recreate the select policy to exclude deleted orgs
DROP POLICY IF EXISTS "organizations_select_member" ON organizations;

CREATE POLICY "organizations_select_member"
  ON organizations FOR SELECT
  TO authenticated
  USING (
    is_deleted = FALSE AND
    user_is_org_member(id)
  );

-- Service role can see all including deleted (for admin purposes)
DROP POLICY IF EXISTS "organizations_select_service" ON organizations;

CREATE POLICY "organizations_select_service"
  ON organizations FOR SELECT
  TO service_role
  USING (true);

-- =============================================
-- STEP 5: Create helper function for checking active organizations
-- =============================================
CREATE OR REPLACE FUNCTION public.org_is_active(org_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
  SELECT EXISTS (
    SELECT 1 FROM organizations
    WHERE id = org_id
    AND is_deleted = FALSE
    AND billing_status NOT IN ('deleted', 'canceled')
  );
$$;

COMMENT ON FUNCTION public.org_is_active(UUID) IS
'Check if an organization is active (not deleted and has valid billing status)';

-- =============================================
-- MIGRATION COMPLETE
-- =============================================
-- Changes:
-- 1. Added is_deleted boolean column (default FALSE)
-- 2. Added deleted_at timestamp column
-- 3. Updated billing_status constraint to include 'deleted'
-- 4. Added indexes for soft-delete queries
-- 5. Updated RLS policies to exclude deleted organizations
-- 6. Added org_is_active() helper function
--
-- After running this migration:
-- 1. Update deleteOrganization action to set is_deleted=true and deleted_at
-- 2. Update queries to filter by is_deleted=FALSE where needed
-- =============================================
