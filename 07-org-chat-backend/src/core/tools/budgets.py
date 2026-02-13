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
    is_active: bool = True,
) -> Dict[str, Any]:
    """
    List budgets for an organization with optional filters.

    Args:
        org_slug: Organization slug.
        category: Optional filter — cloud, genai, subscription, or total.
        hierarchy_entity_id: Optional hierarchy entity ID (e.g., DEPT-ENG, TEAM-BACKEND).
        is_active: Show active budgets only (default True).
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

    if is_active:
        query += " AND is_active = TRUE"

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

    # First get budget totals
    budget_query = f"""
        SELECT
            category,
            COUNT(*) as budget_count,
            SUM(budget_amount) as total_budget,
            MIN(currency) as currency,
            MIN(period_start) as min_start,
            MAX(period_end) as max_end
        FROM `{dataset}.org_budgets`
        WHERE org_slug = @org_slug AND is_active = TRUE
    """
    params = [bigquery.ScalarQueryParameter("org_slug", "STRING", org_slug)]

    if category:
        validate_enum(category.lower(), _VALID_CATEGORIES, "category")
        budget_query += " AND category = @category"
        params.append(bigquery.ScalarQueryParameter("category", "STRING", category.lower()))

    budget_query += " GROUP BY category ORDER BY category"

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
    limit = max(1, min(limit, 50))

    query = f"""
        SELECT budget_id, hierarchy_entity_id, hierarchy_entity_name,
               hierarchy_level_code, category, budget_type,
               budget_amount, currency, period_type,
               period_start, period_end, provider
        FROM `{dataset}.org_budgets`
        WHERE org_slug = @org_slug AND is_active = TRUE
    """
    params = [bigquery.ScalarQueryParameter("org_slug", "STRING", org_slug)]

    if category:
        validate_enum(category.lower(), _VALID_CATEGORIES, "category")
        query += " AND category = @category"
        params.append(bigquery.ScalarQueryParameter("category", "STRING", category.lower()))

    if hierarchy_entity_id:
        query += " AND hierarchy_entity_id = @entity_id"
        params.append(bigquery.ScalarQueryParameter("entity_id", "STRING", hierarchy_entity_id))

    query += " ORDER BY budget_amount DESC LIMIT @limit"
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
