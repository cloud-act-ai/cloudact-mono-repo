-- =============================================
-- CLOUDACT.AI - PRODUCTION DATABASE SETUP
-- Supabase PostgreSQL with RLS Enabled
-- =============================================
-- Version: 2.1.0
-- Last Updated: 2025-01-24
-- =============================================
-- CHANGELOG v2.1.0:
-- - Added org_type column to organizations
-- - Fixed org_slug regex to allow underscores (app generates slugs like acmeinc_11242025)
-- - Added transfer_ownership() function
-- - Added update_last_login() function
-- - Removed double membership creation (trigger only, not app)
-- - Fixed invite unique constraint (allows re-invite after expired/revoked)
-- - Added composite index on organization_members(user_id, status)
-- - Added expired invite cleanup function
-- - Made activity_logs.org_id NOT NULL for org activities
-- =============================================

-- =============================================
-- STEP 1: Clean slate - Drop existing objects
-- =============================================
-- Drop triggers (safe even if tables don't exist)
DO $$ BEGIN
  DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
EXCEPTION WHEN undefined_table THEN NULL;
END $$;

DO $$ BEGIN
  DROP TRIGGER IF EXISTS set_profiles_updated_at ON profiles;
EXCEPTION WHEN undefined_table THEN NULL;
END $$;

DO $$ BEGIN
  DROP TRIGGER IF EXISTS set_organizations_updated_at ON organizations;
EXCEPTION WHEN undefined_table THEN NULL;
END $$;

DO $$ BEGIN
  DROP TRIGGER IF EXISTS on_org_created ON organizations;
EXCEPTION WHEN undefined_table THEN NULL;
END $$;

DO $$ BEGIN
  DROP TRIGGER IF EXISTS enforce_seat_limit ON organization_members;
EXCEPTION WHEN undefined_table THEN NULL;
END $$;

DO $$ BEGIN
  DROP TRIGGER IF EXISTS protect_owner ON organization_members;
EXCEPTION WHEN undefined_table THEN NULL;
END $$;

DO $$ BEGIN
  DROP TRIGGER IF EXISTS update_login_timestamp ON auth.sessions;
EXCEPTION WHEN undefined_table THEN NULL;
END $$;

DROP FUNCTION IF EXISTS public.handle_new_user() CASCADE;
DROP FUNCTION IF EXISTS public.handle_updated_at() CASCADE;
DROP FUNCTION IF EXISTS public.user_is_org_member(UUID) CASCADE;
DROP FUNCTION IF EXISTS public.user_is_org_admin(UUID) CASCADE;
DROP FUNCTION IF EXISTS public.user_is_org_owner(UUID) CASCADE;
DROP FUNCTION IF EXISTS public.handle_org_created() CASCADE;
DROP FUNCTION IF EXISTS public.check_seat_limit() CASCADE;
DROP FUNCTION IF EXISTS public.protect_owner_role() CASCADE;
DROP FUNCTION IF EXISTS public.get_org_member_count(UUID) CASCADE;
DROP FUNCTION IF EXISTS public.get_org_invite_count(UUID) CASCADE;
DROP FUNCTION IF EXISTS public.can_add_member(UUID) CASCADE;
DROP FUNCTION IF EXISTS public.get_daily_usage(UUID, TEXT) CASCADE;
DROP FUNCTION IF EXISTS public.check_rate_limit(UUID, TEXT) CASCADE;
DROP FUNCTION IF EXISTS public.increment_usage(UUID, UUID, TEXT, INTEGER) CASCADE;
DROP FUNCTION IF EXISTS public.transfer_ownership(UUID, UUID, UUID) CASCADE;
DROP FUNCTION IF EXISTS public.update_last_login() CASCADE;
DROP FUNCTION IF EXISTS public.cleanup_expired_invites() CASCADE;

DROP TABLE IF EXISTS usage_tracking CASCADE;
DROP TABLE IF EXISTS activity_logs CASCADE;
DROP TABLE IF EXISTS invites CASCADE;
DROP TABLE IF EXISTS organization_members CASCADE;
DROP TABLE IF EXISTS organizations CASCADE;
DROP TABLE IF EXISTS profiles CASCADE;

-- =============================================
-- STEP 2: Create profiles table
-- Extends auth.users with app-specific data
-- =============================================
CREATE TABLE profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  full_name TEXT,
  avatar_url TEXT,
  phone TEXT,
  timezone TEXT DEFAULT 'UTC',

  -- Personal Stripe (for individual subscriptions if needed)
  stripe_customer_id TEXT UNIQUE,
  subscription_status TEXT DEFAULT 'none' CHECK (subscription_status IN ('none', 'trialing', 'active', 'past_due', 'canceled')),

  -- Usage tracking (for dashboard stats)
  total_operations INTEGER DEFAULT 0 NOT NULL,

  -- Metadata
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  last_login_at TIMESTAMPTZ,
  email_verified_at TIMESTAMPTZ,

  -- Preferences
  notification_preferences JSONB DEFAULT '{"email": true, "push": false}'::jsonb
);

