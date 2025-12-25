"""
Pydantic models for organizational hierarchy management.

This module provides:
- Request models for hierarchy CRUD operations
- Response models for hierarchy entities
- CSV import/export models
- Enums for entity types
"""

from datetime import datetime
from enum import Enum
from typing import Optional, List, Dict, Any
from pydantic import BaseModel, Field, EmailStr, field_validator, ConfigDict, model_validator
import re


# ============================================================================
# ENUMS
# ============================================================================

class HierarchyEntityType(str, Enum):
    """Types of hierarchy entities."""
    DEPARTMENT = "department"
    PROJECT = "project"
    TEAM = "team"


# ============================================================================
# REQUEST MODELS
# ============================================================================

class CreateDepartmentRequest(BaseModel):
    """Request model for creating a department."""
    entity_id: str = Field(
        ...,
        min_length=1,
        max_length=50,
        description="Unique identifier for the department. Example: 'DEPT-001'"
    )
    entity_name: str = Field(
        ...,
        min_length=1,
        max_length=200,
        description="Human-readable department name"
    )
    owner_id: Optional[str] = Field(
        default=None,
        max_length=100,
        description="Owner user ID"
    )
    owner_name: Optional[str] = Field(
        default=None,
        max_length=200,
        description="Owner full name"
    )
    owner_email: Optional[EmailStr] = Field(
        default=None,
        description="Owner email address"
    )
    description: Optional[str] = Field(
        default=None,
        max_length=1000,
        description="Department description"
    )
    metadata: Optional[Dict[str, Any]] = Field(
        default=None,
        description="Custom metadata"
    )

    @field_validator('entity_id')
    @classmethod
    def validate_entity_id(cls, v: str) -> str:
        """Validate entity_id format: alphanumeric, hyphens, underscores."""
        if not re.match(r'^[a-zA-Z0-9_-]{1,50}$', v):
            raise ValueError(
                'entity_id must be 1-50 characters containing only '
                'alphanumeric characters, hyphens, and underscores'
            )
        return v.upper()

    model_config = ConfigDict(extra="forbid", json_schema_extra={
        "example": {
            "entity_id": "DEPT-001",
            "entity_name": "Engineering",
            "owner_name": "John Doe",
            "owner_email": "john@example.com",
            "description": "Engineering department"
        }
    })


class CreateProjectRequest(BaseModel):
    """Request model for creating a project."""
    entity_id: str = Field(
        ...,
        min_length=1,
        max_length=50,
        description="Unique identifier for the project. Example: 'PROJ-001'"
    )
    entity_name: str = Field(
        ...,
        min_length=1,
        max_length=200,
        description="Human-readable project name"
    )
    dept_id: str = Field(
        ...,
        min_length=1,
        max_length=50,
        description="Parent department ID"
    )
    owner_id: Optional[str] = Field(
        default=None,
        max_length=100,
        description="Owner user ID"
    )
    owner_name: Optional[str] = Field(
        default=None,
        max_length=200,
        description="Owner full name"
    )
    owner_email: Optional[EmailStr] = Field(
        default=None,
        description="Owner email address"
    )
    description: Optional[str] = Field(
        default=None,
        max_length=1000,
        description="Project description"
    )
    metadata: Optional[Dict[str, Any]] = Field(
        default=None,
        description="Custom metadata"
    )

    @field_validator('entity_id', 'dept_id')
    @classmethod
    def validate_entity_id(cls, v: str) -> str:
        """Validate entity_id format."""
        if not re.match(r'^[a-zA-Z0-9_-]{1,50}$', v):
            raise ValueError(
                'ID must be 1-50 characters containing only '
                'alphanumeric characters, hyphens, and underscores'
            )
        return v.upper()

    model_config = ConfigDict(extra="forbid", json_schema_extra={
        "example": {
            "entity_id": "PROJ-001",
            "entity_name": "Platform",
            "dept_id": "DEPT-001",
            "owner_name": "Jane Smith",
            "owner_email": "jane@example.com",
            "description": "Platform infrastructure project"
        }
    })


class CreateTeamRequest(BaseModel):
    """Request model for creating a team."""
    entity_id: str = Field(
        ...,
        min_length=1,
        max_length=50,
        description="Unique identifier for the team. Example: 'TEAM-001'"
    )
    entity_name: str = Field(
        ...,
        min_length=1,
        max_length=200,
        description="Human-readable team name"
    )
    project_id: str = Field(
        ...,
        min_length=1,
        max_length=50,
        description="Parent project ID"
    )
    owner_id: Optional[str] = Field(
        default=None,
        max_length=100,
        description="Owner user ID"
    )
    owner_name: Optional[str] = Field(
        default=None,
        max_length=200,
        description="Owner full name"
    )
    owner_email: Optional[EmailStr] = Field(
        default=None,
        description="Owner email address"
    )
    description: Optional[str] = Field(
        default=None,
        max_length=1000,
        description="Team description"
    )
    metadata: Optional[Dict[str, Any]] = Field(
        default=None,
        description="Custom metadata"
    )

    @field_validator('entity_id', 'project_id')
    @classmethod
    def validate_entity_id(cls, v: str) -> str:
        """Validate entity_id format."""
        if not re.match(r'^[a-zA-Z0-9_-]{1,50}$', v):
            raise ValueError(
                'ID must be 1-50 characters containing only '
                'alphanumeric characters, hyphens, and underscores'
            )
        return v.upper()

    model_config = ConfigDict(extra="forbid", json_schema_extra={
        "example": {
            "entity_id": "TEAM-001",
            "entity_name": "Backend",
            "project_id": "PROJ-001",
            "owner_name": "Bob Wilson",
            "owner_email": "bob@example.com",
            "description": "Backend development team"
        }
    })


