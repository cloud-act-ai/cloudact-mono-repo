-- Migration: 19_org_logo_url.sql
-- Description: Add logo_url column to organizations table for custom org logos
-- Date: 2025-12-16

-- Add logo_url column
ALTER TABLE organizations
  ADD COLUMN IF NOT EXISTS logo_url TEXT DEFAULT NULL;

-- Add comment
COMMENT ON COLUMN organizations.logo_url IS 'URL to organization logo image (user-provided URL)';

-- Record migration
INSERT INTO schema_migrations (version, name, applied_at)
VALUES (19, '19_org_logo_url', NOW())
ON CONFLICT (version) DO NOTHING;
