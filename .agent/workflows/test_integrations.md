---
description: LLM & Cloud Integrations E2E Browser Tests (antigravity)
---

# LLM & Cloud Integrations E2E Tests

Browser automation tests for OpenAI, Anthropic, GCP integrations and credential management using `browser_subagent`.

---

## CRITICAL: Execution Rules

**MANDATORY - READ FIRST:**

1. **NEVER STOP ON FAILURE** - Mark as `FAILED`, continue to next test
2. **COMPLETE 100%** - Execute ALL tests even with failures
3. **RESTART ON CRASH** - Run `@[/clean_restart]`, resume from crashed test, mark as `FAILED - CRASH`
4. **SKIP BLOCKERS** - Mark as `SKIPPED - BLOCKED BY [test]`, continue with independent tests
5. **TRACK RESULTS** - Update: `PASSED: X | FAILED: Y | SKIPPED: Z | REMAINING: N`
6. **DELETE OLD ARTIFACTS** - Create only here: `.agent/artifacts/INTEGRATIONS_TEST_REPORT.md`

## CRITICAL: Best Practices

- No over-engineering - Simple, direct tests
- ZERO mock tests - Real API key validation
- Credentials encrypted via KMS
- Only fingerprint stored in Supabase (last 8 chars)

---

## STEP 0: Pre-Test Review (MANDATORY FIRST)

**Before running ANY tests, the agent MUST complete these checks:**

### 0.1 Code Gap Analysis
```
Review and fix code gaps in:
1. FRONTEND (01-fronted-system):
   - actions/integrations.ts - Integration setup/validation
   - app/[orgSlug]/settings/integrations/* - Integration pages
   - app/[orgSlug]/integrations/llm - LLM management
   - Verify credential masking in UI

2. BACKEND (02-api-service):
   - Integration setup endpoints
   - Credential encryption (KMS)
   - Validation endpoints

3. PIPELINE (03-data-pipeline-service):
   - Provider credential retrieval
   - API key decryption logic
```

### 0.2 URL & Link Validation
```
Verify all URLs/routes exist and are accessible:
- [ ] /{orgSlug}/settings/integrations - Integration list
- [ ] /{orgSlug}/settings/integrations/openai - OpenAI setup
- [ ] /{orgSlug}/settings/integrations/anthropic - Anthropic setup
- [ ] /{orgSlug}/settings/integrations/gcp - GCP setup
- [ ] /{orgSlug}/integrations/llm - LLM management

Fix any broken routes before proceeding.
```

### 0.3 Schema Validation
```
Verify database schemas match expected structure:
- [ ] Supabase: integration_*_status columns in organizations
- [ ] Supabase: integration_*_configured_at columns
- [ ] BigQuery: org_integration_credentials table
- [ ] BigQuery: org_kms_keys table

Run migrations if needed.
```

### 0.4 Pre-Test Report
```
Create: .agent/artifacts/INTEGRATIONS_PRETEST_REVIEW.md
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
curl -s http://localhost:8000/health | jq -r '.status' 2>/dev/null || echo "API: DOWN"
```

**Test Setup:**
- Account with active subscription
- Test API keys (can be invalid for rejection tests)
- GCP service account JSON (for cloud tests)

---

## Test Tracking

```markdown
| #   | Test                                    | Status  | Notes |
| --- | --------------------------------------- | ------- | ----- |
| 1   | OpenAI - Valid Key Setup                | PENDING |       |
| 2   | OpenAI - Invalid Key Rejected           | PENDING |       |
| 3   | OpenAI - Validation Test                | PENDING |       |
| 4   | OpenAI - Delete Integration             | PENDING |       |
| 5   | OpenAI - Toggle Enable/Disable          | PENDING |       |
| 6   | Anthropic - Valid Key Setup             | PENDING |       |
| 7   | Anthropic - Invalid Key Rejected        | PENDING |       |
| 8   | Anthropic - Delete Integration          | PENDING |       |
| 9   | GCP - Valid Service Account             | PENDING |       |
| 10  | GCP - Invalid JSON Rejected             | PENDING |       |
| 11  | GCP - Validation Test                   | PENDING |       |
| 12  | GCP - Delete Integration                | PENDING |       |
| 13  | LLM Pricing - List Models               | PENDING |       |
| 14  | LLM Pricing - Create Custom Model       | PENDING |       |
| 15  | LLM Pricing - Update Pricing            | PENDING |       |
| 16  | LLM Pricing - Delete Custom             | PENDING |       |
| 17  | LLM Tier - Get Current                  | PENDING |       |
| 18  | LLM Tier - Upgrade Tier                 | PENDING |       |
| 19  | Fingerprint - Only Last 8 Chars         | PENDING |       |
| 20  | Status - Active/Error Display           | PENDING |       |

**TOTAL: 0/20 PASSED | 0 FAILED | 0 SKIPPED**
```

