# 07 - Multi-Tenant AI Chat System

> **Version:** 1.0.0 | **Date:** 2026-02-09 | **Status:** Planning

## Overview

Multi-tenant AI chat system for CloudAct that allows organizations to interact with their cost, alert, and usage data through natural language. Built on Google ADK (Agent Development Kit) with CopilotKit frontend integration.

## Key Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Chat UI location | IN 01-fronted-system | Same Supabase session, same sidebar, same org routing |
| Separate frontend service | NO (no 06 service) | Would duplicate auth, routing, navigation |
| Backend service | 07-org-chat-backend (port 8002) | Python ADK agents + MCP tools |
| LLM provider | Customer's own key (BYOK) | Customer chooses provider + model in settings |
| Key usage | ONE key for root + ALL sub-agents | No mixed providers, no fallback |
| Key storage | Existing KMS encryption flow | Reuses org_integration_credentials |
| Vector DB | NO | Structured SQL queries superior for cost data; context fits in LLM window |
| Data store | BigQuery (single source of truth) | Consistent with entire platform architecture |
| Agent framework | Google ADK v1.22+ | A2A native, Gemini-optimized, multi-provider via LiteLlm |
| Frontend framework | CopilotKit v1.51+ | AG-UI protocol, streaming, shared state |
| MCP tools | Embedded in 07-backend (in-process) | Single service, no network hop |
| MCP transport | stdio (in-process) | Simplest for embedded tools |
| Message persistence | BigQuery Streaming Inserts | Real-time writes, non-blocking |
| Conversation memory | Last N messages in context window | No vector DB needed (50 msgs = 10K tokens, models have 128K-1M) |
| Credential rotation | Preserves context | Messages are plain text, independent of API key |

## Tech Stack

### Frontend (01-fronted-system enhancements)

| Package | Version | Purpose |
|---------|---------|---------|
| @copilotkit/react-core | ^1.51 | Hooks: useCopilotAction, useCopilotReadable |
| @copilotkit/react-ui | ^1.50 | CopilotChat component |
| @copilotkit/runtime | ^1.51 | CopilotKit Runtime (API route proxy) |

### Backend (07-org-chat-backend, new service)

| Package | Version | Purpose |
|---------|---------|---------|
| google-adk[a2a] | ^1.22 | Agent framework + A2A protocol |
| fastmcp | ^2.0 | MCP tool server (embedded) |
| google-cloud-bigquery | latest | BigQuery client |
| litellm | latest | Multi-provider LLM support (OpenAI, Anthropic, DeepSeek) |
| fastapi | latest | ASGI web framework |
| uvicorn | latest | ASGI server |

### Infrastructure

| Component | Detail |
|-----------|--------|
| Cloud Run | cloudact-chat-backend, port 8002, INTERNAL ONLY |
| GCP KMS | Existing keyring (cloudact-keyring), existing key (api-key-encryption) |
| BigQuery | 4 new tables in organizations dataset |
| VPC Connector | 01-frontend → 07-backend (internal traffic only) |

## Architecture

