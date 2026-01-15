# CloudAct Architecture

**v2.5** | 2026-01-15

> Multi-tenant GenAI + Cloud cost analytics platform

---

## System Overview

```
Frontend (3000)              API Service (8000)           Pipeline Service (8001)
├─ Next.js 16                ├─ Bootstrap                 ├─ Run pipelines
├─ Supabase Auth             ├─ Org onboarding            ├─ Cost calculation
├─ Stripe Billing            ├─ Subscription CRUD         ├─ FOCUS 1.3 conversion
└─ Dashboard UI              ├─ Hierarchy CRUD            └─ Scheduled jobs
                             └─ Cost reads
                                        ↓
                             BigQuery (shared)
```

---

## Data Storage Split

| Data | Storage | Reason |
|------|---------|--------|
| Users, Auth | Supabase | Built-in auth, RLS |
| Org metadata | Supabase | Fast UI queries |
| Billing | Supabase + Stripe | Webhook sync |
| API keys | BigQuery (hashed) | Security |
| Credentials | BigQuery (KMS) | Encrypted at rest |
| Cost data | BigQuery | Analytics scale |

---

## Customer Journey

```
1. Signup (Supabase)
2. Subscribe (Stripe)
3. Backend Onboard → BigQuery dataset + API key
4. Setup Integrations → KMS encrypted credentials
5. Run Pipelines → Cost data → FOCUS 1.3
```

---

## Multi-Tenancy

- Dataset isolation: `{org_slug}_prod` per org
- Row filtering: `WHERE org_slug = @org_slug`
- API key scoping: Each org → unique key

---

## Three Cost Types

| Type | Providers | Flow |
|------|-----------|------|
| Cloud | GCP, AWS, Azure, OCI | Billing export → Raw → FOCUS |
| GenAI | OpenAI, Anthropic, Gemini, etc. | Usage API → Raw → FOCUS |
| SaaS | Canva, Slack, ChatGPT Plus | Manual → Calculate → FOCUS |

All → `cost_data_standard_1_3` (FOCUS 1.3 unified)

---

## Environments

| Env | GCP Project | Frontend | API |
|-----|-------------|----------|-----|
| Local | cloudact-testing-1 | localhost:3000 | localhost:8000/8001 |
| Stage | cloudact-stage | cloudact-stage.vercel.app | Cloud Run |
| Prod | cloudact-prod | cloudact.ai | api.cloudact.ai |

---

## Security

- **CA_ROOT_API_KEY**: System admin (bootstrap, onboarding)
- **Org API Key**: Per-org operations
- **KMS**: All credentials encrypted at rest
- **No DISABLE_AUTH in production**

---

## Documentation

| Doc | Path |
|-----|------|
| API Service | `02-api-service/CLAUDE.md` |
| Pipeline Service | `03-data-pipeline-service/CLAUDE.md` |
| Frontend | `01-fronted-system/CLAUDE.md` |
