-- ================================================
-- Migration 13: Add RLS Policies for All Tables
-- ================================================
-- Issue #16: Missing RLS policies
-- Ensures users can only access data from organizations they belong to.
-- Implements row-level security for multi-tenant isolation.
--
-- Tables covered:
-- - organizations
-- - organization_members
-- - profiles
-- - invites
-- - activity_logs
-- - saas_subscriptions
--
-- Pattern: Users can only access rows where org_slug/org_id matches their org
-- ================================================

-- Enable RLS on all tables if not already enabled
ALTER TABLE organizations ENABLE ROW LEVEL SECURITY;
ALTER TABLE organization_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE invites ENABLE ROW LEVEL SECURITY;
ALTER TABLE activity_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE saas_subscriptions ENABLE ROW LEVEL SECURITY;

-- ================================================
-- ORGANIZATIONS TABLE
-- ================================================

-- Policy: Users can view organizations they are members of
DROP POLICY IF EXISTS "Users can view their organizations" ON organizations;
CREATE POLICY "Users can view their organizations"
ON organizations
FOR SELECT
USING (
  id IN (
    SELECT org_id
    FROM organization_members
    WHERE user_id = auth.uid()
    AND status = 'active'
  )
);

-- Policy: Users can update organizations where they are owners
DROP POLICY IF EXISTS "Owners can update organizations" ON organizations;
CREATE POLICY "Owners can update organizations"
ON organizations
FOR UPDATE
USING (
  id IN (
    SELECT org_id
    FROM organization_members
    WHERE user_id = auth.uid()
    AND role = 'owner'
    AND status = 'active'
  )
);

-- Policy: Users can insert organizations (for new org creation)
-- This is needed for the signup flow where a user creates their first org
DROP POLICY IF EXISTS "Users can create organizations" ON organizations;
CREATE POLICY "Users can create organizations"
ON organizations
FOR INSERT
WITH CHECK (
  -- User must be authenticated
  auth.uid() IS NOT NULL
);

-- Policy: Owners can delete organizations
DROP POLICY IF EXISTS "Owners can delete organizations" ON organizations;
CREATE POLICY "Owners can delete organizations"
ON organizations
FOR DELETE
USING (
  id IN (
    SELECT org_id
    FROM organization_members
    WHERE user_id = auth.uid()
    AND role = 'owner'
    AND status = 'active'
  )
);

-- ================================================
-- ORGANIZATION_MEMBERS TABLE
-- ================================================

-- Policy: Users can view members of organizations they belong to
DROP POLICY IF EXISTS "Users can view organization members" ON organization_members;
CREATE POLICY "Users can view organization members"
ON organization_members
FOR SELECT
USING (
  org_id IN (
    SELECT org_id
    FROM organization_members
    WHERE user_id = auth.uid()
    AND status = 'active'
  )
);

-- Policy: Owners and admins can insert members (for invites)
DROP POLICY IF EXISTS "Admins can add members" ON organization_members;
CREATE POLICY "Admins can add members"
ON organization_members
FOR INSERT
WITH CHECK (
  org_id IN (
    SELECT org_id
    FROM organization_members
    WHERE user_id = auth.uid()
    AND role IN ('owner', 'admin')
    AND status = 'active'
  )
  OR
  -- Allow users to accept invites (they add themselves)
  user_id = auth.uid()
);

-- Policy: Owners and admins can update members
DROP POLICY IF EXISTS "Admins can update members" ON organization_members;
CREATE POLICY "Admins can update members"
ON organization_members
FOR UPDATE
USING (
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
);

-- Policy: Owners and admins can delete members
DROP POLICY IF EXISTS "Admins can delete members" ON organization_members;
CREATE POLICY "Admins can delete members"
ON organization_members
FOR DELETE
USING (
  org_id IN (
    SELECT org_id
    FROM organization_members
    WHERE user_id = auth.uid()
    AND role IN ('owner', 'admin')
    AND status = 'active'
  )
  OR
  -- Users can delete themselves (leave org)
  user_id = auth.uid()
);

-- ================================================
-- PROFILES TABLE
-- ================================================

-- Policy: Users can view all profiles (needed for member lists, invites)
-- This is safe because profiles don't contain sensitive data
DROP POLICY IF EXISTS "Users can view all profiles" ON profiles;
CREATE POLICY "Users can view all profiles"
ON profiles
FOR SELECT
USING (auth.uid() IS NOT NULL);

-- Policy: Users can update their own profile
DROP POLICY IF EXISTS "Users can update own profile" ON profiles;
CREATE POLICY "Users can update own profile"
ON profiles
FOR UPDATE
USING (id = auth.uid());

-- Policy: Users can insert their own profile (signup)
DROP POLICY IF EXISTS "Users can insert own profile" ON profiles;
CREATE POLICY "Users can insert own profile"
ON profiles
FOR INSERT
WITH CHECK (id = auth.uid());

-- Policy: Users can delete their own profile
DROP POLICY IF EXISTS "Users can delete own profile" ON profiles;
CREATE POLICY "Users can delete own profile"
ON profiles
FOR DELETE
USING (id = auth.uid());

