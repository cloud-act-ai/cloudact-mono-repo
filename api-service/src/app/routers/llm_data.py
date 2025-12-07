"""
LLM Provider Data CRUD API Routes

Generic endpoints for managing pricing and subscription data for all LLM providers.
Uses unified tables (saas_subscriptions, llm_model_pricing) with provider column filtering.

URL Structure: /api/v1/integrations/{org_slug}/{provider}/pricing|subscriptions
"""

from fastapi import APIRouter, Depends, HTTPException, status, Query
from typing import Dict, List, Optional
from datetime import datetime
from enum import Enum
import logging
import re
import uuid

from google.cloud import bigquery

from src.core.engine.bq_client import get_bigquery_client, BigQueryClient
from src.app.dependencies.auth import get_current_org
from src.app.config import get_settings
from src.app.models.openai_data_models import (
    OpenAIPricingCreate,
    OpenAIPricingUpdate,
    OpenAIPricingResponse,
    OpenAIPricingListResponse,
    OpenAISubscriptionCreate,
    OpenAISubscriptionUpdate,
    OpenAISubscriptionResponse,
    OpenAISubscriptionListResponse,
)

router = APIRouter()
logger = logging.getLogger(__name__)
settings = get_settings()


# ============================================
# Unified Table Names (V7 Architecture)
# ============================================
UNIFIED_SUBSCRIPTIONS_TABLE = "saas_subscription_plans"
UNIFIED_PRICING_TABLE = "llm_model_pricing"

# Valid providers for filtering (including 'custom' for user-defined)
VALID_PROVIDERS = {"openai", "anthropic", "gemini", "custom"}


def _get_llm_providers_enum():
    """Build LLMProvider enum including 'custom' for user-defined entries."""
    # Include standard providers plus custom
    providers = list(VALID_PROVIDERS)
    return Enum('LLMProvider', {p: p for p in providers}, type=str)

# Create enum for API validation
LLMProvider = _get_llm_providers_enum()


def validate_provider(provider: str) -> str:
    """Validate provider is supported."""
    provider_lower = provider.lower()
    if provider_lower not in VALID_PROVIDERS:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Unsupported provider: {provider}. Supported: {list(VALID_PROVIDERS)}"
        )
    return provider_lower


# ============================================
# Input Validation
# ============================================

def validate_org_slug(org_slug: str) -> None:
    """Validate org_slug format to prevent path traversal and injection."""
    if not org_slug or not re.match(r'^[a-zA-Z0-9_]{3,50}$', org_slug):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid org_slug format. Must be 3-50 alphanumeric characters with underscores."
        )


def validate_model_id(model_id: str) -> None:
    """Validate model_id format."""
    if not model_id or not re.match(r'^[a-zA-Z0-9\-_.]{1,100}$', model_id):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid model_id format. Must be 1-100 alphanumeric characters with hyphens, underscores, and dots."
        )


def validate_plan_name(plan_name: str) -> None:
    """Validate plan_name format."""
    if not plan_name or not re.match(r'^[a-zA-Z0-9_]{1,50}$', plan_name):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid plan_name format. Must be 1-50 alphanumeric characters with underscores."
        )


def get_org_dataset(org_slug: str) -> str:
    """Get the organization's dataset ID using consistent naming with onboarding."""
    # Use settings.get_org_dataset_name() for consistency with onboarding processor
    # Maps: development -> local, staging -> stage, production -> prod
    return settings.get_org_dataset_name(org_slug)


def check_org_access(org: Dict, org_slug: str) -> None:
    """Check if the authenticated org can access the requested org."""
    if not settings.disable_auth and org["org_slug"] != org_slug:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Cannot access data for another organization"
        )


# ============================================
# Pricing Endpoints (All Providers - Unified Table)
# ============================================

@router.get(
    "/integrations/{org_slug}/{provider}/pricing",
    response_model=OpenAIPricingListResponse,
    summary="List all model pricing for provider",
    tags=["LLM Data"]
)
async def list_pricing(
    org_slug: str,
    provider: LLMProvider,
    include_custom: bool = Query(True, description="Include custom pricing entries"),
    is_enabled: Optional[bool] = Query(None, description="Filter by enabled status"),
    limit: int = 1000,
    offset: int = 0,
    org: Dict = Depends(get_current_org),
    bq_client: BigQueryClient = Depends(get_bigquery_client)
):
    """
    List all model pricing for an organization and provider.

    Uses unified llm_model_pricing table with provider filtering.
    By default includes both provider-specific and custom entries.
    """
    validate_org_slug(org_slug)
    check_org_access(org, org_slug)
    provider_value = validate_provider(provider.value)

    # Validate pagination bounds (lowered from 10000 to 500 for better performance)
    MAX_LIMIT = 500
    if limit < 0 or limit > MAX_LIMIT:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Limit must be between 0 and {MAX_LIMIT}"
        )
    if offset < 0:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Offset must be non-negative"
        )

    try:
        dataset_id = get_org_dataset(org_slug)
        table_id = f"{settings.gcp_project_id}.{dataset_id}.{UNIFIED_PRICING_TABLE}"

        # Build WHERE clause for provider filtering
        where_conditions = []
        query_params = [
            bigquery.ScalarQueryParameter("provider", "STRING", provider_value),
            bigquery.ScalarQueryParameter("limit", "INT64", limit),
            bigquery.ScalarQueryParameter("offset", "INT64", offset)
        ]

        if include_custom:
            where_conditions.append("(provider = @provider OR provider = 'custom')")
        else:
            where_conditions.append("provider = @provider")

        if is_enabled is not None:
            where_conditions.append("is_enabled = @is_enabled")
            query_params.append(bigquery.ScalarQueryParameter("is_enabled", "BOOL", is_enabled))

        where_clause = " AND ".join(where_conditions)

        # Explicit column selection for better performance and clarity
        query = f"""
        SELECT
            pricing_id, provider, model_id, model_name, is_custom,
            input_price_per_1k, output_price_per_1k, effective_date, end_date,
            is_enabled, notes, x_gemini_context_window, x_gemini_region,
            x_anthropic_tier, x_openai_batch_input_price, x_openai_batch_output_price,
            pricing_type, free_tier_input_tokens, free_tier_output_tokens,
            free_tier_reset_frequency, discount_percentage, discount_reason,
            volume_threshold_tokens, base_input_price_per_1k, base_output_price_per_1k,
            discounted_input_price_per_1k, discounted_output_price_per_1k,
            created_at, updated_at
        FROM `{table_id}`
        WHERE {where_clause}
        ORDER BY provider, model_id
        LIMIT @limit OFFSET @offset
        """

        job_config = bigquery.QueryJobConfig(
            query_parameters=query_params,
            timeout_ms=30000  # 30 second timeout for user-facing queries
        )
        result = bq_client.client.query(query, job_config=job_config).result()
        pricing = [dict(row) for row in result]

        return OpenAIPricingListResponse(
            org_slug=org_slug,
            provider=provider_value,
            pricing=pricing,
            count=len(pricing)
        )

    except Exception as e:
        logger.error(f"Error listing {provider_value} pricing for {org_slug}: {e}", exc_info=True)
        if "Not found" in str(e):
            return OpenAIPricingListResponse(org_slug=org_slug, provider=provider_value, pricing=[], count=0)
        raise HTTPException(status_code=500, detail="Failed to retrieve pricing data")


