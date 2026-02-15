# CloudAct Claude Configuration Summary

**Last Updated:** 2026-02-11 | **Version:** v4.4.0

## Quick Reference

| Resource | Count | Location |
|----------|-------|----------|
| Skills | 28 | `.claude/skills/{name}/SKILL.md` |
| Commands | 16 | `.claude/commands/{name}.md` |
| Hooks (Root) | 6 | `.claude/hookify.*.local.md` + `hooks/` |
| Hooks (Frontend) | 4 | `01-fronted-system/.claude/hookify.*.local.md` |
| CLAUDE.md Files | 5 | Root + 4 services |

---

## Directory Structure

```
.claude/
├── settings.json                    # Permission restrictions
├── settings.local.json              # Local hook triggers
├── debug-config.md                  # Test credentials & URLs
├── SUMMARY.md                       # This file
│
├── skills/                          # 28 specialized agents
│   ├── account-setup/SKILL.md       # Account lifecycle testing
│   ├── api-dev/SKILL.md
│   ├── bigquery-ops/SKILL.md
│   ├── bootstrap-onboard/SKILL.md
│   ├── bug-hunt/SKILL.md
│   ├── chat/SKILL.md                # AI Chat (BYOK + ADK agents)
│   ├── config-validator/SKILL.md
│   ├── cost-analysis/SKILL.md
│   ├── cost-analytics/SKILL.md
│   ├── deploy-check/SKILL.md
│   ├── env-setup/SKILL.md
│   ├── frontend-dev/SKILL.md
│   ├── genai-costs/SKILL.md
│   ├── hierarchy/SKILL.md
│   ├── home-page/SKILL.md           # Marketing landing page
│   ├── infra-cicd/SKILL.md
│   ├── integration-setup/SKILL.md
│   ├── pipeline-ops/SKILL.md
│   ├── pr-review/SKILL.md
│   ├── provider-mgmt/SKILL.md
│   ├── quota-mgmt/SKILL.md
│   ├── security-audit/SKILL.md
│   ├── stripe-billing/SKILL.md      # Stripe billing management
│   ├── subscription-costs/SKILL.md
│   ├── supabase-migrate/SKILL.md
│   ├── test-orchestration/SKILL.md
│   ├── ui-ux-pro-max/SKILL.md       # UI/UX design intelligence
│   ├── web-research/SKILL.md
│   └── PROMPT_EXAMPLES.md           # Quick reference
│
├── commands/                        # 16 operational commands
│   ├── bigquery-ops.md
│   ├── chart.md
│   ├── cleanup-bq.md
│   ├── cleanup-supabase.md
│   ├── dashboard.md
│   ├── demo-setup.md
│   ├── docker-local.md
│   ├── env-setup.md
│   ├── frontend-ui.md               # 93KB - comprehensive UI guide
│   ├── gcp-integration.md
│   ├── health-check.md
│   ├── infra-cicd.md
│   ├── integration-setup.md
│   ├── restart.md
│   ├── stripe-billing.md
│   └── user-mgmt.md
│
├── hooks/                           # Python validation hooks
│   └── validate-integration-code.py
│
├── hookify.encryption-flow.local.md
├── hookify.org-slug-isolation.local.md
├── hookify.pipeline-metadata-fields.local.md
├── hookify.service-integration-standards.local.md
├── hookify.session-completion-checklist.local.md
│
├── prompts/                         # Code review prompts
│   ├── README.md
│   ├── BACKEND_REVIEW_PROMPT.md
│   ├── FRONTEND_REVIEW_PROMPT.md
│   ├── INTEGRATION_FLOWS_REVIEW_PROMPT.md
│   └── GENAI_COSTS_PROMPTS.md
│
└── rules/                           # Custom rules (empty)
```

---

## Skills Reference (28 Total)

### Infrastructure & Deployment
| Skill | Purpose |
|-------|---------|
| `/infra-cicd` | Releases, deploy test/stage/prod, backups, rollbacks |
| `/deploy-check` | Pre-deployment validation, health checks |
| `/pr-review` | PR review, validation, test execution, safe merge |
| `/env-setup` | Dev environment, Docker, GCP credentials |
| `/supabase-migrate` | Database migrations (local/stage/prod) |

