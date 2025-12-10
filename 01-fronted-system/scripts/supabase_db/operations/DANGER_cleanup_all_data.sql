-- ============================================================================
-- DANGER: Complete Data Cleanup Script
-- ============================================================================
-- WARNING: This script DELETES ALL USER DATA from Supabase.
-- Only run this on TEST/DEV databases. NEVER run on production!
--
-- Usage: Run in Supabase SQL Editor (Dashboard -> SQL Editor)
-- ============================================================================

-- Step 1: Drop the owner protection trigger temporarily
-- This trigger prevents deleting organization owners
DROP TRIGGER IF EXISTS protect_owner ON organization_members;

-- Step 2: Delete all data in correct order (respecting foreign keys)

-- Activity logs (no dependencies)
DELETE FROM activity_logs;

-- Account deletion tokens (no dependencies)
DELETE FROM account_deletion_tokens;

-- Invites (depends on organizations)
DELETE FROM invites;

-- Organization members (depends on organizations and profiles)
DELETE FROM organization_members;

-- Organizations (depends on nothing after members deleted)
DELETE FROM organizations;

-- Profiles (depends on auth.users)
DELETE FROM profiles;

-- Auth users (base table)
DELETE FROM auth.users;

-- Step 3: Recreate the owner protection trigger
CREATE TRIGGER protect_owner
  BEFORE UPDATE OR DELETE ON organization_members
  FOR EACH ROW
  EXECUTE FUNCTION protect_owner_role();

-- Step 4: Verify cleanup
SELECT 'auth.users' as table_name, COUNT(*) as count FROM auth.users
UNION ALL SELECT 'profiles', COUNT(*) FROM profiles
UNION ALL SELECT 'organizations', COUNT(*) FROM organizations
UNION ALL SELECT 'organization_members', COUNT(*) FROM organization_members
UNION ALL SELECT 'invites', COUNT(*) FROM invites
UNION ALL SELECT 'activity_logs', COUNT(*) FROM activity_logs
UNION ALL SELECT 'account_deletion_tokens', COUNT(*) FROM account_deletion_tokens;

-- ============================================================================
-- Expected output: All tables should show count = 0
-- The protect_owner trigger is restored for normal operations
-- ============================================================================
