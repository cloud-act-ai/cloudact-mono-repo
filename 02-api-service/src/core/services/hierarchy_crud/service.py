"""
N-Level Organizational Hierarchy Service.

Manages hierarchy entities with configurable levels and BigQuery backend.
Implements version history pattern for audit trail and soft deletes.

Features:
- Configurable hierarchy levels (Department -> Project -> Team, or any custom structure)
- Generic CRUD operations for entities at any level
- Materialized path for fast subtree queries
- Deletion blocking when entities have children or references
- Version history for all changes
"""

import json
import logging
import re
import uuid
from datetime import datetime
from typing import Optional, Dict, Any, List, Tuple

from google.cloud import bigquery
import google.api_core.exceptions

from src.core.engine.bq_client import BigQueryClient, get_bigquery_client
from src.core.exceptions import BigQueryResourceNotFoundError
from src.app.config import get_settings
from src.app.models.hierarchy_models import (
    CreateEntityRequest,
    UpdateEntityRequest,
    MoveEntityRequest,
    HierarchyEntityResponse,
    HierarchyListResponse,
    HierarchyTreeNode,
    HierarchyTreeResponse,
    DeletionBlockedResponse,
    AncestorResponse,
    DescendantsResponse,
)
from src.core.services.hierarchy_crud.path_utils import (
    build_path,
    build_path_ids,
    build_path_names,
    calculate_depth,
    get_descendants_path_pattern,
    rebuild_path_on_move,
)
from src.core.services.hierarchy_crud.level_service import (
    HierarchyLevelService,
    get_hierarchy_level_service,
)

logger = logging.getLogger(__name__)
settings = get_settings()

# ==============================================================================
# Multi-Tenancy Security
# ==============================================================================

ORG_SLUG_PATTERN = re.compile(r'^[a-zA-Z0-9_]{3,50}$')
ENTITY_ID_PATTERN = re.compile(r'^[a-zA-Z0-9_-]{1,50}$')


def validate_org_slug(org_slug: str) -> str:
    """Validate and sanitize org_slug to prevent SQL injection."""
    if not org_slug or not ORG_SLUG_PATTERN.match(org_slug):
        raise ValueError(f"Invalid organization identifier format: {org_slug}")
    return org_slug


def validate_entity_id(entity_id: str) -> str:
    """Validate entity ID format."""
    if not entity_id or not ENTITY_ID_PATTERN.match(entity_id):
        raise ValueError(f"Invalid entity ID format: {entity_id}")
    return entity_id.upper()


# ==============================================================================
# Constants
# ==============================================================================

ORG_HIERARCHY_TABLE = "org_hierarchy"
ORG_HIERARCHY_VIEW = "x_org_hierarchy"
SAAS_SUBSCRIPTION_PLANS_TABLE = "subscription_plans"
CENTRAL_DATASET = "organizations"


# ==============================================================================
# Hierarchy Service Class
# ==============================================================================

