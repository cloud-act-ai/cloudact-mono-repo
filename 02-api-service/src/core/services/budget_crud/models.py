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
        valid = {"department", "project", "team"}
        if v.lower() not in valid:
            raise ValueError(f"hierarchy_level_code must be one of: {', '.join(valid)}")
        return v.lower()

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
