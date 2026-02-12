# Chat - Requirements

## Overview

Multi-tenant AI chat system for CloudAct allowing organizations to interact with cost, alert, and usage data through natural language. Built on Google ADK with CopilotKit frontend integration and BYOK (Bring Your Own Key) model.

## Source Specification

Full chat system specification defined in:
- `00-requirements-specs/07_MULTI_TENANT_AI_CHAT.md` (v1.0.0)

## Key Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Chat UI location | IN 01-fronted-system | Same Supabase session, sidebar, org routing |
| Separate frontend | NO (no 06 service) | Would duplicate auth, routing, navigation |
| Backend service | 07-org-chat-backend (port 8002) | Python ADK agents + MCP tools |
| LLM provider | Customer's own key (BYOK) | Customer chooses provider + model in settings |
| Key usage | ONE key for root + ALL sub-agents | No mixed providers, no fallback |
| Key storage | Existing KMS encryption flow | Reuses org_integration_credentials |
| Vector DB | NO | Structured SQL queries superior for cost data |
| Data store | BigQuery (single source of truth) | Consistent with platform architecture |
| Agent framework | Google ADK v1.22+ | A2A native, Gemini-optimized, multi-provider via LiteLlm |
| Frontend framework | CopilotKit v1.51+ | AG-UI protocol, streaming, shared state |
| MCP tools | Embedded in 07-backend (in-process) | Single service, no network hop |
| MCP transport | stdio (in-process) | Simplest for embedded tools |
| Message persistence | BigQuery Streaming Inserts | Real-time writes, non-blocking |
| Conversation memory | Last N messages in context window | 50 msgs = 10K tokens, models have 128K-1M |

## Tech Stack

### Frontend (01-fronted-system)

| Package | Version | Purpose |
|---------|---------|---------|
| @copilotkit/react-core | ^1.51 | Hooks: useCopilotAction, useCopilotReadable |
| @copilotkit/react-ui | ^1.50 | CopilotChat component |
| @copilotkit/runtime | ^1.51 | CopilotKit Runtime (API route proxy) |

### Backend (07-org-chat-backend)

| Package | Version | Purpose |
|---------|---------|---------|
| google-adk[a2a] | ^1.22 | Agent framework + A2A protocol |
| fastmcp | ^2.0 | MCP tool server (embedded) |
| google-cloud-bigquery | latest | BigQuery client |
| litellm | latest | Multi-provider LLM support |
| fastapi | latest | ASGI web framework |
| uvicorn | latest | ASGI server |

## Functional Requirements

### FR-1: BYOK Settings Flow

- **FR-1.1**: Settings page at `/[orgSlug]/settings/ai-chat` with provider selection (OpenAI, Anthropic, Gemini, DeepSeek)
- **FR-1.2**: Provider card grid showing supported providers with icons
- **FR-1.3**: Credential picker — reuse existing key or enter new one
- **FR-1.4**: Key validated against provider API before saving
- **FR-1.5**: Key encrypted via GCP KMS (existing encryption flow)
- **FR-1.6**: Key stored in `org_integration_credentials` (existing table)
- **FR-1.7**: Model selector filtered by validated provider's available models
- **FR-1.8**: Advanced settings: temperature (0-2), max_tokens, include_org_context, enable_memory, max_history_messages
- **FR-1.9**: Settings saved to `org_chat_settings` BigQuery table
- **FR-1.10**: Key rotation preserves conversation context (messages are plain text)

### FR-2: Chat UI

- **FR-2.1**: Chat page at `/[orgSlug]/chat` with full-width layout
- **FR-2.2**: Welcome screen with Sparkles icon, suggestion chips, and input area
- **FR-2.3**: Conversation history in right-side Sheet drawer (hidden by default)
- **FR-2.4**: Header bar: [+ New Chat] left, conversation title center, [History] right
- **FR-2.5**: Indigo theme (not mint) for all chat elements: bot icon, send button, streaming cursor, focus rings
- **FR-2.6**: No-settings guard: "Configure AI Chat" CTA when no BYOK key configured
- **FR-2.7**: Invalid key guard: "Your API key is no longer valid. [Update Key]"
- **FR-2.8**: Auto-title generation from first user message
- **FR-2.9**: Conversation search across history

