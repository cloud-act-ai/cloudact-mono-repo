# Bug Hunt - Test Plan

## Bug Hunt Skill Tests

Validation that the bug hunt skill operates correctly across all 10 categories, severity classifications, output formats, and cross-service tracing.

- **Skill file:** `.claude/skills/bug-hunt/SKILL.md`
- **Run:** `/bug-hunt <feature-name>` or `/bug-hunt <feature-name> --compact`

### Test Matrix (30 checks)

| # | Test | Type | Expected |
|---|------|------|----------|
| 1 | `/bug-hunt pipeline-setup` produces report | Execution | Bug report generated with 50 bugs |
| 2 | Report covers all 10 categories | Coverage | MT, IDEM, CRUD, ERR, SEC, PERF, SCALE, VAL, STATE, EDGE sections present |
| 3 | Each category has 5 bugs | Coverage | 5 bugs per category = 50 total |
| 4 | Every bug has file:line reference | Format | No bug without explicit file path and line number |
| 5 | Every bug has severity (CRITICAL/HIGH/MEDIUM/LOW) | Format | Severity tag present on every bug entry |
| 6 | Every bug has a concrete fix | Format | Fix section present with implementable code change |
| 7 | No feature suggestions in report | Quality | Zero entries like "Consider adding..." or "Refactor to..." |
| 8 | No theoretical concerns in report | Quality | Zero entries without file:line evidence |
| 9 | CRITICAL bugs are actual security/data issues | Severity | CRITICAL only for auth bypass, data leak, data loss, crash |
| 10 | HIGH bugs are actual broken functionality | Severity | HIGH only for data corruption or major feature breakage |
| 11 | MEDIUM bugs have workarounds | Severity | MEDIUM bugs are real but non-blocking |
| 12 | LOW bugs are truly minor | Severity | LOW bugs are cosmetic or rare edge cases |
| 13 | Frontend files checked (01-fronted-system) | Coverage | Bugs found in pages, components, actions, or hooks |
| 14 | API Service files checked (02-api-service) | Coverage | Bugs found in routers, services, or middleware |
| 15 | Pipeline Service files checked (03-data-pipeline-service) | Coverage | Bugs found in processors, executor, or engine |
| 16 | Multi-tenancy checks use `@org_slug` parameterized | Category | MT bugs check for parameterized queries, not string interpolation |
| 17 | Idempotency checks cover INSERT ON CONFLICT | Category | IDEM bugs check for upsert handling |
| 18 | Security checks cover SQL injection | Category | SEC bugs check for f-string SQL, .format SQL |
| 19 | Performance checks cover N+1 queries | Category | PERF bugs identify loop-based query patterns |
| 20 | Edge case checks cover empty/null handling | Category | EDGE bugs check for zero-length arrays, null inputs |
| 21 | `--compact` mode produces one-liner output | Format | Single line per bug: `ID [SEVERITY] file:line - description` |
| 22 | `--compact` mode includes severity breakdown header | Format | Header line: `BUG HUNT: feature | N bugs | C:X H:Y M:Z L:W` |
| 23 | Detailed mode groups bugs by category | Format | 10 numbered sections with category headers |
| 24 | Detailed mode includes summary table | Format | Final table with severity distribution |
| 25 | Cross-service data flow traced | Coverage | At least 1 bug traces Frontend -> API -> BigQuery path |
| 26 | Anti-pattern: hardcoded org_slug detected | Detection | Report flags literal org_slug strings in queries |
| 27 | Anti-pattern: missing WHERE clause detected | Detection | Report flags queries without org_slug filter |
| 28 | Anti-pattern: raw SQL with f-strings detected | Detection | Report flags string-interpolated SQL |
| 29 | Anti-pattern: missing x_* fields in pipeline detected | Detection | Report flags pipeline writes without lineage fields |
| 30 | Post-report TODO items created | Workflow | TODO items grouped by severity after report |

## Backend Tests

### Category Validation

Run bug hunt against known features and verify each category produces relevant findings.

```bash
# Test against pipeline-setup (covers all 3 services)
/bug-hunt pipeline-setup

# Verify:
# - MT-001 to MT-005: org_slug isolation in pipeline queries
# - IDEM-001 to IDEM-005: Pipeline retry safety
# - CRUD-001 to CRUD-005: Integration credential CRUD
# - ERR-001 to ERR-005: Pipeline failure handling
# - SEC-001 to SEC-005: Credential security, auth checks
# - PERF-001 to PERF-005: Query performance, N+1
# - SCALE-001 to SCALE-005: Concurrent pipeline execution
# - VAL-001 to VAL-005: Pipeline config input validation
# - STATE-001 to STATE-005: Pipeline state machine transitions
# - EDGE-001 to EDGE-005: Empty configs, boundary dates
```

### Severity Classification Validation

| Reported Severity | Validation Check | Expected |
|-------------------|------------------|----------|
| CRITICAL | Is it a security breach, data loss, or crash? | Yes, or downgrade |
| HIGH | Is core functionality broken (not just degraded)? | Yes, or downgrade |
| MEDIUM | Does the issue have a workaround? | Yes, or upgrade/downgrade |
| LOW | Is it cosmetic or extremely rare? | Yes, or upgrade |

### Cross-Service Tracing Validation

```bash
# Test with a feature that spans all 3 services
/bug-hunt integration-credentials

# Verify tracing covers:
# 1. Frontend: Integration setup page -> server action
# 2. API Service: Integration router -> KMS encryption -> BigQuery write
# 3. Pipeline Service: Credential decryption -> provider authentication
# 4. Cross-service: Missing org_slug at any layer, auth token propagation
```

### Anti-Pattern Detection Validation

