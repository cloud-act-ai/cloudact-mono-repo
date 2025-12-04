# LLM Pricing Seed Data

## Overview

This document describes the seed data configuration for LLM model pricing. Pricing data defines token costs (input/output per 1K tokens) for each model, including free tier allocations and discount configurations. Seed data is loaded **once during organization onboarding**.

## Architecture

```
POST /api/v1/organizations/onboard
    │
    ├── Create dataset: {org_slug}_prod
    ├── Create table: llm_model_pricing (from schema JSON)
    └── Load seed data: default_pricing.csv
            │
            └── 22 default models across 4 providers
```

**After onboarding**, pricing CRUD is handled by `data-pipeline-service` (port 8001).

---

## File Locations

```
configs/llm/seed/
├── schemas/
│   └── llm_model_pricing.json      # BigQuery table schema
└── data/
    └── default_pricing.csv         # Default model pricing
```

---

## Schema: llm_model_pricing

### Core Pricing Fields

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `pricing_id` | STRING | Yes | Unique identifier (UUID format) |
| `provider` | STRING | Yes | Provider: openai, anthropic, gemini, custom |
| `model_id` | STRING | Yes | Model identifier (e.g., gpt-4o, claude-3-5-sonnet) |
| `model_name` | STRING | No | Human-readable display name |
| `is_custom` | BOOLEAN | Yes | True if user-added custom pricing |
| `input_price_per_1k` | FLOAT64 | Yes | Input token price per 1K tokens (USD) |
| `output_price_per_1k` | FLOAT64 | Yes | Output token price per 1K tokens (USD) |
| `effective_date` | DATE | Yes | When pricing becomes effective |
| `end_date` | DATE | No | Pricing expiration (null = current) |
| `is_enabled` | BOOLEAN | Yes | Enable/disable for cost tracking |
| `notes` | STRING | No | User notes or comments |

### Pricing Classification Fields

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `pricing_type` | STRING | Yes | Classification (see Pricing Types below) |
| `discount_percentage` | FLOAT64 | No | Percentage discount off base price (0-100) |
| `discount_reason` | STRING | No | Reason: volume, commitment, promotion, negotiated, trial |
| `volume_threshold_tokens` | INTEGER | No | Min monthly tokens to qualify for tier |
| `base_input_price_per_1k` | FLOAT64 | No | Reference price before discount |
| `base_output_price_per_1k` | FLOAT64 | No | Reference price before discount |

### Free Tier Fields

| Field | Type | Description |
|-------|------|-------------|
| `free_tier_input_tokens` | INTEGER | Free input tokens per reset period |
| `free_tier_output_tokens` | INTEGER | Free output tokens per reset period |
| `free_tier_reset_frequency` | STRING | Reset: daily, monthly, never |

### Provider-Specific Fields

| Field | Type | Provider | Description |
|-------|------|----------|-------------|
| `x_gemini_context_window` | STRING | Gemini | Context window size (1M, 2M, 32K) |
| `x_gemini_region` | STRING | Gemini | Regional pricing variation |
| `x_anthropic_tier` | STRING | Anthropic | Pricing tier (standard, etc.) |
| `x_openai_batch_input_price` | FLOAT64 | OpenAI | Batch API input price per 1K |
| `x_openai_batch_output_price` | FLOAT64 | OpenAI | Batch API output price per 1K |

---

## Pricing Types

| Type | Description | Example |
|------|-------------|---------|
| `standard` | Regular published list price | GPT-4o at $2.50/1M input |
| `free_tier` | Provider-offered free usage allocation | Gemini 2B tokens/day |
| `volume_discount` | Tiered pricing at usage thresholds | 20% off at 1B tokens/month |
| `committed_use` | Pre-paid commitment discount (CUD) | GCP 52% off 3-year |
| `promotional` | Time-bounded special offers | Launch discount |
| `negotiated` | Custom enterprise agreements | Enterprise deal |

---

## Default Pricing Data

### OpenAI Models (7 models)

| Model ID | Display Name | Input/1K | Output/1K | Batch Input | Batch Output |
|----------|--------------|----------|-----------|-------------|--------------|
| `gpt-4o` | GPT-4o | $0.0025 | $0.01 | $0.00125 | $0.005 |
| `gpt-4o-mini` | GPT-4o Mini | $0.00015 | $0.0006 | $0.000075 | $0.0003 |
| `gpt-4-turbo` | GPT-4 Turbo | $0.01 | $0.03 | $0.005 | $0.015 |
| `gpt-3.5-turbo` | GPT-3.5 Turbo | $0.0005 | $0.0015 | $0.00025 | $0.00075 |
| `o1` | O1 | $0.015 | $0.06 | $0.0075 | $0.03 |
| `o1-mini` | O1 Mini | $0.003 | $0.012 | $0.0015 | $0.006 |
| `o3-mini` | O3 Mini | $0.00115 | $0.0044 | $0.000575 | $0.0022 |

