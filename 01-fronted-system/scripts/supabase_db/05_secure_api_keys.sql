-- ============================================
-- Secure API Key Storage
-- ============================================
-- This migration creates a secure table for storing org API keys
-- that is ONLY accessible via service_role (server-side).
--
-- CRITICAL: This table has RLS enabled with NO policies,
-- meaning only service_role can read/write to it.
--
-- Run this migration BEFORE deploying code that uses secure API key storage.
-- ============================================

-- Create secure API key storage table
CREATE TABLE IF NOT EXISTS org_api_keys_secure (
  org_slug TEXT PRIMARY KEY REFERENCES organizations(org_slug) ON DELETE CASCADE,
  api_key TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Enable RLS but create NO policies
-- This means:
-- - anon key: DENIED (no policy matches)
-- - authenticated key: DENIED (no policy matches)
-- - service_role key: ALLOWED (bypasses RLS)
ALTER TABLE org_api_keys_secure ENABLE ROW LEVEL SECURITY;

-- Add comment explaining security model
COMMENT ON TABLE org_api_keys_secure IS 'Secure storage for org API keys. Only accessible via service_role (server-side). NO RLS policies = deny all public access.';

-- Index for fast lookups
CREATE INDEX IF NOT EXISTS idx_org_api_keys_secure_org_slug ON org_api_keys_secure(org_slug);

-- ============================================
-- Migration: Move existing API keys from user_metadata
-- ============================================
-- NOTE: This is a one-time migration helper. API keys stored in user_metadata
-- need to be manually migrated since user_metadata is per-user, not per-org.
--
-- After running this migration:
-- 1. Deploy updated code that stores API keys in this table
-- 2. New orgs will use secure storage automatically
-- 3. Existing users will need to re-enter API keys (or admin can migrate)
-- ============================================
