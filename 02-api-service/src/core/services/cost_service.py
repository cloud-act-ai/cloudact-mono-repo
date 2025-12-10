"""
Polars-Powered Cost Service

High-performance, read-only cost data service using Polars DataFrames.
Designed for multi-tenant architecture with aggressive caching for
millions of requests per second throughput.

Features:
- Polars lazy evaluation for optimal query performance
- LRU cache with TTL for hot data
- Multi-tenant isolation via org_slug
- Zero-copy data sharing via Arrow format
- Async-safe design
"""

import polars as pl
import logging
import asyncio
import re
from datetime import datetime, date, timedelta
from typing import Optional, Dict, Any, List, Tuple
from dataclasses import dataclass, field
from functools import lru_cache
from collections import OrderedDict
import threading
import time
import hashlib
import json

from google.cloud import bigquery
from src.core.engine.bq_client import get_bigquery_client
from src.app.config import settings

logger = logging.getLogger(__name__)


# ==============================================================================
# Multi-Tenancy Security
# ==============================================================================

# Valid org_slug pattern: alphanumeric + underscore only, 3-50 chars
# This prevents SQL injection via org_slug manipulation
ORG_SLUG_PATTERN = re.compile(r'^[a-zA-Z0-9_]{3,50}$')


def validate_org_slug(org_slug: str) -> str:
    """
    Validate and sanitize org_slug to prevent SQL injection.

    Args:
        org_slug: Organization identifier to validate

    Returns:
        Validated org_slug

    Raises:
        ValueError: If org_slug format is invalid
    """
    if not org_slug or not ORG_SLUG_PATTERN.match(org_slug):
        logger.warning(f"Invalid org_slug format rejected: {org_slug[:50] if org_slug else 'None'}")
        raise ValueError(f"Invalid organization identifier format: {org_slug}")
    return org_slug


# ==============================================================================
# Cache Configuration
# ==============================================================================

@dataclass
class CacheConfig:
    """Cache configuration for cost service."""
    max_size: int = 1000  # Max entries per cache
    ttl_seconds: int = 300  # 5 minute default TTL
    hot_data_ttl_seconds: int = 60  # 1 minute for frequently accessed
    cold_data_ttl_seconds: int = 900  # 15 minutes for historical


@dataclass
class CacheEntry:
    """Single cache entry with TTL tracking."""
    data: pl.DataFrame
    created_at: float
    ttl_seconds: int
    hits: int = 0

    @property
    def is_expired(self) -> bool:
        return time.time() - self.created_at > self.ttl_seconds

    def touch(self) -> None:
        self.hits += 1


class LRUCache:
    """
    Thread-safe LRU cache with TTL support.
    Designed for high-concurrency access patterns.
    """

    def __init__(self, max_size: int = 1000, default_ttl: int = 300):
        self._cache: OrderedDict[str, CacheEntry] = OrderedDict()
        self._lock = threading.RLock()
        self._max_size = max_size
        self._default_ttl = default_ttl
        self._stats = {"hits": 0, "misses": 0, "evictions": 0}

    def get(self, key: str) -> Optional[pl.DataFrame]:
        """Get value from cache, returns None if expired or missing."""
        with self._lock:
            entry = self._cache.get(key)
            if entry is None:
                self._stats["misses"] += 1
                return None

            if entry.is_expired:
                del self._cache[key]
                self._stats["misses"] += 1
                return None

            # Move to end (most recently used)
            self._cache.move_to_end(key)
            entry.touch()
            self._stats["hits"] += 1
            return entry.data

    def set(self, key: str, value: pl.DataFrame, ttl: Optional[int] = None) -> None:
        """Set value in cache with optional custom TTL."""
        with self._lock:
            # Evict if at capacity
            while len(self._cache) >= self._max_size:
                oldest_key = next(iter(self._cache))
                del self._cache[oldest_key]
                self._stats["evictions"] += 1

            self._cache[key] = CacheEntry(
                data=value,
                created_at=time.time(),
                ttl_seconds=ttl or self._default_ttl
            )

    def invalidate(self, key: str) -> bool:
        """Invalidate specific cache entry."""
        with self._lock:
            if key in self._cache:
                del self._cache[key]
                return True
            return False

    def invalidate_prefix(self, prefix: str) -> int:
        """Invalidate all entries with given prefix."""
        with self._lock:
            keys_to_delete = [k for k in self._cache if k.startswith(prefix)]
            for key in keys_to_delete:
                del self._cache[key]
            return len(keys_to_delete)

    def clear(self) -> None:
        """Clear all cache entries."""
        with self._lock:
            self._cache.clear()

    @property
    def stats(self) -> Dict[str, int]:
        """Get cache statistics."""
        with self._lock:
            hit_rate = 0.0
            total = self._stats["hits"] + self._stats["misses"]
            if total > 0:
                hit_rate = self._stats["hits"] / total
            return {
                **self._stats,
                "size": len(self._cache),
                "max_size": self._max_size,
                "hit_rate": round(hit_rate, 4)
            }


