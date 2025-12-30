"""
Organizational Hierarchy Management API Routes

Endpoints for managing organizational hierarchy (departments, projects, teams).
Supports strict hierarchy: Org -> Department -> Project -> Team

URL Structure: /api/v1/hierarchy/{org_slug}/...

Features:
- CRUD operations for departments, projects, teams
- Tree view of full hierarchy
- CSV import/export
- Deletion blocking when entities have children or references
- Version history for all changes
"""

from fastapi import APIRouter, Depends, HTTPException, status, Query, Response
from fastapi.responses import StreamingResponse
from typing import List, Optional
import logging
import csv
import io

from src.core.services.hierarchy_crud import HierarchyService, get_hierarchy_crud_service
from src.app.dependencies.auth import get_current_org
from src.app.models.hierarchy_models import (
    HierarchyEntityType,
    CreateDepartmentRequest,
    CreateProjectRequest,
    CreateTeamRequest,
    UpdateHierarchyEntityRequest,
    HierarchyCSVRow,
    HierarchyImportRequest,
    HierarchyEntityResponse,
    HierarchyTreeResponse,
    HierarchyListResponse,
    HierarchyImportResult,
    HierarchyDeletionBlockedResponse,
)

router = APIRouter()
logger = logging.getLogger(__name__)


# ============================================================================
# List & Tree Endpoints
# ============================================================================

@router.get(
    "/{org_slug}",
    response_model=HierarchyListResponse,
    summary="List all hierarchy entities",
    description="Get all hierarchy entities for an organization"
)
async def list_hierarchy(
    org_slug: str,
    entity_type: Optional[HierarchyEntityType] = Query(None, description="Filter by entity type"),
    include_inactive: bool = Query(False, description="Include inactive entities"),
    org_data: dict = Depends(get_current_org),
    service: HierarchyService = Depends(get_hierarchy_crud_service)
):
    """List all hierarchy entities."""
    try:
        return await service.get_all_entities(org_slug, entity_type, include_inactive)
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))
    except Exception as e:
        logger.exception(f"Error listing hierarchy for {org_slug}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to list hierarchy entities"
        )


@router.get(
    "/{org_slug}/tree",
    response_model=HierarchyTreeResponse,
    summary="Get hierarchy tree",
    description="Get full organizational hierarchy as a tree structure"
)
async def get_hierarchy_tree(
    org_slug: str,
    org_data: dict = Depends(get_current_org),
    service: HierarchyService = Depends(get_hierarchy_crud_service)
):
    """Get hierarchy as a tree structure."""
    try:
        return await service.get_hierarchy_tree(org_slug)
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))
    except Exception as e:
        logger.exception(f"Error getting hierarchy tree for {org_slug}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to get hierarchy tree"
        )


# ============================================================================
# Department Endpoints
# ============================================================================

@router.get(
    "/{org_slug}/departments",
    response_model=HierarchyListResponse,
    summary="List departments",
    description="Get all departments for an organization"
)
async def list_departments(
    org_slug: str,
    include_inactive: bool = Query(False, description="Include inactive departments"),
    org_data: dict = Depends(get_current_org),
    service: HierarchyService = Depends(get_hierarchy_crud_service)
):
    """List all departments."""
    return await service.get_all_entities(
        org_slug, HierarchyEntityType.DEPARTMENT, include_inactive
    )


@router.get(
    "/{org_slug}/departments/{dept_id}",
    response_model=HierarchyEntityResponse,
    summary="Get department",
    description="Get a specific department by ID"
)
async def get_department(
    org_slug: str,
    dept_id: str,
    org_data: dict = Depends(get_current_org),
    service: HierarchyService = Depends(get_hierarchy_crud_service)
):
    """Get a department by ID."""
    entity = await service.get_entity(org_slug, HierarchyEntityType.DEPARTMENT, dept_id)
    if not entity:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Department {dept_id} not found"
        )
    return entity


@router.post(
    "/{org_slug}/departments",
    response_model=HierarchyEntityResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Create department",
    description="Create a new department"
)
async def create_department(
    org_slug: str,
    request: CreateDepartmentRequest,
    org_data: dict = Depends(get_current_org),
    service: HierarchyService = Depends(get_hierarchy_crud_service)
):
    """Create a new department."""
    user_id = org_data.get("user_id", "system")
    try:
        return await service.create_department(org_slug, request, user_id)
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))
    except RuntimeError as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=str(e)
        )


@router.get(
    "/{org_slug}/departments/{dept_id}/projects",
    response_model=HierarchyListResponse,
    summary="List projects in department",
    description="Get all projects under a specific department"
)
async def list_department_projects(
    org_slug: str,
    dept_id: str,
    org_data: dict = Depends(get_current_org),
    service: HierarchyService = Depends(get_hierarchy_crud_service)
):
    """List all projects under a department."""
    # First verify department exists
    dept = await service.get_entity(org_slug, HierarchyEntityType.DEPARTMENT, dept_id)
    if not dept:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Department {dept_id} not found"
        )

    # Get all projects and filter by dept_id
    all_projects = await service.get_all_entities(org_slug, HierarchyEntityType.PROJECT)
    filtered = [p for p in all_projects.entities if p.parent_id == dept_id.upper()]

    return HierarchyListResponse(
        org_slug=org_slug,
        entities=filtered,
        total=len(filtered)
    )


