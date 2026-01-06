"""
N-Level Configurable Hierarchy API Routes.

Endpoints for managing organizational hierarchy with configurable levels.
Supports any hierarchy structure (e.g., Org -> Department -> Project -> Team).

URL Structure: /api/v1/hierarchy/{org_slug}/...

Features:
- Configurable hierarchy levels per organization
- Generic CRUD operations for entities at any level
- Tree view of full hierarchy
- Ancestor/descendant queries
- Move entities between parents
- Deletion blocking when entities have children or references
"""

from fastapi import APIRouter, Depends, HTTPException, status, Query, Response
from typing import Optional
import logging

from src.core.services.hierarchy_crud.service import HierarchyService, get_hierarchy_crud_service
from src.core.services.hierarchy_crud.level_service import (
    HierarchyLevelService,
    get_hierarchy_level_service,
)
from src.app.dependencies.auth import get_current_org
from src.app.models.hierarchy_models import (
    # Level models
    CreateLevelRequest,
    UpdateLevelRequest,
    HierarchyLevelResponse,
    HierarchyLevelsListResponse,
    # Entity models
    CreateEntityRequest,
    UpdateEntityRequest,
    MoveEntityRequest,
    HierarchyEntityResponse,
    HierarchyListResponse,
    HierarchyTreeResponse,
    DeletionBlockedResponse,
    AncestorResponse,
    DescendantsResponse,
)

router = APIRouter()
logger = logging.getLogger(__name__)


# ============================================================================
# Level Configuration Endpoints
# ============================================================================

@router.get(
    "/{org_slug}/levels",
    response_model=HierarchyLevelsListResponse,
    summary="List hierarchy levels",
    description="Get all configured hierarchy levels for an organization"
)
async def list_levels(
    org_slug: str,
    include_inactive: bool = Query(False, description="Include inactive levels"),
    org_data: dict = Depends(get_current_org),
    service: HierarchyLevelService = Depends(get_hierarchy_level_service)
):
    """List all configured hierarchy levels."""
    try:
        return await service.get_levels(org_slug, include_inactive)
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))
    except Exception as e:
        logger.exception(f"Error listing levels for {org_slug}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to list hierarchy levels"
        )


@router.get(
    "/{org_slug}/levels/{level}",
    response_model=HierarchyLevelResponse,
    summary="Get hierarchy level",
    description="Get a specific hierarchy level configuration"
)
async def get_level(
    org_slug: str,
    level: int,
    org_data: dict = Depends(get_current_org),
    service: HierarchyLevelService = Depends(get_hierarchy_level_service)
):
    """Get a specific hierarchy level."""
    try:
        result = await service.get_level(org_slug, level)
        if not result:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Level {level} not found"
            )
        return result
    except HTTPException:
        raise
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))


@router.post(
    "/{org_slug}/levels",
    response_model=HierarchyLevelResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Create hierarchy level",
    description="Create a new hierarchy level configuration"
)
async def create_level(
    org_slug: str,
    request: CreateLevelRequest,
    org_data: dict = Depends(get_current_org),
    service: HierarchyLevelService = Depends(get_hierarchy_level_service)
):
    """Create a new hierarchy level."""
    user_id = org_data.get("user_id", "system")
    try:
        return await service.create_level(org_slug, request, user_id)
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))
    except RuntimeError as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=str(e)
        )


@router.put(
    "/{org_slug}/levels/{level}",
    response_model=HierarchyLevelResponse,
    summary="Update hierarchy level",
    description="Update a hierarchy level configuration"
)
async def update_level(
    org_slug: str,
    level: int,
    request: UpdateLevelRequest,
    org_data: dict = Depends(get_current_org),
    service: HierarchyLevelService = Depends(get_hierarchy_level_service)
):
    """Update a hierarchy level."""
    user_id = org_data.get("user_id", "system")
    try:
        return await service.update_level(org_slug, level, request, user_id)
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))
    except RuntimeError as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=str(e)
        )


@router.delete(
    "/{org_slug}/levels/{level}",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="Delete hierarchy level",
    description="Delete a hierarchy level (soft delete)"
)
async def delete_level(
    org_slug: str,
    level: int,
    org_data: dict = Depends(get_current_org),
    service: HierarchyLevelService = Depends(get_hierarchy_level_service)
):
    """Delete a hierarchy level."""
    user_id = org_data.get("user_id", "system")
    try:
        await service.delete_level(org_slug, level, user_id)
        return Response(status_code=status.HTTP_204_NO_CONTENT)
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=str(e))
    except RuntimeError as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=str(e)
        )


@router.post(
    "/{org_slug}/levels/seed",
    response_model=HierarchyLevelsListResponse,
    summary="Seed default levels",
    description="Seed default hierarchy levels (Department -> Project -> Team)"
)
async def seed_default_levels(
    org_slug: str,
    org_data: dict = Depends(get_current_org),
    service: HierarchyLevelService = Depends(get_hierarchy_level_service)
):
    """Seed default hierarchy levels for a new organization."""
    user_id = org_data.get("user_id", "system")
    try:
        return await service.seed_default_levels(org_slug, user_id)
    except RuntimeError as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=str(e)
        )


# ============================================================================
# Entity List & Tree Endpoints
# ============================================================================

