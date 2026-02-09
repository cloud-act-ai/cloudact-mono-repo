# 07-org-chat-backend

Multi-tenant AI chat backend for CloudAct. Google ADK agents + MCP tools + BigQuery.

## Service

| Property | Value |
|----------|-------|
| Port | 8002 |
| Framework | FastAPI + Google ADK |
| Access | INTERNAL ONLY (VPC) |
| Cloud Run | cloudact-chat-backend |

## Agent Hierarchy

```
Orchestrator (Root) ─ customer's model + key
├── CostAnalyst     ─ same model + key
│   └── MCP: query_costs, compare_periods, cost_breakdown, cost_forecast, top_cost_drivers
├── AlertManager    ─ same model + key
│   └── MCP: list_alerts, create_alert, alert_history, acknowledge_alert
├── UsageAnalyst    ─ same model + key
│   └── MCP: genai_usage, quota_status, top_consumers, pipeline_runs
└── Explorer        ─ same model + key
    └── BigQueryToolset (ad-hoc SQL, read-only)
```

## Key Principles

- **ONE provider, ONE key** for root + all sub-agents (customer's BYOK)
- **BigQuery single source of truth** (no vector DB)
- **KMS encryption** for credential storage (reuses existing flow)
- **6-layer multi-tenancy** isolation
- **MCP tools embedded** in-process (no separate service)
- **AG-UI protocol** for CopilotKit frontend integration

## Endpoints

```
POST /copilotkit              # AG-UI endpoint (CopilotKit Runtime)
GET  /.well-known/agent.json  # A2A agent card
GET  /health                  # Health check
```

## Development

```bash
cd 07-org-chat-backend
python3 -m uvicorn src.app.main:app --port 8002 --reload
```

## Dependencies

```
google-adk[a2a] >= 1.22
fastmcp >= 2.0
google-cloud-bigquery
litellm
fastapi
uvicorn
```

## Spec

See `00-requirements-specs/07_MULTI_TENANT_AI_CHAT.md`
