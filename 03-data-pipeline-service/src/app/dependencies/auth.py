"""
API Key Authentication with Organization-Centric Architecture
Secure multi-org authentication using centralized organizations dataset.
Supports subscription validation, quota management, and credential retrieval.
Fallback to local file-based API keys for development.

Quota enforcement is handled by the API service (8000) via Supabase.
Pipeline service calls API service endpoints, never Supabase directly.
"""

import hashlib
import hmac
import json
import os
import asyncio
from dataclasses import dataclass
from typing import Optional, Dict, Any, Set
from pathlib import Path
from datetime import datetime, date, timezone
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
from src.core.utils.rate_limiter import get_rate_limiter

logger = logging.getLogger(__name__)


# ============================================
# Test API Keys for Development/QA
# ============================================

_test_api_keys: Optional[Dict[str, Dict[str, Any]]] = None


def load_test_api_keys() -> Dict[str, Dict[str, Any]]:
    """
    Load test API keys from test_api_keys.json for development/QA testing.

    Returns a dict mapping api_key -> org data.
    Only loaded when ENABLE_DEV_MODE=true or DISABLE_AUTH=true.

    Returns:
        Dict mapping API key to org profile
    """
    global _test_api_keys

    if _test_api_keys is not None:
        return _test_api_keys

    test_keys_file = Path(__file__).parent.parent.parent.parent / "test_api_keys.json"

    if not test_keys_file.exists():
        logger.debug(f"Test API keys file not found: {test_keys_file}")
        _test_api_keys = {}
        return _test_api_keys

    try:
        with open(test_keys_file, 'r') as f:
            data = json.load(f)

        # Build lookup dict: api_key -> org data
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


def get_test_org_from_api_key(api_key: str) -> Optional[Dict[str, Any]]:
    """
    Look up test org data from test API key.
    DISABLED in production for security.

    Args:
        api_key: Plain text API key

    Returns:
        Org dict if found, None otherwise
    """
    # SECURITY: Never use test API keys in production
    if settings.is_production:
        return None

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
        # SCALE-001 FIX: Move lock acquisition earlier to protect _initialized check
        # This prevents a race condition where multiple threads could pass the
        # _initialized check before any of them sets it to True
        with self._lock:
            if self._initialized:
                return

            self.pending_updates: Set[str] = set()  # Set of org_api_key_ids to update
            self.batch_lock = threading.Lock()
            self.flush_interval = 60  # Flush every 60 seconds
            self.is_running = False
            self.background_task: Optional[asyncio.Task] = None
            self._initialized = True

            logger.info("AuthMetricsAggregator initialized with 60s flush interval")

    def add_update(self, org_api_key_id: str) -> None:
        """
        Add API key to pending updates batch (non-blocking, <1ms).

        Args:
            org_api_key_id: API key ID to update last_used_at
        """
        with self.batch_lock:
            self.pending_updates.add(org_api_key_id)
            logger.debug(f"Added {org_api_key_id} to batch ({len(self.pending_updates)} pending)")

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

            org_api_key_ids = list(self.pending_updates)
            self.pending_updates.clear()

        if not org_api_key_ids:
            return

        logger.info(f"Flushing {len(org_api_key_ids)} auth metric updates to BigQuery")

        try:
            # SECURITY: Use parameterized query to prevent SQL injection
            # BigQuery doesn't support IN with array parameter directly, so we use UNNEST
            # This is safer than string interpolation as UUIDs are validated by BigQuery

            # Validate all org_api_key_ids are valid UUIDs to prevent injection
            import re
            uuid_pattern = re.compile(r'^[a-f0-9-]{36}$', re.IGNORECASE)
            valid_key_ids = [key_id for key_id in org_api_key_ids if uuid_pattern.match(key_id)]

            if not valid_key_ids:
                logger.warning("No valid UUIDs in auth metrics batch - skipping flush")
                return

            if len(valid_key_ids) != len(org_api_key_ids):
                logger.warning(f"Filtered out {len(org_api_key_ids) - len(valid_key_ids)} invalid key IDs from auth metrics batch")

            update_query = f"""
            UPDATE `{settings.gcp_project_id}.organizations.org_api_keys`
            SET last_used_at = CURRENT_TIMESTAMP()
            WHERE org_api_key_id IN UNNEST(@key_ids)
            """

            # Execute with parameterized query (prevents SQL injection)
            bq_client.client.query(
                update_query,
                job_config=bigquery.QueryJobConfig(
                    query_parameters=[
                        bigquery.ArrayQueryParameter("key_ids", "STRING", valid_key_ids)
                    ]
                )
            ).result()

            logger.info(f"Successfully flushed {len(org_api_key_ids)} auth metric updates")

        except Exception as e:
            logger.error(f"Failed to flush auth metrics: {e}", exc_info=True)
            # Re-add failed updates to retry on next flush
            with self.batch_lock:
                self.pending_updates.update(org_api_key_ids)

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
                # SCALE-002 FIX: Add timeout to prevent blocking forever
                # If BigQuery is slow or unresponsive, we don't want to block
                # the background task indefinitely
                try:
                    await asyncio.wait_for(self.flush_updates(bq_client), timeout=30.0)
                except asyncio.TimeoutError:
                    logger.error("Auth metrics flush timed out after 30s")
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


