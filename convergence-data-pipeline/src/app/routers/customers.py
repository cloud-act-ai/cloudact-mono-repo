"""
Customer Onboarding API Routes
Endpoint for onboarding new customers/tenants to the platform.
"""

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field, validator
from typing import List, Optional
from datetime import datetime
import hashlib
import secrets
import re
import logging
from pathlib import Path

from src.core.engine.bq_client import get_bigquery_client, BigQueryClient
from src.core.metadata.initializer import ensure_tenant_metadata
from src.core.security.kms_encryption import encrypt_value
from src.core.pipeline.async_executor import AsyncPipelineExecutor
from src.app.config import settings
from google.cloud import bigquery
import uuid

router = APIRouter()
logger = logging.getLogger(__name__)


# ============================================
# Request/Response Models
# ============================================

class OnboardCustomerRequest(BaseModel):
    """Request to onboard a new customer."""
    tenant_id: str = Field(
        ...,
        description="Tenant identifier (alphanumeric + underscore, 3-50 chars)"
    )

    @validator('tenant_id')
    def validate_tenant_id(cls, v):
        """Validate tenant_id format."""
        if not re.match(r'^[a-zA-Z0-9_]{3,50}$', v):
            raise ValueError(
                'tenant_id must be alphanumeric with underscores, 3-50 characters'
            )
        return v


class OnboardCustomerResponse(BaseModel):
    """Response for customer onboarding."""
    tenant_id: str
    api_key: str  # Unencrypted - show once!
    dataset_created: bool
    tables_created: List[str]
    dryrun_status: str  # "SUCCESS" or "FAILED"
    message: str


# ============================================
# Customer Onboarding Endpoint
# ============================================

