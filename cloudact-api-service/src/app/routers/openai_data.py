"""
OpenAI Data CRUD API Routes

Endpoints for managing OpenAI pricing and subscription data per organization.
- Pricing: Model pricing for cost calculation
- Subscriptions: OpenAI subscription plans

URL Structure: /api/v1/integrations/{org_slug}/openai/pricing|subscriptions
"""

from fastapi import APIRouter, Depends, HTTPException, status
from typing import Dict, List
from datetime import datetime
import logging
import re

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


# ============================================
# Pricing Endpoints
# ============================================

@router.get(
    "/integrations/{org_slug}/openai/pricing",
    response_model=OpenAIPricingListResponse,
    summary="List all OpenAI model pricing",
    description="Returns all model pricing records for the organization"
)
async def list_pricing(
    org_slug: str,
    org: Dict = Depends(get_current_org),
    bq_client: BigQueryClient = Depends(get_bigquery_client)
):
    """List all OpenAI model pricing for an organization."""
    validate_org_slug(org_slug)

    if not settings.disable_auth and org["org_slug"] != org_slug:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Cannot access pricing for another organization"
        )

    try:
        dataset_id = get_org_dataset(org_slug)
        table_id = f"{settings.gcp_project_id}.{dataset_id}.openai_model_pricing"

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
        """

        result = bq_client.client.query(query).result()
        pricing = [dict(row) for row in result]

        return OpenAIPricingListResponse(
            org_slug=org_slug,
            pricing=pricing,
            count=len(pricing)
        )

    except Exception as e:
        logger.error(f"Error listing pricing for {org_slug}: {e}", exc_info=True)
        if "Not found" in str(e):
            return OpenAIPricingListResponse(
                org_slug=org_slug,
                pricing=[],
                count=0
            )
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to retrieve pricing data"
        )


@router.get(
    "/integrations/{org_slug}/openai/pricing/{model_id}",
    response_model=OpenAIPricingResponse,
    summary="Get single model pricing"
)
async def get_pricing(
    org_slug: str,
    model_id: str,
    org: Dict = Depends(get_current_org),
    bq_client: BigQueryClient = Depends(get_bigquery_client)
):
    """Get pricing for a specific model."""
    validate_org_slug(org_slug)
    validate_model_id(model_id)

    if not settings.disable_auth and org["org_slug"] != org_slug:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Cannot access pricing for another organization"
        )

    try:
        dataset_id = get_org_dataset(org_slug)
        table_id = f"{settings.gcp_project_id}.{dataset_id}.openai_model_pricing"

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
        WHERE model_id = @model_id
        """

        job_config = bigquery.QueryJobConfig(
            query_parameters=[
                bigquery.ScalarQueryParameter("model_id", "STRING", model_id),
            ]
        )

        result = bq_client.client.query(query, job_config=job_config).result()
        rows = list(result)

        if not rows:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Pricing not found for model: {model_id}"
            )

        return OpenAIPricingResponse(**dict(rows[0]))

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error getting pricing for {model_id}: {e}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to retrieve pricing data"
        )


@router.post(
    "/integrations/{org_slug}/openai/pricing",
    response_model=OpenAIPricingResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Create new model pricing"
)
async def create_pricing(
    org_slug: str,
    pricing: OpenAIPricingCreate,
    org: Dict = Depends(get_current_org),
    bq_client: BigQueryClient = Depends(get_bigquery_client)
):
    """Create a new pricing record for a model."""
    validate_org_slug(org_slug)

    if not settings.disable_auth and org["org_slug"] != org_slug:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Cannot create pricing for another organization"
        )

    try:
        dataset_id = get_org_dataset(org_slug)
        table_id = f"{settings.gcp_project_id}.{dataset_id}.openai_model_pricing"
        now = datetime.utcnow().isoformat()

        # Check if model_id already exists
        check_query = f"""
        SELECT COUNT(*) as cnt FROM `{table_id}` WHERE model_id = @model_id
        """
        job_config = bigquery.QueryJobConfig(
            query_parameters=[
                bigquery.ScalarQueryParameter("model_id", "STRING", pricing.model_id),
            ]
        )
        result = bq_client.client.query(check_query, job_config=job_config).result()
        if list(result)[0].cnt > 0:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail=f"Pricing already exists for model: {pricing.model_id}"
            )

        # Insert new record
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
            logger.error(f"Failed to insert pricing: {errors}")
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail="Failed to create pricing record"
            )

        logger.info(f"Created pricing for model {pricing.model_id} in {org_slug}")

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
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to create pricing record"
        )


