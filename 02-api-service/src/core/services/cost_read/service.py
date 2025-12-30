"""
Cost Read Service

High-performance, read-only cost data service using Polars DataFrames.
For dashboard reads only - pipeline writes cost data.

Features:
- Polars lazy evaluation for optimal query performance
- LRU cache with TTL for hot data
- Multi-tenant isolation via org_slug
- Zero-copy data sharing via Arrow format
- Centralized aggregations via lib/costs/
"""

import polars as pl
import logging
import asyncio
import time
from datetime import date
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
    - Aggressive caching with multi-level TTL
    - Multi-tenant isolation
    - Centralized aggregations via lib/costs/
    """

    def __init__(self, cache: Optional[LRUCache] = None):
        self._cache = cache or create_cache("COST", max_size=1000, default_ttl=300)
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

    async def _fetch_cost_data(self, query: CostQuery) -> pl.DataFrame:
        """
        Fetch raw cost data from BigQuery.

        Uses resolve_dates() to handle period/fiscal_year/custom dates.
        Returns raw DataFrame for Polars aggregations.
        """
        validate_org_slug(query.org_slug)
        dataset_id = self._get_dataset_id(query.org_slug)
        table_ref = f"`{self._project_id}.{dataset_id}.cost_data_standard_1_3`"

        # Resolve dates (handles period, fiscal_year, or custom dates)
        resolved_start, resolved_end = query.resolve_dates()

        # Build parameterized query
        where_conditions = ["SubAccountId = @org_slug"]
        query_params = [
            bigquery.ScalarQueryParameter("org_slug", "STRING", query.org_slug)
        ]

        # Date filters always applied
        where_conditions.append("DATE(ChargePeriodStart) >= @start_date")
        query_params.append(bigquery.ScalarQueryParameter("start_date", "DATE", resolved_start))

        where_conditions.append("DATE(ChargePeriodStart) <= @end_date")
        query_params.append(bigquery.ScalarQueryParameter("end_date", "DATE", resolved_end))

        # Optional provider filter
        if query.providers:
            where_conditions.append("ServiceProviderName IN UNNEST(@providers)")
            query_params.append(bigquery.ArrayQueryParameter("providers", "STRING", query.providers))

        # Optional category filter
        if query.service_categories:
            where_conditions.append("ServiceCategory IN UNNEST(@service_categories)")
            query_params.append(bigquery.ArrayQueryParameter("service_categories", "STRING", query.service_categories))

        # Hierarchy filters
        if query.department_id:
            where_conditions.append("x_HierarchyDeptId = @department_id")
            query_params.append(bigquery.ScalarQueryParameter("department_id", "STRING", query.department_id))

        if query.project_id:
            where_conditions.append("x_HierarchyProjectId = @project_id")
            query_params.append(bigquery.ScalarQueryParameter("project_id", "STRING", query.project_id))

        if query.team_id:
            where_conditions.append("x_HierarchyTeamId = @team_id")
            query_params.append(bigquery.ScalarQueryParameter("team_id", "STRING", query.team_id))

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
            x_SourceSystem,
            x_HierarchyDeptId,
            x_HierarchyDeptName,
            x_HierarchyProjectId,
            x_HierarchyProjectName,
            x_HierarchyTeamId,
            x_HierarchyTeamName
        FROM {table_ref}
        WHERE {where_clause}
        ORDER BY ChargePeriodStart DESC
        """

        return await self._execute_query(sql, query_params)

    # ==========================================================================
    # Core Methods (using CostQuery + lib/costs/)
    # ==========================================================================

    async def get_costs(self, query: CostQuery) -> CostResponse:
        """Get cost data for organization with caching."""
        start_time = time.time()
        cache_key = f"costs:{query.cache_key()}"

        cached_df = self._cache.get(cache_key)
        if cached_df is not None:
            query_time = (time.time() - start_time) * 1000
            data = cached_df.head(query.limit).to_dicts()
            return CostResponse(
                success=True,
                data=data,
                pagination={"limit": query.limit, "offset": query.offset, "total": len(cached_df)},
                cache_hit=True,
                query_time_ms=round(query_time, 2)
            )

        try:
            df = await self._fetch_cost_data(query)

            # Cache with appropriate TTL (shorter for recent data)
            resolved_start, resolved_end = query.resolve_dates()
            date_info = get_date_info()
            ttl = 60 if resolved_end >= date_info.today else 300
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

            self._cache.set(cache_key, summary, ttl=300)

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

            self._cache.set(cache_key, breakdown, ttl=300)

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

            self._cache.set(cache_key, breakdown, ttl=300)

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

            self._cache.set(cache_key, breakdown, ttl=300)

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

    async def get_cost_trend(self, query: CostQuery, granularity: str = "daily") -> CostResponse:
        """Get cost trend over time using lib/costs/aggregate_by_date."""
        start_time = time.time()
        cache_key = f"trend:{query.cache_key()}:{granularity}"

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
            breakdown = aggregate_by_date(df, granularity=granularity)

            self._cache.set(cache_key, breakdown, ttl=300)

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

            self._cache.set(cache_key, breakdown, ttl=300)

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

            self._cache.set(cache_key, rollup, ttl=300)

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

            self._cache.set(cache_key, result, ttl=300)

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
    # Cost Type Filters (SaaS, Cloud, LLM)
    # ==========================================================================

    async def get_saas_subscription_costs(self, query: CostQuery) -> CostResponse:
        """Get SaaS subscription costs from cost_data_standard_1_3."""
        start_time = time.time()
        cache_key = f"saas_costs:{query.cache_key()}"

        cached = self._cache.get(cache_key)
        if cached is not None:
            return CostResponse(
                success=True,
                data=cached["data"],
                summary=cached["summary"],
                cache_hit=True,
                query_time_ms=round((time.time() - start_time) * 1000, 2)
            )

        try:
            df = await self._fetch_cost_data(query)

            # Filter to SaaS source system (handle nulls safely)
            if "x_SourceSystem" in df.columns and not df.is_empty():
                df = df.filter(
                    pl.col("x_SourceSystem").fill_null("").eq("saas_subscription_costs_daily")
                )

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

            self._cache.set(cache_key, {"data": data, "summary": summary}, ttl=60)

            return CostResponse(
                success=True,
                data=data,
                summary=summary,
                cache_hit=False,
                query_time_ms=round((time.time() - start_time) * 1000, 2)
            )

        except Exception as e:
            logger.error(f"SaaS costs query failed for {query.org_slug}: {e}", exc_info=True)
            return CostResponse(
                success=False,
                error=str(e),
                query_time_ms=(time.time() - start_time) * 1000
            )

    async def get_cloud_costs(self, query: CostQuery) -> CostResponse:
        """Get cloud costs (GCP, AWS, Azure)."""
        start_time = time.time()
        cache_key = f"cloud_costs:{query.cache_key()}"

        cached = self._cache.get(cache_key)
        if cached is not None:
            return CostResponse(
                success=True,
                data=cached["data"],
                summary=cached["summary"],
                cache_hit=True,
                query_time_ms=round((time.time() - start_time) * 1000, 2)
            )

        try:
            df = await self._fetch_cost_data(query)

            # Filter to cloud providers (handle nulls safely)
            cloud_providers = ["gcp", "aws", "azure", "google", "amazon", "microsoft"]
            if "ServiceProviderName" in df.columns and not df.is_empty():
                # Use fill_null to safely handle null values before string operations
                provider_match = pl.col("ServiceProviderName").fill_null("").str.to_lowercase().is_in(cloud_providers)
                source_match = pl.col("x_SourceSystem").fill_null("").str.to_lowercase().str.contains("cloud|gcp|aws|azure")
                df = df.filter(provider_match | source_match)

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

            forecasts = calculate_forecasts(mtd_cost or 0)
            resolved_start, resolved_end = query.resolve_dates()

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

            self._cache.set(cache_key, {"data": data, "summary": summary}, ttl=60)

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

    async def get_llm_costs(self, query: CostQuery) -> CostResponse:
        """Get LLM API costs (OpenAI, Anthropic, etc.)."""
        start_time = time.time()
        cache_key = f"llm_costs:{query.cache_key()}"

        cached = self._cache.get(cache_key)
        if cached is not None:
            return CostResponse(
                success=True,
                data=cached["data"],
                summary=cached["summary"],
                cache_hit=True,
                query_time_ms=round((time.time() - start_time) * 1000, 2)
            )

        try:
            df = await self._fetch_cost_data(query)

            # Filter to LLM providers (handle nulls safely)
            llm_providers = ["openai", "anthropic", "google", "cohere", "mistral"]
            if "ServiceProviderName" in df.columns and "ServiceCategory" in df.columns and not df.is_empty():
                # Use fill_null to safely handle null values before string operations
                provider_match = pl.col("ServiceProviderName").fill_null("").str.to_lowercase().is_in(llm_providers)
                category_match = pl.col("ServiceCategory").fill_null("").str.to_lowercase().eq("llm")
                source_match = pl.col("x_SourceSystem").fill_null("").str.to_lowercase().str.contains("llm|openai|anthropic|gemini")
                not_saas = pl.col("x_SourceSystem").fill_null("").ne("saas_subscription_costs_daily")

                df = df.filter(
                    (provider_match | category_match | source_match) & not_saas
                )

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

            forecasts = calculate_forecasts(mtd_cost or 0)
            resolved_start, resolved_end = query.resolve_dates()

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

            self._cache.set(cache_key, {"data": data, "summary": summary}, ttl=60)

            return CostResponse(
                success=True,
                data=data,
                summary=summary,
                cache_hit=False,
                query_time_ms=round((time.time() - start_time) * 1000, 2)
            )

        except Exception as e:
            logger.error(f"LLM costs query failed for {query.org_slug}: {e}", exc_info=True)
            return CostResponse(
                success=False,
                error=str(e),
                query_time_ms=(time.time() - start_time) * 1000
            )

    # ==========================================================================
    # Cache Management
    # ==========================================================================

    def invalidate_org_cache(self, org_slug: str) -> int:
        """Invalidate all cached data for an organization."""
        return self._cache.invalidate_org(org_slug)

    @property
    def cache_stats(self) -> Dict[str, Any]:
        """Get cache statistics."""
        return self._cache.stats


# Singleton instance
_cost_read_service: Optional[CostReadService] = None


def get_cost_read_service() -> CostReadService:
    """Get singleton cost read service instance."""
    global _cost_read_service
    if _cost_read_service is None:
        _cost_read_service = CostReadService()
    return _cost_read_service
