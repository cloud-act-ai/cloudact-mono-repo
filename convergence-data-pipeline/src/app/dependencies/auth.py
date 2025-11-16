"""
API Key Authentication with Tenant Mapping
Secure multi-tenant authentication using API keys stored in BigQuery.
Fallback to local file-based API keys for development.
"""

import hashlib
import json
import os
from typing import Optional
from pathlib import Path
from fastapi import Header, HTTPException, status, Depends
from functools import lru_cache
import logging
from google.cloud import bigquery

from src.core.engine.bq_client import get_bigquery_client, BigQueryClient
from src.app.config import settings

logger = logging.getLogger(__name__)


class TenantContext:
    """Container for tenant context extracted from API key."""

    def __init__(self, tenant_id: str, api_key_hash: str):
        self.tenant_id = tenant_id
        self.api_key_hash = api_key_hash

    def __repr__(self) -> str:
        return f"TenantContext(tenant_id='{self.tenant_id}')"


def hash_api_key(api_key: str) -> str:
    """
    Create SHA256 hash of API key for secure storage/comparison.

    Args:
        api_key: Plain text API key

    Returns:
        SHA256 hex digest
    """
    return hashlib.sha256(api_key.encode()).hexdigest()


async def get_tenant_from_local_file(api_key_hash: str) -> Optional[str]:
    """
    Look up tenant_id from local file-based API keys (development fallback).

    Args:
        api_key_hash: SHA256 hash of API key

    Returns:
        tenant_id if found, None otherwise
    """
    # Expand ~ to home directory if present
    secrets_base_str = os.path.expanduser(settings.secrets_base_path)
    secrets_base = Path(secrets_base_str)

    if not secrets_base.exists():
        return None

    # Search through tenant directories
    for tenant_dir in secrets_base.iterdir():
        if not tenant_dir.is_dir():
            continue

        metadata_file = tenant_dir / "api_key_metadata.json"
        if not metadata_file.exists():
            continue

        try:
            with open(metadata_file, 'r') as f:
                metadata = json.load(f)

            if metadata.get("api_key_hash") == api_key_hash:
                tenant_id = metadata.get("tenant_id")
                logger.info(f"Found API key in local file for tenant: {tenant_id}")
                return tenant_id

        except Exception as e:
            logger.warning(f"Error reading {metadata_file}: {e}")
            continue

    return None


async def get_tenant_from_api_key(
    api_key_hash: str,
    bq_client: BigQueryClient
) -> Optional[str]:
    """
    Look up tenant_id from API key hash in BigQuery.
    Searches all tenant datasets' api_keys tables using UNION ALL.
    Falls back to local file-based lookup if BigQuery fails.

    New Architecture: API keys stored in {tenant_id}.api_keys tables.

    Args:
        api_key_hash: SHA256 hash of API key
        bq_client: BigQuery client instance

    Returns:
        tenant_id if found and active, None otherwise
    """
    # Query across all tenant datasets using INFORMATION_SCHEMA
    query = f"""
    SELECT tenant_id, is_active
    FROM (
      SELECT table_schema AS tenant_id
      FROM `{settings.gcp_project_id}.region-{settings.bigquery_location}.INFORMATION_SCHEMA.TABLES`
      WHERE table_name = 'api_keys'
        AND table_schema NOT IN ('information_schema', 'metadata', 'pg_catalog')
    ) AS tenant_datasets
    LEFT JOIN `{settings.gcp_project_id}.{{tenant_id}}.api_keys` AS api_keys
      USING (tenant_id)
    WHERE api_keys.api_key_hash = @api_key_hash
      AND api_keys.is_active = TRUE
    LIMIT 1
    """

    try:
        # First, get all datasets (using standard INFORMATION_SCHEMA instead of regional)
        # Then check each one for api_keys table existence
        datasets_query = f"""
        SELECT schema_name
        FROM `{settings.gcp_project_id}.INFORMATION_SCHEMA.SCHEMATA`
        WHERE schema_name NOT IN ('information_schema', 'metadata', 'pg_catalog')
        """

        logger.info(f"[AUTH DEBUG] Looking up API key hash: {api_key_hash[:20]}...")
        all_datasets = list(bq_client.client.query(datasets_query).result())
        logger.info(f"[AUTH DEBUG] Found {len(all_datasets)} tenant datasets")

        # Filter to only datasets that have api_keys table
        datasets = []
        for row in all_datasets:
            schema_name = row['schema_name']
            try:
                # Check if api_keys table exists in this dataset
                table_check = f"""
                SELECT COUNT(*) as cnt
                FROM `{settings.gcp_project_id}.{schema_name}.INFORMATION_SCHEMA.TABLES`
                WHERE table_name = 'api_keys'
                """
                result = list(bq_client.client.query(table_check).result())
                if result and result[0]['cnt'] > 0:
                    datasets.append({'table_schema': schema_name})
            except Exception as e:
                logger.debug(f"[AUTH DEBUG] Skipping dataset {schema_name}: {e}")
                continue

        logger.info(f"[AUTH DEBUG] Found {len(datasets)} datasets with api_keys table")

        if not datasets:
            logger.warning(f"No tenant datasets with api_keys table found")
            return await get_tenant_from_local_file(api_key_hash)

        # Build UNION ALL query across all tenant api_keys tables
        union_parts = []
        for row in datasets:
            tenant_id = row['table_schema']
            logger.info(f"[AUTH DEBUG] Adding dataset to UNION query: {tenant_id}")
            union_parts.append(f"""
                SELECT tenant_id, is_active
                FROM `{settings.gcp_project_id}.{tenant_id}.api_keys`
                WHERE api_key_hash = @api_key_hash
            """)

        if not union_parts:
            return await get_tenant_from_local_file(api_key_hash)

        union_query = " UNION ALL ".join(union_parts) + " LIMIT 1"
        logger.info(f"[AUTH DEBUG] Executing UNION query:\n{union_query}")
        logger.info(f"[AUTH DEBUG] With parameter: api_key_hash = {api_key_hash[:20]}...")

        results = list(bq_client.query(
            union_query,
            parameters=[
                bigquery.ScalarQueryParameter("api_key_hash", "STRING", api_key_hash)
            ]
        ))

        logger.info(f"[AUTH DEBUG] Query returned {len(results)} results")

        if not results:
            logger.warning(f"API key not found in any tenant dataset, trying local files")
            return await get_tenant_from_local_file(api_key_hash)

        row = results[0]
        logger.info(f"[AUTH DEBUG] First result row: tenant_id={row.get('tenant_id')}, is_active={row.get('is_active')}")

        if not row.get("is_active", False):
            logger.warning(f"API key is inactive for tenant: {row.get('tenant_id')}")
            return None

        tenant_id = row["tenant_id"]
        logger.info(f"[AUTH DEBUG] Returning tenant_id: {tenant_id}")
        return tenant_id

    except Exception as e:
        logger.warning(f"BigQuery lookup failed: {e}, trying local files")
        # Fallback to local file lookup
        return await get_tenant_from_local_file(api_key_hash)


