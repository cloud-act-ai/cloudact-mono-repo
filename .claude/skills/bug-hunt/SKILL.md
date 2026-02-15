---
name: bug-hunt
description: |
  Advanced bug hunting for any CloudAct feature. Finds 50 real bugs across 10 categories.
  Use when: debugging features, pre-release audit, code review, quality assurance.
  Arguments: <feature-name> [--compact]
---

# Bug Hunt

## Overview
Find 50 real, actionable bugs in any feature. No theoretical concerns. No over-engineering suggestions. Pure bug finding.

**Philosophy:**
- Only report bugs that exist in current code
- Every bug must have a file:line reference
- Every bug must have a concrete fix
- NO suggestions for new features or patterns

## Usage
```
/bug-hunt <feature-name>           # Full detailed report + TODO list
/bug-hunt <feature-name> --compact # Quick one-liner summaries
```

## Analysis Protocol

### STEP 1: Locate Feature Files

Search ALL 5 services for the feature. **Must check every relevant file.**

#### Frontend Service (01-fronted-system/)
```
01-fronted-system/
├── app/[orgSlug]/                    # Org-scoped pages
│   ├── integrations/                 # Integration pages
│   ├── subscriptions/                # Subscription management
│   ├── settings/                     # Org settings
│   └── dashboard/                    # Dashboard pages
├── components/                       # React components
│   ├── ui/                           # UI primitives
│   ├── forms/                        # Form components
│   └── providers/                    # Context providers
├── actions/                          # Server actions
│   ├── integrations.ts               # Integration actions
│   ├── subscriptions.ts              # Subscription actions
│   ├── organizations.ts              # Org actions
│   └── pipelines.ts                  # Pipeline actions
├── lib/
│   ├── api/backend.ts                # API client
│   ├── supabase/                     # Supabase client
│   └── utils/                        # Utilities
├── hooks/                            # React hooks
└── tests/                            # Frontend tests
    ├── e2e/                          # Playwright E2E
    ├── api-integration/              # API integration tests
    └── ui/                           # Component tests
```

#### API Service (02-api-service/)
```
02-api-service/
├── src/app/
│   ├── main.py                       # FastAPI app entry
│   ├── routers/                      # API endpoints
│   │   ├── admin.py                  # Admin routes (bootstrap)
│   │   ├── organizations.py          # Org onboarding
│   │   ├── integrations.py           # Integration setup
│   │   ├── subscriptions.py          # Subscription CRUD
│   │   ├── hierarchy.py              # Org hierarchy
│   │   ├── pipelines.py              # Pipeline proxy
│   │   └── quota.py                  # Quota management
│   └── middleware/
│       ├── auth.py                   # Authentication
│       └── rate_limit.py             # Rate limiting
├── src/core/
│   ├── services/                     # Business logic
│   │   ├── bootstrap_service.py      # Bootstrap logic
│   │   ├── organization_service.py   # Org management
│   │   ├── integration_service.py    # Integration logic
│   │   └── subscription_service.py   # Subscription logic
│   ├── security/
│   │   └── kms_encryption.py         # KMS encryption
│   ├── models/                       # Pydantic models
│   └── database/
│       └── bigquery_client.py        # BigQuery client
├── configs/
│   ├── setup/bootstrap/schemas/      # Bootstrap table schemas
│   └── setup/organizations/          # Org table schemas
└── tests/                            # API tests
    ├── test_bootstrap.py
    ├── test_organizations.py
    ├── test_integrations.py
    ├── test_subscriptions.py
    ├── test_security.py
    └── test_quota.py
```

