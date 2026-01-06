-- =============================================
-- Migration 35: Fix Role Escalation Vulnerability (AUTH-001)
-- =============================================
-- The organization_members UPDATE policy allowed users to update
-- their own role, enabling privilege escalation.
--
-- Fix: Users can only update 'status' on their own membership
-- (for leaving org), not role or other sensitive fields.
-- =============================================
-- Run this in Supabase SQL Editor
-- =============================================

-- Record migration
INSERT INTO migrations (name, applied_at)
VALUES ('35_role_escalation_fix', NOW())
ON CONFLICT (name) DO NOTHING;

-- =============================================
-- AUTH-001 FIX: Create a function to validate member updates
-- =============================================

-- Create function to check if user is modifying only allowed fields
CREATE OR REPLACE FUNCTION check_member_self_update()
RETURNS TRIGGER AS $$
BEGIN
  -- If user is updating their own record (not an admin operation)
  IF OLD.user_id = auth.uid() THEN
    -- Check if they're trying to change role
    IF OLD.role IS DISTINCT FROM NEW.role THEN
      RAISE EXCEPTION 'You cannot change your own role';
    END IF;

    -- Check if they're trying to change org_id
    IF OLD.org_id IS DISTINCT FROM NEW.org_id THEN
      RAISE EXCEPTION 'You cannot change organization';
    END IF;

    -- Check if they're trying to change user_id
    IF OLD.user_id IS DISTINCT FROM NEW.user_id THEN
      RAISE EXCEPTION 'You cannot change user assignment';
    END IF;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create trigger to enforce the check
DROP TRIGGER IF EXISTS enforce_member_self_update ON organization_members;
CREATE TRIGGER enforce_member_self_update
  BEFORE UPDATE ON organization_members
  FOR EACH ROW
  EXECUTE FUNCTION check_member_self_update();

-- =============================================
-- AUTH-001 FIX: Also add WITH CHECK to prevent role manipulation
-- =============================================

-- Drop and recreate the UPDATE policy with WITH CHECK
DROP POLICY IF EXISTS "Admins can update members" ON organization_members;

CREATE POLICY "Admins can update members"
ON organization_members
FOR UPDATE
USING (
  -- Admins can update any member in their org
  org_id IN (
    SELECT org_id
    FROM organization_members
    WHERE user_id = auth.uid()
    AND role IN ('owner', 'admin')
    AND status = 'active'
  )
  OR
  -- Users can update their own membership (e.g., leaving org)
  user_id = auth.uid()
)
WITH CHECK (
  -- AUTH-001 FIX: Ensure users can't escalate their own role
  -- Admins updating others: any role is allowed
  (
    user_id != auth.uid()
    AND org_id IN (
      SELECT org_id
      FROM organization_members
      WHERE user_id = auth.uid()
      AND role IN ('owner', 'admin')
      AND status = 'active'
    )
  )
  OR
  -- Self-update: role must stay the same (enforced by trigger too)
  -- Users can only update status to 'inactive' (leaving org)
  (
    user_id = auth.uid()
    AND role = (
      SELECT role FROM organization_members
      WHERE user_id = auth.uid() AND org_id = organization_members.org_id
    )
  )
);

-- =============================================
-- Additional safeguard: Prevent owner demotion if only owner
-- =============================================

CREATE OR REPLACE FUNCTION prevent_last_owner_demotion()
RETURNS TRIGGER AS $$
DECLARE
  owner_count INTEGER;
BEGIN
  -- Only check if role is being changed from 'owner'
  IF OLD.role = 'owner' AND NEW.role != 'owner' THEN
    -- Count remaining owners in the org
    SELECT COUNT(*) INTO owner_count
    FROM organization_members
    WHERE org_id = OLD.org_id
      AND role = 'owner'
      AND status = 'active'
      AND id != OLD.id;  -- Exclude current record

    IF owner_count = 0 THEN
      RAISE EXCEPTION 'Cannot remove the last owner from organization';
    END IF;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS prevent_last_owner ON organization_members;
CREATE TRIGGER prevent_last_owner
  BEFORE UPDATE ON organization_members
  FOR EACH ROW
  WHEN (OLD.role = 'owner' AND NEW.role != 'owner')
  EXECUTE FUNCTION prevent_last_owner_demotion();

-- =============================================
-- Verification
-- =============================================

SELECT 'Migration 35: Role escalation fix applied successfully' as result;
