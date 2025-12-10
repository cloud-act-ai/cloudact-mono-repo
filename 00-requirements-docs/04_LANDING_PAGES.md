# Landing Pages

**Status**: IMPLEMENTED (v1.0) | **Updated**: 2025-12-04 | **Single Source of Truth**

> Public marketing pages, SEO, and pre-authentication user experience
> NOT authenticated console (see 04_CONSOLE_UI.md)
> NOT user management (see 01_USER_MANAGEMENT.md)

---

## Notation

| Placeholder | Meaning | Example |
|-------------|---------|---------|
| `{slug}` | URL-safe identifier | `pricing`, `features` |
| `{page}` | Page component name | `HomePage`, `PricingPage` |

---

## TERMINOLOGY

| Term | Definition | Example |
|------|------------|---------|
| **Landing Page** | Public marketing page | Home, Pricing |
| **CTA** | Call to action button | "Start Free Trial" |
| **Hero Section** | Top visual section | Homepage hero |
| **Layout** | Page wrapper component | PublicLayout |

---

## Public Pages

| Route | Page | Purpose | Status |
|-------|------|---------|--------|
| `/` | Home | Product overview, main CTA | IMPLEMENTED |
| `/pricing` | Pricing | Plan comparison | IMPLEMENTED |
| `/features` | Features | Feature showcase | IMPLEMENTED |
| `/about` | About | Company info | IMPLEMENTED |
| `/contact` | Contact | Contact form | IMPLEMENTED |
| `/blog` | Blog | Articles listing | IMPLEMENTED |
| `/blog/{slug}` | Blog Post | Individual article | IMPLEMENTED |
| `/docs` | Documentation | User guides | IMPLEMENTED |
| `/legal/privacy` | Privacy | Privacy policy | IMPLEMENTED |
| `/legal/terms` | Terms | Terms of service | IMPLEMENTED |

---

## Architecture Flow

### Page Structure

```
+-----------------------------------------------------------------------------+
|                         LANDING PAGE STRUCTURE                               |
+-----------------------------------------------------------------------------+
|                                                                             |
|  PublicLayout (app/(public)/layout.tsx)                                     |
|  +-- Header (components/marketing/header.tsx)                               |
|      +-- Logo                                                               |
|      +-- Navigation: Features, Pricing, Blog, Docs                         |
|      +-- Auth Buttons: Sign In, Start Free Trial                           |
|                                                                             |
|  +-- Main Content                                                           |
|      +-- Page-specific components                                           |
|      +-- Hero sections                                                      |
|      +-- Feature grids                                                      |
|      +-- CTA sections                                                       |
|                                                                             |
|  +-- Footer (components/marketing/footer.tsx)                               |
|      +-- Navigation links                                                   |
|      +-- Social links                                                       |
|      +-- Legal links                                                        |
|      +-- Copyright                                                          |
|                                                                             |
+-----------------------------------------------------------------------------+
```

### Homepage Layout

