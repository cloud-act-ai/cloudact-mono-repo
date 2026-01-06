"""
Path utilities for N-level hierarchy.

Provides functions for:
- Building materialized paths
- Parsing path components
- Validating path structures
- Calculating depth and ancestry
"""

from typing import List, Optional, Tuple


def build_path(entity_id: str, parent_path: Optional[str] = None) -> str:
    """
    Build a materialized path for an entity.

    Args:
        entity_id: The entity's ID
        parent_path: Parent's path (None for root entities)

    Returns:
        Materialized path string (e.g., '/DEPT-001/PROJ-001')

    Examples:
        >>> build_path('DEPT-001', None)
        '/DEPT-001'
        >>> build_path('PROJ-001', '/DEPT-001')
        '/DEPT-001/PROJ-001'
        >>> build_path('TEAM-001', '/DEPT-001/PROJ-001')
        '/DEPT-001/PROJ-001/TEAM-001'
    """
    if parent_path is None or parent_path == '':
        return f'/{entity_id}'
    return f'{parent_path}/{entity_id}'


def build_path_ids(entity_id: str, parent_path_ids: Optional[List[str]] = None) -> List[str]:
    """
    Build array of path IDs from root to entity.

    Args:
        entity_id: The entity's ID
        parent_path_ids: Parent's path_ids array (None for root)

    Returns:
        List of entity IDs from root to this entity

    Examples:
        >>> build_path_ids('DEPT-001', None)
        ['DEPT-001']
        >>> build_path_ids('PROJ-001', ['DEPT-001'])
        ['DEPT-001', 'PROJ-001']
    """
    if parent_path_ids is None:
        return [entity_id]
    return parent_path_ids + [entity_id]


def build_path_names(entity_name: str, parent_path_names: Optional[List[str]] = None) -> List[str]:
    """
    Build array of path names from root to entity.

    Args:
        entity_name: The entity's name
        parent_path_names: Parent's path_names array (None for root)

    Returns:
        List of entity names from root to this entity

    Examples:
        >>> build_path_names('Engineering', None)
        ['Engineering']
        >>> build_path_names('Platform', ['Engineering'])
        ['Engineering', 'Platform']
    """
    if parent_path_names is None:
        return [entity_name]
    return parent_path_names + [entity_name]


def calculate_depth(path: str) -> int:
    """
    Calculate depth from materialized path.

    Args:
        path: Materialized path string

    Returns:
        Depth (0 for root, increments for each level)

    Examples:
        >>> calculate_depth('/DEPT-001')
        0
        >>> calculate_depth('/DEPT-001/PROJ-001')
        1
        >>> calculate_depth('/DEPT-001/PROJ-001/TEAM-001')
        2
    """
    if not path or path == '/':
        return 0
    # Count slashes minus 1 (leading slash doesn't count as depth)
    return path.count('/') - 1


def parse_path(path: str) -> List[str]:
    """
    Parse materialized path into entity IDs.

    Args:
        path: Materialized path string

    Returns:
        List of entity IDs

    Examples:
        >>> parse_path('/DEPT-001')
        ['DEPT-001']
        >>> parse_path('/DEPT-001/PROJ-001/TEAM-001')
        ['DEPT-001', 'PROJ-001', 'TEAM-001']
    """
    if not path or path == '/':
        return []
    # Remove leading slash and split
    return [p for p in path.split('/') if p]


def get_parent_path(path: str) -> Optional[str]:
    """
    Get parent path from a materialized path.

    Args:
        path: Current entity's path

    Returns:
        Parent's path or None if root

    Examples:
        >>> get_parent_path('/DEPT-001')
        None
        >>> get_parent_path('/DEPT-001/PROJ-001')
        '/DEPT-001'
    """
    parts = parse_path(path)
    if len(parts) <= 1:
        return None
    return '/' + '/'.join(parts[:-1])


