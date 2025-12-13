# Internationalization (i18n) Foundation

**Status:** IMPLEMENTED
**Last Updated:** 2025-12-13

## Overview

Org-level multi-tenant internationalization attributes, implemented like `org_slug` as a foundational parameter across all services.

**Scope:** All at org-level (not user-level)
**Pattern:** Set at signup, propagated everywhere
**FX Conversion:** Display only (no currency conversion)

---

## Core 4 Attributes

| Attribute | Standard | Example | User Selects | Notes |
|-----------|----------|---------|--------------|-------|
| **Currency** | ISO 4217 | USD, AED | Yes (signup) | 16 supported currencies |
| **Timezone** | IANA | UTC, Asia/Dubai | Yes (signup) | 15 supported timezones |
| **Country** | ISO 3166-1 alpha-2 | US, AE | No (auto) | Inferred from currency |
| **Language** | BCP 47 | en | No (fixed) | Always "en" for now |

---

## Supported Values

### Currencies (ISO 4217) - 16 Total

**Major 10:**
- USD (US Dollar) - $
- EUR (Euro) - €
- GBP (British Pound) - £
- JPY (Japanese Yen) - ¥
- CHF (Swiss Franc) - Fr
- CAD (Canadian Dollar) - C$
- AUD (Australian Dollar) - A$
- CNY (Chinese Yuan) - ¥
- INR (Indian Rupee) - ₹
- SGD (Singapore Dollar) - S$

**Arab Countries 6:**
- AED (UAE Dirham) - د.إ
- SAR (Saudi Riyal) - ﷼
- QAR (Qatari Riyal) - ر.ق
- KWD (Kuwaiti Dinar) - د.ك (3 decimals)
- BHD (Bahraini Dinar) - د.ب (3 decimals)
- OMR (Omani Rial) - ر.ع (3 decimals)

### Timezones (IANA) - 15 Total

```
UTC
America/New_York, America/Chicago, America/Denver, America/Los_Angeles
Europe/London, Europe/Paris, Europe/Berlin
Asia/Dubai, Asia/Riyadh, Asia/Kolkata, Asia/Singapore, Asia/Tokyo, Asia/Shanghai
Australia/Sydney
```

### Currency → Country Mapping

```
USD → US, EUR → DE, GBP → GB, JPY → JP, CHF → CH, CAD → CA,
AUD → AU, CNY → CN, INR → IN, SGD → SG,
AED → AE, SAR → SA, QAR → QA, KWD → KW, BHD → BH, OMR → OM
```

---

## User Flow

### Signup Form

User selects:
- **Currency** (required) - 16 options dropdown
- **Timezone** (required) - 15 options dropdown

Defaults:
- **Language**: Always "en" (not shown)
- **Country**: Auto-inferred from currency (not shown)

### Post-Signup

Values stored in:
1. `user.user_metadata` (pending_currency, pending_timezone)
2. Supabase `organizations` table
3. BigQuery `org_profiles` table

---

## Data Model

### Supabase (organizations table)

```sql
ALTER TABLE organizations
ADD COLUMN IF NOT EXISTS default_currency VARCHAR(3) DEFAULT 'USD',
ADD COLUMN IF NOT EXISTS default_country VARCHAR(2) DEFAULT 'US',
ADD COLUMN IF NOT EXISTS default_language VARCHAR(10) DEFAULT 'en',
ADD COLUMN IF NOT EXISTS default_timezone VARCHAR(50) DEFAULT 'UTC';

-- Constraints
ADD CONSTRAINT chk_org_currency CHECK (default_currency ~ '^[A-Z]{3}$'),
ADD CONSTRAINT chk_org_country CHECK (default_country ~ '^[A-Z]{2}$');

-- Index for locale-based queries
CREATE INDEX IF NOT EXISTS idx_organizations_locale
ON organizations(default_currency, default_country);
```

**Migration:** `01-fronted-system/scripts/supabase_db/16_org_internationalization.sql`

### BigQuery (org_profiles table)

```json
{"name": "default_currency", "type": "STRING", "mode": "NULLABLE", "description": "ISO 4217 currency code (e.g., USD, EUR, AED). Default: USD"},
{"name": "default_country", "type": "STRING", "mode": "NULLABLE", "description": "ISO 3166-1 alpha-2 country code (e.g., US, AE). Auto-inferred from currency"},
{"name": "default_language", "type": "STRING", "mode": "NULLABLE", "description": "BCP 47 language tag (e.g., en, ar). Default: en"},
{"name": "default_timezone", "type": "STRING", "mode": "NULLABLE", "description": "IANA timezone identifier (e.g., UTC, Asia/Dubai). Default: UTC"}
```

**Schema:** `02-api-service/configs/setup/bootstrap/schemas/org_profiles.json`

---

## API Endpoints

### Onboarding (with i18n)

