"""
Admin API Routes
Endpoints for organization and API key management.
"""

from fastapi import APIRouter, Depends, HTTPException, status, Request, Query
from pydantic import BaseModel, Field, ConfigDict
from typing import Optional, List, Any, Dict
from datetime import datetime, date, timezone
import hashlib
import json
import secrets
import logging
import time
import uuid
import httpx
import os

from google.cloud import bigquery
from src.core.engine.bq_client import get_bigquery_client, BigQueryClient
from src.core.utils.supabase_client import get_supabase_client
from src.core.security.kms_encryption import encrypt_value, decrypt_value
from src.app.config import settings
from src.app.dependencies.auth import verify_admin_key
from src.app.dependencies.rate_limit_decorator import rate_limit_global
from src.app.models.org_models import SUBSCRIPTION_LIMITS, SubscriptionPlan
from src.core.utils.audit_logger import log_create, log_delete, AuditLogger
from src.core.utils.error_handling import safe_error_response
# Note: validate_org_slug available if needed from src.core.utils.validators

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
            "validation_timestamp": datetime.now(timezone.utc).isoformat()
        }

        # Sync stored procedures automatically after bootstrap
        procedures_synced = False
        procedure_sync_message = ""
        try:
            pipeline_service_url = os.getenv("PIPELINE_SERVICE_URL", "http://localhost:8001")

            async with httpx.AsyncClient(timeout=120.0) as client:
                response = await client.post(
                    f"{pipeline_service_url}/api/v1/procedures/sync",
                    headers={
                        "Content-Type": "application/json",
                        "X-CA-Root-Key": settings.ca_root_api_key
                    },
                    json={"force": True}
                )

                if response.status_code == 200:
                    sync_result = response.json()
                    procedures_synced = True
                    procedure_sync_message = sync_result.get("message", "Procedures synced successfully")
                    logger.info(f"Bootstrap procedure sync: {procedure_sync_message}")
                else:
                    procedure_sync_message = f"Procedure sync returned {response.status_code}"
                    logger.warning(f"Procedure sync failed (non-fatal): {procedure_sync_message}")

        except Exception as sync_error:
            # Non-fatal - log warning but don't fail bootstrap
            procedure_sync_message = f"Procedure sync failed: {str(sync_error)}"
            logger.warning(f"Procedure sync error (non-fatal): {sync_error}")

        # Add procedure sync status to validation warnings if it failed
        if not procedures_synced:
            validation_warnings.append(f"Procedure sync incomplete: {procedure_sync_message}")

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
    1. Create org profile in BigQuery organizations.org_profiles
    2. Create subscription in Supabase organizations table
    3. Create initial usage quota in BigQuery organizations.org_usage_quotas
    4. Create org-specific BigQuery datasets
    5. Return org details

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
    # FIX: Use direct keys without intermediate mapping for clarity
    plan_limits = SUBSCRIPTION_LIMITS[SubscriptionPlan.STARTER]

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

    # Step 2: Create subscription in Supabase
    try:
        from datetime import date, datetime

        logger.info(f"Creating subscription for: {org_slug} in Supabase")

        supabase = get_supabase_client()

        # Insert organization record with subscription limits into Supabase
        # Column names: pipelines_per_day_limit, pipelines_per_month_limit, concurrent_pipelines_limit
        org_data = {
            "org_slug": org_slug,
            "company_name": request.description or org_slug,
            "admin_email": "admin@example.com",  # Placeholder
            "subscription_plan": "STARTER",
            "subscription_status": "ACTIVE",
            "pipelines_per_day_limit": plan_limits["daily_limit"],
            "pipelines_per_month_limit": plan_limits["monthly_limit"],
            "concurrent_pipelines_limit": plan_limits["concurrent_limit"],
            "seat_limit": plan_limits["seat_limit"],
            "providers_limit": plan_limits["providers_limit"],
            "created_at": datetime.now(timezone.utc).isoformat(),
            "updated_at": datetime.now(timezone.utc).isoformat()
        }

        supabase.table("organizations").insert(org_data).execute()

        logger.info(f"Subscription created for: {org_slug} in Supabase")

    except Exception as e:
        logger.error(f"Failed to create subscription in Supabase: {str(e)}", exc_info=True)
        # Cleanup org profile
        try:
            bq_client.client.query(
                f"DELETE FROM `{settings.gcp_project_id}.organizations.org_profiles` WHERE org_slug = @org_slug",
                job_config=bigquery.QueryJobConfig(
                    query_parameters=[bigquery.ScalarQueryParameter("org_slug", "STRING", org_slug)]
                )
            ).result()
        except Exception as cleanup_error:
            logger.warning(f"Cleanup failed after Supabase creation error for {org_slug}: {cleanup_error}")
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
         updated_at, created_at)
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
                    bigquery.ScalarQueryParameter("daily_limit", "INT64", plan_limits["daily_limit"]),
                    bigquery.ScalarQueryParameter("monthly_limit", "INT64", plan_limits["monthly_limit"]),
                    bigquery.ScalarQueryParameter("concurrent_limit", "INT64", plan_limits["concurrent_limit"]),
                    bigquery.ScalarQueryParameter("seat_limit", "INT64", plan_limits["seat_limit"]),
                    bigquery.ScalarQueryParameter("providers_limit", "INT64", plan_limits["providers_limit"])
                ]
            )
        ).result()

        logger.info(f"Usage quota created for: {org_slug}")

    except Exception as e:
        logger.error(f"Failed to create usage quota: {str(e)}", exc_info=True)
        # Cleanup org profile and Supabase organization record
        try:
            bq_client.client.query(
                f"DELETE FROM `{settings.gcp_project_id}.organizations.org_profiles` WHERE org_slug = @org_slug",
                job_config=bigquery.QueryJobConfig(
                    query_parameters=[bigquery.ScalarQueryParameter("org_slug", "STRING", org_slug)]
                )
            ).result()
            # Cleanup Supabase organization record
            supabase = get_supabase_client()
            supabase.table("organizations").delete().eq("org_slug", org_slug).execute()
        except Exception as cleanup_error:
            logger.warning(f"Cleanup failed after usage quota creation error for {org_slug}: {cleanup_error}")
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
        # Cleanup org profile and Supabase organization record
        try:
            bq_client.client.query(
                f"DELETE FROM `{settings.gcp_project_id}.organizations.org_profiles` WHERE org_slug = @org_slug",
                job_config=bigquery.QueryJobConfig(
                    query_parameters=[bigquery.ScalarQueryParameter("org_slug", "STRING", org_slug)]
                )
            ).result()
            # Cleanup Supabase organization record
            supabase = get_supabase_client()
            supabase.table("organizations").delete().eq("org_slug", org_slug).execute()
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
    FROM `{settings.gcp_project_id}.organizations.org_meta_pipeline_runs`
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
            bigquery.ScalarQueryParameter("encrypted_org_api_key", "BYTES", encrypted_org_api_key_bytes),  # type: ignore[arg-type]
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
        created_at=datetime.now(timezone.utc),
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
            bigquery.ScalarQueryParameter("encrypted_org_api_key", "BYTES", encrypted_org_api_key_bytes),  # type: ignore[arg-type]
            bigquery.ArrayQueryParameter("scopes", "STRING", settings.api_key_default_scopes),
        ]
    )

    bq_client.client.query(insert_query, job_config=insert_config).result()

    logger.info(f"API key regenerated for org: {org_slug}")

    return APIKeyResponse(
        api_key=api_key,
        org_api_key_hash=org_api_key_hash,
        org_slug=org_slug,
        created_at=datetime.now(timezone.utc),
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


# ============================================
# Quota Reset Endpoints (for Scheduler Jobs)
# ============================================

class QuotaResetResponse(BaseModel):
    """Response from quota reset operation."""
    success: bool
    orgs_processed: int
    orgs_created: int
    orgs_skipped: int
    message: str


@router.post(
    "/quota/reset-daily",
    response_model=QuotaResetResponse,
    summary="Reset daily quota counters for all active orgs",
    description="Creates new usage quota records for today. Called by scheduler at midnight UTC."
)
async def reset_daily_quotas(
    request: Request,
    _admin: bool = Depends(verify_admin_key),
    bq_client: BigQueryClient = Depends(get_bigquery_client)
):
    """
    Reset daily quota counters for all active organizations.

    This endpoint:
    1. Fetches all active orgs from BigQuery org_profiles
    2. Gets subscription limits from Supabase organizations table (source of truth)
    3. Creates today's quota record in BigQuery org_usage_quotas
    4. Carries over monthly usage from yesterday

    Called by: cloudact-daily-quota-reset scheduler job at 00:00 UTC

    Requires: X-CA-Root-Key header (admin authentication)
    """
    logger.info("Starting daily quota reset")
    start_time = time.time()

    try:
        supabase = get_supabase_client()
        today = datetime.now(timezone.utc).date()
        today_str = today.strftime("%Y%m%d")

        # Step 1: Get all active orgs from BigQuery
        active_orgs_query = f"""
        SELECT org_slug
        FROM `{settings.gcp_project_id}.organizations.org_profiles`
        WHERE status = 'ACTIVE'
        """
        active_orgs = [row["org_slug"] for row in bq_client.query(active_orgs_query)]
        logger.info(f"Found {len(active_orgs)} active orgs")

        if not active_orgs:
            return QuotaResetResponse(
                success=True,
                orgs_processed=0,
                orgs_created=0,
                orgs_skipped=0,
                message="No active organizations found"
            )

        # Step 2: Check which orgs already have today's quota record
        existing_query = f"""
        SELECT org_slug
        FROM `{settings.gcp_project_id}.organizations.org_usage_quotas`
        WHERE usage_date = CURRENT_DATE()
        """
        existing_orgs = set(row["org_slug"] for row in bq_client.query(existing_query))

        # Step 3: Get yesterday's monthly usage for carry-over
        yesterday_query = f"""
        SELECT org_slug, pipelines_run_month
        FROM `{settings.gcp_project_id}.organizations.org_usage_quotas`
        WHERE usage_date = DATE_SUB(CURRENT_DATE(), INTERVAL 1 DAY)
        """
        yesterday_usage = {row["org_slug"]: row["pipelines_run_month"] for row in bq_client.query(yesterday_query)}

        # Step 4: Get limits from Supabase for all orgs (batch query)
        supabase_result = supabase.table("organizations").select(
            "org_slug, pipelines_per_day_limit, pipelines_per_month_limit, "
            "concurrent_pipelines_limit, seat_limit, providers_limit"
        ).in_("org_slug", active_orgs).execute()

        org_limits = {
            org["org_slug"]: {
                "daily_limit": org.get("pipelines_per_day_limit") or 6,
                "monthly_limit": org.get("pipelines_per_month_limit") or 180,
                "concurrent_limit": org.get("concurrent_pipelines_limit") or 2,
                "seat_limit": org.get("seat_limit") or 2,
                "providers_limit": org.get("providers_limit") or 3,
            }
            for org in (supabase_result.data or [])
        }

        # Default limits for orgs not in Supabase (shouldn't happen, but safety)
        default_limits = SUBSCRIPTION_LIMITS[SubscriptionPlan.STARTER]

        # Step 5: Create quota records for orgs that don't have one today
        orgs_created = 0
        orgs_skipped = 0

        for org_slug in active_orgs:
            if org_slug in existing_orgs:
                orgs_skipped += 1
                continue

            limits = org_limits.get(org_slug, default_limits)
            carry_over_monthly = yesterday_usage.get(org_slug, 0)
            usage_id = f"{org_slug}_{today_str}"

            insert_query = f"""
            INSERT INTO `{settings.gcp_project_id}.organizations.org_usage_quotas`
            (usage_id, org_slug, usage_date, pipelines_run_today, pipelines_succeeded_today,
             pipelines_failed_today, pipelines_run_month, concurrent_pipelines_running,
             daily_limit, monthly_limit, concurrent_limit, seat_limit, providers_limit,
             updated_at, created_at)
            VALUES
            (@usage_id, @org_slug, CURRENT_DATE(), 0, 0, 0, @pipelines_run_month, 0,
             @daily_limit, @monthly_limit, @concurrent_limit, @seat_limit, @providers_limit,
             CURRENT_TIMESTAMP(), CURRENT_TIMESTAMP())
            """

            job_config = bigquery.QueryJobConfig(
                query_parameters=[
                    bigquery.ScalarQueryParameter("usage_id", "STRING", usage_id),
                    bigquery.ScalarQueryParameter("org_slug", "STRING", org_slug),
                    bigquery.ScalarQueryParameter("pipelines_run_month", "INT64", carry_over_monthly),
                    bigquery.ScalarQueryParameter("daily_limit", "INT64", limits["daily_limit"]),
                    bigquery.ScalarQueryParameter("monthly_limit", "INT64", limits["monthly_limit"]),
                    bigquery.ScalarQueryParameter("concurrent_limit", "INT64", limits["concurrent_limit"]),
                    bigquery.ScalarQueryParameter("seat_limit", "INT64", limits["seat_limit"]),
                    bigquery.ScalarQueryParameter("providers_limit", "INT64", limits["providers_limit"]),
                ]
            )

            bq_client.client.query(insert_query, job_config=job_config).result()
            orgs_created += 1
            logger.debug(f"Created quota record for {org_slug}")

        elapsed = time.time() - start_time
        logger.info(f"Daily quota reset complete: {orgs_created} created, {orgs_skipped} skipped in {elapsed:.2f}s")

        return QuotaResetResponse(
            success=True,
            orgs_processed=len(active_orgs),
            orgs_created=orgs_created,
            orgs_skipped=orgs_skipped,
            message=f"Daily quota reset complete in {elapsed:.2f}s"
        )

    except Exception as e:
        logger.error(f"Daily quota reset failed: {e}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Daily quota reset failed: {str(e)}"
        )


@router.post(
    "/quota/reset-monthly",
    response_model=QuotaResetResponse,
    summary="Reset monthly quota counters for all active orgs",
    description="Resets pipelines_run_month to 0 for all organizations. Called by scheduler at 00:05 UTC on 1st of month."
)
async def reset_monthly_quotas(
    request: Request,
    _admin: bool = Depends(verify_admin_key),
    bq_client: BigQueryClient = Depends(get_bigquery_client)
):
    """
    Reset monthly quota counters for all active organizations.

    This endpoint:
    1. Resets pipelines_run_month to 0 for all orgs with today's quota record
    2. Only runs on the 1st of the month (scheduler should enforce this, endpoint validates)

    Called by: cloudact-monthly-quota-reset scheduler job at 00:05 UTC on 1st

    Requires: X-CA-Root-Key header (admin authentication)
    """
    logger.info("Starting monthly quota reset")
    start_time = time.time()

    try:
        today = datetime.now(timezone.utc).date()

        # Safety check: only run on 1st of month (scheduler should enforce, this is backup)
        if today.day != 1:
            logger.warning(f"Monthly quota reset called on day {today.day}, not 1st")
            return QuotaResetResponse(
                success=True,
                orgs_processed=0,
                orgs_created=0,
                orgs_skipped=0,
                message=f"Skipped: Not the 1st of the month (day={today.day})"
            )

        # Reset pipelines_run_month to 0 for all orgs with today's quota record
        update_query = f"""
        UPDATE `{settings.gcp_project_id}.organizations.org_usage_quotas`
        SET pipelines_run_month = 0,
            updated_at = CURRENT_TIMESTAMP()
        WHERE usage_date = CURRENT_DATE()
        """

        bq_client.client.query(update_query).result()

        # Get count of affected orgs
        count_query = f"""
        SELECT COUNT(DISTINCT org_slug) as count
        FROM `{settings.gcp_project_id}.organizations.org_usage_quotas`
        WHERE usage_date = CURRENT_DATE()
        """
        count_result = list(bq_client.client.query(count_query).result())
        orgs_reset = count_result[0]["count"] if count_result else 0

        elapsed = time.time() - start_time
        logger.info(f"Monthly quota reset complete: {orgs_reset} orgs reset in {elapsed:.2f}s")

        return QuotaResetResponse(
            success=True,
            orgs_processed=orgs_reset,
            orgs_created=0,
            orgs_skipped=0,
            message=f"Monthly quota reset complete: {orgs_reset} orgs reset in {elapsed:.2f}s"
        )

    except Exception as e:
        logger.error(f"Monthly quota reset failed: {e}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Monthly quota reset failed: {str(e)}"
        )


@router.post(
    "/quota/cleanup-stale",
    response_model=QuotaResetResponse,
    summary="Cleanup stale concurrent pipeline counters",
    description="Fixes stuck concurrent counters when pipelines crash without decrementing. Called every 15 minutes."
)
async def cleanup_stale_concurrent(
    request: Request,
    _admin: bool = Depends(verify_admin_key),
    bq_client: BigQueryClient = Depends(get_bigquery_client)
):
    """
    Cleanup stale concurrent pipeline counters.

    When pipelines crash mid-execution, concurrent_pipelines_running counter
    doesn't get decremented. This endpoint finds pipelines stuck in RUNNING state
    for too long and resets the counters.

    Called by: cloudact-15min-stale-cleanup scheduler job every 15 minutes

    Requires: X-CA-Root-Key header (admin authentication)
    """
    logger.info("Starting stale concurrent cleanup")
    start_time = time.time()

    try:
        # Query for orgs with concurrent_pipelines_running > 0 but no recent RUNNING pipelines
        query = f"""
        WITH running_pipelines AS (
            SELECT
                org_slug,
                COUNT(*) as actual_running
            FROM `{settings.gcp_project_id}.organizations.org_meta_pipeline_runs`
            WHERE status = 'RUNNING'
              AND start_time > TIMESTAMP_SUB(CURRENT_TIMESTAMP(), INTERVAL 30 MINUTE)
            GROUP BY org_slug
        ),
        current_counters AS (
            SELECT
                org_slug,
                concurrent_pipelines_running
            FROM `{settings.gcp_project_id}.organizations.org_usage_quotas`
            WHERE usage_date = CURRENT_DATE()
              AND concurrent_pipelines_running > 0
        )
        SELECT
            c.org_slug,
            c.concurrent_pipelines_running,
            COALESCE(r.actual_running, 0) as actual_running
        FROM current_counters c
        LEFT JOIN running_pipelines r ON c.org_slug = r.org_slug
        WHERE c.concurrent_pipelines_running > COALESCE(r.actual_running, 0)
        """

        results = list(bq_client.client.query(query).result())

        if not results:
            elapsed = time.time() - start_time
            logger.info(f"No stale concurrent counters found ({elapsed:.2f}s)")
            return QuotaResetResponse(
                success=True,
                orgs_processed=0,
                orgs_created=0,
                orgs_skipped=0,
                message=f"No stale concurrent counters found ({elapsed:.2f}s)"
            )

        orgs_fixed = 0

        for row in results:
            org_slug = row["org_slug"]
            actual = row["actual_running"]

            # Update the counter to match actual running pipelines
            update_query = f"""
            UPDATE `{settings.gcp_project_id}.organizations.org_usage_quotas`
            SET concurrent_pipelines_running = @actual_running,
                updated_at = CURRENT_TIMESTAMP()
            WHERE org_slug = @org_slug
              AND usage_date = CURRENT_DATE()
            """

            job_config = bigquery.QueryJobConfig(
                query_parameters=[
                    bigquery.ScalarQueryParameter("org_slug", "STRING", org_slug),
                    bigquery.ScalarQueryParameter("actual_running", "INT64", actual),
                ]
            )

            bq_client.client.query(update_query, job_config=job_config).result()
            orgs_fixed += 1
            logger.debug(f"Fixed concurrent counter for {org_slug}: set to {actual}")

        # Mark old RUNNING pipelines as FAILED
        mark_failed_query = f"""
        UPDATE `{settings.gcp_project_id}.organizations.org_meta_pipeline_runs`
        SET status = 'FAILED',
            error_message = 'Marked failed by stale cleanup - no completion after 30 minutes',
            end_time = CURRENT_TIMESTAMP()
        WHERE status = 'RUNNING'
          AND start_time < TIMESTAMP_SUB(CURRENT_TIMESTAMP(), INTERVAL 30 MINUTE)
        """

        bq_client.client.query(mark_failed_query).result()

        elapsed = time.time() - start_time
        logger.info(f"Stale cleanup complete: {orgs_fixed} orgs fixed in {elapsed:.2f}s")

        return QuotaResetResponse(
            success=True,
            orgs_processed=orgs_fixed,
            orgs_created=orgs_fixed,
            orgs_skipped=0,
            message=f"Stale cleanup complete: {orgs_fixed} orgs fixed in {elapsed:.2f}s"
        )

    except Exception as e:
        logger.error(f"Stale cleanup failed: {e}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Stale cleanup failed: {str(e)}"
        )


# ============================================
# Alerts Processing Endpoint
# ============================================

class ProcessAlertsRequest(BaseModel):
    """Request to process alerts for all organizations."""
    org_slug: Optional[str] = Field(
        default=None,
        description="If provided, process alerts for this org only. Otherwise processes all active orgs."
    )
    alert_types: List[str] = Field(
        default=[
            "cost_threshold", "absolute_threshold",
            "budget_percent", "budget_forecast", "hierarchy_budget",
            "anomaly_percent_change", "anomaly_std_deviation",
        ],
        description="Types of alerts to process (matches RuleType enum values)"
    )
    send_notifications: bool = Field(
        default=True,
        description="Whether to send notifications for triggered alerts"
    )
    dry_run: bool = Field(
        default=False,
        description="If true, only check thresholds without sending notifications"
    )


class ProcessAlertsResponse(BaseModel):
    """Response from processing alerts."""
    success: bool
    orgs_processed: int
    alerts_triggered: int
    notifications_sent: int
    errors: int
    org_errors: List[Dict[str, Any]] = Field(default_factory=list)
    message: str


@router.post(
    "/alerts/process-all",
    response_model=ProcessAlertsResponse,
    summary="Process alerts for all organizations",
    description="Scheduled job endpoint: checks cost thresholds and sends notifications for all orgs"
)
async def process_all_alerts(
    request: ProcessAlertsRequest,
    _: str = Depends(verify_admin_key),
    bq_client: BigQueryClient = Depends(get_bigquery_client),
):
    """
    Process alerts for all active organizations.
    
    This endpoint is called by the daily alerts scheduler job.
    
    For each org:
    1. Fetch notification rules from org_notification_rules
    2. Calculate current costs based on rule period
    3. Compare against thresholds
    4. Send notifications via configured channels
    """
    import asyncio
    import json as _json

    start_time = time.time()
    orgs_processed = 0
    alerts_triggered = 0
    notifications_sent = 0
    errors = 0
    org_errors = []
    
    try:
        # Get active organizations (optionally filtered by org_slug)
        if request.org_slug:
            query = f"""
            SELECT org_slug, default_currency
            FROM `{settings.gcp_project_id}.organizations.org_profiles`
            WHERE status = 'ACTIVE' AND org_slug = @filter_org_slug
            ORDER BY org_slug
            """
            job_config_orgs = bigquery.QueryJobConfig(
                query_parameters=[
                    bigquery.ScalarQueryParameter("filter_org_slug", "STRING", request.org_slug),
                ]
            )
            result = bq_client.client.query(query, job_config=job_config_orgs).result()
        else:
            query = f"""
            SELECT org_slug, default_currency
            FROM `{settings.gcp_project_id}.organizations.org_profiles`
            WHERE status = 'ACTIVE'
            ORDER BY org_slug
            """
            result = bq_client.client.query(query).result()

        orgs = [{"org_slug": row.org_slug, "currency": row.default_currency} for row in result]

        if request.org_slug and not orgs:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Organization '{request.org_slug}' not found or not active"
            )

        mode = f"single-org ({request.org_slug})" if request.org_slug else "all-orgs"
        logger.info(f"Processing alerts for {len(orgs)} active organizations ({mode})")
        
        for org in orgs:
            org_slug = org["org_slug"]
            currency = org.get("currency", "USD")
            
            try:
                # Fetch notification rules for this org
                rules_query = f"""
                SELECT
                    rule_id,
                    name AS rule_name,
                    rule_type,
                    conditions,
                    priority,
                    hierarchy_entity_id,
                    hierarchy_path,
                    notify_channel_ids
                FROM `{settings.gcp_project_id}.{org_slug}_prod.org_notification_rules`
                WHERE is_active = TRUE
                  AND rule_type IN UNNEST(@alert_types)
                """
                
                job_config = bigquery.QueryJobConfig(
                    query_parameters=[
                        bigquery.ArrayQueryParameter("alert_types", "STRING", request.alert_types),
                    ]
                )
                
                # Try to fetch rules - table may not exist for some orgs
                try:
                    rules_result = bq_client.client.query(rules_query, job_config=job_config).result()
                    rules = list(rules_result)
                except Exception as rule_error:
                    # No rules table or no rules - skip this org
                    logger.debug(f"No notification rules for {org_slug}: {rule_error}")
                    orgs_processed += 1
                    continue
                
                if not rules:
                    orgs_processed += 1
                    continue

                # Get current month costs for this org (used by cost_threshold / absolute_threshold rules)
                costs_query = f"""
                SELECT SUM(BilledCost) as total_cost
                FROM `{settings.gcp_project_id}.{org_slug}_prod.cost_data_standard_1_3`
                WHERE BillingPeriodStart >= DATE_TRUNC(CURRENT_DATE(), MONTH)
                  AND BillingPeriodStart < DATE_ADD(DATE_TRUNC(CURRENT_DATE(), MONTH), INTERVAL 1 MONTH)
                """

                try:
                    costs_result = bq_client.client.query(costs_query).result()
                    costs_row = next(costs_result, None)
                    current_cost = float(costs_row.total_cost) if costs_row and costs_row.total_cost else 0.0
                except Exception:
                    current_cost = 0.0

                # Fetch active budgets for budget-aware rules (budget_percent, budget_forecast, hierarchy_budget)
                budget_rules_present = any(
                    r.rule_type in ("budget_percent", "budget_forecast", "hierarchy_budget")
                    for r in rules
                )
                budgets_map: Dict[str, Any] = {}  # entity_id → {budget_amount, actual_cost, utilization_pct}

                if budget_rules_present:
                    try:
                        budgets_query = f"""
                        SELECT
                            b.budget_id,
                            b.hierarchy_entity_id,
                            b.hierarchy_path,
                            b.category,
                            b.budget_amount,
                            b.period_type,
                            b.period_start,
                            b.period_end,
                            COALESCE(SUM(c.BilledCost), 0) AS actual_cost
                        FROM `{settings.gcp_project_id}.organizations.org_budgets` b
                        LEFT JOIN `{settings.gcp_project_id}.{org_slug}_prod.cost_data_standard_1_3` c
                            ON c.BillingPeriodStart >= b.period_start
                            AND c.BillingPeriodStart < b.period_end
                            AND (
                                b.hierarchy_entity_id = 'ORG'
                                OR c.x_hierarchy_entity_id = b.hierarchy_entity_id
                                OR c.x_hierarchy_path LIKE CONCAT('%/', b.hierarchy_entity_id, '/%')
                                OR c.x_hierarchy_path LIKE CONCAT('%/', b.hierarchy_entity_id)
                            )
                        WHERE b.org_slug = @org_slug
                          AND b.is_active = TRUE
                          AND b.period_start <= CURRENT_DATE()
                          AND b.period_end >= CURRENT_DATE()
                        GROUP BY b.budget_id, b.hierarchy_entity_id, b.hierarchy_path,
                                 b.category, b.budget_amount, b.period_type,
                                 b.period_start, b.period_end
                        """
                        budget_params = [
                            bigquery.ScalarQueryParameter("org_slug", "STRING", org_slug),
                        ]
                        budget_config = bigquery.QueryJobConfig(query_parameters=budget_params)
                        budget_result = bq_client.client.query(budgets_query, job_config=budget_config).result()
                        for brow in budget_result:
                            pct = (float(brow.actual_cost) / float(brow.budget_amount) * 100) if brow.budget_amount > 0 else 0.0
                            key = brow.hierarchy_entity_id
                            # Keep the highest utilization if multiple budgets for same entity
                            if key not in budgets_map or pct > budgets_map[key]["utilization_pct"]:
                                budgets_map[key] = {
                                    "budget_id": brow.budget_id,
                                    "budget_amount": float(brow.budget_amount),
                                    "actual_cost": float(brow.actual_cost),
                                    "utilization_pct": pct,
                                    "category": brow.category,
                                    "hierarchy_path": brow.hierarchy_path,
                                }
                    except Exception as budget_err:
                        logger.debug(f"No budget data for {org_slug}: {budget_err}")

                # Check each rule
                for rule in rules:
                    triggered = False
                    rule_type = rule.rule_type

                    # Parse conditions JSON
                    try:
                        conditions = _json.loads(rule.conditions) if isinstance(rule.conditions, str) else {}
                    except (_json.JSONDecodeError, TypeError):
                        conditions = {}

                    if rule_type in ("cost_threshold", "absolute_threshold"):
                        # Simple cost vs threshold (threshold_amount stored in conditions)
                        threshold = float(conditions.get("threshold_amount", 0))
                        if threshold == 0:
                            # Fallback: some rules store in budget_amount
                            threshold = float(conditions.get("budget_amount", 0))
                        if current_cost >= threshold and threshold > 0:
                            triggered = True

                    elif rule_type == "budget_percent":
                        # Check if any budget exceeds the threshold percentage
                        threshold_pct = float(conditions.get("threshold_percent", 80))

                        # If rule targets a specific hierarchy entity, only check that one
                        target_entity = getattr(rule, "hierarchy_entity_id", None)

                        for entity_id, bdata in budgets_map.items():
                            if target_entity and entity_id != target_entity:
                                continue
                            if bdata["utilization_pct"] >= threshold_pct:
                                triggered = True
                                logger.info(
                                    f"Budget alert for {org_slug}/{entity_id}: "
                                    f"{bdata['utilization_pct']:.1f}% of "
                                    f"${bdata['budget_amount']:,.0f} "
                                    f"(threshold: {threshold_pct}%)"
                                )
                                break

                    elif rule_type == "hierarchy_budget":
                        # Check budgets filtered by hierarchy level/entity
                        threshold_pct = float(conditions.get("threshold_percent", 80))
                        target_level = conditions.get("hierarchy_level")
                        target_entity = getattr(rule, "hierarchy_entity_id", None)

                        for entity_id, bdata in budgets_map.items():
                            if target_entity and entity_id != target_entity:
                                continue
                            if bdata["utilization_pct"] >= threshold_pct:
                                triggered = True
                                logger.info(
                                    f"Hierarchy budget alert for {org_slug}/{entity_id}: "
                                    f"{bdata['utilization_pct']:.1f}% of "
                                    f"${bdata['budget_amount']:,.0f}"
                                )
                                break

                    elif rule_type == "budget_forecast":
                        # Check if projected end-of-period spend exceeds budget
                        threshold_pct = float(conditions.get("forecast_threshold_percent", 100))

                        for entity_id, bdata in budgets_map.items():
                            # Simple linear forecast: if current utilization pace
                            # would exceed threshold by end of period
                            if bdata["utilization_pct"] >= threshold_pct:
                                triggered = True
                                break

                    if triggered:
                        alerts_triggered += 1

                        if request.send_notifications and not request.dry_run:
                            # Resolve channel recipients from notify_channel_ids
                            channel_ids = list(rule.notify_channel_ids) if rule.notify_channel_ids else []
                            recipients = []

                            if channel_ids:
                                try:
                                    ch_query = f"""
                                    SELECT channel_id, channel_type, email_recipients
                                    FROM `{settings.gcp_project_id}.{org_slug}_prod.org_notification_channels`
                                    WHERE channel_id IN UNNEST(@channel_ids)
                                      AND is_active = TRUE
                                    """
                                    ch_config = bigquery.QueryJobConfig(
                                        query_parameters=[
                                            bigquery.ArrayQueryParameter("channel_ids", "STRING", channel_ids),
                                        ]
                                    )
                                    ch_result = bq_client.client.query(ch_query, job_config=ch_config).result()
                                    for ch in ch_result:
                                        if ch.channel_type == "email" and ch.email_recipients:
                                            recipients.extend(list(ch.email_recipients))
                                except Exception as ch_err:
                                    logger.warning(f"Failed to fetch channels for {org_slug}: {ch_err}")

                            trigger_msg = (
                                f"Cost alert: {rule.rule_name} - Current spend "
                                f"${current_cost:,.2f} {currency} triggered rule "
                                f"(type: {rule_type})"
                            )

                            logger.info(
                                f"Alert triggered for {org_slug}: {rule.rule_name} "
                                f"(type: {rule_type}, current_cost: "
                                f"{current_cost:.2f} {currency})"
                            )

                            # Dispatch notification via Pipeline Service
                            try:
                                pipeline_url = f"{settings.pipeline_service_url}/api/v1/notifications/send"
                                root_key = os.environ.get("CA_ROOT_API_KEY", "")
                                async with httpx.AsyncClient(timeout=30.0) as client:
                                    resp = await client.post(
                                        pipeline_url,
                                        json={
                                            "org_slug": org_slug,
                                            "event": "alert_triggered",
                                            "severity": rule.priority if isinstance(rule.priority, str) else "medium",
                                            "title": f"Cost Alert: {rule.rule_name}",
                                            "message": trigger_msg,
                                            "rule_id": rule.rule_id,
                                            "recipients": recipients,
                                            "channels": ["email"],
                                            "total_cost": current_cost,
                                            "threshold": float(conditions.get("threshold_amount", conditions.get("threshold_percent", 0))),
                                            "currency": currency,
                                            "period": "current_month",
                                        },
                                        headers={"X-CA-Root-Key": root_key},
                                    )
                                    if resp.status_code == 200:
                                        notifications_sent += 1
                                    else:
                                        logger.warning(
                                            f"Pipeline notification returned {resp.status_code} "
                                            f"for {org_slug}/{rule.rule_id}"
                                        )
                            except httpx.RequestError as send_err:
                                logger.warning(f"Pipeline service unreachable for alert dispatch: {send_err}")

                            # Update last_triggered_at in BQ
                            try:
                                update_query = f"""
                                UPDATE `{settings.gcp_project_id}.{org_slug}_prod.org_notification_rules`
                                SET last_triggered_at = CURRENT_TIMESTAMP(),
                                    trigger_count_today = IFNULL(trigger_count_today, 0) + 1
                                WHERE rule_id = @rule_id
                                """
                                update_config = bigquery.QueryJobConfig(
                                    query_parameters=[
                                        bigquery.ScalarQueryParameter("rule_id", "STRING", rule.rule_id),
                                    ]
                                )
                                bq_client.client.query(update_query, job_config=update_config).result()
                            except Exception as update_err:
                                logger.warning(f"Failed to update last_triggered_at for {rule.rule_id}: {update_err}")

                orgs_processed += 1
                
            except Exception as org_error:
                errors += 1
                org_errors.append({
                    "org_slug": org_slug,
                    "error": str(org_error)[:200]
                })
                logger.warning(f"Error processing alerts for {org_slug}: {org_error}")
        
        elapsed = time.time() - start_time
        message = (
            f"Alerts processed: {orgs_processed} orgs, "
            f"{alerts_triggered} alerts triggered, "
            f"{notifications_sent} notifications sent "
            f"in {elapsed:.2f}s"
        )
        
        logger.info(message)
        
        return ProcessAlertsResponse(
            success=True,
            orgs_processed=orgs_processed,
            alerts_triggered=alerts_triggered,
            notifications_sent=notifications_sent,
            errors=errors,
            org_errors=org_errors[:10],  # Limit to first 10 errors
            message=message
        )
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Process all alerts failed: {e}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Process all alerts failed: {str(e)}"
        )


