"""
Usage Read Service

High-performance, read-only GenAI usage service using Polars DataFrames.
For dashboard reads only - pipeline writes usage data.

Features:
- Polars lazy evaluation for aggregations
- LRU cache with TTL for usage data
- Multi-tenant isolation via org_slug
- Zero-copy data sharing via Arrow format
"""

import polars as pl
import logging
import asyncio
import time
import threading
from datetime import date, timedelta
from typing import Optional, List, Dict, Any

from google.cloud import bigquery
from src.core.engine.bq_client import get_bigquery_client
from src.app.config import settings
from src.core.services._shared import LRUCache, validate_org_slug, create_cache
from src.core.services.usage_read.models import UsageQuery, UsageResponse
from src.lib.usage import (
    aggregate_tokens_by_provider,
    aggregate_tokens_by_model,
    calculate_daily_token_rate,
    calculate_success_rate,
    format_token_count,
)

logger = logging.getLogger(__name__)


class UsageReadService:
    """
    Read-only GenAI usage data service.

    Uses Polars for aggregations and caching for dashboard performance.
    Usage data is written by Pipeline Service (8001).
    """

    def __init__(self, cache_ttl: int = 60):
        self._cache = create_cache("USAGE", max_size=500, default_ttl=cache_ttl)
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
            job_config = bigquery.QueryJobConfig(job_timeout_ms=15000)
            if query_params:
                job_config.query_parameters = query_params

            job = self.bq_client.client.query(sql, job_config=job_config)
            result = job.result()
            arrow_table = result.to_arrow()
            return pl.from_arrow(arrow_table)

        return await loop.run_in_executor(None, run_query)

    def _build_usage_query(self, query: UsageQuery) -> tuple:
        """Build parameterized query for usage data."""
        validate_org_slug(query.org_slug)

        dataset_id = self._get_dataset_id(query.org_slug)
        table_ref = f"`{self._project_id}.{dataset_id}.genai_usage_raw`"

        # Resolve dates (handles period, fiscal_year, or custom dates)
        resolved_start, resolved_end = query.resolve_dates()

        where_conditions = ["x_org_slug = @org_slug"]
        query_params = [
            bigquery.ScalarQueryParameter("org_slug", "STRING", query.org_slug)
        ]

        # Always use resolved dates
        where_conditions.append("DATE(request_timestamp) >= @start_date")
        query_params.append(
            bigquery.ScalarQueryParameter("start_date", "DATE", resolved_start)
        )

        where_conditions.append("DATE(request_timestamp) <= @end_date")
        query_params.append(
            bigquery.ScalarQueryParameter("end_date", "DATE", resolved_end)
        )

        if query.providers:
            where_conditions.append("provider IN UNNEST(@providers)")
            query_params.append(
                bigquery.ArrayQueryParameter("providers", "STRING", query.providers)
            )

        if query.models:
            where_conditions.append("model IN UNNEST(@models)")
            query_params.append(
                bigquery.ArrayQueryParameter("models", "STRING", query.models)
            )

        where_clause = " AND ".join(where_conditions)

        sql = f"""
        SELECT
            request_id,
            provider,
            model,
            input_tokens,
            output_tokens,
            total_tokens,
            latency_ms,
            status,
            error_message,
            request_timestamp,
            DATE(request_timestamp) as request_date
        FROM {table_ref}
        WHERE {where_clause}
        ORDER BY request_timestamp DESC
        LIMIT @limit OFFSET @offset
        """

        query_params.extend([
            bigquery.ScalarQueryParameter("limit", "INT64", query.limit),
            bigquery.ScalarQueryParameter("offset", "INT64", query.offset),
        ])

        return sql, query_params

    async def get_usage(self, query: UsageQuery) -> UsageResponse:
        """Get usage data for organization."""
        start_time = time.time()
        cache_key = f"{query.org_slug}:usage:{query.cache_key()}"

        cached_df = self._cache.get(cache_key)
        if cached_df is not None:
            query_time = (time.time() - start_time) * 1000
            data = cached_df.to_dicts()
            stats = self._calculate_usage_stats(cached_df)

            return UsageResponse(
                success=True,
                data=data,
                stats=stats,
                total=len(data),
                cache_hit=True,
                query_time_ms=round(query_time, 2)
            )

        try:
            sql, query_params = self._build_usage_query(query)
            df = await self._execute_query(sql, query_params)

            self._cache.set(cache_key, df, ttl=60)

            data = df.to_dicts()
            stats = self._calculate_usage_stats(df)
            query_time = (time.time() - start_time) * 1000

            return UsageResponse(
                success=True,
                data=data,
                stats=stats,
                total=len(data),
                cache_hit=False,
                query_time_ms=round(query_time, 2)
            )

        except Exception as e:
            logger.error(f"Usage query failed for {query.org_slug}: {e}")
            return UsageResponse(
                success=False,
                error=str(e),
                query_time_ms=(time.time() - start_time) * 1000
            )

    async def get_usage_summary(self, org_slug: str, days: int = 30) -> UsageResponse:
        """Get aggregated usage summary."""
        start_time = time.time()
        cache_key = f"{org_slug}:usage_summary:{days}"

        cached_df = self._cache.get(cache_key)
        if cached_df is not None:
            query_time = (time.time() - start_time) * 1000
            summary = self._build_summary_from_df(cached_df)
            return UsageResponse(
                success=True,
                summary=summary,
                cache_hit=True,
                query_time_ms=round(query_time, 2)
            )

        try:
            validate_org_slug(org_slug)
            start_date = date.today() - timedelta(days=days)

            dataset_id = self._get_dataset_id(org_slug)
            table_ref = f"`{self._project_id}.{dataset_id}.genai_usage_raw`"

            sql = f"""
            SELECT
                provider,
                model,
                SUM(input_tokens) as total_input_tokens,
                SUM(output_tokens) as total_output_tokens,
                SUM(total_tokens) as total_tokens,
                COUNT(*) as request_count,
                AVG(latency_ms) as avg_latency_ms,
                SUM(CASE WHEN status = 'success' THEN 1 ELSE 0 END) as success_count,
                SUM(CASE WHEN status = 'error' THEN 1 ELSE 0 END) as error_count
            FROM {table_ref}
            WHERE x_org_slug = @org_slug
              AND DATE(request_timestamp) >= @start_date
            GROUP BY provider, model
            ORDER BY total_tokens DESC
            """

            query_params = [
                bigquery.ScalarQueryParameter("org_slug", "STRING", org_slug),
                bigquery.ScalarQueryParameter("start_date", "DATE", start_date),
            ]

            df = await self._execute_query(sql, query_params)
            self._cache.set(cache_key, df, ttl=120)

            summary = self._build_summary_from_df(df)
            query_time = (time.time() - start_time) * 1000

            return UsageResponse(
                success=True,
                summary=summary,
                cache_hit=False,
                query_time_ms=round(query_time, 2)
            )

        except Exception as e:
            logger.error(f"Usage summary failed for {org_slug}: {e}")
            return UsageResponse(
                success=False,
                error=str(e),
                query_time_ms=(time.time() - start_time) * 1000
            )

    async def get_usage_by_provider(self, org_slug: str, days: int = 30) -> UsageResponse:
        """Get usage breakdown by provider."""
        start_time = time.time()
        cache_key = f"{org_slug}:usage_by_provider:{days}"

        cached_df = self._cache.get(cache_key)
        if cached_df is not None:
            return UsageResponse(
                success=True,
                data=cached_df.to_dicts(),
                cache_hit=True,
                query_time_ms=round((time.time() - start_time) * 1000, 2)
            )

        try:
            validate_org_slug(org_slug)
            start_date = date.today() - timedelta(days=days)

            dataset_id = self._get_dataset_id(org_slug)
            table_ref = f"`{self._project_id}.{dataset_id}.genai_usage_raw`"

            sql = f"""
            SELECT
                provider,
                SUM(input_tokens) as total_input_tokens,
                SUM(output_tokens) as total_output_tokens,
                SUM(total_tokens) as total_tokens,
                COUNT(*) as request_count,
                AVG(latency_ms) as avg_latency_ms,
                COUNTIF(status = 'success') / COUNT(*) * 100 as success_rate
            FROM {table_ref}
            WHERE x_org_slug = @org_slug
              AND DATE(request_timestamp) >= @start_date
            GROUP BY provider
            ORDER BY total_tokens DESC
            """

            query_params = [
                bigquery.ScalarQueryParameter("org_slug", "STRING", org_slug),
                bigquery.ScalarQueryParameter("start_date", "DATE", start_date),
            ]

            df = await self._execute_query(sql, query_params)
            self._cache.set(cache_key, df, ttl=120)

            return UsageResponse(
                success=True,
                data=df.to_dicts(),
                cache_hit=False,
                query_time_ms=round((time.time() - start_time) * 1000, 2)
            )

        except Exception as e:
            logger.error(f"Usage by provider failed for {org_slug}: {e}")
            return UsageResponse(
                success=False,
                error=str(e),
                query_time_ms=(time.time() - start_time) * 1000
            )

    async def get_usage_by_model(self, org_slug: str, days: int = 30) -> UsageResponse:
        """Get usage breakdown by model."""
        start_time = time.time()
        cache_key = f"{org_slug}:usage_by_model:{days}"

        cached_df = self._cache.get(cache_key)
        if cached_df is not None:
            return UsageResponse(
                success=True,
                data=cached_df.to_dicts(),
                cache_hit=True,
                query_time_ms=round((time.time() - start_time) * 1000, 2)
            )

        try:
            validate_org_slug(org_slug)
            start_date = date.today() - timedelta(days=days)

            dataset_id = self._get_dataset_id(org_slug)
            table_ref = f"`{self._project_id}.{dataset_id}.genai_usage_raw`"

            sql = f"""
            SELECT
                provider,
                model,
                SUM(input_tokens) as total_input_tokens,
                SUM(output_tokens) as total_output_tokens,
                SUM(total_tokens) as total_tokens,
                COUNT(*) as request_count,
                AVG(latency_ms) as avg_latency_ms
            FROM {table_ref}
            WHERE x_org_slug = @org_slug
              AND DATE(request_timestamp) >= @start_date
            GROUP BY provider, model
            ORDER BY total_tokens DESC
            """

            query_params = [
                bigquery.ScalarQueryParameter("org_slug", "STRING", org_slug),
                bigquery.ScalarQueryParameter("start_date", "DATE", start_date),
            ]

            df = await self._execute_query(sql, query_params)
            self._cache.set(cache_key, df, ttl=120)

            return UsageResponse(
                success=True,
                data=df.to_dicts(),
                cache_hit=False,
                query_time_ms=round((time.time() - start_time) * 1000, 2)
            )

        except Exception as e:
            logger.error(f"Usage by model failed for {org_slug}: {e}")
            return UsageResponse(
                success=False,
                error=str(e),
                query_time_ms=(time.time() - start_time) * 1000
            )

    async def get_usage_daily(self, org_slug: str, days: int = 30) -> UsageResponse:
        """Get daily usage trends."""
        start_time = time.time()
        cache_key = f"{org_slug}:usage_daily:{days}"

        cached_df = self._cache.get(cache_key)
        if cached_df is not None:
            return UsageResponse(
                success=True,
                data=cached_df.to_dicts(),
                cache_hit=True,
                query_time_ms=round((time.time() - start_time) * 1000, 2)
            )

        try:
            validate_org_slug(org_slug)
            start_date = date.today() - timedelta(days=days)

            dataset_id = self._get_dataset_id(org_slug)
            table_ref = f"`{self._project_id}.{dataset_id}.genai_usage_raw`"

            sql = f"""
            SELECT
                DATE(request_timestamp) as usage_date,
                SUM(input_tokens) as total_input_tokens,
                SUM(output_tokens) as total_output_tokens,
                SUM(total_tokens) as total_tokens,
                COUNT(*) as request_count,
                AVG(latency_ms) as avg_latency_ms
            FROM {table_ref}
            WHERE x_org_slug = @org_slug
              AND DATE(request_timestamp) >= @start_date
            GROUP BY usage_date
            ORDER BY usage_date ASC
            """

            query_params = [
                bigquery.ScalarQueryParameter("org_slug", "STRING", org_slug),
                bigquery.ScalarQueryParameter("start_date", "DATE", start_date),
            ]

            df = await self._execute_query(sql, query_params)
            self._cache.set(cache_key, df, ttl=120)

            return UsageResponse(
                success=True,
                data=df.to_dicts(),
                cache_hit=False,
                query_time_ms=round((time.time() - start_time) * 1000, 2)
            )

        except Exception as e:
            logger.error(f"Usage daily failed for {org_slug}: {e}")
            return UsageResponse(
                success=False,
                error=str(e),
                query_time_ms=(time.time() - start_time) * 1000
            )

    def _calculate_usage_stats(self, df: pl.DataFrame) -> Dict[str, Any]:
        """Calculate usage statistics from DataFrame."""
        if df.is_empty():
            return {
                "total_requests": 0,
                "total_tokens": 0,
                "total_input_tokens": 0,
                "total_output_tokens": 0,
                "avg_latency_ms": 0,
                "success_rate": 100.0,
            }

        total_requests = len(df)
        total_tokens = df.select(pl.col("total_tokens").sum()).item() or 0
        total_input = df.select(pl.col("input_tokens").sum()).item() or 0
        total_output = df.select(pl.col("output_tokens").sum()).item() or 0
        avg_latency = df.select(pl.col("latency_ms").mean()).item() or 0

        success_count = df.filter(pl.col("status") == "success").height
        success_rate = (success_count / total_requests * 100) if total_requests > 0 else 100.0

        return {
            "total_requests": total_requests,
            "total_tokens": int(total_tokens),
            "total_input_tokens": int(total_input),
            "total_output_tokens": int(total_output),
            "avg_latency_ms": round(avg_latency, 2),
            "success_rate": round(success_rate, 2),
            "formatted_tokens": format_token_count(int(total_tokens)),
        }

    def _build_summary_from_df(self, df: pl.DataFrame) -> Dict[str, Any]:
        """Build summary from aggregated DataFrame."""
        if df.is_empty():
            return {
                "total_tokens": 0,
                "total_requests": 0,
                "by_provider": {},
                "by_model": [],
            }

        total_tokens = df.select(pl.col("total_tokens").sum()).item() or 0
        total_requests = df.select(pl.col("request_count").sum()).item() or 0

        by_provider = {}
        by_model = []

        for row in df.iter_rows(named=True):
            provider = row.get("provider", "unknown")
            model = row.get("model", "unknown")

            if provider not in by_provider:
                by_provider[provider] = {
                    "total_tokens": 0,
                    "request_count": 0,
                    "models": []
                }

            by_provider[provider]["total_tokens"] += row.get("total_tokens", 0) or 0
            by_provider[provider]["request_count"] += row.get("request_count", 0) or 0
            by_provider[provider]["models"].append(model)

            by_model.append({
                "provider": provider,
                "model": model,
                "total_tokens": row.get("total_tokens", 0),
                "input_tokens": row.get("total_input_tokens", 0),
                "output_tokens": row.get("total_output_tokens", 0),
                "request_count": row.get("request_count", 0),
                "avg_latency_ms": round(row.get("avg_latency_ms", 0) or 0, 2),
            })

        return {
            "total_tokens": int(total_tokens),
            "total_requests": int(total_requests),
            "formatted_tokens": format_token_count(int(total_tokens)),
            "by_provider": by_provider,
            "by_model": by_model,
        }

    def invalidate_cache(self, org_slug: str) -> int:
        """Invalidate cache for org."""
        return self._cache.invalidate_org(org_slug)

    @property
    def cache_stats(self) -> Dict[str, Any]:
        """Get cache statistics."""
        return self._cache.stats


# Thread-safe singleton instance
_usage_read_service: Optional[UsageReadService] = None
_usage_read_service_lock = threading.Lock()


def get_usage_read_service() -> UsageReadService:
    """Get singleton usage read service instance (thread-safe)."""
    global _usage_read_service

    # Quick check without lock
    if _usage_read_service is not None:
        return _usage_read_service

    # Acquire lock for creation
    with _usage_read_service_lock:
        # Double-check after acquiring lock
        if _usage_read_service is None:
            _usage_read_service = UsageReadService()
        return _usage_read_service
