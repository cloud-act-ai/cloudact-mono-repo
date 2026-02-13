---
name: chat
description: |
  Multi-tenant AI chat system for CloudAct. BYOK (Bring Your Own Key) chat with Google ADK agents,
  CopilotKit frontend, and BigQuery-backed conversations.
  Use when: debugging chat issues, configuring AI settings, managing conversations, testing chat flows,
  working with the 07-org-chat-backend service, or troubleshooting BYOK credential setup.
---

# /chat - Multi-Tenant AI Chat System

BYOK AI chat for CloudAct organizations. CopilotKit frontend + Google ADK backend with 5 specialized agents (CostAnalyst, AlertManager, BudgetManager, UsageAnalyst, Explorer) and 17 MCP tools.

## Trigger

Use when: working on chat features, debugging chat issues, configuring BYOK settings, managing conversations, testing agent responses, or deploying the chat backend.

```
/chat status <org>                  # Check chat config status for org
/chat settings                      # View/debug AI chat settings flow
/chat backend                       # Work on 07-org-chat-backend
/chat agents                        # Agent hierarchy (orchestrator + 4 sub-agents)
/chat tools                         # MCP tools (costs, alerts, usage)
/chat test                          # Run chat UI tests
/chat deploy                        # Deploy chat backend to Cloud Run
```

## Prerequisites

| Requirement | Check Command | Expected |
|-------------|---------------|----------|
| Frontend running | `curl -s http://localhost:3000 -o /dev/null -w "%{http_code}"` | `200` |
| API running | `curl -s http://localhost:8000/health` | `{"status":"ok"}` |
| Chat backend running | `curl -s http://localhost:8002/health` | `{"status":"ok"}` |
| Demo account exists | Login with `demo@cloudact.ai` / `Demo1234` | Dashboard loads |
| Chat tables bootstrapped | BigQuery `organizations.org_chat_settings` exists | Table exists |
| LLM key configured | AI Chat settings page shows "Connected" | Provider active |

## Architecture

```
┌──────────────────────────────────────────────────────────────────┐
│  01-fronted-system (Cloud Run, port 3000)                         │
│                                                                    │
│  /[orgSlug]/settings/ai-chat  ← BYOK: Provider + key + model     │
│  /[orgSlug]/chat              ← CopilotChat UI (indigo theme)    │
│  /api/copilotkit/             ← CopilotKit Runtime (proxy)       │
│  /api/chat/                   ← REST API (conversations, search) │
│                                                                    │
│  Runtime: JWT validation → org_slug → forward to backend          │
└──────────────────────┬─────────────────────────────────────────────┘
                       │ AG-UI Protocol (SSE)
┌──────────────────────▼─────────────────────────────────────────────┐
│  07-org-chat-backend (Cloud Run, port 8002, INTERNAL ONLY)         │
│                                                                     │
│  Agent Hierarchy (all use customer's BYOK key):                    │
│  ┌─────────────────────────────────────────────────────────────┐   │
│  │  Orchestrator (Root)                                         │   │
│  │  ├── CostAnalyst     → 5 MCP tools (costs domain)           │   │
│  │  ├── AlertManager    → 4 MCP tools (alerts domain)          │   │
│  │  ├── BudgetManager   → 4 MCP tools (budget domain)          │   │
│  │  ├── UsageAnalyst    → 4 MCP tools (usage domain)           │   │
│  │  └── Explorer        → BigQueryToolset (ad-hoc SQL)          │   │
│  └─────────────────────────────────────────────────────────────┘   │
└──────────────────────┬─────────────────────────────────────────────┘
                       │
┌──────────────────────▼─────────────────────────────────────────────┐
│  BigQuery                                                           │
│  organizations (central):                                          │
│  ├── org_chat_settings        (BYOK config per org)                │
│  ├── org_chat_conversations   (conversation metadata)              │
│  ├── org_chat_messages        (message history)                    │
│  └── org_chat_tool_calls      (tool execution audit)               │
│                                                                     │
│  {org_slug}_prod (per-tenant, read by MCP tools):                  │
│  ├── cost_data_standard_1_3   ← CostAnalyst                       │
│  ├── genai_*_daily_unified    ← UsageAnalyst                      │
│  └── org_notification_rules   ← AlertManager                      │
└────────────────────────────────────────────────────────────────────┘
```

## BYOK (Bring Your Own Key) Flow

| Provider | LiteLlm Prefix | Models |
|----------|----------------|--------|
| OpenAI | openai/ | gpt-4o, gpt-4o-mini, gpt-4-turbo, o1, o1-mini |
| Anthropic | anthropic/ | claude-opus-4, claude-sonnet-4, claude-3.5-sonnet, claude-3.5-haiku |
| Gemini | (native ADK) | gemini-2.0-flash, gemini-1.5-pro, gemini-1.5-flash |
| DeepSeek | deepseek/ | deepseek-chat, deepseek-coder, deepseek-v3 |

