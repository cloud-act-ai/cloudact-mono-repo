# Landing Pages

**v1.1** | 2026-02-05

> Public marketing pages for CloudAct

---

## Page Workflow

```
User visits cloudact.ai → PublicLayout wrapper → Landing page content
                        → /pricing → Plan comparison → Signup CTA
                        → /signup → Stripe Checkout → Console dashboard
```

---

## Routes

| Route | Purpose |
|-------|---------|
| `/` | Home — hero, features, social proof |
| `/pricing` | Plan comparison (Starter/Professional/Scale) |
| `/features` | Feature showcase |
| `/about` | Company info |
| `/contact` | Contact form |
| `/legal/privacy` | Privacy policy |
| `/legal/terms` | Terms of service |

---

## Layout Structure

```
app/(landingPages)/
├─ layout.tsx         # PublicLayout wrapper (header + footer)
├─ page.tsx          # Home
├─ pricing/page.tsx
├─ features/page.tsx
├─ about/page.tsx
├─ contact/page.tsx
└─ legal/
   ├─ privacy/page.tsx
   └─ terms/page.tsx
```

---

## Design Standards

- Enterprise-grade, Apple Health design pattern
- No icons — text-first approach
- Mint for features, Coral for costs
- See `00_CONSOLE_UI_DESIGN_STANDARDS.md` for full color/typography specs

---

## Key Files

| File | Purpose |
|------|---------|
| `app/(landingPages)/` | Page components |
| `components/landing/` | Shared landing components |