CREATE INDEX idx_profiles_email ON profiles(email);
CREATE INDEX idx_profiles_stripe_customer ON profiles(stripe_customer_id);

COMMENT ON TABLE profiles IS 'User profiles extending auth.users with app-specific data';

-- =============================================
-- STEP 3: Create organizations table
-- Multi-tenant workspace/company with billing
-- =============================================
CREATE TABLE organizations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  -- org_slug: lowercase alphanumeric with dashes or underscores
  -- App generates: acmeinc_11242025 (name_mmddyyyy)
  org_slug TEXT UNIQUE NOT NULL CHECK (org_slug ~ '^[a-z0-9][a-z0-9_-]*[a-z0-9]$' AND length(org_slug) >= 3 AND length(org_slug) <= 50),
  org_name TEXT NOT NULL CHECK (length(org_name) >= 2 AND length(org_name) <= 100),

  -- Organization type (from onboarding)
  org_type TEXT CHECK (org_type IN ('personal', 'startup', 'agency', 'company', 'educational')),

  -- Organization details
  logo_url TEXT,
  website TEXT,
  industry TEXT,

  -- Subscription & Billing (Source of truth)
  plan TEXT NOT NULL DEFAULT 'starter' CHECK (plan IN ('starter', 'professional', 'scale', 'enterprise')),
  billing_status TEXT NOT NULL DEFAULT 'trialing' CHECK (billing_status IN ('trialing', 'active', 'past_due', 'canceled', 'incomplete', 'paused')),
  stripe_customer_id TEXT UNIQUE,
  stripe_subscription_id TEXT UNIQUE,
  stripe_price_id TEXT,

  -- Trial management
  trial_ends_at TIMESTAMPTZ DEFAULT (NOW() + INTERVAL '14 days'),
  subscription_started_at TIMESTAMPTZ,
  subscription_ends_at TIMESTAMPTZ,

  -- Plan limits (synced from Stripe or set manually)
  seat_limit INTEGER NOT NULL DEFAULT 2,
  providers_limit INTEGER NOT NULL DEFAULT 3,
  pipelines_per_day_limit INTEGER NOT NULL DEFAULT 6,

  -- Usage counters (reset daily/monthly by cron)
  current_period_start TIMESTAMPTZ DEFAULT NOW(),
  current_period_end TIMESTAMPTZ DEFAULT (NOW() + INTERVAL '1 month'),

  -- Ownership
  created_by UUID NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

CREATE INDEX idx_organizations_slug ON organizations(org_slug);
CREATE INDEX idx_organizations_created_by ON organizations(created_by);
CREATE INDEX idx_organizations_stripe_customer ON organizations(stripe_customer_id);
CREATE INDEX idx_organizations_stripe_subscription ON organizations(stripe_subscription_id);
CREATE INDEX idx_organizations_billing_status ON organizations(billing_status);
CREATE INDEX idx_organizations_plan ON organizations(plan);
CREATE INDEX idx_organizations_trial_ends ON organizations(trial_ends_at) WHERE billing_status = 'trialing';

COMMENT ON TABLE organizations IS 'Organizations/workspaces with billing, limits, and seat management';

-- =============================================
-- STEP 4: Create organization_members table
-- User <-> Organization relationship with roles
-- =============================================
CREATE TABLE organization_members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  -- 3 roles: owner (creator/admin), collaborator (editor), read_only (viewer)
  role TEXT NOT NULL DEFAULT 'read_only' CHECK (role IN ('owner', 'collaborator', 'read_only')),
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'inactive', 'suspended')),

  -- Invitation tracking
  invited_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  invite_accepted_at TIMESTAMPTZ,

  -- Timestamps
  joined_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  last_active_at TIMESTAMPTZ,

  UNIQUE(org_id, user_id)
);

