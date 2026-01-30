---
name: home-page
description: |
  CloudAct marketing home page development. Enterprise-grade landing page sections, hero components, animations.
  Use when: modifying the home page, adding landing sections, updating hero content, working with marketing components,
  or following CloudAct's landing page design patterns. NO ICONS. NO MINT TEXT. Enterprise-ready only.
---

# Home Page Development

## Overview

CloudAct's home page is an enterprise-grade marketing landing page built with Next.js 16 and Framer Motion animations. Located in the `(landingPages)` route group.

**CRITICAL RULES:**
- NO icons in cards or feature lists
- NO mint (#90FCA6) color for text or headings - slate/dark only
- Mint ONLY for: buttons, borders, background glows
- Black + White or Mint + Black button combinations only
- Enterprise-ready design - no sample/template patterns

## Key Locations

- **Home Page:** `01-fronted-system/app/(landingPages)/page.tsx`
- **Landing Layout:** `01-fronted-system/app/(landingPages)/layout.tsx`
- **Landing Components:** `01-fronted-system/components/landing/`
- **Landing CSS:** `01-fronted-system/app/(landingPages)/landing.css`
- **Premium CSS:** `01-fronted-system/app/(landingPages)/premium.css`

## Brand Colors

```css
/* Primary Colors */
--mint: #90FCA6;          /* BUTTONS ONLY - never text/headings */
--obsidian: #0f172a;      /* Dark buttons, primary text */

/* Text Colors - ALWAYS use these for text */
text-slate-900            /* Primary headings */
text-slate-600            /* Body text, descriptions */
text-slate-500            /* Secondary text */
text-slate-400            /* Muted labels */

/* Where mint IS allowed */
bg-[#90FCA6]              /* Primary button background */
border-[#90FCA6]          /* Highlighted card borders */
bg-[#90FCA6]/10           /* Subtle background glows */
shadow-[#90FCA6]/25       /* Button shadows */

/* Where mint is NEVER allowed */
text-[#90FCA6]            /* FORBIDDEN - never use */
<span className="text-[#90FCA6]">  /* FORBIDDEN */
```

## Button Patterns (ONLY these combinations)

### Primary CTA (Mint + Black text)
```tsx
<Link
  href="/signup"
  className="group inline-flex items-center h-12 px-7 text-sm font-semibold text-slate-900 bg-[#90FCA6] rounded-full hover:bg-[#7ee994] transition-all shadow-lg shadow-[#90FCA6]/25"
>
  Get Started
  <ArrowRight className="w-4 h-4 ml-2 group-hover:translate-x-0.5 transition-transform" />
</Link>
```

### Secondary CTA (Black + White text)
```tsx
<Link
  href="/demo"
  className="inline-flex items-center h-12 px-7 text-sm font-semibold rounded-full hover:bg-slate-800 transition-all"
  style={{ backgroundColor: '#0f172a', color: '#ffffff' }}
>
  <span style={{ color: '#ffffff' }}>Watch Demo</span>
</Link>
```

### Ghost CTA (White border on dark)
```tsx
<Link
  href="/contact"
  className="inline-flex items-center h-12 px-8 text-sm font-semibold border-2 border-white/30 rounded-full hover:bg-white/10 transition-all"
  style={{ color: '#ffffff' }}
>
  <span style={{ color: '#ffffff' }}>Schedule Demo</span>
</Link>
```

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

## Section Header Pattern

```tsx
<motion.div
  initial={{ opacity: 0, y: 20 }}
  whileInView={{ opacity: 1, y: 0 }}
  viewport={{ once: true }}
  className="text-center max-w-3xl mx-auto mb-16"
>
  {/* NO MINT LABEL - just heading and description */}
  <h2 className="text-4xl md:text-5xl font-bold text-slate-900 mb-6 tracking-tight">
    All your spend. One platform.
  </h2>
  <p className="text-xl text-slate-600">
    CloudAct unifies cost data from every corner of your infrastructure.
  </p>
</motion.div>
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

## Validation Checklist

- [ ] NO icons in cards or lists - dots only
- [ ] NO mint text or headings - slate/dark only
- [ ] Buttons: mint+black or black+white only
- [ ] Google badge preserved in hero
- [ ] text-slate-900 for all headings
- [ ] text-slate-600 for descriptions
- [ ] No "Features" or "Testimonials" mint labels
- [ ] Enterprise-ready patterns only

## FORBIDDEN Patterns

```tsx
// NEVER DO THIS:
<span className="text-[#90FCA6]">Colored text</span>
<CheckCircle2 className="w-4 h-4 text-[#90FCA6]" />
<div className={`${feature.iconBg} ${feature.iconColor}`}>{feature.icon}</div>
<span className="text-xs font-semibold text-[#90FCA6] uppercase">Features</span>
```

## Related Skills

- `frontend-dev` - Console pages and components
- `frontend-ui` - Premium console UI guidelines
