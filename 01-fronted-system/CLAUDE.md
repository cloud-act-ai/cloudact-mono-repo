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
| Quota status | 8000 | `X-API-Key` |
| Integration setup | 8000 | `X-API-Key` |
| Pipeline execution | 8001 | `X-API-Key` |
| Subscription CRUD | 8000 | `X-API-Key` |

## Route Groups

**`app/(landingPages)/`** - Public: `/`, `/features`, `/pricing`
**`app/[orgSlug]/`** - Console: `dashboard/`, `analytics/`, `settings/`

## Quota Warning Banner

**Component:** `components/quota-warning-banner.tsx`

| Usage | Level | Color |
|-------|-------|-------|
| 80% | Warning | Yellow |
| 90% | Critical | Orange |
| 100% | Exceeded | Red |

**Actions:** `actions/quota.ts` → `getQuotaUsage(orgSlug)`

## Key Directories

```
actions/                  # Server actions
├─ backend-onboarding.ts  # API key management
├─ integrations.ts        # LLM/Cloud setup
├─ pipelines.ts          # Pipeline execution
├─ subscription-providers.ts # SaaS CRUD
├─ quota.ts              # Quota status
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

## Design System

**Brand Colors:**
- **Mint** `#90FCA6` - Primary buttons, success
- **Coral** `#FF6C5E` - Warnings, costs, alerts
- **Obsidian** `#0a0a0b` - Dark buttons (auth)

**Layout:** Apple Health pattern, `max-w-7xl`, 8px grid

## Environment

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

## Supabase Migrations

**Script:** `scripts/supabase_db/migrate.sh`

Uses Supabase Management API (not psql) - requires `SUPABASE_ACCESS_TOKEN` in env files.

### Quick Commands

```bash
cd 01-fronted-system/scripts/supabase_db

# Check status
./migrate.sh --status              # Local
./migrate.sh --status --stage      # Stage
./migrate.sh --status --prod       # Production

# Run migrations
./migrate.sh                       # Local (default)
./migrate.sh --stage               # Stage (confirms)
./migrate.sh --prod                # Production (confirms)
./migrate.sh --yes --prod          # Production (skip confirm)

# Dry run (see what would run)
./migrate.sh --dry-run --prod

# Force re-run specific migration
./migrate.sh --force 37 --prod     # Re-run 37_*.sql
```

### Project References

| Environment | Supabase Project | Env File |
|-------------|------------------|----------|
| local | `kwroaccbrxppfiysqlzs` | `.env.local` |
| stage | `kwroaccbrxppfiysqlzs` | `.env.stage` |
| prod | `ovfxswhkkshouhsryzaf` | `.env.prod` |

### Required Env Variable

```bash
# Same token works for all environments (personal access token)
SUPABASE_ACCESS_TOKEN=sbp_xxx...
```

Get token from: https://supabase.com/dashboard/account/tokens

### Migration Files

Location: `scripts/supabase_db/[0-9][0-9]_*.sql`

Tracked in: `schema_migrations` table

## Troubleshooting

| Issue | Solution |
|-------|----------|
| Signup 400 | Disable Supabase email confirmation |
| Stripe fails | Check STRIPE_SECRET_KEY |
| Plans not loading | Verify LIVE price IDs |
| Quota exceeded | Check `GET /api/v1/organizations/{org}/quota` |
| Migration auth fails | Check `SUPABASE_ACCESS_TOKEN` in env file |

---
**v4.1.1** | 2026-01-15