#### Pipeline Service (03-data-pipeline-service/)
```
03-data-pipeline-service/
├── src/app/
│   ├── main.py                       # FastAPI app entry
│   ├── routers/
│   │   ├── pipelines.py              # Pipeline execution
│   │   └── procedures.py             # Stored procedures
│   └── middleware/
│       └── auth.py                   # Authentication
├── src/core/
│   ├── pipeline/
│   │   ├── executor.py               # Pipeline executor
│   │   ├── async_executor.py         # Async execution
│   │   ├── template_resolver.py      # Config templates
│   │   └── scheduler.py              # Job scheduler
│   ├── processors/                   # Data processors
│   │   ├── base/                     # Base processors
│   │   ├── cloud/                    # Cloud provider processors
│   │   │   ├── aws/                  # AWS processors
│   │   │   ├── azure/                # Azure processors
│   │   │   ├── gcp/                  # GCP processors
│   │   │   └── oci/                  # OCI processors
│   │   ├── genai/                    # GenAI cost processors
│   │   │   ├── payg_cost.py          # PAYG costs
│   │   │   ├── commitment_cost.py    # Commitment costs
│   │   │   ├── infrastructure_cost.py
│   │   │   └── unified_consolidator.py
│   │   └── generic/                  # Generic processors
│   │       └── bq_loader.py          # BigQuery loader
│   ├── engine/
│   │   └── bigquery_engine.py        # BigQuery operations
│   └── notifications/
│       └── email_service.py          # Email notifications
├── configs/
│   ├── cloud/                        # Cloud provider configs
│   │   ├── aws/                      # AWS pipeline configs
│   │   ├── azure/                    # Azure pipeline configs
│   │   ├── gcp/                      # GCP pipeline configs
│   │   └── oci/                      # OCI pipeline configs
│   ├── saas/                         # SaaS provider configs
│   ├── genai/                        # GenAI pipeline configs
│   └── system/
│       ├── providers.yml             # Provider registry
│       ├── pipelines.yml             # Pipeline registry
│       └── procedures/               # Stored procedures
└── tests/                            # Pipeline tests
    ├── test_pipelines.py
    ├── test_processors/
    │   ├── test_openai.py
    │   ├── test_anthropic.py
    │   └── test_gcp.py
    ├── test_engine.py
    └── test_security.py
```

#### Chat Backend (07-org-chat-backend/)
```
07-org-chat-backend/
├── src/app/
│   ├── main.py                       # FastAPI app, all endpoints
│   ├── config.py                     # Settings (env-driven)
│   └── dependencies/
│       └── auth.py                   # ChatContext: org_slug + api_key validation
├── src/core/
│   ├── agents/                       # ADK agents
│   │   ├── orchestrator.py           # Root agent
│   │   ├── cost_analyst.py           # 5 cost tools
│   │   ├── alert_manager.py          # 4 alert tools
│   │   ├── budget_manager.py         # 4 budget tools
│   │   ├── usage_analyst.py          # 4 usage tools
│   │   └── explorer.py              # 3 explorer tools (SQL)
│   ├── tools/                        # MCP tool implementations
│   │   ├── costs.py                  # Cost queries
│   │   ├── alerts.py                 # Alert management
│   │   ├── budgets.py                # Budget queries
│   │   ├── usage.py                  # Usage metrics
│   │   └── explorer.py              # SQL explorer + query guard
│   ├── security/
│   │   ├── org_validator.py          # Org validation + TTL cache
│   │   ├── query_guard.py            # Dry-run gate (10GB limit)
│   │   └── kms_decryption.py         # KMS decrypt for BYOK
│   └── sessions/
│       └── bq_session_store.py       # Conversations + messages
└── tests/
```

#### Scheduler Jobs (05-scheduler-jobs/)
```
05-scheduler-jobs/
├── src/
│   ├── bootstrap.py                  # Initial system setup
│   ├── org_sync_all.py               # Sync ALL org datasets
│   ├── quota_reset_daily.py          # 00:00 UTC daily
│   ├── quota_reset_monthly.py        # 00:05 UTC 1st of month
│   ├── stale_cleanup.py              # 02:00 UTC daily (fix stuck counters)
│   ├── quota_cleanup.py              # 01:00 UTC daily (delete >90 days)
│   ├── pipelines_daily.py            # 06:00 UTC (cost pipelines)
│   └── alerts_daily.py               # 08:00 UTC (process alerts)
└── scripts/
    ├── create-all-jobs.sh            # Create Cloud Run Jobs
    ├── run-job.sh                    # Run a specific job
    └── list-jobs.sh                  # List all jobs
```

#### Feature-to-Files Quick Reference

| Feature | Frontend | API Service | Pipeline Service | Chat Backend |
|---------|----------|-------------|------------------|--------------|
| **pipeline-setup** | `app/[orgSlug]/integrations/` | `routers/integrations.py` | `routers/pipelines.py`, `pipeline/executor.py` | N/A |
| **quota-enforcement** | `components/quota-warning-banner.tsx` | `dependencies/auth.py`, `models/org_models.py` | `routers/pipelines.py` | N/A |
| **subscription-billing** | `app/[orgSlug]/settings/` | `routers/organizations.py` | N/A | N/A |
| **org-onboarding** | `actions/backend-onboarding.ts` | `routers/organizations.py` | N/A | N/A |
| **integration-credentials** | `actions/integrations.ts` | `routers/integrations.py`, `security/kms_encryption.py` | `processors/*/` | `security/kms_decryption.py` |
| **hierarchy** | `actions/hierarchy.ts` | `routers/hierarchy.py`, `services/hierarchy_crud/` | N/A | N/A |
| **genai-costs** | `app/[orgSlug]/cost-dashboards/` | `services/cost_read/` | `processors/genai/*.py` | `tools/costs.py` |
| **cloud-provider** | `app/[orgSlug]/integrations/` | `routers/integrations.py` | `processors/cloud/` | N/A |
| **chat** | `app/[orgSlug]/chat/` | N/A | N/A | `agents/`, `tools/`, `sessions/` |
| **budget** | `app/[orgSlug]/budget/` | N/A | N/A | `tools/budgets.py` |
| **alerts** | `app/[orgSlug]/notifications/` | `routers/cost_alerts.py`, `services/notification_crud/` | N/A | `tools/alerts.py` |
| **i18n** | `lib/i18n/`, `contexts/` | `routers/organizations.py` (locale) | N/A | N/A |

