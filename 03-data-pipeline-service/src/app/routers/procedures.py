"""
Procedure Management API Routes
Endpoints for managing BigQuery stored procedures in the organizations dataset.
"""

from fastapi import APIRouter, Depends, HTTPException, status
from typing import List, Optional, Dict, Any
from pydantic import BaseModel, Field
from datetime import datetime
from pathlib import Path
import logging
import os
import re

from src.app.dependencies.auth import verify_admin_key
from src.core.engine.bq_client import get_bigquery_client, BigQueryClient
from src.app.config import settings
from google.cloud import bigquery

logger = logging.getLogger(__name__)

router = APIRouter()

# ============================================
# Models
# ============================================

class ProcedureInfo(BaseModel):
    """Information about a stored procedure."""
    name: str = Field(..., description="Procedure name")
    dataset: str = Field(..., description="Dataset containing the procedure")
    project_id: str = Field(..., description="GCP project ID")
    full_name: str = Field(..., description="Fully qualified procedure name")
    created_at: Optional[datetime] = Field(None, description="When the procedure was created")
    modified_at: Optional[datetime] = Field(None, description="When the procedure was last modified")


class ProcedureSyncRequest(BaseModel):
    """Request to sync procedures from SQL files."""
    force: bool = Field(
        default=False,
        description="Force update even if procedure exists"
    )
    procedures: Optional[List[str]] = Field(
        default=None,
        description="Specific procedures to sync (by name). If None, sync all."
    )
    domain: Optional[str] = Field(
        default=None,
        description="Filter by domain folder (e.g., 'subscription')"
    )


class ProcedureSyncResponse(BaseModel):
    """Response from procedure sync operation."""
    success: bool
    created: List[str] = Field(default_factory=list)
    updated: List[str] = Field(default_factory=list)
    skipped: List[str] = Field(default_factory=list)
    failed: List[Dict[str, str]] = Field(default_factory=list)
    message: str


class ProcedureListResponse(BaseModel):
    """Response for listing procedures."""
    procedures: List[ProcedureInfo]
    count: int


class ProcedureDeleteResponse(BaseModel):
    """Response for deleting a procedure."""
    success: bool
    procedure_name: str
    message: str


class MigrationExecuteRequest(BaseModel):
    """Request to execute a migration procedure."""
    org_dataset: str = Field(..., description="Organization dataset (e.g., 'acme_corp_prod')")
    dry_run: bool = Field(
        default=True,
        description="If true, preview changes only. If false, execute migration."
    )


class MigrationExecuteResponse(BaseModel):
    """Response from migration execution."""
    success: bool
    migration_name: str
    org_dataset: str
    dry_run: bool
    query_results: Optional[List[Dict[str, Any]]] = Field(
        default=None,
        description="Results from the migration query"
    )
    message: str


# ============================================
# Helper Functions
# ============================================

def get_procedures_dir() -> Path:
    """Get the procedures directory path."""
    # configs/system/procedures/ relative to data-pipeline-service
    base_dir = Path(__file__).parent.parent.parent.parent
    return base_dir / "configs" / "system" / "procedures"


def discover_procedure_files(domain: Optional[str] = None) -> Dict[str, Path]:
    """
    Discover all procedure SQL files.

    Args:
        domain: Optional domain folder filter (e.g., 'subscription')

    Returns:
        Dict mapping procedure name to file path
    """
    procedures_dir = get_procedures_dir()
    procedures = {}

    if not procedures_dir.exists():
        logger.warning(f"Procedures directory not found: {procedures_dir}")
        return procedures

    # If domain specified, only look in that folder
    if domain:
        search_dirs = [procedures_dir / domain]
    else:
        # Search all subdirectories
        search_dirs = [d for d in procedures_dir.iterdir() if d.is_dir()]

    for search_dir in search_dirs:
        if not search_dir.exists():
            continue

        for sql_file in search_dir.glob("*.sql"):
            # Procedure name is the file name without extension
            proc_name = sql_file.stem
            procedures[proc_name] = sql_file
            logger.debug(f"Found procedure file: {proc_name} at {sql_file}")

    return procedures


def load_procedure_sql(file_path: Path, project_id: str) -> str:
    """
    Load and prepare procedure SQL from file.

    Replaces {project_id} placeholder with actual project ID.

    Args:
        file_path: Path to SQL file
        project_id: GCP project ID to substitute

    Returns:
        Prepared SQL string
    """
    with open(file_path, 'r') as f:
        sql = f.read()

    # Replace {project_id} placeholder
    sql = sql.replace("{project_id}", project_id)

    return sql


