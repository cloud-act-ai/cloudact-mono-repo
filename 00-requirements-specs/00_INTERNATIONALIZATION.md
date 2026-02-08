# Internationalization

**v12.3** | 2026-02-05

> Org-level i18n (currency, timezone, country)

---

## Workflow

```
Signup → Select Currency + Timezone → Stored on org record
      → FX rates fetched (USD base) → Templates converted to org currency
      → All cost data displayed in org currency
```

---

## Core Attributes

| Attribute | Standard | Selectable | Notes |
|-----------|----------|------------|-------|
| Currency | ISO 4217 | Yes (signup) | Determines display + FX conversion |
| Timezone | IANA | Yes (signup) | Affects date boundaries, cron schedules |
| Country | ISO 3166-1 | Auto (from currency) | Derived, not user-selected |
| Language | BCP 47 | Fixed (`en`) | English only (current) |

---

## Supported Currencies (16)

**Major:** USD, EUR, GBP, JPY, CHF, CAD, AUD, CNY, INR, SGD

**Arab:** AED, SAR, QAR, KWD, BHD, OMR

---

## Supported Timezones (15)

UTC, America/New_York, America/Chicago, America/Denver, America/Los_Angeles, Europe/London, Europe/Paris, Europe/Berlin, Asia/Tokyo, Asia/Shanghai, Asia/Singapore, Asia/Kolkata, Asia/Dubai, Australia/Sydney, Pacific/Auckland

---

## FX Conversion Standard

- All internal pricing templates stored in **USD**
- Converted to org currency at signup using current exchange rates
- Exchange rate stored with `source_currency`, `exchange_rate_used` fields
- Cost data always displayed in org's selected currency

---

## Key Files

| File | Purpose |
|------|---------|
| `lib/i18n/currencies.ts` | Currency config + formatting |
| `lib/i18n/timezones.ts` | Timezone config + display names |
