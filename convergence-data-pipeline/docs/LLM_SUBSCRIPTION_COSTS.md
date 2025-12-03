# LLM Subscription Cost Calculations

## Overview

This document will describe how the pipeline calculates subscription costs using BigQuery tables.

**Status:** Placeholder - Implementation pending

---

## Architecture

```
convergence-data-pipeline (port 8001)
    │
    ├── Reads from: {org_slug}_prod.llm_subscriptions
    ├── Reads from: {org_slug}_prod.llm_model_pricing
    │
    └── Calculates: Subscription costs based on usage vs limits
```

**Note:** Subscription and pricing data is managed via CRUD APIs in `cloudact-api-service` (port 8000). This pipeline only READS from those tables for cost calculations.

---

## Planned Features

- [ ] Calculate billable usage after free tier deduction
- [ ] Apply volume discounts based on thresholds
- [ ] Track CUD commitment consumption
- [ ] Monitor rate limit utilization
- [ ] Generate cost reports per org/provider

---

## Related Documentation

- **Subscription CRUD**: See `cloudact-api-service/docs/LLM_SUBSCRIPTION_CRUD.md`
- **Subscription Seed Data**: See `cloudact-api-service/docs/LLM_SUBSCRIPTION_SEED.md`
- **Pipeline Architecture**: See `CLAUDE.md`