CREATE INDEX idx_org_members_org_id ON organization_members(org_id);
CREATE INDEX idx_org_members_user_id ON organization_members(user_id);
CREATE INDEX idx_org_members_status ON organization_members(status);
CREATE INDEX idx_org_members_role ON organization_members(role);
-- Composite index for frequent query: find user's active memberships
CREATE INDEX idx_org_members_user_status ON organization_members(user_id, status) WHERE status = 'active';

COMMENT ON TABLE organization_members IS 'User membership in organizations with roles: owner, collaborator, read_only';

-- =============================================
-- STEP 5: Create invites table
-- Pending invitations to join organizations
-- =============================================
CREATE TABLE invites (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  -- Cannot invite as owner - only collaborator or read_only
  role TEXT NOT NULL DEFAULT 'read_only' CHECK (role IN ('collaborator', 'read_only')),
  token TEXT UNIQUE NOT NULL,

  -- Invitation details
  invited_by UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  personal_message TEXT,

  -- Status tracking
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'expired', 'revoked')),
  expires_at TIMESTAMPTZ NOT NULL,
  accepted_at TIMESTAMPTZ,
  accepted_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,

  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

-- Only one PENDING invite per email per org (allows re-invite after expired/revoked/accepted)
CREATE UNIQUE INDEX idx_invites_unique_pending ON invites(org_id, email) WHERE status = 'pending';

CREATE INDEX idx_invites_token ON invites(token);
CREATE INDEX idx_invites_email ON invites(email);
CREATE INDEX idx_invites_org_id ON invites(org_id);
CREATE INDEX idx_invites_status ON invites(status);
CREATE INDEX idx_invites_expires ON invites(expires_at) WHERE status = 'pending';

COMMENT ON TABLE invites IS 'Pending invitations to join organizations';

-- =============================================
-- STEP 6: Create activity_logs table
-- Audit trail for compliance
-- =============================================
CREATE TABLE activity_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID REFERENCES organizations(id) ON DELETE SET NULL,
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,

  -- Action details
  action TEXT NOT NULL,
  resource_type TEXT,
  resource_id TEXT,

  -- Context
  metadata JSONB DEFAULT '{}'::jsonb,
  ip_address INET,
  user_agent TEXT,

  -- Result
  status TEXT NOT NULL DEFAULT 'success' CHECK (status IN ('success', 'failure', 'pending')),
  error_message TEXT,

  -- Timestamp
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

CREATE INDEX idx_activity_logs_org_id ON activity_logs(org_id);
CREATE INDEX idx_activity_logs_user_id ON activity_logs(user_id);
CREATE INDEX idx_activity_logs_action ON activity_logs(action);
CREATE INDEX idx_activity_logs_created_at ON activity_logs(created_at DESC);
CREATE INDEX idx_activity_logs_resource ON activity_logs(resource_type, resource_id);

COMMENT ON TABLE activity_logs IS 'Audit trail for organization activities and compliance';

-- =============================================
-- STEP 7: Create usage_tracking table
-- Track API calls, pipelines, etc. for rate limiting
-- =============================================
CREATE TABLE usage_tracking (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,

  -- Usage type
  usage_type TEXT NOT NULL CHECK (usage_type IN ('pipeline', 'api_call', 'provider_connection', 'export', 'import')),

  -- Counting
  count INTEGER NOT NULL DEFAULT 1,

  -- Time bucketing for rate limits
  period_start TIMESTAMPTZ NOT NULL DEFAULT date_trunc('day', NOW()),
  period_end TIMESTAMPTZ NOT NULL DEFAULT date_trunc('day', NOW()) + INTERVAL '1 day',

  -- Metadata
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,

  -- One row per org per usage_type per day
  UNIQUE(org_id, usage_type, period_start)
);

CREATE INDEX idx_usage_org_type ON usage_tracking(org_id, usage_type);
CREATE INDEX idx_usage_period ON usage_tracking(period_start, period_end);

COMMENT ON TABLE usage_tracking IS 'Track daily usage for rate limiting and quotas';

-- =============================================
-- STEP 8: Create helper functions (SECURITY DEFINER)
-- These bypass RLS to avoid infinite recursion
-- =============================================