class OrgContext:
    """Container for organization context extracted from API key."""

    def __init__(self, org_slug: str, org_api_key_hash: str, user_id: Optional[str] = None, org_api_key_id: Optional[str] = None):
        self.org_slug = org_slug
        self.org_api_key_hash = org_api_key_hash
        self.user_id = user_id
        self.org_api_key_id = org_api_key_id

    def __repr__(self) -> str:
        user_info = f", user_id='{self.user_id}'" if self.user_id else ""
        key_info = f", key_id='{self.org_api_key_id}'" if self.org_api_key_id else ""
        return f"OrgContext(org_slug='{self.org_slug}'{user_info}{key_info})"


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
# Organization-Centric Authentication Functions
# ============================================


async def get_current_org(
    api_key: Optional[str] = Header(None, alias="X-API-Key"),
    bq_client: BigQueryClient = Depends(get_bigquery_client),
    background_tasks: BackgroundTasks = BackgroundTasks()
) -> Dict[str, Any]:
    """
    Authenticate organization using API key from centralized organizations.org_api_keys table.

    Returns org profile with subscription info.

    Args:
        api_key: API key from X-API-Key header (optional when DISABLE_AUTH=true)
        bq_client: BigQuery client instance

    Returns:
        Dict containing:
            - org_slug: Unique organization identifier
            - company_name: Org company name
            - admin_email: Org admin email
            - status: Org status (ACTIVE, SUSPENDED, etc.)
            - subscription: Subscription details with limits
            - org_api_key_id: ID of the API key used

    Raises:
        HTTPException: If API key invalid, inactive, or org suspended
    """
    # SECURITY: DISABLE_AUTH is blocked in production by validate_production_config()
    # In development, use realistic quota limits to catch quota-related bugs early
    if settings.disable_auth:
        if settings.is_production:
            logger.critical("DISABLE_AUTH=true in production - this should never happen!")
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail="Authentication misconfiguration"
            )
        dev_org_slug = settings.default_org_slug
        logger.warning(f"[DEV ONLY] Authentication disabled - using default org '{dev_org_slug}'")
        # Return mock org with REALISTIC limits (not unlimited) to catch quota bugs
        return {
            "org_slug": dev_org_slug,
            "company_name": "Development Organization",
            "admin_email": "dev@example.com",
            "status": "ACTIVE",
            "subscription": {
                "plan_name": "STARTER",
                "status": "ACTIVE",
                "max_pipelines_per_day": settings.fallback_daily_limit,
                "max_pipelines_per_month": settings.fallback_monthly_limit,
                "max_concurrent_pipelines": settings.fallback_concurrent_limit
            },
            "org_api_key_id": "dev-key"
        }

    # When auth is NOT disabled, api_key is required
    if not api_key:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="X-API-Key header is required"
        )

    # Check for test API keys (development/QA mode)
    enable_dev_mode = os.getenv("ENABLE_DEV_MODE", "false").lower() == "true"
    if enable_dev_mode or settings.is_development:
        test_org = get_test_org_from_api_key(api_key)
        if test_org:
            logger.info(f"[DEV MODE] Using test API key for org: {test_org['org_slug']}")
            return test_org

    # Hash the API key
    org_api_key_hash = hash_api_key(api_key)

    # Query organizations.org_api_keys for authentication
    # NOTE: Subscription validation is done by API service (/api/v1/validator/validate)
    # This query only validates API key and org status, not subscription
    # Subscription data comes from Supabase (source of truth since 2026-02-01)
    query = f"""
    SELECT
        k.org_api_key_id,
        k.org_slug,
        k.is_active as key_active,
        k.expires_at,
        k.scopes,
        p.company_name,
        p.admin_email,
        p.status as org_status,
        p.org_dataset_id,
        -- Default subscription values (actual limits validated by API service)
        'default' as subscription_id,
        'STARTER' as plan_name,
        'ACTIVE' as subscription_status,
        6 as max_pipelines_per_day,
        180 as max_pipelines_per_month,
        2 as max_concurrent_pipelines,
        NULL as trial_end_date,
        NULL as subscription_end_date
    FROM `{settings.gcp_project_id}.organizations.org_api_keys` k
    INNER JOIN `{settings.gcp_project_id}.organizations.org_profiles` p
        ON k.org_slug = p.org_slug
    WHERE k.org_api_key_hash = @org_api_key_hash
        AND k.is_active = TRUE
        AND p.status = 'ACTIVE'
    LIMIT 1
    """

    try:
        results = list(bq_client.query(
            query,
            parameters=[
                bigquery.ScalarQueryParameter("org_api_key_hash", "STRING", org_api_key_hash)
            ]
        ))

        if not results:
            # Rate limit failed authentication attempts to prevent brute force attacks
            # Use partial hash as identifier to track failed attempts per key
            rate_limiter = get_rate_limiter()
            key_identifier = f"auth_fail:{org_api_key_hash[:16]}"
            is_allowed, _ = await rate_limiter.check_global_limit(
                endpoint=key_identifier,
                limit_per_minute=10,  # Max 10 failed attempts per minute
                limit_per_hour=50     # Max 50 failed attempts per hour
            )

            if not is_allowed:
                logger.error(
                    f"Rate limit exceeded for failed authentication attempts",
                    extra={
                        "event_type": "auth_rate_limit_exceeded",
                        "org_api_key_hash": org_api_key_hash[:16] + "...",
                    }
                )
                raise HTTPException(
                    status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                    detail="Too many failed authentication attempts. Please try again later.",
                    headers={"Retry-After": "60"},
                )

            logger.warning(
                f"Authentication failed - invalid or inactive API key",
                extra={
                    "event_type": "auth_failed_invalid_key",
                    "org_api_key_hash": org_api_key_hash[:16] + "...",  # Log partial hash for security
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
        if row.get("expires_at") and isinstance(row.get("expires_at"), datetime) and row["expires_at"] < datetime.now(timezone.utc):
            logger.warning(
                f"Authentication failed - API key expired",
                extra={
                    "event_type": "auth_failed_key_expired",
                    "org_slug": row['org_slug'],
                    "org_api_key_id": row.get('org_api_key_id'),
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
        aggregator.add_update(row["org_api_key_id"])
        logger.debug(f"Queued last_used_at update for API key: {row['org_api_key_id']}")

        # Build org object
        org = {
            "org_slug": row["org_slug"],
            "company_name": row["company_name"],
            "admin_email": row["admin_email"],
            "status": row["org_status"],
            "org_dataset_id": row["org_dataset_id"],
            "org_api_key_id": row["org_api_key_id"],
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
                "org_slug": org['org_slug'],
                "company_name": org['company_name'],
                "subscription_plan": org['subscription']['plan_name'],
                "org_api_key_id": org.get('org_api_key_id'),
                "admin_email": org.get('admin_email')
            }
        )
        return org

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error during org authentication: {e}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Authentication service error"
        )


async def validate_subscription(
    org: Dict = Depends(get_current_org),
    bq_client: BigQueryClient = Depends(get_bigquery_client)
) -> Dict[str, Any]:
    """
    Validate org subscription is active and not expired.

    Raises HTTPException if subscription invalid.

    Args:
        org: Organization object from get_current_org
        bq_client: BigQuery client instance

    Returns:
        Subscription info with limits

    Raises:
        HTTPException: If subscription expired or inactive
    """
    subscription = org.get("subscription", {})

    # Check subscription status - allow both ACTIVE and TRIAL
    if subscription.get("status") not in ("ACTIVE", "TRIAL"):
        logger.warning(f"Inactive subscription for org: {org['org_slug']}, status: {subscription.get('status')}")
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=f"Subscription is {subscription.get('status')}. Please contact support."
        )

    # Check trial expiration
    trial_end = subscription.get("trial_end_date")
    if trial_end and isinstance(trial_end, (datetime, date)):
        trial_end_date = trial_end.date() if isinstance(trial_end, datetime) else trial_end
        if trial_end_date < date.today():
            logger.warning(f"Trial expired for org: {org['org_slug']}")
            raise HTTPException(
                status_code=status.HTTP_402_PAYMENT_REQUIRED,
                detail="Trial period has expired. Please upgrade your subscription."
            )

    # Check subscription expiration
    sub_end = subscription.get("subscription_end_date")
    if sub_end and isinstance(sub_end, (datetime, date)):
        sub_end_date = sub_end.date() if isinstance(sub_end, datetime) else sub_end
        if sub_end_date < date.today():
            logger.warning(f"Subscription expired for org: {org['org_slug']}")
            raise HTTPException(
                status_code=status.HTTP_402_PAYMENT_REQUIRED,
                detail="Subscription has expired. Please renew your subscription."
            )

    logger.info(f"Subscription validated for org: {org['org_slug']}")
    return subscription


async def validate_quota(
    org: Dict = Depends(get_current_org),
    _subscription: Dict = Depends(validate_subscription),
) -> Dict[str, Any]:
    """
    Validate org has not exceeded daily/monthly pipeline quotas.

    Calls the API service (8000) which owns Supabase quota enforcement.

    Returns:
        Dict with quota info (limits, usage, remaining)

    Raises:
        HTTPException: 429 if quota exceeded
    """
    import httpx

    org_slug = org["org_slug"]

    try:
        api_service_url = settings.api_service_url
        url = f"{api_service_url}/api/v1/organizations/{org_slug}/quota"

        async with httpx.AsyncClient(timeout=settings.api_service_timeout) as client:
            response = await client.get(
                url,
                headers={"X-API-Key": org.get("api_key", ""), "Content-Type": "application/json"}
            )

        if response.status_code == 200:
            data = response.json()
            quota_info = {
                "pipelines_run_today": data.get("pipelines_run_today", 0),
                "pipelines_run_month": data.get("pipelines_run_month", 0),
                "concurrent_pipelines_running": data.get("concurrent_running", 0),
                "daily_limit": data.get("daily_limit", 6),
                "monthly_limit": data.get("monthly_limit", 180),
                "concurrent_limit": data.get("concurrent_limit", 1),
                "remaining_today": data.get("remaining_today", 0),
                "remaining_month": data.get("remaining_month", 0),
            }
            logger.info(f"Quota validated for org: {org_slug} - {quota_info['remaining_today']} remaining today")
            return quota_info
        elif response.status_code == 429:
            detail = response.json().get("detail", "Quota exceeded")
            raise HTTPException(status_code=status.HTTP_429_TOO_MANY_REQUESTS, detail=detail)
        else:
            logger.error(f"API service returned {response.status_code} for quota check: {org_slug}")
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail="Quota validation service error"
            )

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error validating quota via API service: {e}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Quota validation service error"
        )