-- ================================================
-- INVITES TABLE
-- ================================================

-- Policy: Users can view invites for organizations they are members of
DROP POLICY IF EXISTS "Members can view organization invites" ON invites;
CREATE POLICY "Members can view organization invites"
ON invites
FOR SELECT
USING (
  org_id IN (
    SELECT org_id
    FROM organization_members
    WHERE user_id = auth.uid()
    AND status = 'active'
  )
  OR
  -- Invited users can view their own invites
  email = (SELECT email FROM auth.users WHERE id = auth.uid())
);

-- Policy: Admins can create invites
DROP POLICY IF EXISTS "Admins can create invites" ON invites;
CREATE POLICY "Admins can create invites"
ON invites
FOR INSERT
WITH CHECK (
  org_id IN (
    SELECT org_id
    FROM organization_members
    WHERE user_id = auth.uid()
    AND role IN ('owner', 'admin')
    AND status = 'active'
  )
);

-- Policy: Admins can update invites (e.g., resend, cancel)
DROP POLICY IF EXISTS "Admins can update invites" ON invites;
CREATE POLICY "Admins can update invites"
ON invites
FOR UPDATE
USING (
  org_id IN (
    SELECT org_id
    FROM organization_members
    WHERE user_id = auth.uid()
    AND role IN ('owner', 'admin')
    AND status = 'active'
  )
  OR
  -- Invited users can accept their invites
  email = (SELECT email FROM auth.users WHERE id = auth.uid())
);

-- Policy: Admins can delete invites
DROP POLICY IF EXISTS "Admins can delete invites" ON invites;
CREATE POLICY "Admins can delete invites"
ON invites
FOR DELETE
USING (
  org_id IN (
    SELECT org_id
    FROM organization_members
    WHERE user_id = auth.uid()
    AND role IN ('owner', 'admin')
    AND status = 'active'
  )
);

-- ================================================
-- ACTIVITY_LOGS TABLE
-- ================================================

-- Policy: Members can view activity logs for their organizations
DROP POLICY IF EXISTS "Members can view organization activity" ON activity_logs;
CREATE POLICY "Members can view organization activity"
ON activity_logs
FOR SELECT
USING (
  org_id IN (
    SELECT org_id
    FROM organization_members
    WHERE user_id = auth.uid()
    AND status = 'active'
  )
);

-- Policy: All authenticated users can insert activity logs
-- This is needed because activity logs are created by various server actions
DROP POLICY IF EXISTS "Authenticated users can create activity logs" ON activity_logs;
CREATE POLICY "Authenticated users can create activity logs"
ON activity_logs
FOR INSERT
WITH CHECK (auth.uid() IS NOT NULL);

-- Policy: Owners can delete activity logs (for cleanup)
DROP POLICY IF EXISTS "Owners can delete activity logs" ON activity_logs;
CREATE POLICY "Owners can delete activity logs"
ON activity_logs
FOR DELETE
USING (
  org_id IN (
    SELECT org_id
    FROM organization_members
    WHERE user_id = auth.uid()
    AND role = 'owner'
    AND status = 'active'
  )
);

-- ================================================
-- SAAS_SUBSCRIPTIONS TABLE
-- ================================================

-- Policy: Members can view SaaS subscriptions for their organizations
DROP POLICY IF EXISTS "Members can view saas subscriptions" ON saas_subscriptions;
CREATE POLICY "Members can view saas subscriptions"
ON saas_subscriptions
FOR SELECT
USING (
  org_id IN (
    SELECT org_id
    FROM organization_members
    WHERE user_id = auth.uid()
    AND status = 'active'
  )
);

-- Policy: Admins can create SaaS subscriptions
DROP POLICY IF EXISTS "Admins can create saas subscriptions" ON saas_subscriptions;
CREATE POLICY "Admins can create saas subscriptions"
ON saas_subscriptions
FOR INSERT
WITH CHECK (
  org_id IN (
    SELECT org_id
    FROM organization_members
    WHERE user_id = auth.uid()
    AND role IN ('owner', 'admin')
    AND status = 'active'
  )
);

-- Policy: Admins can update SaaS subscriptions
DROP POLICY IF EXISTS "Admins can update saas subscriptions" ON saas_subscriptions;
CREATE POLICY "Admins can update saas subscriptions"
ON saas_subscriptions
FOR UPDATE
USING (
  org_id IN (
    SELECT org_id
    FROM organization_members
    WHERE user_id = auth.uid()
    AND role IN ('owner', 'admin')
    AND status = 'active'
  )
);

-- Policy: Admins can delete SaaS subscriptions
DROP POLICY IF EXISTS "Admins can delete saas subscriptions" ON saas_subscriptions;
CREATE POLICY "Admins can delete saas subscriptions"
ON saas_subscriptions
FOR DELETE
USING (
  org_id IN (
    SELECT org_id
    FROM organization_members
    WHERE user_id = auth.uid()
    AND role IN ('owner', 'admin')
    AND status = 'active'
  )
);

-- ================================================
-- END MIGRATION 13
-- ================================================
