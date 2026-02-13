---
name: home-page
description: |
  CloudAct marketing home page development. Enterprise-grade landing page sections, hero components, animations.
  Use when: modifying the home page, adding landing sections, updating hero content, working with marketing components,
  or following CloudAct's landing page design patterns. NO ICONS. NO MINT TEXT. Enterprise-ready only.
---

# Home Page Development

## Quick Reference

### Two-Color Accent System
| Color | Hex | Use For | Gradient Opacity |
|-------|-----|---------|------------------|
| **Mint** | `#90FCA6` | Primary CTAs, success, positive | `0.10-0.15` |
| **Coral** | `#FF6C5E` | Alerts, warnings, secondary | `0.08` |

### Section Gradient Alternation
```
MINT → CORAL → MINT → (white) → CORAL → MINT → CORAL → MINT → CORAL → MINT → DARK
Hero → Integrations → Pillars → (Key) → Screenshots → HowItWorks → Features → Tabs → Pricing → Testimonials → CTA
```

### Golden Rules
1. **NO grey backgrounds** - White + brand gradient only
2. **NO mint text** - Slate/dark only for text
3. **NO icons in cards** - Use dots instead
4. **Inline styles for buttons** - `style={{ backgroundColor, color }}`
5. **Alternate gradients** - MINT → CORAL → MINT...
6. **Eyebrow badges** - Dark slate bg + white text (like "Most Popular" badge)
7. **Hero highlights** - Key word in coral color
8. **Purpose text** - Lead phrase in coral with fontWeight 500

---

## ⚠️ CRITICAL: Button Color Issue - MUST READ FIRST

**BUTTON TEXT DISAPPEARS IF YOU DON'T USE INLINE STYLES!**

The `landing.css` and `globals.css` files contain CSS rules that override Tailwind classes. Using `text-white` or `bg-[#90FCA6]` will result in invisible button text.

**ALWAYS use inline styles for button colors:**
```tsx
// ✅ CORRECT - inline styles prevent CSS override
style={{ backgroundColor: '#90FCA6', color: '#0f172a' }}
style={{ backgroundColor: '#0f172a', color: '#ffffff' }}

// ❌ WRONG - CSS will override these
className="bg-[#90FCA6] text-slate-900"  // Text may disappear!
className="bg-slate-900 text-white"       // Text may disappear!
```

See "Button Patterns" section below for complete examples.

---

## Overview

CloudAct's home page is an enterprise-grade marketing landing page built with Next.js 16 and Framer Motion animations. Located in the `(landingPages)` route group. Design inspired by H2O.ai - clean, professional, stunning.

### Design Philosophy
The page uses a **two-color accent system** (Mint + Coral) with **alternating radial gradients** per section. This creates visual rhythm as users scroll, making each section distinct while maintaining brand consistency.

