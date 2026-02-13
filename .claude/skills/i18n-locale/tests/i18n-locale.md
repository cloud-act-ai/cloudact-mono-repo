# i18n & Locale - Test Plan

## Test Matrix

| Test ID | Category | Test | Expected | Environment |
|---------|----------|------|----------|-------------|
| IL-T001 | Currency | Format USD $100.00 | "$100.00" | local |
| IL-T002 | Currency | Format JPY ¥1000 (0 decimals) | "¥1,000" | local |
| IL-T003 | Currency | Format KWD 100 (3 decimals) | "د.ك100.000" | local |
| IL-T004 | Currency | Format null amount | "$0.00" (safe default) | local |
| IL-T005 | Conversion | USD → EUR | ~92.50 for $100 | local |
| IL-T006 | Conversion | Audit trail returned | rate, source, timestamp present | local |
| IL-T007 | Conversion | Unsupported currency | Error/fallback | local |
| IL-T008 | Staleness | Exchange rates >30 days | Warning returned | local |
| IL-T009 | Timezone | Format UTC datetime | Correct UTC display | local |
| IL-T010 | Timezone | Format Asia/Tokyo datetime | +9 offset applied | local |
| IL-T011 | Date Format | MM/DD/YYYY | "01/15/2026" | local |
| IL-T012 | Date Format | DD/MM/YYYY | "15/01/2026" | local |
| IL-T013 | Date Format | YYYY-MM-DD (ISO) | "2026-01-15" | local |
| IL-T014 | Fiscal Year | Auto-suggest from US timezone | January | local |
| IL-T015 | Fiscal Year | Auto-suggest from India timezone | April | local |
| IL-T016 | Fiscal Year | Auto-suggest from Australia timezone | July | local |
| IL-T017 | API | GET /organizations/{org}/locale | 200 with locale fields | local/stage |
| IL-T018 | API | PUT locale (valid currency) | 200 OK, locale updated | local/stage |
| IL-T019 | API | PUT locale (invalid currency) | 422 validation error | local/stage |
| IL-T020 | Sync | Update locale → verify BQ synced | BQ org_profiles updated | local/stage |
| IL-T021 | Sync | validateLocaleSync() | true (or false if mismatch) | local/stage |
| IL-T022 | Sync | repairLocaleSync() | BQ matches Supabase after repair | local/stage |
| IL-T023 | E2E | Settings page → change currency → dashboard | New symbol displayed | local |
| IL-T024 | E2E | Settings page → change timezone → dates | Correct offset in dates | local |

## Test Procedures

### IL-T001–T004: Currency Formatting (Unit)

```bash
cd 01-fronted-system
npx jest tests/i18n/formatters.test.ts --testNamePattern="currency"
```

### IL-T005–T008: Currency Conversion (Unit)

```bash
cd 01-fronted-system
npx jest tests/i18n/formatters.test.ts --testNamePattern="conversion|exchange"
```

### IL-T017–T019: API Locale Endpoints

```bash
# GET locale
curl -s "http://localhost:8000/api/v1/organizations/{org}/locale" \
  -H "X-API-Key: {key}" | python3 -m json.tool
# Expected: { "currency": "USD", "timezone": "UTC", ... }

# PUT valid locale
curl -s -X PUT "http://localhost:8000/api/v1/organizations/{org}/locale" \
  -H "X-API-Key: {key}" -H "Content-Type: application/json" \
  -d '{"currency": "EUR", "timezone": "Europe/Berlin"}'
# Expected: 200 OK

# PUT invalid currency
curl -s -X PUT "http://localhost:8000/api/v1/organizations/{org}/locale" \
  -H "X-API-Key: {key}" -H "Content-Type: application/json" \
  -d '{"currency": "INVALID"}'
# Expected: 422 Validation Error
```

### IL-T020–T022: Locale Sync

```bash
# Update via API
curl -s -X PUT "http://localhost:8000/api/v1/organizations/{org}/locale" \
  -H "X-API-Key: {key}" -H "Content-Type: application/json" \
  -d '{"currency": "GBP"}'

# Verify Supabase
curl -s "https://kwroaccbrxppfiysqlzs.supabase.co/rest/v1/organizations?select=default_currency&org_slug=eq.{org}" \
  -H "apikey: {anon_key}" -H "Authorization: Bearer {service_role_key}"
# Expected: default_currency = "GBP"

# Verify BigQuery
bq query --nouse_legacy_sql "SELECT default_currency FROM \`cloudact-testing-1.organizations.org_profiles\` WHERE org_slug = '{org}'"
# Expected: GBP
```

### Multi-Environment Testing

```bash
# Stage
curl -s "https://cloudact-api-service-test-*.a.run.app/api/v1/organizations/{org}/locale" \
  -H "X-API-Key: {key}"

# Prod
curl -s "https://api.cloudact.ai/api/v1/organizations/{org}/locale" \
  -H "X-API-Key: {key}"
```

## Coverage by Requirement

| Requirement | Test IDs |
|-------------|----------|
| FR-IL-001 (Currency) | IL-T001, IL-T002, IL-T003, IL-T004 |
| FR-IL-002 (Conversion) | IL-T005, IL-T006, IL-T007, IL-T008 |
| FR-IL-003 (Timezone) | IL-T009, IL-T010 |
| FR-IL-004 (Date Format) | IL-T011, IL-T012, IL-T013 |
| FR-IL-005 (Fiscal Year) | IL-T014, IL-T015, IL-T016 |
| FR-IL-006 (Persistence) | IL-T020, IL-T021, IL-T022 |
| FR-IL-007 (API) | IL-T017, IL-T018, IL-T019 |
| E2E | IL-T023, IL-T024 |