def is_ancestor(potential_ancestor_path: str, descendant_path: str) -> bool:
    """
    Check if one path is an ancestor of another.

    Args:
        potential_ancestor_path: Path to check as ancestor
        descendant_path: Path to check as descendant

    Returns:
        True if potential_ancestor_path is ancestor of descendant_path

    Examples:
        >>> is_ancestor('/DEPT-001', '/DEPT-001/PROJ-001')
        True
        >>> is_ancestor('/DEPT-001', '/DEPT-002/PROJ-001')
        False
        >>> is_ancestor('/DEPT-001', '/DEPT-001')
        False  # Same path is not ancestor
    """
    if not potential_ancestor_path or not descendant_path:
        return False
    # Ensure we don't match same path
    if potential_ancestor_path == descendant_path:
        return False
    # Ancestor path must be prefix of descendant
    return descendant_path.startswith(potential_ancestor_path + '/')


def is_descendant(potential_descendant_path: str, ancestor_path: str) -> bool:
    """
    Check if one path is a descendant of another.

    Args:
        potential_descendant_path: Path to check as descendant
        ancestor_path: Path to check as ancestor

    Returns:
        True if potential_descendant_path is descendant of ancestor_path
    """
    return is_ancestor(ancestor_path, potential_descendant_path)


def get_ancestors(path: str) -> List[str]:
    """
    Get all ancestor paths for a given path.

    Args:
        path: Entity's path

    Returns:
        List of ancestor paths from root to immediate parent

    Examples:
        >>> get_ancestors('/DEPT-001')
        []
        >>> get_ancestors('/DEPT-001/PROJ-001')
        ['/DEPT-001']
        >>> get_ancestors('/DEPT-001/PROJ-001/TEAM-001')
        ['/DEPT-001', '/DEPT-001/PROJ-001']
    """
    parts = parse_path(path)
    ancestors = []
    for i in range(1, len(parts)):
        ancestors.append('/' + '/'.join(parts[:i]))
    return ancestors


def get_path_for_subtree_query(path: str) -> Tuple[str, str]:
    """
    Get parameters for querying subtree (all descendants).

    Args:
        path: Root path for subtree

    Returns:
        Tuple of (path_prefix, path_prefix_end) for BETWEEN query

    Examples:
        >>> get_path_for_subtree_query('/DEPT-001')
        ('/DEPT-001/', '/DEPT-001/~')
    """
    # Use ~ as it sorts after most characters
    return (f'{path}/', f'{path}/~')


def validate_path(path: str) -> bool:
    """
    Validate that a path is well-formed.

    Args:
        path: Path to validate

    Returns:
        True if valid, False otherwise
    """
    if not path:
        return False
    if not path.startswith('/'):
        return False
    if '//' in path:  # No double slashes
        return False
    parts = parse_path(path)
    if not parts:
        return False
    # Each part must be a valid entity ID
    import re
    pattern = re.compile(r'^[a-zA-Z0-9_-]{1,50}$')
    return all(pattern.match(part) for part in parts)


def rebuild_path_on_move(
    old_path: str,
    new_parent_path: Optional[str]
) -> str:
    """
    Calculate new path when moving an entity to a new parent.

    Args:
        old_path: Entity's current path
        new_parent_path: New parent's path (None for root)

    Returns:
        New path after move

    Examples:
        >>> rebuild_path_on_move('/DEPT-001/PROJ-001', '/DEPT-002')
        '/DEPT-002/PROJ-001'
        >>> rebuild_path_on_move('/DEPT-001/PROJ-001', None)
        '/PROJ-001'
    """
    parts = parse_path(old_path)
    if not parts:
        raise ValueError("Invalid old_path")

    entity_id = parts[-1]
    return build_path(entity_id, new_parent_path)


def get_descendants_path_pattern(path: str) -> str:
    """
    Get SQL LIKE pattern for matching all descendants.

    Args:
        path: Root path

    Returns:
        Pattern for SQL LIKE clause

    Examples:
        >>> get_descendants_path_pattern('/DEPT-001')
        '/DEPT-001/%'
    """
    return f'{path}/%'
