"""
Organization Onboarding API Routes
Endpoint for onboarding new organizations to the platform.

TWO-DATASET ARCHITECTURE:
1. organizations dataset: Auth data (API keys, subscriptions, profiles, credentials)
2. {org_slug} dataset: Operational data (pipeline_runs, step_logs, dq_results)
"""

from fastapi import APIRouter, Depends, HTTPException, status, Header, Query
from pydantic import BaseModel, Field, field_validator, EmailStr, ConfigDict
from typing import List, Optional, Dict, Any, Union
from datetime import datetime, date, timedelta
import hashlib
import secrets
import re
import logging
from pathlib import Path

from src.core.engine.bq_client import get_bigquery_client, BigQueryClient
from src.core.security.kms_encryption import encrypt_value
from src.app.config import settings
from src.app.dependencies.auth import get_current_org, get_org_or_admin_auth, AuthResult, verify_admin_key
from src.app.models.org_models import SUBSCRIPTION_LIMITS, SubscriptionPlan, UpdateLimitsRequest, UpdateOrgLocaleRequest, OrgLocaleResponse
from src.app.models.i18n_models import (
    SupportedCurrency,
    SUPPORTED_TIMEZONES,
    DEFAULT_CURRENCY,
    DEFAULT_TIMEZONE,
    DEFAULT_LANGUAGE,
    DEFAULT_COUNTRY,
    get_country_from_currency,
    get_currency_symbol,
    get_currency_decimals,
    CURRENCY_METADATA,
    timezone_validator,
)
from src.core.utils.audit_logger import log_create, log_update, log_delete, log_audit, AuditLogger
from src.core.utils.error_handling import safe_error_response
from src.core.utils.validators import validate_org_slug, validate_email
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
        min_length=2,
        max_length=200,
        description="Company or organization name"
    )
    admin_email: EmailStr = Field(
        ...,
        description="Primary admin contact email"
    )
    subscription_plan: str = Field(
        default="STARTER",
        description="Subscription plan: STARTER, PROFESSIONAL, SCALE"
    )
    # i18n fields (set at signup)
    default_currency: str = Field(
        default=DEFAULT_CURRENCY.value,
        description="ISO 4217 currency code (e.g., USD, EUR, AED). Selected at signup."
    )
    default_timezone: str = Field(
        default="UTC",
        description="IANA timezone (e.g., UTC, Asia/Dubai). Selected at signup."
    )
    dataset_location: Optional[str] = Field(
        default=None,
        description="BigQuery dataset location (e.g., US, EU, asia-northeast1). Defaults to server config."
    )
    force_recreate_dataset: bool = Field(
        default=False,
        description="If True, delete and recreate the entire dataset (DESTRUCTIVE)"
    )
    force_recreate_tables: bool = Field(
        default=False,
        description="If True, delete and recreate all metadata tables (DESTRUCTIVE)"
    )
    regenerate_api_key_if_exists: bool = Field(
        default=False,
        description="If True and org already exists, regenerate API key instead of returning 409"
    )

    model_config = ConfigDict(extra="forbid")

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

    @field_validator('default_currency')
    @classmethod
    def validate_default_currency(cls, v):
        """Validate currency is supported."""
        try:
            SupportedCurrency(v)
            return v
        except ValueError:
            supported = [c.value for c in SupportedCurrency]
            raise ValueError(f'Unsupported currency: {v}. Supported: {", ".join(supported)}')

    @field_validator('default_timezone')
    @classmethod
    def validate_default_timezone(cls, v):
        """Validate timezone is supported."""
        return timezone_validator(v)


class OnboardOrgResponse(BaseModel):
    """Response for organization onboarding."""
    org_slug: str
    api_key: str  # Unencrypted - show once!
    subscription_plan: str
    # i18n fields
    default_currency: str = DEFAULT_CURRENCY.value
    default_country: str = DEFAULT_COUNTRY
    default_language: str = DEFAULT_LANGUAGE.value
    default_timezone: str = DEFAULT_TIMEZONE
    dataset_location: str  # (#49) Where the dataset was created
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
        min_length=2,
        max_length=200,
        description="Company or organization name"
    )
    admin_email: EmailStr = Field(
        ...,
        description="Primary admin contact email"
    )
    subscription_plan: str = Field(
        default="STARTER",
        description="Subscription plan: STARTER, PROFESSIONAL, SCALE"
    )

    model_config = ConfigDict(extra="forbid")

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


class OrgDatasetStatusResponse(BaseModel):
    """Response for org dataset status check."""
    org_slug: str
    status: str  # SYNCED, OUT_OF_SYNC, NOT_FOUND, PROFILE_ONLY
    dataset_exists: bool
    profile_exists: bool
    tables_expected: int
    tables_existing: List[str]
    tables_missing: List[str]
    schema_diffs: Dict[str, Any] = Field(default_factory=dict)
    message: str


class OrgDatasetSyncRequest(BaseModel):
    """Request to sync org dataset (create missing tables/columns)."""
    sync_missing_tables: bool = Field(
        default=True,
        description="Create tables that are missing from BigQuery"
    )
    sync_missing_columns: bool = Field(
        default=False,
        description="Add missing columns to existing tables (non-destructive)"
    )
    recreate_views: bool = Field(
        default=False,
        description="Recreate materialized views if they're missing or outdated"
    )


class OrgDatasetSyncResponse(BaseModel):
    """Response from org dataset sync operation."""
    org_slug: str
    status: str
    dataset_created: bool
    tables_created: List[str]
    columns_added: Dict[str, List[str]] = Field(default_factory=dict)
    views_created: List[str] = Field(default_factory=list)
    errors: List[str] = Field(default_factory=list)
    message: str


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
    _: None = Depends(verify_admin_key),  # SECURITY: Require admin key for dry-run
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
            detail="Dry-run validation failed. Please check server logs for details."
        )


# ============================================
# Organization Dataset Status & Sync Endpoints
# ============================================

@router.get(
    "/organizations/{org_slug}/status",
    response_model=OrgDatasetStatusResponse,
    summary="Check org dataset sync status",
    description="Check if org dataset and tables are in sync with configuration"
)
async def get_org_dataset_status(
    org_slug: str,
    _: None = Depends(verify_admin_key),
    bq_client: BigQueryClient = Depends(get_bigquery_client)
):
    """
    Check organization dataset status and identify any missing tables or schema differences.

    Use this to verify if org needs re-syncing (e.g., after dataset deletion).

    Returns:
    - **status**: SYNCED, OUT_OF_SYNC, NOT_FOUND, PROFILE_ONLY
    - **tables_missing**: Tables in config but not in BigQuery
    - **schema_diffs**: Columns that differ between config and BigQuery
    """
    try:
        import json

        # Check if org profile exists in central dataset
        check_profile_query = f"""
        SELECT org_slug, status, org_dataset_id
        FROM `{settings.gcp_project_id}.organizations.org_profiles`
        WHERE org_slug = @org_slug
        LIMIT 1
        """

        profile_result = list(bq_client.client.query(
            check_profile_query,
            job_config=bigquery.QueryJobConfig(
                query_parameters=[
                    bigquery.ScalarQueryParameter("org_slug", "STRING", org_slug)
                ]
            )
        ).result())

        profile_exists = len(profile_result) > 0

        if not profile_exists:
            return OrgDatasetStatusResponse(
                org_slug=org_slug,
                status="NOT_FOUND",
                dataset_exists=False,
                profile_exists=False,
                tables_expected=0,
                tables_existing=[],
                tables_missing=[],
                schema_diffs={},
                message=f"Organization '{org_slug}' not found. Run onboard first."
            )

        # Get expected dataset ID
        dataset_id = settings.get_org_dataset_name(org_slug)
        full_dataset_id = f"{settings.gcp_project_id}.{dataset_id}"

        # Check if dataset exists
        try:
            bq_client.client.get_dataset(full_dataset_id)
            dataset_exists = True
        except Exception:
            return OrgDatasetStatusResponse(
                org_slug=org_slug,
                status="PROFILE_ONLY",
                dataset_exists=False,
                profile_exists=True,
                tables_expected=0,
                tables_existing=[],
                tables_missing=["(entire dataset)"],
                schema_diffs={},
                message=f"Org profile exists but dataset '{dataset_id}' not found. Run sync to recreate."
            )

        # Get expected tables from onboarding config
        schemas_dir = Path(__file__).parent.parent.parent.parent / "configs" / "setup" / "organizations" / "onboarding" / "schemas"

        expected_tables = set()
        if schemas_dir.exists():
            for schema_file in schemas_dir.glob("*.json"):
                expected_tables.add(schema_file.stem)

        # Get existing tables
        existing_tables = set()
        for table in bq_client.client.list_tables(full_dataset_id):
            existing_tables.add(table.table_id)

        tables_missing = list(expected_tables - existing_tables)

        # Check schema differences
        schema_diffs = {}
        for table_name in expected_tables & existing_tables:
            schema_file = schemas_dir / f"{table_name}.json"
            if not schema_file.exists():
                continue

            with open(schema_file, 'r') as f:
                expected_schema = json.load(f)

            expected_columns = {field['name'] for field in expected_schema}

            table_ref = f"{full_dataset_id}.{table_name}"
            try:
                table = bq_client.client.get_table(table_ref)
                actual_columns = {field.name for field in table.schema}

                missing_columns = list(expected_columns - actual_columns)
                extra_columns = list(actual_columns - expected_columns)

                if missing_columns or extra_columns:
                    schema_diffs[table_name] = {
                        "missing_columns": missing_columns,
                        "extra_columns": extra_columns
                    }
            except Exception as e:
                logger.warning(f"Could not check schema for {table_name}: {e}")

        # Determine status
        if tables_missing or schema_diffs:
            status_val = "OUT_OF_SYNC"
            message = f"Org dataset out of sync: {len(tables_missing)} tables missing, {len(schema_diffs)} tables with schema differences"
        else:
            status_val = "SYNCED"
            message = f"Org dataset in sync: {len(existing_tables)} tables present"

        return OrgDatasetStatusResponse(
            org_slug=org_slug,
            status=status_val,
            dataset_exists=dataset_exists,
            profile_exists=profile_exists,
            tables_expected=len(expected_tables),
            tables_existing=list(existing_tables),
            tables_missing=tables_missing,
            schema_diffs=schema_diffs,
            message=message
        )

    except Exception as e:
        logger.error(f"Failed to check org dataset status: {e}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to check org dataset status. Please check server logs."
        )


