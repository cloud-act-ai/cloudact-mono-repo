# PR Review - Requirements

## Overview

Automated PR review, validation, and merge workflow for the CloudAct monorepo. Covers drastic deletion detection, brand protection, security-sensitive file review, breaking change detection, test execution gating, and safe merge with conventional commits. All PRs target `main` branch in the `cloud-act-ai/cloudact-mono-repo` GitHub repository.

## Source Specifications

Defined in SKILL.md (`pr-review/SKILL.md`).

---

## Architecture

```
┌──────────────────────────────────────────────────────────────────────────┐
│                    PR Review & Merge Pipeline                             │
├──────────────────────────────────────────────────────────────────────────┤
│                                                                           │
│  Developer                                                                │
│  ─────────                                                                │
│  feature-branch → git push → Open PR                                     │
│                                                                           │
│  Step 1: DIFF ANALYSIS                                                    │
│  ├─ gh pr diff PR_NUMBER                                                  │
│  ├─ Count additions / deletions per file                                  │
│  ├─ Flag >500 total lines deleted (CRITICAL)                              │
│  └─ Flag core file deletions (BLOCK)                                      │
│                                                                           │
│  Step 2: CATEGORY CLASSIFICATION                                          │
│  ├─ Brand files changed? → Brand review                                   │
│  ├─ Auth / KMS / webhook files? → Security review                         │
│  ├─ API router / schema changes? → Breaking change review                 │
│  ├─ Env / secret files? → Immediate BLOCK                                 │
│  └─ Docs / tests only? → Auto-approve candidate                           │
│                                                                           │
│  Step 3: DANGER CHECK                                                     │
│  ├─ Immediate blocks: .env, sk_live_, hardcoded secrets                   │
│  ├─ Requires justification: >500 del, auth changes, column drops          │
│  └─ Auto-approve: docs, tests, patch deps, typos                          │
│                                                                           │
│  Step 4: TEST EXECUTION                                                   │
│  ├─ Frontend: cd 01-fronted-system && npm run test                        │
│  ├─ API: cd 02-api-service && pytest tests/ -v                            │
│  ├─ Pipeline: cd 03-data-pipeline-service && pytest tests/ -v             │
│  └─ E2E (if UI changes): cd 01-fronted-system && npx playwright test      │
│                                                                           │
│  Step 5: MERGE DECISION                                                   │
│  ├─ All tests pass + no blocks → Approve + Merge (squash)                 │
│  ├─ Tests fail → Request changes                                          │
│  └─ Danger patterns → Block or request justification                      │
│                                                                           │
│  Post-Merge                                                               │
│  ──────────                                                               │
│  main push → Cloud Build (cloudbuild-stage.yaml) → Stage deploy           │
│  git tag v* → Cloud Build (cloudbuild-prod.yaml) → Prod deploy            │
│                                                                           │
└──────────────────────────────────────────────────────────────────────────┘
```

---

## SDLC Workflow

### Development Lifecycle

```
1. Create feature branch from main
   git checkout -b feat/my-feature main

2. Develop + commit locally (conventional commits)
   git commit -m "feat(api): add new endpoint for X"

3. Push branch + open PR
   git push -u origin feat/my-feature
   gh pr create --title "feat(api): add new endpoint" --base main

4. Automated review (this skill)
   → Diff analysis → Category classification → Danger check → Tests → Decision

5. Merge to main (squash)
   gh pr merge PR_NUMBER --squash --delete-branch

6. Auto-deploy to stage (Cloud Build trigger on main push)

7. Production release (git tag)
   git tag v4.4.0 && git push origin v4.4.0
```

### Branch Strategy

| Branch | Purpose | Protection |
|--------|---------|------------|
| `main` | Primary development + stage deploy trigger | Requires PR, squash merge |
| `feat/*` | Feature branches | None |
| `fix/*` | Bug fix branches | None |
| `hotfix/*` | Production hotfixes | Fast-track review |
| `v*` tags | Production releases | Tag triggers prod deploy |

### CI/CD Integration

| Event | Trigger | Pipeline |
|-------|---------|----------|
| PR opened | GitHub webhook | Review checks (this skill) |
| Push to `main` | Cloud Build trigger | `cloudbuild-stage.yaml` deploys to stage |
| Tag `v*` push | Cloud Build trigger | `cloudbuild-prod.yaml` deploys to prod |
| Stage deploy complete | Health check | `./quick/status.sh stage` |
| Prod deploy complete | Health check | `./quick/status.sh prod` |

### Conventional Commits

| Prefix | Use | Example |
|--------|-----|---------|
| `feat` | New feature | `feat(costs): add OCI provider support` |
| `fix` | Bug fix | `fix(auth): handle expired JWT tokens` |
| `chore` | Maintenance | `chore: update dependencies` |
| `docs` | Documentation | `docs: update API endpoint docs` |
| `refactor` | Code restructuring | `refactor(pipeline): extract shared logic` |
| `test` | Test additions | `test(e2e): add billing flow tests` |
| `perf` | Performance | `perf(bq): optimize cost query` |

