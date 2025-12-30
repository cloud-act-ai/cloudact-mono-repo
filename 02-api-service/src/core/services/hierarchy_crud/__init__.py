"""
Hierarchy CRUD Service

CRUD operations for organizational hierarchy (departments, projects, teams).
Uses direct BigQuery for immediate writes.

Usage:
    from src.core.services.hierarchy_crud import get_hierarchy_crud_service

    service = get_hierarchy_crud_service()
    result = await service.create_department(org_slug, request)
"""

from src.core.services.hierarchy_crud.service import (
    HierarchyService,
    get_hierarchy_crud_service,
    validate_org_slug,
    validate_entity_id,
)

__all__ = [
    "HierarchyService",
    "get_hierarchy_crud_service",
    "validate_org_slug",
    "validate_entity_id",
]
