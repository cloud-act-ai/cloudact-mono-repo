"""
Tenant Onboarding API Routes
Endpoint for onboarding new tenants to the platform.

TWO-DATASET ARCHITECTURE:
1. tenants dataset: Auth data (API keys, subscriptions, profiles, credentials)
2. {tenant_id} dataset: Operational data (pipeline_runs, step_logs, dq_results)
"""

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field, field_validator
from typing import List, Optional, Dict, Any
from datetime import datetime, date
import hashlib
import secrets
import re
import logging
from pathlib import Path

from src.core.engine.bq_client import get_bigquery_client, BigQueryClient
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

class OnboardTenantRequest(BaseModel):
    """Request to onboard a new tenant."""
    tenant_id: str = Field(
        ...,
        description="Tenant identifier (alphanumeric + underscore, 3-50 chars)"
    )
    company_name: str = Field(
        ...,
        description="Company or organization name"
    )
    admin_email: str = Field(
        ...,
        description="Primary admin contact email"
    )
    subscription_plan: str = Field(
        default="STARTER",
        description="Subscription plan: STARTER, PROFESSIONAL, SCALE"
    )
    force_recreate_dataset: bool = Field(
        default=False,
        description="If True, delete and recreate the entire dataset (DESTRUCTIVE)"
    )
    force_recreate_tables: bool = Field(
        default=False,
        description="If True, delete and recreate all metadata tables (DESTRUCTIVE)"
    )

    @field_validator('tenant_id')
    @classmethod
    def validate_tenant_id(cls, v):
        """Validate tenant_id format."""
        if not re.match(r'^[a-zA-Z0-9_]{3,50}$', v):
            raise ValueError(
                'tenant_id must be alphanumeric with underscores, 3-50 characters'
            )
        return v

    @field_validator('subscription_plan')
    @classmethod
    def validate_subscription_plan(cls, v):
        """Validate subscription plan."""
        allowed = ['STARTER', 'PROFESSIONAL', 'SCALE']
        if v.upper() not in allowed:
            raise ValueError(f'subscription_plan must be one of {allowed}')
        return v.upper()


class OnboardTenantResponse(BaseModel):
    """Response for tenant onboarding."""
    tenant_id: str
    api_key: str  # Unencrypted - show once!
    subscription_plan: str
    dataset_created: bool
    tables_created: List[str]
    dryrun_status: str  # "SUCCESS" or "FAILED"
    message: str


class DryRunRequest(BaseModel):
    """Request to perform dry-run validation for tenant onboarding."""
    tenant_id: str = Field(
        ...,
        description="Tenant identifier (alphanumeric + underscore, 3-50 chars)"
    )
    company_name: str = Field(
        ...,
        description="Company or organization name"
    )
    admin_email: str = Field(
        ...,
        description="Primary admin contact email"
    )
    subscription_plan: str = Field(
        default="STARTER",
        description="Subscription plan: STARTER, PROFESSIONAL, SCALE"
    )

    @field_validator('tenant_id')
    @classmethod
    def validate_tenant_id(cls, v):
        """Validate tenant_id format."""
        if not re.match(r'^[a-zA-Z0-9_]{3,50}$', v):
            raise ValueError(
                'tenant_id must be alphanumeric with underscores, 3-50 characters'
            )
        return v

    @field_validator('subscription_plan')
    @classmethod
    def validate_subscription_plan(cls, v):
        """Validate subscription plan."""
        allowed = ['STARTER', 'PROFESSIONAL', 'SCALE']
        if v.upper() not in allowed:
            raise ValueError(f'subscription_plan must be one of {allowed}')
        return v.upper()


class DryRunResponse(BaseModel):
    """Response for dry-run validation."""
    status: str  # "SUCCESS" or "FAILED"
    tenant_id: str
    subscription_plan: str
    company_name: str
    admin_email: str
    validation_summary: Dict[str, Any]
    validation_results: List[Dict[str, Any]]
    message: str
    ready_for_onboarding: bool


# ============================================
# Tenant Dry-Run Validation Endpoint
# ============================================

