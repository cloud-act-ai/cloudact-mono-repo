# PR Review - Test Plan

## Review Validation Tests

PR review validation via GitHub CLI and local test execution:
- **Skill definition:** `.claude/skills/pr-review/SKILL.md`
- **CI triggers:** `04-inra-cicd-automation/CICD/triggers/cloudbuild-stage.yaml`, `cloudbuild-prod.yaml`
- **Run review:** `gh pr view PR_NUMBER --repo cloud-act-ai/cloudact-mono-repo`

### Test Matrix (25 checks)

| # | Test | Type | Expected |
|---|------|------|----------|
| 1 | Fetch PR diff via `gh pr diff` | CLI | Full diff returned with additions/deletions |
| 2 | Count total deletions across all files | Analysis | Accurate line count extracted from diff |
| 3 | Flag PR with >500 total deleted lines | Deletion | CRITICAL REVIEW flag raised |
| 4 | Flag single file with >100 deleted lines | Deletion | WARNING flag raised per file |
| 5 | Block deletion of `components/ui/` core files | Deletion | BLOCK status, merge prevented |
| 6 | Block deletion of `CLAUDE.md` | Deletion | BLOCK status, merge prevented |
| 7 | Detect `.env` file in PR diff | Security | Immediate BLOCK, removal required |
| 8 | Detect `sk_live_` pattern in diff | Security | Immediate BLOCK, key rotation flagged |
| 9 | Detect hardcoded `password =` in code | Security | Immediate BLOCK |
| 10 | Flag auth.ts / auth.py changes | Security | Security review required |
| 11 | Flag webhook handler changes | Security | Security review required |
| 12 | Flag KMS encryption file changes | Security | Security review required |
| 13 | Detect API router path changes | Breaking | Breaking change flagged |
| 14 | Detect DB column removal in migration | Breaking | Rollback plan required |
| 15 | Detect new required env var | Breaking | `.env.example` update required |
| 16 | Brand color `#90FCA6` not removed from globals.css | Brand | Brand compliance confirmed |
| 17 | Brand color `#FF6B6B` not removed from globals.css | Brand | Brand compliance confirmed |
| 18 | Logo file changes flagged for approval | Brand | Explicit approval required |
| 19 | Marketing copy changes detected | Brand | Review flagged |
| 20 | Frontend tests pass before merge | Test Gate | `npm run test` exits 0 |
| 21 | API service tests pass before merge | Test Gate | `pytest tests/ -v` exits 0 |
| 22 | Pipeline service tests pass before merge | Test Gate | `pytest tests/ -v` exits 0 |
| 23 | E2E tests pass when UI changes detected | Test Gate | `npx playwright test` exits 0 |
| 24 | Squash merge with conventional commit | Merge | Clean single commit on main |
| 25 | Source branch deleted after merge | Merge | Branch no longer exists on remote |

## Backend Tests

### Frontend Test Suite

```bash
cd 01-fronted-system
npm run test
```

| Domain | Description | Tests |
|--------|-------------|-------|
| Components | UI component unit tests | Jest/Vitest suite |
| Pages | Page rendering tests | Route validation |
| Actions | Server action tests | Stripe, onboarding, billing |

### API Service Test Suite

```bash
cd 02-api-service
source venv/bin/activate

# Quick validation (no integration tests)
python -m pytest tests/ -v -m "not integration" --tb=short

# Full validation with coverage
python -m pytest tests/ -v --cov=src
```

| Domain | File | Tests |
|--------|------|-------|
| Bootstrap | `tests/test_bootstrap.py` | Meta table creation, idempotency, sync |
| Organizations | `tests/test_organizations.py` | Onboard, dryrun, status, slug validation |
| Integrations | `tests/test_integrations.py` | Provider setup, credential encryption |
| Security | `tests/test_security.py` | Auth checks, key validation |

### Pipeline Service Test Suite

```bash
cd 03-data-pipeline-service
source venv/bin/activate

# Quick validation (no integration tests)
python -m pytest tests/ -v -m "not integration" --tb=short

# Full validation with coverage
python -m pytest tests/ -v --cov=src
```

| Domain | File | Tests |
|--------|------|-------|
| Processors | `tests/test_processors/` | Provider-specific processing logic |
| Pipelines | `tests/test_pipelines/` | Pipeline execution, state machine |
| Configs | `tests/test_configs/` | Config validation, schema checks |

### E2E Test Suite (UI changes only)

```bash
cd 01-fronted-system

# Run all E2E tests
npx playwright test

# Run specific E2E test file
npx playwright test tests/e2e/dashboard.spec.ts
npx playwright test tests/e2e/settings.spec.ts
npx playwright test tests/e2e/costs.spec.ts
```

| Domain | File | Tests |
|--------|------|-------|
| Dashboard | `tests/e2e/dashboard.spec.ts` | Dashboard load, navigation |
| Settings | `tests/e2e/settings.spec.ts` | Settings pages, form submission |
| Billing | `tests/e2e/billing.spec.ts` | Billing display, plan info |
| Costs | `tests/e2e/costs.spec.ts` | Cost views, date ranges |
| Analytics | `tests/e2e/analytics.spec.ts` | Analytics charts, filters |
| Pipelines | `tests/e2e/pipelines.spec.ts` | Pipeline list, status display |
| Notifications | `tests/e2e/notifications.spec.ts` | Notification management |