**Flow:** Settings page → select provider → enter/reuse key → KMS encrypt → select model → save to `org_chat_settings`

## MCP Tools (17 Total)

| Domain | Tools | Key Parameters |
|--------|-------|----------------|
| **Costs** (5) | query_costs, compare_periods, cost_breakdown, cost_forecast, top_cost_drivers | org_slug, provider, date range, group_by |
| **Alerts** (4) | list_alerts, create_alert, alert_history, acknowledge_alert | org_slug, threshold, status |
| **Budgets** (4) | list_budgets, budget_summary, budget_variance, budget_allocation_tree | org_slug, category, hierarchy_entity_id |
| **Usage** (4) | genai_usage, quota_status, top_consumers, pipeline_runs | org_slug, provider, model, date range |

**Security:** Every tool requires `org_slug` → `validate_org()` → parameterized SQL → dry_run gate (10GB) → filtered results.

## Key Files

### Frontend (01-fronted-system)

| File | Purpose |
|------|---------|
| `components/chat/chat-layout.tsx` | Full-width layout + right-side Sheet history drawer |
| `components/chat/chat-copilot.tsx` | CopilotChat wrapper with streaming (indigo theme) |
| `components/chat/chat-welcome.tsx` | Welcome screen with Sparkles icon + suggestions |
| `components/chat/conversation-list.tsx` | Conversation history with relative timestamps |
| `components/settings/ai-chat/` | BYOK settings (provider, credentials, model, advanced) |
| `actions/chat-settings.ts` | Server actions for settings CRUD |
| `lib/chat/constants.ts` | Provider/model maps, defaults |
| `lib/chat/client.ts` | Chat API client (conversations, messages, search) |
| `app/api/copilotkit/route.ts` | CopilotKit Runtime proxy |
| `app/api/chat/` | REST API (conversations, search, auto-title) |

### Backend (07-org-chat-backend)

| File | Purpose |
|------|---------|
| `src/app/main.py` | FastAPI + AG-UI endpoint |
| `src/app/config.py` | Service configuration |
| `src/core/agents/orchestrator.py` | Root agent (routes to sub-agents) |
| `src/core/agents/cost_analyst.py` | Cost analysis sub-agent |
| `src/core/agents/alert_manager.py` | Alert management sub-agent |
| `src/core/agents/budget_manager.py` | Budget analysis sub-agent |
| `src/core/agents/usage_analyst.py` | Usage analysis sub-agent |
| `src/core/agents/explorer.py` | Ad-hoc BigQuery exploration |
| `src/core/tools/costs.py` | 5 cost MCP tools |
| `src/core/tools/alerts.py` | 4 alert MCP tools |
| `src/core/tools/budgets.py` | 4 budget MCP tools |
| `src/core/tools/usage.py` | 4 usage MCP tools |
| `src/core/tools/shared.py` | BQ client, validation, common helpers |
| `src/core/security/org_validator.py` | Org slug format + existence check |
| `src/core/sessions/bq_session_store.py` | BigQuery-backed conversation state |
| `src/core/engine/bigquery.py` | Shared BQ client singleton |

### API Service (02-api-service)

| File | Purpose |
|------|---------|
| `src/app/routers/genai.py` | Chat settings endpoints (GET/POST/DELETE) |

## Multi-Tenancy Isolation (6 Layers)

| Layer | Component | Blocks |
|-------|-----------|--------|
| 1. Authentication | Supabase JWT | User A accessing Org B |
| 2. Authorization | CopilotKit Runtime (org check) | Tampered org_slug |
| 3. Agent Scoping | ADK agent per-org with org_slug in prompt | Cross-org hallucination |
| 4. Tool Validation | org_slug REQUIRED + validate_org() | Cross-dataset access |
| 5. Query Safety | Parameterized SQL + dry-run gate (10GB) | SQL injection, costly queries |
| 6. Data Isolation | Separate BQ datasets + org_slug column | Storage-level leakage |

## Deployment

| Service | Port | Cloud Run Name | Access |
|---------|------|---------------|--------|
| 07-org-chat-backend | 8002 | cloudact-chat-backend | INTERNAL ONLY (VPC) |

- No public URL — frontend proxies via CopilotKit Runtime
- Same GCP project, same service account
- KMS permissions: existing SA has `roles/cloudkms.cryptoKeyEncrypterDecrypter`

## Troubleshooting

