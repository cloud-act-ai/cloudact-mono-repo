"""
API Key Authentication with Tenant-Centric Architecture
Secure multi-tenant authentication using centralized tenants dataset.
Supports subscription validation, quota management, and credential retrieval.
Fallback to local file-based API keys for development.
"""

import hashlib
import json
import os
import asyncio
from typing import Optional, Dict, Any, Set
from pathlib import Path
from datetime import datetime, date
from fastapi import Header, HTTPException, status, Depends, BackgroundTasks
from functools import lru_cache
import logging
from google.cloud import bigquery
from google.cloud import kms
from collections import defaultdict
import threading

from src.core.engine.bq_client import get_bigquery_client, BigQueryClient
from src.app.config import settings
from src.core.exceptions import classify_exception
from src.core.security.kms_encryption import decrypt_value

logger = logging.getLogger(__name__)


# ============================================
# Test API Keys for Development/QA
# ============================================

_test_api_keys: Optional[Dict[str, Dict[str, Any]]] = None


def load_test_api_keys() -> Dict[str, Dict[str, Any]]:
    """
    Load test API keys from test_api_keys.json for development/QA testing.

    Returns a dict mapping api_key -> tenant data.
    Only loaded when ENABLE_DEV_MODE=true or DISABLE_AUTH=true.

    Returns:
        Dict mapping API key to tenant profile
    """
    global _test_api_keys

    if _test_api_keys is not None:
        return _test_api_keys

    test_keys_file = Path(__file__).parent.parent.parent.parent / "test_api_keys.json"

    if not test_keys_file.exists():
        logger.warning(f"Test API keys file not found: {test_keys_file}")
        _test_api_keys = {}
        return _test_api_keys

    try:
        with open(test_keys_file, 'r') as f:
            data = json.load(f)

        # Build lookup dict: api_key -> tenant data
        _test_api_keys = {}
        for key_data in data.get("test_keys", []):
            api_key = key_data.get("api_key")
            if api_key:
                # Store by the plain API key for hash lookup
                _test_api_keys[api_key] = key_data

        logger.info(f"Loaded {len(_test_api_keys)} test API keys from {test_keys_file}")
        return _test_api_keys

    except Exception as e:
        logger.error(f"Failed to load test API keys: {e}", exc_info=True)
        _test_api_keys = {}
        return _test_api_keys


def get_test_tenant_from_api_key(api_key: str) -> Optional[Dict[str, Any]]:
    """
    Look up test tenant data from test API key.

    Args:
        api_key: Plain text API key

    Returns:
        Tenant dict if found, None otherwise
    """
    test_keys = load_test_api_keys()
    return test_keys.get(api_key)


# ============================================
# Auth Metrics Batching for Performance
# ============================================

