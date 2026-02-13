"""
Usage MCP tools — 4 tools for analyzing GenAI and pipeline usage.

BQ table: organizations.org_usage_quotas
Columns: usage_id, org_slug, usage_date (DATE), pipelines_run_today,
         pipelines_succeeded_today, pipelines_failed_today, pipelines_run_month,
         concurrent_pipelines_running, daily_limit, monthly_limit, concurrent_limit,
         seat_limit, providers_limit, max_concurrent_reached,
         last_pipeline_completed_at, last_updated, created_at, updated_at.

BQ table: organizations.org_meta_pipeline_runs
Columns: pipeline_logging_id, org_slug, pipeline_id, status, trigger_type,
         trigger_by, user_id, org_api_key_id, start_time (TIMESTAMP),
         end_time (TIMESTAMP), duration_ms, run_date (DATE),
         parameters (JSON), run_metadata (JSON), error_message, error_context (JSON),
         created_at (TIMESTAMP).
"""

import logging
from typing import Any, Dict, Optional

from google.cloud import bigquery

from src.core.tools.shared import safe_query, get_dataset, get_org_dataset, default_date_range, validate_enum

logger = logging.getLogger(__name__)

_VALID_CONSUMER_DIMENSIONS = {"model", "service", "provider"}
_VALID_PIPELINE_STATUSES = {"COMPLETED", "FAILED", "RUNNING", "CANCELLED"}


def genai_usage(
    org_slug: str,
    provider: Optional[str] = None,
    model: Optional[str] = None,
    start_date: Optional[str] = None,
    end_date: Optional[str] = None,
) -> Dict[str, Any]:
    """
    Query GenAI usage metrics — tokens, requests, costs by model.

    Args:
        org_slug: Organization slug.
        provider: Filter by GenAI provider (e.g., openai, anthropic, gemini).
        model: Filter by specific model (e.g., gpt-4o, claude-opus-4).
        start_date: Start date YYYY-MM-DD.
        end_date: End date YYYY-MM-DD.
    """
    dataset = get_dataset(org_slug)
    default_start, default_end = default_date_range()
    start_date = start_date or default_start
    end_date = end_date or default_end

    query = f"""
        SELECT
            ServiceProviderName AS provider,
            x_genai_model AS model,
            COUNT(*) AS request_count,
            ROUND(SUM(ConsumedQuantity), 0) AS total_tokens,
            ROUND(SUM(BilledCost), 2) AS total_cost,
            BillingCurrency AS currency
        FROM `{dataset}.cost_data_standard_1_3`
        WHERE x_source_system = 'genai'
          AND ChargePeriodStart >= @start_date
          AND ChargePeriodEnd <= @end_date
    """
    params = [
        bigquery.ScalarQueryParameter("start_date", "STRING", start_date),
        bigquery.ScalarQueryParameter("end_date", "STRING", end_date),
    ]

    if provider:
        query += " AND ServiceProviderName = @provider"
        params.append(bigquery.ScalarQueryParameter("provider", "STRING", provider))
    if model:
        query += " AND x_genai_model = @model"
        params.append(bigquery.ScalarQueryParameter("model", "STRING", model))

    query += " GROUP BY provider, model, currency ORDER BY total_cost DESC LIMIT 50"

    return safe_query(org_slug, query, params)


def quota_status(
    org_slug: str,
) -> Dict[str, Any]:
    """
    Get current quota usage for the organization.

    Args:
        org_slug: Organization slug.
    """
    dataset = get_org_dataset()

    query = f"""
        SELECT
            org_slug, usage_date,
            pipelines_run_today, daily_limit,
            pipelines_run_month, monthly_limit,
            concurrent_pipelines_running, concurrent_limit,
            pipelines_succeeded_today, pipelines_failed_today,
            seat_limit, providers_limit
        FROM `{dataset}.org_usage_quotas`
        WHERE org_slug = @org_slug
        ORDER BY usage_date DESC
        LIMIT 1
    """
    params = [bigquery.ScalarQueryParameter("org_slug", "STRING", org_slug)]

    result = safe_query(org_slug, query, params)

    if result["rows"]:
        row = result["rows"][0]
        result["summary"] = {
            "daily_used": row.get("pipelines_run_today", 0),
            "daily_limit": row.get("daily_limit", 0),
            "daily_remaining": max(0, (row.get("daily_limit", 0) or 0) - (row.get("pipelines_run_today", 0) or 0)),
            "monthly_used": row.get("pipelines_run_month", 0),
            "monthly_limit": row.get("monthly_limit", 0),
            "concurrent_running": row.get("concurrent_pipelines_running", 0),
            "concurrent_limit": row.get("concurrent_limit", 0),
            "succeeded_today": row.get("pipelines_succeeded_today", 0),
            "failed_today": row.get("pipelines_failed_today", 0),
        }
    return result


def top_consumers(
    org_slug: str,
    dimension: str = "model",
    limit: int = 10,
) -> Dict[str, Any]:
    """
    Find top consumers of resources — by model, service, or provider.

    Args:
        org_slug: Organization slug.
        dimension: Rank by: model, service, provider.
        limit: Top N results (1-20, default 10).
    """
    dataset = get_dataset(org_slug)
    limit = max(1, min(limit, 20))

    dim_map = {
        "model": "x_genai_model",
        "service": "ServiceName",
        "provider": "ServiceProviderName",
    }
    validate_enum(dimension, _VALID_CONSUMER_DIMENSIONS, "dimension")
    dim_col = dim_map[dimension]

    # Use TIMESTAMP_SUB for TIMESTAMP column comparison
    query = f"""
        SELECT
            {dim_col} AS dimension,
            COUNT(*) AS request_count,
            ROUND(SUM(BilledCost), 2) AS total_cost,
            ROUND(SUM(ConsumedQuantity), 0) AS total_usage,
            BillingCurrency AS currency
        FROM `{dataset}.cost_data_standard_1_3`
        WHERE ChargePeriodStart >= TIMESTAMP_SUB(CURRENT_TIMESTAMP(), INTERVAL 30 DAY)
          AND {dim_col} IS NOT NULL
        GROUP BY dimension, currency
        ORDER BY total_cost DESC
        LIMIT @limit
    """
    params = [bigquery.ScalarQueryParameter("limit", "INT64", limit)]

    return safe_query(org_slug, query, params)


def pipeline_runs(
    org_slug: str,
    status: Optional[str] = None,
    limit: int = 20,
) -> Dict[str, Any]:
    """
    View recent pipeline execution history.

    Args:
        org_slug: Organization slug.
        status: Filter by status (COMPLETED, FAILED, RUNNING).
        limit: Maximum results (1-50, default 20).
    """
    dataset = get_org_dataset()
    limit = max(1, min(limit, 50))

    query = f"""
        SELECT
            pipeline_logging_id, pipeline_id, status,
            trigger_type, trigger_by,
            start_time, end_time, duration_ms,
            run_date, error_message
        FROM `{dataset}.org_meta_pipeline_runs`
        WHERE org_slug = @org_slug
    """
    params = [bigquery.ScalarQueryParameter("org_slug", "STRING", org_slug)]

    if status:
        validate_enum(status, _VALID_PIPELINE_STATUSES, "status")
        query += " AND status = @status"
        params.append(bigquery.ScalarQueryParameter("status", "STRING", status))

    query += " ORDER BY start_time DESC LIMIT @limit"
    params.append(bigquery.ScalarQueryParameter("limit", "INT64", limit))

    return safe_query(org_slug, query, params)
