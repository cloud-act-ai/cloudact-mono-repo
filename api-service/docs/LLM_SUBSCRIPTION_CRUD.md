# LLM Subscription CRUD Operations

## Overview

This document describes the CRUD API for managing LLM provider subscriptions. These endpoints operate on **org-specific BigQuery tables** created during onboarding. Subscriptions define tier levels, rate limits, and commitment terms.

## Architecture

```
Frontend / API Client
    │
    ▼
api-service (port 8000)
    │
    ├── GET    /api/v1/integrations/{org}/{provider}/subscriptions
    ├── GET    /api/v1/integrations/{org}/{provider}/subscriptions/{plan_name}
    ├── POST   /api/v1/integrations/{org}/{provider}/subscriptions
    ├── PUT    /api/v1/integrations/{org}/{provider}/subscriptions/{plan_name}
    ├── DELETE /api/v1/integrations/{org}/{provider}/subscriptions/{plan_name}
    └── POST   /api/v1/integrations/{org}/{provider}/subscriptions/reset
    │
    ▼
BigQuery: {org_slug}_prod.llm_subscriptions
```

**Note:** Both seed data (onboarding) AND CRUD operations are handled by `api-service` (port 8000). The `data-pipeline-service` (port 8001) only uses these tables for future cost calculations.

---

## Authentication

All endpoints require org-level API key authentication:

```bash
curl -X GET "http://localhost:8000/api/v1/integrations/{org_slug}/openai/subscriptions" \
  -H "X-API-Key: {org_api_key}"
```

---

## Endpoints

### List All Subscriptions

```http
GET /api/v1/integrations/{org_slug}/{provider}/subscriptions
```

**Path Parameters:**
| Parameter | Type | Description |
|-----------|------|-------------|
| `org_slug` | string | Organization identifier |
| `provider` | string | Provider: openai, anthropic, gemini |

**Query Parameters:**
| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `tier_type` | string | - | Filter by tier type |
| `is_active` | boolean | - | Filter by active status |
| `limit` | integer | 1000 | Max records (up to 10000) |
| `offset` | integer | 0 | Pagination offset |