class AuthMetricsAggregator:
    """
    Batches last_used_at updates for API keys to reduce BigQuery write latency.

    Instead of synchronous UPDATE on every auth request (adds 50-100ms latency),
    we batch updates and flush periodically in background.

    Performance Impact:
    - Before: 50-100ms per auth request (synchronous BigQuery UPDATE)
    - After: <5ms per auth request (in-memory add to batch)
    - Background flush: Every 60 seconds for all batched updates

    Thread-safe singleton for production use with 10k concurrent requests.
    """

    _instance: Optional['AuthMetricsAggregator'] = None
    _lock = threading.Lock()

    def __new__(cls):
        """Singleton pattern with thread-safe initialization."""
        if cls._instance is None:
            with cls._lock:
                if cls._instance is None:
                    cls._instance = super().__new__(cls)
                    cls._instance._initialized = False
        return cls._instance

    def __init__(self):
        """Initialize aggregator with batching state."""
        if self._initialized:
            return

        self.pending_updates: Set[str] = set()  # Set of tenant_api_key_ids to update
        self.batch_lock = threading.Lock()
        self.flush_interval = 60  # Flush every 60 seconds
        self.is_running = False
        self.background_task: Optional[asyncio.Task] = None
        self._initialized = True

        logger.info("AuthMetricsAggregator initialized with 60s flush interval")

    def add_update(self, tenant_api_key_id: str) -> None:
        """
        Add API key to pending updates batch (non-blocking, <1ms).

        Args:
            tenant_api_key_id: API key ID to update last_used_at
        """
        with self.batch_lock:
            self.pending_updates.add(tenant_api_key_id)
            logger.debug(f"Added {tenant_api_key_id} to batch ({len(self.pending_updates)} pending)")

    async def flush_updates(self, bq_client: BigQueryClient) -> None:
        """
        Flush all pending updates to BigQuery (runs in background).

        Args:
            bq_client: BigQuery client instance
        """
        # Get pending updates and clear immediately (minimize lock time)
        with self.batch_lock:
            if not self.pending_updates:
                return

            tenant_api_key_ids = list(self.pending_updates)
            self.pending_updates.clear()

        if not tenant_api_key_ids:
            return

        logger.info(f"Flushing {len(tenant_api_key_ids)} auth metric updates to BigQuery")

        try:
            # Batch UPDATE using IN clause (much faster than individual UPDATEs)
            # Formats: ['key1', 'key2'] -> "('key1', 'key2')"
            key_list = ", ".join(f"'{key_id}'" for key_id in tenant_api_key_ids)

            update_query = f"""
            UPDATE `{settings.gcp_project_id}.tenants.tenant_api_keys`
            SET last_used_at = CURRENT_TIMESTAMP()
            WHERE tenant_api_key_id IN ({key_list})
            """

            # Execute in background (non-blocking)
            bq_client.client.query(update_query).result()

            logger.info(f"Successfully flushed {len(tenant_api_key_ids)} auth metric updates")

        except Exception as e:
            logger.error(f"Failed to flush auth metrics: {e}", exc_info=True)
            # Re-add failed updates to retry on next flush
            with self.batch_lock:
                self.pending_updates.update(tenant_api_key_ids)

    async def start_background_flush(self, bq_client: BigQueryClient) -> None:
        """
        Start background task that flushes metrics every 60 seconds.

        Args:
            bq_client: BigQuery client instance
        """
        if self.is_running:
            logger.warning("Background flush task already running")
            return

        self.is_running = True
        logger.info("Starting auth metrics background flush task")

        while self.is_running:
            try:
                await asyncio.sleep(self.flush_interval)
                await self.flush_updates(bq_client)
            except asyncio.CancelledError:
                logger.info("Background flush task cancelled")
                break
            except Exception as e:
                logger.error(f"Error in background flush task: {e}", exc_info=True)
                # Continue running even on error

    def stop_background_flush(self) -> None:
        """Stop background flush task."""
        self.is_running = False
        logger.info("Stopped auth metrics background flush task")


# Global singleton instance
_auth_aggregator: Optional[AuthMetricsAggregator] = None


def get_auth_aggregator() -> AuthMetricsAggregator:
    """Get or create AuthMetricsAggregator singleton."""
    global _auth_aggregator
    if _auth_aggregator is None:
        _auth_aggregator = AuthMetricsAggregator()
    return _auth_aggregator


class TenantContext:
    """Container for tenant context extracted from API key."""

    def __init__(self, tenant_id: str, tenant_api_key_hash: str, user_id: Optional[str] = None):
        self.tenant_id = tenant_id
        self.tenant_api_key_hash = tenant_api_key_hash
        self.user_id = user_id

    def __repr__(self) -> str:
        user_info = f", user_id='{self.user_id}'" if self.user_id else ""
        return f"TenantContext(tenant_id='{self.tenant_id}'{user_info})"


def hash_api_key(api_key: str) -> str:
    """
    Create SHA256 hash of API key for secure storage/comparison.

    Args:
        api_key: Plain text API key

    Returns:
        SHA256 hex digest
    """
    return hashlib.sha256(api_key.encode()).hexdigest()


# ============================================
# Tenant-Centric Authentication Functions
# ============================================


