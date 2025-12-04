# LLM Subscription & Pricing Seed Data

## Overview

This document describes the seed data configuration for LLM provider subscriptions and pricing models. Seed data is loaded **once during organization onboarding** to populate the org-specific BigQuery tables with default pricing and subscription tiers.

## Architecture

```
POST /api/v1/organizations/onboard
    │
    ├── Create dataset: {org_slug}_prod
    ├── Create table: llm_model_pricing (from schema JSON)
    ├── Create table: llm_subscriptions (from schema JSON)
    └── Load seed data from CSV files
            │
            ├── default_pricing.csv → llm_model_pricing
            └── default_subscriptions.csv → llm_subscriptions
```

**After onboarding**, CRUD operations are handled by `data-pipeline-service` (port 8001).

---

## File Locations

```
configs/llm/seed/
├── schemas/
│   ├── llm_model_pricing.json      # BigQuery table schema
│   └── llm_subscriptions.json      # BigQuery table schema
└── data/
    ├── default_pricing.csv         # Default model pricing (22 models)
    └── default_subscriptions.csv   # Default subscription tiers (20 plans)
```

---

## Schema: llm_model_pricing

Unified pricing table for all LLM providers (OpenAI, Anthropic, Gemini, Custom).

### Core Fields

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `pricing_id` | STRING | Yes | Unique identifier (UUID) |
| `provider` | STRING | Yes | openai, anthropic, gemini, custom |
| `model_id` | STRING | Yes | Model identifier (e.g., gpt-4o) |
| `model_name` | STRING | No | Human-readable name |
| `is_custom` | BOOLEAN | Yes | User-added custom pricing |
| `input_price_per_1k` | FLOAT64 | Yes | Input token price per 1K (USD) |
| `output_price_per_1k` | FLOAT64 | Yes | Output token price per 1K (USD) |
| `effective_date` | DATE | Yes | When pricing becomes effective |
| `end_date` | DATE | No | Pricing expiration (null = current) |
| `is_enabled` | BOOLEAN | Yes | Enable/disable for tracking |

### Pricing Type & Discount Fields

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `pricing_type` | STRING | Yes | standard, free_tier, volume_discount, committed_use, promotional, negotiated |
| `free_tier_input_tokens` | INTEGER | No | Free input tokens per reset period |
| `free_tier_output_tokens` | INTEGER | No | Free output tokens per reset period |
| `free_tier_reset_frequency` | STRING | No | daily, monthly, never |
| `discount_percentage` | FLOAT64 | No | Percentage discount (0-100) |
| `discount_reason` | STRING | No | volume, commitment, promotion, negotiated, trial |
| `volume_threshold_tokens` | INTEGER | No | Min tokens to qualify for tier |
| `base_input_price_per_1k` | FLOAT64 | No | Reference price before discount |
| `base_output_price_per_1k` | FLOAT64 | No | Reference price before discount |

### Provider-Specific Fields

| Field | Type | Provider | Description |
|-------|------|----------|-------------|
| `x_gemini_context_window` | STRING | Gemini | Context window (1M, 2M) |
| `x_gemini_region` | STRING | Gemini | Regional pricing |
| `x_anthropic_tier` | STRING | Anthropic | Pricing tier |
| `x_openai_batch_input_price` | FLOAT64 | OpenAI | Batch API input price |
| `x_openai_batch_output_price` | FLOAT64 | OpenAI | Batch API output price |

---

## Schema: llm_subscriptions

Unified subscription table for provider plans and rate limits.

### Core Fields

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `subscription_id` | STRING | Yes | Unique identifier (UUID) |
| `provider` | STRING | Yes | openai, anthropic, gemini, custom |
| `plan_name` | STRING | Yes | Plan name (FREE, TIER1, BUILD, etc.) |
| `is_custom` | BOOLEAN | Yes | User-created custom subscription |
| `quantity` | INTEGER | Yes | Number of seats/units |
| `unit_price_usd` | FLOAT64 | Yes | Monthly cost in USD |
| `effective_date` | DATE | Yes | When subscription becomes active |
| `end_date` | DATE | No | Subscription end (null = ongoing) |
| `is_enabled` | BOOLEAN | Yes | Enable/disable tracking |
| `auth_type` | STRING | No | api_key, service_account, oauth |

### Tier Type & Trial Fields

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `tier_type` | STRING | Yes | free, trial, paid, enterprise, committed_use |
| `trial_end_date` | DATE | No | Trial expiration date |
| `trial_credit_usd` | FLOAT64 | No | Trial credit amount (e.g., GCP $300) |

### Rate Limit Fields

| Field | Type | Description |
|-------|------|-------------|
| `rpm_limit` | INTEGER | Requests per minute |
| `tpm_limit` | INTEGER | Tokens per minute |
| `rpd_limit` | INTEGER | Requests per day |
| `tpd_limit` | INTEGER | Tokens per day |
| `concurrent_limit` | INTEGER | Max concurrent requests |
| `monthly_token_limit` | INTEGER | Monthly token cap |
| `daily_token_limit` | INTEGER | Daily token cap |

### Commitment Fields

| Field | Type | Description |
|-------|------|-------------|
| `committed_spend_usd` | FLOAT64 | Committed monthly spend for CUD |
| `commitment_term_months` | INTEGER | Duration (12, 24, 36 months) |
| `discount_percentage` | FLOAT64 | CUD discount percentage |

---

## Default Pricing Data

### OpenAI Models