**Response:**
```json
{
  "org_slug": "acme_corp",
  "provider": "openai",
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

### Get Single Subscription

```http
GET /api/v1/integrations/{org_slug}/{provider}/subscriptions/{plan_name}
```

**Response:**
```json
{
  "subscription_id": "sub_openai_tier1",
  "plan_name": "TIER1",
  "tier_type": "paid",
  "rpm_limit": 500,
  "tpm_limit": 30000,
  ...
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

**Response:** `201 Created`

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

**Response:** `200 OK`

### Delete Subscription

```http
DELETE /api/v1/integrations/{org_slug}/{provider}/subscriptions/{plan_name}
```

**Response:** `204 No Content`

### Reset to Defaults

```http
POST /api/v1/integrations/{org_slug}/{provider}/subscriptions/reset
```

Reloads default subscriptions from seed CSV.

**Response:**
```json
{
  "reset_count": 6,
  "preserved_custom": 1
}
```

---

## Request Models

### OpenAISubscriptionCreate

| Field | Type | Required | Validation | Description |
|-------|------|----------|------------|-------------|
| `subscription_id` | string | Yes | 1-100 chars | Unique subscription identifier |
| `plan_name` | string | Yes | 1-50 chars | Plan name (e.g., TIER1, FREE) |
| `quantity` | int | No | >= 0 | Number of seats/units |
| `unit_price_usd` | float | No | >= 0 | Price per unit |
| `effective_date` | date | Yes | - | When subscription becomes effective |
| `tier_type` | enum | Yes | - | free, trial, paid, enterprise, committed_use |
| `trial_end_date` | date | No | - | Trial expiration date |
| `trial_credit_usd` | float | No | >= 0 | Trial credit amount |
| `monthly_token_limit` | int | No | >= 0 | Monthly token cap |
| `daily_token_limit` | int | No | >= 0 | Daily token cap |
| `rpm_limit` | int | No | >= 0 | Requests per minute |
| `tpm_limit` | int | No | >= 0 | Tokens per minute |
| `rpd_limit` | int | No | >= 0 | Requests per day |
| `tpd_limit` | int | No | >= 0 | Tokens per day |
| `concurrent_limit` | int | No | >= 0 | Max concurrent requests |
| `committed_spend_usd` | float | No | >= 0 | Committed monthly spend |
| `commitment_term_months` | int | No | 12, 24, 36 | Commitment duration |
| `discount_percentage` | float | No | 0-100 | Discount for this tier |
| `notes` | string | No | max 1000 chars | Additional notes |

### OpenAISubscriptionUpdate

All fields from `OpenAISubscriptionCreate` are optional for partial updates.

---

## Tier Types

| Type | Description | Use Case |
|------|-------------|----------|
| `free` | Perpetual free tier | Provider free tier (Gemini) |
| `trial` | Time-limited trial | Trial with credits (Anthropic $5) |
| `paid` | Standard paid tier | Tier 1-5 for OpenAI |
| `enterprise` | Custom enterprise | Negotiated agreements |
| `committed_use` | CUD commitment | GCP 1-year/3-year commits |

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

## Trial Configuration

### Creating a Trial Subscription

```json
{
  "subscription_id": "sub_anthropic_trial",
  "plan_name": "FREE_TRIAL",
  "tier_type": "trial",
  "trial_end_date": "2025-01-31",
  "trial_credit_usd": 5.0,
  "rpm_limit": 5,
  "tpm_limit": 20000,
  "rpd_limit": 1000,
  "notes": "Anthropic API trial - $5 credit"
}
```

---

## Committed Use Discount (CUD)

### Creating CUD Subscription

```json
{
  "subscription_id": "sub_gemini_cud_3yr",
  "plan_name": "CUD_3_YEAR",
  "tier_type": "committed_use",
  "committed_spend_usd": 50000,
  "commitment_term_months": 36,
  "discount_percentage": 52,
  "rpm_limit": 1000,
  "tpm_limit": 10000000,
  "notes": "3-year commitment - 52% discount"
}
```

---

## Error Responses

| Status | Description |
|--------|-------------|
| 400 | Invalid request body or parameters |
| 401 | Missing or invalid API key |
| 403 | API key not authorized for org |
| 404 | Subscription not found |
| 409 | Duplicate plan_name |
| 422 | Validation error |
| 500 | Internal server error |

**Example Error:**
```json
{
  "detail": "Subscription 'TIER1' already exists for provider 'openai'"
}
```

---

## Examples

### Full Workflow: Upgrade Subscription Tier

```bash
# 1. List current subscriptions
curl -X GET "http://localhost:8000/api/v1/integrations/acme_corp/openai/subscriptions" \
  -H "X-API-Key: $ORG_API_KEY"

# 2. Update to higher limits
curl -X PUT "http://localhost:8000/api/v1/integrations/acme_corp/openai/subscriptions/TIER2" \
  -H "X-API-Key: $ORG_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "rpm_limit": 10000,
    "tpm_limit": 1000000,
    "notes": "Upgraded to higher tier"
  }'

# 3. Add CUD subscription for Gemini
curl -X POST "http://localhost:8000/api/v1/integrations/acme_corp/gemini/subscriptions" \
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

## Pydantic Models

Located in `src/app/models/openai_data_models.py`:

### Enums

```python
class TierTypeEnum(str, Enum):
    FREE = "free"
    TRIAL = "trial"
    PAID = "paid"
    ENTERPRISE = "enterprise"
    COMMITTED_USE = "committed_use"
```

---

## Related Documentation

- **Subscription Seed Data**: See `LLM_SUBSCRIPTION_SEED.md`
- **Pricing CRUD**: See `LLM_PRICING_CRUD.md`
- **Frontend Config**: See `fronted-system/docs/LLM_SUBSCRIPTION_CONFIG.md`
- **API Service Architecture**: See `CLAUDE.md`