## Deletion Detection Tests

| Test | Command | Expected |
|------|---------|----------|
| Count total deletions | `gh pr diff PR_NUMBER \| grep -c "^-[^-]"` | Numeric count of deleted lines |
| Files with >100 deletions | `gh pr view PR_NUMBER --json files --jq '.files[] \| select(.deletions > 100)'` | List of flagged files |
| Protected file deletion check | Scan diff for removed protected paths | BLOCK if protected file deleted |
| Net change analysis | Compare total additions vs deletions | Positive = growth, negative = reduction |

## Security Review Tests

| Test | Command | Expected |
|------|---------|----------|
| Scan for .env files | `gh pr diff PR_NUMBER \| grep -E "^\+\+\+ b/.*\.env"` | No matches (BLOCK if found) |
| Scan for Stripe keys | `gh pr diff PR_NUMBER \| grep -E "sk_live_\|pk_live_"` | No matches (BLOCK if found) |
| Scan for hardcoded secrets | `gh pr diff PR_NUMBER \| grep -iE "password\s*=\s*['\"]"` | No matches (BLOCK if found) |
| Auth file change detection | `gh pr view PR_NUMBER --json files --jq '.files[].path' \| grep -E "auth\.(ts\|py)"` | Flagged for security review |

## Brand Protection Tests

| Test | Command | Expected |
|------|---------|----------|
| globals.css changes | `gh pr diff PR_NUMBER -- 01-fronted-system/app/globals.css` | Brand review if changed |
| Mint color preserved | `grep "#90FCA6" 01-fronted-system/app/globals.css` | Color present in file |
| Coral color preserved | `grep "#FF6B6B" 01-fronted-system/app/globals.css` | Color present in file |
| Logo changes detected | `gh pr view PR_NUMBER --json files --jq '.files[].path' \| grep -E "\.(svg\|png\|ico)$"` | Flagged for approval |

## CI/CD Integration Tests

| Test | Command | Expected |
|------|---------|----------|
| Cloud Build stage trigger exists | `cat 04-inra-cicd-automation/CICD/triggers/cloudbuild-stage.yaml` | Valid YAML with main push trigger |
| Cloud Build prod trigger exists | `cat 04-inra-cicd-automation/CICD/triggers/cloudbuild-prod.yaml` | Valid YAML with v* tag trigger |
| Stage health after merge | `./quick/status.sh stage` | All 3 services healthy |
| PR checks status | `gh pr checks PR_NUMBER --repo cloud-act-ai/cloudact-mono-repo` | All checks pass |

## Manual Verification Checklist

| Check | How | Expected |
|-------|-----|----------|
| Review catches large deletions | Create PR with >500 deleted lines | CRITICAL flag in review output |
| Security files flagged | Modify `auth.ts` in a PR | Security review comment added |
| Tests run before merge | Attempt merge without tests | Merge blocked until tests pass |
| Brand colors enforced | Change `#90FCA6` in globals.css | Brand review flag raised |
| Squash merge works | Merge PR with 3 commits | Single squash commit on main |
| Branch deleted after merge | Merge PR, check remote branches | Source branch removed |
| Stage auto-deploys | Push to main after merge | Cloud Build triggers, stage updated |
| Conventional commit format | Check merge commit message | Follows `type(scope): description` |
| Danger pattern blocks merge | Add `.env` file to PR | BLOCK status, cannot merge |
| Auto-approve docs-only PR | PR with only `.md` file changes | Marked as auto-approve candidate |

## Pass Criteria

| Criteria | Target |
|----------|--------|
| Deletion detection accuracy | 100% -- all >500 line deletions flagged |
| Security file detection | 100% -- all auth/KMS/webhook changes flagged |
| Danger pattern detection | 100% -- all .env/secret patterns blocked |
| Test gate enforcement | 100% -- no merge without passing tests |
| Brand color enforcement | 100% -- #90FCA6 and #FF6B6B changes flagged |
| Squash merge consistency | 100% -- all merges use squash with conventional commits |
| False positive rate (brand) | < 10% -- only actual brand changes flagged |
| Review pipeline completion | < 10 min for standard PRs (< 50 files) |

## Known Limitations

1. **Test execution environment**: Frontend tests require `node_modules` installed; API/pipeline tests require activated virtualenvs. Tests will fail if dependencies are not installed.
2. **E2E test flakiness**: Playwright E2E tests may have intermittent failures in headless mode due to timing; re-run once before treating as genuine failure.
3. **Brand color detection**: Only checks exact hex matches (`#90FCA6`, `#FF6B6B`). Does not detect equivalent RGB/HSL representations or CSS variable indirection.
4. **Secret scanning**: Pattern-based scanning may miss obfuscated or base64-encoded secrets. Not a replacement for dedicated secret scanning tools (e.g., GitHub secret scanning, gitleaks).
5. **Cross-service breaking changes**: Detection focuses on individual service changes. Cross-service contract breaks (e.g., API changes that break frontend) require manual review of both sides.
6. **Auto-approve scope**: Auto-approve candidates are recommended, not auto-merged. A human or agent must still execute the merge command.
7. **Large PRs**: PRs with >100 files may exceed diff analysis performance targets. Consider splitting into smaller PRs.
8. **Offline testing**: `gh` CLI commands require GitHub authentication and network access. Review skill cannot operate offline.
