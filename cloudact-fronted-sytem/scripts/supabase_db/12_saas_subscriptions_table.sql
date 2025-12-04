-- =============================================
-- Migration: Create SaaS Subscriptions Table
-- Purpose: Track fixed-cost SaaS subscriptions (Canva, Adobe, ChatGPT Plus, etc.)
-- Run: Execute in Supabase SQL Editor
-- =============================================

-- =============================================
-- SaaS Subscriptions Table
-- =============================================

CREATE TABLE IF NOT EXISTS saas_subscriptions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,

    -- Provider identification
    provider_name VARCHAR(100) NOT NULL,  -- e.g., "canva", "adobe_cc", "chatgpt_plus"
    display_name VARCHAR(200) NOT NULL,   -- e.g., "Canva Pro", "Adobe Creative Cloud"

    -- Billing information
    billing_cycle VARCHAR(20) NOT NULL DEFAULT 'monthly' CHECK (billing_cycle IN ('monthly', 'annual', 'quarterly', 'custom')),
    cost_per_cycle DECIMAL(10,2) NOT NULL DEFAULT 0 CHECK (cost_per_cycle >= 0),
    currency VARCHAR(3) NOT NULL DEFAULT 'USD',

    -- Optional metadata
    seats INTEGER,                        -- Number of licenses/seats
    renewal_date DATE,                    -- Next billing date
    category VARCHAR(50),                 -- e.g., "design", "productivity", "ai", "development"
    notes TEXT,

    -- Status
    is_enabled BOOLEAN NOT NULL DEFAULT TRUE,

    -- Timestamps
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- =============================================
-- Indexes for Performance
-- =============================================

CREATE INDEX IF NOT EXISTS idx_saas_subscriptions_org_id
    ON saas_subscriptions(org_id);

CREATE INDEX IF NOT EXISTS idx_saas_subscriptions_provider
    ON saas_subscriptions(org_id, provider_name);

CREATE INDEX IF NOT EXISTS idx_saas_subscriptions_category
    ON saas_subscriptions(org_id, category);

CREATE INDEX IF NOT EXISTS idx_saas_subscriptions_enabled
    ON saas_subscriptions(org_id, is_enabled);

-- =============================================
-- Row Level Security (RLS)
-- =============================================

ALTER TABLE saas_subscriptions ENABLE ROW LEVEL SECURITY;

-- Policy: Organization members can view their org's subscriptions
CREATE POLICY "Members can view org subscriptions" ON saas_subscriptions
    FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM organization_members om
            WHERE om.org_id = saas_subscriptions.org_id
            AND om.user_id = auth.uid()
            AND om.status = 'active'
        )
    );

-- Policy: Owners and admins can insert subscriptions
CREATE POLICY "Admins can create subscriptions" ON saas_subscriptions
    FOR INSERT
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM organization_members om
            WHERE om.org_id = saas_subscriptions.org_id
            AND om.user_id = auth.uid()
            AND om.status = 'active'
            AND om.role IN ('owner', 'admin')
        )
    );

-- Policy: Owners and admins can update subscriptions
CREATE POLICY "Admins can update subscriptions" ON saas_subscriptions
    FOR UPDATE
    USING (
        EXISTS (
            SELECT 1 FROM organization_members om
            WHERE om.org_id = saas_subscriptions.org_id
            AND om.user_id = auth.uid()
            AND om.status = 'active'
            AND om.role IN ('owner', 'admin')
        )
    );

-- Policy: Owners and admins can delete subscriptions
CREATE POLICY "Admins can delete subscriptions" ON saas_subscriptions
    FOR DELETE
    USING (
        EXISTS (
            SELECT 1 FROM organization_members om
            WHERE om.org_id = saas_subscriptions.org_id
            AND om.user_id = auth.uid()
            AND om.status = 'active'
            AND om.role IN ('owner', 'admin')
        )
    );

-- =============================================
-- Trigger for updated_at
-- =============================================

CREATE OR REPLACE FUNCTION update_saas_subscriptions_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS saas_subscriptions_updated_at ON saas_subscriptions;

CREATE TRIGGER saas_subscriptions_updated_at
    BEFORE UPDATE ON saas_subscriptions
    FOR EACH ROW
    EXECUTE FUNCTION update_saas_subscriptions_updated_at();

-- =============================================
-- Comments for Documentation
-- =============================================

COMMENT ON TABLE saas_subscriptions IS 'Tracks fixed-cost SaaS subscriptions (Canva, Adobe, ChatGPT Plus, etc.) - NOT per-usage API costs';
COMMENT ON COLUMN saas_subscriptions.provider_name IS 'Lowercase identifier (e.g., canva, adobe_cc, chatgpt_plus)';
COMMENT ON COLUMN saas_subscriptions.display_name IS 'Human-readable name (e.g., Canva Pro, Adobe Creative Cloud)';
COMMENT ON COLUMN saas_subscriptions.billing_cycle IS 'Billing frequency: monthly, annual, quarterly, or custom';
COMMENT ON COLUMN saas_subscriptions.cost_per_cycle IS 'Cost per billing cycle in the specified currency';
COMMENT ON COLUMN saas_subscriptions.seats IS 'Number of licenses/seats (optional)';
COMMENT ON COLUMN saas_subscriptions.renewal_date IS 'Next billing/renewal date (optional)';
COMMENT ON COLUMN saas_subscriptions.category IS 'Category for grouping (design, productivity, ai, development, etc.)';
COMMENT ON COLUMN saas_subscriptions.is_enabled IS 'Whether this subscription is currently active for cost tracking';

-- =============================================
-- Record Migration
-- =============================================

INSERT INTO schema_migrations (filename, checksum)
VALUES ('12_saas_subscriptions_table.sql', 'saas-subscriptions-v1')
ON CONFLICT (filename) DO NOTHING;

-- =============================================
-- Verification Queries
-- =============================================

-- Check table exists:
-- SELECT * FROM saas_subscriptions LIMIT 5;

-- Check RLS policies:
-- SELECT schemaname, tablename, policyname, permissive, roles, cmd, qual
-- FROM pg_policies WHERE tablename = 'saas_subscriptions';

-- Get subscription summary for an org:
-- SELECT
--     category,
--     COUNT(*) as count,
--     SUM(CASE WHEN billing_cycle = 'monthly' THEN cost_per_cycle
--              WHEN billing_cycle = 'annual' THEN cost_per_cycle / 12
--              WHEN billing_cycle = 'quarterly' THEN cost_per_cycle / 3
--              ELSE cost_per_cycle END) as monthly_equivalent
-- FROM saas_subscriptions
-- WHERE org_id = 'your-org-id' AND is_enabled = true
-- GROUP BY category;