@router.put(
    "/integrations/{org_slug}/openai/pricing/{model_id}",
    response_model=OpenAIPricingResponse,
    summary="Update model pricing"
)
async def update_pricing(
    org_slug: str,
    model_id: str,
    pricing: OpenAIPricingUpdate,
    org: Dict = Depends(get_current_org),
    bq_client: BigQueryClient = Depends(get_bigquery_client)
):
    """Update an existing pricing record."""
    validate_org_slug(org_slug)
    validate_model_id(model_id)

    if not settings.disable_auth and org["org_slug"] != org_slug:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Cannot update pricing for another organization"
        )

    try:
        dataset_id = get_org_dataset(org_slug)
        table_id = f"{settings.gcp_project_id}.{dataset_id}.openai_model_pricing"

        # Build update query dynamically
        update_fields = []
        query_params = [
            bigquery.ScalarQueryParameter("model_id", "STRING", model_id),
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
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="No fields to update"
            )

        update_fields.append("updated_at = CURRENT_TIMESTAMP()")

        query = f"""
        UPDATE `{table_id}`
        SET {', '.join(update_fields)}
        WHERE model_id = @model_id
        """

        job_config = bigquery.QueryJobConfig(query_parameters=query_params)
        result = bq_client.client.query(query, job_config=job_config).result()

        logger.info(f"Updated pricing for model {model_id} in {org_slug}")

        # Fetch updated record
        return await get_pricing(org_slug, model_id, org, bq_client)

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error updating pricing: {e}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to update pricing record"
        )


@router.delete(
    "/integrations/{org_slug}/openai/pricing/{model_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="Delete model pricing"
)
async def delete_pricing(
    org_slug: str,
    model_id: str,
    org: Dict = Depends(get_current_org),
    bq_client: BigQueryClient = Depends(get_bigquery_client)
):
    """Delete a pricing record."""
    validate_org_slug(org_slug)
    validate_model_id(model_id)

    if not settings.disable_auth and org["org_slug"] != org_slug:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Cannot delete pricing for another organization"
        )

    try:
        dataset_id = get_org_dataset(org_slug)
        table_id = f"{settings.gcp_project_id}.{dataset_id}.openai_model_pricing"

        query = f"""
        DELETE FROM `{table_id}`
        WHERE model_id = @model_id
        """

        job_config = bigquery.QueryJobConfig(
            query_parameters=[
                bigquery.ScalarQueryParameter("model_id", "STRING", model_id),
            ]
        )

        bq_client.client.query(query, job_config=job_config).result()
        logger.info(f"Deleted pricing for model {model_id} in {org_slug}")

    except Exception as e:
        logger.error(f"Error deleting pricing: {e}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to delete pricing record"
        )


@router.post(
    "/integrations/{org_slug}/openai/pricing/reset",
    response_model=OpenAIPricingListResponse,
    summary="Reset pricing to defaults"
)
async def reset_pricing(
    org_slug: str,
    org: Dict = Depends(get_current_org),
    bq_client: BigQueryClient = Depends(get_bigquery_client)
):
    """Reset all pricing to default values from CSV."""
    validate_org_slug(org_slug)

    if not settings.disable_auth and org["org_slug"] != org_slug:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Cannot reset pricing for another organization"
        )

    try:
        from src.app.routers.integrations import _initialize_openai_pricing

        # Re-initialize with force=True to delete and re-insert
        result = await _initialize_openai_pricing(org_slug, force=True)

        if result.get("status") != "SUCCESS":
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail=result.get("error", "Failed to reset pricing")
            )

        # Return the new pricing list
        return await list_pricing(org_slug, org, bq_client)

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error resetting pricing: {e}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to reset pricing"
        )


# ============================================
# Subscription Endpoints
# ============================================