### Data & Analytics
| Skill | Purpose |
|-------|---------|
| `/cost-analysis` | FOCUS 1.3, multi-currency, period comparisons |
| `/cost-analytics` | Filter architecture, caching, performance |
| `/bigquery-ops` | Schema management, queries, optimization |
| `/hierarchy` | Dept/Project/Team structure, cost allocation |
| `/genai-costs` | GenAI cost pipelines and calculations |

### Pipelines & Operations
| Skill | Purpose |
|-------|---------|
| `/pipeline-ops` | Create, validate, run, monitor pipelines |
| `/bootstrap-onboard` | System bootstrap, org onboarding |
| `/test-orchestration` | Multi-org, multi-currency testing |

### AI & Chat
| Skill | Purpose |
|-------|---------|
| `/chat` | BYOK AI chat, ADK agents, MCP tools, CopilotKit |

### Configuration & Integration
| Skill | Purpose |
|-------|---------|
| `/integration-setup` | Cloud providers, LLM APIs, SaaS setup |
| `/provider-mgmt` | Provider registry, credentials |
| `/config-validator` | YAML/JSON validation |
| `/security-audit` | API keys, KMS, OWASP compliance |

### Development
| Skill | Purpose |
|-------|---------|
| `/frontend-dev` | Next.js patterns, components, server actions |
| `/api-dev` | FastAPI routers, schemas, middleware |
| `/quota-mgmt` | Usage limits, enforcement, alerts |

### Frontend & Design
| Skill | Purpose |
|-------|---------|
| `/home-page` | Marketing landing page, hero components |
| `/account-setup` | Account lifecycle testing (signup, login, invite) |
| `/stripe-billing` | Stripe products, prices, webhooks, checkout |
| `/ui-ux-pro-max` | UI/UX design intelligence, 67 styles, 96 palettes |

### Research & Debugging
| Skill | Purpose |
|-------|---------|
| `/subscription-costs` | SaaS cost management |
| `/web-research` | LLM pricing lookup, market analysis |
| `/bug-hunt` | Advanced debugging, 50 bug categories |

---

## Commands Reference (16 Total)

| Command | Purpose |
|---------|---------|
| `/restart` | Clean service restart (local/cloud) |
| `/health-check` | Service health & status |
| `/env-setup` | Environment setup & secrets |
| `/docker-local` | Docker local development |
| `/demo-setup` | Demo account setup |
| `/bigquery-ops` | BigQuery operations |
| `/cleanup-bq` | BigQuery dataset cleanup |
| `/cleanup-supabase` | Supabase data cleanup |
| `/dashboard` | Cost dashboard pages |
| `/chart` | Unified chart components |
| `/frontend-ui` | Premium console UI guidelines |
| `/gcp-integration` | GCP integration operations |
| `/integration-setup` | Integration & credential management |
| `/infra-cicd` | Infrastructure & CI/CD |
| `/stripe-billing` | Stripe billing management |
| `/user-mgmt` | User management operations |

---

## Hooks Reference (11 Total)

### Root Hooks (7)

| Hook | Type | Action | Purpose |
|------|------|--------|---------|
| `settings.json` | Permission | Deny | Block `rm -rf`, `DROP DATABASE` |
| `validate-integration-code.py` | PreToolUse | Deny | Prevent Supabase integration writes |
| `org-slug-isolation` | Hookify | Warn | 30 meta tables, field naming (org_slug vs x_org_slug) |
| `pipeline-metadata-fields` | Hookify | Warn | x_* fields, service boundaries |
| `notification-service` | Hookify | Warn | Notification architecture (CRUD vs Sending) |
| `service-integration-standards` | Hookify | Warn | Deployment, directories, 3-service arch |
| `encryption-flow` | Hookify | Warn | GCP KMS encryption patterns |
| `session-completion-checklist` | Hookify | Block | Tests/docs before session close |

### Frontend Hooks (4)

| Hook | Type | Action | Purpose |
|------|------|--------|---------|
| `protect-auth-pages` | Hookify | Block | Lock finalized auth pages |
| `brand-color-badges` | Hookify | Warn | Enforce mint color on badges |
| `warn-inline-button-styles` | Hookify | Warn | Use design system buttons |
| `console-ui-design-standards` | Hookify | Warn | Prevent dark button styling |

---

## Service Architecture

