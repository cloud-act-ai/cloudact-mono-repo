-- ================================================
-- Migration 18: Security Hardening
-- ================================================
-- Purpose: Implement critical security improvements
--
-- Changes:
-- 1. Add IP-based rate limiting for auth routes (pre-authentication)
-- 2. Tighten profiles SELECT policy for multi-tenant isolation
-- 3. Add security_events table for auth failure logging
--
-- Security Issues Addressed:
-- - Brute force attacks on login/signup
-- - Cross-tenant profile data leakage
-- - Missing security audit trail
-- ================================================

-- ================================================
-- PART 1: IP-Based Rate Limiting for Auth Routes
-- ================================================
-- The existing rate_limits table requires user_id, which doesn't work
-- for pre-authentication routes (login, signup, forgot-password).
-- This adds IP-based rate limiting for these routes.

-- Table for IP-based rate limiting (auth routes)
CREATE TABLE IF NOT EXISTS auth_rate_limits (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  ip_address TEXT NOT NULL,
  action_type TEXT NOT NULL,  -- 'login', 'signup', 'forgot_password'
  window_start TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  request_count INTEGER NOT NULL DEFAULT 1,
  -- Optional: track email for targeted lockouts
  email TEXT,
  UNIQUE(ip_address, action_type, window_start)
);

-- Enable RLS (only service_role can access)
ALTER TABLE auth_rate_limits ENABLE ROW LEVEL SECURITY;

-- No policies = only service_role can access
COMMENT ON TABLE auth_rate_limits IS 'IP-based rate limiting for auth routes. Only accessible via service_role.';

-- Indexes for fast lookups
CREATE INDEX IF NOT EXISTS idx_auth_rate_limits_ip_action ON auth_rate_limits(ip_address, action_type, window_start DESC);
CREATE INDEX IF NOT EXISTS idx_auth_rate_limits_email ON auth_rate_limits(email, action_type, window_start DESC);
CREATE INDEX IF NOT EXISTS idx_auth_rate_limits_cleanup ON auth_rate_limits(window_start);

-- Check and increment IP-based rate limit atomically
-- Returns TRUE if within limit, FALSE if exceeded
CREATE OR REPLACE FUNCTION check_auth_rate_limit(
  p_ip_address TEXT,
  p_action_type TEXT,
  p_max_requests INTEGER,
  p_window_seconds INTEGER,
  p_email TEXT DEFAULT NULL
)
RETURNS BOOLEAN AS $$
DECLARE
  v_window_start TIMESTAMPTZ;
  v_current_count INTEGER;
BEGIN
  -- Calculate window start (truncate to window boundary)
  v_window_start := date_trunc('second', NOW()) -
    ((EXTRACT(EPOCH FROM NOW())::INTEGER % p_window_seconds) * INTERVAL '1 second');

  -- Try to insert or update atomically
  INSERT INTO auth_rate_limits (ip_address, action_type, window_start, request_count, email)
  VALUES (p_ip_address, p_action_type, v_window_start, 1, p_email)
  ON CONFLICT (ip_address, action_type, window_start)
  DO UPDATE SET
    request_count = auth_rate_limits.request_count + 1,
    email = COALESCE(p_email, auth_rate_limits.email)
  RETURNING request_count INTO v_current_count;

  -- Check if within limit
  RETURN v_current_count <= p_max_requests;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Get remaining attempts for an IP
CREATE OR REPLACE FUNCTION get_auth_rate_limit_remaining(
  p_ip_address TEXT,
  p_action_type TEXT,
  p_max_requests INTEGER,
  p_window_seconds INTEGER
)
RETURNS INTEGER AS $$
DECLARE
  v_window_start TIMESTAMPTZ;
  v_count INTEGER;
BEGIN
  v_window_start := date_trunc('second', NOW()) -
    ((EXTRACT(EPOCH FROM NOW())::INTEGER % p_window_seconds) * INTERVAL '1 second');

  SELECT COALESCE(request_count, 0) INTO v_count
  FROM auth_rate_limits
  WHERE ip_address = p_ip_address
    AND action_type = p_action_type
    AND window_start = v_window_start;

  RETURN GREATEST(0, p_max_requests - COALESCE(v_count, 0));
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Cleanup old auth rate limit entries (call via cron)
CREATE OR REPLACE FUNCTION cleanup_old_auth_rate_limits(retention_hours INTEGER DEFAULT 24)
RETURNS INTEGER AS $$
DECLARE
  deleted_count INTEGER;
BEGIN
  DELETE FROM auth_rate_limits
  WHERE window_start < NOW() - (retention_hours || ' hours')::INTERVAL;
  GET DIAGNOSTICS deleted_count = ROW_COUNT;
  RETURN deleted_count;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Update master cleanup to include auth rate limits