```bash
# Onboard org with currency/timezone
POST /api/v1/organizations/onboard
{
  "org_slug": "acmecorp",
  "company_name": "Acme Corp",
  "admin_email": "admin@acme.com",
  "subscription_plan": "STARTER",
  "default_currency": "AED",      # New
  "default_timezone": "Asia/Dubai" # New
}

# Response includes i18n fields
{
  "org_slug": "acmecorp",
  "api_key": "...",
  "default_currency": "AED",
  "default_country": "AE",  # Auto-inferred
  "default_language": "en",
  "default_timezone": "Asia/Dubai"
}
```

### Locale Endpoints

```bash
# Get org locale
GET /api/v1/organizations/{org_slug}/locale
# Returns: { org_slug, default_currency, default_country, default_language, default_timezone }

# Update org locale (currency + timezone)
PUT /api/v1/organizations/{org_slug}/locale
{
  "default_currency": "EUR",
  "default_timezone": "Europe/Paris"
}
# Country auto-updated to "DE" based on EUR
```

---

## Frontend Usage

### Constants & Formatters

```typescript
// lib/i18n/constants.ts
import { SUPPORTED_CURRENCIES, SUPPORTED_TIMEZONES, getCountryFromCurrency } from "@/lib/i18n"

// 16 currencies with metadata (symbol, name, decimals, country)
SUPPORTED_CURRENCIES.map(c => `${c.symbol} ${c.code} - ${c.name}`)

// Get country from currency
getCountryFromCurrency("AED") // → "AE"
```

```typescript
// lib/i18n/formatters.ts
import { formatCurrency, formatDateTime, getCurrencySymbol } from "@/lib/i18n"

// Format with org's currency
formatCurrency(1234.56, "AED")  // → "د.إ 1,234.56"
formatCurrency(1234.56, "JPY")  // → "¥ 1,235" (0 decimals)
formatCurrency(1234.567, "KWD") // → "د.ك 1,234.567" (3 decimals)

// Format datetime in org's timezone
formatDateTime(new Date(), "Asia/Dubai") // → "Dec 13, 2025 4:00 PM"

// Get symbol
getCurrencySymbol("AED") // → "د.إ"
```

### Signup Form

```tsx
// app/signup/page.tsx
import { SUPPORTED_CURRENCIES, SUPPORTED_TIMEZONES } from "@/lib/i18n"

<Select value={currency} onValueChange={setCurrency}>
  {SUPPORTED_CURRENCIES.map(c => (
    <SelectItem key={c.code} value={c.code}>
      {c.symbol} {c.code} - {c.name}
    </SelectItem>
  ))}
</Select>

<Select value={timezone} onValueChange={setTimezone}>
  {SUPPORTED_TIMEZONES.map(tz => (
    <SelectItem key={tz.value} value={tz.value}>
      {tz.label}
    </SelectItem>
  ))}
</Select>
```

---

## Files Reference

### Created

| Service | File | Purpose |
|---------|------|---------|
| Frontend | `lib/i18n/constants.ts` | Currencies, timezones, mappings |
| Frontend | `lib/i18n/formatters.ts` | formatCurrency, formatDateTime utilities |
| Frontend | `lib/i18n/index.ts` | Re-exports |
| Frontend | `scripts/supabase_db/16_org_internationalization.sql` | Supabase migration |
| API | `src/app/models/i18n_models.py` | Enums, validators, metadata |

### Updated

| Service | File | Changes |
|---------|------|---------|
| API | `configs/setup/bootstrap/schemas/org_profiles.json` | +4 i18n fields |
| API | `src/app/models/org_models.py` | +i18n fields to request/response models |
| API | `src/app/routers/organizations.py` | +i18n in INSERT/UPDATE, +locale endpoints |
| Frontend | `app/signup/page.tsx` | +Currency/timezone dropdowns |
| Frontend | `app/onboarding/organization/page.tsx` | +Pass i18n to createOrganization |
| Frontend | `actions/organization.ts` | +i18n in CreateOrganizationInput |
| Frontend | `actions/backend-onboarding.ts` | +i18n in onboardToBackend |
| Frontend | `lib/api/backend.ts` | +i18n in OnboardOrgRequest/Response |

---

## Default Values

For existing orgs and when values not provided:

| Field | Default |
|-------|---------|
| `default_currency` | USD |
| `default_country` | US |
| `default_language` | en |
| `default_timezone` | UTC |

---

## Enterprise Constraints

- Multi-tenancy: Proper org_slug isolation
- 10k customer scale: Indexed i18n fields
- BigQuery best practices: Clustering on org_slug
- Supabase best practices: CHECK constraints
- No Redis: Values stored in databases
- Display only: No FX conversion

---

## Future Enhancements

1. **Language Support**: Enable other BCP 47 languages beyond "en"
2. **Settings Page**: UI for org admins to update currency/timezone
3. **Cost Display**: Use org currency in all cost displays
4. **More Timezones**: Add additional IANA timezones
5. **More Currencies**: Add additional ISO 4217 currencies
