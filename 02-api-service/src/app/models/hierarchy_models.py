"""
Pydantic models for N-level configurable organizational hierarchy.

This module provides:
- Level configuration models (define hierarchy structure)
- Entity models (hierarchy nodes at any level)
- Request/response models for CRUD operations
- Tree structure models for visualization
"""

from datetime import datetime
from typing import Optional, List, Dict, Any
from pydantic import BaseModel, Field, EmailStr, field_validator, ConfigDict, model_validator
import re


# ============================================================================
# VALIDATION PATTERNS
# ============================================================================

ENTITY_ID_PATTERN = re.compile(r'^[a-zA-Z0-9_-]{1,50}$')
LEVEL_CODE_PATTERN = re.compile(r'^[a-z][a-z0-9_]{1,29}$')


# ============================================================================
# LEVEL CONFIGURATION MODELS
# ============================================================================

class CreateLevelRequest(BaseModel):
    """Request model for creating a hierarchy level."""
    level: int = Field(
        ...,
        ge=1,
        le=10,
        description="Hierarchy level number (1=root, max 10)"
    )
    level_code: str = Field(
        ...,
        min_length=2,
        max_length=30,
        description="Machine-readable level code (e.g., 'department', 'project')"
    )
    level_name: str = Field(
        ...,
        min_length=1,
        max_length=50,
        description="Human-readable singular name (e.g., 'Department')"
    )
    level_name_plural: str = Field(
        ...,
        min_length=1,
        max_length=50,
        description="Human-readable plural name (e.g., 'Departments')"
    )
    parent_level: Optional[int] = Field(
        default=None,
        ge=1,
        le=9,
        description="Parent level number (NULL for root)"
    )
    is_required: bool = Field(
        default=True,
        description="Whether entities at this level must have a parent"
    )
    is_leaf: bool = Field(
        default=False,
        description="Whether this is a leaf level (cannot have children)"
    )
    max_children: Optional[int] = Field(
        default=None,
        ge=1,
        description="Maximum children per entity (NULL=unlimited)"
    )
    id_prefix: Optional[str] = Field(
        default=None,
        max_length=10,
        description="Auto-prefix for entity IDs (e.g., 'DEPT-')"
    )
    id_auto_generate: bool = Field(
        default=False,
        description="Whether to auto-generate entity IDs"
    )
    metadata_schema: Optional[Dict[str, Any]] = Field(
        default=None,
        description="JSON Schema for validating entity metadata"
    )
    display_order: Optional[int] = Field(
        default=None,
        description="Order for UI display"
    )
    icon: Optional[str] = Field(
        default=None,
        max_length=50,
        description="Icon identifier for UI"
    )
    color: Optional[str] = Field(
        default=None,
        max_length=20,
        description="Color code for UI"
    )

    @field_validator('level_code')
    @classmethod
    def validate_level_code(cls, v: str) -> str:
        """Validate level_code format: lowercase, starts with letter."""
        if not LEVEL_CODE_PATTERN.match(v):
            raise ValueError(
                'level_code must be 2-30 lowercase characters, '
                'starting with a letter, containing only letters, numbers, underscores'
            )
        return v.lower()

    @model_validator(mode='after')
    def validate_level_parent(self) -> 'CreateLevelRequest':
        """Validate parent_level relationship."""
        if self.level == 1 and self.parent_level is not None:
            raise ValueError("Root level (level=1) cannot have a parent")
        if self.level > 1 and self.parent_level is None:
            raise ValueError("Non-root levels must have a parent_level")
        if self.parent_level is not None and self.parent_level >= self.level:
            raise ValueError("parent_level must be less than level")
        return self

    model_config = ConfigDict(extra="forbid", json_schema_extra={
        "example": {
            "level": 1,
            "level_code": "department",
            "level_name": "Department",
            "level_name_plural": "Departments",
            "parent_level": None,
            "is_required": False,
            "is_leaf": False,
            "id_prefix": "DEPT-"
        }
    })


class UpdateLevelRequest(BaseModel):
    """Request model for updating a hierarchy level."""
    level_name: Optional[str] = Field(
        default=None,
        min_length=1,
        max_length=50,
        description="Human-readable singular name"
    )
    level_name_plural: Optional[str] = Field(
        default=None,
        min_length=1,
        max_length=50,
        description="Human-readable plural name"
    )
    is_leaf: Optional[bool] = Field(
        default=None,
        description="Whether this is a leaf level"
    )
    max_children: Optional[int] = Field(
        default=None,
        ge=1,
        description="Maximum children per entity"
    )
    id_prefix: Optional[str] = Field(
        default=None,
        max_length=10,
        description="Auto-prefix for entity IDs"
    )
    id_auto_generate: Optional[bool] = Field(
        default=None,
        description="Whether to auto-generate entity IDs"
    )
    metadata_schema: Optional[Dict[str, Any]] = Field(
        default=None,
        description="JSON Schema for validating entity metadata"
    )
    display_order: Optional[int] = Field(
        default=None,
        description="Order for UI display"
    )
    icon: Optional[str] = Field(
        default=None,
        max_length=50,
        description="Icon identifier for UI"
    )
    color: Optional[str] = Field(
        default=None,
        max_length=20,
        description="Color code for UI"
    )
    is_active: Optional[bool] = Field(
        default=None,
        description="Whether this level is active"
    )

    @model_validator(mode='after')
    def at_least_one_field(self) -> 'UpdateLevelRequest':
        """Ensure at least one field is provided."""
        if all(v is None for v in self.model_dump().values()):
            raise ValueError("At least one field must be provided for update")
        return self

    model_config = ConfigDict(extra="forbid")


