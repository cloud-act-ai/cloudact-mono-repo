"""
Cost Read Service

High-performance, read-only cost data service using Polars DataFrames.
For dashboard reads only - pipeline writes cost data.

Cache Strategy:
- Cost data updates DAILY (pipelines run overnight)
- Cache valid UNTIL MIDNIGHT in org's timezone
- clear_cache=true bypasses cache for fresh BigQuery data

Architecture:
- Frontend: 365-day granularData → all filters client-side (instant)
- Backend: Polars LRU cache → BigQuery (until midnight TTL)
"""

import polars as pl
import logging
import asyncio
import time
import threading
from datetime import date, datetime, timezone
from typing import Optional, List, Dict, Any

from google.cloud import bigquery
from src.core.engine.bq_client import get_bigquery_client
from src.app.config import settings
from src.core.services._shared import (
    LRUCache,
    validate_org_slug,
    create_cache,
    DatePeriod,
    ComparisonType,
    get_comparison_ranges,
    get_seconds_until_midnight,
)
from src.core.services.cost_read.models import CostQuery, CostResponse

# Import lib/costs/ functions for Polars aggregations
from src.lib.costs import (
    # Aggregations
    aggregate_by_provider,
    aggregate_by_service,
    aggregate_by_category,
    aggregate_by_date,
    aggregate_by_hierarchy,
    aggregate_granular,
    # Calculations
    calculate_forecasts,
    calculate_percentage_change,
    get_date_info,
    # Filters
    filter_date_range,
    filter_providers,
    filter_categories,
    filter_hierarchy,
    CostFilterParams,
    apply_cost_filters,
)

logger = logging.getLogger(__name__)

# TTL Constants
TTL_TODAY_DATA = 60  # 60 seconds for today's data (pipeline might still run)


def _get_cache_ttl(includes_today: bool, timezone: str = "UTC") -> int:
    """
    Get cache TTL - until midnight in specified timezone.

    Cost data updates DAILY (pipelines run overnight), so cache is valid
    until midnight when new data arrives.

    Args:
        includes_today: True if data includes today's date
        timezone: IANA timezone (default UTC, can be org's timezone)

    Returns:
        TTL in seconds (min 60s to avoid edge cases)
    """
    if includes_today:
        return TTL_TODAY_DATA  # 60s if today's data might still be updating
    return get_seconds_until_midnight(timezone)


def _safe_unique_list(df: pl.DataFrame, column: str) -> List[str]:
    """Get unique non-null values from a column as a list."""
    if column not in df.columns or df.is_empty():
        return []
    return [v for v in df[column].unique().to_list() if v is not None]


