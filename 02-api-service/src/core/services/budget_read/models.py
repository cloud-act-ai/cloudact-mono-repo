"""Budget read response models."""

from typing import Optional, List
from datetime import date, datetime
from pydantic import BaseModel


# ============================================
# Variance / Summary
# ============================================

class BudgetVarianceItem(BaseModel):
    """A single budget vs actual comparison."""
    budget_id: str
    hierarchy_entity_id: str
    hierarchy_entity_name: str
    hierarchy_path: Optional[str] = None
    hierarchy_level_code: str
    category: str
    budget_type: str
    budget_amount: float
    actual_amount: float
    variance: float  # budget_amount - actual_amount (positive = under, negative = over)
    variance_percent: float  # (variance / budget_amount) * 100
    currency: str
    period_type: str
    period_start: date
    period_end: date
    provider: Optional[str] = None
    is_over_budget: bool


class BudgetSummaryResponse(BaseModel):
    """Budget vs actual summary for an org."""
    org_slug: str
    items: List[BudgetVarianceItem]
    total_budget: float
    total_actual: float
    total_variance: float
    total_variance_percent: float
    currency: str
    budgets_over: int
    budgets_under: int
    budgets_total: int


# ============================================
# Allocation Tree
# ============================================

class AllocationNode(BaseModel):
    """A node in the allocation tree."""
    budget_id: str
    hierarchy_entity_id: str
    hierarchy_entity_name: str
    hierarchy_level_code: str
    category: str
    budget_amount: float
    allocated_to_children: float
    unallocated: float
    actual_amount: float
    variance: float
    currency: str
    children: List["AllocationNode"] = []


class AllocationTreeResponse(BaseModel):
    """Full allocation tree for an org."""
    org_slug: str
    roots: List[AllocationNode]
    total_budget: float
    total_allocated: float
    currency: str


# ============================================
# Category Breakdown
# ============================================

class CategoryBreakdownItem(BaseModel):
    """Budget breakdown for a single category."""
    category: str
    budget_amount: float
    actual_amount: float
    variance: float
    variance_percent: float
    budget_count: int
    currency: str
    is_over_budget: bool


class CategoryBreakdownResponse(BaseModel):
    """Budget breakdown by cost category."""
    org_slug: str
    items: List[CategoryBreakdownItem]
    currency: str


# ============================================
# Provider Breakdown
# ============================================

class ProviderBreakdownItem(BaseModel):
    """Budget breakdown for a single provider within a category."""
    provider: str
    category: str
    budget_amount: float
    actual_amount: float
    variance: float
    variance_percent: float
    currency: str
    is_over_budget: bool


class ProviderBreakdownResponse(BaseModel):
    """Budget breakdown by provider."""
    org_slug: str
    category: Optional[str] = None
    items: List[ProviderBreakdownItem]
    currency: str
