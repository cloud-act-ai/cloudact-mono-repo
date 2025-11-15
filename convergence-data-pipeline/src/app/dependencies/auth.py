"""
API Key Authentication with Tenant Mapping
Secure multi-tenant authentication using API keys stored in BigQuery.
Fallback to local file-based API keys for development.
"""

import hashlib
import json
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
    secrets_base = Path.home() / ".cloudact-secrets"

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
    Falls back to local file-based lookup if BigQuery fails.

    Args:
        api_key_hash: SHA256 hash of API key
        bq_client: BigQuery client instance

    Returns:
        tenant_id if found and active, None otherwise
    """
    query = f"""
    SELECT tenant_id, is_active
    FROM `{settings.gcp_project_id}.metadata.api_keys`
    WHERE api_key_hash = @api_key_hash
    LIMIT 1
    """

    try:
        results = list(bq_client.query(
            query,
            parameters=[
                bigquery.ScalarQueryParameter("api_key_hash", "STRING", api_key_hash)
            ]
        ))

        if not results:
            logger.warning(f"API key not found in BigQuery, trying local files")
            # Fallback to local file lookup
            return await get_tenant_from_local_file(api_key_hash)

        row = results[0]

        if not row.get("is_active", False):
            logger.warning(f"API key is inactive for tenant: {row.get('tenant_id')}")
            return None

        return row["tenant_id"]

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
        logger.warning("Authentication is disabled - using default tenant 'acme1281'")
        return TenantContext(tenant_id="acme1281", api_key_hash="disabled")

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
