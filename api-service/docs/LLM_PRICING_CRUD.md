# LLM Pricing CRUD Operations

## Overview

This document describes the CRUD API for managing LLM model pricing. These endpoints operate on **org-specific BigQuery tables** created during onboarding. Pricing defines token costs (input/output per 1K tokens) for each model.

## Architecture

```
Frontend / API Client
    │
    ▼
api-service (port 8000)
    │
    ├── GET    /api/v1/integrations/{org}/{provider}/pricing
    ├── GET    /api/v1/integrations/{org}/{provider}/pricing/{model_id}
    ├── POST   /api/v1/integrations/{org}/{provider}/pricing
    ├── PUT    /api/v1/integrations/{org}/{provider}/pricing/{model_id}
    ├── DELETE /api/v1/integrations/{org}/{provider}/pricing/{model_id}
    ├── PATCH  /api/v1/integrations/{org}/{provider}/pricing  (bulk update)
    └── POST   /api/v1/integrations/{org}/{provider}/pricing/reset
    │
    ▼
BigQuery: {org_slug}_prod.llm_model_pricing
```

**Note:** Both seed data (onboarding) AND CRUD operations are handled by `api-service` (port 8000). The `data-pipeline-service` (port 8001) only uses these tables for future cost calculations.

---

## Authentication

All endpoints require org-level API key authentication:

```bash
curl -X GET "http://localhost:8000/api/v1/integrations/{org_slug}/openai/pricing" \
  -H "X-API-Key: {org_api_key}"
```

---

## Endpoints

### List All Pricing Models

```http
GET /api/v1/integrations/{org_slug}/{provider}/pricing
```

**Path Parameters:**
| Parameter | Type | Description |
|-----------|------|-------------|
| `org_slug` | string | Organization identifier |
| `provider` | string | Provider: openai, anthropic, gemini, custom |

**Query Parameters:**
| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `is_enabled` | boolean | - | Filter by enabled status |
| `pricing_type` | string | - | Filter by pricing type |
| `limit` | integer | 1000 | Max records (up to 10000) |
| `offset` | integer | 0 | Pagination offset |

**Response:**
```json
{
  "org_slug": "acme_corp",
  "provider": "openai",
  "pricing": [
    {
      "model_id": "gpt-4o",
      "model_name": "GPT-4o",
      "input_price_per_1k": 0.0025,
      "output_price_per_1k": 0.01,
      "effective_date": "2024-11-01",
      "notes": "Latest GPT-4o model",
      "pricing_type": "standard",
      "free_tier_input_tokens": null,
      "free_tier_output_tokens": null,
      "free_tier_reset_frequency": null,
      "discount_percentage": null,
      "discount_reason": null,
      "volume_threshold_tokens": null,
      "base_input_price_per_1k": null,
      "base_output_price_per_1k": null,
      "created_at": "2024-11-01T00:00:00Z",
      "updated_at": "2024-11-01T00:00:00Z"
    }
  ],
  "count": 7
}
```

### Get Single Pricing Model

```http
GET /api/v1/integrations/{org_slug}/{provider}/pricing/{model_id}
```

**Response:**
```json
{
  "model_id": "gpt-4o",
  "model_name": "GPT-4o",
  "input_price_per_1k": 0.0025,
  "output_price_per_1k": 0.01,
  "effective_date": "2024-11-01",
  "pricing_type": "standard",
  ...
}
```

### Create Pricing Model

```http
POST /api/v1/integrations/{org_slug}/{provider}/pricing
```

**Request Body:**
```json
{
  "model_id": "gpt-4o-fine-tuned",
  "model_name": "GPT-4o Fine-tuned (Customer Support)",
  "input_price_per_1k": 0.003,
  "output_price_per_1k": 0.012,
  "effective_date": "2024-12-01",
  "pricing_type": "standard",
  "notes": "Fine-tuned for customer support use case"
}
```