@router.get(
    "/integrations/{org_slug}/{provider}/pricing/{model_id}",
    response_model=OpenAIPricingResponse,
    summary="Get single model pricing",
    tags=["LLM Data"]
)
async def get_pricing(
    org_slug: str,
    provider: LLMProvider,
    model_id: str,
    org: Dict = Depends(get_current_org),
    bq_client: BigQueryClient = Depends(get_bigquery_client)
):
    """Get pricing for a specific model from unified table."""
    validate_org_slug(org_slug)
    validate_model_id(model_id)
    check_org_access(org, org_slug)
    provider_value = validate_provider(provider.value)

    try:
        dataset_id = get_org_dataset(org_slug)
        table_id = f"{settings.gcp_project_id}.{dataset_id}.{UNIFIED_PRICING_TABLE}"

        # Explicit column selection for better performance
        query = f"""
        SELECT
            pricing_id, provider, model_id, model_name, is_custom,
            input_price_per_1k, output_price_per_1k, effective_date, end_date,
            is_enabled, notes, x_gemini_context_window, x_gemini_region,
            x_anthropic_tier, x_openai_batch_input_price, x_openai_batch_output_price,
            pricing_type, free_tier_input_tokens, free_tier_output_tokens,
            free_tier_reset_frequency, discount_percentage, discount_reason,
            volume_threshold_tokens, base_input_price_per_1k, base_output_price_per_1k,
            discounted_input_price_per_1k, discounted_output_price_per_1k,
            created_at, updated_at
        FROM `{table_id}`
        WHERE model_id = @model_id AND (provider = @provider OR provider = 'custom')
        """

        job_config = bigquery.QueryJobConfig(
            query_parameters=[
                bigquery.ScalarQueryParameter("model_id", "STRING", model_id),
                bigquery.ScalarQueryParameter("provider", "STRING", provider_value)
            ],
            timeout_ms=30000  # 30 second timeout for user queries
        )

        result = bq_client.client.query(query, job_config=job_config).result()
        rows = list(result)

        if not rows:
            raise HTTPException(status_code=404, detail=f"Pricing not found for model: {model_id}")

        return OpenAIPricingResponse(**dict(rows[0]))

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error getting pricing for {model_id}: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail="Failed to retrieve pricing data")


@router.post(
    "/integrations/{org_slug}/{provider}/pricing",
    response_model=OpenAIPricingResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Create new model pricing",
    tags=["LLM Data"]
)
async def create_pricing(
    org_slug: str,
    provider: LLMProvider,
    pricing: OpenAIPricingCreate,
    org: Dict = Depends(get_current_org),
    bq_client: BigQueryClient = Depends(get_bigquery_client)
):
    """Create a new pricing record in the unified table."""
    validate_org_slug(org_slug)
    check_org_access(org, org_slug)
    provider_value = validate_provider(provider.value)

    try:
        dataset_id = get_org_dataset(org_slug)
        table_id = f"{settings.gcp_project_id}.{dataset_id}.{UNIFIED_PRICING_TABLE}"
        now = datetime.utcnow().isoformat() + "Z"

        # Check if exists for this provider
        check_query = f"SELECT COUNT(*) as cnt FROM `{table_id}` WHERE model_id = @model_id AND provider = @provider"
        job_config = bigquery.QueryJobConfig(
            query_parameters=[
                bigquery.ScalarQueryParameter("model_id", "STRING", pricing.model_id),
                bigquery.ScalarQueryParameter("provider", "STRING", provider_value)
            ],
            timeout_ms=10000  # 10 second timeout for auth operations
        )
        result = bq_client.client.query(check_query, job_config=job_config).result()
        if list(result)[0].cnt > 0:
            raise HTTPException(status_code=409, detail=f"Pricing already exists for model: {pricing.model_id}")

        # Generate pricing_id
        pricing_id = f"price_{provider_value}_{pricing.model_id.replace('-', '_').replace('.', '_')}"

        # Determine is_custom: True if provider is 'custom' or if user-created (API-created entries are custom)
        is_custom = provider_value == "custom" or True  # All API-created entries are custom

        # Use standard INSERT instead of streaming insert to avoid streaming buffer issues
        # Streaming inserts can't be modified/deleted for ~90 minutes
        insert_query = f"""
        INSERT INTO `{table_id}` (
            pricing_id, provider, model_id, model_name, is_custom,
            input_price_per_1k, output_price_per_1k, effective_date, end_date,
            is_enabled, notes, x_gemini_context_window, x_gemini_region,
            x_anthropic_tier, x_openai_batch_input_price, x_openai_batch_output_price,
            pricing_type, free_tier_input_tokens, free_tier_output_tokens,
            free_tier_reset_frequency, discount_percentage, discount_reason,
            volume_threshold_tokens, base_input_price_per_1k, base_output_price_per_1k,
            created_at, updated_at
        ) VALUES (
            @pricing_id, @provider, @model_id, @model_name, @is_custom,
            @input_price, @output_price, @effective_date, NULL,
            TRUE, @notes, NULL, NULL,
            NULL, NULL, NULL,
            @pricing_type, @free_tier_input_tokens, @free_tier_output_tokens,
            @free_tier_reset_frequency, @discount_percentage, @discount_reason,
            @volume_threshold_tokens, @base_input_price, @base_output_price,
            @created_at, @updated_at
        )
        """
        job_config = bigquery.QueryJobConfig(
            query_parameters=[
                bigquery.ScalarQueryParameter("pricing_id", "STRING", pricing_id),
                bigquery.ScalarQueryParameter("provider", "STRING", provider_value),
                bigquery.ScalarQueryParameter("model_id", "STRING", pricing.model_id),
                bigquery.ScalarQueryParameter("model_name", "STRING", pricing.model_name),
                bigquery.ScalarQueryParameter("is_custom", "BOOL", is_custom),
                bigquery.ScalarQueryParameter("input_price", "FLOAT64", pricing.input_price_per_1k),
                bigquery.ScalarQueryParameter("output_price", "FLOAT64", pricing.output_price_per_1k),
                bigquery.ScalarQueryParameter("effective_date", "DATE", str(pricing.effective_date)),
                bigquery.ScalarQueryParameter("notes", "STRING", pricing.notes),
                bigquery.ScalarQueryParameter("pricing_type", "STRING", pricing.pricing_type.value if pricing.pricing_type else "standard"),
                bigquery.ScalarQueryParameter("free_tier_input_tokens", "INT64", pricing.free_tier_input_tokens),
                bigquery.ScalarQueryParameter("free_tier_output_tokens", "INT64", pricing.free_tier_output_tokens),
                bigquery.ScalarQueryParameter("free_tier_reset_frequency", "STRING", pricing.free_tier_reset_frequency.value if pricing.free_tier_reset_frequency else None),
                bigquery.ScalarQueryParameter("discount_percentage", "FLOAT64", pricing.discount_percentage),
                bigquery.ScalarQueryParameter("discount_reason", "STRING", pricing.discount_reason.value if pricing.discount_reason else None),
                bigquery.ScalarQueryParameter("volume_threshold_tokens", "INT64", pricing.volume_threshold_tokens),
                bigquery.ScalarQueryParameter("base_input_price", "FLOAT64", pricing.base_input_price_per_1k),
                bigquery.ScalarQueryParameter("base_output_price", "FLOAT64", pricing.base_output_price_per_1k),
                bigquery.ScalarQueryParameter("created_at", "TIMESTAMP", now),
                bigquery.ScalarQueryParameter("updated_at", "TIMESTAMP", now),
            ],
            timeout_ms=30000  # 30 second timeout for user operations
        )
        bq_client.client.query(insert_query, job_config=job_config).result()

        logger.info(f"Created {provider_value} pricing for model {pricing.model_id} in {org_slug}")

        return OpenAIPricingResponse(
            pricing_id=pricing_id,
            provider=provider_value,
            model_id=pricing.model_id,
            model_name=pricing.model_name,
            is_custom=is_custom,
            input_price_per_1k=pricing.input_price_per_1k,
            output_price_per_1k=pricing.output_price_per_1k,
            effective_date=pricing.effective_date,
            notes=pricing.notes,
            pricing_type=pricing.pricing_type.value if pricing.pricing_type else "standard",
            free_tier_input_tokens=pricing.free_tier_input_tokens,
            free_tier_output_tokens=pricing.free_tier_output_tokens,
            free_tier_reset_frequency=pricing.free_tier_reset_frequency.value if pricing.free_tier_reset_frequency else None,
            discount_percentage=pricing.discount_percentage,
            discount_reason=pricing.discount_reason.value if pricing.discount_reason else None,
            volume_threshold_tokens=pricing.volume_threshold_tokens,
            base_input_price_per_1k=pricing.base_input_price_per_1k,
            base_output_price_per_1k=pricing.base_output_price_per_1k,
            created_at=datetime.fromisoformat(now.rstrip("Z")),
            updated_at=datetime.fromisoformat(now.rstrip("Z")),
        )

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error creating pricing: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail="Failed to create pricing record")


