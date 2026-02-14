"""Budget CRUD Pydantic models."""

from enum import Enum
from typing import Optional, List
from datetime import date, datetime
from pydantic import BaseModel, Field, field_validator, ConfigDict


class BudgetCategory(str, Enum):
    """Cost category for a budget."""
    CLOUD = "cloud"
    GENAI = "genai"
    SUBSCRIPTION = "subscription"
    TOTAL = "total"


class BudgetType(str, Enum):
    """Type of budget measurement."""
    MONETARY = "monetary"
    TOKEN = "token"
    SEAT = "seat"


class PeriodType(str, Enum):
    """Budget period granularity."""
    MONTHLY = "monthly"
    QUARTERLY = "quarterly"
    YEARLY = "yearly"
    CUSTOM = "custom"


# ============================================
# Request Models
# ============================================

class BudgetCreateRequest(BaseModel):
    """Request model for creating a budget."""
    model_config = ConfigDict(extra="forbid")

    hierarchy_entity_id: str = Field(..., min_length=1, max_length=100, description="Hierarchy entity ID")
    hierarchy_entity_name: str = Field(..., min_length=1, max_length=200, description="Hierarchy entity name")
    hierarchy_path: Optional[str] = Field(None, max_length=500, description="Materialized hierarchy path")
    hierarchy_level_code: str = Field(..., min_length=1, max_length=50, description="Hierarchy level code")
    category: BudgetCategory = Field(..., description="Cost category")
    budget_type: BudgetType = Field(default=BudgetType.MONETARY, description="Budget type")
    budget_amount: float = Field(..., gt=0, description="Budget amount")
    currency: str = Field(default="USD", min_length=3, max_length=3, description="Currency code")
    period_type: PeriodType = Field(..., description="Budget period type")
    period_start: date = Field(..., description="Period start date")
    period_end: date = Field(..., description="Period end date")
    provider: Optional[str] = Field(None, max_length=50, description="Optional provider filter")
    notes: Optional[str] = Field(None, max_length=1000, description="Optional notes")

    @field_validator("hierarchy_level_code")
    @classmethod
    def validate_level_code(cls, v: str) -> str:
        # Accept any non-empty level code — hierarchy levels are user-configurable
        return v.lower()

    @field_validator("budget_type")
    @classmethod
    def validate_budget_type_category(cls, v: BudgetType, info) -> BudgetType:
        category = info.data.get("category")
        if category and v == BudgetType.TOKEN and category != BudgetCategory.GENAI:
            raise ValueError("Token budgets are only valid for the 'genai' category")
        if category and v == BudgetType.SEAT and category != BudgetCategory.SUBSCRIPTION:
            raise ValueError("Seat budgets are only valid for the 'subscription' category")
        return v

    @field_validator("period_end")
    @classmethod
    def validate_period_end(cls, v: date, info) -> date:
        if "period_start" in info.data and v <= info.data["period_start"]:
            raise ValueError("period_end must be after period_start")
        return v

    @field_validator("currency")
    @classmethod
    def validate_currency(cls, v: str) -> str:
        return v.upper()


class BudgetUpdateRequest(BaseModel):
    """Request model for updating a budget."""
    model_config = ConfigDict(extra="forbid")

    hierarchy_entity_name: Optional[str] = Field(None, min_length=1, max_length=200)
    hierarchy_path: Optional[str] = Field(None, max_length=500)
    budget_amount: Optional[float] = Field(None, gt=0)
    currency: Optional[str] = Field(None, min_length=3, max_length=3)
    period_type: Optional[PeriodType] = None
    period_start: Optional[date] = None
    period_end: Optional[date] = None
    provider: Optional[str] = Field(None, max_length=50)
    notes: Optional[str] = Field(None, max_length=1000)
    is_active: Optional[bool] = None

    @field_validator("currency")
    @classmethod
    def validate_currency(cls, v: Optional[str]) -> Optional[str]:
        return v.upper() if v else v

    @field_validator("period_end")
    @classmethod
    def validate_period_end(cls, v: Optional[date], info) -> Optional[date]:
        if v and "period_start" in info.data and info.data["period_start"]:
            if v <= info.data["period_start"]:
                raise ValueError("period_end must be after period_start")
        return v


# ============================================
# Response Models
# ============================================