| Issue | Cause | Fix |
|-------|-------|-----|
| "Configure AI Chat" shown | No settings for org | Go to settings/ai-chat, set up provider + key |
| Chat returns empty | Invalid/expired API key | Rotate key in settings |
| "Setup required" error | org_chat_settings missing | Run bootstrap to create tables |
| Cross-org data leak | Missing validate_org() | Every MCP tool MUST call validate_org() first |
| Streaming breaks | CopilotKit version mismatch | Ensure @copilotkit/* packages match (^1.51) |
| Tool timeout | BigQuery query too large | dry_run gate should catch (10GB limit) |
| Agent not responding | LiteLlm model prefix wrong | Check provider → model mapping in constants |
| History not loading | Conversation API 401 | Check JWT token, org membership |
| CORS error on chat backend | `CORS_ORIGINS` env var parsed incorrectly | pydantic-settings v2 JSON-decodes env vars for complex types (`List[str]`) BEFORE `field_validator` runs. If `CORS_ORIGINS` is set as a plain string (not JSON array) in Cloud Run, parsing fails silently. Fix: declare `CORS_ORIGINS` as `str` type in config and parse manually in CORS middleware. See `07-org-chat-backend/src/app/config.py`. |

## Bug Fixes & Verified Learnings (2026-02-13)

| Bug ID | Issue | Fix |
|--------|-------|-----|
| C1 | `budget_variance` never JOINed actual cost data — returned budget amounts only | Added LEFT JOIN to `cost_data_standard_1_3` with actual_spend, variance, utilization_pct, status columns |
| C2 | `budget_summary` same — no actual cost comparison | Added CTE with actual_costs from FOCUS table, computes total_actual, variance, utilization_pct |
| C3 | `list_budgets` `is_active=False` skipped filter (showed ALL instead of inactive only) | Changed type to `Optional[bool]`, use `is True`/`is False` checks |
| C4 | `compare_periods` YoY crashed on Feb 29 (leap year) | Use `calendar.monthrange()` to clamp day to valid range |
| H1-H2 | SQL f-string injection: LIMIT and INTERVAL values in costs.py/usage.py/budgets.py | Parameterized all via `@limit`, `@days`, `@lookback` query parameters |
| H3-H4 | `_query_result_cache` and `_dry_run_cache` unbounded memory growth | Added max size (500) with eviction on overflow |
| H5 | Explorer `run_read_query` blocked CTEs (`WITH ... SELECT`) | Updated regex to allow `WITH` prefix |
| H6 | `describe_table` bare name only tried `{org}_prod` | Added fallback to try `organizations` dataset |
| M2 | `compare_periods` silently returned 0% on query errors | Added error propagation check |
| M4 | Inconsistent TIMESTAMP casting in genai_usage vs query_costs | Normalized to string comparison (matches query_costs pattern) |

## Environments

| Environment | Chat Backend URL | Frontend URL | BigQuery | LLM Config |
|-------------|-----------------|--------------|----------|------------|
| local | `http://localhost:8002` | `http://localhost:3000` | cloudact-testing-1 | BYOK (org credentials) |
| stage | Cloud Run URL | Cloud Run URL | cloudact-testing-1 | BYOK (org credentials) |
| prod | `https://chat.cloudact.ai` | `https://cloudact.ai` | cloudact-prod | BYOK (org credentials) |

```bash
# Local dev
cd 07-org-chat-backend && source venv/bin/activate
python3 -m uvicorn src.app.main:app --port 8002 --reload
```

## Testing

### Health Check
```bash
curl -s http://localhost:8002/health | python3 -m json.tool
# Expected: { "status": "healthy" }
```

### Send Message
```bash
curl -X POST "http://localhost:8002/api/v1/chat/{org}/message" \
  -H "X-API-Key: {org_api_key}" \
  -H "Content-Type: application/json" \
  -d '{"message": "What are my top costs?", "conversation_id": null}'
# Expected: Streaming response with cost analysis
```

### Verify Chat Tables (BigQuery)
```bash
bq query --nouse_legacy_sql \
  "SELECT table_id FROM \`cloudact-testing-1.organizations.__TABLES__\` WHERE table_id LIKE 'org_chat_%'"
# Expected: org_chat_conversations, org_chat_messages, org_chat_sessions, org_chat_feedback
```

### Multi-Environment
```bash
# Stage
curl -s "https://cloudact-chat-backend-test-*.a.run.app/health"

# Prod
curl -s "https://chat.cloudact.ai/health"
```

## Related Skills

| Skill | Relationship |
|-------|-------------|
| `/integration-setup` | Credential management (KMS encryption). Chat reuses org_integration_credentials. |
| `/security-audit` | Multi-tenancy audit. Chat adds 6-layer isolation pattern. |
| `/cost-analysis` | Cost data architecture. Chat's CostAnalyst queries the same FOCUS 1.3 data. |
| `/frontend-dev` | Next.js patterns. Chat UI follows CloudAct component conventions. |
| `/api-dev` | FastAPI patterns. Chat backend follows CloudAct API conventions. |
| `/bootstrap-onboard` | Bootstrap creates the 4 chat BigQuery tables. |
| `/budget-planning` | BudgetManager agent queries budget data via 4 read-only tools. |
| `/notifications` | AlertManager agent uses notification alert tools. |

## Source Specifications

Requirements consolidated from:
- `07_MULTI_TENANT_AI_CHAT.md` (v1.0.0) - Full chat system specification
