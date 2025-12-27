"""
API Key Authentication with Organization-Centric Architecture
Secure multi-org authentication using centralized organizations dataset.
Supports subscription validation, quota management, and credential retrieval.
Fallback to local file-based API keys for development.
"""

import hashlib
import json
import os
import secrets
import asyncio
from dataclasses import dataclass
from typing import Optional, Dict, Any, Set, List
from pathlib import Path
from datetime import datetime, date
from fastapi import Header, HTTPException, status, Depends, BackgroundTasks
import logging
from google.cloud import bigquery
import threading

from src.core.engine.bq_client import get_bigquery_client, BigQueryClient
from src.app.config import settings
from src.core.security.kms_encryption import decrypt_value

logger = logging.getLogger(__name__)


def get_utc_date() -> date:
    """
    Get current date in UTC timezone.

    CRITICAL: Must use UTC consistently for quota tracking because:
    - BigQuery stores dates in UTC
    - Server may be in different timezone (e.g., PST)
    - Prevents duplicate usage_id rows for same calendar day
    """
    return datetime.utcnow().date()


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
        logger.warning(f"Test API keys file not found: {test_keys_file}")
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


def _verify_test_key_signature(key_data: Dict[str, Any], api_key: str) -> bool:
    """
    Verify test API key signature to prevent tampering.

    Test keys loaded from disk should have a signature field that can be verified.
    This prevents attackers from modifying test_api_keys.json to inject malicious org data.

    Args:
        key_data: The key data from test_api_keys.json
        api_key: The plain text API key provided

    Returns:
        True if signature is valid or not required, False if invalid
    """
    # If no signature field, verify the key hash matches
    expected_hash = key_data.get("org_api_key_hash")
    if expected_hash:
        computed_hash = hash_api_key(api_key)
        if not secrets.compare_digest(expected_hash, computed_hash):
            logger.warning(
                "Test API key hash mismatch - possible tampering",
                extra={"org_slug": key_data.get("org_slug")}
            )
            return False

    # Verify required fields are present to prevent injection of incomplete/malicious data
    required_fields = ["org_slug", "api_key"]
    for field in required_fields:
        if not key_data.get(field):
            logger.warning(
                f"Test API key missing required field: {field}",
                extra={"org_slug": key_data.get("org_slug")}
            )
            return False

    return True


