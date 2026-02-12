# Bug Hunt - Requirements

## Overview

Advanced bug hunting skill for CloudAct that systematically finds real, actionable bugs across all three services (Frontend, API, Pipeline). Targets 50 bugs per feature audit across 10 categories with severity classification. Only reports bugs that exist in current code with file:line references and concrete fixes. No theoretical concerns, no feature suggestions, no over-engineering recommendations.

## Source Specifications

Defined in SKILL.md (`bug-hunt/SKILL.md`). No external specification document.

---

## Architecture

```
+---------------------------------------------------------------------------+
|                        Bug Hunt Analysis Flow                              |
+---------------------------------------------------------------------------+
|                                                                            |
|  INPUT: /bug-hunt <feature-name> [--compact]                               |
|                                                                            |
|  STEP 1: Locate Feature Files                                              |
|  ----------------------------                                              |
|  Search all 3 services for feature-related files:                          |
|  +-- 01-fronted-system/  (Pages, Components, Actions, Hooks, Tests)        |
|  +-- 02-api-service/     (Routers, Services, Models, Middleware)            |
|  +-- 03-data-pipeline-service/ (Processors, Engine, Configs)               |
|                                                                            |
|  STEP 2: Trace Data Flow                                                   |
|  -----------------------                                                   |
|  Frontend -> Server Action -> API Service -> BigQuery                      |
|                                          -> Pipeline Service -> BigQuery   |
|  Check at each layer:                                                      |
|  +-- Input validation, auth state, error handling, orgSlug context         |
|  +-- Auth bypass, rate limit, org_slug isolation                           |
|  +-- Business logic, transactions, idempotency                             |
|  +-- Race conditions, retry safety, x_* field presence                     |
|                                                                            |
|  STEP 3: Apply 10-Category Checklist (5 bugs each = 50 total)             |
|  -------------------------------------------------------------             |
|  1. Multi-Tenancy    (org_slug isolation)                                  |
|  2. Idempotency      (retry safety)                                        |
|  3. CRUD Operations  (data integrity)                                      |
|  4. Error Handling   (failure modes)                                        |
|  5. Security         (auth, injection, leaks)                              |
|  6. Performance      (N+1, unbounded, sync I/O)                           |
|  7. Scaling          (race conditions, pools, memory)                      |
|  8. Input Validation (types, bounds, sanitization)                         |
|  9. State Management (caches, transactions, consistency)                   |
|  10. Edge Cases      (empty lists, timezone, unicode)                      |
|                                                                            |
|  OUTPUT: Bug report with severity, file:line, fix                          |
|  +-- Detailed mode: full analysis per bug                                  |
|  +-- Compact mode:  one-liner per bug (table format)                       |
|                                                                            |
+---------------------------------------------------------------------------+
```

---

## Functional Requirements

### FR-BH-001: Bug Categories (10 categories, 5 bugs each)

#### Category 1: Multi-Tenancy (MT-001 to MT-005)

- **FR-BH-001.1**: Check all BigQuery queries for `WHERE org_slug = @org_slug` (parameterized, not string-interpolated)
- **FR-BH-001.2**: Check JOINs for cross-org data leakage (missing org_slug filter on joined table)
- **FR-BH-001.3**: Check caches for org_slug namespace isolation
- **FR-BH-001.4**: Check background jobs for org_slug context propagation
- **FR-BH-001.5**: Check file paths and storage for org_slug isolation

#### Category 2: Idempotency (IDEM-001 to IDEM-005)

- **FR-BH-001.6**: Check INSERTs for ON CONFLICT handling
- **FR-BH-001.7**: Check for side effects on retry (duplicate emails, duplicate webhooks)
- **FR-BH-001.8**: Check APIs for idempotency key support
- **FR-BH-001.9**: Check state changes for version/ETag checks
- **FR-BH-001.10**: Check event processing for duplicate detection

#### Category 3: CRUD Operations (CRUD-001 to CRUD-005)

- **FR-BH-001.11**: Check for missing foreign key validation on related entities
- **FR-BH-001.12**: Check for orphan records on DELETE (cascading not configured)
- **FR-BH-001.13**: Check UPDATE statements for missing WHERE clauses
- **FR-BH-001.14**: Check for missing NOT NULL constraints on required fields
- **FR-BH-001.15**: Check for stale reads after writes (read-your-writes consistency)