class BudgetResponse(BaseModel):
    """Response model for a single budget."""
    budget_id: str
    org_slug: str
    hierarchy_entity_id: str
    hierarchy_entity_name: str
    hierarchy_path: Optional[str] = None
    hierarchy_level_code: str
    category: str
    budget_type: str
    budget_amount: float
    currency: str
    period_type: str
    period_start: date
    period_end: date
    provider: Optional[str] = None
    notes: Optional[str] = None
    is_active: bool
    created_by: Optional[str] = None
    updated_by: Optional[str] = None
    created_at: datetime
    updated_at: Optional[datetime] = None


class BudgetListResponse(BaseModel):
    """Response model for list of budgets."""
    budgets: List[BudgetResponse]
    total: int


# ============================================
# Top-Down Allocation Models
# ============================================

class ChildAllocationItem(BaseModel):
    """One child in a top-down allocation request."""
    model_config = ConfigDict(extra="forbid")

    hierarchy_entity_id: str = Field(..., min_length=1, max_length=100)
    hierarchy_entity_name: str = Field(..., min_length=1, max_length=200)
    hierarchy_path: Optional[str] = Field(None, max_length=500)
    hierarchy_level_code: str = Field(..., min_length=1, max_length=50)
    percentage: float = Field(..., gt=0, le=100, description="Allocation percentage (0-100)")
    provider: Optional[str] = Field(None, max_length=50)
    notes: Optional[str] = Field(None, max_length=1000)

    @field_validator("hierarchy_level_code")
    @classmethod
    def validate_level_code(cls, v: str) -> str:
        return v.lower()


class TopDownAllocationRequest(BaseModel):
    """Request model for top-down budget allocation."""
    model_config = ConfigDict(extra="forbid")

    # Parent budget fields
    hierarchy_entity_id: str = Field(..., min_length=1, max_length=100)
    hierarchy_entity_name: str = Field(..., min_length=1, max_length=200)
    hierarchy_path: Optional[str] = Field(None, max_length=500)
    hierarchy_level_code: str = Field(..., min_length=1, max_length=50)
    category: BudgetCategory = Field(...)
    budget_type: BudgetType = Field(default=BudgetType.MONETARY)
    budget_amount: float = Field(..., gt=0)
    currency: str = Field(default="USD", min_length=3, max_length=3)
    period_type: PeriodType = Field(...)
    period_start: date = Field(...)
    period_end: date = Field(...)
    provider: Optional[str] = Field(None, max_length=50)
    notes: Optional[str] = Field(None, max_length=1000)

    # Child allocations
    allocations: List[ChildAllocationItem] = Field(..., min_length=1)

    @field_validator("hierarchy_level_code")
    @classmethod
    def validate_level_code(cls, v: str) -> str:
        return v.lower()

    @field_validator("budget_type")
    @classmethod
    def validate_budget_type_category(cls, v: BudgetType, info) -> BudgetType:
        category = info.data.get("category")
        if category and v == BudgetType.TOKEN and category != BudgetCategory.GENAI:
            raise ValueError("Token budgets are only valid for the 'genai' category")
        if category and v == BudgetType.SEAT and category != BudgetCategory.SUBSCRIPTION:
            raise ValueError("Seat budgets are only valid for the 'subscription' category")
        return v

    @field_validator("period_end")
    @classmethod
    def validate_period_end(cls, v: date, info) -> date:
        if "period_start" in info.data and v <= info.data["period_start"]:
            raise ValueError("period_end must be after period_start")
        return v

    @field_validator("currency")
    @classmethod
    def validate_currency(cls, v: str) -> str:
        return v.upper()

    @field_validator("allocations")
    @classmethod
    def validate_allocations(cls, v: List[ChildAllocationItem]) -> List[ChildAllocationItem]:
        total_pct = sum(a.percentage for a in v)
        if total_pct > 100:
            raise ValueError(f"Total allocation percentage ({total_pct}%) exceeds 100%")
        entity_ids = [a.hierarchy_entity_id for a in v]
        if len(entity_ids) != len(set(entity_ids)):
            raise ValueError("Duplicate child entity IDs in allocations")
        return v


class ChildAllocationResult(BaseModel):
    """Result for a single child allocation."""
    budget: BudgetResponse
    allocation_id: str
    allocated_amount: float
    allocation_percentage: float


class TopDownAllocationResponse(BaseModel):
    """Response model for top-down allocation."""
    parent_budget: BudgetResponse
    children: List[ChildAllocationResult]
    total_allocated: float
    total_allocated_percentage: float
    unallocated_amount: float
    unallocated_percentage: float
