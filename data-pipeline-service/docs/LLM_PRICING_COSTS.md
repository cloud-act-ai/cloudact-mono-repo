# LLM Pricing Cost Calculations

## Overview

This document will describe how the pipeline calculates token costs using BigQuery pricing tables.

**Status:** Placeholder - Implementation pending

---

## Architecture

```
data-pipeline-service (port 8001)
    │
    ├── Reads from: {org_slug}_prod.llm_model_pricing
    ├── Reads from: {org_slug}_prod.{provider}_usage_daily_raw
    │
    └── Calculates: Token costs with free tier & discount logic
```

**Note:** Pricing data is managed via CRUD APIs in `api-service` (port 8000). This pipeline only READS from those tables for cost calculations.

---

## Planned Cost Calculation Logic

```python
# Cost calculation with free tier
billable_input = max(0, total_input_tokens - free_tier_input_tokens)
billable_output = max(0, total_output_tokens - free_tier_output_tokens)

cost = (billable_input / 1000 * input_price_per_1k) +
       (billable_output / 1000 * output_price_per_1k)
```

---

## Planned Features

- [ ] Calculate billable tokens after free tier deduction
- [ ] Apply correct pricing based on pricing_type
- [ ] Handle volume discount tiers
- [ ] Track CUD pricing application
- [ ] Handle promotional pricing periods
- [ ] Generate cost reports per model/provider

---

## Related Documentation

- **Pricing CRUD**: See `api-service/docs/LLM_PRICING_CRUD.md`
- **Pricing Seed Data**: See `api-service/docs/LLM_PRICING_SEED.md`
- **Pipeline Architecture**: See `CLAUDE.md`
