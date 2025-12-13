# Image Components Documentation

## Overview

This document covers the image-related UI components in the CloudAct.ai frontend, including optimized image handling, aspect ratios, and provider logos.

## Components

### 1. AspectRatio (`aspect-ratio.tsx`)

Radix UI aspect ratio primitive for maintaining consistent image proportions.

**Usage:**
```tsx
import { AspectRatio } from "@/components/ui/aspect-ratio"

<AspectRatio ratio={16 / 9}>
  <img src="/banner.jpg" alt="Banner" className="object-cover" />
</AspectRatio>
```

**Common Ratios:**
- `16/9` - Wide banner, video thumbnails
- `4/3` - Standard image
- `1/1` - Square (avatars, logos)
- `3/2` - Photography
- `21/9` - Ultrawide

---

### 2. OptimizedImage (`optimized-image.tsx`)

Enhanced Next.js Image component with loading states, error handling, and brand-consistent styling.

**Features:**
- ✅ Shimmer loading placeholder
- ✅ Error state with fallback
- ✅ Consistent border radius (matches card design)
- ✅ Lazy loading by default
- ✅ Dark mode support
- ✅ Alt text enforcement

**Props:**
```typescript
interface OptimizedImageProps extends ImageProps {
  borderRadius?: "none" | "sm" | "md" | "lg" | "xl" | "full" // default: "lg" (12px)
  showPlaceholder?: boolean                                   // default: true
  fallbackSrc?: string                                        // fallback image URL
  errorComponent?: React.ReactNode                            // custom error UI
  containerClassName?: string                                 // wrapper class
}
```

**Basic Usage:**
```tsx
import { OptimizedImage } from "@/components/ui/optimized-image"

<OptimizedImage
  src="/hero-banner.png"
  alt="CloudAct dashboard preview"
  width={1200}
  height={600}
  borderRadius="xl"
  fallbackSrc="/placeholder.jpg"
/>
```

**Border Radius Reference:**
- `none` - 0px (no rounding)
- `sm` - 6px (subtle rounding)
- `md` - 8px (moderate rounding)
- `lg` - 10px (default - matches most cards)
- `xl` - 14px (prominent rounding for hero images)
- `full` - 9999px (circular - for avatars)

**With Aspect Ratio:**
```tsx
import { AspectRatio } from "@/components/ui/aspect-ratio"
import { OptimizedImage } from "@/components/ui/optimized-image"

<AspectRatio ratio={16 / 9}>
  <OptimizedImage
    src="/dashboard-preview.png"
    alt="Dashboard preview"
    fill
    className="object-cover"
    borderRadius="lg"
  />
</AspectRatio>
```

**Custom Error Component:**
```tsx
<OptimizedImage
  src="/user-avatar.jpg"
  alt="User avatar"
  width={100}
  height={100}
  borderRadius="full"
  errorComponent={
    <div className="flex items-center justify-center w-full h-full bg-slate-200">
      <User className="w-12 h-12 text-slate-400" />
    </div>
  }
/>
```

---

### 3. LogoImage (`optimized-image.tsx`)

Specialized component for logos with uniform sizing and background containers.

**Features:**
- ✅ Predefined sizes (sm: 32px, md: 48px, lg: 64px, xl: 96px)
- ✅ Object-fit contain (preserves logo aspect)
- ✅ Optional background container
- ✅ Fallback to placeholder logo
- ✅ Border and padding for visual consistency

**Props:**
```typescript
interface LogoImageProps {
  src: string
  alt: string
  size?: "sm" | "md" | "lg" | "xl"                            // default: "md"
  width?: number                                              // custom width (overrides size)
  height?: number                                             // custom height (overrides size)
  borderRadius?: "none" | "sm" | "md" | "lg" | "xl" | "full" // default: "md"
  showBackground?: boolean                                    // default: true
  backgroundColor?: string                                    // Tailwind classes
  className?: string
}
```

**Usage:**
```tsx
import { LogoImage } from "@/components/ui/optimized-image"

// Standard logo with background
<LogoImage
  src="/company-logo.png"
  alt="Company logo"
  size="md"
/>

// Large logo without background
<LogoImage
  src="/partner-logo.svg"
  alt="Partner logo"
  size="lg"
  showBackground={false}
/>

// Custom size and styling
<LogoImage
  src="/brand-icon.png"
  alt="Brand icon"
  width={128}
  height={128}
  borderRadius="xl"
  backgroundColor="bg-teal-50 dark:bg-teal-900"
/>
```

**Size Reference:**
- `sm` - 32x32px (compact UI, inline logos)
- `md` - 48x48px (default - cards, lists)
- `lg` - 64x64px (featured sections)
- `xl` - 96x96px (hero sections, large displays)

