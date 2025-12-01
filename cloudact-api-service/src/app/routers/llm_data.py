"""
LLM Provider Data CRUD API Routes

Generic endpoints for managing pricing and subscription data for all LLM providers.
Provider configuration is loaded from configs/system/providers.yml.
To add a new LLM provider: just update providers.yml with data_tables config.

URL Structure: /api/v1/integrations/{org_slug}/{provider}/pricing|subscriptions
"""

from fastapi import APIRouter, Depends, HTTPException, status
from typing import Dict, List, Optional
from datetime import datetime
from enum import Enum
import logging
import re

from google.cloud import bigquery

from src.core.engine.bq_client import get_bigquery_client, BigQueryClient
from src.app.dependencies.auth import get_current_org
from src.app.config import get_settings
from src.core.providers import provider_registry
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
# Provider Configuration (from providers.yml)
# ============================================

def _get_llm_providers_enum():
    """Dynamically build LLMProvider enum from registry."""
    llm_providers = provider_registry.get_llm_providers()
    return Enum('LLMProvider', {p.lower(): p.lower() for p in llm_providers}, type=str)

# Create dynamic enum from config
LLMProvider = _get_llm_providers_enum()


def get_provider_config(provider: str) -> Dict:
    """Get configuration for a provider from registry."""
    provider_upper = provider.upper()

    # Check if it's a valid LLM provider with data tables
    if not provider_registry.is_llm_provider(provider_upper):
        supported = provider_registry.get_llm_providers()
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Unsupported LLM provider: {provider}. Supported: {[p.lower() for p in supported]}"
        )

    if not provider_registry.has_data_tables(provider_upper):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Provider {provider} does not have data tables configured"
        )

    # Build config from registry
    return {
        "pricing_table": provider_registry.get_pricing_table(provider_upper),
        "subscriptions_table": provider_registry.get_subscriptions_table(provider_upper),
        "seed_path": provider_registry.get_seed_path(provider_upper),
    }


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
# Pricing Endpoints (All Providers)
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
    limit: int = 1000,
    offset: int = 0,
    org: Dict = Depends(get_current_org),
    bq_client: BigQueryClient = Depends(get_bigquery_client)
):
    """List all model pricing for an organization and provider."""
    validate_org_slug(org_slug)
    check_org_access(org, org_slug)
    config = get_provider_config(provider.value)

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
        table_id = f"{settings.gcp_project_id}.{dataset_id}.{config['pricing_table']}"

        query = f"""
        SELECT
            model_id,
            model_name,
            input_price_per_1k,
            output_price_per_1k,
            effective_date,
            notes,
            created_at,
            updated_at
        FROM `{table_id}`
        ORDER BY model_id
        LIMIT @limit OFFSET @offset
        """

        job_config = bigquery.QueryJobConfig(
            query_parameters=[
                bigquery.ScalarQueryParameter("limit", "INT64", limit),
                bigquery.ScalarQueryParameter("offset", "INT64", offset)
            ]
        )

        result = bq_client.client.query(query, job_config=job_config).result()
        pricing = [dict(row) for row in result]

        return OpenAIPricingListResponse(
            org_slug=org_slug,
            pricing=pricing,
            count=len(pricing)
        )

    except Exception as e:
        logger.error(f"Error listing {provider} pricing for {org_slug}: {e}", exc_info=True)
        if "Not found" in str(e):
            return OpenAIPricingListResponse(org_slug=org_slug, pricing=[], count=0)
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
    """Get pricing for a specific model."""
    validate_org_slug(org_slug)
    validate_model_id(model_id)
    check_org_access(org, org_slug)
    config = get_provider_config(provider.value)

    try:
        dataset_id = get_org_dataset(org_slug)
        table_id = f"{settings.gcp_project_id}.{dataset_id}.{config['pricing_table']}"

        query = f"""
        SELECT model_id, model_name, input_price_per_1k, output_price_per_1k,
               effective_date, notes, created_at, updated_at
        FROM `{table_id}`
        WHERE model_id = @model_id
        """

        job_config = bigquery.QueryJobConfig(
            query_parameters=[bigquery.ScalarQueryParameter("model_id", "STRING", model_id)]
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
    """Create a new pricing record for a model."""
    validate_org_slug(org_slug)
    check_org_access(org, org_slug)
    config = get_provider_config(provider.value)

    try:
        dataset_id = get_org_dataset(org_slug)
        table_id = f"{settings.gcp_project_id}.{dataset_id}.{config['pricing_table']}"
        now = datetime.utcnow().isoformat()

        # Check if exists
        check_query = f"SELECT COUNT(*) as cnt FROM `{table_id}` WHERE model_id = @model_id"
        job_config = bigquery.QueryJobConfig(
            query_parameters=[bigquery.ScalarQueryParameter("model_id", "STRING", pricing.model_id)]
        )
        result = bq_client.client.query(check_query, job_config=job_config).result()
        if list(result)[0].cnt > 0:
            raise HTTPException(status_code=409, detail=f"Pricing already exists for model: {pricing.model_id}")

        row = {
            "model_id": pricing.model_id,
            "model_name": pricing.model_name,
            "input_price_per_1k": pricing.input_price_per_1k,
            "output_price_per_1k": pricing.output_price_per_1k,
            "effective_date": str(pricing.effective_date),
            "notes": pricing.notes,
            "created_at": now,
            "updated_at": now,
        }

        errors = bq_client.client.insert_rows_json(table_id, [row])
        if errors:
            raise HTTPException(status_code=500, detail="Failed to create pricing record")

        logger.info(f"Created {provider} pricing for model {pricing.model_id} in {org_slug}")

        return OpenAIPricingResponse(
            model_id=pricing.model_id,
            model_name=pricing.model_name,
            input_price_per_1k=pricing.input_price_per_1k,
            output_price_per_1k=pricing.output_price_per_1k,
            effective_date=pricing.effective_date,
            notes=pricing.notes,
            created_at=datetime.fromisoformat(now),
            updated_at=datetime.fromisoformat(now),
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
    """Update an existing pricing record."""
    validate_org_slug(org_slug)
    validate_model_id(model_id)
    check_org_access(org, org_slug)
    config = get_provider_config(provider.value)

    try:
        dataset_id = get_org_dataset(org_slug)
        table_id = f"{settings.gcp_project_id}.{dataset_id}.{config['pricing_table']}"

        update_fields = []
        query_params = [bigquery.ScalarQueryParameter("model_id", "STRING", model_id)]

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

        query = f"UPDATE `{table_id}` SET {', '.join(update_fields)} WHERE model_id = @model_id"
        job_config = bigquery.QueryJobConfig(query_parameters=query_params)
        bq_client.client.query(query, job_config=job_config).result()

        logger.info(f"Updated {provider} pricing for model {model_id} in {org_slug}")
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
    """Delete a pricing record."""
    validate_org_slug(org_slug)
    validate_model_id(model_id)
    check_org_access(org, org_slug)
    config = get_provider_config(provider.value)

    try:
        dataset_id = get_org_dataset(org_slug)
        table_id = f"{settings.gcp_project_id}.{dataset_id}.{config['pricing_table']}"

        query = f"DELETE FROM `{table_id}` WHERE model_id = @model_id"
        job_config = bigquery.QueryJobConfig(
            query_parameters=[bigquery.ScalarQueryParameter("model_id", "STRING", model_id)]
        )
        bq_client.client.query(query, job_config=job_config).result()
        logger.info(f"Deleted {provider} pricing for model {model_id} in {org_slug}")

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
# Subscription Endpoints (All Providers)
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
    limit: int = 1000,
    offset: int = 0,
    org: Dict = Depends(get_current_org),
    bq_client: BigQueryClient = Depends(get_bigquery_client)
):
    """List all subscription records for an organization and provider."""
    validate_org_slug(org_slug)
    check_org_access(org, org_slug)
    config = get_provider_config(provider.value)

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
        table_id = f"{settings.gcp_project_id}.{dataset_id}.{config['subscriptions_table']}"

        query = f"""
        SELECT subscription_id, plan_name, quantity, unit_price_usd,
               effective_date, notes, created_at, updated_at
        FROM `{table_id}`
        ORDER BY plan_name
        LIMIT @limit OFFSET @offset
        """

        job_config = bigquery.QueryJobConfig(
            query_parameters=[
                bigquery.ScalarQueryParameter("limit", "INT64", limit),
                bigquery.ScalarQueryParameter("offset", "INT64", offset)
            ]
        )

        result = bq_client.client.query(query, job_config=job_config).result()
        subscriptions = [dict(row) for row in result]

        return OpenAISubscriptionListResponse(
            org_slug=org_slug,
            subscriptions=subscriptions,
            count=len(subscriptions)
        )

    except Exception as e:
        logger.error(f"Error listing {provider} subscriptions for {org_slug}: {e}", exc_info=True)
        if "Not found" in str(e):
            return OpenAISubscriptionListResponse(org_slug=org_slug, subscriptions=[], count=0)
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
    """Get a specific subscription record."""
    validate_org_slug(org_slug)
    validate_plan_name(plan_name)
    check_org_access(org, org_slug)
    config = get_provider_config(provider.value)

    try:
        dataset_id = get_org_dataset(org_slug)
        table_id = f"{settings.gcp_project_id}.{dataset_id}.{config['subscriptions_table']}"

        query = f"""
        SELECT subscription_id, plan_name, quantity, unit_price_usd,
               effective_date, notes, created_at, updated_at
        FROM `{table_id}`
        WHERE plan_name = @plan_name
        """

        job_config = bigquery.QueryJobConfig(
            query_parameters=[bigquery.ScalarQueryParameter("plan_name", "STRING", plan_name)]
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
    """Create a new subscription record."""
    validate_org_slug(org_slug)
    check_org_access(org, org_slug)
    config = get_provider_config(provider.value)

    try:
        dataset_id = get_org_dataset(org_slug)
        table_id = f"{settings.gcp_project_id}.{dataset_id}.{config['subscriptions_table']}"
        now = datetime.utcnow().isoformat()

        # Check if exists
        check_query = f"SELECT COUNT(*) as cnt FROM `{table_id}` WHERE subscription_id = @subscription_id"
        job_config = bigquery.QueryJobConfig(
            query_parameters=[bigquery.ScalarQueryParameter("subscription_id", "STRING", subscription.subscription_id)]
        )
        result = bq_client.client.query(check_query, job_config=job_config).result()
        if list(result)[0].cnt > 0:
            raise HTTPException(status_code=409, detail=f"Subscription already exists: {subscription.subscription_id}")

        row = {
            "subscription_id": subscription.subscription_id,
            "plan_name": subscription.plan_name,
            "quantity": subscription.quantity,
            "unit_price_usd": subscription.unit_price_usd,
            "effective_date": str(subscription.effective_date),
            "notes": subscription.notes,
            "created_at": now,
            "updated_at": now,
        }

        errors = bq_client.client.insert_rows_json(table_id, [row])
        if errors:
            raise HTTPException(status_code=500, detail="Failed to create subscription record")

        logger.info(f"Created {provider} subscription {subscription.subscription_id} in {org_slug}")

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
    """Update an existing subscription record."""
    validate_org_slug(org_slug)
    validate_plan_name(plan_name)
    check_org_access(org, org_slug)
    config = get_provider_config(provider.value)

    try:
        dataset_id = get_org_dataset(org_slug)
        table_id = f"{settings.gcp_project_id}.{dataset_id}.{config['subscriptions_table']}"

        update_fields = []
        query_params = [bigquery.ScalarQueryParameter("plan_name", "STRING", plan_name)]

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

        query = f"UPDATE `{table_id}` SET {', '.join(update_fields)} WHERE plan_name = @plan_name"
        job_config = bigquery.QueryJobConfig(query_parameters=query_params)
        bq_client.client.query(query, job_config=job_config).result()

        logger.info(f"Updated {provider} subscription {plan_name} in {org_slug}")
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
    """Delete a subscription record."""
    validate_org_slug(org_slug)
    validate_plan_name(plan_name)
    check_org_access(org, org_slug)
    config = get_provider_config(provider.value)

    try:
        dataset_id = get_org_dataset(org_slug)
        table_id = f"{settings.gcp_project_id}.{dataset_id}.{config['subscriptions_table']}"

        query = f"DELETE FROM `{table_id}` WHERE plan_name = @plan_name"
        job_config = bigquery.QueryJobConfig(
            query_parameters=[bigquery.ScalarQueryParameter("plan_name", "STRING", plan_name)]
        )
        bq_client.client.query(query, job_config=job_config).result()
        logger.info(f"Deleted {provider} subscription {plan_name} in {org_slug}")

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
