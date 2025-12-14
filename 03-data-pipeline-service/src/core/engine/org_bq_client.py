"""
Per-Organization BigQuery Client with Resource Isolation

Provides per-org BigQuery client instances with:
1. Connection limiting per org tier
2. Query timeout configuration per tier
3. Cost tracking per query
4. Noisy neighbor protection
"""

import threading
import time
import logging
from typing import Optional, Dict, Any, List, Iterator
from functools import lru_cache
from dataclasses import dataclass
from google.cloud import bigquery
from google.cloud.bigquery import QueryJobConfig

from src.app.config import settings
from src.core.engine.bq_client import BigQueryClient, get_bigquery_client

logger = logging.getLogger(__name__)


@dataclass
class OrgTierLimits:
    """Resource limits per subscription tier."""
    max_concurrent_queries: int
    query_timeout_seconds: int
    max_bytes_billed: int  # In bytes, 0 = unlimited
    priority: str  # INTERACTIVE or BATCH


# Tier-based limits
TIER_LIMITS = {
    "STARTER": OrgTierLimits(
        max_concurrent_queries=2,
        query_timeout_seconds=60,
        max_bytes_billed=10 * 1024 * 1024 * 1024,  # 10 GB
        priority="BATCH"
    ),
    "PROFESSIONAL": OrgTierLimits(
        max_concurrent_queries=5,
        query_timeout_seconds=180,
        max_bytes_billed=100 * 1024 * 1024 * 1024,  # 100 GB
        priority="INTERACTIVE"
    ),
    "SCALE": OrgTierLimits(
        max_concurrent_queries=10,
        query_timeout_seconds=300,
        max_bytes_billed=0,  # Unlimited
        priority="INTERACTIVE"
    ),
    "ENTERPRISE": OrgTierLimits(
        max_concurrent_queries=20,
        query_timeout_seconds=600,
        max_bytes_billed=0,  # Unlimited
        priority="INTERACTIVE"
    ),
}


class OrgQueryTracker:
    """
    Tracks concurrent queries per organization.

    Provides noisy neighbor protection by limiting concurrent queries
    per org based on their subscription tier.
    """

    def __init__(self):
        self._concurrent_queries: Dict[str, int] = {}
        self._lock = threading.Lock()

    def acquire(self, org_slug: str, max_concurrent: int) -> bool:
        """
        Try to acquire a query slot for an org.

        Returns True if acquired, False if at limit.
        """
        with self._lock:
            current = self._concurrent_queries.get(org_slug, 0)
            if current >= max_concurrent:
                return False
            self._concurrent_queries[org_slug] = current + 1
            return True

    def release(self, org_slug: str) -> None:
        """Release a query slot for an org."""
        with self._lock:
            current = self._concurrent_queries.get(org_slug, 0)
            if current > 0:
                self._concurrent_queries[org_slug] = current - 1

    def get_count(self, org_slug: str) -> int:
        """Get current concurrent query count for an org."""
        with self._lock:
            return self._concurrent_queries.get(org_slug, 0)


# Global query tracker
_query_tracker = OrgQueryTracker()