```
Frontend (3000)              API Service (8000)           Pipeline Service (8001)
├─ Next.js 16 + Supabase     ├─ Bootstrap (30 tables)     ├─ Run pipelines
├─ Stripe Billing            ├─ Org onboarding            ├─ Cost calculation
├─ AI Chat (CopilotKit)      ├─ Subscription CRUD         ├─ FOCUS 1.3 conversion
├─ Quota warnings            ├─ Hierarchy CRUD            └─ BigQuery writes
└─ Dashboard UI              ├─ Quota enforcement
                             └─ Cost reads (Polars)
Chat Backend (8002)                     ↓
├─ FastAPI + Google ADK      BigQuery (organizations + {org_slug}_prod)
├─ Multi-agent orchestrator
└─ BYOK + BigQuery sessions
```

---

## Key Boundaries

### x_* Pipeline Lineage Fields
- **API Service (8000):** NO x_* fields
- **Pipeline Service (8001):** MUST have x_* fields
- Fields: `x_pipeline_id`, `x_credential_id`, `x_run_id`, `x_ingested_at`, `x_org_slug`, `x_hierarchy_*`

### Multi-Tenant Isolation
- Pattern: `^[a-zA-Z0-9_]{3,50}$`
- Dataset naming: `{org_slug}_prod`, `{org_slug}_stage`

### Field Naming Convention (CRITICAL)

| Dataset | Field | Example Tables |
|---------|-------|----------------|
| `organizations` (meta - 30 tables) | `org_slug` | org_profiles, org_api_keys, org_notification_* |
| `{org_slug}_prod` (customer - 19 tables) | `x_org_slug` | genai_*, cloud_*, cost_data_standard_1_3 |

**Rule:** Customer datasets ALWAYS use `x_` prefix:
- `x_org_slug` (not `org_slug`)
- `x_hierarchy_entity_id` (not `entity_id`)
- `x_cloud_provider`, `x_genai_provider`

### Notification Service Split
- **API (8000):** CRUD for channels, rules, summaries (settings only)
- **Pipeline (8001):** Actual sending (Email, Slack, Webhook)

### Credential Encryption
- **Store:** KMSStoreIntegrationProcessor → encrypt_value()
- **Retrieve:** Pipeline → decrypt_credentials() with org_slug

---

## Test Credentials

| Field | Value |
|-------|-------|
| Email | `demo@cloudact.ai` |
| Password | `demo1234` |
| Org Slug | Query from DB (see debug-config.md) |

---

## Service URLs & Directories

| Service | Local | Production | Directory |
|---------|-------|------------|-----------|
| Frontend | http://localhost:3000 | https://cloudact.ai | `$REPO_ROOT/01-fronted-system` |
| API | http://localhost:8000 | https://api.cloudact.ai | `$REPO_ROOT/02-api-service` |
| Pipeline | http://localhost:8001 | https://pipeline.cloudact.ai | `$REPO_ROOT/03-data-pipeline-service` |
| Chat Backend | http://localhost:8002 | https://chat.cloudact.ai | `$REPO_ROOT/07-org-chat-backend` |

**ALWAYS use `$REPO_ROOT` for commands. NEVER run npm/uvicorn from wrong directory.**

---

## Deployment (Cloud Build - AUTOMATED)

> **CRITICAL:** Production deployments are AUTOMATIC via Cloud Build triggers.

| Action | Command | Target |
|--------|---------|--------|
| Deploy to Stage | `git push origin main` | cloudact-stage |
| Deploy to Prod | `git tag v4.4.0 && git push origin v4.4.0` | cloudact-prod |

**Manual deploy scripts are for test/dev environments ONLY.**

---

## CLAUDE.md Files

| File | Scope |
|------|-------|
| `/CLAUDE.md` | Master: architecture, endpoints, deployment |
| `/01-fronted-system/CLAUDE.md` | Next.js, Supabase auth, Stripe |
| `/02-api-service/CLAUDE.md` | FastAPI, bootstrap, subscriptions |
| `/03-data-pipeline-service/CLAUDE.md` | Pipelines, FOCUS 1.3, costs |
| `/07-org-chat-backend/CLAUDE.md` | AI Chat, Google ADK agents, BYOK |

---

*Updated: 2026-02-11 | 28 skills with full requirements + tests, chat backend (8002), consolidated specs into `.claude/skills/{name}/requirements/`*
