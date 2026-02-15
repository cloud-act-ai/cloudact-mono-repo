---
name: pr-review
description: |
  PR review, validation, and merge for CloudAct. Automated code review, test execution, and safe merging.
  Use when: reviewing PRs, validating changes before merge, running PR checks, ensuring code quality,
  detecting breaking changes, or managing pull requests in the cloud-act-ai organization.
---

# PR Review & Merge

## Overview

Comprehensive PR review skill for the CloudAct monorepo. Performs automated code review, detects breaking changes, runs tests, and safely merges PRs.

## Repository Info

| Property | Value |
|----------|-------|
| **Organization** | `cloud-act-ai` |
| **Repository** | `cloudact-mono-repo` |
| **Main Branch** | `main` |
| **Protected Files** | Brand assets, auth configs, core schemas |

## Key Review Checks

### 1. Drastic Deletion Detection

**CRITICAL:** Flag any PR that deletes significant code without replacement.

```bash
# Thresholds for warnings
- >100 lines deleted in single file → WARNING
- >500 lines total deleted → CRITICAL REVIEW
- Core file deleted entirely → BLOCK
```

**Protected from deletion:**
- `01-fronted-system/components/ui/` - Core UI components
- `02-api-service/src/app/core/` - Core API logic
- `03-data-pipeline-service/src/core/` - Core pipeline logic
- `**/CLAUDE.md` - Architecture documentation
- `version.json` - Version tracking

### 2. Brand Protection

**Files requiring brand review:**
```
01-fronted-system/
├── app/globals.css              # Brand colors
├── app/layout.tsx               # Logo, metadata
├── components/marketing/        # Landing page
├── components/ui/               # Design system
├── public/                      # Assets
└── tailwind.config.ts           # Theme config
```

**Brand rules:**
- Primary: `#0F172A` (slate-900), `#3B82F6` (blue-500)
- NO mint/teal as primary colors
- Logo changes require explicit approval
- Marketing copy changes flagged for review

### 3. Security-Sensitive Files

**Require security review:**
```
- **/auth.ts, auth.py            # Auth logic
- **/middleware.ts               # Request guards
- **/kms_encryption.py           # Encryption
- **/dependencies/auth.py        # Auth deps
- **/api/webhooks/**             # Webhook handlers
- **/.env*, **/secrets.yaml      # Secrets (should NOT be in PR)
```

### 4. Breaking Change Detection

**API breaking changes:**
```python
# Detect in 02-api-service/
- Router path changes
- Response schema changes
- Required field additions
- Auth requirement changes
```

**Database breaking changes:**
```sql
# Detect in migrations/
- Column removal
- Type changes
- NOT NULL additions without defaults
- Index removal on critical columns
```

## Instructions

### 1. Review a PR

```bash
# Get PR details (replace PR_NUMBER)
gh pr view PR_NUMBER --repo cloud-act-ai/cloudact-mono-repo

# Get changed files
gh pr diff PR_NUMBER --repo cloud-act-ai/cloudact-mono-repo

# Get file-level changes summary
gh pr view PR_NUMBER --repo cloud-act-ai/cloudact-mono-repo --json files
```

### 2. Run Deletion Analysis

```bash
# Check deletion stats for a PR
gh pr diff PR_NUMBER --repo cloud-act-ai/cloudact-mono-repo | grep -E "^-" | wc -l

# Get files with large deletions
gh pr view PR_NUMBER --repo cloud-act-ai/cloudact-mono-repo --json files \
  --jq '.files[] | select(.deletions > 100) | "\(.path): -\(.deletions) lines"'
```

### 3. Run Tests Before Merge