```
+-----------------------------------------------------------------------------+
|                              HOMEPAGE                                        |
+-----------------------------------------------------------------------------+
|  [Logo]  Features  Pricing  Blog  Docs            [Sign In] [Start Trial]  |
+-----------------------------------------------------------------------------+
|                                                                             |
|  HERO SECTION                                                               |
|  +-- Headline: "Cloud Cost Analytics Made Simple"                          |
|  +-- Subheadline: "Track, analyze, and optimize..."                        |
|  +-- CTA Buttons: [Start Free Trial] [Watch Demo]                          |
|  +-- Hero Image/Animation                                                   |
|                                                                             |
+-----------------------------------------------------------------------------+
|                                                                             |
|  LOGO CLOUD                                                                 |
|  "Trusted by teams at..."                                                  |
|  [Company logos]                                                            |
|                                                                             |
+-----------------------------------------------------------------------------+
|                                                                             |
|  FEATURE HIGHLIGHTS                                                         |
|  +-- Feature Card 1: Multi-Cloud Support                                   |
|  +-- Feature Card 2: LLM Cost Tracking                                     |
|  +-- Feature Card 3: Real-time Analytics                                   |
|  +-- Feature Card 4: SaaS Subscription Management                          |
|                                                                             |
+-----------------------------------------------------------------------------+
|                                                                             |
|  HOW IT WORKS                                                               |
|  Step 1: Connect -> Step 2: Track -> Step 3: Optimize                      |
|                                                                             |
+-----------------------------------------------------------------------------+
|                                                                             |
|  PRICING PREVIEW                                                            |
|  +-- Starter: $29/mo                                                        |
|  +-- Professional: $99/mo [Most Popular]                                    |
|  +-- Scale: $299/mo                                                         |
|  [View Full Pricing]                                                        |
|                                                                             |
+-----------------------------------------------------------------------------+
|                                                                             |
|  TESTIMONIALS                                                               |
|  "Quote from customer..."                                                  |
|                                                                             |
+-----------------------------------------------------------------------------+
|                                                                             |
|  FINAL CTA                                                                  |
|  "Ready to optimize your cloud costs?"                                      |
|  [Start Your Free 14-Day Trial]                                            |
|                                                                             |
+-----------------------------------------------------------------------------+
|  Footer                                                                     |
+-----------------------------------------------------------------------------+
```

---

## SEO Implementation

### Metadata

**File:** `01-fronted-system/app/(public)/layout.tsx`

```typescript
export const metadata: Metadata = {
  title: {
    default: 'CloudAct - Cloud Cost Analytics',
    template: '%s | CloudAct'
  },
  description: 'Track, analyze, and optimize your cloud costs...',
  keywords: ['cloud costs', 'analytics', 'GCP', 'AWS', 'LLM'],
  openGraph: {
    type: 'website',
    locale: 'en_US',
    url: 'https://cloudact.io',
    siteName: 'CloudAct',
    images: [{ url: '/og-image.png' }]
  },
  twitter: {
    card: 'summary_large_image',
    site: '@cloudact'
  }
}
```

### Per-Page Metadata

```typescript
// app/(public)/pricing/page.tsx
export const metadata: Metadata = {
  title: 'Pricing',
  description: 'Simple, transparent pricing for teams of all sizes'
}
```

### Sitemap

**File:** `01-fronted-system/app/sitemap.ts`

```typescript
export default function sitemap(): MetadataRoute.Sitemap {
  return [
    { url: 'https://cloudact.io', lastModified: new Date() },
    { url: 'https://cloudact.io/pricing', lastModified: new Date() },
    { url: 'https://cloudact.io/features', lastModified: new Date() },
    // ... more pages
  ]
}
```

---

## Component Implementation

### Marketing Components

**Directory:** `01-fronted-system/components/marketing/`

| Component | Purpose | File |
|-----------|---------|------|
| `Header` | Navigation header | header.tsx |
| `Footer` | Page footer | footer.tsx |
| `Hero` | Hero section | hero.tsx |
| `FeatureCard` | Feature display | feature-card.tsx |
| `PricingCard` | Plan card | pricing-card.tsx |
| `TestimonialCard` | Customer quote | testimonial-card.tsx |
| `CTASection` | Call to action | cta-section.tsx |
| `LogoCloud` | Company logos | logo-cloud.tsx |
| `StepIndicator` | How it works | step-indicator.tsx |

### Header Component

```typescript
// components/marketing/header.tsx
export function Header() {
  return (
    <header className="sticky top-0 z-50 bg-background/95 backdrop-blur">
      <nav className="container flex h-16 items-center justify-between">
        <Logo />
        <NavigationLinks />
        <AuthButtons />
      </nav>
    </header>
  )
}
```

### Pricing Card Component

