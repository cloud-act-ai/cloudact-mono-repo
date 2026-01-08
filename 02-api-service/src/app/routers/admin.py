"""
Admin API Routes
Endpoints for organization and API key management.
"""

from fastapi import APIRouter, Depends, HTTPException, status, Request, Query
from pydantic import BaseModel, Field, ConfigDict
from typing import Optional, List, Any, Dict
from datetime import datetime, date, timedelta
import hashlib
import secrets
import logging
import time

from google.cloud import bigquery
from src.core.engine.bq_client import get_bigquery_client, BigQueryClient
from src.core.security.kms_encryption import encrypt_value, decrypt_value
from src.app.config import settings
from src.app.dependencies.auth import verify_admin_key
from src.app.dependencies.rate_limit_decorator import rate_limit_global
from src.app.models.org_models import SUBSCRIPTION_LIMITS, SubscriptionPlan
from src.core.utils.audit_logger import log_create, log_delete, log_audit, AuditLogger
from src.core.utils.error_handling import safe_error_response
from src.core.utils.validators import validate_org_slug

logger = logging.getLogger(__name__)

router = APIRouter()


# ============================================
# BUG-006 FIX: Simple TTL Cache for Bootstrap Status
# ============================================

class BootstrapStatusCache:
    """Simple TTL cache for bootstrap status endpoint (60-second cache)"""
    def __init__(self, ttl_seconds: int = 60):
        self.ttl_seconds = ttl_seconds
        self._cache: Dict[str, Any] = {}
        self._timestamps: Dict[str, float] = {}

    def get(self, key: str) -> Optional[Dict[str, Any]]:
        """Get cached value if not expired"""
        if key not in self._cache:
            return None

        # Check if expired
        if time.time() - self._timestamps[key] > self.ttl_seconds:
            # Expired - remove from cache
            del self._cache[key]
            del self._timestamps[key]
            return None

        return self._cache[key]

    def set(self, key: str, value: Dict[str, Any]):
        """Set cached value with current timestamp"""
        self._cache[key] = value
        self._timestamps[key] = time.time()

    def clear(self):
        """Clear all cache"""
        self._cache.clear()
        self._timestamps.clear()

# Initialize cache
bootstrap_status_cache = BootstrapStatusCache(ttl_seconds=60)


# ============================================
# Request/Response Models
# ============================================

class CreateOrgRequest(BaseModel):
    """Request to create a new organization."""
    org_slug: str = Field(
        ...,
        min_length=3,
        max_length=50,
        pattern="^[a-z0-9_]+$",
        description="Organization identifier (lowercase, alphanumeric, underscores)"
    )
    description: Optional[str] = Field(None, description="Organization description")

    model_config = ConfigDict(extra="forbid")


class CreateAPIKeyRequest(BaseModel):
    """Request to create an API key."""
    org_slug: str
    description: Optional[str] = None


class APIKeyResponse(BaseModel):
    """Response containing API key."""
    api_key: str
    org_api_key_hash: str
    org_slug: str
    created_at: datetime
    description: Optional[str]


class OrgResponse(BaseModel):
    """Response for organization info."""
    org_slug: str
    datasets_created: int
    api_keys_count: int
    total_pipeline_runs: int


class BootstrapRequest(BaseModel):
    """Request to bootstrap system."""
    force_recreate_dataset: bool = Field(
        False,
        description="Force delete and recreate central organizations dataset"
    )
    force_recreate_tables: bool = Field(
        False,
        description="Force delete and recreate all org management tables"
    )




class BootstrapResponse(BaseModel):
    """Response from bootstrap operation."""
    status: str = Field(..., description="Bootstrap status (SUCCESS, FAILED)")
    dataset_created: bool
    tables_created: list = Field(..., description="List of created tables")
    tables_existed: list = Field(..., description="List of existing tables")
    total_tables: int
    message: str
    # BUG-015 FIX: Add schema validation report
    schema_validation: Dict[str, Any] = Field(
        default_factory=dict,
        description="Schema validation summary: {valid: bool, errors: List[str], warnings: List[str]}"
    )


class BootstrapStatusResponse(BaseModel):
    """Response for bootstrap status check."""
    status: str = Field(..., description="SYNCED, OUT_OF_SYNC, NOT_BOOTSTRAPPED")
    dataset_exists: bool
    tables_expected: int
    tables_existing: List[str]
    tables_missing: List[str]
    tables_extra: List[str]
    schema_diffs: Dict[str, Any] = Field(default_factory=dict, description="Schema differences per table")
    message: str


class BootstrapSyncRequest(BaseModel):
    """Request to sync bootstrap (create missing tables/columns)."""
    sync_missing_tables: bool = Field(
        default=True,
        description="Create tables that are missing from BigQuery"
    )
    sync_missing_columns: bool = Field(
        default=False,
        description="Add missing columns to existing tables (non-destructive)"
    )


class BootstrapSyncResponse(BaseModel):
    """Response from bootstrap sync operation."""
    status: str
    tables_created: List[str]
    columns_added: Dict[str, List[str]] = Field(default_factory=dict)
    errors: List[str] = Field(default_factory=list)
    message: str


# ============================================
# System Bootstrap
# ============================================

