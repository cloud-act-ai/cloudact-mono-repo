# LLM Subscription & Pricing CRUD Operations

## Overview

This document describes the CRUD API for managing LLM provider subscriptions and pricing models. These endpoints operate on **org-specific BigQuery tables** created during onboarding.

## Architecture

```
Frontend / API Client
    │
    ▼
convergence-data-pipeline (port 8001)
    │
    ├── GET    /api/v1/integrations/{org}/{provider}/pricing
    ├── POST   /api/v1/integrations/{org}/{provider}/pricing
    ├── PUT    /api/v1/integrations/{org}/{provider}/pricing/{model_id}
    ├── DELETE /api/v1/integrations/{org}/{provider}/pricing/{model_id}
    │
    ├── GET    /api/v1/integrations/{org}/{provider}/subscriptions
    ├── POST   /api/v1/integrations/{org}/{provider}/subscriptions
    ├── PUT    /api/v1/integrations/{org}/{provider}/subscriptions/{plan_name}
    └── DELETE /api/v1/integrations/{org}/{provider}/subscriptions/{plan_name}
    │
    ▼
BigQuery: {org_slug}_prod.llm_model_pricing
BigQuery: {org_slug}_prod.llm_subscriptions
```

**Seed data** is loaded during onboarding by `cloudact-api-service` (port 8000).

---

## Authentication

All endpoints require org-level API key authentication:

```bash
curl -X GET "http://localhost:8001/api/v1/integrations/{org_slug}/openai/pricing" \
  -H "X-API-Key: {org_api_key}"
```

---

## Pricing Endpoints

### List Pricing Models

```http
GET /api/v1/integrations/{org_slug}/{provider}/pricing
```

**Query Parameters:**
| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `is_enabled` | boolean | - | Filter by enabled status |
| `limit` | integer | 1000 | Max records to return |
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

### Create Pricing Model

```http
POST /api/v1/integrations/{org_slug}/{provider}/pricing
```

**Request Body:**
```json
{
  "model_id": "custom-llm-v1",
  "model_name": "Custom LLM v1",
  "input_price_per_1k": 0.002,
  "output_price_per_1k": 0.008,
  "effective_date": "2024-12-01",
  "pricing_type": "standard",
  "free_tier_input_tokens": 1000000,
  "free_tier_output_tokens": 500000,
  "free_tier_reset_frequency": "monthly",
  "notes": "Custom fine-tuned model"
}
```

**Pricing Type Options:**
- `standard` - Regular published pricing
- `free_tier` - Provider-offered free usage
- `volume_discount` - Tiered pricing based on usage
- `committed_use` - Pre-committed spend discounts
- `promotional` - Time-bounded special offers
- `negotiated` - Custom enterprise agreements

### Update Pricing Model

```http
PUT /api/v1/integrations/{org_slug}/{provider}/pricing/{model_id}
```

**Request Body (partial update):**
```json
{
  "input_price_per_1k": 0.0018,
  "discount_percentage": 10,
  "discount_reason": "volume"
}
```

### Delete Pricing Model

```http
DELETE /api/v1/integrations/{org_slug}/{provider}/pricing/{model_id}
```

### Reset to Defaults

```http
POST /api/v1/integrations/{org_slug}/{provider}/pricing/reset
```

Reloads default pricing from seed CSV. Custom models (`is_custom: true`) are preserved.

---

## Subscription Endpoints

### List Subscriptions

```http
GET /api/v1/integrations/{org_slug}/{provider}/subscriptions
```

**Response:**
```json
{
  "org_slug": "acme_corp",
  "subscriptions": [
    {
      "subscription_id": "sub_openai_tier1",
      "plan_name": "TIER1",
      "quantity": 0,
      "unit_price_usd": 20.0,
      "effective_date": "2024-11-01",
      "tier_type": "paid",
      "trial_end_date": null,
      "trial_credit_usd": 0,
      "monthly_token_limit": null,
      "daily_token_limit": null,
      "rpm_limit": 500,
      "tpm_limit": 30000,
      "rpd_limit": 10000,
      "tpd_limit": null,
      "concurrent_limit": null,
      "committed_spend_usd": null,
      "commitment_term_months": null,
      "discount_percentage": null,
      "created_at": "2024-11-01T00:00:00Z",
      "updated_at": "2024-11-01T00:00:00Z"
    }
  ],
  "count": 6
}
```

### Create Subscription

```http
POST /api/v1/integrations/{org_slug}/{provider}/subscriptions
```

**Request Body:**
```json
{
  "subscription_id": "sub_custom_enterprise",
  "plan_name": "ENTERPRISE_CUSTOM",
  "quantity": 10,
  "unit_price_usd": 0,
  "effective_date": "2024-12-01",
  "tier_type": "enterprise",
  "rpm_limit": 5000,
  "tpm_limit": 2000000,
  "committed_spend_usd": 10000,
  "commitment_term_months": 12,
  "discount_percentage": 30,
  "notes": "Custom enterprise agreement"
}
```

**Tier Type Options:**
- `free` - Perpetual free tier
- `trial` - Time-limited trial with credits
- `paid` - Standard paid tier
- `enterprise` - Custom enterprise agreement
- `committed_use` - CUD commitment

### Update Subscription

```http
PUT /api/v1/integrations/{org_slug}/{provider}/subscriptions/{plan_name}
```

**Request Body (partial update):**
```json
{
  "rpm_limit": 10000,
  "tpm_limit": 5000000,
  "discount_percentage": 35
}
```

