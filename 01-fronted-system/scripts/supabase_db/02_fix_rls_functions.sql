-- =============================================
-- FIX: RLS Helper Functions with SECURITY DEFINER
-- =============================================
-- The helper functions need SECURITY DEFINER to bypass RLS
-- when checking membership, otherwise infinite recursion occurs
-- =============================================
-- Run this in Supabase SQL Editor

-- Fix user_is_org_member function
CREATE OR REPLACE FUNCTION public.user_is_org_member(check_org_id UUID)
RETURNS BOOLEAN AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM organization_members
    WHERE org_id = check_org_id
    AND user_id = auth.uid()
    AND status = 'active'
    LIMIT 1
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE;

-- Fix user_is_org_admin function
CREATE OR REPLACE FUNCTION public.user_is_org_admin(check_org_id UUID)
RETURNS BOOLEAN AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM organization_members
    WHERE org_id = check_org_id
    AND user_id = auth.uid()
    AND role IN ('owner', 'collaborator')
    AND status = 'active'
    LIMIT 1
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE;

-- Fix user_is_org_owner function
CREATE OR REPLACE FUNCTION public.user_is_org_owner(check_org_id UUID)
RETURNS BOOLEAN AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM organization_members
    WHERE org_id = check_org_id
    AND user_id = auth.uid()
    AND role = 'owner'
    AND status = 'active'
    LIMIT 1
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE;

-- Also add a policy for profiles to allow reading by user_id (for member list)
DROP POLICY IF EXISTS "profiles_select_by_id" ON profiles;
CREATE POLICY "profiles_select_by_id"
  ON profiles FOR SELECT
  TO authenticated
  USING (true);  -- Allow authenticated users to read any profile (email/name only)

-- Success message
SELECT 'RLS helper functions fixed with SECURITY DEFINER' as result;