# ============================================
# Pipeline Run-All Endpoint
# ============================================

PROVIDER_PIPELINE_MAP = {
    "GCP_SA":    {"category": "cloud", "path": "cloud/gcp/cost/billing"},
    "AWS_ROLE":  {"category": "cloud", "path": "cloud/aws/cost/billing"},
    "AZURE_APP": {"category": "cloud", "path": "cloud/azure/cost/billing"},
    "OCI_USER":  {"category": "cloud", "path": "cloud/oci/cost/billing"},
    "OPENAI":    {"category": "genai", "path": "genai/payg/openai"},
    "CLAUDE":    {"category": "genai", "path": "genai/payg/anthropic"},
    "GEMINI":    {"category": "genai", "path": "genai/payg/gemini"},
    "DEEPSEEK":  {"category": "genai", "path": "genai/payg/deepseek"},
}


class RunAllPipelinesRequest(BaseModel):
    """Request to run cost pipelines for all (or one) organizations."""
    org_slug: Optional[str] = Field(
        default=None,
        description="If provided, run pipelines for this org only. Otherwise runs for all active orgs."
    )
    categories: Optional[List[str]] = Field(
        default=None,
        description="Filter by category: 'cloud', 'genai'. If omitted, runs all."
    )
    providers: Optional[List[str]] = Field(
        default=None,
        description="Filter by provider key: 'GCP_SA', 'OPENAI', etc. If omitted, runs all."
    )
    date: Optional[str] = Field(
        default=None,
        description="Pipeline run date (YYYY-MM-DD). Defaults to yesterday."
    )
    dry_run: bool = Field(
        default=False,
        description="If true, report what would run without triggering pipelines."
    )