class CostReadService:
    """
    High-performance cost data service using Polars + lib/costs/.

    READ-ONLY service for dashboard cost analytics.
    Cost data is written by Pipeline Service (8001).

    Features:
    - Lazy evaluation for optimal query execution
    - Two-level caching:
      - L1: Raw DataFrames
      - L2: Pre-computed aggregations
    - TTL: Until midnight in org's timezone (cost data updates daily)
    - Multi-tenant isolation via org_slug
    """

    def __init__(self, cache: Optional[LRUCache] = None, agg_cache: Optional[LRUCache] = None):
        # Polars LRU Cache: DataFrames from BigQuery
        # TTL is dynamic - calculated per-org based on timezone (until midnight)
        self._cache = cache or create_cache(
            "COST_L1",
            max_size=50,
            default_ttl=86400,  # 24h default (overridden per-org)
            max_memory_mb=512
        )
        # Aggregation cache for pre-computed results
        self._agg_cache = agg_cache or create_cache(
            "COST_L2",
            max_size=200,
            default_ttl=86400,  # 24h default (overridden per request)
            max_memory_mb=128
        )
        self._bq_client = None
        self._project_id = settings.gcp_project_id

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
            env_suffix = "local"
        else:
            env_suffix = settings.environment
        return f"{org_slug}_{env_suffix}"

    async def _execute_query(
        self,
        sql: str,
        query_params: Optional[List[bigquery.ScalarQueryParameter]] = None
    ) -> pl.DataFrame:
        """Execute BigQuery query and return Polars DataFrame."""
        loop = asyncio.get_event_loop()

        def run_query():
            job_config = bigquery.QueryJobConfig(job_timeout_ms=30000)
            if query_params:
                job_config.query_parameters = query_params

            job = self.bq_client.client.query(sql, job_config=job_config)
            result = job.result()
            arrow_table = result.to_arrow()
            return pl.from_arrow(arrow_table)

        return await loop.run_in_executor(None, run_query)

    async def _fetch_cost_data(
        self,
        query: CostQuery,
        category: Optional[str] = None
    ) -> pl.DataFrame:
        """
        Fetch raw cost data from BigQuery.

        Uses resolve_dates() to handle period/fiscal_year/custom dates.
        Category filtering is pushed to SQL WHERE for efficiency.
        Returns raw DataFrame for Polars aggregations.

        Args:
            query: CostQuery with org_slug and date range
            category: Optional category filter ("genai", "cloud", "subscription")
                     When provided, filtering happens in SQL (more efficient)
        """
        # MT-009: Validate org_slug is present and valid before any query execution
        if not query.org_slug:
            raise ValueError("org_slug is required for cost queries")
        validate_org_slug(query.org_slug)
        dataset_id = self._get_dataset_id(query.org_slug)
        # MT-009: Ensure dataset_id contains the org_slug (defensive check)
        if query.org_slug not in dataset_id:
            raise ValueError(f"Dataset isolation error: org_slug '{query.org_slug}' not in dataset '{dataset_id}'")
        table_ref = f"`{self._project_id}.{dataset_id}.cost_data_standard_1_3`"

        # Resolve dates (handles period, fiscal_year, or custom dates)
        resolved_start, resolved_end = query.resolve_dates()

        # Build parameterized query
        # Note: Multi-tenancy is enforced via dataset isolation ({org_slug}_{env})
        # SubAccountId contains cloud account IDs (AWS account, Azure subscription, etc.)
        # NOT org_slug, so we don't filter by it here
        where_conditions = []
        query_params = []

        # Date filters always applied
        where_conditions.append("DATE(ChargePeriodStart) >= @start_date")
        query_params.append(bigquery.ScalarQueryParameter("start_date", "DATE", resolved_start))

        where_conditions.append("DATE(ChargePeriodStart) <= @end_date")
        query_params.append(bigquery.ScalarQueryParameter("end_date", "DATE", resolved_end))

        # Optional provider filter
        if query.providers:
            where_conditions.append("ServiceProviderName IN UNNEST(@providers)")
            query_params.append(bigquery.ArrayQueryParameter("providers", "STRING", query.providers))

        # Optional category filter (ServiceCategory from data)
        if query.service_categories:
            where_conditions.append("ServiceCategory IN UNNEST(@service_categories)")
            query_params.append(bigquery.ArrayQueryParameter("service_categories", "STRING", query.service_categories))

        # Push category filter to SQL WHERE for efficiency
        # This reduces data transfer from BigQuery significantly
        if category:
            category_lower = category.lower()
            if category_lower in ("subscription", "saas"):
                # Filter to Subscription source system
                where_conditions.append("x_source_system = 'subscription_costs_daily'")
            elif category_lower == "cloud":
                # Filter to cloud providers (case-insensitive)
                cloud_providers = ["gcp", "aws", "azure", "google", "amazon", "microsoft", "oci", "oracle"]
                where_conditions.append(
                    "(LOWER(ServiceProviderName) IN UNNEST(@cloud_providers) OR "
                    "LOWER(x_source_system) LIKE '%cloud%' OR "
                    "LOWER(x_source_system) LIKE '%gcp%' OR "
                    "LOWER(x_source_system) LIKE '%aws%' OR "
                    "LOWER(x_source_system) LIKE '%azure%')"
                )
                query_params.append(bigquery.ArrayQueryParameter("cloud_providers", "STRING", cloud_providers))
            elif category_lower == "genai":
                # Filter to GenAI providers (case-insensitive)
                genai_providers = ["openai", "anthropic", "google ai", "cohere", "mistral", "gemini", "claude", "azure openai", "aws bedrock", "vertex ai"]
                where_conditions.append(
                    "((LOWER(ServiceProviderName) IN UNNEST(@genai_providers) OR "
                    "LOWER(ServiceCategory) IN ('genai', 'llm', 'ai and machine learning') OR "
                    "LOWER(x_source_system) LIKE '%genai%' OR "
                    "LOWER(x_source_system) LIKE '%llm%') AND "
                    "x_source_system != 'subscription_costs_daily')"
                )
                query_params.append(bigquery.ArrayQueryParameter("genai_providers", "STRING", genai_providers))

        # N-level hierarchy filters (NEW - v16.0+)
        # Use hierarchy_entity_id for exact match OR hierarchy_path for parent/child matching
        if query.department_id:  # Level 1
            where_conditions.append("(hierarchy_entity_id = @department_id OR hierarchy_path LIKE @department_path)")
            query_params.append(bigquery.ScalarQueryParameter("department_id", "STRING", query.department_id))
            query_params.append(bigquery.ScalarQueryParameter("department_path", "STRING", f"%/{query.department_id}/%"))

        if query.project_id:  # Level 2
            where_conditions.append("(hierarchy_entity_id = @project_id OR hierarchy_path LIKE @project_path)")
            query_params.append(bigquery.ScalarQueryParameter("project_id", "STRING", query.project_id))
            query_params.append(bigquery.ScalarQueryParameter("project_path", "STRING", f"%/{query.project_id}/%"))

        if query.team_id:  # Level 3
            where_conditions.append("(hierarchy_entity_id = @team_id OR hierarchy_path LIKE @team_path)")
            query_params.append(bigquery.ScalarQueryParameter("team_id", "STRING", query.team_id))
            query_params.append(bigquery.ScalarQueryParameter("team_path", "STRING", f"%/{query.team_id}/%"))

        # Generic entity filter (any hierarchy level)
        if query.hierarchy_entity_id:
            where_conditions.append("(hierarchy_entity_id = @hierarchy_entity_id OR hierarchy_path LIKE @entity_path)")
            query_params.append(bigquery.ScalarQueryParameter("hierarchy_entity_id", "STRING", query.hierarchy_entity_id))
            query_params.append(bigquery.ScalarQueryParameter("entity_path", "STRING", f"%/{query.hierarchy_entity_id}/%"))

        # Path filter for parent/child relationships
        if query.hierarchy_path:
            where_conditions.append("hierarchy_path LIKE @hierarchy_path_prefix")
            query_params.append(bigquery.ScalarQueryParameter("hierarchy_path_prefix", "STRING", f"{query.hierarchy_path}%"))

        where_clause = " AND ".join(where_conditions)

        sql = f"""
        SELECT
            SubAccountId,
            ServiceProviderName,
            ServiceCategory,
            ServiceName,
            ResourceName,
            CAST(BilledCost AS FLOAT64) as BilledCost,
            CAST(EffectiveCost AS FLOAT64) as EffectiveCost,
            BillingCurrency,
            CAST(ConsumedQuantity AS FLOAT64) as ConsumedQuantity,
            ConsumedUnit,
            ChargeCategory,
            ChargeClass,
            RegionName,
            BillingPeriodStart,
            BillingPeriodEnd,
            DATE(ChargePeriodStart) as ChargePeriodStart,
            DATE(ChargePeriodEnd) as ChargePeriodEnd,
            x_source_system,
            hierarchy_entity_id,
            hierarchy_entity_name,
            hierarchy_level_code,
            hierarchy_path,
            hierarchy_path_names
        FROM {table_ref}
        WHERE {where_clause}
        ORDER BY ChargePeriodStart DESC
        """

        return await self._execute_query(sql, query_params)

    def _filter_by_category(
        self,
        df: pl.DataFrame,
        category: Optional[str]
    ) -> pl.DataFrame:
        """
        Filter DataFrame by cost category (genai, cloud, subscription).

        Uses same filtering logic as get_genai_costs, get_cloud_costs,
        get_subscription_costs for consistency.
        """
        if not category or df.is_empty():
            return df

        category_lower = category.lower()

        if category_lower in ("subscription", "saas"):
            # Filter to Subscription source system
            if "x_source_system" in df.columns:
                df = df.filter(
                    pl.col("x_source_system").fill_null("").eq("subscription_costs_daily")
                )

        elif category_lower == "cloud":
            # Filter to cloud providers
            cloud_providers = ["gcp", "aws", "azure", "google", "amazon", "microsoft", "oci", "oracle"]
            if "ServiceProviderName" in df.columns:
                provider_match = pl.col("ServiceProviderName").fill_null("").str.to_lowercase().is_in(cloud_providers)
                source_match = pl.col("x_source_system").fill_null("").str.to_lowercase().str.contains("cloud|gcp|aws|azure|oci")
                df = df.filter(provider_match | source_match)

        elif category_lower == "genai":
            # Filter to GenAI providers
            genai_providers = ["openai", "anthropic", "google", "google ai", "cohere", "mistral", "gemini", "claude", "azure openai", "aws bedrock", "vertex ai"]
            if "ServiceProviderName" in df.columns and "ServiceCategory" in df.columns:
                provider_match = pl.col("ServiceProviderName").fill_null("").str.to_lowercase().is_in(genai_providers)
                category_match = pl.col("ServiceCategory").fill_null("").str.to_lowercase().is_in(["genai", "llm", "ai and machine learning"])
                source_match = pl.col("x_source_system").fill_null("").str.to_lowercase().str.contains("genai|llm|openai|anthropic|gemini")
                not_saas = pl.col("x_source_system").fill_null("").ne("subscription_costs_daily")
                df = df.filter((provider_match | category_match | source_match) & not_saas)

        return df

    # ==========================================================================
    # Core Methods (using CostQuery + lib/costs/)
    # ==========================================================================

    async def get_costs(self, query: CostQuery) -> CostResponse:
        """Get cost data for organization with caching."""
        start_time = time.time()
        cache_key = f"costs:{query.cache_key()}"

        cached_df = self._cache.get(cache_key)
        if cached_df is not None and hasattr(cached_df, 'slice'):
            query_time = (time.time() - start_time) * 1000
            # SCALE-001: Use slice() for proper pagination (offset + limit)
            data = cached_df.slice(query.offset, query.limit).to_dicts()
            return CostResponse(
                success=True,
                data=data,
                pagination={"limit": query.limit, "offset": query.offset, "total": len(cached_df)},
                cache_hit=True,
                query_time_ms=round(query_time, 2)
            )

        try:
            df = await self._fetch_cost_data(query)

            # Cache with appropriate TTL
            # - Today's data: 60s (pipeline might still run)
            # - Historical data: Until midnight UTC (daily data won't change)
            resolved_start, resolved_end = query.resolve_dates()
            date_info = get_date_info()
            ttl = _get_cache_ttl(includes_today=resolved_end >= date_info.today)
            self._cache.set(cache_key, df, ttl=ttl)

            query_time = (time.time() - start_time) * 1000
            data = df.slice(query.offset, query.limit).to_dicts()

            return CostResponse(
                success=True,
                data=data,
                pagination={"limit": query.limit, "offset": query.offset, "total": len(df)},
                cache_hit=False,
                query_time_ms=round(query_time, 2)
            )

        except Exception as e:
            logger.error(f"Cost query failed for {query.org_slug}: {e}")
            return CostResponse(
                success=False,
                error=str(e),
                query_time_ms=(time.time() - start_time) * 1000
            )

    async def get_cost_summary(self, query: CostQuery) -> CostResponse:
        """Get aggregated cost summary for organization using lib/costs/."""
        start_time = time.time()
        cache_key = f"summary:{query.cache_key()}"

        cached = self._cache.get(cache_key)
        if cached is not None:
            return CostResponse(
                success=True,
                summary=cached,
                cache_hit=True,
                query_time_ms=round((time.time() - start_time) * 1000, 2)
            )

        try:
            df = await self._fetch_cost_data(query)

            if df.is_empty():
                return CostResponse(
                    success=True,
                    summary={"total_cost": 0, "record_count": 0},
                    cache_hit=False,
                    query_time_ms=round((time.time() - start_time) * 1000, 2)
                )

            # Calculate summary using lib/costs/
            total_billed = df["BilledCost"].sum()
            total_effective = df["EffectiveCost"].sum()

            # Filter to current month for MTD
            date_info = get_date_info()
            mtd_df = filter_date_range(
                df,
                start_date=date_info.month_start,
                end_date=date_info.today,
                date_column="ChargePeriodStart"
            )
            mtd_cost = mtd_df["BilledCost"].sum() if not mtd_df.is_empty() else 0

            # Calculate forecasts using lib/costs/
            forecasts = calculate_forecasts(mtd_cost)

            summary = {
                "total_billed_cost": round(total_billed or 0, 2),
                "total_effective_cost": round(total_effective or 0, 2),
                "record_count": len(df),
                "mtd_cost": round(mtd_cost or 0, 2),
                "daily_rate": forecasts["daily_rate"],
                "monthly_forecast": forecasts["monthly_forecast"],
                "annual_forecast": forecasts["annual_forecast"],
                "providers": _safe_unique_list(df, "ServiceProviderName"),
                "service_categories": _safe_unique_list(df, "ServiceCategory"),
            }

            # Cache until midnight UTC (daily data)
            resolved_start, resolved_end = query.resolve_dates()
            ttl = _get_cache_ttl(includes_today=resolved_end >= date_info.today)
            self._cache.set(cache_key, summary, ttl=ttl)

            return CostResponse(
                success=True,
                summary=summary,
                cache_hit=False,
                query_time_ms=round((time.time() - start_time) * 1000, 2)
            )

        except Exception as e:
            logger.error(f"Cost summary query failed for {query.org_slug}: {e}")
            return CostResponse(
                success=False,
                error=str(e),
                query_time_ms=(time.time() - start_time) * 1000
            )

    async def get_cost_by_provider(self, query: CostQuery) -> CostResponse:
        """Get cost breakdown by provider using lib/costs/aggregate_by_provider."""
        start_time = time.time()
        cache_key = f"by_provider:{query.cache_key()}"

        cached = self._cache.get(cache_key)
        if cached is not None:
            return CostResponse(
                success=True,
                data=cached,
                cache_hit=True,
                query_time_ms=round((time.time() - start_time) * 1000, 2)
            )

        try:
            df = await self._fetch_cost_data(query)

            # Use lib/costs/ aggregation
            breakdown = aggregate_by_provider(df, include_percentage=True)

            # Cache until midnight UTC (daily data)
            resolved_start, resolved_end = query.resolve_dates()
            date_info = get_date_info()
            ttl = _get_cache_ttl(includes_today=resolved_end >= date_info.today)
            self._cache.set(cache_key, breakdown, ttl=ttl)

            return CostResponse(
                success=True,
                data=breakdown,
                cache_hit=False,
                query_time_ms=round((time.time() - start_time) * 1000, 2)
            )

        except Exception as e:
            logger.error(f"Cost by provider query failed for {query.org_slug}: {e}")
            return CostResponse(
                success=False,
                error=str(e),
                query_time_ms=(time.time() - start_time) * 1000
            )

    async def get_cost_by_service(self, query: CostQuery) -> CostResponse:
        """Get cost breakdown by service using lib/costs/aggregate_by_service."""
        start_time = time.time()
        cache_key = f"by_service:{query.cache_key()}"

        cached = self._cache.get(cache_key)
        if cached is not None:
            return CostResponse(
                success=True,
                data=cached,
                cache_hit=True,
                query_time_ms=round((time.time() - start_time) * 1000, 2)
            )

        try:
            df = await self._fetch_cost_data(query)

            # Use lib/costs/ aggregation
            breakdown = aggregate_by_service(df, include_percentage=True)

            # Cache until midnight UTC (daily data)
            resolved_start, resolved_end = query.resolve_dates()
            date_info = get_date_info()
            ttl = _get_cache_ttl(includes_today=resolved_end >= date_info.today)
            self._cache.set(cache_key, breakdown, ttl=ttl)

            return CostResponse(
                success=True,
                data=breakdown,
                cache_hit=False,
                query_time_ms=round((time.time() - start_time) * 1000, 2)
            )

        except Exception as e:
            logger.error(f"Cost by service query failed for {query.org_slug}: {e}")
            return CostResponse(
                success=False,
                error=str(e),
                query_time_ms=(time.time() - start_time) * 1000
            )

    async def get_cost_by_category(self, query: CostQuery) -> CostResponse:
        """Get cost breakdown by category using lib/costs/aggregate_by_category."""
        start_time = time.time()
        cache_key = f"by_category:{query.cache_key()}"

        cached = self._cache.get(cache_key)
        if cached is not None:
            return CostResponse(
                success=True,
                data=cached,
                cache_hit=True,
                query_time_ms=round((time.time() - start_time) * 1000, 2)
            )

        try:
            df = await self._fetch_cost_data(query)

            # Use lib/costs/ aggregation
            breakdown = aggregate_by_category(df, include_percentage=True)

            # Cache until midnight UTC (daily data)
            resolved_start, resolved_end = query.resolve_dates()
            date_info = get_date_info()
            ttl = _get_cache_ttl(includes_today=resolved_end >= date_info.today)
            self._cache.set(cache_key, breakdown, ttl=ttl)

            return CostResponse(
                success=True,
                data=breakdown,
                cache_hit=False,
                query_time_ms=round((time.time() - start_time) * 1000, 2)
            )

        except Exception as e:
            logger.error(f"Cost by category query failed for {query.org_slug}: {e}")
            return CostResponse(
                success=False,
                error=str(e),
                query_time_ms=(time.time() - start_time) * 1000
            )

    async def get_cost_trend(
        self,
        query: CostQuery,
        granularity: str = "daily",
        category: Optional[str] = None
    ) -> CostResponse:
        """Get cost trend over time using lib/costs/aggregate_by_date.

        Args:
            query: Cost query with org_slug and date range
            granularity: "daily", "weekly", or "monthly"
            category: Optional category filter ("genai", "cloud", "subscription")
                     Now pushed to SQL WHERE for efficiency (reduces BQ data transfer)
        """
        start_time = time.time()
        # Include category in cache key for proper isolation
        cache_key = f"trend:{query.cache_key()}:{granularity}:{category or 'all'}"

        cached = self._cache.get(cache_key)
        if cached is not None:
            logger.debug(f"[L1 Cache HIT] trend:{query.org_slug}:{category or 'all'}")
            return CostResponse(
                success=True,
                data=cached,
                cache_hit=True,
                query_time_ms=round((time.time() - start_time) * 1000, 2)
            )

        try:
            # Pass category to _fetch_cost_data for SQL WHERE push-down
            # This filters at BigQuery level, reducing data transfer
            df = await self._fetch_cost_data(query, category=category)

            # Use lib/costs/ aggregation
            breakdown = aggregate_by_date(df, granularity=granularity)

            # Cache until midnight UTC (daily data)
            resolved_start, resolved_end = query.resolve_dates()
            date_info = get_date_info()
            ttl = _get_cache_ttl(includes_today=resolved_end >= date_info.today)
            self._cache.set(cache_key, breakdown, ttl=ttl)
            logger.debug(f"[L1 Cache SET] trend:{query.org_slug}:{category or 'all'} ttl={ttl}s")

            return CostResponse(
                success=True,
                data=breakdown,
                cache_hit=False,
                query_time_ms=round((time.time() - start_time) * 1000, 2)
            )

        except Exception as e:
            logger.error(f"Cost trend query failed for {query.org_slug}: {e}")
            return CostResponse(
                success=False,
                error=str(e),
                query_time_ms=(time.time() - start_time) * 1000
            )

    # ==========================================================================
    # Hierarchy Rollup Methods (using lib/costs/aggregate_by_hierarchy)
    # ==========================================================================

    async def get_cost_by_hierarchy(
        self,
        query: CostQuery,
        level: str = "department"
    ) -> CostResponse:
        """Get cost breakdown by organizational hierarchy level."""
        start_time = time.time()
        cache_key = f"by_hierarchy:{query.cache_key()}:{level}"

        cached = self._cache.get(cache_key)
        if cached is not None:
            return CostResponse(
                success=True,
                data=cached,
                cache_hit=True,
                query_time_ms=round((time.time() - start_time) * 1000, 2)
            )

        try:
            df = await self._fetch_cost_data(query)

            # Use lib/costs/ aggregation
            breakdown = aggregate_by_hierarchy(df, level=level, include_percentage=True)

            # Cache until midnight UTC (daily data)
            resolved_start, resolved_end = query.resolve_dates()
            date_info = get_date_info()
            ttl = _get_cache_ttl(includes_today=resolved_end >= date_info.today)
            self._cache.set(cache_key, breakdown, ttl=ttl)

            return CostResponse(
                success=True,
                data=breakdown,
                cache_hit=False,
                query_time_ms=round((time.time() - start_time) * 1000, 2)
            )

        except Exception as e:
            logger.error(f"Cost by hierarchy query failed for {query.org_slug}: {e}")
            return CostResponse(
                success=False,
                error=str(e),
                query_time_ms=(time.time() - start_time) * 1000
            )

    async def get_hierarchy_rollup(self, query: CostQuery) -> CostResponse:
        """Get full hierarchy rollup (dept → project → team) with costs."""
        start_time = time.time()
        cache_key = f"hierarchy_rollup:{query.cache_key()}"

        cached = self._cache.get(cache_key)
        if cached is not None:
            return CostResponse(
                success=True,
                data=cached,
                cache_hit=True,
                query_time_ms=round((time.time() - start_time) * 1000, 2)
            )

        try:
            df = await self._fetch_cost_data(query)

            rollup = {
                "by_department": aggregate_by_hierarchy(df, level="department"),
                "by_project": aggregate_by_hierarchy(df, level="project"),
                "by_team": aggregate_by_hierarchy(df, level="team"),
                "total_cost": round(df["BilledCost"].sum() or 0, 2),
            }

            # Cache until midnight UTC (daily data)
            resolved_start, resolved_end = query.resolve_dates()
            date_info = get_date_info()
            ttl = _get_cache_ttl(includes_today=resolved_end >= date_info.today)
            self._cache.set(cache_key, rollup, ttl=ttl)

            return CostResponse(
                success=True,
                data=rollup,
                cache_hit=False,
                query_time_ms=round((time.time() - start_time) * 1000, 2)
            )

        except Exception as e:
            logger.error(f"Hierarchy rollup query failed for {query.org_slug}: {e}")
            return CostResponse(
                success=False,
                error=str(e),
                query_time_ms=(time.time() - start_time) * 1000
            )

    # ==========================================================================
    # Forecasting Methods (using lib/costs/calculate_forecasts)
    # ==========================================================================

    async def get_cost_forecast(self, query: CostQuery) -> CostResponse:
        """Get cost forecasts based on current period data."""
        start_time = time.time()
        cache_key = f"forecast:{query.cache_key()}"

        cached = self._cache.get(cache_key)
        if cached is not None:
            return CostResponse(
                success=True,
                data=cached,
                cache_hit=True,
                query_time_ms=round((time.time() - start_time) * 1000, 2)
            )

        try:
            # Get current month data
            date_info = get_date_info()
            mtd_query = CostQuery(
                org_slug=query.org_slug,
                period=DatePeriod.MTD,
                fiscal_year_start_month=query.fiscal_year_start_month,
                providers=query.providers,
                service_categories=query.service_categories,
            )
            df = await self._fetch_cost_data(mtd_query)

            mtd_cost = df["BilledCost"].sum() if not df.is_empty() else 0

            # Calculate forecasts using lib/costs/
            forecasts = calculate_forecasts(mtd_cost)

            # Provider-level forecasts
            provider_forecasts = []
            if not df.is_empty():
                by_provider = aggregate_by_provider(df)
                for p in by_provider:
                    p_forecasts = calculate_forecasts(p["total_cost"])
                    provider_forecasts.append({
                        "provider": p["provider"],
                        "mtd_cost": p["total_cost"],
                        **p_forecasts
                    })

            result = {
                "overall": {
                    "mtd_cost": round(mtd_cost or 0, 2),
                    **forecasts,
                },
                "by_provider": provider_forecasts,
                "date_info": {
                    "days_elapsed": date_info.days_elapsed,
                    "days_in_month": date_info.days_in_month,
                    "days_remaining": date_info.days_remaining,
                }
            }

            self._cache.set(cache_key, result, ttl=60)  # Short TTL for forecasts

            return CostResponse(
                success=True,
                data=result,
                cache_hit=False,
                query_time_ms=round((time.time() - start_time) * 1000, 2)
            )

        except Exception as e:
            logger.error(f"Cost forecast query failed for {query.org_slug}: {e}")
            return CostResponse(
                success=False,
                error=str(e),
                query_time_ms=(time.time() - start_time) * 1000
            )

    # ==========================================================================
    # Comparison Methods (using _shared/date_utils)
    # ==========================================================================

    async def get_cost_comparison(
        self,
        query: CostQuery,
        comparison_type: ComparisonType = ComparisonType.MONTH_OVER_MONTH,
        custom_days: int = 30,
    ) -> CostResponse:
        """Get cost comparison between two periods."""
        start_time = time.time()
        cache_key = f"comparison:{query.cache_key()}:{comparison_type}:{custom_days}"

        cached = self._cache.get(cache_key)
        if cached is not None:
            return CostResponse(
                success=True,
                data=cached,
                cache_hit=True,
                query_time_ms=round((time.time() - start_time) * 1000, 2)
            )

        try:
            # Get comparison ranges
            comparison = get_comparison_ranges(
                comparison_type=comparison_type,
                days=custom_days,
                fiscal_year_start_month=query.fiscal_year_start_month,
            )

            # Fetch current period data
            current_query = CostQuery(
                org_slug=query.org_slug,
                start_date=comparison.current.start_date,
                end_date=comparison.current.end_date,
                providers=query.providers,
                service_categories=query.service_categories,
                fiscal_year_start_month=query.fiscal_year_start_month,
            )
            current_df = await self._fetch_cost_data(current_query)

            # Fetch previous period data
            previous_query = CostQuery(
                org_slug=query.org_slug,
                start_date=comparison.previous.start_date,
                end_date=comparison.previous.end_date,
                providers=query.providers,
                service_categories=query.service_categories,
                fiscal_year_start_month=query.fiscal_year_start_month,
            )
            previous_df = await self._fetch_cost_data(previous_query)

            # Calculate totals
            current_cost = current_df["BilledCost"].sum() if not current_df.is_empty() else 0
            previous_cost = previous_df["BilledCost"].sum() if not previous_df.is_empty() else 0

            # Calculate change using lib/costs/
            change_percent = calculate_percentage_change(current_cost, previous_cost)

            # Provider-level comparison
            current_by_provider = {p["provider"]: p["total_cost"] for p in aggregate_by_provider(current_df)}
            previous_by_provider = {p["provider"]: p["total_cost"] for p in aggregate_by_provider(previous_df)}

            all_providers = set(current_by_provider.keys()) | set(previous_by_provider.keys())
            provider_comparison = []
            for provider in sorted(all_providers):
                curr = current_by_provider.get(provider, 0)
                prev = previous_by_provider.get(provider, 0)
                provider_comparison.append({
                    "provider": provider,
                    "current_cost": round(curr, 2),
                    "previous_cost": round(prev, 2),
                    "change_percent": calculate_percentage_change(curr, prev),
                    "change_amount": round(curr - prev, 2),
                })

            result = {
                "comparison_type": comparison_type.value,
                "current_period": {
                    "start": str(comparison.current.start_date),
                    "end": str(comparison.current.end_date),
                    "label": comparison.current.label,
                    "total_cost": round(current_cost or 0, 2),
                },
                "previous_period": {
                    "start": str(comparison.previous.start_date),
                    "end": str(comparison.previous.end_date),
                    "label": comparison.previous.label,
                    "total_cost": round(previous_cost or 0, 2),
                },
                "change": {
                    "percent": change_percent,
                    "amount": round((current_cost or 0) - (previous_cost or 0), 2),
                    "direction": "up" if change_percent > 0 else "down" if change_percent < 0 else "flat",
                },
                "by_provider": provider_comparison,
            }

            # Cache until midnight UTC (daily data)
            date_info = get_date_info()
            includes_today = comparison.current.end_date >= date_info.today
            ttl = _get_cache_ttl(includes_today=includes_today)
            self._cache.set(cache_key, result, ttl=ttl)

            return CostResponse(
                success=True,
                data=result,
                cache_hit=False,
                query_time_ms=round((time.time() - start_time) * 1000, 2)
            )

        except Exception as e:
            logger.error(f"Cost comparison query failed for {query.org_slug}: {e}")
            return CostResponse(
                success=False,
                error=str(e),
                query_time_ms=(time.time() - start_time) * 1000
            )

    # ==========================================================================
    # Cost Type Filters (Subscriptions, Cloud, LLM)
    # ==========================================================================

    async def get_subscription_costs(self, query: CostQuery) -> CostResponse:
        """Get subscription costs from cost_data_standard_1_3.

        Uses SQL WHERE push-down for category filtering (more efficient than Polars).
        """
        start_time = time.time()
        cache_key = f"subscription_costs:{query.cache_key()}"

        cached = self._cache.get(cache_key)
        if cached is not None:
            logger.debug(f"[L1 Cache HIT] subscription_costs:{query.org_slug}")
            return CostResponse(
                success=True,
                data=cached["data"],
                summary=cached["summary"],
                cache_hit=True,
                query_time_ms=round((time.time() - start_time) * 1000, 2)
            )

        try:
            # Use SQL WHERE push-down for subscription filtering
            # This filters at BigQuery level: x_source_system = 'subscription_costs_daily'
            df = await self._fetch_cost_data(query, category="subscription")

            if df.is_empty():
                return CostResponse(
                    success=True,
                    data=[],
                    summary={
                        "total_cost": 0,
                        "mtd_cost": 0,
                        "total_daily_cost": 0,
                        "total_monthly_cost": 0,
                        "total_annual_cost": 0,
                        "daily_rate": 0,
                        "monthly_forecast": 0,
                        "annual_forecast": 0,
                        "by_provider": [],
                        "by_category": [],
                        "providers": [],
                        "service_categories": [],
                        "record_count": 0,
                        "date_range": {"start": str(query.start_date or ""), "end": str(query.end_date or "")},
                    },
                    cache_hit=False,
                    query_time_ms=round((time.time() - start_time) * 1000, 2)
                )

            data = df.to_dicts()
            total_cost = df["BilledCost"].sum() or 0

            # Safe MTD calculation
            date_info = get_date_info()
            mtd_df = filter_date_range(
                df,
                start_date=date_info.month_start,
                end_date=date_info.today
            )
            mtd_cost = mtd_df["BilledCost"].sum() if not mtd_df.is_empty() else 0

            forecasts = calculate_forecasts(mtd_cost or 0)

            # Get resolved dates for response
            resolved_start, resolved_end = query.resolve_dates()

            summary = {
                "total_cost": round(total_cost, 2),
                "mtd_cost": round(mtd_cost or 0, 2),
                "total_daily_cost": forecasts["daily_rate"],
                "total_monthly_cost": forecasts["monthly_forecast"],
                "total_annual_cost": forecasts["annual_forecast"],
                **forecasts,
                "by_provider": aggregate_by_provider(df),
                "by_category": aggregate_by_category(df),
                "providers": _safe_unique_list(df, "ServiceProviderName"),
                "service_categories": _safe_unique_list(df, "ServiceCategory"),
                "record_count": len(df),
                "date_range": {"start": str(resolved_start), "end": str(resolved_end)},
            }

            # Cache until midnight UTC (daily data)
            ttl = _get_cache_ttl(includes_today=resolved_end >= date_info.today)
            self._cache.set(cache_key, {"data": data, "summary": summary}, ttl=ttl)

            return CostResponse(
                success=True,
                data=data,
                summary=summary,
                cache_hit=False,
                query_time_ms=round((time.time() - start_time) * 1000, 2)
            )

        except Exception as e:
            logger.error(f"Subscription costs query failed for {query.org_slug}: {e}", exc_info=True)
            return CostResponse(
                success=False,
                error=str(e),
                query_time_ms=(time.time() - start_time) * 1000
            )

    async def get_cloud_costs(self, query: CostQuery) -> CostResponse:
        """Get cloud costs (GCP, AWS, Azure).

        Uses SQL WHERE push-down for category filtering (more efficient than Polars).
        """
        start_time = time.time()
        cache_key = f"cloud_costs:{query.cache_key()}"

        cached = self._cache.get(cache_key)
        if cached is not None:
            logger.debug(f"[L1 Cache HIT] cloud_costs:{query.org_slug}")
            return CostResponse(
                success=True,
                data=cached["data"],
                summary=cached["summary"],
                cache_hit=True,
                query_time_ms=round((time.time() - start_time) * 1000, 2)
            )

        try:
            # Use SQL WHERE push-down for cloud filtering
            # This filters at BigQuery level: LOWER(ServiceProviderName) IN (gcp, aws, azure, ...)
            df = await self._fetch_cost_data(query, category="cloud")

            if df.is_empty():
                resolved_start, resolved_end = query.resolve_dates()
                return CostResponse(
                    success=True,
                    data=[],
                    summary={
                        "total_cost": 0,
                        "mtd_cost": 0,
                        "total_daily_cost": 0,
                        "total_monthly_cost": 0,
                        "total_annual_cost": 0,
                        "daily_rate": 0,
                        "monthly_forecast": 0,
                        "annual_forecast": 0,
                        "by_provider": [],
                        "providers": [],
                        "record_count": 0,
                        "date_range": {"start": str(resolved_start), "end": str(resolved_end)},
                    },
                    cache_hit=False,
                    query_time_ms=round((time.time() - start_time) * 1000, 2)
                )

            data = df.to_dicts()
            total_cost = df["BilledCost"].sum() or 0
            date_info = get_date_info()
            mtd_df = filter_date_range(df, start_date=date_info.month_start, end_date=date_info.today)
            mtd_cost = mtd_df["BilledCost"].sum() if not mtd_df.is_empty() else 0

            # If no MTD data, calculate forecasts from available data in requested range
            resolved_start, resolved_end = query.resolve_dates()
            if mtd_cost == 0 and total_cost > 0:
                days_in_range = max(1, (resolved_end - resolved_start).days + 1)
                daily_rate = total_cost / days_in_range
                forecasts = {
                    "daily_rate": round(daily_rate, 2),
                    "monthly_forecast": round(daily_rate * 30, 2),
                    "annual_forecast": round(daily_rate * 365, 2),
                }
            else:
                forecasts = calculate_forecasts(mtd_cost or 0)

            summary = {
                "total_cost": round(total_cost, 2),
                "mtd_cost": round(mtd_cost or 0, 2),
                "total_daily_cost": forecasts["daily_rate"],
                "total_monthly_cost": forecasts["monthly_forecast"],
                "total_annual_cost": forecasts["annual_forecast"],
                **forecasts,
                "by_provider": aggregate_by_provider(df),
                "providers": _safe_unique_list(df, "ServiceProviderName"),
                "record_count": len(df),
                "date_range": {"start": str(resolved_start), "end": str(resolved_end)},
            }

            # Cache until midnight UTC (daily data)
            ttl = _get_cache_ttl(includes_today=resolved_end >= date_info.today)
            self._cache.set(cache_key, {"data": data, "summary": summary}, ttl=ttl)

            return CostResponse(
                success=True,
                data=data,
                summary=summary,
                cache_hit=False,
                query_time_ms=round((time.time() - start_time) * 1000, 2)
            )

        except Exception as e:
            logger.error(f"Cloud costs query failed for {query.org_slug}: {e}", exc_info=True)
            return CostResponse(
                success=False,
                error=str(e),
                query_time_ms=(time.time() - start_time) * 1000
            )

    async def get_genai_costs(self, query: CostQuery) -> CostResponse:
        """Get GenAI API costs (OpenAI, Anthropic, etc.).

        Uses SQL WHERE push-down for category filtering (more efficient than Polars).
        """
        start_time = time.time()
        cache_key = f"genai_costs:{query.cache_key()}"

        cached = self._cache.get(cache_key)
        if cached is not None:
            logger.debug(f"[L1 Cache HIT] genai_costs:{query.org_slug}")
            return CostResponse(
                success=True,
                data=cached["data"],
                summary=cached["summary"],
                cache_hit=True,
                query_time_ms=round((time.time() - start_time) * 1000, 2)
            )

        try:
            # Use SQL WHERE push-down for GenAI filtering
            # This filters at BigQuery level: LOWER(ServiceProviderName) IN (openai, anthropic, ...)
            # AND NOT x_source_system = 'subscription_costs_daily'
            df = await self._fetch_cost_data(query, category="genai")

            if df.is_empty():
                resolved_start, resolved_end = query.resolve_dates()
                return CostResponse(
                    success=True,
                    data=[],
                    summary={
                        "total_cost": 0,
                        "mtd_cost": 0,
                        "total_daily_cost": 0,
                        "total_monthly_cost": 0,
                        "total_annual_cost": 0,
                        "daily_rate": 0,
                        "monthly_forecast": 0,
                        "annual_forecast": 0,
                        "by_provider": [],
                        "providers": [],
                        "record_count": 0,
                        "date_range": {"start": str(resolved_start), "end": str(resolved_end)},
                    },
                    cache_hit=False,
                    query_time_ms=round((time.time() - start_time) * 1000, 2)
                )

            data = df.to_dicts()
            total_cost = df["BilledCost"].sum() or 0
            date_info = get_date_info()
            mtd_df = filter_date_range(df, start_date=date_info.month_start, end_date=date_info.today)
            mtd_cost = mtd_df["BilledCost"].sum() if not mtd_df.is_empty() else 0

            # If no MTD data, calculate forecasts from available data in requested range
            resolved_start, resolved_end = query.resolve_dates()
            if mtd_cost == 0 and total_cost > 0:
                days_in_range = max(1, (resolved_end - resolved_start).days + 1)
                daily_rate = total_cost / days_in_range
                forecasts = {
                    "daily_rate": round(daily_rate, 2),
                    "monthly_forecast": round(daily_rate * 30, 2),
                    "annual_forecast": round(daily_rate * 365, 2),
                }
            else:
                forecasts = calculate_forecasts(mtd_cost or 0)

            summary = {
                "total_cost": round(total_cost, 2),
                "mtd_cost": round(mtd_cost or 0, 2),
                "total_daily_cost": forecasts["daily_rate"],
                "total_monthly_cost": forecasts["monthly_forecast"],
                "total_annual_cost": forecasts["annual_forecast"],
                **forecasts,
                "by_provider": aggregate_by_provider(df),
                "providers": _safe_unique_list(df, "ServiceProviderName"),
                "record_count": len(df),
                "date_range": {"start": str(resolved_start), "end": str(resolved_end)},
            }

            # Cache until midnight UTC (daily data)
            ttl = _get_cache_ttl(includes_today=resolved_end >= date_info.today)
            self._cache.set(cache_key, {"data": data, "summary": summary}, ttl=ttl)

            return CostResponse(
                success=True,
                data=data,
                summary=summary,
                cache_hit=False,
                query_time_ms=round((time.time() - start_time) * 1000, 2)
            )

        except Exception as e:
            logger.error(f"GenAI costs query failed for {query.org_slug}: {e}", exc_info=True)
            return CostResponse(
                success=False,
                error=str(e),
                query_time_ms=(time.time() - start_time) * 1000
            )

    async def get_llm_costs(self, query: CostQuery) -> CostResponse:
        """Get LLM API costs (deprecated - use get_genai_costs instead)."""
        return await self.get_genai_costs(query)

    # ==========================================================================
    # Granular Trend Data (for Client-Side Filtering)
    # ==========================================================================

    async def get_granular_trend(self, query: CostQuery, clear_cache: bool = False) -> CostResponse:
        """
        Get granular cost trend data for client-side filtering.

        Returns aggregated data by date + provider + hierarchy, enabling:
        - ONE API call for 365 days of data
        - ALL filters applied client-side (instant UI)
        - No new API calls for time range, provider, category, or hierarchy changes

        Data structure per row:
        {
            "date": "2024-01-15",
            "provider": "openai",
            "category": "genai",  # genai | cloud | subscription | other
            "dept_id": "DEPT001",
            "project_id": "PROJ001",
            "team_id": "TEAM001",
            "total_cost": 150.50,
            "record_count": 25
        }

        Typical response size: ~365 days × ~50 unique combos = ~18,250 rows (~500KB)
        Much smaller than raw data (millions of rows)

        Args:
            query: CostQuery with org_slug and date range
            clear_cache: If True, bypass Polars LRU cache and fetch fresh data from BigQuery
        """
        start_time = time.time()
        # Cache key includes only org + date range (NO hierarchy filters)
        # This ensures one cached dataset can serve ALL filter combinations
        resolved_start, resolved_end = query.resolve_dates()
        cache_key = f"granular_trend:{query.org_slug}:{resolved_start}:{resolved_end}"

        # If clear_cache is requested, remove from cache first
        if clear_cache:
            logger.info(f"[L1 Cache CLEAR] granular_trend:{query.org_slug} (clear_cache=True)")
            self._cache.invalidate(cache_key)
        else:
            cached = self._cache.get(cache_key)
            if cached is not None:
                logger.debug(f"[L1 Cache HIT] granular_trend:{query.org_slug}")
                return CostResponse(
                    success=True,
                    data=cached["data"],
                    summary=cached["summary"],
                    cache_hit=True,
                    query_time_ms=round((time.time() - start_time) * 1000, 2)
                )

        try:
            # Fetch ALL data for date range (no hierarchy filter in SQL)
            # This is the KEY difference - we get everything to filter client-side
            base_query = CostQuery(
                org_slug=query.org_slug,
                start_date=resolved_start,
                end_date=resolved_end,
                # NO hierarchy filters - fetch ALL data
            )
            df = await self._fetch_cost_data(base_query)

            if df.is_empty():
                return CostResponse(
                    success=True,
                    data=[],
                    summary={
                        "total_cost": 0,
                        "record_count": 0,
                        "granular_rows": 0,
                        "date_range": {"start": str(resolved_start), "end": str(resolved_end)},
                        "available_filters": {
                            "providers": [],
                            "categories": [],
                            "departments": [],
                            "projects": [],
                            "teams": [],
                        }
                    },
                    cache_hit=False,
                    query_time_ms=round((time.time() - start_time) * 1000, 2)
                )

            # Aggregate using lib/costs/aggregate_granular
            # This groups by date + provider + hierarchy, significantly reducing data size
            granular_data = aggregate_granular(df)

            # Build summary with available filter options
            total_cost = df["BilledCost"].sum() or 0
            summary = {
                "total_cost": round(total_cost, 2),
                "record_count": len(df),
                "granular_rows": len(granular_data),
                "date_range": {"start": str(resolved_start), "end": str(resolved_end)},
                "available_filters": {
                    "providers": _safe_unique_list(df, "ServiceProviderName"),
                    "categories": list(set(row.get("category", "other") for row in granular_data)),
                    "departments": [
                        {"id": e, "name": n, "level_code": lc, "path": p}
                        for e, n, lc, p in set(
                            (row.get("hierarchy_entity_id"), row.get("hierarchy_entity_name"),
                             row.get("hierarchy_level_code"), row.get("hierarchy_path"))
                            for row in df.select([
                                "hierarchy_entity_id", "hierarchy_entity_name",
                                "hierarchy_level_code", "hierarchy_path"
                            ]).unique().to_dicts()
                            if row.get("hierarchy_entity_id")
                        )
                    ] if "hierarchy_entity_id" in df.columns else [],
                },
            }

            # Cache until midnight UTC (daily data)
            date_info = get_date_info()
            ttl = _get_cache_ttl(includes_today=resolved_end >= date_info.today)
            self._cache.set(cache_key, {"data": granular_data, "summary": summary}, ttl=ttl)

            logger.info(
                f"[Granular Trend] org={query.org_slug} raw_rows={len(df)} "
                f"granular_rows={len(granular_data)} reduction={100 - (len(granular_data)/max(1,len(df))*100):.1f}%"
            )

            return CostResponse(
                success=True,
                data=granular_data,
                summary=summary,
                cache_hit=False,
                query_time_ms=round((time.time() - start_time) * 1000, 2)
            )

        except Exception as e:
            logger.error(f"Granular trend query failed for {query.org_slug}: {e}", exc_info=True)
            return CostResponse(
                success=False,
                error=str(e),
                query_time_ms=(time.time() - start_time) * 1000
            )

    # ==========================================================================
    # Cache Management
    # ==========================================================================

    def invalidate_org_cache(self, org_slug: str) -> int:
        """Invalidate all cached data for an organization (both L1 and L2)."""
        l1_cleared = self._cache.invalidate_org(org_slug)
        l2_cleared = self._agg_cache.invalidate_org(org_slug)
        return l1_cleared + l2_cleared

    @property
    def cache_stats(self) -> Dict[str, Any]:
        """Get cache statistics for both L1 and L2 caches."""
        return {
            "l1_cache": self._cache.stats,
            "l2_agg_cache": self._agg_cache.stats,
        }


# Thread-safe singleton instance
_cost_read_service: Optional[CostReadService] = None
_cost_read_service_lock = threading.Lock()


def get_cost_read_service() -> CostReadService:
    """Get singleton cost read service instance (thread-safe)."""
    global _cost_read_service
    # Fast path: already initialized
    if _cost_read_service is not None:
        return _cost_read_service
    # Slow path: need to initialize with lock
    with _cost_read_service_lock:
        # Double-check after acquiring lock
        if _cost_read_service is None:
            _cost_read_service = CostReadService()
        return _cost_read_service
