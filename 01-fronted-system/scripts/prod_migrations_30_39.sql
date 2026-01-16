-- =============================================
-- Combined Production Migrations: 30-39
-- Run on: ovfxswhkkshouhsryzaf (Production Supabase)
-- Date: 2026-01-15
-- =============================================

-- =============================================
-- Migration 30: Cleanup Old SaaS Tables
-- =============================================
DROP TABLE IF EXISTS saas_subscription_providers_meta CASCADE;
DROP TABLE IF EXISTS saas_subscriptions CASCADE;

-- =============================================
-- Migration 31: Recreate Subscription Providers Meta
-- =============================================
DROP TABLE IF EXISTS subscription_providers_meta CASCADE;

CREATE TABLE subscription_providers_meta (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    provider_name VARCHAR(50) NOT NULL,
    display_name VARCHAR(100),
    category VARCHAR(50),
    is_custom BOOLEAN DEFAULT FALSE,
    is_enabled BOOLEAN NOT NULL DEFAULT TRUE,
    enabled_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(org_id, provider_name)
);

CREATE INDEX idx_subscription_providers_meta_org_id ON subscription_providers_meta(org_id);
CREATE INDEX idx_subscription_providers_meta_enabled ON subscription_providers_meta(org_id, is_enabled);
CREATE INDEX idx_subscription_providers_meta_provider ON subscription_providers_meta(provider_name);

ALTER TABLE subscription_providers_meta ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Members can view org subscription providers" ON subscription_providers_meta
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM organization_members om
            WHERE om.org_id = subscription_providers_meta.org_id
            AND om.user_id = auth.uid()
            AND om.status = 'active'
        )
    );

CREATE POLICY "Admins can enable subscription providers" ON subscription_providers_meta
    FOR INSERT WITH CHECK (
        EXISTS (
            SELECT 1 FROM organization_members om
            WHERE om.org_id = subscription_providers_meta.org_id
            AND om.user_id = auth.uid()
            AND om.status = 'active'
            AND om.role IN ('owner', 'admin')
        )
    );

CREATE POLICY "Admins can update subscription providers" ON subscription_providers_meta
    FOR UPDATE USING (
        EXISTS (
            SELECT 1 FROM organization_members om
            WHERE om.org_id = subscription_providers_meta.org_id
            AND om.user_id = auth.uid()
            AND om.status = 'active'
            AND om.role IN ('owner', 'admin')
        )
    )
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM organization_members om
            WHERE om.org_id = subscription_providers_meta.org_id
            AND om.user_id = auth.uid()
            AND om.status = 'active'
            AND om.role IN ('owner', 'admin')
        )
    );

CREATE POLICY "Admins can delete subscription providers" ON subscription_providers_meta
    FOR DELETE USING (
        EXISTS (
            SELECT 1 FROM organization_members om
            WHERE om.org_id = subscription_providers_meta.org_id
            AND om.user_id = auth.uid()
            AND om.status = 'active'
            AND om.role IN ('owner', 'admin')
        )
    );

CREATE OR REPLACE FUNCTION update_subscription_providers_meta_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_update_subscription_providers_meta_updated_at ON subscription_providers_meta;
CREATE TRIGGER trigger_update_subscription_providers_meta_updated_at
    BEFORE UPDATE ON subscription_providers_meta
    FOR EACH ROW
    EXECUTE FUNCTION update_subscription_providers_meta_updated_at();

-- =============================================
-- Migration 32: RLS Security Fixes
-- =============================================
CREATE OR REPLACE FUNCTION public.user_is_org_admin(check_org_id UUID)
RETURNS BOOLEAN AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM organization_members
    WHERE org_id = check_org_id
    AND user_id = auth.uid()
    AND role IN ('owner', 'admin')
    AND status = 'active'
    LIMIT 1
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE;

DROP POLICY IF EXISTS "Admins can update cloud integrations" ON cloud_provider_integrations;
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
    org_id IN (
      SELECT om.org_id FROM organization_members om
      WHERE om.user_id = auth.uid()
        AND om.status = 'active'
        AND om.role IN ('owner', 'admin')
    )
  );

