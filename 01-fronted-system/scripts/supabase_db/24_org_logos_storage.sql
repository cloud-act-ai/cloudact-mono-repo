-- Migration 24: Organization Logos Storage Bucket
-- Creates a Supabase Storage bucket for organization logos
-- with proper RLS policies for secure upload/access
--
-- Run this in Supabase SQL Editor

-- ============================================
-- 1. Create the storage bucket
-- ============================================

-- Create the 'org-logos' bucket (public for reading, authenticated for upload)
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'org-logos',
  'org-logos',
  true,  -- Public bucket so logos can be displayed without auth
  1048576,  -- 1MB file size limit
  ARRAY['image/png', 'image/jpeg', 'image/gif', 'image/svg+xml', 'image/webp']
)
ON CONFLICT (id) DO UPDATE SET
  public = true,
  file_size_limit = 1048576,
  allowed_mime_types = ARRAY['image/png', 'image/jpeg', 'image/gif', 'image/svg+xml', 'image/webp'];

-- ============================================
-- 2. Storage RLS Policies
-- ============================================

-- Policy: Allow public read access to all logos
CREATE POLICY "Public can view org logos"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'org-logos');

-- Policy: Org members can upload logos for their organization
-- The file path must be: {org_slug}/logo.{ext}
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
        AND o.org_slug = (storage.foldername(name))[1]
    )
  );

-- Policy: Org members can update (replace) logos for their organization
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
        AND o.org_slug = (storage.foldername(name))[1]
    )
  );

-- Policy: Org members can delete logos for their organization
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
        AND o.org_slug = (storage.foldername(name))[1]
    )
  );

-- ============================================
-- 3. Record Migration
-- ============================================

INSERT INTO public.applied_migrations (migration_name, applied_at)
VALUES ('24_org_logos_storage', NOW())
ON CONFLICT (migration_name) DO NOTHING;

-- ============================================
-- Usage Notes:
-- ============================================
--
-- File path format: {org_slug}/logo-{timestamp}.{ext}
-- Example: guru_inc_12012025/logo-1703520000000.png
--
-- Public URL format:
-- https://{project}.supabase.co/storage/v1/object/public/org-logos/{org_slug}/logo-{timestamp}.{ext}
--
-- Upload via client:
-- const { data, error } = await supabase.storage
--   .from('org-logos')
--   .upload(`${orgSlug}/logo-${Date.now()}.png`, file)