CREATE OR REPLACE FUNCTION run_scheduled_cleanup()
RETURNS TABLE(
  rate_limits_deleted INTEGER,
  auth_rate_limits_deleted INTEGER,
  webhook_events_deleted INTEGER,
  deletion_tokens_deleted INTEGER,
  invites_expired INTEGER,
  security_events_cleaned INTEGER
) AS $$
DECLARE
  v_rate_limits INTEGER;
  v_auth_rate_limits INTEGER;
  v_webhooks INTEGER;
  v_tokens INTEGER;
  v_invites INTEGER;
  v_security_events INTEGER;
BEGIN
  -- Cleanup user-based rate limits older than 24 hours
  SELECT cleanup_old_rate_limits(24) INTO v_rate_limits;

  -- Cleanup IP-based auth rate limits older than 24 hours
  SELECT cleanup_old_auth_rate_limits(24) INTO v_auth_rate_limits;

  -- Cleanup webhook events older than 24 hours
  SELECT cleanup_old_webhook_events(24) INTO v_webhooks;

  -- Cleanup expired deletion tokens
  SELECT cleanup_expired_deletion_tokens() INTO v_tokens;

  -- Expire old invites
  SELECT cleanup_expired_invites() INTO v_invites;

  -- Cleanup old security events (keep 90 days for audit)
  SELECT cleanup_old_security_events(90) INTO v_security_events;

  RETURN QUERY SELECT v_rate_limits, v_auth_rate_limits, v_webhooks, v_tokens, v_invites, v_security_events;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ================================================
-- PART 2: Tighten Profiles SELECT Policy
-- ================================================
-- Current: Any authenticated user can view ALL profiles
-- Fix: Restrict to same-org members + own profile

-- Drop the overly permissive policy
DROP POLICY IF EXISTS "Users can view all profiles" ON profiles;
DROP POLICY IF EXISTS "profiles_select_same_org" ON profiles;

-- Create restricted policy: same-org members + own profile
CREATE POLICY "profiles_select_same_org" ON profiles
FOR SELECT
TO authenticated
USING (
  -- Users can always see their own profile
  id = auth.uid()
  OR
  -- Users can see profiles of members in their organizations
  id IN (
    SELECT om2.user_id
    FROM organization_members om1
    INNER JOIN organization_members om2 ON om1.org_id = om2.org_id
    WHERE om1.user_id = auth.uid()
    AND om1.status = 'active'
    AND om2.status = 'active'
  )
);

COMMENT ON POLICY "profiles_select_same_org" ON profiles
    IS 'Users can view own profile and profiles of members in their organizations';

-- ================================================
-- PART 3: Security Events Table for Auth Logging
-- ================================================
-- Captures auth failures, suspicious activity, and security-relevant events

CREATE TABLE IF NOT EXISTS security_events (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,

  -- Event identification
  event_type TEXT NOT NULL CHECK (event_type IN (
    'login_failed',
    'login_success',
    'signup_failed',
    'signup_success',
    'password_reset_requested',
    'password_reset_completed',
    'rate_limit_exceeded',
    'suspicious_activity',
    'session_expired',
    'invalid_token',
    'account_locked',
    'account_unlocked',
    'mfa_failed',
    'mfa_success',
    'api_key_invalid',
    'permission_denied'
  )),

  -- Event details
  severity TEXT NOT NULL DEFAULT 'info' CHECK (severity IN ('info', 'warning', 'error', 'critical')),
  message TEXT,

  -- Actor information
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  email TEXT,
  ip_address TEXT,
  user_agent TEXT,

  -- Context
  org_id UUID REFERENCES organizations(id) ON DELETE SET NULL,
  org_slug TEXT,

  -- Additional metadata
  metadata JSONB DEFAULT '{}'::jsonb,

  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,

  -- Indexes hint
  -- Frequently queried by: event_type, severity, ip_address, user_id, created_at
  CONSTRAINT security_events_ip_format CHECK (
    ip_address IS NULL OR
    ip_address ~ '^[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}$' OR
    ip_address ~ '^[0-9a-fA-F:]+$'  -- IPv6
  )
);

-- Enable RLS
ALTER TABLE security_events ENABLE ROW LEVEL SECURITY;

-- Only service_role can insert (no direct user access)
-- Admins can read for their orgs
CREATE POLICY "security_events_read_admin" ON security_events
FOR SELECT
TO authenticated
USING (
  -- Owners can view security events for their orgs
  org_id IN (
    SELECT org_id FROM organization_members
    WHERE user_id = auth.uid()
    AND role = 'owner'
    AND status = 'active'
  )
  OR
  -- Users can see their own events (by user_id or email)
  user_id = auth.uid()
  OR
  email = (SELECT email FROM auth.users WHERE id = auth.uid())
);

-- No INSERT/UPDATE/DELETE policies for authenticated users
-- Only service_role can write security events
COMMENT ON TABLE security_events IS 'Security audit log for auth events. Write via service_role only.';