#### Category 4: Error Handling (ERR-001 to ERR-005)

- **FR-BH-001.16**: Check for bare `except:` or `except Exception:` catching everything
- **FR-BH-001.17**: Check for silent failures (empty catch blocks, swallowed errors)
- **FR-BH-001.18**: Check for internal error details leaked to client responses
- **FR-BH-001.19**: Check for missing rollback on partial failure (multi-step operations)
- **FR-BH-001.20**: Check for incorrect HTTP status codes (200 on error, 500 on validation)

#### Category 5: Security (SEC-001 to SEC-005)

- **FR-BH-001.21**: Check for SQL injection via string formatting (f-strings, .format, %)
- **FR-BH-001.22**: Check for auth bypass in edge cases (expired tokens, missing headers)
- **FR-BH-001.23**: Check for credentials in logs, error responses, or client-side code
- **FR-BH-001.24**: Check for missing rate limiting on sensitive endpoints
- **FR-BH-001.25**: Check for IDOR (Insecure Direct Object Reference) on resource access

#### Category 6: Performance (PERF-001 to PERF-005)

- **FR-BH-001.26**: Check for N+1 queries in loops (fetching related data one by one)
- **FR-BH-001.27**: Check for missing database indexes on frequently queried columns
- **FR-BH-001.28**: Check for unbounded result sets (no LIMIT, no pagination)
- **FR-BH-001.29**: Check for synchronous I/O in async context (blocking event loop)
- **FR-BH-001.30**: Check for redundant API calls (same data fetched multiple times)

#### Category 7: Scaling (SCALE-001 to SCALE-005)

- **FR-BH-001.31**: Check for race conditions without locks (concurrent modifications)
- **FR-BH-001.32**: Check for connection pool exhaustion (unclosed clients)
- **FR-BH-001.33**: Check for memory leaks (unbounded lists, growing dicts)
- **FR-BH-001.34**: Check for missing pagination on list endpoints
- **FR-BH-001.35**: Check for single-threaded bottlenecks on CPU-intensive operations

#### Category 8: Input Validation (VAL-001 to VAL-005)

- **FR-BH-001.36**: Check for missing type validation on API inputs
- **FR-BH-001.37**: Check for missing boundary checks (min/max values, string lengths)
- **FR-BH-001.38**: Check for unhandled null/undefined values
- **FR-BH-001.39**: Check for missing string sanitization (XSS, path traversal)
- **FR-BH-001.40**: Check for invalid enum values accepted without validation

#### Category 9: State Management (STATE-001 to STATE-005)

- **FR-BH-001.41**: Check for stale cache reads (cache invalidation missing)
- **FR-BH-001.42**: Check for transaction isolation issues (dirty reads, phantom reads)
- **FR-BH-001.43**: Check for inconsistent state after errors (partial updates committed)
- **FR-BH-001.44**: Check for missing state transitions (status field jumps)
- **FR-BH-001.45**: Check for concurrent modification conflicts (last-write-wins without detection)

#### Category 10: Edge Cases (EDGE-001 to EDGE-005)

- **FR-BH-001.46**: Check for empty array/list handling (zero results, empty input)
- **FR-BH-001.47**: Check for timezone/date boundary issues (UTC vs local, day boundaries)
- **FR-BH-001.48**: Check for unicode/special character bugs (org names, descriptions)
- **FR-BH-001.49**: Check for max length/size violations (payload limits, field truncation)
- **FR-BH-001.50**: Check for first/last item special cases (off-by-one, boundary conditions)

### FR-BH-002: Severity Classification

| Severity | Criteria | Examples |
|----------|----------|----------|
| **CRITICAL** | Security breach, data loss, system crash | Auth bypass, SQL injection, cross-org data leakage, data deletion without confirmation |
| **HIGH** | Data corruption, major functionality broken | Duplicate records, incorrect cost calculations, broken pipeline execution |
| **MEDIUM** | Feature partially broken, workaround exists | Missing validation, poor error messages, non-blocking UI issues |
| **LOW** | Minor issues, cosmetic, rare edge cases | UI glitch under unusual conditions, rare timezone edge case |

### FR-BH-003: Service Coverage

