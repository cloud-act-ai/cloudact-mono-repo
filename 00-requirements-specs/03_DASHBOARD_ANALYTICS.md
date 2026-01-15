# Dashboard & Analytics

**v1.5** | 2026-01-15

> Cost visualization and analytics

---

## Pages

| Route | Purpose |
|-------|---------|
| `/{org}/dashboard` | Main overview |
| `/{org}/cost-dashboards/overview` | Unified costs |
| `/{org}/cost-dashboards/cloud-costs` | GCP/AWS/Azure |
| `/{org}/cost-dashboards/genai-costs` | OpenAI/Anthropic |
| `/{org}/cost-dashboards/subscription-costs` | SaaS |

---

## Data Sources

| Source | Table |
|--------|-------|
| Cloud | `cloud_{provider}_billing_raw_daily` |
| GenAI | `genai_*_costs_daily` |
| SaaS | `subscription_plan_costs_daily` |
| Unified | `cost_data_standard_1_3` |

---

## Features

- Period comparisons (MTD, YTD, MoM)
- Provider breakdowns
- Hierarchy allocation
- Forecasting

---

## Key Files

| File | Purpose |
|------|---------|
| `app/[orgSlug]/cost-dashboards/` | Dashboard pages |
| `lib/costs/` | Helper library |
| `02-api-service/src/core/services/cost_read/` | Backend service |