---

## Functional Requirements

### FR-PR-001: Diff Analysis

- **FR-PR-001.1**: Fetch full PR diff via `gh pr diff PR_NUMBER --repo cloud-act-ai/cloudact-mono-repo`
- **FR-PR-001.2**: Count total additions and deletions across all files
- **FR-PR-001.3**: Flag any single file with >100 lines deleted as WARNING
- **FR-PR-001.4**: Flag total deletions >500 lines as CRITICAL REVIEW
- **FR-PR-001.5**: Flag complete deletion of a core file as BLOCK
- **FR-PR-001.6**: Identify net change (additions minus deletions) for summary

### FR-PR-002: Drastic Deletion Detection

- **FR-PR-002.1**: Threshold: >500 total lines removed across all files triggers CRITICAL flag
- **FR-PR-002.2**: Threshold: >100 lines removed in a single file triggers WARNING flag
- **FR-PR-002.3**: Protected paths that BLOCK on deletion:
  - `01-fronted-system/components/ui/` (core UI components)
  - `02-api-service/src/app/core/` (core API logic)
  - `03-data-pipeline-service/src/core/` (core pipeline logic)
  - `**/CLAUDE.md` (architecture documentation)
  - `version.json` (version tracking)
- **FR-PR-002.4**: Deletion of test files is WARNING, not BLOCK (tests may be replaced)

### FR-PR-003: Brand Protection

- **FR-PR-003.1**: Monitor brand files for unauthorized changes:
  - `01-fronted-system/app/globals.css`
  - `01-fronted-system/app/layout.tsx`
  - `01-fronted-system/components/marketing/`
  - `01-fronted-system/tailwind.config.ts`
  - `01-fronted-system/public/` (logo assets)
- **FR-PR-003.2**: Enforce primary brand colors: mint `#90FCA6`, coral `#FF6B6B`
- **FR-PR-003.3**: Flag any introduction of off-brand colors as primary palette
- **FR-PR-003.4**: Flag logo file changes (SVG, PNG, ICO) for explicit approval
- **FR-PR-003.5**: Flag marketing copy changes in landing page components

### FR-PR-004: Security-Sensitive File Review

- **FR-PR-004.1**: Require security review for changes to:
  - `**/auth.ts`, `**/auth.py` (authentication logic)
  - `**/middleware.ts` (request guards)
  - `**/kms_encryption.py` (encryption layer)
  - `**/dependencies/auth.py` (auth dependencies)
  - `**/api/webhooks/**` (Stripe webhook handlers)
  - `**/.env*`, `**/secrets.yaml` (should NOT be in PR)
- **FR-PR-004.2**: Flag any new file matching `.env*` or `*secret*` patterns as BLOCK
- **FR-PR-004.3**: Scan diff for hardcoded secrets: `sk_live_`, `sk_test_`, `pk_live_`, `password =`, `secret =`
- **FR-PR-004.4**: Flag GCP service account JSON files in diff as BLOCK

### FR-PR-005: Breaking Change Detection

- **FR-PR-005.1**: API breaking changes in `02-api-service/`:
  - Router path changes (endpoint URL modification)
  - Response schema changes (field removal/rename)
  - Required field additions without defaults
  - Auth requirement changes (new header/permission)
- **FR-PR-005.2**: Database breaking changes in migrations:
  - Column removal or type changes
  - NOT NULL additions without defaults
  - Index removal on critical columns
- **FR-PR-005.3**: Environment variable changes:
  - New required env vars (must update `.env.example`)
  - Removed env vars (must update deployment configs)
- **FR-PR-005.4**: Pipeline config changes in `03-data-pipeline-service/configs/`

### FR-PR-006: Test Execution Gate

- **FR-PR-006.1**: Frontend tests: `cd 01-fronted-system && npm run test`
- **FR-PR-006.2**: API service tests: `cd 02-api-service && python -m pytest tests/ -v -m "not integration" --tb=short`
- **FR-PR-006.3**: Pipeline service tests: `cd 03-data-pipeline-service && python -m pytest tests/ -v -m "not integration" --tb=short`
- **FR-PR-006.4**: E2E tests (if UI changes detected): `cd 01-fronted-system && npx playwright test`
- **FR-PR-006.5**: All test suites must pass for merge approval
- **FR-PR-006.6**: Test failures generate REQUEST_CHANGES with failure summary

### FR-PR-007: Merge Criteria

- **FR-PR-007.1**: All tests pass (FR-PR-006)
- **FR-PR-007.2**: No BLOCK-level danger patterns (FR-PR-004)
- **FR-PR-007.3**: No unresolved CRITICAL deletion flags without justification (FR-PR-002)
- **FR-PR-007.4**: Brand file changes approved if present (FR-PR-003)
- **FR-PR-007.5**: Merge method: squash merge with conventional commit message
- **FR-PR-007.6**: Delete source branch after merge
- **FR-PR-007.7**: Command: `gh pr merge PR_NUMBER --repo cloud-act-ai/cloudact-mono-repo --squash --delete-branch`

