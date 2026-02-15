"""Budget Read Service — Variance calculation and budget analytics."""

import os
import logging
import threading
from typing import Optional, List

import polars as pl
from google.cloud import bigquery

from src.core.services.budget_crud.models import BudgetCategory, BudgetResponse
from src.core.services.budget_read.models import (
    BudgetVarianceItem,
    BudgetSummaryResponse,
    AllocationNode,
    AllocationTreeResponse,
    CategoryBreakdownItem,
    CategoryBreakdownResponse,
    ProviderBreakdownItem,
    ProviderBreakdownResponse,
)
from src.core.services.budget_read.aggregations import (
    sum_by_category,
)

logger = logging.getLogger(__name__)

# Cloud provider names for category filtering (matches cost_read/service.py)
CLOUD_PROVIDERS = ["gcp", "aws", "azure", "google", "amazon", "microsoft", "oci", "oracle"]
GENAI_PROVIDERS = [
    "openai", "anthropic", "google ai", "cohere", "mistral",
    "gemini", "claude", "azure openai", "aws bedrock", "vertex ai",
]

# Map FOCUS ServiceProviderName → budget provider short name
PROVIDER_NAME_MAP = {
    "google cloud": "gcp",
    "google cloud platform": "gcp",
    "amazon web services": "aws",
    "microsoft azure": "azure",
    "microsoft": "azure",
    "oracle": "oci",
    "oracle cloud": "oci",
    "google ai": "gemini",
}


