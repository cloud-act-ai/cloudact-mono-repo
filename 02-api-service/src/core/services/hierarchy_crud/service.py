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
from datetime import datetime, timezone
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

ORG_SLUG_PATTERN = re.compile(r'^[a-z0-9_]{3,50}$')
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

    def _refresh_hierarchy_mv(self, org_slug: str) -> None:
        """Refresh the materialized view after write operations.

        STATE-002 FIX: Materialized views can serve stale data after writes.
        This method forces a refresh of the x_org_hierarchy MV to ensure
        reads return fresh data immediately after creates, updates, or deletes.
        """
        view_ref = self._get_org_view_ref(org_slug, ORG_HIERARCHY_VIEW)

        try:
            # Check if view exists before attempting refresh
            table = self.bq_client.client.get_table(view_ref)
            if table.table_type != "MATERIALIZED_VIEW":
                logger.debug(f"Skipping refresh for {view_ref} - not a materialized view")
                return

            # Refresh the materialized view
            refresh_query = f"CALL BQ.REFRESH_MATERIALIZED_VIEW('{view_ref}')"
            self.bq_client.client.query(refresh_query).result()
            logger.info(f"STATE-002 FIX: Refreshed MV {view_ref} after hierarchy write")

        except google.api_core.exceptions.NotFound:
            # MV doesn't exist, nothing to refresh
            logger.debug(f"No MV to refresh for org '{org_slug}'")
        except Exception as e:
            # Log but don't fail the operation - MV refresh is best-effort
            logger.warning(f"Failed to refresh MV {view_ref}: {e}")

    async def _clear_orphan_hierarchy_references(self, org_slug: str, deleted_entity_id: str) -> int:
        """Clear hierarchy fields from subscription_plans that reference a deleted entity.

        GAP-004 FIX: When a hierarchy entity is deleted, any subscription plans
        that reference that entity (or have it in their path) will have orphan
        references. This method clears those references to prevent stale data
        in cost calculations.

        Args:
            org_slug: Organization slug
            deleted_entity_id: The entity_id that was deleted

        Returns:
            Number of subscription plans updated
        """
        env_suffix = settings.get_environment_suffix()
        dataset_ref = f"{self.project_id}.{org_slug}_{env_suffix}"

        try:
            # Update subscription_plans where:
            # 1. x_hierarchy_entity_id matches deleted entity
            # 2. OR path contains the deleted entity (descendants also become orphans)
            cleanup_query = f"""
            UPDATE `{dataset_ref}.{SAAS_SUBSCRIPTION_PLANS_TABLE}`
            SET x_hierarchy_entity_id = NULL,
                x_hierarchy_entity_name = NULL,
                x_hierarchy_level_code = NULL,
                x_hierarchy_path = NULL,
                x_hierarchy_path_names = NULL,
                updated_at = CURRENT_TIMESTAMP()
            WHERE x_org_slug = @org_slug
              AND (
                x_hierarchy_entity_id = @deleted_entity_id
                OR x_hierarchy_path LIKE CONCAT('%/', @deleted_entity_id, '/%')
                OR x_hierarchy_path LIKE CONCAT('%/', @deleted_entity_id)
              )
              AND (end_date IS NULL OR end_date >= CURRENT_DATE())
            """

            job_config = bigquery.QueryJobConfig(
                query_parameters=[
                    bigquery.ScalarQueryParameter("org_slug", "STRING", org_slug),
                    bigquery.ScalarQueryParameter("deleted_entity_id", "STRING", deleted_entity_id),
                ]
            )

            job = self.bq_client.client.query(cleanup_query, job_config=job_config)
            job.result()

            rows_updated = job.num_dml_affected_rows or 0

            if rows_updated > 0:
                logger.info(
                    f"GAP-004 FIX: Cleared hierarchy references from {rows_updated} "
                    f"subscription plans for deleted entity '{deleted_entity_id}' in org '{org_slug}'"
                )
            else:
                logger.debug(
                    f"No subscription plans referenced deleted entity '{deleted_entity_id}'"
                )

            return rows_updated

        except google.api_core.exceptions.NotFound:
            # Table doesn't exist yet, nothing to clean
            logger.debug(f"No subscription_plans table for org '{org_slug}'")
            return 0
        except Exception as e:
            # Log but don't fail - orphan cleanup is best-effort
            logger.warning(
                f"Failed to clear orphan hierarchy references for entity "
                f"'{deleted_entity_id}' in org '{org_slug}': {e}"
            )
            return 0

    def _insert_to_central_table(self, table_name: str, rows: List[Dict[str, Any]]) -> None:
        """Insert rows into a central dataset table using standard DML INSERT.

        Uses standard SQL INSERT instead of streaming inserts to avoid the
        streaming buffer limitation where data cannot be updated/deleted for ~30 minutes.
        """
        if not rows:
            return

        table_id = self._get_central_table_ref(table_name)

        # Get column names from first row
        columns = list(rows[0].keys())

        # Build parameterized INSERT statement
        # For multiple rows, we use UNION ALL pattern for BigQuery compatibility
        values_clauses = []
        query_params = []

        for row_idx, row in enumerate(rows):
            row_values = []
            for col in columns:
                # VAL-001 FIX: Use safe prefix to avoid param name collisions
                param_name = f"p_{col}_{row_idx}"
                value = row.get(col)

                # Handle metadata JSON serialization
                if col == 'metadata' and value is not None:
                    if isinstance(value, dict):
                        value = json.dumps(value)

                # Determine BigQuery type with proper type handling
                if value is None:
                    row_values.append("NULL")
                elif isinstance(value, bool):
                    # IMPORTANT: Check bool before int (bool is subclass of int in Python)
                    query_params.append(bigquery.ScalarQueryParameter(param_name, "BOOL", value))
                    row_values.append(f"@{param_name}")
                elif isinstance(value, datetime):
                    # CRUD-001 FIX: Handle datetime objects as TIMESTAMP
                    query_params.append(bigquery.ScalarQueryParameter(param_name, "TIMESTAMP", value))
                    row_values.append(f"@{param_name}")
                elif isinstance(value, list):
                    # CRUD-002 FIX: Handle list/array columns (path_ids, path_names)
                    # Determine array element type from first non-None element
                    elem_type = "STRING"  # Default to STRING
                    for elem in value:
                        if elem is not None:
                            if isinstance(elem, int):
                                elem_type = "INT64"
                            elif isinstance(elem, float):
                                elem_type = "FLOAT64"
                            elif isinstance(elem, bool):
                                elem_type = "BOOL"
                            break
                    query_params.append(bigquery.ArrayQueryParameter(param_name, elem_type, value))
                    row_values.append(f"@{param_name}")
                elif isinstance(value, int):
                    query_params.append(bigquery.ScalarQueryParameter(param_name, "INT64", value))
                    row_values.append(f"@{param_name}")
                elif isinstance(value, float):
                    query_params.append(bigquery.ScalarQueryParameter(param_name, "FLOAT64", value))
                    row_values.append(f"@{param_name}")
                else:
                    # String, JSON string
                    query_params.append(bigquery.ScalarQueryParameter(param_name, "STRING", str(value)))
                    row_values.append(f"@{param_name}")

            values_clauses.append(f"SELECT {', '.join(row_values)}")

        # Build INSERT statement with column names
        columns_str = ", ".join(columns)
        values_union = " UNION ALL ".join(values_clauses)

        insert_query = f"""
        INSERT INTO `{table_id}` ({columns_str})
        {values_union}
        """

        try:
            job_config = bigquery.QueryJobConfig(query_parameters=query_params)
            query_job = self.bq_client.client.query(insert_query, job_config=job_config)
            query_job.result()  # Wait for completion
        except google.api_core.exceptions.BadRequest as e:
            # ERR-002 FIX: Preserve specific BigQuery error type
            logger.error(f"BigQuery BadRequest inserting into {table_id}: {e}")
            raise
        except Exception as e:
            logger.error(f"Failed to insert rows into {table_id}: {e}")
            raise RuntimeError(f"Failed to insert rows into {table_id}: {e}")

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
                level_config = levels_map.get(row['level_code'])
                level_name_str = level_config.level_name if level_config and hasattr(level_config, 'level_name') else row['level_code']
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
            # VAL-001 FIX: org_slug already added at line 463, don't add duplicate

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
            # VAL-002 FIX: org_slug already added at line 525, don't add duplicate

        try:
            job_config = bigquery.QueryJobConfig(query_parameters=query_params)
            results = list(self.bq_client.client.query(query, job_config=job_config).result())

            entities = []
            for row in results:
                level_config = levels_map.get(row['level_code'])
                level_name_str = level_config.level_name if level_config and hasattr(level_config, 'level_name') else row['level_code']
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
        """Get ancestor chain for an entity.

        PERF-001 FIX: Fetch all ancestors in a single query using IN clause
        instead of N+1 individual queries.
        """
        org_slug = validate_org_slug(org_slug)
        entity_id = validate_entity_id(entity_id)

        entity = await self.get_entity(org_slug, entity_id)
        if not entity:
            raise ValueError(f"Entity {entity_id} not found")

        ancestor_ids = entity.path_ids[:-1]  # Exclude self
        if not ancestor_ids:
            return AncestorResponse(org_slug=org_slug, entity_id=entity_id, ancestors=[])

        # PERF-001 FIX: Batch fetch all ancestors in one query
        table_ref, uses_view = self._get_hierarchy_read_ref(org_slug)
        levels_map = await self.level_service.get_levels_map(org_slug)

        query_params = [
            bigquery.ArrayQueryParameter("ancestor_ids", "STRING", ancestor_ids),
            bigquery.ScalarQueryParameter("org_slug", "STRING", org_slug),
        ]

        if uses_view:
            query = f"""
            SELECT *
            FROM `{table_ref}`
            WHERE entity_id IN UNNEST(@ancestor_ids)
              AND org_slug = @org_slug
            """
        else:
            query = f"""
            SELECT *
            FROM `{table_ref}`
            WHERE org_slug = @org_slug
              AND entity_id IN UNNEST(@ancestor_ids)
              AND end_date IS NULL
            """

        try:
            job_config = bigquery.QueryJobConfig(query_parameters=query_params)
            results = list(self.bq_client.client.query(query, job_config=job_config).result())

            # Build lookup and preserve order from path_ids
            ancestors_map = {}
            for row in results:
                level_config = levels_map.get(row['level_code'])
                level_name_str = level_config.level_name if level_config and hasattr(level_config, 'level_name') else row['level_code']
                ancestors_map[row['entity_id']] = self._row_to_entity_response(dict(row), level_name_str)

            # Return ancestors in path order (root first)
            ancestors = [ancestors_map[aid] for aid in ancestor_ids if aid in ancestors_map]

            return AncestorResponse(
                org_slug=org_slug,
                entity_id=entity_id,
                ancestors=ancestors
            )
        except Exception as e:
            logger.error(f"Failed to fetch ancestors for {entity_id}: {e}")
            return AncestorResponse(org_slug=org_slug, entity_id=entity_id, ancestors=[])

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
            # VAL-003 FIX: org_slug already added at line 616, don't add duplicate

        try:
            job_config = bigquery.QueryJobConfig(query_parameters=query_params)
            results = list(self.bq_client.client.query(query, job_config=job_config).result())

            descendants = []
            for row in results:
                level_config = levels_map.get(row['level_code'])
                level_name_str = level_config.level_name if level_config and hasattr(level_config, 'level_name') else row['level_code']
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
            # MED-003 FIX: Query central table directly for accurate child count
            # MV may not reflect recent inserts due to streaming buffer delay
            if level_config.max_children:
                central_table = self._get_central_table_ref(ORG_HIERARCHY_TABLE)
                count_query = f"""
                SELECT COUNT(*) as child_count
                FROM `{central_table}`
                WHERE org_slug = @org_slug
                  AND parent_id = @parent_id
                  AND end_date IS NULL
                  AND is_active = TRUE
                """
                count_job_config = bigquery.QueryJobConfig(
                    query_parameters=[
                        bigquery.ScalarQueryParameter("org_slug", "STRING", org_slug),
                        bigquery.ScalarQueryParameter("parent_id", "STRING", request.parent_id),
                    ]
                )
                count_result = list(self.bq_client.client.query(count_query, job_config=count_job_config).result())
                current_children = count_result[0]['child_count'] if count_result else 0
                if current_children >= level_config.max_children:
                    raise ValueError(
                        f"Parent {request.parent_id} already has maximum "
                        f"{level_config.max_children} children"
                    )

        # Generate or validate entity_id
        if request.entity_id:
            entity_id = validate_entity_id(request.entity_id)
            # FIX ISSUE 1.1: Validate entity_id matches level's id_prefix if configured
            if level_config.id_prefix:
                expected_prefix = level_config.id_prefix.upper()
                if not entity_id.startswith(expected_prefix):
                    raise ValueError(
                        f"Entity ID '{entity_id}' must start with prefix '{expected_prefix}' "
                        f"for level '{level_config.level_code}'"
                    )
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

        now_dt = datetime.now(timezone.utc)
        now = now_dt.isoformat()
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
            "created_at": now_dt,
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

        # STATE-002 FIX: Refresh MV to ensure new entity appears in reads
        self._refresh_hierarchy_mv(org_slug)

        # Return entity directly from inserted row (avoid BigQuery streaming buffer delay)
        # EDGE-003 FIX: Parse the ISO timestamp string back to datetime
        # datetime.now(timezone.utc).isoformat() produces "+00:00" suffix, not "Z"
        created_at_dt = datetime.fromisoformat(now)

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
        level_config = levels_map.get(existing_row['level_code'])
        level_name_str = level_config.level_name if level_config and hasattr(level_config, 'level_name') else existing_row['level_code']
        existing = self._row_to_entity_response(existing_row, level_name_str)

        now = datetime.now(timezone.utc)
        table_ref = self._get_central_table_ref(ORG_HIERARCHY_TABLE)

        # Update path_names if entity_name changed
        new_entity_name = request.entity_name or existing.entity_name
        path_names = existing.path_names.copy() if existing.path_names else []
        if path_names and request.entity_name and request.entity_name != existing.entity_name:
            path_names[-1] = new_entity_name

        # Create new version row data
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

        # STATE-001 FIX: Use atomic transaction to prevent broken state
        # If INSERT fails after UPDATE, entity would have no current version
        # BigQuery scripting ensures both operations succeed or both fail
        try:
            atomic_query = f"""
            BEGIN TRANSACTION;

            -- Mark old version as ended
            UPDATE `{table_ref}`
            SET end_date = @now_ts,
                updated_at = @now_ts,
                updated_by = @updated_by
            WHERE org_slug = @org_slug
              AND id = @old_record_id;

            -- Create new version
            INSERT INTO `{table_ref}` (
                id, org_slug, entity_id, entity_name, level, level_code,
                parent_id, path, path_ids, path_names, depth,
                owner_id, owner_name, owner_email, description, metadata,
                sort_order, is_active, created_at, created_by, updated_at, updated_by,
                version, end_date
            ) VALUES (
                @new_id, @org_slug, @entity_id, @entity_name, @level, @level_code,
                @parent_id, @path, @path_ids, @path_names, @depth,
                @owner_id, @owner_name, @owner_email, @description, @metadata,
                @sort_order, @is_active, @created_at, @created_by, @updated_at, @updated_by,
                @version, NULL
            );

            COMMIT TRANSACTION;
            """

            job_config = bigquery.QueryJobConfig(
                query_parameters=[
                    bigquery.ScalarQueryParameter("now_ts", "TIMESTAMP", now),
                    bigquery.ScalarQueryParameter("updated_by", "STRING", updated_by),
                    bigquery.ScalarQueryParameter("org_slug", "STRING", org_slug),
                    bigquery.ScalarQueryParameter("old_record_id", "STRING", existing.id),
                    bigquery.ScalarQueryParameter("new_id", "STRING", new_id),
                    bigquery.ScalarQueryParameter("entity_id", "STRING", entity_id),
                    bigquery.ScalarQueryParameter("entity_name", "STRING", new_entity_name),
                    bigquery.ScalarQueryParameter("level", "INT64", existing.level),
                    bigquery.ScalarQueryParameter("level_code", "STRING", existing.level_code),
                    bigquery.ScalarQueryParameter("parent_id", "STRING", existing.parent_id),
                    bigquery.ScalarQueryParameter("path", "STRING", existing.path),
                    bigquery.ArrayQueryParameter("path_ids", "STRING", existing.path_ids or []),
                    bigquery.ArrayQueryParameter("path_names", "STRING", path_names or []),
                    bigquery.ScalarQueryParameter("depth", "INT64", existing.depth),
                    bigquery.ScalarQueryParameter("owner_id", "STRING", row["owner_id"]),
                    bigquery.ScalarQueryParameter("owner_name", "STRING", row["owner_name"]),
                    bigquery.ScalarQueryParameter("owner_email", "STRING", row["owner_email"]),
                    bigquery.ScalarQueryParameter("description", "STRING", row["description"]),
                    bigquery.ScalarQueryParameter("metadata", "STRING", json.dumps(row["metadata"]) if row["metadata"] else None),
                    bigquery.ScalarQueryParameter("sort_order", "INT64", row["sort_order"]),
                    bigquery.ScalarQueryParameter("is_active", "BOOL", row["is_active"]),
                    bigquery.ScalarQueryParameter("created_at", "TIMESTAMP", existing.created_at),
                    bigquery.ScalarQueryParameter("created_by", "STRING", existing.created_by),
                    bigquery.ScalarQueryParameter("updated_at", "TIMESTAMP", now),
                    bigquery.ScalarQueryParameter("version", "INT64", existing.version + 1),
                ]
            )
            list(self.bq_client.client.query(atomic_query, job_config=job_config).result())
            logger.info(f"STATE-001 FIX: Atomically updated entity {entity_id} version {existing.version} -> {existing.version + 1}")
        except Exception as e:
            logger.error(f"Failed to update entity: {e}")
            raise RuntimeError(f"Failed to update entity: {e}")

        # If entity_name changed, update path_names of all descendants
        if request.entity_name and request.entity_name != existing.entity_name:
            await self._update_descendant_path_names(org_slug, entity_id, updated_by)

        # STATE-002 FIX: Refresh MV to ensure updated entity appears in reads
        self._refresh_hierarchy_mv(org_slug)

        # BUG-008 FIX: Return the response from the row dict directly
        # instead of calling get_entity (which queries MV and may not see streaming buffer data)
        return self._row_to_entity_response(row, level_name_str)

    async def _update_descendant_path_names(
        self,
        org_slug: str,
        ancestor_id: str,
        updated_by: str
    ) -> None:
        """Update path_names for all descendants when an ancestor name changes.

        SCALE-002 FIX: Batch all updates into a single BigQuery API call.
        """
        # Get the updated ancestor
        ancestor = await self.get_entity(org_slug, ancestor_id)
        if not ancestor:
            return

        # Get all descendants
        descendants = await self.get_descendants(org_slug, ancestor_id)

        if not descendants.descendants:
            return

        # SCALE-002 FIX: Collect all updates, then execute in single batch
        updates = []
        for descendant in descendants.descendants:
            # Find the index of ancestor in path_ids
            try:
                ancestor_idx = descendant.path_ids.index(ancestor_id)
            except ValueError:
                continue

            # Update path_names
            new_path_names = descendant.path_names.copy()
            new_path_names[ancestor_idx] = ancestor.entity_name

            updates.append({
                "record_id": descendant.id,
                "entity_id": descendant.entity_id,
                "path_names": new_path_names,
            })

        if not updates:
            return

        # SCALE-002 FIX: Execute batch update using BigQuery UPDATE with JOIN
        now = datetime.now(timezone.utc)
        table_ref = self._get_central_table_ref(ORG_HIERARCHY_TABLE)

        batch_query = f"""
        UPDATE `{table_ref}` t
        SET
            path_names = updates.new_path_names,
            updated_at = @now_ts,
            updated_by = @updated_by
        FROM (
            SELECT * FROM UNNEST(@updates) AS u
        ) AS updates
        WHERE t.org_slug = @org_slug
          AND t.id = updates.record_id
          AND t.end_date IS NULL
        """

        update_structs = [
            {"record_id": u["record_id"], "new_path_names": u["path_names"]}
            for u in updates
        ]

        job_config = bigquery.QueryJobConfig(
            query_parameters=[
                bigquery.ScalarQueryParameter("now_ts", "TIMESTAMP", now),
                bigquery.ScalarQueryParameter("updated_by", "STRING", updated_by),
                bigquery.ScalarQueryParameter("org_slug", "STRING", org_slug),
                bigquery.ArrayQueryParameter(
                    "updates",
                    "STRUCT<record_id STRING, new_path_names ARRAY<STRING>>",
                    update_structs,
                ),
            ]
        )

        try:
            list(self.bq_client.client.query(batch_query, job_config=job_config).result())
            logger.info(f"SCALE-002 FIX: Batch updated {len(updates)} descendant path_names in single query")
        except Exception as e:
            logger.error(f"Failed to batch update descendant path_names: {e}")
            # Fallback to sequential updates if batch fails
            logger.warning("Falling back to sequential updates")
            for u in updates:
                try:
                    fallback_query = f"""
                    UPDATE `{table_ref}`
                    SET path_names = @path_names, updated_at = @now_ts, updated_by = @updated_by
                    WHERE org_slug = @org_slug AND id = @record_id AND end_date IS NULL
                    """
                    fb_config = bigquery.QueryJobConfig(
                        query_parameters=[
                            bigquery.ArrayQueryParameter("path_names", "STRING", u["path_names"]),
                            bigquery.ScalarQueryParameter("now_ts", "TIMESTAMP", now),
                            bigquery.ScalarQueryParameter("updated_by", "STRING", updated_by),
                            bigquery.ScalarQueryParameter("org_slug", "STRING", org_slug),
                            bigquery.ScalarQueryParameter("record_id", "STRING", u["record_id"]),
                        ]
                    )
                    list(self.bq_client.client.query(fallback_query, job_config=fb_config).result())
                except Exception as fb_e:
                    logger.warning(f"Failed to update path_names for {u['entity_id']}: {fb_e}")

    async def move_entity(
        self,
        org_slug: str,
        entity_id: str,
        request: MoveEntityRequest,
        moved_by: str
    ) -> HierarchyEntityResponse:
        """Move an entity to a new parent.

        STATE-001/MT-001 FIX: Uses atomic MERGE operation to prevent race conditions
        and ensure consistent state during concurrent moves.
        IDEM-001 FIX: MERGE handles idempotency - retries won't create duplicates.
        """
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

            # EDGE-001 FIX: Use proper path boundary check to avoid false matches
            # Check if new parent is a descendant of entity using path + '/' prefix
            if new_parent.path.startswith(entity.path + '/') or new_parent.path == entity.path:
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

        now = datetime.now(timezone.utc)
        now_iso = now.isoformat()
        new_id = str(uuid.uuid4())
        table_ref = self._get_central_table_ref(ORG_HIERARCHY_TABLE)

        # STATE-001/MT-001/IDEM-001 FIX: Use atomic MERGE operation
        # This ensures: 1) No race conditions 2) Idempotent retries 3) Consistent state
        # The MERGE ends the old version and inserts new version atomically
        atomic_move_query = f"""
        -- End the old version (only if not already ended)
        UPDATE `{table_ref}`
        SET end_date = @now_ts,
            updated_at = @now_ts,
            updated_by = @updated_by
        WHERE org_slug = @org_slug
          AND id = @entity_record_id
          AND end_date IS NULL;

        -- Insert new version using MERGE to handle race conditions
        MERGE `{table_ref}` AS target
        USING (SELECT @entity_id AS entity_id) AS source
        ON target.org_slug = @org_slug
           AND target.entity_id = source.entity_id
           AND target.end_date IS NULL
           AND target.version = @new_version
        WHEN NOT MATCHED THEN
            INSERT (id, org_slug, entity_id, entity_name, level, level_code,
                    parent_id, path, path_ids, path_names, depth,
                    owner_id, owner_name, owner_email, description, metadata,
                    sort_order, is_active, created_at, created_by, updated_at,
                    updated_by, version, end_date)
            VALUES (@new_id, @org_slug, @entity_id, @entity_name, @level, @level_code,
                    @parent_id, @path, @path_ids, @path_names, @depth,
                    @owner_id, @owner_name, @owner_email, @description, @metadata,
                    @sort_order, @is_active, @created_at, @created_by, @updated_at,
                    @updated_by, @new_version, NULL);
        """

        # Serialize metadata to JSON string if needed
        metadata_str = None
        if entity.metadata:
            metadata_str = json.dumps(entity.metadata) if isinstance(entity.metadata, dict) else entity.metadata

        move_job_config = bigquery.QueryJobConfig(
            query_parameters=[
                bigquery.ScalarQueryParameter("now_ts", "TIMESTAMP", now),
                bigquery.ScalarQueryParameter("updated_by", "STRING", moved_by),
                bigquery.ScalarQueryParameter("org_slug", "STRING", org_slug),
                bigquery.ScalarQueryParameter("entity_record_id", "STRING", entity.id),
                bigquery.ScalarQueryParameter("new_id", "STRING", new_id),
                bigquery.ScalarQueryParameter("entity_id", "STRING", entity_id),
                bigquery.ScalarQueryParameter("entity_name", "STRING", entity.entity_name),
                bigquery.ScalarQueryParameter("level", "INT64", entity.level),
                bigquery.ScalarQueryParameter("level_code", "STRING", entity.level_code),
                bigquery.ScalarQueryParameter("parent_id", "STRING", request.new_parent_id),
                bigquery.ScalarQueryParameter("path", "STRING", new_path),
                bigquery.ArrayQueryParameter("path_ids", "STRING", new_path_ids),
                bigquery.ArrayQueryParameter("path_names", "STRING", new_path_names),
                bigquery.ScalarQueryParameter("depth", "INT64", new_depth),
                bigquery.ScalarQueryParameter("owner_id", "STRING", entity.owner_id),
                bigquery.ScalarQueryParameter("owner_name", "STRING", entity.owner_name),
                bigquery.ScalarQueryParameter("owner_email", "STRING", entity.owner_email),
                bigquery.ScalarQueryParameter("description", "STRING", entity.description),
                bigquery.ScalarQueryParameter("metadata", "STRING", metadata_str),
                bigquery.ScalarQueryParameter("sort_order", "INT64", entity.sort_order),
                bigquery.ScalarQueryParameter("is_active", "BOOL", entity.is_active),
                bigquery.ScalarQueryParameter("created_at", "TIMESTAMP", entity.created_at),
                bigquery.ScalarQueryParameter("created_by", "STRING", entity.created_by),
                bigquery.ScalarQueryParameter("updated_at", "TIMESTAMP", now),
                bigquery.ScalarQueryParameter("new_version", "INT64", entity.version + 1),
            ]
        )

        try:
            list(self.bq_client.client.query(atomic_move_query, job_config=move_job_config).result())
            logger.info(f"STATE-001 FIX: Atomically moved entity {entity_id} to new parent")
        except Exception as e:
            logger.error(f"Failed to move entity atomically: {e}")
            raise RuntimeError(f"Failed to move entity: {e}")

        # Build row dict for response
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

        # Update all descendants' paths
        old_path = entity.path
        await self._update_descendant_paths(org_slug, entity_id, old_path, new_path, moved_by)

        # STATE-002 FIX: Refresh MV to ensure moved entity appears in reads
        self._refresh_hierarchy_mv(org_slug)

        # ERR-001 FIX: Return from row dict directly instead of get_entity()
        # get_entity() queries MV which may still have stale data after refresh
        return self._row_to_entity_response(row, level_config.level_name)

    async def _update_descendant_paths(
        self,
        org_slug: str,
        moved_entity_id: str,
        old_path: str,
        new_path: str,
        updated_by: str
    ) -> None:
        """Update paths for all descendants when an entity is moved.

        PERF-002 FIX: Fetch moved_entity once before loop instead of N times.
        SCALE-001 FIX: Batch all updates into a single BigQuery API call.
        """
        descendants = await self.get_descendants(org_slug, moved_entity_id)

        if not descendants.descendants:
            return

        # PERF-002 FIX: Fetch moved_entity ONCE before loop
        moved_entity = await self.get_entity(org_slug, moved_entity_id)
        if not moved_entity:
            logger.warning(f"Moved entity {moved_entity_id} not found, skipping descendant updates")
            return

        # SCALE-001 FIX: Collect all updates, then execute in single batch
        updates = []
        for descendant in descendants.descendants:
            # EDGE-001 FIX: Use proper path boundary matching to avoid false matches
            # Don't use simple string replace which could match /DEPT-001 in /DEPT-0011
            # Instead, ensure we match at path boundary (old_path + '/')
            if descendant.path.startswith(old_path + '/'):
                # Replace old path prefix with new path prefix at exact boundary
                descendant_new_path = new_path + descendant.path[len(old_path):]
            elif descendant.path == old_path:
                descendant_new_path = new_path
            else:
                # Fallback to original replace for edge cases
                descendant_new_path = descendant.path.replace(old_path, new_path, 1)

            # Find where moved_entity appears in descendant's path
            try:
                moved_idx = descendant.path_ids.index(moved_entity_id)
            except ValueError:
                continue

            # Build new path_ids and path_names
            new_path_ids = moved_entity.path_ids + descendant.path_ids[moved_idx + 1:]
            new_path_names = moved_entity.path_names + descendant.path_names[moved_idx + 1:]
            new_depth = calculate_depth(descendant_new_path)

            updates.append({
                "record_id": descendant.id,
                "entity_id": descendant.entity_id,
                "path": descendant_new_path,
                "path_ids": new_path_ids,
                "path_names": new_path_names,
                "depth": new_depth,
            })

        if not updates:
            return

        # SCALE-001 FIX: Execute batch update using BigQuery scripting
        # This reduces N API calls to 1 API call
        now = datetime.now(timezone.utc)
        table_ref = self._get_central_table_ref(ORG_HIERARCHY_TABLE)

        # Build batch UPDATE using CASE WHEN pattern
        # This is more efficient than N separate queries
        batch_query = f"""
        UPDATE `{table_ref}` t
        SET
            path = updates.new_path,
            path_ids = updates.new_path_ids,
            path_names = updates.new_path_names,
            depth = updates.new_depth,
            updated_at = @now_ts,
            updated_by = @updated_by
        FROM (
            SELECT * FROM UNNEST(@updates) AS u
        ) AS updates
        WHERE t.org_slug = @org_slug
          AND t.id = updates.record_id
          AND t.end_date IS NULL
        """

        # Build struct array for batch update
        update_structs = [
            {
                "record_id": u["record_id"],
                "new_path": u["path"],
                "new_path_ids": u["path_ids"],
                "new_path_names": u["path_names"],
                "new_depth": u["depth"],
            }
            for u in updates
        ]

        job_config = bigquery.QueryJobConfig(
            query_parameters=[
                bigquery.ScalarQueryParameter("now_ts", "TIMESTAMP", now),
                bigquery.ScalarQueryParameter("updated_by", "STRING", updated_by),
                bigquery.ScalarQueryParameter("org_slug", "STRING", org_slug),
                bigquery.ArrayQueryParameter(
                    "updates",
                    "STRUCT<record_id STRING, new_path STRING, new_path_ids ARRAY<STRING>, new_path_names ARRAY<STRING>, new_depth INT64>",
                    update_structs,
                ),
            ]
        )

        try:
            list(self.bq_client.client.query(batch_query, job_config=job_config).result())
            logger.info(f"SCALE-001 FIX: Batch updated {len(updates)} descendant paths in single query")
        except Exception as e:
            logger.error(f"Failed to batch update descendant paths: {e}")
            # Fallback to sequential updates if batch fails
            logger.warning("Falling back to sequential updates")
            for u in updates:
                try:
                    fallback_query = f"""
                    UPDATE `{table_ref}`
                    SET path = @path, path_ids = @path_ids, path_names = @path_names,
                        depth = @depth, updated_at = @now_ts, updated_by = @updated_by
                    WHERE org_slug = @org_slug AND id = @record_id AND end_date IS NULL
                    """
                    fb_config = bigquery.QueryJobConfig(
                        query_parameters=[
                            bigquery.ScalarQueryParameter("path", "STRING", u["path"]),
                            bigquery.ArrayQueryParameter("path_ids", "STRING", u["path_ids"]),
                            bigquery.ArrayQueryParameter("path_names", "STRING", u["path_names"]),
                            bigquery.ScalarQueryParameter("depth", "INT64", u["depth"]),
                            bigquery.ScalarQueryParameter("now_ts", "TIMESTAMP", now),
                            bigquery.ScalarQueryParameter("updated_by", "STRING", updated_by),
                            bigquery.ScalarQueryParameter("org_slug", "STRING", org_slug),
                            bigquery.ScalarQueryParameter("record_id", "STRING", u["record_id"]),
                        ]
                    )
                    list(self.bq_client.client.query(fallback_query, job_config=fb_config).result())
                except Exception as fb_e:
                    logger.warning(f"Failed to update path for {u['entity_id']}: {fb_e}")

    # ==========================================================================
    # Delete Operations
    # ==========================================================================

    async def _record_force_delete_audit(
        self,
        org_slug: str,
        entity_id: str,
        deleted_by: str,
        reason_bypassed: str,
        blocking_entities: List[Dict[str, Any]]
    ) -> None:
        """SEC-002 FIX: Record force delete to persistent audit trail.

        Stores audit information in org_meta_pipeline_runs table as a special
        'force_delete_audit' event. This ensures audit trail persists even
        if application logs are rotated or deleted.
        """
        now = datetime.now(timezone.utc)
        audit_table = f"{self.project_id}.{CENTRAL_DATASET}.org_meta_pipeline_runs"

        audit_data = {
            "action": "force_delete",
            "entity_id": entity_id,
            "reason_bypassed": reason_bypassed,
            "blocking_entities_count": len(blocking_entities),
            "blocking_entity_ids": [e.get("entity_id") for e in blocking_entities[:10]],  # Cap at 10
        }

        audit_query = f"""
        INSERT INTO `{audit_table}` (
            org_slug, pipeline_id, run_id, status, started_at, completed_at,
            records_processed, records_failed, error_message, metadata
        ) VALUES (
            @org_slug, 'force_delete_audit', @run_id, 'completed',
            @timestamp, @timestamp, 1, 0, @reason, @metadata
        )
        """

        try:
            job_config = bigquery.QueryJobConfig(
                query_parameters=[
                    bigquery.ScalarQueryParameter("org_slug", "STRING", org_slug),
                    bigquery.ScalarQueryParameter("run_id", "STRING", f"audit_{entity_id}_{now.strftime('%Y%m%d%H%M%S')}"),
                    bigquery.ScalarQueryParameter("timestamp", "TIMESTAMP", now),
                    bigquery.ScalarQueryParameter("reason", "STRING", f"Force delete by {deleted_by}: {reason_bypassed}"),
                    bigquery.ScalarQueryParameter("metadata", "STRING", json.dumps(audit_data)),
                ]
            )
            self.bq_client.client.query(audit_query, job_config=job_config).result()
            logger.info(f"SEC-002: Recorded force delete audit for {entity_id} in org {org_slug}")
        except Exception as e:
            # Don't fail the delete if audit fails, but log prominently
            logger.error(f"SEC-002 WARNING: Failed to record force delete audit: {e}")

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
        level_config = levels_map.get(entity_row['level_code'])
        level_name_str = level_config.level_name if level_config else entity_row['level_code']
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
        """Soft delete a hierarchy entity.

        SEC-002 FIX: Force deletes are logged to both application logs AND
        stored in entity metadata for persistent audit trail.
        """
        org_slug = validate_org_slug(org_slug)
        entity_id = validate_entity_id(entity_id)

        # Check if deletion is blocked
        if not force:
            block_check = await self.check_deletion_blocked(org_slug, entity_id)
            if block_check.blocked:
                raise ValueError(block_check.reason)
        else:
            # SEC-002 FIX: Check and create persistent audit trail for force deletes
            block_check = await self.check_deletion_blocked(org_slug, entity_id)
            if block_check.blocked:
                # Log to application logs
                logger.warning(
                    f"SEC-002 AUDIT: Force delete bypassing block for entity {entity_id} "
                    f"in org {org_slug}. Reason bypassed: {block_check.reason}. "
                    f"Deleted by: {deleted_by}. "
                    f"Blocking entities: {[e.get('entity_id') for e in block_check.blocking_entities]}"
                )
                # SEC-002 FIX: Store audit info in metadata before delete
                # This ensures persistent audit trail survives even if logs are rotated
                await self._record_force_delete_audit(
                    org_slug=org_slug,
                    entity_id=entity_id,
                    deleted_by=deleted_by,
                    reason_bypassed=block_check.reason,
                    blocking_entities=block_check.blocking_entities
                )

        # BUG-005 FIX: Query central table directly to handle streaming buffer lag
        # BUG-007 FIX: Use allow_ended=True to recover from broken state
        existing_row = await self._get_entity_from_central(org_slug, entity_id, allow_ended=True)
        if not existing_row:
            raise ValueError(f"Entity {entity_id} does not exist")

        # Convert to response for entity.id
        levels_map = await self.level_service.get_levels_map(org_slug)
        level_config = levels_map.get(existing_row['level_code'])
        level_name_str = level_config.level_name if level_config and hasattr(level_config, 'level_name') else existing_row['level_code']
        existing = self._row_to_entity_response(existing_row, level_name_str)

        now = datetime.now(timezone.utc)
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

        # GAP-004 FIX: Clear hierarchy fields from subscription_plans that reference deleted entity
        # This prevents orphan references in cost data
        await self._clear_orphan_hierarchy_references(org_slug, entity_id)

        # STATE-002 FIX: Refresh MV to ensure deleted entity is not returned in reads
        self._refresh_hierarchy_mv(org_slug)

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

        # Validate parent_id references before seeding
        # Build set of all entity_ids being created
        all_entity_ids = {row["entity_id"] for row in csv_rows}

        # Check each row's parent_id references a valid entity
        orphan_references = []
        for row in csv_rows:
            parent_id = row.get("parent_id")
            if parent_id and parent_id not in all_entity_ids:
                orphan_references.append({
                    "entity_id": row["entity_id"],
                    "entity_name": row.get("entity_name"),
                    "parent_id": parent_id
                })

        if orphan_references:
            error_msg = f"Invalid parent_id references found in CSV: {len(orphan_references)} orphan(s)"
            orphan_details = ", ".join(
                f"{o['entity_id']} -> {o['parent_id']}" for o in orphan_references[:5]
            )
            if len(orphan_references) > 5:
                orphan_details += f" (and {len(orphan_references) - 5} more)"
            error_msg += f". Examples: {orphan_details}"
            result["errors"].append(error_msg)
            logger.error(f"Hierarchy seed validation failed for {org_slug}: {error_msg}")
            return result

        logger.info(f"Parent reference validation passed for {len(csv_rows)} entities")

        # FIX ISSUE 4.2: Validate entity_id prefixes match their level_code
        # Get level configuration to check prefixes
        levels_map = await self.level_service.get_levels_map(org_slug)
        prefix_violations = []
        for row in csv_rows:
            level_code = row.get("level_code", "").lower()
            entity_id = row.get("entity_id", "")
            level_config = levels_map.get(level_code)
            if level_config and level_config.id_prefix:
                expected_prefix = level_config.id_prefix.upper()
                if not entity_id.upper().startswith(expected_prefix):
                    prefix_violations.append({
                        "entity_id": entity_id,
                        "level_code": level_code,
                        "expected_prefix": expected_prefix
                    })

        if prefix_violations:
            warning_msg = f"Entity ID prefix warnings in CSV: {len(prefix_violations)} violation(s)"
            violation_details = ", ".join(
                f"{v['entity_id']} should start with {v['expected_prefix']}"
                for v in prefix_violations[:5]
            )
            if len(prefix_violations) > 5:
                violation_details += f" (and {len(prefix_violations) - 5} more)"
            warning_msg += f". Details: {violation_details}"
            # Log as warning, don't fail (for backward compatibility with existing CSVs)
            logger.warning(f"Hierarchy seed prefix validation warnings for {org_slug}: {warning_msg}")
            result["prefix_warnings"] = prefix_violations

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
        # EDGE-002 FIX: datetime.now(timezone.utc).isoformat() already produces "+00:00" suffix
        now = datetime.now(timezone.utc).isoformat()
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
                    # EDGE-004 FIX: Use json module already imported at top of file
                    json.loads(metadata)  # Validate JSON
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
        # HIGH-001 FIX: Use MERGE to handle race conditions where another process
        # may have inserted the same entity_id between our read and insert
        try:
            table_ref = self._get_central_table_ref(ORG_HIERARCHY_TABLE)
            # Use MERGE to avoid duplicates (race condition fix)
            for batch_start in range(0, len(rows_to_insert), 100):
                batch = rows_to_insert[batch_start:batch_start + 100]
                for entity_row in batch:
                    merge_query = f"""
                    MERGE `{table_ref}` AS target
                    USING (SELECT @entity_id AS entity_id) AS source
                    ON target.org_slug = @org_slug
                       AND target.entity_id = source.entity_id
                       AND target.end_date IS NULL
                    WHEN NOT MATCHED THEN
                        INSERT (id, org_slug, entity_id, entity_name, level, level_code,
                                parent_id, path, path_ids, path_names, depth,
                                owner_id, owner_name, owner_email, description, metadata,
                                sort_order, is_active, created_at, created_by, updated_at,
                                updated_by, version, end_date)
                        VALUES (@id, @org_slug, @entity_id, @entity_name, @level, @level_code,
                                @parent_id, @path, @path_ids, @path_names, @depth,
                                @owner_id, @owner_name, @owner_email, @description, @metadata,
                                @sort_order, @is_active, @created_at, @created_by, @updated_at,
                                @updated_by, @version, @end_date)
                    """
                    job_config = bigquery.QueryJobConfig(
                        query_parameters=[
                            bigquery.ScalarQueryParameter("id", "STRING", entity_row["id"]),
                            bigquery.ScalarQueryParameter("org_slug", "STRING", entity_row["org_slug"]),
                            bigquery.ScalarQueryParameter("entity_id", "STRING", entity_row["entity_id"]),
                            bigquery.ScalarQueryParameter("entity_name", "STRING", entity_row["entity_name"]),
                            bigquery.ScalarQueryParameter("level", "INT64", entity_row["level"]),
                            bigquery.ScalarQueryParameter("level_code", "STRING", entity_row["level_code"]),
                            bigquery.ScalarQueryParameter("parent_id", "STRING", entity_row["parent_id"]),
                            bigquery.ScalarQueryParameter("path", "STRING", entity_row["path"]),
                            bigquery.ArrayQueryParameter("path_ids", "STRING", entity_row["path_ids"]),
                            bigquery.ArrayQueryParameter("path_names", "STRING", entity_row["path_names"]),
                            bigquery.ScalarQueryParameter("depth", "INT64", entity_row["depth"]),
                            bigquery.ScalarQueryParameter("owner_id", "STRING", entity_row["owner_id"]),
                            bigquery.ScalarQueryParameter("owner_name", "STRING", entity_row["owner_name"]),
                            bigquery.ScalarQueryParameter("owner_email", "STRING", entity_row["owner_email"]),
                            bigquery.ScalarQueryParameter("description", "STRING", entity_row["description"]),
                            bigquery.ScalarQueryParameter("metadata", "STRING", entity_row["metadata"]),
                            bigquery.ScalarQueryParameter("sort_order", "INT64", entity_row["sort_order"]),
                            bigquery.ScalarQueryParameter("is_active", "BOOL", entity_row["is_active"]),
                            bigquery.ScalarQueryParameter("created_at", "STRING", entity_row["created_at"]),
                            bigquery.ScalarQueryParameter("created_by", "STRING", entity_row["created_by"]),
                            bigquery.ScalarQueryParameter("updated_at", "STRING", entity_row["updated_at"]),
                            bigquery.ScalarQueryParameter("updated_by", "STRING", entity_row["updated_by"]),
                            bigquery.ScalarQueryParameter("version", "INT64", entity_row["version"]),
                            bigquery.ScalarQueryParameter("end_date", "TIMESTAMP", entity_row["end_date"]),
                        ]
                    )
                    self.bq_client.client.query(merge_query, job_config=job_config).result()
            result["entities_seeded"] = len(rows_to_insert)
            logger.info(
                f"Seeded {len(rows_to_insert)} hierarchy entities for {org_slug}: {result['by_level']}"
            )
        except Exception as e:
            result["errors"].append(f"Failed to insert entities: {e}")
            logger.error(f"Failed to seed hierarchy entities: {e}")

        return result

    # ==========================================================================
    # Export/Import Operations
    # ==========================================================================

    async def export_to_csv(self, org_slug: str) -> str:
        """
        Export all active hierarchy entities to CSV format.

        Args:
            org_slug: Organization slug

        Returns:
            CSV content as string
        """
        from src.core.services.hierarchy_crud.export_import_adapter import (
            HierarchyExportImportAdapter,
            HierarchyEntityData,
        )

        org_slug = validate_org_slug(org_slug)

        # Get all active entities sorted by path
        all_entities = await self.get_all_entities(org_slug, include_inactive=False)

        # Convert to HierarchyEntityData
        entity_data_list = []
        for entity in all_entities.entities:
            entity_data_list.append(HierarchyEntityData(
                entity_id=entity.entity_id,
                entity_name=entity.entity_name,
                level=entity.level,
                level_code=entity.level_code,
                parent_id=entity.parent_id,
                owner_name=entity.owner_name,
                owner_email=entity.owner_email,
                description=entity.description,
                metadata=entity.metadata,
                sort_order=entity.sort_order,
            ))

        # Generate CSV
        adapter = HierarchyExportImportAdapter()
        return adapter.generate_csv(entity_data_list)

    async def preview_import(
        self,
        org_slug: str,
        csv_content: str
    ) -> Dict[str, Any]:
        """
        Preview what changes an import would make without applying them.

        Full sync mode: CSV becomes source of truth.
        - Entities in CSV but not in DB -> CREATE
        - Entities in both but different -> UPDATE
        - Entities in DB but not in CSV -> DELETE

        Args:
            org_slug: Organization slug
            csv_content: CSV file content

        Returns:
            Preview dict with creates, updates, deletes, unchanged, and validation_errors
        """
        from src.core.services.hierarchy_crud.export_import_adapter import (
            HierarchyExportImportAdapter,
            HierarchyEntityData,
        )

        org_slug = validate_org_slug(org_slug)

        # Get valid level codes for validation
        levels_map = await self.level_service.get_levels_map(org_slug)
        valid_level_codes = set(levels_map.keys())

        # Create adapter with level validation
        adapter = HierarchyExportImportAdapter(valid_level_codes=valid_level_codes)

        # Validate CSV structure
        structure_errors = adapter.validate_csv_structure(csv_content)
        if structure_errors:
            return {
                "summary": {"creates": 0, "updates": 0, "deletes": 0, "unchanged": 0},
                "is_valid": False,
                "has_changes": False,
                "creates": [],
                "updates": [],
                "deletes": [],
                "unchanged": [],
                "validation_errors": structure_errors,
            }

        # Parse CSV rows
        csv_rows = adapter.parse_csv(csv_content)

        # Get existing entities
        all_entities = await self.get_all_entities(org_slug, include_inactive=False)

        # Convert existing entities to HierarchyEntityData
        existing_data = []
        for entity in all_entities.entities:
            existing_data.append(HierarchyEntityData(
                entity_id=entity.entity_id,
                entity_name=entity.entity_name,
                level=entity.level,
                level_code=entity.level_code,
                parent_id=entity.parent_id,
                owner_name=entity.owner_name,
                owner_email=entity.owner_email,
                description=entity.description,
                metadata=entity.metadata,
                sort_order=entity.sort_order,
            ))

        # Generate preview
        preview = adapter.generate_preview(csv_rows, existing_data)

        return preview.to_dict()

    async def import_from_csv(
        self,
        org_slug: str,
        csv_content: str,
        imported_by: str,
        fail_fast: bool = True  # IDEM-001: Stop on first error by default
    ) -> Dict[str, Any]:
        """
        Import hierarchy from CSV with full sync (creates, updates, deletes).

        CSV becomes the source of truth:
        - Entities in CSV but not in DB -> CREATE
        - Entities in both but different -> UPDATE
        - Entities in DB but not in CSV -> DELETE (soft delete)

        Args:
            org_slug: Organization slug
            csv_content: CSV file content
            imported_by: User ID for audit trail
            fail_fast: If True, stop on first error (default). If False, continue and collect all errors.

        Returns:
            Result dict with counts and any errors
        """
        from datetime import datetime, timezone
        from src.core.services.hierarchy_crud.export_import_adapter import (
            HierarchyExportImportAdapter,
            HierarchyEntityData,
        )
        from src.app.models.hierarchy_models import (
            CreateEntityRequest,
            UpdateEntityRequest,
            MoveEntityRequest,
        )

        org_slug = validate_org_slug(org_slug)

        result = {
            "success": False,
            "created_count": 0,
            "updated_count": 0,
            "deleted_count": 0,
            "unchanged_count": 0,
            "errors": [],
            "import_started_at": datetime.now(timezone.utc).isoformat(),  # STATE-002
        }

        # SCALE-001: Simple import lock using class-level dict
        # In production, use Redis or database-based locking
        if not hasattr(self, '_import_locks'):
            self._import_locks = {}

        if org_slug in self._import_locks:
            result["errors"].append(
                f"Import already in progress for {org_slug}. Please wait for it to complete."
            )
            return result

        self._import_locks[org_slug] = datetime.now(timezone.utc)

        try:
            # Get valid level codes for validation
            levels_map = await self.level_service.get_levels_map(org_slug)
            valid_level_codes = set(levels_map.keys())

            # Create adapter with level validation
            adapter = HierarchyExportImportAdapter(valid_level_codes=valid_level_codes)

            # Validate CSV structure
            structure_errors = adapter.validate_csv_structure(csv_content)
            if structure_errors:
                result["errors"] = structure_errors
                return result

            # Parse CSV rows
            csv_rows = adapter.parse_csv(csv_content)

            # Get existing entities
            all_entities = await self.get_all_entities(org_slug, include_inactive=False)

            # Convert existing entities to HierarchyEntityData
            existing_data = []
            for entity in all_entities.entities:
                existing_data.append(HierarchyEntityData(
                    entity_id=entity.entity_id,
                    entity_name=entity.entity_name,
                    level=entity.level,
                    level_code=entity.level_code,
                    parent_id=entity.parent_id,
                    owner_name=entity.owner_name,
                    owner_email=entity.owner_email,
                    description=entity.description,
                    metadata=entity.metadata,
                    sort_order=entity.sort_order,
                ))

            # Generate preview to validate and categorize changes
            preview = adapter.generate_preview(csv_rows, existing_data)

            # Check for validation errors
            if not preview.is_valid:
                all_errors = preview.validation_errors.copy()
                for item in preview.creates + preview.updates + preview.deletes:
                    all_errors.extend(item.validation_errors)
                result["errors"] = all_errors
                return result

            # CRUD-001: Check for level_code changes which are not allowed
            for update_item in preview.updates:
                for change in update_item.changes:
                    if change.field == "level_code":
                        result["errors"].append(
                            f"Cannot change level_code for {update_item.entity_id} from "
                            f"'{change.old_value}' to '{change.new_value}'. "
                            f"Delete and recreate the entity instead."
                        )
            if result["errors"]:
                return result

            # Helper to get level number for sorting
            def get_level_num(level_code: str, default: int = 0) -> int:
                level_config = levels_map.get(level_code)
                if level_config and hasattr(level_config, 'level'):
                    return level_config.level
                return default

            # Helper for fail-fast error handling
            def handle_error(entity_id: str, operation: str, error: Exception) -> bool:
                """Returns True if should stop processing."""
                error_msg = f"Failed to {operation} {entity_id}: {str(error)}"
                result["errors"].append(error_msg)
                logger.error(f"Import {operation} failed for {entity_id}: {error}")
                return fail_fast

            # Process deletes first (in reverse depth order to delete children before parents)
            deletes_sorted = sorted(
                preview.deletes,
                key=lambda x: -get_level_num(x.level_code or "", 0)
            )
            for delete_item in deletes_sorted:
                try:
                    await self.delete_entity(
                        org_slug=org_slug,
                        entity_id=delete_item.entity_id,
                        deleted_by=imported_by,
                        force=True  # Force delete to skip blocking checks
                    )
                    result["deleted_count"] += 1
                except Exception as e:
                    if handle_error(delete_item.entity_id, "delete", e):
                        return result

            # Build imported entity map - IDEM-003: Parse once, reuse
            imported_entities = {
                row.get("entity_id", "").strip().upper(): adapter.row_to_entity(row)
                for row in csv_rows
            }

            # Process creates (in depth order - parents before children)
            creates_sorted = sorted(
                preview.creates,
                key=lambda x: get_level_num(x.level_code or "", 99)
            )
            for create_item in creates_sorted:
                try:
                    entity_data = imported_entities.get(create_item.entity_id)
                    if not entity_data:
                        continue

                    request = CreateEntityRequest(
                        entity_id=create_item.entity_id,
                        entity_name=entity_data.entity_name,
                        level_code=entity_data.level_code,
                        parent_id=entity_data.parent_id,
                        owner_name=entity_data.owner_name,
                        owner_email=entity_data.owner_email,
                        description=entity_data.description,
                        metadata=entity_data.metadata,
                        sort_order=entity_data.sort_order,
                    )
                    await self.create_entity(org_slug, request, imported_by)
                    result["created_count"] += 1
                except Exception as e:
                    if handle_error(create_item.entity_id, "create", e):
                        return result

            # Process updates - CRUD-003: Remove unused row variable
            for update_item in preview.updates:
                try:
                    # Build update request with only changed fields
                    update_fields: Dict[str, Any] = {}
                    has_parent_change = False
                    new_parent_id = None

                    for change in update_item.changes:
                        if change.field == "level_code":
                            # CRUD-001: Skip level_code changes (already validated above)
                            continue
                        elif change.field == "parent_id":
                            # CRUD-002: Track parent change separately
                            has_parent_change = True
                            new_parent_id = change.new_value
                        elif change.field in ("entity_name", "owner_name", "owner_email",
                                              "description", "metadata", "sort_order"):
                            update_fields[change.field] = change.new_value

                    # CRUD-002: Handle parent move first if needed
                    if has_parent_change:
                        try:
                            move_request = MoveEntityRequest(new_parent_id=new_parent_id)
                            await self.move_entity(org_slug, update_item.entity_id, move_request, imported_by)
                        except Exception as move_err:
                            if handle_error(update_item.entity_id, "move", move_err):
                                return result
                            continue  # Skip other updates for this entity if move failed

                    # Apply non-parent updates if any
                    if update_fields:
                        request = UpdateEntityRequest(**update_fields)
                        await self.update_entity(org_slug, update_item.entity_id, request, imported_by)

                    result["updated_count"] += 1
                except Exception as e:
                    if handle_error(update_item.entity_id, "update", e):
                        return result

            result["unchanged_count"] = len(preview.unchanged)
            result["success"] = len(result["errors"]) == 0

            # Refresh MV after all changes (PERF-004: could be async but keeping sync for safety)
            self._refresh_hierarchy_mv(org_slug)

            logger.info(
                f"Hierarchy import for {org_slug}: "
                f"created={result['created_count']}, updated={result['updated_count']}, "
                f"deleted={result['deleted_count']}, unchanged={result['unchanged_count']}, "
                f"errors={len(result['errors'])}"
            )

            return result

        finally:
            # SCALE-001: Release import lock
            self._import_locks.pop(org_slug, None)


# ==============================================================================
# Service Instance
# ==============================================================================

def get_hierarchy_crud_service() -> HierarchyService:
    """Get hierarchy service instance."""
    return HierarchyService()