-- =============================================
-- Migration 33: Stripe Webhook Race Condition Fix
-- =============================================
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS stripe_webhook_last_event_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_organizations_stripe_webhook_event_at
ON organizations (stripe_webhook_last_event_at)
WHERE stripe_webhook_last_event_at IS NOT NULL;

-- =============================================
-- Migration 34: Storage RLS WITH CHECK Fix
-- =============================================
DROP POLICY IF EXISTS "Org members can update logos" ON storage.objects;

CREATE POLICY "Org members can update logos"
  ON storage.objects FOR UPDATE
  USING (
    bucket_id = 'org-logos'
    AND auth.uid() IS NOT NULL
    AND EXISTS (
      SELECT 1 FROM public.organization_members om
      JOIN public.organizations o ON om.org_id = o.id
      WHERE om.user_id = auth.uid()
        AND om.status = 'active'
        AND o.org_slug = SPLIT_PART(name, '/', 1)
    )
  )
  WITH CHECK (
    bucket_id = 'org-logos'
    AND auth.uid() IS NOT NULL
    AND EXISTS (
      SELECT 1 FROM public.organization_members om
      JOIN public.organizations o ON om.org_id = o.id
      WHERE om.user_id = auth.uid()
        AND om.status = 'active'
        AND o.org_slug = SPLIT_PART(name, '/', 1)
    )
  );

-- =============================================
-- Migration 35: Role Escalation Fix
-- =============================================
CREATE OR REPLACE FUNCTION check_member_self_update()
RETURNS TRIGGER AS $$
BEGIN
  IF OLD.user_id = auth.uid() THEN
    IF OLD.role IS DISTINCT FROM NEW.role THEN
      RAISE EXCEPTION 'You cannot change your own role';
    END IF;
    IF OLD.org_id IS DISTINCT FROM NEW.org_id THEN
      RAISE EXCEPTION 'You cannot change organization';
    END IF;
    IF OLD.user_id IS DISTINCT FROM NEW.user_id THEN
      RAISE EXCEPTION 'You cannot change user assignment';
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS enforce_member_self_update ON organization_members;
CREATE TRIGGER enforce_member_self_update
  BEFORE UPDATE ON organization_members
  FOR EACH ROW
  EXECUTE FUNCTION check_member_self_update();

DROP POLICY IF EXISTS "Admins can update members" ON organization_members;
CREATE POLICY "Admins can update members"
ON organization_members
FOR UPDATE
USING (
  org_id IN (
    SELECT org_id FROM organization_members
    WHERE user_id = auth.uid()
    AND role IN ('owner', 'admin')
    AND status = 'active'
  )
  OR user_id = auth.uid()
)
WITH CHECK (
  (
    user_id != auth.uid()
    AND org_id IN (
      SELECT org_id FROM organization_members
      WHERE user_id = auth.uid()
      AND role IN ('owner', 'admin')
      AND status = 'active'
    )
  )
  OR (
    user_id = auth.uid()
    AND role = (
      SELECT role FROM organization_members
      WHERE user_id = auth.uid() AND org_id = organization_members.org_id
    )
  )
);

CREATE OR REPLACE FUNCTION prevent_last_owner_demotion()
RETURNS TRIGGER AS $$
DECLARE
  owner_count INTEGER;
BEGIN
  IF OLD.role = 'owner' AND NEW.role != 'owner' THEN
    SELECT COUNT(*) INTO owner_count
    FROM organization_members
    WHERE org_id = OLD.org_id
      AND role = 'owner'
      AND status = 'active'
      AND id != OLD.id;

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
-- Migration 36: Onboarding Locks
-- =============================================
CREATE TABLE IF NOT EXISTS onboarding_locks (
  lock_id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL,
  user_id UUID NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMP WITH TIME ZONE NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_onboarding_locks_expires ON onboarding_locks(expires_at);
CREATE INDEX IF NOT EXISTS idx_onboarding_locks_session ON onboarding_locks(session_id);
CREATE INDEX IF NOT EXISTS idx_onboarding_locks_user ON onboarding_locks(user_id);

CREATE OR REPLACE FUNCTION cleanup_expired_onboarding_locks()
RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  DELETE FROM onboarding_locks WHERE expires_at < NOW();
END;
$$;

GRANT SELECT, INSERT, DELETE ON onboarding_locks TO service_role;

-- =============================================
-- Migration 37: Fix Logo Upload RLS
-- =============================================
DROP POLICY IF EXISTS "Public can view org logos" ON storage.objects;
DROP POLICY IF EXISTS "Org members can upload logos" ON storage.objects;
DROP POLICY IF EXISTS "Org members can update logos" ON storage.objects;
DROP POLICY IF EXISTS "Org members can delete logos" ON storage.objects;

CREATE POLICY "Public can view org logos"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'org-logos');

