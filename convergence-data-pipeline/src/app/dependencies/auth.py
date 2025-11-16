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
        # First, get all datasets that have api_keys table
        datasets_query = f"""
        SELECT DISTINCT table_schema
        FROM `{settings.gcp_project_id}.region-{settings.bigquery_location}.INFORMATION_SCHEMA.TABLES`
        WHERE table_name = 'api_keys'
          AND table_schema NOT IN ('information_schema', 'metadata', 'pg_catalog')
        """

        datasets = list(bq_client.client.query(datasets_query).result())

        if not datasets:
            logger.warning(f"No tenant datasets with api_keys table found")
            return await get_tenant_from_local_file(api_key_hash)

        # Build UNION ALL query across all tenant api_keys tables
        union_parts = []
        for row in datasets:
            tenant_id = row['table_schema']
            union_parts.append(f"""
                SELECT tenant_id, is_active
                FROM `{settings.gcp_project_id}.{tenant_id}.api_keys`
                WHERE api_key_hash = @api_key_hash
            """)

        if not union_parts:
            return await get_tenant_from_local_file(api_key_hash)

        union_query = " UNION ALL ".join(union_parts) + " LIMIT 1"

        results = list(bq_client.query(
            union_query,
            parameters=[
                bigquery.ScalarQueryParameter("api_key_hash", "STRING", api_key_hash)
            ]
        ))

        if not results:
            logger.warning(f"API key not found in any tenant dataset, trying local files")
            return await get_tenant_from_local_file(api_key_hash)

        row = results[0]

        if not row.get("is_active", False):
            logger.warning(f"API key is inactive for tenant: {row.get('tenant_id')}")
            return None

        tenant_id = row["tenant_id"]
        logger.info(f"Found active API key for tenant: {tenant_id}")
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
