-- =============================================
-- Migration 34: Storage RLS WITH CHECK Fix (MT-003)
-- =============================================
-- The UPDATE policy on storage.objects was missing WITH CHECK,
-- allowing users to potentially move files to another org's folder.
-- =============================================
-- Run this in Supabase SQL Editor
-- =============================================

-- Record migration
INSERT INTO migrations (name, applied_at)
VALUES ('34_storage_rls_with_check', NOW())
ON CONFLICT (name) DO NOTHING;

-- =============================================
-- MT-003 FIX: Drop and recreate UPDATE policy with WITH CHECK
-- =============================================

-- Drop existing policy
DROP POLICY IF EXISTS "Org members can update logos" ON storage.objects;

-- Recreate with WITH CHECK clause to prevent path manipulation
CREATE POLICY "Org members can update logos"
  ON storage.objects FOR UPDATE
  USING (
    -- Can only update files in their org's folder
    bucket_id = 'org-logos'
    AND auth.uid() IS NOT NULL
    AND EXISTS (
      SELECT 1 FROM public.organization_members om
      JOIN public.organizations o ON om.org_id = o.id
      WHERE om.user_id = auth.uid()
        AND om.status = 'active'
        AND o.org_slug = (storage.foldername(name))[1]
    )
  )
  WITH CHECK (
    -- MT-003 FIX: Ensure the new path still belongs to user's org
    -- This prevents users from moving files to another org's folder
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

-- =============================================
-- Additional security: Restrict to admin/owner for sensitive ops
-- =============================================

-- Also update DELETE policy to require admin/owner role (optional tightening)
-- Keep current behavior for now - any org member can delete
-- Uncomment below if you want to restrict deletion to admins only:

-- DROP POLICY IF EXISTS "Org members can delete logos" ON storage.objects;
-- CREATE POLICY "Admins can delete logos"
--   ON storage.objects FOR DELETE
--   USING (
--     bucket_id = 'org-logos'
--     AND auth.uid() IS NOT NULL
--     AND EXISTS (
--       SELECT 1 FROM public.organization_members om
--       JOIN public.organizations o ON om.org_id = o.id
--       WHERE om.user_id = auth.uid()
--         AND om.status = 'active'
--         AND om.role IN ('owner', 'admin')
--         AND o.org_slug = (storage.foldername(name))[1]
--     )
--   );

-- =============================================
-- Verification
-- =============================================

SELECT 'Migration 34: Storage RLS WITH CHECK fix applied successfully' as result;
