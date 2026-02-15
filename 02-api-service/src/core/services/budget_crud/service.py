"""Budget CRUD Service — BigQuery-backed budget management."""

import os
import uuid
import logging
import threading
from typing import Optional, List
from datetime import datetime, timezone

from google.cloud import bigquery

from src.core.services.budget_crud.models import (
    BudgetCategory,
    BudgetType,
    PeriodType,
    BudgetCreateRequest,
    BudgetUpdateRequest,
    BudgetResponse,
    BudgetListResponse,
    TopDownAllocationRequest,
    TopDownAllocationResponse,
    ChildAllocationResult,
)

logger = logging.getLogger(__name__)


class BudgetCRUDService:
    """Service for budget CRUD operations in BigQuery."""

    def __init__(self, project_id: str, dataset_id: str = "organizations"):
        from src.core.engine.bq_client import get_bigquery_client
        self.bq = get_bigquery_client()
        self.client = self.bq.client
        self.project_id = project_id
        self.dataset_id = dataset_id
        self.budgets_table = f"{project_id}.{dataset_id}.org_budgets"
        self.allocations_table = f"{project_id}.{dataset_id}.org_budget_allocations"

    def _row_to_response(self, row: dict) -> BudgetResponse:
        """Convert a BigQuery row to a BudgetResponse."""
        data = dict(row)
        # Convert date fields from string if needed
        for field in ("period_start", "period_end"):
            if isinstance(data.get(field), str):
                from datetime import date as date_type
                data[field] = date_type.fromisoformat(data[field])
        return BudgetResponse(**data)

    async def create_budget(
        self,
        org_slug: str,
        request: BudgetCreateRequest,
        created_by: str = "system",
    ) -> BudgetResponse:
        """Create a new budget."""
        # Check for duplicate: same entity + category + period + provider
        if await self._check_duplicate(
            org_slug,
            request.hierarchy_entity_id,
            request.category.value,
            request.budget_type.value,
            request.period_start.isoformat(),
            request.period_end.isoformat(),
            request.provider,
        ):
            raise ValueError(
                f"Budget already exists for entity '{request.hierarchy_entity_id}' "
                f"category '{request.category.value}' in the given period"
            )

        budget_id = str(uuid.uuid4())
        now = datetime.now(timezone.utc)

        row = {
            "budget_id": budget_id,
            "org_slug": org_slug,
            "hierarchy_entity_id": request.hierarchy_entity_id,
            "hierarchy_entity_name": request.hierarchy_entity_name,
            "hierarchy_path": request.hierarchy_path,
            "hierarchy_level_code": request.hierarchy_level_code,
            "category": request.category.value,
            "budget_type": request.budget_type.value,
            "budget_amount": request.budget_amount,
            "currency": request.currency,
            "period_type": request.period_type.value,
            "period_start": request.period_start.isoformat(),
            "period_end": request.period_end.isoformat(),
            "provider": request.provider,
            "notes": request.notes,
            "is_active": True,
            "created_by": created_by,
            "updated_by": None,
            "created_at": now.isoformat(),
            "updated_at": None,
        }

        try:
            # Use DML INSERT (not streaming) to avoid streaming buffer conflicts
            # with subsequent UPDATE/DELETE operations
            query = f"""
                INSERT INTO `{self.budgets_table}` (
                    budget_id, org_slug, hierarchy_entity_id, hierarchy_entity_name,
                    hierarchy_path, hierarchy_level_code, category, budget_type,
                    budget_amount, currency, period_type, period_start, period_end,
                    provider, notes, is_active, created_by, updated_by, created_at, updated_at
                ) VALUES (
                    @budget_id, @org_slug, @hierarchy_entity_id, @hierarchy_entity_name,
                    @hierarchy_path, @hierarchy_level_code, @category, @budget_type,
                    @budget_amount, @currency, @period_type, @period_start, @period_end,
                    @provider, @notes, @is_active, @created_by, @updated_by,
                    CURRENT_TIMESTAMP(), NULL
                )
            """
            params = [
                bigquery.ScalarQueryParameter("budget_id", "STRING", row["budget_id"]),
                bigquery.ScalarQueryParameter("org_slug", "STRING", row["org_slug"]),
                bigquery.ScalarQueryParameter("hierarchy_entity_id", "STRING", row["hierarchy_entity_id"]),
                bigquery.ScalarQueryParameter("hierarchy_entity_name", "STRING", row["hierarchy_entity_name"]),
                bigquery.ScalarQueryParameter("hierarchy_path", "STRING", row.get("hierarchy_path")),
                bigquery.ScalarQueryParameter("hierarchy_level_code", "STRING", row["hierarchy_level_code"]),
                bigquery.ScalarQueryParameter("category", "STRING", row["category"]),
                bigquery.ScalarQueryParameter("budget_type", "STRING", row["budget_type"]),
                bigquery.ScalarQueryParameter("budget_amount", "FLOAT64", row["budget_amount"]),
                bigquery.ScalarQueryParameter("currency", "STRING", row["currency"]),
                bigquery.ScalarQueryParameter("period_type", "STRING", row["period_type"]),
                bigquery.ScalarQueryParameter("period_start", "DATE", row["period_start"]),
                bigquery.ScalarQueryParameter("period_end", "DATE", row["period_end"]),
                bigquery.ScalarQueryParameter("provider", "STRING", row.get("provider")),
                bigquery.ScalarQueryParameter("notes", "STRING", row.get("notes")),
                bigquery.ScalarQueryParameter("is_active", "BOOL", row["is_active"]),
                bigquery.ScalarQueryParameter("created_by", "STRING", row.get("created_by")),
                bigquery.ScalarQueryParameter("updated_by", "STRING", row.get("updated_by")),
            ]
            job_config = bigquery.QueryJobConfig(query_parameters=params)
            self.client.query(query, job_config=job_config).result()
            result = await self.get_budget(org_slug, budget_id)
            if not result:
                raise ValueError(f"Budget {budget_id} was created but could not be retrieved — possible BigQuery replication delay")
            return result
        except Exception as e:
            logger.error(f"Failed to create budget: {e}")
            raise

    async def get_budget(self, org_slug: str, budget_id: str) -> Optional[BudgetResponse]:
        """Get a single budget by ID."""
        query = f"""
            SELECT *
            FROM `{self.budgets_table}`
            WHERE org_slug = @org_slug AND budget_id = @budget_id
        """
        params = [
            bigquery.ScalarQueryParameter("org_slug", "STRING", org_slug),
            bigquery.ScalarQueryParameter("budget_id", "STRING", budget_id),
        ]
        job_config = bigquery.QueryJobConfig(query_parameters=params)

        try:
            results = list(self.client.query(query, job_config=job_config).result())
            if not results:
                return None
            return self._row_to_response(results[0])
        except Exception as e:
            logger.error(f"Failed to get budget {budget_id}: {e}")
            raise

    async def list_budgets(
        self,
        org_slug: str,
        category: Optional[BudgetCategory] = None,
        hierarchy_entity_id: Optional[str] = None,
        is_active: Optional[bool] = True,
        period_type: Optional[PeriodType] = None,
    ) -> BudgetListResponse:
        """List budgets with optional filters."""
        query = f"""
            SELECT *
            FROM `{self.budgets_table}`
            WHERE org_slug = @org_slug
        """
        params = [bigquery.ScalarQueryParameter("org_slug", "STRING", org_slug)]

        if category:
            query += " AND category = @category"
            params.append(bigquery.ScalarQueryParameter("category", "STRING", category.value))

        if hierarchy_entity_id:
            query += " AND hierarchy_entity_id = @hierarchy_entity_id"
            params.append(bigquery.ScalarQueryParameter("hierarchy_entity_id", "STRING", hierarchy_entity_id))

        if is_active is not None:
            query += " AND is_active = @is_active"
            params.append(bigquery.ScalarQueryParameter("is_active", "BOOL", is_active))

        if period_type:
            query += " AND period_type = @period_type"
            params.append(bigquery.ScalarQueryParameter("period_type", "STRING", period_type.value))

        query += " ORDER BY created_at DESC"
        job_config = bigquery.QueryJobConfig(query_parameters=params)

        try:
            results = list(self.client.query(query, job_config=job_config).result())
            budgets = [self._row_to_response(row) for row in results]
            return BudgetListResponse(budgets=budgets, total=len(budgets))
        except Exception as e:
            logger.error(f"Failed to list budgets for {org_slug}: {e}")
            raise

    async def update_budget(
        self,
        org_slug: str,
        budget_id: str,
        request: BudgetUpdateRequest,
        updated_by: Optional[str] = None,
    ) -> Optional[BudgetResponse]:
        """Update an existing budget."""
        existing = await self.get_budget(org_slug, budget_id)
        if not existing:
            return None
        if not existing.is_active:
            raise ValueError("Cannot update a deleted budget")

        # Cross-validate period dates against existing values
        update_data_raw = request.model_dump(exclude_unset=True)
        new_start = update_data_raw.get("period_start", existing.period_start)
        new_end = update_data_raw.get("period_end", existing.period_end)
        if new_start and new_end and new_end <= new_start:
            raise ValueError("period_end must be after period_start")

        updates = []
        params = [
            bigquery.ScalarQueryParameter("org_slug", "STRING", org_slug),
            bigquery.ScalarQueryParameter("budget_id", "STRING", budget_id),
        ]

        # Fields that can be explicitly set to NULL (cleared)
        nullable_fields = {"provider", "notes", "hierarchy_path"}

        update_data = request.model_dump(exclude_unset=True)
        for field, value in update_data.items():
            if value is None and field in nullable_fields:
                # Allow clearing nullable fields to NULL
                updates.append(f"{field} = NULL")
            elif value is not None:
                if isinstance(value, bool):
                    updates.append(f"{field} = @{field}")
                    params.append(bigquery.ScalarQueryParameter(field, "BOOL", value))
                elif isinstance(value, float):
                    updates.append(f"{field} = @{field}")
                    params.append(bigquery.ScalarQueryParameter(field, "FLOAT64", value))
                elif isinstance(value, PeriodType):
                    updates.append(f"{field} = @{field}")
                    params.append(bigquery.ScalarQueryParameter(field, "STRING", value.value))
                elif hasattr(value, "isoformat"):
                    updates.append(f"{field} = @{field}")
                    params.append(bigquery.ScalarQueryParameter(field, "DATE", value.isoformat()))
                else:
                    updates.append(f"{field} = @{field}")
                    params.append(bigquery.ScalarQueryParameter(field, "STRING", str(value)))

        if not updates:
            return existing

        updates.append("updated_at = CURRENT_TIMESTAMP()")
        if updated_by:
            updates.append("updated_by = @updated_by")
            params.append(bigquery.ScalarQueryParameter("updated_by", "STRING", updated_by))

        query = f"""
            UPDATE `{self.budgets_table}`
            SET {", ".join(updates)}
            WHERE org_slug = @org_slug AND budget_id = @budget_id
        """
        job_config = bigquery.QueryJobConfig(query_parameters=params)

        try:
            self.client.query(query, job_config=job_config).result()
            return await self.get_budget(org_slug, budget_id)
        except Exception as e:
            logger.error(f"Failed to update budget {budget_id}: {e}")
            raise

    async def delete_budget(
        self,
        org_slug: str,
        budget_id: str,
        deleted_by: Optional[str] = None,
    ) -> bool:
        """Soft delete a budget (set is_active = false).

        If this budget is a parent in allocations, also deactivates all
        child budgets linked via org_budget_allocations.
        """
        query = f"""
            UPDATE `{self.budgets_table}`
            SET is_active = FALSE, updated_at = CURRENT_TIMESTAMP(), updated_by = @deleted_by
            WHERE org_slug = @org_slug AND budget_id = @budget_id AND is_active = TRUE
        """
        params = [
            bigquery.ScalarQueryParameter("org_slug", "STRING", org_slug),
            bigquery.ScalarQueryParameter("budget_id", "STRING", budget_id),
            bigquery.ScalarQueryParameter("deleted_by", "STRING", deleted_by or "system"),
        ]
        job_config = bigquery.QueryJobConfig(query_parameters=params)

        try:
            job = self.client.query(query, job_config=job_config)
            job.result()
            deleted = job.num_dml_affected_rows > 0

            if deleted:
                # Cascade: deactivate child budgets linked via allocations
                cascade_query = f"""
                    UPDATE `{self.budgets_table}`
                    SET is_active = FALSE, updated_at = CURRENT_TIMESTAMP(), updated_by = @deleted_by
                    WHERE org_slug = @org_slug
                      AND is_active = TRUE
                      AND budget_id IN (
                          SELECT child_budget_id
                          FROM `{self.allocations_table}`
                          WHERE org_slug = @org_slug AND parent_budget_id = @budget_id
                      )
                """
                cascade_params = [
                    bigquery.ScalarQueryParameter("org_slug", "STRING", org_slug),
                    bigquery.ScalarQueryParameter("budget_id", "STRING", budget_id),
                    bigquery.ScalarQueryParameter("deleted_by", "STRING", deleted_by or "system"),
                ]
                cascade_config = bigquery.QueryJobConfig(query_parameters=cascade_params)
                cascade_job = self.client.query(cascade_query, job_config=cascade_config)
                cascade_job.result()
                if cascade_job.num_dml_affected_rows > 0:
                    logger.info(
                        f"Cascade deleted {cascade_job.num_dml_affected_rows} child budgets "
                        f"for parent {budget_id}"
                    )

            return deleted
        except Exception as e:
            logger.error(f"Failed to delete budget {budget_id}: {e}")
            raise

    async def _create_allocation(
        self,
        org_slug: str,
        parent_budget_id: str,
        child_budget_id: str,
        allocated_amount: float,
        allocation_percentage: float,
    ) -> str:
        """Insert a row into org_budget_allocations."""
        allocation_id = str(uuid.uuid4())
        query = f"""
            INSERT INTO `{self.allocations_table}` (
                allocation_id, org_slug, parent_budget_id, child_budget_id,
                allocated_amount, allocation_percentage, created_at, updated_at
            ) VALUES (
                @allocation_id, @org_slug, @parent_budget_id, @child_budget_id,
                @allocated_amount, @allocation_percentage, CURRENT_TIMESTAMP(), NULL
            )
        """
        params = [
            bigquery.ScalarQueryParameter("allocation_id", "STRING", allocation_id),
            bigquery.ScalarQueryParameter("org_slug", "STRING", org_slug),
            bigquery.ScalarQueryParameter("parent_budget_id", "STRING", parent_budget_id),
            bigquery.ScalarQueryParameter("child_budget_id", "STRING", child_budget_id),
            bigquery.ScalarQueryParameter("allocated_amount", "FLOAT64", allocated_amount),
            bigquery.ScalarQueryParameter("allocation_percentage", "FLOAT64", allocation_percentage),
        ]
        job_config = bigquery.QueryJobConfig(query_parameters=params)
        self.client.query(query, job_config=job_config).result()
        return allocation_id

    async def create_budget_with_allocations(
        self,
        org_slug: str,
        request: TopDownAllocationRequest,
        created_by: Optional[str] = None,
    ) -> TopDownAllocationResponse:
        """Create a parent budget and allocate to children.

        1. Creates the parent budget
        2. For each child: calculate amount, create child budget, create allocation record
        3. Return combined response
        """
        # 1. Create parent budget
        parent_req = BudgetCreateRequest(
            hierarchy_entity_id=request.hierarchy_entity_id,
            hierarchy_entity_name=request.hierarchy_entity_name,
            hierarchy_path=request.hierarchy_path,
            hierarchy_level_code=request.hierarchy_level_code,
            category=request.category,
            budget_type=request.budget_type,
            budget_amount=request.budget_amount,
            currency=request.currency,
            period_type=request.period_type,
            period_start=request.period_start,
            period_end=request.period_end,
            provider=request.provider,
            notes=request.notes,
        )
        parent_budget = await self.create_budget(org_slug, parent_req, created_by)

        # 2. Create child budgets + allocation records
        children_results: List[ChildAllocationResult] = []
        total_allocated = 0.0

        for alloc in request.allocations:
            child_amount = round(request.budget_amount * alloc.percentage / 100, 2)
            total_allocated += child_amount

            child_req = BudgetCreateRequest(
                hierarchy_entity_id=alloc.hierarchy_entity_id,
                hierarchy_entity_name=alloc.hierarchy_entity_name,
                hierarchy_path=alloc.hierarchy_path,
                hierarchy_level_code=alloc.hierarchy_level_code,
                category=request.category,
                budget_type=request.budget_type,
                budget_amount=child_amount,
                currency=request.currency,
                period_type=request.period_type,
                period_start=request.period_start,
                period_end=request.period_end,
                provider=alloc.provider or request.provider,
                notes=alloc.notes,
            )
            child_budget = await self.create_budget(org_slug, child_req, created_by)

            allocation_id = await self._create_allocation(
                org_slug,
                parent_budget.budget_id,
                child_budget.budget_id,
                child_amount,
                alloc.percentage,
            )

            children_results.append(ChildAllocationResult(
                budget=child_budget,
                allocation_id=allocation_id,
                allocated_amount=child_amount,
                allocation_percentage=alloc.percentage,
            ))

        total_pct = sum(a.percentage for a in request.allocations)
        unallocated = round(request.budget_amount - total_allocated, 2)

        return TopDownAllocationResponse(
            parent_budget=parent_budget,
            children=children_results,
            total_allocated=total_allocated,
            total_allocated_percentage=total_pct,
            unallocated_amount=unallocated,
            unallocated_percentage=round(100 - total_pct, 2),
        )

    async def _check_duplicate(
        self,
        org_slug: str,
        hierarchy_entity_id: str,
        category: str,
        budget_type: str,
        period_start: str,
        period_end: str,
        provider: Optional[str],
    ) -> bool:
        """Check for duplicate budget (same entity + category + type + period + provider)."""
        query = f"""
            SELECT COUNT(*) as cnt
            FROM `{self.budgets_table}`
            WHERE org_slug = @org_slug
            AND hierarchy_entity_id = @hierarchy_entity_id
            AND category = @category
            AND budget_type = @budget_type
            AND period_start = @period_start
            AND period_end = @period_end
            AND is_active = TRUE
        """
        params = [
            bigquery.ScalarQueryParameter("org_slug", "STRING", org_slug),
            bigquery.ScalarQueryParameter("hierarchy_entity_id", "STRING", hierarchy_entity_id),
            bigquery.ScalarQueryParameter("category", "STRING", category),
            bigquery.ScalarQueryParameter("budget_type", "STRING", budget_type),
            bigquery.ScalarQueryParameter("period_start", "DATE", period_start),
            bigquery.ScalarQueryParameter("period_end", "DATE", period_end),
        ]

        if provider:
            query += " AND provider = @provider"
            params.append(bigquery.ScalarQueryParameter("provider", "STRING", provider))
        else:
            query += " AND provider IS NULL"

        job_config = bigquery.QueryJobConfig(query_parameters=params)
        results = list(self.client.query(query, job_config=job_config).result())
        return results[0].cnt > 0 if results else False


# Thread-safe global service instance
_budget_crud_service: Optional[BudgetCRUDService] = None
_budget_crud_service_lock = threading.Lock()


def get_budget_crud_service(
    project_id: Optional[str] = None,
    dataset_id: str = "organizations",
) -> BudgetCRUDService:
    """Get or create the global budget CRUD service instance (thread-safe)."""
    global _budget_crud_service

    if _budget_crud_service is not None:
        return _budget_crud_service

    with _budget_crud_service_lock:
        if _budget_crud_service is None:
            project = project_id or os.environ.get("GCP_PROJECT_ID", "cloudact-testing-1")
            _budget_crud_service = BudgetCRUDService(project, dataset_id)

        return _budget_crud_service
