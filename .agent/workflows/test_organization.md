---
description: Organization Settings & Multi-Org E2E Browser Tests (antigravity)
---

# Organization Settings & Multi-Org E2E Tests

Browser automation tests for organization management, locale settings, and multi-org access using `browser_subagent`.

---

## CRITICAL: Execution Rules

**MANDATORY - READ FIRST:**

1. **NEVER STOP ON FAILURE** - Mark as `FAILED`, continue to next test
2. **COMPLETE 100%** - Execute ALL tests even with failures
3. **RESTART ON CRASH** - Run `@[/clean_restart]`, resume from crashed test, mark as `FAILED - CRASH`
4. **SKIP BLOCKERS** - Mark as `SKIPPED - BLOCKED BY [test]`, continue with independent tests
5. **TRACK RESULTS** - Update: `PASSED: X | FAILED: Y | SKIPPED: Z | REMAINING: N`
6. **DELETE OLD ARTIFACTS** - Create only here: `.agent/artifacts/ORGANIZATION_TEST_REPORT.md`

## CRITICAL: Best Practices

- No over-engineering - Simple, direct tests
- Multi-tenancy isolation verified
- ZERO mock tests - Real org switching
- Locale changes affect data display

---

## STEP 0: Pre-Test Review (MANDATORY FIRST)

**Before running ANY tests, the agent MUST complete these checks:**

### 0.1 Code Gap Analysis
```
Review and fix code gaps in:
1. FRONTEND (01-fronted-system):
   - actions/organization.ts - Org management
   - actions/organization-locale.ts - Locale updates
   - app/[orgSlug]/settings/organization - Org settings page
   - app/[orgSlug]/settings/personal - Personal settings
   - lib/i18n/* - Locale utilities
   - middleware.ts - Org access validation

2. BACKEND (02-api-service):
   - Org locale update endpoints
   - Multi-org access validation

3. SECURITY:
   - XSS prevention in org name
   - Org slug validation regex
```

### 0.2 URL & Link Validation
```
Verify all URLs/routes exist and are accessible:
- [ ] /{orgSlug}/settings/organization - Org settings
- [ ] /{orgSlug}/settings/personal - Personal settings
- [ ] /{orgSlug}/settings/security - Security settings
- [ ] /unauthorized - Unauthorized page

Fix any broken routes before proceeding.
```

### 0.3 Schema Validation
```
Verify database schemas match expected structure:
- [ ] Supabase: organizations.locale_currency column
- [ ] Supabase: organizations.locale_timezone column
- [ ] Supabase: organizations.locale_country column
- [ ] Supabase: organizations.locale_language column
- [ ] Supabase: profiles table structure

Run migrations if needed: cd scripts/supabase_db && ./migrate.sh
```

### 0.4 Pre-Test Report
```
Create: .agent/artifacts/ORGANIZATION_PRETEST_REVIEW.md
Include:
- Code gaps found and fixed
- Broken URLs found and fixed
- Schema issues found and fixed
- Ready for testing: YES/NO
```

**Only proceed to tests after Step 0 is complete!**

---

## Prerequisites

```bash
# Verify services
curl -s http://localhost:3000 > /dev/null && echo "Frontend: OK" || echo "Frontend: DOWN"
```

**Test Setup:**
- User with at least 2 organizations
- Or create second org during tests

---

## Test Tracking

```markdown
| #   | Test                                    | Status  | Notes |
| --- | --------------------------------------- | ------- | ----- |
| 1   | Org Settings - Load                     | PENDING |       |
| 2   | Org Settings - Update Name              | PENDING |       |
| 3   | Locale - Currency Select (USD)          | PENDING |       |
| 4   | Locale - Currency Select (INR)          | PENDING |       |
| 5   | Locale - Timezone Select                | PENDING |       |
| 6   | Locale - Country Auto-Populate          | PENDING |       |
| 7   | Locale - Persists in Database           | PENDING |       |
| 8   | Locale - Affects Cost Display           | PENDING |       |
| 9   | Multi-Org - Own Org Access              | PENDING |       |
| 10  | Multi-Org - Cross-Org Blocked           | PENDING |       |
| 11  | Multi-Org - Org Switcher                | PENDING |       |
| 12  | Multi-Org - Data Isolation              | PENDING |       |
| 13  | Org Slug - Valid Format                 | PENDING |       |
| 14  | Org Slug - Invalid Format Blocked       | PENDING |       |
| 15  | Org Slug - Non-existent Blocked         | PENDING |       |
| 16  | Personal Settings - Update Name         | PENDING |       |
| 17  | Personal Settings - Update Phone        | PENDING |       |
| 18  | Security - Change Password              | PENDING |       |
| 19  | Security - Weak Password Rejected       | PENDING |       |
| 20  | XSS - Org Name Escaped                  | PENDING |       |

**TOTAL: 0/20 PASSED | 0 FAILED | 0 SKIPPED**
```

