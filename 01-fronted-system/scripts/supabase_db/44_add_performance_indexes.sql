-- Migration 44: Add Performance Indexes
-- ======================================
-- These indexes optimize common query patterns identified during performance review

-- =============================================
-- 1. PROFILES TABLE
-- =============================================
-- Index for case-insensitive email lookups (login, invite matching)
CREATE INDEX IF NOT EXISTS idx_profiles_email_lower 
ON profiles (lower(email));

-- =============================================
-- 2. SECURITY_EVENTS TABLE
-- =============================================
-- Composite index for security audit queries
-- Covers: filtering by user, event type, and time-range queries
CREATE INDEX IF NOT EXISTS idx_security_events_user_type_created 
ON security_events (user_id, event_type, created_at DESC);

-- =============================================
-- 3. ORG_QUOTAS TABLE
-- =============================================
-- Partial index for concurrent pipeline limit checks
-- Only indexes rows where limit is actively enforced (non-null, > 0)
CREATE INDEX IF NOT EXISTS idx_org_quotas_concurrent_pipelines_active 
ON org_quotas (org_id) 
WHERE concurrent_pipelines_limit IS NOT NULL 
  AND concurrent_pipelines_limit > 0;

-- =============================================
-- 4. ORGANIZATION_MEMBERS TABLE
-- =============================================
-- Composite index for member lookups by org with role/status filtering
-- Covers: permission checks, member listings, role-based queries
CREATE INDEX IF NOT EXISTS idx_org_members_org_role_status 
ON organization_members (org_id, role, status);

-- =============================================
-- 5. INVITES TABLE
-- =============================================
-- Index for pending invite lookups by email
-- Covers: checking existing invites, accepting invites by email
CREATE INDEX IF NOT EXISTS idx_invites_email_status 
ON invites (email, status);

-- =============================================
-- 6. CLOUD_PROVIDER_INTEGRATIONS TABLE
-- =============================================
-- Index for org integrations filtered by validation status
-- Covers: dashboard queries showing valid/invalid integrations per org
CREATE INDEX IF NOT EXISTS idx_cloud_integrations_org_validation 
ON cloud_provider_integrations (org_id, validation_status);

-- =============================================
-- ANALYZE to update statistics
-- =============================================
ANALYZE profiles;
ANALYZE security_events;
ANALYZE org_quotas;
ANALYZE organization_members;
ANALYZE invites;
ANALYZE cloud_provider_integrations;