def get_test_org_from_api_key(api_key: str) -> Optional[Dict[str, Any]]:
    """
    Look up test org data from test API key with signature verification.

    Args:
        api_key: Plain text API key

    Returns:
        Org dict if found and verified, None otherwise
    """
    test_keys = load_test_api_keys()
    key_data = test_keys.get(api_key)

    if key_data is None:
        return None

    # Verify signature/integrity before returning
    if not _verify_test_key_signature(key_data, api_key):
        logger.warning(
            "Test API key failed signature verification",
            extra={"org_slug": key_data.get("org_slug")}
        )
        return None

    return key_data


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
        # Thread-safe check with lock to prevent race condition
        with self._lock:
            if self._initialized:
                return

            self.pending_updates: Set[str] = set()  # Set of org_api_key_ids to update
            self.batch_lock = threading.Lock()
            self.flush_interval = 60  # Flush every 60 seconds
            self._is_running = False  # Protected by _running_lock
            self._running_lock = threading.Lock()  # Lock for is_running flag
            self.background_task: Optional[asyncio.Task] = None
            self._initialized = True

            logger.info("AuthMetricsAggregator initialized with 60s flush interval")

    @property
    def is_running(self) -> bool:
        """Thread-safe getter for is_running flag."""
        with self._running_lock:
            return self._is_running

    @is_running.setter
    def is_running(self, value: bool) -> None:
        """Thread-safe setter for is_running flag."""
        with self._running_lock:
            self._is_running = value

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
            job = bq_client.client.query(
                update_query,
                job_config=bigquery.QueryJobConfig(
                    query_parameters=[
                        bigquery.ArrayQueryParameter("key_ids", "STRING", valid_key_ids)
                    ]
                )
            )
            # Wait with explicit timeout (30 seconds) - separate from job_timeout_ms
            job.result(timeout=30)

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

        try:
            while self.is_running:
                try:
                    await asyncio.sleep(self.flush_interval)
                    # Add timeout to flush operation to prevent blocking
                    try:
                        await asyncio.wait_for(
                            self.flush_updates(bq_client),
                            timeout=30.0  # 30 second timeout for flush
                        )
                    except asyncio.TimeoutError:
                        logger.warning("Background flush timed out (30s)")
                except asyncio.CancelledError:
                    logger.info("Background flush task cancelled")
                    # Perform cleanup before exiting
                    try:
                        await asyncio.wait_for(
                            self.flush_updates(bq_client),
                            timeout=5.0
                        )
                        logger.info("Final flush completed on cancellation")
                    except Exception as cleanup_error:
                        logger.warning(f"Final flush failed on cancellation: {cleanup_error}")
                    break
                except Exception as e:
                    logger.error(f"Error in background flush task: {e}", exc_info=True)
                    # Continue running even on error
        finally:
            # Ensure cleanup happens even if loop exits unexpectedly
            self.is_running = False
            logger.info("Background flush task stopped")

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

    def __init__(
        self,
        org_slug: str,
        org_api_key_hash: str,
        user_id: Optional[str] = None,
        org_api_key_id: Optional[str] = None,
        scopes: Optional[List[str]] = None
    ):
        self.org_slug = org_slug
        self.org_api_key_hash = org_api_key_hash
        self.user_id = user_id
        self.org_api_key_id = org_api_key_id
        self.scopes = scopes or []  # E4: API key scopes for permission enforcement

    def __repr__(self) -> str:
        user_info = f", user_id='{self.user_id}'" if self.user_id else ""
        key_info = f", key_id='{self.org_api_key_id}'" if self.org_api_key_id else ""
        scope_info = f", scopes={self.scopes}" if self.scopes else ""
        return f"OrgContext(org_slug='{self.org_slug}'{user_info}{key_info}{scope_info})"


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
        s.subscription_id,
        s.plan_name,
        s.status as subscription_status,
        s.daily_limit as max_pipelines_per_day,
        s.monthly_limit as max_pipelines_per_month,
        s.concurrent_limit as max_concurrent_pipelines,
        s.trial_end_date,
        s.subscription_end_date
    FROM `{settings.gcp_project_id}.organizations.org_api_keys` k
    INNER JOIN `{settings.gcp_project_id}.organizations.org_profiles` p
        ON k.org_slug = p.org_slug
    INNER JOIN `{settings.gcp_project_id}.organizations.org_subscriptions` s
        ON p.org_slug = s.org_slug
    WHERE k.org_api_key_hash = @org_api_key_hash
        AND k.is_active = TRUE
        AND p.status = 'ACTIVE'
        AND s.status IN ('ACTIVE', 'TRIAL')
    LIMIT 1
    """

    try:
        # Use custom BigQueryClient.query() with parameters
        job_config = bigquery.QueryJobConfig(
            query_parameters=[
                bigquery.ScalarQueryParameter("org_api_key_hash", "STRING", org_api_key_hash)
            ],
            job_timeout_ms=settings.bq_auth_timeout_ms
        )
        results = list(bq_client.client.query(query, job_config=job_config).result())

        if not results:
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

        # Check if API key has expired (null check before comparison)
        expires_at = row.get("expires_at")
        if expires_at is not None and expires_at < datetime.utcnow():
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

    # Check subscription status (allow both ACTIVE and TRIAL)
    valid_subscription_statuses = ["ACTIVE", "TRIAL"]
    if subscription.get("status") not in valid_subscription_statuses:
        logger.warning(f"Inactive subscription for org: {org['org_slug']}, status: {subscription.get('status')}")
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=f"Subscription is {subscription.get('status')}. Please contact support."
        )

    # Check trial expiration
    trial_end = subscription.get("trial_end_date")
    if trial_end and isinstance(trial_end, (datetime, date)):
        trial_end_date = trial_end if isinstance(trial_end, date) else trial_end.date()
        if trial_end_date < date.today():
            logger.warning(f"Trial expired for org: {org['org_slug']}")
            raise HTTPException(
                status_code=status.HTTP_402_PAYMENT_REQUIRED,
                detail="Trial period has expired. Please upgrade your subscription."
            )

    # Check subscription expiration
    sub_end = subscription.get("subscription_end_date")
    if sub_end and isinstance(sub_end, (datetime, date)):
        sub_end_date = sub_end if isinstance(sub_end, date) else sub_end.date()
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
    subscription: Dict = Depends(validate_subscription),
    bq_client: BigQueryClient = Depends(get_bigquery_client)
) -> Dict[str, Any]:
    """
    Validate org has not exceeded daily/monthly pipeline quotas.

    Checks organizations.org_usage_quotas table.
    Returns quota info or raises HTTPException if exceeded.

    Args:
        org: Organization object from get_current_org
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
    org_slug = org["org_slug"]
    # CRITICAL: Use UTC date for consistency with BigQuery
    today = get_utc_date()

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
    FROM `{settings.gcp_project_id}.organizations.org_usage_quotas`
    WHERE org_slug = @org_slug
        AND usage_date = @usage_date
    LIMIT 1
    """

    try:
        # Bug fix #5: Use custom BigQueryClient API (no job_config parameter)
        job_config = bigquery.QueryJobConfig(
            query_parameters=[
                bigquery.ScalarQueryParameter("org_slug", "STRING", org_slug),
                bigquery.ScalarQueryParameter("usage_date", "DATE", today)
            ],
            job_timeout_ms=settings.bq_auth_timeout_ms
        )
        results = list(bq_client.client.query(query, job_config=job_config).result())

        if not results:
            # Create today's usage record
            usage_id = f"{org_slug}_{today.strftime('%Y%m%d')}"
            insert_query = f"""
            INSERT INTO `{settings.gcp_project_id}.organizations.org_usage_quotas`
            (usage_id, org_slug, usage_date, pipelines_run_today, pipelines_failed_today,
             pipelines_succeeded_today, pipelines_run_month, concurrent_pipelines_running,
             daily_limit, monthly_limit, concurrent_limit, created_at, last_updated)
            VALUES (
                @usage_id,
                @org_slug,
                @usage_date,
                0, 0, 0, 0, 0,
                @daily_limit,
                @monthly_limit,
                @concurrent_limit,
                CURRENT_TIMESTAMP(),
                CURRENT_TIMESTAMP()
            )
            """

            bq_client.client.query(
                insert_query,
                job_config=bigquery.QueryJobConfig(
                    query_parameters=[
                        bigquery.ScalarQueryParameter("usage_id", "STRING", usage_id),
                        bigquery.ScalarQueryParameter("org_slug", "STRING", org_slug),
                        bigquery.ScalarQueryParameter("usage_date", "DATE", today),
                        bigquery.ScalarQueryParameter("daily_limit", "INT64", subscription["max_pipelines_per_day"]),
                        bigquery.ScalarQueryParameter("monthly_limit", "INT64", subscription["max_pipelines_per_month"]),
                        bigquery.ScalarQueryParameter("concurrent_limit", "INT64", subscription["max_concurrent_pipelines"])
                    ],
                    job_timeout_ms=settings.bq_auth_timeout_ms
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

        # IMPORTANT: Use subscription limits (source of truth), NOT usage table limits
        # The usage table limits can become stale when subscription changes (upgrade/downgrade)
        # Subscription limits are always fresh from org_subscriptions table
        daily_limit = subscription["max_pipelines_per_day"]
        monthly_limit = subscription["max_pipelines_per_month"]
        concurrent_limit = subscription["max_concurrent_pipelines"]
        pipelines_run_today = usage["pipelines_run_today"] or 0
        pipelines_run_month = usage["pipelines_run_month"] or 0
        concurrent_pipelines_running = usage["concurrent_pipelines_running"] or 0

        # Check daily limit
        if pipelines_run_today >= daily_limit:
            logger.warning(f"Daily quota exceeded for org: {org_slug}")
            raise HTTPException(
                status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                detail=f"Daily pipeline quota exceeded ({daily_limit} pipelines/day). Try again tomorrow.",
                headers={"Retry-After": "86400"}  # 24 hours
            )

        # Check monthly limit
        if pipelines_run_month >= monthly_limit:
            logger.warning(f"Monthly quota exceeded for org: {org_slug}")
            raise HTTPException(
                status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                detail=f"Monthly pipeline quota exceeded ({monthly_limit} pipelines/month). Upgrade your plan.",
            )

        # Check concurrent limit
        if concurrent_pipelines_running >= concurrent_limit:
            logger.warning(f"Concurrent pipeline limit reached for org: {org_slug}")
            raise HTTPException(
                status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                detail=f"Concurrent pipeline limit reached ({concurrent_limit} pipelines). Wait for running pipelines to complete.",
                headers={"Retry-After": "300"}  # 5 minutes
            )

        # Return quota info
        quota_info = {
            "pipelines_run_today": pipelines_run_today,
            "pipelines_run_month": pipelines_run_month,
            "concurrent_pipelines_running": concurrent_pipelines_running,
            "daily_limit": daily_limit,
            "monthly_limit": monthly_limit,
            "concurrent_limit": concurrent_limit,
            "remaining_today": daily_limit - pipelines_run_today,
            "remaining_month": monthly_limit - pipelines_run_month
        }

        logger.info(f"Quota validated for org: {org_slug} - {quota_info['remaining_today']} remaining today")
        return quota_info

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error validating quota: {e}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Quota validation service error"
        )


async def reserve_pipeline_quota_atomic(
    org_slug: str,
    subscription: Dict[str, Any],
    bq_client: BigQueryClient
) -> Dict[str, Any]:
    """
    Atomically check quotas AND reserve a pipeline slot in a single BigQuery operation.

    This prevents race conditions where multiple concurrent requests pass quota checks
    before any increments happen. Uses UPDATE with WHERE clause that includes quota limits.

    FALLBACK BEHAVIOR:
    - If quota record doesn't exist for today, auto-creates it with subscription limits
    - If subscription limits are NULL (Stripe sync failed), uses SUBSCRIPTION_LIMITS defaults

    Args:
        org_slug: Organization identifier
        subscription: Subscription info with max_pipelines_per_day, etc.
        bq_client: BigQuery client instance

    Returns:
        Dict with:
            - success: True if quota reserved, False if limit exceeded
            - quota_type: Which limit was exceeded (if any)
            - current_usage: Current usage counts after operation

    Raises:
        HTTPException: 429 if quota exceeded
    """
    today = get_utc_date()

    # Use subscription limits if available, fallback to SUBSCRIPTION_LIMITS
    daily_limit = subscription.get("max_pipelines_per_day")
    monthly_limit = subscription.get("max_pipelines_per_month")
    concurrent_limit = subscription.get("max_concurrent_pipelines")

    # Fallback to SUBSCRIPTION_LIMITS if any limit is None (Stripe sync failure)
    if daily_limit is None or monthly_limit is None or concurrent_limit is None:
        from src.app.models.org_models import SUBSCRIPTION_LIMITS, SubscriptionPlan

        plan_name = subscription.get("plan_name", "STARTER")
        try:
            plan_enum = SubscriptionPlan(plan_name)
            defaults = SUBSCRIPTION_LIMITS[plan_enum]
        except (ValueError, KeyError):
            logger.warning(f"Unknown plan '{plan_name}' for org {org_slug}, using STARTER defaults")
            defaults = SUBSCRIPTION_LIMITS[SubscriptionPlan.STARTER]

        daily_limit = daily_limit or defaults["max_pipelines_per_day"]
        monthly_limit = monthly_limit or defaults["max_pipelines_per_month"]
        concurrent_limit = concurrent_limit or defaults["max_concurrent_pipelines"]

        logger.info(
            f"Using fallback limits for org {org_slug}: "
            f"daily={daily_limit}, monthly={monthly_limit}, concurrent={concurrent_limit}"
        )

    # ATOMIC check-and-increment: Only increments if ALL limits are not exceeded
    # The WHERE clause checks all limits BEFORE incrementing
    atomic_update_query = f"""
    UPDATE `{settings.gcp_project_id}.organizations.org_usage_quotas`
    SET
        concurrent_pipelines_running = concurrent_pipelines_running + 1,
        pipelines_run_today = pipelines_run_today + 1,
        pipelines_run_month = pipelines_run_month + 1,
        last_updated = CURRENT_TIMESTAMP()
    WHERE org_slug = @org_slug
        AND usage_date = @usage_date
        AND pipelines_run_today < @daily_limit
        AND pipelines_run_month < @monthly_limit
        AND concurrent_pipelines_running < @concurrent_limit
    """

    try:
        job = bq_client.client.query(
            atomic_update_query,
            job_config=bigquery.QueryJobConfig(
                query_parameters=[
                    bigquery.ScalarQueryParameter("org_slug", "STRING", org_slug),
                    bigquery.ScalarQueryParameter("usage_date", "DATE", today),
                    bigquery.ScalarQueryParameter("daily_limit", "INT64", daily_limit),
                    bigquery.ScalarQueryParameter("monthly_limit", "INT64", monthly_limit),
                    bigquery.ScalarQueryParameter("concurrent_limit", "INT64", concurrent_limit)
                ]
            )
        )
        result = job.result()

        # Check if any rows were updated (quota was available)
        if job.num_dml_affected_rows == 0:
            # No rows updated - either quota exceeded OR record doesn't exist yet
            # Query to determine which case we're in
            check_query = f"""
            SELECT
                pipelines_run_today,
                pipelines_run_month,
                concurrent_pipelines_running
            FROM `{settings.gcp_project_id}.organizations.org_usage_quotas`
            WHERE org_slug = @org_slug
                AND usage_date = @usage_date
            LIMIT 1
            """

            check_results = list(bq_client.client.query(
                check_query,
                job_config=bigquery.QueryJobConfig(
                    query_parameters=[
                        bigquery.ScalarQueryParameter("org_slug", "STRING", org_slug),
                        bigquery.ScalarQueryParameter("usage_date", "DATE", today)
                    ],
                    job_timeout_ms=settings.bq_auth_timeout_ms
                )
            ).result())

            if check_results:
                # Record exists but quota exceeded - determine which limit was hit
                usage = check_results[0]
                run_today = usage["pipelines_run_today"] or 0
                run_month = usage["pipelines_run_month"] or 0
                concurrent = usage["concurrent_pipelines_running"] or 0

                # Determine which limit was exceeded
                if run_today >= daily_limit:
                    logger.warning(f"Daily quota exceeded for org: {org_slug} ({run_today}/{daily_limit})")
                    raise HTTPException(
                        status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                        detail=f"Daily pipeline quota exceeded ({daily_limit} pipelines/day). Try again tomorrow.",
                        headers={"Retry-After": "86400"}
                    )
                elif run_month >= monthly_limit:
                    logger.warning(f"Monthly quota exceeded for org: {org_slug} ({run_month}/{monthly_limit})")
                    raise HTTPException(
                        status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                        detail=f"Monthly pipeline quota exceeded ({monthly_limit} pipelines/month). Upgrade your plan.",
                    )
                elif concurrent >= concurrent_limit:
                    logger.warning(f"Concurrent limit reached for org: {org_slug} ({concurrent}/{concurrent_limit})")
                    raise HTTPException(
                        status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                        detail=f"Concurrent pipeline limit reached ({concurrent_limit} pipelines). Wait for running pipelines to complete.",
                        headers={"Retry-After": "300"}
                    )
            else:
                # Record doesn't exist - create it and retry the atomic reservation
                logger.info(f"Quota record not found for org {org_slug} on {today}, creating with limits from subscription")

                usage_id = f"{org_slug}_{today.strftime('%Y%m%d')}"
                insert_query = f"""
                INSERT INTO `{settings.gcp_project_id}.organizations.org_usage_quotas`
                (usage_id, org_slug, usage_date, pipelines_run_today, pipelines_failed_today,
                 pipelines_succeeded_today, pipelines_run_month, concurrent_pipelines_running,
                 daily_limit, monthly_limit, concurrent_limit, created_at, last_updated)
                VALUES (
                    @usage_id,
                    @org_slug,
                    @usage_date,
                    0, 0, 0, 0, 0,
                    @daily_limit,
                    @monthly_limit,
                    @concurrent_limit,
                    CURRENT_TIMESTAMP(),
                    CURRENT_TIMESTAMP()
                )
                """

                bq_client.client.query(
                    insert_query,
                    job_config=bigquery.QueryJobConfig(
                        query_parameters=[
                            bigquery.ScalarQueryParameter("usage_id", "STRING", usage_id),
                            bigquery.ScalarQueryParameter("org_slug", "STRING", org_slug),
                            bigquery.ScalarQueryParameter("usage_date", "DATE", today),
                            bigquery.ScalarQueryParameter("daily_limit", "INT64", daily_limit),
                            bigquery.ScalarQueryParameter("monthly_limit", "INT64", monthly_limit),
                            bigquery.ScalarQueryParameter("concurrent_limit", "INT64", concurrent_limit)
                        ],
                        job_timeout_ms=settings.bq_auth_timeout_ms
                    )
                ).result()

                logger.info(f"Created quota record for org {org_slug}, now retrying atomic reservation")

                # Retry the atomic UPDATE now that record exists
                retry_job = bq_client.client.query(
                    atomic_update_query,
                    job_config=bigquery.QueryJobConfig(
                        query_parameters=[
                            bigquery.ScalarQueryParameter("org_slug", "STRING", org_slug),
                            bigquery.ScalarQueryParameter("usage_date", "DATE", today),
                            bigquery.ScalarQueryParameter("daily_limit", "INT64", daily_limit),
                            bigquery.ScalarQueryParameter("monthly_limit", "INT64", monthly_limit),
                            bigquery.ScalarQueryParameter("concurrent_limit", "INT64", concurrent_limit)
                        ]
                    )
                )
                retry_job.result()

                if retry_job.num_dml_affected_rows == 0:
                    logger.error(f"Atomic reservation retry failed for org {org_slug} even after creating record")
                    raise HTTPException(
                        status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                        detail="Quota reservation failed after record creation. Please try again."
                    )

                logger.info(f"Pipeline quota reserved successfully for org {org_slug} (new record)")
                return {
                    "success": True,
                    "rows_affected": retry_job.num_dml_affected_rows,
                    "quota_record_created": True
                }

            # Fallback if we couldn't determine the specific limit
            raise HTTPException(
                status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                detail="Pipeline quota exceeded. Please try again later."
            )

        # Success - quota was reserved
        logger.info(f"Pipeline quota reserved atomically for org {org_slug}")
        return {
            "success": True,
            "rows_affected": job.num_dml_affected_rows
        }

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Failed to reserve pipeline quota: {e}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Quota reservation service error"
        )


async def increment_pipeline_usage(
    org_slug: str,
    pipeline_status: str,
    bq_client: BigQueryClient
):
    """
    Increment usage counters after pipeline execution.

    Updates organizations.org_usage_quotas.

    NOTE: For "RUNNING" status, prefer using reserve_pipeline_quota_atomic() instead
    to prevent race conditions. This function is kept for backward compatibility.

    Args:
        org_slug: Organization identifier
        pipeline_status: Pipeline execution status (SUCCESS, FAILED, RUNNING)
        bq_client: BigQuery client instance
    """
    # CRITICAL: Use UTC date for consistency with BigQuery
    today = get_utc_date()

    # Determine which counters to increment
    if pipeline_status == "RUNNING":
        # NOTE: This path is deprecated for new code. Use reserve_pipeline_quota_atomic() instead.
        # Kept for backward compatibility with existing callers.
        # CRITICAL: Increment BOTH concurrent counter AND daily/monthly counters atomically
        # This prevents race conditions where multiple requests pass quota check before any increments happen
        # The daily counter is incremented HERE to reserve the quota slot immediately
        update_query = f"""
        UPDATE `{settings.gcp_project_id}.organizations.org_usage_quotas`
        SET
            concurrent_pipelines_running = concurrent_pipelines_running + 1,
            pipelines_run_today = pipelines_run_today + 1,
            pipelines_run_month = pipelines_run_month + 1
        WHERE org_slug = @org_slug
            AND usage_date = @usage_date
        """

        try:
            bq_client.client.query(
                update_query,
                job_config=bigquery.QueryJobConfig(
                    query_parameters=[
                        bigquery.ScalarQueryParameter("org_slug", "STRING", org_slug),
                        bigquery.ScalarQueryParameter("usage_date", "DATE", today)
                    ],
                    job_timeout_ms=settings.bq_auth_timeout_ms
                )
            ).result()

            logger.info(f"Updated usage for org {org_slug}: status={pipeline_status}")

        except Exception as e:
            logger.error(f"Failed to increment pipeline usage: {e}", exc_info=True)

    elif pipeline_status in ["SUCCESS", "FAILED"]:
        # Update completion counters and decrement concurrent
        # NOTE: pipelines_run_today and pipelines_run_month are already incremented when RUNNING
        # so we only update success/failed counts and decrement concurrent counter here
        # SECURITY: Use parameterized query parameters instead of f-string interpolation
        success_increment = 1 if pipeline_status == "SUCCESS" else 0
        failed_increment = 1 if pipeline_status == "FAILED" else 0

        update_query = f"""
        UPDATE `{settings.gcp_project_id}.organizations.org_usage_quotas`
        SET
            pipelines_succeeded_today = pipelines_succeeded_today + @success_increment,
            pipelines_failed_today = pipelines_failed_today + @failed_increment,
            concurrent_pipelines_running = GREATEST(concurrent_pipelines_running - 1, 0)
        WHERE org_slug = @org_slug
            AND usage_date = @usage_date
        """

        try:
            bq_client.client.query(
                update_query,
                job_config=bigquery.QueryJobConfig(
                    query_parameters=[
                        bigquery.ScalarQueryParameter("org_slug", "STRING", org_slug),
                        bigquery.ScalarQueryParameter("usage_date", "DATE", today),
                        bigquery.ScalarQueryParameter("success_increment", "INT64", success_increment),
                        bigquery.ScalarQueryParameter("failed_increment", "INT64", failed_increment)
                    ],
                    job_timeout_ms=settings.bq_auth_timeout_ms
                )
            ).result()

            logger.info(f"Updated usage for org {org_slug}: status={pipeline_status}")

        except Exception as e:
            logger.error(f"Failed to increment pipeline usage: {e}", exc_info=True)
    else:
        logger.warning(f"Unknown pipeline status: {pipeline_status}")
        return


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
        # Bug fix #5: Use custom BigQueryClient API (no job_config parameter)
        job_config = bigquery.QueryJobConfig(
            query_parameters=[
                bigquery.ScalarQueryParameter("org_slug", "STRING", org_slug),
                bigquery.ScalarQueryParameter("provider", "STRING", provider.upper())
            ],
            job_timeout_ms=settings.bq_auth_timeout_ms
        )
        results = list(bq_client.client.query(query, job_config=job_config).result())

        if not results:
            logger.warning(f"No active credentials found for org {org_slug}, provider {provider}")
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"No active {provider} credentials configured for this organization"
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
        job_config = bigquery.QueryJobConfig(
            query_parameters=[
                bigquery.ScalarQueryParameter("org_slug", "STRING", org_slug),
                bigquery.ScalarQueryParameter("provider", "STRING", provider.upper()),
                bigquery.ScalarQueryParameter("domain", "STRING", domain.upper())
            ],
            job_timeout_ms=settings.bq_auth_timeout_ms
        )
        results = list(bq_client.client.query(query, job_config=job_config).result())

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

            stored_hash = metadata.get("org_api_key_hash", "")
            if stored_hash and secrets.compare_digest(stored_hash, org_api_key_hash):
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
    query = f"""
    SELECT
        k.org_slug,
        k.org_api_key_id,
        k.is_active,
        k.expires_at,
        p.status AS org_profile_status,
        c.status AS org_subscription_status
    FROM `{settings.gcp_project_id}.organizations.org_api_keys` k
    JOIN `{settings.gcp_project_id}.organizations.org_profiles` p ON k.org_slug = p.org_slug
    JOIN `{settings.gcp_project_id}.organizations.org_subscriptions` c ON k.org_slug = c.org_slug
    WHERE k.org_api_key_hash = @org_api_key_hash
        AND k.is_active = TRUE
        AND p.status = 'ACTIVE'
        AND c.status IN ('ACTIVE', 'TRIAL')
    LIMIT 1
    """

    try:
        logger.info(f"[AUTH] Looking up API key in centralized organizations dataset")
        job_config = bigquery.QueryJobConfig(
            query_parameters=[
                bigquery.ScalarQueryParameter("org_api_key_hash", "STRING", org_api_key_hash)
            ],
            job_timeout_ms=settings.bq_auth_timeout_ms
        )
        results = list(bq_client.client.query(query, job_config=job_config).result())

        if not results:
            # SECURITY: Do NOT fall back to local files - this bypasses proper auth
            # Local file fallback was removed to prevent auth bypass vulnerabilities
            logger.warning(f"API key not found in organizations dataset")
            return None

        row = results[0]

        # Check if API key has expired
        if row.get("expires_at") and row["expires_at"] < datetime.utcnow():
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
        # SECURITY: Do NOT fall back to local files - log error and return None
        logger.error(f"Centralized auth lookup failed: {e}", exc_info=True)
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

    # Check for test API keys (development/QA mode)
    enable_dev_mode = os.getenv("ENABLE_DEV_MODE", "false").lower() == "true"
    if enable_dev_mode or settings.is_development:
        test_org = get_test_org_from_api_key(x_api_key)
        if test_org:
            logger.info(f"[DEV MODE] Using test API key for org: {test_org['org_slug']}")
            return OrgContext(
                org_slug=test_org["org_slug"],
                org_api_key_hash="test-key",
                user_id=x_user_id,
                org_api_key_id=test_org.get("org_api_key_id", "test-key")
            )

    # Hash the API key
    org_api_key_hash = hash_api_key(x_api_key)

    # Look up org
    org_data = await get_org_from_api_key(org_api_key_hash, bq_client)

    if not org_data:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or inactive API key",
            headers={"WWW-Authenticate": "ApiKey"},
        )

    org_slug = org_data["org_slug"]
    org_api_key_id = org_data.get("org_api_key_id")
    scopes = org_data.get("scopes", [])  # E4: Extract scopes (empty = all permissions)

    logger.info(f"Authenticated request for org: {org_slug}, user: {x_user_id or 'N/A'}")

    return OrgContext(
        org_slug=org_slug,
        org_api_key_hash=org_api_key_hash,
        user_id=x_user_id,
        org_api_key_id=org_api_key_id,
        scopes=scopes  # E4: Backward compatible - empty scopes = all permissions
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

    # Check for test API keys (development/QA mode)
    enable_dev_mode = os.getenv("ENABLE_DEV_MODE", "false").lower() == "true"
    if enable_dev_mode or settings.is_development:
        test_org = get_test_org_from_api_key(x_api_key)
        if test_org:
            logger.info(f"[DEV MODE] Using test API key for org: {test_org['org_slug']}")
            return OrgContext(
                org_slug=test_org["org_slug"],
                org_api_key_hash="test-key",
                user_id=x_user_id,
                org_api_key_id=test_org.get("org_api_key_id", "test-key")
            )

    # Hash the API key
    org_api_key_hash = hash_api_key(x_api_key)

    # Look up org
    org_data = await get_org_from_api_key(org_api_key_hash, bq_client)

    if not org_data:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or inactive API key",
            headers={"WWW-Authenticate": "ApiKey"},
        )

    org_slug = org_data["org_slug"]
    org_api_key_id = org_data.get("org_api_key_id")
    scopes = org_data.get("scopes", [])  # E4: Extract scopes (empty = all permissions)

    logger.info(f"Authenticated request for org: {org_slug}, user: {x_user_id or 'N/A'}")

    return OrgContext(
        org_slug=org_slug,
        org_api_key_hash=org_api_key_hash,
        user_id=x_user_id,
        org_api_key_id=org_api_key_id,
        scopes=scopes  # E4: Backward compatible - empty scopes = all permissions
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
        return await verify_api_key(x_api_key, bq_client)
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

    # Check for test API keys (development/QA mode)
    enable_dev_mode = os.getenv("ENABLE_DEV_MODE", "false").lower() == "true"
    if (enable_dev_mode or settings.is_development) and x_api_key:
        test_org = get_test_org_from_api_key(x_api_key)
        if test_org:
            logger.info(f"[DEV MODE] Using test API key for org: {test_org['org_slug']}")
            return AuthResult(
                is_admin=False,
                org_slug=test_org["org_slug"],
                org_data=test_org
            )

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

            job_config = bigquery.QueryJobConfig(
                query_parameters=[
                    bigquery.ScalarQueryParameter("org_api_key_hash", "STRING", org_api_key_hash)
                ],
                job_timeout_ms=settings.bq_auth_timeout_ms
            )
            results = list(bq_client.client.query(query, job_config=job_config).result())

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