### STEP 2: Trace Data Flow

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                           FULL REQUEST FLOW                                  │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  Frontend (Next.js :3000)                                                    │
│  ├── Page/Component → Server Action → API Call                              │
│  │                                                                           │
│  ▼                                                                           │
│  API Service (FastAPI :8000)                                                 │
│  ├── Middleware (auth, rate-limit) → Router → Service → BigQuery            │
│  │                                                                           │
│  ▼ (if pipeline execution needed)                                            │
│  Pipeline Service (FastAPI :8001)                                            │
│  ├── Middleware (auth) → Router → Executor → Processor → BigQuery           │
│  │                                                                           │
│  Frontend → Chat Backend (FastAPI :8002, VPC internal only)                  │
│  ├── AG-UI/CopilotKit → ADK Agents → MCP Tools → BigQuery                  │
│  │   Credentials: KMS decrypt per-request, org_slug bound to tools          │
│  │                                                                           │
│  Scheduler Jobs (Cloud Run Jobs :05)                                         │
│  ├── Quota resets, stale cleanup, alert processing, pipeline scheduling     │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

**Check at each layer:**
```
Frontend        → Input validation, auth state, error handling, orgSlug context
API Middleware  → Auth bypass, rate limit, org_slug isolation
API Router      → Input validation, response codes, IDOR, org_slug in URL vs auth
API Service     → Business logic, transactions, idempotency
Pipeline Router → Auth, org_slug context, config validation
Pipeline Exec   → Race conditions, retry safety, error handling
Processor       → Data integrity, org_slug in all writes (x_* fields)
BigQuery        → Parameterized queries (@org_slug), dataset isolation ({org_slug}_prod)
```

### STEP 3: Apply 10-Category Checklist (5 bugs each)

---

## Bug Categories

### 1. Multi-Tenancy (MT-001 to MT-005)

**CloudAct uses `org_slug` (NOT `org_id`) for tenant isolation:**
- Query filter: `WHERE org_slug = @org_slug` or `WHERE SubAccountId = @org_slug`
- Dataset isolation: `{org_slug}_prod`, `{org_slug}_stage`
- Validation: `^[a-zA-Z0-9_]{3,50}$`

| Check | What to Look For |
|-------|------------------|
| MT-A | Missing `org_slug` in WHERE clauses (parameterized: `@org_slug`) |
| MT-B | Cross-org data in JOINs without org_slug filter |
| MT-C | Shared caches without org_slug namespace |
| MT-D | Background jobs missing org_slug context |
| MT-E | File paths without org_slug isolation |

### 2. Idempotency (IDEM-001 to IDEM-005)
| Check | What to Look For |
|-------|------------------|
| IDEM-A | INSERT without ON CONFLICT handling |
| IDEM-B | Side effects on retry (emails, webhooks) |
| IDEM-C | Missing idempotency keys in APIs |
| IDEM-D | State changes without version checks |
| IDEM-E | Duplicate event processing |

### 3. CRUD Operations (CRUD-001 to CRUD-005)
| Check | What to Look For |
|-------|------------------|
| CRUD-A | Missing foreign key validation |
| CRUD-B | Orphan records on DELETE |
| CRUD-C | UPDATE without WHERE clause risks |
| CRUD-D | Missing NOT NULL constraints |
| CRUD-E | Stale reads after writes |

### 4. Error Handling (ERR-001 to ERR-005)
| Check | What to Look For |
|-------|------------------|
| ERR-A | Bare `except:` catching everything |
| ERR-B | Silent failures (empty catch blocks) |
| ERR-C | Error details leaked to client |
| ERR-D | Missing rollback on partial failure |
| ERR-E | Incorrect HTTP status codes |