```bash
# === QUICK VALIDATION (run these first) ===

# Frontend tests
cd 01-fronted-system && npm run test

# API service tests (fast, no integration)
cd 02-api-service && python -m pytest tests/ -v -m "not integration" --tb=short

# Pipeline service tests (fast, no integration)
cd 03-data-pipeline-service && python -m pytest tests/ -v -m "not integration" --tb=short


# === FULL VALIDATION (before production merge) ===

# All API tests with coverage
cd 02-api-service && python -m pytest tests/ -v --cov=src

# All pipeline tests with coverage
cd 03-data-pipeline-service && python -m pytest tests/ -v --cov=src

# E2E tests (if changes affect UI)
cd 01-fronted-system && npx playwright test
```

### 4. Check PR Status

```bash
# CI status
gh pr checks PR_NUMBER --repo cloud-act-ai/cloudact-mono-repo

# Review status
gh pr view PR_NUMBER --repo cloud-act-ai/cloudact-mono-repo --json reviews

# Merge requirements
gh pr view PR_NUMBER --repo cloud-act-ai/cloudact-mono-repo --json mergeable,mergeStateStatus
```

### 5. Approve and Merge

```bash
# Add review comment
gh pr review PR_NUMBER --repo cloud-act-ai/cloudact-mono-repo --comment -b "Review feedback here"

# Approve PR
gh pr review PR_NUMBER --repo cloud-act-ai/cloudact-mono-repo --approve -b "LGTM - tests pass, no breaking changes"

# Merge PR (squash recommended)
gh pr merge PR_NUMBER --repo cloud-act-ai/cloudact-mono-repo --squash --delete-branch

# Merge with specific commit message
gh pr merge PR_NUMBER --repo cloud-act-ai/cloudact-mono-repo --squash \
  --subject "feat: Add new feature" \
  --body "Closes #123"
```

### 6. Request Changes

```bash
# Request changes with detailed feedback
gh pr review PR_NUMBER --repo cloud-act-ai/cloudact-mono-repo --request-changes \
  -b "Changes requested:

- [ ] Fix: Large deletion in auth.py needs justification
- [ ] Add: Tests for new endpoint
- [ ] Update: CLAUDE.md with new architecture"
```

## Review Checklist

### Pre-Merge Validation

```markdown
## Code Review
- [ ] No drastic deletions (>500 lines) without justification
- [ ] Brand files unchanged OR approved
- [ ] Security files reviewed by maintainer
- [ ] No secrets/credentials in diff
- [ ] CLAUDE.md updated if architecture changed

## Tests
- [ ] Frontend tests pass (`npm run test`)
- [ ] API tests pass (`pytest tests/ -v`)
- [ ] Pipeline tests pass (`pytest tests/ -v`)
- [ ] E2E tests pass (if UI changes)

## Breaking Changes
- [ ] No API endpoint removals
- [ ] No response schema breaking changes
- [ ] No auth requirement changes
- [ ] Migration includes rollback plan

## Documentation
- [ ] README updated (if needed)
- [ ] API docs updated (if endpoints changed)
- [ ] CLAUDE.md updated (if architecture changed)
```

## Automated Review Process

When reviewing a PR, follow this sequence:

```
1. FETCH PR INFO
   ├─ gh pr view PR_NUMBER
   ├─ gh pr diff PR_NUMBER
   └─ gh pr view PR_NUMBER --json files,additions,deletions

2. ANALYZE CHANGES
   ├─ Check deletion count (warn if >500)
   ├─ Check brand files (flag if changed)
   ├─ Check security files (require review)
   └─ Check for secrets (block if found)

3. RUN TESTS (parallel)
   ├─ Frontend: npm run test
   ├─ API: pytest tests/ -v -m "not integration"
   └─ Pipeline: pytest tests/ -v -m "not integration"

4. GENERATE REVIEW
   ├─ Summarize changes
   ├─ List concerns
   ├─ Recommend action (approve/request-changes/comment)
   └─ Provide specific feedback

5. TAKE ACTION
   ├─ Approve: gh pr review --approve
   ├─ Request changes: gh pr review --request-changes
   └─ Merge: gh pr merge --squash
```

## Danger Patterns

### Immediate Blocks