-- Check if user is a member of an organization
-- SECURITY DEFINER is required to bypass RLS when checking membership
-- (otherwise infinite recursion: RLS calls function, function queries table, RLS triggers...)
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

-- Check if user is the owner of an organization (has admin privileges)
-- Renamed from user_is_org_admin for backward compatibility
CREATE OR REPLACE FUNCTION public.user_is_org_admin(check_org_id UUID)
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

-- Alias: user_is_org_owner = user_is_org_admin (same thing now)
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

-- Get current active member count for an organization
CREATE OR REPLACE FUNCTION public.get_org_member_count(check_org_id UUID)
RETURNS INTEGER AS $$
BEGIN
  RETURN (
    SELECT COUNT(*)::INTEGER FROM organization_members
    WHERE org_id = check_org_id
    AND status = 'active'
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE;

-- Get pending invite count for an organization
CREATE OR REPLACE FUNCTION public.get_org_invite_count(check_org_id UUID)
RETURNS INTEGER AS $$
BEGIN
  RETURN (
    SELECT COUNT(*)::INTEGER FROM invites
    WHERE org_id = check_org_id
    AND status = 'pending'
    AND expires_at > NOW()
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE;

-- Check if organization can add more members (members + pending invites < seat_limit)
CREATE OR REPLACE FUNCTION public.can_add_member(check_org_id UUID)
RETURNS BOOLEAN AS $$
DECLARE
  current_count INTEGER;
  invite_count INTEGER;
  max_seats INTEGER;
BEGIN
  SELECT seat_limit INTO max_seats FROM organizations WHERE id = check_org_id;
  current_count := get_org_member_count(check_org_id);
  invite_count := get_org_invite_count(check_org_id);

  RETURN (current_count + invite_count) < max_seats;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE;

-- Get daily usage for an organization
CREATE OR REPLACE FUNCTION public.get_daily_usage(check_org_id UUID, check_type TEXT)
RETURNS INTEGER AS $$
BEGIN
  RETURN COALESCE(
    (SELECT count FROM usage_tracking
     WHERE org_id = check_org_id
     AND usage_type = check_type
     AND period_start = date_trunc('day', NOW())
    ), 0
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE;

-- Check if organization is within rate limits
CREATE OR REPLACE FUNCTION public.check_rate_limit(check_org_id UUID, check_type TEXT)
RETURNS BOOLEAN AS $$
DECLARE
  current_usage INTEGER;
  max_limit INTEGER;
BEGIN
  current_usage := get_daily_usage(check_org_id, check_type);

  SELECT
    CASE check_type
      WHEN 'pipeline' THEN pipelines_per_day_limit
      ELSE 1000 -- Default high limit for other types
    END INTO max_limit
  FROM organizations WHERE id = check_org_id;

  RETURN current_usage < max_limit;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE;

-- Increment usage counter (upsert)
CREATE OR REPLACE FUNCTION public.increment_usage(
  p_org_id UUID,
  p_user_id UUID,
  p_usage_type TEXT,
  p_count INTEGER DEFAULT 1
)
RETURNS INTEGER AS $$
DECLARE
  new_count INTEGER;
BEGIN
  INSERT INTO usage_tracking (org_id, user_id, usage_type, count, period_start, period_end)
  VALUES (
    p_org_id,
    p_user_id,
    p_usage_type,
    p_count,
    date_trunc('day', NOW()),
    date_trunc('day', NOW()) + INTERVAL '1 day'
  )
  ON CONFLICT (org_id, usage_type, period_start)
  DO UPDATE SET count = usage_tracking.count + p_count
  RETURNING count INTO new_count;

  RETURN new_count;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- =============================================
-- STEP 9: Create auto-trigger functions
-- =============================================

-- Auto-create profile on user signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (id, email, full_name, created_at, updated_at)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'full_name', split_part(NEW.email, '@', 1)),
    NOW(),
    NOW()
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Auto-update updated_at timestamp
CREATE OR REPLACE FUNCTION public.handle_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Auto-create owner membership when organization is created
CREATE OR REPLACE FUNCTION public.handle_org_created()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.organization_members (org_id, user_id, role, status, joined_at)
  VALUES (NEW.id, NEW.created_by, 'owner', 'active', NOW());
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Enforce seat limit on member insert
CREATE OR REPLACE FUNCTION public.check_seat_limit()
RETURNS TRIGGER AS $$
DECLARE
  current_count INTEGER;
  max_seats INTEGER;
BEGIN
  -- Skip check for inactive/suspended members
  IF NEW.status != 'active' THEN
    RETURN NEW;
  END IF;

  -- Get current count and limit
  SELECT seat_limit INTO max_seats FROM organizations WHERE id = NEW.org_id;
  current_count := get_org_member_count(NEW.org_id);

  -- For updates, don't count the current row
  IF TG_OP = 'UPDATE' AND OLD.status = 'active' THEN
    current_count := current_count - 1;
  END IF;

  IF current_count >= max_seats THEN
    RAISE EXCEPTION 'Seat limit reached. Current: %, Limit: %. Upgrade your plan to add more members.', current_count, max_seats;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Protect owner role from being changed or deleted
CREATE OR REPLACE FUNCTION public.protect_owner_role()
RETURNS TRIGGER AS $$
BEGIN
  -- Prevent changing owner role
  IF TG_OP = 'UPDATE' THEN
    IF OLD.role = 'owner' AND NEW.role != 'owner' THEN
      RAISE EXCEPTION 'Cannot change owner role. Transfer ownership first.';
    END IF;
    -- Prevent deactivating owner
    IF OLD.role = 'owner' AND OLD.status = 'active' AND NEW.status != 'active' THEN
      RAISE EXCEPTION 'Cannot deactivate organization owner.';
    END IF;
  END IF;

  -- Prevent deleting owner
  IF TG_OP = 'DELETE' THEN
    IF OLD.role = 'owner' THEN
      RAISE EXCEPTION 'Cannot delete organization owner. Delete the organization instead.';
    END IF;
  END IF;

  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Transfer ownership from current owner to another member
-- Must be called by the current owner
CREATE OR REPLACE FUNCTION public.transfer_ownership(
  p_org_id UUID,
  p_current_owner_id UUID,
  p_new_owner_id UUID
)
RETURNS BOOLEAN AS $$
DECLARE
  v_current_role TEXT;
  v_new_member_exists BOOLEAN;
BEGIN
  -- Verify current owner
  SELECT role INTO v_current_role
  FROM organization_members
  WHERE org_id = p_org_id AND user_id = p_current_owner_id AND status = 'active';

  IF v_current_role != 'owner' THEN
    RAISE EXCEPTION 'Only the current owner can transfer ownership';
  END IF;

  -- Verify new owner is an active member
  SELECT EXISTS(
    SELECT 1 FROM organization_members
    WHERE org_id = p_org_id AND user_id = p_new_owner_id AND status = 'active'
  ) INTO v_new_member_exists;

  IF NOT v_new_member_exists THEN
    RAISE EXCEPTION 'New owner must be an active member of the organization';
  END IF;

  -- Transfer: demote current owner to collaborator
  UPDATE organization_members
  SET role = 'collaborator'
  WHERE org_id = p_org_id AND user_id = p_current_owner_id;

  -- Promote new owner
  UPDATE organization_members
  SET role = 'owner'
  WHERE org_id = p_org_id AND user_id = p_new_owner_id;

  -- Update organizations.created_by
  UPDATE organizations
  SET created_by = p_new_owner_id
  WHERE id = p_org_id;

  RETURN TRUE;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Update last_login_at when user logs in (call from app)
CREATE OR REPLACE FUNCTION public.update_last_login(p_user_id UUID)
RETURNS VOID AS $$
BEGIN
  UPDATE profiles
  SET last_login_at = NOW()
  WHERE id = p_user_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Cleanup expired invites (call via cron or scheduled function)
CREATE OR REPLACE FUNCTION public.cleanup_expired_invites()
RETURNS INTEGER AS $$
DECLARE
  expired_count INTEGER;
BEGIN
  UPDATE invites
  SET status = 'expired'
  WHERE status = 'pending' AND expires_at < NOW();

  GET DIAGNOSTICS expired_count = ROW_COUNT;
  RETURN expired_count;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- =============================================
-- STEP 10: Create triggers
-- =============================================

-- User signup -> create profile
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Profile update -> set updated_at
CREATE TRIGGER set_profiles_updated_at
  BEFORE UPDATE ON profiles
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

-- Organization update -> set updated_at
CREATE TRIGGER set_organizations_updated_at
  BEFORE UPDATE ON organizations
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

-- Organization created -> add creator as owner
CREATE TRIGGER on_org_created
  AFTER INSERT ON organizations
  FOR EACH ROW EXECUTE FUNCTION public.handle_org_created();

-- Member insert/update -> enforce seat limit
CREATE TRIGGER enforce_seat_limit
  BEFORE INSERT OR UPDATE ON organization_members
  FOR EACH ROW EXECUTE FUNCTION public.check_seat_limit();

-- Protect owner from modification/deletion
CREATE TRIGGER protect_owner
  BEFORE UPDATE OR DELETE ON organization_members
  FOR EACH ROW EXECUTE FUNCTION public.protect_owner_role();

-- =============================================
-- STEP 11: Enable Row Level Security
-- =============================================
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE organizations ENABLE ROW LEVEL SECURITY;
ALTER TABLE organization_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE invites ENABLE ROW LEVEL SECURITY;
ALTER TABLE activity_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE usage_tracking ENABLE ROW LEVEL SECURITY;

-- =============================================
-- STEP 12: RLS Policies - PROFILES
-- =============================================

-- Users can view their own profile
CREATE POLICY "profiles_select_own"
  ON profiles FOR SELECT
  TO authenticated
  USING (auth.uid() = id);

-- Users can insert their own profile (backup for trigger)
CREATE POLICY "profiles_insert_own"
  ON profiles FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = id);

-- Users can update their own profile
CREATE POLICY "profiles_update_own"
  ON profiles FOR UPDATE
  TO authenticated
  USING (auth.uid() = id)
  WITH CHECK (auth.uid() = id);

-- =============================================
-- STEP 13: RLS Policies - ORGANIZATIONS
-- =============================================

-- Members can view their organizations
CREATE POLICY "organizations_select_member"
  ON organizations FOR SELECT
  TO authenticated
  USING (user_is_org_member(id));

-- Any authenticated user can create an organization
CREATE POLICY "organizations_insert_authenticated"
  ON organizations FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = created_by);