@router.put(
    "/integrations/{org_slug}/{provider}/pricing/{model_id}",
    response_model=OpenAIPricingResponse,
    summary="Update model pricing",
    tags=["LLM Data"]
)
async def update_pricing(
    org_slug: str,
    provider: LLMProvider,
    model_id: str,
    pricing: OpenAIPricingUpdate,
    org: Dict = Depends(get_current_org),
    bq_client: BigQueryClient = Depends(get_bigquery_client)
):
    """Update an existing pricing record in unified table."""
    validate_org_slug(org_slug)
    validate_model_id(model_id)
    check_org_access(org, org_slug)
    provider_value = validate_provider(provider.value)

    try:
        dataset_id = get_org_dataset(org_slug)
        table_id = f"{settings.gcp_project_id}.{dataset_id}.{UNIFIED_PRICING_TABLE}"

        update_fields = []
        query_params = [
            bigquery.ScalarQueryParameter("model_id", "STRING", model_id),
            bigquery.ScalarQueryParameter("provider", "STRING", provider_value)
        ]

        # Core pricing fields
        if pricing.model_name is not None:
            update_fields.append("model_name = @model_name")
            query_params.append(bigquery.ScalarQueryParameter("model_name", "STRING", pricing.model_name))
        if pricing.input_price_per_1k is not None:
            update_fields.append("input_price_per_1k = @input_price")
            query_params.append(bigquery.ScalarQueryParameter("input_price", "FLOAT64", pricing.input_price_per_1k))
        if pricing.output_price_per_1k is not None:
            update_fields.append("output_price_per_1k = @output_price")
            query_params.append(bigquery.ScalarQueryParameter("output_price", "FLOAT64", pricing.output_price_per_1k))
        if pricing.effective_date is not None:
            update_fields.append("effective_date = @effective_date")
            query_params.append(bigquery.ScalarQueryParameter("effective_date", "DATE", str(pricing.effective_date)))
        if pricing.notes is not None:
            update_fields.append("notes = @notes")
            query_params.append(bigquery.ScalarQueryParameter("notes", "STRING", pricing.notes))

        # New V7 fields - pricing type and free tier
        if pricing.pricing_type is not None:
            update_fields.append("pricing_type = @pricing_type")
            query_params.append(bigquery.ScalarQueryParameter("pricing_type", "STRING", pricing.pricing_type.value))
        if pricing.free_tier_input_tokens is not None:
            update_fields.append("free_tier_input_tokens = @free_tier_input_tokens")
            query_params.append(bigquery.ScalarQueryParameter("free_tier_input_tokens", "INT64", pricing.free_tier_input_tokens))
        if pricing.free_tier_output_tokens is not None:
            update_fields.append("free_tier_output_tokens = @free_tier_output_tokens")
            query_params.append(bigquery.ScalarQueryParameter("free_tier_output_tokens", "INT64", pricing.free_tier_output_tokens))
        if pricing.free_tier_reset_frequency is not None:
            update_fields.append("free_tier_reset_frequency = @free_tier_reset_frequency")
            query_params.append(bigquery.ScalarQueryParameter("free_tier_reset_frequency", "STRING", pricing.free_tier_reset_frequency.value))

        # New V7 fields - discount and volume
        if pricing.discount_percentage is not None:
            update_fields.append("discount_percentage = @discount_percentage")
            query_params.append(bigquery.ScalarQueryParameter("discount_percentage", "FLOAT64", pricing.discount_percentage))
        if pricing.discount_reason is not None:
            update_fields.append("discount_reason = @discount_reason")
            query_params.append(bigquery.ScalarQueryParameter("discount_reason", "STRING", pricing.discount_reason.value))
        if pricing.volume_threshold_tokens is not None:
            update_fields.append("volume_threshold_tokens = @volume_threshold_tokens")
            query_params.append(bigquery.ScalarQueryParameter("volume_threshold_tokens", "INT64", pricing.volume_threshold_tokens))
        if pricing.base_input_price_per_1k is not None:
            update_fields.append("base_input_price_per_1k = @base_input_price")
            query_params.append(bigquery.ScalarQueryParameter("base_input_price", "FLOAT64", pricing.base_input_price_per_1k))
        if pricing.base_output_price_per_1k is not None:
            update_fields.append("base_output_price_per_1k = @base_output_price")
            query_params.append(bigquery.ScalarQueryParameter("base_output_price", "FLOAT64", pricing.base_output_price_per_1k))
        if pricing.discounted_input_price_per_1k is not None:
            update_fields.append("discounted_input_price_per_1k = @discounted_input_price")
            query_params.append(bigquery.ScalarQueryParameter("discounted_input_price", "FLOAT64", pricing.discounted_input_price_per_1k))
        if pricing.discounted_output_price_per_1k is not None:
            update_fields.append("discounted_output_price_per_1k = @discounted_output_price")
            query_params.append(bigquery.ScalarQueryParameter("discounted_output_price", "FLOAT64", pricing.discounted_output_price_per_1k))

        if not update_fields:
            raise HTTPException(status_code=400, detail="No fields to update")

        update_fields.append("updated_at = CURRENT_TIMESTAMP()")

        query = f"UPDATE `{table_id}` SET {', '.join(update_fields)} WHERE model_id = @model_id AND provider = @provider"
        job_config = bigquery.QueryJobConfig(
            query_parameters=query_params,
            timeout_ms=30000  # 30 second timeout for user operations
        )
        bq_client.client.query(query, job_config=job_config).result()

        logger.info(f"Updated {provider_value} pricing for model {model_id} in {org_slug}")
        return await get_pricing(org_slug, provider, model_id, org, bq_client)

    except HTTPException:
        raise
    except Exception as e:
        error_msg = str(e)
        logger.error(f"Error updating pricing: {e}", exc_info=True)
        # Handle BigQuery streaming buffer error with user-friendly message
        if "streaming buffer" in error_msg.lower():
            raise HTTPException(
                status_code=409,
                detail="Record was recently inserted and cannot be updated for ~90 minutes. Please wait or delete and recreate."
            )
        raise HTTPException(status_code=500, detail="Failed to update pricing record")