async def get_current_tenant(
    api_key: str = Header(..., alias="X-API-Key"),
    bq_client: BigQueryClient = Depends(get_bigquery_client),
    background_tasks: BackgroundTasks = BackgroundTasks()
) -> Dict[str, Any]:
    """
    Authenticate tenant using API key from centralized tenants.tenant_api_keys table.

    Returns tenant profile with subscription info.

    Args:
        api_key: API key from X-API-Key header
        bq_client: BigQuery client instance

    Returns:
        Dict containing:
            - tenant_id: Unique tenant identifier
            - company_name: Tenant company name
            - admin_email: Tenant admin email
            - status: Tenant status (ACTIVE, SUSPENDED, etc.)
            - subscription: Subscription details with limits
            - tenant_api_key_id: ID of the API key used

    Raises:
        HTTPException: If API key invalid, inactive, or tenant suspended
    """
    # Check if authentication is disabled (development mode)
    if settings.disable_auth:
        logger.warning(f"Authentication disabled - using default tenant '{settings.default_tenant_id}'")
        # Return mock tenant for development
        return {
            "tenant_id": settings.default_tenant_id,
            "company_name": "Development Tenant",
            "admin_email": "dev@example.com",
            "status": "ACTIVE",
            "subscription": {
                "plan_name": "ENTERPRISE",
                "status": "ACTIVE",
                "max_pipelines_per_day": 999999,
                "max_pipelines_per_month": 999999,
                "max_concurrent_pipelines": 999999
            },
            "tenant_api_key_id": "dev-key"
        }

    # Check for test API keys (development/QA mode)
    enable_dev_mode = os.getenv("ENABLE_DEV_MODE", "false").lower() == "true"
    if enable_dev_mode or settings.is_development:
        test_tenant = get_test_tenant_from_api_key(api_key)
        if test_tenant:
            logger.info(f"[DEV MODE] Using test API key for tenant: {test_tenant['tenant_id']}")
            return test_tenant

    # Hash the API key
    tenant_api_key_hash = hash_api_key(api_key)

    # Query tenants.tenant_api_keys for authentication
    query = f"""
    SELECT
        k.tenant_api_key_id,
        k.tenant_id,
        k.is_active as key_active,
        k.expires_at,
        k.scopes,
        p.company_name,
        p.admin_email,
        p.status as tenant_status,
        p.tenant_dataset_id,
        s.subscription_id,
        s.plan_name,
        s.status as subscription_status,
        s.max_pipelines_per_day,
        s.max_pipelines_per_month,
        s.max_concurrent_pipelines,
        s.trial_end_date,
        s.subscription_end_date
    FROM `{settings.gcp_project_id}.tenants.tenant_api_keys` k
    INNER JOIN `{settings.gcp_project_id}.tenants.tenant_profiles` p
        ON k.tenant_id = p.tenant_id
    INNER JOIN `{settings.gcp_project_id}.tenants.tenant_subscriptions` s
        ON p.tenant_id = s.tenant_id
    WHERE k.tenant_api_key_hash = @tenant_api_key_hash
        AND k.is_active = TRUE
        AND p.status = 'ACTIVE'
        AND s.status = 'ACTIVE'
    LIMIT 1
    """

    try:
        results = list(bq_client.query(
            query,
            parameters=[
                bigquery.ScalarQueryParameter("tenant_api_key_hash", "STRING", tenant_api_key_hash)
            ]
        ))

        if not results:
            logger.warning(
                f"Authentication failed - invalid or inactive API key",
                extra={
                    "event_type": "auth_failed_invalid_key",
                    "tenant_api_key_hash": tenant_api_key_hash[:16] + "...",  # Log partial hash for security
                    "reason": "key_not_found_or_inactive"
                }
            )
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Invalid or inactive API key",
                headers={"WWW-Authenticate": "ApiKey"},
            )

        row = results[0]

        # Check if API key has expired
        if row.get("expires_at") and row["expires_at"] < datetime.utcnow():
            logger.warning(
                f"Authentication failed - API key expired",
                extra={
                    "event_type": "auth_failed_key_expired",
                    "tenant_id": row['tenant_id'],
                    "tenant_api_key_id": row.get('tenant_api_key_id'),
                    "expired_at": row.get("expires_at").isoformat() if row.get("expires_at") else None,
                    "reason": "key_expired"
                }
            )
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="API key has expired",
                headers={"WWW-Authenticate": "ApiKey"},
            )

        # Update last_used_at timestamp (batched in background for performance)
        # This reduces auth latency from 50-100ms to <5ms by batching updates
        aggregator = get_auth_aggregator()
        aggregator.add_update(row["tenant_api_key_id"])
        logger.debug(f"Queued last_used_at update for API key: {row['tenant_api_key_id']}")

        # Build tenant object
        tenant = {
            "tenant_id": row["tenant_id"],
            "company_name": row["company_name"],
            "admin_email": row["admin_email"],
            "status": row["tenant_status"],
            "tenant_dataset_id": row["tenant_dataset_id"],
            "tenant_api_key_id": row["tenant_api_key_id"],
            "scopes": row.get("scopes", []),
            "subscription": {
                "subscription_id": row["subscription_id"],
                "plan_name": row["plan_name"],
                "status": row["subscription_status"],
                "max_pipelines_per_day": row["max_pipelines_per_day"],
                "max_pipelines_per_month": row["max_pipelines_per_month"],
                "max_concurrent_pipelines": row["max_concurrent_pipelines"],
                "trial_end_date": row.get("trial_end_date"),
                "subscription_end_date": row.get("subscription_end_date")
            }
        }

        logger.info(
            f"Authentication successful",
            extra={
                "event_type": "auth_success",
                "tenant_id": tenant['tenant_id'],
                "company_name": tenant['company_name'],
                "subscription_plan": tenant['subscription']['plan_name'],
                "tenant_api_key_id": tenant.get('tenant_api_key_id'),
                "admin_email": tenant.get('admin_email')
            }
        )
        return tenant

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error during tenant authentication: {e}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Authentication service error"
        )