@router.post(
    "/organizations/{org_slug}/sync",
    response_model=OrgDatasetSyncResponse,
    summary="Sync org dataset",
    description="Non-destructive sync: create missing dataset/tables and optionally add missing columns"
)
async def sync_org_dataset(
    org_slug: str,
    request: OrgDatasetSyncRequest,
    _: None = Depends(verify_admin_key),
    bq_client: BigQueryClient = Depends(get_bigquery_client)
):
    """
    Sync organization dataset without deleting existing data.

    Use case: When org dataset is deleted in BigQuery but profile still exists,
    this recreates the dataset and all tables.

    - Creates missing dataset if it doesn't exist
    - Creates missing tables from config
    - Optionally adds missing columns to existing tables
    - Optionally recreates materialized views

    NEVER deletes existing data.
    """
    try:
        import json

        # Verify org profile exists
        check_profile_query = f"""
        SELECT org_slug, status
        FROM `{settings.gcp_project_id}.organizations.org_profiles`
        WHERE org_slug = @org_slug
        LIMIT 1
        """

        profile_result = list(bq_client.client.query(
            check_profile_query,
            job_config=bigquery.QueryJobConfig(
                query_parameters=[
                    bigquery.ScalarQueryParameter("org_slug", "STRING", org_slug)
                ]
            )
        ).result())

        if not profile_result:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Organization '{org_slug}' not found. Use /organizations/onboard first."
            )

        if profile_result[0]["status"] != "ACTIVE":
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Organization '{org_slug}' is not active. Contact support."
            )

        dataset_id = settings.get_org_dataset_name(org_slug)
        full_dataset_id = f"{settings.gcp_project_id}.{dataset_id}"

        tables_created = []
        columns_added = {}
        views_created = []
        errors = []
        dataset_created = False

        # Ensure dataset exists
        try:
            bq_client.client.get_dataset(full_dataset_id)
        except Exception:
            # Create dataset
            dataset = bigquery.Dataset(full_dataset_id)
            dataset.location = settings.bigquery_location
            dataset.description = f"Dataset for organization {org_slug}"
            bq_client.client.create_dataset(dataset)
            dataset_created = True
            logger.info(f"Created dataset: {full_dataset_id}")

        # Get schema files
        schemas_dir = Path(__file__).parent.parent.parent.parent / "configs" / "setup" / "organizations" / "onboarding" / "schemas"

        if not schemas_dir.exists():
            return OrgDatasetSyncResponse(
                org_slug=org_slug,
                status="PARTIAL",
                dataset_created=dataset_created,
                tables_created=[],
                columns_added={},
                views_created=[],
                errors=["Schema directory not found"],
                message="Dataset created but no schema files found"
            )

        # Get existing tables
        existing_tables = set()
        for table in bq_client.client.list_tables(full_dataset_id):
            existing_tables.add(table.table_id)

        # Process each schema file
        for schema_file in schemas_dir.glob("*.json"):
            table_name = schema_file.stem

            with open(schema_file, 'r') as f:
                schema_json = json.load(f)

            schema = [bigquery.SchemaField.from_api_repr(field) for field in schema_json]
            table_id = f"{full_dataset_id}.{table_name}"

            if table_name not in existing_tables:
                # Create missing table
                if request.sync_missing_tables:
                    try:
                        table = bigquery.Table(table_id, schema=schema)
                        table.description = f"Table: {table_name}"
                        bq_client.client.create_table(table)
                        tables_created.append(table_name)
                        logger.info(f"Created table: {table_id}")
                    except Exception as e:
                        errors.append(f"Failed to create {table_name}: {str(e)}")
            else:
                # Check for missing columns
                if request.sync_missing_columns:
                    try:
                        existing_table = bq_client.client.get_table(table_id)
                        existing_columns = {field.name for field in existing_table.schema}
                        expected_columns = {field['name'] for field in schema_json}

                        missing_columns = expected_columns - existing_columns

                        if missing_columns:
                            for col_name in missing_columns:
                                col_def = next((f for f in schema_json if f['name'] == col_name), None)
                                if col_def:
                                    col_type = col_def['type']

                                    alter_sql = f"""
                                    ALTER TABLE `{table_id}`
                                    ADD COLUMN IF NOT EXISTS {col_name} {col_type}
                                    """

                                    try:
                                        bq_client.client.query(alter_sql).result()
                                        if table_name not in columns_added:
                                            columns_added[table_name] = []
                                        columns_added[table_name].append(col_name)
                                        logger.info(f"Added column {col_name} to {table_name}")
                                    except Exception as col_error:
                                        errors.append(f"Failed to add column {col_name} to {table_name}: {str(col_error)}")
                    except Exception as e:
                        errors.append(f"Failed to check schema for {table_name}: {str(e)}")

        # Recreate materialized views if requested
        if request.recreate_views:
            from src.core.processors.setup.organizations.onboarding import OrgOnboardingProcessor
            processor = OrgOnboardingProcessor()
            mv_created, mv_failed = processor._create_org_materialized_views(org_slug, dataset_id)
            views_created.extend(mv_created)
            if mv_failed:
                errors.extend([f"Failed to create view: {v}" for v in mv_failed])

        # Determine status
        if errors:
            status_val = "PARTIAL"
            message = f"Sync completed with errors: {len(tables_created)} tables, {len(errors)} errors"
        elif tables_created or columns_added or views_created or dataset_created:
            status_val = "SUCCESS"
            message = f"Sync completed: dataset={'created' if dataset_created else 'existed'}, {len(tables_created)} tables created, {sum(len(v) for v in columns_added.values())} columns added, {len(views_created)} views created"
        else:
            status_val = "SUCCESS"
            message = "Already in sync - no changes needed"

        return OrgDatasetSyncResponse(
            org_slug=org_slug,
            status=status_val,
            dataset_created=dataset_created,
            tables_created=tables_created,
            columns_added=columns_added,
            views_created=views_created,
            errors=errors,
            message=message
        )

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Org dataset sync failed: {e}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Org dataset sync failed. Please check server logs."
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
    _: None = Depends(verify_admin_key),  # SECURITY: Require admin key for onboarding
    bq_client: BigQueryClient = Depends(get_bigquery_client),
    idempotency_key: Optional[str] = Header(None, alias="Idempotency-Key")  # Bug fix #13: Accept idempotency key header
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

    # Idempotency key support - prevents duplicate org creation on retry
    if idempotency_key:
        logger.info(f"Checking idempotency key: {idempotency_key[:8]}...")

        # Check if this idempotency key was already used
        try:
            check_query = f"""
            SELECT org_slug, response_data, created_at
            FROM `{settings.gcp_project_id}.organizations.org_idempotency_keys`
            WHERE idempotency_key = @idempotency_key
            AND created_at > TIMESTAMP_SUB(CURRENT_TIMESTAMP(), INTERVAL 24 HOUR)
            LIMIT 1
            """

            check_result = list(bq_client.client.query(
                check_query,
                job_config=bigquery.QueryJobConfig(
                    query_parameters=[
                        bigquery.ScalarQueryParameter("idempotency_key", "STRING", idempotency_key)
                    ]
                )
            ).result())

            if check_result:
                # Key already used - return cached response
                cached = check_result[0]
                logger.info(f"Idempotency key hit - returning cached response for org: {cached['org_slug']}")
                import json
                cached_response = json.loads(cached["response_data"]) if cached.get("response_data") else {}
                return OnboardOrgResponse(
                    org_slug=cached["org_slug"],
                    api_key=cached_response.get("api_key", "[cached - key not returned]"),
                    subscription_plan=cached_response.get("subscription_plan", "STARTER"),
                    dataset_location=cached_response.get("dataset_location", settings.bigquery_location),  # (#49)
                    dataset_created=cached_response.get("dataset_created", True),
                    tables_created=cached_response.get("tables_created", []),
                    dryrun_status=cached_response.get("dryrun_status", "CACHED"),
                    message=f"Organization '{cached['org_slug']}' already onboarded (idempotent request)"
                )

        except Exception as e:
            # Table may not exist yet - continue with onboarding
            if "Not found" not in str(e):
                logger.warning(f"Idempotency check failed: {e}")

    logger.info(f"Starting organization onboarding for org: {org_slug}")

    # Track tables created
    tables_created = []

    # Use centralized subscription limits from org_models.py (single source of truth)
    plan_enum = SubscriptionPlan(request.subscription_plan)
    central_limits = SUBSCRIPTION_LIMITS.get(plan_enum, SUBSCRIPTION_LIMITS[SubscriptionPlan.STARTER])

    # Map to expected format for this function
    plan_limits = {
        "max_team": central_limits["max_team_members"],
        "max_providers": central_limits["max_providers"],
        "max_daily": central_limits["max_pipelines_per_day"],
        "max_monthly": central_limits["max_pipelines_per_month"],
        "max_concurrent": central_limits["max_concurrent_pipelines"],
        "seat_limit": central_limits["max_team_members"],
        "providers_limit": central_limits["max_providers"]
    }

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
    org_already_exists = False
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

            # If regenerate_api_key_if_exists is True, skip to API key regeneration
            if request.regenerate_api_key_if_exists:
                if existing_status != "ACTIVE":
                    raise HTTPException(
                        status_code=status.HTTP_400_BAD_REQUEST,
                        detail=f"Organization '{org_slug}' exists but is not active (status: {existing_status}). Contact support to reactivate."
                    )
                org_already_exists = True
                logger.info(f"Organization {org_slug} exists, regenerating API key as requested")
            else:
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
    # FAST PATH: Re-sync existing org (update plan, details, regenerate API key)
    # ============================================
    if org_already_exists:
        logger.info(f"Re-sync path: Updating org details and regenerating API key for: {org_slug}")

        # STEP 1: Update org profile (company name, admin email, subscription plan, i18n)
        # Derive i18n fields for fast path
        fast_path_currency = request.default_currency
        fast_path_timezone = request.default_timezone
        fast_path_country = get_country_from_currency(fast_path_currency)
        fast_path_language = DEFAULT_LANGUAGE.value

        try:
            update_profile_query = f"""
            UPDATE `{settings.gcp_project_id}.organizations.org_profiles`
            SET
                company_name = @company_name,
                admin_email = @admin_email,
                subscription_plan = @subscription_plan,
                default_currency = @default_currency,
                default_country = @default_country,
                default_language = @default_language,
                default_timezone = @default_timezone,
                updated_at = CURRENT_TIMESTAMP()
            WHERE org_slug = @org_slug
            """

            bq_client.client.query(
                update_profile_query,
                job_config=bigquery.QueryJobConfig(
                    query_parameters=[
                        bigquery.ScalarQueryParameter("org_slug", "STRING", org_slug),
                        bigquery.ScalarQueryParameter("company_name", "STRING", request.company_name),
                        bigquery.ScalarQueryParameter("admin_email", "STRING", request.admin_email),
                        bigquery.ScalarQueryParameter("subscription_plan", "STRING", request.subscription_plan),
                        bigquery.ScalarQueryParameter("default_currency", "STRING", fast_path_currency),
                        bigquery.ScalarQueryParameter("default_country", "STRING", fast_path_country),
                        bigquery.ScalarQueryParameter("default_language", "STRING", fast_path_language),
                        bigquery.ScalarQueryParameter("default_timezone", "STRING", fast_path_timezone)
                    ]
                )
            ).result()

            logger.info(f"Updated org profile for: {org_slug} (plan: {request.subscription_plan})")
        except Exception as e:
            logger.error(f"Failed to update org profile: {e}", exc_info=True)
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail="Failed to update organization profile. Please check server logs for details."
            )

        # STEP 2: Update subscription with new plan limits
        try:
            update_subscription_query = f"""
            UPDATE `{settings.gcp_project_id}.organizations.org_subscriptions`
            SET
                plan_name = @plan_name,
                daily_limit = @daily_limit,
                monthly_limit = @monthly_limit,
                concurrent_limit = @concurrent_limit,
                updated_at = CURRENT_TIMESTAMP()
            WHERE org_slug = @org_slug
            """

            bq_client.client.query(
                update_subscription_query,
                job_config=bigquery.QueryJobConfig(
                    query_parameters=[
                        bigquery.ScalarQueryParameter("org_slug", "STRING", org_slug),
                        bigquery.ScalarQueryParameter("plan_name", "STRING", request.subscription_plan),
                        bigquery.ScalarQueryParameter("daily_limit", "INT64", plan_limits["max_daily"]),
                        # Use max_monthly from SUBSCRIPTION_LIMITS (single source of truth)
                        bigquery.ScalarQueryParameter("monthly_limit", "INT64", plan_limits["max_monthly"]),
                        bigquery.ScalarQueryParameter("concurrent_limit", "INT64", plan_limits["max_concurrent"])
                    ]
                )
            ).result()

            logger.info(f"Updated subscription for: {org_slug} (daily: {plan_limits['max_daily']}, concurrent: {plan_limits['max_concurrent']})")
        except Exception as e:
            logger.error(f"Failed to update subscription: {e}", exc_info=True)
            # Non-fatal - continue with API key regeneration

        # STEP 3: Update usage quota limits (keep current usage, update limits)
        try:
            update_quota_query = f"""
            UPDATE `{settings.gcp_project_id}.organizations.org_usage_quotas`
            SET
                daily_limit = @daily_limit,
                last_updated = CURRENT_TIMESTAMP()
            WHERE org_slug = @org_slug
            """

            bq_client.client.query(
                update_quota_query,
                job_config=bigquery.QueryJobConfig(
                    query_parameters=[
                        bigquery.ScalarQueryParameter("org_slug", "STRING", org_slug),
                        bigquery.ScalarQueryParameter("daily_limit", "INT64", plan_limits["max_daily"])
                    ]
                )
            ).result()

            logger.info(f"Updated usage quota limits for: {org_slug}")
        except Exception as e:
            logger.error(f"Failed to update usage quota: {e}", exc_info=True)
            # Non-fatal - continue with API key regeneration

        # STEP 4: Revoke existing API keys
        try:
            revoke_query = f"""
            UPDATE `{settings.gcp_project_id}.organizations.org_api_keys`
            SET is_active = FALSE
            WHERE org_slug = @org_slug AND is_active = TRUE
            """

            bq_client.client.query(
                revoke_query,
                job_config=bigquery.QueryJobConfig(
                    query_parameters=[
                        bigquery.ScalarQueryParameter("org_slug", "STRING", org_slug)
                    ]
                )
            ).result()

            logger.info(f"Revoked existing API keys for org: {org_slug}")
        except Exception as e:
            logger.error(f"Failed to revoke existing API keys: {e}", exc_info=True)
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail="Failed to revoke existing API keys. Please check server logs for details."
            )

        # STEP 5: Generate and store new API key
        try:
            random_suffix = secrets.token_urlsafe(16)[:16]
            api_key = f"{org_slug}_api_{random_suffix}"
            org_api_key_hash = hashlib.sha256(api_key.encode()).hexdigest()

            # Encrypt API key using KMS
            encrypted_org_api_key_bytes = encrypt_value(api_key)
            org_api_key_id = str(uuid.uuid4())

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
                        bigquery.ArrayQueryParameter("scopes", "STRING", settings.api_key_default_scopes)
                    ]
                )
            ).result()

            logger.info(f"New API key generated for existing org: {org_slug}")

            # Return with all updated details
            return OnboardOrgResponse(
                org_slug=org_slug,
                api_key=api_key,
                subscription_plan=request.subscription_plan,
                default_currency=fast_path_currency,
                default_country=fast_path_country,
                default_language=fast_path_language,
                default_timezone=fast_path_timezone,
                dataset_location=request.dataset_location or settings.bigquery_location,  # (#49)
                dataset_created=False,  # Already exists
                tables_created=[],
                dryrun_status="SKIPPED",
                message=f"Organization {org_slug} re-synced successfully. Plan: {request.subscription_plan}, API key regenerated."
            )

        except Exception as e:
            logger.error(f"Failed to regenerate API key: {e}", exc_info=True)
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail="Failed to regenerate API key. Please check server logs for details."
            )

    # ============================================
    # STEP 1: Create org profile in organizations.org_profiles
    # ============================================
    try:
        logger.info(f"Creating org profile in organizations.org_profiles")

        # Derive i18n fields: country from currency, language always "en"
        default_currency = request.default_currency
        default_timezone = request.default_timezone
        default_country = get_country_from_currency(default_currency)
        default_language = DEFAULT_LANGUAGE.value

        insert_profile_query = f"""
        INSERT INTO `{settings.gcp_project_id}.organizations.org_profiles`
        (org_slug, company_name, admin_email, org_dataset_id, status, subscription_plan,
         default_currency, default_country, default_language, default_timezone,
         created_at, updated_at)
        VALUES
        (@org_slug, @company_name, @admin_email, @org_dataset_id, 'ACTIVE', @subscription_plan,
         @default_currency, @default_country, @default_language, @default_timezone,
         CURRENT_TIMESTAMP(), CURRENT_TIMESTAMP())
        """

        bq_client.client.query(
            insert_profile_query,
            job_config=bigquery.QueryJobConfig(
                query_parameters=[
                    bigquery.ScalarQueryParameter("org_slug", "STRING", org_slug),
                    bigquery.ScalarQueryParameter("company_name", "STRING", request.company_name),
                    bigquery.ScalarQueryParameter("admin_email", "STRING", request.admin_email),
                    bigquery.ScalarQueryParameter("org_dataset_id", "STRING", settings.get_org_dataset_name(org_slug)),
                    bigquery.ScalarQueryParameter("subscription_plan", "STRING", request.subscription_plan),
                    bigquery.ScalarQueryParameter("default_currency", "STRING", default_currency),
                    bigquery.ScalarQueryParameter("default_country", "STRING", default_country),
                    bigquery.ScalarQueryParameter("default_language", "STRING", default_language),
                    bigquery.ScalarQueryParameter("default_timezone", "STRING", default_timezone)
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
                "dataset_id": settings.get_org_dataset_name(org_slug)
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
            detail="Failed to create organization profile. Please check server logs for details."
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
                    bigquery.ArrayQueryParameter("scopes", "STRING", settings.api_key_default_scopes)
                ]
            )
        ).result()

        logger.info(
            f"API key created and stored successfully",
            extra={
                "event_type": "api_key_created",
                "org_slug": org_slug,
                "org_api_key_id": org_api_key_id,
                "scopes": settings.api_key_default_scopes,
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
            detail="Failed to generate API key. Please check server logs for details."
        )

    # ============================================
    # STEP 3: Create subscription in organizations.org_subscriptions
    # ============================================
    try:
        logger.info(f"Creating subscription for organization: {org_slug}")

        subscription_id = str(uuid.uuid4())
        trial_end = date.today() + timedelta(days=14)  # 14-day trial period

        insert_subscription_query = f"""
        INSERT INTO `{settings.gcp_project_id}.organizations.org_subscriptions`
        (subscription_id, org_slug, plan_name, status, daily_limit, monthly_limit,
         concurrent_limit, seat_limit, providers_limit, trial_end_date, created_at)
        VALUES
        (@subscription_id, @org_slug, @plan_name, 'ACTIVE', @daily_limit, @monthly_limit,
         @concurrent_limit, @seat_limit, @providers_limit, @trial_end_date, CURRENT_TIMESTAMP())
        """

        bq_client.client.query(
            insert_subscription_query,
            job_config=bigquery.QueryJobConfig(
                query_parameters=[
                    bigquery.ScalarQueryParameter("subscription_id", "STRING", subscription_id),
                    bigquery.ScalarQueryParameter("org_slug", "STRING", org_slug),
                    bigquery.ScalarQueryParameter("plan_name", "STRING", request.subscription_plan),
                    bigquery.ScalarQueryParameter("daily_limit", "INT64", plan_limits["max_daily"]),
                    bigquery.ScalarQueryParameter("monthly_limit", "INT64", plan_limits["max_monthly"]),
                    bigquery.ScalarQueryParameter("concurrent_limit", "INT64", plan_limits["max_concurrent"]),
                    bigquery.ScalarQueryParameter("seat_limit", "INT64", plan_limits["seat_limit"]),
                    bigquery.ScalarQueryParameter("providers_limit", "INT64", plan_limits["providers_limit"]),
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
            detail="Failed to create subscription. Please check server logs for details."
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
         daily_limit, monthly_limit, concurrent_limit, seat_limit, providers_limit,
         last_updated, created_at)
        VALUES
        (@usage_id, @org_slug, CURRENT_DATE(), 0, 0, 0, 0, 0, @daily_limit, @monthly_limit,
         @concurrent_limit, @seat_limit, @providers_limit, CURRENT_TIMESTAMP(), CURRENT_TIMESTAMP())
        """

        bq_client.client.query(
            insert_usage_query,
            job_config=bigquery.QueryJobConfig(
                query_parameters=[
                    bigquery.ScalarQueryParameter("usage_id", "STRING", usage_id),
                    bigquery.ScalarQueryParameter("org_slug", "STRING", org_slug),
                    bigquery.ScalarQueryParameter("daily_limit", "INT64", plan_limits["max_daily"]),
                    bigquery.ScalarQueryParameter("monthly_limit", "INT64", plan_limits["max_monthly"]),
                    bigquery.ScalarQueryParameter("concurrent_limit", "INT64", plan_limits["max_concurrent"]),
                    bigquery.ScalarQueryParameter("seat_limit", "INT64", plan_limits["seat_limit"]),
                    bigquery.ScalarQueryParameter("providers_limit", "INT64", plan_limits["providers_limit"])
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
            detail="Failed to create usage quota. Please check server logs for details."
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
        # Use request-specified location or fall back to server config (#49)
        dataset_location = request.dataset_location or settings.bigquery_location

        processor_result = await processor.execute(
            step_config={
                "config": {
                    "dataset_id": settings.get_org_dataset_name(org_slug),
                    "location": dataset_location,
                    "metadata_tables": [
                        # ========================================
                        # Business Data Tables
                        # ========================================
                        # SaaS Subscription Plans table (dimension table)
                        {
                            "table_name": "saas_subscription_plans",
                            "schema_file": "saas_subscription_plans.json",
                            "description": "Master dimension table for SaaS subscriptions. Contains terms, pricing, and active windows.",
                            "partition_field": "start_date",
                            "clustering_fields": ["org_slug", "provider"]
                        },
                        # Daily Amortized Costs (fact table)
                        {
                            "table_name": "saas_subscription_plan_costs_daily",
                            "schema_file": "saas_subscription_plan_costs_daily.json",
                            "description": "Daily fact table. Granular daily cost breakdown for every active subscription.",
                            "partition_field": "cost_date",
                            "clustering_fields": ["org_slug", "subscription_id"]
                        },
                        # FOCUS 1.3 Standardized Cost Data (common table for all cost sources)
                        {
                            "table_name": "cost_data_standard_1_3",
                            "schema_file": "cost_data_standard_1_3.json",
                            "description": "Standardized billing data adhering to FinOps FOCUS 1.3 specification. Supports cloud (GCP/AWS/Azure), SaaS subscriptions, and LLM API costs with full cost allocation, commitment tracking, and multi-currency support.",
                            "partition_field": "ChargePeriodStart",
                            "clustering_fields": ["SubAccountId", "ServiceProviderName", "ServiceCategory"]
                        },
                        # FOCUS 1.3 Contract Commitment Data (tracks reserved instances, savings plans, CUDs)
                        {
                            "table_name": "contract_commitment_1_3",
                            "schema_file": "contract_commitment_1_3.json",
                            "description": "Contract commitment tracking for reserved capacity, savings plans, and committed use discounts. Links to cost_data_standard_1_3 via ContractApplied field.",
                            "partition_field": "ContractPeriodStart",
                            "clustering_fields": ["ContractId", "x_sub_account_id"]
                        },
                        # NOTE: org_hierarchy moved to central organizations dataset (bootstrap)
                        # ========================================
                        # GenAI Cost Tracking Tables (3 flows)
                        # ========================================
                        # --- PAYG Flow (Token-based: OpenAI, Anthropic, Gemini, etc.) ---
                        {
                            "table_name": "genai_payg_pricing",
                            "schema_file": "genai_payg_pricing.json",
                            "description": "GenAI PAYG token pricing with org-specific override support. Covers all API providers.",
                            "clustering_fields": ["provider", "model"]
                        },
                        {
                            "table_name": "genai_payg_usage_raw",
                            "schema_file": "genai_payg_usage_raw.json",
                            "description": "Daily GenAI PAYG token usage (input/output/cached tokens) from provider APIs.",
                            "partition_field": "usage_date",
                            "clustering_fields": ["provider", "model"]
                        },
                        {
                            "table_name": "genai_payg_costs_daily",
                            "schema_file": "genai_payg_costs_daily.json",
                            "description": "Daily GenAI PAYG costs calculated from usage and pricing.",
                            "partition_field": "cost_date",
                            "clustering_fields": ["provider", "hierarchy_team_id"]
                        },
                        # --- Commitment Flow (PTU/GSU: Azure OpenAI, AWS Bedrock, GCP Vertex) ---
                        {
                            "table_name": "genai_commitment_pricing",
                            "schema_file": "genai_commitment_pricing.json",
                            "description": "GenAI commitment pricing (PTU, GSU, Provisioned Throughput) with override support.",
                            "clustering_fields": ["provider", "commitment_type"]
                        },
                        {
                            "table_name": "genai_commitment_usage_raw",
                            "schema_file": "genai_commitment_usage_raw.json",
                            "description": "Daily GenAI commitment usage (PTU/GSU units, utilization %).",
                            "partition_field": "usage_date",
                            "clustering_fields": ["provider", "commitment_id"]
                        },
                        {
                            "table_name": "genai_commitment_costs_daily",
                            "schema_file": "genai_commitment_costs_daily.json",
                            "description": "Daily GenAI commitment costs (fixed + overage).",
                            "partition_field": "cost_date",
                            "clustering_fields": ["provider", "hierarchy_team_id"]
                        },
                        # --- Infrastructure Flow (Self-hosted: GPU/TPU hourly) ---
                        {
                            "table_name": "genai_infrastructure_pricing",
                            "schema_file": "genai_infrastructure_pricing.json",
                            "description": "GPU/TPU infrastructure pricing with spot/reserved discounts and org overrides.",
                            "clustering_fields": ["provider", "instance_type"]
                        },
                        {
                            "table_name": "genai_infrastructure_usage_raw",
                            "schema_file": "genai_infrastructure_usage_raw.json",
                            "description": "Daily GPU/TPU infrastructure usage (hours, instances, utilization).",
                            "partition_field": "usage_date",
                            "clustering_fields": ["provider", "instance_type"]
                        },
                        {
                            "table_name": "genai_infrastructure_costs_daily",
                            "schema_file": "genai_infrastructure_costs_daily.json",
                            "description": "Daily GPU/TPU infrastructure costs.",
                            "partition_field": "cost_date",
                            "clustering_fields": ["provider", "hierarchy_team_id"]
                        },
                        # --- Unified Tables (All 3 flows consolidated) ---
                        {
                            "table_name": "genai_usage_daily_unified",
                            "schema_file": "genai_usage_daily_unified.json",
                            "description": "Consolidated GenAI usage (PAYG + Commitment + Infrastructure) for analytics and forecasting.",
                            "partition_field": "usage_date",
                            "clustering_fields": ["cost_type", "provider"]
                        },
                        {
                            "table_name": "genai_costs_daily_unified",
                            "schema_file": "genai_costs_daily_unified.json",
                            "description": "Consolidated GenAI costs (PAYG + Commitment + Infrastructure) for dashboards and billing.",
                            "partition_field": "cost_date",
                            "clustering_fields": ["cost_type", "provider"]
                        },
                        # ========================================
                        # Cloud Billing Tables (GCP, AWS, Azure, OCI)
                        # ========================================
                        {
                            "table_name": "cloud_gcp_billing_raw_daily",
                            "schema_file": "cloud_gcp_billing_raw_daily.json",
                            "description": "Raw GCP billing data from BigQuery billing export.",
                            "partition_field": "usage_start_time",
                            "clustering_fields": ["billing_account_id", "service_id", "project_id"]
                        },
                        {
                            "table_name": "cloud_aws_billing_raw_daily",
                            "schema_file": "cloud_aws_billing_raw_daily.json",
                            "description": "Raw AWS billing data from Cost & Usage Report (CUR).",
                            "partition_field": "usage_date",
                            "clustering_fields": ["linked_account_id", "service_code", "product_code"]
                        },
                        {
                            "table_name": "cloud_azure_billing_raw_daily",
                            "schema_file": "cloud_azure_billing_raw_daily.json",
                            "description": "Raw Azure billing data from Cost Management export.",
                            "partition_field": "usage_date",
                            "clustering_fields": ["subscription_id", "service_name", "resource_group"]
                        },
                        {
                            "table_name": "cloud_oci_billing_raw_daily",
                            "schema_file": "cloud_oci_billing_raw_daily.json",
                            "description": "Raw OCI billing data from Cost Analysis API.",
                            "partition_field": "usage_date",
                            "clustering_fields": ["tenancy_id", "service_name", "compartment_id"]
                        }
                    ],
                    # LLM tables created empty - customers add custom plans via UI
                    "seed_llm_data": False,
                    "default_daily_limit": plan_limits["max_daily"],
                    "default_monthly_limit": plan_limits["max_monthly"],
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
            detail="Failed to create organization dataset. Please check server logs for details."
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
    # STEP 7: Store idempotency key if provided
    # ============================================
    if idempotency_key:
        try:
            import json
            response_data = json.dumps({
                "api_key": "[redacted]",  # Don't store actual key
                "api_key_id": api_key_id if 'api_key_id' in dir() else "",
                "dataset_id": settings.get_org_dataset_name(org_slug),
                "subscription_id": subscription_id if 'subscription_id' in dir() else "",
                "tables_created": tables_created
            })

            insert_idempotency_query = f"""
            INSERT INTO `{settings.gcp_project_id}.organizations.org_idempotency_keys`
            (idempotency_key, org_slug, response_data, created_at)
            VALUES (@idempotency_key, @org_slug, @response_data, CURRENT_TIMESTAMP())
            """

            bq_client.client.query(
                insert_idempotency_query,
                job_config=bigquery.QueryJobConfig(
                    query_parameters=[
                        bigquery.ScalarQueryParameter("idempotency_key", "STRING", idempotency_key),
                        bigquery.ScalarQueryParameter("org_slug", "STRING", org_slug),
                        bigquery.ScalarQueryParameter("response_data", "STRING", response_data)
                    ]
                )
            ).result()

            logger.info(f"Stored idempotency key for org: {org_slug}")
        except Exception as e:
            # Non-fatal - idempotency storage failure shouldn't block onboarding
            logger.warning(f"Failed to store idempotency key: {e}")

    # ============================================
    # STEP 8: Audit logging (Issue #32)
    # ============================================
    await log_create(
        org_slug=org_slug,
        resource_type=AuditLogger.RESOURCE_ORG,
        resource_id=org_slug,
        details={
            "company_name": request.company_name,
            "admin_email": request.admin_email,
            "subscription_plan": request.subscription_plan,
            "dataset_location": dataset_location,
            "tables_created": len(tables_created)
        },
        status=AuditLogger.STATUS_SUCCESS
    )

    # ============================================
    # STEP 9: Return response
    # ============================================
    logger.info(f"Organization onboarding completed - org_slug: {org_slug}")

    return OnboardOrgResponse(
        org_slug=org_slug,
        api_key=api_key,  # SAVE THIS - shown only once!
        subscription_plan=request.subscription_plan,
        default_currency=default_currency,
        default_country=default_country,
        default_language=default_language,
        default_timezone=default_timezone,
        dataset_location=dataset_location,  # (#49) Where the dataset was created
        dataset_created=dataset_created,
        tables_created=tables_created,
        dryrun_status=dryrun_status,
        message=f"Organization {request.company_name} onboarded successfully. API key generated. {dryrun_message}"
    )


# ============================================
# API Key Rotation Endpoint
# ============================================

class RotateApiKeyResponse(BaseModel):
    """Response for API key rotation."""
    org_slug: str
    api_key: str  # New API key - show once!
    api_key_fingerprint: str  # Last 4 chars for display
    previous_key_revoked: bool
    message: str


@router.post(
    "/organizations/{org_slug}/api-key/rotate",
    response_model=RotateApiKeyResponse,
    summary="Rotate organization API key",
    description="Generate a new API key and revoke the old one. Accepts either Organization API Key (self-service) or Root API Key (X-CA-Root-Key)."
)
async def rotate_api_key(
    org_slug: str,
    auth: AuthResult = Depends(get_org_or_admin_auth),
    bq_client: BigQueryClient = Depends(get_bigquery_client)
):
    """
    Rotate the API key for an organization.

    This endpoint accepts EITHER:
    - Organization API Key (X-API-Key header) - self-service rotation
    - Root API Key (X-CA-Root-Key header) - admin can rotate any org's key

    Flow:
    1. Validates authentication (org key must match org_slug, or root key)
    2. Generates a new secure API key
    3. Revokes all existing API keys for the organization
    4. Stores the new API key (encrypted with KMS)
    5. Returns the new API key (shown ONCE - save immediately!)
    """
    # Security check: if using org key, must match the org in URL
    if not auth.is_admin and auth.org_slug != org_slug:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=f"Cannot rotate API key for another organization"
        )

    logger.info(f"Starting API key rotation for organization: {org_slug}")

    # ============================================
    # STEP 1: Validate organization exists and is active
    # ============================================
    try:
        check_org_query = f"""
        SELECT org_slug, status, company_name
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

        if not check_result:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Organization '{org_slug}' not found"
            )

        org_status = check_result[0]["status"]
        if org_status != "ACTIVE":
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Organization '{org_slug}' is not active (status: {org_status})"
            )

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error checking organization: {e}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to validate organization. Please check server logs for details."
        )

    # ============================================
    # STEP 2: Revoke existing API keys
    # ============================================
    try:
        revoke_query = f"""
        UPDATE `{settings.gcp_project_id}.organizations.org_api_keys`
        SET is_active = FALSE
        WHERE org_slug = @org_slug AND is_active = TRUE
        """

        bq_client.client.query(
            revoke_query,
            job_config=bigquery.QueryJobConfig(
                query_parameters=[
                    bigquery.ScalarQueryParameter("org_slug", "STRING", org_slug)
                ]
            )
        ).result()

        logger.info(f"Revoked existing API keys for organization: {org_slug}")

    except Exception as e:
        logger.error(f"Failed to revoke existing API keys: {e}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to revoke existing API keys. Please check server logs for details."
        )

    # ============================================
    # STEP 3: Generate and store new API key
    # ============================================
    try:
        # Generate secure API key with format: {org_slug}_api_{random_16_chars}
        random_suffix = secrets.token_urlsafe(16)[:16]
        api_key = f"{org_slug}_api_{random_suffix}"
        api_key_fingerprint = api_key[-4:]

        # Hash API key with SHA256 for lookup
        org_api_key_hash = hashlib.sha256(api_key.encode()).hexdigest()

        # Encrypt API key using KMS
        try:
            encrypted_org_api_key_bytes = encrypt_value(api_key)
            logger.info(f"New API key encrypted successfully using KMS for organization: {org_slug}")
        except Exception as kms_error:
            logger.error(f"KMS encryption failed for organization {org_slug}: {kms_error}", exc_info=True)
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail=f"KMS encryption is required but failed: {str(kms_error)}"
            )

        org_api_key_id = str(uuid.uuid4())

        # Store new API key
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
                    bigquery.ArrayQueryParameter("scopes", "STRING", settings.api_key_default_scopes)
                ]
            )
        ).result()

        logger.info(
            f"New API key created successfully",
            extra={
                "event_type": "api_key_rotated",
                "org_slug": org_slug,
                "org_api_key_id": org_api_key_id,
                "fingerprint": api_key_fingerprint
            }
        )

        # Issue #32: Audit logging for API key rotation
        await log_audit(
            org_slug=org_slug,
            action=AuditLogger.ACTION_ROTATE,
            resource_type=AuditLogger.RESOURCE_API_KEY,
            resource_id=org_api_key_id,
            details={
                "previous_keys_revoked": True,
                "fingerprint": api_key_fingerprint
            },
            status=AuditLogger.STATUS_SUCCESS
        )

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Failed to generate/store new API key: {e}", exc_info=True)

        # Issue #32: Audit log failure
        await log_audit(
            org_slug=org_slug,
            action=AuditLogger.ACTION_ROTATE,
            resource_type=AuditLogger.RESOURCE_API_KEY,
            status=AuditLogger.STATUS_FAILURE,
            error_message=str(e)
        )

        # Issue #29: Generic error message
        raise safe_error_response(
            error=e,
            operation="rotate API key",
            context={"org_slug": org_slug}
        )

    return RotateApiKeyResponse(
        org_slug=org_slug,
        api_key=api_key,  # SAVE THIS - shown only once!
        api_key_fingerprint=api_key_fingerprint,
        previous_key_revoked=True,
        message=f"API key rotated successfully for organization '{org_slug}'. Save the new key - it won't be shown again!"
    )