```typescript
// components/marketing/pricing-card.tsx
interface PricingCardProps {
  plan: {
    name: string
    price: number
    features: string[]
    popular?: boolean
  }
}

export function PricingCard({ plan }: PricingCardProps) {
  return (
    <Card className={cn(
      "relative",
      plan.popular && "border-primary shadow-lg"
    )}>
      {plan.popular && <Badge>Most Popular</Badge>}
      <CardHeader>
        <CardTitle>{plan.name}</CardTitle>
        <div className="text-3xl font-bold">${plan.price}/mo</div>
      </CardHeader>
      <CardContent>
        <ul>
          {plan.features.map(f => <li key={f}>{f}</li>)}
        </ul>
      </CardContent>
      <CardFooter>
        <Button>Start Free Trial</Button>
      </CardFooter>
    </Card>
  )
}
```

---

## Pricing Page

### Plan Comparison

```
+-----------------------------------------------------------------------------+
|                            PRICING PAGE                                      |
+-----------------------------------------------------------------------------+
|                                                                             |
|  "Simple, Transparent Pricing"                                              |
|  "Start free, upgrade as you grow. All plans include 14-day trial."        |
|                                                                             |
|  [ Monthly ] [ Yearly (Save 20%) ]                                          |
|                                                                             |
|  +----------------+  +----------------+  +----------------+                 |
|  | STARTER        |  | PROFESSIONAL   |  | SCALE          |                 |
|  | $29/month      |  | $99/month      |  | $299/month     |                 |
|  |                |  | [Most Popular] |  |                |                 |
|  | 2 team members |  | 5 team members |  | 10+ members    |                 |
|  | 3 integrations |  | 10 integrations|  | 20+ int.       |                 |
|  | 6 pipelines/day|  | 20 pipes/day   |  | 50+ pipes/day  |                 |
|  |                |  |                |  |                |                 |
|  | [Start Trial]  |  | [Start Trial]  |  | [Start Trial]  |                 |
|  +----------------+  +----------------+  +----------------+                 |
|                                                                             |
|  +----------------+                                                          |
|  | ENTERPRISE     |                                                          |
|  | Custom         |                                                          |
|  | Contact sales  |                                                          |
|  +----------------+                                                          |
|                                                                             |
|  FEATURE COMPARISON TABLE                                                   |
|  +------------------+----------+------------+---------+-----------+         |
|  | Feature          | Starter  | Pro        | Scale   | Enterprise|         |
|  +------------------+----------+------------+---------+-----------+         |
|  | Team Members     | 2        | 5          | 10+     | Unlimited |         |
|  | Integrations     | 3        | 10         | 20+     | Unlimited |         |
|  | Pipelines/Day    | 6        | 20         | 50+     | Unlimited |         |
|  | GCP Support      | Yes      | Yes        | Yes     | Yes       |         |
|  | LLM Tracking     | Yes      | Yes        | Yes     | Yes       |         |
|  | SaaS Tracking    | Yes      | Yes        | Yes     | Yes       |         |
|  | Priority Support | -        | -          | Yes     | Yes       |         |
|  | Custom Reports   | -        | -          | Yes     | Yes       |         |
|  | SLA              | -        | -          | -       | 99.9%     |         |
|  +------------------+----------+------------+---------+-----------+         |
|                                                                             |
|  FAQ SECTION                                                                |
|  +-- "What happens after my trial?"                                        |
|  +-- "Can I change plans later?"                                           |
|  +-- "Do you offer refunds?"                                               |
|                                                                             |
+-----------------------------------------------------------------------------+
```

---

## Implementation Status

### Completed