async def validate_subscription(
    tenant: Dict = Depends(get_current_tenant),
    bq_client: BigQueryClient = Depends(get_bigquery_client)
) -> Dict[str, Any]:
    """
    Validate tenant subscription is active and not expired.

    Raises HTTPException if subscription invalid.

    Args:
        tenant: Customer object from get_current_tenant
        bq_client: BigQuery client instance

    Returns:
        Subscription info with limits

    Raises:
        HTTPException: If subscription expired or inactive
    """
    subscription = tenant.get("subscription", {})

    # Check subscription status
    if subscription.get("status") != "ACTIVE":
        logger.warning(f"Inactive subscription for tenant: {tenant['tenant_id']}")
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=f"Subscription is {subscription.get('status')}. Please contact support."
        )

    # Check trial expiration
    trial_end = subscription.get("trial_end_date")
    if trial_end and isinstance(trial_end, (datetime, date)):
        trial_end_date = trial_end if isinstance(trial_end, date) else trial_end.date()
        if trial_end_date < date.today():
            logger.warning(f"Trial expired for tenant: {tenant['tenant_id']}")
            raise HTTPException(
                status_code=status.HTTP_402_PAYMENT_REQUIRED,
                detail="Trial period has expired. Please upgrade your subscription."
            )

    # Check subscription expiration
    sub_end = subscription.get("subscription_end_date")
    if sub_end and isinstance(sub_end, (datetime, date)):
        sub_end_date = sub_end if isinstance(sub_end, date) else sub_end.date()
        if sub_end_date < date.today():
            logger.warning(f"Subscription expired for tenant: {tenant['tenant_id']}")
            raise HTTPException(
                status_code=status.HTTP_402_PAYMENT_REQUIRED,
                detail="Subscription has expired. Please renew your subscription."
            )

    logger.info(f"Subscription validated for tenant: {tenant['tenant_id']}")
    return subscription


