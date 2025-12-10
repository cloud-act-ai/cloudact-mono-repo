-- =============================================
-- Migration: Create SaaS Subscription Provider Meta Table
-- Purpose: Track which subscription providers are enabled per org
-- Run: Execute in Supabase SQL Editor
-- =============================================

-- =============================================
-- SaaS Subscription Provider Meta Table
-- Simple table to track enabled providers
-- Full plan details are stored in BigQuery
-- =============================================

CREATE TABLE IF NOT EXISTS saas_subscription_providers_meta (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,

    -- Provider identification
    provider_name VARCHAR(50) NOT NULL,  -- e.g., "canva", "chatgpt_plus", "slack"

    -- Status
    is_enabled BOOLEAN NOT NULL DEFAULT TRUE,

    -- Timestamps
    enabled_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    -- Unique constraint: one record per provider per org
    UNIQUE(org_id, provider_name)
);

-- =============================================
-- Indexes for Performance
-- =============================================

CREATE INDEX IF NOT EXISTS idx_saas_subscription_providers_meta_org_id
    ON saas_subscription_providers_meta(org_id);

CREATE INDEX IF NOT EXISTS idx_saas_subscription_providers_meta_enabled
    ON saas_subscription_providers_meta(org_id, is_enabled);

CREATE INDEX IF NOT EXISTS idx_saas_subscription_providers_meta_provider
    ON saas_subscription_providers_meta(provider_name);

-- =============================================
-- Row Level Security (RLS)
-- =============================================

ALTER TABLE saas_subscription_providers_meta ENABLE ROW LEVEL SECURITY;

-- Policy: Organization members can view their org's enabled providers
CREATE POLICY "Members can view org subscription providers" ON saas_subscription_providers_meta
    FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM organization_members om
            WHERE om.org_id = saas_subscription_providers_meta.org_id
            AND om.user_id = auth.uid()
            AND om.status = 'active'
        )
    );

-- Policy: Owners and admins can enable providers
CREATE POLICY "Admins can enable subscription providers" ON saas_subscription_providers_meta
    FOR INSERT
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM organization_members om
            WHERE om.org_id = saas_subscription_providers_meta.org_id
            AND om.user_id = auth.uid()
            AND om.status = 'active'
            AND om.role IN ('owner', 'admin')
        )
    );

-- Policy: Owners and admins can update provider status
CREATE POLICY "Admins can update subscription providers" ON saas_subscription_providers_meta
    FOR UPDATE
    USING (
        EXISTS (
            SELECT 1 FROM organization_members om
            WHERE om.org_id = saas_subscription_providers_meta.org_id
            AND om.user_id = auth.uid()
            AND om.status = 'active'
            AND om.role IN ('owner', 'admin')
        )
    );

-- Policy: Owners and admins can delete provider records
CREATE POLICY "Admins can delete subscription providers" ON saas_subscription_providers_meta
    FOR DELETE
    USING (
        EXISTS (
            SELECT 1 FROM organization_members om
            WHERE om.org_id = saas_subscription_providers_meta.org_id
            AND om.user_id = auth.uid()
            AND om.status = 'active'
            AND om.role IN ('owner', 'admin')
        )
    );

-- =============================================
-- Trigger for updated_at
-- =============================================

CREATE OR REPLACE FUNCTION update_saas_subscription_providers_meta_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_update_saas_subscription_providers_meta_updated_at ON saas_subscription_providers_meta;

CREATE TRIGGER trigger_update_saas_subscription_providers_meta_updated_at
    BEFORE UPDATE ON saas_subscription_providers_meta
    FOR EACH ROW
    EXECUTE FUNCTION update_saas_subscription_providers_meta_updated_at();

-- =============================================
-- Comments
-- =============================================

COMMENT ON TABLE saas_subscription_providers_meta IS 'Tracks which subscription providers are enabled per org. Full plan details stored in BigQuery.';
COMMENT ON COLUMN saas_subscription_providers_meta.provider_name IS 'Provider identifier: canva, chatgpt_plus, slack, figma, etc.';
COMMENT ON COLUMN saas_subscription_providers_meta.is_enabled IS 'Whether this provider is enabled for the org';
COMMENT ON COLUMN saas_subscription_providers_meta.enabled_at IS 'When the provider was first enabled';
