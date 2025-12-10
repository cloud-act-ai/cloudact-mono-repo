-- =============================================
-- CLOUDACT.AI - WEBHOOK IDEMPOTENCY MIGRATION
-- Run this AFTER 02_stripe_first_migration.sql
-- =============================================
-- Version: 1.0.0
-- Date: 2025-01-25
-- Purpose: Add database-backed webhook idempotency to support horizontal scaling
-- =============================================

-- =============================================
-- STEP 1: Add webhook event tracking column
-- =============================================
-- Store the last processed Stripe webhook event ID per organization
-- This enables cross-instance idempotency without Redis
ALTER TABLE organizations
ADD COLUMN IF NOT EXISTS stripe_webhook_last_event_id TEXT;

-- =============================================
-- STEP 2: Add index for fast duplicate detection
-- =============================================
-- This index allows O(1) lookup to check if event was already processed
CREATE INDEX IF NOT EXISTS idx_organizations_webhook_event
ON organizations(stripe_webhook_last_event_id)
WHERE stripe_webhook_last_event_id IS NOT NULL;

-- =============================================
-- STEP 3: Add comment explaining the column
-- =============================================
COMMENT ON COLUMN organizations.stripe_webhook_last_event_id IS
'Last processed Stripe webhook event ID (evt_xxx). Used for idempotency across server instances. Prevents duplicate webhook processing.';

-- =============================================
-- MIGRATION COMPLETE
-- =============================================
-- Changes:
-- 1. Added stripe_webhook_last_event_id column to organizations table
-- 2. Added index for fast event ID lookups
-- 3. Enables database-backed idempotency for webhooks
--
-- Benefits:
-- - Works across server restarts (unlike in-memory Map)
-- - Works with horizontal scaling (multiple webhook handlers)
-- - No Redis dependency required
-- - Fast O(1) duplicate detection with index
-- =============================================