-- Admins can update their organizations
CREATE POLICY "organizations_update_admin"
  ON organizations FOR UPDATE
  TO authenticated
  USING (user_is_org_admin(id))
  WITH CHECK (user_is_org_admin(id));

-- Only owner can delete (not just admin)
CREATE POLICY "organizations_delete_owner"
  ON organizations FOR DELETE
  TO authenticated
  USING (user_is_org_owner(id));

-- =============================================
-- STEP 14: RLS Policies - ORGANIZATION_MEMBERS
-- =============================================

-- Members can view other members in their orgs
CREATE POLICY "org_members_select_member"
  ON organization_members FOR SELECT
  TO authenticated
  USING (user_is_org_member(org_id));

-- Admins can add members (trigger enforces seat limit)
CREATE POLICY "org_members_insert_admin"
  ON organization_members FOR INSERT
  TO authenticated
  WITH CHECK (
    user_is_org_admin(org_id)
    OR (auth.uid() = user_id AND org_id IN (SELECT id FROM organizations WHERE created_by = auth.uid()))
  );

-- Admins can update members (except owner, except themselves)
CREATE POLICY "org_members_update_admin"
  ON organization_members FOR UPDATE
  TO authenticated
  USING (
    user_is_org_admin(org_id)
    AND user_id != auth.uid()
    AND role != 'owner'
  );