class HierarchyService:
    """Service for managing N-level organizational hierarchy in BigQuery."""

    def __init__(self, bq_client: Optional[BigQueryClient] = None):
        """Initialize with optional BigQuery client."""
        self.bq_client = bq_client or get_bigquery_client()
        self.project_id = settings.gcp_project_id
        self.level_service = HierarchyLevelService(self.bq_client)

    def _get_dataset_id(self, org_slug: str) -> str:
        """Get the org-specific dataset ID based on environment."""
        return settings.get_org_dataset_name(org_slug)

    def _get_table_ref(self, org_slug: str, table_name: str) -> str:
        """Get fully qualified table reference for org-specific tables."""
        dataset_id = self._get_dataset_id(org_slug)
        return f"{self.project_id}.{dataset_id}.{table_name}"

    def _get_central_table_ref(self, table_name: str) -> str:
        """Get fully qualified table reference for central dataset tables."""
        return f"{self.project_id}.{CENTRAL_DATASET}.{table_name}"

    def _get_org_view_ref(self, org_slug: str, view_name: str) -> str:
        """Get fully qualified view reference in org-specific dataset."""
        dataset_id = self._get_dataset_id(org_slug)
        return f"{self.project_id}.{dataset_id}.{view_name}"

    def _get_hierarchy_read_ref(self, org_slug: str) -> Tuple[str, bool]:
        """
        Get the best table/view reference for reading hierarchy data.

        Returns:
            Tuple of (table_ref, uses_view)
        """
        view_ref = self._get_org_view_ref(org_slug, ORG_HIERARCHY_VIEW)

        try:
            self.bq_client.client.get_table(view_ref)
            return (view_ref, True)
        except google.api_core.exceptions.NotFound:
            # ERR-003 FIX: Log at info level with context when view doesn't exist
            logger.info(
                f"Hierarchy view '{view_ref}' not found for org '{org_slug}', "
                f"falling back to central table"
            )
            central_ref = self._get_central_table_ref(ORG_HIERARCHY_TABLE)

            try:
                self.bq_client.client.get_table(central_ref)
                return (central_ref, False)
            except google.api_core.exceptions.NotFound:
                logger.error(
                    f"ERR-003: Hierarchy tables not found for org '{org_slug}'. "
                    f"Checked view='{view_ref}' and central='{central_ref}'. "
                    f"Ensure bootstrap has been run and org dataset is onboarded."
                )
                raise BigQueryResourceNotFoundError(
                    f"Neither x_org_hierarchy view nor org_hierarchy central table found. "
                    f"Ensure bootstrap has been run and org dataset is onboarded."
                )

    def _insert_to_central_table(self, table_name: str, rows: List[Dict[str, Any]]) -> None:
        """Insert rows into a central dataset table using streaming insert."""
        table_id = self._get_central_table_ref(table_name)

        # BUG-006 FIX: Serialize metadata dict to JSON string for BigQuery JSON type
        # BigQuery streaming insert expects JSON columns as serialized JSON strings
        processed_rows = []
        for row in rows:
            processed_row = row.copy()
            if 'metadata' in processed_row and processed_row['metadata'] is not None:
                if isinstance(processed_row['metadata'], dict):
                    processed_row['metadata'] = json.dumps(processed_row['metadata'])
            processed_rows.append(processed_row)

        errors = self.bq_client.client.insert_rows_json(table_id, processed_rows)
        if errors:
            raise ValueError(f"Failed to insert rows into {table_id}: {errors}")

    async def _get_entity_from_central(
        self,
        org_slug: str,
        entity_id: str,
        allow_ended: bool = False
    ) -> Optional[Dict[str, Any]]:
        """
        Get entity directly from central table (bypasses MV for fresh data).

        Used for parent validation during create/move operations where
        we need to see recently inserted data in the streaming buffer.

        Args:
            allow_ended: If True, also finds entities where end_date is set but no
                        newer version exists (handles broken state from failed updates).
        """
        table_ref = self._get_central_table_ref(ORG_HIERARCHY_TABLE)

        # First try to find current version (end_date IS NULL)
        query = f"""
        SELECT *
        FROM `{table_ref}`
        WHERE org_slug = @org_slug
          AND entity_id = @entity_id
          AND end_date IS NULL
        LIMIT 1
        """
        query_params = [
            bigquery.ScalarQueryParameter("org_slug", "STRING", org_slug),
            bigquery.ScalarQueryParameter("entity_id", "STRING", entity_id),
        ]
        try:
            job_config = bigquery.QueryJobConfig(query_parameters=query_params)
            results = list(self.bq_client.client.query(query, job_config=job_config).result())
            if results:
                return dict(results[0])

            # BUG-007 FIX: If allow_ended, find the latest version even if ended
            # This handles broken state from failed updates where end_date was set
            # but new version insert failed
            if allow_ended:
                fallback_query = f"""
                SELECT *
                FROM `{table_ref}`
                WHERE org_slug = @org_slug
                  AND entity_id = @entity_id
                ORDER BY version DESC
                LIMIT 1
                """
                results = list(self.bq_client.client.query(fallback_query, job_config=job_config).result())
                if results:
                    logger.warning(f"Entity {entity_id} found with end_date set (broken state recovery)")
                    return dict(results[0])

            return None
        except Exception as e:
            logger.error(f"Error querying central table for entity {entity_id}: {e}")
            return None

    def _row_to_entity_response(
        self,
        row: Dict[str, Any],
        level_name: Optional[str] = None
    ) -> HierarchyEntityResponse:
        """Convert BigQuery row to HierarchyEntityResponse."""
        # Parse metadata from JSON string if needed (streaming insert stores as string)
        metadata = row.get('metadata')
        if metadata and isinstance(metadata, str):
            try:
                metadata = json.loads(metadata)
            except (json.JSONDecodeError, TypeError):
                metadata = None

        return HierarchyEntityResponse(
            id=row['id'],
            org_slug=row['org_slug'],
            entity_id=row['entity_id'],
            entity_name=row['entity_name'],
            level=row['level'],
            level_code=row['level_code'],
            parent_id=row.get('parent_id'),
            path=row['path'],
            path_ids=row.get('path_ids') or [],
            path_names=row.get('path_names') or [],
            depth=row['depth'],
            owner_id=row.get('owner_id'),
            owner_name=row.get('owner_name'),
            owner_email=row.get('owner_email'),
            description=row.get('description'),
            metadata=metadata,
            sort_order=row.get('sort_order'),
            is_active=row['is_active'],
            created_at=row['created_at'],
            created_by=row['created_by'],
            updated_at=row.get('updated_at'),
            updated_by=row.get('updated_by'),
            version=row['version'],
            level_name=level_name,
        )

    # ==========================================================================
    # Read Operations
    # ==========================================================================

    async def get_all_entities(
        self,
        org_slug: str,
        level_code: Optional[str] = None,
        include_inactive: bool = False,
        use_central_table: bool = False
    ) -> HierarchyListResponse:
        """Get all hierarchy entities for an organization.

        Args:
            use_central_table: If True, query central table directly (bypasses MV).
                              Use this for operations that need fresh streaming buffer data.

        Note: If MV returns empty, automatically falls back to central table
        to handle streaming buffer lag (MVs don't see streaming buffer data).
        """
        org_slug = validate_org_slug(org_slug)

        # Get levels map for level names
        levels_map = await self.level_service.get_levels_map(org_slug)

        # ERR-001 FIX: Log warning if levels configuration is empty
        if not levels_map:
            logger.warning(
                f"ERR-001: No hierarchy levels configured for org '{org_slug}'. "
                f"Entities will use level_code as display name. "
                f"Run POST /api/v1/hierarchy/{org_slug}/levels/seed to initialize levels."
            )

        # Helper to run query and get entities
        def _run_query(table_ref: str, uses_view: bool) -> List[Dict]:
            query_params = []
            if uses_view:
                query = f"""
                SELECT *
                FROM `{table_ref}`
                WHERE 1=1
                """
            else:
                query = f"""
                SELECT *
                FROM `{table_ref}`
                WHERE org_slug = @org_slug
                  AND end_date IS NULL
                """
                query_params.append(bigquery.ScalarQueryParameter("org_slug", "STRING", org_slug))

            inactive_filter = "" if include_inactive else " AND is_active = TRUE"
            level_filter = ""
            if level_code:
                level_filter = " AND level_code = @level_code"
                query_params.append(bigquery.ScalarQueryParameter("level_code", "STRING", level_code.lower()))

            full_query = query + inactive_filter + level_filter + " ORDER BY level ASC, path ASC, sort_order ASC, entity_name ASC"
            job_config = bigquery.QueryJobConfig(query_parameters=query_params) if query_params else None
            return list(self.bq_client.client.query(full_query, job_config=job_config).result())

        try:
            if use_central_table:
                # Use central table directly for fresh data
                table_ref = self._get_central_table_ref(ORG_HIERARCHY_TABLE)
                results = _run_query(table_ref, uses_view=False)
            else:
                # Try MV first, then fallback to central table if empty
                table_ref, uses_view = self._get_hierarchy_read_ref(org_slug)
                results = _run_query(table_ref, uses_view)

                # If MV returns empty and we were using the view, try central table
                # (handles streaming buffer lag where MV hasn't refreshed yet)
                if not results and uses_view:
                    logger.debug(f"MV returned empty for {org_slug}, falling back to central table")
                    central_ref = self._get_central_table_ref(ORG_HIERARCHY_TABLE)
                    results = _run_query(central_ref, uses_view=False)

            entities = []
            for row in results:
                level_name = levels_map.get(row['level_code'], {})
                level_name_str = level_name.level_name if hasattr(level_name, 'level_name') else row['level_code']
                entities.append(self._row_to_entity_response(dict(row), level_name_str))

            return HierarchyListResponse(
                org_slug=org_slug,
                entities=entities,
                total=len(entities)
            )
        except (google.api_core.exceptions.NotFound, BigQueryResourceNotFoundError) as e:
            # ERR-003 FIX: Log error when hierarchy resource not found
            logger.error(
                f"ERR-003: Failed to get entities for org '{org_slug}': {e}. "
                f"Returning empty list."
            )
            return HierarchyListResponse(org_slug=org_slug, entities=[], total=0)

    async def get_entities_by_level(
        self,
        org_slug: str,
        level_code: str
    ) -> HierarchyListResponse:
        """Get all entities at a specific level."""
        return await self.get_all_entities(org_slug, level_code=level_code)

    async def get_entity(
        self,
        org_slug: str,
        entity_id: str
    ) -> Optional[HierarchyEntityResponse]:
        """Get a specific hierarchy entity by ID."""
        org_slug = validate_org_slug(org_slug)
        entity_id = validate_entity_id(entity_id)
        table_ref, uses_view = self._get_hierarchy_read_ref(org_slug)

        levels_map = await self.level_service.get_levels_map(org_slug)

        query_params = [
            bigquery.ScalarQueryParameter("entity_id", "STRING", entity_id),
            bigquery.ScalarQueryParameter("org_slug", "STRING", org_slug),  # MT-001: Defense in depth
        ]
        if uses_view:
            # MT-001 FIX: Add org_slug filter even for view queries (defense in depth)
            # View is per-org but filter prevents cross-org access if view misconfigured
            query = f"""
            SELECT *
            FROM `{table_ref}`
            WHERE entity_id = @entity_id
              AND org_slug = @org_slug
            LIMIT 1
            """
        else:
            query = f"""
            SELECT *
            FROM `{table_ref}`
            WHERE org_slug = @org_slug
              AND entity_id = @entity_id
              AND end_date IS NULL
            LIMIT 1
            """
            query_params.append(bigquery.ScalarQueryParameter("org_slug", "STRING", org_slug))

        try:
            job_config = bigquery.QueryJobConfig(query_parameters=query_params)
            results = list(self.bq_client.client.query(query, job_config=job_config).result())

            if not results:
                return None

            row = results[0]
            level_name = levels_map.get(row['level_code'], {})
            # ERR-001 FIX: Log warning when level config is missing for entity
            if not level_name:
                logger.warning(
                    f"ERR-001: Level config not found for level_code='{row['level_code']}' "
                    f"in org '{org_slug}'. Entity '{entity_id}' will use level_code as display name. "
                    f"Run hierarchy level seed to fix."
                )
            level_name_str = level_name.level_name if hasattr(level_name, 'level_name') else row['level_code']
            return self._row_to_entity_response(dict(row), level_name_str)
        except (google.api_core.exceptions.NotFound, BigQueryResourceNotFoundError) as e:
            # ERR-003 FIX: Log error when hierarchy resource not found
            logger.error(
                f"ERR-003: Failed to get entity '{entity_id}' for org '{org_slug}': {e}"
            )
            return None

    async def get_children(
        self,
        org_slug: str,
        parent_id: str
    ) -> HierarchyListResponse:
        """Get direct children of an entity."""
        org_slug = validate_org_slug(org_slug)
        parent_id = validate_entity_id(parent_id)
        table_ref, uses_view = self._get_hierarchy_read_ref(org_slug)

        levels_map = await self.level_service.get_levels_map(org_slug)

        query_params = [
            bigquery.ScalarQueryParameter("parent_id", "STRING", parent_id),
            bigquery.ScalarQueryParameter("org_slug", "STRING", org_slug),  # MT-002: Defense in depth
        ]
        if uses_view:
            # MT-002 FIX: Add org_slug filter even for view queries (defense in depth)
            query = f"""
            SELECT *
            FROM `{table_ref}`
            WHERE parent_id = @parent_id
              AND org_slug = @org_slug
              AND is_active = TRUE
            ORDER BY sort_order ASC, entity_name ASC
            """
        else:
            query = f"""
            SELECT *
            FROM `{table_ref}`
            WHERE org_slug = @org_slug
              AND parent_id = @parent_id
              AND end_date IS NULL
              AND is_active = TRUE
            ORDER BY sort_order ASC, entity_name ASC
            """
            query_params.append(bigquery.ScalarQueryParameter("org_slug", "STRING", org_slug))

        try:
            job_config = bigquery.QueryJobConfig(query_parameters=query_params)
            results = list(self.bq_client.client.query(query, job_config=job_config).result())

            entities = []
            for row in results:
                level_name = levels_map.get(row['level_code'], {})
                level_name_str = level_name.level_name if hasattr(level_name, 'level_name') else row['level_code']
                entities.append(self._row_to_entity_response(dict(row), level_name_str))

            return HierarchyListResponse(
                org_slug=org_slug,
                entities=entities,
                total=len(entities)
            )
        except (google.api_core.exceptions.NotFound, BigQueryResourceNotFoundError) as e:
            # ERR-003 FIX: Log error when hierarchy resource not found
            logger.error(
                f"ERR-003: Failed to get children of '{parent_id}' for org '{org_slug}': {e}. "
                f"Returning empty list."
            )
            return HierarchyListResponse(org_slug=org_slug, entities=[], total=0)

    async def get_ancestors(
        self,
        org_slug: str,
        entity_id: str
    ) -> AncestorResponse:
        """Get ancestor chain for an entity."""
        org_slug = validate_org_slug(org_slug)
        entity_id = validate_entity_id(entity_id)

        entity = await self.get_entity(org_slug, entity_id)
        if not entity:
            raise ValueError(f"Entity {entity_id} not found")

        ancestors = []
        for ancestor_id in entity.path_ids[:-1]:  # Exclude self
            ancestor = await self.get_entity(org_slug, ancestor_id)
            if ancestor:
                ancestors.append(ancestor)

        return AncestorResponse(
            org_slug=org_slug,
            entity_id=entity_id,
            ancestors=ancestors
        )

    async def get_descendants(
        self,
        org_slug: str,
        entity_id: str
    ) -> DescendantsResponse:
        """Get all descendants of an entity."""
        org_slug = validate_org_slug(org_slug)
        entity_id = validate_entity_id(entity_id)
        table_ref, uses_view = self._get_hierarchy_read_ref(org_slug)

        entity = await self.get_entity(org_slug, entity_id)
        if not entity:
            raise ValueError(f"Entity {entity_id} not found")

        levels_map = await self.level_service.get_levels_map(org_slug)
        path_pattern = get_descendants_path_pattern(entity.path)

        query_params = [
            bigquery.ScalarQueryParameter("path_pattern", "STRING", path_pattern),
            bigquery.ScalarQueryParameter("org_slug", "STRING", org_slug),  # MT-003: Defense in depth
        ]
        if uses_view:
            # MT-003 FIX: Add org_slug filter even for view queries (defense in depth)
            query = f"""
            SELECT *
            FROM `{table_ref}`
            WHERE path LIKE @path_pattern
              AND org_slug = @org_slug
              AND is_active = TRUE
            ORDER BY path ASC
            """
        else:
            query = f"""
            SELECT *
            FROM `{table_ref}`
            WHERE org_slug = @org_slug
              AND path LIKE @path_pattern
              AND end_date IS NULL
              AND is_active = TRUE
            ORDER BY path ASC
            """
            query_params.append(bigquery.ScalarQueryParameter("org_slug", "STRING", org_slug))

        try:
            job_config = bigquery.QueryJobConfig(query_parameters=query_params)
            results = list(self.bq_client.client.query(query, job_config=job_config).result())

            descendants = []
            for row in results:
                level_name = levels_map.get(row['level_code'], {})
                level_name_str = level_name.level_name if hasattr(level_name, 'level_name') else row['level_code']
                descendants.append(self._row_to_entity_response(dict(row), level_name_str))

            return DescendantsResponse(
                org_slug=org_slug,
                entity_id=entity_id,
                descendants=descendants,
                total=len(descendants)
            )
        except (google.api_core.exceptions.NotFound, BigQueryResourceNotFoundError) as e:
            # ERR-003 FIX: Log error when hierarchy resource not found
            logger.error(
                f"ERR-003: Failed to get descendants of '{entity_id}' for org '{org_slug}': {e}. "
                f"Returning empty list."
            )
            return DescendantsResponse(
                org_slug=org_slug,
                entity_id=entity_id,
                descendants=[],
                total=0
            )

    async def get_hierarchy_tree(self, org_slug: str) -> HierarchyTreeResponse:
        """Get full hierarchy as a tree structure."""
        org_slug = validate_org_slug(org_slug)

        # Get levels configuration
        levels_response = await self.level_service.get_levels(org_slug)
        levels_map = {lvl.level_code: lvl for lvl in levels_response.levels}

        # Get all active entities (use central table for fresh streaming buffer data)
        all_entities = await self.get_all_entities(org_slug, use_central_table=True)

        # Build tree
        entities_by_id: Dict[str, HierarchyTreeNode] = {}
        roots: List[HierarchyTreeNode] = []
        stats: Dict[str, int] = {"total": 0}

        # First pass: create all nodes
        for entity in all_entities.entities:
            level_config = levels_map.get(entity.level_code)
            level_name = level_config.level_name if level_config else entity.level_code

            node = HierarchyTreeNode(
                id=entity.id,
                entity_id=entity.entity_id,
                entity_name=entity.entity_name,
                level=entity.level,
                level_code=entity.level_code,
                level_name=level_name,
                path=entity.path,
                depth=entity.depth,
                owner_name=entity.owner_name,
                owner_email=entity.owner_email,
                description=entity.description,
                is_active=entity.is_active,
                metadata=entity.metadata,
                children=[]
            )
            entities_by_id[entity.entity_id] = node

            # Update stats
            if entity.level_code not in stats:
                stats[entity.level_code] = 0
            stats[entity.level_code] += 1
            stats["total"] += 1

        # Second pass: build tree structure
        for entity in all_entities.entities:
            node = entities_by_id[entity.entity_id]
            if entity.parent_id and entity.parent_id in entities_by_id:
                entities_by_id[entity.parent_id].children.append(node)
            else:
                roots.append(node)

        return HierarchyTreeResponse(
            org_slug=org_slug,
            levels=levels_response.levels,
            roots=roots,
            stats=stats
        )

    # ==========================================================================
    # Create Operations
    # ==========================================================================

    async def create_entity(
        self,
        org_slug: str,
        request: CreateEntityRequest,
        created_by: str
    ) -> HierarchyEntityResponse:
        """Create a new hierarchy entity at any level."""
        org_slug = validate_org_slug(org_slug)

        # Get level configuration
        level_config = await self.level_service.get_level_by_code(org_slug, request.level_code)
        if not level_config:
            # ERR-002 FIX: Include available levels in error message for debugging
            available_levels = await self.level_service.get_levels(org_slug)
            available_codes = [lvl.level_code for lvl in available_levels.levels]
            logger.error(
                f"Level validation failed for org '{org_slug}': "
                f"requested level_code='{request.level_code}', "
                f"available levels={available_codes}"
            )
            raise ValueError(
                f"Level '{request.level_code}' not configured for this organization. "
                f"Available levels: {available_codes}"
            )

        # Validate parent requirement
        parent = None
        parent_path = None
        parent_path_ids = None
        parent_path_names = None

        if level_config.level == 1:
            # Root level - no parent allowed
            if request.parent_id:
                raise ValueError("Root level entities cannot have a parent")
        else:
            # Non-root level - parent required
            if not request.parent_id:
                raise ValueError(f"Entities at level '{request.level_code}' require a parent")

            # Query central table directly (bypasses MV for fresh data from streaming buffer)
            parent_row = await self._get_entity_from_central(org_slug, request.parent_id)
            if not parent_row:
                raise ValueError(f"Parent entity {request.parent_id} does not exist")

            # Validate parent is at correct level
            parent_level_config = await self.level_service.get_level_by_code(org_slug, parent_row['level_code'])
            if parent_level_config and parent_level_config.is_leaf:
                raise ValueError(f"Cannot add children to leaf entity {request.parent_id}")

            if parent_row['level'] != level_config.parent_level:
                raise ValueError(
                    f"Parent {request.parent_id} is at level {parent_row['level']}, "
                    f"but level '{request.level_code}' requires parent at level {level_config.parent_level}"
                )

            parent_path = parent_row['path']
            parent_path_ids = parent_row.get('path_ids') or []
            parent_path_names = parent_row.get('path_names') or []

            # Check max_children constraint
            if level_config.max_children:
                children = await self.get_children(org_slug, request.parent_id)
                if children.total >= level_config.max_children:
                    raise ValueError(
                        f"Parent {request.parent_id} already has maximum "
                        f"{level_config.max_children} children"
                    )

        # Generate or validate entity_id
        if request.entity_id:
            entity_id = validate_entity_id(request.entity_id)
        elif level_config.id_auto_generate:
            # Auto-generate ID
            prefix = level_config.id_prefix or f"{request.level_code.upper()[:4]}-"
            entity_id = f"{prefix}{uuid.uuid4().hex[:8].upper()}"
        else:
            raise ValueError("entity_id is required for this level")

        # Check for duplicate (query central table for fresh streaming buffer data)
        existing = await self._get_entity_from_central(org_slug, entity_id)
        if existing:
            raise ValueError(f"Entity {entity_id} already exists")

        # Build path
        path = build_path(entity_id, parent_path)
        path_ids = build_path_ids(entity_id, parent_path_ids)
        path_names = build_path_names(request.entity_name, parent_path_names)
        depth = calculate_depth(path)

        now = datetime.utcnow().isoformat()
        record_id = str(uuid.uuid4())

        row = {
            "id": record_id,
            "org_slug": org_slug,
            "entity_id": entity_id,
            "entity_name": request.entity_name,
            "level": level_config.level,
            "level_code": level_config.level_code,
            "parent_id": request.parent_id,
            "path": path,
            "path_ids": path_ids,
            "path_names": path_names,
            "depth": depth,
            "owner_id": request.owner_id,
            "owner_name": request.owner_name,
            "owner_email": request.owner_email,
            "description": request.description,
            "metadata": request.metadata,
            "sort_order": request.sort_order,
            "is_active": True,
            "created_at": now,
            "created_by": created_by,
            "updated_at": None,
            "updated_by": None,
            "version": 1,
            "end_date": None,
        }

        try:
            self._insert_to_central_table(ORG_HIERARCHY_TABLE, [row])
        except Exception as e:
            logger.error(f"Failed to create entity: {e}")
            raise RuntimeError(f"Failed to create entity: {e}")

        # Return entity directly from inserted row (avoid BigQuery streaming buffer delay)
        # Parse the ISO timestamp string back to datetime
        from datetime import datetime as dt
        created_at_dt = dt.fromisoformat(now.replace('Z', '+00:00')) if now.endswith('Z') else dt.fromisoformat(now)

        return HierarchyEntityResponse(
            id=record_id,
            org_slug=org_slug,
            entity_id=entity_id,
            entity_name=request.entity_name,
            level=level_config.level,
            level_code=level_config.level_code,
            parent_id=request.parent_id,
            path=path,
            path_ids=path_ids,
            path_names=path_names,
            depth=depth,
            owner_id=request.owner_id,
            owner_name=request.owner_name,
            owner_email=request.owner_email,
            description=request.description,
            metadata=request.metadata,
            sort_order=request.sort_order,
            is_active=True,
            created_at=created_at_dt,
            created_by=created_by,
            updated_at=None,
            updated_by=None,
            version=1,
            level_name=level_config.level_name,
        )

    # ==========================================================================
    # Update Operations
    # ==========================================================================

    async def update_entity(
        self,
        org_slug: str,
        entity_id: str,
        request: UpdateEntityRequest,
        updated_by: str
    ) -> HierarchyEntityResponse:
        """Update a hierarchy entity with version history."""
        org_slug = validate_org_slug(org_slug)
        entity_id = validate_entity_id(entity_id)

        # BUG-005 FIX: Query central table directly to handle streaming buffer lag
        # Newly created entities may not be visible in MV yet
        # BUG-007 FIX: Use allow_ended=True to recover from broken state
        # (where previous update set end_date but failed to insert new version)
        existing_row = await self._get_entity_from_central(org_slug, entity_id, allow_ended=True)
        if not existing_row:
            raise ValueError(f"Entity {entity_id} does not exist")

        # Convert row dict to response object for compatibility with existing code
        levels_map = await self.level_service.get_levels_map(org_slug)
        level_name = levels_map.get(existing_row['level_code'], {})
        level_name_str = level_name.level_name if hasattr(level_name, 'level_name') else existing_row['level_code']
        existing = self._row_to_entity_response(existing_row, level_name_str)

        now = datetime.utcnow()
        table_ref = self._get_central_table_ref(ORG_HIERARCHY_TABLE)

        # Mark old version as ended
        end_query = f"""
        UPDATE `{table_ref}`
        SET end_date = @now_ts,
            updated_at = @now_ts,
            updated_by = @updated_by
        WHERE org_slug = @org_slug
          AND id = @entity_record_id
        """
        end_job_config = bigquery.QueryJobConfig(
            query_parameters=[
                bigquery.ScalarQueryParameter("now_ts", "TIMESTAMP", now),
                bigquery.ScalarQueryParameter("updated_by", "STRING", updated_by),
                bigquery.ScalarQueryParameter("org_slug", "STRING", org_slug),
                bigquery.ScalarQueryParameter("entity_record_id", "STRING", existing.id),
            ]
        )
        list(self.bq_client.client.query(end_query, job_config=end_job_config).result())

        # Update path_names if entity_name changed
        new_entity_name = request.entity_name or existing.entity_name
        path_names = existing.path_names.copy() if existing.path_names else []
        if path_names and request.entity_name and request.entity_name != existing.entity_name:
            path_names[-1] = new_entity_name

        # Create new version
        now_iso = now.isoformat()
        new_id = str(uuid.uuid4())
        row = {
            "id": new_id,
            "org_slug": org_slug,
            "entity_id": entity_id,
            "entity_name": new_entity_name,
            "level": existing.level,
            "level_code": existing.level_code,
            "parent_id": existing.parent_id,
            "path": existing.path,
            "path_ids": existing.path_ids,
            "path_names": path_names,
            "depth": existing.depth,
            "owner_id": request.owner_id if request.owner_id is not None else existing.owner_id,
            "owner_name": request.owner_name if request.owner_name is not None else existing.owner_name,
            "owner_email": request.owner_email if request.owner_email is not None else existing.owner_email,
            "description": request.description if request.description is not None else existing.description,
            "metadata": request.metadata if request.metadata is not None else existing.metadata,
            "sort_order": request.sort_order if request.sort_order is not None else existing.sort_order,
            "is_active": request.is_active if request.is_active is not None else existing.is_active,
            "created_at": existing.created_at.isoformat() if hasattr(existing.created_at, 'isoformat') else existing.created_at,
            "created_by": existing.created_by,
            "updated_at": now_iso,
            "updated_by": updated_by,
            "version": existing.version + 1,
            "end_date": None,
        }

        try:
            self._insert_to_central_table(ORG_HIERARCHY_TABLE, [row])
        except Exception as e:
            logger.error(f"Failed to update entity: {e}")
            raise RuntimeError(f"Failed to update entity: {e}")

        # If entity_name changed, update path_names of all descendants
        if request.entity_name and request.entity_name != existing.entity_name:
            await self._update_descendant_path_names(org_slug, entity_id, updated_by)

        # BUG-008 FIX: Return the response from the row dict directly
        # instead of calling get_entity (which queries MV and may not see streaming buffer data)
        return self._row_to_entity_response(row, level_name_str)

    async def _update_descendant_path_names(
        self,
        org_slug: str,
        ancestor_id: str,
        updated_by: str
    ) -> None:
        """Update path_names for all descendants when an ancestor name changes."""
        # Get the updated ancestor
        ancestor = await self.get_entity(org_slug, ancestor_id)
        if not ancestor:
            return

        # Get all descendants
        descendants = await self.get_descendants(org_slug, ancestor_id)

        for descendant in descendants.descendants:
            # Find the index of ancestor in path_ids
            try:
                ancestor_idx = descendant.path_ids.index(ancestor_id)
            except ValueError:
                continue

            # Update path_names
            new_path_names = descendant.path_names.copy()
            new_path_names[ancestor_idx] = ancestor.entity_name

            # Update the descendant
            now = datetime.utcnow()
            table_ref = self._get_central_table_ref(ORG_HIERARCHY_TABLE)

            update_query = f"""
            UPDATE `{table_ref}`
            SET path_names = @path_names,
                updated_at = @now_ts,
                updated_by = @updated_by
            WHERE org_slug = @org_slug
              AND id = @entity_record_id
              AND end_date IS NULL
            """
            job_config = bigquery.QueryJobConfig(
                query_parameters=[
                    bigquery.ArrayQueryParameter("path_names", "STRING", new_path_names),
                    bigquery.ScalarQueryParameter("now_ts", "TIMESTAMP", now),
                    bigquery.ScalarQueryParameter("updated_by", "STRING", updated_by),
                    bigquery.ScalarQueryParameter("org_slug", "STRING", org_slug),
                    bigquery.ScalarQueryParameter("entity_record_id", "STRING", descendant.id),
                ]
            )
            try:
                list(self.bq_client.client.query(update_query, job_config=job_config).result())
            except Exception as e:
                logger.warning(f"Failed to update path_names for {descendant.entity_id}: {e}")

    async def move_entity(
        self,
        org_slug: str,
        entity_id: str,
        request: MoveEntityRequest,
        moved_by: str
    ) -> HierarchyEntityResponse:
        """Move an entity to a new parent."""
        org_slug = validate_org_slug(org_slug)
        entity_id = validate_entity_id(entity_id)

        entity = await self.get_entity(org_slug, entity_id)
        if not entity:
            raise ValueError(f"Entity {entity_id} does not exist")

        # Get level configuration
        level_config = await self.level_service.get_level_by_code(org_slug, entity.level_code)
        if not level_config:
            raise ValueError(f"Level configuration not found for {entity.level_code}")

        # Validate new parent
        new_parent = None
        new_parent_path = None
        new_parent_path_ids = None
        new_parent_path_names = None

        if request.new_parent_id is None:
            # Moving to root
            if level_config.level != 1:
                raise ValueError(f"Entities at level '{entity.level_code}' cannot be root")
        else:
            new_parent = await self.get_entity(org_slug, request.new_parent_id)
            if not new_parent:
                raise ValueError(f"New parent {request.new_parent_id} does not exist")

            # Prevent circular reference
            if request.new_parent_id == entity_id:
                raise ValueError("Cannot move entity to itself")

            # Check if new parent is a descendant of entity
            if entity.path in new_parent.path:
                raise ValueError("Cannot move entity to its own descendant")

            # Validate parent level
            if new_parent.level != level_config.parent_level:
                raise ValueError(
                    f"New parent is at level {new_parent.level}, "
                    f"but this entity requires parent at level {level_config.parent_level}"
                )

            new_parent_path = new_parent.path
            new_parent_path_ids = new_parent.path_ids
            new_parent_path_names = new_parent.path_names

        # Calculate new path
        new_path = rebuild_path_on_move(entity.path, new_parent_path)
        new_path_ids = build_path_ids(entity_id, new_parent_path_ids)
        new_path_names = build_path_names(entity.entity_name, new_parent_path_names)
        new_depth = calculate_depth(new_path)

        now = datetime.utcnow()
        table_ref = self._get_central_table_ref(ORG_HIERARCHY_TABLE)

        # Mark old version as ended
        end_query = f"""
        UPDATE `{table_ref}`
        SET end_date = @now_ts,
            updated_at = @now_ts,
            updated_by = @updated_by
        WHERE org_slug = @org_slug
          AND id = @entity_record_id
        """
        end_job_config = bigquery.QueryJobConfig(
            query_parameters=[
                bigquery.ScalarQueryParameter("now_ts", "TIMESTAMP", now),
                bigquery.ScalarQueryParameter("updated_by", "STRING", moved_by),
                bigquery.ScalarQueryParameter("org_slug", "STRING", org_slug),
                bigquery.ScalarQueryParameter("entity_record_id", "STRING", entity.id),
            ]
        )
        list(self.bq_client.client.query(end_query, job_config=end_job_config).result())

        # Create new version
        now_iso = now.isoformat()
        new_id = str(uuid.uuid4())
        row = {
            "id": new_id,
            "org_slug": org_slug,
            "entity_id": entity_id,
            "entity_name": entity.entity_name,
            "level": entity.level,
            "level_code": entity.level_code,
            "parent_id": request.new_parent_id,
            "path": new_path,
            "path_ids": new_path_ids,
            "path_names": new_path_names,
            "depth": new_depth,
            "owner_id": entity.owner_id,
            "owner_name": entity.owner_name,
            "owner_email": entity.owner_email,
            "description": entity.description,
            "metadata": entity.metadata,
            "sort_order": entity.sort_order,
            "is_active": entity.is_active,
            "created_at": entity.created_at.isoformat() if hasattr(entity.created_at, 'isoformat') else entity.created_at,
            "created_by": entity.created_by,
            "updated_at": now_iso,
            "updated_by": moved_by,
            "version": entity.version + 1,
            "end_date": None,
        }

        try:
            self._insert_to_central_table(ORG_HIERARCHY_TABLE, [row])
        except Exception as e:
            logger.error(f"Failed to move entity: {e}")
            raise RuntimeError(f"Failed to move entity: {e}")

        # Update all descendants' paths
        old_path = entity.path
        await self._update_descendant_paths(org_slug, entity_id, old_path, new_path, moved_by)

        return await self.get_entity(org_slug, entity_id)

    async def _update_descendant_paths(
        self,
        org_slug: str,
        moved_entity_id: str,
        old_path: str,
        new_path: str,
        updated_by: str
    ) -> None:
        """Update paths for all descendants when an entity is moved."""
        descendants = await self.get_descendants(org_slug, moved_entity_id)

        for descendant in descendants.descendants:
            # Calculate new path by replacing old prefix with new prefix
            descendant_new_path = descendant.path.replace(old_path, new_path, 1)

            # Recalculate path_ids and path_names
            moved_entity = await self.get_entity(org_slug, moved_entity_id)
            if not moved_entity:
                continue

            # Find where moved_entity appears in descendant's path
            try:
                moved_idx = descendant.path_ids.index(moved_entity_id)
            except ValueError:
                continue

            # Build new path_ids and path_names
            new_path_ids = moved_entity.path_ids + descendant.path_ids[moved_idx + 1:]
            new_path_names = moved_entity.path_names + descendant.path_names[moved_idx + 1:]
            new_depth = calculate_depth(descendant_new_path)

            now = datetime.utcnow()
            table_ref = self._get_central_table_ref(ORG_HIERARCHY_TABLE)

            update_query = f"""
            UPDATE `{table_ref}`
            SET path = @path,
                path_ids = @path_ids,
                path_names = @path_names,
                depth = @depth,
                updated_at = @now_ts,
                updated_by = @updated_by
            WHERE org_slug = @org_slug
              AND id = @entity_record_id
              AND end_date IS NULL
            """
            job_config = bigquery.QueryJobConfig(
                query_parameters=[
                    bigquery.ScalarQueryParameter("path", "STRING", descendant_new_path),
                    bigquery.ArrayQueryParameter("path_ids", "STRING", new_path_ids),
                    bigquery.ArrayQueryParameter("path_names", "STRING", new_path_names),
                    bigquery.ScalarQueryParameter("depth", "INT64", new_depth),
                    bigquery.ScalarQueryParameter("now_ts", "TIMESTAMP", now),
                    bigquery.ScalarQueryParameter("updated_by", "STRING", updated_by),
                    bigquery.ScalarQueryParameter("org_slug", "STRING", org_slug),
                    bigquery.ScalarQueryParameter("entity_record_id", "STRING", descendant.id),
                ]
            )
            try:
                list(self.bq_client.client.query(update_query, job_config=job_config).result())
            except Exception as e:
                logger.warning(f"Failed to update path for {descendant.entity_id}: {e}")

    # ==========================================================================
    # Delete Operations
    # ==========================================================================

    async def check_deletion_blocked(
        self,
        org_slug: str,
        entity_id: str
    ) -> DeletionBlockedResponse:
        """Check if entity deletion is blocked by children or references."""
        org_slug = validate_org_slug(org_slug)
        entity_id = validate_entity_id(entity_id)

        # BUG-005 FIX: Query central table directly to handle streaming buffer lag
        # BUG-007 FIX: Use allow_ended=True to recover from broken state
        entity_row = await self._get_entity_from_central(org_slug, entity_id, allow_ended=True)
        if not entity_row:
            raise ValueError(f"Entity {entity_id} does not exist")

        # Convert to response for level_code
        levels_map = await self.level_service.get_levels_map(org_slug)
        level_name = levels_map.get(entity_row['level_code'], {})
        level_name_str = level_name.level_name if hasattr(level_name, 'level_name') else entity_row['level_code']
        entity = self._row_to_entity_response(entity_row, level_name_str)

        blocking_entities = []

        # Check for children
        children = await self.get_children(org_slug, entity_id)
        for child in children.entities:
            blocking_entities.append({
                "entity_id": child.entity_id,
                "entity_name": child.entity_name,
                "level_code": child.level_code,
                "type": "child"
            })

        # Check for references in subscription plans
        subscription_table = self._get_table_ref(org_slug, SAAS_SUBSCRIPTION_PLANS_TABLE)
        try:
            # Check if entity_id appears in x_hierarchy_entity_id or as part of x_hierarchy_path
            # MT-003 FIX: Use correct column names with x_ prefix (x_hierarchy_entity_id, x_hierarchy_path)
            ref_query = f"""
            SELECT subscription_id, provider, plan_name
            FROM `{subscription_table}`
            WHERE (x_hierarchy_entity_id = @entity_id
                   OR x_hierarchy_path LIKE CONCAT('%/', @entity_id, '/%')
                   OR x_hierarchy_path LIKE CONCAT('%/', @entity_id))
              AND end_date IS NULL
            LIMIT 10
            """
            ref_params = [bigquery.ScalarQueryParameter("entity_id", "STRING", entity_id)]
            ref_job_config = bigquery.QueryJobConfig(query_parameters=ref_params)
            ref_results = list(self.bq_client.client.query(ref_query, job_config=ref_job_config).result())

            for row in ref_results:
                blocking_entities.append({
                    "entity_id": row['subscription_id'],
                    "entity_name": f"{row['provider']} - {row['plan_name']}",
                    "level_code": "subscription",
                    "type": "reference"
                })
        except google.api_core.exceptions.NotFound:
            pass

        blocked = len(blocking_entities) > 0
        reason = ""
        if blocked:
            has_children = any(e.get("type") == "child" for e in blocking_entities)
            has_refs = any(e.get("type") == "reference" for e in blocking_entities)

            if has_children and has_refs:
                reason = "Cannot delete entity with active children and subscription references"
            elif has_children:
                reason = "Cannot delete entity with active children"
            else:
                reason = "Cannot delete entity with active subscription references"

        return DeletionBlockedResponse(
            entity_id=entity_id,
            level_code=entity.level_code,
            blocked=blocked,
            reason=reason,
            blocking_entities=blocking_entities
        )

    async def delete_entity(
        self,
        org_slug: str,
        entity_id: str,
        deleted_by: str,
        force: bool = False
    ) -> bool:
        """Soft delete a hierarchy entity."""
        org_slug = validate_org_slug(org_slug)
        entity_id = validate_entity_id(entity_id)

        # Check if deletion is blocked
        if not force:
            block_check = await self.check_deletion_blocked(org_slug, entity_id)
            if block_check.blocked:
                raise ValueError(block_check.reason)

        # BUG-005 FIX: Query central table directly to handle streaming buffer lag
        # BUG-007 FIX: Use allow_ended=True to recover from broken state
        existing_row = await self._get_entity_from_central(org_slug, entity_id, allow_ended=True)
        if not existing_row:
            raise ValueError(f"Entity {entity_id} does not exist")

        # Convert to response for entity.id
        levels_map = await self.level_service.get_levels_map(org_slug)
        level_name = levels_map.get(existing_row['level_code'], {})
        level_name_str = level_name.level_name if hasattr(level_name, 'level_name') else existing_row['level_code']
        existing = self._row_to_entity_response(existing_row, level_name_str)

        now = datetime.utcnow()
        table_ref = self._get_central_table_ref(ORG_HIERARCHY_TABLE)

        # Soft delete
        delete_query = f"""
        UPDATE `{table_ref}`
        SET end_date = @now_ts,
            is_active = FALSE,
            updated_at = @now_ts,
            updated_by = @deleted_by
        WHERE org_slug = @org_slug
          AND id = @entity_record_id
        """
        delete_job_config = bigquery.QueryJobConfig(
            query_parameters=[
                bigquery.ScalarQueryParameter("now_ts", "TIMESTAMP", now),
                bigquery.ScalarQueryParameter("deleted_by", "STRING", deleted_by),
                bigquery.ScalarQueryParameter("org_slug", "STRING", org_slug),
                bigquery.ScalarQueryParameter("entity_record_id", "STRING", existing.id),
            ]
        )
        list(self.bq_client.client.query(delete_query, job_config=delete_job_config).result())
        return True

    # ==========================================================================
    # Seed Operations
    # ==========================================================================

    async def seed_default_entities(
        self,
        org_slug: str,
        created_by: str,
        force: bool = False
    ) -> Dict[str, Any]:
        """
        Seed default hierarchy entities from CSV file.

        This is the same seed data used during org onboarding. Use this to:
        - Initialize hierarchy for orgs that didn't get seeded during onboarding
        - Reset hierarchy to default state (with force=True)

        Args:
            org_slug: Organization to seed
            created_by: User ID for audit trail
            force: If True, deletes existing entities before seeding

        Returns:
            Dict with seeding results
        """
        import csv
        from pathlib import Path

        org_slug = validate_org_slug(org_slug)

        result = {
            "entities_seeded": 0,
            "entities_skipped": 0,
            "by_level": {},
            "errors": []
        }

        # Load CSV from api-service config
        csv_path = Path(__file__).parent.parent.parent.parent.parent / "configs" / "hierarchy" / "seed" / "data" / "default_hierarchy.csv"

        if not csv_path.exists():
            result["errors"].append(f"Seed CSV not found: {csv_path}")
            logger.warning(f"Hierarchy seed CSV not found: {csv_path}")
            return result

        # Load CSV data
        csv_rows = []
        try:
            with open(csv_path, 'r', encoding='utf-8') as f:
                reader = csv.DictReader(f)
                for row in reader:
                    cleaned_row = {}
                    for key, value in row.items():
                        cleaned_row[key] = value if value else None
                    csv_rows.append(cleaned_row)
            logger.info(f"Loaded {len(csv_rows)} entities from seed CSV")
        except Exception as e:
            result["errors"].append(f"Failed to load CSV: {e}")
            return result

        if not csv_rows:
            result["errors"].append("No entities found in seed CSV")
            return result

        # If force, delete existing entities first
        if force:
            try:
                table_ref = self._get_central_table_ref(ORG_HIERARCHY_TABLE)
                delete_query = f"""
                DELETE FROM `{table_ref}`
                WHERE org_slug = @org_slug
                """
                job_config = bigquery.QueryJobConfig(
                    query_parameters=[
                        bigquery.ScalarQueryParameter("org_slug", "STRING", org_slug),
                    ]
                )
                self.bq_client.client.query(delete_query, job_config=job_config).result()
                logger.info(f"Deleted existing hierarchy entities for {org_slug}")
            except Exception as e:
                logger.error(f"Failed to delete existing entities: {e}")
                result["errors"].append(f"Failed to delete existing entities: {e}")
                return result

        # Get existing entity IDs to skip duplicates
        existing_ids = set()
        if not force:
            try:
                all_entities = await self.get_all_entities(org_slug, use_central_table=True)
                existing_ids = {e.entity_id for e in all_entities.entities}
            except Exception as e:
                logger.warning(f"Failed to get existing entities, proceeding with seed: {e}")

        # Build entity lookup for path computation
        entity_lookup = {row["entity_id"]: row for row in csv_rows}

        def compute_path_info(entity_id: str) -> tuple:
            """Compute path, path_ids, path_names, and depth for an entity."""
            path_ids = []
            path_names = []
            current_id = entity_id

            while current_id:
                entity = entity_lookup.get(current_id)
                if not entity:
                    break
                path_ids.insert(0, current_id)
                path_names.insert(0, entity["entity_name"])
                current_id = entity.get("parent_id")

            path = "/" + "/".join(path_ids)
            depth = len(path_ids) - 1
            return path, path_ids, path_names, depth

        # Build rows to insert
        now = datetime.utcnow().isoformat() + "Z"
        rows_to_insert = []

        for row in csv_rows:
            entity_id = row["entity_id"]

            # Skip if already exists
            if entity_id in existing_ids:
                result["entities_skipped"] += 1
                continue

            path, path_ids, path_names, depth = compute_path_info(entity_id)

            # Parse metadata
            metadata = row.get("metadata")
            if metadata and isinstance(metadata, str):
                try:
                    import json as json_module
                    json_module.loads(metadata)  # Validate JSON
                except json.JSONDecodeError:
                    metadata = json.dumps({"raw": metadata})

            entity_row = {
                "id": str(uuid.uuid4()),
                "org_slug": org_slug,
                "entity_id": entity_id,
                "entity_name": row["entity_name"],
                "level": int(row["level"]),
                "level_code": row["level_code"],
                "parent_id": row.get("parent_id") or None,
                "path": path,
                "path_ids": path_ids,
                "path_names": path_names,
                "depth": depth,
                "owner_id": None,
                "owner_name": row.get("owner_name"),
                "owner_email": row.get("owner_email"),
                "description": row.get("description"),
                "metadata": metadata,
                "sort_order": int(row.get("sort_order") or 0),
                "is_active": True,
                "created_at": now,
                "created_by": created_by,
                "updated_at": now,
                "updated_by": created_by,
                "version": 1,
                "end_date": None
            }
            rows_to_insert.append(entity_row)

            # Track by level
            level_code = row["level_code"]
            result["by_level"][level_code] = result["by_level"].get(level_code, 0) + 1

        if not rows_to_insert:
            logger.info(f"No new entities to seed for {org_slug}")
            return result

        # Insert entities
        try:
            self._insert_to_central_table(ORG_HIERARCHY_TABLE, rows_to_insert)
            result["entities_seeded"] = len(rows_to_insert)
            logger.info(
                f"Seeded {len(rows_to_insert)} hierarchy entities for {org_slug}: {result['by_level']}"
            )
        except Exception as e:
            result["errors"].append(f"Failed to insert entities: {e}")
            logger.error(f"Failed to seed hierarchy entities: {e}")

        return result


# ==============================================================================
# Service Instance
# ==============================================================================

def get_hierarchy_crud_service() -> HierarchyService:
    """Get hierarchy service instance."""
    return HierarchyService()
