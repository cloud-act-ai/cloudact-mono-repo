-- Migration 43: Fix Admin Role References
-- =========================================
-- The 'admin' role doesn't exist in organization_members.role enum
-- Valid roles are: 'owner', 'collaborator', 'read_only'
-- This migration updates all policies that reference 'admin' to use 'owner' only

-- =============================================
-- ORGANIZATION_MEMBERS TABLE POLICIES
-- =============================================

-- Fix: Admins can add members
DROP POLICY IF EXISTS "Admins can add members" ON organization_members;
CREATE POLICY "Admins can add members"
ON organization_members FOR INSERT
WITH CHECK (
    EXISTS (
        SELECT 1 FROM organization_members om
        WHERE om.org_id = organization_members.org_id
        AND om.user_id = auth.uid()
        AND om.role = 'owner'
        AND om.status = 'active'
    )
);

-- Fix: Admins can update members
DROP POLICY IF EXISTS "Admins can update members" ON organization_members;
CREATE POLICY "Admins can update members"
ON organization_members FOR UPDATE
USING (
    EXISTS (
        SELECT 1 FROM organization_members om
        WHERE om.org_id = organization_members.org_id
        AND om.user_id = auth.uid()
        AND om.role = 'owner'
        AND om.status = 'active'
    )
)
WITH CHECK (
    EXISTS (
        SELECT 1 FROM organization_members om
        WHERE om.org_id = organization_members.org_id
        AND om.user_id = auth.uid()
        AND om.role = 'owner'
        AND om.status = 'active'
    )
    -- Prevent role escalation: can't assign role higher than your own
    AND organization_members.role IN ('owner', 'collaborator', 'read_only')
);

-- Fix: Admins can delete members
DROP POLICY IF EXISTS "Admins can delete members" ON organization_members;
CREATE POLICY "Admins can delete members"
ON organization_members FOR DELETE
USING (
    EXISTS (
        SELECT 1 FROM organization_members om
        WHERE om.org_id = organization_members.org_id
        AND om.user_id = auth.uid()
        AND om.role = 'owner'
        AND om.status = 'active'
    )
);

-- =============================================
-- INVITES TABLE POLICIES
-- =============================================

-- Fix: Admins can create invites
DROP POLICY IF EXISTS "Admins can create invites" ON invites;
CREATE POLICY "Admins can create invites"
ON invites FOR INSERT
WITH CHECK (
    EXISTS (
        SELECT 1 FROM organization_members
        WHERE org_id = invites.org_id
        AND user_id = auth.uid()
        AND role = 'owner'
        AND status = 'active'
    )
);

-- Fix: Admins can update invites
DROP POLICY IF EXISTS "Admins can update invites" ON invites;
CREATE POLICY "Admins can update invites"
ON invites FOR UPDATE
USING (
    EXISTS (
        SELECT 1 FROM organization_members
        WHERE org_id = invites.org_id
        AND user_id = auth.uid()
        AND role = 'owner'
        AND status = 'active'
    )
);

-- Fix: Admins can delete invites
DROP POLICY IF EXISTS "Admins can delete invites" ON invites;
CREATE POLICY "Admins can delete invites"
ON invites FOR DELETE
USING (
    EXISTS (
        SELECT 1 FROM organization_members
        WHERE org_id = invites.org_id
        AND user_id = auth.uid()
        AND role = 'owner'
        AND status = 'active'
    )
);

-- =============================================
-- SUBSCRIPTIONS TABLE POLICIES
-- =============================================

-- Fix: Admins can create saas subscriptions
DROP POLICY IF EXISTS "Admins can create saas subscriptions" ON subscriptions;
CREATE POLICY "Admins can create saas subscriptions"
ON subscriptions FOR INSERT
WITH CHECK (
    EXISTS (
        SELECT 1 FROM organization_members om
        WHERE om.org_id = subscriptions.org_id
        AND om.user_id = auth.uid()
        AND om.role = 'owner'
        AND om.status = 'active'
    )
);

-- Fix: Admins can update saas subscriptions
DROP POLICY IF EXISTS "Admins can update saas subscriptions" ON subscriptions;
CREATE POLICY "Admins can update saas subscriptions"
ON subscriptions FOR UPDATE
USING (
    EXISTS (
        SELECT 1 FROM organization_members om
        WHERE om.org_id = subscriptions.org_id
        AND om.user_id = auth.uid()
        AND om.role = 'owner'
        AND om.status = 'active'
    )
);

-- Fix: Admins can delete saas subscriptions
DROP POLICY IF EXISTS "Admins can delete saas subscriptions" ON subscriptions;
CREATE POLICY "Admins can delete saas subscriptions"
ON subscriptions FOR DELETE
USING (
    EXISTS (
        SELECT 1 FROM organization_members om
        WHERE om.org_id = subscriptions.org_id
        AND om.user_id = auth.uid()
        AND om.role = 'owner'
        AND om.status = 'active'
    )
);

-- Also fix the duplicate policy names from 12_saas_subscriptions_table.sql
DROP POLICY IF EXISTS "Admins can create subscriptions" ON subscriptions;
DROP POLICY IF EXISTS "Admins can update subscriptions" ON subscriptions;
DROP POLICY IF EXISTS "Admins can delete subscriptions" ON subscriptions;

-- =============================================
-- SUBSCRIPTION_PROVIDERS_META TABLE POLICIES
-- =============================================