# ==============================================================================
# Global Cache Instance
# ==============================================================================

_cost_cache = LRUCache(max_size=1000, default_ttl=300)


def get_cost_cache() -> LRUCache:
    """Get the global cost cache instance."""
    return _cost_cache


# ==============================================================================
# Cost Data Models
# ==============================================================================

@dataclass
class CostQuery:
    """Query parameters for cost data."""
    org_slug: str
    start_date: Optional[date] = None
    end_date: Optional[date] = None
    providers: Optional[List[str]] = None
    service_categories: Optional[List[str]] = None
    group_by: Optional[List[str]] = None
    limit: int = 10000
    offset: int = 0

    def cache_key(self) -> str:
        """Generate unique cache key for this query."""
        key_parts = [
            f"org:{self.org_slug}",
            f"start:{self.start_date}",
            f"end:{self.end_date}",
            f"providers:{sorted(self.providers or [])}",
            f"categories:{sorted(self.service_categories or [])}",
            f"group:{sorted(self.group_by or [])}",
            f"limit:{self.limit}",
            f"offset:{self.offset}"
        ]
        key_str = "|".join(key_parts)
        return hashlib.md5(key_str.encode()).hexdigest()


@dataclass
class CostSummary:
    """Summary statistics for cost data."""
    total_cost: float
    total_records: int
    date_range: Tuple[Optional[date], Optional[date]]
    providers: List[str]
    service_categories: List[str]
    currency: str = "USD"


@dataclass
class CostResponse:
    """Response wrapper for cost data."""
    success: bool
    data: Optional[List[Dict[str, Any]]] = None
    summary: Optional[Dict[str, Any]] = None
    pagination: Optional[Dict[str, int]] = None
    cache_hit: bool = False
    query_time_ms: float = 0.0
    error: Optional[str] = None


# ==============================================================================
# Cost Service Implementation
# ==============================================================================