@router.delete(
    "/integrations/{org_slug}/{provider}/pricing/{model_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="Delete model pricing",
    tags=["LLM Data"]
)
async def delete_pricing(
    org_slug: str,
    provider: LLMProvider,
    model_id: str,
    org: Dict = Depends(get_current_org),
    bq_client: BigQueryClient = Depends(get_bigquery_client)
):
    """Delete a pricing record from unified table."""
    validate_org_slug(org_slug)
    validate_model_id(model_id)
    check_org_access(org, org_slug)
    provider_value = validate_provider(provider.value)

    try:
        dataset_id = get_org_dataset(org_slug)
        table_id = f"{settings.gcp_project_id}.{dataset_id}.{UNIFIED_PRICING_TABLE}"

        query = f"DELETE FROM `{table_id}` WHERE model_id = @model_id AND provider = @provider AND org_slug = @org_slug"
        job_config = bigquery.QueryJobConfig(
            query_parameters=[
                bigquery.ScalarQueryParameter("model_id", "STRING", model_id),
                bigquery.ScalarQueryParameter("provider", "STRING", provider_value),
                bigquery.ScalarQueryParameter("org_slug", "STRING", org_slug)
            ],
            timeout_ms=30000  # 30 second timeout for user operations
        )
        bq_client.client.query(query, job_config=job_config).result()
        logger.info(f"Deleted {provider_value} pricing for model {model_id} in {org_slug}")

    except Exception as e:
        error_msg = str(e)
        logger.error(f"Error deleting pricing: {e}", exc_info=True)
        if "streaming buffer" in error_msg.lower():
            raise HTTPException(
                status_code=409,
                detail="Record was recently inserted and cannot be deleted for ~90 minutes. Please wait."
            )
        raise HTTPException(status_code=500, detail="Failed to delete pricing record")


@router.post(
    "/integrations/{org_slug}/{provider}/pricing/reset",
    response_model=OpenAIPricingListResponse,
    summary="Reset pricing to defaults",
    tags=["LLM Data"]
)
async def reset_pricing(
    org_slug: str,
    provider: LLMProvider,
    org: Dict = Depends(get_current_org),
    bq_client: BigQueryClient = Depends(get_bigquery_client)
):
    """Reset all pricing to default values from CSV."""
    validate_org_slug(org_slug)
    check_org_access(org, org_slug)

    try:
        from src.app.routers.integrations import _initialize_llm_pricing
        result = await _initialize_llm_pricing(org_slug, provider.value, force=True)

        if result.get("status") != "SUCCESS":
            raise HTTPException(status_code=500, detail=result.get("error", "Failed to reset pricing"))

        return await list_pricing(org_slug, provider, org, bq_client)

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error resetting {provider} pricing: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail="Failed to reset pricing")


# ============================================
# Bulk Pricing Update Endpoint
# ============================================

from pydantic import BaseModel
from typing import List as ListType

class BulkPricingUpdateItem(BaseModel):
    """Single item in bulk pricing update."""
    model_id: str
    input_price_per_1k: Optional[float] = None
    output_price_per_1k: Optional[float] = None
    model_name: Optional[str] = None
    effective_date: Optional[str] = None
    notes: Optional[str] = None
    # V7 fields
    pricing_type: Optional[str] = None
    free_tier_input_tokens: Optional[int] = None
    free_tier_output_tokens: Optional[int] = None
    free_tier_reset_frequency: Optional[str] = None
    discount_percentage: Optional[float] = None
    discount_reason: Optional[str] = None
    volume_threshold_tokens: Optional[int] = None
    base_input_price_per_1k: Optional[float] = None
    base_output_price_per_1k: Optional[float] = None
    discounted_input_price_per_1k: Optional[float] = None
    discounted_output_price_per_1k: Optional[float] = None


class BulkPricingUpdateRequest(BaseModel):
    """Request for bulk pricing update."""
    updates: ListType[BulkPricingUpdateItem]


class BulkPricingUpdateResponse(BaseModel):
    """Response for bulk pricing update."""
    org_slug: str
    provider: str
    updated_count: int
    failed_count: int
    errors: ListType[str]