class HierarchyLevelResponse(BaseModel):
    """Response model for a hierarchy level configuration."""
    id: str
    org_slug: str
    level: int
    level_code: str
    level_name: str
    level_name_plural: str
    parent_level: Optional[int]
    is_required: bool
    is_leaf: bool
    max_children: Optional[int]
    id_prefix: Optional[str]
    id_auto_generate: bool
    metadata_schema: Optional[Dict[str, Any]]
    display_order: int
    icon: Optional[str]
    color: Optional[str]
    is_active: bool
    created_at: datetime
    created_by: str
    updated_at: Optional[datetime]
    updated_by: Optional[str]

    model_config = ConfigDict(from_attributes=True)


class HierarchyLevelsListResponse(BaseModel):
    """Response model for list of hierarchy levels."""
    org_slug: str
    levels: List[HierarchyLevelResponse]
    total: int
    max_depth: int

    model_config = ConfigDict(from_attributes=True)


# ============================================================================
# ENTITY MODELS
# ============================================================================

class CreateEntityRequest(BaseModel):
    """Request model for creating a hierarchy entity at any level."""
    entity_id: Optional[str] = Field(
        default=None,
        min_length=1,
        max_length=50,
        description="Unique identifier (auto-generated if not provided and level supports it)"
    )
    entity_name: str = Field(
        ...,
        min_length=1,
        max_length=200,
        description="Human-readable entity name"
    )
    level_code: str = Field(
        ...,
        min_length=2,
        max_length=30,
        description="Level code from org_hierarchy_levels configuration"
    )
    parent_id: Optional[str] = Field(
        default=None,
        max_length=50,
        description="Parent entity ID (required for non-root levels)"
    )
    owner_id: Optional[str] = Field(
        default=None,
        max_length=100,
        description="Owner/leader user ID"
    )
    owner_name: Optional[str] = Field(
        default=None,
        max_length=200,
        description="Owner/leader display name"
    )
    owner_email: Optional[EmailStr] = Field(
        default=None,
        description="Owner/leader email"
    )
    description: Optional[str] = Field(
        default=None,
        max_length=1000,
        description="Entity description"
    )
    metadata: Optional[Dict[str, Any]] = Field(
        default=None,
        description="Level-specific custom attributes"
    )
    sort_order: Optional[int] = Field(
        default=None,
        description="Custom sort order within parent"
    )

    @field_validator('entity_id')
    @classmethod
    def validate_entity_id(cls, v: Optional[str]) -> Optional[str]:
        """Validate entity_id format if provided."""
        if v is None:
            return None
        if not ENTITY_ID_PATTERN.match(v):
            raise ValueError(
                'entity_id must be 1-50 characters containing only '
                'alphanumeric characters, hyphens, and underscores'
            )
        return v.upper()

    @field_validator('parent_id')
    @classmethod
    def validate_parent_id(cls, v: Optional[str]) -> Optional[str]:
        """Validate parent_id format if provided."""
        if v is None:
            return None
        if not ENTITY_ID_PATTERN.match(v):
            raise ValueError(
                'parent_id must be 1-50 characters containing only '
                'alphanumeric characters, hyphens, and underscores'
            )
        return v.upper()

    @field_validator('level_code')
    @classmethod
    def validate_level_code(cls, v: str) -> str:
        """Normalize level_code to lowercase."""
        return v.lower()

    model_config = ConfigDict(extra="forbid", json_schema_extra={
        "example": {
            "entity_id": "DEPT-001",
            "entity_name": "Engineering",
            "level_code": "department",
            "parent_id": None,
            "owner_name": "John Doe",
            "owner_email": "john@example.com",
            "description": "Engineering department"
        }
    })


