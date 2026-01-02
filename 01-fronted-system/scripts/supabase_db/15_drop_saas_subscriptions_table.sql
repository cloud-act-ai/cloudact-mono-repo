-- =============================================
-- Migration: Drop SaaS Subscriptions Table
-- Purpose: Remove subscriptions table - ALL subscription data now stored in BigQuery
-- Run: Execute in Supabase SQL Editor
-- =============================================

-- Architecture Decision:
-- - subscription_providers_meta (Supabase) = KEEP: Only stores provider enabled/disabled per org
-- - subscriptions (BigQuery) = ALL subscription plan data via API service
-- - subscriptions (Supabase) = DROP: No longer needed

-- =============================================
-- Drop the old subscriptions table
-- =============================================

-- Drop trigger first
DROP TRIGGER IF EXISTS subscriptions_updated_at ON subscriptions;

-- Drop function
DROP FUNCTION IF EXISTS update_subscriptions_updated_at();

-- Drop RLS policies
DROP POLICY IF EXISTS "Members can view org subscriptions" ON subscriptions;
DROP POLICY IF EXISTS "Admins can create subscriptions" ON subscriptions;
DROP POLICY IF EXISTS "Admins can update subscriptions" ON subscriptions;
DROP POLICY IF EXISTS "Admins can delete subscriptions" ON subscriptions;

-- Drop indexes
DROP INDEX IF EXISTS idx_subscriptions_org_id;
DROP INDEX IF EXISTS idx_subscriptions_provider;
DROP INDEX IF EXISTS idx_subscriptions_category;
DROP INDEX IF EXISTS idx_subscriptions_enabled;

-- Drop the table
DROP TABLE IF EXISTS subscriptions;

-- =============================================
-- Record Migration
-- =============================================

INSERT INTO schema_migrations (filename, checksum)
VALUES ('15_drop_subscriptions_table.sql', 'drop-saas-subscriptions-v1')
ON CONFLICT (filename) DO NOTHING;

-- =============================================
-- Verification
-- =============================================

-- Verify table is dropped:
-- SELECT EXISTS (SELECT FROM information_schema.tables WHERE table_name = 'subscriptions');
-- Should return: false

-- Verify subscription_providers_meta still exists:
-- SELECT EXISTS (SELECT FROM information_schema.tables WHERE table_name = 'subscription_providers_meta');
-- Should return: true
