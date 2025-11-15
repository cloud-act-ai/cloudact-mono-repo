"""
Admin API Routes
Endpoints for tenant and API key management.
"""

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field
from typing import Optional
from datetime import datetime
import hashlib
import secrets

from src.core.engine.bq_client import get_bigquery_client, BigQueryClient
from src.app.config import settings

router = APIRouter()


# ============================================
# Request/Response Models
# ============================================

class CreateTenantRequest(BaseModel):
    """Request to create a new tenant."""
    tenant_id: str = Field(..., pattern="^[a-z0-9_]+$", description="Tenant identifier (lowercase, alphanumeric, underscores)")
    description: Optional[str] = Field(None, description="Tenant description")


class CreateAPIKeyRequest(BaseModel):
    """Request to create an API key."""
    tenant_id: str
    description: Optional[str] = None


class APIKeyResponse(BaseModel):
    """Response containing API key."""
    api_key: str
    api_key_hash: str
    tenant_id: str
    created_at: datetime
    description: Optional[str]


class TenantResponse(BaseModel):
    """Response for tenant info."""
    tenant_id: str
    datasets_created: int
    api_keys_count: int
    total_pipeline_runs: int


# ============================================
# Tenant Management
# ============================================

@router.post(
    "/admin/tenants",
    response_model=TenantResponse,
    summary="Create a new tenant",
    description="Initialize a new tenant with BigQuery datasets"
)
async def create_tenant(
    request: CreateTenantRequest,
    bq_client: BigQueryClient = Depends(get_bigquery_client)
):
    """
    Create a new tenant.

    This will:
    1. Create tenant-specific BigQuery datasets
    2. Set up initial directory structure
    3. Return tenant details

    - **tenant_id**: Unique tenant identifier (lowercase, alphanumeric, underscores only)
    - **description**: Optional description
    """
    tenant_id = request.tenant_id

    # Load dataset types from configuration
    datasets_to_create = [
        (dataset_type, f"{description} for {tenant_id}")
        for dataset_type, description in settings.get_dataset_types_with_descriptions()
    ]

    datasets_created = 0
    for dataset_type, description in datasets_to_create:
        try:
            bq_client.create_dataset(
                tenant_id=tenant_id,
                dataset_type=dataset_type,
                description=description
            )
            datasets_created += 1
        except Exception as e:
            # Log error but continue
            import logging
            logging.error(f"Failed to create dataset {dataset_type} for {tenant_id}: {e}")

    return TenantResponse(
        tenant_id=tenant_id,
        datasets_created=datasets_created,
        api_keys_count=0,
        total_pipeline_runs=0
    )


@router.get(
    "/admin/tenants/{tenant_id}",
    response_model=TenantResponse,
    summary="Get tenant status",
    description="Get tenant information and statistics"
)
async def get_tenant(
    tenant_id: str,
    bq_client: BigQueryClient = Depends(get_bigquery_client)
):
    """
    Get tenant details and statistics.

    - **tenant_id**: Tenant identifier

    Returns tenant information including dataset count, API keys, and pipeline runs.
    """
    # Count API keys
    api_keys_query = f"""
    SELECT COUNT(*) as count
    FROM `{settings.get_admin_metadata_table('api_keys')}`
    WHERE tenant_id = @tenant_id
    """

    from google.cloud import bigquery

    job_config = bigquery.QueryJobConfig(
        query_parameters=[
            bigquery.ScalarQueryParameter("tenant_id", "STRING", tenant_id)
        ]
    )

    api_keys_result = list(bq_client.client.query(api_keys_query, job_config=job_config).result())
    api_keys_count = api_keys_result[0]["count"] if api_keys_result else 0

    # Count pipeline runs
    runs_query = f"""
    SELECT COUNT(*) as count
    FROM `{settings.get_admin_metadata_table('pipeline_runs')}`
    WHERE tenant_id = @tenant_id
    """

    runs_result = list(bq_client.client.query(runs_query, job_config=job_config).result())
    runs_count = runs_result[0]["count"] if runs_result else 0

    # Get dataset count from configuration
    datasets_created = len(settings.get_dataset_type_names())

    return TenantResponse(
        tenant_id=tenant_id,
        datasets_created=datasets_created,
        api_keys_count=api_keys_count,
        total_pipeline_runs=runs_count
    )


# ============================================
# API Key Management
# ============================================

@router.post(
    "/admin/api-keys",
    response_model=APIKeyResponse,
    summary="Generate API key",
    description="Generate a new API key for a tenant"
)
async def create_api_key(
    request: CreateAPIKeyRequest,
    bq_client: BigQueryClient = Depends(get_bigquery_client)
):
    """
    Generate a new API key for a tenant.

    - **tenant_id**: Tenant identifier
    - **description**: Optional description for the API key

    Returns the generated API key (SAVE THIS - it won't be shown again).
    """
    # Generate secure random API key
    api_key = f"sk_{request.tenant_id}_{secrets.token_urlsafe(32)}"

    # Hash the API key
    api_key_hash = hashlib.sha256(api_key.encode()).hexdigest()

    # Insert into BigQuery
    insert_query = f"""
    INSERT INTO `{settings.get_admin_metadata_table('api_keys')}`
    (api_key_hash, tenant_id, created_at, created_by, is_active, description)
    VALUES
    (@api_key_hash, @tenant_id, CURRENT_TIMESTAMP(), @created_by, TRUE, @description)
    """

    from google.cloud import bigquery

    job_config = bigquery.QueryJobConfig(
        query_parameters=[
            bigquery.ScalarQueryParameter("api_key_hash", "STRING", api_key_hash),
            bigquery.ScalarQueryParameter("tenant_id", "STRING", request.tenant_id),
            bigquery.ScalarQueryParameter("created_by", "STRING", "admin_api"),
            bigquery.ScalarQueryParameter("description", "STRING", request.description),
        ]
    )

    bq_client.client.query(insert_query, job_config=job_config).result()

    return APIKeyResponse(
        api_key=api_key,
        api_key_hash=api_key_hash,
        tenant_id=request.tenant_id,
        created_at=datetime.utcnow(),
        description=request.description
    )


@router.delete(
    "/admin/api-keys/{api_key_hash}",
    summary="Revoke API key",
    description="Deactivate an API key"
)
async def revoke_api_key(
    api_key_hash: str,
    bq_client: BigQueryClient = Depends(get_bigquery_client)
):
    """
    Revoke (deactivate) an API key.

    - **api_key_hash**: SHA256 hash of the API key

    The API key will be marked as inactive and can no longer be used.
    """
    update_query = f"""
    UPDATE `{settings.get_admin_metadata_table('api_keys')}`
    SET is_active = FALSE
    WHERE api_key_hash = @api_key_hash
    """

    from google.cloud import bigquery

    job_config = bigquery.QueryJobConfig(
        query_parameters=[
            bigquery.ScalarQueryParameter("api_key_hash", "STRING", api_key_hash)
        ]
    )

    bq_client.client.query(update_query, job_config=job_config).result()

    return {
        "api_key_hash": api_key_hash,
        "message": "API key revoked successfully"
    }
