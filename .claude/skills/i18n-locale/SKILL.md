---
name: i18n-locale
description: |
  Internationalization and locale management for CloudAct. Multi-currency, timezones, date formats, fiscal year.
  Use when: configuring org locale settings, formatting currency amounts, handling timezone-aware dates,
  setting up fiscal year, debugging currency conversion, exchange rates, or locale sync issues.
---

# /i18n-locale - Internationalization & Locale Management

Manage org-level locale: currency, timezone, date format, fiscal year, and currency conversion.

## Trigger

```
/i18n-locale                            # Overview of locale features
/i18n-locale currencies                 # List supported currencies
/i18n-locale exchange-rates             # Check exchange rate status
/i18n-locale debug <org>                # Debug locale sync issues
```

## Architecture

```
Frontend (Settings Page)              API Service (8000)              BigQuery
─────────────────────                ─────────────────               ────────
Settings → Organization Page          PUT /organizations/{org}/locale  org_profiles
├─ Currency selector (20)             GET /organizations/{org}/locale  ├─ default_currency
├─ Timezone selector (15)                    │                         ├─ default_timezone
├─ Date format selector (6)                  ▼                         ├─ default_country
├─ Fiscal year selector (4)           Supabase (organizations)         ├─ default_language
└─ Auto-suggest fiscal year           ├─ default_currency              └─ fiscal_year_start_month
                                      ├─ default_timezone
lib/i18n/ (Formatters)                ├─ default_country              Pipeline Service (8001)
├─ formatCurrency()                   ├─ default_language             ├─ currency_service.py
├─ formatDateTime()                   ├─ fiscal_year_start_month      └─ Convert at aggregation time
├─ formatDate()                       └─ date_format
└─ formatRelativeTime()
                                      lib/currency/ (Exchange Rates)
                                      ├─ exchange-rates.csv (seed)
                                      ├─ convertCurrency() (sync)
                                      ├─ convertCurrencyAsync() (CSV)
                                      └─ convertWithAudit() (audit trail)
```

## Environments

| Environment | Supabase | BigQuery | Exchange Rate Source |
|-------------|----------|----------|---------------------|
| local | kwroaccbrxppfiysqlzs | cloudact-testing-1 | `data/seed/exchange-rates.csv` |
| stage | kwroaccbrxppfiysqlzs | cloudact-testing-1 | `data/seed/exchange-rates.csv` |
| prod | ovfxswhkkshouhsryzaf | cloudact-prod | `data/seed/exchange-rates.csv` |

**Note:** Exchange rates are CSV-based (not live API). Last updated: 2026-01-29. Staleness threshold: 30 days.

## Key Locations

| Type | Path |
|------|------|
| i18n Constants | `01-fronted-system/lib/i18n/constants.ts` |
| i18n Formatters | `01-fronted-system/lib/i18n/formatters.ts` |
| i18n Index | `01-fronted-system/lib/i18n/index.ts` |
| Exchange Rates | `01-fronted-system/lib/currency/exchange-rates.ts` |
| Exchange Rate CSV | `01-fronted-system/data/seed/exchange-rates.csv` |
| Server Actions | `01-fronted-system/actions/organization-locale.ts` |
| Settings Page | `01-fronted-system/app/[orgSlug]/settings/organization/page.tsx` |
| API i18n Models | `02-api-service/src/app/models/i18n_models.py` |
| API Locale Endpoints | `02-api-service/src/app/routers/organizations.py` |
| Pipeline Currency | `03-data-pipeline-service/src/core/services/currency_service.py` |
| Formatter Tests | `01-fronted-system/tests/i18n/formatters.test.ts` |

## Supported Currencies (20)

| Currency | Symbol | Decimals | Country |
|----------|--------|----------|---------|
| USD | $ | 2 | US |
| EUR | EUR | 2 | EU |
| GBP | £ | 2 | GB |
| JPY | ¥ | 0 | JP |
| CHF | CHF | 2 | CH |
| CAD | C$ | 2 | CA |
| AUD | A$ | 2 | AU |
| CNY | ¥ | 2 | CN |
| INR | ₹ | 2 | IN |
| SGD | S$ | 2 | SG |
| AED | د.إ | 2 | AE |
| SAR | ﷼ | 2 | SA |
| QAR | ﷼ | 2 | QA |
| KWD | د.ك | 3 | KW |
| BHD | .د.ب | 3 | BH |
| OMR | ﷼ | 3 | OM |
| HKD | HK$ | 2 | HK |
| NZD | NZ$ | 2 | NZ |
| SEK | kr | 2 | SE |
| KRW | ₩ | 0 | KR |

## Supported Timezones (16)

