"""
Admin API Routes
Endpoints for tenant and API key management.
"""

from fastapi import APIRouter, Depends, HTTPException, status, Request
from pydantic import BaseModel, Field
from typing import Optional
from datetime import datetime
import hashlib
import secrets
import logging

from google.cloud import bigquery
from src.core.engine.bq_client import get_bigquery_client, BigQueryClient
from src.app.config import settings
from src.app.dependencies.auth import verify_admin_key
from src.app.dependencies.rate_limit_decorator import rate_limit_global

logger = logging.getLogger(__name__)

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
    tenant_api_key_hash: str
    tenant_id: str
    created_at: datetime
    description: Optional[str]


class TenantResponse(BaseModel):
    """Response for tenant info."""
    tenant_id: str
    datasets_created: int
    api_keys_count: int
    total_pipeline_runs: int


class BootstrapRequest(BaseModel):
    """Request to bootstrap system."""
    force_recreate_dataset: bool = Field(
        False,
        description="Force delete and recreate central tenants dataset"
    )
    force_recreate_tables: bool = Field(
        False,
        description="Force delete and recreate all tenant management tables"
    )


class BootstrapResponse(BaseModel):
    """Response from bootstrap operation."""
    status: str = Field(..., description="Bootstrap status (SUCCESS, FAILED)")
    dataset_created: bool
    tables_created: list = Field(..., description="List of created tables")
    tables_existed: list = Field(..., description="List of existing tables")
    total_tables: int
    message: str


# ============================================
# System Bootstrap
# ============================================

@router.post(
    "/admin/bootstrap",
    response_model=BootstrapResponse,
    summary="Bootstrap system",
    description="One-time system bootstrap to create central tenants dataset and management tables"
)
async def bootstrap_system(
    request: BootstrapRequest,
    _admin: None = Depends(verify_admin_key)
):
    """
    Bootstrap the system for first-time setup.

    Creates:
    - Central 'tenants' dataset
    - All tenant management tables with proper schemas

    This endpoint requires admin authentication via X-Admin-Key header.

    Parameters:
    - **force_recreate_dataset**: If true, delete and recreate the central dataset (DANGEROUS)
    - **force_recreate_tables**: If true, delete and recreate all tables (DANGEROUS)

    Returns:
    - **status**: SUCCESS or FAILED
    - **dataset_created**: Whether dataset was newly created
    - **tables_created**: List of tables that were created
    - **tables_existed**: List of tables that already existed
    - **total_tables**: Total number of tables configured
    """
    try:
        from src.core.processors.setup.initial.onetime_bootstrap_processor import OnetimeBootstrapProcessor

        logger.info(
            "Bootstrap request received",
            extra={
                "force_recreate_dataset": request.force_recreate_dataset,
                "force_recreate_tables": request.force_recreate_tables
            }
        )

        # Initialize bootstrap processor
        processor = OnetimeBootstrapProcessor()

        # Execute bootstrap with configuration
        result = await processor.execute(
            step_config={},
            context={
                "force_recreate_dataset": request.force_recreate_dataset,
                "force_recreate_tables": request.force_recreate_tables
            }
        )

        logger.info(
            "Bootstrap completed successfully",
            extra={
                "dataset_created": result.get("dataset_created"),
                "tables_created": len(result.get("tables_created", [])),
                "tables_existed": len(result.get("tables_existed", []))
            }
        )

        return BootstrapResponse(
            status=result.get("status", "SUCCESS"),
            dataset_created=result.get("dataset_created", False),
            tables_created=result.get("tables_created", []),
            tables_existed=result.get("tables_existed", []),
            total_tables=result.get("total_tables", 0),
            message=result.get("message", "Bootstrap completed")
        )

    except Exception as e:
        logger.error(f"Bootstrap failed: {e}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Bootstrap failed: {str(e)}"
        )


# ============================================
# Tenant Management
# ============================================