@router.patch(
    "/integrations/{org_slug}/{provider}/pricing",
    response_model=BulkPricingUpdateResponse,
    summary="Bulk update model pricing",
    tags=["LLM Data"]
)
async def bulk_update_pricing(
    org_slug: str,
    provider: LLMProvider,
    request: BulkPricingUpdateRequest,
    org: Dict = Depends(get_current_org),
    bq_client: BigQueryClient = Depends(get_bigquery_client)
):
    """
    Update multiple pricing records at once.

    This endpoint allows updating multiple model pricing records in a single request.
    Each item in the updates list should contain model_id and fields to update.
    """
    validate_org_slug(org_slug)
    check_org_access(org, org_slug)
    provider_value = validate_provider(provider.value)

    updated_count = 0
    failed_count = 0
    errors = []

    try:
        dataset_id = get_org_dataset(org_slug)
        table_id = f"{settings.gcp_project_id}.{dataset_id}.{UNIFIED_PRICING_TABLE}"

        for item in request.updates:
            try:
                validate_model_id(item.model_id)

                update_fields = []
                query_params = [
                    bigquery.ScalarQueryParameter("model_id", "STRING", item.model_id),
                    bigquery.ScalarQueryParameter("provider", "STRING", provider_value),
                    bigquery.ScalarQueryParameter("org_slug", "STRING", org_slug)
                ]

                # Core fields
                if item.model_name is not None:
                    update_fields.append("model_name = @model_name")
                    query_params.append(bigquery.ScalarQueryParameter("model_name", "STRING", item.model_name))
                if item.input_price_per_1k is not None:
                    update_fields.append("input_price_per_1k = @input_price")
                    query_params.append(bigquery.ScalarQueryParameter("input_price", "FLOAT64", item.input_price_per_1k))
                if item.output_price_per_1k is not None:
                    update_fields.append("output_price_per_1k = @output_price")
                    query_params.append(bigquery.ScalarQueryParameter("output_price", "FLOAT64", item.output_price_per_1k))
                if item.effective_date is not None:
                    update_fields.append("effective_date = @effective_date")
                    query_params.append(bigquery.ScalarQueryParameter("effective_date", "DATE", item.effective_date))
                if item.notes is not None:
                    update_fields.append("notes = @notes")
                    query_params.append(bigquery.ScalarQueryParameter("notes", "STRING", item.notes))

                # V7 fields - pricing type and free tier
                if item.pricing_type is not None:
                    update_fields.append("pricing_type = @pricing_type")
                    query_params.append(bigquery.ScalarQueryParameter("pricing_type", "STRING", item.pricing_type))
                if item.free_tier_input_tokens is not None:
                    update_fields.append("free_tier_input_tokens = @free_tier_input_tokens")
                    query_params.append(bigquery.ScalarQueryParameter("free_tier_input_tokens", "INT64", item.free_tier_input_tokens))
                if item.free_tier_output_tokens is not None:
                    update_fields.append("free_tier_output_tokens = @free_tier_output_tokens")
                    query_params.append(bigquery.ScalarQueryParameter("free_tier_output_tokens", "INT64", item.free_tier_output_tokens))
                if item.free_tier_reset_frequency is not None:
                    update_fields.append("free_tier_reset_frequency = @free_tier_reset_frequency")
                    query_params.append(bigquery.ScalarQueryParameter("free_tier_reset_frequency", "STRING", item.free_tier_reset_frequency))

                # V7 fields - discount and volume
                if item.discount_percentage is not None:
                    update_fields.append("discount_percentage = @discount_percentage")
                    query_params.append(bigquery.ScalarQueryParameter("discount_percentage", "FLOAT64", item.discount_percentage))
                if item.discount_reason is not None:
                    update_fields.append("discount_reason = @discount_reason")
                    query_params.append(bigquery.ScalarQueryParameter("discount_reason", "STRING", item.discount_reason))
                if item.volume_threshold_tokens is not None:
                    update_fields.append("volume_threshold_tokens = @volume_threshold_tokens")
                    query_params.append(bigquery.ScalarQueryParameter("volume_threshold_tokens", "INT64", item.volume_threshold_tokens))
                if item.base_input_price_per_1k is not None:
                    update_fields.append("base_input_price_per_1k = @base_input_price")
                    query_params.append(bigquery.ScalarQueryParameter("base_input_price", "FLOAT64", item.base_input_price_per_1k))
                if item.base_output_price_per_1k is not None:
                    update_fields.append("base_output_price_per_1k = @base_output_price")
                    query_params.append(bigquery.ScalarQueryParameter("base_output_price", "FLOAT64", item.base_output_price_per_1k))
                if item.discounted_input_price_per_1k is not None:
                    update_fields.append("discounted_input_price_per_1k = @discounted_input_price")
                    query_params.append(bigquery.ScalarQueryParameter("discounted_input_price", "FLOAT64", item.discounted_input_price_per_1k))
                if item.discounted_output_price_per_1k is not None:
                    update_fields.append("discounted_output_price_per_1k = @discounted_output_price")
                    query_params.append(bigquery.ScalarQueryParameter("discounted_output_price", "FLOAT64", item.discounted_output_price_per_1k))

                if not update_fields:
                    errors.append(f"No fields to update for model: {item.model_id}")
                    failed_count += 1
                    continue

                update_fields.append("updated_at = CURRENT_TIMESTAMP()")

                query = f"UPDATE `{table_id}` SET {', '.join(update_fields)} WHERE model_id = @model_id AND provider = @provider AND org_slug = @org_slug"
                job_config = bigquery.QueryJobConfig(
                    query_parameters=query_params,
                    timeout_ms=30000  # 30 second timeout for user operations
                )
                bq_client.client.query(query, job_config=job_config).result()

                updated_count += 1

            except HTTPException as e:
                errors.append(f"Model {item.model_id}: {e.detail}")
                failed_count += 1
            except Exception as e:
                errors.append(f"Model {item.model_id}: {str(e)}")
                failed_count += 1

        logger.info(f"Bulk updated {updated_count} {provider_value} pricing records for {org_slug}, {failed_count} failed")

        return BulkPricingUpdateResponse(
            org_slug=org_slug,
            provider=provider.value,
            updated_count=updated_count,
            failed_count=failed_count,
            errors=errors
        )

    except Exception as e:
        logger.error(f"Error in bulk pricing update: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail="Failed to perform bulk pricing update")


# ============================================
# Subscription Endpoints (All Providers - Unified Table)
# ============================================

@router.get(
    "/integrations/{org_slug}/{provider}/subscriptions",
    response_model=OpenAISubscriptionListResponse,
    summary="List all subscriptions for provider",
    tags=["LLM Data"]
)
async def list_subscriptions(
    org_slug: str,
    provider: LLMProvider,
    include_custom: bool = Query(True, description="Include custom subscription entries"),
    is_enabled: Optional[bool] = Query(None, description="Filter by enabled status"),
    limit: int = 1000,
    offset: int = 0,
    org: Dict = Depends(get_current_org),
    bq_client: BigQueryClient = Depends(get_bigquery_client)
):
    """
    List all subscription records for an organization and provider.

    Uses unified saas_subscriptions table with provider filtering.
    By default includes both provider-specific and custom entries.
    """
    validate_org_slug(org_slug)
    check_org_access(org, org_slug)
    provider_value = validate_provider(provider.value)

    # Validate pagination bounds (lowered from 10000 to 500 for better performance)
    MAX_LIMIT = 500
    if limit < 0 or limit > MAX_LIMIT:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Limit must be between 0 and {MAX_LIMIT}"
        )
    if offset < 0:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Offset must be non-negative"
        )

    try:
        dataset_id = get_org_dataset(org_slug)
        table_id = f"{settings.gcp_project_id}.{dataset_id}.{UNIFIED_SUBSCRIPTIONS_TABLE}"

        # Build WHERE clause for provider filtering
        where_conditions = []
        query_params = [
            bigquery.ScalarQueryParameter("provider", "STRING", provider_value),
            bigquery.ScalarQueryParameter("limit", "INT64", limit),
            bigquery.ScalarQueryParameter("offset", "INT64", offset)
        ]

        if include_custom:
            where_conditions.append("(provider = @provider OR provider = 'custom')")
        else:
            where_conditions.append("provider = @provider")

        if is_enabled is not None:
            where_conditions.append("is_enabled = @is_enabled")
            query_params.append(bigquery.ScalarQueryParameter("is_enabled", "BOOL", is_enabled))

        where_clause = " AND ".join(where_conditions)

        # Explicit column selection for better performance and clarity
        query = f"""
        SELECT
            subscription_id, provider, plan_name, display_name, is_custom,
            quantity, unit_price_usd, yearly_price_usd, yearly_discount_pct,
            billing_period, category, seats, storage_limit_gb,
            monthly_limit, daily_limit, projects_limit, members_limit,
            effective_date, end_date, is_enabled, auth_type, notes,
            x_gemini_project_id, x_gemini_region, x_anthropic_workspace_id, x_openai_org_id,
            tier_type, trial_end_date, trial_credit_usd,
            monthly_token_limit, daily_token_limit, rpm_limit, tpm_limit,
            rpd_limit, tpd_limit, concurrent_limit,
            committed_spend_usd, commitment_term_months, discount_percentage,
            created_at, updated_at
        FROM `{table_id}`
        WHERE {where_clause}
        ORDER BY provider, plan_name
        LIMIT @limit OFFSET @offset
        """

        job_config = bigquery.QueryJobConfig(
            query_parameters=query_params,
            timeout_ms=30000  # 30 second timeout for user queries
        )
        result = bq_client.client.query(query, job_config=job_config).result()
        subscriptions = [dict(row) for row in result]

        return OpenAISubscriptionListResponse(
            org_slug=org_slug,
            provider=provider_value,
            subscriptions=subscriptions,
            count=len(subscriptions)
        )

    except Exception as e:
        logger.error(f"Error listing {provider_value} subscriptions for {org_slug}: {e}", exc_info=True)
        if "Not found" in str(e):
            return OpenAISubscriptionListResponse(org_slug=org_slug, provider=provider_value, subscriptions=[], count=0)
        raise HTTPException(status_code=500, detail="Failed to retrieve subscription data")