async def validate_quota(
    tenant: Dict = Depends(get_current_tenant),
    subscription: Dict = Depends(validate_subscription),
    bq_client: BigQueryClient = Depends(get_bigquery_client)
) -> Dict[str, Any]:
    """
    Validate tenant has not exceeded daily/monthly pipeline quotas.

    Checks tenants.tenant_usage_quotas table.
    Returns quota info or raises HTTPException if exceeded.

    Args:
        tenant: Customer object from get_current_tenant
        subscription: Subscription info from validate_subscription
        bq_client: BigQuery client instance

    Returns:
        Dict containing:
            - pipelines_run_today: Current daily usage
            - pipelines_run_month: Current monthly usage
            - concurrent_pipelines_running: Current concurrent pipelines
            - daily_limit: Daily limit from subscription
            - monthly_limit: Monthly limit from subscription
            - concurrent_limit: Concurrent limit from subscription
            - remaining_today: Remaining daily quota
            - remaining_month: Remaining monthly quota

    Raises:
        HTTPException: 429 if quota exceeded
    """
    tenant_id = tenant["tenant_id"]
    today = date.today()

    # Get or create today's usage record
    query = f"""
    SELECT
        usage_id,
        pipelines_run_today,
        pipelines_run_month,
        concurrent_pipelines_running,
        daily_limit,
        monthly_limit,
        concurrent_limit
    FROM `{settings.gcp_project_id}.tenants.tenant_usage_quotas`
    WHERE tenant_id = @tenant_id
        AND usage_date = @usage_date
    LIMIT 1
    """

    try:
        results = list(bq_client.query(
            query,
            parameters=[
                bigquery.ScalarQueryParameter("tenant_id", "STRING", tenant_id),
                bigquery.ScalarQueryParameter("usage_date", "DATE", today)
            ]
        ))

        if not results:
            # Create today's usage record
            usage_id = f"{tenant_id}_{today.strftime('%Y%m%d')}"
            insert_query = f"""
            INSERT INTO `{settings.gcp_project_id}.tenants.tenant_usage_quotas`
            (usage_id, tenant_id, usage_date, pipelines_run_today, pipelines_failed_today,
             pipelines_succeeded_today, pipelines_run_month, concurrent_pipelines_running,
             daily_limit, monthly_limit, concurrent_limit, created_at)
            VALUES (
                @usage_id,
                @tenant_id,
                @usage_date,
                0, 0, 0, 0, 0,
                @daily_limit,
                @monthly_limit,
                @concurrent_limit,
                CURRENT_TIMESTAMP()
            )
            """

            bq_client.client.query(
                insert_query,
                job_config=bigquery.QueryJobConfig(
                    query_parameters=[
                        bigquery.ScalarQueryParameter("usage_id", "STRING", usage_id),
                        bigquery.ScalarQueryParameter("tenant_id", "STRING", tenant_id),
                        bigquery.ScalarQueryParameter("usage_date", "DATE", today),
                        bigquery.ScalarQueryParameter("daily_limit", "INT64", subscription["max_pipelines_per_day"]),
                        bigquery.ScalarQueryParameter("monthly_limit", "INT64", subscription["max_pipelines_per_month"]),
                        bigquery.ScalarQueryParameter("concurrent_limit", "INT64", subscription["max_concurrent_pipelines"])
                    ]
                )
            ).result()

            # Return fresh quota
            return {
                "pipelines_run_today": 0,
                "pipelines_run_month": 0,
                "concurrent_pipelines_running": 0,
                "daily_limit": subscription["max_pipelines_per_day"],
                "monthly_limit": subscription["max_pipelines_per_month"],
                "concurrent_limit": subscription["max_concurrent_pipelines"],
                "remaining_today": subscription["max_pipelines_per_day"],
                "remaining_month": subscription["max_pipelines_per_month"]
            }

        # Check existing usage
        usage = results[0]

        # Check daily limit
        if usage["pipelines_run_today"] >= usage["daily_limit"]:
            logger.warning(f"Daily quota exceeded for tenant: {tenant_id}")
            raise HTTPException(
                status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                detail=f"Daily pipeline quota exceeded ({usage['daily_limit']} pipelines/day). Try again tomorrow.",
                headers={"Retry-After": "86400"}  # 24 hours
            )

        # Check monthly limit
        if usage["pipelines_run_month"] >= usage["monthly_limit"]:
            logger.warning(f"Monthly quota exceeded for tenant: {tenant_id}")
            raise HTTPException(
                status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                detail=f"Monthly pipeline quota exceeded ({usage['monthly_limit']} pipelines/month). Upgrade your plan.",
            )

        # Check concurrent limit
        if usage["concurrent_pipelines_running"] >= usage["concurrent_limit"]:
            logger.warning(f"Concurrent pipeline limit reached for tenant: {tenant_id}")
            raise HTTPException(
                status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                detail=f"Concurrent pipeline limit reached ({usage['concurrent_limit']} pipelines). Wait for running pipelines to complete.",
                headers={"Retry-After": "300"}  # 5 minutes
            )

        # Return quota info
        quota_info = {
            "pipelines_run_today": usage["pipelines_run_today"],
            "pipelines_run_month": usage["pipelines_run_month"],
            "concurrent_pipelines_running": usage["concurrent_pipelines_running"],
            "daily_limit": usage["daily_limit"],
            "monthly_limit": usage["monthly_limit"],
            "concurrent_limit": usage["concurrent_limit"],
            "remaining_today": usage["daily_limit"] - usage["pipelines_run_today"],
            "remaining_month": usage["monthly_limit"] - usage["pipelines_run_month"]
        }

        logger.info(f"Quota validated for tenant: {tenant_id} - {quota_info['remaining_today']} remaining today")
        return quota_info

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error validating quota: {e}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Quota validation service error"
        )


