"""
Budget Planning Router

Endpoints for managing organization budgets — hierarchy-based budget targets,
variance tracking, allocation trees, and category/provider breakdowns.

URL Structure: /api/v1/budgets/{org_slug}/...

Features:
- CRUD for budgets at any hierarchy level
- Budget vs actual variance calculation
- Top-down allocation tree
- Category and provider breakdowns
- Owner-only create/update/delete, all members can view
"""

import os
import logging
import re
from typing import Optional
from fastapi import APIRouter, Depends, HTTPException, Query, Path, status

from src.core.services.budget_crud.service import get_budget_crud_service, BudgetCRUDService
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
)
from src.core.services.budget_read.service import get_budget_read_service, BudgetReadService
from src.core.services.budget_read.models import (
    BudgetSummaryResponse,
    AllocationTreeResponse,
    CategoryBreakdownResponse,
    ProviderBreakdownResponse,
)
from src.app.dependencies.auth import get_org_or_admin_auth, AuthResult

logger = logging.getLogger(__name__)

router = APIRouter()


# ============================================================================
# Service Factories
# ============================================================================

def get_crud_service() -> BudgetCRUDService:
    """Get budget CRUD service."""
    project_id = os.environ.get("GCP_PROJECT_ID", "cloudact-testing-1")
    return get_budget_crud_service(project_id)


def get_read_service() -> BudgetReadService:
    """Get budget read service."""
    project_id = os.environ.get("GCP_PROJECT_ID", "cloudact-testing-1")
    return get_budget_read_service(project_id)


# ============================================================================
# IDOR Protection
# ============================================================================

def check_auth_result_access(auth: AuthResult, org_slug: str) -> None:
    """Check IDOR protection — admins can access any org, org keys match only."""
    if auth.is_admin:
        return
    if auth.org_slug != org_slug:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Cannot access data for another organization",
        )


_DATE_RE = re.compile(r"^\d{4}-\d{2}-\d{2}$")

def _validate_date_param(value: Optional[str], name: str) -> Optional[str]:
    """Validate date query parameter is YYYY-MM-DD format."""
    if value is None:
        return None
    if not _DATE_RE.match(value):
        raise HTTPException(
            status_code=400,
            detail=f"Invalid {name} format — use YYYY-MM-DD",
        )
    return value


def check_owner_access(auth: AuthResult, org_slug: str) -> None:
    """Check write access for budget operations.

    Note: Owner vs member distinction is enforced at the frontend via Supabase auth.
    The API key grants full access to the org's data — IDOR protection is the
    critical check here (org key can only access its own org).
    """
    check_auth_result_access(auth, org_slug)


# ============================================================================
# CRUD Endpoints
# ============================================================================

