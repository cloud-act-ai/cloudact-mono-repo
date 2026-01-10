-- Migration 37: Fix Logo Upload RLS Policies
-- Updates storage RLS policies for org-logos bucket to be more robust
-- Fixes issues with path extraction and authentication
--
-- Run this in Supabase SQL Editor

-- ============================================
-- 1. Drop existing policies
-- ============================================

DROP POLICY IF EXISTS "Public can view org logos" ON storage.objects;
DROP POLICY IF EXISTS "Org members can upload logos" ON storage.objects;
DROP POLICY IF EXISTS "Org members can update logos" ON storage.objects;
DROP POLICY IF EXISTS "Org members can delete logos" ON storage.objects;

-- ============================================
-- 2. Create improved RLS policies
-- ============================================

-- Policy: Allow public read access to all logos
CREATE POLICY "Public can view org logos"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'org-logos');

-- Policy: Org members can upload logos for their organization
-- File path format: {org_slug}/logo-{timestamp}.{ext}
-- Uses SPLIT_PART for more robust path extraction
CREATE POLICY "Org members can upload logos"
  ON storage.objects FOR INSERT
  WITH CHECK (
    bucket_id = 'org-logos'
    AND auth.uid() IS NOT NULL
    AND EXISTS (
      SELECT 1
      FROM public.organization_members om
      JOIN public.organizations o ON om.org_id = o.id
      WHERE om.user_id = auth.uid()
        AND om.status = 'active'
        AND o.org_slug = SPLIT_PART(name, '/', 1)
    )
  );

-- Policy: Org members can update (replace) logos for their organization
CREATE POLICY "Org members can update logos"
  ON storage.objects FOR UPDATE
  USING (
    bucket_id = 'org-logos'
    AND auth.uid() IS NOT NULL
    AND EXISTS (
      SELECT 1
      FROM public.organization_members om
      JOIN public.organizations o ON om.org_id = o.id
      WHERE om.user_id = auth.uid()
        AND om.status = 'active'
        AND o.org_slug = SPLIT_PART(name, '/', 1)
    )
  );

-- Policy: Org members can delete logos for their organization
CREATE POLICY "Org members can delete logos"
  ON storage.objects FOR DELETE
  USING (
    bucket_id = 'org-logos'
    AND auth.uid() IS NOT NULL
    AND EXISTS (
      SELECT 1
      FROM public.organization_members om
      JOIN public.organizations o ON om.org_id = o.id
      WHERE om.user_id = auth.uid()
        AND om.status = 'active'
        AND o.org_slug = SPLIT_PART(name, '/', 1)
    )
  );

-- ============================================
-- 3. Record Migration
-- ============================================

INSERT INTO public.applied_migrations (migration_name, applied_at)
VALUES ('37_fix_logo_upload_rls', NOW())
ON CONFLICT (migration_name) DO NOTHING;

-- ============================================
-- 4. Verification Query
-- ============================================
-- Run this to test if policies work for current user:
--
-- SELECT
--   auth.uid() as user_id,
--   EXISTS (
--     SELECT 1
--     FROM public.organization_members om
--     JOIN public.organizations o ON om.org_id = o.id
--     WHERE om.user_id = auth.uid()
--       AND om.status = 'active'
--       AND o.org_slug = 'cloudact_inc_01082026'  -- Replace with your org
--   ) as can_upload;
--
-- Should return true if you're a member of the org.
