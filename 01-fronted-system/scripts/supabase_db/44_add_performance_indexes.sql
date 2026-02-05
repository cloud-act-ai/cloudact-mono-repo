-- =============================================
-- Migration 44: Add Performance Indexes
-- =============================================
-- Recommended indexes from E11 Supabase review
-- All use IF NOT EXISTS to be idempotent
-- =============================================

-- 1. profiles: case-insensitive email lookups
CREATE INDEX IF NOT EXISTS idx_profiles_email_lower 
    ON profiles (lower(email));

-- 2. security_events: composite index for combined filters (skip if table doesn't exist)
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'security_events') THEN
        CREATE INDEX IF NOT EXISTS idx_security_events_user_type_created
            ON security_events (user_id, event_type, created_at DESC);
    END IF;
END $$;

-- 3. org_quotas: partial index for concurrent pipeline checks
CREATE INDEX IF NOT EXISTS idx_org_quotas_concurrent_running 
    ON org_quotas (org_id) 
    WHERE concurrent_running > 0;

-- 4. organization_members: role+status composite for permission checks
CREATE INDEX IF NOT EXISTS idx_org_members_org_role_status 
    ON organization_members (org_id, role, status);

-- 5. invites: pending email lookup
CREATE INDEX IF NOT EXISTS idx_invites_email_status 
    ON invites (email, status);

-- 6. cloud_provider_integrations: status filter for enabled integrations
CREATE INDEX IF NOT EXISTS idx_integrations_org_status 
    ON cloud_provider_integrations (org_id, status, is_enabled);

-- =============================================
-- Analyze tables to update statistics
-- =============================================
ANALYZE profiles;
-- ANALYZE security_events only if it exists
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'security_events') THEN
        ANALYZE security_events;
    END IF;
END $$;
ANALYZE org_quotas;
ANALYZE organization_members;
ANALYZE invites;
ANALYZE cloud_provider_integrations;

-- =============================================
-- Done - 6 new indexes added
-- =============================================
