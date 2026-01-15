# Cost Data Architecture

**v2.0** | 2026-01-15

> All costs (SaaS, Cloud, GenAI) → FOCUS 1.3 unified table

---

## Architecture

```
Frontend (3000)        API Service (8000)           Pipeline (8001)
Cost Dashboards   →    Polars + Cache         ←    Cost calculation
actions/costs.ts       services/cost_read/         → cost_data_standard_1_3
```

---

## Key Files

### Frontend
```
lib/costs/           # Helper library
├─ types.ts          # TypeScript types
├─ date-ranges.ts    # Period calculations
├─ filters.ts        # Data filtering
└─ formatters.ts     # Display formatting

app/[orgSlug]/cost-dashboards/
├─ overview/         # Unified costs
├─ cloud-costs/      # GCP/AWS/Azure
├─ genai-costs/      # OpenAI/Anthropic
└─ subscription-costs/ # SaaS
```

### API Service
```
src/core/services/cost_read/  # Polars + LRU Cache
src/lib/costs/               # Calculations, aggregations
```

### Pipeline Service
```
configs/{provider}/cost/*.yml         # Pipeline configs
configs/system/procedures/            # Stored procedures
```

---

## Unified Table: `cost_data_standard_1_3`

FOCUS 1.3 compliant with org extensions (`x_*` fields)

| Field | Source |
|-------|--------|
| ChargePeriodStart | cost_date |
| EffectiveCost | total_cost |
| ServiceProviderName | provider |
| SubAccountId | hierarchy_team_id |
| x_source_system | cloud_gcp/genai_openai/subscription |
