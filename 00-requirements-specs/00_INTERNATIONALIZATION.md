# Internationalization

**v13.0** | 2026-02-08

> Org-level i18n (currency, timezone, country, fiscal year).

---

## Workflow

```
Signup → Select Currency + Timezone → Stored on org record
      → FX rates fetched (USD base) → Templates converted to org currency
      → All cost data displayed in org currency
      → Fiscal year configured in org_profiles
```

---

## Core Attributes

| Attribute | Standard | Selectable | Notes |
|-----------|----------|------------|-------|
| Currency | ISO 4217 | Yes (signup) | Determines display + FX conversion |
| Timezone | IANA | Yes (signup) | Affects date boundaries, cron schedules |
| Country | ISO 3166-1 | Auto (from currency) | Derived, not user-selected |
| Language | BCP 47 | Fixed (`en`) | English only (20+ languages in model, UI English-only) |
| Fiscal Year | Month number | Yes (settings) | Start month for fiscal year calculations |

---

## Supported Currencies (50+)

Defined in `SupportedCurrency` enum in `i18n_models.py`.

**Major:** USD, EUR, GBP, JPY, CHF, CAD, AUD, CNY, INR, SGD, HKD, NZD, SEK, NOK, DKK, KRW, TWD, THB, MYR, PHP, IDR, VND, BRL, MXN, CLP, COP, ARS, PEN, ZAR, NGN, KES, EGP, TRY, PLN, CZK, HUF, RON, BGN, HRK, ISK, RUB, UAH, ILS, PKR

**Arab:** AED, SAR, QAR, KWD, BHD, OMR

---

## Supported Timezones

IANA timezone database. Common zones include:

UTC, America/New_York, America/Chicago, America/Denver, America/Los_Angeles, America/Toronto, America/Sao_Paulo, Europe/London, Europe/Paris, Europe/Berlin, Europe/Moscow, Asia/Tokyo, Asia/Shanghai, Asia/Singapore, Asia/Kolkata, Asia/Dubai, Asia/Seoul, Asia/Hong_Kong, Australia/Sydney, Pacific/Auckland

---

## Fiscal Year Support

Configured via `fiscal_year_start_month` in `org_profiles`.

| Value | Fiscal Year | Used By |
|-------|-------------|---------|
| 1 | Calendar year (Jan-Dec) | USA, many countries |
| 4 | Apr-Mar | India, UK, Japan |
| 7 | Jul-Jun | Australia |
| 10 | Oct-Sep | US Federal Government |

### Fiscal Year Impact

- **Subscription cost amortization:** Annual, quarterly, and semi-annual costs are allocated based on fiscal year boundaries.
- **Budget periods:** Budget tracking aligns to fiscal year.
- **Reporting periods:** Dashboard date ranges respect fiscal year.

---

## FX Conversion Standard

| Property | Implementation |
|----------|----------------|
| Base currency | All internal pricing templates stored in **USD** |
| Conversion timing | At signup, using current exchange rates |
| Storage fields | `source_currency`, `exchange_rate_used` stored with converted values |
| Display | Cost data always displayed in org's selected currency |
| Backend validation | Currency validators enforce valid ISO 4217 codes |

---

## Language Support

| Layer | Status |
|-------|--------|
| Backend model | 20+ languages defined |
| Frontend UI | English only |
| Future | i18n framework ready for multi-language rollout |

---

## Key Files

| File | Purpose |
|------|---------|
| `01-fronted-system/lib/i18n/currencies.ts` | Currency config + formatting |
| `01-fronted-system/lib/i18n/timezones.ts` | Timezone config + display names |
| `02-api-service/src/app/models/i18n_models.py` | `SupportedCurrency` enum, validators |
| `02-api-service/src/app/models/org_models.py` | `fiscal_year_start_month` field |
