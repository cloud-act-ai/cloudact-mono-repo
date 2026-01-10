# Bug Report: Logo Upload Not Working

**Date:** 2026-01-09
**Status:** 🔍 INVESTIGATION COMPLETE
**Feature:** Organization Logo Upload

---

## Bug Summary

Logo upload functionality is failing. The user reports "log upload still not working it was working before".

---

## Investigation Results

### ✅ What's Working

1. **Supabase Storage Bucket Exists**
   - Bucket `org-logos` is accessible
   - Can list files inside the bucket
   - Found existing logos: `acme_inc_01022026/`, `guru_inc_12012025/`

2. **Code is Correct**
   - `uploadOrgLogo()` function in `actions/organization-locale.ts` (lines 795-913)
   - `LogoUpload` component in `components/ui/logo-upload.tsx` properly implemented
   - File validation: type, size (1MB max), format
   - Migration `24_org_logos_storage.sql` defines bucket and RLS policies

3. **RLS Policies Defined**
   - Public read access
   - Org members can upload/update/delete (lines 36-78 in migration)

### ❌ Potential Issues Found

#### Issue 1: RLS Policy May Be Failing

**File:** `scripts/supabase_db/24_org_logos_storage.sql` (lines 36-48)

```sql
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
        AND o.org_slug = (storage.foldername(name))[1]  -- ⚠️ ISSUE HERE
    )
  );
```

**Problem:**
- The policy extracts org_slug from file path using `(storage.foldername(name))[1]`
- If file path format doesn't match expected pattern, this fails
- Expected: `{org_slug}/logo-{timestamp}.{ext}`
- If client sends different path format, upload is rejected

**Evidence:** The `listBuckets()` API returned NO buckets, suggesting permissions/RLS might be restrictive.

---

#### Issue 2: Missing Authenticated Client in Upload

**File:** `actions/organization-locale.ts` (line 842)

```typescript
const supabase = await createClient()
```

**Problem:**
- Uses regular `createClient()` which gets user session from cookies
- If session is expired or invalid, uploads fail silently
- Should verify auth.uid() exists before attempting upload

**Fix Needed:** Add auth check before upload:
```typescript
const { data: { user } } = await supabase.auth.getUser()
if (!user) {
  return { success: false, error: "Not authenticated. Please log in again." }
}
```

---

#### Issue 3: Silent Failure on Error

**File:** `actions/organization-locale.ts` (lines 862-867)

```typescript
if (uploadError) {
  if (process.env.NODE_ENV === "development") {
    console.error("[uploadOrgLogo] Storage upload error:", uploadError)
  }
  return { success: false, error: `Failed to upload logo: ${uploadError.message}` }
}
```

**Problem:**
- Error only logged in development mode
- User gets generic "Failed to upload logo" message
- Doesn't distinguish between RLS failure, file size, type, etc.

**Fix Needed:** Add detailed error messages:
```typescript
if (uploadError) {
  let errorMessage = "Failed to upload logo"
  if (uploadError.message.includes("policies")) {
    errorMessage = "Permission denied. Please check your organization membership."
  } else if (uploadError.message.includes("size")) {
    errorMessage = "File too large. Maximum size is 1MB."
  }
  // Always log in development
  if (process.env.NODE_ENV === "development") {
    console.error("[uploadOrgLogo] Storage upload error:", uploadError)
  }
  return { success: false, error: errorMessage }
}
```

---

#### Issue 4: Potential Session Timeout

**File:** `components/ui/logo-upload.tsx` (line 85)

```typescript
const result = await uploadOrgLogo(orgSlug, formData)
```

**Problem:**
- If upload takes long (slow network), session might expire
- No retry logic
- No timeout handling

---

#### Issue 5: File Path Construction

**File:** `actions/organization-locale.ts` (line 839)

```typescript
const filePath = `${orgSlug}/${fileName}`
```