**CRITICAL RULES:**
- NO icons in cards or feature lists - use dots instead
- NO mint (#90FCA6) color for text or headings - slate/dark only
- NO grey backgrounds (`bg-slate-50`, `bg-gray-100`, etc.) - WHITE + BRAND GRADIENT ONLY
- **Alternate section gradients:** MINT → CORAL → MINT → CORAL...
- Mint for: primary CTAs, success states, positive trends
- Coral for: alerts, warnings, secondary highlights, cost spikes
- Black + White or Mint + Black button combinations only
- Enterprise-ready design - no sample/template patterns
- Shining button effects with hover animations
- Tighter section spacing (py-12 to py-20, not py-24)

## Key Locations

- **Home Page:** `01-fronted-system/app/(landingPages)/page.tsx`
- **Landing Layout:** `01-fronted-system/app/(landingPages)/layout.tsx`
- **Landing Components:** `01-fronted-system/components/landing/`
- **Landing CSS:** `01-fronted-system/app/(landingPages)/landing.css`
- **Premium CSS:** `01-fronted-system/app/(landingPages)/premium.css`

## Brand Colors - Two-Color Accent System

CloudAct uses a **two-color accent system**: Mint (primary) and Coral (secondary). These are used for visual interest while maintaining enterprise professionalism.

```css
/* Primary Accent - MINT */
--mint: #90FCA6;
/* Use for: primary CTAs, success states, positive trends, "Connect" flows */
bg-[#90FCA6]              /* Primary button background */
border-[#90FCA6]          /* Highlighted card borders */
bg-[#90FCA6]/10           /* Subtle background tints */
shadow-[#90FCA6]/25       /* Button shadows */
text-emerald-600          /* Stats/numbers in mint sections */

/* Secondary Accent - CORAL */
--coral: #FF6C5E;
/* Use for: secondary highlights, warnings, cost alerts, "Analyze" flows */
bg-[#FF6C5E]              /* Anomaly/alert indicators */
border-[#FF6C5E]          /* Warning card borders */
bg-[#FF6C5E]/15           /* Subtle coral backgrounds */
text-[#FF6C5E]            /* Alert text, warning stats */

/* Obsidian - Dark */
--obsidian: #0f172a;      /* Dark buttons, primary text */

/* Text Colors - ALWAYS use these for body text */
text-slate-900            /* Primary headings */
text-slate-600            /* Body text, descriptions */
text-slate-500            /* Secondary text */
text-slate-400            /* Muted labels */

/* Accent Color Usage Pattern */
Step 1: Connect  → mint accent
Step 2: Analyze  → coral accent
Step 3: Optimize → mint accent

/* Section Alternation Example */
Hero section       → mint glow
How It Works       → mint/coral alternating steps
Product Features   → mint primary, coral for alerts/anomalies
```

### Where Colors Are Allowed

| Color | Allowed | Forbidden |
|-------|---------|-----------|
| Mint `#90FCA6` | Buttons, borders, glows, icons, stats | Headings, body text |
| Coral `#FF6C5E` | Alerts, warnings, secondary highlights | Primary CTAs, headings |
| Slate 900 | All headings | - |
| Slate 600 | Body text, descriptions | - |

## Button Patterns - MUST USE INLINE STYLES FOR COLORS

**CRITICAL:** Always use `style={{}}` for background and text colors. Tailwind classes like `text-white` or `bg-[#90FCA6]` get overridden by global CSS. This is the #1 cause of "disappearing text" bugs.

### Primary CTA (Mint Button - Dark Text)
```tsx
<Link
  href="/signup"
  className="group relative inline-flex items-center h-11 px-6 rounded-lg overflow-hidden transition-all duration-200 hover:shadow-lg hover:shadow-[#90FCA6]/30 hover:-translate-y-0.5"
  style={{ backgroundColor: '#90FCA6' }}
>
  <span className="absolute inset-0 bg-gradient-to-r from-transparent via-white/25 to-transparent -translate-x-full group-hover:translate-x-full transition-transform duration-700" />
  <span className="relative flex items-center text-sm font-semibold" style={{ color: '#0f172a' }}>
    Get Started Free
    <ArrowRight className="w-4 h-4 ml-2" />
  </span>
</Link>
```

### Secondary CTA (Dark Button - White Text)
```tsx
<Link
  href="/demo"
  className="group relative inline-flex items-center h-11 px-6 rounded-lg overflow-hidden transition-all duration-200 hover:-translate-y-0.5"
  style={{ backgroundColor: '#0f172a' }}
>
  <span className="absolute inset-0 bg-gradient-to-r from-transparent via-white/10 to-transparent -translate-x-full group-hover:translate-x-full transition-transform duration-700" />
  <span className="relative text-sm font-semibold" style={{ color: '#ffffff' }}>Request Demo</span>
</Link>
```

### Ghost CTA (Border on Dark BG - White Text)
```tsx
<Link
  href="/contact"
  className="group relative inline-flex items-center justify-center h-11 px-6 rounded-lg overflow-hidden transition-all duration-200 hover:-translate-y-0.5"
  style={{ border: '1px solid rgba(255,255,255,0.3)', backgroundColor: 'transparent' }}
>
  <span className="absolute inset-0 bg-gradient-to-r from-transparent via-white/5 to-transparent -translate-x-full group-hover:translate-x-full transition-transform duration-700" />
  <span className="relative text-sm font-semibold" style={{ color: '#ffffff' }}>Schedule Demo</span>
</Link>
```

### Conditional Button (Pricing Cards)
```tsx
<Link
  href="/signup"
  className="group relative w-full inline-flex items-center justify-center h-11 rounded-lg overflow-hidden transition-all duration-200 hover:-translate-y-0.5"
  style={{ backgroundColor: plan.highlighted ? '#90FCA6' : '#0f172a' }}
>
  <span className="absolute inset-0 bg-gradient-to-r from-transparent via-white/20 to-transparent -translate-x-full group-hover:translate-x-full transition-transform duration-700" />
  <span
    className="relative text-sm font-semibold"
    style={{ color: plan.highlighted ? '#0f172a' : '#ffffff' }}
  >
    Get Started
  </span>
</Link>
```

### WHY INLINE STYLES?
- Global CSS in `landing.css` or `globals.css` can override Tailwind
- `text-white` might become invisible if overridden
- `style={{}}` has highest specificity and cannot be overridden
- Always use for: `backgroundColor`, `color`, `border`

### Key Button Features
- `rounded-lg` (enterprise look)
- `h-11` (44px touch target)
- `hover:-translate-y-0.5` subtle lift
- Shine sweep animation (`duration-700`)
- `overflow-hidden` required for shine

## Card Pattern (NO ICONS)

```tsx
const items = [
  {
    title: "Cloud Infrastructure",
    providers: "AWS  •  GCP  •  Azure  •  OCI",
    description: "Unified multi-cloud cost visibility with automatic tagging.",
    features: ["Real-time cost tracking", "Reserved instance optimization"],
  },
]

{items.map((item, i) => (
  <motion.div
    key={item.title}
    initial={{ opacity: 0, y: 20 }}
    whileInView={{ opacity: 1, y: 0 }}
    viewport={{ once: true }}
    transition={{ delay: i * 0.1 }}
    className="group relative bg-white rounded-2xl p-8 shadow-sm border border-slate-200 hover:shadow-xl hover:border-slate-300 transition-all duration-300"
  >
    {/* NO ICON - text only */}
    <h3 className="text-xl font-bold text-slate-900 mb-2">{item.title}</h3>
    <p className="text-sm text-slate-400 font-medium mb-4">{item.providers}</p>
    <p className="text-slate-600 mb-6 leading-relaxed">{item.description}</p>
    <ul className="space-y-3">
      {item.features.map((feature) => (
        <li key={feature} className="flex items-center gap-3 text-sm text-slate-600">
          {/* Dot instead of icon */}
          <span className="w-1.5 h-1.5 rounded-full bg-slate-400 flex-shrink-0" />
          {feature}
        </li>
      ))}
    </ul>
    <Link
      href="/features"
      className="inline-flex items-center gap-2 mt-6 text-sm font-semibold text-slate-900 group-hover:text-slate-700 transition-colors"
    >
      Learn more
      <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
    </Link>
  </motion.div>
))}
```

## Feature List Pattern (NO ICONS)

```tsx
const features = [
  {
    title: "AI-Powered Anomaly Detection",
    description: "Catch unexpected spikes before they become budget busters.",
  },
]

{features.map((feature, i) => (
  <motion.div
    key={feature.title}
    initial={{ opacity: 0, y: 20 }}
    whileInView={{ opacity: 1, y: 0 }}
    viewport={{ once: true }}
    transition={{ delay: i * 0.05 }}
    className="group"
  >
    {/* NO ICON BOX - just text */}
    <h3 className="text-lg font-semibold text-slate-900 mb-3">{feature.title}</h3>
    <p className="text-slate-600 leading-relaxed">{feature.description}</p>
  </motion.div>
))}
```

## Capability Row Pattern (NO ICONS)

```tsx
const capabilities = [
  { title: "AI Anomaly Detection", desc: "Catch spikes in <5 min" },
]

{capabilities.map((cap, i) => (
  <motion.div
    key={cap.title}
    initial={{ opacity: 0, y: 10 }}
    whileInView={{ opacity: 1, y: 0 }}
    viewport={{ once: true }}
    transition={{ delay: i * 0.05 }}
    className="flex items-start gap-3"
  >
    {/* Dot instead of CheckCircle icon */}
    <span className="w-1.5 h-1.5 rounded-full bg-slate-400 flex-shrink-0 mt-2" />
    <div>
      <div className="text-sm font-semibold text-slate-900">{cap.title}</div>
      <div className="text-xs text-slate-500 mt-0.5">{cap.desc}</div>
    </div>
  </motion.div>
))}
```

## Section Header Pattern (Tighter Spacing)

```tsx
<motion.div
  initial={{ opacity: 0, y: 16 }}
  whileInView={{ opacity: 1, y: 0 }}
  viewport={{ once: true }}
  className="text-center max-w-2xl mx-auto mb-12"
>
  <h2 className="text-3xl md:text-4xl font-bold text-slate-900 mb-4 tracking-tight">
    All your spend. One platform.
  </h2>
  <p className="text-lg text-slate-600">
    CloudAct unifies cost data from every corner of your infrastructure.
  </p>
</motion.div>
```

## Eyebrow Badge Pattern (Dark Slate Style)

Small pill badges that appear above section headings to add context. Uses dark slate background (`#0f172a`) with white text, matching the "Most Popular" badge style for consistency.

```tsx
{/* Eyebrow badge - dark slate style (like Most Popular) */}
<div
  className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full shadow-sm mb-4"
  style={{ backgroundColor: '#0f172a' }}
>
  <Layers className="w-4 h-4" style={{ color: '#ffffff' }} />
  <span className="text-xs font-semibold" style={{ color: '#ffffff' }}>Unified Platform</span>
</div>
```

### With "Save 20%" Badge (Like Pricing Section)
```tsx
<div
  className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full shadow-sm mb-4"
  style={{ backgroundColor: '#0f172a' }}
>
  <DollarSign className="w-4 h-4" style={{ color: '#ffffff' }} />
  <span className="text-xs font-semibold" style={{ color: '#ffffff' }}>Pricing</span>
  {/* Save badge - mint background nested inside dark badge */}
  <span
    className="ml-1 px-2 py-0.5 text-[10px] font-bold rounded-full"
    style={{ backgroundColor: '#90FCA6', color: '#0f172a' }}
  >
    Save 20%
  </span>
</div>
```

### Eyebrow on Dark Background (Final CTA)
Use mint background for contrast against dark section backgrounds:
```tsx
<div
  className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full mb-5"
  style={{ backgroundColor: '#90FCA6' }}
>
  <Zap className="w-4 h-4" style={{ color: '#0f172a' }} />
  <span className="text-xs font-semibold" style={{ color: '#0f172a' }}>Get Started</span>
</div>
```

### Section-Specific Eyebrows
| Section | Icon | Label |
|---------|------|-------|
| Unified Platform | `Layers` | "Unified Platform" |
| Capabilities | `Sparkles` | "Capabilities" |
| Pricing | `DollarSign` | "Pricing" |
| Product Tour | `BarChart3` | "Product Tour" |
| Quick Setup | `Zap` | "Quick Setup" |
| Deep Analytics | `Shield` | "Deep Analytics" |
| Testimonials | `Users` | "Testimonials" |

## Hero Highlight Text Pattern (Coral Accent)

Highlight key words in headings with coral color to draw attention.

```tsx
{/* Hero headline with coral highlight */}
<h1 className="text-4xl sm:text-5xl lg:text-[3.25rem] font-bold text-slate-900 leading-[1.1] tracking-tight">
  Built for the{" "}
  <span style={{ color: '#FF6C5E' }}>Modern</span>{" "}
  Cloud
</h1>

{/* Section titles with coral highlight */}
<h2 className="text-3xl md:text-4xl font-bold text-slate-900 mb-4 tracking-tight">
  Everything you need to{" "}
  <span style={{ color: '#FF6C5E' }}>control</span>{" "}
  costs
</h2>
```

### Which Words to Highlight
- Action words: "control", "save", "optimize", "deeper"
- Differentiators: "Modern", "transparent", "engineering"
- NOT generic words like "the", "your", "with"

## Purpose Text Pattern (Coral Lead Phrase)

Add a coral-colored lead phrase to descriptions to draw attention to the key value proposition.

```tsx
{/* Purpose text in description */}
<p className="text-base lg:text-lg text-slate-600 leading-relaxed max-w-lg">
  <span style={{ color: '#FF6C5E', fontWeight: 500 }}>Enterprise-grade cost intelligence</span>{" "}
  with real-time analytics, intelligent anomaly detection, and beautiful visualizations.
</p>

{/* Another example */}
<p className="text-lg text-slate-600">
  <span style={{ color: '#FF6C5E', fontWeight: 500 }}>Purpose-built</span>{" "}
  for engineering and finance teams who need visibility, not just reports.
</p>

{/* With inline CTA */}
<p className="text-lg text-slate-600">
  14-day free trial. No credit card required.{" "}
  <span style={{ color: '#FF6C5E', fontWeight: 500 }}>Pay annually and save 20%.</span>
</p>
```

### Key Rules for Purpose Text
- Use `fontWeight: 500` (medium weight) for coral text
- Keep the coral phrase short (2-4 words)
- Place at the START of the sentence for impact
- Common phrases: "Enterprise-grade", "Purpose-built", "Real-time", "Industry-leading"

## Alternating Radial Gradient Pattern (REQUIRED)

**CRITICAL:** Sections alternate between MINT and CORAL radial gradients. This creates visual rhythm and makes each section feel distinct while maintaining brand consistency.

### Section Gradient Sequence (TRUE ALTERNATION)
```
1. Hero Section       → MINT   (rgba(144, 252, 166, 0.15))
2. Integrations Wall  → CORAL  (rgba(255, 108, 94, 0.08))
3. Three Pillars      → MINT   (rgba(144, 252, 166, 0.10))
4. Key Capabilities   → (plain white divider - no gradient)
5. Product Screenshots→ CORAL  (rgba(255, 108, 94, 0.08))
6. How It Works       → MINT   (rgba(144, 252, 166, 0.12))
7. Features Grid      → CORAL  (rgba(255, 108, 94, 0.08))
8. Feature Tabs       → MINT   (rgba(144, 252, 166, 0.10))
9. Pricing Section    → CORAL  (rgba(255, 108, 94, 0.08))
10. Testimonials      → MINT   (rgba(144, 252, 166, 0.10))
11. Final CTA         → DARK   (bg-slate-900)
```

**Rule:** Each section alternates MINT → CORAL → MINT → CORAL...
Skip divider sections (KeyCapabilities) when counting.

### Mint Section Template
```tsx
<section className="relative py-16 lg:py-20 bg-white overflow-hidden">
  {/* MINT radial gradient */}
  <div
    className="absolute inset-0 pointer-events-none"
    style={{
      background: 'radial-gradient(ellipse 80% 50% at 50% 0%, rgba(144, 252, 166, 0.12), transparent 70%)'
    }}
  />
  <div className="container relative z-10 mx-auto px-4 max-w-7xl">
    {/* Section content */}
  </div>
</section>
```

### Coral Section Template
```tsx
<section className="relative py-16 lg:py-20 bg-white overflow-hidden">
  {/* CORAL radial gradient */}
  <div
    className="absolute inset-0 pointer-events-none"
    style={{
      background: 'radial-gradient(ellipse 80% 50% at 50% 0%, rgba(255, 108, 94, 0.08), transparent 70%)'
    }}
  />
  <div className="container relative z-10 mx-auto px-4 max-w-7xl">
    {/* Section content */}
  </div>
</section>
```

### Gradient Intensity Levels

**MINT (#90FCA6) gradients:**
- Hero section: `0.15` - strongest
- Major sections: `0.12` - standard
- Minor sections: `0.10` - subtle

**CORAL (#FF6C5E) gradients:**
- All coral sections: `0.08` - subtle (coral is more vibrant, needs lower opacity)

### Key Requirements
- `relative` and `overflow-hidden` on section
- `absolute inset-0 pointer-events-none` on gradient div
- `relative z-10` on content container
- Use inline `style={{}}` for gradient (prevents CSS override)
- **Alternate between mint and coral for adjacent sections**

### Card Hover Shine Effect (Match Section Color)
```tsx
{/* In MINT gradient sections - use mint hover */}
<div className="group relative bg-white rounded-xl p-6 border border-slate-200 hover:border-slate-300 hover:shadow-xl hover:shadow-slate-900/5 transition-all duration-300 cursor-pointer">
  <div className="absolute inset-0 rounded-xl bg-gradient-to-br from-white via-[#90FCA6]/5 to-white opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
  <div className="relative">{/* Card content */}</div>
</div>

{/* In CORAL gradient sections - use coral hover */}
<div className="group relative bg-white rounded-xl p-6 border border-slate-200 hover:border-slate-300 hover:shadow-xl hover:shadow-slate-900/5 transition-all duration-300 cursor-pointer">
  <div className="absolute inset-0 rounded-xl bg-gradient-to-br from-white via-[#FF6C5E]/5 to-white opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
  <div className="relative">{/* Card content */}</div>
</div>
```

## Hero Section (Keep Google Badge)

The hero section MUST keep the "Powered by Google Cloud & Data AI" badge:

```tsx
{/* Powered by Google Badge - ALWAYS KEEP */}
<motion.div
  initial={{ opacity: 0, y: 20 }}
  animate={{ opacity: 1, y: 0 }}
  transition={{ duration: 0.5 }}
  className="inline-flex"
>
  <div className="flex items-center gap-2 px-4 py-2 bg-white/90 backdrop-blur-sm border border-slate-200/80 rounded-full shadow-lg shadow-slate-900/5">
    <svg className="w-4 h-4" viewBox="0 0 24 24">
      <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
      <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
      <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
      <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
    </svg>
    <span className="text-xs font-semibold text-slate-700">Powered by Google Cloud & Data AI</span>
  </div>
</motion.div>

{/* Headline */}
<h1 className="text-4xl sm:text-5xl lg:text-[3.5rem] font-bold text-slate-900 leading-[1.08] tracking-tight">
  Built for the Modern Cloud
</h1>

{/* Value prop */}
<p className="text-lg text-slate-600 leading-relaxed max-w-xl">
  Enterprise-grade cost intelligence with real-time analytics, intelligent anomaly detection, and beautiful visualizations.
</p>
```

## Trust Row Pattern (Dots, no icons)

```tsx
{["No credit card", "5-min setup", "SOC 2 ready"].map((item, i) => (
  <span key={i} className="flex items-center gap-2 text-sm text-slate-600">
    <span className="w-1.5 h-1.5 rounded-full bg-slate-400" />
    {item}
  </span>
))}
```

## Pricing Card Pattern

```tsx
{plans.map((plan) => (
  <div className="relative">
    {plan.highlighted && (
      <div className="absolute -inset-[2px] bg-[#90FCA6] rounded-3xl" />
    )}
    <div className={`relative h-full flex flex-col p-8 rounded-3xl bg-white ${
      !plan.highlighted && "border border-slate-200"
    }`}>
      {plan.highlighted && (
        <div className="absolute -top-4 left-1/2 -translate-x-1/2 px-4 py-1.5 bg-slate-900 text-white text-sm font-semibold rounded-full">
          Most Popular
        </div>
      )}

      <h3 className="text-xl font-bold text-slate-900 mb-1">{plan.name}</h3>
      <span className="text-5xl font-bold text-slate-900">{plan.price}</span>

      <ul className="space-y-4 mb-8 flex-grow">
        {plan.features.map((feature) => (
          <li key={feature} className="flex items-center gap-3 text-slate-600">
            {/* Dot instead of CheckCircle */}
            <span className="w-1.5 h-1.5 rounded-full bg-slate-400 flex-shrink-0" />
            {feature}
          </li>
        ))}
      </ul>

      {/* Mint button for highlighted, Black for others */}
      <Link
        href="/signup"
        style={{
          backgroundColor: plan.highlighted ? '#90FCA6' : '#0f172a',
          color: plan.highlighted ? '#0f172a' : '#ffffff'
        }}
        className="w-full h-12 rounded-full font-semibold"
      >
        Get Started
      </Link>
    </div>
  </div>
))}
```

## Animation Patterns

### Scroll Reveal
```tsx
<motion.div
  initial={{ opacity: 0, y: 20 }}
  whileInView={{ opacity: 1, y: 0 }}
  viewport={{ once: true }}
  transition={{ duration: 0.5, delay: 0.1 }}
>
```

### Staggered Children
```tsx
transition={{ delay: i * 0.05 }}  // 50ms stagger
```

## Layout Patterns

### Section Container
```tsx
<section className="py-24 bg-white">
  <div className="container mx-auto px-4 max-w-7xl">
```

### Grid Layouts
```tsx
<div className="grid md:grid-cols-3 gap-8">      // 3-column
<div className="grid lg:grid-cols-2 gap-12">    // Hero 2-column
```

## Section Differentiation (NO GREY - Gradient Only)

Sections are differentiated using varying brand gradient intensities, NOT grey backgrounds:

```tsx
// ✅ CORRECT - White bg with brand gradient
<section className="relative py-16 lg:py-20 bg-white overflow-hidden">
  <div
    className="absolute inset-0 pointer-events-none"
    style={{
      background: 'radial-gradient(ellipse 80% 50% at 50% 0%, rgba(144, 252, 166, 0.12), transparent 70%)'
    }}
  />
  <div className="container relative z-10 ...">

// ❌ WRONG - Grey background
<section className="py-16 bg-slate-50">  // NO GREY!
```

### Mock UI Elements (Replace Grey with Mint/Coral Tints)
```tsx
// ✅ CORRECT - Brand tints for placeholder elements
<div className="bg-[#90FCA6]/30 rounded" />   // Light mint
<div className="bg-[#90FCA6]/20 rounded" />   // Subtle mint
<div className="bg-[#FF6C5E]/15 rounded" />   // Light coral (for alerts)
<div className="border border-[#90FCA6]/20" /> // Mint border
<div className="border border-[#FF6C5E]/30" /> // Coral border (warnings)

// ❌ WRONG - Grey placeholders
<div className="bg-slate-200 rounded" />      // NO GREY!
<div className="bg-slate-100 rounded" />      // NO GREY!
<div className="bg-slate-50 rounded" />       // NO GREY!
<div className="bg-gray-100 rounded" />       // NO GREY!
<div className="bg-neutral-100 rounded" />    // NO GREY!
```

## Alternating Accent Pattern

Use mint and coral to create visual rhythm across the page:

### How It Works Section
```tsx
const steps = [
  { num: "01", title: "Connect", color: "mint" },   // Mint accent
  { num: "02", title: "Analyze", color: "coral" },  // Coral accent
  { num: "03", title: "Optimize", color: "mint" },  // Mint accent
]

// Step styling based on color
<div className={`border-4 ${
  step.color === "mint"
    ? "border-[#90FCA6]/30 text-emerald-600"
    : "border-[#FF6C5E]/30 text-[#FF6C5E]"
}`}>
```

### Testimonials Section
```tsx
// Alternate cards between mint and coral
<Card quote="..." author="..." color="mint" />
<Card quote="..." author="..." color="coral" featured />
<Card quote="..." author="..." color="mint" />

// Card accent line
<div className={`h-0.5 rounded-full ${
  color === "mint" ? "bg-[#90FCA6]" : "bg-[#FF6C5E]"
}`} />
```

### Product Screenshots / Feature Tabs
```tsx
// Data-driven color per feature
const screenshots = [
  { id: "dashboard", title: "Executive Dashboard", color: "mint" },
  { id: "genai", title: "GenAI Cost Intelligence", color: "coral" },
  { id: "anomaly", title: "AI Anomaly Detection", color: "coral" },
]

// Apply color to UI elements
<div className={`bg-${ss.color === "mint" ? "[#90FCA6]" : "[#FF6C5E]"}/10 ...`}>
```

### When to Use Each Color

| Mint `#90FCA6` | Coral `#FF6C5E` |
|----------------|-----------------|
| Primary CTAs | Secondary highlights |
| Success states | Alert/warning states |
| Positive trends (-12%) | Negative trends (+12%) |
| "Connected" status | "Anomaly detected" |
| Step 1 (Connect) | Step 2 (Analyze) |
| Cloud features | GenAI/Cost features |
| Dashboard, Integrations | Anomalies, Alerts |

## Validation Checklist

### Colors & Backgrounds
- [ ] NO grey backgrounds (`bg-slate-50`, `bg-gray-100`, `bg-neutral-100`) - WHITE ONLY
- [ ] NO mint text for headings - slate/dark only
- [ ] Alternating section gradients: MINT → CORAL → MINT → CORAL...
- [ ] No two adjacent sections have the same gradient color

### Buttons
- [ ] Primary buttons: mint `#90FCA6` background + dark `#0f172a` text
- [ ] Secondary buttons: dark `#0f172a` background + white text
- [ ] All button colors use `style={{}}` not Tailwind classes
- [ ] Shine sweep animation on hover

### Typography & Icons
- [ ] NO icons in cards or lists - dots only
- [ ] `text-slate-900` for all headings
- [ ] `text-slate-600` for descriptions
- [ ] Google badge preserved in hero

### Brand Accents
- [ ] Mint (#90FCA6) for: buttons, success, positive trends, section gradients
- [ ] Coral (#FF6C5E) for: alerts, warnings, negative trends, section gradients, eyebrow badges
- [ ] Card hover effects match section gradient color

### Eyebrow Badges & Highlights (New Patterns)
- [ ] Section eyebrow badges: dark slate bg (#0f172a) + white icon/text
- [ ] Hero headline: key word highlighted in coral
- [ ] Purpose text: lead phrase in coral with fontWeight 500
- [ ] "Save 20%" badge: mint background (#90FCA6) + dark text (#0f172a) nested in dark badge
- [ ] Final CTA eyebrow: mint bg (#90FCA6) + dark text (contrast on dark section)
- [ ] "Most Popular" badge: dark slate bg (#0f172a) + white text
- [ ] All eyebrow badges use `style={{ backgroundColor, color }}` (inline style)

## FORBIDDEN Patterns

```tsx
// NEVER DO THIS:
<span className="text-[#90FCA6]">Colored text</span>
<CheckCircle2 className="w-4 h-4 text-[#90FCA6]" />
<div className={`${feature.iconBg} ${feature.iconColor}`}>{feature.icon}</div>
<span className="text-xs font-semibold text-[#90FCA6] uppercase">Features</span>
```

## Common Issues & Solutions

### Issue: Button text disappears or is invisible
**Cause:** CSS in `landing.css` or `globals.css` overrides Tailwind classes
**Solution:** Always use `style={{}}` for button `backgroundColor` and `color`

### Issue: Mint color appearing in text/headings
**Cause:** Using `text-[#90FCA6]` or similar classes
**Solution:** Mint is ONLY for buttons, borders, glows - never text

### Issue: Icons appearing in cards/features
**Cause:** Using Lucide icons in card layouts
**Solution:** Replace icons with dots (`w-1.5 h-1.5 rounded-full bg-slate-400`)

### Issue: Grey backgrounds creating striped look
**Cause:** Using `bg-slate-50`, `bg-slate-100`, or similar grey backgrounds
**Solution:**
- Use `bg-white` for ALL section backgrounds
- Use brand radial gradient for visual differentiation between sections
- Replace grey placeholder elements with mint tints: `bg-[#90FCA6]/20` or `bg-[#90FCA6]/30`
- For mock UI elements, use white backgrounds with mint borders/accents instead of grey

### Issue: Buttons don't have shine effect
**Cause:** Missing shine span or `overflow-hidden`
**Solution:** Add the shine span pattern and ensure parent has `overflow-hidden`

### Issue: Two sections in a row have same gradient color
**Cause:** Not following the alternating pattern
**Solution:**
- Check the section order in `Home()` function
- Ensure MINT → CORAL → MINT → CORAL alternation
- Skip divider sections (KeyCapabilities) when counting
- Verify with: `grep -n "rgba(" page.tsx | head -20`

### Issue: Section gradient not visible
**Cause:** Missing `relative`, `overflow-hidden`, or `z-10`
**Solution:**
- Section needs: `className="relative ... overflow-hidden"`
- Gradient div needs: `className="absolute inset-0 pointer-events-none"`
- Content container needs: `className="relative z-10"`

## Source Specifications

Requirements consolidated from:
- `04_LANDING_PAGES.md` - Landing pages

## Related Skills

| Skill | Relationship |
|-------|-------------|
| `design` | Brand foundation (colors, typography, buttons) - source of truth for all brand rules |
| `console-ui` | Console dashboard UI (different from landing pages) |
| `charts` | Recharts chart library for data visualizations |
| `frontend-dev` | Next.js code patterns, server actions, Supabase auth |
