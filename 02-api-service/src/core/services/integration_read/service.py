"""
Integration Read Service

High-performance, read-only integration status service using Polars DataFrames.
For dashboard reads only - CRUD operations use direct BigQuery in routers.

Features:
- Polars lazy evaluation for aggregations
- LRU cache with TTL for status data
- Multi-tenant isolation via org_slug
- Zero-copy data sharing via Arrow format
"""

import polars as pl
import logging
import asyncio
import time
from typing import Optional, List, Dict, Any

from google.cloud import bigquery
from src.core.engine.bq_client import get_bigquery_client
from src.app.config import settings
from src.core.services._shared import LRUCache, validate_org_slug, create_cache
from src.core.services.integration_read.models import IntegrationQuery, IntegrationResponse
from src.lib.integrations import (
    aggregate_by_category,
    aggregate_by_provider,
    calculate_integration_health,
    calculate_status_counts,
)

logger = logging.getLogger(__name__)


class IntegrationReadService:
    """
    Read-only integration status service.

    Uses Polars for aggregations and caching for dashboard performance.
    CRUD operations are handled by routers/integrations.py directly.
    """

    def __init__(self, cache_ttl: int = 60):
        self._cache = create_cache("INTEGRATION", max_size=500, default_ttl=cache_ttl)
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

    def _build_status_query(self, query: IntegrationQuery) -> tuple:
        """Build parameterized query for integration status."""
        validate_org_slug(query.org_slug)

        table_ref = f"`{self._project_id}.organizations.org_integration_credentials`"

        where_conditions = ["org_slug = @org_slug"]
        query_params = [
            bigquery.ScalarQueryParameter("org_slug", "STRING", query.org_slug)
        ]

        if not query.include_inactive:
            where_conditions.append("is_active = TRUE")

        if query.status_filter:
            where_conditions.append("validation_status IN UNNEST(@statuses)")
            query_params.append(
                bigquery.ArrayQueryParameter("statuses", "STRING", query.status_filter)
            )

        if query.provider_filter:
            where_conditions.append("provider IN UNNEST(@providers)")
            query_params.append(
                bigquery.ArrayQueryParameter("providers", "STRING", query.provider_filter)
            )

        where_clause = " AND ".join(where_conditions)

        sql = f"""
        SELECT
            credential_id,
            provider,
            credential_name,
            validation_status,
            last_validated_at,
            last_error,
            is_active,
            created_at,
            updated_at,
            expires_at
        FROM {table_ref}
        WHERE {where_clause}
        ORDER BY provider, created_at DESC
        """

        return sql, query_params

    async def get_integrations(self, query: IntegrationQuery) -> IntegrationResponse:
        """Get integration data for organization."""
        start_time = time.time()
        cache_key = f"{query.org_slug}:integrations:{query.cache_key()}"

        cached_df = self._cache.get(cache_key)
        if cached_df is not None:
            query_time = (time.time() - start_time) * 1000
            data = cached_df.to_dicts()
            health = calculate_integration_health(data)

            return IntegrationResponse(
                success=True,
                data=data,
                health={
                    "total": health.total_integrations,
                    "valid": health.valid_count,
                    "invalid": health.invalid_count,
                    "health_percentage": health.health_percentage,
                    "requires_attention": health.requires_attention,
                    "attention_providers": health.attention_providers,
                },
                cache_hit=True,
                query_time_ms=round(query_time, 2)
            )

        try:
            sql, query_params = self._build_status_query(query)
            df = await self._execute_query(sql, query_params)

            self._cache.set(cache_key, df, ttl=60)

            data = df.to_dicts()
            health = calculate_integration_health(data)
            query_time = (time.time() - start_time) * 1000

            return IntegrationResponse(
                success=True,
                data=data,
                health={
                    "total": health.total_integrations,
                    "valid": health.valid_count,
                    "invalid": health.invalid_count,
                    "health_percentage": health.health_percentage,
                    "requires_attention": health.requires_attention,
                    "attention_providers": health.attention_providers,
                },
                cache_hit=False,
                query_time_ms=round(query_time, 2)
            )

        except Exception as e:
            logger.error(f"Integration query failed for {query.org_slug}: {e}")
            return IntegrationResponse(
                success=False,
                error=str(e),
                query_time_ms=(time.time() - start_time) * 1000
            )

    async def get_integration_summary(self, org_slug: str) -> IntegrationResponse:
        """Get aggregated integration summary by category."""
        start_time = time.time()
        cache_key = f"{org_slug}:integration_summary"

        cached_df = self._cache.get(cache_key)
        if cached_df is not None:
            query_time = (time.time() - start_time) * 1000
            summary = self._build_summary_from_df(cached_df)
            return IntegrationResponse(
                success=True,
                summary=summary,
                cache_hit=True,
                query_time_ms=round(query_time, 2)
            )

        try:
            query = IntegrationQuery(org_slug=org_slug)
            sql, query_params = self._build_status_query(query)
            df = await self._execute_query(sql, query_params)

            self._cache.set(cache_key, df, ttl=120)

            summary = self._build_summary_from_df(df)
            query_time = (time.time() - start_time) * 1000

            return IntegrationResponse(
                success=True,
                summary=summary,
                cache_hit=False,
                query_time_ms=round(query_time, 2)
            )

        except Exception as e:
            logger.error(f"Integration summary failed for {org_slug}: {e}")
            return IntegrationResponse(
                success=False,
                error=str(e),
                query_time_ms=(time.time() - start_time) * 1000
            )

    def _build_summary_from_df(self, df: pl.DataFrame) -> Dict[str, Any]:
        """Build summary statistics from DataFrame."""
        if df.is_empty():
            return {
                "total": 0,
                "by_status": {},
                "by_category": {},
                "by_provider": [],
            }

        status_counts = calculate_status_counts(df.to_dicts())
        category_breakdown = aggregate_by_category(df)
        provider_breakdown = aggregate_by_provider(df)

        return {
            "total": status_counts["total"],
            "by_status": {
                "valid": status_counts["VALID"],
                "invalid": status_counts["INVALID"],
                "pending": status_counts["PENDING"],
            },
            "by_category": {item["category"]: item for item in category_breakdown},
            "by_provider": provider_breakdown,
        }

    def invalidate_cache(self, org_slug: str) -> int:
        """Invalidate cache for org after CRUD operations."""
        return self._cache.invalidate_org(org_slug)

    @property
    def cache_stats(self) -> Dict[str, Any]:
        """Get cache statistics."""
        return self._cache.stats


# Singleton instance
_integration_read_service: Optional[IntegrationReadService] = None


def get_integration_read_service() -> IntegrationReadService:
    """Get singleton integration read service instance."""
    global _integration_read_service
    if _integration_read_service is None:
        _integration_read_service = IntegrationReadService()
    return _integration_read_service