**Problem:**
- If org_slug contains special characters not validated, path is invalid
- Validation at line 801 only checks format, not Supabase Storage compatibility

---

## Root Cause Hypothesis

**Most Likely:** RLS policy failure due to:
1. Session expired/invalid → auth.uid() returns NULL → policy fails
2. File path doesn't match expected format → policy extraction fails
3. Organization membership check fails → user not in organization_members

---

## Testing Steps to Reproduce

1. **Check Auth Session:**
   ```bash
   # In browser console on organization settings page
   const { data: { session } } = await supabase.auth.getSession()
   console.log('Session:', session)
   ```

2. **Test Upload:**
   - Navigate to `/[orgSlug]/settings/organization`
   - Try uploading a PNG < 1MB
   - Check browser console for errors
   - Check Network tab for failed requests

3. **Check RLS Policies:**
   ```sql
   -- In Supabase SQL Editor
   SELECT * FROM storage.objects WHERE bucket_id = 'org-logos';
   SELECT auth.uid(); -- Should return user ID
   SELECT * FROM organization_members WHERE user_id = auth.uid();
   ```

---

## Recommended Fixes

### Fix 1: Add Auth Check Before Upload ✅ HIGH PRIORITY

```typescript
export async function uploadOrgLogo(
  orgSlug: string,
  formData: FormData
): Promise<UploadOrgLogoResult> {
  try {
    // ... existing validation ...

    const supabase = await createClient()

    // ADD THIS: Verify user is authenticated
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return {
        success: false,
        error: "Not authenticated. Please log in again."
      }
    }

    // ... rest of upload logic ...
  }
}
```

### Fix 2: Add Detailed Error Logging ✅ MEDIUM PRIORITY

```typescript
if (uploadError) {
  // Enhanced error handling
  let userMessage = "Failed to upload logo"
  if (uploadError.message.includes("policies") || uploadError.message.includes("permission")) {
    userMessage = "Permission denied. Please check your organization membership and try again."
  } else if (uploadError.message.includes("size") || uploadError.message.includes("too large")) {
    userMessage = "File too large. Maximum size is 1MB."
  } else if (uploadError.message.includes("type") || uploadError.message.includes("mime")) {
    userMessage = "Invalid file type. Please upload PNG, JPG, GIF, SVG, or WebP."
  }

  // Always log full error in development
  if (process.env.NODE_ENV === "development") {
    console.error("[uploadOrgLogo] Upload failed:", {
      orgSlug,
      fileName,
      filePath,
      error: uploadError,
      message: uploadError.message,
    })
  }

  return { success: false, error: userMessage }
}
```

### Fix 3: Verify RLS Policy Works ✅ HIGH PRIORITY

Run this query in Supabase SQL Editor to test:

```sql
-- Test if current user can upload
SELECT
  auth.uid() as user_id,
  EXISTS (
    SELECT 1 FROM public.organization_members om
    JOIN public.organizations o ON om.org_id = o.id
    WHERE om.user_id = auth.uid()
      AND om.status = 'active'
      AND o.org_slug = 'cloudact_inc_01082026'  -- Replace with test org
  ) as can_upload;
```

If returns `false`, the RLS policy needs fixing.

---

## Files to Modify

| File | Changes | Priority |
|------|---------|----------|
| `01-fronted-system/actions/organization-locale.ts` | Add auth check before upload (line 842) | HIGH |
| `01-fronted-system/actions/organization-locale.ts` | Enhanced error messages (lines 862-867) | MEDIUM |
| `01-fronted-system/scripts/supabase_db/24_org_logos_storage.sql` | Verify RLS policy works | HIGH |

---

## Next Steps

1. ✅ Add auth check before upload
2. ✅ Enhanced error messages
3. ✅ Test with real user session
4. ✅ Verify RLS policies in Supabase dashboard
5. ✅ Add retry logic for network failures

---

**Generated:** 2026-01-09
**Status:** Ready for fixes