async def get_org_credentials(
    org_slug: str,
    provider: str,
    bq_client: BigQueryClient
) -> Dict[str, Any]:
    """
    Retrieve and decrypt org cloud credentials for a specific provider.

    Returns decrypted credentials for pipeline execution.

    Args:
        org_slug: Organization identifier
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
    FROM `{settings.gcp_project_id}.organizations.org_integration_credentials`
    WHERE org_slug = @org_slug
        AND provider = @provider
        AND is_active = TRUE
        AND validation_status = 'VALID'
    LIMIT 1
    """

    try:
        results = list(bq_client.query(
            query,
            parameters=[
                bigquery.ScalarQueryParameter("org_slug", "STRING", org_slug),
                bigquery.ScalarQueryParameter("provider", "STRING", provider.upper())
            ]
        ))

        if not results:
            logger.warning(f"No active credentials found for org {org_slug}, provider {provider}")
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"No active {provider} credentials configured for this organization"
            )

        row = results[0]

        # Decrypt credentials using KMS (centralized utility)
        encrypted_bytes = row["encrypted_credentials"]

        # Validate encrypted_bytes before decryption
        if not encrypted_bytes:
            raise ValueError(f"No encrypted credentials found for {provider}")

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

        logger.info(f"Retrieved credentials for org {org_slug}, provider {provider}")
        return result

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error retrieving org credentials: {e}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Credential retrieval service error"
        )