- **FR-BH-003.1**: Frontend (01-fronted-system): Pages, components, server actions, hooks, API clients
- **FR-BH-003.2**: API Service (02-api-service): Routers, services, middleware, models, BigQuery client
- **FR-BH-003.3**: Pipeline Service (03-data-pipeline-service): Processors, executor, engine, configs
- **FR-BH-003.4**: Cross-service: Data flow tracing from frontend through API to BigQuery and back

### FR-BH-004: Anti-Pattern Detection

| Anti-Pattern | What to Flag |
|-------------|-------------|
| Hardcoded org_slug | Any literal org slug string instead of parameterized `@org_slug` |
| Missing WHERE clause | BigQuery queries without org_slug filter |
| Raw SQL with f-strings | String interpolation in SQL queries instead of parameterized queries |
| Unvalidated input | API endpoints accepting input without Pydantic model validation |
| Bare except | `except:` or `except Exception:` without specific exception types |
| Credentials in logs | API keys, tokens, or secrets written to log output |
| Missing x_* fields | Pipeline writes without required lineage metadata fields |
| Unbounded queries | SELECT without LIMIT on potentially large tables |

### FR-BH-005: Output Formats

#### Detailed Mode (default)

- **FR-BH-005.1**: Full bug report header with feature name, total count, severity breakdown
- **FR-BH-005.2**: Bugs grouped by category (10 sections)
- **FR-BH-005.3**: Each bug includes: ID, severity, title, file:line, issue description, impact, fix
- **FR-BH-005.4**: Summary table at the end with severity distribution

#### Compact Mode (--compact)

- **FR-BH-005.5**: One-line header with feature name, total count, severity breakdown
- **FR-BH-005.6**: One line per bug: `ID [SEVERITY] file:line - description`
- **FR-BH-005.7**: No grouping by category; flat list sorted by severity

### FR-BH-006: Post-Report Actions

- **FR-BH-006.1**: After generating report, create TODO items grouped by severity
- **FR-BH-006.2**: On "fix all" command, apply ALL fixes (no phased approach, no skipping)
- **FR-BH-006.3**: Run tests for all 3 services after fixes applied
- **FR-BH-006.4**: Validate no existing functionality broken by fixes

### FR-BH-007: Fix Constraints

- **FR-BH-007.1**: No new tools or infrastructure (use only existing: KMS, BigQuery, Supabase)
- **FR-BH-007.2**: No new caching layers (no Redis, no LRU cache additions)
- **FR-BH-007.3**: No new dependencies (no pip/npm packages added)
- **FR-BH-007.4**: Follow existing codebase patterns only
- **FR-BH-007.5**: Only report bugs that have a concrete, implementable fix

---

## SDLC: Development Workflow

### When to Run Bug Hunt

```
1. Pre-release audit:    /bug-hunt <feature> before tagging a release
2. After major changes:  /bug-hunt <feature> after significant refactoring
3. Code review support:  /bug-hunt <feature> --compact for quick PR review
4. Quality gate:         /bug-hunt <feature> as part of QA checklist
```

### Bug Hunt in the Release Cycle

```
1. Developer completes feature branch
2. Run: /bug-hunt <feature-name>
3. Review report: prioritize CRITICAL and HIGH severity
4. Fix all reported bugs (or document accepted risks for LOW)
5. Re-run: /bug-hunt <feature-name> to verify fixes
6. Run test suites:
   - cd 01-fronted-system && npm run test
   - cd 02-api-service && python -m pytest tests/ -v
   - cd 03-data-pipeline-service && python -m pytest tests/ -v
7. Merge to main (triggers stage deploy)
8. Tag release (triggers prod deploy)
```

### CI/CD Integration

- Bug hunt is a manual skill invoked by the developer or Claude agent
- Not integrated into automated CI/CD pipelines (requires Claude agent context)
- Results can be captured in PR comments or issue trackers
- Recommended as a pre-merge gate for features touching security or multi-tenancy

### Testing Approach

- Bug hunt itself is validated by checking that each category produces findings
- Fix verification uses existing test suites (pytest, Playwright, vitest)
- Post-fix regression testing runs all 3 service test suites
- No separate test infrastructure needed for bug hunt

---

## Non-Functional Requirements

### NFR-BH-001: Accuracy

