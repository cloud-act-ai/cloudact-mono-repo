"""
Usage MCP tools — 4 tools for analyzing GenAI and pipeline usage.
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
        WHERE ServiceCategory = 'AI and Machine Learning'
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
            daily_pipeline_runs, daily_pipeline_limit,
            monthly_pipeline_runs, monthly_pipeline_limit,
            concurrent_pipeline_runs, concurrent_pipeline_limit
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
            "daily_used": row.get("daily_pipeline_runs", 0),
            "daily_limit": row.get("daily_pipeline_limit", 0),
            "daily_remaining": max(0, (row.get("daily_pipeline_limit", 0) or 0) - (row.get("daily_pipeline_runs", 0) or 0)),
            "monthly_used": row.get("monthly_pipeline_runs", 0),
            "monthly_limit": row.get("monthly_pipeline_limit", 0),
        }
    return result


def top_consumers(
    org_slug: str,
    dimension: str = "model",
    limit: int = 10,
) -> Dict[str, Any]:
    """
    Find top consumers of resources — by model, service, or user.

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

    query = f"""
        SELECT
            {dim_col} AS dimension,
            COUNT(*) AS request_count,
            ROUND(SUM(BilledCost), 2) AS total_cost,
            ROUND(SUM(ConsumedQuantity), 0) AS total_usage,
            BillingCurrency AS currency
        FROM `{dataset}.cost_data_standard_1_3`
        WHERE ChargePeriodStart >= DATE_SUB(CURRENT_DATE(), INTERVAL 30 DAY)
          AND {dim_col} IS NOT NULL
        GROUP BY dimension, currency
        ORDER BY total_cost DESC
        LIMIT {limit}
    """

    return safe_query(org_slug, query)


def pipeline_runs(
    org_slug: str,
    provider: Optional[str] = None,
    status: Optional[str] = None,
    limit: int = 20,
) -> Dict[str, Any]:
    """
    View recent pipeline execution history.

    Args:
        org_slug: Organization slug.
        provider: Filter by provider.
        status: Filter by status (COMPLETED, FAILED, RUNNING).
        limit: Maximum results (1-50, default 20).
    """
    dataset = get_org_dataset()
    limit = max(1, min(limit, 50))

    query = f"""
        SELECT
            run_id, pipeline_id, provider, domain, status,
            started_at, completed_at, duration_ms, error_message
        FROM `{dataset}.org_meta_pipeline_runs`
        WHERE org_slug = @org_slug
    """
    params = [bigquery.ScalarQueryParameter("org_slug", "STRING", org_slug)]

    if provider:
        query += " AND provider = @provider"
        params.append(bigquery.ScalarQueryParameter("provider", "STRING", provider))
    if status:
        validate_enum(status, _VALID_PIPELINE_STATUSES, "status")
        query += " AND status = @status"
        params.append(bigquery.ScalarQueryParameter("status", "STRING", status))

    query += f" ORDER BY started_at DESC LIMIT {limit}"

    return safe_query(org_slug, query, params)
