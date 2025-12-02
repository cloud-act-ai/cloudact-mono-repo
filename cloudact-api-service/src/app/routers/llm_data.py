"""
LLM Provider Data CRUD API Routes

Generic endpoints for managing pricing and subscription data for all LLM providers.
Uses unified tables (llm_subscriptions, llm_model_pricing) with provider column filtering.

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
UNIFIED_SUBSCRIPTIONS_TABLE = "llm_subscriptions"
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

    # Validate pagination bounds
    MAX_LIMIT = 10000
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

        query = f"""
        SELECT
            pricing_id,
            provider,
            model_id,
            model_name,
            is_custom,
            input_price_per_1k,
            output_price_per_1k,
            effective_date,
            end_date,
            is_enabled,
            notes,
            x_gemini_context_window,
            x_gemini_region,
            x_anthropic_tier,
            x_openai_batch_input_price,
            x_openai_batch_output_price,
            created_at,
            updated_at
        FROM `{table_id}`
        WHERE {where_clause}
        ORDER BY provider, model_id
        LIMIT @limit OFFSET @offset
        """

        job_config = bigquery.QueryJobConfig(query_parameters=query_params)
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

        query = f"""
        SELECT pricing_id, provider, model_id, model_name, is_custom,
               input_price_per_1k, output_price_per_1k,
               effective_date, end_date, is_enabled, notes,
               x_gemini_context_window, x_gemini_region, x_anthropic_tier,
               x_openai_batch_input_price, x_openai_batch_output_price,
               created_at, updated_at
        FROM `{table_id}`
        WHERE model_id = @model_id AND (provider = @provider OR provider = 'custom')
        """

        job_config = bigquery.QueryJobConfig(
            query_parameters=[
                bigquery.ScalarQueryParameter("model_id", "STRING", model_id),
                bigquery.ScalarQueryParameter("provider", "STRING", provider_value)
            ]
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
            ]
        )
        result = bq_client.client.query(check_query, job_config=job_config).result()
        if list(result)[0].cnt > 0:
            raise HTTPException(status_code=409, detail=f"Pricing already exists for model: {pricing.model_id}")

        # Generate pricing_id
        pricing_id = f"price_{provider_value}_{pricing.model_id.replace('-', '_').replace('.', '_')}"

        row = {
            "pricing_id": pricing_id,
            "provider": provider_value,
            "model_id": pricing.model_id,
            "model_name": pricing.model_name,
            "is_custom": provider_value == "custom",
            "input_price_per_1k": pricing.input_price_per_1k,
            "output_price_per_1k": pricing.output_price_per_1k,
            "effective_date": str(pricing.effective_date),
            "end_date": None,
            "is_enabled": True,
            "notes": pricing.notes,
            "x_gemini_context_window": None,
            "x_gemini_region": None,
            "x_anthropic_tier": None,
            "x_openai_batch_input_price": None,
            "x_openai_batch_output_price": None,
            "created_at": now,
            "updated_at": now,
        }

        errors = bq_client.client.insert_rows_json(table_id, [row])
        if errors:
            logger.error(f"Insert errors: {errors}")
            raise HTTPException(status_code=500, detail="Failed to create pricing record")

        logger.info(f"Created {provider_value} pricing for model {pricing.model_id} in {org_slug}")

        return OpenAIPricingResponse(
            model_id=pricing.model_id,
            model_name=pricing.model_name,
            input_price_per_1k=pricing.input_price_per_1k,
            output_price_per_1k=pricing.output_price_per_1k,
            effective_date=pricing.effective_date,
            notes=pricing.notes,
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

        if not update_fields:
            raise HTTPException(status_code=400, detail="No fields to update")

        update_fields.append("updated_at = CURRENT_TIMESTAMP()")

        query = f"UPDATE `{table_id}` SET {', '.join(update_fields)} WHERE model_id = @model_id AND provider = @provider"
        job_config = bigquery.QueryJobConfig(query_parameters=query_params)
        bq_client.client.query(query, job_config=job_config).result()

        logger.info(f"Updated {provider_value} pricing for model {model_id} in {org_slug}")
        return await get_pricing(org_slug, provider, model_id, org, bq_client)

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error updating pricing: {e}", exc_info=True)
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

        query = f"DELETE FROM `{table_id}` WHERE model_id = @model_id AND provider = @provider"
        job_config = bigquery.QueryJobConfig(
            query_parameters=[
                bigquery.ScalarQueryParameter("model_id", "STRING", model_id),
                bigquery.ScalarQueryParameter("provider", "STRING", provider_value)
            ]
        )
        bq_client.client.query(query, job_config=job_config).result()
        logger.info(f"Deleted {provider_value} pricing for model {model_id} in {org_slug}")

    except Exception as e:
        logger.error(f"Error deleting pricing: {e}", exc_info=True)
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
                    bigquery.ScalarQueryParameter("provider", "STRING", provider_value)
                ]

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

                if not update_fields:
                    errors.append(f"No fields to update for model: {item.model_id}")
                    failed_count += 1
                    continue

                update_fields.append("updated_at = CURRENT_TIMESTAMP()")

                query = f"UPDATE `{table_id}` SET {', '.join(update_fields)} WHERE model_id = @model_id AND provider = @provider"
                job_config = bigquery.QueryJobConfig(query_parameters=query_params)
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

    Uses unified llm_subscriptions table with provider filtering.
    By default includes both provider-specific and custom entries.
    """
    validate_org_slug(org_slug)
    check_org_access(org, org_slug)
    provider_value = validate_provider(provider.value)

    # Validate pagination bounds
    MAX_LIMIT = 10000
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

        query = f"""
        SELECT
            subscription_id,
            provider,
            plan_name,
            is_custom,
            quantity,
            unit_price_usd,
            effective_date,
            end_date,
            is_enabled,
            auth_type,
            notes,
            x_gemini_project_id,
            x_gemini_region,
            x_anthropic_workspace_id,
            x_openai_org_id,
            created_at,
            updated_at
        FROM `{table_id}`
        WHERE {where_clause}
        ORDER BY provider, plan_name
        LIMIT @limit OFFSET @offset
        """

        job_config = bigquery.QueryJobConfig(query_parameters=query_params)
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

        query = f"""
        SELECT subscription_id, provider, plan_name, is_custom, quantity, unit_price_usd,
               effective_date, end_date, is_enabled, auth_type, notes,
               x_gemini_project_id, x_gemini_region, x_anthropic_workspace_id, x_openai_org_id,
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
            ]
        )
        result = bq_client.client.query(check_query, job_config=job_config).result()
        if list(result)[0].cnt > 0:
            raise HTTPException(status_code=409, detail=f"Subscription already exists: {subscription.subscription_id}")

        row = {
            "subscription_id": subscription.subscription_id,
            "provider": provider_value,
            "plan_name": subscription.plan_name,
            "is_custom": provider_value == "custom",
            "quantity": subscription.quantity,
            "unit_price_usd": subscription.unit_price_usd,
            "effective_date": str(subscription.effective_date),
            "end_date": None,
            "is_enabled": True,
            "auth_type": None,
            "notes": subscription.notes,
            "x_gemini_project_id": None,
            "x_gemini_region": None,
            "x_anthropic_workspace_id": None,
            "x_openai_org_id": None,
            "created_at": now,
            "updated_at": now,
        }

        errors = bq_client.client.insert_rows_json(table_id, [row])
        if errors:
            logger.error(f"Insert errors: {errors}")
            raise HTTPException(status_code=500, detail="Failed to create subscription record")

        logger.info(f"Created {provider_value} subscription {subscription.subscription_id} in {org_slug}")

        return OpenAISubscriptionResponse(
            subscription_id=subscription.subscription_id,
            plan_name=subscription.plan_name,
            quantity=subscription.quantity,
            unit_price_usd=subscription.unit_price_usd,
            effective_date=subscription.effective_date,
            notes=subscription.notes,
            created_at=datetime.fromisoformat(now),
            updated_at=datetime.fromisoformat(now),
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

        if not update_fields:
            raise HTTPException(status_code=400, detail="No fields to update")

        update_fields.append("updated_at = CURRENT_TIMESTAMP()")

        query = f"UPDATE `{table_id}` SET {', '.join(update_fields)} WHERE plan_name = @plan_name AND provider = @provider"
        job_config = bigquery.QueryJobConfig(query_parameters=query_params)
        bq_client.client.query(query, job_config=job_config).result()

        logger.info(f"Updated {provider_value} subscription {plan_name} in {org_slug}")
        return await get_subscription(org_slug, provider, plan_name, org, bq_client)

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error updating subscription: {e}", exc_info=True)
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
            ]
        )
        bq_client.client.query(query, job_config=job_config).result()
        logger.info(f"Deleted {provider_value} subscription {plan_name} in {org_slug}")

    except Exception as e:
        logger.error(f"Error deleting subscription: {e}", exc_info=True)
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
        from src.app.routers.integrations import _initialize_llm_subscriptions
        result = await _initialize_llm_subscriptions(org_slug, provider.value, force=True)

        if result.get("status") != "SUCCESS":
            raise HTTPException(status_code=500, detail=result.get("error", "Failed to reset subscriptions"))

        return await list_subscriptions(org_slug, provider, org, bq_client)

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error resetting {provider} subscriptions: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail="Failed to reset subscriptions")