@router.get(
    "/integrations/{org_slug}/openai/subscriptions",
    response_model=OpenAISubscriptionListResponse,
    summary="List all OpenAI subscriptions"
)
async def list_subscriptions(
    org_slug: str,
    org: Dict = Depends(get_current_org),
    bq_client: BigQueryClient = Depends(get_bigquery_client)
):
    """List all OpenAI subscription records for an organization."""
    validate_org_slug(org_slug)

    if not settings.disable_auth and org["org_slug"] != org_slug:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Cannot access subscriptions for another organization"
        )

    try:
        dataset_id = get_org_dataset(org_slug)
        table_id = f"{settings.gcp_project_id}.{dataset_id}.openai_subscriptions"

        query = f"""
        SELECT
            subscription_id,
            plan_name,
            quantity,
            unit_price_usd,
            effective_date,
            notes,
            created_at,
            updated_at
        FROM `{table_id}`
        ORDER BY plan_name
        """

        result = bq_client.client.query(query).result()
        subscriptions = [dict(row) for row in result]

        return OpenAISubscriptionListResponse(
            org_slug=org_slug,
            subscriptions=subscriptions,
            count=len(subscriptions)
        )

    except Exception as e:
        logger.error(f"Error listing subscriptions for {org_slug}: {e}", exc_info=True)
        if "Not found" in str(e):
            return OpenAISubscriptionListResponse(
                org_slug=org_slug,
                subscriptions=[],
                count=0
            )
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to retrieve subscription data"
        )


@router.get(
    "/integrations/{org_slug}/openai/subscriptions/{plan_name}",
    response_model=OpenAISubscriptionResponse,
    summary="Get single subscription"
)
async def get_subscription(
    org_slug: str,
    plan_name: str,
    org: Dict = Depends(get_current_org),
    bq_client: BigQueryClient = Depends(get_bigquery_client)
):
    """Get a specific subscription record."""
    validate_org_slug(org_slug)
    validate_plan_name(plan_name)

    if not settings.disable_auth and org["org_slug"] != org_slug:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Cannot access subscriptions for another organization"
        )

    try:
        dataset_id = get_org_dataset(org_slug)
        table_id = f"{settings.gcp_project_id}.{dataset_id}.openai_subscriptions"

        query = f"""
        SELECT
            subscription_id,
            plan_name,
            quantity,
            unit_price_usd,
            effective_date,
            notes,
            created_at,
            updated_at
        FROM `{table_id}`
        WHERE plan_name = @plan_name
        """

        job_config = bigquery.QueryJobConfig(
            query_parameters=[
                bigquery.ScalarQueryParameter("plan_name", "STRING", plan_name),
            ]
        )

        result = bq_client.client.query(query, job_config=job_config).result()
        rows = list(result)

        if not rows:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Subscription not found for plan: {plan_name}"
            )

        return OpenAISubscriptionResponse(**dict(rows[0]))

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error getting subscription for {plan_name}: {e}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to retrieve subscription data"
        )


@router.post(
    "/integrations/{org_slug}/openai/subscriptions",
    response_model=OpenAISubscriptionResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Create new subscription"
)
async def create_subscription(
    org_slug: str,
    subscription: OpenAISubscriptionCreate,
    org: Dict = Depends(get_current_org),
    bq_client: BigQueryClient = Depends(get_bigquery_client)
):
    """Create a new subscription record."""
    validate_org_slug(org_slug)

    if not settings.disable_auth and org["org_slug"] != org_slug:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Cannot create subscription for another organization"
        )

    try:
        dataset_id = get_org_dataset(org_slug)
        table_id = f"{settings.gcp_project_id}.{dataset_id}.openai_subscriptions"
        now = datetime.utcnow().isoformat()

        # Check if subscription_id already exists
        check_query = f"""
        SELECT COUNT(*) as cnt FROM `{table_id}` WHERE subscription_id = @subscription_id
        """
        job_config = bigquery.QueryJobConfig(
            query_parameters=[
                bigquery.ScalarQueryParameter("subscription_id", "STRING", subscription.subscription_id),
            ]
        )
        result = bq_client.client.query(check_query, job_config=job_config).result()
        if list(result)[0].cnt > 0:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail=f"Subscription already exists: {subscription.subscription_id}"
            )

        # Insert new record
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
            logger.error(f"Failed to insert subscription: {errors}")
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail="Failed to create subscription record"
            )

        logger.info(f"Created subscription {subscription.subscription_id} in {org_slug}")

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
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to create subscription record"
        )