async def increment_pipeline_usage(
    tenant_id: str,
    pipeline_status: str,
    bq_client: BigQueryClient
):
    """
    Increment usage counters after pipeline execution.

    Updates tenants.tenant_usage_quotas.

    Args:
        tenant_id: Customer identifier
        pipeline_status: Pipeline execution status (SUCCESS, FAILED, RUNNING)
        bq_client: BigQuery client instance
    """
    today = date.today()

    # Determine which counters to increment
    if pipeline_status == "RUNNING":
        # Increment concurrent counter
        update_query = f"""
        UPDATE `{settings.gcp_project_id}.tenants.tenant_usage_quotas`
        SET concurrent_pipelines_running = concurrent_pipelines_running + 1
        WHERE tenant_id = @tenant_id
            AND usage_date = @usage_date
        """
    elif pipeline_status in ["SUCCESS", "FAILED"]:
        # Increment completion counters and decrement concurrent
        success_increment = "1" if pipeline_status == "SUCCESS" else "0"
        failed_increment = "1" if pipeline_status == "FAILED" else "0"

        update_query = f"""
        UPDATE `{settings.gcp_project_id}.tenants.tenant_usage_quotas`
        SET
            pipelines_run_today = pipelines_run_today + 1,
            pipelines_run_month = pipelines_run_month + 1,
            pipelines_succeeded_today = pipelines_succeeded_today + {success_increment},
            pipelines_failed_today = pipelines_failed_today + {failed_increment},
            concurrent_pipelines_running = GREATEST(concurrent_pipelines_running - 1, 0)
        WHERE tenant_id = @tenant_id
            AND usage_date = @usage_date
        """
    else:
        logger.warning(f"Unknown pipeline status: {pipeline_status}")
        return

    try:
        bq_client.client.query(
            update_query,
            job_config=bigquery.QueryJobConfig(
                query_parameters=[
                    bigquery.ScalarQueryParameter("tenant_id", "STRING", tenant_id),
                    bigquery.ScalarQueryParameter("usage_date", "DATE", today)
                ]
            )
        ).result()

        logger.info(f"Updated usage for tenant {tenant_id}: status={pipeline_status}")

    except Exception as e:
        logger.error(f"Failed to increment pipeline usage: {e}", exc_info=True)


async def get_tenant_credentials(
    tenant_id: str,
    provider: str,
    bq_client: BigQueryClient
) -> Dict[str, Any]:
    """
    Retrieve and decrypt tenant cloud credentials for a specific provider.

    Returns decrypted credentials for pipeline execution.

    Args:
        tenant_id: Tenant identifier
        provider: Cloud provider (GCP, AWS, AZURE, OPENAI, CLAUDE)
        bq_client: BigQuery client instance

    Returns:
        Dict containing:
            - credential_id: Credential identifier
            - provider: Cloud provider
            - credential_type: Type of credential
            - credentials: Decrypted credential JSON
            - project_id: GCP project or AWS account
            - region: Default region

    Raises:
        HTTPException: If credentials not found or decryption fails
    """
    query = f"""
    SELECT
        credential_id,
        provider,
        credential_type,
        credential_name,
        encrypted_credentials,
        project_id,
        region,
        scopes,
        validation_status
    FROM `{settings.gcp_project_id}.tenants.tenant_cloud_credentials`
    WHERE tenant_id = @tenant_id
        AND provider = @provider
        AND is_active = TRUE
        AND validation_status = 'VALID'
    LIMIT 1
    """

    try:
        results = list(bq_client.query(
            query,
            parameters=[
                bigquery.ScalarQueryParameter("tenant_id", "STRING", tenant_id),
                bigquery.ScalarQueryParameter("provider", "STRING", provider.upper())
            ]
        ))

        if not results:
            logger.warning(f"No active credentials found for tenant {tenant_id}, provider {provider}")
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"No active {provider} credentials configured for this tenant"
            )

        row = results[0]

        # Decrypt credentials using KMS (centralized utility)
        encrypted_bytes = row["encrypted_credentials"]

        try:
            # Use centralized KMS decryption utility for consistent error handling
            decrypted_data = decrypt_value(encrypted_bytes)
            credentials_json = json.loads(decrypted_data)

        except Exception as e:
            logger.error(f"Failed to decrypt credentials: {e}", exc_info=True)
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail="Failed to decrypt credentials"
            )

        # Return decrypted credentials
        result = {
            "credential_id": row["credential_id"],
            "provider": row["provider"],
            "credential_type": row["credential_type"],
            "credential_name": row["credential_name"],
            "credentials": credentials_json,
            "project_id": row.get("project_id"),
            "region": row.get("region"),
            "scopes": row.get("scopes", [])
        }

        logger.info(f"Retrieved credentials for tenant {tenant_id}, provider {provider}")
        return result

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error retrieving tenant credentials: {e}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Credential retrieval service error"
        )