**Response:** `201 Created`
```json
{
  "model_id": "gpt-4o-fine-tuned",
  "model_name": "GPT-4o Fine-tuned (Customer Support)",
  "input_price_per_1k": 0.003,
  "output_price_per_1k": 0.012,
  "effective_date": "2024-12-01",
  "pricing_type": "standard",
  "created_at": "2024-12-01T10:30:00Z",
  "updated_at": "2024-12-01T10:30:00Z"
}
```

### Update Pricing Model

```http
PUT /api/v1/integrations/{org_slug}/{provider}/pricing/{model_id}
```

**Request Body (partial update):**
```json
{
  "input_price_per_1k": 0.002,
  "output_price_per_1k": 0.008,
  "discount_percentage": 20,
  "discount_reason": "volume",
  "base_input_price_per_1k": 0.0025,
  "base_output_price_per_1k": 0.01
}
```

**Response:** `200 OK`

### Delete Pricing Model

```http
DELETE /api/v1/integrations/{org_slug}/{provider}/pricing/{model_id}
```

**Response:** `204 No Content`

### Bulk Update Pricing

```http
PATCH /api/v1/integrations/{org_slug}/{provider}/pricing
```

Update multiple models at once.

**Request Body:**
```json
{
  "updates": [
    {
      "model_id": "gpt-4o",
      "input_price_per_1k": 0.002,
      "discount_percentage": 20
    },
    {
      "model_id": "gpt-4o-mini",
      "input_price_per_1k": 0.00012,
      "discount_percentage": 20
    }
  ]
}
```

**Response:**
```json
{
  "updated": 2,
  "errors": []
}
```

### Reset to Defaults

```http
POST /api/v1/integrations/{org_slug}/{provider}/pricing/reset
```

Reloads default pricing from seed CSV. **Custom models (`is_custom: true`) are preserved.**

**Response:**
```json
{
  "reset_count": 7,
  "preserved_custom": 2
}
```

---

## Request Models

### OpenAIPricingCreate

| Field | Type | Required | Validation | Description |
|-------|------|----------|------------|-------------|
| `model_id` | string | Yes | 1-100 chars | Unique model identifier |
| `model_name` | string | No | max 200 chars | Display name |
| `input_price_per_1k` | float | Yes | >= 0 | Input token price per 1K (USD) |
| `output_price_per_1k` | float | Yes | >= 0 | Output token price per 1K (USD) |
| `effective_date` | date | Yes | - | When pricing becomes effective |
| `notes` | string | No | max 1000 chars | Additional notes |
| `pricing_type` | enum | No | default: standard | Pricing classification |
| `free_tier_input_tokens` | int | No | >= 0 | Free input tokens per period |
| `free_tier_output_tokens` | int | No | >= 0 | Free output tokens per period |
| `free_tier_reset_frequency` | enum | No | - | daily, monthly, never |
| `discount_percentage` | float | No | 0-100 | Percentage discount |
| `discount_reason` | enum | No | - | volume, commitment, promotion, negotiated, trial |
| `volume_threshold_tokens` | int | No | >= 0 | Min tokens to qualify |
| `base_input_price_per_1k` | float | No | >= 0 | Reference price before discount |
| `base_output_price_per_1k` | float | No | >= 0 | Reference price before discount |

### OpenAIPricingUpdate

All fields from `OpenAIPricingCreate` are optional for partial updates.

---

## Pricing Types

| Type | Description | Required Fields |
|------|-------------|-----------------|
| `standard` | Regular published pricing | input_price, output_price |
| `free_tier` | Provider-offered free usage | free_tier_*_tokens, reset_frequency |
| `volume_discount` | Usage-based tiered pricing | volume_threshold, discount_percentage |
| `committed_use` | Pre-paid commitment discount | discount_percentage, base prices |
| `promotional` | Time-bounded offer | effective_date, end_date, discount |
| `negotiated` | Custom enterprise | discount_percentage |

---