@router.post(
    "/admin/tenants",
    response_model=TenantResponse,
    summary="Create a new tenant",
    description="Initialize a new tenant with BigQuery datasets, profile, and subscription. Rate limited: 10 requests/minute (expensive operation)"
)
async def create_tenant(
    request: CreateTenantRequest,
    http_request: Request,
    bq_client: BigQueryClient = Depends(get_bigquery_client),
    _admin: None = Depends(verify_admin_key)
):
    """
    Create a new tenant.

    This will:
    1. Create tenant profile in tenants.tenant_profiles
    2. Create subscription in tenants.tenant_subscriptions
    3. Create tenant-specific BigQuery datasets
    4. Return tenant details

    - **tenant_id**: Unique tenant identifier (lowercase, alphanumeric, underscores only)
    - **description**: Optional description

    RATE LIMITED: 10 requests/minute per admin (protects expensive BigQuery operations)
    """
    # Apply rate limiting for expensive tenant creation
    await rate_limit_global(
        http_request,
        endpoint_name="admin_create_tenant",
        limit_per_minute=settings.rate_limit_admin_tenants_per_minute
    )

    tenant_id = request.tenant_id
    
    # Default subscription plan limits
    PLAN_LIMITS = {
        "STARTER": {"max_daily": 10, "max_monthly": 300, "max_concurrent": 3},
        "PROFESSIONAL": {"max_daily": 50, "max_monthly": 1500, "max_concurrent": 5},
        "ENTERPRISE": {"max_daily": 200, "max_monthly": 6000, "max_concurrent": 10}
    }
    plan_limits = PLAN_LIMITS["STARTER"]  # Default to STARTER plan

    # Step 1: Create tenant profile
    try:
        logger.info(f"Creating tenant profile for: {tenant_id}")
        
        insert_profile_query = f"""
        INSERT INTO `{settings.gcp_project_id}.tenants.tenant_profiles`
        (tenant_id, company_name, admin_email, tenant_dataset_id, status, subscription_plan, created_at, updated_at)
        VALUES
        (@tenant_id, @company_name, @admin_email, @tenant_dataset_id, 'ACTIVE', 'STARTER', CURRENT_TIMESTAMP(), CURRENT_TIMESTAMP())
        """

        bq_client.client.query(
            insert_profile_query,
            job_config=bigquery.QueryJobConfig(
                query_parameters=[
                    bigquery.ScalarQueryParameter("tenant_id", "STRING", tenant_id),
                    bigquery.ScalarQueryParameter("company_name", "STRING", request.description or tenant_id),
                    bigquery.ScalarQueryParameter("admin_email", "STRING", "admin@example.com"),  # Placeholder
                    bigquery.ScalarQueryParameter("tenant_dataset_id", "STRING", tenant_id)
                ]
            )
        ).result()

        logger.info(f"Tenant profile created for: {tenant_id}")

    except Exception as e:
        logger.error(f"Failed to create tenant profile: {e}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to create tenant profile: {str(e)}"
        )

    # Step 2: Create subscription
    try:
        import uuid
        from datetime import date
        
        logger.info(f"Creating subscription for: {tenant_id}")
        
        subscription_id = str(uuid.uuid4())
        trial_end = date.today()  # No trial for admin-created tenants

        insert_subscription_query = f"""
        INSERT INTO `{settings.gcp_project_id}.tenants.tenant_subscriptions`
        (subscription_id, tenant_id, plan_name, status, daily_limit, monthly_limit,
         concurrent_limit, trial_end_date, created_at)
        VALUES
        (@subscription_id, @tenant_id, 'STARTER', 'ACTIVE', @daily_limit, @monthly_limit,
         @concurrent_limit, @trial_end_date, CURRENT_TIMESTAMP())
        """

        bq_client.client.query(
            insert_subscription_query,
            job_config=bigquery.QueryJobConfig(
                query_parameters=[
                    bigquery.ScalarQueryParameter("subscription_id", "STRING", subscription_id),
                    bigquery.ScalarQueryParameter("tenant_id", "STRING", tenant_id),
                    bigquery.ScalarQueryParameter("daily_limit", "INT64", plan_limits["max_daily"]),
                    bigquery.ScalarQueryParameter("monthly_limit", "INT64", plan_limits["max_monthly"]),
                    bigquery.ScalarQueryParameter("concurrent_limit", "INT64", plan_limits["max_concurrent"]),
                    bigquery.ScalarQueryParameter("trial_end_date", "DATE", trial_end)
                ]
            )
        ).result()

        logger.info(f"Subscription created for: {tenant_id}")

    except Exception as e:
        logger.error(f"Failed to create subscription: {e}", exc_info=True)
        # Cleanup tenant profile
        try:
            bq_client.client.query(
                f"DELETE FROM `{settings.gcp_project_id}.tenants.tenant_profiles` WHERE tenant_id = @tenant_id",
                job_config=bigquery.QueryJobConfig(
                    query_parameters=[bigquery.ScalarQueryParameter("tenant_id", "STRING", tenant_id)]
                )
            ).result()
        except:
            pass
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to create subscription: {str(e)}"
        )

    # Step 3: Create BigQuery datasets
    # Load dataset types from configuration
    datasets_to_create = [
        (dataset_type, f"{description} for {tenant_id}")
        for dataset_type, description in settings.get_dataset_types_with_descriptions()
    ]

    datasets_created = 0
    dataset_errors = []
    for dataset_type, description in datasets_to_create:
        try:
            bq_client.create_dataset(
                tenant_id=tenant_id,
                dataset_type=dataset_type,
                description=description
            )
            datasets_created += 1
        except Exception as e:
            # Log error and track failures
            error_msg = f"Failed to create dataset {dataset_type}: {str(e)}"
            logger.error(error_msg, extra={"tenant_id": tenant_id, "dataset_type": dataset_type})
            dataset_errors.append(error_msg)

    # If all datasets failed, cleanup and raise error
    if datasets_created == 0 and dataset_errors:
        # Cleanup tenant profile and subscription
        try:
            bq_client.client.query(
                f"DELETE FROM `{settings.gcp_project_id}.tenants.tenant_profiles` WHERE tenant_id = @tenant_id",
                job_config=bigquery.QueryJobConfig(
                    query_parameters=[bigquery.ScalarQueryParameter("tenant_id", "STRING", tenant_id)]
                )
            ).result()
            bq_client.client.query(
                f"DELETE FROM `{settings.gcp_project_id}.tenants.tenant_subscriptions` WHERE tenant_id = @tenant_id",
                job_config=bigquery.QueryJobConfig(
                    query_parameters=[bigquery.ScalarQueryParameter("tenant_id", "STRING", tenant_id)]
                )
            ).result()
        except:
            pass
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to create any datasets for tenant {tenant_id}: {'; '.join(dataset_errors)}"
        )

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
    bq_client: BigQueryClient = Depends(get_bigquery_client),
    _admin: None = Depends(verify_admin_key)
):
    """
    Get tenant details and statistics.

    - **tenant_id**: Tenant identifier

    Returns tenant information including dataset count, API keys, and pipeline runs.
    """
    # Count API keys
    api_keys_query = f"""
    SELECT COUNT(*) as count
    FROM `{settings.gcp_project_id}.tenants.tenant_api_keys`
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
    FROM `{settings.gcp_project_id}.tenants.tenant_pipeline_runs`
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
    bq_client: BigQueryClient = Depends(get_bigquery_client),
    _admin: None = Depends(verify_admin_key)
):
    """
    Generate a new API key for a tenant.

    - **tenant_id**: Tenant identifier
    - **description**: Optional description for the API key

    Returns the generated API key (SAVE THIS - it won't be shown again).
    """
    # VALIDATION: Check if tenant already has an active API key
    from google.cloud import bigquery

    check_query = f"""
    SELECT tenant_api_key_hash, created_at
    FROM `{settings.gcp_project_id}.tenants.tenant_api_keys`
    WHERE tenant_id = @tenant_id AND is_active = TRUE
    LIMIT 1
    """

    check_config = bigquery.QueryJobConfig(
        query_parameters=[
            bigquery.ScalarQueryParameter("tenant_id", "STRING", request.tenant_id)
        ]
    )

    existing_keys = list(bq_client.client.query(check_query, job_config=check_config).result())

    if existing_keys:
        existing_hash = existing_keys[0]["tenant_api_key_hash"]
        logger.warning(f"Tenant {request.tenant_id} already has an active API key: {existing_hash[:16]}...")
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"Tenant '{request.tenant_id}' already has an active API key. Revoke the existing key first or contact support."
        )

    # Generate secure random API key
    api_key = f"sk_{request.tenant_id}_{secrets.token_urlsafe(32)}"

    # Hash the API key
    tenant_api_key_hash = hashlib.sha256(api_key.encode()).hexdigest()

    # Generate unique API key ID
    import uuid
    tenant_api_key_id = str(uuid.uuid4())
    
    # Insert into BigQuery
    insert_query = f"""
    INSERT INTO `{settings.gcp_project_id}.tenants.tenant_api_keys`
    (tenant_api_key_id, tenant_id, tenant_api_key_hash, is_active, created_at)
    VALUES
    (@tenant_api_key_id, @tenant_id, @tenant_api_key_hash, TRUE, CURRENT_TIMESTAMP())
    """

    from google.cloud import bigquery

    job_config = bigquery.QueryJobConfig(
        query_parameters=[
            bigquery.ScalarQueryParameter("tenant_api_key_id", "STRING", tenant_api_key_id),
            bigquery.ScalarQueryParameter("tenant_api_key_hash", "STRING", tenant_api_key_hash),
            bigquery.ScalarQueryParameter("tenant_id", "STRING", request.tenant_id),
        ]
    )

    bq_client.client.query(insert_query, job_config=job_config).result()

    return APIKeyResponse(
        api_key=api_key,
        tenant_api_key_hash=tenant_api_key_hash,
        tenant_id=request.tenant_id,
        created_at=datetime.utcnow(),
        description=request.description
    )


@router.delete(
    "/admin/api-keys/{tenant_api_key_hash}",
    summary="Revoke API key",
    description="Deactivate an API key"
)
async def revoke_api_key(
    tenant_api_key_hash: str,
    bq_client: BigQueryClient = Depends(get_bigquery_client),
    _admin: None = Depends(verify_admin_key)
):
    """
    Revoke (deactivate) an API key.

    - **tenant_api_key_hash**: SHA256 hash of the API key

    The API key will be marked as inactive and can no longer be used.
    """
    update_query = f"""
    UPDATE `{settings.gcp_project_id}.tenants.tenant_api_keys`
    SET is_active = FALSE
    WHERE tenant_api_key_hash = @tenant_api_key_hash
    """

    from google.cloud import bigquery

    job_config = bigquery.QueryJobConfig(
        query_parameters=[
            bigquery.ScalarQueryParameter("tenant_api_key_hash", "STRING", tenant_api_key_hash)
        ]
    )

    bq_client.client.query(update_query, job_config=job_config).result()

    return {
        "tenant_api_key_hash": tenant_api_key_hash,
        "message": "API key revoked successfully"
    }