```bash
# Check detection of known anti-patterns
/bug-hunt genai-costs

# Verify these are flagged if present:
# - f"SELECT ... WHERE org_slug = '{org_slug}'"  (SQL injection)
# - SELECT * FROM cost_data (no org_slug WHERE)
# - pipeline writes without x_org_slug, x_pipeline_id
# - except: pass (silent error swallowing)
# - API key logged in response body
```

### Output Format Validation

```bash
# Detailed mode
/bug-hunt quota-enforcement

# Verify:
# - Header: BUG HUNT REPORT: quota-enforcement
# - 10 category sections with headers
# - Each bug: ID, [SEVERITY], title, File:, Issue:, Impact:, Fix:
# - Summary table at end

# Compact mode
/bug-hunt quota-enforcement --compact

# Verify:
# - Single header line with counts
# - One line per bug
# - Format: MT-001 [C] file.py:234 - Missing org_slug filter
# - No category grouping
```

## Frontend Tests

Bug hunt itself does not have frontend tests, but frontend bugs found by bug hunt should be validated:

```bash
cd 01-fronted-system

# Run existing tests to verify found bugs are real
npm run test

# Run E2E tests for the audited feature
npx playwright test tests/e2e/{feature}.spec.ts

# Run type checking (catches many VAL-category bugs)
npx tsc --noEmit
```

## Post-Fix Validation

After "fix all" is executed, run the full test suite across all services:

```bash
# Frontend tests
cd 01-fronted-system && npm run test

# API Service tests
cd 02-api-service && source venv/bin/activate && python -m pytest tests/ -v

# Pipeline Service tests
cd 03-data-pipeline-service && source venv/bin/activate && python -m pytest tests/ -v

# E2E tests (if applicable)
cd 01-fronted-system && npx playwright test
```

## Manual Verification Checklist

| Check | How | Expected |
|-------|-----|----------|
| Report covers 3 services | Review file paths in bugs | Files from 01/, 02/, 03/ directories |
| All 10 categories populated | Count category sections | 10 sections, each with bugs |
| CRITICAL bugs verified | Read each CRITICAL bug | Actual security/data/crash issue |
| No false positives | Spot-check 5 random bugs | Each bug exists at reported file:line |
| File:line references valid | Open 5 reported files at line numbers | Code matches described issue |
| Fixes are implementable | Review 5 fix suggestions | Each fix is a concrete code change |
| No feature suggestions | Search report for "Consider", "Suggest", "Add new" | Zero matches |
| Compact mode is compact | Run with `--compact` | One line per bug, header + list only |
| Detailed mode has structure | Run without `--compact` | Category headers, full bug details |
| Post-fix tests pass | Run test suites after fixes | Zero regressions |
| Severity not inflated | Compare CRITICAL count to actual security bugs | CRITICAL count <= actual security issues |
| Cross-org isolation checked | Look for MT-* bugs | org_slug checks present in MT section |
| x_* field checks present | Look for pipeline bugs | Pipeline writes checked for lineage fields |
| Anti-patterns detected | Look for known bad patterns | f-string SQL, missing WHERE flagged if present |

## SDLC Verification

| Phase | Check | Expected |
|-------|-------|----------|
| Pre-release | Bug hunt run before tagging release | Report generated with severity breakdown |
| Prioritization | CRITICAL and HIGH bugs addressed first | Zero CRITICAL bugs remaining before release |
| Fix cycle | "Fix all" applies all reported fixes | All TODO items marked complete |
| Regression | Test suites pass after all fixes | 100% existing tests pass |
| Re-audit | Re-run bug hunt after fixes | Previously reported bugs no longer appear |
| Documentation | Accepted risks documented for deferred LOW bugs | Known limitations section updated |

## Pass Criteria

| Criteria | Target |
|----------|--------|
| All 10 categories have findings | 10/10 categories populated |
| 50-bug target reached | 45-50 bugs per audit (90%+ of target) |
| Every bug has file:line | 100% with valid file path and line number |
| Every bug has severity tag | 100% classified as CRITICAL/HIGH/MEDIUM/LOW |
| Every bug has concrete fix | 100% with implementable code change |
| Zero feature suggestions | 0 entries that suggest new features |
| Zero theoretical concerns | 0 entries without code evidence |
| CRITICAL severity accurate | 100% of CRITICAL bugs are actual security/data/crash issues |
| Cross-service coverage | Bugs found in at least 2 of 3 services |
| Post-fix tests pass | 100% of existing tests pass after "fix all" |
| Compact mode works | One-liner format with severity breakdown header |
| Detailed mode works | Grouped by category with full analysis per bug |

## Known Limitations

1. **50-bug target is aspirational**: Some features may have fewer than 50 genuine bugs. The skill should report only real bugs, not pad the count with marginal findings. A report with 30 real bugs is better than 50 with 20 false positives.
2. **File:line accuracy depends on code state**: If code has been modified since the last git pull, line numbers in the report may be off by a few lines. Always verify against current code.
3. **Cross-service tracing requires all services running**: Some bugs only manifest when data flows across services. Static analysis may miss runtime-only issues.
4. **No automated execution**: Bug hunt requires Claude agent context. It cannot be run as a standalone CLI tool or in CI/CD pipelines.
5. **Fix constraints may limit solutions**: The "no new dependencies" and "no new caching" constraints mean some performance bugs can only be partially addressed with existing tools.
6. **Pipeline service requires x_* field knowledge**: Accurately checking for missing lineage fields requires understanding the x_* field contract defined in CLAUDE.md.
7. **Frontend bugs may require browser context**: Some edge case bugs (timezone, unicode rendering) may not be detectable through static code analysis alone.
8. **Severity classification is subjective**: The boundary between HIGH and MEDIUM depends on the feature's criticality. A MEDIUM bug in billing could be HIGH in a less critical feature.