# ============================================================================
# Project Endpoints
# ============================================================================

@router.get(
    "/{org_slug}/projects",
    response_model=HierarchyListResponse,
    summary="List projects",
    description="Get all projects for an organization"
)
async def list_projects(
    org_slug: str,
    include_inactive: bool = Query(False, description="Include inactive projects"),
    org_data: dict = Depends(get_current_org),
    service: HierarchyService = Depends(get_hierarchy_crud_service)
):
    """List all projects."""
    return await service.get_all_entities(
        org_slug, HierarchyEntityType.PROJECT, include_inactive
    )


@router.get(
    "/{org_slug}/projects/{project_id}",
    response_model=HierarchyEntityResponse,
    summary="Get project",
    description="Get a specific project by ID"
)
async def get_project(
    org_slug: str,
    project_id: str,
    org_data: dict = Depends(get_current_org),
    service: HierarchyService = Depends(get_hierarchy_crud_service)
):
    """Get a project by ID."""
    entity = await service.get_entity(org_slug, HierarchyEntityType.PROJECT, project_id)
    if not entity:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Project {project_id} not found"
        )
    return entity


@router.post(
    "/{org_slug}/projects",
    response_model=HierarchyEntityResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Create project",
    description="Create a new project under a department"
)
async def create_project(
    org_slug: str,
    request: CreateProjectRequest,
    org_data: dict = Depends(get_current_org),
    service: HierarchyService = Depends(get_hierarchy_crud_service)
):
    """Create a new project."""
    user_id = org_data.get("user_id", "system")
    try:
        return await service.create_project(org_slug, request, user_id)
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))
    except RuntimeError as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=str(e)
        )


@router.get(
    "/{org_slug}/projects/{project_id}/teams",
    response_model=HierarchyListResponse,
    summary="List teams in project",
    description="Get all teams under a specific project"
)
async def list_project_teams(
    org_slug: str,
    project_id: str,
    org_data: dict = Depends(get_current_org),
    service: HierarchyService = Depends(get_hierarchy_crud_service)
):
    """List all teams under a project."""
    # First verify project exists
    project = await service.get_entity(org_slug, HierarchyEntityType.PROJECT, project_id)
    if not project:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Project {project_id} not found"
        )

    # Get all teams and filter by project_id
    all_teams = await service.get_all_entities(org_slug, HierarchyEntityType.TEAM)
    filtered = [t for t in all_teams.entities if t.parent_id == project_id.upper()]

    return HierarchyListResponse(
        org_slug=org_slug,
        entities=filtered,
        total=len(filtered)
    )


# ============================================================================
# Team Endpoints
# ============================================================================

@router.get(
    "/{org_slug}/teams",
    response_model=HierarchyListResponse,
    summary="List teams",
    description="Get all teams for an organization"
)
async def list_teams(
    org_slug: str,
    include_inactive: bool = Query(False, description="Include inactive teams"),
    org_data: dict = Depends(get_current_org),
    service: HierarchyService = Depends(get_hierarchy_crud_service)
):
    """List all teams."""
    return await service.get_all_entities(
        org_slug, HierarchyEntityType.TEAM, include_inactive
    )


@router.get(
    "/{org_slug}/teams/{team_id}",
    response_model=HierarchyEntityResponse,
    summary="Get team",
    description="Get a specific team by ID"
)
async def get_team(
    org_slug: str,
    team_id: str,
    org_data: dict = Depends(get_current_org),
    service: HierarchyService = Depends(get_hierarchy_crud_service)
):
    """Get a team by ID."""
    entity = await service.get_entity(org_slug, HierarchyEntityType.TEAM, team_id)
    if not entity:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Team {team_id} not found"
        )
    return entity


@router.post(
    "/{org_slug}/teams",
    response_model=HierarchyEntityResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Create team",
    description="Create a new team under a project"
)
async def create_team(
    org_slug: str,
    request: CreateTeamRequest,
    org_data: dict = Depends(get_current_org),
    service: HierarchyService = Depends(get_hierarchy_crud_service)
):
    """Create a new team."""
    user_id = org_data.get("user_id", "system")
    try:
        return await service.create_team(org_slug, request, user_id)
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))
    except RuntimeError as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=str(e)
        )


# ============================================================================
# Update & Delete Endpoints
# ============================================================================