---

### 4. ProviderLogo (`optimized-image.tsx`)

Pre-configured component for integration provider logos (OpenAI, Anthropic, GCP, etc.).

**Features:**
- ✅ Auto-loads provider logo from `/public/providers/`
- ✅ Consistent sizing across all providers
- ✅ Optional provider name label
- ✅ Brand colors per provider
- ✅ Fallback for unknown providers

**Supported Providers:**
- `openai` - OpenAI (logo: openai.svg, color: #10A37F)
- `anthropic` - Anthropic (logo: anthropic.svg, color: #D97757)
- `gcp` - Google Cloud (logo: gcp.svg, color: #4285F4)
- `gemini` - Gemini (logo: gemini.svg, color: #8E75FF)
- `deepseek` - DeepSeek (logo: deepseek.svg, color: #1A73E8)
- `slack` - Slack (logo: slack.svg, color: #4A154B)
- `github` - GitHub (logo: github.svg, color: #181717)
- `custom` - Custom/Unknown (logo: placeholder-logo.svg)

**Props:**
```typescript
interface ProviderLogoProps {
  provider: "openai" | "anthropic" | "gcp" | "gemini" | "deepseek" | "slack" | "github" | "custom"
  name?: string                                               // override display name
  size?: "sm" | "md" | "lg" | "xl"                           // default: "md"
  showLabel?: boolean                                        // default: false
  className?: string
}
```

**Usage:**
```tsx
import { ProviderLogo } from "@/components/ui/optimized-image"

// Simple logo
<ProviderLogo provider="openai" />

// With label
<ProviderLogo
  provider="anthropic"
  size="lg"
  showLabel={true}
/>

// Custom provider
<ProviderLogo
  provider="custom"
  name="My AI Provider"
  showLabel={true}
/>
```

**In Integration Cards:**
```tsx
import { ProviderLogo } from "@/components/ui/optimized-image"

<div className="flex items-center gap-3">
  <ProviderLogo provider="openai" size="md" />
  <div>
    <h3>OpenAI Integration</h3>
    <p>Connect your OpenAI API key</p>
  </div>
</div>
```

---

## Setup & Installation

### 1. Install Dependencies

```bash
npm install @radix-ui/react-aspect-ratio
```

### 2. Configure Next.js Image Domains

Update `next.config.mjs`:

```javascript
/** @type {import('next').NextConfig} */
const nextConfig = {
  images: {
    domains: [
      'localhost',
      'your-domain.com',
      // Add external image domains here
    ],
    remotePatterns: [
      {
        protocol: 'https',
        hostname: '**.supabase.co',
      },
      // Add other patterns as needed
    ],
  },
}

export default nextConfig
```

### 3. Add Provider Logos

Create provider logo files in `/public/providers/`:

```
/public/providers/
  ├── openai.svg
  ├── anthropic.svg
  ├── gcp.svg
  ├── gemini.svg
  ├── deepseek.svg
  ├── slack.svg
  └── github.svg
```

Fallback logo:
```
/public/
  └── placeholder-logo.svg
```

---

## Brand Guidelines

### Border Radius
Follow the card design system:
- **Cards**: 12px (`rounded-lg`)
- **Large cards**: 16px (`rounded-xl`)
- **Avatars**: Full circle (`rounded-full`)
- **Icons**: 8px (`rounded-md`)

### Loading States
- **Placeholder**: Light gray (#F1F5F9 light, #1E293B dark)
- **Shimmer**: Animated gradient (slate-100 → slate-200 → slate-100)
- **Duration**: 2s infinite

### Error States
- **Icon**: Image slash icon (stroke width: 2)
- **Icon color**: Slate-400 (light), Slate-600 (dark)
- **Background**: Slate-100 (light), Slate-800 (dark)
- **Text**: "Image failed to load" (text-sm, slate-600/400)

### Dark Mode
All components support automatic dark mode via Tailwind's `dark:` prefix:
- Backgrounds: `bg-slate-100 dark:bg-slate-800`
- Borders: `border-slate-200 dark:border-slate-700`
- Text: `text-slate-900 dark:text-slate-100`

---

## Accessibility

### Alt Text
- **Required**: All images MUST have descriptive alt text
- **Decorative images**: Use empty alt (`alt=""`)
- **Informative images**: Describe the content/purpose
- **Logos**: Company/product name (e.g., "OpenAI logo")

### Loading States
- Use `aria-hidden="true"` on loading placeholders
- Announce loading state to screen readers if critical

### Error States
- Provide clear error messaging
- Ensure error states are keyboard accessible
- Use semantic HTML (not just styling)

### Focus States
All interactive images inherit global focus styles:
```css
:focus-visible {
  outline: 2px solid var(--cloudact-teal);
  outline-offset: 2px;
}
```

---

## Performance Best Practices

### 1. Image Optimization
- **Format**: Use WebP for photos, SVG for logos/icons
- **Size**: Resize images to actual display size (don't use CSS to scale down)
- **Compression**: Use tools like ImageOptim, TinyPNG
- **Next.js**: Automatic optimization via next/image

### 2. Lazy Loading
All components use `loading="lazy"` by default:
- Images load when they enter viewport
- Reduces initial page load time
- Improves Core Web Vitals (LCP)

### 3. Responsive Images
Use Next.js responsive sizing:
```tsx
<OptimizedImage
  src="/hero.jpg"
  alt="Hero"
  width={1200}
  height={600}
  sizes="(max-width: 768px) 100vw, (max-width: 1200px) 50vw, 33vw"
/>
```

### 4. Priority Loading
For above-the-fold images:
```tsx
<OptimizedImage
  src="/hero.jpg"
  alt="Hero"
  width={1200}
  height={600}
  priority={true}  // Disables lazy loading
/>
```

---

## Common Patterns

### 1. Integration Card Header
```tsx
<div className="flex items-center gap-3">
  <ProviderLogo provider="openai" size="md" />
  <div>
    <h3 className="text-lg font-semibold">OpenAI Integration</h3>
    <p className="text-sm text-slate-600">Connect your API key</p>
  </div>
</div>
```

### 2. Provider List
```tsx
<div className="grid grid-cols-2 md:grid-cols-4 gap-4">
  {providers.map((provider) => (
    <div key={provider} className="flex flex-col items-center gap-2">
      <ProviderLogo provider={provider} size="lg" />
      <span className="text-sm">{provider}</span>
    </div>
  ))}
</div>
```

### 3. Dashboard Preview with Aspect Ratio
```tsx
<AspectRatio ratio={16 / 9}>
  <OptimizedImage
    src="/dashboard-preview.png"
    alt="Dashboard preview"
    fill
    className="object-cover"
    borderRadius="xl"
    showPlaceholder={true}
  />
</AspectRatio>
```

### 4. User Avatar
```tsx
<OptimizedImage
  src={user.avatar || "/placeholder-user.jpg"}
  alt={user.name}
  width={40}
  height={40}
  borderRadius="full"
  className="border-2 border-white shadow-sm"
/>
```

### 5. Gallery with Loading States
```tsx
<div className="grid grid-cols-3 gap-4">
  {images.map((img) => (
    <AspectRatio key={img.id} ratio={1}>
      <OptimizedImage
        src={img.url}
        alt={img.title}
        fill
        className="object-cover"
        borderRadius="lg"
        fallbackSrc="/placeholder.jpg"
      />
    </AspectRatio>
  ))}
</div>
```

---

## Troubleshooting

### Images Not Loading
1. Check `next.config.mjs` image domains
2. Verify image path is correct (relative to `/public`)
3. Check browser console for CORS errors
4. Ensure image file exists in `/public`

### Shimmer Not Showing
1. Ensure `showPlaceholder={true}` (default)
2. Check `globals.css` for shimmer animation
3. Verify `animate-[shimmer_2s_infinite]` class

### Provider Logo Not Found
1. Check provider name matches config (`openai`, `anthropic`, etc.)
2. Verify logo file exists in `/public/providers/`
3. Falls back to `/placeholder-logo.svg` if not found

### Layout Shift
1. Always specify `width` and `height` for Next.js Image
2. Use `fill` with AspectRatio for unknown dimensions
3. Reserve space with CSS (min-height, aspect-ratio)

---

## Migration Guide

### From Basic `<img>` to OptimizedImage

**Before:**
```tsx
<img
  src="/logo.png"
  alt="Logo"
  className="w-12 h-12 rounded-lg"
/>
```

**After:**
```tsx
<OptimizedImage
  src="/logo.png"
  alt="Logo"
  width={48}
  height={48}
  borderRadius="lg"
/>
```

### From Hardcoded Icons to ProviderLogo

**Before:**
```tsx
<div className="w-12 h-12 rounded-lg bg-teal-50 flex items-center justify-center">
  <Brain className="w-6 h-6 text-teal-600" />
</div>
```

**After:**
```tsx
<ProviderLogo provider="openai" size="md" />
```

---

## Future Enhancements

- [ ] Add image gallery component with lightbox
- [ ] Implement blur hash placeholders
- [ ] Add image zoom on hover/click
- [ ] Create avatar group component
- [ ] Add image upload component with preview
- [ ] Implement progressive image loading
- [ ] Add support for more providers (AWS, Azure, etc.)

---

**Last Updated:** 2025-12-13