---

## Test Flows

### 1-2. Organization Settings Tests

**Route:** `/{orgSlug}/settings/organization`

| # | Test | Action | Expected |
|---|------|--------|----------|
| 1 | Load | Visit settings page | Current values displayed |
| 2 | Update Name | Change org name | Name updated, persisted |

### 3-8. Locale Settings Tests

**Supported Options:**
- **Currencies (16):** USD, EUR, GBP, INR, JPY, CNY, AUD, CAD, SGD, AED, CHF, SEK, NOK, DKK, ZAR, BRL
- **Timezones (15):** America/New_York, America/Los_Angeles, Europe/London, Asia/Kolkata, etc.
- **Countries (16):** US, GB, IN, JP, CN, AU, CA, SG, AE, CH, SE, NO, DK, ZA, BR, EU

| # | Test | Action | Expected |
|---|------|--------|----------|
| 3 | Currency USD | Select USD | Symbol: $ |
| 4 | Currency INR | Select INR | Symbol: ₹ |
| 5 | Timezone | Select Asia/Kolkata | UTC+5:30 |
| 6 | Country Auto | Select India | Currency=INR, Timezone=Asia/Kolkata |
| 7 | Persistence | Reload page | Values preserved |
| 8 | Cost Display | View SaaS costs | Currency matches locale |

### 9-12. Multi-Org Access Tests

| # | Test | Setup | Expected |
|---|------|-------|----------|
| 9 | Own Org | User in org_a visits /org_a | Access granted |
| 10 | Cross-Org | User in org_a visits /org_b | Redirect /unauthorized |
| 11 | Org Switcher | User in 2 orgs | Can switch between both |
| 12 | Data Isolation | Switch orgs | Different data shown |

### 13-15. Org Slug Validation Tests

**Valid Format:** `^[a-zA-Z0-9_-]{2,100}$`

| # | Test | Input | Expected |
|---|------|-------|----------|
| 13 | Valid | `acme_corp_123` | Access granted |
| 14 | Invalid | `acme corp!` | Error: Invalid org |
| 15 | Non-existent | `fake_org_xyz` | Redirect /unauthorized |

### 16-17. Personal Settings Tests

**Route:** `/{orgSlug}/settings/personal`

| # | Test | Action | Expected |
|---|------|--------|----------|
| 16 | Update Name | Change first/last name | Saved, displayed in UI |
| 17 | Update Phone | Add phone number | Saved, validated format |

### 18-19. Security Settings Tests

**Route:** `/{orgSlug}/settings/security`

| # | Test | Input | Expected |
|---|------|-------|----------|
| 18 | Change Password | Old + New password | Password changed |
| 19 | Weak Password | New: `1234` | Error: "Min 8 characters" |

### 20. XSS Prevention Test

| # | Test | Input | Expected |
|---|------|-------|----------|
| 20 | XSS Org Name | `<script>alert(1)</script>` | Tags escaped, safe display |

---

## Currency Formatting Verification

```javascript
// Test these outputs after locale change
formatCurrency(1234.50, "USD") // "$1,234.50"
formatCurrency(1234.50, "EUR") // "€1,234.50"
formatCurrency(1234.50, "GBP") // "£1,234.50"
formatCurrency(1234.50, "INR") // "₹1,234.50"
formatCurrency(1234.50, "JPY") // "¥1,235" (no decimals)
```

---

## On Failure/Crash

```
ON ERROR:
  -> Screenshot + Log URL + Mark FAILED -> Continue next test

ON CRASH:
  -> Run @[/clean_restart]
  -> Wait for healthy services
  -> Resume from crashed test
  -> Mark as FAILED - CRASH
```

---

## Report

Create: `.agent/artifacts/ORGANIZATION_TEST_REPORT.md`

Include:
- Final test results table
- All failures with URL + screenshot + error
- Multi-org isolation verification
- Pass rate: X/20 tests passed