# ============================================
# Get API Key Info Endpoint (fingerprint only)
# ============================================

class ApiKeyInfoResponse(BaseModel):
    """Response for API key info."""
    org_slug: str
    api_key_fingerprint: str  # Last 4 chars
    is_active: bool
    created_at: str
    scopes: List[str]


@router.get(
    "/organizations/{org_slug}/api-key",
    response_model=ApiKeyInfoResponse,
    summary="Get API key info (fingerprint only)",
    description="Get information about the organization's active API key without revealing the full key"
)
async def get_api_key_info(
    org_slug: str,
    auth: AuthResult = Depends(get_org_or_admin_auth),  # SECURITY: Require org or admin auth
    bq_client: BigQueryClient = Depends(get_bigquery_client)
):
    """
    Get information about the organization's active API key.

    Returns fingerprint (last 4 chars), creation date, and scopes.
    Does NOT return the full API key - that's only shown once during creation/rotation.

    SECURITY: Requires either org API key (self-service) or admin key.
    Org users can only access their own org's API key info.
    """
    # Security check: if using org key, must match the org in URL
    if not auth.is_admin and auth.org_slug != org_slug:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Cannot access API key info for another organization"
        )
    logger.info(f"Getting API key info for organization: {org_slug}")

    try:
        query = f"""
        SELECT
            org_slug,
            org_api_key_hash,
            is_active,
            scopes,
            created_at
        FROM `{settings.gcp_project_id}.organizations.org_api_keys`
        WHERE org_slug = @org_slug AND is_active = TRUE
        ORDER BY created_at DESC
        LIMIT 1
        """

        result = list(bq_client.client.query(
            query,
            job_config=bigquery.QueryJobConfig(
                query_parameters=[
                    bigquery.ScalarQueryParameter("org_slug", "STRING", org_slug)
                ]
            )
        ).result())

        if not result:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"No active API key found for organization '{org_slug}'"
            )

        row = result[0]

        # Fingerprint: Use last 4 chars of the hash (not the actual key)
        # This is safe since we can't reveal the actual key
        # Bug fix #11: Add null and length check before slicing
        hash_value = row["org_api_key_hash"]
        api_key_fingerprint = hash_value[-4:] if hash_value and len(hash_value) >= 4 else "****"

        return ApiKeyInfoResponse(
            org_slug=row["org_slug"],
            api_key_fingerprint=api_key_fingerprint,
            is_active=row["is_active"],
            created_at=row["created_at"].isoformat() if row["created_at"] else "",
            scopes=row["scopes"] or []
        )

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Failed to get API key info: {e}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to get API key info. Please check server logs for details."
        )