async def verify_api_key(
    x_api_key: Optional[str] = Header(None, description="API Key for authentication"),
    bq_client: BigQueryClient = Depends(get_bigquery_client)
) -> TenantContext:
    """
    FastAPI dependency to verify API key and extract tenant context.

    Args:
        x_api_key: API key from X-API-Key header
        bq_client: BigQuery client (injected)

    Returns:
        TenantContext with tenant_id

    Raises:
        HTTPException: If API key is invalid or inactive (when auth is enabled)
    """
    # Check if authentication is disabled
    if settings.disable_auth:
        logger.warning(f"Authentication is disabled - using default tenant '{settings.default_tenant_id}'")
        return TenantContext(tenant_id=settings.default_tenant_id, api_key_hash="disabled")

    if not x_api_key:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Missing API key",
            headers={"WWW-Authenticate": "ApiKey"},
        )

    # Hash the API key
    api_key_hash = hash_api_key(x_api_key)

    # Look up tenant
    tenant_id = await get_tenant_from_api_key(api_key_hash, bq_client)

    if not tenant_id:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or inactive API key",
            headers={"WWW-Authenticate": "ApiKey"},
        )

    logger.info(f"Authenticated request for tenant: {tenant_id}")

    return TenantContext(tenant_id=tenant_id, api_key_hash=api_key_hash)


async def verify_api_key_header(
    x_api_key: str = Header(..., description="API Key for authentication"),
    bq_client: BigQueryClient = Depends(get_bigquery_client)
) -> TenantContext:
    """
    FastAPI dependency to verify API key from X-API-Key header (required).

    This is a stricter version of verify_api_key that always requires the header.
    Use this for new endpoints that need explicit authentication.

    Args:
        x_api_key: API key from X-API-Key header (required)
        bq_client: BigQuery client (injected)

    Returns:
        TenantContext with tenant_id

    Raises:
        HTTPException: If API key is invalid or inactive
    """
    # Check if authentication is disabled
    if settings.disable_auth:
        logger.warning(f"Authentication is disabled - using default tenant '{settings.default_tenant_id}'")
        return TenantContext(tenant_id=settings.default_tenant_id, api_key_hash="disabled")

    # Hash the API key
    api_key_hash = hash_api_key(x_api_key)

    # Look up tenant
    tenant_id = await get_tenant_from_api_key(api_key_hash, bq_client)

    if not tenant_id:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or inactive API key",
            headers={"WWW-Authenticate": "ApiKey"},
        )

    logger.info(f"Authenticated request for tenant: {tenant_id}")

    return TenantContext(tenant_id=tenant_id, api_key_hash=api_key_hash)


# Optional: Allow unauthenticated access for health checks
async def optional_auth(
    x_api_key: Optional[str] = Header(None),
    bq_client: BigQueryClient = Depends(get_bigquery_client)
) -> Optional[TenantContext]:
    """
    Optional authentication dependency.

    Returns:
        TenantContext if API key provided and valid, None otherwise
    """
    if not x_api_key:
        return None

    try:
        return await verify_api_key(x_api_key, bq_client)
    except HTTPException:
        return None


async def verify_admin_key(
    x_admin_key: str = Header(..., description="Admin API Key for platform operations")
) -> None:
    """
    FastAPI dependency to verify admin API key for platform-level operations.

    This is used for endpoints that manage tenants, API keys, and other platform
    operations that exist outside the tenant scope.

    Args:
        x_admin_key: Admin API key from X-Admin-Key header (required)

    Raises:
        HTTPException: If admin key is invalid or not configured
    """
    # Check if admin key is configured
    if not settings.admin_api_key:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Admin API key not configured. Set ADMIN_API_KEY environment variable.",
        )

    # Verify the admin key
    if x_admin_key != settings.admin_api_key:
        logger.warning("Invalid admin API key attempt")
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Invalid admin API key",
            headers={"WWW-Authenticate": "AdminKey"},
        )

    logger.info("Admin authentication successful")