### FR-PR-008: Danger Patterns

#### Immediate Blocks

| Pattern | Risk | Action |
|---------|------|--------|
| `.env` files in diff | Credential leak | BLOCK -- remove immediately |
| `sk_live_`, `pk_live_` | Stripe keys exposed | BLOCK -- rotate keys |
| `password`, `secret` literals in code | Hardcoded credentials | BLOCK -- use env vars |
| `*.json` with GCP credentials | GCP keys exposed | BLOCK -- use Secret Manager |

#### Requires Justification

| Pattern | Risk | Action |
|---------|------|--------|
| >500 lines deleted | Breaking changes | Require explanation in PR body |
| Auth file changes | Security impact | Security review required |
| Migration removes column | Data loss | Rollback plan required |
| Core component deleted | System stability | Architecture review |
| `CLAUDE.md` modified | Documentation drift | Verify accuracy |

#### Auto-Approve Candidates

| Pattern | Risk Level | Action |
|---------|------------|--------|
| Documentation only (*.md) | Low | Auto-approve |
| Test additions only | Low | Auto-approve |
| Dependency updates (patch) | Low | Auto-approve |
| Typo / comment fixes | Low | Auto-approve |

### FR-PR-009: Review Output Format

- **FR-PR-009.1**: Summary of changes (files changed, additions, deletions)
- **FR-PR-009.2**: Category classification (feature, bugfix, refactor, docs, etc.)
- **FR-PR-009.3**: Danger check results (blocks, warnings, justification requests)
- **FR-PR-009.4**: Test execution results (pass/fail per suite)
- **FR-PR-009.5**: Recommended action (APPROVE, REQUEST_CHANGES, COMMENT)
- **FR-PR-009.6**: Specific feedback per file when issues detected

---

## Non-Functional Requirements

### NFR-PR-001: Performance

- Diff analysis completes in < 30 seconds for PRs with < 50 files
- Test execution respects individual suite timeouts (frontend 120s, API 180s, pipeline 180s, E2E 300s)
- Full 5-step review pipeline completes in < 10 minutes for standard PRs

### NFR-PR-002: Safety

- NEVER auto-merge PRs with BLOCK-level patterns
- NEVER skip test execution before merge approval
- NEVER merge to main without at least one review (human or automated)
- Squash merge preserves clean git history on main
- Source branch deleted after merge to prevent stale branches

### NFR-PR-003: Auditability

- All review decisions recorded via `gh pr review` (GitHub audit trail)
- Merge commit message follows conventional commit format
- PR body includes test results and review summary
- Danger pattern detections logged in review comments

### NFR-PR-004: Deployment Safety

- Push to `main` auto-deploys to stage only (not prod)
- Production deploy requires explicit `git tag v*` (deliberate action)
- Health checks run after both stage and prod deploys
- Rollback via previous tag re-deploy if issues detected

### NFR-PR-005: Consistency

- Same review checklist applied to all PRs regardless of author
- Brand colors enforced consistently across all frontend changes
- Security file changes always flagged regardless of change size
- Test gate applies to all merges (no test-skip exceptions)

---

## Key Files

| File | Purpose |
|------|---------|
| `.claude/skills/pr-review/SKILL.md` | Skill definition and review instructions |
| `04-inra-cicd-automation/CICD/triggers/cloudbuild-stage.yaml` | Stage deploy trigger (main push) |
| `04-inra-cicd-automation/CICD/triggers/cloudbuild-prod.yaml` | Prod deploy trigger (v* tag) |
| `01-fronted-system/app/globals.css` | Brand colors (protected) |
| `01-fronted-system/tailwind.config.ts` | Theme config (protected) |
| `02-api-service/src/app/routers/` | API endpoints (breaking change detection) |
| `03-data-pipeline-service/configs/` | Pipeline configs (breaking change detection) |
| `version.json` | Version tracking (protected from deletion) |
| `01-fronted-system/components/ui/` | Core UI components (protected from deletion) |
| `02-api-service/src/app/core/` | Core API logic (protected from deletion) |

---

## Related Skills

| Skill | Relationship |
|-------|-------------|
| `/test-orchestration` | Detailed test execution strategies. PR review uses test-orchestration for gate checks. |
| `/deploy-check` | Post-merge deployment verification. Runs after PR merges to main. |
| `/security-audit` | Deep security review. PR review flags security files; security-audit does full analysis. |
| `/config-validator` | Config file validation. PR review detects config changes; config-validator validates them. |
| `/frontend-dev` | Frontend conventions. Brand protection rules align with frontend-dev standards. |
| `/infra-cicd` | CI/CD pipeline definitions. PR merge triggers Cloud Build pipelines. |