| Model | Input/1K | Output/1K | Batch Input | Batch Output |
|-------|----------|-----------|-------------|--------------|
| gpt-4o | $0.0025 | $0.01 | $0.00125 | $0.005 |
| gpt-4o-mini | $0.00015 | $0.0006 | $0.000075 | $0.0003 |
| gpt-4-turbo | $0.01 | $0.03 | $0.005 | $0.015 |
| gpt-3.5-turbo | $0.0005 | $0.0015 | $0.00025 | $0.00075 |
| o1 | $0.015 | $0.06 | $0.0075 | $0.03 |
| o1-mini | $0.003 | $0.012 | $0.0015 | $0.006 |
| o3-mini | $0.00115 | $0.0044 | $0.000575 | $0.0022 |

### Anthropic Models

| Model | Input/1K | Output/1K | Tier |
|-------|----------|-----------|------|
| claude-3-5-sonnet-20241022 | $0.003 | $0.015 | standard |
| claude-3-5-haiku-20241022 | $0.0008 | $0.004 | standard |
| claude-3-opus-20240229 | $0.015 | $0.075 | standard |
| claude-3-sonnet-20240229 | $0.003 | $0.015 | standard |
| claude-3-haiku-20240307 | $0.00025 | $0.00125 | standard |

### Gemini Models (with Free Tiers)

| Model | Input/1K | Output/1K | Free Tier | Reset |
|-------|----------|-----------|-----------|-------|
| gemini-2.0-flash | $0.0001 | $0.0004 | 2B tokens/day | daily |
| gemini-2.0-flash-lite | $0.000075 | $0.0003 | 2B tokens/day | daily |
| gemini-1.5-pro | $0.00125 | $0.005 | 50M tokens/day | daily |
| gemini-1.5-flash | $0.000075 | $0.0003 | 1B tokens/day | daily |
| gemini-1.5-flash-8b | $0.0000375 | $0.00015 | 1B tokens/day | daily |
| text-embedding-004 | $0.00001 | $0.00 | 10M tokens/day | daily |

---

## Default Subscription Data

### OpenAI Plans

| Plan | Tier Type | Price | RPM | TPM | RPD |
|------|-----------|-------|-----|-----|-----|
| FREE | free | $0 | 3 | 40,000 | 200 |
| TIER1 | paid | $20 | 500 | 30,000 | 10,000 |
| TIER2 | paid | $100 | 5,000 | 450,000 | - |
| TIER3 | paid | $500 | 10,000 | 1,000,000 | - |
| TIER4 | enterprise | $1,000 | 20,000 | 2,000,000 | - |

### Anthropic Plans

| Plan | Tier Type | Trial Credit | RPM | TPM | TPD |
|------|-----------|--------------|-----|-----|-----|
| FREE | trial | $5 | 5 | 20,000 | 100,000 |
| BUILD | paid | $0 | 50 | 40,000 | 2,000,000 |
| BUILD_TIER2 | paid | $0 | 100 | 80,000 | 4,000,000 |
| BUILD_TIER3 | paid | $0 | 200 | 160,000 | 8,000,000 |
| BUILD_TIER4 | paid | $0 | 400 | 400,000 | 20,000,000 |
| SCALE | paid | $0 | 1,000 | 800,000 | 80,000,000 |

### Gemini Plans

| Plan | Tier Type | Trial Credit | RPM | TPM | TPD |
|------|-----------|--------------|-----|-----|-----|
| FREE | free | $0 | 15 | 1,000,000 | 1,500,000 |
| PAY_AS_YOU_GO | paid | $300 | 360 | 4,000,000 | 4,000,000,000 |
| CUD_1_YEAR | committed_use | $0 | - | - | - | 25% discount |
| CUD_3_YEAR | committed_use | $0 | - | - | - | 52% discount |

---

## Pricing Types

| Type | Description | Use Case |
|------|-------------|----------|
| `standard` | Published list price | Default for most models |
| `free_tier` | Provider free usage | Gemini daily free tokens |
| `volume_discount` | Usage-based discount | Tiered pricing at volume |
| `committed_use` | Pre-paid commitment | GCP CUDs (25-52% off) |
| `promotional` | Time-bounded offer | Launch discounts |
| `negotiated` | Custom enterprise | Enterprise agreements |

---

## Tier Types

| Type | Description | Fields Used |
|------|-------------|-------------|
| `free` | Perpetual free tier | rpm/tpm/rpd limits |
| `trial` | Time-limited trial | trial_end_date, trial_credit_usd |
| `paid` | Standard paid tier | Rate limits by tier level |
| `enterprise` | Custom enterprise | Negotiated limits |
| `committed_use` | CUD commitment | committed_spend_usd, commitment_term_months |

---

## Free Tier Calculation

For cost calculation pipelines, billable tokens are computed as:

```python
billable_input = max(0, total_input_tokens - free_tier_input_tokens)
billable_output = max(0, total_output_tokens - free_tier_output_tokens)

cost = (billable_input / 1000 * input_price_per_1k) +
       (billable_output / 1000 * output_price_per_1k)
```

Free tier resets based on `free_tier_reset_frequency`:
- `daily` - Resets at midnight UTC
- `monthly` - Resets on 1st of month
- `never` - One-time credit (no reset)

---

## Adding Custom Models

Users can add custom models via the CRUD API (data-pipeline-service):

```bash
POST /api/v1/integrations/{org_slug}/{provider}/pricing
```

Custom models are marked with `is_custom: true` and don't get overwritten during resets.

---

## Related Documentation

- **CRUD Operations**: See `data-pipeline-service/docs/LLM_SUBSCRIPTION_CRUD.md`
- **Frontend Config**: See `fronted-system/docs/LLM_SUBSCRIPTION_CONFIG.md`
- **Architecture**: See `../../ARCHITECTURE.md`