## Free Tier Configuration

### Creating a Model with Free Tier

```json
{
  "model_id": "custom-gemini",
  "model_name": "Custom Gemini Model",
  "input_price_per_1k": 0.0001,
  "output_price_per_1k": 0.0004,
  "effective_date": "2024-12-01",
  "pricing_type": "standard",
  "free_tier_input_tokens": 1000000000,
  "free_tier_output_tokens": 1000000000,
  "free_tier_reset_frequency": "daily",
  "notes": "1B tokens/day free"
}
```

### Reset Frequencies

| Value | Description |
|-------|-------------|
| `daily` | Resets at midnight UTC |
| `monthly` | Resets on 1st of month |
| `never` | One-time credit (no reset) |

---

## Volume Discount Configuration

### Creating Volume-Tiered Pricing

For models with volume-based discounts, create separate entries for each tier:

```bash
# Tier 1: Standard pricing (0-1B tokens)
curl -X POST ".../pricing" -d '{
  "model_id": "gpt-4o",
  "pricing_type": "standard",
  "input_price_per_1k": 0.0025,
  "output_price_per_1k": 0.01
}'

# Tier 2: 20% off (1B-5B tokens)
curl -X POST ".../pricing" -d '{
  "model_id": "gpt-4o-vol-tier2",
  "model_name": "GPT-4o (Volume Tier 2)",
  "pricing_type": "volume_discount",
  "input_price_per_1k": 0.002,
  "output_price_per_1k": 0.008,
  "volume_threshold_tokens": 1000000000,
  "discount_percentage": 20,
  "discount_reason": "volume",
  "base_input_price_per_1k": 0.0025,
  "base_output_price_per_1k": 0.01
}'

# Tier 3: 30% off (5B+ tokens)
curl -X POST ".../pricing" -d '{
  "model_id": "gpt-4o-vol-tier3",
  "model_name": "GPT-4o (Volume Tier 3)",
  "pricing_type": "volume_discount",
  "input_price_per_1k": 0.00175,
  "output_price_per_1k": 0.007,
  "volume_threshold_tokens": 5000000000,
  "discount_percentage": 30,
  "discount_reason": "volume",
  "base_input_price_per_1k": 0.0025,
  "base_output_price_per_1k": 0.01
}'
```

---

## Committed Use Discount (CUD)

### Creating CUD Pricing

```json
{
  "model_id": "gemini-1.5-pro-cud",
  "model_name": "Gemini 1.5 Pro (3-Year CUD)",
  "input_price_per_1k": 0.0006,
  "output_price_per_1k": 0.0024,
  "effective_date": "2024-12-01",
  "pricing_type": "committed_use",
  "discount_percentage": 52,
  "discount_reason": "commitment",
  "base_input_price_per_1k": 0.00125,
  "base_output_price_per_1k": 0.005,
  "notes": "3-year commitment - 52% discount"
}
```

---

## Promotional Pricing

### Creating Time-Bounded Promotions

```json
{
  "model_id": "gpt-4o-q1-promo",
  "model_name": "GPT-4o (Q1 2025 Promotion)",
  "input_price_per_1k": 0.001875,
  "output_price_per_1k": 0.0075,
  "effective_date": "2025-01-01",
  "end_date": "2025-03-31",
  "pricing_type": "promotional",
  "discount_percentage": 25,
  "discount_reason": "promotion",
  "base_input_price_per_1k": 0.0025,
  "base_output_price_per_1k": 0.01,
  "notes": "Q1 2025 early adopter discount - 25% off"
}
```

---

## Error Responses

| Status | Description |
|--------|-------------|
| 400 | Invalid request body or parameters |
| 401 | Missing or invalid API key |
| 403 | API key not authorized for org |
| 404 | Model not found |
| 409 | Duplicate model_id |
| 422 | Validation error |
| 500 | Internal server error |

**Example Error:**
```json
{
  "detail": "Pricing model 'gpt-4o' already exists for provider 'openai'"
}
```

