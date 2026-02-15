"""
Budget MCP tools — 4 read-only tools for budget analysis in chat.

BQ table: organizations.org_budgets
Columns: budget_id, org_slug, hierarchy_entity_id, hierarchy_entity_name,
         hierarchy_path, hierarchy_level_code, category, budget_type,
         budget_amount, currency, period_type, period_start, period_end,
         provider, notes, is_active, created_by, updated_by, created_at, updated_at.

BQ table: organizations.org_budget_allocations
Columns: allocation_id, org_slug, parent_budget_id, child_budget_id,
         allocated_amount, allocation_percentage, created_at, updated_at.
"""

import logging
from typing import Any, Dict, Optional

from google.cloud import bigquery

from src.core.tools.shared import safe_query, get_org_dataset, validate_enum

logger = logging.getLogger(__name__)

_VALID_CATEGORIES = {"cloud", "genai", "subscription", "total"}
_VALID_PERIOD_TYPES = {"monthly", "quarterly", "yearly", "custom"}


def list_budgets(
    org_slug: str,
    category: Optional[str] = None,
    hierarchy_entity_id: Optional[str] = None,
    is_active: Optional[bool] = True,
) -> Dict[str, Any]:
    """
    List budgets for an organization with optional filters.

    Args:
        org_slug: Organization slug.
        category: Optional filter — cloud, genai, subscription, or total.
        hierarchy_entity_id: Optional hierarchy entity ID (e.g., DEPT-ENG, TEAM-BACKEND).
        is_active: Filter by active status. True=active only, False=inactive only, None=all.
    """
    dataset = get_org_dataset()

    query = f"""
        SELECT budget_id, hierarchy_entity_id, hierarchy_entity_name,
               hierarchy_level_code, category, budget_type,
               budget_amount, currency, period_type,
               period_start, period_end, provider, notes,
               is_active, created_at
        FROM `{dataset}.org_budgets`
        WHERE org_slug = @org_slug
    """
    params = [bigquery.ScalarQueryParameter("org_slug", "STRING", org_slug)]

    if category:
        validate_enum(category.lower(), _VALID_CATEGORIES, "category")
        query += " AND category = @category"
        params.append(bigquery.ScalarQueryParameter("category", "STRING", category.lower()))

    if hierarchy_entity_id:
        query += " AND hierarchy_entity_id = @entity_id"
        params.append(bigquery.ScalarQueryParameter("entity_id", "STRING", hierarchy_entity_id))

    if is_active is True:
        query += " AND is_active = TRUE"
    elif is_active is False:
        query += " AND is_active = FALSE"

    query += " ORDER BY created_at DESC LIMIT 50"

    return safe_query(org_slug, query, params)


