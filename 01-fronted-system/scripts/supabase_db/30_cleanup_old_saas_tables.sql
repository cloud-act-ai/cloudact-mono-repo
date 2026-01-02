-- =============================================
-- Migration: Cleanup Old SaaS Subscription Tables
-- Purpose: Drop old saas_subscription_* tables after rename to subscription_*
-- Run: Execute in Supabase SQL Editor AFTER running 14_saas_subscription_provider_meta.sql
-- =============================================

-- Drop old table if it exists (renamed to subscription_providers_meta)
DROP TABLE IF EXISTS saas_subscription_providers_meta CASCADE;

-- Drop old saas_subscriptions table if it exists (legacy table, no longer used)
DROP TABLE IF EXISTS saas_subscriptions CASCADE;

-- Verify new table exists
DO $$
BEGIN
    IF NOT EXISTS (SELECT FROM information_schema.tables WHERE table_name = 'subscription_providers_meta') THEN
        RAISE EXCEPTION 'subscription_providers_meta table does not exist. Run 14_saas_subscription_provider_meta.sql first.';
    END IF;
END $$;

-- Success message
SELECT 'Cleanup complete. Old saas_subscription_* tables dropped.' AS status;