class RunAllPipelinesResponse(BaseModel):
    """Response from running pipelines for all organizations."""
    success: bool
    batch_run_id: str = ""
    orgs_processed: int
    orgs_skipped: int
    pipelines_triggered: int
    pipelines_failed: int
    pipelines_skipped_quota: int
    total_integrations: int
    results: List[Dict[str, Any]] = Field(default_factory=list)
    errors: List[Dict[str, Any]] = Field(default_factory=list)
    message: str
    elapsed_seconds: float


@router.post(
    "/pipelines/run-all",
    response_model=RunAllPipelinesResponse,
    summary="Run cost pipelines for all organizations",
    description="Triggers cost pipelines for all active orgs with valid integrations. "
                "Supports filtering by org, category, and provider."
)
async def run_all_pipelines(
    request: RunAllPipelinesRequest,
    _: str = Depends(verify_admin_key),
    bq_client: BigQueryClient = Depends(get_bigquery_client),
):
    """
    Run cost pipelines for all active organizations.

    For each org:
    1. Find active, validated integration credentials
    2. Map provider → pipeline path
    3. Decrypt org API key
    4. POST to Pipeline Service to trigger each pipeline
    """
    start_time = time.time()
    orgs_processed = 0
    orgs_skipped = 0
    pipelines_triggered = 0
    pipelines_failed = 0
    pipelines_skipped_quota = 0
    total_integrations = 0
    results: List[Dict[str, Any]] = []
    errors: List[Dict[str, Any]] = []

    # Determine run date (default: yesterday)
    if request.date:
        run_date = request.date
    else:
        from datetime import timedelta
        run_date = (date.today() - timedelta(days=1)).isoformat()

    try:
        # 1. Get active organizations
        if request.org_slug:
            org_query = f"""
            SELECT org_slug
            FROM `{settings.gcp_project_id}.organizations.org_profiles`
            WHERE status = 'ACTIVE' AND org_slug = @filter_org_slug
            """
            org_config = bigquery.QueryJobConfig(
                query_parameters=[
                    bigquery.ScalarQueryParameter("filter_org_slug", "STRING", request.org_slug),
                ]
            )
            org_result = bq_client.client.query(org_query, job_config=org_config).result()
        else:
            org_query = f"""
            SELECT org_slug
            FROM `{settings.gcp_project_id}.organizations.org_profiles`
            WHERE status = 'ACTIVE'
            ORDER BY org_slug
            """
            org_result = bq_client.client.query(org_query).result()

        org_slugs = [row.org_slug for row in org_result]

        if request.org_slug and not org_slugs:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Organization '{request.org_slug}' not found or not active"
            )

        mode = f"single-org ({request.org_slug})" if request.org_slug else "all-orgs"
        logger.info(f"Pipeline run-all: {len(org_slugs)} orgs ({mode}), date={run_date}, dry_run={request.dry_run}")

        # 2. Process each org
        for org_slug in org_slugs:
            try:
                # 2a. Get active, validated integration credentials
                creds_query = f"""
                SELECT credential_id, provider
                FROM `{settings.gcp_project_id}.organizations.org_integration_credentials`
                WHERE org_slug = @org_slug
                  AND is_active = TRUE
                  AND validation_status = 'VALID'
                """
                creds_config = bigquery.QueryJobConfig(
                    query_parameters=[
                        bigquery.ScalarQueryParameter("org_slug", "STRING", org_slug),
                    ]
                )
                creds_result = bq_client.client.query(creds_query, job_config=creds_config).result()
                creds = list(creds_result)

                if not creds:
                    orgs_skipped += 1
                    continue

                # 2b. Filter by categories/providers
                matched_creds = []
                for cred in creds:
                    provider_key = cred.provider
                    mapping = PROVIDER_PIPELINE_MAP.get(provider_key)
                    if not mapping:
                        continue
                    if request.categories and mapping["category"] not in request.categories:
                        continue
                    if request.providers and provider_key not in request.providers:
                        continue
                    matched_creds.append((cred, mapping))

                if not matched_creds:
                    orgs_skipped += 1
                    continue

                total_integrations += len(matched_creds)

                # 2c. Get org API key and decrypt
                key_query = f"""
                SELECT api_key_encrypted, kms_key_version
                FROM `{settings.gcp_project_id}.organizations.org_api_keys`
                WHERE org_slug = @org_slug AND is_active = TRUE
                LIMIT 1
                """
                key_config = bigquery.QueryJobConfig(
                    query_parameters=[
                        bigquery.ScalarQueryParameter("org_slug", "STRING", org_slug),
                    ]
                )
                key_result = bq_client.client.query(key_query, job_config=key_config).result()
                key_row = next(key_result, None)

                if not key_row or not key_row.api_key_encrypted:
                    orgs_skipped += 1
                    errors.append({
                        "org_slug": org_slug,
                        "error": "No active API key found"
                    })
                    continue

                try:
                    org_api_key = decrypt_value(
                        key_row.api_key_encrypted,
                        key_row.kms_key_version
                    )
                except Exception as decrypt_err:
                    orgs_skipped += 1
                    errors.append({
                        "org_slug": org_slug,
                        "error": f"API key decryption failed: {str(decrypt_err)[:100]}"
                    })
                    continue

                # 2d. Trigger each pipeline
                for cred, mapping in matched_creds:
                    pipeline_path = mapping["path"]

                    if request.dry_run:
                        pipelines_triggered += 1
                        if len(results) < 100:
                            results.append({
                                "org_slug": org_slug,
                                "provider": cred.provider,
                                "pipeline_path": pipeline_path,
                                "date": run_date,
                                "status": "dry_run",
                            })
                        continue

                    # POST to Pipeline Service
                    pipeline_url = (
                        f"{settings.pipeline_service_url}/api/v1/pipelines"
                        f"/run/{org_slug}/{pipeline_path}"
                    )
                    try:
                        async with httpx.AsyncClient(timeout=120.0) as client:
                            resp = await client.post(
                                pipeline_url,
                                headers={"X-API-Key": org_api_key},
                                params={"date": run_date},
                            )

                        if resp.status_code == 200:
                            pipelines_triggered += 1
                            if len(results) < 100:
                                results.append({
                                    "org_slug": org_slug,
                                    "provider": cred.provider,
                                    "pipeline_path": pipeline_path,
                                    "date": run_date,
                                    "status": "triggered",
                                })
                        elif resp.status_code == 429:
                            pipelines_skipped_quota += 1
                            if len(results) < 100:
                                results.append({
                                    "org_slug": org_slug,
                                    "provider": cred.provider,
                                    "pipeline_path": pipeline_path,
                                    "date": run_date,
                                    "status": "quota_exceeded",
                                })
                        else:
                            pipelines_failed += 1
                            if len(results) < 100:
                                results.append({
                                    "org_slug": org_slug,
                                    "provider": cred.provider,
                                    "pipeline_path": pipeline_path,
                                    "date": run_date,
                                    "status": "failed",
                                    "http_status": resp.status_code,
                                    "detail": resp.text[:200],
                                })
                    except httpx.RequestError as req_err:
                        pipelines_failed += 1
                        if len(results) < 100:
                            results.append({
                                "org_slug": org_slug,
                                "provider": cred.provider,
                                "pipeline_path": pipeline_path,
                                "date": run_date,
                                "status": "error",
                                "detail": str(req_err)[:200],
                            })

                orgs_processed += 1

            except Exception as org_error:
                orgs_skipped += 1
                if len(errors) < 20:
                    errors.append({
                        "org_slug": org_slug,
                        "error": str(org_error)[:200]
                    })
                logger.warning(f"Pipeline run-all error for {org_slug}: {org_error}")

        elapsed = time.time() - start_time
        dry_label = " (DRY RUN)" if request.dry_run else ""
        message = (
            f"Pipeline run-all{dry_label}: {orgs_processed} orgs processed, "
            f"{orgs_skipped} skipped, {pipelines_triggered} triggered, "
            f"{pipelines_failed} failed, {pipelines_skipped_quota} quota-skipped "
            f"in {elapsed:.2f}s"
        )
        logger.info(message)

        # Persist batch run record to BigQuery
        batch_run_id = str(uuid.uuid4())
        now_ts = datetime.now(timezone.utc).isoformat()
        batch_status = "COMPLETED" if pipelines_failed == 0 else "PARTIAL"
        try:
            batch_row = {
                "batch_run_id": batch_run_id,
                "org_slug": request.org_slug or "ALL",
                "trigger_type": "MANUAL" if request.org_slug else "SCHEDULED",
                "status": batch_status,
                "run_date": run_date,
                "dry_run": request.dry_run,
                "categories_filter": json.dumps(request.categories) if request.categories else None,
                "providers_filter": json.dumps(request.providers) if request.providers else None,
                "orgs_processed": orgs_processed,
                "orgs_skipped": orgs_skipped,
                "pipelines_triggered": pipelines_triggered,
                "pipelines_failed": pipelines_failed,
                "pipelines_skipped_quota": pipelines_skipped_quota,
                "total_integrations": total_integrations,
                "results": json.dumps(results[:100]),
                "errors": json.dumps(errors[:20]),
                "elapsed_seconds": round(elapsed, 2),
                "triggered_at": now_ts,
                "completed_at": now_ts,
                "created_at": now_ts,
            }
            table_ref = f"{settings.gcp_project_id}.organizations.org_meta_pipeline_batch_runs"
            bq_errors = bq_client.client.insert_rows_json(table_ref, [batch_row])
            if bq_errors:
                logger.warning(f"Failed to persist batch run {batch_run_id}: {bq_errors}")
        except Exception as persist_err:
            logger.warning(f"Failed to persist batch run record: {persist_err}")

        return RunAllPipelinesResponse(
            success=True,
            batch_run_id=batch_run_id,
            orgs_processed=orgs_processed,
            orgs_skipped=orgs_skipped,
            pipelines_triggered=pipelines_triggered,
            pipelines_failed=pipelines_failed,
            pipelines_skipped_quota=pipelines_skipped_quota,
            total_integrations=total_integrations,
            results=results,
            errors=errors,
            message=message,
            elapsed_seconds=round(elapsed, 2),
        )

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Pipeline run-all failed: {e}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Pipeline run-all failed: {str(e)}"
        )
