-- =============================================
-- Migration: Add All Integration Columns
-- Purpose: Add all integration status tracking columns to organizations table
-- Run: Execute in Supabase SQL Editor
-- =============================================

-- =============================================
-- All Integration Columns (IF NOT EXISTS ensures idempotency)
-- =============================================

-- OpenAI
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS integration_openai_status TEXT DEFAULT 'NOT_CONFIGURED';
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS integration_openai_configured_at TIMESTAMPTZ;

-- Anthropic/Claude
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS integration_anthropic_status TEXT DEFAULT 'NOT_CONFIGURED';
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS integration_anthropic_configured_at TIMESTAMPTZ;

-- DeepSeek
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS integration_deepseek_status TEXT DEFAULT 'NOT_CONFIGURED';
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS integration_deepseek_configured_at TIMESTAMPTZ;

-- GCP Service Account
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS integration_gcp_status TEXT DEFAULT 'NOT_CONFIGURED';
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS integration_gcp_configured_at TIMESTAMPTZ;

-- Google Gemini
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS integration_gemini_status TEXT DEFAULT 'NOT_CONFIGURED';
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS integration_gemini_configured_at TIMESTAMPTZ;

-- =============================================
-- Comments for Documentation
-- =============================================

COMMENT ON COLUMN organizations.integration_openai_status IS 'Cached OpenAI integration status (NOT_CONFIGURED, VALID, INVALID)';
COMMENT ON COLUMN organizations.integration_openai_configured_at IS 'Timestamp when OpenAI integration was configured';
COMMENT ON COLUMN organizations.integration_anthropic_status IS 'Cached Anthropic/Claude integration status';
COMMENT ON COLUMN organizations.integration_anthropic_configured_at IS 'Timestamp when Anthropic integration was configured';
COMMENT ON COLUMN organizations.integration_deepseek_status IS 'Cached DeepSeek integration status';
COMMENT ON COLUMN organizations.integration_deepseek_configured_at IS 'Timestamp when DeepSeek integration was configured';
COMMENT ON COLUMN organizations.integration_gcp_status IS 'Cached GCP Service Account integration status';
COMMENT ON COLUMN organizations.integration_gcp_configured_at IS 'Timestamp when GCP integration was configured';
COMMENT ON COLUMN organizations.integration_gemini_status IS 'Cached Google Gemini integration status (NOT_CONFIGURED, VALID, INVALID)';
COMMENT ON COLUMN organizations.integration_gemini_configured_at IS 'Timestamp when Gemini integration was configured';

-- =============================================
-- Record Migration
-- =============================================

INSERT INTO schema_migrations (filename, checksum)
VALUES ('10_all_integration_columns.sql', 'all-integration-columns-v1')
ON CONFLICT (filename) DO NOTHING;

-- =============================================
-- Verification Query
-- =============================================

-- Check all integration columns:
-- SELECT org_slug,
--        integration_openai_status, integration_anthropic_status,
--        integration_deepseek_status, integration_gcp_status, integration_gemini_status
-- FROM organizations LIMIT 5;
