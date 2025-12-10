-- =============================================
-- Migration: Drop SaaS Subscriptions Table
-- Purpose: Remove saas_subscriptions table - ALL subscription data now stored in BigQuery
-- Run: Execute in Supabase SQL Editor
-- =============================================

-- Architecture Decision:
-- - saas_subscription_providers_meta (Supabase) = KEEP: Only stores provider enabled/disabled per org
-- - saas_subscriptions (BigQuery) = ALL subscription plan data via API service
-- - saas_subscriptions (Supabase) = DROP: No longer needed

-- =============================================
-- Drop the old saas_subscriptions table
-- =============================================

-- Drop trigger first
DROP TRIGGER IF EXISTS saas_subscriptions_updated_at ON saas_subscriptions;

-- Drop function
DROP FUNCTION IF EXISTS update_saas_subscriptions_updated_at();

-- Drop RLS policies
DROP POLICY IF EXISTS "Members can view org subscriptions" ON saas_subscriptions;
DROP POLICY IF EXISTS "Admins can create subscriptions" ON saas_subscriptions;
DROP POLICY IF EXISTS "Admins can update subscriptions" ON saas_subscriptions;
DROP POLICY IF EXISTS "Admins can delete subscriptions" ON saas_subscriptions;

-- Drop indexes
DROP INDEX IF EXISTS idx_saas_subscriptions_org_id;
DROP INDEX IF EXISTS idx_saas_subscriptions_provider;
DROP INDEX IF EXISTS idx_saas_subscriptions_category;
DROP INDEX IF EXISTS idx_saas_subscriptions_enabled;

-- Drop the table
DROP TABLE IF EXISTS saas_subscriptions;

-- =============================================
-- Record Migration
-- =============================================

INSERT INTO schema_migrations (filename, checksum)
VALUES ('15_drop_saas_subscriptions_table.sql', 'drop-saas-subscriptions-v1')
ON CONFLICT (filename) DO NOTHING;

-- =============================================
-- Verification
-- =============================================

-- Verify table is dropped:
-- SELECT EXISTS (SELECT FROM information_schema.tables WHERE table_name = 'saas_subscriptions');
-- Should return: false

-- Verify saas_subscription_providers_meta still exists:
-- SELECT EXISTS (SELECT FROM information_schema.tables WHERE table_name = 'saas_subscription_providers_meta');
-- Should return: true
