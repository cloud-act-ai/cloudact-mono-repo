-- =============================================
-- CLOUDACT.AI - STRIPE-FIRST BILLING MIGRATION
-- Run this AFTER 01_production_setup.sql
-- =============================================
-- Version: 1.0.0
-- Date: 2025-01-25
-- Purpose: Remove hardcoded plan constraints, enable dynamic Stripe plans
-- =============================================

-- =============================================
-- STEP 1: Remove CHECK constraint on plan column
-- This allows any plan ID from Stripe metadata
-- =============================================
ALTER TABLE organizations
DROP CONSTRAINT IF EXISTS organizations_plan_check;

-- Remove the inline check constraint (PostgreSQL names it differently sometimes)
DO $$
BEGIN
  -- Try common naming patterns for the constraint
  ALTER TABLE organizations DROP CONSTRAINT IF EXISTS organizations_plan_check;
  ALTER TABLE organizations DROP CONSTRAINT IF EXISTS organizations_plan_check1;
EXCEPTION WHEN OTHERS THEN
  -- Ignore if constraint doesn't exist
  RAISE NOTICE 'Constraint may not exist or already dropped: %', SQLERRM;
END $$;

-- =============================================
-- STEP 2: Update plan column to allow any value
-- Stripe product metadata.plan_id is the source
-- =============================================
-- Make plan nullable during migration (in case existing data has issues)
ALTER TABLE organizations
ALTER COLUMN plan DROP NOT NULL;

-- Set default to NULL (will be set from Stripe on checkout)
ALTER TABLE organizations
ALTER COLUMN plan SET DEFAULT NULL;

-- =============================================
-- STEP 3: Add comment explaining new behavior
-- =============================================
COMMENT ON COLUMN organizations.plan IS
'Plan identifier from Stripe product metadata (plan_id). No longer constrained to specific values.';

COMMENT ON COLUMN organizations.stripe_price_id IS
'Stripe Price ID (price_xxx). Used to identify the subscription plan. Source of truth for billing.';

-- =============================================
-- STEP 4: Update billing_status constraint for more Stripe statuses
-- =============================================
-- First drop existing constraint
ALTER TABLE organizations
DROP CONSTRAINT IF EXISTS organizations_billing_status_check;

-- Re-add with additional Stripe statuses
ALTER TABLE organizations
ADD CONSTRAINT organizations_billing_status_check
CHECK (billing_status IN (
  'trialing',      -- In free trial period
  'active',        -- Paid and current
  'past_due',      -- Payment failed, grace period
  'canceled',      -- Subscription canceled
  'incomplete',    -- Initial payment failed
  'incomplete_expired', -- Initial payment expired
  'paused',        -- Subscription paused
  'unpaid'         -- Multiple payment failures
));

-- =============================================
-- STEP 5: Add index on stripe_price_id for lookups
-- =============================================
CREATE INDEX IF NOT EXISTS idx_organizations_stripe_price
ON organizations(stripe_price_id)
WHERE stripe_price_id IS NOT NULL;

-- =============================================
-- STEP 6: Update existing orgs with null plan to 'trialing'
-- (Only for backwards compatibility during migration)
-- =============================================
-- UPDATE organizations
-- SET plan = 'starter'
-- WHERE plan IS NULL AND billing_status = 'trialing';

-- =============================================
-- MIGRATION COMPLETE
-- =============================================
-- Changes:
-- 1. Removed CHECK constraint on plan column
-- 2. Plan can now be any value from Stripe product metadata
-- 3. Added more billing_status values for Stripe compatibility
-- 4. Added index on stripe_price_id
--
-- After running this migration:
-- 1. Ensure your Stripe products have metadata.plan_id set
-- 2. The plan column will store this plan_id value
-- 3. stripe_price_id stores the actual Stripe price ID
-- =============================================