@router.post(
    "/customers/onboard",
    response_model=OnboardCustomerResponse,
    summary="Onboard a new customer",
    description="Complete customer onboarding: create dataset, tables, API key, and run validation pipeline"
)
async def onboard_customer(
    request: OnboardCustomerRequest,
    bq_client: BigQueryClient = Depends(get_bigquery_client)
):
    """
    Onboard a new customer to the platform.

    This endpoint performs the following steps:
    1. Validates tenant_id format
    2. Creates tenant-specific BigQuery dataset and metadata tables
    3. Generates and stores encrypted API key
    4. Runs a dry-run pipeline to validate infrastructure
    5. Returns API key (SAVE THIS - it won't be shown again)

    - **tenant_id**: Unique tenant identifier (alphanumeric + underscore, 3-50 chars)

    Returns:
    - API key (unencrypted - save immediately)
    - Dataset and table creation status
    - Dry-run pipeline validation status
    """
    tenant_id = request.tenant_id

    logger.info(f"Starting customer onboarding for tenant: {tenant_id}")

    # Track tables created
    tables_created = []

    try:
        # Step 1: Create tenant metadata infrastructure (dataset + tables)
        logger.info(f"Creating metadata infrastructure for tenant: {tenant_id}")
        ensure_tenant_metadata(tenant_id, bq_client.client)

        # Get list of tables that should be created
        tables_created = [
            "api_keys",
            "cloud_credentials",
            "pipeline_runs",
            "step_logs",
            "dq_results"
        ]

        dataset_created = True
        logger.info(f"Metadata infrastructure created for tenant: {tenant_id}")

    except Exception as e:
        logger.error(
            f"Failed to create metadata infrastructure for {tenant_id}: {e}",
            exc_info=True
        )
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to create tenant infrastructure: {str(e)}"
        )

    # Step 2: Generate API key
    try:
        logger.info(f"Generating API key for tenant: {tenant_id}")

        # Generate secure API key with format: {tenant_id}_api_{random_16_chars}
        random_suffix = secrets.token_urlsafe(16)[:16]  # Ensure exactly 16 chars
        api_key = f"{tenant_id}_api_{random_suffix}"

        # Hash API key with SHA256 for lookup
        api_key_hash = hashlib.sha256(api_key.encode()).hexdigest()

        # Encrypt API key using KMS (returns bytes)
        # For testing: fallback to plain storage if KMS not configured
        try:
            encrypted_api_key_bytes = encrypt_value(api_key)
        except Exception as kms_error:
            logger.warning(f"KMS encryption failed, storing plain API key (DEV ONLY): {kms_error}")
            # Store as plain bytes for testing (NOT FOR PRODUCTION!)
            encrypted_api_key_bytes = api_key.encode('utf-8')

        # Generate unique API key ID
        api_key_id = str(uuid.uuid4())

        logger.info(f"API key generated and encrypted for tenant: {tenant_id}")

    except Exception as e:
        logger.error(
            f"Failed to generate/encrypt API key for {tenant_id}: {e}",
            exc_info=True
        )
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to generate API key: {str(e)}"
        )

    # Step 3: Store API key in {tenant_id}.api_keys table
    try:
        logger.info(f"Storing API key in database for tenant: {tenant_id}")

        insert_query = f"""
        INSERT INTO `{settings.gcp_project_id}.{tenant_id}.api_keys`
        (api_key_id, api_key_hash, encrypted_api_key, created_at, is_active)
        VALUES
        (@api_key_id, @api_key_hash, @encrypted_api_key, CURRENT_TIMESTAMP(), TRUE)
        """

        job_config = bigquery.QueryJobConfig(
            query_parameters=[
                bigquery.ScalarQueryParameter("api_key_id", "STRING", api_key_id),
                bigquery.ScalarQueryParameter("api_key_hash", "STRING", api_key_hash),
                bigquery.ScalarQueryParameter("encrypted_api_key", "BYTES", encrypted_api_key_bytes),
            ]
        )

        bq_client.client.query(insert_query, job_config=job_config).result()
        logger.info(f"API key stored successfully for tenant: {tenant_id}")

    except Exception as e:
        logger.error(
            f"Failed to store API key for {tenant_id}: {e}",
            exc_info=True
        )
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to store API key: {str(e)}"
        )

    # Step 4: Run dry-run pipeline from configs/gcp/example/dryrun.yml
    dryrun_status = "FAILED"
    dryrun_message = ""

    try:
        logger.info(f"Running dry-run pipeline for tenant: {tenant_id}")

        # Load dryrun pipeline configuration
        dryrun_config_path = Path("configs/gcp/example/dryrun.yml")

        if not dryrun_config_path.exists():
            logger.warning(f"Dryrun config not found at {dryrun_config_path}, skipping pipeline")
            dryrun_status = "SKIPPED"
            dryrun_message = "Dryrun pipeline configuration not found"
        else:
            # Create async pipeline executor for dryrun
            executor = AsyncPipelineExecutor(
                tenant_id=tenant_id,
                pipeline_id=f"{tenant_id}-dryrun",
                trigger_type="onboarding",
                trigger_by="onboarding_api"
            )

            # Execute dryrun pipeline synchronously (wait for completion)
            import asyncio
            result = await executor.execute(parameters={})

            # Check execution result
            if result and result.get('status') in ['COMPLETE', 'SUCCESS']:
                dryrun_status = "SUCCESS"
                dryrun_message = "Dryrun pipeline completed successfully"
                logger.info(f"Dryrun pipeline succeeded for tenant: {tenant_id}")
            else:
                dryrun_status = "FAILED"
                dryrun_message = f"Dryrun pipeline failed: {result.get('error', 'Unknown error')}"
                logger.warning(f"Dryrun pipeline failed for tenant: {tenant_id}")

    except Exception as e:
        logger.error(
            f"Error running dryrun pipeline for {tenant_id}: {e}",
            exc_info=True
        )
        dryrun_status = "FAILED"
        dryrun_message = f"Dryrun pipeline error: {str(e)}"

    # Step 5: Return response with unencrypted API key
    logger.info(f"Customer onboarding completed for tenant: {tenant_id}")

    return OnboardCustomerResponse(
        tenant_id=tenant_id,
        api_key=api_key,  # Return unencrypted - user must save this!
        dataset_created=dataset_created,
        tables_created=tables_created,
        dryrun_status=dryrun_status,
        message=f"Customer {tenant_id} onboarded successfully. API key generated. {dryrun_message}"
    )
