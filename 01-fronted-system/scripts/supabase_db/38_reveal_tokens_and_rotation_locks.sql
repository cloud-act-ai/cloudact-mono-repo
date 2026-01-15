-- Migration 38: Reveal Tokens and Rotation Locks
-- Fixes SEC-001, SCALE-001, SCALE-002
--
-- Creates tables to replace in-memory caches that don't work across serverless instances

-- ============================================
-- Reveal Tokens Table (SEC-001, SCALE-001)
-- ============================================
-- Stores one-time reveal tokens for API key display
-- Replaces in-memory revealTokenCache Map

CREATE TABLE IF NOT EXISTS public.reveal_tokens (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    token TEXT UNIQUE NOT NULL,
    org_slug TEXT NOT NULL,
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    expires_at TIMESTAMPTZ NOT NULL,
    created_at TIMESTAMPTZ DEFAULT now(),
    -- Token is consumed (deleted) after use, so no used_at needed
    CONSTRAINT reveal_tokens_token_format CHECK (token LIKE 'reveal_%')
);

-- Index for fast token lookup
CREATE INDEX IF NOT EXISTS idx_reveal_tokens_token ON public.reveal_tokens(token);

-- Index for cleanup of expired tokens
CREATE INDEX IF NOT EXISTS idx_reveal_tokens_expires_at ON public.reveal_tokens(expires_at);

-- No RLS - only accessible via service_role (server actions)
ALTER TABLE public.reveal_tokens ENABLE ROW LEVEL SECURITY;

-- Function to clean up expired reveal tokens
-- Called periodically or on each insert
CREATE OR REPLACE FUNCTION public.cleanup_expired_reveal_tokens()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    DELETE FROM public.reveal_tokens
    WHERE expires_at < now();
END;
$$;

-- Trigger to cleanup on insert (keeps table clean)
CREATE OR REPLACE FUNCTION public.trigger_cleanup_reveal_tokens()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    -- Only cleanup occasionally (when random < 0.1, ~10% of inserts)
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

-- ============================================
-- API Key Rotation Locks Table (SCALE-002)
-- ============================================
-- Distributed lock for API key rotation to prevent concurrent rotations

CREATE TABLE IF NOT EXISTS public.api_key_rotation_locks (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    org_slug TEXT UNIQUE NOT NULL,
    lock_id TEXT NOT NULL,
    expires_at TIMESTAMPTZ NOT NULL,
    created_at TIMESTAMPTZ DEFAULT now()
);

-- Index for cleanup
CREATE INDEX IF NOT EXISTS idx_rotation_locks_expires_at ON public.api_key_rotation_locks(expires_at);

-- No RLS - only accessible via service_role
ALTER TABLE public.api_key_rotation_locks ENABLE ROW LEVEL SECURITY;

-- Function to clean up expired rotation locks
CREATE OR REPLACE FUNCTION public.cleanup_expired_rotation_locks()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    DELETE FROM public.api_key_rotation_locks
    WHERE expires_at < now();
END;
$$;

-- Trigger to cleanup on insert
CREATE OR REPLACE FUNCTION public.trigger_cleanup_rotation_locks()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    -- Cleanup expired locks on each insert attempt
    PERFORM public.cleanup_expired_rotation_locks();
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_cleanup_rotation_locks ON public.api_key_rotation_locks;
CREATE TRIGGER trg_cleanup_rotation_locks
    BEFORE INSERT ON public.api_key_rotation_locks
    FOR EACH ROW
    EXECUTE FUNCTION public.trigger_cleanup_rotation_locks();

-- ============================================
-- Migration tracking
-- ============================================
INSERT INTO public.schema_migrations (version, name, applied_at)
VALUES (38, '38_reveal_tokens_and_rotation_locks', now())
ON CONFLICT (version) DO NOTHING;