async def get_provider_config(
    org_slug: str,
    provider: str,
    domain: str,
    bq_client: BigQueryClient
) -> Dict[str, Any]:
    """
    Get org's provider-specific configuration.

    Returns source_project_id, source_dataset, notification_emails, default_parameters.

    Args:
        org_slug: Organization identifier
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
    FROM `{settings.gcp_project_id}.organizations.org_provider_configs`
    WHERE org_slug = @org_slug
        AND provider = @provider
        AND domain = @domain
        AND is_active = TRUE
    LIMIT 1
    """

    try:
        results = list(bq_client.query(
            query,
            parameters=[
                bigquery.ScalarQueryParameter("org_slug", "STRING", org_slug),
                bigquery.ScalarQueryParameter("provider", "STRING", provider.upper()),
                bigquery.ScalarQueryParameter("domain", "STRING", domain.upper())
            ]
        ))

        if not results:
            # Return default configuration if not found
            logger.info(f"No provider config found for org {org_slug}, provider {provider}, domain {domain} - using defaults")
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

        logger.info(f"Retrieved provider config for org {org_slug}: {provider}/{domain}")
        return config

    except Exception as e:
        logger.error(f"Error retrieving provider config: {e}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Provider configuration service error"
        )


# ============================================
# Legacy Organization-Based Authentication (DEPRECATED - Use get_current_org)
# ============================================