@router.get(
    "/{org_slug}",
    response_model=HierarchyListResponse,
    summary="List all entities",
    description="Get all hierarchy entities for an organization"
)
async def list_entities(
    org_slug: str,
    level_code: Optional[str] = Query(None, description="Filter by level code"),
    include_inactive: bool = Query(False, description="Include inactive entities"),
    org_data: dict = Depends(get_current_org),
    service: HierarchyService = Depends(get_hierarchy_crud_service)
):
    """List all hierarchy entities."""
    try:
        return await service.get_all_entities(org_slug, level_code, include_inactive)
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))
    except Exception as e:
        logger.exception(f"Error listing entities for {org_slug}")
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
# Entity CRUD Endpoints
# ============================================================================

@router.get(
    "/{org_slug}/entities/{entity_id}",
    response_model=HierarchyEntityResponse,
    summary="Get entity",
    description="Get a specific hierarchy entity by ID"
)
async def get_entity(
    org_slug: str,
    entity_id: str,
    org_data: dict = Depends(get_current_org),
    service: HierarchyService = Depends(get_hierarchy_crud_service)
):
    """Get a hierarchy entity by ID."""
    try:
        entity = await service.get_entity(org_slug, entity_id)
        if not entity:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Entity {entity_id} not found"
            )
        return entity
    except HTTPException:
        raise
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))


@router.post(
    "/{org_slug}/entities",
    response_model=HierarchyEntityResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Create entity",
    description="Create a new hierarchy entity at any level"
)
async def create_entity(
    org_slug: str,
    request: CreateEntityRequest,
    org_data: dict = Depends(get_current_org),
    service: HierarchyService = Depends(get_hierarchy_crud_service)
):
    """Create a new hierarchy entity."""
    user_id = org_data.get("user_id", "system")
    try:
        return await service.create_entity(org_slug, request, user_id)
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))
    except RuntimeError as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=str(e)
        )


@router.put(
    "/{org_slug}/entities/{entity_id}",
    response_model=HierarchyEntityResponse,
    summary="Update entity",
    description="Update a hierarchy entity"
)
async def update_entity(
    org_slug: str,
    entity_id: str,
    request: UpdateEntityRequest,
    org_data: dict = Depends(get_current_org),
    service: HierarchyService = Depends(get_hierarchy_crud_service)
):
    """Update a hierarchy entity."""
    user_id = org_data.get("user_id", "system")
    try:
        return await service.update_entity(org_slug, entity_id, request, user_id)
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))
    except RuntimeError as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=str(e)
        )


@router.post(
    "/{org_slug}/entities/{entity_id}/move",
    response_model=HierarchyEntityResponse,
    summary="Move entity",
    description="Move an entity to a new parent"
)
async def move_entity(
    org_slug: str,
    entity_id: str,
    request: MoveEntityRequest,
    org_data: dict = Depends(get_current_org),
    service: HierarchyService = Depends(get_hierarchy_crud_service)
):
    """Move an entity to a new parent."""
    user_id = org_data.get("user_id", "system")
    try:
        return await service.move_entity(org_slug, entity_id, request, user_id)
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))
    except RuntimeError as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=str(e)
        )


@router.get(
    "/{org_slug}/entities/{entity_id}/can-delete",
    response_model=DeletionBlockedResponse,
    summary="Check if deletion is blocked",
    description="Check if an entity can be deleted"
)
async def check_can_delete(
    org_slug: str,
    entity_id: str,
    org_data: dict = Depends(get_current_org),
    service: HierarchyService = Depends(get_hierarchy_crud_service)
):
    """Check if an entity can be deleted."""
    try:
        return await service.check_deletion_blocked(org_slug, entity_id)
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))


@router.delete(
    "/{org_slug}/entities/{entity_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="Delete entity",
    description="Soft delete a hierarchy entity"
)
async def delete_entity(
    org_slug: str,
    entity_id: str,
    force: bool = Query(False, description="Force delete even if blocked"),
    org_data: dict = Depends(get_current_org),
    service: HierarchyService = Depends(get_hierarchy_crud_service)
):
    """Delete a hierarchy entity."""
    user_id = org_data.get("user_id", "system")
    try:
        await service.delete_entity(org_slug, entity_id, user_id, force)
        return Response(status_code=status.HTTP_204_NO_CONTENT)
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=str(e))
    except RuntimeError as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=str(e)
        )


# ============================================================================
# Hierarchy Navigation Endpoints
# ============================================================================

@router.get(
    "/{org_slug}/entities/{entity_id}/children",
    response_model=HierarchyListResponse,
    summary="Get children",
    description="Get direct children of an entity"
)
async def get_children(
    org_slug: str,
    entity_id: str,
    org_data: dict = Depends(get_current_org),
    service: HierarchyService = Depends(get_hierarchy_crud_service)
):
    """Get direct children of an entity."""
    try:
        return await service.get_children(org_slug, entity_id)
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))


@router.get(
    "/{org_slug}/entities/{entity_id}/ancestors",
    response_model=AncestorResponse,
    summary="Get ancestors",
    description="Get ancestor chain for an entity"
)
async def get_ancestors(
    org_slug: str,
    entity_id: str,
    org_data: dict = Depends(get_current_org),
    service: HierarchyService = Depends(get_hierarchy_crud_service)
):
    """Get ancestor chain for an entity."""
    try:
        return await service.get_ancestors(org_slug, entity_id)
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))


@router.get(
    "/{org_slug}/entities/{entity_id}/descendants",
    response_model=DescendantsResponse,
    summary="Get descendants",
    description="Get all descendants of an entity"
)
async def get_descendants(
    org_slug: str,
    entity_id: str,
    org_data: dict = Depends(get_current_org),
    service: HierarchyService = Depends(get_hierarchy_crud_service)
):
    """Get all descendants of an entity."""
    try:
        return await service.get_descendants(org_slug, entity_id)
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))