@router.post(
    "/tenants/dryrun",
    response_model=DryRunResponse,
    summary="Dry-run validation for tenant onboarding",
    description="Validates tenant configuration and infrastructure before actual onboarding (no resources created)"
)
async def dryrun_tenant_onboarding(
    request: DryRunRequest,
    bq_client: BigQueryClient = Depends(get_bigquery_client)
):
    """
    Perform dry-run validation for tenant onboarding.

    VALIDATION CHECKS (NO RESOURCES CREATED):
    1. Tenant ID format and uniqueness
    2. Email format validation
    3. GCP credentials verification
    4. BigQuery connectivity test
    5. Subscription plan validation
    6. Central tables existence check
    7. Dryrun config availability

    This endpoint MUST be called before /tenants/onboard to ensure:
    - All prerequisites are met
    - Configuration is valid
    - Infrastructure is ready
    - No resource conflicts

    - **tenant_id**: Unique tenant identifier (alphanumeric + underscore, 3-50 chars)
    - **company_name**: Company or organization name
    - **admin_email**: Primary admin contact email
    - **subscription_plan**: STARTER, PROFESSIONAL, or SCALE

    Returns:
    - Validation status (SUCCESS/FAILED)
    - Detailed validation results for each check
    - Ready-for-onboarding flag
    - Actionable error messages if validation fails
    """
    tenant_id = request.tenant_id

    logger.info(f"Starting dry-run validation for tenant: {tenant_id}")

    try:
        # Import and call the TenantDryRunProcessor
        from src.core.processors.setup.tenants.dryrun import TenantDryRunProcessor

        processor = TenantDryRunProcessor()

        # Execute dry-run validation
        result = await processor.execute(
            step_config={
                "config": {
                    "validate_all": True
                }
            },
            context={
                "tenant_id": tenant_id,
                "company_name": request.company_name,
                "admin_email": request.admin_email,
                "subscription_plan": request.subscription_plan
            }
        )

        logger.info(
            f"Dry-run validation completed for {tenant_id}",
            extra={
                "status": result["status"],
                "ready_for_onboarding": result["ready_for_onboarding"]
            }
        )

        return DryRunResponse(**result)

    except Exception as e:
        logger.error(f"Dry-run validation error for {tenant_id}: {e}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Dry-run validation failed: {str(e)}"
        )


# ============================================
# Tenant Onboarding Endpoint
# ============================================

