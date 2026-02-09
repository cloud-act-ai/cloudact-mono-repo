# Landing Pages

**v1.2** | 2026-02-08

> Public marketing pages for CloudAct (32 pages)

---

## Page Workflow

```
User visits cloudact.ai → PublicLayout wrapper (layout.tsx + landing.css)
                        → Landing page content
                        → /pricing → Plan comparison → Signup CTA
                        → /signup → Stripe Checkout → Console dashboard
```

---

## Routes (32 Pages)

### Core Pages

| Route | Purpose |
|-------|---------|
| `/` | Home -- hero, features, social proof (33KB, feature-rich) |
| `/pricing` | Plan comparison (Starter/Professional/Scale) |
| `/features` | Feature showcase |
| `/about` | Company info |
| `/contact` | Contact form |
| `/demo` | Product demo / request demo |

### Documentation

| Route | Purpose |
|-------|---------|
| `/docs` | Documentation hub |
| `/docs/*` | Sub-pages for specific documentation topics |

### Legal

| Route | Purpose |
|-------|---------|
| `/legal/privacy` | Privacy policy |
| `/legal/terms` | Terms of service |
| `/compliance` | Compliance information |
| `/cookies` | Cookie policy |

### Company

| Route | Purpose |
|-------|---------|
| `/careers` | Job listings |
| `/investors` | Investor information |
| `/community` | Community hub |

### Resources

| Route | Purpose |
|-------|---------|
| `/help` | Help center |
| `/learning-paths` | Educational content / guides |
| `/integrations` | Public integrations showcase |

---

## Layout Structure

```
app/(landingPages)/
├─ layout.tsx              # PublicLayout wrapper (21KB, header + footer)
├─ landing.css             # Custom landing styles (22KB)
├─ _components/            # Shared landing components
├─ page.tsx                # Home (33KB)
├─ pricing/page.tsx
├─ features/page.tsx
├─ about/page.tsx
├─ contact/page.tsx
├─ demo/page.tsx
├─ docs/
│  └─ page.tsx + sub-pages
├─ legal/
│  ├─ privacy/page.tsx
│  └─ terms/page.tsx
├─ compliance/page.tsx
├─ cookies/page.tsx
├─ careers/page.tsx
├─ investors/page.tsx
├─ community/page.tsx
├─ help/page.tsx
├─ learning-paths/page.tsx
└─ integrations/page.tsx
```

---

## Design Standards

- Enterprise-grade, Apple Health design pattern
- No icons -- text-first approach
- Brand: Mint (#90FCA6) primary, Coral (#FF6C5E) accent
- Mint for features, Coral for costs
- See `00_CONSOLE_UI_DESIGN_STANDARDS.md` for full color/typography specs

---

## Key Files

| File | Purpose | Size |
|------|---------|------|
| `app/(landingPages)/layout.tsx` | PublicLayout (header + footer) | 21KB |
| `app/(landingPages)/landing.css` | Custom landing styles | 22KB |
| `app/(landingPages)/page.tsx` | Home page | 33KB |
| `app/(landingPages)/_components/` | Shared landing components | -- |