@router.post(
    "/admin/bootstrap",
    response_model=BootstrapResponse,
    summary="Bootstrap system",
    description="One-time system bootstrap to create central organizations dataset and management tables"
)
async def bootstrap_system(
    request: BootstrapRequest,
    http_request: Request,
    _admin: None = Depends(verify_admin_key)
):
    """
    Bootstrap the system for first-time setup.

    Creates:
    - Central 'organizations' dataset
    - All organization management tables with proper schemas

    This endpoint requires root authentication via X-CA-Root-Key header.

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
    # Bug fix #10: Add rate limiting to prevent abuse (2 requests per minute for bootstrap)
    await rate_limit_global(
        http_request,
        endpoint_name="admin_bootstrap",
        limit_per_minute=2
    )

    try:
        from src.core.processors.setup.initial.onetime_bootstrap_processor import OnetimeBootstrapProcessor

        logger.info(
            "Bootstrap request received",
            extra={
                "force_recreate_dataset": request.force_recreate_dataset,
                "force_recreate_tables": request.force_recreate_tables
            }
        )

        # Idempotency check: verify if already bootstrapped (unless force flags set)
        if not request.force_recreate_dataset and not request.force_recreate_tables:
            try:
                from src.core.engine.bq_client import get_bigquery_client
                bq_client = get_bigquery_client()

                # Check if organizations dataset exists
                check_query = f"""
                SELECT schema_name
                FROM `{settings.gcp_project_id}.INFORMATION_SCHEMA.SCHEMATA`
                WHERE schema_name = 'organizations'
                """
                result_check = list(bq_client.client.query(check_query).result())

                if result_check:
                    logger.warning("Bootstrap already completed - organizations dataset exists")
                    raise HTTPException(
                        status_code=status.HTTP_409_CONFLICT,
                        detail="System already bootstrapped. Use force_recreate_dataset=true to recreate (DANGEROUS)."
                    )
            except HTTPException:
                raise
            except Exception as check_error:
                logger.warning(f"Idempotency check failed: {check_error}. Proceeding with bootstrap.")

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

        # BUG-015 FIX: Add schema validation report
        validation_errors = []
        validation_warnings = []

        # Validate that all expected tables were created
        tables_created = result.get("tables_created", [])
        tables_existed = result.get("tables_existed", [])
        total_tables = result.get("total_tables", 0)
        total_present = len(tables_created) + len(tables_existed)

        if total_present < total_tables:
            validation_errors.append(f"Expected {total_tables} tables but only {total_present} are present")

        # Check for any tables that existed (could be warning)
        if tables_existed:
            validation_warnings.append(f"{len(tables_existed)} tables already existed (idempotent)")

        schema_validation = {
            "valid": len(validation_errors) == 0,
            "errors": validation_errors,
            "warnings": validation_warnings,
            "tables_validated": total_present,
            "validation_timestamp": datetime.utcnow().isoformat()
        }

        return BootstrapResponse(
            status=result.get("status", "SUCCESS"),
            dataset_created=result.get("dataset_created", False),
            tables_created=result.get("tables_created", []),
            tables_existed=result.get("tables_existed", []),
            total_tables=result.get("total_tables", 0),
            message=result.get("message", "Bootstrap completed"),
            schema_validation=schema_validation
        )

    except HTTPException:
        # Re-raise HTTP exceptions (like 409 Conflict) as-is
        raise
    except Exception as e:
        logger.error(f"Bootstrap failed: {str(e)}", exc_info=True)
        # BUG-007 FIX: Use safe_error_response for consistent error handling
        raise safe_error_response(
            error=e,
            operation="bootstrap system",
            context={"force_recreate_dataset": request.force_recreate_dataset}
        )


# ============================================
# Bootstrap Status & Sync Endpoints
# ============================================

@router.get(
    "/admin/bootstrap/status",
    response_model=BootstrapStatusResponse,
    summary="Check bootstrap sync status",
    description="Check if system bootstrap tables are in sync with configuration"
)
async def get_bootstrap_status(
    force_refresh: bool = Query(False, description="Force cache refresh"),
    _admin: None = Depends(verify_admin_key)
):
    """
    Check bootstrap status and identify any missing tables or schema differences.

    BUG-006 FIX: Cached for 60 seconds to avoid repeated BigQuery queries.
    Use ?force_refresh=true to bypass cache.

    Returns:
    - **status**: SYNCED (all good), OUT_OF_SYNC (missing tables/columns), NOT_BOOTSTRAPPED (no dataset)
    - **tables_missing**: Tables that exist in config but not in BigQuery
    - **tables_extra**: Tables in BigQuery not in config (usually fine, could be custom)
    - **schema_diffs**: Columns that differ between config and BigQuery
    """
    # BUG-006 FIX: Check cache first (unless force_refresh)
    cache_key = "bootstrap_status"
    if not force_refresh:
        cached_result = bootstrap_status_cache.get(cache_key)
        if cached_result:
            logger.debug("Returning cached bootstrap status")
            return BootstrapStatusResponse(**cached_result)

    try:
        from src.core.engine.bq_client import get_bigquery_client
        from pathlib import Path
        import yaml
        import json

        bq_client = get_bigquery_client()

        # Load config
        config_dir = Path(__file__).parent.parent.parent.parent / "configs" / "setup" / "bootstrap"
        config_file = config_dir / "config.yml"

        with open(config_file, 'r') as f:
            config = yaml.safe_load(f)

        dataset_name = config.get('dataset', {}).get('name', 'organizations')
        expected_tables = set(config.get('tables', {}).keys())

        # Check if dataset exists
        dataset_id = f"{settings.gcp_project_id}.{dataset_name}"
        try:
            bq_client.client.get_dataset(dataset_id)
            dataset_exists = True
        except Exception:
            return BootstrapStatusResponse(
                status="NOT_BOOTSTRAPPED",
                dataset_exists=False,
                tables_expected=len(expected_tables),
                tables_existing=[],
                tables_missing=list(expected_tables),
                tables_extra=[],
                schema_diffs={},
                message="Organizations dataset does not exist. Run bootstrap first."
            )

        # Get existing tables
        existing_tables = set()
        tables = bq_client.client.list_tables(dataset_id)
        for table in tables:
            existing_tables.add(table.table_id)

        tables_missing = list(expected_tables - existing_tables)
        tables_extra = list(existing_tables - expected_tables)

        # Check schema differences for existing tables
        schema_diffs = {}
        schemas_dir = config_dir / "schemas"

        for table_name in expected_tables & existing_tables:
            schema_file = schemas_dir / f"{table_name}.json"
            if not schema_file.exists():
                continue

            with open(schema_file, 'r') as f:
                expected_schema = json.load(f)

            expected_columns = {field['name'] for field in expected_schema}

            # Get actual table schema
            table_ref = f"{dataset_id}.{table_name}"
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

        # Determine overall status
        if tables_missing or schema_diffs:
            status_val = "OUT_OF_SYNC"
            message = f"Bootstrap out of sync: {len(tables_missing)} tables missing, {len(schema_diffs)} tables with schema differences"
        else:
            status_val = "SYNCED"
            message = f"Bootstrap in sync: {len(existing_tables)} tables present"

        # Build response
        response_data = {
            "status": status_val,
            "dataset_exists": dataset_exists,
            "tables_expected": len(expected_tables),
            "tables_existing": list(existing_tables),
            "tables_missing": tables_missing,
            "tables_extra": tables_extra,
            "schema_diffs": schema_diffs,
            "message": message
        }

        # BUG-006 FIX: Cache the result
        bootstrap_status_cache.set(cache_key, response_data)
        logger.debug("Cached bootstrap status for 60 seconds")

        return BootstrapStatusResponse(**response_data)

    except Exception as e:
        logger.error(f"Failed to check bootstrap status: {e}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to check bootstrap status. Please check server logs."
        )


@router.post(
    "/admin/bootstrap/sync",
    response_model=BootstrapSyncResponse,
    summary="Sync bootstrap tables",
    description="Non-destructive sync: create missing tables and optionally add missing columns"
)
async def sync_bootstrap(
    request: BootstrapSyncRequest,
    http_request: Request,
    _admin: None = Depends(verify_admin_key)
):
    """
    Sync bootstrap tables without deleting existing data.

    - Creates missing tables from config
    - Optionally adds missing columns to existing tables (ALTER TABLE ADD COLUMN)
    - NEVER deletes tables or columns

    Parameters:
    - **sync_missing_tables**: Create tables that are missing (default: True)
    - **sync_missing_columns**: Add missing columns to existing tables (default: False)
    """
    await rate_limit_global(
        http_request,
        endpoint_name="admin_bootstrap_sync",
        limit_per_minute=5
    )

    try:
        from src.core.engine.bq_client import get_bigquery_client
        from pathlib import Path
        import yaml
        import json

        bq_client = get_bigquery_client()

        # Load config
        config_dir = Path(__file__).parent.parent.parent.parent / "configs" / "setup" / "bootstrap"
        config_file = config_dir / "config.yml"
        schemas_dir = config_dir / "schemas"

        with open(config_file, 'r') as f:
            config = yaml.safe_load(f)

        dataset_name = config.get('dataset', {}).get('name', 'organizations')
        dataset_id = f"{settings.gcp_project_id}.{dataset_name}"

        tables_created = []
        columns_added = {}
        errors = []

        # Ensure dataset exists
        try:
            bq_client.client.get_dataset(dataset_id)
        except Exception:
            # Create dataset if it doesn't exist
            dataset = bigquery.Dataset(dataset_id)
            dataset.location = config.get('dataset', {}).get('location', settings.bigquery_location)
            bq_client.client.create_dataset(dataset)
            logger.info(f"Created dataset: {dataset_id}")

        # Get existing tables
        existing_tables = set()
        for table in bq_client.client.list_tables(dataset_id):
            existing_tables.add(table.table_id)

        # Process each table in config
        for table_name, table_config in config.get('tables', {}).items():
            schema_file = schemas_dir / f"{table_name}.json"

            if not schema_file.exists():
                errors.append(f"Schema file not found: {table_name}.json")
                continue

            with open(schema_file, 'r') as f:
                schema_json = json.load(f)

            schema = [bigquery.SchemaField.from_api_repr(field) for field in schema_json]
            table_id = f"{dataset_id}.{table_name}"

            if table_name not in existing_tables:
                # Create missing table
                if request.sync_missing_tables:
                    try:
                        table = bigquery.Table(table_id, schema=schema)
                        table.description = (table_config or {}).get('description', f"Table: {table_name}")

                        # Apply partitioning
                        partition_cfg = (table_config or {}).get('partition')
                        if partition_cfg:
                            table.time_partitioning = bigquery.TimePartitioning(
                                type_=bigquery.TimePartitioningType.DAY,
                                field=partition_cfg.get('field')
                            )

                        # Apply clustering
                        clustering = (table_config or {}).get('clustering')
                        if clustering:
                            table.clustering_fields = clustering

                        bq_client.client.create_table(table)
                        tables_created.append(table_name)
                        logger.info(f"Created table: {table_id}")
                    except Exception as e:
                        errors.append(f"Failed to create {table_name}: {str(e)}")
            else:
                # Check for missing columns and add them
                if request.sync_missing_columns:
                    try:
                        existing_table = bq_client.client.get_table(table_id)
                        existing_columns = {field.name for field in existing_table.schema}
                        expected_columns = {field['name'] for field in schema_json}

                        missing_columns = expected_columns - existing_columns

                        if missing_columns:
                            # Add missing columns via ALTER TABLE
                            for col_name in missing_columns:
                                # Find column definition
                                col_def = next((f for f in schema_json if f['name'] == col_name), None)
                                if col_def:
                                    col_type = col_def['type']
                                    mode = col_def.get('mode', 'NULLABLE')

                                    # BigQuery ALTER TABLE ADD COLUMN
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

        # Determine status
        if errors:
            status_val = "PARTIAL"
            message = f"Sync completed with errors: {len(tables_created)} tables created, {len(errors)} errors"
        elif tables_created or columns_added:
            status_val = "SUCCESS"
            message = f"Sync completed: {len(tables_created)} tables created, {sum(len(v) for v in columns_added.values())} columns added"
        else:
            status_val = "SUCCESS"
            message = "Already in sync - no changes needed"

        return BootstrapSyncResponse(
            status=status_val,
            tables_created=tables_created,
            columns_added=columns_added,
            errors=errors,
            message=message
        )

    except Exception as e:
        logger.error(f"Bootstrap sync failed: {e}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Bootstrap sync failed. Please check server logs."
        )


# ============================================
# Organization Management
# ============================================

@router.post(
    "/admin/organizations",
    response_model=OrgResponse,
    summary="Create a new organization",
    description="Initialize a new organization with BigQuery datasets, profile, and subscription. Rate limited: 10 requests/minute (expensive operation)"
)
async def create_org(
    request: CreateOrgRequest,
    http_request: Request,
    bq_client: BigQueryClient = Depends(get_bigquery_client),
    _admin: None = Depends(verify_admin_key)
):
    """
    Create a new organization.

    This will:
    1. Create org profile in organizations.org_profiles
    2. Create subscription in organizations.org_subscriptions
    3. Create org-specific BigQuery datasets
    4. Return org details

    - **org_slug**: Unique organization identifier (lowercase, alphanumeric, underscores only)
    - **description**: Optional description

    RATE LIMITED: 10 requests/minute per admin (protects expensive BigQuery operations)
    """
    # Apply rate limiting for expensive org creation
    await rate_limit_global(
        http_request,
        endpoint_name="admin_create_org",
        limit_per_minute=settings.rate_limit_admin_orgs_per_minute
    )

    org_slug = request.org_slug

    # Use centralized subscription limits from org_models.py (single source of truth)
    central_limits = SUBSCRIPTION_LIMITS[SubscriptionPlan.STARTER]
    plan_limits = {
        "max_daily": central_limits["max_pipelines_per_day"],
        "max_monthly": central_limits["max_pipelines_per_month"],
        "max_concurrent": central_limits["max_concurrent_pipelines"],
        "seat_limit": central_limits["max_team_members"],
        "providers_limit": central_limits["max_providers"]
    }

    # Step 1: Create org profile
    try:
        logger.info(f"Creating org profile for: {org_slug}")

        insert_profile_query = f"""
        INSERT INTO `{settings.gcp_project_id}.organizations.org_profiles`
        (org_slug, company_name, admin_email, org_dataset_id, status, subscription_plan, created_at, updated_at)
        VALUES
        (@org_slug, @company_name, @admin_email, @org_dataset_id, 'ACTIVE', 'STARTER', CURRENT_TIMESTAMP(), CURRENT_TIMESTAMP())
        """

        bq_client.client.query(
            insert_profile_query,
            job_config=bigquery.QueryJobConfig(
                query_parameters=[
                    bigquery.ScalarQueryParameter("org_slug", "STRING", org_slug),
                    bigquery.ScalarQueryParameter("company_name", "STRING", request.description or org_slug),
                    bigquery.ScalarQueryParameter("admin_email", "STRING", "admin@example.com"),  # Placeholder
                    bigquery.ScalarQueryParameter("org_dataset_id", "STRING", org_slug)
                ]
            )
        ).result()

        logger.info(f"Organization profile created for: {org_slug}")

    except Exception as e:
        logger.error(f"Failed to create org profile: {str(e)}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Operation failed. Please check server logs for details."
        )

    # Step 2: Create subscription
    try:
        import uuid
        from datetime import date

        logger.info(f"Creating subscription for: {org_slug}")

        subscription_id = str(uuid.uuid4())
        trial_end = date.today()  # No trial for admin-created orgs

        insert_subscription_query = f"""
        INSERT INTO `{settings.gcp_project_id}.organizations.org_subscriptions`
        (subscription_id, org_slug, plan_name, status, daily_limit, monthly_limit,
         concurrent_limit, trial_end_date, created_at)
        VALUES
        (@subscription_id, @org_slug, 'STARTER', 'ACTIVE', @daily_limit, @monthly_limit,
         @concurrent_limit, @trial_end_date, CURRENT_TIMESTAMP())
        """

        bq_client.client.query(
            insert_subscription_query,
            job_config=bigquery.QueryJobConfig(
                query_parameters=[
                    bigquery.ScalarQueryParameter("subscription_id", "STRING", subscription_id),
                    bigquery.ScalarQueryParameter("org_slug", "STRING", org_slug),
                    bigquery.ScalarQueryParameter("daily_limit", "INT64", plan_limits["max_daily"]),
                    bigquery.ScalarQueryParameter("monthly_limit", "INT64", plan_limits["max_monthly"]),
                    bigquery.ScalarQueryParameter("concurrent_limit", "INT64", plan_limits["max_concurrent"]),
                    bigquery.ScalarQueryParameter("trial_end_date", "DATE", trial_end)
                ]
            )
        ).result()

        logger.info(f"Subscription created for: {org_slug}")

    except Exception as e:
        logger.error(f"Failed to create subscription: {str(e)}", exc_info=True)
        # Cleanup org profile
        try:
            bq_client.client.query(
                f"DELETE FROM `{settings.gcp_project_id}.organizations.org_profiles` WHERE org_slug = @org_slug",
                job_config=bigquery.QueryJobConfig(
                    query_parameters=[bigquery.ScalarQueryParameter("org_slug", "STRING", org_slug)]
                )
            ).result()
        except Exception as cleanup_error:
            logger.warning(f"Cleanup failed after API key creation error for {org_slug}: {cleanup_error}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Operation failed. Please check server logs for details."
        )

    # Step 3: Create initial usage quota record
    try:
        from datetime import date

        logger.info(f"Creating usage quota for: {org_slug}")

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

        logger.info(f"Usage quota created for: {org_slug}")

    except Exception as e:
        logger.error(f"Failed to create usage quota: {str(e)}", exc_info=True)
        # Cleanup org profile and subscription
        try:
            bq_client.client.query(
                f"DELETE FROM `{settings.gcp_project_id}.organizations.org_profiles` WHERE org_slug = @org_slug",
                job_config=bigquery.QueryJobConfig(
                    query_parameters=[bigquery.ScalarQueryParameter("org_slug", "STRING", org_slug)]
                )
            ).result()
            bq_client.client.query(
                f"DELETE FROM `{settings.gcp_project_id}.organizations.org_subscriptions` WHERE org_slug = @org_slug",
                job_config=bigquery.QueryJobConfig(
                    query_parameters=[bigquery.ScalarQueryParameter("org_slug", "STRING", org_slug)]
                )
            ).result()
        except Exception as cleanup_error:
            logger.warning(f"Cleanup failed after subscription creation error for {org_slug}: {cleanup_error}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Operation failed. Please check server logs for details."
        )

    # Step 4: Create BigQuery datasets
    # Load dataset types from configuration
    datasets_to_create = [
        (dataset_type, f"{description} for {org_slug}")
        for dataset_type, description in settings.get_dataset_types_with_descriptions()
    ]

    datasets_created = 0
    dataset_errors = []
    for dataset_type, description in datasets_to_create:
        try:
            bq_client.create_dataset(
                org_slug=org_slug,
                dataset_type=dataset_type,
                description=description
            )
            datasets_created += 1
        except Exception as e:
            # Log error and track failures
            error_msg = f"Failed to create dataset {dataset_type}: {str(e)}"
            logger.error(error_msg, extra={"org_slug": org_slug, "dataset_type": dataset_type})
            dataset_errors.append(error_msg)

    # If all datasets failed, cleanup and raise error
    if datasets_created == 0 and dataset_errors:
        # Cleanup org profile and subscription
        try:
            bq_client.client.query(
                f"DELETE FROM `{settings.gcp_project_id}.organizations.org_profiles` WHERE org_slug = @org_slug",
                job_config=bigquery.QueryJobConfig(
                    query_parameters=[bigquery.ScalarQueryParameter("org_slug", "STRING", org_slug)]
                )
            ).result()
            bq_client.client.query(
                f"DELETE FROM `{settings.gcp_project_id}.organizations.org_subscriptions` WHERE org_slug = @org_slug",
                job_config=bigquery.QueryJobConfig(
                    query_parameters=[bigquery.ScalarQueryParameter("org_slug", "STRING", org_slug)]
                )
            ).result()
        except Exception as cleanup_error:
            logger.warning(f"Cleanup failed after dataset creation error for {org_slug}: {cleanup_error}")

        # Issue #29: Generic error message
        raise safe_error_response(
            error=Exception('; '.join(dataset_errors)),
            operation="create organization datasets",
            context={"org_slug": org_slug, "errors": dataset_errors}
        )

    # Issue #32: Audit logging for org creation
    await log_create(
        org_slug=org_slug,
        resource_type=AuditLogger.RESOURCE_ORG,
        resource_id=org_slug,
        details={
            "datasets_created": datasets_created,
            "description": request.description
        },
        status=AuditLogger.STATUS_SUCCESS
    )

    return OrgResponse(
        org_slug=org_slug,
        datasets_created=datasets_created,
        api_keys_count=0,
        total_pipeline_runs=0
    )




@router.get(
    "/admin/organizations/{org_slug}",
    response_model=OrgResponse,
    summary="Get organization status",
    description="Get organization information and statistics"
)
async def get_org(
    org_slug: str,
    bq_client: BigQueryClient = Depends(get_bigquery_client),
    _admin: None = Depends(verify_admin_key)
):
    """
    Get organization details and statistics.

    - **org_slug**: Organization identifier

    Returns org information including dataset count, API keys, and pipeline runs.
    """
    # Count API keys
    api_keys_query = f"""
    SELECT COUNT(*) as count
    FROM `{settings.gcp_project_id}.organizations.org_api_keys`
    WHERE org_slug = @org_slug
    """

    from google.cloud import bigquery

    job_config = bigquery.QueryJobConfig(
        query_parameters=[
            bigquery.ScalarQueryParameter("org_slug", "STRING", org_slug)
        ]
    )

    api_keys_result = list(bq_client.client.query(api_keys_query, job_config=job_config).result())
    api_keys_count = api_keys_result[0]["count"] if api_keys_result else 0

    # Count pipeline runs
    runs_query = f"""
    SELECT COUNT(*) as count
    FROM `{settings.gcp_project_id}.organizations.org_pipeline_runs`
    WHERE org_slug = @org_slug
    """

    runs_result = list(bq_client.client.query(runs_query, job_config=job_config).result())
    runs_count = runs_result[0]["count"] if runs_result else 0

    # Get dataset count from configuration
    datasets_created = len(settings.get_dataset_type_names())

    return OrgResponse(
        org_slug=org_slug,
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
    description="Generate a new API key for an organization"
)
async def create_api_key(
    request: CreateAPIKeyRequest,
    bq_client: BigQueryClient = Depends(get_bigquery_client),
    _admin: None = Depends(verify_admin_key)
):
    """
    Generate a new API key for an organization.

    - **org_slug**: Organization identifier
    - **description**: Optional description for the API key

    Returns the generated API key (SAVE THIS - it won't be shown again).
    """
    # VALIDATION: Check if org already has an active API key
    # Bug fix #4: RACE CONDITION NOTE - There is a potential race condition between this check
    # and the INSERT below if multiple requests are made simultaneously. A true fix would require
    # a BigQuery table constraint (UNIQUE on org_slug + is_active), but BigQuery does not support
    # UNIQUE constraints. Consider using INSERT ... WHERE NOT EXISTS or application-level locking.
    from google.cloud import bigquery

    check_query = f"""
    SELECT org_api_key_hash, created_at
    FROM `{settings.gcp_project_id}.organizations.org_api_keys`
    WHERE org_slug = @org_slug AND is_active = TRUE
    LIMIT 1
    """

    check_config = bigquery.QueryJobConfig(
        query_parameters=[
            bigquery.ScalarQueryParameter("org_slug", "STRING", request.org_slug)
        ]
    )

    existing_keys = list(bq_client.client.query(check_query, job_config=check_config).result())

    if existing_keys:
        existing_hash = existing_keys[0]["org_api_key_hash"]
        # Bug fix #11: Add length check before slicing to prevent index errors
        hash_preview = existing_hash[:16] + "..." if existing_hash and len(existing_hash) >= 16 else (existing_hash or "unknown")
        logger.warning(f"Organization {request.org_slug} already has an active API key: {hash_preview}")
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"Organization '{request.org_slug}' already has an active API key. Revoke the existing key first or contact support."
        )

    # Generate secure random API key
    api_key = f"sk_{request.org_slug}_{secrets.token_urlsafe(32)}"

    # Hash the API key
    org_api_key_hash = hashlib.sha256(api_key.encode()).hexdigest()

    # Encrypt API key using KMS for recovery purposes
    try:
        encrypted_org_api_key_bytes = encrypt_value(api_key)
    except Exception as kms_error:
        logger.error(f"KMS encryption failed for org {request.org_slug}: {kms_error}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to encrypt API key. Please check KMS configuration."
        )

    # Generate unique API key ID
    import uuid
    org_api_key_id = str(uuid.uuid4())

    # Insert into BigQuery with all required columns
    insert_query = f"""
    INSERT INTO `{settings.gcp_project_id}.organizations.org_api_keys`
    (org_api_key_id, org_slug, org_api_key_hash, encrypted_org_api_key, scopes, is_active, created_at)
    VALUES
    (@org_api_key_id, @org_slug, @org_api_key_hash, @encrypted_org_api_key, @scopes, TRUE, CURRENT_TIMESTAMP())
    """

    from google.cloud import bigquery

    job_config = bigquery.QueryJobConfig(
        query_parameters=[
            bigquery.ScalarQueryParameter("org_api_key_id", "STRING", org_api_key_id),
            bigquery.ScalarQueryParameter("org_api_key_hash", "STRING", org_api_key_hash),
            bigquery.ScalarQueryParameter("org_slug", "STRING", request.org_slug),
            bigquery.ScalarQueryParameter("encrypted_org_api_key", "BYTES", encrypted_org_api_key_bytes),
            bigquery.ArrayQueryParameter("scopes", "STRING", settings.api_key_default_scopes),
        ]
    )

    bq_client.client.query(insert_query, job_config=job_config).result()

    # Bug fix #9 & Issue #32: Add audit log entry after successful API key creation
    logger.info(
        f"API key created successfully",
        extra={
            "event_type": "admin_api_key_created",
            "org_slug": request.org_slug,
            "org_api_key_id": org_api_key_id,
            "org_api_key_hash": org_api_key_hash[:16] + "...",
            "description": request.description
        }
    )

    await log_create(
        org_slug=request.org_slug,
        resource_type=AuditLogger.RESOURCE_API_KEY,
        resource_id=org_api_key_id,
        details={
            "description": request.description,
            "scopes": settings.api_key_default_scopes
        },
        status=AuditLogger.STATUS_SUCCESS
    )

    return APIKeyResponse(
        api_key=api_key,
        org_api_key_hash=org_api_key_hash,
        org_slug=request.org_slug,
        created_at=datetime.utcnow(),
        description=request.description
    )


@router.delete(
    "/admin/api-keys/{org_api_key_hash}",
    summary="Revoke API key",
    description="Deactivate an API key"
)
async def revoke_api_key(
    org_api_key_hash: str,
    bq_client: BigQueryClient = Depends(get_bigquery_client),
    _admin: None = Depends(verify_admin_key)
):
    """
    Revoke (deactivate) an API key.

    - **org_api_key_hash**: SHA256 hash of the API key

    The API key will be marked as inactive and can no longer be used.
    """
    update_query = f"""
    UPDATE `{settings.gcp_project_id}.organizations.org_api_keys`
    SET is_active = FALSE
    WHERE org_api_key_hash = @org_api_key_hash
    """

    from google.cloud import bigquery

    job_config = bigquery.QueryJobConfig(
        query_parameters=[
            bigquery.ScalarQueryParameter("org_api_key_hash", "STRING", org_api_key_hash)
        ]
    )

    bq_client.client.query(update_query, job_config=job_config).result()

    # Issue #32: Audit logging for API key revocation
    # Note: We don't have org_slug here, but we can query it
    try:
        query_org = f"""
        SELECT org_slug FROM `{settings.gcp_project_id}.organizations.org_api_keys`
        WHERE org_api_key_hash = @org_api_key_hash LIMIT 1
        """
        org_result = list(bq_client.client.query(
            query_org,
            job_config=bigquery.QueryJobConfig(
                query_parameters=[bigquery.ScalarQueryParameter("org_api_key_hash", "STRING", org_api_key_hash)]
            )
        ).result())

        if org_result:
            await log_delete(
                org_slug=org_result[0]["org_slug"],
                resource_type=AuditLogger.RESOURCE_API_KEY,
                resource_id=org_api_key_hash[:16],
                status=AuditLogger.STATUS_SUCCESS
            )
    except Exception as audit_error:
        logger.warning(f"Failed to log API key revocation audit: {audit_error}")

    return {
        "org_api_key_hash": org_api_key_hash,
        "message": "API key revoked successfully"
    }


@router.post(
    "/admin/organizations/{org_slug}/regenerate-api-key",
    response_model=APIKeyResponse,
    summary="Regenerate API key for existing org",
    description="Revoke existing API key(s) and generate a new one. Used for 409 recovery when frontend and backend are out of sync."
)
async def regenerate_api_key(
    org_slug: str,
    bq_client: BigQueryClient = Depends(get_bigquery_client),
    _admin: None = Depends(verify_admin_key)
):
    """
    Regenerate API key for an existing organization.

    Use case: When frontend onboarding gets 409 (org already exists in backend),
    call this endpoint to get a new API key without requiring customer interaction.

    Flow:
    1. Verify org exists in backend
    2. Revoke all existing API keys for this org
    3. Generate new API key
    4. Return new key (frontend stores in user metadata automatically)

    - **org_slug**: Organization identifier

    Returns the generated API key (SAVE THIS - it won't be shown again).
    """
    from google.cloud import bigquery

    # Step 1: Verify org exists
    check_org_query = f"""
    SELECT org_slug, status
    FROM `{settings.gcp_project_id}.organizations.org_profiles`
    WHERE org_slug = @org_slug
    LIMIT 1
    """

    job_config = bigquery.QueryJobConfig(
        query_parameters=[
            bigquery.ScalarQueryParameter("org_slug", "STRING", org_slug)
        ]
    )

    org_results = list(bq_client.client.query(check_org_query, job_config=job_config).result())

    if not org_results:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Organization '{org_slug}' not found in backend. Use /organizations/onboard first."
        )

    org_status = org_results[0]["status"]
    if org_status != "ACTIVE":
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Organization '{org_slug}' is not active (status: {org_status}). Contact support."
        )

    # Step 2: Revoke all existing API keys for this org
    logger.info(f"Revoking existing API keys for org: {org_slug}")

    revoke_query = f"""
    UPDATE `{settings.gcp_project_id}.organizations.org_api_keys`
    SET is_active = FALSE
    WHERE org_slug = @org_slug AND is_active = TRUE
    """

    bq_client.client.query(revoke_query, job_config=job_config).result()

    # Step 3: Generate new API key
    api_key = f"{org_slug}_api_{secrets.token_urlsafe(16)}"
    org_api_key_hash = hashlib.sha256(api_key.encode()).hexdigest()

    # Encrypt API key using KMS for recovery purposes
    try:
        encrypted_org_api_key_bytes = encrypt_value(api_key)
    except Exception as kms_error:
        logger.error(f"KMS encryption failed for org {org_slug}: {kms_error}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to encrypt API key. Please check KMS configuration."
        )

    import uuid
    org_api_key_id = str(uuid.uuid4())

    # Step 4: Insert new API key with all required columns
    insert_query = f"""
    INSERT INTO `{settings.gcp_project_id}.organizations.org_api_keys`
    (org_api_key_id, org_slug, org_api_key_hash, encrypted_org_api_key, scopes, is_active, created_at)
    VALUES
    (@org_api_key_id, @org_slug, @org_api_key_hash, @encrypted_org_api_key, @scopes, TRUE, CURRENT_TIMESTAMP())
    """

    insert_config = bigquery.QueryJobConfig(
        query_parameters=[
            bigquery.ScalarQueryParameter("org_api_key_id", "STRING", org_api_key_id),
            bigquery.ScalarQueryParameter("org_slug", "STRING", org_slug),
            bigquery.ScalarQueryParameter("org_api_key_hash", "STRING", org_api_key_hash),
            bigquery.ScalarQueryParameter("encrypted_org_api_key", "BYTES", encrypted_org_api_key_bytes),
            bigquery.ArrayQueryParameter("scopes", "STRING", settings.api_key_default_scopes),
        ]
    )

    bq_client.client.query(insert_query, job_config=insert_config).result()

    logger.info(f"API key regenerated for org: {org_slug}")

    return APIKeyResponse(
        api_key=api_key,
        org_api_key_hash=org_api_key_hash,
        org_slug=org_slug,
        created_at=datetime.utcnow(),
        description="Regenerated API key"
    )


# ============================================
# Audit Logs (#47)
# ============================================

class AuditLogEntry(BaseModel):
    """Single audit log entry."""
    audit_id: str
    org_slug: str
    user_id: Optional[str] = None
    api_key_id: Optional[str] = None
    action: str
    resource_type: str
    resource_id: Optional[str] = None
    details: Optional[Any] = None
    ip_address: Optional[str] = None
    user_agent: Optional[str] = None
    request_id: Optional[str] = None
    status: str
    error_message: Optional[str] = None
    created_at: datetime


class AuditLogsResponse(BaseModel):
    """Response for audit logs query."""
    org_slug: str
    total_count: int
    logs: List[AuditLogEntry]
    has_more: bool


@router.get(
    "/admin/audit-logs/{org_slug}",
    response_model=AuditLogsResponse,
    summary="Query audit logs for an organization",
    description="Retrieve audit logs with filtering by action, resource type, date range, and status"
)
async def get_audit_logs(
    org_slug: str,
    action: Optional[str] = Query(None, description="Filter by action: CREATE, READ, UPDATE, DELETE, EXECUTE"),
    resource_type: Optional[str] = Query(None, description="Filter by resource: PIPELINE, INTEGRATION, API_KEY, USER, CREDENTIAL, ORG"),
    status_filter: Optional[str] = Query(None, alias="status", description="Filter by status: SUCCESS, FAILURE, DENIED"),
    start_date: Optional[date] = Query(None, description="Start date (inclusive)"),
    end_date: Optional[date] = Query(None, description="End date (inclusive)"),
    limit: int = Query(100, ge=1, le=1000, description="Max records to return"),
    offset: int = Query(0, ge=0, description="Records to skip for pagination"),
    bq_client: BigQueryClient = Depends(get_bigquery_client),
    _admin: None = Depends(verify_admin_key)
):
    """
    Query audit logs for an organization (Admin only).

    This endpoint supports filtering and pagination for compliance reporting.
    Useful for SOC2/HIPAA audit trails and security investigations.

    REQUIRES: X-CA-Root-Key header (admin authentication)
    """
    logger.info(
        f"Querying audit logs",
        extra={
            "event_type": "audit_logs_query",
            "org_slug": org_slug,
            "action": action,
            "resource_type": resource_type,
            "status": status_filter,
            "start_date": str(start_date) if start_date else None,
            "end_date": str(end_date) if end_date else None
        }
    )

    try:
        # Build dynamic query with filters
        base_query = f"""
        SELECT
            audit_id,
            org_slug,
            user_id,
            api_key_id,
            action,
            resource_type,
            resource_id,
            details,
            ip_address,
            user_agent,
            request_id,
            status,
            error_message,
            created_at
        FROM `{settings.gcp_project_id}.organizations.org_audit_logs`
        WHERE org_slug = @org_slug
        """

        query_params = [
            bigquery.ScalarQueryParameter("org_slug", "STRING", org_slug)
        ]

        # Add optional filters
        if action:
            base_query += " AND action = @action"
            query_params.append(bigquery.ScalarQueryParameter("action", "STRING", action.upper()))

        if resource_type:
            base_query += " AND resource_type = @resource_type"
            query_params.append(bigquery.ScalarQueryParameter("resource_type", "STRING", resource_type.upper()))

        if status_filter:
            base_query += " AND status = @status"
            query_params.append(bigquery.ScalarQueryParameter("status", "STRING", status_filter.upper()))

        if start_date:
            base_query += " AND DATE(created_at) >= @start_date"
            query_params.append(bigquery.ScalarQueryParameter("start_date", "DATE", start_date))

        if end_date:
            base_query += " AND DATE(created_at) <= @end_date"
            query_params.append(bigquery.ScalarQueryParameter("end_date", "DATE", end_date))

        # Add ordering and pagination
        base_query += " ORDER BY created_at DESC"
        base_query += f" LIMIT {limit + 1} OFFSET {offset}"  # +1 to check if there are more

        result = list(bq_client.client.query(
            base_query,
            job_config=bigquery.QueryJobConfig(query_parameters=query_params)
        ).result())

        # Check if there are more results
        has_more = len(result) > limit
        if has_more:
            result = result[:limit]  # Remove the extra row

        # Convert to response model
        logs = []
        for row in result:
            logs.append(AuditLogEntry(
                audit_id=row["audit_id"],
                org_slug=row["org_slug"],
                user_id=row.get("user_id"),
                api_key_id=row.get("api_key_id"),
                action=row["action"],
                resource_type=row["resource_type"],
                resource_id=row.get("resource_id"),
                details=row.get("details"),
                ip_address=row.get("ip_address"),
                user_agent=row.get("user_agent"),
                request_id=row.get("request_id"),
                status=row["status"],
                error_message=row.get("error_message"),
                created_at=row["created_at"]
            ))

        return AuditLogsResponse(
            org_slug=org_slug,
            total_count=len(logs),
            logs=logs,
            has_more=has_more
        )

    except Exception as e:
        logger.error(f"Failed to query audit logs: {e}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to query audit logs. Please check server logs."
        )


# ============================================
# Development-Only Endpoint (API Key Retrieval)
# ============================================

class DevApiKeyResponse(BaseModel):
    """Response for dev-only API key retrieval."""
    org_slug: str
    api_key: str
    message: str = "DEV ONLY - Never use in production"


@router.get(
    "/admin/dev/api-key/{org_slug}",
    response_model=DevApiKeyResponse,
    summary="[DEV ONLY] Get decrypted org API key",
    description="Development-only endpoint to retrieve decrypted org API key for testing. DISABLED in production.",
    tags=["Development"]
)
async def get_org_api_key_dev(
    org_slug: str,
    bq_client: BigQueryClient = Depends(get_bigquery_client),
    _admin: None = Depends(verify_admin_key)
):
    """
    Development-only endpoint to retrieve decrypted org API key.

    This endpoint is DISABLED in production environments.
    Use only for local development and testing.

    REQUIRES:
    - X-CA-Root-Key header (admin authentication)
    - ENVIRONMENT must be "development" or "local"
    """
    # SECURITY: Only allow in development/local environments
    # Explicitly block production and staging to prevent accidental exposure
    if settings.environment in ("production", "prod", "staging", "stage"):
        logger.warning(
            f"Dev API key retrieval attempted in {settings.environment} environment",
            extra={"event_type": "security_violation", "org_slug": org_slug}
        )
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="This endpoint is only available in development/local environments"
        )

    logger.info(
        f"[DEV] Retrieving API key for org: {org_slug}",
        extra={"event_type": "dev_api_key_retrieval", "org_slug": org_slug}
    )

    try:
        # Query for encrypted API key
        query = f"""
        SELECT encrypted_org_api_key
        FROM `{settings.gcp_project_id}.organizations.org_api_keys`
        WHERE org_slug = @org_slug AND is_active = TRUE
        LIMIT 1
        """

        from google.cloud import bigquery as bq
        job_config = bq.QueryJobConfig(
            query_parameters=[
                bq.ScalarQueryParameter("org_slug", "STRING", org_slug),
            ]
        )

        result = list(bq_client.client.query(query, job_config=job_config).result())

        if not result:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"No active API key found for org: {org_slug}"
            )

        encrypted_key = result[0]["encrypted_org_api_key"]

        if not encrypted_key:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"API key exists but encrypted value is missing for org: {org_slug}"
            )

        # Decrypt using KMS
        decrypted_key = decrypt_value(encrypted_key)

        return DevApiKeyResponse(
            org_slug=org_slug,
            api_key=decrypted_key,
            message="DEV ONLY - This endpoint is disabled in production"
        )

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"[DEV] Failed to retrieve API key: {e}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to retrieve API key: {str(e)}"
        )