def budget_summary(
    org_slug: str,
    category: Optional[str] = None,
) -> Dict[str, Any]:
    """
    Get budget vs actual spend summary. Shows total budgeted, total actual cost,
    variance, and how many budgets are over/under.

    Args:
        org_slug: Organization slug.
        category: Optional filter — cloud, genai, subscription, or total.
    """
    dataset = get_org_dataset()
    org_dataset = f"{org_slug}_prod"

    budget_query = f"""
        WITH budgets AS (
            SELECT category, budget_amount, period_start, period_end, currency
            FROM `{dataset}.org_budgets`
            WHERE org_slug = @org_slug AND is_active = TRUE
        ),
        actual_costs AS (
            SELECT
                CASE
                    WHEN LOWER(ServiceProviderName) IN ('gcp', 'aws', 'azure', 'google', 'amazon', 'microsoft', 'oci', 'oracle')
                         OR LOWER(x_source_system) LIKE '%cloud%' OR LOWER(x_source_system) LIKE '%billing%' THEN 'cloud'
                    WHEN LOWER(ServiceProviderName) IN ('openai', 'anthropic', 'gemini', 'claude', 'deepseek', 'cohere', 'mistral')
                         OR LOWER(ServiceCategory) IN ('genai', 'llm', 'ai and machine learning')
                         OR LOWER(x_source_system) LIKE '%genai%' THEN 'genai'
                    WHEN LOWER(x_source_system) = 'subscription_costs_daily' THEN 'subscription'
                    ELSE 'cloud'
                END AS cost_category,
                ROUND(SUM(BilledCost), 2) AS actual_spend
            FROM `{org_dataset}.cost_data_standard_1_3`
            WHERE ChargePeriodStart >= (SELECT MIN(period_start) FROM budgets)
              AND ChargePeriodEnd <= (SELECT MAX(period_end) FROM budgets)
            GROUP BY cost_category
        ),
        total_actual AS (
            SELECT ROUND(SUM(actual_spend), 2) AS total_spend FROM actual_costs
        )
        SELECT
            b.category,
            COUNT(*) AS budget_count,
            ROUND(SUM(b.budget_amount), 2) AS total_budget,
            CASE WHEN b.category = 'total' THEN (SELECT total_spend FROM total_actual)
                 ELSE COALESCE(a.actual_spend, 0)
            END AS total_actual,
            ROUND(SUM(b.budget_amount) - CASE WHEN b.category = 'total' THEN COALESCE((SELECT total_spend FROM total_actual), 0)
                                               ELSE COALESCE(a.actual_spend, 0) END, 2) AS variance,
            ROUND(SAFE_DIVIDE(
                CASE WHEN b.category = 'total' THEN COALESCE((SELECT total_spend FROM total_actual), 0)
                     ELSE COALESCE(a.actual_spend, 0) END,
                SUM(b.budget_amount)) * 100, 1) AS utilization_pct,
            MIN(b.currency) AS currency
        FROM budgets b
        LEFT JOIN actual_costs a ON (b.category = a.cost_category)
        GROUP BY b.category, a.actual_spend
        ORDER BY b.category
    """
    params = [bigquery.ScalarQueryParameter("org_slug", "STRING", org_slug)]

    if category:
        validate_enum(category.lower(), _VALID_CATEGORIES, "category")
        # Add category filter as a CTE filter
        budget_query = budget_query.replace(
            "WHERE org_slug = @org_slug AND is_active = TRUE",
            "WHERE org_slug = @org_slug AND is_active = TRUE AND category = @category",
        )
        params.append(bigquery.ScalarQueryParameter("category", "STRING", category.lower()))

    return safe_query(org_slug, budget_query, params)