@router.get(
    "/integrations/{org_slug}/{provider}/subscriptions/{plan_name}",
    response_model=OpenAISubscriptionResponse,
    summary="Get single subscription",
    tags=["LLM Data"]
)
async def get_subscription(
    org_slug: str,
    provider: LLMProvider,
    plan_name: str,
    org: Dict = Depends(get_current_org),
    bq_client: BigQueryClient = Depends(get_bigquery_client)
):
    """Get a specific subscription record from unified table."""
    validate_org_slug(org_slug)
    validate_plan_name(plan_name)
    check_org_access(org, org_slug)
    provider_value = validate_provider(provider.value)

    try:
        dataset_id = get_org_dataset(org_slug)
        table_id = f"{settings.gcp_project_id}.{dataset_id}.{UNIFIED_SUBSCRIPTIONS_TABLE}"

        # Explicit column selection for better performance
        query = f"""
        SELECT
            subscription_id, provider, plan_name, display_name, is_custom,
            quantity, unit_price_usd, yearly_price_usd, yearly_discount_pct,
            billing_period, category, seats, storage_limit_gb,
            monthly_limit, daily_limit, projects_limit, members_limit,
            effective_date, end_date, is_enabled, auth_type, notes,
            x_gemini_project_id, x_gemini_region, x_anthropic_workspace_id, x_openai_org_id,
            tier_type, trial_end_date, trial_credit_usd,
            monthly_token_limit, daily_token_limit, rpm_limit, tpm_limit,
            rpd_limit, tpd_limit, concurrent_limit,
            committed_spend_usd, commitment_term_months, discount_percentage,
            created_at, updated_at
        FROM `{table_id}`
        WHERE plan_name = @plan_name AND (provider = @provider OR provider = 'custom')
        """

        job_config = bigquery.QueryJobConfig(
            query_parameters=[
                bigquery.ScalarQueryParameter("plan_name", "STRING", plan_name),
                bigquery.ScalarQueryParameter("provider", "STRING", provider_value)
            ]
        )

        result = bq_client.client.query(query, job_config=job_config).result()
        rows = list(result)

        if not rows:
            raise HTTPException(status_code=404, detail=f"Subscription not found for plan: {plan_name}")

        return OpenAISubscriptionResponse(**dict(rows[0]))

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error getting subscription for {plan_name}: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail="Failed to retrieve subscription data")


@router.post(
    "/integrations/{org_slug}/{provider}/subscriptions",
    response_model=OpenAISubscriptionResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Create new subscription",
    tags=["LLM Data"]
)
async def create_subscription(
    org_slug: str,
    provider: LLMProvider,
    subscription: OpenAISubscriptionCreate,
    org: Dict = Depends(get_current_org),
    bq_client: BigQueryClient = Depends(get_bigquery_client)
):
    """Create a new subscription record in unified table."""
    validate_org_slug(org_slug)
    check_org_access(org, org_slug)
    provider_value = validate_provider(provider.value)

    try:
        dataset_id = get_org_dataset(org_slug)
        table_id = f"{settings.gcp_project_id}.{dataset_id}.{UNIFIED_SUBSCRIPTIONS_TABLE}"
        now = datetime.utcnow().isoformat() + "Z"

        # Check if exists for this provider
        check_query = f"SELECT COUNT(*) as cnt FROM `{table_id}` WHERE subscription_id = @subscription_id AND provider = @provider"
        job_config = bigquery.QueryJobConfig(
            query_parameters=[
                bigquery.ScalarQueryParameter("subscription_id", "STRING", subscription.subscription_id),
                bigquery.ScalarQueryParameter("provider", "STRING", provider_value)
            ],
            timeout_ms=10000  # 10 second timeout for auth operations
        )
        result = bq_client.client.query(check_query, job_config=job_config).result()
        if list(result)[0].cnt > 0:
            raise HTTPException(status_code=409, detail=f"Subscription already exists: {subscription.subscription_id}")

        # Determine is_custom: True for all API-created entries
        is_custom = True

        # Use standard INSERT instead of streaming insert to avoid streaming buffer issues
        # Streaming inserts can't be modified/deleted for ~90 minutes
        insert_query = f"""
        INSERT INTO `{table_id}` (
            subscription_id, provider, plan_name, is_custom, quantity, unit_price_usd,
            effective_date, end_date, is_enabled, auth_type, notes,
            x_gemini_project_id, x_gemini_region, x_anthropic_workspace_id, x_openai_org_id,
            tier_type, trial_end_date, trial_credit_usd,
            monthly_token_limit, daily_token_limit, rpm_limit, tpm_limit,
            rpd_limit, tpd_limit, concurrent_limit,
            committed_spend_usd, commitment_term_months, discount_percentage,
            billing_period, yearly_price_usd, yearly_discount_percentage,
            created_at, updated_at
        ) VALUES (
            @subscription_id, @provider, @plan_name, @is_custom, @quantity, @unit_price_usd,
            @effective_date, NULL, TRUE, NULL, @notes,
            NULL, NULL, NULL, NULL,
            @tier_type, @trial_end_date, @trial_credit_usd,
            @monthly_token_limit, @daily_token_limit, @rpm_limit, @tpm_limit,
            @rpd_limit, @tpd_limit, @concurrent_limit,
            @committed_spend_usd, @commitment_term_months, @discount_percentage,
            @billing_period, @yearly_price_usd, @yearly_discount_percentage,
            @created_at, @updated_at
        )
        """
        job_config = bigquery.QueryJobConfig(
            query_parameters=[
                bigquery.ScalarQueryParameter("subscription_id", "STRING", subscription.subscription_id),
                bigquery.ScalarQueryParameter("provider", "STRING", provider_value),
                bigquery.ScalarQueryParameter("plan_name", "STRING", subscription.plan_name),
                bigquery.ScalarQueryParameter("is_custom", "BOOL", is_custom),
                bigquery.ScalarQueryParameter("quantity", "INT64", subscription.quantity),
                bigquery.ScalarQueryParameter("unit_price_usd", "FLOAT64", subscription.unit_price_usd),
                bigquery.ScalarQueryParameter("effective_date", "DATE", str(subscription.effective_date)),
                bigquery.ScalarQueryParameter("notes", "STRING", subscription.notes),
                bigquery.ScalarQueryParameter("tier_type", "STRING", subscription.tier_type.value if subscription.tier_type else "paid"),
                bigquery.ScalarQueryParameter("trial_end_date", "DATE", str(subscription.trial_end_date) if subscription.trial_end_date else None),
                bigquery.ScalarQueryParameter("trial_credit_usd", "FLOAT64", subscription.trial_credit_usd),
                bigquery.ScalarQueryParameter("monthly_token_limit", "INT64", subscription.monthly_token_limit),
                bigquery.ScalarQueryParameter("daily_token_limit", "INT64", subscription.daily_token_limit),
                bigquery.ScalarQueryParameter("rpm_limit", "INT64", subscription.rpm_limit),
                bigquery.ScalarQueryParameter("tpm_limit", "INT64", subscription.tpm_limit),
                bigquery.ScalarQueryParameter("rpd_limit", "INT64", subscription.rpd_limit),
                bigquery.ScalarQueryParameter("tpd_limit", "INT64", subscription.tpd_limit),
                bigquery.ScalarQueryParameter("concurrent_limit", "INT64", subscription.concurrent_limit),
                bigquery.ScalarQueryParameter("committed_spend_usd", "FLOAT64", subscription.committed_spend_usd),
                bigquery.ScalarQueryParameter("commitment_term_months", "INT64", subscription.commitment_term_months),
                bigquery.ScalarQueryParameter("discount_percentage", "FLOAT64", subscription.discount_percentage),
                bigquery.ScalarQueryParameter("billing_period", "STRING", subscription.billing_period.value if subscription.billing_period else "monthly"),
                bigquery.ScalarQueryParameter("yearly_price_usd", "FLOAT64", subscription.yearly_price_usd),
                bigquery.ScalarQueryParameter("yearly_discount_percentage", "FLOAT64", subscription.yearly_discount_percentage),
                bigquery.ScalarQueryParameter("created_at", "TIMESTAMP", now),
                bigquery.ScalarQueryParameter("updated_at", "TIMESTAMP", now),
            ],
            timeout_ms=30000  # 30 second timeout for user operations
        )
        bq_client.client.query(insert_query, job_config=job_config).result()

        logger.info(f"Created {provider_value} subscription {subscription.subscription_id} in {org_slug}")

        return OpenAISubscriptionResponse(
            subscription_id=subscription.subscription_id,
            provider=provider_value,
            plan_name=subscription.plan_name,
            is_custom=is_custom,
            quantity=subscription.quantity,
            unit_price_usd=subscription.unit_price_usd,
            effective_date=subscription.effective_date,
            notes=subscription.notes,
            tier_type=subscription.tier_type.value if subscription.tier_type else "paid",
            trial_end_date=subscription.trial_end_date,
            trial_credit_usd=subscription.trial_credit_usd,
            monthly_token_limit=subscription.monthly_token_limit,
            daily_token_limit=subscription.daily_token_limit,
            rpm_limit=subscription.rpm_limit,
            tpm_limit=subscription.tpm_limit,
            rpd_limit=subscription.rpd_limit,
            tpd_limit=subscription.tpd_limit,
            concurrent_limit=subscription.concurrent_limit,
            committed_spend_usd=subscription.committed_spend_usd,
            commitment_term_months=subscription.commitment_term_months,
            discount_percentage=subscription.discount_percentage,
            billing_period=subscription.billing_period.value if subscription.billing_period else "monthly",
            yearly_price_usd=subscription.yearly_price_usd,
            yearly_discount_percentage=subscription.yearly_discount_percentage,
            created_at=datetime.fromisoformat(now.rstrip("Z")),
            updated_at=datetime.fromisoformat(now.rstrip("Z")),
        )

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error creating subscription: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail="Failed to create subscription record")