def procedure_exists(bq_client: BigQueryClient, procedure_name: str, project_id: str) -> bool:
    """
    Check if a procedure exists in the organizations dataset.

    Args:
        bq_client: BigQuery client
        procedure_name: Name of the procedure
        project_id: GCP project ID

    Returns:
        True if procedure exists, False otherwise
    """
    query = """
    SELECT routine_name
    FROM `{project_id}.organizations.INFORMATION_SCHEMA.ROUTINES`
    WHERE routine_name = @procedure_name
      AND routine_type = 'PROCEDURE'
    """.replace("{project_id}", project_id)

    job_config = bigquery.QueryJobConfig(
        query_parameters=[
            bigquery.ScalarQueryParameter("procedure_name", "STRING", procedure_name)
        ]
    )

    try:
        results = list(bq_client.client.query(query, job_config=job_config).result())
        return len(results) > 0
    except Exception as e:
        logger.error(f"Error checking procedure existence: {e}")
        return False


def create_or_update_procedure(
    bq_client: BigQueryClient,
    sql: str,
    procedure_name: str
) -> None:
    """
    Create or replace a procedure in BigQuery.

    Args:
        bq_client: BigQuery client
        sql: The CREATE OR REPLACE PROCEDURE SQL
        procedure_name: Name of the procedure (for logging)
    """
    try:
        job = bq_client.client.query(sql)
        job.result()  # Wait for completion
        logger.info(f"Successfully created/updated procedure: {procedure_name}")
    except Exception as e:
        logger.error(f"Failed to create/update procedure {procedure_name}: {e}")
        raise


# ============================================
# Endpoints
# ============================================

@router.get(
    "/procedures",
    response_model=ProcedureListResponse,
    summary="List all procedures",
    description="List all stored procedures in the organizations dataset."
)
async def list_procedures(
    _: None = Depends(verify_admin_key),
    bq_client: BigQueryClient = Depends(get_bigquery_client)
) -> ProcedureListResponse:
    """List all procedures in the organizations dataset."""
    project_id = settings.gcp_project_id

    query = f"""
    SELECT
        routine_name,
        routine_catalog,
        routine_schema,
        created,
        last_altered
    FROM `{project_id}.organizations.INFORMATION_SCHEMA.ROUTINES`
    WHERE routine_type = 'PROCEDURE'
    ORDER BY routine_name
    """

    try:
        results = list(bq_client.client.query(query).result())

        procedures = []
        for row in results:
            procedures.append(ProcedureInfo(
                name=row.routine_name,
                dataset=row.routine_schema,
                project_id=row.routine_catalog,
                full_name=f"`{row.routine_catalog}.{row.routine_schema}`.{row.routine_name}",
                created_at=row.created if hasattr(row, 'created') else None,
                modified_at=row.last_altered if hasattr(row, 'last_altered') else None
            ))

        return ProcedureListResponse(
            procedures=procedures,
            count=len(procedures)
        )

    except Exception as e:
        logger.error(f"Failed to list procedures: {e}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to list procedures: {str(e)}"
        )


@router.get(
    "/procedures/files",
    summary="List procedure SQL files",
    description="List all procedure SQL files available for sync."
)
async def list_procedure_files(
    domain: Optional[str] = None,
    _: None = Depends(verify_admin_key)
) -> Dict[str, Any]:
    """List all procedure SQL files available for sync."""
    procedures = discover_procedure_files(domain)

    return {
        "files": [
            {
                "name": name,
                "path": str(path.relative_to(get_procedures_dir())),
                "domain": path.parent.name
            }
            for name, path in sorted(procedures.items())
        ],
        "count": len(procedures),
        "domain_filter": domain
    }