async def get_org_from_local_file(org_api_key_hash: str) -> Optional[str]:
    """
    Look up org_slug from local file-based API keys (development fallback).

    DEPRECATED: This is a legacy fallback for development only.
    Production should use get_current_org() which reads from organizations dataset.

    Args:
        org_api_key_hash: SHA256 hash of API key

    Returns:
        org_slug if found, None otherwise
    """
    # Expand ~ to home directory if present
    secrets_base_str = os.path.expanduser(settings.secrets_base_path)
    secrets_base = Path(secrets_base_str)

    if not secrets_base.exists():
        return None

    # Search through org directories
    for org_dir in secrets_base.iterdir():
        if not org_dir.is_dir():
            continue

        metadata_file = org_dir / "api_key_metadata.json"
        if not metadata_file.exists():
            continue

        try:
            with open(metadata_file, 'r') as f:
                metadata = json.load(f)

            # SECURITY: Use constant-time comparison to prevent timing attacks
            stored_hash = metadata.get("org_api_key_hash", "")
            if stored_hash and hmac.compare_digest(stored_hash, org_api_key_hash):
                org_slug = metadata.get("org_slug")
                logger.info(f"Found API key in local file for org: {org_slug}")
                return org_slug

        except Exception as e:
            logger.warning(f"Error reading {metadata_file}: {e}")
            continue

    return None