**Notes:**
- All OpenAI models use `pricing_type: standard`
- Batch pricing is 50% of standard pricing
- No free tier for OpenAI API

### Anthropic Models (6 models)

| Model ID | Display Name | Input/1K | Output/1K | Tier |
|----------|--------------|----------|-----------|------|
| `claude-3-5-sonnet-20241022` | Claude 3.5 Sonnet | $0.003 | $0.015 | standard |
| `claude-3-5-haiku-20241022` | Claude 3.5 Haiku | $0.0008 | $0.004 | standard |
| `claude-3-opus-20240229` | Claude 3 Opus | $0.015 | $0.075 | standard |
| `claude-3-sonnet-20240229` | Claude 3 Sonnet | $0.003 | $0.015 | standard |
| `claude-3-haiku-20240307` | Claude 3 Haiku | $0.00025 | $0.00125 | standard |
| `claude-instant-1.2` | Claude Instant | $0.0008 | $0.0024 | standard |

**Notes:**
- All Anthropic models use `pricing_type: standard`
- `x_anthropic_tier` set to "standard" for all
- No free tier for Anthropic API (trial credits at subscription level)

### Gemini Models (7 models) - WITH FREE TIERS

| Model ID | Display Name | Input/1K | Output/1K | Free Tier | Reset | Context |
|----------|--------------|----------|-----------|-----------|-------|---------|
| `gemini-2.0-flash` | Gemini 2.0 Flash | $0.0001 | $0.0004 | 2B tokens | daily | 1M |
| `gemini-2.0-flash-lite` | Gemini 2.0 Flash Lite | $0.000075 | $0.0003 | 2B tokens | daily | 1M |
| `gemini-1.5-pro` | Gemini 1.5 Pro | $0.00125 | $0.005 | 50M tokens | daily | 2M |
| `gemini-1.5-flash` | Gemini 1.5 Flash | $0.000075 | $0.0003 | 1B tokens | daily | 1M |
| `gemini-1.5-flash-8b` | Gemini 1.5 Flash 8B | $0.0000375 | $0.00015 | 1B tokens | daily | 1M |
| `gemini-1.0-pro` | Gemini 1.0 Pro | $0.0005 | $0.0015 | - | - | 32K |
| `text-embedding-004` | Text Embedding 004 | $0.00001 | $0.00 | 10M tokens | daily | 2K |

**Notes:**
- Gemini has generous free tiers (resets daily at midnight UTC)
- `x_gemini_context_window` specifies context size
- Embedding model has no output cost

### Custom Template (1 model)

| Model ID | Display Name | Input/1K | Output/1K | Notes |
|----------|--------------|----------|-----------|-------|
| `custom-model` | Custom Model | $0.001 | $0.002 | Template - disabled by default |

**Notes:**
- `is_custom: true` - preserved during resets
- `is_enabled: false` - user must enable
- Template for users to add their own models

---

## Free Tier Configuration

### How Free Tiers Work

Free tier allocations are tracked per model. When calculating costs:

```python
# Cost calculation with free tier
billable_input = max(0, total_input_tokens - free_tier_input_tokens)
billable_output = max(0, total_output_tokens - free_tier_output_tokens)

cost = (billable_input / 1000 * input_price_per_1k) +
       (billable_output / 1000 * output_price_per_1k)
```

### Reset Frequencies

| Frequency | Description | Example |
|-----------|-------------|---------|
| `daily` | Resets at midnight UTC | Gemini models |
| `monthly` | Resets on 1st of month | Custom configs |
| `never` | One-time credit (no reset) | Promotional credits |

### Gemini Free Tier Details

| Model | Daily Free Input | Daily Free Output | Reset Time |
|-------|------------------|-------------------|------------|
| gemini-2.0-flash | 2,000,000,000 | 2,000,000,000 | 00:00 UTC |
| gemini-2.0-flash-lite | 2,000,000,000 | 2,000,000,000 | 00:00 UTC |
| gemini-1.5-pro | 50,000,000 | 50,000,000 | 00:00 UTC |
| gemini-1.5-flash | 1,000,000,000 | 1,000,000,000 | 00:00 UTC |
| gemini-1.5-flash-8b | 1,000,000,000 | 1,000,000,000 | 00:00 UTC |
| text-embedding-004 | 10,000,000 | 0 | 00:00 UTC |

---

## Discount Configuration

### Volume Discounts

For volume-based tiered pricing, create additional pricing entries:

```csv
pricing_id,model_id,pricing_type,input_price_per_1k,discount_percentage,volume_threshold_tokens,base_input_price_per_1k
price_gpt4o_vol1,gpt-4o,volume_discount,0.002,20,1000000000,0.0025
price_gpt4o_vol2,gpt-4o,volume_discount,0.00175,30,5000000000,0.0025
```

