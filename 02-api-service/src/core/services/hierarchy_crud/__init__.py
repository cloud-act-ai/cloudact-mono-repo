"""
N-Level Hierarchy CRUD Service

Configurable hierarchy operations for organizational structure.
Supports any hierarchy depth (e.g., Department -> Project -> Team, or custom).

Usage:
    from src.core.services.hierarchy_crud import (
        get_hierarchy_crud_service,
        get_hierarchy_level_service,
    )

    # Entity operations
    entity_service = get_hierarchy_crud_service()
    entity = await entity_service.create_entity(org_slug, request, user_id)
    tree = await entity_service.get_hierarchy_tree(org_slug)

    # Level configuration
    level_service = get_hierarchy_level_service()
    levels = await level_service.get_levels(org_slug)
    await level_service.seed_default_levels(org_slug, user_id)
"""

from src.core.services.hierarchy_crud.service import (
    HierarchyService,
    get_hierarchy_crud_service,
    validate_org_slug,
    validate_entity_id,
)

from src.core.services.hierarchy_crud.level_service import (
    HierarchyLevelService,
    get_hierarchy_level_service,
    DEFAULT_LEVELS,
)

from src.core.services.hierarchy_crud.path_utils import (
    build_path,
    build_path_ids,
    build_path_names,
    calculate_depth,
    parse_path,
    get_parent_path,
    is_ancestor,
    is_descendant,
    get_ancestors,
    get_descendants_path_pattern,
    validate_path,
    rebuild_path_on_move,
)

__all__ = [
    # Entity service
    "HierarchyService",
    "get_hierarchy_crud_service",
    "validate_org_slug",
    "validate_entity_id",
    # Level service
    "HierarchyLevelService",
    "get_hierarchy_level_service",
    "DEFAULT_LEVELS",
    # Path utilities
    "build_path",
    "build_path_ids",
    "build_path_names",
    "calculate_depth",
    "parse_path",
    "get_parent_path",
    "is_ancestor",
    "is_descendant",
    "get_ancestors",
    "get_descendants_path_pattern",
    "validate_path",
    "rebuild_path_on_move",
]