**Validation Error:**
```json
{
  "detail": [
    {
      "loc": ["body", "input_price_per_1k"],
      "msg": "ensure this value is greater than or equal to 0",
      "type": "value_error.number.not_ge"
    }
  ]
}
```

---

## Examples

### Full Workflow: Add Custom Model with Volume Discount

```bash
# 1. List current pricing
curl -X GET "http://localhost:8000/api/v1/integrations/acme_corp/openai/pricing" \
  -H "X-API-Key: $ORG_API_KEY"

# 2. Add base pricing for custom model
curl -X POST "http://localhost:8000/api/v1/integrations/acme_corp/openai/pricing" \
  -H "X-API-Key: $ORG_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "model_id": "ft:gpt-4o:acme:support:abc123",
    "model_name": "GPT-4o Fine-tuned (Support)",
    "input_price_per_1k": 0.003,
    "output_price_per_1k": 0.012,
    "effective_date": "2024-12-01",
    "pricing_type": "standard",
    "notes": "Fine-tuned for customer support"
  }'

# 3. Add volume discount tier
curl -X POST "http://localhost:8000/api/v1/integrations/acme_corp/openai/pricing" \
  -H "X-API-Key: $ORG_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "model_id": "ft:gpt-4o:acme:support:abc123-vol",
    "model_name": "GPT-4o Fine-tuned (Support) - Volume",
    "input_price_per_1k": 0.0024,
    "output_price_per_1k": 0.0096,
    "effective_date": "2024-12-01",
    "pricing_type": "volume_discount",
    "volume_threshold_tokens": 500000000,
    "discount_percentage": 20,
    "discount_reason": "volume",
    "base_input_price_per_1k": 0.003,
    "base_output_price_per_1k": 0.012
  }'

# 4. Update base model with free tier
curl -X PUT "http://localhost:8000/api/v1/integrations/acme_corp/openai/pricing/ft:gpt-4o:acme:support:abc123" \
  -H "X-API-Key: $ORG_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "free_tier_input_tokens": 100000000,
    "free_tier_output_tokens": 50000000,
    "free_tier_reset_frequency": "monthly"
  }'
```

### Bulk Update for Price Changes

```bash
curl -X PATCH "http://localhost:8000/api/v1/integrations/acme_corp/openai/pricing" \
  -H "X-API-Key: $ORG_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "updates": [
      {"model_id": "gpt-4o", "input_price_per_1k": 0.002, "output_price_per_1k": 0.008},
      {"model_id": "gpt-4o-mini", "input_price_per_1k": 0.00012, "output_price_per_1k": 0.00048},
      {"model_id": "gpt-4-turbo", "input_price_per_1k": 0.008, "output_price_per_1k": 0.024}
    ]
  }'
```

---

## Pydantic Models

Located in `src/app/models/openai_data_models.py`:

### Enums

```python
class PricingTypeEnum(str, Enum):
    STANDARD = "standard"
    FREE_TIER = "free_tier"
    VOLUME_DISCOUNT = "volume_discount"
    COMMITTED_USE = "committed_use"
    PROMOTIONAL = "promotional"
    NEGOTIATED = "negotiated"

class FreeTierResetFrequency(str, Enum):
    DAILY = "daily"
    MONTHLY = "monthly"
    NEVER = "never"

class DiscountReasonEnum(str, Enum):
    VOLUME = "volume"
    COMMITMENT = "commitment"
    PROMOTION = "promotion"
    NEGOTIATED = "negotiated"
    TRIAL = "trial"
```

---

## Related Documentation

- **Pricing Seed Data**: See `LLM_PRICING_SEED.md`
- **Subscription CRUD**: See `LLM_SUBSCRIPTION_CRUD.md`
- **Frontend Config**: See `fronted-system/docs/LLM_PRICING_CONFIG.md`
- **API Service Architecture**: See `CLAUDE.md`
