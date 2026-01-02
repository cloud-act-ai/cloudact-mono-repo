"""
Pipeline Read Service

High-performance, read-only pipeline execution history service using Polars DataFrames.
For dashboard reads only - pipeline execution is handled by pipeline-service (8001).

Features:
- Polars lazy evaluation for aggregations
- LRU cache with TTL for run history
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
from src.core.services.pipeline_read.models import PipelineQuery, PipelineResponse

logger = logging.getLogger(__name__)


class PipelineReadService:
    """
    Read-only pipeline execution history service.

    Uses Polars for aggregations and caching for dashboard performance.
    Pipeline execution is handled by pipeline-service (8001).
    """

    def __init__(self, cache_ttl: int = 30):
        self._cache = create_cache("PIPELINE", max_size=500, default_ttl=cache_ttl)
        self._bq_client = None
        self._project_id = settings.gcp_project_id

    @property
    def bq_client(self):
        """Lazy-load BigQuery client."""
        if self._bq_client is None:
            self._bq_client = get_bigquery_client()
        return self._bq_client

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

    def _build_runs_query(self, query: PipelineQuery) -> tuple:
        """Build parameterized query for pipeline runs."""
        validate_org_slug(query.org_slug)

        table_ref = f"`{self._project_id}.organizations.org_meta_pipeline_runs`"

        # Resolve dates (handles period or defaults to last 30 days)
        resolved_start, resolved_end = query.resolve_dates()

        where_conditions = ["org_slug = @org_slug"]
        query_params = [
            bigquery.ScalarQueryParameter("org_slug", "STRING", query.org_slug)
        ]

        if query.status_filter:
            where_conditions.append("status IN UNNEST(@statuses)")
            query_params.append(
                bigquery.ArrayQueryParameter("statuses", "STRING", query.status_filter)
            )

        if query.pipeline_id:
            where_conditions.append("pipeline_id LIKE @pipeline_id")
            query_params.append(
                bigquery.ScalarQueryParameter("pipeline_id", "STRING", f"%{query.pipeline_id}%")
            )

        if query.trigger_type:
            where_conditions.append("trigger_type = @trigger_type")
            query_params.append(
                bigquery.ScalarQueryParameter("trigger_type", "STRING", query.trigger_type.lower())
            )

        # Always use resolved dates
        where_conditions.append("run_date >= @start_date")
        query_params.append(
            bigquery.ScalarQueryParameter("start_date", "DATE", resolved_start)
        )

        where_conditions.append("run_date <= @end_date")
        query_params.append(
            bigquery.ScalarQueryParameter("end_date", "DATE", resolved_end)
        )

        where_clause = " AND ".join(where_conditions)

        sql = f"""
        SELECT
            pipeline_logging_id,
            pipeline_id,
            status,
            trigger_type,
            trigger_by,
            start_time,
            end_time,
            CAST(duration_ms AS INT64) as duration_ms,
            run_date,
            error_message,
            error_context,
            parameters
        FROM {table_ref}
        WHERE {where_clause}
        ORDER BY start_time DESC
        LIMIT @limit OFFSET @offset
        """

        query_params.extend([
            bigquery.ScalarQueryParameter("limit", "INT64", query.limit),
            bigquery.ScalarQueryParameter("offset", "INT64", query.offset),
        ])

        return sql, query_params

    async def get_pipeline_runs(self, query: PipelineQuery) -> PipelineResponse:
        """Get pipeline runs for organization."""
        start_time = time.time()
        cache_key = f"{query.org_slug}:runs:{query.cache_key()}"

        cached_df = self._cache.get(cache_key)
        if cached_df is not None:
            query_time = (time.time() - start_time) * 1000
            data = cached_df.to_dicts()
            stats = self._calculate_run_stats(cached_df)

            return PipelineResponse(
                success=True,
                data=data,
                stats=stats,
                total=len(data),
                cache_hit=True,
                query_time_ms=round(query_time, 2)
            )

        try:
            sql, query_params = self._build_runs_query(query)
            df = await self._execute_query(sql, query_params)

            self._cache.set(cache_key, df, ttl=30)

            data = df.to_dicts()
            stats = self._calculate_run_stats(df)
            query_time = (time.time() - start_time) * 1000

            return PipelineResponse(
                success=True,
                data=data,
                stats=stats,
                total=len(data),
                cache_hit=False,
                query_time_ms=round(query_time, 2)
            )

        except Exception as e:
            logger.error(f"Pipeline runs query failed for {query.org_slug}: {e}")
            return PipelineResponse(
                success=False,
                error=str(e),
                query_time_ms=(time.time() - start_time) * 1000
            )

    async def get_run_summary(self, org_slug: str, days: int = 7) -> PipelineResponse:
        """Get aggregated pipeline run summary."""
        start_time = time.time()
        cache_key = f"{org_slug}:run_summary:{days}"

        cached_df = self._cache.get(cache_key)
        if cached_df is not None:
            query_time = (time.time() - start_time) * 1000
            summary = self._build_summary_from_df(cached_df)
            return PipelineResponse(
                success=True,
                summary=summary,
                cache_hit=True,
                query_time_ms=round(query_time, 2)
            )

        try:
            validate_org_slug(org_slug)
            start_date = date.today() - timedelta(days=days)

            sql = f"""
            SELECT
                pipeline_id,
                status,
                trigger_type,
                run_date,
                CAST(duration_ms AS INT64) as duration_ms,
                start_time
            FROM `{self._project_id}.organizations.org_meta_pipeline_runs`
            WHERE org_slug = @org_slug
              AND run_date >= @start_date
            ORDER BY start_time DESC
            """

            query_params = [
                bigquery.ScalarQueryParameter("org_slug", "STRING", org_slug),
                bigquery.ScalarQueryParameter("start_date", "DATE", start_date),
            ]

            df = await self._execute_query(sql, query_params)
            self._cache.set(cache_key, df, ttl=60)

            summary = self._build_summary_from_df(df)
            query_time = (time.time() - start_time) * 1000

            return PipelineResponse(
                success=True,
                summary=summary,
                cache_hit=False,
                query_time_ms=round(query_time, 2)
            )

        except Exception as e:
            logger.error(f"Pipeline summary failed for {org_slug}: {e}")
            return PipelineResponse(
                success=False,
                error=str(e),
                query_time_ms=(time.time() - start_time) * 1000
            )

    def _calculate_run_stats(self, df: pl.DataFrame) -> Dict[str, Any]:
        """Calculate run statistics from DataFrame."""
        if df.is_empty():
            return {
                "total_runs": 0,
                "completed": 0,
                "failed": 0,
                "running": 0,
                "success_rate": 100.0,
                "avg_duration_ms": 0,
            }

        status_counts = (
            df.lazy()
            .group_by("status")
            .agg(pl.count().alias("count"))
            .collect()
        )

        counts = {row["status"]: row["count"] for row in status_counts.iter_rows(named=True)}
        total = len(df)
        completed = counts.get("COMPLETED", 0)
        failed = counts.get("FAILED", 0)
        running = counts.get("RUNNING", 0)

        finished = completed + failed
        success_rate = round((completed / finished) * 100, 2) if finished > 0 else 100.0

        avg_duration = df.select(pl.col("duration_ms").mean()).item() or 0

        return {
            "total_runs": total,
            "completed": completed,
            "failed": failed,
            "running": running,
            "pending": counts.get("PENDING", 0),
            "success_rate": success_rate,
            "avg_duration_ms": round(avg_duration, 2),
        }

    def _build_summary_from_df(self, df: pl.DataFrame) -> Dict[str, Any]:
        """Build summary statistics from DataFrame."""
        if df.is_empty():
            return {
                "total_runs": 0,
                "by_status": {},
                "by_pipeline": {},
                "by_date": [],
                "success_rate": 100.0,
            }

        # Status breakdown
        status_breakdown = (
            df.lazy()
            .group_by("status")
            .agg(pl.count().alias("count"))
            .collect()
        )
        by_status = {row["status"]: row["count"] for row in status_breakdown.iter_rows(named=True)}

        # Pipeline breakdown
        pipeline_breakdown = (
            df.lazy()
            .group_by("pipeline_id")
            .agg([
                pl.count().alias("total"),
                (pl.col("status") == "COMPLETED").sum().alias("completed"),
                (pl.col("status") == "FAILED").sum().alias("failed"),
                pl.col("duration_ms").mean().alias("avg_duration"),
            ])
            .collect()
        )
        by_pipeline = {}
        for row in pipeline_breakdown.iter_rows(named=True):
            total = row["total"]
            completed = row["completed"]
            by_pipeline[row["pipeline_id"]] = {
                "total": total,
                "completed": completed,
                "failed": row["failed"],
                "success_rate": round((completed / total) * 100, 2) if total > 0 else 100.0,
                "avg_duration_ms": round(row["avg_duration"] or 0, 2),
            }

        # Daily breakdown
        daily_breakdown = (
            df.lazy()
            .group_by("run_date")
            .agg([
                pl.count().alias("total"),
                (pl.col("status") == "COMPLETED").sum().alias("completed"),
                (pl.col("status") == "FAILED").sum().alias("failed"),
            ])
            .sort("run_date")
            .collect()
        )
        by_date = [
            {
                "date": str(row["run_date"]),
                "total": row["total"],
                "completed": row["completed"],
                "failed": row["failed"],
            }
            for row in daily_breakdown.iter_rows(named=True)
        ]

        # Overall success rate
        total_runs = len(df)
        completed_runs = by_status.get("COMPLETED", 0)
        failed_runs = by_status.get("FAILED", 0)
        finished = completed_runs + failed_runs
        success_rate = round((completed_runs / finished) * 100, 2) if finished > 0 else 100.0

        return {
            "total_runs": total_runs,
            "by_status": by_status,
            "by_pipeline": by_pipeline,
            "by_date": by_date,
            "success_rate": success_rate,
        }

    def invalidate_cache(self, org_slug: str) -> int:
        """Invalidate cache for org after pipeline execution."""
        return self._cache.invalidate_org(org_slug)

    @property
    def cache_stats(self) -> Dict[str, Any]:
        """Get cache statistics."""
        return self._cache.stats


# Thread-safe singleton instance
_pipeline_read_service: Optional[PipelineReadService] = None
_pipeline_read_service_lock = threading.Lock()


def get_pipeline_read_service() -> PipelineReadService:
    """Get singleton pipeline read service instance (thread-safe)."""
    global _pipeline_read_service
    # Fast path: already initialized
    if _pipeline_read_service is not None:
        return _pipeline_read_service
    # Slow path: need to initialize with lock
    with _pipeline_read_service_lock:
        # Double-check after acquiring lock
        if _pipeline_read_service is None:
            _pipeline_read_service = PipelineReadService()
        return _pipeline_read_service
