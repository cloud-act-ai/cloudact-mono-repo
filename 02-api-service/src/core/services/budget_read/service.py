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
    sum_by_provider,
    sum_by_hierarchy,
)

logger = logging.getLogger(__name__)

# Cloud provider names for category filtering (matches cost_read/service.py)
CLOUD_PROVIDERS = ["gcp", "aws", "azure", "google", "amazon", "microsoft", "oci", "oracle"]
GENAI_PROVIDERS = [
    "openai", "anthropic", "google ai", "cohere", "mistral",
    "gemini", "claude", "azure openai", "aws bedrock", "vertex ai",
]


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

    def _get_cost_table(self, org_slug: str) -> str:
        """Get the FOCUS 1.3 cost table for an org."""
        # All environments use _prod suffix for org datasets
        return f"{self.project_id}.{org_slug}_prod.cost_data_standard_1_3"

    async def _fetch_actual_costs(
        self,
        org_slug: str,
        period_start: str,
        period_end: str,
        category: Optional[str] = None,
    ) -> pl.DataFrame:
        """Fetch actual costs from cost_data_standard_1_3 for the given period.

        Returns DataFrame with columns: BilledCost, ServiceProviderName,
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
                COALESCE(BilledCost, 0) as BilledCost,
                COALESCE(ServiceProviderName, 'Unknown') as ServiceProviderName,
                COALESCE(x_hierarchy_entity_id, 'unassigned') as x_hierarchy_entity_id,
                COALESCE(x_hierarchy_path, '') as x_hierarchy_path,
                {category_case}
            FROM `{cost_table}`
            WHERE ChargePeriodStart >= @period_start
            AND ChargePeriodStart < @period_end
            {category_where}
        """

        job_config = bigquery.QueryJobConfig(query_parameters=query_params)

        try:
            results = self.client.query(query, job_config=job_config).result()
            rows = [dict(row) for row in results]
            if not rows:
                return pl.DataFrame({
                    "BilledCost": [],
                    "ServiceProviderName": [],
                    "x_hierarchy_entity_id": [],
                    "x_hierarchy_path": [],
                    "category": [],
                })
            return pl.DataFrame(rows)
        except Exception as e:
            logger.warning(f"Failed to fetch costs for {org_slug}: {e}")
            return pl.DataFrame({
                "BilledCost": [],
                "ServiceProviderName": [],
                "x_hierarchy_entity_id": [],
                "x_hierarchy_path": [],
                "category": [],
            })

    async def get_budget_summary(
        self,
        org_slug: str,
        category: Optional[str] = None,
        hierarchy_entity_id: Optional[str] = None,
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
            period_start = str(budget["period_start"])
            period_end = str(budget["period_end"])
            budget_cat = budget["category"]

            # Filter the pre-fetched costs for this budget's period and category
            if not all_costs_df.is_empty():
                costs_df = all_costs_df
                if budget_cat and budget_cat != "total":
                    costs_df = costs_df.filter(pl.col("category") == budget_cat)
            else:
                costs_df = all_costs_df

            # Filter by hierarchy entity if budget is entity-specific
            entity_id = budget["hierarchy_entity_id"]
            if entity_id and not costs_df.is_empty():
                entity_costs = costs_df.filter(
                    (pl.col("x_hierarchy_entity_id") == entity_id) |
                    (pl.col("x_hierarchy_path").str.contains(entity_id))
                )
                actual = entity_costs["BilledCost"].sum() if not entity_costs.is_empty() else 0.0
            else:
                actual = costs_df["BilledCost"].sum() if not costs_df.is_empty() else 0.0

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

        # Build tree nodes
        def build_node(budget_id: str, actual_lookup: dict) -> AllocationNode:
            b = budget_map[budget_id]
            children_allocs = parent_to_children.get(budget_id, [])
            allocated = sum(c["allocated_amount"] for c in children_allocs)
            child_nodes = []
            for ca in children_allocs:
                if ca["child_budget_id"] in budget_map:
                    child_nodes.append(build_node(ca["child_budget_id"], actual_lookup))

            entity_id = b["hierarchy_entity_id"]
            actual = actual_lookup.get(entity_id, 0.0)
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

        # Fetch actuals for all budgets period range
        actual_lookup: dict = {}
        if budgets:
            min_start = min(str(b["period_start"]) for b in budgets)
            max_end = max(str(b["period_end"]) for b in budgets)
            costs_df = await self._fetch_actual_costs(org_slug, min_start, max_end, category)
            if not costs_df.is_empty():
                agg = sum_by_hierarchy(costs_df)
                for row in agg.iter_rows(named=True):
                    actual_lookup[row["hierarchy_entity_id"]] = row["actual_amount"]

        # Find root nodes (budgets not allocated from a parent)
        roots = []
        total_budget = 0.0
        total_allocated = 0.0
        for b in budgets:
            bid = b["budget_id"]
            if bid not in child_to_parent:
                roots.append(build_node(bid, actual_lookup))
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
    ) -> CategoryBreakdownResponse:
        """Get budget breakdown by cost category."""
        # Fetch all active budgets grouped by category
        query = f"""
            SELECT
                category,
                SUM(budget_amount) as budget_amount,
                COUNT(*) as budget_count,
                MIN(currency) as currency
            FROM `{self.budgets_table}`
            WHERE org_slug = @org_slug AND is_active = TRUE
            GROUP BY category
            ORDER BY category
        """
        params = [bigquery.ScalarQueryParameter("org_slug", "STRING", org_slug)]
        job_config = bigquery.QueryJobConfig(query_parameters=params)
        results = list(self.client.query(query, job_config=job_config).result())

        if not results:
            return CategoryBreakdownResponse(org_slug=org_slug, items=[], currency="USD")

        # Get date range from budgets for actuals
        range_query = f"""
            SELECT MIN(period_start) as min_start, MAX(period_end) as max_end
            FROM `{self.budgets_table}`
            WHERE org_slug = @org_slug AND is_active = TRUE
        """
        range_result = list(self.client.query(range_query, job_config=job_config).result())
        min_start = str(range_result[0]["min_start"])
        max_end = str(range_result[0]["max_end"])

        # Fetch all actuals
        costs_df = await self._fetch_actual_costs(org_slug, min_start, max_end)
        actual_by_cat = {}
        if not costs_df.is_empty():
            agg = sum_by_category(costs_df)
            for row in agg.iter_rows(named=True):
                actual_by_cat[row["category"]] = row["actual_amount"]

        items = []
        for row in results:
            cat = row["category"]
            budget_amt = float(row["budget_amount"])
            actual_amt = actual_by_cat.get(cat, 0.0)
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
        query += " ORDER BY provider"
        job_config = bigquery.QueryJobConfig(query_parameters=params)
        budgets = list(self.client.query(query, job_config=job_config).result())

        if not budgets:
            return ProviderBreakdownResponse(
                org_slug=org_slug, category=category, items=[], currency="USD"
            )

        # Get date range
        min_start = min(str(b["period_start"]) for b in budgets)
        max_end = max(str(b["period_end"]) for b in budgets)

        # Fetch actuals
        costs_df = await self._fetch_actual_costs(org_slug, min_start, max_end, category)
        actual_by_provider: dict = {}
        if not costs_df.is_empty():
            agg = sum_by_provider(costs_df, category)
            for row in agg.iter_rows(named=True):
                key = row["provider"].lower()
                actual_by_provider[key] = actual_by_provider.get(key, 0.0) + row["actual_amount"]

        items = []
        for b in budgets:
            provider = b["provider"]
            budget_amt = float(b["budget_amount"])
            actual_amt = actual_by_provider.get(provider.lower(), 0.0) if provider else 0.0
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
