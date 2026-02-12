# 07-org-chat-backend

Multi-tenant AI chat backend for CloudAct. Google ADK agents + 13 MCP tools + BYOK via LiteLlm.

## Service

| Property | Value |
|----------|-------|
| Port | 8002 |
| Framework | FastAPI + Google ADK v1.22+ |
| Access | INTERNAL ONLY (VPC connector from 01-frontend) |
| Cloud Run | cloudact-chat-backend |
| Python | 3.11+ |

## Architecture

```
01-fronted-system (3000)          07-org-chat-backend (8002)          BigQuery
┌─────────────────────┐           ┌──────────────────────────┐        ┌───────────────────┐
│ /[orgSlug]/chat     │           │  FastAPI + ADK Runner    │        │ organizations     │
│ /api/copilotkit     │──AG-UI──▶ │  1. Auth (X-Org-Slug,   │        │ ├── org_chat_*    │
│ /settings/ai-chat   │           │     X-API-Key, X-User-Id)│        │ ├── org_api_keys  │
└─────────────────────┘           │  2. Load settings        │        │ └── org_int_creds │
                                  │  3. KMS decrypt key      │        │                   │
02-api-service (8000)             │  4. Load history         │◄──────▶│ {org_slug}_prod   │
┌─────────────────────┐           │  5. Build agents         │        │ ├── cost_data_*   │
│ /chat-settings CRUD │           │  6. Execute + stream     │        │ └── org_alert_*   │
│ (provider, model,   │           │  7. Persist messages     │        └───────────────────┘
│  credential setup)  │           │  8. Clear key from mem   │
└─────────────────────┘           └──────────────────────────┘
```

## Agent Hierarchy

```
Orchestrator (Root) ─ customer's model + key ─ routes only, no tools
├── CostAnalyst     ─ same model + key
│   └── Tools: query_costs, compare_periods, cost_breakdown, cost_forecast, top_cost_drivers
├── AlertManager    ─ same model + key
│   └── Tools: list_alerts, create_alert, alert_history, acknowledge_alert
├── UsageAnalyst    ─ same model + key
│   └── Tools: genai_usage, quota_status, top_consumers, pipeline_runs
└── Explorer        ─ same model + key
    └── Tools: list_org_tables, describe_table, run_read_query
```

## Endpoints

```
GET    /health                                                    # Health check
POST   /api/v1/chat/{org_slug}/send                              # Send message → agent response
GET    /api/v1/chat/{org_slug}/conversations                     # List user conversations
GET    /api/v1/chat/{org_slug}/conversations/{id}/messages       # Message history
GET    /api/v1/chat/{org_slug}/settings/status                   # Chat config status
POST   /copilotkit                                                # AG-UI endpoint (CopilotKit)
GET    /.well-known/agent.json                                    # A2A agent card
```

## Multi-Tenancy (6 Layers)

| Layer | Component | Blocks |
|-------|-----------|--------|
| 1. Authentication | Supabase JWT (in frontend) | User A accessing Org B |
| 2. API Key | X-API-Key → SHA256 → BigQuery lookup | Forged org_slug |
| 3. Agent Scoping | org_slug in all agent instructions | Cross-org hallucination |
| 4. Tool Binding | `bind_org_slug()` via `functools.partial` | LLM prompt injection |
| 5. Query Safety | Parameterized SQL + dry-run gate (10GB) + dataset validation | SQL injection, expensive queries |
| 6. Data Isolation | `{org_slug}_prod` datasets + `org_slug` WHERE clause | Storage-level leakage |

**Critical rule:** `org_slug` format `^[a-z0-9_]{3,50}$` enforced at EVERY entry point.

## BYOK (Bring Your Own Key)

| Provider | LiteLlm Prefix | Models |
|----------|----------------|--------|
| OpenAI | `openai/` | gpt-4o, gpt-4o-mini, gpt-4-turbo, o1, o1-mini |
| Anthropic | `anthropic/` | claude-opus-4, claude-sonnet-4, claude-3.5-sonnet |
| Gemini | (native ADK) | gemini-2.0-flash, gemini-1.5-pro |
| DeepSeek | `deepseek/` | deepseek-chat, deepseek-coder, deepseek-v3 |

**Flow:** Settings page → credential stored in `org_integration_credentials` (KMS-encrypted) → chat backend loads + decrypts per-request → passes to LiteLlm → key cleared from memory after response.

## MCP Tools (13 Total)

### Costs (5)

| Tool | Parameters | Returns |
|------|-----------|---------|
| `query_costs` | provider, service_category, date range, group_by, limit | rows, count, bytes_processed |
| `compare_periods` | period_type (MTD/MoM/QoQ/YoY), provider | current, previous, change_pct |
| `cost_breakdown` | dimension (provider/service/team/region/model), date range | dimension, total, pct_of_total |
| `cost_forecast` | horizon_days (1-90) | avg_daily, projected_total, confidence |
| `top_cost_drivers` | days, limit | service, current_cost, pct_change |

### Alerts (4)

| Tool | Parameters | Returns |
|------|-----------|---------|
| `list_alerts` | status (active/paused/disabled) | alert configs |
| `create_alert` | threshold, provider, severity | alert_id |
| `alert_history` | date range, limit | trigger history |
| `acknowledge_alert` | alert_history_id | acknowledged status |

### Usage (4)

| Tool | Parameters | Returns |
|------|-----------|---------|
| `genai_usage` | provider, model, date range | tokens, requests, cost |
| `quota_status` | (none) | daily/monthly limits and usage |
| `top_consumers` | dimension, limit | top models/services by usage |
| `pipeline_runs` | provider, status, limit | recent pipeline executions |