-- Only owner can remove members (except themselves)
CREATE POLICY "org_members_delete_owner"
  ON organization_members FOR DELETE
  TO authenticated
  USING (
    user_is_org_owner(org_id)
    AND user_id != auth.uid()
  );

-- =============================================
-- STEP 15: RLS Policies - INVITES
-- =============================================

-- Members can view invites for their orgs, or their own pending invite
CREATE POLICY "invites_select"
  ON invites FOR SELECT
  TO authenticated
  USING (
    user_is_org_member(org_id)
    OR email = (SELECT email FROM auth.users WHERE id = auth.uid())
  );

-- Admins can create invites (app logic checks seat limits)
CREATE POLICY "invites_insert_admin"
  ON invites FOR INSERT
  TO authenticated
  WITH CHECK (user_is_org_admin(org_id) AND invited_by = auth.uid());

-- Admins can update invites (revoke), or invitee can accept
CREATE POLICY "invites_update"
  ON invites FOR UPDATE
  TO authenticated
  USING (
    user_is_org_admin(org_id)
    OR email = (SELECT email FROM auth.users WHERE id = auth.uid())
  );

-- Admins can delete invites
CREATE POLICY "invites_delete_admin"
  ON invites FOR DELETE
  TO authenticated
  USING (user_is_org_admin(org_id));