CREATE POLICY "Org members can upload logos"
  ON storage.objects FOR INSERT
  WITH CHECK (
    bucket_id = 'org-logos'
    AND auth.uid() IS NOT NULL
    AND EXISTS (
      SELECT 1 FROM public.organization_members om
      JOIN public.organizations o ON om.org_id = o.id
      WHERE om.user_id = auth.uid()
        AND om.status = 'active'
        AND o.org_slug = SPLIT_PART(name, '/', 1)
    )
  );

CREATE POLICY "Org members can update logos"
  ON storage.objects FOR UPDATE
  USING (
    bucket_id = 'org-logos'
    AND auth.uid() IS NOT NULL
    AND EXISTS (
      SELECT 1 FROM public.organization_members om
      JOIN public.organizations o ON om.org_id = o.id
      WHERE om.user_id = auth.uid()
        AND om.status = 'active'
        AND o.org_slug = SPLIT_PART(name, '/', 1)
    )
  );

CREATE POLICY "Org members can delete logos"
  ON storage.objects FOR DELETE
  USING (
    bucket_id = 'org-logos'
    AND auth.uid() IS NOT NULL
    AND EXISTS (
      SELECT 1 FROM public.organization_members om
      JOIN public.organizations o ON om.org_id = o.id
      WHERE om.user_id = auth.uid()
        AND om.status = 'active'
        AND o.org_slug = SPLIT_PART(name, '/', 1)
    )
  );

-- =============================================
-- Migration 37b: Pending Backend Syncs
-- =============================================
CREATE TABLE IF NOT EXISTS pending_backend_syncs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_slug TEXT NOT NULL,
  api_key_fingerprint TEXT,
  backend_onboarded_at TIMESTAMP WITH TIME ZONE NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending_sync',
  retry_count INTEGER NOT NULL DEFAULT 0,
  last_error TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  synced_at TIMESTAMP WITH TIME ZONE,
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_pending_backend_syncs_org ON pending_backend_syncs(org_slug);
CREATE INDEX IF NOT EXISTS idx_pending_backend_syncs_status ON pending_backend_syncs(status);
CREATE INDEX IF NOT EXISTS idx_pending_backend_syncs_created ON pending_backend_syncs(created_at);

CREATE OR REPLACE FUNCTION update_pending_backend_syncs_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS update_pending_backend_syncs_updated_at_trigger ON pending_backend_syncs;
CREATE TRIGGER update_pending_backend_syncs_updated_at_trigger
  BEFORE UPDATE ON pending_backend_syncs
  FOR EACH ROW
  EXECUTE FUNCTION update_pending_backend_syncs_updated_at();

GRANT SELECT, INSERT, UPDATE, DELETE ON pending_backend_syncs TO service_role;

-- =============================================
-- Migration 38: Reveal Tokens and Rotation Locks
-- =============================================
CREATE TABLE IF NOT EXISTS public.reveal_tokens (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    token TEXT UNIQUE NOT NULL,
    org_slug TEXT NOT NULL,
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    expires_at TIMESTAMPTZ NOT NULL,
    created_at TIMESTAMPTZ DEFAULT now(),
    CONSTRAINT reveal_tokens_token_format CHECK (token LIKE 'reveal_%')
);

CREATE INDEX IF NOT EXISTS idx_reveal_tokens_token ON public.reveal_tokens(token);
CREATE INDEX IF NOT EXISTS idx_reveal_tokens_expires_at ON public.reveal_tokens(expires_at);

