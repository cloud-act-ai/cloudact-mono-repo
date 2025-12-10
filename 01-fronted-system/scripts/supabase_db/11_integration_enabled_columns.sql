-- =============================================
-- Migration: Add Integration Enabled Columns
-- Purpose: Add enabled/disabled toggle state for each integration
-- Run: Execute in Supabase SQL Editor
-- =============================================

-- =============================================
-- Integration Enabled Columns (IF NOT EXISTS ensures idempotency)
-- =============================================

-- OpenAI enabled toggle
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS integration_openai_enabled BOOLEAN DEFAULT TRUE;

-- Anthropic/Claude enabled toggle
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS integration_anthropic_enabled BOOLEAN DEFAULT TRUE;

-- DeepSeek enabled toggle
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS integration_deepseek_enabled BOOLEAN DEFAULT TRUE;

-- GCP Service Account enabled toggle
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS integration_gcp_enabled BOOLEAN DEFAULT TRUE;

-- Google Gemini enabled toggle
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS integration_gemini_enabled BOOLEAN DEFAULT TRUE;

-- =============================================
-- Comments for Documentation
-- =============================================

COMMENT ON COLUMN organizations.integration_openai_enabled IS 'Whether OpenAI integration is enabled (can be disabled without deleting)';
COMMENT ON COLUMN organizations.integration_anthropic_enabled IS 'Whether Anthropic/Claude integration is enabled';
COMMENT ON COLUMN organizations.integration_deepseek_enabled IS 'Whether DeepSeek integration is enabled';
COMMENT ON COLUMN organizations.integration_gcp_enabled IS 'Whether GCP Service Account integration is enabled';
COMMENT ON COLUMN organizations.integration_gemini_enabled IS 'Whether Google Gemini integration is enabled';

-- =============================================
-- Record Migration
-- =============================================

INSERT INTO schema_migrations (filename, checksum)
VALUES ('11_integration_enabled_columns.sql', 'integration-enabled-columns-v1')
ON CONFLICT (filename) DO NOTHING;

-- =============================================
-- Verification Query
-- =============================================

-- Check all integration enabled columns:
-- SELECT org_slug,
--        integration_openai_enabled, integration_anthropic_enabled,
--        integration_deepseek_enabled, integration_gcp_enabled, integration_gemini_enabled
-- FROM organizations LIMIT 5;