### FR-3: Agent Hierarchy

- **FR-3.1**: Orchestrator (root) routes user queries to appropriate sub-agent
- **FR-3.2**: CostAnalyst handles cost queries with 5 MCP tools
- **FR-3.3**: AlertManager handles alert management with 4 MCP tools
- **FR-3.4**: UsageAnalyst handles usage/quota queries with 4 MCP tools
- **FR-3.5**: Explorer handles ad-hoc BigQuery queries (read-only, with dry-run gate)
- **FR-3.6**: All agents use customer's BYOK key (one key, all agents)
- **FR-3.7**: Streaming responses via AG-UI protocol (SSE)

### FR-4: MCP Tools

#### Costs Domain (5 tools)
- **FR-4.1**: `query_costs` — Query FOCUS 1.3 cost data with provider, service, date filters
- **FR-4.2**: `compare_periods` — Compare MTD/MoM/QoQ/YoY costs
- **FR-4.3**: `cost_breakdown` — Breakdown by provider/service/team/region/model
- **FR-4.4**: `cost_forecast` — Forecast using BQ ML (1-90 day horizon)
- **FR-4.5**: `top_cost_drivers` — Identify top cost increase drivers

#### Alerts Domain (4 tools)
- **FR-4.6**: `list_alerts` — List configured alerts with status filter
- **FR-4.7**: `create_alert` — Create new cost alert (threshold, provider, condition)
- **FR-4.8**: `alert_history` — View alert trigger history
- **FR-4.9**: `acknowledge_alert` — Acknowledge triggered alert

#### Usage Domain (4 tools)
- **FR-4.10**: `genai_usage` — GenAI usage metrics by provider/model
- **FR-4.11**: `quota_status` — Current org quota usage
- **FR-4.12**: `top_consumers` — Top models/services by usage
- **FR-4.13**: `pipeline_runs` — Pipeline execution history

### FR-5: Conversation Management

- **FR-5.1**: Messages persisted to BigQuery via streaming inserts
- **FR-5.2**: Conversation history loaded from last N messages (default 50)
- **FR-5.3**: Conversation list shows title, relative timestamp ("2h ago", "Yesterday")
- **FR-5.4**: Rename conversations inline
- **FR-5.5**: Export conversation as JSON
- **FR-5.6**: Delete conversations

### FR-6: Multi-Tenancy Security

- **FR-6.1**: Layer 1 — Supabase JWT authentication
- **FR-6.2**: Layer 2 — CopilotKit Runtime authorization (org membership check)
- **FR-6.3**: Layer 3 — ADK agent scoped per-org with org_slug in system prompt
- **FR-6.4**: Layer 4 — Tool validation: org_slug REQUIRED + validate_org() on every tool
- **FR-6.5**: Layer 5 — Query safety: parameterized SQL + dry-run gate (10GB limit)
- **FR-6.6**: Layer 6 — Data isolation: separate BQ datasets + org_slug column on every row

## BigQuery Tables (4 New)

### org_chat_settings

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
| system_prompt_extra | STRING | NULLABLE | Custom instructions |
| is_active | BOOLEAN | REQUIRED | Only one active per org |
| configured_by | STRING | NULLABLE | User ID who configured |
| created_at | TIMESTAMP | REQUIRED | |
| updated_at | TIMESTAMP | NULLABLE | |

### org_chat_conversations

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

### org_chat_messages

| Column | Type | Mode | Description |
|--------|------|------|-------------|
| message_id | STRING | REQUIRED | UUID |
| conversation_id | STRING | REQUIRED | FK to conversations |
| org_slug | STRING | REQUIRED | Organization slug |
| role | STRING | REQUIRED | user, assistant, tool |
| content | STRING | REQUIRED | Message text (plain text) |
| agent_name | STRING | NULLABLE | Which sub-agent responded |
| tool_calls_json | JSON | NULLABLE | Tool invocations |
| tool_results_json | JSON | NULLABLE | Tool results |
| model_id | STRING | NULLABLE | Model that generated response |
| input_tokens | INTEGER | NULLABLE | Token usage (input) |
| output_tokens | INTEGER | NULLABLE | Token usage (output) |
| latency_ms | INTEGER | NULLABLE | Response generation time |
| created_at | TIMESTAMP | REQUIRED | |