class UpdateHierarchyEntityRequest(BaseModel):
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
        description="Owner user ID"
    )
    owner_name: Optional[str] = Field(
        default=None,
        max_length=200,
        description="Owner full name"
    )
    owner_email: Optional[EmailStr] = Field(
        default=None,
        description="Owner email address"
    )
    description: Optional[str] = Field(
        default=None,
        max_length=1000,
        description="Entity description"
    )
    metadata: Optional[Dict[str, Any]] = Field(
        default=None,
        description="Custom metadata"
    )
    is_active: Optional[bool] = Field(
        default=None,
        description="Whether entity is active"
    )

    @model_validator(mode='after')
    def at_least_one_field_required(self) -> 'UpdateHierarchyEntityRequest':
        """Ensure at least one field is provided for update."""
        if all(v is None for v in [
            self.entity_name, self.owner_id, self.owner_name,
            self.owner_email, self.description, self.metadata, self.is_active
        ]):
            raise ValueError("At least one field must be provided for update")
        return self

    model_config = ConfigDict(extra="forbid", json_schema_extra={
        "example": {
            "entity_name": "Engineering (Updated)",
            "owner_name": "New Owner",
            "description": "Updated description"
        }
    })


class HierarchyCSVRow(BaseModel):
    """Model for a single row in hierarchy CSV import."""
    entity_type: HierarchyEntityType = Field(
        ...,
        description="Type of entity: department, project, or team"
    )
    entity_id: str = Field(
        ...,
        min_length=1,
        max_length=50,
        description="Unique identifier for the entity"
    )
    entity_name: str = Field(
        ...,
        min_length=1,
        max_length=200,
        description="Human-readable entity name"
    )
    parent_id: Optional[str] = Field(
        default=None,
        max_length=50,
        description="Parent entity ID (dept_id for projects, project_id for teams)"
    )
    owner_id: Optional[str] = Field(
        default=None,
        max_length=100,
        description="Owner user ID"
    )
    owner_name: Optional[str] = Field(
        default=None,
        max_length=200,
        description="Owner full name"
    )
    owner_email: Optional[str] = Field(
        default=None,
        max_length=254,
        description="Owner email address"
    )
    description: Optional[str] = Field(
        default=None,
        max_length=1000,
        description="Entity description"
    )

    @field_validator('entity_id', 'parent_id')
    @classmethod
    def validate_ids(cls, v: Optional[str]) -> Optional[str]:
        """Validate ID format."""
        if v is None or v == '':
            return None
        if not re.match(r'^[a-zA-Z0-9_-]{1,50}$', v):
            raise ValueError(
                'ID must be 1-50 characters containing only '
                'alphanumeric characters, hyphens, and underscores'
            )
        return v.upper()

    @model_validator(mode='after')
    def validate_parent_requirement(self) -> 'HierarchyCSVRow':
        """Validate parent_id requirement based on entity_type."""
        if self.entity_type == HierarchyEntityType.DEPARTMENT and self.parent_id:
            raise ValueError("Departments cannot have a parent_id")
        if self.entity_type == HierarchyEntityType.PROJECT and not self.parent_id:
            raise ValueError("Projects must have a parent_id (department)")
        if self.entity_type == HierarchyEntityType.TEAM and not self.parent_id:
            raise ValueError("Teams must have a parent_id (project)")
        return self


class HierarchyImportRequest(BaseModel):
    """Request model for CSV import."""
    rows: List[HierarchyCSVRow] = Field(
        ...,
        min_length=1,
        description="List of hierarchy entities to import"
    )
    mode: str = Field(
        default="merge",
        description="Import mode: 'merge' (update existing, add new) or 'replace' (delete all, import fresh)"
    )

    @field_validator('mode')
    @classmethod
    def validate_mode(cls, v: str) -> str:
        """Validate import mode."""
        if v not in ['merge', 'replace']:
            raise ValueError("mode must be 'merge' or 'replace'")
        return v

    model_config = ConfigDict(extra="forbid", json_schema_extra={
        "example": {
            "rows": [
                {"entity_type": "department", "entity_id": "DEPT-001", "entity_name": "Engineering"},
                {"entity_type": "project", "entity_id": "PROJ-001", "entity_name": "Platform", "parent_id": "DEPT-001"}
            ],
            "mode": "merge"
        }
    })


