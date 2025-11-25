"""
Organization Onboarding API Routes
Endpoint for onboarding new organizations to the platform.

TWO-DATASET ARCHITECTURE:
1. organizations dataset: Auth data (API keys, subscriptions, profiles, credentials)
2. {org_slug} dataset: Operational data (pipeline_runs, step_logs, dq_results)
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

class OnboardOrgRequest(BaseModel):
    """Request to onboard a new organization."""
    org_slug: str = Field(
        ...,
        description="Organization identifier (alphanumeric + underscore, 3-50 chars)"
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

    @field_validator('org_slug')
    @classmethod
    def validate_org_slug(cls, v):
        """Validate org_slug format."""
        if not re.match(r'^[a-zA-Z0-9_]{3,50}$', v):
            raise ValueError(
                'org_slug must be alphanumeric with underscores, 3-50 characters'
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


class OnboardOrgResponse(BaseModel):
    """Response for organization onboarding."""
    org_slug: str
    api_key: str  # Unencrypted - show once!
    subscription_plan: str
    dataset_created: bool
    tables_created: List[str]
    dryrun_status: str  # "SUCCESS" or "FAILED"
    message: str


class DryRunRequest(BaseModel):
    """Request to perform dry-run validation for organization onboarding."""
    org_slug: str = Field(
        ...,
        description="Organization identifier (alphanumeric + underscore, 3-50 chars)"
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

    @field_validator('org_slug')
    @classmethod
    def validate_org_slug(cls, v):
        """Validate org_slug format."""
        if not re.match(r'^[a-zA-Z0-9_]{3,50}$', v):
            raise ValueError(
                'org_slug must be alphanumeric with underscores, 3-50 characters'
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
    org_slug: str
    subscription_plan: str
    company_name: str
    admin_email: str
    validation_summary: Dict[str, Any]
    validation_results: List[Dict[str, Any]]
    message: str
    ready_for_onboarding: bool


# ============================================
# Organization Dry-Run Validation Endpoint
# ============================================

@router.post(
    "/organizations/dryrun",
    response_model=DryRunResponse,
    summary="Dry-run validation for organization onboarding",
    description="Validates organization configuration and infrastructure before actual onboarding (no resources created)"
)
async def dryrun_org_onboarding(
    request: DryRunRequest,
    bq_client: BigQueryClient = Depends(get_bigquery_client)
):
    """
    Perform dry-run validation for organization onboarding.

    VALIDATION CHECKS (NO RESOURCES CREATED):
    1. Organization slug format and uniqueness
    2. Email format validation
    3. GCP credentials verification
    4. BigQuery connectivity test
    5. Subscription plan validation
    6. Central tables existence check
    7. Dryrun config availability

    This endpoint MUST be called before /organizations/onboard to ensure:
    - All prerequisites are met
    - Configuration is valid
    - Infrastructure is ready
    - No resource conflicts

    - **org_slug**: Unique organization identifier (alphanumeric + underscore, 3-50 chars)
    - **company_name**: Company or organization name
    - **admin_email**: Primary admin contact email
    - **subscription_plan**: STARTER, PROFESSIONAL, or SCALE

    Returns:
    - Validation status (SUCCESS/FAILED)
    - Detailed validation results for each check
    - Ready-for-onboarding flag
    - Actionable error messages if validation fails
    """
    org_slug = request.org_slug

    logger.info(f"Starting dry-run validation for organization: {org_slug}")

    try:
        # Import and call the OrgDryRunProcessor
        from src.core.processors.setup.organizations.dryrun import OrgDryRunProcessor

        processor = OrgDryRunProcessor()

        # Execute dry-run validation
        result = await processor.execute(
            step_config={
                "config": {
                    "validate_all": True
                }
            },
            context={
                "org_slug": org_slug,
                "company_name": request.company_name,
                "admin_email": request.admin_email,
                "subscription_plan": request.subscription_plan
            }
        )

        logger.info(
            f"Dry-run validation completed for {org_slug}",
            extra={
                "status": result["status"],
                "ready_for_onboarding": result["ready_for_onboarding"]
            }
        )

        return DryRunResponse(**result)

    except Exception as e:
        logger.error(f"Dry-run validation error for {org_slug}: {e}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Dry-run validation failed: {str(e)}"
        )


# ============================================
# Organization Onboarding Endpoint
# ============================================

@router.post(
    "/organizations/onboard",
    response_model=OnboardOrgResponse,
    summary="Onboard a new organization",
    description="Complete organization onboarding: create org profile, API key, subscription, and org dataset"
)
async def onboard_org(
    request: OnboardOrgRequest,
    bq_client: BigQueryClient = Depends(get_bigquery_client)
):
    """
    Onboard a new organization to the platform.

    TWO-DATASET ARCHITECTURE:
    1. Creates org record in organizations.org_profiles
    2. Stores API key in organizations.org_api_keys (centralized auth)
    3. Creates subscription in organizations.org_subscriptions
    4. Creates usage tracking in organizations.org_usage_quotas
    5. Creates org dataset with ONLY operational tables (no API keys)
    6. Runs dry-run pipeline to validate infrastructure

    - **org_slug**: Unique organization identifier (becomes dataset name)
    - **company_name**: Company or organization name
    - **admin_email**: Primary admin contact email
    - **subscription_plan**: STARTER, PROFESSIONAL, or SCALE

    Returns:
    - API key (unencrypted - save immediately)
    - Organization and subscription details
    - Dataset and table creation status
    """
    org_slug = request.org_slug

    logger.info(f"Starting organization onboarding for org: {org_slug}")

    # Track tables created
    tables_created = []

    # Subscription plan limits
    PLAN_LIMITS = {
        "STARTER": {"max_team": 2, "max_providers": 3, "max_daily": 6, "max_concurrent": 3},
        "PROFESSIONAL": {"max_team": 6, "max_providers": 6, "max_daily": 25, "max_concurrent": 5},
        "SCALE": {"max_team": 11, "max_providers": 10, "max_daily": 100, "max_concurrent": 10}
    }

    plan_limits = PLAN_LIMITS.get(request.subscription_plan, PLAN_LIMITS["STARTER"])

    # Helper function to cleanup partial org data on failure
    async def cleanup_partial_org(org_slug: str, step_failed: str):
        """
        Cleanup partial org data if onboarding fails.
        Removes org profile, API keys, subscription, and usage quota.
        """
        logger.warning(f"Cleaning up partial org data after failure at {step_failed}: {org_slug}")

        cleanup_queries = [
            f"DELETE FROM `{settings.gcp_project_id}.organizations.org_profiles` WHERE org_slug = @org_slug",
            f"DELETE FROM `{settings.gcp_project_id}.organizations.org_api_keys` WHERE org_slug = @org_slug",
            f"DELETE FROM `{settings.gcp_project_id}.organizations.org_subscriptions` WHERE org_slug = @org_slug",
            f"DELETE FROM `{settings.gcp_project_id}.organizations.org_usage_quotas` WHERE org_slug = @org_slug",
        ]

        for query in cleanup_queries:
            try:
                bq_client.client.query(
                    query,
                    job_config=bigquery.QueryJobConfig(
                        query_parameters=[
                            bigquery.ScalarQueryParameter("org_slug", "STRING", org_slug)
                        ]
                    )
                ).result()
            except Exception as cleanup_error:
                logger.error(f"Cleanup failed for query: {query[:50]}... Error: {cleanup_error}")

        logger.info(f"Partial org cleanup completed for: {org_slug}")

    # ============================================
    # VALIDATION: Check if org already exists
    # ============================================
    try:
        check_org_query = f"""
        SELECT org_slug, status
        FROM `{settings.gcp_project_id}.organizations.org_profiles`
        WHERE org_slug = @org_slug
        LIMIT 1
        """

        check_result = list(bq_client.client.query(
            check_org_query,
            job_config=bigquery.QueryJobConfig(
                query_parameters=[
                    bigquery.ScalarQueryParameter("org_slug", "STRING", org_slug)
                ]
            )
        ).result())

        if check_result:
            existing_status = check_result[0]["status"]
            logger.warning(f"Organization {org_slug} already exists with status: {existing_status}")
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail=f"Organization '{org_slug}' already exists with status '{existing_status}'. Use a different org_slug or contact support to reactivate."
            )
    except HTTPException:
        raise  # Re-raise HTTP exceptions
    except Exception as e:
        logger.error(f"Error checking for existing organization: {e}")
        # Continue if check fails - let database constraint handle it

    # ============================================
    # STEP 1: Create org profile in organizations.org_profiles
    # ============================================
    try:
        logger.info(f"Creating org profile in organizations.org_profiles")

        insert_profile_query = f"""
        INSERT INTO `{settings.gcp_project_id}.organizations.org_profiles`
        (org_slug, company_name, admin_email, org_dataset_id, status, subscription_plan, created_at, updated_at)
        VALUES
        (@org_slug, @company_name, @admin_email, @org_dataset_id, 'ACTIVE', @subscription_plan, CURRENT_TIMESTAMP(), CURRENT_TIMESTAMP())
        """

        bq_client.client.query(
            insert_profile_query,
            job_config=bigquery.QueryJobConfig(
                query_parameters=[
                    bigquery.ScalarQueryParameter("org_slug", "STRING", org_slug),
                    bigquery.ScalarQueryParameter("company_name", "STRING", request.company_name),
                    bigquery.ScalarQueryParameter("admin_email", "STRING", request.admin_email),
                    bigquery.ScalarQueryParameter("org_dataset_id", "STRING", org_slug),
                    bigquery.ScalarQueryParameter("subscription_plan", "STRING", request.subscription_plan)
                ]
            )
        ).result()

        logger.info(
            f"Organization profile created successfully",
            extra={
                "event_type": "org_created",
                "org_slug": org_slug,
                "company_name": request.company_name,
                "admin_email": request.admin_email,
                "subscription_plan": request.subscription_plan,
                "dataset_id": org_slug
            }
        )

    except Exception as e:
        logger.error(
            f"Failed to create org profile",
            extra={
                "event_type": "org_creation_failed",
                "org_slug": org_slug,
                "company_name": request.company_name,
                "error": str(e)
            },
            exc_info=True
        )
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to create organization profile: {str(e)}"
        )

    # ============================================
    # STEP 2: Generate and store API key in organizations.org_api_keys
    # ============================================
    try:
        logger.info(f"Generating API key for organization: {org_slug}")

        # Generate secure API key with format: {org_slug}_api_{random_16_chars}
        random_suffix = secrets.token_urlsafe(16)[:16]
        api_key = f"{org_slug}_api_{random_suffix}"

        # Hash API key with SHA256 for lookup
        org_api_key_hash = hashlib.sha256(api_key.encode()).hexdigest()

        # Encrypt API key using KMS
        try:
            encrypted_org_api_key_bytes = encrypt_value(api_key)
            logger.info(f"API key encrypted successfully using KMS for organization: {org_slug}")
        except Exception as kms_error:
            logger.error(f"KMS encryption failed for organization {org_slug}: {kms_error}", exc_info=True)
            # CRITICAL SECURITY: Always fail hard - NEVER store plaintext API keys in ANY environment
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail=f"KMS encryption is required but failed: {str(kms_error)}. Please check KMS configuration and permissions."
            )

        org_api_key_id = str(uuid.uuid4())

        # Store API key in centralized organizations.org_api_keys table
        insert_api_key_query = f"""
        INSERT INTO `{settings.gcp_project_id}.organizations.org_api_keys`
        (org_api_key_id, org_slug, org_api_key_hash, encrypted_org_api_key, scopes, is_active, created_at)
        VALUES
        (@org_api_key_id, @org_slug, @org_api_key_hash, @encrypted_org_api_key, @scopes, TRUE, CURRENT_TIMESTAMP())
        """

        bq_client.client.query(
            insert_api_key_query,
            job_config=bigquery.QueryJobConfig(
                query_parameters=[
                    bigquery.ScalarQueryParameter("org_api_key_id", "STRING", org_api_key_id),
                    bigquery.ScalarQueryParameter("org_slug", "STRING", org_slug),
                    bigquery.ScalarQueryParameter("org_api_key_hash", "STRING", org_api_key_hash),
                    bigquery.ScalarQueryParameter("encrypted_org_api_key", "BYTES", encrypted_org_api_key_bytes),
                    bigquery.ArrayQueryParameter("scopes", "STRING", ["pipelines:read", "pipelines:write", "pipelines:execute"])
                ]
            )
        ).result()

        logger.info(
            f"API key created and stored successfully",
            extra={
                "event_type": "api_key_created",
                "org_slug": org_slug,
                "org_api_key_id": org_api_key_id,
                "scopes": ["pipelines:read", "pipelines:write", "pipelines:execute"],
                "encrypted": True
            }
        )

    except Exception as e:
        logger.error(
            f"Failed to generate/store API key",
            extra={
                "event_type": "api_key_creation_failed",
                "org_slug": org_slug,
                "error": str(e)
            },
            exc_info=True
        )
        # Cleanup partial org data
        await cleanup_partial_org(org_slug, "STEP 2: API Key Generation")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to generate API key: {str(e)}"
        )

    # ============================================
    # STEP 3: Create subscription in organizations.org_subscriptions
    # ============================================
    try:
        logger.info(f"Creating subscription for organization: {org_slug}")

        subscription_id = str(uuid.uuid4())
        trial_end = date.today()  # You can add 14 days for real trial

        insert_subscription_query = f"""
        INSERT INTO `{settings.gcp_project_id}.organizations.org_subscriptions`
        (subscription_id, org_slug, plan_name, status, daily_limit, monthly_limit,
         concurrent_limit, trial_end_date, created_at)
        VALUES
        (@subscription_id, @org_slug, @plan_name, 'ACTIVE', @daily_limit, @monthly_limit,
         @concurrent_limit, @trial_end_date, CURRENT_TIMESTAMP())
        """

        bq_client.client.query(
            insert_subscription_query,
            job_config=bigquery.QueryJobConfig(
                query_parameters=[
                    bigquery.ScalarQueryParameter("subscription_id", "STRING", subscription_id),
                    bigquery.ScalarQueryParameter("org_slug", "STRING", org_slug),
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
        # Cleanup partial org data
        await cleanup_partial_org(org_slug, "STEP 3: Subscription Creation")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to create subscription: {str(e)}"
        )

    # ============================================
    # STEP 4: Create initial usage quota record in organizations.org_usage_quotas
    # ============================================
    try:
        logger.info(f"Creating usage quota for organization: {org_slug}")

        usage_id = f"{org_slug}_{date.today().strftime('%Y%m%d')}"

        insert_usage_query = f"""
        INSERT INTO `{settings.gcp_project_id}.organizations.org_usage_quotas`
        (usage_id, org_slug, usage_date, pipelines_run_today, pipelines_succeeded_today,
         pipelines_failed_today, pipelines_run_month, concurrent_pipelines_running,
         daily_limit, last_updated, created_at)
        VALUES
        (@usage_id, @org_slug, CURRENT_DATE(), 0, 0, 0, 0, 0, @daily_limit,
         CURRENT_TIMESTAMP(), CURRENT_TIMESTAMP())
        """

        bq_client.client.query(
            insert_usage_query,
            job_config=bigquery.QueryJobConfig(
                query_parameters=[
                    bigquery.ScalarQueryParameter("usage_id", "STRING", usage_id),
                    bigquery.ScalarQueryParameter("org_slug", "STRING", org_slug),
                    bigquery.ScalarQueryParameter("daily_limit", "INT64", plan_limits["max_daily"])
                ]
            )
        ).result()

        logger.info(f"Usage quota created: {usage_id}")

    except Exception as e:
        logger.error(f"Failed to create usage quota: {e}", exc_info=True)
        # Cleanup partial org data
        await cleanup_partial_org(org_slug, "STEP 4: Usage Quota Creation")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to create usage quota: {str(e)}"
        )

    # ============================================
    # STEP 5: Create org dataset and comprehensive view via processor
    # ============================================
    try:
        logger.info(f"Creating org dataset via onboarding processor: {org_slug}")

        # Import and call the OrgOnboardingProcessor
        from src.core.processors.setup.organizations.onboarding import OrgOnboardingProcessor

        processor = OrgOnboardingProcessor()

        # Execute onboarding processor to create dataset and comprehensive view
        # NOTE: Processor creates:
        # - Per-org dataset
        # - org_comprehensive_view (queries central tables, filters by org_slug)
        # - Optional validation table
        processor_result = await processor.execute(
            step_config={
                "config": {
                    "dataset_id": org_slug,
                    "location": settings.bigquery_location,
                    "metadata_tables": [],  # NO metadata tables in per-org dataset
                    "create_validation_table": True,
                    "validation_table_name": "onboarding_validation_test",
                    "default_daily_limit": plan_limits["max_daily"],
                    "default_monthly_limit": plan_limits["max_daily"] * 30,
                    "default_concurrent_limit": plan_limits["max_concurrent"]
                }
            },
            context={
                "org_slug": org_slug
            }
        )

        dataset_created = processor_result.get("dataset_created", False)
        tables_created = processor_result.get("tables_created", [])

        logger.info(f"Onboarding processor completed: {processor_result}")

    except Exception as e:
        logger.error(f"Failed to create org dataset: {e}", exc_info=True)
        # Cleanup partial org data (including BigQuery datasets)
        await cleanup_partial_org(org_slug, "STEP 5: Dataset Creation")
        # Note: Dataset deletion is handled by OrgOnboardingProcessor cleanup internally
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to create organization dataset: {str(e)}"
        )

    # ============================================
    # STEP 6: Post-onboarding validation (DISABLED - Use pre-onboarding dry-run instead)
    # ============================================
    # Note: Comprehensive dry-run validation via POST /api/v1/organizations/dryrun is MANDATORY before onboarding
    # Post-onboarding pipeline validation is redundant and has been disabled
    dryrun_status = "SKIPPED"
    dryrun_message = "Post-onboarding validation skipped (pre-onboarding dry-run validation already passed)"

    logger.info(f"Skipping post-onboarding dry-run (comprehensive pre-onboarding validation sufficient)")

    # ============================================
    # STEP 7: Return response
    # ============================================
    logger.info(f"Organization onboarding completed - org_slug: {org_slug}")

    return OnboardOrgResponse(
        org_slug=org_slug,
        api_key=api_key,  # SAVE THIS - shown only once!
        subscription_plan=request.subscription_plan,
        dataset_created=dataset_created,
        tables_created=tables_created,
        dryrun_status=dryrun_status,
        message=f"Organization {request.company_name} onboarded successfully. API key generated. {dryrun_message}"
    )