UTC, America/New_York, America/Chicago, America/Denver, America/Los_Angeles, Europe/London, Europe/Berlin, Europe/Paris, Asia/Dubai, Asia/Riyadh, Asia/Kolkata, Asia/Singapore, Asia/Tokyo, Asia/Shanghai, Australia/Sydney, Pacific/Auckland

## Date Formats (6)

| Format | Example | Region |
|--------|---------|--------|
| MM/DD/YYYY | 01/15/2026 | US |
| DD/MM/YYYY | 15/01/2026 | International |
| YYYY-MM-DD | 2026-01-15 | ISO 8601 |
| DD-MMM-YYYY | 15-Jan-2026 | UK |
| MMM DD, YYYY | Jan 15, 2026 | US formal |
| DD MMM YYYY | 15 Jan 2026 | International formal |

## Fiscal Year Options (4)

| Start Month | Countries |
|-------------|-----------|
| January | US, CN, AE, SA, QA, KW, BH, OM, SG, CH, DE, FR |
| April | IN, JP, GB, CA |
| July | AU |
| October | US Federal Government |

**Auto-suggest:** When timezone changes, fiscal year is auto-suggested based on `getFiscalYearFromTimezone()`.

## Procedures

### View Org Locale

```bash
# API
curl -s "http://localhost:8000/api/v1/organizations/{org}/locale" \
  -H "X-API-Key: {org_api_key}" | python3 -m json.tool

# Supabase direct
curl -s "https://{supabase_url}/rest/v1/organizations?select=default_currency,default_timezone,default_country,default_language,fiscal_year_start_month,date_format&org_slug=eq.{org}" \
  -H "apikey: {anon_key}" -H "Authorization: Bearer {service_role_key}"
```

### Update Org Locale

```bash
curl -X PUT "http://localhost:8000/api/v1/organizations/{org}/locale" \
  -H "X-API-Key: {org_api_key}" \
  -H "Content-Type: application/json" \
  -d '{
    "currency": "EUR",
    "timezone": "Europe/Berlin",
    "country": "DE",
    "language": "en"
  }'
```

### Check Exchange Rate Staleness

```bash
# Frontend utility
# In browser console:
import { checkExchangeRateStaleness } from '@/lib/currency/exchange-rates'
const result = checkExchangeRateStaleness()
// { stale: false, lastUpdated: "2026-01-29", daysSinceUpdate: 14 }
```

### Validate Locale Sync (Supabase <-> BigQuery)

```bash
# Server action: validateLocaleSync(orgSlug)
# If mismatch: repairLocaleSync(orgSlug) copies Supabase → BigQuery
```

### Currency Conversion

```typescript
// Sync (hardcoded rates - fallback)
import { convertCurrency } from '@/lib/currency/exchange-rates'
convertCurrency(100, 'USD', 'EUR')  // ~92.50

// Async (CSV rates - preferred)
import { convertCurrencyAsync } from '@/lib/currency/exchange-rates'
await convertCurrencyAsync(100, 'USD', 'EUR')  // ~92.50

// With audit trail
import { convertWithAudit } from '@/lib/currency/exchange-rates'
const result = await convertWithAudit(100, 'USD', 'EUR')
// { amount: 92.50, rate: 0.925, source: 'csv', timestamp: '...', success: true }
```

## Currency Conversion Strategy

```
Pipeline (8001)                  BigQuery                    Frontend (3000)
─────────────                   ────────                    ──────────────
Store in ORIGINAL currency  →   cost_data_standard_1_3  →   Convert to org's
(BilledCost, EffectiveCost)     (all costs in USD/EUR/etc)  default_currency at
                                                             display time
```

**Key rule:** Costs stored in original currency. Converted to org's `default_currency` at display/aggregation time.

## Language Support (Future)

| Language | Code | RTL | Status |
|----------|------|-----|--------|
| English | en | No | Active |
| Arabic | ar | Yes | Placeholder |
| German | de | No | Placeholder |
| French | fr | No | Placeholder |
| Japanese | ja | No | Placeholder |
| Chinese | zh | No | Placeholder |
| Hindi | hi | No | Placeholder |
| Spanish | es | No | Placeholder |
| Portuguese | pt | No | Placeholder |
| Korean | ko | No | Placeholder |

**Current:** English only. UI strings not yet extracted to language files.

## Troubleshooting