# ============================================
# Update Subscription Limits Endpoint
# ============================================

class UpdateSubscriptionLimitsRequest(BaseModel):
    """Request to update subscription limits for an organization."""
    plan_name: Optional[str] = Field(
        default=None,
        description="New subscription plan name (STARTER, PROFESSIONAL, SCALE)"
    )
    daily_limit: Optional[int] = Field(
        default=None,
        ge=1,
        le=10000,
        description="Daily pipeline execution limit"
    )
    monthly_limit: Optional[int] = Field(
        default=None,
        ge=1,
        le=300000,
        description="Monthly pipeline execution limit"
    )
    concurrent_limit: Optional[int] = Field(
        default=None,
        ge=1,
        le=100,
        description="Concurrent pipeline execution limit"
    )
    seat_limit: Optional[int] = Field(
        default=None,
        ge=1,
        le=1000,
        description="Team member seat limit"
    )
    providers_limit: Optional[int] = Field(
        default=None,
        ge=1,
        le=100,
        description="Provider integration limit"
    )
    status: Optional[str] = Field(
        default=None,
        description="Subscription status (ACTIVE, TRIAL, EXPIRED, SUSPENDED, CANCELLED)"
    )
    trial_end_date: Optional[str] = Field(
        default=None,
        description="Trial end date in ISO format (YYYY-MM-DD)"
    )

    model_config = ConfigDict(extra="forbid")

    @field_validator('plan_name')
    @classmethod
    def validate_plan_name(cls, v):
        """Validate plan name if provided."""
        if v is not None:
            if v.upper() not in ['STARTER', 'PROFESSIONAL', 'SCALE', 'ENTERPRISE']:
                raise ValueError(f'plan_name must be one of STARTER, PROFESSIONAL, SCALE, ENTERPRISE')
            return v.upper()
        return v

    @field_validator('status')
    @classmethod
    def validate_status(cls, v):
        """Validate status if provided."""
        if v is not None:
            if v.upper() not in ['ACTIVE', 'TRIAL', 'EXPIRED', 'SUSPENDED', 'CANCELLED']:
                raise ValueError(f'status must be one of ACTIVE, TRIAL, EXPIRED, SUSPENDED, CANCELLED')
            return v.upper()
        return v