### 5. Security (SEC-001 to SEC-005)
| Check | What to Look For |
|-------|------------------|
| SEC-A | SQL injection via string formatting |
| SEC-B | Auth bypass in edge cases |
| SEC-C | Credentials in logs or responses |
| SEC-D | Missing rate limiting |
| SEC-E | IDOR (direct object reference) |

### 6. Performance (PERF-001 to PERF-005)
| Check | What to Look For |
|-------|------------------|
| PERF-A | N+1 queries in loops |
| PERF-B | Missing database indexes |
| PERF-C | Unbounded result sets |
| PERF-D | Synchronous I/O in async context |
| PERF-E | Redundant API calls |

### 7. Scaling (SCALE-001 to SCALE-005)
| Check | What to Look For |
|-------|------------------|
| SCALE-A | Race conditions without locks |
| SCALE-B | Connection pool exhaustion |
| SCALE-C | Memory leaks (unbounded lists) |
| SCALE-D | Missing pagination |
| SCALE-E | Single-threaded bottlenecks |

### 8. Input Validation (VAL-001 to VAL-005)
| Check | What to Look For |
|-------|------------------|
| VAL-A | Missing type validation |
| VAL-B | No boundary checks (min/max) |
| VAL-C | Null/undefined not handled |
| VAL-D | Missing string sanitization |
| VAL-E | Invalid enum values accepted |

### 9. State Management (STATE-001 to STATE-005)
| Check | What to Look For |
|-------|------------------|
| STATE-A | Stale cache reads |
| STATE-B | Transaction isolation issues |
| STATE-C | Inconsistent state after errors |
| STATE-D | Missing state transitions |
| STATE-E | Concurrent modification conflicts |

### 10. Edge Cases (EDGE-001 to EDGE-005)
| Check | What to Look For |
|-------|------------------|
| EDGE-A | Empty array/list handling |
| EDGE-B | Timezone/date boundary issues |
| EDGE-C | Unicode/special character bugs |
| EDGE-D | Max length/size violations |
| EDGE-E | First/last item special cases |

---

## Output Format

### Detailed Mode (default)
```
┌─────────────────────────────────────────────────────────────────┐
│ BUG HUNT REPORT: {feature_name}                                 │
│ Found: 50 | Critical: X | High: Y | Medium: Z | Low: W          │
└─────────────────────────────────────────────────────────────────┘

## 1. Multi-Tenancy Issues

### MT-001 [CRITICAL] Missing org_slug filter in pipeline query
- **File:** `03-data-pipeline-service/src/core/processors/base.py:234`
- **Issue:** SELECT query fetches all records without org_slug WHERE clause
- **Impact:** Data leakage - org A can see org B's pipeline data
- **Fix:** Add `WHERE org_slug = @org_slug` (parameterized query)

### MT-002 [HIGH] ...
```

### Compact Mode (--compact)
```
BUG HUNT: {feature_name} | 50 bugs | C:3 H:12 M:25 L:10

MT-001 [C] base.py:234 - Missing org_slug filter
MT-002 [H] executor.py:89 - Cross-org JOIN without org_slug
IDEM-001 [H] setup.py:156 - INSERT without ON CONFLICT
...
```

---

## Severity Definitions

| Severity | Criteria | Examples |
|----------|----------|----------|
| **CRITICAL** | Security breach, data loss, system crash | Auth bypass, SQL injection, data leakage |
| **HIGH** | Data corruption, major functionality broken | Duplicate records, incorrect calculations |
| **MEDIUM** | Feature partially broken, workaround exists | Missing validation, poor error messages |
| **LOW** | Minor issues, cosmetic, edge cases | UI glitch, rare edge case |

---

## Anti-Patterns (What NOT to Report)

| NOT This | Why |
|----------|-----|
| "Consider adding caching" | Suggestion, not a bug |
| "Rename variable for clarity" | Style preference |
| "Add more logging" | Enhancement, not bug |
| "Refactor to use X pattern" | Architecture preference |
| "This could be more efficient" | Only if causes real issue |
| "Add feature X" | Never suggest new features |

**Rule:** If it's not broken, don't report it.

---

## Post-Report Actions

After generating the bug report:
1. Create TODO items via TodoWrite (grouped by severity)
2. Ask user: "Ready to proceed with fixes?"
3. On approval:
   - Launch **parallel agents** to fix bugs (no phased approach)
   - Run tests for ALL services after fixes
   - Validate no existing functionality broken

## Fix All Command

