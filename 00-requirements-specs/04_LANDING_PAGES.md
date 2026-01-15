# Landing Pages

**v1.0** | 2026-01-15

> Public marketing pages

---

## Routes

| Route | Purpose |
|-------|---------|
| `/` | Home |
| `/pricing` | Plan comparison |
| `/features` | Feature showcase |
| `/about` | Company info |
| `/contact` | Contact form |
| `/legal/privacy` | Privacy policy |
| `/legal/terms` | Terms of service |

---

## Layout

```
app/(landingPages)/
├─ layout.tsx         # PublicLayout wrapper
├─ page.tsx          # Home
├─ pricing/page.tsx
├─ features/page.tsx
└─ legal/
```

---

## Key Files

| File | Purpose |
|------|---------|
| `app/(landingPages)/` | Page components |
| `components/landing/` | Landing components |