@router.put(
    "/integrations/{org_slug}/{provider}/subscriptions/{plan_name}",
    response_model=OpenAISubscriptionResponse,
    summary="Update subscription",
    tags=["LLM Data"]
)
async def update_subscription(
    org_slug: str,
    provider: LLMProvider,
    plan_name: str,
    subscription: OpenAISubscriptionUpdate,
    org: Dict = Depends(get_current_org),
    bq_client: BigQueryClient = Depends(get_bigquery_client)
):
    """Update an existing subscription record in unified table."""
    validate_org_slug(org_slug)
    validate_plan_name(plan_name)
    check_org_access(org, org_slug)
    provider_value = validate_provider(provider.value)

    try:
        dataset_id = get_org_dataset(org_slug)
        table_id = f"{settings.gcp_project_id}.{dataset_id}.{UNIFIED_SUBSCRIPTIONS_TABLE}"

        update_fields = []
        query_params = [
            bigquery.ScalarQueryParameter("plan_name", "STRING", plan_name),
            bigquery.ScalarQueryParameter("provider", "STRING", provider_value)
        ]

        # Core subscription fields
        if subscription.quantity is not None:
            update_fields.append("quantity = @quantity")
            query_params.append(bigquery.ScalarQueryParameter("quantity", "INT64", subscription.quantity))
        if subscription.unit_price_usd is not None:
            update_fields.append("unit_price_usd = @unit_price")
            query_params.append(bigquery.ScalarQueryParameter("unit_price", "FLOAT64", subscription.unit_price_usd))
        if subscription.effective_date is not None:
            update_fields.append("effective_date = @effective_date")
            query_params.append(bigquery.ScalarQueryParameter("effective_date", "DATE", str(subscription.effective_date)))
        if subscription.notes is not None:
            update_fields.append("notes = @notes")
            query_params.append(bigquery.ScalarQueryParameter("notes", "STRING", subscription.notes))

        # New V7 fields - tier type and trial
        if subscription.tier_type is not None:
            update_fields.append("tier_type = @tier_type")
            query_params.append(bigquery.ScalarQueryParameter("tier_type", "STRING", subscription.tier_type.value))
        if subscription.trial_end_date is not None:
            update_fields.append("trial_end_date = @trial_end_date")
            query_params.append(bigquery.ScalarQueryParameter("trial_end_date", "DATE", str(subscription.trial_end_date)))
        if subscription.trial_credit_usd is not None:
            update_fields.append("trial_credit_usd = @trial_credit_usd")
            query_params.append(bigquery.ScalarQueryParameter("trial_credit_usd", "FLOAT64", subscription.trial_credit_usd))

        # New V7 fields - rate limits
        if subscription.monthly_token_limit is not None:
            update_fields.append("monthly_token_limit = @monthly_token_limit")
            query_params.append(bigquery.ScalarQueryParameter("monthly_token_limit", "INT64", subscription.monthly_token_limit))
        if subscription.daily_token_limit is not None:
            update_fields.append("daily_token_limit = @daily_token_limit")
            query_params.append(bigquery.ScalarQueryParameter("daily_token_limit", "INT64", subscription.daily_token_limit))
        if subscription.rpm_limit is not None:
            update_fields.append("rpm_limit = @rpm_limit")
            query_params.append(bigquery.ScalarQueryParameter("rpm_limit", "INT64", subscription.rpm_limit))
        if subscription.tpm_limit is not None:
            update_fields.append("tpm_limit = @tpm_limit")
            query_params.append(bigquery.ScalarQueryParameter("tpm_limit", "INT64", subscription.tpm_limit))
        if subscription.rpd_limit is not None:
            update_fields.append("rpd_limit = @rpd_limit")
            query_params.append(bigquery.ScalarQueryParameter("rpd_limit", "INT64", subscription.rpd_limit))
        if subscription.tpd_limit is not None:
            update_fields.append("tpd_limit = @tpd_limit")
            query_params.append(bigquery.ScalarQueryParameter("tpd_limit", "INT64", subscription.tpd_limit))
        if subscription.concurrent_limit is not None:
            update_fields.append("concurrent_limit = @concurrent_limit")
            query_params.append(bigquery.ScalarQueryParameter("concurrent_limit", "INT64", subscription.concurrent_limit))

        # New V7 fields - commitment and discount
        if subscription.committed_spend_usd is not None:
            update_fields.append("committed_spend_usd = @committed_spend_usd")
            query_params.append(bigquery.ScalarQueryParameter("committed_spend_usd", "FLOAT64", subscription.committed_spend_usd))
        if subscription.commitment_term_months is not None:
            update_fields.append("commitment_term_months = @commitment_term_months")
            query_params.append(bigquery.ScalarQueryParameter("commitment_term_months", "INT64", subscription.commitment_term_months))
        if subscription.discount_percentage is not None:
            update_fields.append("discount_percentage = @discount_percentage")
            query_params.append(bigquery.ScalarQueryParameter("discount_percentage", "FLOAT64", subscription.discount_percentage))

        # Billing period fields
        if subscription.billing_period is not None:
            update_fields.append("billing_period = @billing_period")
            query_params.append(bigquery.ScalarQueryParameter("billing_period", "STRING", subscription.billing_period.value))
        if subscription.yearly_price_usd is not None:
            update_fields.append("yearly_price_usd = @yearly_price_usd")
            query_params.append(bigquery.ScalarQueryParameter("yearly_price_usd", "FLOAT64", subscription.yearly_price_usd))
        if subscription.yearly_discount_percentage is not None:
            update_fields.append("yearly_discount_percentage = @yearly_discount_percentage")
            query_params.append(bigquery.ScalarQueryParameter("yearly_discount_percentage", "FLOAT64", subscription.yearly_discount_percentage))

        if not update_fields:
            raise HTTPException(status_code=400, detail="No fields to update")

        update_fields.append("updated_at = CURRENT_TIMESTAMP()")

        query = f"UPDATE `{table_id}` SET {', '.join(update_fields)} WHERE plan_name = @plan_name AND provider = @provider"
        job_config = bigquery.QueryJobConfig(
            query_parameters=query_params,
            timeout_ms=30000  # 30 second timeout for user operations
        )
        bq_client.client.query(query, job_config=job_config).result()

        logger.info(f"Updated {provider_value} subscription {plan_name} in {org_slug}")
        return await get_subscription(org_slug, provider, plan_name, org, bq_client)

    except HTTPException:
        raise
    except Exception as e:
        error_msg = str(e)
        logger.error(f"Error updating subscription: {e}", exc_info=True)
        # Handle BigQuery streaming buffer error with user-friendly message
        if "streaming buffer" in error_msg.lower():
            raise HTTPException(
                status_code=409,
                detail="Record was recently inserted and cannot be updated for ~90 minutes. Please wait or delete and recreate."
            )
        raise HTTPException(status_code=500, detail="Failed to update subscription record")