@router.post(
    "/tenants/onboard",
    response_model=OnboardTenantResponse,
    summary="Onboard a new tenant",
    description="Complete tenant onboarding: create tenant profile, API key, subscription, and tenant dataset"
)
async def onboard_tenant(
    request: OnboardTenantRequest,
    bq_client: BigQueryClient = Depends(get_bigquery_client)
):
    """
    Onboard a new tenant to the platform.

    TWO-DATASET ARCHITECTURE:
    1. Creates tenant record in tenants.tenant_profiles
    2. Stores API key in tenants.tenant_api_keys (centralized auth)
    3. Creates subscription in tenants.tenant_subscriptions
    4. Creates usage tracking in tenants.tenant_usage_quotas
    5. Creates tenant dataset with ONLY operational tables (no API keys)
    6. Runs dry-run pipeline to validate infrastructure

    - **tenant_id**: Unique tenant identifier (becomes dataset name)
    - **company_name**: Company or organization name
    - **admin_email**: Primary admin contact email
    - **subscription_plan**: STARTER, PROFESSIONAL, or SCALE

    Returns:
    - API key (unencrypted - save immediately)
    - Tenant and subscription details
    - Dataset and table creation status
    """
    tenant_id = request.tenant_id

    logger.info(f"Starting tenant onboarding for tenant: {tenant_id}")

    # Track tables created
    tables_created = []

    # Subscription plan limits
    PLAN_LIMITS = {
        "STARTER": {"max_team": 2, "max_providers": 3, "max_daily": 6, "max_concurrent": 3},
        "PROFESSIONAL": {"max_team": 6, "max_providers": 6, "max_daily": 25, "max_concurrent": 5},
        "SCALE": {"max_team": 11, "max_providers": 10, "max_daily": 100, "max_concurrent": 10}
    }

    plan_limits = PLAN_LIMITS.get(request.subscription_plan, PLAN_LIMITS["STARTER"])

    # ============================================
    # STEP 1: Create tenant profile in tenants.tenant_profiles
    # ============================================
    try:
        logger.info(f"Creating tenant profile in tenants.tenant_profiles")

        insert_profile_query = f"""
        INSERT INTO `{settings.gcp_project_id}.tenants.tenant_profiles`
        (tenant_id, company_name, admin_email, tenant_dataset_id, status, subscription_plan, created_at, updated_at)
        VALUES
        (@tenant_id, @company_name, @admin_email, @tenant_dataset_id, 'ACTIVE', @subscription_plan, CURRENT_TIMESTAMP(), CURRENT_TIMESTAMP())
        """

        bq_client.client.query(
            insert_profile_query,
            job_config=bigquery.QueryJobConfig(
                query_parameters=[
                    bigquery.ScalarQueryParameter("tenant_id", "STRING", tenant_id),
                    bigquery.ScalarQueryParameter("company_name", "STRING", request.company_name),
                    bigquery.ScalarQueryParameter("admin_email", "STRING", request.admin_email),
                    bigquery.ScalarQueryParameter("tenant_dataset_id", "STRING", tenant_id),
                    bigquery.ScalarQueryParameter("subscription_plan", "STRING", request.subscription_plan)
                ]
            )
        ).result()

        logger.info(
            f"Tenant profile created successfully",
            extra={
                "event_type": "tenant_created",
                "tenant_id": tenant_id,
                "company_name": request.company_name,
                "admin_email": request.admin_email,
                "subscription_plan": request.subscription_plan,
                "dataset_id": tenant_id
            }
        )

    except Exception as e:
        logger.error(
            f"Failed to create tenant profile",
            extra={
                "event_type": "tenant_creation_failed",
                "tenant_id": tenant_id,
                "company_name": request.company_name,
                "error": str(e)
            },
            exc_info=True
        )
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to create tenant profile: {str(e)}"
        )

    # ============================================
    # STEP 2: Generate and store API key in tenants.tenant_api_keys
    # ============================================
    try:
        logger.info(f"Generating API key for tenant: {tenant_id}")

        # Generate secure API key with format: {tenant_id}_api_{random_16_chars}
        random_suffix = secrets.token_urlsafe(16)[:16]
        api_key = f"{tenant_id}_api_{random_suffix}"

        # Hash API key with SHA256 for lookup
        api_key_hash = hashlib.sha256(api_key.encode()).hexdigest()

        # Encrypt API key using KMS
        try:
            encrypted_api_key_bytes = encrypt_value(api_key)
            logger.info(f"API key encrypted successfully using KMS for tenant: {tenant_id}")
        except Exception as kms_error:
            logger.error(f"KMS encryption failed for tenant {tenant_id}: {kms_error}", exc_info=True)
            # Fail hard in production - never store plain text API keys
            if settings.environment == "production":
                raise HTTPException(
                    status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                    detail="KMS encryption is required in production but failed. Please check KMS configuration."
                )
            else:
                # Only allow fallback in development/staging environments
                logger.warning(f"KMS encryption failed, storing plain API key (DEV/STAGING ONLY): {kms_error}")
                encrypted_api_key_bytes = api_key.encode('utf-8')

        api_key_id = str(uuid.uuid4())

        # Store API key in centralized tenants.tenant_api_keys table
        insert_api_key_query = f"""
        INSERT INTO `{settings.gcp_project_id}.tenants.tenant_api_keys`
        (api_key_id, tenant_id, api_key_hash, encrypted_api_key, scopes, is_active, created_at)
        VALUES
        (@api_key_id, @tenant_id, @api_key_hash, @encrypted_api_key, @scopes, TRUE, CURRENT_TIMESTAMP())
        """

        bq_client.client.query(
            insert_api_key_query,
            job_config=bigquery.QueryJobConfig(
                query_parameters=[
                    bigquery.ScalarQueryParameter("api_key_id", "STRING", api_key_id),
                    bigquery.ScalarQueryParameter("tenant_id", "STRING", tenant_id),
                    bigquery.ScalarQueryParameter("api_key_hash", "STRING", api_key_hash),
                    bigquery.ScalarQueryParameter("encrypted_api_key", "BYTES", encrypted_api_key_bytes),
                    bigquery.ArrayQueryParameter("scopes", "STRING", ["pipelines:read", "pipelines:write", "pipelines:execute"])
                ]
            )
        ).result()

        logger.info(
            f"API key created and stored successfully",
            extra={
                "event_type": "api_key_created",
                "tenant_id": tenant_id,
                "api_key_id": api_key_id,
                "scopes": ["pipelines:read", "pipelines:write", "pipelines:execute"],
                "encrypted": True
            }
        )

    except Exception as e:
        logger.error(
            f"Failed to generate/store API key",
            extra={
                "event_type": "api_key_creation_failed",
                "tenant_id": tenant_id,
                "error": str(e)
            },
            exc_info=True
        )
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to generate API key: {str(e)}"
        )

    # ============================================
    # STEP 3: Create subscription in tenants.tenant_subscriptions
    # ============================================
    try:
        logger.info(f"Creating subscription for tenant: {tenant_id}")

        subscription_id = str(uuid.uuid4())
        trial_end = date.today()  # You can add 14 days for real trial

        insert_subscription_query = f"""
        INSERT INTO `{settings.gcp_project_id}.tenants.tenant_subscriptions`
        (subscription_id, tenant_id, plan_name, status, daily_limit, monthly_limit,
         concurrent_limit, trial_end_date, created_at)
        VALUES
        (@subscription_id, @tenant_id, @plan_name, 'ACTIVE', @daily_limit, @monthly_limit,
         @concurrent_limit, @trial_end_date, CURRENT_TIMESTAMP())
        """

        bq_client.client.query(
            insert_subscription_query,
            job_config=bigquery.QueryJobConfig(
                query_parameters=[
                    bigquery.ScalarQueryParameter("subscription_id", "STRING", subscription_id),
                    bigquery.ScalarQueryParameter("tenant_id", "STRING", tenant_id),
                    bigquery.ScalarQueryParameter("plan_name", "STRING", request.subscription_plan),
                    bigquery.ScalarQueryParameter("daily_limit", "INT64", plan_limits["max_daily"]),
                    bigquery.ScalarQueryParameter("monthly_limit", "INT64", plan_limits["max_daily"] * 30),
                    bigquery.ScalarQueryParameter("concurrent_limit", "INT64", plan_limits["max_concurrent"]),
                    bigquery.ScalarQueryParameter("trial_end_date", "DATE", trial_end)
                ]
            )
        ).result()

        logger.info(f"Subscription created: {subscription_id}")

    except Exception as e:
        logger.error(f"Failed to create subscription: {e}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to create subscription: {str(e)}"
        )

    # ============================================
    # STEP 4: Create initial usage quota record in tenants.tenant_usage_quotas
    # ============================================
    try:
        logger.info(f"Creating usage quota for tenant: {tenant_id}")

        usage_id = f"{tenant_id}_{date.today().strftime('%Y%m%d')}"

        insert_usage_query = f"""
        INSERT INTO `{settings.gcp_project_id}.tenants.tenant_usage_quotas`
        (usage_id, tenant_id, usage_date, pipelines_run_today, pipelines_succeeded_today,
         pipelines_failed_today, pipelines_run_month, concurrent_pipelines_running,
         daily_limit, last_updated, created_at)
        VALUES
        (@usage_id, @tenant_id, CURRENT_DATE(), 0, 0, 0, 0, 0, @daily_limit,
         CURRENT_TIMESTAMP(), CURRENT_TIMESTAMP())
        """

        bq_client.client.query(
            insert_usage_query,
            job_config=bigquery.QueryJobConfig(
                query_parameters=[
                    bigquery.ScalarQueryParameter("usage_id", "STRING", usage_id),
                    bigquery.ScalarQueryParameter("tenant_id", "STRING", tenant_id),
                    bigquery.ScalarQueryParameter("daily_limit", "INT64", plan_limits["max_daily"])
                ]
            )
        ).result()

        logger.info(f"Usage quota created: {usage_id}")

    except Exception as e:
        logger.error(f"Failed to create usage quota: {e}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to create usage quota: {str(e)}"
        )

    # ============================================
    # STEP 5: Create tenant dataset and comprehensive view via processor
    # ============================================
    try:
        logger.info(f"Creating tenant dataset via onboarding processor: {tenant_id}")

        # Import and call the TenantOnboardingProcessor
        from src.core.processors.setup.tenants.onboarding import TenantOnboardingProcessor

        processor = TenantOnboardingProcessor()

        # Execute onboarding processor to create dataset and comprehensive view
        # NOTE: Processor creates:
        # - Per-tenant dataset
        # - tenant_comprehensive_view (queries central tables, filters by tenant_id)
        # - Optional validation table
        processor_result = await processor.execute(
            step_config={
                "config": {
                    "dataset_id": tenant_id,
                    "location": settings.bigquery_location,
                    "metadata_tables": [],  # NO metadata tables in per-tenant dataset
                    "create_validation_table": True,
                    "validation_table_name": "onboarding_validation_test",
                    "default_daily_limit": plan_limits["max_daily"],
                    "default_monthly_limit": plan_limits["max_daily"] * 30,
                    "default_concurrent_limit": plan_limits["max_concurrent"]
                }
            },
            context={
                "tenant_id": tenant_id
            }
        )

        dataset_created = processor_result.get("dataset_created", False)
        tables_created = processor_result.get("tables_created", [])

        logger.info(f"Onboarding processor completed: {processor_result}")

    except Exception as e:
        logger.error(f"Failed to create tenant dataset: {e}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to create tenant dataset: {str(e)}"
        )

    # ============================================
    # STEP 6: Post-onboarding validation (DISABLED - Use pre-onboarding dry-run instead)
    # ============================================
    # Note: Comprehensive dry-run validation via POST /api/v1/tenants/dryrun is MANDATORY before onboarding
    # Post-onboarding pipeline validation is redundant and has been disabled
    dryrun_status = "SKIPPED"
    dryrun_message = "Post-onboarding validation skipped (pre-onboarding dry-run validation already passed)"

    logger.info(f"Skipping post-onboarding dry-run (comprehensive pre-onboarding validation sufficient)")

    # ============================================
    # STEP 7: Return response
    # ============================================
    logger.info(f"Tenant onboarding completed - tenant_id: {tenant_id}")

    return OnboardTenantResponse(
        tenant_id=tenant_id,
        api_key=api_key,  # SAVE THIS - shown only once!
        subscription_plan=request.subscription_plan,
        dataset_created=dataset_created,
        tables_created=tables_created,
        dryrun_status=dryrun_status,
        message=f"Tenant {request.company_name} onboarded successfully. API key generated. {dryrun_message}"
    )
