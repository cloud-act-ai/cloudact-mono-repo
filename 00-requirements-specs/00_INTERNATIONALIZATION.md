# Internationalization

**v12.2** | 2026-01-15

> Org-level i18n (currency, timezone)

---

## Core Attributes

| Attribute | Standard | Selectable |
|-----------|----------|------------|
| Currency | ISO 4217 | Yes (signup) |
| Timezone | IANA | Yes (signup) |
| Country | ISO 3166-1 | Auto (from currency) |
| Language | BCP 47 | Fixed (en) |

---

## Supported Currencies (16)

**Major:** USD, EUR, GBP, JPY, CHF, CAD, AUD, CNY, INR, SGD
**Arab:** AED, SAR, QAR, KWD, BHD, OMR

---

## Supported Timezones (15)

UTC, America/*, Europe/*, Asia/*, Australia/Sydney

---

## FX Conversion

Templates (USD) → converted to org currency at signup

---

## Key Files

| File | Purpose |
|------|---------|
| `lib/i18n/currencies.ts` | Currency config |
| `lib/i18n/timezones.ts` | Timezone config |