# ============================================================================
# RESPONSE MODELS
# ============================================================================

class HierarchyEntityResponse(BaseModel):
    """Response model for a hierarchy entity."""
    id: str
    org_slug: str
    entity_type: HierarchyEntityType
    entity_id: str
    entity_name: str
    parent_id: Optional[str]
    parent_type: Optional[str]
    dept_id: Optional[str]
    dept_name: Optional[str]
    project_id: Optional[str]
    project_name: Optional[str]
    team_id: Optional[str]
    team_name: Optional[str]
    owner_id: Optional[str]
    owner_name: Optional[str]
    owner_email: Optional[str]
    description: Optional[str]
    metadata: Optional[Dict[str, Any]]
    is_active: bool
    created_at: datetime
    created_by: str
    updated_at: Optional[datetime]
    updated_by: Optional[str]
    version: int

    model_config = ConfigDict(from_attributes=True, json_schema_extra={
        "example": {
            "id": "uuid-123",
            "org_slug": "acme_corp",
            "entity_type": "department",
            "entity_id": "DEPT-001",
            "entity_name": "Engineering",
            "parent_id": None,
            "parent_type": None,
            "dept_id": "DEPT-001",
            "dept_name": "Engineering",
            "project_id": None,
            "project_name": None,
            "team_id": None,
            "team_name": None,
            "owner_id": "user-123",
            "owner_name": "John Doe",
            "owner_email": "john@example.com",
            "description": "Engineering department",
            "metadata": None,
            "is_active": True,
            "created_at": "2025-01-15T10:00:00Z",
            "created_by": "admin@example.com",
            "updated_at": None,
            "updated_by": None,
            "version": 1
        }
    })


class HierarchyTreeNode(BaseModel):
    """Response model for hierarchy tree node."""
    entity_type: HierarchyEntityType
    entity_id: str
    entity_name: str
    owner_name: Optional[str]
    owner_email: Optional[str]
    description: Optional[str]
    is_active: bool
    children: List['HierarchyTreeNode'] = Field(default_factory=list)

    model_config = ConfigDict(from_attributes=True)


class HierarchyTreeResponse(BaseModel):
    """Response model for full hierarchy tree."""
    org_slug: str
    departments: List[HierarchyTreeNode]
    total_departments: int
    total_projects: int
    total_teams: int

    model_config = ConfigDict(from_attributes=True, json_schema_extra={
        "example": {
            "org_slug": "acme_corp",
            "departments": [
                {
                    "entity_type": "department",
                    "entity_id": "DEPT-001",
                    "entity_name": "Engineering",
                    "owner_name": "John Doe",
                    "owner_email": "john@example.com",
                    "description": "Engineering department",
                    "is_active": True,
                    "children": [
                        {
                            "entity_type": "project",
                            "entity_id": "PROJ-001",
                            "entity_name": "Platform",
                            "owner_name": "Jane Smith",
                            "owner_email": "jane@example.com",
                            "description": "Platform project",
                            "is_active": True,
                            "children": [
                                {
                                    "entity_type": "team",
                                    "entity_id": "TEAM-001",
                                    "entity_name": "Backend",
                                    "owner_name": "Bob Wilson",
                                    "owner_email": "bob@example.com",
                                    "description": "Backend team",
                                    "is_active": True,
                                    "children": []
                                }
                            ]
                        }
                    ]
                }
            ],
            "total_departments": 1,
            "total_projects": 1,
            "total_teams": 1
        }
    })


class HierarchyListResponse(BaseModel):
    """Response model for hierarchy list."""
    org_slug: str
    entities: List[HierarchyEntityResponse]
    total: int

    model_config = ConfigDict(from_attributes=True)


class HierarchyImportResult(BaseModel):
    """Response model for import operation."""
    success: bool
    created: int
    updated: int
    errors: List[Dict[str, str]]
    message: str

    model_config = ConfigDict(from_attributes=True, json_schema_extra={
        "example": {
            "success": True,
            "created": 5,
            "updated": 2,
            "errors": [],
            "message": "Import completed successfully"
        }
    })


class HierarchyDeletionBlockedResponse(BaseModel):
    """Response model when deletion is blocked."""
    entity_type: HierarchyEntityType
    entity_id: str
    blocked: bool
    reason: str
    blocking_entities: List[Dict[str, str]]

    model_config = ConfigDict(from_attributes=True, json_schema_extra={
        "example": {
            "entity_type": "department",
            "entity_id": "DEPT-001",
            "blocked": True,
            "reason": "Cannot delete department with active projects",
            "blocking_entities": [
                {"entity_type": "project", "entity_id": "PROJ-001", "entity_name": "Platform"}
            ]
        }
    })


# Enable forward references for recursive model
HierarchyTreeNode.model_rebuild()
