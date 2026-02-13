"""
Cost MCP tools — 5 tools for querying FOCUS 1.3 cost data.
These are the ONLY functions that call BigQuery for cost data.
Agents never call BigQuery directly — they call these tools.
"""

import time
import hashlib
import logging
import calendar
from datetime import date, timedelta
from typing import Any, Dict, List, Optional, Tuple

from google.cloud import bigquery

from src.core.tools.shared import safe_query, get_dataset, default_date_range, validate_enum

logger = logging.getLogger(__name__)

# Simple TTL cache for cost query results
_query_result_cache = {}  # type: Dict[str, Tuple[Dict[str, Any], float]]
_RESULT_CACHE_TTL = 180  # 3 minutes — cost data doesn't change that fast
_RESULT_CACHE_MAX_SIZE = 500  # Prevent unbounded memory growth


def _cache_key(org_slug: str, query: str, params: Optional[str] = None) -> str:
    raw = "%s:%s:%s" % (org_slug, query, params)
    return hashlib.sha256(raw.encode()).hexdigest()[:24]


def cached_safe_query(
    org_slug: str,
    query: str,
    params: Optional[List[bigquery.ScalarQueryParameter]] = None,
) -> Dict[str, Any]:
    """safe_query with a TTL cache layer."""
    key = _cache_key(org_slug, query, str(params))
    now = time.time()
    cached = _query_result_cache.get(key)
    if cached and (now - cached[1]) < _RESULT_CACHE_TTL:
        result = cached[0].copy()
        result["cached"] = True
        return result
    result = safe_query(org_slug, query, params)
    if "error" not in result:
        # Evict expired entries if cache is too large
        if len(_query_result_cache) >= _RESULT_CACHE_MAX_SIZE:
            expired = [k for k, (_, ts) in _query_result_cache.items() if now - ts >= _RESULT_CACHE_TTL]
            for k in expired:
                del _query_result_cache[k]
            # If still too large, drop oldest half
            if len(_query_result_cache) >= _RESULT_CACHE_MAX_SIZE:
                sorted_keys = sorted(_query_result_cache, key=lambda k: _query_result_cache[k][1])
                for k in sorted_keys[:len(sorted_keys) // 2]:
                    del _query_result_cache[k]
        _query_result_cache[key] = (result, now)
    return result

# Allowed values for enum-style parameters
_VALID_GROUP_BY = {"provider", "service", "team", "day", "month", "model"}
_VALID_DIMENSIONS = {"provider", "service", "service_category", "team", "region", "model", "cost_type"}
_VALID_PERIOD_TYPES = {"MTD", "MoM", "QoQ", "YoY"}


def query_costs(
    org_slug: str,
    provider: Optional[str] = None,
    service_category: Optional[str] = None,
    cost_type: Optional[str] = None,
    start_date: Optional[str] = None,
    end_date: Optional[str] = None,
    group_by: Optional[str] = None,
    limit: int = 100,
) -> Dict[str, Any]:
    """
    Query FOCUS 1.3 cost data for an organization.
    Returns cost breakdown with BilledCost, EffectiveCost by grouping.

    Args:
        org_slug: Organization slug (required for multi-tenant isolation).
        provider: Filter by provider name (e.g., AWS, GCP, Azure, OpenAI, Anthropic, Slack, Canva).
        service_category: Filter by FOCUS ServiceCategory (e.g., Compute, AI Platform, Collaboration, Design, AI Tools, Database, Analytics, Storage).
        cost_type: Filter by cost type: 'cloud', 'genai', or 'subscription'. Cloud = GCP/AWS/Azure infrastructure. GenAI = OpenAI/Anthropic/Gemini API usage. Subscription = SaaS tools (Slack, Canva, ChatGPT Plus).
        start_date: Start date YYYY-MM-DD (defaults to first of current month).
        end_date: End date YYYY-MM-DD (defaults to today).
        group_by: Group results by: provider, service, team, day, month, model.
        limit: Maximum rows to return (1-500, default 100).
    """
    dataset = get_dataset(org_slug)
    default_start, default_end = default_date_range()
    start_date = start_date or default_start
    end_date = end_date or default_end
    limit = max(1, min(limit, 500))

    group_map = {
        "provider": "ServiceProviderName",
        "service": "ServiceName",
        "team": "x_hierarchy_entity_name",
        "day": "DATE(ChargePeriodStart)",
        "month": "FORMAT_TIMESTAMP('%Y-%m', ChargePeriodStart)",
        "model": "x_genai_model",
    }
    effective_group = group_by or "provider"
    if effective_group not in group_map:
        validate_enum(effective_group, _VALID_GROUP_BY, "group_by")
    group_col = group_map[effective_group]

    query = f"""
        SELECT
            {group_col} AS dimension,
            COUNT(*) AS line_items,
            ROUND(SUM(BilledCost), 2) AS total_billed,
            ROUND(SUM(EffectiveCost), 2) AS total_effective,
            BillingCurrency AS currency
        FROM `{dataset}.cost_data_standard_1_3`
        WHERE ChargePeriodStart >= @start_date
          AND ChargePeriodEnd <= @end_date
    """
    params: List[bigquery.ScalarQueryParameter] = [
        bigquery.ScalarQueryParameter("start_date", "STRING", start_date),
        bigquery.ScalarQueryParameter("end_date", "STRING", end_date),
    ]

    if provider:
        query += " AND ServiceProviderName = @provider"
        params.append(bigquery.ScalarQueryParameter("provider", "STRING", provider))
    if service_category:
        query += " AND ServiceCategory = @category"
        params.append(bigquery.ScalarQueryParameter("category", "STRING", service_category))
    if cost_type:
        query += " AND x_source_system = @cost_type"
        params.append(bigquery.ScalarQueryParameter("cost_type", "STRING", cost_type.lower()))

    query += " GROUP BY dimension, currency ORDER BY total_billed DESC LIMIT @limit"
    params.append(bigquery.ScalarQueryParameter("limit", "INT64", limit))

    return cached_safe_query(org_slug, query, params)


def compare_periods(
    org_slug: str,
    period_type: str = "MTD",
    provider: Optional[str] = None,
) -> Dict[str, Any]:
    """
    Compare costs across time periods.

    Args:
        org_slug: Organization slug.
        period_type: Comparison type — MTD, MoM, QoQ, YoY.
        provider: Optional provider filter.
    """
    validate_enum(period_type, _VALID_PERIOD_TYPES, "period_type")
    dataset = get_dataset(org_slug)
    today = date.today()

    if period_type == "MTD":
        current_start = today.replace(day=1)
        if today.month == 1:
            prev_start = date(today.year - 1, 12, 1)
            prev_end = date(today.year - 1, 12, min(today.day, 31))
        else:
            prev_start = date(today.year, today.month - 1, 1)
            prev_max_day = calendar.monthrange(today.year, today.month - 1)[1]
            prev_end = date(today.year, today.month - 1, min(today.day, prev_max_day))
        current_end = today
    elif period_type == "MoM":
        current_start = today.replace(day=1)
        current_end = today
        if today.month == 1:
            prev_start = date(today.year - 1, 12, 1)
            prev_end = date(today.year - 1, 12, 31)
        else:
            prev_start = date(today.year, today.month - 1, 1)
            prev_end = (current_start - timedelta(days=1))
    elif period_type == "YoY":
        current_start = date(today.year, 1, 1)
        current_end = today
        prev_start = date(today.year - 1, 1, 1)
        # Handle Feb 29 in leap years — clamp to last day of prev year's month
        prev_max_day = calendar.monthrange(today.year - 1, today.month)[1]
        prev_end = date(today.year - 1, today.month, min(today.day, prev_max_day))
    else:  # QoQ
        current_quarter_month = ((today.month - 1) // 3) * 3 + 1
        current_start = date(today.year, current_quarter_month, 1)
        current_end = today
        if current_quarter_month == 1:
            prev_start = date(today.year - 1, 10, 1)
            prev_end = date(today.year - 1, 12, 31)
        else:
            prev_quarter_month = current_quarter_month - 3
            prev_start = date(today.year, prev_quarter_month, 1)
            prev_end = current_start - timedelta(days=1)

    provider_filter = ""
    params: List[bigquery.ScalarQueryParameter] = [
        bigquery.ScalarQueryParameter("curr_start", "STRING", current_start.isoformat()),
        bigquery.ScalarQueryParameter("curr_end", "STRING", current_end.isoformat()),
        bigquery.ScalarQueryParameter("prev_start", "STRING", prev_start.isoformat()),
        bigquery.ScalarQueryParameter("prev_end", "STRING", prev_end.isoformat()),
    ]
    if provider:
        provider_filter = "AND ServiceProviderName = @provider"
        params.append(bigquery.ScalarQueryParameter("provider", "STRING", provider))

    query = f"""
        SELECT
            'current' AS period,
            ROUND(SUM(BilledCost), 2) AS total_billed,
            ROUND(SUM(EffectiveCost), 2) AS total_effective,
            BillingCurrency AS currency
        FROM `{dataset}.cost_data_standard_1_3`
        WHERE ChargePeriodStart >= @curr_start AND ChargePeriodEnd <= @curr_end
            {provider_filter}
        GROUP BY currency
        UNION ALL
        SELECT
            'previous' AS period,
            ROUND(SUM(BilledCost), 2) AS total_billed,
            ROUND(SUM(EffectiveCost), 2) AS total_effective,
            BillingCurrency AS currency
        FROM `{dataset}.cost_data_standard_1_3`
        WHERE ChargePeriodStart >= @prev_start AND ChargePeriodEnd <= @prev_end
            {provider_filter}
        GROUP BY currency
    """

    result = safe_query(org_slug, query, params)

    # Propagate errors from safe_query
    if "error" in result:
        return result

    current = next((r for r in result["rows"] if r["period"] == "current"), {})
    previous = next((r for r in result["rows"] if r["period"] == "previous"), {})
    curr_total = current.get("total_billed", 0) or 0
    prev_total = previous.get("total_billed", 0) or 0
    change_pct = ((curr_total - prev_total) / prev_total * 100) if prev_total else 0

    return {
        "org_slug": org_slug,
        "period_type": period_type,
        "current": {"total_billed": curr_total, "start": current_start.isoformat(), "end": current_end.isoformat()},
        "previous": {"total_billed": prev_total, "start": prev_start.isoformat(), "end": prev_end.isoformat()},
        "change_pct": round(change_pct, 1),
        "currency": current.get("currency", "USD"),
    }


def cost_breakdown(
    org_slug: str,
    dimension: str = "provider",
    cost_type: Optional[str] = None,
    start_date: Optional[str] = None,
    end_date: Optional[str] = None,
) -> Dict[str, Any]:
    """
    Get cost breakdown by dimension with percentages.

    Args:
        org_slug: Organization slug.
        dimension: Breakdown by: provider, service, service_category, cost_type, team, region, model. Use cost_type to see cloud vs genai vs subscription totals.
        cost_type: Filter by cost type: 'cloud', 'genai', or 'subscription'.
        start_date: Start date YYYY-MM-DD.
        end_date: End date YYYY-MM-DD.
    """
    dataset = get_dataset(org_slug)
    default_start, default_end = default_date_range()
    start_date = start_date or default_start
    end_date = end_date or default_end

    dim_map = {
        "provider": "ServiceProviderName",
        "service": "ServiceName",
        "service_category": "ServiceCategory",
        "cost_type": "x_source_system",
        "team": "x_hierarchy_entity_name",
        "region": "RegionName",
        "model": "x_genai_model",
    }
    validate_enum(dimension, _VALID_DIMENSIONS, "dimension")
    dim_col = dim_map[dimension]

    query = f"""
        SELECT
            {dim_col} AS dimension,
            ROUND(SUM(BilledCost), 2) AS total_billed,
            ROUND(SUM(EffectiveCost), 2) AS total_effective,
            ROUND(SUM(BilledCost) / SUM(SUM(BilledCost)) OVER() * 100, 1) AS pct_of_total,
            BillingCurrency AS currency
        FROM `{dataset}.cost_data_standard_1_3`
        WHERE ChargePeriodStart >= @start_date AND ChargePeriodEnd <= @end_date
    """
    params = [
        bigquery.ScalarQueryParameter("start_date", "STRING", start_date),
        bigquery.ScalarQueryParameter("end_date", "STRING", end_date),
    ]

    if cost_type:
        query += " AND x_source_system = @cost_type"
        params.append(bigquery.ScalarQueryParameter("cost_type", "STRING", cost_type.lower()))

    query += """
        GROUP BY dimension, currency
        ORDER BY total_billed DESC
        LIMIT 50
    """

    return cached_safe_query(org_slug, query, params)


def cost_forecast(
    org_slug: str,
    horizon_days: int = 30,
) -> Dict[str, Any]:
    """
    Forecast costs using linear projection from recent data.

    Args:
        org_slug: Organization slug.
        horizon_days: Days to forecast (1-90, default 30).
    """
    dataset = get_dataset(org_slug)
    horizon_days = max(1, min(horizon_days, 90))
    lookback = max(horizon_days, 30)

    query = f"""
        WITH daily_costs AS (
            SELECT
                DATE(ChargePeriodStart) AS cost_date,
                ROUND(SUM(BilledCost), 2) AS daily_total
            FROM `{dataset}.cost_data_standard_1_3`
            WHERE ChargePeriodStart >= TIMESTAMP_SUB(CURRENT_TIMESTAMP(), INTERVAL @lookback DAY)
            GROUP BY cost_date
        )
        SELECT
            ROUND(AVG(daily_total), 2) AS avg_daily,
            ROUND(MIN(daily_total), 2) AS min_daily,
            ROUND(MAX(daily_total), 2) AS max_daily,
            COUNT(*) AS days_with_data
        FROM daily_costs
    """
    params = [bigquery.ScalarQueryParameter("lookback", "INT64", lookback)]

    result = cached_safe_query(org_slug, query, params)
    if result["rows"]:
        stats = result["rows"][0]
        avg = stats.get("avg_daily", 0) or 0
        result["forecast"] = {
            "horizon_days": horizon_days,
            "projected_total": round(avg * horizon_days, 2),
            "avg_daily": avg,
            "min_daily": stats.get("min_daily", 0),
            "max_daily": stats.get("max_daily", 0),
            "confidence": "low" if (stats.get("days_with_data", 0) or 0) < 14 else "medium",
        }
    return result


def top_cost_drivers(
    org_slug: str,
    days: int = 7,
    limit: int = 10,
) -> Dict[str, Any]:
    """
    Find top cost drivers — services with the highest spend or biggest changes.

    Args:
        org_slug: Organization slug.
        days: Lookback period (1-90, default 7).
        limit: Number of top drivers to return (1-20, default 10).
    """
    dataset = get_dataset(org_slug)
    days = max(1, min(days, 90))
    limit = max(1, min(limit, 20))

    days_double = days * 2

    query = f"""
        WITH current_period AS (
            SELECT ServiceName, ServiceProviderName,
                   ROUND(SUM(BilledCost), 2) AS current_cost
            FROM `{dataset}.cost_data_standard_1_3`
            WHERE ChargePeriodStart >= TIMESTAMP_SUB(CURRENT_TIMESTAMP(), INTERVAL @days DAY)
            GROUP BY ServiceName, ServiceProviderName
        ),
        previous_period AS (
            SELECT ServiceName, ServiceProviderName,
                   ROUND(SUM(BilledCost), 2) AS previous_cost
            FROM `{dataset}.cost_data_standard_1_3`
            WHERE ChargePeriodStart >= TIMESTAMP_SUB(CURRENT_TIMESTAMP(), INTERVAL @days_double DAY)
              AND ChargePeriodStart < TIMESTAMP_SUB(CURRENT_TIMESTAMP(), INTERVAL @days DAY)
            GROUP BY ServiceName, ServiceProviderName
        )
        SELECT
            c.ServiceName AS service,
            c.ServiceProviderName AS provider,
            c.current_cost,
            COALESCE(p.previous_cost, 0) AS previous_cost,
            ROUND(c.current_cost - COALESCE(p.previous_cost, 0), 2) AS absolute_change,
            CASE WHEN COALESCE(p.previous_cost, 0) > 0
                THEN ROUND((c.current_cost - p.previous_cost) / p.previous_cost * 100, 1)
                ELSE NULL END AS pct_change
        FROM current_period c
        LEFT JOIN previous_period p
            ON c.ServiceName = p.ServiceName AND c.ServiceProviderName = p.ServiceProviderName
        ORDER BY c.current_cost DESC
        LIMIT @limit
    """
    params = [
        bigquery.ScalarQueryParameter("days", "INT64", days),
        bigquery.ScalarQueryParameter("days_double", "INT64", days_double),
        bigquery.ScalarQueryParameter("limit", "INT64", limit),
    ]

    return cached_safe_query(org_slug, query, params)