class BudgetReadService:
    """Service for budget analytics and variance calculation."""

    def __init__(self, project_id: str, dataset_id: str = "organizations"):
        from src.core.engine.bq_client import get_bigquery_client
        self.bq = get_bigquery_client()
        self.client = self.bq.client
        self.project_id = project_id
        self.dataset_id = dataset_id
        self.budgets_table = f"{project_id}.{dataset_id}.org_budgets"
        self.allocations_table = f"{project_id}.{dataset_id}.org_budget_allocations"

    def _filter_by_entity(self, costs_df: pl.DataFrame, entity_id: str) -> pl.DataFrame:
        """Filter costs for a hierarchy entity using boundary-safe matching.

        Matches:
        - Direct assignment: x_hierarchy_entity_id == entity_id
        - Ancestor rollup: entity_id appears as a complete path segment
          (e.g., /DEPT-1/ or ending with /DEPT-1)

        Uses literal=True to prevent regex injection from entity IDs
        containing special characters.
        """
        if costs_df.is_empty():
            return costs_df
        return costs_df.filter(
            (pl.col("x_hierarchy_entity_id") == entity_id) |
            (pl.col("x_hierarchy_path").str.contains(f"/{entity_id}/", literal=True)) |
            (pl.col("x_hierarchy_path").str.ends_with(f"/{entity_id}"))
        )

    def _get_cost_table(self, org_slug: str) -> str:
        """Get the FOCUS 1.3 cost table for an org."""
        from src.app.config import settings
        dataset_id = settings.get_org_dataset_name(org_slug)
        return f"{self.project_id}.{dataset_id}.cost_data_standard_1_3"

    async def _fetch_actual_costs(
        self,
        org_slug: str,
        period_start: str,
        period_end: str,
        category: Optional[str] = None,
    ) -> pl.DataFrame:
        """Fetch actual costs from cost_data_standard_1_3 for the given period.

        Returns DataFrame with columns: charge_date, BilledCost, ServiceProviderName,
        x_hierarchy_entity_id, x_hierarchy_path, category
        """
        cost_table = self._get_cost_table(org_slug)

        # Build category-specific SQL
        category_where = ""
        query_params = [
            bigquery.ScalarQueryParameter("period_start", "DATE", period_start),
            bigquery.ScalarQueryParameter("period_end", "DATE", period_end),
        ]

        if category:
            cat_lower = category.lower()
            if cat_lower in ("subscription", "saas"):
                category_where = "AND x_source_system = 'subscription_costs_daily'"
            elif cat_lower == "cloud":
                category_where = (
                    "AND (LOWER(ServiceProviderName) IN UNNEST(@cloud_providers) OR "
                    "LOWER(x_source_system) LIKE '%cloud%' OR "
                    "LOWER(x_source_system) LIKE '%gcp%' OR "
                    "LOWER(x_source_system) LIKE '%aws%' OR "
                    "LOWER(x_source_system) LIKE '%azure%')"
                )
                query_params.append(
                    bigquery.ArrayQueryParameter("cloud_providers", "STRING", CLOUD_PROVIDERS)
                )
            elif cat_lower == "genai":
                category_where = (
                    "AND ((LOWER(ServiceProviderName) IN UNNEST(@genai_providers) OR "
                    "LOWER(ServiceCategory) IN ('genai', 'llm', 'ai and machine learning') OR "
                    "LOWER(x_source_system) LIKE '%genai%' OR "
                    "LOWER(x_source_system) LIKE '%llm%') AND "
                    "COALESCE(x_source_system, '') != 'subscription_costs_daily')"
                )
                query_params.append(
                    bigquery.ArrayQueryParameter("genai_providers", "STRING", GENAI_PROVIDERS)
                )

        # Determine category label in the query
        category_case = """
            CASE
                WHEN x_source_system = 'subscription_costs_daily' THEN 'subscription'
                WHEN LOWER(ServiceProviderName) IN ('gcp', 'aws', 'azure', 'google', 'amazon', 'microsoft', 'oci', 'oracle')
                     OR LOWER(x_source_system) LIKE '%cloud%' THEN 'cloud'
                WHEN LOWER(ServiceProviderName) IN ('openai', 'anthropic', 'gemini', 'claude', 'cohere', 'mistral')
                     OR LOWER(ServiceCategory) IN ('genai', 'llm', 'ai and machine learning') THEN 'genai'
                ELSE 'cloud'
            END AS category
        """

        query = f"""
            SELECT
                CAST(ChargePeriodStart AS DATE) as charge_date,
                COALESCE(BilledCost, 0) as BilledCost,
                COALESCE(ServiceProviderName, 'Unknown') as ServiceProviderName,
                COALESCE(x_hierarchy_entity_id, 'unassigned') as x_hierarchy_entity_id,
                COALESCE(x_hierarchy_path, '') as x_hierarchy_path,
                {category_case}
            FROM `{cost_table}`
            WHERE CAST(ChargePeriodStart AS DATE) >= @period_start
            AND CAST(ChargePeriodStart AS DATE) <= @period_end
            {category_where}
        """

        job_config = bigquery.QueryJobConfig(query_parameters=query_params)

        empty_schema = {
            "charge_date": [],
            "BilledCost": [],
            "ServiceProviderName": [],
            "x_hierarchy_entity_id": [],
            "x_hierarchy_path": [],
            "category": [],
        }

        try:
            results = self.client.query(query, job_config=job_config).result()
            rows = [dict(row) for row in results]
            if not rows:
                return pl.DataFrame(empty_schema)
            return pl.DataFrame(rows)
        except Exception as e:
            logger.warning(f"Failed to fetch costs for {org_slug}: {e}")
            return pl.DataFrame(empty_schema)

    def _apply_period_filters(
        self,
        query: str,
        params: list,
        period_type: Optional[str] = None,
        period_start: Optional[str] = None,
        period_end: Optional[str] = None,
    ) -> str:
        """Apply period filter parameters to a budget query."""
        if period_type:
            query += " AND period_type = @filter_period_type"
            params.append(bigquery.ScalarQueryParameter("filter_period_type", "STRING", period_type))
        if period_start:
            query += " AND period_start >= @filter_period_start"
            params.append(bigquery.ScalarQueryParameter("filter_period_start", "DATE", period_start))
        if period_end:
            query += " AND period_end <= @filter_period_end"
            params.append(bigquery.ScalarQueryParameter("filter_period_end", "DATE", period_end))
        return query

    async def get_budget_summary(
        self,
        org_slug: str,
        category: Optional[str] = None,
        hierarchy_entity_id: Optional[str] = None,
        period_type: Optional[str] = None,
        period_start: Optional[str] = None,
        period_end: Optional[str] = None,
    ) -> BudgetSummaryResponse:
        """Get budget vs actual variance summary."""
        # Fetch active budgets
        query = f"""
            SELECT *
            FROM `{self.budgets_table}`
            WHERE org_slug = @org_slug AND is_active = TRUE
        """
        params = [bigquery.ScalarQueryParameter("org_slug", "STRING", org_slug)]

        if category:
            query += " AND category = @category"
            params.append(bigquery.ScalarQueryParameter("category", "STRING", category))

        if hierarchy_entity_id:
            query += " AND hierarchy_entity_id = @hierarchy_entity_id"
            params.append(bigquery.ScalarQueryParameter("hierarchy_entity_id", "STRING", hierarchy_entity_id))

        query = self._apply_period_filters(query, params, period_type, period_start, period_end)

        query += " ORDER BY created_at DESC"
        job_config = bigquery.QueryJobConfig(query_parameters=params)

        try:
            results = list(self.client.query(query, job_config=job_config).result())
        except Exception as e:
            logger.error(f"Failed to fetch budgets for summary: {e}")
            raise

        if not results:
            return BudgetSummaryResponse(
                org_slug=org_slug,
                items=[],
                total_budget=0,
                total_actual=0,
                total_variance=0,
                total_variance_percent=0,
                currency="USD",
                budgets_over=0,
                budgets_under=0,
                budgets_total=0,
            )

        # Fetch ALL actual costs once for the full date range (avoids N+1 queries)
        min_start = min(str(b["period_start"]) for b in results)
        max_end = max(str(b["period_end"]) for b in results)
        all_costs_df = await self._fetch_actual_costs(org_slug, min_start, max_end)

        # Build variance items per budget
        items = []
        total_budget = 0.0
        total_actual = 0.0
        budgets_over = 0

        for row in results:
            budget = dict(row)
            budget_period_start = str(budget["period_start"])
            budget_period_end = str(budget["period_end"])
            budget_cat = budget["category"]

            # Filter the pre-fetched costs for this budget's specific period and category
            if not all_costs_df.is_empty():
                costs_df = all_costs_df
                # Filter by this budget's date range
                from datetime import date as date_type
                bp_start = date_type.fromisoformat(budget_period_start)
                bp_end = date_type.fromisoformat(budget_period_end)
                costs_df = costs_df.filter(
                    (pl.col("charge_date") >= bp_start) &
                    (pl.col("charge_date") <= bp_end)
                )
                if budget_cat and budget_cat != "total":
                    costs_df = costs_df.filter(pl.col("category") == budget_cat)

                # Filter by provider if budget targets a specific provider
                budget_provider = budget.get("provider")
                if budget_provider and not costs_df.is_empty():
                    provider_lower = budget_provider.lower()
                    # Build list of FOCUS names that map to this budget provider
                    focus_names = [provider_lower]
                    for focus_name, short_name in PROVIDER_NAME_MAP.items():
                        if short_name == provider_lower:
                            focus_names.append(focus_name)
                    costs_df = costs_df.filter(
                        pl.col("ServiceProviderName").str.to_lowercase().is_in(focus_names)
                    )
            else:
                costs_df = all_costs_df

            # Filter by hierarchy entity if budget is entity-specific
            entity_id = budget["hierarchy_entity_id"]
            if entity_id and not costs_df.is_empty():
                entity_costs = self._filter_by_entity(costs_df, entity_id)
                actual = float(entity_costs["BilledCost"].sum()) if not entity_costs.is_empty() else 0.0
            else:
                actual = float(costs_df["BilledCost"].sum()) if not costs_df.is_empty() else 0.0

            budget_amount = float(budget["budget_amount"])
            variance = budget_amount - actual
            variance_pct = (variance / budget_amount * 100) if budget_amount > 0 else 0
            is_over = actual > budget_amount

            if is_over:
                budgets_over += 1

            total_budget += budget_amount
            total_actual += actual

            items.append(BudgetVarianceItem(
                budget_id=budget["budget_id"],
                hierarchy_entity_id=entity_id,
                hierarchy_entity_name=budget["hierarchy_entity_name"],
                hierarchy_path=budget.get("hierarchy_path"),
                hierarchy_level_code=budget["hierarchy_level_code"],
                category=budget_cat,
                budget_type=budget["budget_type"],
                budget_amount=budget_amount,
                actual_amount=round(actual, 2),
                variance=round(variance, 2),
                variance_percent=round(variance_pct, 1),
                currency=budget["currency"],
                period_type=budget["period_type"],
                period_start=budget["period_start"],
                period_end=budget["period_end"],
                provider=budget.get("provider"),
                is_over_budget=is_over,
            ))

        total_variance = total_budget - total_actual
        total_variance_pct = (total_variance / total_budget * 100) if total_budget > 0 else 0

        return BudgetSummaryResponse(
            org_slug=org_slug,
            items=items,
            total_budget=round(total_budget, 2),
            total_actual=round(total_actual, 2),
            total_variance=round(total_variance, 2),
            total_variance_percent=round(total_variance_pct, 1),
            currency=results[0]["currency"] if results else "USD",
            budgets_over=budgets_over,
            budgets_under=len(results) - budgets_over,
            budgets_total=len(results),
        )

    async def get_allocation_tree(
        self,
        org_slug: str,
        category: Optional[str] = None,
        root_entity_id: Optional[str] = None,
        period_type: Optional[str] = None,
        period_start: Optional[str] = None,
        period_end: Optional[str] = None,
    ) -> AllocationTreeResponse:
        """Get budget allocation tree with actuals."""
        # Fetch budgets
        query = f"""
            SELECT *
            FROM `{self.budgets_table}`
            WHERE org_slug = @org_slug AND is_active = TRUE
        """
        params = [bigquery.ScalarQueryParameter("org_slug", "STRING", org_slug)]
        if category:
            query += " AND category = @category"
            params.append(bigquery.ScalarQueryParameter("category", "STRING", category))
        if root_entity_id:
            query += " AND (hierarchy_entity_id = @root_entity_id OR hierarchy_path LIKE CONCAT('%/', @root_entity_id, '/%') OR hierarchy_path LIKE CONCAT('%/', @root_entity_id))"
            params.append(bigquery.ScalarQueryParameter("root_entity_id", "STRING", root_entity_id))
        query = self._apply_period_filters(query, params, period_type, period_start, period_end)
        query += " ORDER BY hierarchy_level_code, hierarchy_entity_name"
        job_config = bigquery.QueryJobConfig(query_parameters=params)

        budgets = list(self.client.query(query, job_config=job_config).result())

        # Fetch allocations
        alloc_query = f"""
            SELECT *
            FROM `{self.allocations_table}`
            WHERE org_slug = @org_slug
        """
        alloc_params = [bigquery.ScalarQueryParameter("org_slug", "STRING", org_slug)]
        alloc_config = bigquery.QueryJobConfig(query_parameters=alloc_params)
        allocations = list(self.client.query(alloc_query, job_config=alloc_config).result())

        # Build parent→children map from allocations
        parent_to_children = {}
        child_to_parent = {}
        for alloc in allocations:
            pid = alloc["parent_budget_id"]
            cid = alloc["child_budget_id"]
            parent_to_children.setdefault(pid, []).append({
                "child_budget_id": cid,
                "allocated_amount": float(alloc["allocated_amount"]),
            })
            child_to_parent[cid] = pid

        # Build budget lookup
        budget_map = {}
        for b in budgets:
            budget_map[b["budget_id"]] = dict(b)

        # Build tree nodes (with cycle detection to prevent infinite recursion)
        def build_node(budget_id: str, actual_lookup: dict, _depth: int = 0, _visited: set | None = None) -> AllocationNode:
            if _visited is None:
                _visited = set()
            if budget_id in _visited:
                # Circular allocation detected — return leaf node to break cycle gracefully
                logger.warning(f"Circular allocation detected at budget {budget_id}, returning leaf node")
                b = budget_map[budget_id]
                entity_id = b["hierarchy_entity_id"]
                actual = float(actual_lookup.get((entity_id, b["category"], b.get("provider"), str(b["period_start"]), str(b["period_end"])), 0.0))
                return AllocationNode(
                    budget_id=budget_id,
                    hierarchy_entity_id=entity_id,
                    hierarchy_entity_name=b["hierarchy_entity_name"],
                    hierarchy_level_code=b["hierarchy_level_code"],
                    category=b["category"],
                    budget_amount=float(b["budget_amount"]),
                    allocated_to_children=0,
                    unallocated=float(b["budget_amount"]),
                    actual_amount=round(actual, 2),
                    variance=round(float(b["budget_amount"]) - actual, 2),
                    currency=b["currency"],
                    children=[],
                )
            _visited.add(budget_id)
            if _depth > 20:
                raise ValueError("Allocation tree exceeds maximum depth of 20")
            b = budget_map[budget_id]
            children_allocs = parent_to_children.get(budget_id, [])
            allocated = sum(c["allocated_amount"] for c in children_allocs)
            child_nodes = []
            for ca in children_allocs:
                if ca["child_budget_id"] in budget_map:
                    child_nodes.append(build_node(ca["child_budget_id"], actual_lookup, _depth + 1, _visited))

            entity_id = b["hierarchy_entity_id"]
            actual = float(actual_lookup.get((entity_id, b["category"], b.get("provider"), str(b["period_start"]), str(b["period_end"])), 0.0))
            budget_amount = float(b["budget_amount"])

            return AllocationNode(
                budget_id=budget_id,
                hierarchy_entity_id=entity_id,
                hierarchy_entity_name=b["hierarchy_entity_name"],
                hierarchy_level_code=b["hierarchy_level_code"],
                category=b["category"],
                budget_amount=budget_amount,
                allocated_to_children=round(allocated, 2),
                unallocated=round(budget_amount - allocated, 2),
                actual_amount=round(actual, 2),
                variance=round(budget_amount - actual, 2),
                currency=b["currency"],
                children=child_nodes,
            )

        # Fetch actuals for all budgets period range — always get ALL categories
        # so each budget can be matched to its own category
        # actual_lookup keyed by (entity_id, category) for per-budget accuracy
        actual_lookup: dict = {}
        costs_df = pl.DataFrame()
        if budgets:
            min_start = min(str(b["period_start"]) for b in budgets)
            max_end = max(str(b["period_end"]) for b in budgets)
            costs_df = await self._fetch_actual_costs(org_slug, min_start, max_end)
            if not costs_df.is_empty():
                for b in budgets:
                    eid = b["hierarchy_entity_id"]
                    bcat = b["category"]
                    bprov = b.get("provider")
                    bp_start_str = str(b["period_start"])
                    bp_end_str = str(b["period_end"])
                    key = (eid, bcat, bprov, bp_start_str, bp_end_str)
                    if key not in actual_lookup:
                        # Filter costs to this budget's specific period
                        # Use date objects (not strings) for Polars date comparison
                        from datetime import date as _date
                        bp_start_date = _date.fromisoformat(bp_start_str)
                        bp_end_date = _date.fromisoformat(bp_end_str)
                        period_costs = costs_df.filter(
                            (pl.col("charge_date") >= bp_start_date) &
                            (pl.col("charge_date") <= bp_end_date)
                        ) if "charge_date" in costs_df.columns else costs_df
                        # Match entity directly OR via hierarchy path (boundary-safe)
                        entity_costs = self._filter_by_entity(period_costs, eid)
                        # Scope to budget's category (unless "total" = all categories)
                        if bcat and bcat != "total":
                            entity_costs = entity_costs.filter(pl.col("category") == bcat)
                        # Scope to budget's provider if set
                        if bprov and not entity_costs.is_empty():
                            provider_lower = bprov.lower()
                            focus_names = [provider_lower]
                            for focus_name, short_name in PROVIDER_NAME_MAP.items():
                                if short_name == provider_lower:
                                    focus_names.append(focus_name)
                            entity_costs = entity_costs.filter(
                                pl.col("ServiceProviderName").str.to_lowercase().is_in(focus_names)
                            )
                        actual_lookup[key] = float(entity_costs["BilledCost"].sum()) if not entity_costs.is_empty() else 0.0

        # Find root nodes (budgets not allocated from a parent)
        roots = []
        total_budget = 0.0
        total_allocated = 0.0
        visited: set = set()
        for b in budgets:
            bid = b["budget_id"]
            if bid not in child_to_parent:
                roots.append(build_node(bid, actual_lookup, _visited=visited))
                total_budget += float(b["budget_amount"])
                total_allocated += sum(
                    c["allocated_amount"] for c in parent_to_children.get(bid, [])
                )

        return AllocationTreeResponse(
            org_slug=org_slug,
            roots=roots,
            total_budget=round(total_budget, 2),
            total_allocated=round(total_allocated, 2),
            currency=budgets[0]["currency"] if budgets else "USD",
        )

    async def get_category_breakdown(
        self,
        org_slug: str,
        hierarchy_entity_id: Optional[str] = None,
        period_type: Optional[str] = None,
        period_start: Optional[str] = None,
        period_end: Optional[str] = None,
    ) -> CategoryBreakdownResponse:
        """Get budget breakdown by cost category."""
        # Build WHERE clause for shared use
        where_clause = "WHERE org_slug = @org_slug AND is_active = TRUE"
        params = [bigquery.ScalarQueryParameter("org_slug", "STRING", org_slug)]

        if hierarchy_entity_id:
            where_clause += " AND hierarchy_entity_id = @hierarchy_entity_id"
            params.append(bigquery.ScalarQueryParameter("hierarchy_entity_id", "STRING", hierarchy_entity_id))

        where_clause = self._apply_period_filters(where_clause, params, period_type, period_start, period_end)

        # Fetch all active budgets grouped by category
        query = f"""
            SELECT
                category,
                SUM(budget_amount) as budget_amount,
                COUNT(*) as budget_count,
                MIN(currency) as currency
            FROM `{self.budgets_table}`
            {where_clause}
            GROUP BY category
            ORDER BY category
        """
        job_config = bigquery.QueryJobConfig(query_parameters=params)
        results = list(self.client.query(query, job_config=job_config).result())

        if not results:
            return CategoryBreakdownResponse(org_slug=org_slug, items=[], currency="USD")

        # Get date range from budgets for actuals
        range_query = f"""
            SELECT MIN(period_start) as min_start, MAX(period_end) as max_end
            FROM `{self.budgets_table}`
            {where_clause}
        """
        range_config = bigquery.QueryJobConfig(query_parameters=params)
        range_result = list(self.client.query(range_query, job_config=range_config).result())
        min_start = str(range_result[0]["min_start"])
        max_end = str(range_result[0]["max_end"])

        # Fetch all actuals (scoped to hierarchy entity if filter is set)
        costs_df = await self._fetch_actual_costs(org_slug, min_start, max_end)
        if hierarchy_entity_id and not costs_df.is_empty():
            costs_df = self._filter_by_entity(costs_df, hierarchy_entity_id)
        actual_by_cat = {}
        if not costs_df.is_empty():
            agg = sum_by_category(costs_df)
            for row in agg.iter_rows(named=True):
                actual_by_cat[row["category"]] = float(row["actual_amount"])

        items = []
        for row in results:
            cat = row["category"]
            budget_amt = float(row["budget_amount"])
            # "total" category means all cost types combined
            if cat == "total":
                actual_amt = sum(float(v) for v in actual_by_cat.values())
            else:
                actual_amt = float(actual_by_cat.get(cat, 0.0))
            variance = budget_amt - actual_amt
            variance_pct = (variance / budget_amt * 100) if budget_amt > 0 else 0

            items.append(CategoryBreakdownItem(
                category=cat,
                budget_amount=round(budget_amt, 2),
                actual_amount=round(actual_amt, 2),
                variance=round(variance, 2),
                variance_percent=round(variance_pct, 1),
                budget_count=row["budget_count"],
                currency=row["currency"],
                is_over_budget=actual_amt > budget_amt,
            ))

        return CategoryBreakdownResponse(
            org_slug=org_slug,
            items=items,
            currency=results[0]["currency"],
        )

    async def get_provider_breakdown(
        self,
        org_slug: str,
        category: Optional[str] = None,
        hierarchy_entity_id: Optional[str] = None,
        period_type: Optional[str] = None,
        period_start: Optional[str] = None,
        period_end: Optional[str] = None,
    ) -> ProviderBreakdownResponse:
        """Get budget breakdown by provider."""
        # Fetch budgets with provider filter
        query = f"""
            SELECT *
            FROM `{self.budgets_table}`
            WHERE org_slug = @org_slug AND is_active = TRUE AND provider IS NOT NULL
        """
        params = [bigquery.ScalarQueryParameter("org_slug", "STRING", org_slug)]
        if category:
            query += " AND category = @category"
            params.append(bigquery.ScalarQueryParameter("category", "STRING", category))
        if hierarchy_entity_id:
            query += " AND hierarchy_entity_id = @hierarchy_entity_id"
            params.append(bigquery.ScalarQueryParameter("hierarchy_entity_id", "STRING", hierarchy_entity_id))
        query = self._apply_period_filters(query, params, period_type, period_start, period_end)
        query += " ORDER BY provider"
        job_config = bigquery.QueryJobConfig(query_parameters=params)
        budgets = list(self.client.query(query, job_config=job_config).result())

        if not budgets:
            return ProviderBreakdownResponse(
                org_slug=org_slug, category=category, items=[], currency="USD"
            )

        # Get date range — fetch ALL costs (no category filter) for per-budget scoping
        min_start = min(str(b["period_start"]) for b in budgets)
        max_end = max(str(b["period_end"]) for b in budgets)
        all_costs_df = await self._fetch_actual_costs(org_slug, min_start, max_end)

        items = []
        for b in budgets:
            provider = b["provider"]
            budget_amt = float(b["budget_amount"])
            entity_id = b["hierarchy_entity_id"]
            bcat = b["category"]

            # Compute per-budget actual: scoped to entity + category + provider
            actual_amt = 0.0
            if not all_costs_df.is_empty() and provider:
                from datetime import date as date_type
                bp_start = date_type.fromisoformat(str(b["period_start"]))
                bp_end = date_type.fromisoformat(str(b["period_end"]))
                costs_df = all_costs_df.filter(
                    (pl.col("charge_date") >= bp_start) &
                    (pl.col("charge_date") <= bp_end)
                )
                # Filter by entity (direct + boundary-safe hierarchy path rollup)
                if entity_id:
                    costs_df = self._filter_by_entity(costs_df, entity_id)
                # Filter by category
                if bcat and bcat != "total":
                    costs_df = costs_df.filter(pl.col("category") == bcat)
                # Filter by provider (normalize FOCUS names)
                provider_lower = provider.lower()
                focus_names = [provider_lower]
                for focus_name, short_name in PROVIDER_NAME_MAP.items():
                    if short_name == provider_lower:
                        focus_names.append(focus_name)
                costs_df = costs_df.filter(
                    pl.col("ServiceProviderName").str.to_lowercase().is_in(focus_names)
                )
                actual_amt = float(costs_df["BilledCost"].sum()) if not costs_df.is_empty() else 0.0

            variance = budget_amt - actual_amt
            variance_pct = (variance / budget_amt * 100) if budget_amt > 0 else 0

            items.append(ProviderBreakdownItem(
                provider=provider,
                category=b["category"],
                budget_amount=round(budget_amt, 2),
                actual_amount=round(actual_amt, 2),
                variance=round(variance, 2),
                variance_percent=round(variance_pct, 1),
                currency=b["currency"],
                is_over_budget=actual_amt > budget_amt,
            ))

        return ProviderBreakdownResponse(
            org_slug=org_slug,
            category=category,
            items=items,
            currency=budgets[0]["currency"],
        )


# Thread-safe global service instance
_budget_read_service: Optional[BudgetReadService] = None
_budget_read_service_lock = threading.Lock()


def get_budget_read_service(
    project_id: Optional[str] = None,
    dataset_id: str = "organizations",
) -> BudgetReadService:
    """Get or create the global budget read service instance (thread-safe)."""
    global _budget_read_service

    if _budget_read_service is not None:
        return _budget_read_service

    with _budget_read_service_lock:
        if _budget_read_service is None:
            project = project_id or os.environ.get("GCP_PROJECT_ID", "cloudact-testing-1")
            _budget_read_service = BudgetReadService(project, dataset_id)

        return _budget_read_service