Partition: `created_at` (DAY) | Cluster: `org_slug, conversation_id, role`

### org_chat_tool_calls

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

## API Endpoints

### 02-api-service (port 8000)

```
GET    /api/v1/organizations/{org}/chat-settings         → Current settings or { configured: false }
POST   /api/v1/organizations/{org}/chat-settings         → Create/update settings
DELETE /api/v1/organizations/{org}/chat-settings         → Deactivate chat
GET    /api/v1/organizations/{org}/chat-settings/models  → Available models for provider
```

### 07-org-chat-backend (port 8002)

```
POST   /copilotkit            → AG-UI endpoint (CopilotKit Runtime connects here)
GET    /.well-known/agent.json → A2A agent card
GET    /health                 → Health check
```

### 01-fronted-system (port 3000)

```
POST   /api/copilotkit         → CopilotKit Runtime proxy to backend
GET    /api/chat/conversations  → List conversations for user
GET    /api/chat/conversations/search → Search conversations
POST   /api/chat/conversations/{id}/title → Update conversation title
```

## Non-Functional Requirements

### NFR-1: Performance
- Agent response streaming start < 3s
- MCP tool execution < 10s per tool
- BigQuery dry-run check < 1s
- Conversation history load < 2s

### NFR-2: Security
- 6-layer multi-tenancy isolation (see FR-6)
- All credentials KMS-encrypted at rest
- Decrypted key cleared from memory after use
- No cross-org data leakage possible

### NFR-3: Reliability
- Conversation state preserved across key rotation
- Messages persisted before response returned
- Graceful degradation on tool failure (agent continues without tool result)

### NFR-4: Scalability
- No vector DB needed (50 messages x 200 tokens = 10K tokens << 128K context)
- BigQuery scales horizontally for message storage
- Stateless backend (state in BigQuery)

## Supported Providers

| Provider | Model Prefix (LiteLlm) | ADK Support | Models |
|----------|----------------------|-------------|--------|
| OpenAI | openai/ | Via LiteLlm | gpt-4o, gpt-4o-mini, gpt-4-turbo, o1, o1-mini |
| Anthropic | anthropic/ | Via LiteLlm | claude-opus-4, claude-sonnet-4, claude-3.5-sonnet, claude-3.5-haiku |
| Gemini | (native) | Native ADK | gemini-2.0-flash, gemini-1.5-pro, gemini-1.5-flash |
| DeepSeek | deepseek/ | Via LiteLlm | deepseek-chat, deepseek-coder, deepseek-v3 |

## Deployment

| Service | Port | Cloud Run Name | Access | URL |
|---------|------|---------------|--------|-----|
| 07-org-chat-backend | 8002 | cloudact-chat-backend | INTERNAL ONLY | VPC only |

- No public URL (internal traffic via VPC connector from frontend)
- Same GCP project, same service account
- KMS permissions: existing SA already has `roles/cloudkms.cryptoKeyEncrypterDecrypter`

## Dependencies

- Frontend: Next.js 16 + CopilotKit v1.51+ + Supabase Auth
- Backend: FastAPI + Google ADK v1.22+ + LiteLlm + fastmcp
- Data: BigQuery (organizations dataset + per-org datasets)
- Security: GCP KMS (existing keyring)
- Auth: Supabase JWT (existing)

## Related Skills

| Skill | Relationship |
|-------|-------------|
| `/integration-setup` | Credential management (KMS encryption). Chat reuses org_integration_credentials. |
| `/security-audit` | Multi-tenancy audit. Chat adds 6-layer isolation. |
| `/cost-analysis` | Cost data architecture. CostAnalyst queries FOCUS 1.3 data. |
| `/frontend-dev` | Next.js patterns. Chat UI follows CloudAct conventions. |
| `/api-dev` | FastAPI patterns. Chat backend follows CloudAct conventions. |
| `/bootstrap-onboard` | Bootstrap creates 4 chat BigQuery tables. |