-- Fix: Admins can enable subscription providers
DROP POLICY IF EXISTS "Admins can enable subscription providers" ON subscription_providers_meta;
CREATE POLICY "Admins can enable subscription providers"
ON subscription_providers_meta FOR INSERT
WITH CHECK (
    EXISTS (
        SELECT 1 FROM organization_members om
        WHERE om.org_id = subscription_providers_meta.org_id
        AND om.user_id = auth.uid()
        AND om.role = 'owner'
        AND om.status = 'active'
    )
);

-- Fix: Admins can update subscription providers
DROP POLICY IF EXISTS "Admins can update subscription providers" ON subscription_providers_meta;
CREATE POLICY "Admins can update subscription providers"
ON subscription_providers_meta FOR UPDATE
USING (
    EXISTS (
        SELECT 1 FROM organization_members om
        WHERE om.org_id = subscription_providers_meta.org_id
        AND om.user_id = auth.uid()
        AND om.role = 'owner'
        AND om.status = 'active'
    )
);

-- Fix: Admins can delete subscription providers
DROP POLICY IF EXISTS "Admins can delete subscription providers" ON subscription_providers_meta;
CREATE POLICY "Admins can delete subscription providers"
ON subscription_providers_meta FOR DELETE
USING (
    EXISTS (
        SELECT 1 FROM organization_members om
        WHERE om.org_id = subscription_providers_meta.org_id
        AND om.user_id = auth.uid()
        AND om.role = 'owner'
        AND om.status = 'active'
    )
);

-- =============================================
-- CLOUD_PROVIDER_INTEGRATIONS TABLE POLICIES
-- =============================================

-- Fix: Admins can create cloud integrations
DROP POLICY IF EXISTS "Admins can create cloud integrations" ON cloud_provider_integrations;
CREATE POLICY "Admins can create cloud integrations"
ON cloud_provider_integrations FOR INSERT
WITH CHECK (
    EXISTS (
        SELECT 1 FROM organization_members om
        WHERE om.org_id = cloud_provider_integrations.org_id
        AND om.user_id = auth.uid()
        AND om.role = 'owner'
        AND om.status = 'active'
    )
);

-- Fix: Admins can update cloud integrations
DROP POLICY IF EXISTS "Admins can update cloud integrations" ON cloud_provider_integrations;
CREATE POLICY "Admins can update cloud integrations"
ON cloud_provider_integrations FOR UPDATE
USING (
    EXISTS (
        SELECT 1 FROM organization_members om
        WHERE om.org_id = cloud_provider_integrations.org_id
        AND om.user_id = auth.uid()
        AND om.role = 'owner'
        AND om.status = 'active'
    )
);

-- Fix: Admins can delete cloud integrations
DROP POLICY IF EXISTS "Admins can delete cloud integrations" ON cloud_provider_integrations;
CREATE POLICY "Admins can delete cloud integrations"
ON cloud_provider_integrations FOR DELETE
USING (
    EXISTS (
        SELECT 1 FROM organization_members om
        WHERE om.org_id = cloud_provider_integrations.org_id
        AND om.user_id = auth.uid()
        AND om.role = 'owner'
        AND om.status = 'active'
    )
);

-- =============================================
-- ORGANIZATIONS TABLE POLICIES (owner-only updates)
-- =============================================

-- Fix: organizations_update_admin (from 01_production_setup.sql)
DROP POLICY IF EXISTS "organizations_update_admin" ON organizations;
CREATE POLICY "organizations_update_admin"
ON organizations FOR UPDATE
USING (
    EXISTS (
        SELECT 1 FROM organization_members
        WHERE org_id = organizations.id
        AND user_id = auth.uid()
        AND role = 'owner'
        AND status = 'active'
    )
);

-- Fix: org_members_insert_admin
DROP POLICY IF EXISTS "org_members_insert_admin" ON organization_members;
CREATE POLICY "org_members_insert_admin"
ON organization_members FOR INSERT
WITH CHECK (
    EXISTS (
        SELECT 1 FROM organization_members om
        WHERE om.org_id = organization_members.org_id
        AND om.user_id = auth.uid()
        AND om.role = 'owner'
        AND om.status = 'active'
    )
);

-- Fix: org_members_update_admin
DROP POLICY IF EXISTS "org_members_update_admin" ON organization_members;
CREATE POLICY "org_members_update_admin"
ON organization_members FOR UPDATE
USING (
    EXISTS (
        SELECT 1 FROM organization_members om
        WHERE om.org_id = organization_members.org_id
        AND om.user_id = auth.uid()
        AND om.role = 'owner'
        AND om.status = 'active'
    )
);

-- Fix: invites_insert_admin
DROP POLICY IF EXISTS "invites_insert_admin" ON invites;
CREATE POLICY "invites_insert_admin"
ON invites FOR INSERT
WITH CHECK (
    EXISTS (
        SELECT 1 FROM organization_members
        WHERE org_id = invites.org_id
        AND user_id = auth.uid()
        AND role = 'owner'
        AND status = 'active'
    )
);

-- Fix: invites_delete_admin
DROP POLICY IF EXISTS "invites_delete_admin" ON invites;
CREATE POLICY "invites_delete_admin"
ON invites FOR DELETE
USING (
    EXISTS (
        SELECT 1 FROM organization_members
        WHERE org_id = invites.org_id
        AND user_id = auth.uid()
        AND role = 'owner'
        AND status = 'active'
    )
);