async def get_org_from_api_key(
    org_api_key_hash: str,
    bq_client: BigQueryClient
) -> Optional[Dict[str, Any]]:
    """
    Look up org data from API key hash using centralized organizations dataset.

    UPDATED: Now reads from organizations.org_api_keys (centralized API keys).
    This is more secure as API keys are stored in a centralized, access-controlled dataset.

    Args:
        org_api_key_hash: SHA256 hash of API key
        bq_client: BigQuery client instance

    Returns:
        Dict with org_slug and org_api_key_id if found and active, None otherwise
    """
    # Query centralized organizations.org_api_keys table
    # NOTE: Subscription validation is done by API service, not here
    # Subscription status moved to Supabase (2026-02-01), BigQuery org_subscriptions deprecated
    query = f"""
    SELECT
        k.org_slug,
        k.org_api_key_id,
        k.is_active,
        k.expires_at,
        p.status AS org_profile_status,
        'ACTIVE' AS org_subscription_status  -- Default, real check done by API validator
    FROM `{settings.gcp_project_id}.organizations.org_api_keys` k
    JOIN `{settings.gcp_project_id}.organizations.org_profiles` p ON k.org_slug = p.org_slug
    WHERE k.org_api_key_hash = @org_api_key_hash
        AND k.is_active = TRUE
        AND p.status = 'ACTIVE'
    LIMIT 1
    """

    try:
        logger.info(f"[AUTH] Looking up API key in centralized organizations dataset")
        results = list(bq_client.query(
            query,
            parameters=[
                bigquery.ScalarQueryParameter("org_api_key_hash", "STRING", org_api_key_hash)
            ]
        ))

        if not results:
            # SECURITY: Only fall back to local files in development mode
            if settings.is_development or os.getenv("ENABLE_DEV_MODE", "false").lower() == "true":
                logger.warning("API key not found in organizations dataset, falling back to local files (dev mode only)")
                org_slug = await get_org_from_local_file(org_api_key_hash)
                if org_slug:
                    return {"org_slug": org_slug, "org_api_key_id": "local-dev-key"}
            else:
                logger.warning("API key not found in organizations dataset")
            return None

        row = results[0]

        # Check if API key has expired
        if row.get("expires_at") and row["expires_at"] < datetime.now(timezone.utc):
            logger.warning(f"API key expired for org: {row['org_slug']}")
            return None

        if not row.get("is_active", False):
            logger.warning(f"API key is inactive for org: {row.get('org_slug')}")
            return None

        result = {
            "org_slug": row["org_slug"],
            "org_api_key_id": row.get("org_api_key_id")
        }
        logger.info(f"[AUTH] Authenticated org: {result['org_slug']} (key: {result['org_api_key_id']})")
        return result

    except Exception as e:
        logger.error(f"Centralized auth lookup failed: {e}", exc_info=True)
        # SECURITY: Only fall back to local files in development mode
        if settings.is_development or os.getenv("ENABLE_DEV_MODE", "false").lower() == "true":
            logger.warning("Falling back to local file lookup (dev mode only)")
            org_slug = await get_org_from_local_file(org_api_key_hash)
            if org_slug:
                return {"org_slug": org_slug, "org_api_key_id": "local-dev-key"}
        return None


async def verify_api_key(
    x_api_key: Optional[str] = Header(None, description="API Key for authentication"),
    x_user_id: Optional[str] = Header(None, alias="X-User-ID", description="User ID from frontend"),
    bq_client: BigQueryClient = Depends(get_bigquery_client)
) -> OrgContext:
    """
    FastAPI dependency to verify API key and extract org context.

    Args:
        x_api_key: API key from X-API-Key header
        x_user_id: User ID from X-User-ID header (optional)
        bq_client: BigQuery client (injected)

    Returns:
        OrgContext with org_slug and user_id

    Raises:
        HTTPException: If API key is invalid or inactive (when auth is enabled)
    """
    # Check if authentication is disabled
    if settings.disable_auth:
        logger.warning(f"Authentication is disabled - using default org '{settings.default_org_slug}'")
        return OrgContext(org_slug=settings.default_org_slug, org_api_key_hash="disabled", user_id=x_user_id)

    if not x_api_key:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Missing API key",
            headers={"WWW-Authenticate": "ApiKey"},
        )

    # Hash the API key
    org_api_key_hash = hash_api_key(x_api_key)

    # Look up org
    org_data = await get_org_from_api_key(org_api_key_hash, bq_client)

    if not org_data:
        # Rate limit failed authentication attempts
        rate_limiter = get_rate_limiter()
        key_identifier = f"auth_fail:{org_api_key_hash[:16]}"
        is_allowed, _ = await rate_limiter.check_global_limit(
            endpoint=key_identifier,
            limit_per_minute=10,
            limit_per_hour=50
        )

        if not is_allowed:
            logger.error(f"Rate limit exceeded for failed auth in verify_api_key")
            raise HTTPException(
                status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                detail="Too many failed authentication attempts. Please try again later.",
                headers={"Retry-After": "60"},
            )

        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or inactive API key",
            headers={"WWW-Authenticate": "ApiKey"},
        )

    org_slug = org_data["org_slug"]
    org_api_key_id = org_data.get("org_api_key_id")

    logger.info(f"Authenticated request for org: {org_slug}, user: {x_user_id or 'N/A'}")

    return OrgContext(
        org_slug=org_slug,
        org_api_key_hash=org_api_key_hash,
        user_id=x_user_id,
        org_api_key_id=org_api_key_id
    )