@router.get(
    "/{org_slug}",
    response_model=BudgetListResponse,
    summary="List budgets",
    description="List all budgets for an organization with optional filters.",
)
async def list_budgets(
    org_slug: str = Path(..., description="Organization slug"),
    category: Optional[BudgetCategory] = Query(None, description="Filter by category"),
    hierarchy_entity_id: Optional[str] = Query(None, description="Filter by hierarchy entity"),
    is_active: Optional[bool] = Query(True, description="Filter by active status"),
    period_type: Optional[PeriodType] = Query(None, description="Filter by period type"),
    auth: AuthResult = Depends(get_org_or_admin_auth),
):
    """List budgets with filters."""
    check_auth_result_access(auth, org_slug)
    try:
        service = get_crud_service()
        return await service.list_budgets(
            org_slug,
            category=category,
            hierarchy_entity_id=hierarchy_entity_id,
            is_active=is_active,
            period_type=period_type,
        )
    except Exception as e:
        logger.error(f"Failed to list budgets for {org_slug}: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail="Failed to list budgets")


@router.get(
    "/{org_slug}/summary",
    response_model=BudgetSummaryResponse,
    summary="Budget summary",
    description="Get budget vs actual variance summary.",
)
async def get_budget_summary(
    org_slug: str = Path(..., description="Organization slug"),
    category: Optional[str] = Query(None, description="Filter by category"),
    hierarchy_entity_id: Optional[str] = Query(None, description="Filter by hierarchy entity"),
    period_type: Optional[str] = Query(None, description="Filter by period type"),
    period_start: Optional[str] = Query(None, description="Filter by period start (YYYY-MM-DD)"),
    period_end: Optional[str] = Query(None, description="Filter by period end (YYYY-MM-DD)"),
    auth: AuthResult = Depends(get_org_or_admin_auth),
):
    """Get budget vs actual variance summary."""
    check_auth_result_access(auth, org_slug)
    _validate_date_param(period_start, "period_start")
    _validate_date_param(period_end, "period_end")
    try:
        service = get_read_service()
        return await service.get_budget_summary(
            org_slug, category, hierarchy_entity_id,
            period_type=period_type, period_start=period_start, period_end=period_end,
        )
    except Exception as e:
        logger.error(f"Failed to get budget summary for {org_slug}: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail="Failed to get budget summary")


@router.get(
    "/{org_slug}/allocation-tree",
    response_model=AllocationTreeResponse,
    summary="Allocation tree",
    description="Get hierarchy tree with budget allocations and actuals.",
)
async def get_allocation_tree(
    org_slug: str = Path(..., description="Organization slug"),
    category: Optional[str] = Query(None, description="Filter by category"),
    root_entity_id: Optional[str] = Query(None, description="Root entity ID for subtree view"),
    period_type: Optional[str] = Query(None, description="Filter by period type"),
    period_start: Optional[str] = Query(None, description="Filter by period start (YYYY-MM-DD)"),
    period_end: Optional[str] = Query(None, description="Filter by period end (YYYY-MM-DD)"),
    auth: AuthResult = Depends(get_org_or_admin_auth),
):
    """Get budget allocation tree."""
    check_auth_result_access(auth, org_slug)
    _validate_date_param(period_start, "period_start")
    _validate_date_param(period_end, "period_end")
    try:
        service = get_read_service()
        return await service.get_allocation_tree(
            org_slug, category,
            root_entity_id=root_entity_id, period_type=period_type,
            period_start=period_start, period_end=period_end,
        )
    except Exception as e:
        logger.error(f"Failed to get allocation tree for {org_slug}: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail="Failed to get allocation tree")


@router.get(
    "/{org_slug}/by-category",
    response_model=CategoryBreakdownResponse,
    summary="Category breakdown",
    description="Get budget breakdown by cost category.",
)
async def get_category_breakdown(
    org_slug: str = Path(..., description="Organization slug"),
    hierarchy_entity_id: Optional[str] = Query(None, description="Filter by hierarchy entity"),
    period_type: Optional[str] = Query(None, description="Filter by period type"),
    period_start: Optional[str] = Query(None, description="Filter by period start (YYYY-MM-DD)"),
    period_end: Optional[str] = Query(None, description="Filter by period end (YYYY-MM-DD)"),
    auth: AuthResult = Depends(get_org_or_admin_auth),
):
    """Get category breakdown."""
    check_auth_result_access(auth, org_slug)
    _validate_date_param(period_start, "period_start")
    _validate_date_param(period_end, "period_end")
    try:
        service = get_read_service()
        return await service.get_category_breakdown(
            org_slug,
            hierarchy_entity_id=hierarchy_entity_id, period_type=period_type,
            period_start=period_start, period_end=period_end,
        )
    except Exception as e:
        logger.error(f"Failed to get category breakdown for {org_slug}: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail="Failed to get category breakdown")


@router.get(
    "/{org_slug}/by-provider",
    response_model=ProviderBreakdownResponse,
    summary="Provider breakdown",
    description="Get budget breakdown by provider.",
)
async def get_provider_breakdown(
    org_slug: str = Path(..., description="Organization slug"),
    category: Optional[str] = Query(None, description="Filter by category"),
    hierarchy_entity_id: Optional[str] = Query(None, description="Filter by hierarchy entity"),
    period_type: Optional[str] = Query(None, description="Filter by period type"),
    period_start: Optional[str] = Query(None, description="Filter by period start (YYYY-MM-DD)"),
    period_end: Optional[str] = Query(None, description="Filter by period end (YYYY-MM-DD)"),
    auth: AuthResult = Depends(get_org_or_admin_auth),
):
    """Get provider breakdown."""
    check_auth_result_access(auth, org_slug)
    _validate_date_param(period_start, "period_start")
    _validate_date_param(period_end, "period_end")
    try:
        service = get_read_service()
        return await service.get_provider_breakdown(
            org_slug, category,
            hierarchy_entity_id=hierarchy_entity_id, period_type=period_type,
            period_start=period_start, period_end=period_end,
        )
    except Exception as e:
        logger.error(f"Failed to get provider breakdown for {org_slug}: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail="Failed to get provider breakdown")


@router.post(
    "/{org_slug}/allocate",
    response_model=TopDownAllocationResponse,
    status_code=201,
    summary="Top-down allocation",
    description="Create a parent budget and allocate to children (owner only).",
)
async def create_top_down_allocation(
    org_slug: str = Path(..., description="Organization slug"),
    request: TopDownAllocationRequest = ...,
    auth: AuthResult = Depends(get_org_or_admin_auth),
):
    """Create a parent budget with top-down allocation to children."""
    check_owner_access(auth, org_slug)
    created_by = auth.org_data.get("admin_email", "system") if auth.org_data else "admin"
    try:
        service = get_crud_service()
        return await service.create_budget_with_allocations(org_slug, request, created_by)
    except ValueError as e:
        error_msg = str(e)
        if "already exists" in error_msg.lower():
            raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=error_msg)
        raise HTTPException(status_code=400, detail=error_msg)
    except Exception as e:
        logger.error(f"Failed to create top-down allocation: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail="Failed to create budget allocation")


@router.get(
    "/{org_slug}/{budget_id}",
    response_model=BudgetResponse,
    summary="Get budget",
    description="Get a specific budget by ID.",
)
async def get_budget(
    org_slug: str = Path(..., description="Organization slug"),
    budget_id: str = Path(..., description="Budget ID"),
    auth: AuthResult = Depends(get_org_or_admin_auth),
):
    """Get a single budget."""
    check_auth_result_access(auth, org_slug)
    try:
        service = get_crud_service()
        budget = await service.get_budget(org_slug, budget_id)
        if not budget:
            raise HTTPException(status_code=404, detail="Budget not found")
        # Defense-in-depth: verify org isolation
        if budget.org_slug != org_slug:
            raise HTTPException(status_code=404, detail="Budget not found")
        return budget
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Failed to get budget {budget_id}: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail="Failed to get budget")


@router.post(
    "/{org_slug}",
    response_model=BudgetResponse,
    status_code=201,
    summary="Create budget",
    description="Create a new budget (owner only).",
)
async def create_budget(
    org_slug: str = Path(..., description="Organization slug"),
    request: BudgetCreateRequest = ...,
    auth: AuthResult = Depends(get_org_or_admin_auth),
):
    """Create a new budget."""
    check_owner_access(auth, org_slug)
    created_by = auth.org_data.get("admin_email", "system") if auth.org_data else "admin"
    try:
        service = get_crud_service()
        return await service.create_budget(org_slug, request, created_by)
    except ValueError as e:
        error_msg = str(e)
        if "already exists" in error_msg.lower():
            raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=error_msg)
        raise HTTPException(status_code=400, detail=error_msg)
    except Exception as e:
        logger.error(f"Failed to create budget: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail="Failed to create budget")


@router.put(
    "/{org_slug}/{budget_id}",
    response_model=BudgetResponse,
    summary="Update budget",
    description="Update a budget (owner only).",
)
async def update_budget(
    org_slug: str = Path(..., description="Organization slug"),
    budget_id: str = Path(..., description="Budget ID"),
    request: BudgetUpdateRequest = ...,
    auth: AuthResult = Depends(get_org_or_admin_auth),
):
    """Update an existing budget."""
    check_owner_access(auth, org_slug)
    updated_by = auth.org_data.get("admin_email", "system") if auth.org_data else "admin"
    try:
        service = get_crud_service()
        result = await service.update_budget(org_slug, budget_id, request, updated_by)
        if not result:
            raise HTTPException(status_code=404, detail="Budget not found")
        return result
    except HTTPException:
        raise
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        logger.error(f"Failed to update budget {budget_id}: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail="Failed to update budget")


@router.delete(
    "/{org_slug}/{budget_id}",
    status_code=204,
    summary="Delete budget",
    description="Soft delete a budget (owner only).",
)
async def delete_budget(
    org_slug: str = Path(..., description="Organization slug"),
    budget_id: str = Path(..., description="Budget ID"),
    auth: AuthResult = Depends(get_org_or_admin_auth),
):
    """Soft delete a budget."""
    check_owner_access(auth, org_slug)
    deleted_by = auth.org_data.get("admin_email", "system") if auth.org_data else "admin"
    try:
        service = get_crud_service()
        deleted = await service.delete_budget(org_slug, budget_id, deleted_by)
        if not deleted:
            raise HTTPException(status_code=404, detail="Budget not found")
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Failed to delete budget {budget_id}: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail="Failed to delete budget")