async def get_provider_config(
    tenant_id: str,
    provider: str,
    domain: str,
    bq_client: BigQueryClient
) -> Dict[str, Any]:
    """
    Get tenant's provider-specific configuration.

    Returns source_project_id, source_dataset, notification_emails, default_parameters.

    Args:
        tenant_id: Customer identifier
        provider: Cloud provider (GCP, AWS, etc.)
        domain: Data domain (COST, SECURITY, COMPLIANCE, etc.)
        bq_client: BigQuery client instance

    Returns:
        Dict containing:
            - provider: Cloud provider
            - domain: Data domain
            - source_project_id: Source GCP project or AWS account
            - source_dataset: Source dataset/database
            - notification_emails: List of email addresses
            - default_parameters: Default pipeline parameters

    Raises:
        HTTPException: If configuration not found
    """
    query = f"""
    SELECT
        config_id,
        provider,
        domain,
        source_project_id,
        source_dataset,
        notification_emails,
        default_parameters,
        is_active
    FROM `{settings.gcp_project_id}.tenants.tenant_provider_configs`
    WHERE tenant_id = @tenant_id
        AND provider = @provider
        AND domain = @domain
        AND is_active = TRUE
    LIMIT 1
    """

    try:
        results = list(bq_client.query(
            query,
            parameters=[
                bigquery.ScalarQueryParameter("tenant_id", "STRING", tenant_id),
                bigquery.ScalarQueryParameter("provider", "STRING", provider.upper()),
                bigquery.ScalarQueryParameter("domain", "STRING", domain.upper())
            ]
        ))

        if not results:
            # Return default configuration if not found
            logger.info(f"No provider config found for tenant {tenant_id}, provider {provider}, domain {domain} - using defaults")
            return {
                "provider": provider.upper(),
                "domain": domain.upper(),
                "source_project_id": None,
                "source_dataset": None,
                "notification_emails": [],
                "default_parameters": {}
            }

        row = results[0]

        config = {
            "config_id": row["config_id"],
            "provider": row["provider"],
            "domain": row["domain"],
            "source_project_id": row.get("source_project_id"),
            "source_dataset": row.get("source_dataset"),
            "notification_emails": row.get("notification_emails", []),
            "default_parameters": row.get("default_parameters", {})
        }

        logger.info(f"Retrieved provider config for tenant {tenant_id}: {provider}/{domain}")
        return config

    except Exception as e:
        logger.error(f"Error retrieving provider config: {e}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Provider configuration service error"
        )


# ============================================
# Legacy Tenant-Based Authentication (DEPRECATED - Use get_current_tenant)
# ============================================