class PolarsCostService:
    """
    High-performance cost data service using Polars.

    Features:
    - Lazy evaluation for optimal query execution
    - Aggressive caching with multi-level TTL
    - Multi-tenant isolation
    - Zero-copy data via Arrow format
    """

    def __init__(self, cache: Optional[LRUCache] = None):
        self._cache = cache or get_cost_cache()
        self._bq_client = None

    @property
    def bq_client(self):
        """Lazy-load BigQuery client."""
        if self._bq_client is None:
            self._bq_client = get_bigquery_client()
        return self._bq_client

    def _get_dataset_id(self, org_slug: str) -> str:
        """Get BigQuery dataset ID for organization."""
        if settings.environment == "production":
            env_suffix = "prod"
        elif settings.environment in ("development", "local"):
            env_suffix = "local"  # Map both development and local to _local
        else:
            env_suffix = settings.environment
        return f"{org_slug}_{env_suffix}"

    def _build_cost_query(self, query: CostQuery) -> str:
        """
        Build optimized BigQuery SQL for cost data.
        Uses FOCUS 1.2 standard schema (cost_data_standard_1_2).
        """
        dataset_id = self._get_dataset_id(query.org_slug)
        project_id = settings.gcp_project_id
        table_ref = f"`{project_id}.{dataset_id}.cost_data_standard_1_2`"

        # Select essential columns for performance
        columns = [
            "SubAccountId",
            "Provider",
            "ServiceCategory",
            "ServiceName",
            "ResourceName",
            "BilledCost",
            "EffectiveCost",
            "BillingCurrency",
            "ConsumedQuantity",
            "ConsumedUnit",
            "ChargeCategory",
            "ChargeClass",
            "RegionName",
            "BillingPeriodStart",
            "BillingPeriodEnd",
            "ChargePeriodStart",
            "ChargePeriodEnd",
            "UpdatedAt"
        ]

        select_clause = ", ".join(columns)

        # Build WHERE clause
        where_conditions = [f"SubAccountId = '{query.org_slug}'"]

        if query.start_date:
            where_conditions.append(f"ChargePeriodStart >= '{query.start_date}'")

        if query.end_date:
            where_conditions.append(f"ChargePeriodEnd <= '{query.end_date}'")

        if query.providers:
            providers_list = ", ".join(f"'{p}'" for p in query.providers)
            where_conditions.append(f"Provider IN ({providers_list})")

        if query.service_categories:
            categories_list = ", ".join(f"'{c}'" for c in query.service_categories)
            where_conditions.append(f"ServiceCategory IN ({categories_list})")

        where_clause = " AND ".join(where_conditions)

        sql = f"""
        SELECT {select_clause}
        FROM {table_ref}
        WHERE {where_clause}
        ORDER BY ChargePeriodStart DESC
        LIMIT {query.limit}
        OFFSET {query.offset}
        """

        return sql

    def _build_summary_query(self, query: CostQuery) -> str:
        """Build summary aggregation query."""
        dataset_id = self._get_dataset_id(query.org_slug)
        project_id = settings.gcp_project_id
        table_ref = f"`{project_id}.{dataset_id}.cost_data_standard_1_2`"

        where_conditions = [f"SubAccountId = '{query.org_slug}'"]

        if query.start_date:
            where_conditions.append(f"ChargePeriodStart >= '{query.start_date}'")
        if query.end_date:
            where_conditions.append(f"ChargePeriodEnd <= '{query.end_date}'")
        if query.providers:
            providers_list = ", ".join(f"'{p}'" for p in query.providers)
            where_conditions.append(f"Provider IN ({providers_list})")

        where_clause = " AND ".join(where_conditions)

        return f"""
        SELECT
            SUM(CAST(BilledCost AS FLOAT64)) as total_billed_cost,
            SUM(CAST(EffectiveCost AS FLOAT64)) as total_effective_cost,
            COUNT(*) as record_count,
            MIN(ChargePeriodStart) as min_date,
            MAX(ChargePeriodEnd) as max_date,
            ARRAY_AGG(DISTINCT Provider IGNORE NULLS) as providers,
            ARRAY_AGG(DISTINCT ServiceCategory IGNORE NULLS) as service_categories
        FROM {table_ref}
        WHERE {where_clause}
        """

    async def _execute_query(
        self,
        sql: str,
        query_params: Optional[List[bigquery.ScalarQueryParameter]] = None
    ) -> pl.DataFrame:
        """
        Execute BigQuery query and return Polars DataFrame.

        Args:
            sql: SQL query string (can use @param_name for parameterized queries)
            query_params: Optional list of BigQuery query parameters

        Returns:
            Polars DataFrame with query results
        """
        loop = asyncio.get_event_loop()

        def run_query():
            # Build job config with parameters if provided
            job_config = None
            if query_params:
                job_config = bigquery.QueryJobConfig(
                    query_parameters=query_params,
                    job_timeout_ms=30000  # 30 second timeout for cost queries
                )

            job = self.bq_client.client.query(sql, job_config=job_config)
            result = job.result()
            # Convert to Arrow for zero-copy transfer to Polars
            arrow_table = result.to_arrow()
            return pl.from_arrow(arrow_table)

        return await loop.run_in_executor(None, run_query)

    async def get_costs(self, query: CostQuery) -> CostResponse:
        """
        Get cost data for organization with caching.

        Args:
            query: CostQuery with filter parameters

        Returns:
            CostResponse with data and summary
        """
        start_time = time.time()
        cache_key = f"costs:{query.cache_key()}"

        # Check cache
        cached_df = self._cache.get(cache_key)
        if cached_df is not None:
            query_time = (time.time() - start_time) * 1000
            return CostResponse(
                success=True,
                data=cached_df.to_dicts(),
                pagination={
                    "limit": query.limit,
                    "offset": query.offset,
                    "total": len(cached_df)
                },
                cache_hit=True,
                query_time_ms=round(query_time, 2)
            )

        try:
            # Build and execute query
            sql = self._build_cost_query(query)
            logger.debug(f"Executing cost query for {query.org_slug}")

            df = await self._execute_query(sql)

            # Cache result
            # Use shorter TTL for recent data
            ttl = 60 if query.end_date and query.end_date >= date.today() - timedelta(days=1) else 300
            self._cache.set(cache_key, df, ttl=ttl)

            query_time = (time.time() - start_time) * 1000

            return CostResponse(
                success=True,
                data=df.to_dicts(),
                pagination={
                    "limit": query.limit,
                    "offset": query.offset,
                    "total": len(df)
                },
                cache_hit=False,
                query_time_ms=round(query_time, 2)
            )

        except Exception as e:
            logger.error(f"Cost query failed for {query.org_slug}: {e}")
            query_time = (time.time() - start_time) * 1000
            return CostResponse(
                success=False,
                error=str(e),
                query_time_ms=round(query_time, 2)
            )

    async def get_cost_summary(self, query: CostQuery) -> CostResponse:
        """
        Get aggregated cost summary for organization.

        Args:
            query: CostQuery with filter parameters

        Returns:
            CostResponse with summary statistics
        """
        start_time = time.time()
        cache_key = f"summary:{query.cache_key()}"

        # Check cache
        cached_df = self._cache.get(cache_key)
        if cached_df is not None:
            query_time = (time.time() - start_time) * 1000
            summary = cached_df.to_dicts()[0] if len(cached_df) > 0 else {}
            return CostResponse(
                success=True,
                summary=summary,
                cache_hit=True,
                query_time_ms=round(query_time, 2)
            )

        try:
            sql = self._build_summary_query(query)
            df = await self._execute_query(sql)

            # Cache with longer TTL for summaries
            self._cache.set(cache_key, df, ttl=300)

            query_time = (time.time() - start_time) * 1000
            summary = df.to_dicts()[0] if len(df) > 0 else {}

            return CostResponse(
                success=True,
                summary=summary,
                cache_hit=False,
                query_time_ms=round(query_time, 2)
            )

        except Exception as e:
            logger.error(f"Cost summary query failed for {query.org_slug}: {e}")
            query_time = (time.time() - start_time) * 1000
            return CostResponse(
                success=False,
                error=str(e),
                query_time_ms=round(query_time, 2)
            )

    async def get_cost_by_provider(self, org_slug: str, start_date: Optional[date] = None, end_date: Optional[date] = None) -> CostResponse:
        """Get cost breakdown by provider."""
        start_time = time.time()
        cache_key = f"by_provider:{org_slug}:{start_date}:{end_date}"

        cached_df = self._cache.get(cache_key)
        if cached_df is not None:
            query_time = (time.time() - start_time) * 1000
            return CostResponse(
                success=True,
                data=cached_df.to_dicts(),
                cache_hit=True,
                query_time_ms=round(query_time, 2)
            )

        try:
            dataset_id = self._get_dataset_id(org_slug)
            project_id = settings.gcp_project_id
            table_ref = f"`{project_id}.{dataset_id}.cost_data_standard_1_2`"

            where_conditions = [f"SubAccountId = '{org_slug}'"]
            if start_date:
                where_conditions.append(f"ChargePeriodStart >= '{start_date}'")
            if end_date:
                where_conditions.append(f"ChargePeriodEnd <= '{end_date}'")

            where_clause = " AND ".join(where_conditions)

            sql = f"""
            SELECT
                Provider,
                SUM(CAST(BilledCost AS FLOAT64)) as total_billed_cost,
                SUM(CAST(EffectiveCost AS FLOAT64)) as total_effective_cost,
                COUNT(*) as record_count,
                ARRAY_AGG(DISTINCT ServiceCategory IGNORE NULLS) as service_categories
            FROM {table_ref}
            WHERE {where_clause}
            GROUP BY Provider
            ORDER BY total_billed_cost DESC
            """

            df = await self._execute_query(sql)
            self._cache.set(cache_key, df, ttl=300)

            query_time = (time.time() - start_time) * 1000
            return CostResponse(
                success=True,
                data=df.to_dicts(),
                cache_hit=False,
                query_time_ms=round(query_time, 2)
            )

        except Exception as e:
            logger.error(f"Cost by provider query failed for {org_slug}: {e}")
            query_time = (time.time() - start_time) * 1000
            return CostResponse(
                success=False,
                error=str(e),
                query_time_ms=round(query_time, 2)
            )

    async def get_cost_by_service(self, org_slug: str, start_date: Optional[date] = None, end_date: Optional[date] = None) -> CostResponse:
        """Get cost breakdown by service category."""
        start_time = time.time()
        cache_key = f"by_service:{org_slug}:{start_date}:{end_date}"

        cached_df = self._cache.get(cache_key)
        if cached_df is not None:
            query_time = (time.time() - start_time) * 1000
            return CostResponse(
                success=True,
                data=cached_df.to_dicts(),
                cache_hit=True,
                query_time_ms=round(query_time, 2)
            )

        try:
            dataset_id = self._get_dataset_id(org_slug)
            project_id = settings.gcp_project_id
            table_ref = f"`{project_id}.{dataset_id}.cost_data_standard_1_2`"

            where_conditions = [f"SubAccountId = '{org_slug}'"]
            if start_date:
                where_conditions.append(f"ChargePeriodStart >= '{start_date}'")
            if end_date:
                where_conditions.append(f"ChargePeriodEnd <= '{end_date}'")

            where_clause = " AND ".join(where_conditions)

            sql = f"""
            SELECT
                ServiceCategory,
                ServiceName,
                Provider,
                SUM(CAST(BilledCost AS FLOAT64)) as total_billed_cost,
                SUM(CAST(EffectiveCost AS FLOAT64)) as total_effective_cost,
                COUNT(*) as record_count
            FROM {table_ref}
            WHERE {where_clause}
            GROUP BY ServiceCategory, ServiceName, Provider
            ORDER BY total_billed_cost DESC
            LIMIT 100
            """

            df = await self._execute_query(sql)
            self._cache.set(cache_key, df, ttl=300)

            query_time = (time.time() - start_time) * 1000
            return CostResponse(
                success=True,
                data=df.to_dicts(),
                cache_hit=False,
                query_time_ms=round(query_time, 2)
            )

        except Exception as e:
            logger.error(f"Cost by service query failed for {org_slug}: {e}")
            query_time = (time.time() - start_time) * 1000
            return CostResponse(
                success=False,
                error=str(e),
                query_time_ms=round(query_time, 2)
            )

    async def get_cost_trend(self, org_slug: str, granularity: str = "daily", days: int = 30) -> CostResponse:
        """
        Get cost trend over time.

        Args:
            org_slug: Organization identifier
            granularity: "daily", "weekly", or "monthly"
            days: Number of days to look back
        """
        start_time = time.time()
        cache_key = f"trend:{org_slug}:{granularity}:{days}"

        cached_df = self._cache.get(cache_key)
        if cached_df is not None:
            query_time = (time.time() - start_time) * 1000
            return CostResponse(
                success=True,
                data=cached_df.to_dicts(),
                cache_hit=True,
                query_time_ms=round(query_time, 2)
            )

        try:
            dataset_id = self._get_dataset_id(org_slug)
            project_id = settings.gcp_project_id
            table_ref = f"`{project_id}.{dataset_id}.cost_data_standard_1_2`"

            # Date truncation based on granularity
            if granularity == "weekly":
                date_trunc = "DATE_TRUNC(ChargePeriodStart, WEEK)"
            elif granularity == "monthly":
                date_trunc = "DATE_TRUNC(ChargePeriodStart, MONTH)"
            else:  # daily
                date_trunc = "ChargePeriodStart"

            start_date = date.today() - timedelta(days=days)

            sql = f"""
            SELECT
                {date_trunc} as period,
                SUM(CAST(BilledCost AS FLOAT64)) as total_billed_cost,
                SUM(CAST(EffectiveCost AS FLOAT64)) as total_effective_cost,
                COUNT(*) as record_count,
                ARRAY_AGG(DISTINCT Provider IGNORE NULLS) as providers
            FROM {table_ref}
            WHERE SubAccountId = '{org_slug}'
              AND ChargePeriodStart >= '{start_date}'
            GROUP BY period
            ORDER BY period ASC
            """

            df = await self._execute_query(sql)
            self._cache.set(cache_key, df, ttl=300)

            query_time = (time.time() - start_time) * 1000
            return CostResponse(
                success=True,
                data=df.to_dicts(),
                cache_hit=False,
                query_time_ms=round(query_time, 2)
            )

        except Exception as e:
            logger.error(f"Cost trend query failed for {org_slug}: {e}")
            query_time = (time.time() - start_time) * 1000
            return CostResponse(
                success=False,
                error=str(e),
                query_time_ms=round(query_time, 2)
            )

    def invalidate_org_cache(self, org_slug: str) -> int:
        """Invalidate all cached data for an organization."""
        prefixes = [
            f"costs:{org_slug}",
            f"summary:{org_slug}",
            f"by_provider:{org_slug}",
            f"by_service:{org_slug}",
            f"trend:{org_slug}"
        ]
        total_invalidated = 0
        for prefix in prefixes:
            total_invalidated += self._cache.invalidate_prefix(prefix)
        return total_invalidated

    def get_cache_stats(self) -> Dict[str, Any]:
        """Get cache statistics."""
        return self._cache.stats

    async def get_saas_subscription_costs(
        self,
        org_slug: str,
        start_date: Optional[date] = None,
        end_date: Optional[date] = None
    ) -> CostResponse:
        """
        Get SaaS subscription costs from cost_data_standard_1_2.
        Returns monthly run rate and annual projection based on actual daily costs.

        This is the source of truth for subscription costs (from pipeline output).

        SECURITY: Uses parameterized queries to prevent SQL injection.
        Multi-tenancy isolation enforced via:
        1. org_slug format validation (alphanumeric + underscore only)
        2. Parameterized WHERE clause with @org_slug
        3. Dataset isolation ({org_slug}_{env})

        Args:
            org_slug: Organization identifier (validated format)
            start_date: Optional start date filter
            end_date: Optional end date filter (defaults to today)
        """
        start_time = time.time()

        # SECURITY: Validate org_slug format to prevent injection
        try:
            org_slug = validate_org_slug(org_slug)
        except ValueError as e:
            return CostResponse(
                success=False,
                error=str(e),
                query_time_ms=round((time.time() - start_time) * 1000, 2)
            )

        # Default to current month if no dates provided
        if end_date is None:
            end_date = date.today()
        if start_date is None:
            # Default to first of current month
            start_date = end_date.replace(day=1)

        cache_key = f"saas_costs:{org_slug}:{start_date}:{end_date}"

        cached_df = self._cache.get(cache_key)
        if cached_df is not None:
            query_time = (time.time() - start_time) * 1000
            data = cached_df.to_dicts()
            total_monthly = sum(row.get('MonthlyRunRate', 0) or 0 for row in data)
            total_annual = sum(row.get('AnnualRunRate', 0) or 0 for row in data)
            total_billed = sum(row.get('BilledCost', 0) or 0 for row in data)
            return CostResponse(
                success=True,
                data=data,
                summary={
                    "total_billed_cost": round(total_billed, 2),
                    "total_monthly_cost": round(total_monthly, 2),
                    "total_annual_cost": round(total_annual, 2),
                    "providers": list(set(row.get('Provider', '') for row in data if row.get('Provider'))),
                    "service_categories": list(set(row.get('ServiceCategory', '') for row in data if row.get('ServiceCategory'))),
                    "record_count": len(data),
                    "date_range": {"start": str(start_date), "end": str(end_date)}
                },
                cache_hit=True,
                query_time_ms=round(query_time, 2)
            )

        try:
            # SECURITY: org_slug is validated above, safe for dataset name construction
            dataset_id = self._get_dataset_id(org_slug)
            project_id = settings.gcp_project_id
            table_ref = f"`{project_id}.{dataset_id}.cost_data_standard_1_2`"

            # SECURITY: Use parameterized query to prevent SQL injection
            # Note: Table names cannot be parameterized in BigQuery, but org_slug is
            # validated above and dataset isolation provides additional protection
            sql = f"""
            SELECT
                -- Identity & Organization
                BillingAccountId,
                BillingAccountName,
                SubAccountId,
                SubAccountName,

                -- Provider & Service (FOCUS 1.2)
                Provider,
                Publisher,
                ServiceCategory,
                ServiceName,
                ServiceSubcategory,

                -- Cost Columns (FOCUS 1.2)
                CAST(BilledCost AS FLOAT64) AS BilledCost,
                CAST(EffectiveCost AS FLOAT64) AS EffectiveCost,
                CAST(ListCost AS FLOAT64) AS ListCost,
                CAST(ContractedCost AS FLOAT64) AS ContractedCost,
                BillingCurrency,

                -- Pricing
                CAST(UnitPrice AS FLOAT64) AS UnitPrice,
                CAST(ListUnitPrice AS FLOAT64) AS ListUnitPrice,
                PricingCategory,
                PricingCurrency,
                CAST(PricingQuantity AS FLOAT64) AS PricingQuantity,
                PricingUnit,

                -- Quantity & Usage
                CAST(ConsumedQuantity AS FLOAT64) AS ConsumedQuantity,
                ConsumedUnit,
                UsageType,

                -- Charge Details
                ChargeCategory,
                ChargeClass,
                ChargeDescription,
                ChargeFrequency,

                -- Resource
                ResourceId,
                ResourceName,
                ResourceType,
                SkuId,

                -- Region
                RegionId,
                RegionName,

                -- Time Periods (FOCUS 1.2)
                BillingPeriodStart,
                BillingPeriodEnd,
                ChargePeriodStart,
                ChargePeriodEnd,

                -- Metadata
                SourceSystem,
                SourceRecordId,
                UpdatedAt,

                -- Calculated Run Rates (convenience columns)
                CAST(BilledCost AS FLOAT64) * 30.44 AS MonthlyRunRate,
                CAST(BilledCost AS FLOAT64) * 365.25 AS AnnualRunRate

            FROM {table_ref}
            WHERE SubAccountId = @org_slug
              AND SourceSystem = @source_system
              AND ChargePeriodStart >= @start_date
              AND ChargePeriodEnd <= @end_date
            ORDER BY BilledCost DESC
            """

            # Build parameterized query parameters
            query_params = [
                bigquery.ScalarQueryParameter("org_slug", "STRING", org_slug),
                bigquery.ScalarQueryParameter("source_system", "STRING", "saas_subscription_costs_daily"),
                bigquery.ScalarQueryParameter("start_date", "DATE", start_date),
                bigquery.ScalarQueryParameter("end_date", "DATE", end_date),
            ]

            df = await self._execute_query(sql, query_params)
            self._cache.set(cache_key, df, ttl=60)  # Short TTL for recent data

            query_time = (time.time() - start_time) * 1000

            # Calculate totals using FOCUS 1.2 column names
            data = df.to_dicts()
            total_monthly = sum(row.get('MonthlyRunRate', 0) or 0 for row in data)
            total_annual = sum(row.get('AnnualRunRate', 0) or 0 for row in data)
            total_billed = sum(row.get('BilledCost', 0) or 0 for row in data)

            return CostResponse(
                success=True,
                data=data,
                summary={
                    "total_billed_cost": round(total_billed, 2),
                    "total_monthly_cost": round(total_monthly, 2),
                    "total_annual_cost": round(total_annual, 2),
                    "providers": list(set(row.get('Provider', '') for row in data if row.get('Provider'))),
                    "service_categories": list(set(row.get('ServiceCategory', '') for row in data if row.get('ServiceCategory'))),
                    "record_count": len(data),
                    "date_range": {
                        "start": str(start_date),
                        "end": str(end_date)
                    }
                },
                cache_hit=False,
                query_time_ms=round(query_time, 2)
            )

        except Exception as e:
            logger.error(f"SaaS subscription costs query failed for {org_slug}: {e}")
            query_time = (time.time() - start_time) * 1000
            return CostResponse(
                success=False,
                error=str(e),
                query_time_ms=round(query_time, 2)
            )


# ==============================================================================
# Singleton Service Instance
# ==============================================================================

_cost_service: Optional[PolarsCostService] = None


def get_cost_service() -> PolarsCostService:
    """Get the singleton cost service instance."""
    global _cost_service
    if _cost_service is None:
        _cost_service = PolarsCostService()
    return _cost_service