### Delete Subscription

```http
DELETE /api/v1/integrations/{org_slug}/{provider}/subscriptions/{plan_name}
```

---

## Rate Limit Fields

| Field | Description | Providers |
|-------|-------------|-----------|
| `rpm_limit` | Requests per minute | All |
| `tpm_limit` | Tokens per minute | All |
| `rpd_limit` | Requests per day | OpenAI, Gemini |
| `tpd_limit` | Tokens per day | Anthropic, Gemini |
| `concurrent_limit` | Max concurrent requests | All |
| `monthly_token_limit` | Monthly cap | Custom |
| `daily_token_limit` | Daily cap | Custom |

---

## Free Tier Configuration

For models with free tier allocations:

```json
{
  "model_id": "gemini-2.0-flash",
  "pricing_type": "standard",
  "input_price_per_1k": 0.0001,
  "output_price_per_1k": 0.0004,
  "free_tier_input_tokens": 2000000000,
  "free_tier_output_tokens": 2000000000,
  "free_tier_reset_frequency": "daily"
}
```

**Reset Frequency Options:**
- `daily` - Resets at midnight UTC (Gemini)
- `monthly` - Resets on 1st of month
- `never` - One-time credit

---

## Committed Use Discounts (CUDs)

For GCP/Gemini committed use pricing:

```json
{
  "subscription_id": "sub_gemini_cud_3yr",
  "plan_name": "CUD_3_YEAR",
  "tier_type": "committed_use",
  "committed_spend_usd": 50000,
  "commitment_term_months": 36,
  "discount_percentage": 52,
  "notes": "3-year commitment - 52% discount"
}
```

---

## Volume Discount Pricing

For volume-based tiered pricing:

```json
{
  "model_id": "gpt-4o-volume",
  "pricing_type": "volume_discount",
  "input_price_per_1k": 0.002,
  "output_price_per_1k": 0.008,
  "volume_threshold_tokens": 1000000000,
  "discount_percentage": 20,
  "discount_reason": "volume",
  "base_input_price_per_1k": 0.0025,
  "base_output_price_per_1k": 0.01
}
```

---

## Error Responses

| Status | Description |
|--------|-------------|
| 400 | Invalid request body or parameters |
| 401 | Missing or invalid API key |
| 403 | API key not authorized for org |
| 404 | Model or subscription not found |
| 409 | Duplicate model_id or plan_name |
| 500 | Internal server error |

**Example Error:**
```json
{
  "detail": "Pricing model 'gpt-4o' already exists for provider 'openai'"
}
```

---

## Pydantic Models

Located in `src/app/models/openai_data_models.py`:

**Enums:**
- `PricingTypeEnum` - standard, free_tier, volume_discount, committed_use, promotional, negotiated
- `TierTypeEnum` - free, trial, paid, enterprise, committed_use
- `FreeTierResetFrequency` - daily, monthly, never
- `DiscountReasonEnum` - volume, commitment, promotion, negotiated, trial

**Request Models:**
- `OpenAIPricingCreate` / `OpenAIPricingUpdate`
- `OpenAISubscriptionCreate` / `OpenAISubscriptionUpdate`

**Response Models:**
- `OpenAIPricingResponse` / `OpenAIPricingListResponse`
- `OpenAISubscriptionResponse` / `OpenAISubscriptionListResponse`

---

## Example: Full Workflow

```bash
# 1. List current pricing
curl -X GET "http://localhost:8001/api/v1/integrations/acme_corp/openai/pricing" \
  -H "X-API-Key: $ORG_API_KEY"

# 2. Add custom model with volume discount
curl -X POST "http://localhost:8001/api/v1/integrations/acme_corp/openai/pricing" \
  -H "X-API-Key: $ORG_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "model_id": "gpt-4o-volume-tier",
    "model_name": "GPT-4o (Volume Discount)",
    "input_price_per_1k": 0.002,
    "output_price_per_1k": 0.008,
    "effective_date": "2024-12-01",
    "pricing_type": "volume_discount",
    "volume_threshold_tokens": 1000000000,
    "discount_percentage": 20,
    "discount_reason": "volume",
    "base_input_price_per_1k": 0.0025,
    "base_output_price_per_1k": 0.01
  }'

# 3. Update subscription with higher limits
curl -X PUT "http://localhost:8001/api/v1/integrations/acme_corp/openai/subscriptions/TIER2" \
  -H "X-API-Key: $ORG_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "rpm_limit": 10000,
    "tpm_limit": 1000000
  }'

# 4. Add CUD subscription
curl -X POST "http://localhost:8001/api/v1/integrations/acme_corp/gemini/subscriptions" \
  -H "X-API-Key: $ORG_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "subscription_id": "sub_gemini_cud_custom",
    "plan_name": "CUD_CUSTOM",
    "quantity": 1,
    "unit_price_usd": 0,
    "effective_date": "2024-12-01",
    "tier_type": "committed_use",
    "committed_spend_usd": 25000,
    "commitment_term_months": 24,
    "discount_percentage": 40
  }'
```

---

## Related Documentation

- **Seed Data**: See `cloudact-api-service/docs/LLM_SUBSCRIPTION_SEED.md`
- **Frontend Config**: See `fronted_v0/docs/LLM_SUBSCRIPTION_CONFIG.md`
- **Pipeline Architecture**: See `CLAUDE.md`