When user says **"fix all {N} issues"** or **"fix all bugs"**:
1. **NO SKIPS**: Every reported bug MUST be fixed - no exceptions
2. **NO PHASES**: Fix all bugs in one session, not spread across multiple
3. **ALL AT ONCE**: Create TodoWrite with all N items and complete each one
4. **VERIFY FIXABLE**: Every bug reported MUST have a concrete fix that can be applied
5. **NO THEORETICAL**: Only report bugs that exist AND can be fixed in current code

**Example Response to "fix all 12 issues":**
```
I'll fix all 12 bugs now:
[Creates TodoWrite with 12 items]
[Fixes each bug sequentially or in parallel]
[Marks each as completed as done]
[Reports completion of all 12]
```

**Anti-pattern to AVOID:**
- "Let's start with the critical ones..." (NO - fix ALL)
- "We can address LOW severity later..." (NO - fix ALL)
- "This would require a larger refactor..." (NO - report only fixable bugs)

## Fix Constraints (CRITICAL)

| Constraint | Enforcement |
|------------|-------------|
| **No new tools** | Use ONLY existing: KMS, BigQuery, Supabase |
| **No caching additions** | NO Redis, NO LRU cache, NO new caching layers |
| **No new dependencies** | Don't add pip/npm packages |
| **Existing patterns only** | Follow current codebase patterns |
| **Run all tests** | Frontend (vitest), API (pytest), Pipeline (pytest) |
| **Parallel execution** | Use parallel agents for speed |

### Post-Fix Validation
```bash
# MUST run after all fixes
cd 01-fronted-system && npm run test
cd 02-api-service && python -m pytest tests/ -v
cd 03-data-pipeline-service && python -m pytest tests/ -v
```

---

## Example Prompts

```
# Feature bug hunting
/bug-hunt pipeline-setup
/bug-hunt quota-enforcement
/bug-hunt integration-credentials
/bug-hunt subscription-billing

# Quick scan mode
/bug-hunt login --compact
/bug-hunt org-onboarding --compact

# After receiving report - FIX ALL (recommended)
"Fix all 12 issues"           # Fixes ALL reported bugs
"Fix all bugs now"            # Fixes ALL reported bugs
"Fix everything"              # Fixes ALL reported bugs

# Selective fixing (if user explicitly requests)
"Fix only CRITICAL bugs"
"Start with MT-001 and MT-002"
```

## Audit History

### 2026-02-14 Comprehensive Audit (19 fixes applied)

| Area | CRITICAL | HIGH | MEDIUM | LOW | Fixes |
|------|----------|------|--------|-----|-------|
| Cross-service integration | 1 | 0 | 1 | 2 | `BillingPeriodStart` → `ChargePeriodStart` in admin.py alert processing |
| i18n & enterprise | 3 | 6 | 7 | 4 | Missing currencies (HKD/NZD/SEK/KRW), timezone shift, budgets formatCurrency, GenAI pricing `$` |
| Multi-tenancy isolation | 0 | 0 | 2 | 3 | org_slug regex consistency (lowercase only), security audit model documented |
| Auth & validation | 3 | 2 | 0 | 0 | `requireOrgMembership`, `validate_org_slug`, `skip_validation` removal |
| Pipelines & data | 2 | 1 | 0 | 0 | SQL injection guard, async sleep, API cache bounds |
| Notifications | 1 | 0 | 0 | 0 | `NotificationChannelUpdate` validator bypass |

**Total:** 19 code fixes across 17 files + 5 skill updates

## 5 Implementation Pillars

| Pillar | How Bug Hunt Handles It |
|--------|-------------------------------|
| **i18n** | Checks for hardcoded `$`, `en-US`, `USD`; validates `formatCost()` usage; flags `toISOString().split("T")[0]` date patterns; verifies currency enum parity |
| **Enterprise** | Audits logging patterns (structured vs console.log); checks rate limiting; validates KMS encryption usage; verifies audit trail completeness |
| **Cross-Service** | Validates API contracts between all 4 services; checks data flow consistency (e.g., `ChargePeriodStart` vs `BillingPeriodStart`); verifies shared constant parity |
| **Multi-Tenancy** | Checks `org_slug` validation at every entry point; verifies `requireOrgMembership()` in actions; audits parameterized queries; validates 6-layer isolation |
| **Reusability** | Flags duplicated formatters; checks for local functions that should use shared imports; validates DRY patterns across similar pages |

## Related Skills
- `security-audit` - Deep security analysis (6-layer multi-tenancy model)
- `test-orchestration` - Add tests for found bugs
- `config-validator` - Validate configurations
- `i18n-locale` - Currency, timezone, date format issues
- `notifications` - Alert processing bugs