def budget_variance(
    org_slug: str,
    category: Optional[str] = None,
    hierarchy_entity_id: Optional[str] = None,
    limit: int = 20,
) -> Dict[str, Any]:
    """
    Get detailed budget variance — budget amount vs actual spend per budget.
    Shows which budgets are over or under their targets.

    Args:
        org_slug: Organization slug.
        category: Optional filter — cloud, genai, subscription, or total.
        hierarchy_entity_id: Optional hierarchy entity to focus on.
        limit: Maximum results (1-50, default 20).
    """
    dataset = get_org_dataset()
    org_dataset = f"{org_slug}_prod"
    limit = max(1, min(limit, 50))

    query = f"""
        WITH budgets AS (
            SELECT budget_id, hierarchy_entity_id, hierarchy_entity_name,
                   hierarchy_level_code, category, budget_type,
                   budget_amount, currency, period_type,
                   period_start, period_end, provider
            FROM `{dataset}.org_budgets`
            WHERE org_slug = @org_slug AND is_active = TRUE
        ),
        actual_by_entity AS (
            SELECT
                x_hierarchy_entity_id AS entity_id,
                CASE
                    WHEN LOWER(ServiceProviderName) IN ('gcp', 'aws', 'azure', 'google', 'amazon', 'microsoft', 'oci', 'oracle')
                         OR LOWER(x_source_system) LIKE '%cloud%' OR LOWER(x_source_system) LIKE '%billing%' THEN 'cloud'
                    WHEN LOWER(ServiceProviderName) IN ('openai', 'anthropic', 'gemini', 'claude', 'deepseek', 'cohere', 'mistral')
                         OR LOWER(ServiceCategory) IN ('genai', 'llm', 'ai and machine learning')
                         OR LOWER(x_source_system) LIKE '%genai%' THEN 'genai'
                    WHEN LOWER(x_source_system) = 'subscription_costs_daily' THEN 'subscription'
                    ELSE 'cloud'
                END AS cost_category,
                ROUND(SUM(BilledCost), 2) AS actual_spend
            FROM `{org_dataset}.cost_data_standard_1_3`
            WHERE ChargePeriodStart >= (SELECT MIN(period_start) FROM budgets)
              AND ChargePeriodEnd <= (SELECT MAX(period_end) FROM budgets)
            GROUP BY entity_id, cost_category
        )
        SELECT
            b.budget_id, b.hierarchy_entity_id, b.hierarchy_entity_name,
            b.hierarchy_level_code, b.category, b.budget_type,
            b.budget_amount, b.currency, b.period_type,
            b.period_start, b.period_end, b.provider,
            COALESCE(a.actual_spend, 0) AS actual_spend,
            ROUND(b.budget_amount - COALESCE(a.actual_spend, 0), 2) AS variance,
            ROUND(SAFE_DIVIDE(COALESCE(a.actual_spend, 0), b.budget_amount) * 100, 1) AS utilization_pct,
            CASE
                WHEN COALESCE(a.actual_spend, 0) > b.budget_amount THEN 'OVER_BUDGET'
                WHEN COALESCE(a.actual_spend, 0) > b.budget_amount * 0.8 THEN 'AT_RISK'
                ELSE 'ON_TRACK'
            END AS status
        FROM budgets b
        LEFT JOIN actual_by_entity a ON (
            b.hierarchy_entity_id = a.entity_id
            AND (b.category = a.cost_category OR b.category = 'total')
        )
    """
    params = [bigquery.ScalarQueryParameter("org_slug", "STRING", org_slug)]

    # Build WHERE clause additively to avoid double-replace bug
    budget_where_extra = []
    if category:
        validate_enum(category.lower(), _VALID_CATEGORIES, "category")
        budget_where_extra.append("AND category = @category")
        params.append(bigquery.ScalarQueryParameter("category", "STRING", category.lower()))

    if hierarchy_entity_id:
        budget_where_extra.append("AND hierarchy_entity_id = @entity_id")
        params.append(bigquery.ScalarQueryParameter("entity_id", "STRING", hierarchy_entity_id))

    if budget_where_extra:
        extra = " ".join(budget_where_extra)
        query = query.replace(
            "WHERE org_slug = @org_slug AND is_active = TRUE",
            f"WHERE org_slug = @org_slug AND is_active = TRUE {extra}",
        )

    query += " ORDER BY actual_spend DESC LIMIT @limit"
    params.append(bigquery.ScalarQueryParameter("limit", "INT64", limit))

    return safe_query(org_slug, query, params)


def budget_allocation_tree(
    org_slug: str,
    category: Optional[str] = None,
) -> Dict[str, Any]:
    """
    Get budget allocation tree — shows how budgets are allocated from
    parent to child hierarchy levels (e.g., Department → Projects → Teams).

    Args:
        org_slug: Organization slug.
        category: Optional filter — cloud, genai, subscription, or total.
    """
    dataset = get_org_dataset()

    query = f"""
        SELECT
            b.budget_id,
            b.hierarchy_entity_id,
            b.hierarchy_entity_name,
            b.hierarchy_level_code,
            b.category,
            b.budget_amount,
            b.currency,
            a.parent_budget_id,
            a.allocated_amount,
            a.allocation_percentage
        FROM `{dataset}.org_budgets` b
        LEFT JOIN `{dataset}.org_budget_allocations` a
            ON b.budget_id = a.child_budget_id AND a.org_slug = @org_slug
        WHERE b.org_slug = @org_slug AND b.is_active = TRUE
    """
    params = [bigquery.ScalarQueryParameter("org_slug", "STRING", org_slug)]

    if category:
        validate_enum(category.lower(), _VALID_CATEGORIES, "category")
        query += " AND b.category = @category"
        params.append(bigquery.ScalarQueryParameter("category", "STRING", category.lower()))

    query += " ORDER BY b.hierarchy_level_code, b.hierarchy_entity_name"

    return safe_query(org_slug, query, params)
