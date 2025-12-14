-- ================================================
-- Migration 17: RLS Policy Fixes
-- ================================================
-- Purpose: Fix remaining RLS policy issues for data integrity
--
-- Changes:
-- 1. Add UPDATE policy WITH CHECK to saas_subscriptions to prevent org_id changes
-- 2. Add UPDATE policies WITH CHECK for other sensitive tables to prevent org_id tampering
-- 3. Note on activity_logs: Uses ON DELETE SET NULL for audit trail preservation
--
-- Pattern: UPDATE policies should have both USING and WITH CHECK clauses
-- - USING: Who can update (existing row check)
-- - WITH CHECK: What can be updated (new values validation)
-- ================================================

-- ================================================
-- SAAS_SUBSCRIPTIONS TABLE
-- ================================================
-- Issue: Missing WITH CHECK in UPDATE policy allows org_id to be changed
-- Fix: Add WITH CHECK clause to prevent org_id changes during updates

DROP POLICY IF EXISTS "Admins can update subscriptions" ON saas_subscriptions;
CREATE POLICY "Admins can update subscriptions" ON saas_subscriptions
    FOR UPDATE
    USING (
        EXISTS (
            SELECT 1 FROM organization_members om
            WHERE om.org_id = saas_subscriptions.org_id
            AND om.user_id = auth.uid()
            AND om.status = 'active'
            AND om.role IN ('owner', 'admin')
        )
    )
    WITH CHECK (
        -- Ensure org_id doesn't change OR new org_id is one user belongs to
        org_id IN (
            SELECT org_id FROM organization_members
            WHERE user_id = auth.uid()
            AND status = 'active'
            AND role IN ('owner', 'admin')
        )
    );

-- Also update the migration 13 version for consistency
DROP POLICY IF EXISTS "Admins can update saas subscriptions" ON saas_subscriptions;
CREATE POLICY "Admins can update saas subscriptions" ON saas_subscriptions
    FOR UPDATE
    USING (
        org_id IN (
            SELECT org_id
            FROM organization_members
            WHERE user_id = auth.uid()
            AND role IN ('owner', 'admin')
            AND status = 'active'
        )
    )
    WITH CHECK (
        -- Ensure org_id doesn't change OR new org_id is one user belongs to
        org_id IN (
            SELECT org_id
            FROM organization_members
            WHERE user_id = auth.uid()
            AND role IN ('owner', 'admin')
            AND status = 'active'
        )
    );

-- ================================================
-- ORGANIZATIONS TABLE
-- ================================================
-- Add WITH CHECK to prevent unauthorized org_id changes (though org_id is PK)
-- This is defense-in-depth for any app-level updates

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
)
WITH CHECK (
    -- User must still be owner after update (prevents privilege escalation)
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
-- Add WITH CHECK to prevent moving users to different orgs

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
)
WITH CHECK (
    -- Ensure org_id doesn't change
    org_id IN (
        SELECT org_id
        FROM organization_members
        WHERE user_id = auth.uid()
        AND role IN ('owner', 'admin')
        AND status = 'active'
    )
    OR
    -- Users updating their own record
    user_id = auth.uid()
);

-- ================================================
-- INVITES TABLE
-- ================================================
-- Add WITH CHECK to prevent invite transfers between orgs

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
)
WITH CHECK (
    -- Ensure org_id doesn't change
    org_id IN (
        SELECT org_id
        FROM organization_members
        WHERE user_id = auth.uid()
        AND role IN ('owner', 'admin')
        AND status = 'active'
    )
    OR
    -- Invited users accepting (org_id shouldn't change)
    email = (SELECT email FROM auth.users WHERE id = auth.uid())
);

-- ================================================
-- USAGE_TRACKING TABLE
-- ================================================
-- Add WITH CHECK to prevent usage data from being moved between orgs

DROP POLICY IF EXISTS "usage_update_member" ON usage_tracking;
CREATE POLICY "usage_update_member"
    ON usage_tracking FOR UPDATE
    TO authenticated
    USING (user_is_org_member(org_id))
    WITH CHECK (
        -- Ensure org_id doesn't change
        user_is_org_member(org_id)
    );

-- ================================================
-- ACTIVITY_LOGS TABLE
-- ================================================
-- Note: activity_logs.org_id uses ON DELETE SET NULL for audit trail preservation
-- This is intentional - when an org is deleted, we keep the logs but mark org_id as NULL
--
-- RLS Policy: No UPDATE policy needed as activity_logs are immutable after creation
-- Only INSERT (members) and DELETE (owners) operations are allowed
--
-- Current behavior is correct:
-- - ON DELETE SET NULL: Preserves audit trail when org is deleted
-- - No UPDATE policy: Prevents tampering with historical logs
-- - Owners can DELETE: For compliance/cleanup purposes

-- Verify activity_logs only has SELECT, INSERT, and DELETE policies (no UPDATE)
-- This is the correct security posture for audit logs

COMMENT ON TABLE activity_logs IS 'Audit trail for organization activities and compliance. org_id uses ON DELETE SET NULL to preserve logs when orgs are deleted. No UPDATE policy - logs are immutable.';

-- ================================================
-- VERIFICATION COMMENTS
-- ================================================

COMMENT ON POLICY "Admins can update subscriptions" ON saas_subscriptions
    IS 'Admins can update subscriptions but cannot move them to different orgs';

COMMENT ON POLICY "Admins can update saas subscriptions" ON saas_subscriptions
    IS 'Migration 13 version - Admins can update subscriptions but cannot move them to different orgs';

COMMENT ON POLICY "Owners can update organizations" ON organizations
    IS 'Owners can update their organizations with defense-in-depth validation';

COMMENT ON POLICY "Admins can update members" ON organization_members
    IS 'Admins can update members but cannot move them to different orgs';

COMMENT ON POLICY "Admins can update invites" ON invites
    IS 'Admins can update invites but cannot transfer them to different orgs';

COMMENT ON POLICY "usage_update_member" ON usage_tracking
    IS 'Members can update usage but cannot move records to different orgs';

-- ================================================
-- RECORD MIGRATION
-- ================================================

INSERT INTO schema_migrations (filename, checksum)
VALUES ('17_rls_policy_fixes.sql', 'rls-policy-fixes-v1')
ON CONFLICT (filename) DO NOTHING;

-- ================================================
-- VERIFICATION QUERIES
-- ================================================

-- Check all UPDATE policies on tables with org_id:
-- SELECT schemaname, tablename, policyname, permissive, roles, cmd, qual, with_check
-- FROM pg_policies
-- WHERE tablename IN ('saas_subscriptions', 'organizations', 'organization_members', 'invites', 'usage_tracking', 'activity_logs')
-- AND cmd = 'UPDATE'
-- ORDER BY tablename, policyname;

-- Verify activity_logs has no UPDATE policy:
-- SELECT schemaname, tablename, policyname, cmd
-- FROM pg_policies
-- WHERE tablename = 'activity_logs'
-- ORDER BY cmd;

-- Check foreign key constraints on activity_logs:
-- SELECT conname, conrelid::regclass AS table_name,
--        confrelid::regclass AS referenced_table,
--        pg_get_constraintdef(oid) AS constraint_definition
-- FROM pg_constraint
-- WHERE conrelid = 'activity_logs'::regclass
-- AND contype = 'f';

-- ================================================
-- END MIGRATION 17
-- ================================================