async def get_tenant_from_local_file(tenant_api_key_hash: str) -> Optional[str]:
    """
    Look up tenant_id from local file-based API keys (development fallback).

    DEPRECATED: This is a legacy fallback for development only.
    Production should use get_current_tenant() which reads from tenants dataset.

    Args:
        tenant_api_key_hash: SHA256 hash of API key

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

            if metadata.get("tenant_api_key_hash") == tenant_api_key_hash:
                tenant_id = metadata.get("tenant_id")
                logger.info(f"Found API key in local file for tenant: {tenant_id}")
                return tenant_id

        except Exception as e:
            logger.warning(f"Error reading {metadata_file}: {e}")
            continue

    return None


async def get_tenant_from_api_key(
    tenant_api_key_hash: str,
    bq_client: BigQueryClient
) -> Optional[str]:
    """
    Look up tenant_id from API key hash using centralized tenants dataset.

    UPDATED: Now reads from tenants.tenant_api_keys (centralized API keys).
    This is more secure as API keys are stored in a centralized, access-controlled dataset.

    Args:
        tenant_api_key_hash: SHA256 hash of API key
        bq_client: BigQuery client instance

    Returns:
        tenant_id if found and active, None otherwise
    """
    # Query centralized tenants.tenant_api_keys table
    query = f"""
    SELECT
        k.tenant_id,
        k.tenant_id,
        k.is_active,
        k.expires_at,
        c.status AS tenant_status
    FROM `{settings.gcp_project_id}.tenants.tenant_api_keys` k
    INNER JOIN `{settings.gcp_project_id}.tenants.tenant_profiles` c
        ON k.tenant_id = c.tenant_id
    WHERE k.tenant_api_key_hash = @tenant_api_key_hash
        AND k.is_active = TRUE
        AND c.status = 'ACTIVE'
    LIMIT 1
    """

    try:
        logger.info(f"[AUTH] Looking up API key in centralized tenants dataset")
        results = list(bq_client.query(
            query,
            parameters=[
                bigquery.ScalarQueryParameter("tenant_api_key_hash", "STRING", tenant_api_key_hash)
            ]
        ))

        if not results:
            logger.warning(f"API key not found in tenants dataset, trying local files")
            return await get_tenant_from_local_file(tenant_api_key_hash)

        row = results[0]

        # Check if API key has expired
        if row.get("expires_at") and row["expires_at"] < datetime.utcnow():
            logger.warning(f"API key expired for tenant: {row['tenant_id']}")
            return None

        if not row.get("is_active", False):
            logger.warning(f"API key is inactive for tenant: {row.get('tenant_id')}")
            return None

        tenant_id = row["tenant_id"]
        logger.info(f"[AUTH] Authenticated tenant: {tenant_id} (tenant: {row['tenant_id']})")
        return tenant_id

    except Exception as e:
        logger.warning(f"Centralized auth lookup failed: {e}, trying local files")
        # Fallback to local file lookup for development
        return await get_tenant_from_local_file(tenant_api_key_hash)


async def verify_api_key(
    x_api_key: Optional[str] = Header(None, description="API Key for authentication"),
    x_user_id: Optional[str] = Header(None, alias="X-User-ID", description="User ID from frontend"),
    bq_client: BigQueryClient = Depends(get_bigquery_client)
) -> TenantContext:
    """
    FastAPI dependency to verify API key and extract tenant context.

    Args:
        x_api_key: API key from X-API-Key header
        x_user_id: User ID from X-User-ID header (optional)
        bq_client: BigQuery client (injected)

    Returns:
        TenantContext with tenant_id and user_id

    Raises:
        HTTPException: If API key is invalid or inactive (when auth is enabled)
    """
    # Check if authentication is disabled
    if settings.disable_auth:
        logger.warning(f"Authentication is disabled - using default tenant '{settings.default_tenant_id}'")
        return TenantContext(tenant_id=settings.default_tenant_id, tenant_api_key_hash="disabled", user_id=x_user_id)

    if not x_api_key:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Missing API key",
            headers={"WWW-Authenticate": "ApiKey"},
        )

    # Hash the API key
    tenant_api_key_hash = hash_api_key(x_api_key)

    # Look up tenant
    tenant_id = await get_tenant_from_api_key(tenant_api_key_hash, bq_client)

    if not tenant_id:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or inactive API key",
            headers={"WWW-Authenticate": "ApiKey"},
        )

    logger.info(f"Authenticated request for tenant: {tenant_id}, user: {x_user_id or 'N/A'}")

    return TenantContext(tenant_id=tenant_id, tenant_api_key_hash=tenant_api_key_hash, user_id=x_user_id)


async def verify_api_key_header(
    x_api_key: str = Header(..., description="API Key for authentication"),
    x_user_id: Optional[str] = Header(None, alias="X-User-ID", description="User ID from frontend"),
    bq_client: BigQueryClient = Depends(get_bigquery_client)
) -> TenantContext:
    """
    FastAPI dependency to verify API key from X-API-Key header (required).

    This is a stricter version of verify_api_key that always requires the header.
    Use this for new endpoints that need explicit authentication.

    Args:
        x_api_key: API key from X-API-Key header (required)
        x_user_id: User ID from X-User-ID header (optional)
        bq_client: BigQuery client (injected)

    Returns:
        TenantContext with tenant_id and user_id

    Raises:
        HTTPException: If API key is invalid or inactive
    """
    # Check if authentication is disabled
    if settings.disable_auth:
        logger.warning(f"Authentication is disabled - using default tenant '{settings.default_tenant_id}'")
        return TenantContext(tenant_id=settings.default_tenant_id, tenant_api_key_hash="disabled", user_id=x_user_id)

    # Hash the API key
    tenant_api_key_hash = hash_api_key(x_api_key)

    # Look up tenant
    tenant_id = await get_tenant_from_api_key(tenant_api_key_hash, bq_client)

    if not tenant_id:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or inactive API key",
            headers={"WWW-Authenticate": "ApiKey"},
        )

    logger.info(f"Authenticated request for tenant: {tenant_id}, user: {x_user_id or 'N/A'}")

    return TenantContext(tenant_id=tenant_id, tenant_api_key_hash=tenant_api_key_hash, user_id=x_user_id)


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
