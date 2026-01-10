# Logo Upload UI Fix

**Date:** 2026-01-09
**Status:** ✅ FIXED

---

## Issue

User reported: "UI is broken ? I can't see upload file option coming up at all ?"

---

## Root Cause

The `LogoUpload` component had a **double-card nesting issue**:

**Before (BROKEN):**
```tsx
// Page structure
<div className="bg-white rounded-2xl ...">  {/* Outer card */}
  <div className="p-6 sm:p-8">
    <LogoUpload ... />
      {/* Component internally created ANOTHER card */}
      <div className="space-y-6">
        <div className="bg-white rounded-2xl p-6 ...">  {/* Inner card - DUPLICATE */}
          {/* Content */}
        </div>
      </div>
  </div>
</div>
```

**Problem:** The component was designed as a standalone card but was placed inside another card in the page, creating double nesting that broke the UI layout.

---

## Fix Applied

**File:** `components/ui/logo-upload.tsx` (lines 235-236, 494)

Removed the internal card wrapper and outer space-y-6 div:

**Before:**
```typescript
return (
  <div className="space-y-6">
    <div className="bg-white rounded-2xl p-6 shadow-[...] border border-gray-100/80">
      <div className="flex flex-col lg:flex-row gap-8">
        {/* Content */}
      </div>
    </div>
  </div>
)
```

**After:**
```typescript
return (
  <div className="flex flex-col lg:flex-row gap-8">
    {/* Content */}
  </div>
)
```

**Result:** Component now renders directly into the parent card without creating its own nested card.

---

## Page Structure After Fix

**Now (CORRECT):**
```tsx
// Page structure
<div className="bg-white rounded-2xl ...">  {/* Page card */}
  <div className="p-6 border-b border-slate-100">
    <h2>Organization Logo</h2>
  </div>
  <div className="p-6 sm:p-8">
    <LogoUpload ... />
      {/* Component content renders directly here */}
      <div className="flex flex-col lg:flex-row gap-8">
        <div>Preview</div>
        <div>
          <Tabs>
            <TabsContent value="upload">
              {/* Upload area */}
            </TabsContent>
            <TabsContent value="url">
              {/* URL input */}
            </TabsContent>
          </Tabs>
        </div>
      </div>
  </div>
</div>
```

---

## What Should Now Be Visible

### ✅ Logo Preview Section (Left)
- Preview box (128px × 128px)
- Current logo or placeholder
- Delete button on hover (if logo exists)
- Guidelines (200×200 px, PNG, Max 1MB)

### ✅ Upload Options (Right)
- **Tab 1: Upload**
  - Drag-and-drop area
  - "Click to upload or drag and drop"
  - File type info: "PNG, JPG, GIF, SVG, WebP up to 1MB"
  - Upload button (when file selected)

- **Tab 2: URL**
  - Input field for logo URL
  - "Direct HTTPS link to your logo image"
  - Save URL button
  - Delete button (if logo exists)

---

## Files Modified

| File | Changes | Lines |
|------|---------|-------|
| `components/ui/logo-upload.tsx` | Removed double-card nesting | 235-236, 494 |

---

## Testing

1. Navigate to: `http://localhost:3000/[orgSlug]/settings/organization`
2. Scroll to "Organization Logo" section
3. You should now see:
   - Logo preview box on the left
   - Two tabs (Upload / URL) on the right
   - Drag-and-drop upload area in Upload tab
   - URL input in URL tab

---

## Related Fixes (Today)

1. ✅ Added auth check before upload
2. ✅ Enhanced error messages
3. ✅ Fixed RLS policies
4. ✅ Fixed UI double-card nesting **← This fix**

---

**Status:** ✅ UI should now be visible and functional
**Generated:** 2026-01-09