-- Indexes for efficient querying
CREATE INDEX IF NOT EXISTS idx_security_events_type ON security_events(event_type, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_security_events_severity ON security_events(severity, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_security_events_ip ON security_events(ip_address, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_security_events_user ON security_events(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_security_events_email ON security_events(email, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_security_events_org ON security_events(org_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_security_events_cleanup ON security_events(created_at);

-- Function to log security events (call from service_role)
CREATE OR REPLACE FUNCTION log_security_event(
  p_event_type TEXT,
  p_severity TEXT DEFAULT 'info',
  p_message TEXT DEFAULT NULL,
  p_user_id UUID DEFAULT NULL,
  p_email TEXT DEFAULT NULL,
  p_ip_address TEXT DEFAULT NULL,
  p_user_agent TEXT DEFAULT NULL,
  p_org_id UUID DEFAULT NULL,
  p_org_slug TEXT DEFAULT NULL,
  p_metadata JSONB DEFAULT '{}'::jsonb
)
RETURNS UUID AS $$
DECLARE
  v_event_id UUID;
BEGIN
  INSERT INTO security_events (
    event_type, severity, message,
    user_id, email, ip_address, user_agent,
    org_id, org_slug, metadata
  )
  VALUES (
    p_event_type, p_severity, p_message,
    p_user_id, p_email, p_ip_address, p_user_agent,
    p_org_id, p_org_slug, p_metadata
  )
  RETURNING id INTO v_event_id;

  RETURN v_event_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Cleanup old security events (keep 90 days for compliance)
CREATE OR REPLACE FUNCTION cleanup_old_security_events(retention_days INTEGER DEFAULT 90)
RETURNS INTEGER AS $$
DECLARE
  deleted_count INTEGER;
BEGIN
  DELETE FROM security_events
  WHERE created_at < NOW() - (retention_days || ' days')::INTERVAL;
  GET DIAGNOSTICS deleted_count = ROW_COUNT;
  RETURN deleted_count;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ================================================
-- PART 4: Account Lockout Support
-- ================================================
-- Track failed login attempts for account lockout

-- Add lockout columns to profiles (optional enhancement)
DO $$ BEGIN
  ALTER TABLE profiles ADD COLUMN IF NOT EXISTS failed_login_attempts INTEGER DEFAULT 0;
  ALTER TABLE profiles ADD COLUMN IF NOT EXISTS locked_until TIMESTAMPTZ;
EXCEPTION WHEN duplicate_column THEN NULL;
END $$;

-- Function to check if account is locked
CREATE OR REPLACE FUNCTION is_account_locked(p_email TEXT)
RETURNS BOOLEAN AS $$
DECLARE
  v_locked_until TIMESTAMPTZ;
BEGIN
  SELECT locked_until INTO v_locked_until
  FROM profiles
  WHERE email = lower(p_email);

  IF v_locked_until IS NOT NULL AND v_locked_until > NOW() THEN
    RETURN TRUE;
  END IF;

  RETURN FALSE;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to increment failed login attempts
-- Returns TRUE if account should be locked
CREATE OR REPLACE FUNCTION increment_failed_login(
  p_email TEXT,
  p_max_attempts INTEGER DEFAULT 5,
  p_lockout_minutes INTEGER DEFAULT 15
)
RETURNS BOOLEAN AS $$
DECLARE
  v_attempts INTEGER;
  v_should_lock BOOLEAN := FALSE;
BEGIN
  UPDATE profiles
  SET
    failed_login_attempts = failed_login_attempts + 1,
    locked_until = CASE
      WHEN failed_login_attempts + 1 >= p_max_attempts
      THEN NOW() + (p_lockout_minutes || ' minutes')::INTERVAL
      ELSE locked_until
    END
  WHERE email = lower(p_email)
  RETURNING failed_login_attempts >= p_max_attempts INTO v_should_lock;

  RETURN COALESCE(v_should_lock, FALSE);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to reset failed login attempts on successful login
CREATE OR REPLACE FUNCTION reset_failed_login(p_email TEXT)
RETURNS VOID AS $$
BEGIN
  UPDATE profiles
  SET
    failed_login_attempts = 0,
    locked_until = NULL
  WHERE email = lower(p_email);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ================================================
-- RECORD MIGRATION
-- ================================================

INSERT INTO schema_migrations (filename, checksum)
VALUES ('18_security_hardening.sql', 'security-hardening-v1')
ON CONFLICT (filename) DO NOTHING;

-- ================================================
-- VERIFICATION QUERIES
-- ================================================

-- Check profiles SELECT policy is correct:
-- SELECT policyname, qual FROM pg_policies WHERE tablename = 'profiles' AND cmd = 'SELECT';

-- Check security_events table exists:
-- SELECT column_name, data_type FROM information_schema.columns WHERE table_name = 'security_events';

-- Check auth_rate_limits table exists:
-- SELECT column_name, data_type FROM information_schema.columns WHERE table_name = 'auth_rate_limits';

-- ================================================
-- END MIGRATION 18
-- ================================================