### Committed Use Discounts

For CUD pricing (typically GCP/Gemini):

```csv
pricing_id,model_id,pricing_type,input_price_per_1k,discount_percentage,discount_reason
price_gemini_cud,gemini-1.5-pro,committed_use,0.0006,52,commitment
```

### Promotional Pricing

For time-bounded promotions:

```csv
pricing_id,model_id,pricing_type,effective_date,end_date,discount_percentage,discount_reason
price_promo_q1,gpt-4o,promotional,2025-01-01,2025-03-31,25,promotion
```

---

## CSV Format

### Header Row

```csv
pricing_id,provider,model_id,model_name,is_custom,input_price_per_1k,output_price_per_1k,effective_date,end_date,is_enabled,notes,x_gemini_context_window,x_gemini_region,x_anthropic_tier,x_openai_batch_input_price,x_openai_batch_output_price,pricing_type,free_tier_input_tokens,free_tier_output_tokens,free_tier_reset_frequency,discount_percentage,discount_reason,volume_threshold_tokens,base_input_price_per_1k,base_output_price_per_1k
```

### Example Rows

```csv
# OpenAI - standard pricing with batch
price_openai_gpt4o,openai,gpt-4o,GPT-4o,false,0.0025,0.01,2024-11-01,,true,Latest GPT-4o model,,,,0.00125,0.005,standard,,,,,,,

# Gemini - with free tier
price_gemini_20_flash,gemini,gemini-2.0-flash,Gemini 2.0 Flash,false,0.0001,0.0004,2024-12-01,,true,2B tokens/day free,1M,,,,standard,2000000000,2000000000,daily,,,,

# Anthropic - standard tier
price_anthropic_claude35_sonnet,anthropic,claude-3-5-sonnet-20241022,Claude 3.5 Sonnet,false,0.003,0.015,2024-11-01,,true,Latest Claude,,,standard,,,standard,,,,,,,
```

---

## Price Comparison (per 1M tokens)

### Input Token Pricing

| Model | Per 1M Input | Notes |
|-------|--------------|-------|
| gemini-1.5-flash-8b | $0.0375 | Cheapest |
| gemini-1.5-flash | $0.075 | |
| gemini-2.0-flash-lite | $0.075 | |
| gemini-2.0-flash | $0.10 | |
| gpt-4o-mini | $0.15 | |
| claude-3-haiku | $0.25 | |
| gemini-1.0-pro | $0.50 | |
| gpt-3.5-turbo | $0.50 | |
| claude-3-5-haiku | $0.80 | |
| o3-mini | $1.15 | |
| gemini-1.5-pro | $1.25 | |
| gpt-4o | $2.50 | |
| o1-mini | $3.00 | |
| claude-3-5-sonnet | $3.00 | |
| claude-3-sonnet | $3.00 | |
| gpt-4-turbo | $10.00 | |
| o1 | $15.00 | |
| claude-3-opus | $15.00 | Most expensive |

### Output Token Pricing

| Model | Per 1M Output | Notes |
|-------|---------------|-------|
| gemini-1.5-flash-8b | $0.15 | Cheapest |
| gemini-1.5-flash | $0.30 | |
| gemini-2.0-flash-lite | $0.30 | |
| gemini-2.0-flash | $0.40 | |
| gpt-4o-mini | $0.60 | |
| claude-3-haiku | $1.25 | |
| gemini-1.0-pro | $1.50 | |
| gpt-3.5-turbo | $1.50 | |
| claude-instant | $2.40 | |
| claude-3-5-haiku | $4.00 | |
| o3-mini | $4.40 | |
| gemini-1.5-pro | $5.00 | |
| gpt-4o | $10.00 | |
| o1-mini | $12.00 | |
| claude-3-5-sonnet | $15.00 | |
| claude-3-sonnet | $15.00 | |
| gpt-4-turbo | $30.00 | |
| o1 | $60.00 | |
| claude-3-opus | $75.00 | Most expensive |

---

## Adding Custom Models

Users can add custom models via CRUD API. Custom models have:
- `is_custom: true`
- Preserved during reset operations
- Can use any `pricing_type`

Example use cases:
- Fine-tuned models with custom pricing
- Self-hosted models
- Third-party providers
- Enterprise negotiated rates

---

## Related Documentation

- **Subscription Seed Data**: See `LLM_SUBSCRIPTION_SEED.md`
- **Pricing CRUD API**: See `data-pipeline-service/docs/LLM_PRICING_CRUD.md`
- **Frontend Config**: See `fronted-system/docs/LLM_PRICING_CONFIG.md`
- **Architecture**: See `../../ARCHITECTURE.md`
