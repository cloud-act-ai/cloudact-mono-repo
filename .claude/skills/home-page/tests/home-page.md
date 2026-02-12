# Home Page - Test Plan

## UI Tests

Landing page visual, design, and component validation.

### Test Matrix (30 checks)

| # | Test | Type | Expected |
|---|------|------|----------|
| 1 | Home page loads at `/` | Nav | Page renders without errors |
| 2 | Hero section visible with headline | UI | "Built for the Modern Cloud" visible |
| 3 | Google Cloud badge in hero | UI | "Powered by Google Cloud & Data AI" badge present |
| 4 | Hero CTA buttons visible (Get Started + Request Demo) | UI | Two CTA buttons rendered |
| 5 | Primary CTA uses mint background (#90FCA6) | Audit | `style={{ backgroundColor: '#90FCA6' }}` |
| 6 | Secondary CTA uses dark background (#0f172a) | Audit | `style={{ backgroundColor: '#0f172a' }}` |
| 7 | All button text uses inline styles for color | Audit | `style={{ color: ... }}`, not `text-white` class |
| 8 | Hero highlight word in coral (#FF6C5E) | Audit | Key word styled with `color: '#FF6C5E'` |
| 9 | No mint (#90FCA6) used for text or headings | Audit | Zero elements with mint text color |
| 10 | No grey backgrounds (bg-slate-50, bg-gray-100) | Audit | All sections use `bg-white` with brand gradient |
| 11 | Section gradient alternation: MINT -> CORAL | Audit | Adjacent sections alternate gradient colors |
| 12 | No icons in cards or feature lists | Audit | Dots (1.5x1.5 rounded-full) used instead |
| 13 | Eyebrow badges use dark slate bg + white text | Audit | `backgroundColor: '#0f172a'`, `color: '#ffffff'` |
| 14 | Purpose text has coral lead phrase | Audit | `color: '#FF6C5E'`, `fontWeight: 500` |
| 15 | Pricing section shows 3 plans | UI | Starter ($19), Professional ($69), Scale ($199) |
| 16 | "Most Popular" badge on highlighted plan | UI | Dark slate badge above Professional plan |
| 17 | Pricing cards use correct button colors | Audit | Highlighted = mint, others = dark |
| 18 | Shine sweep animation on button hover | UI | `via-white/25` gradient sweep on hover |
| 19 | Trust row uses dots (not icons) | Audit | "No credit card", "5-min setup", "SOC 2 ready" with dots |
| 20 | Integrations wall section | UI | Provider logos/names displayed |
| 21 | Three Pillars section | UI | Cloud, GenAI, SaaS pillars shown |
| 22 | How It Works section (3 steps) | UI | Connect (mint), Analyze (coral), Optimize (mint) |
| 23 | Features grid section | UI | Feature cards without icons |
| 24 | Testimonials section | UI | Customer quotes with alternating mint/coral accents |
| 25 | Final CTA section (dark background) | UI | Dark bg-slate-900 with mint eyebrow badge |
| 26 | Card hover effect matches section gradient | UI | Mint sections = mint hover, coral = coral hover |
| 27 | Section spacing py-16 to py-20 (not py-24) | Audit | Tighter spacing, enterprise look |
| 28 | Headings use text-slate-900 | Audit | All `h1`/`h2`/`h3` in dark slate |
| 29 | Body text uses text-slate-600 | Audit | Description paragraphs in medium slate |
| 30 | Framer Motion scroll animations | UI | Elements fade in on scroll (whileInView) |

## Responsive Tests

### Breakpoint Matrix (8 checks)

| # | Test | Type | Expected |
|---|------|------|----------|
| 1 | Mobile (375px) | Responsive | Single column, stacked layout |
| 2 | Mobile (390px iPhone 14) | Responsive | Hero text readable, CTAs full width |
| 3 | Tablet (768px) | Responsive | 2-column grid where applicable |
| 4 | Desktop (1024px) | Responsive | Full layout with hero 2-column |
| 5 | Large desktop (1440px) | Responsive | Content within max-w-7xl container |
| 6 | Mobile navigation | Responsive | Hamburger menu or mobile nav |
| 7 | Pricing cards stack on mobile | Responsive | Single column card layout |
| 8 | Hero image/illustration scales | Responsive | No overflow or clipping |

## Accessibility Tests

### A11y Matrix (6 checks)

| # | Test | Type | Expected |
|---|------|------|----------|
| 1 | Color contrast meets WCAG 2.1 AA | A11y | 4.5:1 minimum for body text |
| 2 | CTA buttons have accessible names | A11y | Button text readable by screen readers |
| 3 | Heading hierarchy (h1 -> h2 -> h3) | A11y | Proper nesting, single h1 |
| 4 | Focus visible on interactive elements | A11y | Keyboard focus ring visible |
| 5 | Images have alt text | A11y | All `<img>` elements have meaningful alt |
| 6 | Reduced motion respects prefers-reduced-motion | A11y | Framer Motion disabled when preference set |

## Performance Tests

### Performance Matrix (6 checks)

| # | Test | Type | Expected |
|---|------|------|----------|
| 1 | Page size < 500KB (compressed) | Perf | Total transfer size within budget |
| 2 | Largest Contentful Paint (LCP) < 2.5s | Perf | Hero content renders fast |
| 3 | First Input Delay (FID) < 100ms | Perf | Interactive quickly |
| 4 | Cumulative Layout Shift (CLS) < 0.1 | Perf | No layout jumps during load |
| 5 | No render-blocking resources | Perf | Fonts and CSS optimized |
| 6 | Images lazy loaded below fold | Perf | `loading="lazy"` on below-fold images |

## Page Route Tests

### Route Matrix (10 checks)

| # | Test | Type | Expected |
|---|------|------|----------|
| 1 | `/pricing` loads | Nav | Plan comparison page |
| 2 | `/features` loads | Nav | Feature showcase page |
| 3 | `/about` loads | Nav | Company info page |
| 4 | `/contact` loads | Nav | Contact form page |
| 5 | `/demo` loads | Nav | Demo request page |
| 6 | `/docs` loads | Nav | Documentation hub |
| 7 | `/legal/privacy` loads | Nav | Privacy policy |
| 8 | `/legal/terms` loads | Nav | Terms of service |
| 9 | `/compliance` loads | Nav | Compliance page |
| 10 | Navigation links work | Nav | All header/footer links resolve |

## Verification Commands

```bash
# 1. Build frontend (catches compilation errors)
cd 01-fronted-system && npm run build

# 2. Run dev server
cd 01-fronted-system && npm run dev

# 3. Check for grey backgrounds in home page
grep -n "bg-slate-50\|bg-gray-100\|bg-neutral-100\|bg-slate-100" \
  01-fronted-system/app/\(landingPages\)/page.tsx

# 4. Check for mint text (forbidden)
grep -n "text-\[#90FCA6\]" \
  01-fronted-system/app/\(landingPages\)/page.tsx

# 5. Check for icons in cards (forbidden)
grep -n "CheckCircle\|CheckIcon\|StarIcon" \
  01-fronted-system/app/\(landingPages\)/page.tsx

# 6. Verify inline styles for buttons
grep -n "style={{" \
  01-fronted-system/app/\(landingPages\)/page.tsx | head -20

# 7. Check gradient alternation pattern
grep -n "rgba(" \
  01-fronted-system/app/\(landingPages\)/page.tsx | head -20

# 8. Check section spacing (should be py-12 to py-20, not py-24)
grep -n "py-24" \
  01-fronted-system/app/\(landingPages\)/page.tsx

# 9. Verify pricing plans
grep -n "\$19\|\$69\|\$199" \
  01-fronted-system/app/\(landingPages\)/page.tsx \
  01-fronted-system/app/\(landingPages\)/pricing/page.tsx

# 10. Run Lighthouse audit (requires Chrome)
# npx lighthouse http://localhost:3000 --output=json --output-path=./lighthouse-report.json

# 11. Check page file sizes
ls -la 01-fronted-system/app/\(landingPages\)/page.tsx
ls -la 01-fronted-system/app/\(landingPages\)/layout.tsx
ls -la 01-fronted-system/app/\(landingPages\)/landing.css

# 12. Verify PublicLayout wrapper
grep -n "PublicLayout\|landingPages" \
  01-fronted-system/app/\(landingPages\)/layout.tsx | head -10
```

## Manual Verification Checklist

| Check | How | Expected |
|-------|-----|----------|
| Visual gradient alternation | Scroll through page | MINT -> CORAL -> MINT -> CORAL rhythm |
| Button text visibility | Check all CTA buttons | Text visible (not transparent/invisible) |
| Shine effect on hover | Hover over primary CTA | White gradient sweep animation |
| No icons in cards | Inspect feature cards | Dots only, no Lucide/icon components |
| Mobile layout | Resize to 375px | Clean stacking, no overflow |
| Pricing card highlight | Check Professional plan | Mint border glow, "Most Popular" badge |
| Dark CTA section | Scroll to bottom CTA | Dark background with mint eyebrow |
| Hero coral highlight | Check hero heading | Action word in coral color |
| Google badge preserved | Check hero section | Google Cloud logo + text badge |
| Cross-page navigation | Click nav links | All pages load without 404 |

## Pass Criteria

| Criteria | Target |
|----------|--------|
| UI design tests | 28/30 (93%+, 2 may be warnings for animation timing) |
| Responsive tests | 8/8 (100%) |
| Accessibility tests | 5/6 (83%+, reduced motion may be aspirational) |
| Performance tests | 5/6 (83%+, LCP depends on hosting) |
| Route tests | 10/10 (100%) |
| Grey backgrounds found | 0 |
| Mint text in headings | 0 |
| Icons in cards | 0 |
| Buttons without inline styles | 0 |
| Build errors | 0 |

## Known Limitations

1. **Animation testing**: Framer Motion `whileInView` animations may not trigger in headless browser mode -- visual verification required
2. **Lighthouse scores**: Performance metrics (LCP, FID, CLS) vary by network and hosting environment -- test in production-like conditions
3. **CSS override issue**: `landing.css` and `globals.css` can override Tailwind classes -- this is why inline styles are mandatory for buttons
4. **Image optimization**: Next.js Image component optimization depends on deployment config -- local dev may show different performance
5. **Reduced motion**: `prefers-reduced-motion` support depends on Framer Motion configuration -- may not be fully implemented
6. **Page size**: Home page is 33KB source -- compressed transfer size depends on Next.js build optimization
7. **Font loading**: DM Sans font loading may cause brief FOUT (Flash of Unstyled Text) on first visit
8. **Premium CSS**: `premium.css` effects may not render in all browsers -- test in Chrome, Firefox, Safari
