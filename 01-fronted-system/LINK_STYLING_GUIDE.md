# Link Styling Guide - CloudAct Frontend

## Overview

This guide ensures consistent link styling across the CloudAct frontend using brand colors (Teal #007A78 and Coral #FF6E50).

## Brand Colors

```css
/* Teal - Feature Links */
--link-teal: #007A78
--link-teal-hover: #005F5D
--link-teal-visited: #006462

/* Coral - Cost/Billing Links */
--link-coral: #FF6E50
--link-coral-hover: #E55A3C
--link-coral-visited: #CC4F35

/* Destructive - Red */
--link-destructive: #FF3B30
--link-destructive-hover: #CC2F26
```

## CSS Classes

### 1. Feature Links (Teal) - Default
Use for: Settings, Integrations, Dashboard, General navigation

```tsx
// Utility class
<Link href="/settings" className="link-feature">
  Settings
</Link>

// Or legacy class
<Link href="/settings" className="link-teal">
  Settings
</Link>

// Tailwind inline (avoid - use classes above)
<Link
  href="/settings"
  className="text-[#007A78] font-semibold hover:text-[#005F5D] hover:underline focus:outline-none focus:ring-2 focus:ring-[#007A78] focus:ring-offset-2 rounded"
>
  Settings
</Link>
```

### 2. Cost/Billing Links (Coral)
Use for: Billing, Subscriptions, Costs, Pricing

```tsx
// Utility class
<Link href="/billing" className="link-cost">
  Billing
</Link>

// Or legacy class
<Link href="/billing" className="link-coral">
  Billing
</Link>

// Tailwind inline (avoid - use classes above)
<Link
  href="/billing"
  className="text-[#FF6E50] font-semibold hover:text-[#E55A3C] hover:underline focus:outline-none focus:ring-2 focus:ring-[#FF6E50] focus:ring-offset-2 rounded"
>
  Billing
</Link>
```

### 3. Destructive Links (Red)
Use for: Delete, Danger zone, Remove

```tsx
<Link href="/settings/danger" className="link-destructive">
  Delete Account
</Link>
```

### 4. External Links (with icon)
Use for: External documentation, third-party links

```tsx
<a
  href="https://docs.cloudact.ai"
  className="link-external"
  target="_blank"
  rel="noopener noreferrer"
>
  Documentation
</a>
// Auto-adds ↗ icon
```

### 5. Navigation Links (header/footer)
Use for: Header navigation, footer links

```tsx
<Link href="/features" className="link-nav">
  Features
</Link>
```

### 6. Subtle Links
Use for: Secondary actions, helper text links

```tsx
<Link href="/help" className="link-subtle">
  Need help?
</Link>
```

### 7. Inline Text Links
Use for: Links within paragraphs

```tsx
<p>
  Read our <Link href="/privacy" className="link-inline">privacy policy</Link> for details.
</p>
```

### 8. Disabled Links

```tsx
<Link
  href="/disabled"
  className="link-disabled"
  aria-disabled="true"
  onClick={(e) => e.preventDefault()}
>
  Coming Soon
</Link>
```

## Landing Pages (landing.css)

```tsx
// Teal link (default)
<Link href="/features" className="cloudact-link">
  Learn More
</Link>

// Coral link (cost-related)
<Link href="/pricing" className="cloudact-link-coral">
  View Pricing
</Link>
```

## Console Pages (console.css)

Console uses the same utility classes from `globals.css`:

```tsx
// Feature link
<Link href={`/${orgSlug}/settings`} className="link-feature">
  Settings
</Link>

// Cost link
<Link href={`/${orgSlug}/billing`} className="link-cost">
  Billing
</Link>
```

## Common Patterns

### Auth Pages (Login/Signup)

```tsx
// "Sign In" link
<Link
  href="/login"
  className="text-[#007A78] font-semibold hover:text-[#005F5D] hover:underline focus:outline-none focus:ring-2 focus:ring-[#007A78] focus:ring-offset-2 rounded px-3 py-2"
>
  Sign In
</Link>

// "Forgot password?" link
<Link href="/forgot-password" className="text-xs text-[#007A78] hover:text-[#005F5D] hover:underline">
  Forgot password?
</Link>
```

### Error Pages

```tsx
<Link
  href="/"
  className="text-[#007A78] hover:text-[#005F5D] hover:underline font-medium"
>
  Go to Homepage
</Link>
```

### Breadcrumbs

```tsx
<Link
  href={`/${orgSlug}/subscriptions`}
  className="text-[#007A78] hover:text-[#005F5D] transition-colors focus:outline-none focus:ring-2 focus:ring-[#007A78] focus:ring-offset-2 rounded"
>
  Subscriptions
</Link>
```

## Migration Checklist

To migrate existing links:

1. **Replace default blue colors**:
   - ❌ `text-blue-600 hover:text-blue-700`
   - ✅ `link-feature` or `link-teal`

2. **Cost/Billing pages**:
   - ❌ `text-[#007A78]` on billing pages
   - ✅ `link-cost` or `link-coral`

3. **Add focus states**:
   - ✅ Always include `focus:outline-none focus:ring-2 focus:ring-[#007A78] focus:ring-offset-2`

4. **Add visited states** (optional):
   - Already included in utility classes

5. **External links**:
   - ✅ Use `link-external` or add `target="_blank" rel="noopener noreferrer"`

6. **Hover underline**:
   - ✅ `hover:underline` with `text-underline-offset: 3px`

## Files to Update

### High Priority (Billing/Cost)
- `/app/[orgSlug]/billing/page.tsx` - Use `link-cost`
- `/app/[orgSlug]/subscriptions/page.tsx` - Use `link-cost`
- `/app/[orgSlug]/subscriptions/[provider]/page.tsx` - Use `link-cost`
- `/components/quota-warning-banner.tsx` - Use `link-cost` for billing link

### Medium Priority (Feature Links)
- `/app/login/page.tsx` - Use `link-feature`
- `/app/signup/page.tsx` - Use `link-feature`
- `/app/error.tsx` - Use `link-feature`
- `/app/[orgSlug]/settings/integrations/*/page.tsx` - Use `link-feature`

### Low Priority (Navigation)
- `/app/(landingPages)/layout.tsx` - Already uses proper classes
- `/components/dashboard-sidebar.tsx` - Sidebar has custom styles

## Testing

After migrating links, verify:

1. ✅ No default blue colors (#0000FF, #0066CC, etc.)
2. ✅ All links have hover states (underline or color change)
3. ✅ Focus states visible (outline ring)
4. ✅ Cost/billing links use Coral
5. ✅ Feature links use Teal
6. ✅ External links have indicator (icon or `target="_blank"`)
7. ✅ Disabled links are grayed out and non-clickable

## Resources

- **CSS Variables**: `/app/globals.css` (lines 62-71)
- **Utility Classes**: `/app/globals.css` (lines 807-1040)
- **Landing Classes**: `/app/(landingPages)/landing.css` (lines 221-736)
- **Console Classes**: Use globals.css utility classes

---

**Last Updated**: 2025-12-13