class OrgBigQueryClient:
    """
    Per-organization BigQuery client wrapper.

    Provides:
    - Tier-based query limits and timeouts
    - Concurrent query limiting (noisy neighbor protection)
    - Cost tracking per query
    - Automatic resource cleanup
    """

    def __init__(
        self,
        org_slug: str,
        tier: str = "STARTER",
        user_id: Optional[str] = None,
        api_key_id: Optional[str] = None
    ):
        """
        Initialize org-specific BigQuery client.

        Args:
            org_slug: Organization identifier
            tier: Subscription tier (STARTER, PROFESSIONAL, SCALE, ENTERPRISE)
            user_id: User making the request (for audit)
            api_key_id: API key used (for audit)
        """
        self.org_slug = org_slug
        self.tier = tier.upper()
        self.user_id = user_id
        self.api_key_id = api_key_id
        self.limits = TIER_LIMITS.get(self.tier, TIER_LIMITS["STARTER"])
        self._base_client = get_bigquery_client()

    @property
    def client(self) -> bigquery.Client:
        """Get the underlying BigQuery client."""
        return self._base_client.client

    def _determine_query_timeout(self, query: str, timeout_seconds: Optional[int] = None) -> int:
        """
        Determine smart timeout for query based on complexity and tier limits.

        Priority:
        1. Explicit timeout_seconds parameter (from pipeline config)
        2. Smart defaults based on query complexity:
           - Simple SELECT (< 100 chars): min(30s, tier_limit)
           - INSERT/UPDATE/DELETE: min(60s, tier_limit)
           - Complex queries (JOINs, aggregations): min(120s, tier_limit)
        3. Tier-based timeout limit as maximum

        Args:
            query: SQL query string
            timeout_seconds: Optional explicit timeout from pipeline config

        Returns:
            Timeout in seconds (capped by tier limit)
        """
        # If timeout explicitly provided (from pipeline config), cap at tier limit
        if timeout_seconds is not None:
            return min(timeout_seconds, self.limits.query_timeout_seconds)

        # Otherwise, use smart defaults based on query complexity
        query_upper = query.upper().strip()

        # Simple SELECT queries (< 100 chars, no JOINs or aggregations)
        if len(query) < 100 and query_upper.startswith('SELECT') and \
           'JOIN' not in query_upper and 'GROUP BY' not in query_upper:
            smart_timeout = 30  # 30 seconds for simple queries

        # INSERT/UPDATE/DELETE operations
        elif any(query_upper.startswith(op) for op in ['INSERT', 'UPDATE', 'DELETE', 'MERGE']):
            smart_timeout = 60  # 60 seconds for write operations

        # Complex queries (JOINs, GROUP BY, window functions, CTEs)
        elif any(keyword in query_upper for keyword in ['JOIN', 'GROUP BY', 'OVER(', 'WITH ']):
            smart_timeout = 120  # 120 seconds for complex queries

        else:
            # Default to tier limit for other cases
            smart_timeout = self.limits.query_timeout_seconds

        # Cap at tier limit
        return min(smart_timeout, self.limits.query_timeout_seconds)

    def _track_cost(
        self,
        query_job: bigquery.QueryJob,
        query: str
    ) -> None:
        """
        Track query cost for billing.

        Inserts a record to org_cost_tracking table.
        """
        try:
            bytes_processed = query_job.total_bytes_processed or 0
            bytes_billed = query_job.total_bytes_billed or 0
            duration_ms = int((query_job.ended - query_job.started).total_seconds() * 1000) if query_job.ended and query_job.started else 0

            # Estimate cost: $5 per TB processed (BigQuery on-demand pricing)
            estimated_cost = (bytes_billed / (1024 ** 4)) * 5.0

            # Insert cost tracking record
            insert_query = f"""
            INSERT INTO `{settings.gcp_project_id}.organizations.org_cost_tracking`
            (cost_id, org_slug, usage_date, resource_type, provider, pipeline_id,
             quantity, unit, bytes_processed, bytes_billed, duration_ms,
             estimated_cost_usd, created_at)
            VALUES (
                GENERATE_UUID(),
                @org_slug,
                CURRENT_DATE(),
                'BQ_QUERY',
                'GCP',
                NULL,
                1,
                'COUNT',
                @bytes_processed,
                @bytes_billed,
                @duration_ms,
                @estimated_cost,
                CURRENT_TIMESTAMP()
            )
            """

            job_config = QueryJobConfig(
                query_parameters=[
                    bigquery.ScalarQueryParameter("org_slug", "STRING", self.org_slug),
                    bigquery.ScalarQueryParameter("bytes_processed", "INT64", bytes_processed),
                    bigquery.ScalarQueryParameter("bytes_billed", "INT64", bytes_billed),
                    bigquery.ScalarQueryParameter("duration_ms", "INT64", duration_ms),
                    bigquery.ScalarQueryParameter("estimated_cost", "FLOAT64", estimated_cost),
                ]
            )

            self.client.query(insert_query, job_config=job_config)

            logger.debug(
                f"Tracked query cost",
                extra={
                    "org_slug": self.org_slug,
                    "bytes_billed": bytes_billed,
                    "estimated_cost_usd": estimated_cost
                }
            )

        except Exception as e:
            logger.warning(f"Failed to track query cost: {e}")

    def query(
        self,
        query: str,
        parameters: Optional[List[Any]] = None,
        track_cost: bool = True,
        timeout_seconds: Optional[int] = None
    ) -> Iterator[Dict[str, Any]]:
        """
        Execute a query with org-specific limits and tracking.

        Timeout Handling:
        - Respects timeout_seconds from pipeline config (step_config.get("timeout_minutes") * 60)
        - Falls back to smart defaults based on query complexity if not specified
        - Simple SELECTs: 30s, INSERT/UPDATE/DELETE: 60s, Complex queries: 120s
        - All timeouts are capped by tier limit (STARTER: 60s, PROFESSIONAL: 180s, etc.)

        Args:
            query: SQL query string
            parameters: Query parameters
            track_cost: Whether to track cost (default True)
            timeout_seconds: Optional timeout in seconds (from pipeline config)

        Yields:
            Row dictionaries

        Raises:
            ResourceExhaustedError: If org is at concurrent query limit
            TimeoutError: If query exceeds tier timeout
        """
        # Check concurrent query limit
        if not _query_tracker.acquire(self.org_slug, self.limits.max_concurrent_queries):
            current = _query_tracker.get_count(self.org_slug)
            raise ResourceExhaustedError(
                f"Concurrent query limit reached for org {self.org_slug}. "
                f"Current: {current}, Limit: {self.limits.max_concurrent_queries}"
            )

        try:
            # Build job config with tier-specific settings
            job_config = QueryJobConfig()

            if parameters:
                job_config.query_parameters = parameters

            # Set max bytes billed (cost protection)
            if self.limits.max_bytes_billed > 0:
                job_config.maximum_bytes_billed = self.limits.max_bytes_billed

            # Set priority
            job_config.priority = (
                bigquery.QueryPriority.INTERACTIVE
                if self.limits.priority == "INTERACTIVE"
                else bigquery.QueryPriority.BATCH
            )

            # Add labels for tracking
            job_config.labels = {
                "org_slug": self.org_slug.replace("_", "-")[:63],
                "tier": self.tier.lower(),
                "user_id": (self.user_id or "unknown")[:63],
            }

            # Execute query
            query_job = self.client.query(query, job_config=job_config)

            # Determine timeout using smart defaults (capped by tier limit)
            timeout = self._determine_query_timeout(query, timeout_seconds)

            # Wait with timeout
            results = query_job.result(timeout=timeout)

            # Track cost after successful execution
            if track_cost:
                self._track_cost(query_job, query)

            logger.info(
                f"Query executed",
                extra={
                    "org_slug": self.org_slug,
                    "tier": self.tier,
                    "bytes_processed": query_job.total_bytes_processed,
                    "cache_hit": query_job.cache_hit
                }
            )

            # Yield rows
            for row in results:
                yield dict(row)

        finally:
            # Always release the query slot
            _query_tracker.release(self.org_slug)

    def query_to_list(
        self,
        query: str,
        parameters: Optional[List[Any]] = None,
        timeout_seconds: Optional[int] = None
    ) -> List[Dict[str, Any]]:
        """
        Execute query and return all results as list.

        Args:
            query: SQL query string
            parameters: Query parameters
            timeout_seconds: Optional timeout in seconds (from pipeline config)

        Returns:
            List of row dictionaries
        """
        return list(self.query(query, parameters, timeout_seconds=timeout_seconds))


class ResourceExhaustedError(Exception):
    """Raised when org has exhausted their resource quota."""
    pass


def get_org_bq_client(
    org_slug: str,
    tier: str = "STARTER",
    user_id: Optional[str] = None,
    api_key_id: Optional[str] = None
) -> OrgBigQueryClient:
    """
    Get an org-specific BigQuery client.

    Args:
        org_slug: Organization identifier
        tier: Subscription tier
        user_id: User making the request
        api_key_id: API key used

    Returns:
        OrgBigQueryClient instance
    """
    return OrgBigQueryClient(
        org_slug=org_slug,
        tier=tier,
        user_id=user_id,
        api_key_id=api_key_id
    )