@router.post(
    "/procedures/sync",
    response_model=ProcedureSyncResponse,
    summary="Sync procedures from SQL files",
    description="Create or update procedures from SQL files in configs/system/procedures/."
)
async def sync_procedures(
    request: ProcedureSyncRequest,
    _: None = Depends(verify_admin_key),
    bq_client: BigQueryClient = Depends(get_bigquery_client)
) -> ProcedureSyncResponse:
    """
    Sync procedures from SQL files to BigQuery.

    This endpoint reads procedure SQL files from configs/system/procedures/
    and creates or updates them in the organizations dataset.
    """
    project_id = settings.gcp_project_id

    # Discover procedure files
    procedures = discover_procedure_files(request.domain)

    if not procedures:
        return ProcedureSyncResponse(
            success=True,
            message="No procedure files found to sync."
        )

    # Filter to specific procedures if requested
    if request.procedures:
        procedures = {
            name: path
            for name, path in procedures.items()
            if name in request.procedures
        }

    created = []
    updated = []
    skipped = []
    failed = []

    for proc_name, file_path in procedures.items():
        try:
            # Check if procedure exists
            exists = procedure_exists(bq_client, proc_name, project_id)

            if exists and not request.force:
                skipped.append(proc_name)
                logger.info(f"Skipping existing procedure: {proc_name}")
                continue

            # Load and prepare SQL
            sql = load_procedure_sql(file_path, project_id)

            # Create or update procedure
            create_or_update_procedure(bq_client, sql, proc_name)

            if exists:
                updated.append(proc_name)
            else:
                created.append(proc_name)

        except Exception as e:
            error_msg = str(e)[:500]  # Truncate long error messages
            failed.append({"procedure": proc_name, "error": error_msg})
            logger.error(f"Failed to sync procedure {proc_name}: {e}")

    success = len(failed) == 0

    return ProcedureSyncResponse(
        success=success,
        created=created,
        updated=updated,
        skipped=skipped,
        failed=failed,
        message=f"Synced {len(created)} created, {len(updated)} updated, {len(skipped)} skipped, {len(failed)} failed"
    )


@router.post(
    "/procedures/{procedure_name}",
    response_model=ProcedureSyncResponse,
    summary="Sync a specific procedure",
    description="Create or update a specific procedure from its SQL file."
)
async def sync_single_procedure(
    procedure_name: str,
    force: bool = True,
    _: None = Depends(verify_admin_key),
    bq_client: BigQueryClient = Depends(get_bigquery_client)
) -> ProcedureSyncResponse:
    """Sync a single procedure from its SQL file."""
    project_id = settings.gcp_project_id

    # Find the procedure file
    all_procedures = discover_procedure_files()

    if procedure_name not in all_procedures:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Procedure file not found: {procedure_name}.sql"
        )

    file_path = all_procedures[procedure_name]

    try:
        # Check if exists
        exists = procedure_exists(bq_client, procedure_name, project_id)

        if exists and not force:
            return ProcedureSyncResponse(
                success=True,
                skipped=[procedure_name],
                message=f"Procedure {procedure_name} already exists. Use force=true to update."
            )

        # Load and execute
        sql = load_procedure_sql(file_path, project_id)
        create_or_update_procedure(bq_client, sql, procedure_name)

        status_type = "updated" if exists else "created"

        return ProcedureSyncResponse(
            success=True,
            created=[] if exists else [procedure_name],
            updated=[procedure_name] if exists else [],
            message=f"Procedure {procedure_name} {status_type} successfully"
        )

    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to sync procedure: {str(e)}"
        )


@router.delete(
    "/procedures/{procedure_name}",
    response_model=ProcedureDeleteResponse,
    summary="Delete a procedure",
    description="Delete a stored procedure from the organizations dataset."
)
async def delete_procedure(
    procedure_name: str,
    _: None = Depends(verify_admin_key),
    bq_client: BigQueryClient = Depends(get_bigquery_client)
) -> ProcedureDeleteResponse:
    """Delete a procedure from BigQuery."""
    project_id = settings.gcp_project_id

    # Validate procedure name to prevent SQL injection
    if not re.match(r'^[a-zA-Z_][a-zA-Z0-9_]*$', procedure_name):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid procedure name"
        )

    # Check if exists first
    if not procedure_exists(bq_client, procedure_name, project_id):
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Procedure not found: {procedure_name}"
        )

    try:
        drop_sql = f"DROP PROCEDURE IF EXISTS `{project_id}.organizations`.{procedure_name}"
        job = bq_client.client.query(drop_sql)
        job.result()

        return ProcedureDeleteResponse(
            success=True,
            procedure_name=procedure_name,
            message=f"Procedure {procedure_name} deleted successfully"
        )

    except Exception as e:
        logger.error(f"Failed to delete procedure {procedure_name}: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to delete procedure: {str(e)}"
        )