```
┌──────────────────────────────────────────────────────────────────────┐
│  01-fronted-system (Cloud Run, port 3000)                            │
│                                                                       │
│  /[orgSlug]/settings/ai-chat  ← Provider + key + model setup        │
│  /[orgSlug]/chat              ← CopilotChat UI                      │
│  /api/copilotkit/             ← CopilotKit Runtime (proxy)          │
│                                                                       │
│  Runtime: JWT validation → org_slug extraction → forward to backend  │
└──────────────────────┬───────────────────────────────────────────────┘
                       │ AG-UI Protocol (SSE)
┌──────────────────────▼───────────────────────────────────────────────┐
│  07-org-chat-backend (Cloud Run, port 8002, INTERNAL ONLY)           │
│                                                                       │
│  On each request:                                                    │
│  1. Load org_chat_settings (provider, model, credential_id)          │
│  2. Decrypt credential via KMS                                       │
│  3. Load conversation history from BigQuery                          │
│  4. Build ADK agent hierarchy (one key, all agents)                  │
│  5. Execute agent, stream response                                   │
│  6. Persist messages + tool calls (async BigQuery streaming insert)  │
│  7. Clear decrypted key from memory                                  │
│                                                                       │
│  Agent Hierarchy:                                                    │
│  ┌──────────────────────────────────────────────────────────────┐    │
│  │  Orchestrator (Root) ─ user's model + key                    │    │
│  │  ├── CostAnalyst     ─ user's model + key                    │    │
│  │  │   └── MCP tools: query_costs, compare_periods,            │    │
│  │  │       cost_breakdown, cost_forecast, top_cost_drivers     │    │
│  │  ├── AlertManager    ─ user's model + key                    │    │
│  │  │   └── MCP tools: list_alerts, create_alert,               │    │
│  │  │       alert_history, acknowledge_alert                    │    │
│  │  ├── UsageAnalyst    ─ user's model + key                    │    │
│  │  │   └── MCP tools: genai_usage, quota_status,               │    │
│  │  │       top_consumers, pipeline_runs                        │    │
│  │  └── Explorer        ─ user's model + key                    │    │
│  │      └── BigQueryToolset (ad-hoc SQL, read-only)             │    │
│  └──────────────────────────────────────────────────────────────┘    │
└──────────────────────┬───────────────────────────────────────────────┘
                       │
┌──────────────────────▼───────────────────────────────────────────────┐
│  BigQuery (Single Source of Truth)                                    │
│                                                                       │
│  organizations (central):                                            │
│  ├── org_integration_credentials  ← EXISTING (KMS-encrypted keys)   │
│  ├── org_chat_settings            ← NEW                              │
│  ├── org_chat_conversations       ← NEW                              │
│  ├── org_chat_messages            ← NEW                              │
│  └── org_chat_tool_calls          ← NEW                              │
│                                                                       │
│  {org_slug}_prod (per-tenant, read by MCP tools):                    │
│  ├── cost_data_standard_1_3       ← CostAnalyst                     │
│  ├── genai_*_daily_unified        ← UsageAnalyst                    │
│  └── org_notification_rules/history ← AlertManager                   │
└──────────────────────────────────────────────────────────────────────┘
```

## BYOK (Bring Your Own Key) Flow

### Supported Providers

| Provider | Model Prefix (LiteLlm) | ADK Support | Models |
|----------|----------------------|-------------|--------|
| OpenAI | openai/ | Via LiteLlm | gpt-4o, gpt-4o-mini, gpt-4-turbo, o1, o1-mini |
| Anthropic | anthropic/ | Via LiteLlm | claude-opus-4, claude-sonnet-4, claude-3.5-sonnet, claude-3.5-haiku |
| Gemini | (native) | Native ADK | gemini-2.0-flash, gemini-1.5-pro, gemini-1.5-flash |
| DeepSeek | deepseek/ | Via LiteLlm | deepseek-chat, deepseek-coder, deepseek-v3 |

### Settings Flow

1. User navigates to `/[orgSlug]/settings/ai-chat`
2. Selects provider (OpenAI, Anthropic, Gemini, DeepSeek)
3. System checks for existing integration credentials for that provider
   - Found → "Use existing key" or "Enter different key"
   - Not found → API key input form