| Pattern | Risk | Action |
|---------|------|--------|
| `.env` files in diff | Credential leak | BLOCK - remove immediately |
| `sk_live_`, `pk_live_` | Stripe keys exposed | BLOCK - rotate keys |
| `password`, `secret` literals | Hardcoded credentials | BLOCK - use env vars |
| `*.json` with credentials | GCP keys exposed | BLOCK - use Secret Manager |

### Requires Justification

| Pattern | Risk | Action |
|---------|------|--------|
| `>500 lines deleted` | Breaking changes | Require explanation |
| Auth file changes | Security impact | Security review |
| Migration removes column | Data loss | Rollback plan required |
| Core component deleted | System stability | Architecture review |

### Auto-Approve Candidates

| Pattern | Risk Level | Action |
|---------|------------|--------|
| Documentation only | Low | Auto-approve |
| Test additions | Low | Auto-approve |
| Dependency updates (patch) | Low | Auto-approve |
| Typo fixes | Low | Auto-approve |

## Example Prompts

```
# Review a PR
"Review PR #123"
"Check PR 45 for breaking changes"
"Analyze the diff for PR #67"

# Run validation
"Run tests for PR #123 before merge"
"Validate PR 45 is safe to merge"
"Check if PR #67 has any security issues"

# Merge operations
"Approve and merge PR #123"
"Request changes on PR #45 - needs tests"
"Merge PR #67 with squash"

# Specific checks
"Check PR #123 for large deletions"
"Review brand file changes in PR #45"
"Verify no secrets in PR #67"

# Full workflow
"Full PR review workflow for #123"
"Complete validation and merge for PR #45"
```

## Integration with CI/CD

PRs should pass Cloud Build checks automatically:

```yaml
# Triggers (in cloudbuild-*.yaml)
- Push to main → Stage deploy
- Tag v* → Prod deploy
```

**After merge to main:**
1. Cloud Build auto-deploys to stage
2. Run health checks: `./quick/status.sh stage`
3. If issues, create hotfix PR

**For production release:**
```bash
# After main is stable
git tag v4.4.0
git push origin v4.4.0
```

## 5 Implementation Pillars

| Pillar | How PR Review Handles It |
|--------|-------------------------------|
| **i18n** | Check for hardcoded `$`, `en-US`, `USD`; verify `formatCost()` usage; flag `toISOString().split("T")[0]` date patterns |
| **Enterprise** | Automated code review with test execution; breaking change detection; version bump validation; security file flagging |
| **Cross-Service** | Review changes across all services; validate API contract changes; check cross-service dependency impacts |
| **Multi-Tenancy** | Flag missing `org_slug` validation; check `requireOrgMembership()` in new actions; verify parameterized queries in SQL |
| **Reusability** | Shared review checklist; automated lint rules; PR template with standard sections; merge safety checks |

## Related Skills

- `/test-orchestration` - Detailed test execution
- `/deploy-check` - Post-merge deployment
- `/security-audit` - Security review
- `/config-validator` - Config validation
- `/design` - Brand compliance checks (font consistency, color usage)

## Quick Reference

```bash
# === PR COMMANDS ===
gh pr list --repo cloud-act-ai/cloudact-mono-repo
gh pr view PR_NUMBER --repo cloud-act-ai/cloudact-mono-repo
gh pr diff PR_NUMBER --repo cloud-act-ai/cloudact-mono-repo
gh pr checks PR_NUMBER --repo cloud-act-ai/cloudact-mono-repo

# === REVIEW COMMANDS ===
gh pr review PR_NUMBER --approve -b "LGTM"
gh pr review PR_NUMBER --request-changes -b "Needs work"
gh pr review PR_NUMBER --comment -b "Question about X"

# === MERGE COMMANDS ===
gh pr merge PR_NUMBER --squash --delete-branch
gh pr merge PR_NUMBER --rebase
gh pr merge PR_NUMBER --merge

# === TEST COMMANDS ===
npm run test                           # Frontend
python -m pytest tests/ -v             # API/Pipeline
npx playwright test                    # E2E
```