class UpdateSubscriptionLimitsResponse(BaseModel):
    """Response for subscription limits update."""
    org_slug: str
    plan_name: str
    status: Optional[str] = None
    daily_limit: int
    monthly_limit: int
    concurrent_limit: int
    seat_limit: Optional[int] = None
    providers_limit: Optional[int] = None
    updated: bool
    message: str


@router.put(
    "/organizations/{org_slug}/subscription",
    response_model=UpdateSubscriptionLimitsResponse,
    summary="Update subscription limits for an organization",
    description="Updates subscription limits in BigQuery when plan changes (called by webhook)"
)
async def update_subscription_limits(
    org_slug: str,
    request: UpdateSubscriptionLimitsRequest,
    _: None = Depends(verify_admin_key),
    bq_client: BigQueryClient = Depends(get_bigquery_client)
):
    """
    Update subscription limits for an organization.

    This endpoint is called by the frontend Stripe webhook when:
    - User upgrades/downgrades their plan
    - Admin manually adjusts limits

    Updates:
    - org_subscriptions table (plan_name, daily_limit, monthly_limit, concurrent_limit)
    - org_usage_quotas table (daily_limit for enforcement)
    - org_profiles table (subscription_plan)

    Requires CA_ROOT_API_KEY authentication (admin only).
    """
    logger.info(f"Updating subscription limits for organization: {org_slug}")

    # ============================================
    # STEP 1: Validate organization exists
    # ============================================
    try:
        check_org_query = f"""
        SELECT org_slug, status, subscription_plan
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

        if not check_result:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Organization '{org_slug}' not found"
            )

        current_plan = check_result[0].get("subscription_plan", "STARTER")

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error checking organization: {e}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to validate organization. Please check server logs for details."
        )

    # ============================================
    # STEP 2: Get limits from request or plan defaults
    # ============================================
    plan_name = request.plan_name or current_plan

    # If plan name provided, get default limits from plan
    if plan_name in ['STARTER', 'PROFESSIONAL', 'SCALE', 'ENTERPRISE']:
        try:
            plan_enum = SubscriptionPlan(plan_name)
            default_limits = SUBSCRIPTION_LIMITS.get(plan_enum, SUBSCRIPTION_LIMITS[SubscriptionPlan.STARTER])
        except ValueError:
            default_limits = SUBSCRIPTION_LIMITS[SubscriptionPlan.STARTER]
    else:
        default_limits = SUBSCRIPTION_LIMITS[SubscriptionPlan.STARTER]

    # Use request values or fall back to plan defaults
    daily_limit = request.daily_limit or default_limits["max_pipelines_per_day"]
    monthly_limit = request.monthly_limit or default_limits["max_pipelines_per_month"]
    concurrent_limit = request.concurrent_limit or default_limits["max_concurrent_pipelines"]
    seat_limit = request.seat_limit or default_limits.get("max_team_members", 1)
    providers_limit = request.providers_limit or default_limits.get("max_providers", 3)

    # Get status and trial_end_date from request
    subscription_status = request.status  # Already validated by pydantic
    trial_end_date = request.trial_end_date  # ISO format string

    # Convert ISO datetime string to YYYY-MM-DD format if needed
    # Frontend may send '2025-12-15T05:55:56.000Z', but BigQuery DATE expects 'YYYY-MM-DD'
    if trial_end_date:
        from datetime import datetime as dt_module
        original_trial_end_date = trial_end_date

        # Try multiple parsing strategies
        parsed_date = None

        # Strategy 1: Already in YYYY-MM-DD format
        if len(trial_end_date) == 10 and trial_end_date.count('-') == 2:
            try:
                dt_module.strptime(trial_end_date, '%Y-%m-%d')
                parsed_date = trial_end_date
            except ValueError:
                pass

        # Strategy 2: ISO format with 'T' separator
        if not parsed_date and 'T' in trial_end_date:
            try:
                # Handle ISO format with Z suffix or timezone offset
                if trial_end_date.endswith('Z'):
                    dt = dt_module.fromisoformat(trial_end_date.replace('Z', '+00:00'))
                else:
                    dt = dt_module.fromisoformat(trial_end_date)
                parsed_date = dt.strftime('%Y-%m-%d')
            except ValueError:
                pass

        # Strategy 3: Unix timestamp (milliseconds)
        if not parsed_date:
            try:
                timestamp = int(trial_end_date)
                # Detect if it's milliseconds (> 1e12) or seconds
                if timestamp > 1e12:
                    timestamp = timestamp / 1000
                dt = dt_module.fromtimestamp(timestamp)
                parsed_date = dt.strftime('%Y-%m-%d')
            except (ValueError, TypeError, OSError):
                pass

        # Strategy 4: Fallback - simple split on 'T'
        if not parsed_date and 'T' in trial_end_date:
            parsed_date = trial_end_date.split('T')[0]

        if parsed_date:
            trial_end_date = parsed_date
            logger.debug(f"Parsed trial_end_date: {original_trial_end_date} -> {trial_end_date}")
        else:
            logger.error(f"Failed to parse trial_end_date: {original_trial_end_date}")
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Invalid trial_end_date format: {original_trial_end_date}. Expected YYYY-MM-DD or ISO 8601 datetime."
            )

    # ============================================
    # STEP 3: Update org_subscriptions table
    # ============================================
    try:
        # Build dynamic SET clause to only update provided fields
        set_clauses = [
            "plan_name = @plan_name",
            "daily_limit = @daily_limit",
            "monthly_limit = @monthly_limit",
            "concurrent_limit = @concurrent_limit",
            "seat_limit = @seat_limit",
            "providers_limit = @providers_limit",
            "updated_at = CURRENT_TIMESTAMP()"
        ]
        query_params = [
            bigquery.ScalarQueryParameter("org_slug", "STRING", org_slug),
            bigquery.ScalarQueryParameter("plan_name", "STRING", plan_name),
            bigquery.ScalarQueryParameter("daily_limit", "INT64", daily_limit),
            bigquery.ScalarQueryParameter("monthly_limit", "INT64", monthly_limit),
            bigquery.ScalarQueryParameter("concurrent_limit", "INT64", concurrent_limit),
            bigquery.ScalarQueryParameter("seat_limit", "INT64", seat_limit),
            bigquery.ScalarQueryParameter("providers_limit", "INT64", providers_limit)
        ]

        # Add status if provided
        if subscription_status:
            set_clauses.append("status = @status")
            query_params.append(bigquery.ScalarQueryParameter("status", "STRING", subscription_status))

        # Add trial_end_date if provided
        if trial_end_date:
            set_clauses.append("trial_end_date = @trial_end_date")
            query_params.append(bigquery.ScalarQueryParameter("trial_end_date", "STRING", trial_end_date))

        update_subscription_query = f"""
        UPDATE `{settings.gcp_project_id}.organizations.org_subscriptions`
        SET
            {", ".join(set_clauses)}
        WHERE org_slug = @org_slug
        """

        bq_client.client.query(
            update_subscription_query,
            job_config=bigquery.QueryJobConfig(query_parameters=query_params)
        ).result()

        logger.info(f"Updated org_subscriptions for: {org_slug} (plan: {plan_name}, daily: {daily_limit})")

    except Exception as e:
        logger.error(f"Failed to update org_subscriptions: {e}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to update subscription. Please check server logs for details."
        )

    # ============================================
    # STEP 4: Update org_usage_quotas table (MERGE/UPSERT)
    # ============================================
    # Use MERGE to ensure quota limits are updated for current date's record.
    # The table is partitioned by usage_date with one row per org per day.
    # This is critical for subscription upgrades to work seamlessly.
    try:
        merge_quota_query = f"""
        MERGE `{settings.gcp_project_id}.organizations.org_usage_quotas` AS target
        USING (SELECT @org_slug AS org_slug, CURRENT_DATE() AS usage_date) AS source
        ON target.org_slug = source.org_slug AND target.usage_date = source.usage_date
        WHEN MATCHED THEN
            UPDATE SET
                daily_limit = @daily_limit,
                monthly_limit = @monthly_limit,
                concurrent_limit = @concurrent_limit,
                seat_limit = @seat_limit,
                providers_limit = @providers_limit,
                last_updated = CURRENT_TIMESTAMP()
        WHEN NOT MATCHED THEN
            INSERT (usage_id, org_slug, usage_date, pipelines_run_today, pipelines_succeeded_today,
                    pipelines_failed_today, pipelines_run_month, concurrent_pipelines_running,
                    daily_limit, monthly_limit, concurrent_limit, seat_limit, providers_limit,
                    max_concurrent_reached, last_updated, created_at)
            VALUES (GENERATE_UUID(), @org_slug, CURRENT_DATE(), 0, 0,
                    0, 0, 0,
                    @daily_limit, @monthly_limit, @concurrent_limit, @seat_limit, @providers_limit,
                    0, CURRENT_TIMESTAMP(), CURRENT_TIMESTAMP())
        """

        job = bq_client.client.query(
            merge_quota_query,
            job_config=bigquery.QueryJobConfig(
                query_parameters=[
                    bigquery.ScalarQueryParameter("org_slug", "STRING", org_slug),
                    bigquery.ScalarQueryParameter("daily_limit", "INT64", daily_limit),
                    bigquery.ScalarQueryParameter("monthly_limit", "INT64", monthly_limit),
                    bigquery.ScalarQueryParameter("concurrent_limit", "INT64", concurrent_limit),
                    bigquery.ScalarQueryParameter("seat_limit", "INT64", seat_limit),
                    bigquery.ScalarQueryParameter("providers_limit", "INT64", providers_limit)
                ]
            )
        )
        job.result()

        # Check if the merge actually affected any rows
        if job.num_dml_affected_rows == 0:
            logger.warning(f"MERGE affected 0 rows for org_usage_quotas: {org_slug}")
        else:
            logger.info(f"Updated org_usage_quotas for: {org_slug} (rows affected: {job.num_dml_affected_rows})")

    except Exception as e:
        # This should NOT be silent - quota update is critical for enforcement
        logger.error(f"Failed to update org_usage_quotas for {org_slug}: {e}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to update usage quotas. Subscription update incomplete. Please retry or contact support."
        )

    # ============================================
    # STEP 5: Update org_profiles table
    # ============================================
    try:
        update_profile_query = f"""
        UPDATE `{settings.gcp_project_id}.organizations.org_profiles`
        SET
            subscription_plan = @plan_name,
            updated_at = CURRENT_TIMESTAMP()
        WHERE org_slug = @org_slug
        """

        bq_client.client.query(
            update_profile_query,
            job_config=bigquery.QueryJobConfig(
                query_parameters=[
                    bigquery.ScalarQueryParameter("org_slug", "STRING", org_slug),
                    bigquery.ScalarQueryParameter("plan_name", "STRING", plan_name)
                ]
            )
        ).result()

        logger.info(f"Updated org_profiles for: {org_slug} (plan: {plan_name})")

    except Exception as e:
        logger.warning(f"Failed to update org_profiles: {e}")
        # Non-fatal

    logger.info(
        f"Subscription limits updated successfully",
        extra={
            "event_type": "subscription_limits_updated",
            "org_slug": org_slug,
            "plan_name": plan_name,
            "daily_limit": daily_limit,
            "monthly_limit": monthly_limit,
            "concurrent_limit": concurrent_limit,
            "seat_limit": seat_limit,
            "providers_limit": providers_limit
        }
    )

    # Issue #32: Audit logging for subscription update
    await log_update(
        org_slug=org_slug,
        resource_type=AuditLogger.RESOURCE_SUBSCRIPTION,
        resource_id=org_slug,
        details={
            "plan_name": plan_name,
            "status": subscription_status,
            "daily_limit": daily_limit,
            "monthly_limit": monthly_limit,
            "concurrent_limit": concurrent_limit,
            "seat_limit": seat_limit,
            "providers_limit": providers_limit
        },
        status=AuditLogger.STATUS_SUCCESS
    )

    return UpdateSubscriptionLimitsResponse(
        org_slug=org_slug,
        plan_name=plan_name,
        status=subscription_status,
        daily_limit=daily_limit,
        monthly_limit=monthly_limit,
        concurrent_limit=concurrent_limit,
        seat_limit=seat_limit,
        providers_limit=providers_limit,
        updated=True,
        message=f"Subscription limits updated for '{org_slug}'. Plan: {plan_name}, Status: {subscription_status or 'unchanged'}, Daily: {daily_limit}, Monthly: {monthly_limit}, Concurrent: {concurrent_limit}, Seats: {seat_limit}, Providers: {providers_limit}"
    )


# ============================================
# Delete/Offboard Organization Endpoint (#43)
# ============================================

class DeleteOrgRequest(BaseModel):
    """Request to delete/offboard an organization."""
    delete_dataset: bool = Field(
        default=False,
        description="If True, also delete the org's BigQuery dataset (DESTRUCTIVE, IRREVERSIBLE)"
    )
    confirm_org_slug: str = Field(
        ...,
        description="Must match org_slug in URL to confirm deletion"
    )

    model_config = ConfigDict(extra="forbid")


class DeleteOrgResponse(BaseModel):
    """Response for organization deletion."""
    org_slug: str
    deleted_from_tables: List[str]
    dataset_deleted: bool
    message: str


@router.delete(
    "/organizations/{org_slug}",
    response_model=DeleteOrgResponse,
    summary="Delete/offboard an organization",
    description="Removes organization from all meta tables. Optionally deletes the org's dataset."
)
async def delete_organization(
    org_slug: str,
    request: DeleteOrgRequest,
    admin_key: str = Depends(verify_admin_key),
    bq_client: BigQueryClient = Depends(get_bigquery_client)
):
    """
    Delete/offboard an organization (Admin only).

    This endpoint:
    1. Removes org from all meta tables (org_profiles, org_api_keys, org_subscriptions, etc.)
    2. Optionally deletes the org's BigQuery dataset if delete_dataset=True

    REQUIRES: X-CA-Root-Key header (admin authentication)

    WARNING: This is destructive and cannot be undone. The org_slug must be confirmed
    in the request body to prevent accidental deletions.
    """
    # Security: confirm org_slug matches
    if request.confirm_org_slug != org_slug:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"confirm_org_slug '{request.confirm_org_slug}' does not match URL org_slug '{org_slug}'"
        )

    logger.info(
        f"Starting organization deletion",
        extra={
            "event_type": "org_deletion_started",
            "org_slug": org_slug,
            "delete_dataset": request.delete_dataset
        }
    )

    deleted_tables = []
    dataset_deleted = False

    try:
        # List of meta tables to clean up
        meta_tables = [
            "org_profiles",
            "org_api_keys",
            "org_subscriptions",
            "org_credentials",
            "integration_status",
            "audit_logs"
        ]

        # Delete from each meta table
        for table in meta_tables:
            try:
                delete_query = f"""
                DELETE FROM `{settings.gcp_project_id}.organizations.{table}`
                WHERE org_slug = @org_slug
                """
                bq_client.client.query(
                    delete_query,
                    job_config=bigquery.QueryJobConfig(
                        query_parameters=[
                            bigquery.ScalarQueryParameter("org_slug", "STRING", org_slug)
                        ]
                    )
                ).result()
                deleted_tables.append(table)
                logger.info(f"Deleted org data from {table}")
            except Exception as e:
                # Table might not exist or have no data - log but continue
                logger.warning(f"Could not delete from {table}: {e}")

        # Optionally delete the org's dataset
        if request.delete_dataset:
            try:
                dataset_name = settings.get_org_dataset_name(org_slug)
                dataset_id = f"{settings.gcp_project_id}.{dataset_name}"
                bq_client.client.delete_dataset(
                    dataset_id,
                    delete_contents=True,  # Delete all tables in the dataset
                    not_found_ok=True
                )
                dataset_deleted = True
                logger.info(f"Deleted dataset: {dataset_id}")
            except Exception as e:
                logger.error(f"Failed to delete dataset {dataset_name}: {e}")
                # Don't fail the entire operation - meta data is already cleaned

        logger.info(
            f"Organization deletion completed",
            extra={
                "event_type": "org_deletion_completed",
                "org_slug": org_slug,
                "deleted_tables": deleted_tables,
                "dataset_deleted": dataset_deleted
            }
        )

        # Issue #32: Audit logging for organization deletion
        await log_delete(
            org_slug=org_slug,
            resource_type=AuditLogger.RESOURCE_ORG,
            resource_id=org_slug,
            details={
                "deleted_tables": deleted_tables,
                "dataset_deleted": dataset_deleted
            },
            status=AuditLogger.STATUS_SUCCESS
        )

        return DeleteOrgResponse(
            org_slug=org_slug,
            deleted_from_tables=deleted_tables,
            dataset_deleted=dataset_deleted,
            message=f"Organization '{org_slug}' has been offboarded successfully"
        )

    except HTTPException:
        raise
    except Exception as e:
        logger.error(
            f"Failed to delete organization",
            extra={
                "event_type": "org_deletion_failed",
                "org_slug": org_slug,
                "error": str(e)
            },
            exc_info=True
        )
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to delete organization. Please check server logs."
        )


# ============================================
# Get Subscription Endpoint
# ============================================

class GetSubscriptionResponse(BaseModel):
    """Response for getting subscription details."""
    org_slug: str
    subscription_id: str
    plan_name: str
    status: str
    daily_limit: int
    monthly_limit: int
    concurrent_limit: int
    seat_limit: Optional[int] = None
    providers_limit: Optional[int] = None
    trial_end_date: Optional[str] = None
    created_at: Optional[str] = None
    updated_at: Optional[str] = None


@router.get(
    "/organizations/{org_slug}/subscription",
    response_model=GetSubscriptionResponse,
    summary="Get subscription details for an organization",
    description="Retrieves current subscription details from BigQuery"
)
async def get_subscription(
    org_slug: str,
    auth: AuthResult = Depends(get_org_or_admin_auth),
    bq_client: BigQueryClient = Depends(get_bigquery_client)
):
    """
    Get subscription details for an organization.

    This endpoint returns the current subscription state including:
    - Plan name and status
    - All limits (daily, monthly, concurrent, seat, providers)
    - Trial end date
    - Timestamps

    Accepts EITHER:
    - Organization API Key (X-API-Key header) - self-service access
    - Root API Key (X-CA-Root-Key header) - admin can access any org
    """
    # Security check: if using org key, must match the org in URL
    if not auth.is_admin and auth.org_slug != org_slug:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Cannot access subscription for another organization"
        )

    logger.info(f"Getting subscription details for organization: {org_slug}")

    try:
        query = f"""
        SELECT
            subscription_id,
            org_slug,
            plan_name,
            status,
            daily_limit,
            monthly_limit,
            concurrent_limit,
            seat_limit,
            providers_limit,
            trial_end_date,
            created_at,
            updated_at
        FROM `{settings.gcp_project_id}.organizations.org_subscriptions`
        WHERE org_slug = @org_slug
        LIMIT 1
        """

        result = list(bq_client.client.query(
            query,
            job_config=bigquery.QueryJobConfig(
                query_parameters=[
                    bigquery.ScalarQueryParameter("org_slug", "STRING", org_slug)
                ]
            )
        ).result())

        if not result:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"No subscription found for organization '{org_slug}'"
            )

        row = result[0]

        return GetSubscriptionResponse(
            org_slug=row["org_slug"],
            subscription_id=row["subscription_id"] or "",
            plan_name=row["plan_name"] or "STARTER",
            status=row["status"] or "ACTIVE",
            daily_limit=row["daily_limit"] or 10,
            monthly_limit=row["monthly_limit"] or 300,
            concurrent_limit=row["concurrent_limit"] or 1,
            seat_limit=row.get("seat_limit"),
            providers_limit=row.get("providers_limit"),
            trial_end_date=str(row["trial_end_date"]) if row.get("trial_end_date") else None,
            created_at=row["created_at"].isoformat() if row.get("created_at") else None,
            updated_at=row["updated_at"].isoformat() if row.get("updated_at") else None
        )

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Failed to get subscription: {e}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to get subscription. Please check server logs for details."
        )


# ============================================
# Organization Locale Endpoints (i18n)
# ============================================

@router.get(
    "/organizations/{org_slug}/locale",
    response_model=OrgLocaleResponse,
    summary="Get organization locale settings",
    description="Retrieves currency, country, language, and timezone for an organization"
)
async def get_org_locale(
    org_slug: str,
    auth: AuthResult = Depends(get_org_or_admin_auth),
    bq_client: BigQueryClient = Depends(get_bigquery_client)
):
    """
    Get locale settings for an organization.

    Returns:
    - default_currency: ISO 4217 currency code (e.g., USD, AED)
    - default_country: ISO 3166-1 alpha-2 country code (auto-inferred from currency)
    - default_language: BCP 47 language tag (always "en" for now)
    - default_timezone: IANA timezone (e.g., UTC, Asia/Dubai)

    Accepts EITHER:
    - Organization API Key (X-API-Key header) - self-service access
    - Root API Key (X-CA-Root-Key header) - admin can access any org
    """
    # Security check: if using org key, must match the org in URL
    if not auth.is_admin and auth.org_slug != org_slug:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Cannot access locale for another organization"
        )

    logger.info(f"Getting locale settings for organization: {org_slug}")

    try:
        query = f"""
        SELECT
            org_slug,
            default_currency,
            default_country,
            default_language,
            default_timezone
        FROM `{settings.gcp_project_id}.organizations.org_profiles`
        WHERE org_slug = @org_slug
        LIMIT 1
        """

        result = list(bq_client.client.query(
            query,
            job_config=bigquery.QueryJobConfig(
                query_parameters=[
                    bigquery.ScalarQueryParameter("org_slug", "STRING", org_slug)
                ]
            )
        ).result())

        if not result:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Organization '{org_slug}' not found"
            )

        row = result[0]

        currency_code = row.get("default_currency") or DEFAULT_CURRENCY.value
        return OrgLocaleResponse(
            org_slug=row["org_slug"],
            default_currency=currency_code,
            default_country=row.get("default_country") or DEFAULT_COUNTRY,
            default_language=row.get("default_language") or DEFAULT_LANGUAGE.value,
            default_timezone=row.get("default_timezone") or DEFAULT_TIMEZONE,
            currency_symbol=get_currency_symbol(currency_code),
            currency_name=CURRENCY_METADATA.get(currency_code, {}).get("name", "Unknown"),
            currency_decimals=get_currency_decimals(currency_code)
        )

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Failed to get locale: {e}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to get locale settings. Please check server logs for details."
        )


@router.put(
    "/organizations/{org_slug}/locale",
    response_model=OrgLocaleResponse,
    summary="Update organization locale settings",
    description="Updates currency and timezone for an organization (country auto-inferred from currency)"
)
async def update_org_locale(
    org_slug: str,
    request: UpdateOrgLocaleRequest,
    auth: AuthResult = Depends(get_org_or_admin_auth),
    bq_client: BigQueryClient = Depends(get_bigquery_client)
):
    """
    Update locale settings for an organization.

    Updatable fields:
    - default_currency: ISO 4217 currency code (e.g., USD, AED)
    - default_timezone: IANA timezone (e.g., UTC, Asia/Dubai)

    Auto-computed fields:
    - default_country: Inferred from currency (e.g., AED → AE)
    - default_language: Always "en" (not user-configurable yet)

    Accepts EITHER:
    - Organization API Key (X-API-Key header) - self-service update
    - Root API Key (X-CA-Root-Key header) - admin can update any org
    """
    # Security check: if using org key, must match the org in URL
    if not auth.is_admin and auth.org_slug != org_slug:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Cannot update locale for another organization"
        )

    logger.info(f"Updating locale settings for organization: {org_slug}")

    try:
        # First fetch current locale values (for partial update support)
        fetch_query = f"""
        SELECT org_slug, default_currency, default_timezone, default_country, default_language
        FROM `{settings.gcp_project_id}.organizations.org_profiles`
        WHERE org_slug = @org_slug
        LIMIT 1
        """

        fetch_result = list(bq_client.client.query(
            fetch_query,
            job_config=bigquery.QueryJobConfig(
                query_parameters=[
                    bigquery.ScalarQueryParameter("org_slug", "STRING", org_slug)
                ]
            )
        ).result())

        if not fetch_result:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Organization '{org_slug}' not found"
            )

        current = dict(fetch_result[0])

        # Partial update: only override non-null request values
        new_currency = request.default_currency.value if request.default_currency else current.get("default_currency", DEFAULT_CURRENCY.value)
        new_timezone = request.default_timezone if request.default_timezone else current.get("default_timezone", DEFAULT_TIMEZONE)
        new_country = get_country_from_currency(new_currency)
        new_language = DEFAULT_LANGUAGE.value  # Always "en" for now

        # Update locale fields
        update_query = f"""
        UPDATE `{settings.gcp_project_id}.organizations.org_profiles`
        SET
            default_currency = @default_currency,
            default_country = @default_country,
            default_language = @default_language,
            default_timezone = @default_timezone,
            updated_at = CURRENT_TIMESTAMP()
        WHERE org_slug = @org_slug
        """

        bq_client.client.query(
            update_query,
            job_config=bigquery.QueryJobConfig(
                query_parameters=[
                    bigquery.ScalarQueryParameter("org_slug", "STRING", org_slug),
                    bigquery.ScalarQueryParameter("default_currency", "STRING", new_currency),
                    bigquery.ScalarQueryParameter("default_country", "STRING", new_country),
                    bigquery.ScalarQueryParameter("default_language", "STRING", new_language),
                    bigquery.ScalarQueryParameter("default_timezone", "STRING", new_timezone)
                ]
            )
        ).result()

        logger.info(
            f"Updated locale settings for {org_slug}",
            extra={
                "event_type": "org_locale_updated",
                "org_slug": org_slug,
                "currency": new_currency,
                "country": new_country,
                "timezone": new_timezone
            }
        )

        # Audit log
        await log_update(
            org_slug=org_slug,
            resource_type=AuditLogger.RESOURCE_ORG,
            resource_id=org_slug,
            details={
                "field": "locale",
                "currency": new_currency,
                "country": new_country,
                "timezone": new_timezone
            },
            status=AuditLogger.STATUS_SUCCESS
        )

        return OrgLocaleResponse(
            org_slug=org_slug,
            default_currency=new_currency,
            default_country=new_country,
            default_language=new_language,
            default_timezone=new_timezone,
            currency_symbol=get_currency_symbol(new_currency),
            currency_name=CURRENCY_METADATA.get(new_currency, {}).get("name", "Unknown"),
            currency_decimals=get_currency_decimals(new_currency)
        )

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Failed to update locale: {e}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to update locale settings. Please check server logs for details."
        )


# ============================================
# List Organizations Endpoint (Admin Only)
# ============================================

class OrgListItem(BaseModel):
    """Organization list item."""
    org_slug: str
    company_name: str
    admin_email: str
    subscription_plan: str
    status: str
    default_currency: str
    default_timezone: str
    created_at: Optional[str] = None


class OrgListResponse(BaseModel):
    """Response for organization listing."""
    organizations: List[OrgListItem]
    total: int
    page: int
    page_size: int
    has_next: bool


@router.get(
    "/organizations",
    response_model=OrgListResponse,
    summary="List all organizations (admin only)",
    description="List all organizations with pagination support"
)
async def list_organizations(
    page: int = Query(1, ge=1, description="Page number (starting from 1)"),
    page_size: int = Query(50, ge=1, le=100, description="Number of items per page (max 100)"),
    status: Optional[str] = Query(None, description="Filter by status (ACTIVE, SUSPENDED, etc.)"),
    _: None = Depends(verify_admin_key),
    bq_client: BigQueryClient = Depends(get_bigquery_client)
):
    """
    List all organizations with pagination.

    This endpoint provides paginated access to all organizations in the system.
    Requires admin authentication (X-CA-Root-Key).

    Query Parameters:
    - page: Page number (starting from 1)
    - page_size: Number of items per page (max 100)
    - status: Optional filter by organization status

    Returns paginated list with:
    - organizations: List of organization details
    - total: Total number of organizations (matching filter)
    - page: Current page number
    - page_size: Items per page
    - has_next: Whether there are more pages
    """
    logger.info(f"Listing organizations: page={page}, page_size={page_size}, status={status}")

    try:
        # Calculate offset for pagination
        offset = (page - 1) * page_size

        # Build query with optional status filter
        where_clause = ""
        query_params = []

        if status:
            where_clause = "WHERE status = @status"
            query_params.append(bigquery.ScalarQueryParameter("status", "STRING", status.upper()))

        # Count total organizations
        count_query = f"""
        SELECT COUNT(*) as total
        FROM `{settings.gcp_project_id}.organizations.org_profiles`
        {where_clause}
        """

        count_result = list(bq_client.client.query(
            count_query,
            job_config=bigquery.QueryJobConfig(query_parameters=query_params)
        ).result())

        total = count_result[0]["total"] if count_result else 0

        # Fetch paginated results
        list_query = f"""
        SELECT
            org_slug,
            company_name,
            admin_email,
            subscription_plan,
            status,
            default_currency,
            default_timezone,
            created_at
        FROM `{settings.gcp_project_id}.organizations.org_profiles`
        {where_clause}
        ORDER BY created_at DESC
        LIMIT @limit OFFSET @offset
        """

        query_params.extend([
            bigquery.ScalarQueryParameter("limit", "INT64", page_size),
            bigquery.ScalarQueryParameter("offset", "INT64", offset)
        ])

        result = list(bq_client.client.query(
            list_query,
            job_config=bigquery.QueryJobConfig(query_parameters=query_params)
        ).result())

        # Convert to response objects
        organizations = []
        for row in result:
            organizations.append(OrgListItem(
                org_slug=row["org_slug"],
                company_name=row["company_name"],
                admin_email=row["admin_email"],
                subscription_plan=row["subscription_plan"],
                status=row["status"],
                default_currency=row.get("default_currency", DEFAULT_CURRENCY.value),
                default_timezone=row.get("default_timezone", DEFAULT_TIMEZONE),
                created_at=row["created_at"].isoformat() if row.get("created_at") else None
            ))

        # Calculate if there's a next page
        has_next = (offset + page_size) < total

        logger.info(f"Listed {len(organizations)} organizations (total: {total}, page: {page})")

        return OrgListResponse(
            organizations=organizations,
            total=total,
            page=page,
            page_size=page_size,
            has_next=has_next
        )

    except Exception as e:
        logger.error(f"Failed to list organizations: {e}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to list organizations. Please check server logs for details."
        )


# ============================================
# Organization Repair/Migration Endpoints
# ============================================

class RepairOrgTablesResponse(BaseModel):
    """Response for repair org tables operation."""
    org_slug: str
    dataset_id: str
    tables_created: List[str] = Field(default_factory=list)
    tables_existing: List[str] = Field(default_factory=list)
    tables_failed: List[str] = Field(default_factory=list)
    message: str


@router.post(
    "/{org_slug}/repair-tables",
    response_model=RepairOrgTablesResponse,
    summary="Repair missing org tables",
    description="Creates missing tables in an organization's dataset. Used for migrating existing orgs to new schemas."
)
async def repair_org_tables(
    org_slug: str,
    _: None = Depends(verify_admin_key)
):
    """
    Create missing tables in an existing organization's dataset.

    This is useful when:
    - New tables are added to the schema (e.g., FOCUS 1.3 migration)
    - An org was created before certain tables were added
    - Tables were accidentally deleted

    Requires X-CA-Root-Key authentication.
    """
    logger.info(f"Repairing tables for organization: {org_slug}")

    # Validate org exists
    bq_client = get_bigquery_client()
    check_query = f"""
    SELECT org_slug FROM `{settings.gcp_project_id}.organizations.org_profiles`
    WHERE org_slug = @org_slug
    LIMIT 1
    """
    result = bq_client.client.query(
        check_query,
        job_config=bigquery.QueryJobConfig(
            query_parameters=[
                bigquery.ScalarQueryParameter("org_slug", "STRING", org_slug)
            ]
        )
    ).result()

    if len(list(result)) == 0:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Organization '{org_slug}' not found"
        )

    # Get dataset name
    dataset_id = settings.get_org_dataset_name(org_slug)
    dataset_ref = f"{settings.gcp_project_id}.{dataset_id}"

    # Define all required org tables
    ORG_TABLES = [
        {
            "table_name": "saas_subscription_plans",
            "schema_file": "saas_subscription_plans.json",
            "partition_field": "start_date",
            "clustering_fields": ["org_slug", "provider"]
        },
        {
            "table_name": "saas_subscription_plan_costs_daily",
            "schema_file": "saas_subscription_plan_costs_daily.json",
            "partition_field": "cost_date",
            "clustering_fields": ["org_slug", "subscription_id"]
        },
        {
            "table_name": "cost_data_standard_1_3",
            "schema_file": "cost_data_standard_1_3.json",
            "partition_field": "ChargePeriodStart",
            "clustering_fields": ["SubAccountId", "ServiceProviderName", "ServiceCategory"]
        },
        {
            "table_name": "contract_commitment_1_3",
            "schema_file": "contract_commitment_1_3.json",
            "partition_field": "ContractPeriodStart",
            "clustering_fields": ["ContractId", "x_sub_account_id"]
        },
        # NOTE: org_hierarchy moved to central organizations dataset (bootstrap)
        # GenAI PAYG Tables
        {
            "table_name": "genai_payg_pricing",
            "schema_file": "genai_payg_pricing.json",
            "clustering_fields": ["provider", "model"]
        },
        {
            "table_name": "genai_payg_usage_raw",
            "schema_file": "genai_payg_usage_raw.json",
            "partition_field": "usage_date",
            "clustering_fields": ["provider", "model"]
        },
        {
            "table_name": "genai_payg_costs_daily",
            "schema_file": "genai_payg_costs_daily.json",
            "partition_field": "cost_date",
            "clustering_fields": ["provider", "model"]
        },
        # GenAI Commitment Tables
        {
            "table_name": "genai_commitment_pricing",
            "schema_file": "genai_commitment_pricing.json",
            "clustering_fields": ["provider", "commitment_type"]
        },
        {
            "table_name": "genai_commitment_usage_raw",
            "schema_file": "genai_commitment_usage_raw.json",
            "partition_field": "usage_date",
            "clustering_fields": ["provider", "commitment_id"]
        },
        {
            "table_name": "genai_commitment_costs_daily",
            "schema_file": "genai_commitment_costs_daily.json",
            "partition_field": "cost_date",
            "clustering_fields": ["provider", "commitment_id"]
        },
        # GenAI Infrastructure Tables
        {
            "table_name": "genai_infrastructure_pricing",
            "schema_file": "genai_infrastructure_pricing.json",
            "clustering_fields": ["provider", "resource_type"]
        },
        {
            "table_name": "genai_infrastructure_usage_raw",
            "schema_file": "genai_infrastructure_usage_raw.json",
            "partition_field": "usage_date",
            "clustering_fields": ["provider", "resource_type"]
        },
        {
            "table_name": "genai_infrastructure_costs_daily",
            "schema_file": "genai_infrastructure_costs_daily.json",
            "partition_field": "cost_date",
            "clustering_fields": ["provider", "resource_type"]
        },
        # GenAI Unified Tables
        {
            "table_name": "genai_usage_daily_unified",
            "schema_file": "genai_usage_daily_unified.json",
            "partition_field": "usage_date",
            "clustering_fields": ["provider", "cost_type"]
        },
        {
            "table_name": "genai_costs_daily_unified",
            "schema_file": "genai_costs_daily_unified.json",
            "partition_field": "cost_date",
            "clustering_fields": ["provider", "cost_type"]
        }
    ]

    tables_created = []
    tables_existing = []
    tables_failed = []

    # Schema base path
    schema_base_path = Path(__file__).parent.parent.parent.parent / "configs" / "setup" / "organizations" / "onboarding" / "schemas"

    for table_config in ORG_TABLES:
        table_name = table_config["table_name"]
        table_ref = f"{dataset_ref}.{table_name}"

        try:
            # Check if table exists
            try:
                bq_client.client.get_table(table_ref)
                tables_existing.append(table_name)
                logger.info(f"Table already exists: {table_ref}")
                continue
            except Exception:
                # Table doesn't exist, will proceed to create it
                pass

            # Load schema
            schema_path = schema_base_path / table_config["schema_file"]
            if not schema_path.exists():
                logger.error(f"Schema file not found: {schema_path}")
                tables_failed.append(table_name)
                continue

            import json
            with open(schema_path) as f:
                schema_json = json.load(f)

            # Convert to BigQuery schema
            schema = [bigquery.SchemaField.from_api_repr(field) for field in schema_json]

            # Create table
            table = bigquery.Table(table_ref, schema=schema)

            # Add partitioning if specified
            if "partition_field" in table_config:
                partition_field = table_config["partition_field"]
                # Determine partition type based on field
                field_type = next((f["type"] for f in schema_json if f["name"] == partition_field), None)
                if field_type in ("TIMESTAMP", "DATETIME"):
                    table.time_partitioning = bigquery.TimePartitioning(
                        type_=bigquery.TimePartitioningType.DAY,
                        field=partition_field
                    )
                elif field_type == "DATE":
                    table.time_partitioning = bigquery.TimePartitioning(
                        type_=bigquery.TimePartitioningType.DAY,
                        field=partition_field
                    )

            # Add clustering if specified
            if "clustering_fields" in table_config:
                table.clustering_fields = table_config["clustering_fields"]

            bq_client.client.create_table(table)
            tables_created.append(table_name)
            logger.info(f"Created table: {table_ref}")

        except Exception as e:
            logger.error(f"Failed to create table {table_name}: {e}", exc_info=True)
            tables_failed.append(table_name)

    message = f"Repair complete. Created: {len(tables_created)}, Existing: {len(tables_existing)}, Failed: {len(tables_failed)}"
    logger.info(message)

    return RepairOrgTablesResponse(
        org_slug=org_slug,
        dataset_id=dataset_id,
        tables_created=tables_created,
        tables_existing=tables_existing,
        tables_failed=tables_failed,
        message=message
    )