@router.put(
    "/integrations/{org_slug}/openai/subscriptions/{plan_name}",
    response_model=OpenAISubscriptionResponse,
    summary="Update subscription"
)
async def update_subscription(
    org_slug: str,
    plan_name: str,
    subscription: OpenAISubscriptionUpdate,
    org: Dict = Depends(get_current_org),
    bq_client: BigQueryClient = Depends(get_bigquery_client)
):
    """Update an existing subscription record."""
    validate_org_slug(org_slug)
    validate_plan_name(plan_name)

    if not settings.disable_auth and org["org_slug"] != org_slug:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Cannot update subscription for another organization"
        )

    try:
        dataset_id = get_org_dataset(org_slug)
        table_id = f"{settings.gcp_project_id}.{dataset_id}.openai_subscriptions"

        # Build update query dynamically
        update_fields = []
        query_params = [
            bigquery.ScalarQueryParameter("plan_name", "STRING", plan_name),
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
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="No fields to update"
            )

        update_fields.append("updated_at = CURRENT_TIMESTAMP()")

        query = f"""
        UPDATE `{table_id}`
        SET {', '.join(update_fields)}
        WHERE plan_name = @plan_name
        """

        job_config = bigquery.QueryJobConfig(query_parameters=query_params)
        bq_client.client.query(query, job_config=job_config).result()

        logger.info(f"Updated subscription {plan_name} in {org_slug}")

        # Fetch updated record
        return await get_subscription(org_slug, plan_name, org, bq_client)

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error updating subscription: {e}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to update subscription record"
        )


@router.delete(
    "/integrations/{org_slug}/openai/subscriptions/{plan_name}",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="Delete subscription"
)
async def delete_subscription(
    org_slug: str,
    plan_name: str,
    org: Dict = Depends(get_current_org),
    bq_client: BigQueryClient = Depends(get_bigquery_client)
):
    """Delete a subscription record."""
    validate_org_slug(org_slug)
    validate_plan_name(plan_name)

    if not settings.disable_auth and org["org_slug"] != org_slug:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Cannot delete subscription for another organization"
        )

    try:
        dataset_id = get_org_dataset(org_slug)
        table_id = f"{settings.gcp_project_id}.{dataset_id}.openai_subscriptions"

        query = f"""
        DELETE FROM `{table_id}`
        WHERE plan_name = @plan_name
        """

        job_config = bigquery.QueryJobConfig(
            query_parameters=[
                bigquery.ScalarQueryParameter("plan_name", "STRING", plan_name),
            ]
        )

        bq_client.client.query(query, job_config=job_config).result()
        logger.info(f"Deleted subscription {plan_name} in {org_slug}")

    except Exception as e:
        logger.error(f"Error deleting subscription: {e}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to delete subscription record"
        )


@router.post(
    "/integrations/{org_slug}/openai/subscriptions/reset",
    response_model=OpenAISubscriptionListResponse,
    summary="Reset subscriptions to defaults"
)
async def reset_subscriptions(
    org_slug: str,
    org: Dict = Depends(get_current_org),
    bq_client: BigQueryClient = Depends(get_bigquery_client)
):
    """Reset all subscriptions to default values from CSV."""
    validate_org_slug(org_slug)

    if not settings.disable_auth and org["org_slug"] != org_slug:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Cannot reset subscriptions for another organization"
        )

    try:
        from src.app.routers.integrations import _initialize_openai_subscriptions

        # Re-initialize with force=True to delete and re-insert
        result = await _initialize_openai_subscriptions(org_slug, force=True)

        if result.get("status") != "SUCCESS":
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail=result.get("error", "Failed to reset subscriptions")
            )

        # Return the new subscription list
        return await list_subscriptions(org_slug, org, bq_client)

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error resetting subscriptions: {e}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to reset subscriptions"
        )