class UpdateEntityRequest(BaseModel):
    """Request model for updating a hierarchy entity."""
    entity_name: Optional[str] = Field(
        default=None,
        min_length=1,
        max_length=200,
        description="Human-readable entity name"
    )
    owner_id: Optional[str] = Field(
        default=None,
        max_length=100,
        description="Owner/leader user ID"
    )
    owner_name: Optional[str] = Field(
        default=None,
        max_length=200,
        description="Owner/leader display name"
    )
    owner_email: Optional[EmailStr] = Field(
        default=None,
        description="Owner/leader email"
    )
    description: Optional[str] = Field(
        default=None,
        max_length=1000,
        description="Entity description"
    )
    metadata: Optional[Dict[str, Any]] = Field(
        default=None,
        description="Level-specific custom attributes"
    )
    sort_order: Optional[int] = Field(
        default=None,
        description="Custom sort order within parent"
    )
    is_active: Optional[bool] = Field(
        default=None,
        description="Whether entity is active"
    )

    @model_validator(mode='after')
    def at_least_one_field(self) -> 'UpdateEntityRequest':
        """Ensure at least one field is provided."""
        if all(v is None for v in self.model_dump().values()):
            raise ValueError("At least one field must be provided for update")
        return self

    model_config = ConfigDict(extra="forbid")


class MoveEntityRequest(BaseModel):
    """Request model for moving an entity to a new parent."""
    new_parent_id: Optional[str] = Field(
        default=None,
        max_length=50,
        description="New parent entity ID (NULL to move to root if allowed)"
    )

    @field_validator('new_parent_id')
    @classmethod
    def validate_parent_id(cls, v: Optional[str]) -> Optional[str]:
        """Validate parent_id format if provided."""
        if v is None:
            return None
        if not ENTITY_ID_PATTERN.match(v):
            raise ValueError('Invalid parent_id format')
        return v.upper()

    model_config = ConfigDict(extra="forbid")


class HierarchyEntityResponse(BaseModel):
    """Response model for a hierarchy entity."""
    id: str
    org_slug: str
    entity_id: str
    entity_name: str
    level: int
    level_code: str
    parent_id: Optional[str]
    path: str
    path_ids: List[str]
    path_names: List[str]
    depth: int
    owner_id: Optional[str]
    owner_name: Optional[str]
    owner_email: Optional[str]
    description: Optional[str]
    metadata: Optional[Dict[str, Any]]
    sort_order: Optional[int]
    is_active: bool
    created_at: datetime
    created_by: str
    updated_at: Optional[datetime]
    updated_by: Optional[str]
    version: int
    # Computed fields (populated by service)
    level_name: Optional[str] = None
    children_count: Optional[int] = None

    model_config = ConfigDict(from_attributes=True)


class HierarchyListResponse(BaseModel):
    """Response model for list of hierarchy entities."""
    org_slug: str
    entities: List[HierarchyEntityResponse]
    total: int

    model_config = ConfigDict(from_attributes=True)


# ============================================================================
# TREE MODELS
# ============================================================================

class HierarchyTreeNode(BaseModel):
    """Tree node for hierarchy visualization."""
    id: str
    entity_id: str
    entity_name: str
    level: int
    level_code: str
    level_name: str
    path: str
    depth: int
    owner_name: Optional[str]
    owner_email: Optional[str]
    description: Optional[str]
    is_active: bool
    metadata: Optional[Dict[str, Any]]
    children: List['HierarchyTreeNode'] = Field(default_factory=list)

    model_config = ConfigDict(from_attributes=True)


class HierarchyTreeResponse(BaseModel):
    """Response model for full hierarchy tree."""
    org_slug: str
    levels: List[HierarchyLevelResponse]
    roots: List[HierarchyTreeNode]
    stats: Dict[str, int]  # {"department": 5, "project": 12, "team": 25, "total": 42}

    model_config = ConfigDict(from_attributes=True)


# ============================================================================
# DELETION MODELS
# ============================================================================

class DeletionBlockedResponse(BaseModel):
    """Response model when deletion is blocked."""
    entity_id: str
    level_code: str
    blocked: bool
    reason: str
    blocking_entities: List[Dict[str, str]]

    model_config = ConfigDict(from_attributes=True, json_schema_extra={
        "example": {
            "entity_id": "DEPT-001",
            "level_code": "department",
            "blocked": True,
            "reason": "Cannot delete entity with active children",
            "blocking_entities": [
                {"entity_id": "PROJ-001", "entity_name": "Platform", "level_code": "project"}
            ]
        }
    })


# ============================================================================
# ANCESTORS/DESCENDANTS MODELS
# ============================================================================

class AncestorResponse(BaseModel):
    """Response model for ancestor chain."""
    org_slug: str
    entity_id: str
    ancestors: List[HierarchyEntityResponse]

    model_config = ConfigDict(from_attributes=True)


class DescendantsResponse(BaseModel):
    """Response model for descendants."""
    org_slug: str
    entity_id: str
    descendants: List[HierarchyEntityResponse]
    total: int

    model_config = ConfigDict(from_attributes=True)


# Enable forward references for recursive model
HierarchyTreeNode.model_rebuild()
