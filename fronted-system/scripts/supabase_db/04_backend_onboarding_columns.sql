-- =============================================
-- Migration: Add Backend Onboarding & Integration Columns
-- Purpose: Store pipeline backend metadata and integration status cache
-- Run: Execute in Supabase SQL Editor
-- =============================================

-- =============================================
-- PART 1: Backend Onboarding Columns
-- =============================================

-- Add columns to track backend (pipeline) onboarding status
-- NOTE: We only store metadata, NEVER the actual API key (security!)

ALTER TABLE organizations ADD COLUMN IF NOT EXISTS backend_onboarded BOOLEAN DEFAULT FALSE;
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS backend_api_key_fingerprint TEXT;  -- Last 4 chars of API key for display
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS backend_onboarded_at TIMESTAMPTZ;

-- Add index for querying backend onboarding status
CREATE INDEX IF NOT EXISTS idx_organizations_backend_onboarded ON organizations(backend_onboarded);

-- Add comment for documentation
COMMENT ON COLUMN organizations.backend_onboarded IS 'Whether org has been onboarded to the pipeline backend (BigQuery)';
COMMENT ON COLUMN organizations.backend_api_key_fingerprint IS 'Last 4 characters of org API key for display (e.g., "xxxx")';
COMMENT ON COLUMN organizations.backend_onboarded_at IS 'Timestamp when org was onboarded to pipeline backend';

-- =============================================
-- PART 2: Integration Status Cache Columns
-- =============================================

-- Cache integration status locally (one-time setup, rarely changes)
-- Status values: NOT_CONFIGURED, VALID, INVALID, PENDING

ALTER TABLE organizations ADD COLUMN IF NOT EXISTS integration_openai_status TEXT DEFAULT 'NOT_CONFIGURED';
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS integration_openai_configured_at TIMESTAMPTZ;

ALTER TABLE organizations ADD COLUMN IF NOT EXISTS integration_anthropic_status TEXT DEFAULT 'NOT_CONFIGURED';
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS integration_anthropic_configured_at TIMESTAMPTZ;

ALTER TABLE organizations ADD COLUMN IF NOT EXISTS integration_deepseek_status TEXT DEFAULT 'NOT_CONFIGURED';
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS integration_deepseek_configured_at TIMESTAMPTZ;

ALTER TABLE organizations ADD COLUMN IF NOT EXISTS integration_gcp_status TEXT DEFAULT 'NOT_CONFIGURED';
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS integration_gcp_configured_at TIMESTAMPTZ;

-- Comments
COMMENT ON COLUMN organizations.integration_openai_status IS 'Cached OpenAI integration status (NOT_CONFIGURED, VALID, INVALID)';
COMMENT ON COLUMN organizations.integration_anthropic_status IS 'Cached Anthropic/Claude integration status';
COMMENT ON COLUMN organizations.integration_deepseek_status IS 'Cached DeepSeek integration status';
COMMENT ON COLUMN organizations.integration_gcp_status IS 'Cached GCP Service Account integration status';

-- =============================================
-- Verification Queries
-- =============================================

-- Check backend onboarding:
-- SELECT org_slug, backend_onboarded, backend_api_key_fingerprint, backend_onboarded_at
-- FROM organizations LIMIT 5;

-- Check integration status:
-- SELECT org_slug,
--        integration_openai_status, integration_anthropic_status,
--        integration_deepseek_status, integration_gcp_status
-- FROM organizations LIMIT 5;