async def verify_api_key_header(
    x_api_key: str = Header(..., description="API Key for authentication"),
    x_user_id: Optional[str] = Header(None, alias="X-User-ID", description="User ID from frontend"),
    bq_client: BigQueryClient = Depends(get_bigquery_client)
) -> OrgContext:
    """
    FastAPI dependency to verify API key from X-API-Key header (required).

    This is a stricter version of verify_api_key that always requires the header.
    Use this for new endpoints that need explicit authentication.

    Args:
        x_api_key: API key from X-API-Key header (required)
        x_user_id: User ID from X-User-ID header (optional)
        bq_client: BigQuery client (injected)

    Returns:
        OrgContext with org_slug and user_id

    Raises:
        HTTPException: If API key is invalid or inactive
    """
    # Check if authentication is disabled
    if settings.disable_auth:
        logger.warning(f"Authentication is disabled - using default org '{settings.default_org_slug}'")
        return OrgContext(org_slug=settings.default_org_slug, org_api_key_hash="disabled", user_id=x_user_id)

    # Check for test API keys in development mode
    if settings.is_development or os.getenv("ENABLE_DEV_MODE", "false").lower() == "true":
        test_org = get_test_org_from_api_key(x_api_key)
        if test_org:
            logger.info(f"[DEV MODE] Using test API key for org: {test_org['org_slug']}")
            return OrgContext(
                org_slug=test_org['org_slug'],
                org_api_key_hash=hash_api_key(x_api_key),
                user_id=x_user_id,
                org_api_key_id=test_org.get('org_api_key_id')
            )

    # Hash the API key
    org_api_key_hash = hash_api_key(x_api_key)

    # Look up org
    org_data = await get_org_from_api_key(org_api_key_hash, bq_client)

    if not org_data:
        # Rate limit failed authentication attempts
        rate_limiter = get_rate_limiter()
        key_identifier = f"auth_fail:{org_api_key_hash[:16]}"
        is_allowed, _ = await rate_limiter.check_global_limit(
            endpoint=key_identifier,
            limit_per_minute=10,
            limit_per_hour=50
        )

        if not is_allowed:
            logger.error(f"Rate limit exceeded for failed auth in verify_api_key_header")
            raise HTTPException(
                status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                detail="Too many failed authentication attempts. Please try again later.",
                headers={"Retry-After": "60"},
            )

        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or inactive API key",
            headers={"WWW-Authenticate": "ApiKey"},
        )

    org_slug = org_data["org_slug"]
    org_api_key_id = org_data.get("org_api_key_id")

    logger.info(f"Authenticated request for org: {org_slug}, user: {x_user_id or 'N/A'}")

    return OrgContext(
        org_slug=org_slug,
        org_api_key_hash=org_api_key_hash,
        user_id=x_user_id,
        org_api_key_id=org_api_key_id
    )


# Optional: Allow unauthenticated access for health checks
async def optional_auth(
    x_api_key: Optional[str] = Header(None),
    bq_client: BigQueryClient = Depends(get_bigquery_client)
) -> Optional[OrgContext]:
    """
    Optional authentication dependency.

    Returns:
        OrgContext if API key provided and valid, None otherwise
    """
    if not x_api_key:
        return None

    try:
        return await verify_api_key(x_api_key=x_api_key, x_user_id=None, bq_client=bq_client)
    except HTTPException:
        return None


def _constant_time_compare(val1: str, val2: str) -> bool:
    """
    Compare two strings in constant time to prevent timing attacks.

    This prevents attackers from using timing differences to guess
    the correct admin API key character by character.

    Args:
        val1: First string to compare
        val2: Second string to compare

    Returns:
        True if strings are equal, False otherwise
    """
    import hmac
    return hmac.compare_digest(val1.encode(), val2.encode())