@router.get(
    "/procedures/{procedure_name}",
    summary="Get procedure details",
    description="Get details about a specific procedure."
)
async def get_procedure(
    procedure_name: str,
    _: None = Depends(verify_admin_key),
    bq_client: BigQueryClient = Depends(get_bigquery_client)
) -> Dict[str, Any]:
    """Get details about a specific procedure."""
    project_id = settings.gcp_project_id

    query = f"""
    SELECT
        routine_name,
        routine_catalog,
        routine_schema,
        routine_type,
        routine_definition,
        created,
        last_altered,
        data_type
    FROM `{project_id}.organizations.INFORMATION_SCHEMA.ROUTINES`
    WHERE routine_name = @procedure_name
      AND routine_type = 'PROCEDURE'
    """

    job_config = bigquery.QueryJobConfig(
        query_parameters=[
            bigquery.ScalarQueryParameter("procedure_name", "STRING", procedure_name)
        ]
    )

    try:
        results = list(bq_client.client.query(query, job_config=job_config).result())

        if not results:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Procedure not found: {procedure_name}"
            )

        row = results[0]

        return {
            "name": row.routine_name,
            "dataset": row.routine_schema,
            "project_id": row.routine_catalog,
            "full_name": f"`{row.routine_catalog}.{row.routine_schema}`.{row.routine_name}",
            "type": row.routine_type,
            "definition": row.routine_definition[:5000] if row.routine_definition else None,
            "created_at": row.created.isoformat() if hasattr(row, 'created') and row.created else None,
            "modified_at": row.last_altered.isoformat() if hasattr(row, 'last_altered') and row.last_altered else None
        }

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Failed to get procedure details: {e}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to get procedure details: {str(e)}"
        )


@router.post(
    "/migrations/{migration_name}/execute",
    response_model=MigrationExecuteResponse,
    summary="Execute a migration",
    description="Run a migration procedure with dry-run support."
)
async def execute_migration(
    migration_name: str,
    request: MigrationExecuteRequest,
    _: None = Depends(verify_admin_key),
    bq_client: BigQueryClient = Depends(get_bigquery_client)
) -> MigrationExecuteResponse:
    """
    Execute a migration procedure.

    This endpoint calls stored procedures in the migrations/ folder.
    Use dry_run=true to preview changes before executing.

    Example:
        POST /api/v1/migrations/backfill_currency_audit_fields/execute
        {
            "org_dataset": "acme_corp_prod",
            "dry_run": true
        }
    """
    project_id = settings.gcp_project_id

    # Add sp_ prefix if not present
    if not migration_name.startswith("sp_"):
        procedure_name = f"sp_{migration_name}"
    else:
        procedure_name = migration_name

    # Validate procedure exists
    if not procedure_exists(bq_client, procedure_name, project_id):
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Migration procedure not found: {procedure_name}. "
                   f"Sync procedures first using POST /api/v1/procedures/sync"
        )

    # Validate org_dataset format (basic validation)
    if not re.match(r'^[a-zA-Z0-9_]+$', request.org_dataset):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid org_dataset format. Use alphanumeric and underscores only."
        )

    try:
        # Build CALL statement
        call_sql = f"""
        CALL `{project_id}.organizations`.{procedure_name}(
            '{project_id}',
            '{request.org_dataset}',
            {str(request.dry_run).upper()}
        )
        """

        logger.info(
            f"Executing migration: {procedure_name} on {request.org_dataset} "
            f"(dry_run={request.dry_run})"
        )

        # Execute procedure
        job = bq_client.client.query(call_sql)
        results = job.result()

        # Convert results to list of dicts
        query_results = []
        for row in results:
            row_dict = dict(row.items())
            # Convert timestamps to strings for JSON serialization
            for key, value in row_dict.items():
                if isinstance(value, datetime):
                    row_dict[key] = value.isoformat()
            query_results.append(row_dict)

        mode = "dry run preview" if request.dry_run else "execution"

        return MigrationExecuteResponse(
            success=True,
            migration_name=migration_name,
            org_dataset=request.org_dataset,
            dry_run=request.dry_run,
            query_results=query_results if query_results else None,
            message=f"Migration {mode} completed successfully. "
                    f"{'Review dry run output before executing.' if request.dry_run else ''}"
        )

    except Exception as e:
        error_msg = str(e)
        logger.error(f"Migration execution failed: {error_msg}", exc_info=True)

        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Migration execution failed: {error_msg}"
        )