4. Key validated against provider API (existing validation flow)
5. Key encrypted via GCP KMS (existing encryption flow)
6. Key stored in `org_integration_credentials` (existing table)
7. User selects model (filtered by validated provider's available models)
8. User configures advanced settings (temperature, max_tokens, etc.)
9. Settings saved to `org_chat_settings`

### Credential Rotation

- User rotates key in Settings → AI Chat → [Rotate Key]
- Old credential: `is_active = FALSE`
- New credential: encrypted + stored + validated
- `org_chat_settings.credential_id` updated to new credential
- Existing conversations: context preserved (messages are plain text in BigQuery)
- Next chat message: uses new key, loads full history, continues seamlessly

### No-Settings Guard

- User opens `/[orgSlug]/chat`
- Backend checks `org_chat_settings` for org
- No settings? → Return `{ status: "setup_required" }`
- Frontend shows: "Set up AI Chat" CTA → links to `/[orgSlug]/settings/ai-chat`
- Invalid key? → Return `{ status: "key_invalid" }`
- Frontend shows: "Your API key is no longer valid. [Update Key]"

## Multi-Tenancy Isolation (6 Layers)

| Layer | Component | What It Blocks |
|-------|-----------|----------------|
| 1. Authentication | Supabase JWT | User A accessing Org B |
| 2. Authorization | CopilotKit Runtime (org membership check) | Tampered org_slug |
| 3. Agent Scoping | ADK agent created per-org with org_slug in prompt | Cross-org hallucination |
| 4. Tool Validation | org_slug REQUIRED param + validate_org() on every tool | Cross-dataset access |
| 5. Query Safety | Parameterized SQL + dry-run gate (10GB limit) | SQL injection, expensive queries |
| 6. Data Isolation | Separate BQ datasets + org_slug column on every row | Storage-level leakage |

## Context Management (No Vector DB)

### Why No Vector DB

- Cost analytics = structured data → SQL queries are more precise than semantic search
- 50 messages x ~200 tokens = ~10K tokens → fits easily in any model's context window (128K-1M)
- MCP tool results are structured JSON → no embedding needed
- Adding vector DB = infrastructure complexity with zero benefit

### Context Loading

1. Load last N messages from `org_chat_messages` (configurable, default 50)
2. Inject into ADK session as conversation history
3. LLM sees full context in its context window
4. After response, append new messages to BigQuery (streaming insert)

### Future (v2, if needed)

BigQuery native `VECTOR_SEARCH` + `ML.GENERATE_EMBEDDING` for cross-conversation semantic search. No new infrastructure — stays in BigQuery.

## BigQuery Tables

### org_chat_settings (NEW)

| Column | Type | Mode | Description |
|--------|------|------|-------------|
| setting_id | STRING | REQUIRED | UUID |
| org_slug | STRING | REQUIRED | Organization slug |
| provider | STRING | REQUIRED | OPENAI, ANTHROPIC, GEMINI, DEEPSEEK |
| credential_id | STRING | REQUIRED | FK to org_integration_credentials |
| model_id | STRING | REQUIRED | e.g., gpt-4o, claude-opus-4 |
| model_name | STRING | NULLABLE | Human-readable model name |
| temperature | FLOAT64 | REQUIRED | Default: 0.7 |
| max_tokens | INTEGER | REQUIRED | Default: 4096 |
| include_org_context | BOOLEAN | REQUIRED | Default: true |
| enable_memory | BOOLEAN | REQUIRED | Default: true |
| max_history_messages | INTEGER | REQUIRED | Default: 50 |
| system_prompt_extra | STRING | NULLABLE | Optional custom instructions |
| is_active | BOOLEAN | REQUIRED | Only one active per org |
| configured_by | STRING | NULLABLE | User ID who configured |
| created_at | TIMESTAMP | REQUIRED | |
| updated_at | TIMESTAMP | NULLABLE | |

### org_chat_conversations (NEW)

| Column | Type | Mode | Description |
|--------|------|------|-------------|
| conversation_id | STRING | REQUIRED | UUID |
| org_slug | STRING | REQUIRED | Organization slug |
| user_id | STRING | REQUIRED | Supabase user ID |
| title | STRING | NULLABLE | Auto-generated or user-set |
| provider | STRING | REQUIRED | Provider used (snapshot) |
| model_id | STRING | REQUIRED | Model used (snapshot) |
| status | STRING | REQUIRED | active, archived |
| message_count | INTEGER | REQUIRED | Running count |
| created_at | TIMESTAMP | REQUIRED | |
| updated_at | TIMESTAMP | NULLABLE | |
| last_message_at | TIMESTAMP | NULLABLE | |

Partition: `created_at` (DAY) | Cluster: `org_slug, user_id, status`

### org_chat_messages (NEW)

| Column | Type | Mode | Description |
|--------|------|------|-------------|
| message_id | STRING | REQUIRED | UUID |
| conversation_id | STRING | REQUIRED | FK to conversations |
| org_slug | STRING | REQUIRED | Organization slug |
| role | STRING | REQUIRED | user, assistant, tool |
| content | STRING | REQUIRED | Message text (plain text) |
| agent_name | STRING | NULLABLE | Which sub-agent responded |
| tool_calls_json | JSON | NULLABLE | Tool invocations in this message |
| tool_results_json | JSON | NULLABLE | Tool results in this message |
| model_id | STRING | NULLABLE | Model that generated response |
| input_tokens | INTEGER | NULLABLE | Token usage (input) |
| output_tokens | INTEGER | NULLABLE | Token usage (output) |
| latency_ms | INTEGER | NULLABLE | Response generation time |
| created_at | TIMESTAMP | REQUIRED | |

Partition: `created_at` (DAY) | Cluster: `org_slug, conversation_id, role`

### org_chat_tool_calls (NEW)

| Column | Type | Mode | Description |
|--------|------|------|-------------|
| tool_call_id | STRING | REQUIRED | UUID |
| message_id | STRING | REQUIRED | FK to messages |
| conversation_id | STRING | REQUIRED | FK to conversations |
| org_slug | STRING | REQUIRED | Organization slug |
| agent_name | STRING | REQUIRED | CostAnalyst, AlertManager, etc. |
| tool_name | STRING | REQUIRED | query_costs, create_alert, etc. |
| tool_domain | STRING | REQUIRED | costs, alerts, usage |
| input_params | JSON | REQUIRED | Parameters passed to tool |
| output_result | JSON | NULLABLE | Result returned from tool |
| bytes_processed | INTEGER | NULLABLE | BigQuery bytes scanned |
| duration_ms | INTEGER | REQUIRED | Tool execution time |
| status | STRING | REQUIRED | success, error |
| error_message | STRING | NULLABLE | Error detail if failed |
| created_at | TIMESTAMP | REQUIRED | |

Partition: `created_at` (DAY) | Cluster: `org_slug, agent_name, tool_name`

## MCP Tools (13 Total)

### Costs Domain (5 tools)

| Tool | Description | Key Parameters |
|------|-------------|----------------|
| query_costs | Query FOCUS 1.3 cost data | org_slug, provider, service_category, date range, group_by |
| compare_periods | Compare costs across periods | org_slug, period_type (MTD/MoM/QoQ/YoY) |
| cost_breakdown | Breakdown by dimension | org_slug, dimension (provider/service/team/region/model) |
| cost_forecast | Forecast using BQ ML | org_slug, horizon_days (1-90) |
| top_cost_drivers | Top cost increase drivers | org_slug, days, limit |

### Alerts Domain (4 tools)

| Tool | Description | Key Parameters |
|------|-------------|----------------|
| list_alerts | List configured alerts | org_slug, status filter |
| create_alert | Create new cost alert | org_slug, threshold, provider, condition |
| alert_history | View alert trigger history | org_slug, date range |
| acknowledge_alert | Acknowledge triggered alert | org_slug, alert_id |

### Usage Domain (4 tools)

| Tool | Description | Key Parameters |
|------|-------------|----------------|
| genai_usage | GenAI usage metrics | org_slug, provider, model, date range |
| quota_status | Current quota usage | org_slug |
| top_consumers | Top models/services by usage | org_slug, dimension, limit |
| pipeline_runs | Pipeline execution history | org_slug, provider, status, date range |

### Security: Every Tool

1. `org_slug` is REQUIRED parameter
2. `validate_org(org_slug)` called first — verifies format + existence
3. SQL is parameterized — no string interpolation
4. `dry_run_check()` before execution — 10GB cost gate
5. Results filtered by `org_slug` — no cross-org data leakage

## Folder Structure

### 01-fronted-system (Changes)

```
src/app/[orgSlug]/
├── settings/
│   └── ai-chat/
│       └── page.tsx                 # Chat settings page (NEW)
└── chat/
    ├── layout.tsx                   # Chat layout (NEW)
    ├── page.tsx                     # New conversation (NEW)
    └── [conversationId]/
        └── page.tsx                 # Existing conversation (NEW)

src/app/api/
└── copilotkit/
    └── route.ts                     # CopilotKit Runtime (NEW)

src/components/
├── chat/
│   ├── chat-layout.tsx              # Split: conversation list + main
│   ├── conversation-list.tsx        # Past conversations sidebar
│   ├── chat-welcome.tsx             # Empty state + prompt suggestions
│   └── chat-copilot.tsx             # CopilotChat wrapper
└── settings/
    └── ai-chat/
        ├── provider-selector.tsx    # Provider card grid
        ├── credential-picker.tsx    # Existing key or new key input
        ├── model-selector.tsx       # Model dropdown (filtered by provider)
        └── advanced-settings.tsx    # Temperature, tokens sliders

src/actions/
└── chat-settings.ts                 # Server actions for settings CRUD

src/lib/chat/
└── constants.ts                     # Provider/model maps, defaults
```

### 07-org-chat-backend (New Service)

```
07-org-chat-backend/
├── src/
│   ├── app/
│   │   ├── main.py                  # FastAPI + AG-UI endpoint
│   │   ├── config.py                # Service configuration
│   │   ├── dependencies/
│   │   │   └── auth.py              # X-Org-Slug + X-API-Key validation
│   │   └── middleware/
│   │       ├── cors.py
│   │       └── logging.py
│   ├── core/
│   │   ├── agents/
│   │   │   ├── __init__.py          # Agent factory (create_agent_hierarchy)
│   │   │   ├── orchestrator.py      # Root agent definition
│   │   │   ├── cost_analyst.py      # Cost sub-agent
│   │   │   ├── alert_manager.py     # Alert sub-agent
│   │   │   ├── usage_analyst.py     # Usage sub-agent
│   │   │   ├── explorer.py          # Ad-hoc BigQuery agent
│   │   │   └── model_factory.py     # create_model_for_org (LiteLlm/native)
│   │   ├── tools/
│   │   │   ├── costs.py             # 5 cost MCP tools
│   │   │   ├── alerts.py            # 4 alert MCP tools
│   │   │   ├── usage.py             # 4 usage MCP tools
│   │   │   └── shared.py            # BQ client, common validation
│   │   ├── security/
│   │   │   ├── org_validator.py     # org_slug format + existence check
│   │   │   ├── query_guard.py       # Dry-run gate, table whitelist
│   │   │   └── kms_decryption.py    # Decrypt credentials (reuse pattern)
│   │   ├── sessions/
│   │   │   └── bq_session_store.py  # BigQuery-backed conversation state
│   │   ├── engine/
│   │   │   └── bigquery.py          # Shared BQ client singleton
│   │   └── observability/
│   │       └── logging.py           # Structured logging
│   ├── configs/
│   │   ├── agents.yml               # Agent configurations
│   │   ├── system_prompts/
│   │   │   ├── orchestrator.md      # Root agent system prompt
│   │   │   ├── cost_analyst.md      # Cost analysis prompt
│   │   │   ├── alert_manager.md     # Alert management prompt
│   │   │   ├── usage_analyst.md     # Usage analysis prompt
│   │   │   └── explorer.md          # Data exploration prompt
│   │   └── allowed_tables.yml       # Table whitelist per domain
│   └── a2a/
│       └── agent_card.py            # A2A discovery card
├── tests/
│   ├── test_agents/
│   │   ├── test_orchestrator.py
│   │   ├── test_cost_analyst.py
│   │   └── test_model_factory.py
│   ├── test_tools/
│   │   ├── test_costs.py
│   │   ├── test_alerts.py
│   │   └── test_usage.py
│   └── test_security/
│       ├── test_org_validator.py
│       └── test_query_guard.py
├── Dockerfile
├── pyproject.toml
├── requirements.txt
└── CLAUDE.md
```

### 02-api-service (Additions)

```
src/app/routers/
└── chat_settings.py                 # NEW: Chat settings CRUD

configs/setup/bootstrap/schemas/
├── org_chat_settings.json           # NEW: Bootstrap schema
├── org_chat_conversations.json      # NEW: Bootstrap schema
├── org_chat_messages.json           # NEW: Bootstrap schema
└── org_chat_tool_calls.json         # NEW: Bootstrap schema
```

## API Endpoints

### 02-api-service (port 8000) — Chat Settings

```
GET    /api/v1/organizations/{org}/chat-settings
       → Returns current chat settings or { configured: false }

POST   /api/v1/organizations/{org}/chat-settings
       → Create/update chat settings (provider, model, credential_id, config)

DELETE /api/v1/organizations/{org}/chat-settings
       → Deactivate chat (is_active = false)

GET    /api/v1/organizations/{org}/chat-settings/models
       → List available models for the configured provider
       → Reads from existing genai_model_pricing or hardcoded MODEL_NAMES
```

### 07-org-chat-backend (port 8002) — Agent Execution

```
POST   /copilotkit
       → AG-UI endpoint (CopilotKit Runtime connects here)
       → Handles: message streaming, tool calls, state sync

GET    /.well-known/agent.json
       → A2A agent card for external discovery

GET    /health
       → Health check
```

## Deployment

| Service | Port | Cloud Run Name | Access | URL |
|---------|------|---------------|--------|-----|
| 07-org-chat-backend | 8002 | cloudact-chat-backend | INTERNAL ONLY | (VPC only) |

- No public URL (internal traffic via VPC connector from 01-frontend)
- Same GCP project, same service account
- KMS permissions: existing SA already has `roles/cloudkms.cryptoKeyEncrypterDecrypter`

### Cloud Build Addition

```yaml
# In cloudbuild-stage.yaml / cloudbuild-prod.yaml
# Add step for 07-org-chat-backend
- name: 'gcr.io/cloud-builders/docker'
  args: ['build', '-t', 'gcr.io/$PROJECT_ID/cloudact-chat-backend:$TAG', '07-org-chat-backend/']
- name: 'gcr.io/google.com/cloudsdktool/cloud-sdk'
  args: ['gcloud', 'run', 'deploy', 'cloudact-chat-backend',
         '--image', 'gcr.io/$PROJECT_ID/cloudact-chat-backend:$TAG',
         '--port', '8002', '--no-allow-unauthenticated',
         '--vpc-connector', 'cloudact-vpc-connector']
```

## Implementation Order

1. **BigQuery schemas** — Create 4 bootstrap JSON schemas
2. **02-api-service** — Chat settings router + bootstrap registration
3. **07-org-chat-backend** — Core service structure
   - a. KMS decryption + model factory
   - b. MCP tools (costs → alerts → usage)
   - c. ADK agents (sub-agents → orchestrator)
   - d. AG-UI endpoint + session management
4. **01-fronted-system** — Settings page
   - a. Provider selector + credential picker
   - b. Model selector + advanced settings
   - c. Server actions for settings CRUD
5. **01-fronted-system** — Chat UI
   - a. CopilotKit integration (provider + runtime)
   - b. Chat layout + conversation list
   - c. CopilotChat with streaming
6. **Testing** — Unit + integration tests
7. **Deployment** — Cloud Build + Cloud Run config