async def verify_admin_key(
    x_ca_root_key: Optional[str] = Header(None, alias="X-CA-Root-Key", description="CloudAct Root API Key for platform operations")
) -> None:
    """
    FastAPI dependency to verify root API key for platform-level operations.

    This is used for endpoints that manage organizations, API keys, and other platform
    operations that exist outside the organization scope.

    SECURITY: Uses constant-time comparison and hashing to prevent timing attacks.

    Args:
        x_ca_root_key: CloudAct Root API key from X-CA-Root-Key header

    Raises:
        HTTPException: If root key is invalid or not configured
    """
    if not x_ca_root_key:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Root API key required. Provide X-CA-Root-Key header.",
            headers={"WWW-Authenticate": "RootKey"},
        )

    # Check if root API key is configured
    if not settings.ca_root_api_key:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Root API key not configured. Set CA_ROOT_API_KEY environment variable.",
        )

    # Use constant-time comparison to prevent timing attacks
    # Hash both keys before comparison for additional security
    provided_hash = hash_api_key(x_ca_root_key)
    expected_hash = hash_api_key(settings.ca_root_api_key)

    if not _constant_time_compare(provided_hash, expected_hash):
        logger.warning(
            "Invalid root API key attempt",
            extra={
                "event_type": "root_auth_failed",
                "provided_hash_prefix": provided_hash[:8] + "..."
            }
        )
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Invalid root API key",
            headers={"WWW-Authenticate": "RootKey"},
        )

    logger.info("Root API key authentication successful")


@dataclass
class AuthResult:
    """Result of authentication check - either org key or admin key."""
    is_admin: bool
    org_slug: Optional[str] = None  # Set when authenticated via org API key
    org_data: Optional[Dict[str, Any]] = None  # Full org data when authenticated via org key


async def get_org_or_admin_auth(
    x_api_key: Optional[str] = Header(None, description="Organization API Key"),
    x_ca_root_key: Optional[str] = Header(None, alias="X-CA-Root-Key", description="CloudAct Root API Key"),
    bq_client: BigQueryClient = Depends(get_bigquery_client),
) -> AuthResult:
    """
    FastAPI dependency that accepts EITHER an org API key OR root API key.

    Use this for endpoints that can be called by:
    - Organization users (self-service) using their org API key
    - Platform admins using the root API key

    Returns:
        AuthResult with is_admin=True if root key used, or org data if org key used

    Raises:
        HTTPException: If neither key is valid or both are missing
    """
    # Check if auth is disabled (dev mode)
    if settings.disable_auth:
        logger.warning("Authentication disabled - allowing access")
        return AuthResult(is_admin=True, org_slug=None)

    # Try root key first (if provided)
    if x_ca_root_key:
        if settings.ca_root_api_key:
            # Use constant-time comparison to prevent timing attacks
            provided_hash = hash_api_key(x_ca_root_key)
            expected_hash = hash_api_key(settings.ca_root_api_key)
            if _constant_time_compare(provided_hash, expected_hash):
                logger.info("Root authentication successful for org/admin endpoint")
                return AuthResult(is_admin=True, org_slug=None)
        logger.warning("Invalid root API key provided")
        # Don't fail yet - maybe they also provided a valid org key

    # Try org API key
    if x_api_key:
        try:
            # Validate org API key using direct BigQuery query (same logic as get_current_org)
            org_api_key_hash = hash_api_key(x_api_key)

            query = f"""
            SELECT
                k.org_api_key_id,
                k.org_slug,
                k.is_active as key_active,
                p.company_name,
                p.admin_email,
                p.status as org_status
            FROM `{settings.gcp_project_id}.organizations.org_api_keys` k
            INNER JOIN `{settings.gcp_project_id}.organizations.org_profiles` p
                ON k.org_slug = p.org_slug
            WHERE k.org_api_key_hash = @org_api_key_hash
                AND k.is_active = TRUE
                AND p.status = 'ACTIVE'
            LIMIT 1
            """

            results = list(bq_client.query(
                query,
                parameters=[
                    bigquery.ScalarQueryParameter("org_api_key_hash", "STRING", org_api_key_hash)
                ]
            ))

            if results:
                row = results[0]
                logger.info(f"Org API key authentication successful for org: {row['org_slug']}")
                return AuthResult(
                    is_admin=False,
                    org_slug=row["org_slug"],
                    org_data={
                        "org_slug": row["org_slug"],
                        "company_name": row["company_name"],
                        "admin_email": row["admin_email"],
                        "status": row["org_status"],
                        "org_api_key_id": row["org_api_key_id"],
                    }
                )
        except Exception as e:
            logger.warning(f"Org API key validation error: {e}")
            # Org key validation failed - fall through to error

    # Neither key worked
    raise HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Valid X-API-Key (org) or X-CA-Root-Key (root) header required.",
        headers={"WWW-Authenticate": "ApiKey or RootKey"},
    )