---

## Test Flows

### 1-5. OpenAI Integration Tests

**Route:** `/{orgSlug}/settings/integrations/openai`

| # | Test | Input | Expected |
|---|------|-------|----------|
| 1 | Valid Key | `sk-proj-...` (valid) | Success, status = active |
| 2 | Invalid Key | `sk-invalid123` | Error: "Invalid API key" |
| 3 | Validation | Click "Test Connection" | "Connection successful" |
| 4 | Delete | Click "Remove" | Integration removed |
| 5 | Toggle | Enable/Disable switch | Status changes |

### 6-8. Anthropic Integration Tests

**Route:** `/{orgSlug}/settings/integrations/anthropic`

| # | Test | Input | Expected |
|---|------|-------|----------|
| 6 | Valid Key | `sk-ant-...` (valid) | Success, status = active |
| 7 | Invalid Key | `invalid-key` | Error: "Invalid API key" |
| 8 | Delete | Click "Remove" | Integration removed |

### 9-12. GCP Integration Tests

**Route:** `/{orgSlug}/settings/integrations/gcp`

| # | Test | Input | Expected |
|---|------|-------|----------|
| 9 | Valid SA | Valid service account JSON | Success, status = active |
| 10 | Invalid JSON | `{"invalid": true}` | Error: "Invalid service account" |
| 11 | Validation | Click "Test Connection" | "Billing access verified" |
| 12 | Delete | Click "Remove" | Integration removed |

**Service Account JSON Structure:**
```json
{
  "type": "service_account",
  "project_id": "...",
  "private_key_id": "...",
  "private_key": "-----BEGIN PRIVATE KEY-----\n...",
  "client_email": "...",
  "client_id": "...",
  ...
}
```

### 13-16. LLM Pricing Tests

**Route:** `/{orgSlug}/settings/integrations/{provider}/pricing`

| # | Test | Action | Expected |
|---|------|--------|----------|
| 13 | List Models | Visit pricing page | Default models listed |
| 14 | Create Custom | Add new model | Model added to list |
| 15 | Update Pricing | Edit input/output costs | Values updated |
| 16 | Delete Custom | Remove custom model | Model removed |

**Model Pricing Fields:**
```
model_id: "gpt-4-turbo"
input_cost_per_1k_tokens: 0.01
output_cost_per_1k_tokens: 0.03
```

### 17-18. LLM Tier Tests

**Route:** `/{orgSlug}/settings/integrations/{provider}/subscription`

| # | Test | Action | Expected |
|---|------|--------|----------|
| 17 | Get Tier | Load page | Current tier shown (TIER1, etc.) |
| 18 | Upgrade | Select higher tier | Limits updated (RPM, TPM) |

**Tiers:**
- TIER1: Default (low limits)
- TIER2: Medium limits
- TIER3: High limits
- BUILD_TIER: Developer tier

### 19-20. Security Tests

| # | Test | Verify | Expected |
|---|------|--------|----------|
| 19 | Fingerprint | Supabase column | Only last 8 chars stored |
| 20 | Status Display | Integration card | Shows active/pending/error |

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

Create: `.agent/artifacts/INTEGRATIONS_TEST_REPORT.md`

Include:
- Final test results table
- All failures with URL + screenshot + error
- API key validation errors noted
- Pass rate: X/20 tests passed
