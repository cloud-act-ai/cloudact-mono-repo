# CloudAct - Antigravity Project Guide

Multi-org cloud cost analytics. BigQuery-powered. **Frontend** (3000) + **API Service** (8000) + **Pipeline Service** (8001) + **Chat Backend** (8002).

## Knowledge Base

All detailed knowledge is in `.claude/skills/`. Each skill has SKILL.md (guide), requirements/ (spec), and tests/ (test plan).

**To answer any question, read the relevant skill file:**

| Question | Read This File |
|----------|---------------|
| Demo account setup? | `.claude/skills/demo-setup/SKILL.md` |
| How to deploy? | `.claude/skills/infra-cicd/SKILL.md` or `.claude/skills/go-live/SKILL.md` |
| Pipeline operations? | `.claude/skills/pipeline-ops/SKILL.md` |
| BigQuery schemas? | `.claude/skills/bigquery-ops/SKILL.md` |
| Theme/CSS/dark mode? | `.claude/skills/theme/SKILL.md` |
| Chat backend? | `.claude/skills/chat/SKILL.md` |
| Stripe billing? | `.claude/skills/stripe-billing/SKILL.md` |
| Notifications/alerts? | `.claude/skills/notifications/SKILL.md` |
| Budget planning? | `.claude/skills/budget-planning/SKILL.md` |
| Hierarchy (Dept/Proj/Team)? | `.claude/skills/hierarchy/SKILL.md` |
| Account/auth flows? | `.claude/skills/account-setup/SKILL.md` |
| Cost analytics/filters? | `.claude/skills/cost-analytics/SKILL.md` |
| Security audit? | `.claude/skills/security-audit/SKILL.md` |
| Quota management? | `.claude/skills/quota-mgmt/SKILL.md` |
| Integration setup? | `.claude/skills/integration-setup/SKILL.md` |
| Supabase migrations? | `.claude/skills/supabase-migrate/SKILL.md` |
| Config validation? | `.claude/skills/config-validator/SKILL.md` |
| Frontend development? | `.claude/skills/frontend-dev/SKILL.md` |
| API development? | `.claude/skills/api-dev/SKILL.md` |
| Test orchestration? | `.claude/skills/test-orchestration/SKILL.md` |
| Subscription costs? | `.claude/skills/subscription-costs/SKILL.md` |
| Charts/data viz? | `.claude/skills/charts/SKILL.md` |
| Console UI components? | `.claude/skills/console-ui/SKILL.md` |
| Design system? | `.claude/skills/design/SKILL.md` |
| Scheduler jobs? | `.claude/skills/scheduler-jobs/SKILL.md` |
| Troubleshooting? | `.claude/skills/troubleshooting/SKILL.md` |
| Bug hunting? | `.claude/skills/bug-hunt/SKILL.md` |
| Environment setup? | `.claude/skills/env-setup/SKILL.md` |
| Monitoring/logs? | `.claude/skills/monitoring/SKILL.md` |
| PR review? | `.claude/skills/pr-review/SKILL.md` |
| Provider management? | `.claude/skills/provider-mgmt/SKILL.md` |
| GenAI costs? | `.claude/skills/genai-costs/SKILL.md` |
| i18n/locale? | `.claude/skills/i18n-locale/SKILL.md` |
| Home/landing page? | `.claude/skills/home-page/SKILL.md` |
| Advanced filters? | `.claude/skills/advanced-filters/SKILL.md` |
| Deploy checks? | `.claude/skills/deploy-check/SKILL.md` |

**Test plans** are at `.claude/skills/{name}/tests/{name}.md`
**Requirements** are at `.claude/skills/{name}/requirements/{name}.md`

---

## Demo Account Setup (Quick Reference)

```bash
cd 01-fronted-system

# 1. Cleanup existing demo
npx tsx tests/demo-setup/cleanup-demo-account.ts --email=demo@cloudact.ai

# 2. Create new demo account (Playwright)
npx tsx tests/demo-setup/setup-demo-account.ts

# 3. Load demo data
npx tsx tests/demo-setup/load-demo-data-direct.ts --org-slug=$ORG_SLUG --api-key=$ORG_API_KEY
```

| Field | Value |
|-------|-------|
| Email | `demo@cloudact.ai` |
| Password | `Demo1234` |
| Company | `Acme Inc` |
| Org Slug | `acme_inc_{base36_timestamp}` (auto at signup) |
| Plan | `scale` (14-day trial) |
| Data Range | Jan 2025 - Dec 2026 (2 years, ~21K records) |

Full guide: `.claude/skills/demo-setup/SKILL.md`

---

## Architecture

```
Frontend (3000)              API Service (8000)           Pipeline Service (8001)
├─ Next.js 16 + Supabase     ├─ Bootstrap (30 tables)     ├─ Run pipelines
├─ Stripe Billing            ├─ Org onboarding            ├─ Cost calculation
├─ AI Chat (CopilotKit)      ├─ Hierarchy CRUD            ├─ FOCUS 1.3 conversion
└─ Dashboard UI              └─ Cost reads (Polars)       └─ BigQuery writes

Chat Backend (8002)          Scheduler Jobs (Cloud Run)
├─ FastAPI + Google ADK       ├─ bootstrap, org-sync-all
├─ Multi-agent orchestrator   ├─ quota-reset, stale-cleanup
└─ BigQuery sessions          └─ alerts-daily, pipelines-daily
```

## Three Cost Types → FOCUS 1.3

| Type | Providers | Pipeline |
|------|-----------|----------|
| Cloud | GCP, AWS, Azure, OCI | `cloud/{provider}/cost/billing` |
| GenAI | OpenAI, Anthropic, Gemini, DeepSeek, Azure OpenAI, AWS Bedrock, GCP Vertex | `genai/payg/*` |
| SaaS | Canva, Slack, ChatGPT Plus | `subscription/costs/subscription_cost` |

## Environments

| Env | GCP Project | Supabase |
|-----|-------------|----------|
| local/test/stage | cloudact-testing-1 | kwroaccbrxppfiysqlzs |
| prod | cloudact-prod | ovfxswhkkshouhsryzaf |

## Deployment

```bash
# Stage (auto on push)
git push origin main

# Prod (via tag)
git tag v4.4.0 && git push origin v4.4.0

# Cloud Run Jobs
cd 05-scheduler-jobs/scripts
./run-job.sh stage bootstrap && ./run-job.sh stage org-sync-all
```

## Key Endpoints

```bash
# API Service (8000)
POST /api/v1/admin/bootstrap
POST /api/v1/organizations/onboard
GET  /api/v1/hierarchy/{org}/tree

# Pipeline Service (8001)
POST /api/v1/pipelines/run/{org}/{provider}/{domain}/{pipeline}

# Chat Backend (8002)
POST /api/v1/chat/{org}/message
```

## Development Rules (Non-Negotiable)

1. **ZERO mock tests** — All tests hit real services (BigQuery, Supabase, APIs)
2. **Multi-tenancy via org_slug** — Every query filters by `x_org_slug`
3. **Enterprise-grade for 10k customers** — Scale-tested
4. **No over-engineering** — Simple, direct code
5. **x_* fields = Pipeline Service (8001) ONLY** — API (8000) has NO x_* fields
6. **LRU cache, NO Redis** — `functools.lru_cache` or `cachetools`
7. **CSS variables first** — No hardcoded colors in TSX
8. **Cloud Run Jobs for operations** — Not local scripts
9. **GCP creds: absolute paths** — `/Users/openclaw/.gcp/` (NOT `~/.gcp/`)