### Explorer (3)

| Tool | Parameters | Returns |
|------|-----------|---------|
| `list_org_tables` | (none) | tables in org_prod + organizations |
| `describe_table` | table_name | schema, row count, bytes |
| `run_read_query` | query (SELECT only) | rows (max 500) |

**Security:** Explorer validates dataset references in SQL, project ID in table refs, SELECT-only, LIMIT 500 auto-injected.

## BigQuery Tables (4 new, in `organizations` dataset)

| Table | Partition | Cluster | Purpose |
|-------|-----------|---------|---------|
| `org_chat_settings` | none | org_slug, is_active | BYOK config per org |
| `org_chat_conversations` | DAY(created_at) | org_slug, user_id, status | Session metadata |
| `org_chat_messages` | DAY(created_at) | org_slug, conversation_id, role | Message content |
| `org_chat_tool_calls` | DAY(created_at) | org_slug, conversation_id, tool_name | Audit log |

## Directory Structure

```
07-org-chat-backend/
├── Dockerfile                         # 2-stage build, Python 3.11, port 8002
├── pyproject.toml                     # v1.0.0
├── requirements.txt
├── CLAUDE.md                          # This file
├── README.md                          # Detailed documentation
├── src/
│   ├── app/
│   │   ├── main.py                    # FastAPI app, lifecycle, all endpoints
│   │   ├── config.py                  # Pydantic Settings (env-driven)
│   │   ├── dependencies/
│   │   │   └── auth.py                # ChatContext: org_slug + api_key_hash validation
│   │   └── middleware/
│   │       ├── cors.py                # CORS from settings
│   │       └── logging.py            # Request logging (method, path, latency, org_slug)
│   ├── core/
│   │   ├── agents/
│   │   │   ├── __init__.py            # create_agent_for_org(), root_agent (lazy)
│   │   │   ├── orchestrator.py        # Root agent (routes to sub-agents)
│   │   │   ├── cost_analyst.py        # 5 cost tools
│   │   │   ├── alert_manager.py       # 4 alert tools
│   │   │   ├── usage_analyst.py       # 4 usage tools
│   │   │   ├── explorer.py            # 3 explorer tools
│   │   │   └── model_factory.py       # create_model() via LiteLlm
│   │   ├── tools/
│   │   │   ├── shared.py              # safe_query, bind_org_slug, helpers
│   │   │   ├── costs.py               # Cost tool implementations
│   │   │   ├── alerts.py              # Alert tool implementations
│   │   │   ├── usage.py               # Usage tool implementations
│   │   │   └── explorer.py            # Explorer tool implementations + SQL parsing
│   │   ├── security/
│   │   │   ├── org_validator.py       # validate_org() with TTL cache (5m, max 1000)
│   │   │   ├── query_guard.py         # dry-run gate (10GB limit)
│   │   │   └── kms_decryption.py      # decrypt_value(), decrypt_value_base64()
│   │   ├── sessions/
│   │   │   └── bq_session_store.py    # Conversations, messages, settings persistence
│   │   ├── engine/
│   │   │   └── bigquery.py            # BQ client, execute_query, streaming_insert
│   │   └── observability/
│   │       └── logging.py            # JSON structured logging
│   ├── configs/
│   │   ├── agents.yml                 # Agent definitions + tool mapping
│   │   ├── allowed_tables.yml         # Table/column whitelist
│   │   └── system_prompts/            # 5 agent system prompts (markdown)
│   └── a2a/
│       └── agent_card.py              # A2A discovery endpoint
└── tests/                             # Test stubs (pytest)
```

## Configuration (Environment Variables)

| Variable | Default | Description |
|----------|---------|-------------|
| `GCP_PROJECT_ID` | local-dev-project | GCP project |
| `ENVIRONMENT` | development | development/local/test/staging/production |
| `DISABLE_AUTH` | false | Auth bypass (only works in dev/local/test) |
| `ORGANIZATIONS_DATASET` | organizations | Shared BigQuery dataset |
| `KMS_KEYRING` | cloudact-keyring | GCP KMS keyring |
| `KMS_KEY` | api-key-encryption | KMS encryption key |
| `CORS_ORIGINS` | ["http://localhost:3000"] | Allowed origins |
| `BQ_MAX_BYTES_GATE` | 10GB | Dry-run cost gate |
| `DEFAULT_TEMPERATURE` | 0.7 | LLM temperature |
| `DEFAULT_MAX_TOKENS` | 4096 | LLM max output tokens |
| `DEFAULT_MAX_HISTORY` | 50 | Messages loaded per conversation |

## Development

```bash
cd 07-org-chat-backend
pip install -r requirements.txt
python3 -m uvicorn src.app.main:app --port 8002 --reload
```

## Key Rules

1. **org_slug is NEVER trusted from LLM** — always pre-bound via `bind_org_slug()`
2. **disable_auth** only works when `ENVIRONMENT` is development/local/test
3. **Explorer SQL** must validate dataset references AND project ID before execution
4. **KMS keys** decrypted per-request, cleared from memory after response
5. **No `os.environ` mutation** for API keys — LiteLlm takes per-request key param
6. **safe_query** returns `{"error": str}` on failure, never crashes agent
7. **Streaming inserts** must raise on errors (no silent data loss)
8. **root_agent** uses `__getattr__` lazy init (no import-time side effects)

## Spec

See `.claude/skills/chat/requirements/chat.md`