| Issue | Cause | Fix |
|-------|-------|-----|
| Currency shows $ for all orgs | Org locale not set | `PUT /organizations/{org}/locale` with correct currency |
| Locale mismatch Supabase vs BQ | Sync failed | Run `repairLocaleSync(orgSlug)` server action |
| Exchange rates stale warning | CSV >30 days old | Update `data/seed/exchange-rates.csv` |
| Fiscal year wrong | Auto-suggest picked wrong default | Manually set via settings page |
| Date format mismatch | Using `formatDateTime` for BQ DATE fields | Use `formatDateOnly()` for timezone-agnostic dates |
| 3-decimal currencies wrong | KWD/BHD/OMR use 3 decimals | Check `getCurrencyDecimals()` returns 3 |
| Currency conversion audit trail missing | Using sync `convertCurrency()` | Switch to `convertWithAudit()` |

## Testing

### Unit Tests

```bash
cd 01-fronted-system

# Run formatter tests
npx jest tests/i18n/formatters.test.ts

# Expected: Currency formatting, date formatting, number formatting, exchange rates
```

### Integration Tests

```bash
# Test locale API endpoints
curl -s "http://localhost:8000/api/v1/organizations/{org}/locale" \
  -H "X-API-Key: {key}" | python3 -m json.tool
# Expected: { currency, timezone, country, language, fiscal_year_start_month, date_format }

# Test locale update
curl -X PUT "http://localhost:8000/api/v1/organizations/{org}/locale" \
  -H "X-API-Key: {key}" -H "Content-Type: application/json" \
  -d '{"currency": "EUR", "timezone": "Europe/Berlin"}'
# Expected: 200 OK with updated locale

# Verify sync
curl -s "https://{supabase_url}/rest/v1/organizations?select=default_currency&org_slug=eq.{org}" \
  -H "apikey: {anon_key}" -H "Authorization: Bearer {service_role_key}"
# Expected: default_currency = "EUR"
```

### Multi-Environment

```bash
# Stage
curl -s "https://cloudact-api-service-test-*.a.run.app/api/v1/organizations/{org}/locale" \
  -H "X-API-Key: {key}"

# Prod
curl -s "https://api.cloudact.ai/api/v1/organizations/{org}/locale" \
  -H "X-API-Key: {key}"
```

## Known Issues (2026-02-14 Audit)

| Issue | Severity | Description |
|-------|----------|-------------|
| Multi-currency aggregation | CRITICAL | `cost_read/aggregations.py` sums costs without conversion (CURR-001). Warning logged but amounts not converted. |
| Fiscal year BQ sync gap | CRITICAL | `fiscal_year_start_month` stored in Supabase only, not synced to BigQuery `org_profiles`. Backend defaults to January. |
| Hardcoded `en-US` dates | MEDIUM | `date-ranges.ts`, `dashboard-calculators.ts` hardcode `"en-US"` locale in `toLocaleDateString()` calls. |
| `formatPercent` confusion | MEDIUM | `lib/i18n/formatters.ts` expects 0-1 range; `lib/costs/formatters.ts` expects 0-100 range. Two functions with same name. |
| Date format not applied | LOW | `date_format` setting (6 formats) collected via settings but `formatDate()` uses `Intl.DateTimeFormat` dateStyle instead. |

## 5 Implementation Pillars

| Pillar | How i18n Locale Handles It |
|--------|-------------------------------|
| **i18n** | THIS IS the i18n skill: 20 currencies, 16 timezones, 6 date formats, 4 fiscal year options, exchange rate CSV, `formatCost()` / `formatDateTime()` formatters |
| **Enterprise** | Exchange rate audit trail via `convertWithAudit()`; staleness detection (30-day threshold); locale sync validation between Supabase and BigQuery |
| **Cross-Service** | Locale stored in Supabase (frontend reads), synced to BigQuery `org_profiles` (backend reads); API endpoints for locale CRUD; Pipeline converts currencies at aggregation |
| **Multi-Tenancy** | Each org has independent locale settings; `org_slug` scoping on all locale API endpoints; no cross-org locale leakage |
| **Reusability** | Shared formatters in `lib/i18n/` and `lib/currency/`; `SUPPORTED_CURRENCIES` constant; `getFiscalYearFromTimezone()` auto-suggest; server actions for locale CRUD |

## Related Skills

| Skill | Relationship |
|-------|-------------|
| `/cost-analysis` | Uses currency formatters for cost display |
| `/cost-analytics` | Currency conversion at aggregation time |
| `/frontend-dev` | Settings page UI components |
| `/api-dev` | Locale API endpoints |
| `/bigquery-ops` | `org_profiles` table stores locale in BQ |

## Source Specifications

Requirements consolidated from:
- `01-fronted-system/lib/i18n/` - Frontend i18n library
- `01-fronted-system/lib/currency/` - Exchange rate system
- `01-fronted-system/actions/organization-locale.ts` - Server actions
- `02-api-service/src/app/models/i18n_models.py` - API models
