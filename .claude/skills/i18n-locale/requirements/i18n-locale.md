# i18n & Locale - Requirements

## Overview

Org-level internationalization: multi-currency (20), timezones (15), date formats (6), fiscal year (4), language (10 defined, English active). Exchange rate conversion with audit trail. BigQuery-first sync strategy.

## Source Specifications

- `01-fronted-system/lib/i18n/` - Constants, formatters, barrel export
- `01-fronted-system/lib/currency/exchange-rates.ts` - Conversion engine
- `02-api-service/src/app/models/i18n_models.py` - API models
- `02-api-service/src/app/routers/organizations.py` - Locale endpoints

## Architecture

```
Frontend (Settings Page)             API (8000)                BigQuery
─────────────────────               ──────────               ────────
Organization Settings                PUT /org/{o}/locale       org_profiles
├─ Currency: 20 options              GET /org/{o}/locale       ├─ default_currency
├─ Timezone: 15 options                     │                  ├─ default_timezone
├─ Date Format: 6 options                   ▼                  ├─ default_country
├─ Fiscal Year: 4 options           Supabase (organizations)   ├─ default_language
└─ Auto-suggest logic               ├─ Sync: BQ → Supabase    └─ fiscal_year_start_month
                                    └─ Validation + repair
lib/i18n/ (Display Layer)
├─ formatCurrency(amount, code)     lib/currency/ (Conversion)
├─ formatDateTime(date, tz)         ├─ exchange-rates.csv (seed)
├─ formatDateOnly(date)             ├─ convertCurrency() (sync, hardcoded)
└─ formatRelativeTime(date)         ├─ convertCurrencyAsync() (CSV-based)
                                    └─ convertWithAudit() (audit trail)
```

## Functional Requirements

### FR-IL-001: Currency Support

| ID | Requirement |
|----|-------------|
| FR-IL-001.1 | Support 20 currencies with correct symbols, decimal places, and display formatting |
| FR-IL-001.2 | Currencies with 3 decimals (KWD, BHD, OMR) must format correctly |
| FR-IL-001.3 | Currencies with 0 decimals (JPY, KRW) must not show decimal point |
| FR-IL-001.4 | `getCurrencyInfo(code)` returns symbol, decimals, country for any supported currency |
| FR-IL-001.5 | `formatCurrency(amount, code, locale)` uses `Intl.NumberFormat` with correct options |

### FR-IL-002: Currency Conversion

| ID | Requirement |
|----|-------------|
| FR-IL-002.1 | Sync conversion via hardcoded rates (fallback) |
| FR-IL-002.2 | Async conversion via CSV-based rates (preferred) |
| FR-IL-002.3 | `convertWithAudit()` returns amount, rate, source, timestamp, success |
| FR-IL-002.4 | Exchange rates loaded from `data/seed/exchange-rates.csv` with 24h TTL cache |
| FR-IL-002.5 | Staleness check warns if rates >30 days old |
| FR-IL-002.6 | All costs stored in original currency, converted at display/aggregation time |

### FR-IL-003: Timezone Support

| ID | Requirement |
|----|-------------|
| FR-IL-003.1 | Support 15 IANA timezones |
| FR-IL-003.2 | `formatDateTime(date, tz)` uses `Intl.DateTimeFormat` with timezone |
| FR-IL-003.3 | `formatDateOnly(date)` formats BigQuery DATE fields as timezone-agnostic |
| FR-IL-003.4 | `formatRelativeTime(date)` returns human-readable relative strings |

### FR-IL-004: Date Format Support

| ID | Requirement |
|----|-------------|
| FR-IL-004.1 | Support 6 date formats (MM/DD/YYYY, DD/MM/YYYY, YYYY-MM-DD, DD-MMM-YYYY, MMM DD YYYY, DD MMM YYYY) |
| FR-IL-004.2 | Org-level date format stored in Supabase + BigQuery |
| FR-IL-004.3 | All date displays respect org's chosen format |

### FR-IL-005: Fiscal Year

| ID | Requirement |
|----|-------------|
| FR-IL-005.1 | Support 4 fiscal year start months (January, April, July, October) |
| FR-IL-005.2 | Auto-suggest fiscal year from timezone via `getFiscalYearFromTimezone()` |
| FR-IL-005.3 | Auto-suggest fiscal year from country via `getFiscalYearFromCountry()` |
| FR-IL-005.4 | Fiscal year affects YTD calculations and period comparisons |

### FR-IL-006: Locale Persistence

| ID | Requirement |
|----|-------------|
| FR-IL-006.1 | Org locale stored in Supabase `organizations` table |
| FR-IL-006.2 | Org locale synced to BigQuery `org_profiles` table |
| FR-IL-006.3 | BigQuery-first sync strategy: write BQ first, then Supabase |
| FR-IL-006.4 | `validateLocaleSync(orgSlug)` detects Supabase/BQ mismatch |
| FR-IL-006.5 | `repairLocaleSync(orgSlug)` copies Supabase → BigQuery to fix sync |

### FR-IL-007: API Endpoints

| ID | Requirement |
|----|-------------|
| FR-IL-007.1 | `GET /organizations/{org}/locale` returns current locale settings |
| FR-IL-007.2 | `PUT /organizations/{org}/locale` updates currency, timezone, country, language |
| FR-IL-007.3 | Validation: reject unsupported currencies/timezones |
| FR-IL-007.4 | Atomic save: update BigQuery + Supabase in single operation |

### FR-IL-008: Language (Future)

| ID | Requirement |
|----|-------------|
| FR-IL-008.1 | 10 languages defined (en, ar, de, fr, ja, zh, hi, es, pt, ko) |
| FR-IL-008.2 | RTL support for Arabic |
| FR-IL-008.3 | Currently English only — UI strings not extracted |

## Non-Functional Requirements

| ID | Requirement |
|----|-------------|
| NFR-IL-001 | Exchange rate cache TTL: 24 hours |
| NFR-IL-002 | Staleness warning threshold: 30 days |
| NFR-IL-003 | Currency formatting <1ms (sync, no I/O) |
| NFR-IL-004 | Locale sync must be atomic (no partial updates) |
| NFR-IL-005 | All formatters handle null/undefined gracefully (return safe defaults) |

## SDLC

### Development Workflow

1. Modify formatters in `lib/i18n/formatters.ts`
2. Run unit tests: `npx jest tests/i18n/formatters.test.ts`
3. Test in settings page: change currency/timezone, verify display
4. Verify Supabase + BQ sync via `validateLocaleSync()`

### Testing Approach

- **Unit:** Formatter tests for all currencies, timezones, edge cases
- **Integration:** API locale endpoint round-trip (GET → PUT → GET)
- **E2E:** Settings page → change currency → verify dashboard displays new symbol

### Key Files

| File | Purpose |
|------|---------|
| `01-fronted-system/lib/i18n/constants.ts` | Currencies, timezones, languages, date formats |
| `01-fronted-system/lib/i18n/formatters.ts` | Format functions |
| `01-fronted-system/lib/currency/exchange-rates.ts` | Conversion engine |
| `01-fronted-system/actions/organization-locale.ts` | Server actions |
| `01-fronted-system/app/[orgSlug]/settings/organization/page.tsx` | Settings UI |
| `02-api-service/src/app/models/i18n_models.py` | API models |
| `01-fronted-system/tests/i18n/formatters.test.ts` | Unit tests |

## Related Skills

`/cost-analysis` `/cost-analytics` `/frontend-dev` `/api-dev` `/bigquery-ops`
