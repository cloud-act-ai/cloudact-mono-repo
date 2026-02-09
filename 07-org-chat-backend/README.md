# CloudAct AI Chat Backend

Multi-tenant AI chat backend powering natural language interaction with cloud cost, alert, and usage data. Built on Google ADK (Agent Development Kit) with 13 MCP tools, BYOK (Bring Your Own Key) support, and 6-layer org-scoped isolation.

## Table of Contents

- [Overview](#overview)
- [Architecture](#architecture)
- [Getting Started](#getting-started)
- [API Reference](#api-reference)
- [Agent System](#agent-system)
- [MCP Tools](#mcp-tools)
- [Multi-Tenancy & Security](#multi-tenancy--security)
- [BYOK (Bring Your Own Key)](#byok-bring-your-own-key)
- [BigQuery Schema](#bigquery-schema)
- [Configuration](#configuration)
- [Deployment](#deployment)
- [Troubleshooting](#troubleshooting)

---

## Overview

| Property | Value |
|----------|-------|
| Service | org-chat-backend |
| Port | 8002 |
| Framework | FastAPI + Google ADK v1.22+ |
| Python | 3.11+ |
| Access | Internal only (VPC connector from frontend) |
| Cloud Run | cloudact-chat-backend |
| Data Store | BigQuery (single source of truth) |
| LLM Support | OpenAI, Anthropic, Gemini, DeepSeek (via LiteLlm) |

The chat backend enables organizations to query their cost data through natural language. Each organization brings their own LLM API key (BYOK), which is stored encrypted via GCP KMS. The system uses a hierarchy of specialized agents that route queries to the appropriate domain expert.

---

## Architecture

### System Context

```
┌───────────────────────────────────────────────────────────────────────────┐
│  01-fronted-system (Cloud Run, port 3000)                                 │
│                                                                           │
│  /[orgSlug]/settings/ai-chat   ← Provider + key + model configuration    │
│  /[orgSlug]/chat               ← CopilotChat UI (streaming)              │
│  /[orgSlug]/chat/[convId]      ← Existing conversation                   │
│  /api/copilotkit/              ← CopilotKit Runtime proxy                │
│                                                                           │
│  Auth: Supabase JWT → org membership → getAuthContext() → server-side    │
│  headers (X-Org-Slug, X-API-Key, X-User-Id) forwarded to backend        │
└───────────────────────┬───────────────────────────────────────────────────┘
                        │ HTTP/SSE (AG-UI Protocol)
┌───────────────────────▼───────────────────────────────────────────────────┐
│  07-org-chat-backend (Cloud Run, port 8002, INTERNAL ONLY)                │
│                                                                           │
│  Per-Request Lifecycle:                                                   │
│  ┌─────────────────────────────────────────────────────────────────────┐  │
│  │ 1. Validate headers (X-Org-Slug format + X-API-Key hash in BQ)    │  │
│  │ 2. Load org_chat_settings (provider, model, credential_id)        │  │
│  │ 3. Decrypt LLM credential via GCP KMS                             │  │
│  │ 4. Load conversation history (last N messages from BigQuery)       │  │
│  │ 5. Build ADK agent hierarchy (one key for all agents)             │  │
│  │ 6. Execute agent via ADK Runner                                    │  │
│  │ 7. Persist messages + tool calls (streaming insert to BigQuery)   │  │
│  │ 8. Clear decrypted key from memory                                │  │
│  └─────────────────────────────────────────────────────────────────────┘  │
│                                                                           │
│  ┌── Orchestrator (Root) ───────────────────────────────────────────┐    │
│  │ Routes queries to specialized sub-agents based on intent          │    │
│  │                                                                   │    │
│  │ ├── CostAnalyst ─── query_costs, compare_periods,                │    │
│  │ │                    cost_breakdown, cost_forecast,               │    │
│  │ │                    top_cost_drivers                             │    │
│  │ │                                                                 │    │
│  │ ├── AlertManager ── list_alerts, create_alert,                   │    │
│  │ │                    alert_history, acknowledge_alert             │    │
│  │ │                                                                 │    │
│  │ ├── UsageAnalyst ── genai_usage, quota_status,                   │    │
│  │ │                    top_consumers, pipeline_runs                 │    │
│  │ │                                                                 │    │
│  │ └── Explorer ────── list_org_tables, describe_table,             │    │
│  │                      run_read_query                               │    │
│  └───────────────────────────────────────────────────────────────────┘    │
└───────────────────────┬───────────────────────────────────────────────────┘
                        │
┌───────────────────────▼───────────────────────────────────────────────────┐
│  BigQuery                                                                 │
│                                                                           │
│  organizations (shared dataset):                                          │
│  ├── org_chat_settings          ← BYOK config per org                    │
│  ├── org_chat_conversations     ← Conversation metadata                  │
│  ├── org_chat_messages          ← Message content + token counts         │
│  ├── org_chat_tool_calls        ← Tool invocation audit log              │
│  ├── org_api_keys               ← API key validation (hash lookup)       │
│  └── org_integration_credentials ← KMS-encrypted LLM API keys           │
│                                                                           │
│  {org_slug}_prod (per-tenant dataset, read by MCP tools):                │
│  ├── cost_data_standard_1_3     ← FOCUS 1.3 unified costs               │
│  ├── x_org_hierarchy            ← Org hierarchy tree                     │
│  ├── org_notification_rules     ← Alert configurations                   │
│  └── org_alert_history          ← Alert trigger log                      │
└───────────────────────────────────────────────────────────────────────────┘
```

### Request Flow (Send Message)

```
Client POST /api/v1/chat/{org_slug}/send
  │
  ├─ 1. Auth middleware: validate X-Org-Slug format (^[a-z0-9_]{3,50}$)
  ├─ 2. Auth dependency: hash X-API-Key → lookup in org_api_keys → ChatContext
  ├─ 3. Path validation: org_slug in URL must match authenticated context
  │
  ├─ 4. Load org_chat_settings → {provider, credential_id, model_id, temperature}
  ├─ 5. Load encrypted credential → KMS decrypt → plaintext API key
  ├─ 6. Load conversation history (last 50 messages from org_chat_messages)
  │
  ├─ 7. Create ADK agents:
  │     ├─ model = LiteLlm(provider/model_id, api_key=decrypted_key)
  │     ├─ tools = [bind_org_slug(fn, org_slug) for fn in domain_tools]
  │     └─ orchestrator → [cost_analyst, alert_manager, usage_analyst, explorer]
  │
  ├─ 8. ADK Runner.run_async(session, user_message)
  │     ├─ Orchestrator routes to appropriate sub-agent
  │     ├─ Sub-agent calls MCP tools (safe_query → BigQuery)
  │     └─ Returns response text
  │
  ├─ 9. Persist: user message + assistant response → org_chat_messages
  ├─ 10. Persist: tool calls → org_chat_tool_calls (audit log)
  ├─ 11. Update: conversation metadata (message_count, last_message_at)
  │
  └─ 12. Response: {org_slug, response, agent_name, model_id, latency_ms}
```

---

## Getting Started

### Prerequisites

- Python 3.11+
- GCP service account with BigQuery + KMS permissions
- BigQuery dataset `organizations` with chat tables bootstrapped
- An organization with chat settings configured (provider, model, credential)

### Local Development

```bash
# 1. Install dependencies
cd 07-org-chat-backend
pip install -r requirements.txt

# 2. Configure environment
cp .env.example .env
# Edit .env with your GCP project, KMS settings, etc.

# 3. Set GCP credentials
export GOOGLE_APPLICATION_CREDENTIALS=/path/to/service-account.json

# 4. Start the server
python3 -m uvicorn src.app.main:app --port 8002 --reload

# 5. Test health
curl http://localhost:8002/health
```

### Dev Mode (Auth Disabled)

For local development without API key validation:

```bash
# In .env
DISABLE_AUTH=true
ENVIRONMENT=development  # REQUIRED — disable_auth rejected in staging/production
```

### Quick Test

```bash
# Health check
curl http://localhost:8002/health

# Check settings status (requires auth or DISABLE_AUTH=true)
curl -H "X-Org-Slug: acme_inc" -H "X-API-Key: your-key" -H "X-User-Id: user123" \
  http://localhost:8002/api/v1/chat/acme_inc/settings/status

# Send a message
curl -X POST http://localhost:8002/api/v1/chat/acme_inc/send \
  -H "Content-Type: application/json" \
  -H "X-Org-Slug: acme_inc" -H "X-API-Key: your-key" -H "X-User-Id: user123" \
  -d '{"message": "What is my total cloud cost this month?"}'

# List conversations
curl -H "X-Org-Slug: acme_inc" -H "X-API-Key: your-key" -H "X-User-Id: user123" \
  http://localhost:8002/api/v1/chat/acme_inc/conversations

# Get message history
curl -H "X-Org-Slug: acme_inc" -H "X-API-Key: your-key" -H "X-User-Id: user123" \
  http://localhost:8002/api/v1/chat/acme_inc/conversations/{conversation_id}/messages
```

---

## API Reference

### Health Check

```
GET /health
```

Response:
```json
{
  "status": "healthy",
  "service": "org-chat-backend",
  "version": "1.0.0"
}
```

### Send Message

```
POST /api/v1/chat/{org_slug}/send
```

Headers:
| Header | Required | Description |
|--------|----------|-------------|
| X-Org-Slug | Yes | Organization slug (must match path) |
| X-API-Key | Yes | Organization API key |
| X-User-Id | No | User identifier (default: "anonymous") |

Request:
```json
{
  "message": "What is my total cloud cost for GCP last year?",
  "conversation_id": "optional-uuid-to-continue-conversation"
}
```

Response:
```json
{
  "org_slug": "acme_inc",
  "response": "Based on your GCP cost data, your total cloud spend...",
  "agent_name": "CostAnalyst",
  "model_id": "gpt-4o",
  "conversation_id": "uuid",
  "latency_ms": 3421
}
```

### List Conversations

```
GET /api/v1/chat/{org_slug}/conversations
```

Response:
```json
{
  "org_slug": "acme_inc",
  "conversations": [
    {
      "conversation_id": "uuid",
      "title": "GCP cost analysis",
      "provider": "OPENAI",
      "model_id": "gpt-4o",
      "status": "active",
      "message_count": 12,
      "created_at": "2026-02-09T10:00:00Z",
      "last_message_at": "2026-02-09T10:15:00Z"
    }
  ]
}
```

### Get Message History

```
GET /api/v1/chat/{org_slug}/conversations/{conversation_id}/messages
```

Response:
```json
{
  "org_slug": "acme_inc",
  "conversation_id": "uuid",
  "messages": [
    {
      "message_id": "uuid",
      "role": "user",
      "content": "What is my total cloud cost?",
      "created_at": "2026-02-09T10:00:00Z"
    },
    {
      "message_id": "uuid",
      "role": "assistant",
      "content": "Based on your cost data...",
      "agent_name": "CostAnalyst",
      "model_id": "gpt-4o",
      "latency_ms": 2100,
      "created_at": "2026-02-09T10:00:03Z"
    }
  ]
}
```

### Settings Status

```
GET /api/v1/chat/{org_slug}/settings/status
```

Response (configured):
```json
{
  "configured": true,
  "provider": "OPENAI",
  "model_id": "gpt-4o"
}
```

Response (not configured):
```json
{
  "configured": false,
  "provider": null,
  "model_id": null
}
```

### A2A Agent Card

```
GET /.well-known/agent.json
```

Returns the A2A protocol agent discovery card for external service integration.

---

## Agent System

### Orchestrator (Root)

The root agent receives all user messages and routes them to the appropriate specialist based on intent:

| Query Type | Routed To | Example |
|------------|-----------|---------|
| Cost questions | CostAnalyst | "What is my total GCP spend this month?" |
| Alert management | AlertManager | "Create an alert when daily costs exceed $500" |
| Usage/quota questions | UsageAnalyst | "Show me top token consumers" |
| Data exploration | Explorer | "What tables are available?" |
| General/mixed | Orchestrator handles directly | "Hello" / "Summarize my account" |

### Sub-Agent Creation

Each sub-agent is created per-request with the org's own model and key:

```python
# model_factory.py
model = LiteLlm(
    model=f"{provider_prefix}/{model_id}",  # e.g., "openai/gpt-4o"
    api_key=decrypted_key,                   # Per-request, never global
    generation_config=GenerateContentConfig(
        temperature=settings.temperature,
        max_output_tokens=settings.max_tokens,
    ),
)

# Agent creation with org-scoped tools
tools = [bind_org_slug(fn, org_slug) for fn in [query_costs, compare_periods, ...]]
agent = LlmAgent(name="CostAnalyst", model=model, tools=tools, instruction=prompt)
```

### Lazy Initialization

The `root_agent` uses `__getattr__` for lazy initialization to prevent import-time side effects:

```python
# agents/__init__.py
def __getattr__(name):
    if name == "root_agent":
        return create_default_agent()
    raise AttributeError(name)
```

---

## MCP Tools

### Tool Security Model

Every tool follows a strict security pattern:

1. **org_slug pre-bound** via `functools.partial` (bind_org_slug) — the LLM cannot override it
2. **validate_org()** called first — format check + BigQuery existence check
3. **Parameterized SQL** — no string interpolation, uses `@param` placeholders
4. **dry_run_estimate()** before execution — 10GB cost gate
5. **Results filtered** by org_slug WHERE clause — no cross-org data leakage
6. **safe_query()** wrapper — returns `{"error": str}` on failure, never crashes

### Costs Domain (5 tools)

| Tool | Description | Key Parameters |
|------|-------------|----------------|
| `query_costs` | Query FOCUS 1.3 unified cost data | provider, service_category, date range, group_by (provider/service/team/day/month), limit |
| `compare_periods` | Period-over-period comparison | period_type (MTD/MoM/QoQ/YoY), provider |
| `cost_breakdown` | Dimensional breakdown | dimension (provider/service/team/region/model), date range |
| `cost_forecast` | Linear projection forecast | horizon_days (1-90, default 30) |
| `top_cost_drivers` | Top services by spend change | days (1-90), limit (1-20) |

Data source: `{org_slug}_prod.cost_data_standard_1_3` (FOCUS 1.3 format)

### Alerts Domain (4 tools)

| Tool | Description | Key Parameters |
|------|-------------|----------------|
| `list_alerts` | List configured alert rules | status (active/paused/disabled) |
| `create_alert` | Create new cost alert | alert_name, threshold_value, provider, severity (info/warning/critical) |
| `alert_history` | View alert trigger history | date range, limit (up to 100) |
| `acknowledge_alert` | Acknowledge triggered alert | alert_history_id |

Data source: `{org_slug}_prod.org_notification_rules`, `org_alert_history`

### Usage Domain (4 tools)

| Tool | Description | Key Parameters |
|------|-------------|----------------|
| `genai_usage` | GenAI token consumption | provider, model, date range |
| `quota_status` | Current plan quota usage | (none — reads from org_usage_quotas) |
| `top_consumers` | Top consumers by dimension | dimension (model/service/provider), limit |
| `pipeline_runs` | Pipeline execution history | provider, status (COMPLETED/FAILED/RUNNING), limit |

### Explorer Domain (3 tools)

| Tool | Description | Security |
|------|-------------|----------|
| `list_org_tables` | List all accessible tables | Scoped to `{org_slug}_prod` + `organizations` |
| `describe_table` | Get table schema | Validates dataset + project ID |
| `run_read_query` | Execute ad-hoc SQL | SELECT-only, dataset validation, LIMIT 500, project ID check |

Explorer-specific security:
- SQL is parsed to extract all referenced datasets — must be in allowlist
- Table references are reconstructed with the service's GCP project ID (prevents cross-project access)
- DDL/DML keywords (INSERT, UPDATE, DELETE, DROP, etc.) are rejected
- LIMIT 500 auto-injected if missing

---

## Multi-Tenancy & Security

### 6-Layer Isolation Model

```
Layer 1: Supabase JWT (Frontend)
  └── Validates user session, extracts user identity

Layer 2: API Key Validation (Auth Dependency)
  └── X-API-Key → SHA256 hash → lookup in org_api_keys → matches org_slug

Layer 3: Agent Scoping (Orchestrator)
  └── org_slug injected into all agent instructions → prevents hallucination

Layer 4: Tool Binding (functools.partial)
  └── org_slug pre-bound to every tool function → LLM cannot override

Layer 5: Query Safety (Guard + Validation)
  └── Parameterized SQL + dry-run gate (10GB) + dataset reference validation

Layer 6: Data Isolation (BigQuery)
  └── Separate {org_slug}_prod datasets + org_slug WHERE on shared tables
```

### org_slug Validation

The pattern `^[a-z0-9_]{3,50}$` is enforced at **every layer**:

| Location | File |
|----------|------|
| Frontend auth-cache | `01-fronted-system/lib/auth-cache.ts` |
| Frontend params | `01-fronted-system/lib/utils/params.ts` |
| Frontend validation | `01-fronted-system/lib/utils/validation.ts` |
| API service middleware | `02-api-service/src/app/middleware/validation.py` |
| API service chat router | `02-api-service/src/app/routers/chat_settings.py` |
| Chat backend auth | `07-org-chat-backend/src/app/dependencies/auth.py` |
| Chat backend endpoints | `07-org-chat-backend/src/app/main.py` |
| Chat backend org_validator | `07-org-chat-backend/src/core/security/org_validator.py` |

### disable_auth Guard

The `DISABLE_AUTH=true` setting is only allowed when `ENVIRONMENT` is one of: `development`, `local`, `test`. In staging or production, the system will return HTTP 500 and log a security error.

### CopilotKit Route Security

The `/api/copilotkit` route in the frontend **never trusts client-provided headers**. It:
1. Validates org_slug format from the client header
2. Calls `getAuthContext(orgSlug)` server-side to get the real API key
3. Forwards server-validated credentials (not client headers) to the backend

---

## BYOK (Bring Your Own Key)

### Supported Providers

| Provider | LiteLlm Prefix | ADK Integration | Available Models |
|----------|----------------|-----------------|------------------|
| OpenAI | `openai/` | Via LiteLlm | gpt-4o, gpt-4o-mini, gpt-4-turbo, o1, o1-mini |
| Anthropic | `anthropic/` | Via LiteLlm | claude-opus-4, claude-sonnet-4, claude-3.5-sonnet, claude-3.5-haiku |
| Gemini | (native) | Native ADK | gemini-2.0-flash, gemini-1.5-pro, gemini-1.5-flash |
| DeepSeek | `deepseek/` | Via LiteLlm | deepseek-chat, deepseek-coder, deepseek-v3 |

### Key Lifecycle

```
Settings Page → API Key Input
    │
    ├── 1. Validate key against provider API (02-api-service)
    ├── 2. Encrypt via GCP KMS (cloudact-keyring / api-key-encryption)
    ├── 3. Store as BYTES in org_integration_credentials (BigQuery)
    ├── 4. Create org_chat_settings row (provider, model, credential_id)
    │
    ▼
Chat Request → Decrypt + Use
    │
    ├── 5. Load org_chat_settings (provider, credential_id)
    ├── 6. Load encrypted credential from org_integration_credentials
    ├── 7. KMS decrypt → plaintext API key (in memory)
    ├── 8. Create LiteLlm model instance (api_key=plaintext)
    ├── 9. Execute agent(s)
    └── 10. `del api_key` — clear from memory
```

### Thread Safety

API keys are **never stored in environment variables** (`os.environ` mutation is not thread-safe). Instead, each request creates its own LiteLlm model instance with the key passed as a parameter.

### Credential Rotation

When a user rotates their API key:
- Old credential: `is_active = FALSE`
- New credential: encrypted + stored + validated
- `org_chat_settings.credential_id` updated to new credential
- Existing conversations: preserved (messages are plain text)
- Next chat message: uses new key, loads full history, continues seamlessly

---

## BigQuery Schema

### org_chat_settings

BYOK configuration per organization. Only one active setting per org.

| Column | Type | Mode | Description |
|--------|------|------|-------------|
| setting_id | STRING | REQUIRED | UUID |
| org_slug | STRING | REQUIRED | Organization slug |
| provider | STRING | REQUIRED | OPENAI, ANTHROPIC, GEMINI, DEEPSEEK |
| credential_id | STRING | REQUIRED | FK to org_integration_credentials |
| model_id | STRING | REQUIRED | e.g., gpt-4o, claude-opus-4 |
| model_name | STRING | NULLABLE | Human-readable model name |
| temperature | FLOAT64 | REQUIRED | 0.0-2.0, default 0.7 |
| max_tokens | INTEGER | REQUIRED | Default 4096 |
| include_org_context | BOOLEAN | REQUIRED | Inject org metadata into prompt |
| enable_memory | BOOLEAN | REQUIRED | Load conversation history |
| max_history_messages | INTEGER | REQUIRED | Messages per conversation (default 50) |
| system_prompt_extra | STRING | NULLABLE | Custom instructions |
| is_active | BOOLEAN | REQUIRED | Only one active per org |
| configured_by | STRING | NULLABLE | User ID |
| created_at | TIMESTAMP | REQUIRED | |
| updated_at | TIMESTAMP | NULLABLE | |

Clustering: `org_slug, is_active`

### org_chat_conversations

Conversation session metadata.

| Column | Type | Mode | Description |
|--------|------|------|-------------|
| conversation_id | STRING | REQUIRED | UUID |
| org_slug | STRING | REQUIRED | Organization slug |
| user_id | STRING | REQUIRED | Supabase user ID |
| title | STRING | NULLABLE | Auto-generated or user-set |
| provider | STRING | REQUIRED | Provider snapshot at creation |
| model_id | STRING | REQUIRED | Model snapshot at creation |
| status | STRING | REQUIRED | active, archived |
| message_count | INTEGER | REQUIRED | Running message count |
| created_at | TIMESTAMP | REQUIRED | |
| updated_at | TIMESTAMP | NULLABLE | |
| last_message_at | TIMESTAMP | NULLABLE | |

Partition: DAY on `created_at` | Clustering: `org_slug, user_id, status`

### org_chat_messages

Individual messages within conversations.

| Column | Type | Mode | Description |
|--------|------|------|-------------|
| message_id | STRING | REQUIRED | UUID |
| conversation_id | STRING | REQUIRED | FK to conversations |
| org_slug | STRING | REQUIRED | Organization slug |
| role | STRING | REQUIRED | user, assistant, tool |
| content | STRING | REQUIRED | Message text |
| agent_name | STRING | NULLABLE | Sub-agent that responded |
| tool_calls_json | STRING | NULLABLE | JSON array of tool invocations |
| tool_results_json | STRING | NULLABLE | JSON array of tool results |
| model_id | STRING | NULLABLE | LLM model used |
| input_tokens | INTEGER | NULLABLE | Prompt tokens |
| output_tokens | INTEGER | NULLABLE | Completion tokens |
| latency_ms | INTEGER | NULLABLE | Response time (ms) |
| created_at | TIMESTAMP | REQUIRED | |

Partition: DAY on `created_at` | Clustering: `org_slug, conversation_id, role`

### org_chat_tool_calls

Tool invocation audit log for compliance and debugging.

| Column | Type | Mode | Description |
|--------|------|------|-------------|
| tool_call_id | STRING | REQUIRED | UUID |
| message_id | STRING | REQUIRED | FK to messages |
| conversation_id | STRING | REQUIRED | FK to conversations |
| org_slug | STRING | REQUIRED | Organization slug |
| agent_name | STRING | REQUIRED | CostAnalyst, AlertManager, etc. |
| tool_name | STRING | REQUIRED | query_costs, create_alert, etc. |
| tool_domain | STRING | REQUIRED | costs, alerts, usage, explorer |
| input_params | STRING | REQUIRED | JSON of parameters |
| output_result | STRING | NULLABLE | JSON of result |
| bytes_processed | INTEGER | NULLABLE | BigQuery bytes scanned |
| duration_ms | INTEGER | REQUIRED | Execution time (ms) |
| status | STRING | REQUIRED | success, error |
| error_message | STRING | NULLABLE | Error detail if failed |
| created_at | TIMESTAMP | REQUIRED | |

Partition: DAY on `created_at` | Clustering: `org_slug, conversation_id, tool_name`

---

## Configuration

### Environment Variables

| Variable | Default | Required | Description |
|----------|---------|----------|-------------|
| `GCP_PROJECT_ID` | local-dev-project | Yes (prod) | GCP project ID |
| `BIGQUERY_LOCATION` | US | No | BigQuery dataset location |
| `ENVIRONMENT` | development | No | development/local/test/staging/production |
| `DEBUG` | false | No | Enable debug logging |
| `LOG_LEVEL` | INFO | No | Logging level |
| `API_HOST` | 0.0.0.0 | No | Server bind address |
| `API_PORT` | 8002 | No | Server port |
| `CORS_ORIGINS` | ["http://localhost:3000"] | No | Allowed CORS origins |
| `DISABLE_AUTH` | false | No | Auth bypass (dev/local/test only) |
| `DEFAULT_ORG_SLUG` | dev_org_local | No | Fallback org_slug in dev mode |
| `ORGANIZATIONS_DATASET` | organizations | No | Shared BigQuery dataset name |
| `KMS_KEY_NAME` | (auto-constructed) | No | Full KMS key resource name |
| `KMS_PROJECT_ID` | (uses GCP_PROJECT_ID) | No | KMS project |
| `KMS_LOCATION` | global | No | KMS location |
| `KMS_KEYRING` | cloudact-keyring | No | KMS keyring name |
| `KMS_KEY` | api-key-encryption | No | KMS key name |
| `BQ_QUERY_TIMEOUT_MS` | 30000 | No | BigQuery query timeout |
| `BQ_MAX_BYTES_GATE` | 10737418240 | No | Dry-run cost gate (10GB) |
| `DEFAULT_TEMPERATURE` | 0.7 | No | LLM temperature |
| `DEFAULT_MAX_TOKENS` | 4096 | No | LLM max output tokens |
| `DEFAULT_MAX_HISTORY` | 50 | No | Messages loaded per conversation |
| `SUPABASE_URL` | (none) | No | Supabase URL (for runtime auth) |
| `SUPABASE_SERVICE_ROLE_KEY` | (none) | No | Supabase service role JWT |

### Config Files

| File | Purpose |
|------|---------|
| `src/configs/agents.yml` | Agent names, tool mappings, supported providers |
| `src/configs/allowed_tables.yml` | BigQuery table/column allowlist and blocklist |
| `src/configs/system_prompts/*.md` | System prompts for each agent (5 files) |

---

## Deployment

### Cloud Run

```yaml
Service: cloudact-chat-backend
Port: 8002
CPU: 2
Memory: 8Gi
Access: --no-allow-unauthenticated (INTERNAL ONLY)
VPC Connector: cloudact-vpc-connector
```

The service is internal-only. The frontend connects via VPC connector.

### Cloud Build

Added as a step in `cloudbuild-stage.yaml` and `cloudbuild-prod.yaml`:

```yaml
- name: 'gcr.io/cloud-builders/docker'
  args: ['build', '-t', 'gcr.io/$PROJECT_ID/cloudact-chat-backend:$TAG', '07-org-chat-backend/']
- name: 'gcr.io/google.com/cloudsdktool/cloud-sdk'
  args: ['gcloud', 'run', 'deploy', 'cloudact-chat-backend',
         '--image', 'gcr.io/$PROJECT_ID/cloudact-chat-backend:$TAG',
         '--port', '8002', '--no-allow-unauthenticated',
         '--vpc-connector', 'cloudact-vpc-connector']
```

### Required GCP Permissions

The service account needs:
- `roles/bigquery.dataEditor` — Read/write chat tables
- `roles/bigquery.jobUser` — Execute queries
- `roles/cloudkms.cryptoKeyDecrypter` — Decrypt credentials
- `roles/logging.logWriter` — Write structured logs

---

## Troubleshooting

### Common Issues

| Symptom | Cause | Fix |
|---------|-------|-----|
| 401 on all requests | Wrong API key hash in BigQuery | Verify `org_api_keys.org_api_key_hash` matches SHA256 of key |
| 500 on send_message | Dataset doesn't exist | Create `{org_slug}_prod` dataset with cost tables |
| "Not configured" status | No `org_chat_settings` row | Configure via Settings > AI Chat page |
| KMS decrypt fails | Wrong keyring/key | Verify `KMS_KEYRING=cloudact-keyring`, `KMS_KEY=api-key-encryption` |
| gRPC SSL errors | Missing CA certs | Set `GRPC_DEFAULT_SSL_ROOTS_FILE_PATH=/etc/ssl/certs/ca-certificates.crt` |
| Tool returns error dict | Missing table/dataset | Check BigQuery tables exist, run bootstrap |
| disable_auth rejected | Non-dev environment | Set `ENVIRONMENT=development` for local dev |
| Agent timeout | Slow LLM response | Increase `BQ_QUERY_TIMEOUT_MS`, check LLM provider status |
| Cross-tenant query blocked | Explorer dataset validation | Expected behavior — only `{org_slug}_prod` and `organizations` allowed |

### Debugging

```bash
# Check BQ tables exist
bq ls organizations | grep org_chat

# Check org has settings
bq query "SELECT * FROM organizations.org_chat_settings WHERE org_slug = 'your_org'"

# Check credential exists and is active
bq query "SELECT credential_id, provider, validation_status, is_active FROM organizations.org_integration_credentials WHERE org_slug = 'your_org'"

# Test KMS decryption
python3 -c "from src.core.security.kms_decryption import decrypt_value; print('KMS OK')"

# Check org_api_keys hash
python3 -c "import hashlib; print(hashlib.sha256('your-api-key'.encode()).hexdigest())"
```

---

## Related Documentation

| Doc | Path |
|-----|------|
| Requirements Spec | `00-requirements-specs/07_MULTI_TENANT_AI_CHAT.md` |
| API Service | `02-api-service/CLAUDE.md` |
| Frontend | `01-fronted-system/CLAUDE.md` |
| Root CLAUDE.md | `CLAUDE.md` |
| BigQuery Schemas | `02-api-service/configs/setup/bootstrap/schemas/org_chat_*.json` |
| Bootstrap Config | `02-api-service/configs/setup/bootstrap/config.yml` |

---

**v1.0.0** | 2026-02-09
