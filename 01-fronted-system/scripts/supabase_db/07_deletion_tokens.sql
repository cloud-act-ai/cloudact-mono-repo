-- ============================================
-- Deletion Token Storage
-- ============================================
-- This migration creates a table for storing deletion tokens.
-- Tokens survive server restarts and work across multiple instances.
--
-- CRITICAL: This replaces in-memory token storage.
-- ============================================

-- Create deletion tokens table
CREATE TABLE IF NOT EXISTS account_deletion_tokens (
  token TEXT PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Enable RLS but only allow service_role access
ALTER TABLE account_deletion_tokens ENABLE ROW LEVEL SECURITY;

-- No policies = only service_role can access
COMMENT ON TABLE account_deletion_tokens IS 'Stores account deletion confirmation tokens. Only accessible via service_role.';

-- Index for cleanup and lookup
CREATE INDEX IF NOT EXISTS idx_deletion_tokens_expires_at ON account_deletion_tokens(expires_at);
CREATE INDEX IF NOT EXISTS idx_deletion_tokens_user_id ON account_deletion_tokens(user_id);

-- Cleanup function to remove expired tokens
CREATE OR REPLACE FUNCTION cleanup_expired_deletion_tokens()
RETURNS INTEGER AS $$
DECLARE
  deleted_count INTEGER;
BEGIN
  DELETE FROM account_deletion_tokens
  WHERE expires_at < NOW();
  GET DIAGNOSTICS deleted_count = ROW_COUNT;
  RETURN deleted_count;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