@router.delete(
    "/integrations/{org_slug}/{provider}/subscriptions/{plan_name}",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="Delete subscription",
    tags=["LLM Data"]
)
async def delete_subscription(
    org_slug: str,
    provider: LLMProvider,
    plan_name: str,
    org: Dict = Depends(get_current_org),
    bq_client: BigQueryClient = Depends(get_bigquery_client)
):
    """Delete a subscription record from unified table."""
    validate_org_slug(org_slug)
    validate_plan_name(plan_name)
    check_org_access(org, org_slug)
    provider_value = validate_provider(provider.value)

    try:
        dataset_id = get_org_dataset(org_slug)
        table_id = f"{settings.gcp_project_id}.{dataset_id}.{UNIFIED_SUBSCRIPTIONS_TABLE}"

        query = f"DELETE FROM `{table_id}` WHERE plan_name = @plan_name AND provider = @provider"
        job_config = bigquery.QueryJobConfig(
            query_parameters=[
                bigquery.ScalarQueryParameter("plan_name", "STRING", plan_name),
                bigquery.ScalarQueryParameter("provider", "STRING", provider_value)
            ],
            timeout_ms=30000  # 30 second timeout for user operations
        )
        bq_client.client.query(query, job_config=job_config).result()
        logger.info(f"Deleted {provider_value} subscription {plan_name} in {org_slug}")

    except Exception as e:
        error_msg = str(e)
        logger.error(f"Error deleting subscription: {e}", exc_info=True)
        # Handle BigQuery streaming buffer error with user-friendly message
        if "streaming buffer" in error_msg.lower():
            raise HTTPException(
                status_code=409,
                detail="Record was recently inserted and cannot be deleted for ~90 minutes. Please wait."
            )
        raise HTTPException(status_code=500, detail="Failed to delete subscription record")


@router.post(
    "/integrations/{org_slug}/{provider}/subscriptions/reset",
    response_model=OpenAISubscriptionListResponse,
    summary="Reset subscriptions to defaults",
    tags=["LLM Data"]
)
async def reset_subscriptions(
    org_slug: str,
    provider: LLMProvider,
    org: Dict = Depends(get_current_org),
    bq_client: BigQueryClient = Depends(get_bigquery_client)
):
    """Reset all subscriptions to default values from CSV."""
    validate_org_slug(org_slug)
    check_org_access(org, org_slug)

    try:
        from src.app.routers.integrations import _initialize_saas_subscriptions
        result = await _initialize_saas_subscriptions(org_slug, provider.value, force=True)

        if result.get("status") != "SUCCESS":
            raise HTTPException(status_code=500, detail=result.get("error", "Failed to reset subscriptions"))

        # Query the newly reset subscriptions directly instead of calling endpoint
        provider_value = validate_provider(provider.value)
        dataset_id = get_org_dataset(org_slug)
        table_id = f"{settings.gcp_project_id}.{dataset_id}.{UNIFIED_SUBSCRIPTIONS_TABLE}"

        query = f"""
        SELECT
            subscription_id, provider, plan_name, display_name, is_custom,
            quantity, unit_price_usd, yearly_price_usd, yearly_discount_pct,
            billing_period, category, seats, storage_limit_gb,
            monthly_limit, daily_limit, projects_limit, members_limit,
            effective_date, end_date, is_enabled, auth_type, notes,
            x_gemini_project_id, x_gemini_region, x_anthropic_workspace_id, x_openai_org_id,
            tier_type, trial_end_date, trial_credit_usd,
            monthly_token_limit, daily_token_limit, rpm_limit, tpm_limit,
            rpd_limit, tpd_limit, concurrent_limit,
            committed_spend_usd, commitment_term_months, discount_percentage,
            created_at, updated_at
        FROM `{table_id}`
        WHERE provider = @provider OR provider = 'custom'
        ORDER BY provider, plan_name
        LIMIT 1000
        """
        job_config = bigquery.QueryJobConfig(
            query_parameters=[
                bigquery.ScalarQueryParameter("provider", "STRING", provider_value)
            ],
            timeout_ms=30000  # 30 second timeout for user queries
        )
        query_result = bq_client.client.query(query, job_config=job_config).result()

        subscriptions = []
        for row in query_result:
            subscriptions.append({
                "subscription_id": row.get("subscription_id"),
                "provider": row.get("provider"),
                "plan_name": row.get("plan_name"),
                "is_custom": row.get("is_custom", False),
                "quantity": row.get("quantity", 0),
                "unit_price_usd": float(row.get("unit_price_usd", 0)),
                "effective_date": str(row.get("effective_date")) if row.get("effective_date") else None,
                "end_date": str(row.get("end_date")) if row.get("end_date") else None,
                "is_enabled": row.get("is_enabled", True),
                "auth_type": row.get("auth_type"),
                "notes": row.get("notes"),
                "tier_type": row.get("tier_type", "paid"),
                "trial_end_date": str(row.get("trial_end_date")) if row.get("trial_end_date") else None,
                "trial_credit_usd": float(row.get("trial_credit_usd")) if row.get("trial_credit_usd") else None,
                "monthly_token_limit": row.get("monthly_token_limit"),
                "daily_token_limit": row.get("daily_token_limit"),
                "rpm_limit": row.get("rpm_limit"),
                "tpm_limit": row.get("tpm_limit"),
                "rpd_limit": row.get("rpd_limit"),
                "tpd_limit": row.get("tpd_limit"),
                "concurrent_limit": row.get("concurrent_limit"),
                "committed_spend_usd": float(row.get("committed_spend_usd")) if row.get("committed_spend_usd") else None,
                "commitment_term_months": row.get("commitment_term_months"),
                "discount_percentage": float(row.get("discount_percentage")) if row.get("discount_percentage") else None,
                "billing_period": row.get("billing_period", "pay_as_you_go"),
                "yearly_price_usd": float(row.get("yearly_price_usd")) if row.get("yearly_price_usd") else None,
                "yearly_discount_percentage": float(row.get("yearly_discount_percentage")) if row.get("yearly_discount_percentage") else None,
                "created_at": row.get("created_at").isoformat() if row.get("created_at") else None,
                "updated_at": row.get("updated_at").isoformat() if row.get("updated_at") else None,
            })

        return {
            "org_slug": org_slug,
            "provider": provider_value,
            "subscriptions": subscriptions,
            "count": len(subscriptions)
        }

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error resetting {provider} subscriptions: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail="Failed to reset subscriptions")
