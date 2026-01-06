-- =============================================
-- Migration 32: RLS Security Fixes
-- =============================================
-- Fixes found during pre-launch bug hunt:
-- MT-001: cloud_provider_integrations UPDATE missing WITH CHECK
-- MT-002: subscription_providers_meta UPDATE missing WITH CHECK
-- SEC-001: user_is_org_admin() incorrectly includes 'collaborator' instead of 'admin'
-- =============================================
-- Run this in Supabase SQL Editor
-- =============================================

-- Record migration
INSERT INTO migrations (name, applied_at)
VALUES ('32_rls_security_fixes', NOW())
ON CONFLICT (name) DO NOTHING;

-- =============================================
-- SEC-001 FIX: Correct user_is_org_admin function
-- The function was checking for 'collaborator' role instead of 'admin'
-- =============================================

CREATE OR REPLACE FUNCTION public.user_is_org_admin(check_org_id UUID)
RETURNS BOOLEAN AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM organization_members
    WHERE org_id = check_org_id
    AND user_id = auth.uid()
    AND role IN ('owner', 'admin')  -- SEC-001 FIX: Changed from ('owner', 'collaborator')
    AND status = 'active'
    LIMIT 1
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE;

COMMENT ON FUNCTION public.user_is_org_admin(UUID) IS
'Returns true if the current user is an owner or admin of the specified organization.
Fixed in migration 32 to use admin role instead of collaborator.';

-- =============================================
-- MT-001 FIX: Add WITH CHECK to cloud_provider_integrations UPDATE
-- Prevents users from changing org_id to move records to another org
-- =============================================

-- Drop existing policy
DROP POLICY IF EXISTS "Admins can update cloud integrations" ON cloud_provider_integrations;

-- Recreate with WITH CHECK clause
CREATE POLICY "Admins can update cloud integrations"
  ON cloud_provider_integrations
  FOR UPDATE
  USING (
    org_id IN (
      SELECT om.org_id FROM organization_members om
      WHERE om.user_id = auth.uid()
        AND om.status = 'active'
        AND om.role IN ('owner', 'admin')
    )
  )
  WITH CHECK (
    -- MT-001 FIX: Ensure org_id cannot be changed to a different org
    org_id IN (
      SELECT om.org_id FROM organization_members om
      WHERE om.user_id = auth.uid()
        AND om.status = 'active'
        AND om.role IN ('owner', 'admin')
    )
  );

-- =============================================
-- MT-002 FIX: Add WITH CHECK to subscription_providers_meta UPDATE
-- Prevents users from changing org_id to move records to another org
-- =============================================

-- Drop existing policy
DROP POLICY IF EXISTS "Admins can update subscription providers" ON subscription_providers_meta;

-- Recreate with WITH CHECK clause
CREATE POLICY "Admins can update subscription providers"
  ON subscription_providers_meta
  FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM organization_members om
      WHERE om.org_id = subscription_providers_meta.org_id
      AND om.user_id = auth.uid()
      AND om.status = 'active'
      AND om.role IN ('owner', 'admin')
    )
  )
  WITH CHECK (
    -- MT-002 FIX: Ensure org_id cannot be changed to a different org
    EXISTS (
      SELECT 1 FROM organization_members om
      WHERE om.org_id = subscription_providers_meta.org_id
      AND om.user_id = auth.uid()
      AND om.status = 'active'
      AND om.role IN ('owner', 'admin')
    )
  );

-- =============================================
-- Verification
-- =============================================

SELECT 'Migration 32: RLS Security Fixes applied successfully' as result;