-- =============================================
-- STEP 16: RLS Policies - ACTIVITY_LOGS
-- =============================================

-- Members can view activity logs for their orgs
CREATE POLICY "activity_logs_select_member"
  ON activity_logs FOR SELECT
  TO authenticated
  USING (user_is_org_member(org_id) OR user_id = auth.uid());

-- Authenticated users can insert activity logs
CREATE POLICY "activity_logs_insert"
  ON activity_logs FOR INSERT
  TO authenticated
  WITH CHECK (user_id = auth.uid());

-- =============================================
-- STEP 17: RLS Policies - USAGE_TRACKING
-- =============================================

-- Members can view usage for their orgs
CREATE POLICY "usage_select_member"
  ON usage_tracking FOR SELECT
  TO authenticated
  USING (user_is_org_member(org_id));

-- Members can insert usage (via function)
CREATE POLICY "usage_insert_member"
  ON usage_tracking FOR INSERT
  TO authenticated
  WITH CHECK (user_is_org_member(org_id));

-- Allow updates for upsert (increment_usage function)
CREATE POLICY "usage_update_member"
  ON usage_tracking FOR UPDATE
  TO authenticated
  USING (user_is_org_member(org_id));

-- =============================================
-- STEP 18: Grant permissions
-- =============================================
GRANT USAGE ON SCHEMA public TO authenticated;
GRANT ALL ON ALL TABLES IN SCHEMA public TO authenticated;
GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO authenticated;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public TO authenticated;

-- =============================================
-- STEP 19: Service role policies for webhooks
-- Stripe webhooks need to update without user context
-- =============================================

-- Allow service role to update organizations (for Stripe webhooks)
CREATE POLICY "organizations_update_service"
  ON organizations FOR UPDATE
  TO service_role
  USING (true)
  WITH CHECK (true);

-- Allow service role to update profiles (for Stripe webhooks)
CREATE POLICY "profiles_update_service"
  ON profiles FOR UPDATE
  TO service_role
  USING (true)
  WITH CHECK (true);

-- =============================================
-- SETUP COMPLETE - v2.1.0
-- =============================================
-- Tables: profiles, organizations, organization_members, invites, activity_logs, usage_tracking
--
-- Key Features:
-- ✅ Auto profile creation on signup
-- ✅ Auto owner membership on org creation (via trigger)
-- ✅ DB-level seat limit enforcement via trigger
-- ✅ Usage tracking for rate limiting
-- ✅ Owner role protection (cannot be modified/deleted without transfer)
-- ✅ Ownership transfer function
-- ✅ Service role policies for Stripe webhooks
-- ✅ Trial management columns
-- ✅ Comprehensive indexes (including composite)
-- ✅ org_type column for organization classification
-- ✅ Flexible invite system (allows re-invite after expire/revoke)
-- ✅ Expired invite cleanup function
-- ✅ Last login tracking
--
-- Role Hierarchy (3 tiers):
-- - owner: Full access, billing, member management, org settings
-- - collaborator: Edit data, view access, no admin functions
-- - read_only: View only access
--
-- Helper Functions:
-- - user_is_org_member(org_id) - Check membership
-- - user_is_org_admin(org_id) - Check owner (backward compat alias)
-- - user_is_org_owner(org_id) - Check owner only
-- - get_org_member_count(org_id) - Count active members
-- - get_org_invite_count(org_id) - Count pending invites
-- - can_add_member(org_id) - Check if seat available
-- - get_daily_usage(org_id, type) - Get usage count
-- - check_rate_limit(org_id, type) - Check if within limit
-- - increment_usage(org_id, user_id, type, count) - Track usage
-- - transfer_ownership(org_id, current_owner, new_owner) - Transfer ownership
-- - update_last_login(user_id) - Update last login timestamp
-- - cleanup_expired_invites() - Mark expired invites as expired
-- =============================================