| Standard | Implementation |
|----------|----------------|
| Real bugs only | Every reported bug must exist in current code |
| File:line reference | Every bug must specify exact file path and line number |
| Concrete fix | Every bug must include an implementable fix (not vague suggestion) |
| No false positives | Do not report working code as buggy |
| No feature requests | Never suggest new features or architectural changes |

### NFR-BH-002: Coverage

| Standard | Implementation |
|----------|----------------|
| 3-service coverage | Frontend, API, and Pipeline all checked per feature |
| 10-category checklist | All 10 bug categories applied systematically |
| 50-bug target | Target 50 bugs per audit (5 per category) |
| Cross-service tracing | Data flow traced end-to-end across services |

### NFR-BH-003: Severity Rigor

| Standard | Implementation |
|----------|----------------|
| CRITICAL = data/security | Only security breaches, data loss, or system crashes |
| HIGH = broken functionality | Data corruption or major features non-functional |
| MEDIUM = partial breakage | Feature works but with issues; workaround exists |
| LOW = cosmetic/rare | Minor issues unlikely to affect most users |
| No severity inflation | Do not mark MEDIUM bugs as HIGH for emphasis |

### NFR-BH-004: Fix Quality

| Standard | Implementation |
|----------|----------------|
| Existing patterns | Fixes follow codebase conventions |
| No new dependencies | Fixes use only existing tools and libraries |
| Tests preserved | Fixes do not break existing tests |
| Minimal change | Smallest possible diff to fix the bug |

---

## Key Files

| File | Purpose |
|------|---------|
| `01-fronted-system/app/[orgSlug]/` | Frontend org-scoped pages (bug hunt targets) |
| `01-fronted-system/actions/` | Server actions (bug hunt targets) |
| `01-fronted-system/lib/api/backend.ts` | API client (data flow tracing) |
| `02-api-service/src/app/routers/` | API endpoints (bug hunt targets) |
| `02-api-service/src/core/services/` | Business logic (bug hunt targets) |
| `02-api-service/src/core/security/` | Security layer (critical audit area) |
| `03-data-pipeline-service/src/core/processors/` | Data processors (bug hunt targets) |
| `03-data-pipeline-service/src/core/pipeline/executor.py` | Pipeline execution (race conditions, idempotency) |
| `03-data-pipeline-service/src/core/engine/bigquery_engine.py` | BigQuery operations (SQL injection, org isolation) |

---

## Feature-to-Files Quick Reference

| Feature | Frontend | API Service | Pipeline Service |
|---------|----------|-------------|------------------|
| pipeline-setup | `app/[orgSlug]/integrations/` | `routers/integrations.py` | `routers/pipelines.py`, `pipeline/executor.py` |
| quota-enforcement | `components/quota/` | `routers/quota.py` | `middleware/quota.py` |
| subscription-billing | `app/[orgSlug]/subscriptions/` | `routers/subscriptions.py` | `configs/subscription/` |
| org-onboarding | `app/[orgSlug]/onboarding/` | `routers/organizations.py` | N/A |
| integration-credentials | `components/integrations/` | `routers/integrations.py` | `processors/*/authenticator.py` |
| hierarchy | `app/[orgSlug]/settings/hierarchy/` | `routers/hierarchy.py` | N/A |
| genai-costs | `app/[orgSlug]/costs/` | `routers/costs.py` | `processors/genai/*.py` |
| cloud-provider | `app/[orgSlug]/integrations/cloud-providers/` | `routers/integrations.py` | `processors/cloud/` |

---

## Related Skills

| Skill | Relationship |
|-------|-------------|
| `/security-audit` | Deep security-focused analysis. Bug hunt covers security as 1 of 10 categories; security-audit goes deeper. |
| `/test-orchestration` | Add tests for found bugs. After bug hunt, use test-orchestration to write regression tests. |
| `/config-validator` | Validate configurations. Bug hunt may find config-related bugs that config-validator prevents. |
| `/pr-review` | PR code review. Bug hunt provides deeper audit; pr-review is lighter per-PR check. |
| `/frontend-dev` | Frontend patterns. Bug hunt checks frontend code against CloudAct conventions. |
| `/api-dev` | API patterns. Bug hunt checks API code against FastAPI and BigQuery conventions. |
| `/pipeline-ops` | Pipeline operations. Bug hunt checks pipeline processors for x_* fields and idempotency. |