| Component | File |
|-----------|------|
| Public layout | app/(public)/layout.tsx |
| Homepage | app/(public)/page.tsx |
| Pricing page | app/(public)/pricing/page.tsx |
| Features page | app/(public)/features/page.tsx |
| About page | app/(public)/about/page.tsx |
| Contact page | app/(public)/contact/page.tsx |
| Blog list | app/(public)/blog/page.tsx |
| Blog post | app/(public)/blog/[slug]/page.tsx |
| Privacy policy | app/(public)/legal/privacy/page.tsx |
| Terms of service | app/(public)/legal/terms/page.tsx |
| Marketing header | components/marketing/header.tsx |
| Marketing footer | components/marketing/footer.tsx |
| Hero component | components/marketing/hero.tsx |
| Pricing cards | components/marketing/pricing-card.tsx |
| Feature cards | components/marketing/feature-card.tsx |
| Sitemap | app/sitemap.ts |
| Robots.txt | app/robots.ts |

### NOT IMPLEMENTED

| Component | Notes | Priority |
|-----------|-------|----------|
| Blog CMS | Currently static | P3 |
| Newsletter signup | Email collection | P3 |
| Live chat widget | Customer support | P4 |
| A/B testing | Conversion optimization | P4 |
| Analytics integration | Google Analytics | P3 |

---

## Styling

### Design System

- **Typography:** Inter font family
- **Colors:** CSS custom properties for theming
- **Spacing:** Tailwind spacing scale
- **Components:** shadcn/ui base components

### Responsive Breakpoints

| Breakpoint | Width | Usage |
|------------|-------|-------|
| `sm` | 640px | Mobile landscape |
| `md` | 768px | Tablet |
| `lg` | 1024px | Desktop |
| `xl` | 1280px | Large desktop |
| `2xl` | 1536px | Extra large |

---

## Performance

### Optimizations

| Optimization | Implementation |
|--------------|----------------|
| Image optimization | Next.js Image component |
| Font optimization | next/font with preload |
| Code splitting | Dynamic imports |
| Static generation | Export static pages |
| Asset caching | Vercel CDN |

### Core Web Vitals Targets

| Metric | Target |
|--------|--------|
| LCP | < 2.5s |
| FID | < 100ms |
| CLS | < 0.1 |

---

## File References

### Page Files

| File | Purpose |
|------|---------|
| `01-fronted-system/app/(public)/layout.tsx` | Public layout wrapper |
| `01-fronted-system/app/(public)/page.tsx` | Homepage |
| `01-fronted-system/app/(public)/pricing/page.tsx` | Pricing page |
| `01-fronted-system/app/(public)/features/page.tsx` | Features page |
| `01-fronted-system/app/(public)/about/page.tsx` | About page |
| `01-fronted-system/app/(public)/contact/page.tsx` | Contact page |
| `01-fronted-system/app/(public)/blog/page.tsx` | Blog listing |
| `01-fronted-system/app/(public)/blog/[slug]/page.tsx` | Blog post |
| `01-fronted-system/app/(public)/legal/privacy/page.tsx` | Privacy policy |
| `01-fronted-system/app/(public)/legal/terms/page.tsx` | Terms of service |

### Component Files

| File | Purpose |
|------|---------|
| `01-fronted-system/components/marketing/header.tsx` | Navigation header |
| `01-fronted-system/components/marketing/footer.tsx` | Page footer |
| `01-fronted-system/components/marketing/hero.tsx` | Hero sections |
| `01-fronted-system/components/marketing/feature-card.tsx` | Feature display |
| `01-fronted-system/components/marketing/pricing-card.tsx` | Pricing plans |
| `01-fronted-system/components/marketing/testimonial-card.tsx` | Testimonials |
| `01-fronted-system/components/marketing/cta-section.tsx` | CTAs |

### SEO Files

| File | Purpose |
|------|---------|
| `01-fronted-system/app/sitemap.ts` | Sitemap generation |
| `01-fronted-system/app/robots.ts` | Robots.txt |
| `01-fronted-system/public/og-image.png` | Open Graph image |

---

**Version**: 1.0 | **Updated**: 2025-12-04 | **Policy**: Single source of truth - no duplicate docs
