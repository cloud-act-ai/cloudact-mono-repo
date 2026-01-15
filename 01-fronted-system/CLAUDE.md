# Frontend (Port 3000)

Next.js 16 + Supabase Auth + Stripe. Connects to api-service (8000) and pipeline-service (8001).

## CRITICAL: proxy.ts NOT middleware.ts

```
Next.js 16 uses proxy.ts - DO NOT create middleware.ts
Route protection: ./proxy.ts
Session refresh: ./lib/supabase/middleware.ts (utility, NOT route)
```

## Production Requirements

1. **NO MOCKS** - Production-ready code only
2. **VERIFY FIRST** - Read files before referencing
3. **ENV FILES** - Use `.env.local` (never `.env`)

## Development

```bash
cd 01-fronted-system
npm run dev     # Starts + auto-migrations
npm run build   # Production build
npx vitest      # Tests
```

## User Flow

```
/signup → /onboarding/billing → Stripe → /onboarding/success → /{orgSlug}/dashboard
```

## Service Integration

| Operation | Port | Header |
|-----------|------|--------|
| Bootstrap, Onboarding | 8000 | `X-CA-Root-Key` |
| Integration setup | 8001 | `X-API-Key` |
| Pipeline execution | 8001 | `X-API-Key` |
| Subscription CRUD | 8000 | `X-API-Key` |

## Route Groups

**`app/(landingPages)/`** - Public: `/`, `/features`, `/pricing`
**`app/[orgSlug]/`** - Console: `dashboard/`, `analytics/`, `settings/`

## Key Directories

```
actions/                  # Server actions
├─ backend-onboarding.ts  # API key management
├─ integrations.ts        # LLM/Cloud setup
├─ pipelines.ts          # Pipeline execution
├─ subscription-providers.ts # SaaS CRUD
└─ stripe.ts             # Checkout

lib/
├─ api/backend.ts        # Backend API client
├─ auth.ts              # Auth guards
└─ i18n/                # Currency, timezone
```

## Auth Guards

```typescript
await requireAuth()
await requireOrgMembership(orgSlug)
await requireActiveSubscription(orgSlug)
```

## i18n

**16 Currencies:** USD, EUR, GBP, INR, JPY, CNY, AUD, CAD, SGD, AED...

```typescript
formatCurrency(100, "INR")  // "₹100.00"
convertFromUSD(25, "INR")   // 2078.00
```

## Design System

**Brand Colors:**
- **Mint** `#90FCA6` - Primary buttons, success
- **Coral** `#FF6C5E` - Warnings, destructive
- **Obsidian** `#0a0a0b` - Dark buttons (auth)

**Layout:** Apple Health pattern, `max-w-7xl`, 8px grid

**Buttons:**
- `.cloudact-btn-primary` - Mint (console CTAs)
- `.cloudact-btn-dark` - Obsidian (auth flows)
- `.cloudact-btn-destructive` - Coral (delete)

## Environment

```bash
# .env.local
NEXT_PUBLIC_SUPABASE_URL=https://kwroaccbrxppfiysqlzs.supabase.co
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=pk_test_...
NEXT_PUBLIC_API_SERVICE_URL=http://localhost:8000
```

| Environment | Supabase | Stripe |
|-------------|----------|--------|
| local/test/stage | `kwroaccbrxppfiysqlzs` | TEST keys |
| prod | `ovfxswhkkshouhsryzaf` | LIVE keys |

## Production Stripe

| Plan | Price ID | Monthly |
|------|----------|---------|
| Starter | `price_1SWJMfDoxINmrJKY7tOoJUIs` | $19 |
| Professional | `price_1SWJOYDoxINmrJKY8jEZwVuU` | $69 |
| Scale | `price_1SWJP8DoxINmrJKYfg0jmeLv` | $199 |

## Hierarchy

```
Org → Department → Project → Team

Frontend: app/[orgSlug]/settings/hierarchy/page.tsx
Actions: actions/hierarchy.ts
```

**Subscription Integration:** Each plan links to hierarchy via `hierarchy_entity_id`, `hierarchy_path`

## Troubleshooting

| Issue | Solution |
|-------|----------|
| Signup 400 | Disable Supabase email confirmation |
| Stripe fails | Check STRIPE_SECRET_KEY |
| Plans not loading | Verify LIVE price IDs |

---
**v4.1.0** | 2026-01-15
