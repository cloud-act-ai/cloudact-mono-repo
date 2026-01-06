-- =============================================
-- Migration 33: Fix Stripe Webhook Race Condition (STATE-001)
-- =============================================
-- Adds optimistic locking to prevent older webhook events
-- from overwriting newer ones during concurrent processing.
-- =============================================
-- Run this in Supabase SQL Editor
-- =============================================

-- Record migration
INSERT INTO migrations (name, applied_at)
VALUES ('33_stripe_webhook_race_condition_fix', NOW())
ON CONFLICT (name) DO NOTHING;

-- =============================================
-- STATE-001 FIX: Add timestamp column for event ordering
-- =============================================

-- Add column for webhook event timestamp (enables optimistic locking)
ALTER TABLE organizations
ADD COLUMN IF NOT EXISTS stripe_webhook_last_event_at TIMESTAMPTZ;

-- Add index for faster lookups during webhook processing
CREATE INDEX IF NOT EXISTS idx_organizations_stripe_webhook_event_at
ON organizations (stripe_webhook_last_event_at)
WHERE stripe_webhook_last_event_at IS NOT NULL;

-- Backfill existing records: set timestamp based on last update
-- (approximation - new events will have accurate timestamps)
UPDATE organizations
SET stripe_webhook_last_event_at = updated_at
WHERE stripe_webhook_last_event_id IS NOT NULL
  AND stripe_webhook_last_event_at IS NULL;

COMMENT ON COLUMN organizations.stripe_webhook_last_event_at IS
'Timestamp of the last processed Stripe webhook event. Used for optimistic locking to prevent older events from overwriting newer ones.';

-- =============================================
-- Verification
-- =============================================

SELECT 'Migration 33: Stripe webhook race condition fix applied successfully' as result;