ALTER TABLE public.reveal_tokens ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.cleanup_expired_reveal_tokens()
RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
    DELETE FROM public.reveal_tokens WHERE expires_at < now();
END;
$$;

CREATE OR REPLACE FUNCTION public.trigger_cleanup_reveal_tokens()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
    IF random() < 0.1 THEN
        PERFORM public.cleanup_expired_reveal_tokens();
    END IF;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_cleanup_reveal_tokens ON public.reveal_tokens;
CREATE TRIGGER trg_cleanup_reveal_tokens
    AFTER INSERT ON public.reveal_tokens
    FOR EACH ROW
    EXECUTE FUNCTION public.trigger_cleanup_reveal_tokens();

CREATE TABLE IF NOT EXISTS public.api_key_rotation_locks (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    org_slug TEXT UNIQUE NOT NULL,
    lock_id TEXT NOT NULL,
    expires_at TIMESTAMPTZ NOT NULL,
    created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_rotation_locks_expires_at ON public.api_key_rotation_locks(expires_at);
ALTER TABLE public.api_key_rotation_locks ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.cleanup_expired_rotation_locks()
RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
    DELETE FROM public.api_key_rotation_locks WHERE expires_at < now();
END;
$$;

CREATE OR REPLACE FUNCTION public.trigger_cleanup_rotation_locks()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
    PERFORM public.cleanup_expired_rotation_locks();
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_cleanup_rotation_locks ON public.api_key_rotation_locks;
CREATE TRIGGER trg_cleanup_rotation_locks
    BEFORE INSERT ON public.api_key_rotation_locks
    FOR EACH ROW
    EXECUTE FUNCTION public.trigger_cleanup_rotation_locks();

-- =============================================
-- Migration 39: Security Hardening
-- =============================================
CREATE TABLE IF NOT EXISTS auth_rate_limits (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  ip_address TEXT NOT NULL,
  action_type TEXT NOT NULL,
  window_start TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  request_count INTEGER NOT NULL DEFAULT 1,
  email TEXT,
  UNIQUE(ip_address, action_type, window_start)
);

ALTER TABLE auth_rate_limits ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS idx_auth_rate_limits_ip_action ON auth_rate_limits(ip_address, action_type, window_start DESC);
CREATE INDEX IF NOT EXISTS idx_auth_rate_limits_email ON auth_rate_limits(email, action_type, window_start DESC);
CREATE INDEX IF NOT EXISTS idx_auth_rate_limits_cleanup ON auth_rate_limits(window_start);

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
  v_window_start := date_trunc('second', NOW()) -
    ((EXTRACT(EPOCH FROM NOW())::INTEGER % p_window_seconds) * INTERVAL '1 second');

  INSERT INTO auth_rate_limits (ip_address, action_type, window_start, request_count, email)
  VALUES (p_ip_address, p_action_type, v_window_start, 1, p_email)
  ON CONFLICT (ip_address, action_type, window_start)
  DO UPDATE SET
    request_count = auth_rate_limits.request_count + 1,
    email = COALESCE(p_email, auth_rate_limits.email)
  RETURNING request_count INTO v_current_count;

  RETURN v_current_count <= p_max_requests;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

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

-- Tighten profiles SELECT policy
DROP POLICY IF EXISTS "Users can view all profiles" ON profiles;
DROP POLICY IF EXISTS "profiles_select_same_org" ON profiles;

CREATE POLICY "profiles_select_same_org" ON profiles
FOR SELECT TO authenticated
USING (
  id = auth.uid()
  OR id IN (
    SELECT om2.user_id
    FROM organization_members om1
    INNER JOIN organization_members om2 ON om1.org_id = om2.org_id
    WHERE om1.user_id = auth.uid()
    AND om1.status = 'active'
    AND om2.status = 'active'
  )
);

-- Security events table
CREATE TABLE IF NOT EXISTS security_events (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  event_type TEXT NOT NULL CHECK (event_type IN (
    'login_failed', 'login_success', 'signup_failed', 'signup_success',
    'password_reset_requested', 'password_reset_completed', 'rate_limit_exceeded',
    'suspicious_activity', 'session_expired', 'invalid_token', 'account_locked',
    'account_unlocked', 'mfa_failed', 'mfa_success', 'api_key_invalid', 'permission_denied'
  )),
  severity TEXT NOT NULL DEFAULT 'info' CHECK (severity IN ('info', 'warning', 'error', 'critical')),
  message TEXT,
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  email TEXT,
  ip_address TEXT,
  user_agent TEXT,
  org_id UUID REFERENCES organizations(id) ON DELETE SET NULL,
  org_slug TEXT,
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

ALTER TABLE security_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "security_events_read_admin" ON security_events
FOR SELECT TO authenticated
USING (
  org_id IN (
    SELECT org_id FROM organization_members
    WHERE user_id = auth.uid()
    AND role = 'owner'
    AND status = 'active'
  )
  OR user_id = auth.uid()
  OR email = (SELECT email FROM auth.users WHERE id = auth.uid())
);

CREATE INDEX IF NOT EXISTS idx_security_events_type ON security_events(event_type, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_security_events_severity ON security_events(severity, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_security_events_ip ON security_events(ip_address, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_security_events_user ON security_events(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_security_events_email ON security_events(email, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_security_events_org ON security_events(org_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_security_events_cleanup ON security_events(created_at);

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

-- Account lockout support
DO $$ BEGIN
  ALTER TABLE profiles ADD COLUMN IF NOT EXISTS failed_login_attempts INTEGER DEFAULT 0;
  ALTER TABLE profiles ADD COLUMN IF NOT EXISTS locked_until TIMESTAMPTZ;
EXCEPTION WHEN duplicate_column THEN NULL;
END $$;

CREATE OR REPLACE FUNCTION is_account_locked(p_email TEXT)
RETURNS BOOLEAN AS $$
DECLARE
  v_locked_until TIMESTAMPTZ;
BEGIN
  SELECT locked_until INTO v_locked_until FROM profiles WHERE email = lower(p_email);
  IF v_locked_until IS NOT NULL AND v_locked_until > NOW() THEN
    RETURN TRUE;
  END IF;
  RETURN FALSE;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE FUNCTION increment_failed_login(
  p_email TEXT,
  p_max_attempts INTEGER DEFAULT 5,
  p_lockout_minutes INTEGER DEFAULT 15
)
RETURNS BOOLEAN AS $$
DECLARE
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

CREATE OR REPLACE FUNCTION reset_failed_login(p_email TEXT)
RETURNS VOID AS $$
BEGIN
  UPDATE profiles SET failed_login_attempts = 0, locked_until = NULL WHERE email = lower(p_email);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- =============================================
-- Record all migrations in schema_migrations
-- =============================================
INSERT INTO schema_migrations (filename, checksum, applied_at)
VALUES
  ('30_cleanup_old_saas_tables.sql', 'cleanup-saas-v1', NOW()),
  ('31_recreate_subscription_providers_meta.sql', 'subscription-providers-meta-v1', NOW()),
  ('32_rls_security_fixes.sql', 'rls-security-fixes-v1', NOW()),
  ('33_stripe_webhook_race_condition_fix.sql', 'stripe-webhook-fix-v1', NOW()),
  ('34_storage_rls_with_check.sql', 'storage-rls-fix-v1', NOW()),
  ('35_role_escalation_fix.sql', 'role-escalation-fix-v1', NOW()),
  ('36_onboarding_locks.sql', 'onboarding-locks-v1', NOW()),
  ('37_fix_logo_upload_rls.sql', 'logo-upload-rls-v1', NOW()),
  ('37_pending_backend_syncs.sql', 'pending-backend-syncs-v1', NOW()),
  ('38_reveal_tokens_and_rotation_locks.sql', 'reveal-tokens-v1', NOW()),
  ('39_security_hardening.sql', 'security-hardening-v1', NOW())
ON CONFLICT (filename) DO NOTHING;

-- =============================================
-- Verification
-- =============================================
SELECT 'Migrations 30-39 applied successfully!' as result;