@router.put(
    "/{org_slug}/{entity_type}/{entity_id}",
    response_model=HierarchyEntityResponse,
    summary="Update entity",
    description="Update a hierarchy entity"
)
async def update_entity(
    org_slug: str,
    entity_type: HierarchyEntityType,
    entity_id: str,
    request: UpdateHierarchyEntityRequest,
    org_data: dict = Depends(get_current_org),
    service: HierarchyService = Depends(get_hierarchy_crud_service)
):
    """Update a hierarchy entity."""
    user_id = org_data.get("user_id", "system")
    try:
        return await service.update_entity(org_slug, entity_type, entity_id, request, user_id)
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))
    except RuntimeError as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=str(e)
        )


@router.get(
    "/{org_slug}/{entity_type}/{entity_id}/can-delete",
    response_model=HierarchyDeletionBlockedResponse,
    summary="Check if deletion is blocked",
    description="Check if a hierarchy entity can be deleted"
)
async def check_can_delete(
    org_slug: str,
    entity_type: HierarchyEntityType,
    entity_id: str,
    org_data: dict = Depends(get_current_org),
    service: HierarchyService = Depends(get_hierarchy_crud_service)
):
    """Check if an entity can be deleted."""
    return await service.check_deletion_blocked(org_slug, entity_type, entity_id)


@router.delete(
    "/{org_slug}/{entity_type}/{entity_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="Delete entity",
    description="Soft delete a hierarchy entity"
)
async def delete_entity(
    org_slug: str,
    entity_type: HierarchyEntityType,
    entity_id: str,
    force: bool = Query(False, description="Force delete even if blocked"),
    org_data: dict = Depends(get_current_org),
    service: HierarchyService = Depends(get_hierarchy_crud_service)
):
    """Delete a hierarchy entity."""
    user_id = org_data.get("user_id", "system")
    try:
        await service.delete_entity(org_slug, entity_type, entity_id, user_id, force)
        return Response(status_code=status.HTTP_204_NO_CONTENT)
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=str(e))
    except RuntimeError as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=str(e)
        )


# ============================================================================
# Import/Export Endpoints
# ============================================================================

@router.post(
    "/{org_slug}/import",
    response_model=HierarchyImportResult,
    summary="Import hierarchy",
    description="Import hierarchy from CSV data"
)
async def import_hierarchy(
    org_slug: str,
    request: HierarchyImportRequest,
    org_data: dict = Depends(get_current_org),
    service: HierarchyService = Depends(get_hierarchy_crud_service)
):
    """Import hierarchy from CSV rows."""
    user_id = org_data.get("user_id", "system")
    try:
        return await service.import_hierarchy(org_slug, request.rows, request.mode, user_id)
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))
    except Exception as e:
        logger.exception(f"Error importing hierarchy for {org_slug}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to import hierarchy"
        )


@router.get(
    "/{org_slug}/export",
    summary="Export hierarchy",
    description="Export hierarchy as CSV"
)
async def export_hierarchy(
    org_slug: str,
    org_data: dict = Depends(get_current_org),
    service: HierarchyService = Depends(get_hierarchy_crud_service)
):
    """Export hierarchy as CSV."""
    try:
        rows = await service.export_hierarchy(org_slug)

        # Create CSV in memory
        output = io.StringIO()
        if rows:
            writer = csv.DictWriter(output, fieldnames=rows[0].keys())
            writer.writeheader()
            writer.writerows(rows)

        output.seek(0)
        return StreamingResponse(
            iter([output.getvalue()]),
            media_type="text/csv",
            headers={
                "Content-Disposition": f"attachment; filename={org_slug}_hierarchy.csv"
            }
        )
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))
    except Exception as e:
        logger.exception(f"Error exporting hierarchy for {org_slug}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to export hierarchy"
        )


@router.get(
    "/{org_slug}/template",
    summary="Get CSV template",
    description="Download CSV template for hierarchy import"
)
async def get_template(
    org_slug: str,
    org_data: dict = Depends(get_current_org)
):
    """Get CSV template for hierarchy import."""
    template_rows = [
        {
            "entity_type": "department",
            "entity_id": "DEPT-001",
            "entity_name": "Engineering",
            "parent_id": "",
            "owner_id": "",
            "owner_name": "John Doe",
            "owner_email": "john@example.com",
            "description": "Engineering department"
        },
        {
            "entity_type": "project",
            "entity_id": "PROJ-001",
            "entity_name": "Platform",
            "parent_id": "DEPT-001",
            "owner_id": "",
            "owner_name": "Jane Smith",
            "owner_email": "jane@example.com",
            "description": "Platform infrastructure project"
        },
        {
            "entity_type": "team",
            "entity_id": "TEAM-001",
            "entity_name": "Backend",
            "parent_id": "PROJ-001",
            "owner_id": "",
            "owner_name": "Bob Wilson",
            "owner_email": "bob@example.com",
            "description": "Backend development team"
        }
    ]

    output = io.StringIO()
    writer = csv.DictWriter(output, fieldnames=template_rows[0].keys())
    writer.writeheader()
    writer.writerows(template_rows)

    output.seek(0)
    return StreamingResponse(
        iter([output.getvalue()]),
        media_type="text/csv",
        headers={
            "Content-Disposition": "attachment; filename=hierarchy_template.csv"
        }
    )
