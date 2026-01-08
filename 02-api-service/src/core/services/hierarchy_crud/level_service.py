"""
Hierarchy Level Configuration Service.

Manages hierarchy level definitions (e.g., Department -> Project -> Team).
Each organization can configure their own hierarchy structure.
"""

import logging
import re
import uuid
from datetime import datetime
from typing import Optional, Dict, Any, List

from google.cloud import bigquery
import google.api_core.exceptions

from src.core.engine.bq_client import BigQueryClient, get_bigquery_client
from src.app.config import get_settings
from src.app.models.hierarchy_models import (
    CreateLevelRequest,
    UpdateLevelRequest,
    HierarchyLevelResponse,
    HierarchyLevelsListResponse,
)

logger = logging.getLogger(__name__)
settings = get_settings()

# Validation patterns
ORG_SLUG_PATTERN = re.compile(r'^[a-zA-Z0-9_]{3,50}$')

# Table names
HIERARCHY_LEVELS_TABLE = "org_hierarchy_levels"
CENTRAL_DATASET = "organizations"

# Default levels to seed for new organizations
# Based on FinOps Foundation enterprise structure for large organizations
#
# STANDARD HIERARCHY STRUCTURE (N-Level Configurable):
# ┌─────────────────────────────────────────────────────────────────┐
# │  Level 1: Department (DEPT-)  - C-Suite / Executive             │
# │  Level 2: Project (PROJ-)     - Business Units / Cost Centers   │
# │  Level 3: Team (TEAM-)        - Functions / Teams               │
# └─────────────────────────────────────────────────────────────────┘
#
# Entity ID Format: {PREFIX}{CODE}
# Examples: DEPT-CFO, PROJ-ENGINEERING, TEAM-PLATFORM
#
DEFAULT_LEVELS = [
    {
        "level": 1,
        "level_code": "department",
        "level_name": "Department",
        "level_name_plural": "Departments",
        "parent_level": None,
        "is_required": False,
        "is_leaf": False,
        "max_children": None,
        "id_prefix": "DEPT-",
        "id_auto_generate": False,
        "metadata_schema": None,
        "display_order": 1,
        "icon": "building-2",
        "color": "#0D4D56",  # Dark teal - executive level
    },
    {
        "level": 2,
        "level_code": "project",
        "level_name": "Project",
        "level_name_plural": "Projects",
        "parent_level": 1,
        "is_required": True,
        "is_leaf": False,
        "max_children": None,
        "id_prefix": "PROJ-",
        "id_auto_generate": False,
        "metadata_schema": None,
        "display_order": 2,
        "icon": "folder-kanban",
        "color": "#1A9FB2",  # Teal - project/BU level
    },
    {
        "level": 3,
        "level_code": "team",
        "level_name": "Team",
        "level_name_plural": "Teams",
        "parent_level": 2,
        "is_required": True,
        "is_leaf": True,
        "max_children": None,
        "id_prefix": "TEAM-",
        "id_auto_generate": False,
        "metadata_schema": None,
        "display_order": 3,
        "icon": "users",
        "color": "#90FCA6",  # Mint - team level
    },
]


def validate_org_slug(org_slug: str) -> str:
    """Validate and sanitize org_slug."""
    if not org_slug or not ORG_SLUG_PATTERN.match(org_slug):
        raise ValueError(f"Invalid organization identifier format: {org_slug}")
    return org_slug


class HierarchyLevelService:
    """Service for managing hierarchy level configuration."""

    def __init__(self, bq_client: Optional[BigQueryClient] = None):
        """Initialize with optional BigQuery client."""
        self.bq_client = bq_client or get_bigquery_client()
        self.project_id = settings.gcp_project_id

    def _get_central_table_ref(self, table_name: str) -> str:
        """Get fully qualified table reference for central dataset."""
        return f"{self.project_id}.{CENTRAL_DATASET}.{table_name}"

    def _insert_to_central_table(self, table_name: str, rows: List[Dict[str, Any]]) -> None:
        """Insert rows into central dataset table."""
        table_id = self._get_central_table_ref(table_name)
        errors = self.bq_client.client.insert_rows_json(table_id, rows)
        if errors:
            raise ValueError(f"Failed to insert rows into {table_id}: {errors}")

    # ==========================================================================
    # Read Operations
    # ==========================================================================

    async def get_levels(
        self,
        org_slug: str,
        include_inactive: bool = False
    ) -> HierarchyLevelsListResponse:
        """Get all hierarchy levels for an organization."""
        org_slug = validate_org_slug(org_slug)
        table_ref = self._get_central_table_ref(HIERARCHY_LEVELS_TABLE)

        query_params = [
            bigquery.ScalarQueryParameter("org_slug", "STRING", org_slug),
        ]

        query = f"""
        SELECT *
        FROM `{table_ref}`
        WHERE org_slug = @org_slug
        """

        if not include_inactive:
            query += " AND is_active = TRUE"

        query += " ORDER BY level ASC, display_order ASC"

        try:
            job_config = bigquery.QueryJobConfig(query_parameters=query_params)
            results = list(self.bq_client.client.query(query, job_config=job_config).result())

            levels = []
            max_depth = 0
            for row in results:
                levels.append(HierarchyLevelResponse(
                    id=row['id'],
                    org_slug=row['org_slug'],
                    level=row['level'],
                    level_code=row['level_code'],
                    level_name=row['level_name'],
                    level_name_plural=row['level_name_plural'],
                    parent_level=row.get('parent_level'),
                    is_required=row['is_required'],
                    is_leaf=row['is_leaf'],
                    max_children=row.get('max_children'),
                    id_prefix=row.get('id_prefix'),
                    id_auto_generate=row['id_auto_generate'],
                    metadata_schema=row.get('metadata_schema'),
                    display_order=row['display_order'],
                    icon=row.get('icon'),
                    color=row.get('color'),
                    is_active=row['is_active'],
                    created_at=row['created_at'],
                    created_by=row['created_by'],
                    updated_at=row.get('updated_at'),
                    updated_by=row.get('updated_by'),
                ))
                if row['level'] > max_depth:
                    max_depth = row['level']

            return HierarchyLevelsListResponse(
                org_slug=org_slug,
                levels=levels,
                total=len(levels),
                max_depth=max_depth
            )
        except google.api_core.exceptions.NotFound:
            return HierarchyLevelsListResponse(
                org_slug=org_slug,
                levels=[],
                total=0,
                max_depth=0
            )

    async def get_level(
        self,
        org_slug: str,
        level: int
    ) -> Optional[HierarchyLevelResponse]:
        """Get a specific hierarchy level by level number."""
        org_slug = validate_org_slug(org_slug)
        table_ref = self._get_central_table_ref(HIERARCHY_LEVELS_TABLE)

        query = f"""
        SELECT *
        FROM `{table_ref}`
        WHERE org_slug = @org_slug
          AND level = @level
          AND is_active = TRUE
        LIMIT 1
        """
        query_params = [
            bigquery.ScalarQueryParameter("org_slug", "STRING", org_slug),
            bigquery.ScalarQueryParameter("level", "INT64", level),
        ]

        try:
            job_config = bigquery.QueryJobConfig(query_parameters=query_params)
            results = list(self.bq_client.client.query(query, job_config=job_config).result())

            if not results:
                return None

            row = results[0]
            return HierarchyLevelResponse(
                id=row['id'],
                org_slug=row['org_slug'],
                level=row['level'],
                level_code=row['level_code'],
                level_name=row['level_name'],
                level_name_plural=row['level_name_plural'],
                parent_level=row.get('parent_level'),
                is_required=row['is_required'],
                is_leaf=row['is_leaf'],
                max_children=row.get('max_children'),
                id_prefix=row.get('id_prefix'),
                id_auto_generate=row['id_auto_generate'],
                metadata_schema=row.get('metadata_schema'),
                display_order=row['display_order'],
                icon=row.get('icon'),
                color=row.get('color'),
                is_active=row['is_active'],
                created_at=row['created_at'],
                created_by=row['created_by'],
                updated_at=row.get('updated_at'),
                updated_by=row.get('updated_by'),
            )
        except google.api_core.exceptions.NotFound:
            return None

    async def get_level_by_code(
        self,
        org_slug: str,
        level_code: str
    ) -> Optional[HierarchyLevelResponse]:
        """Get a specific hierarchy level by level code."""
        org_slug = validate_org_slug(org_slug)
        table_ref = self._get_central_table_ref(HIERARCHY_LEVELS_TABLE)

        query = f"""
        SELECT *
        FROM `{table_ref}`
        WHERE org_slug = @org_slug
          AND level_code = @level_code
          AND is_active = TRUE
        LIMIT 1
        """
        query_params = [
            bigquery.ScalarQueryParameter("org_slug", "STRING", org_slug),
            bigquery.ScalarQueryParameter("level_code", "STRING", level_code.lower()),
        ]

        try:
            job_config = bigquery.QueryJobConfig(query_parameters=query_params)
            results = list(self.bq_client.client.query(query, job_config=job_config).result())

            if not results:
                return None

            row = results[0]
            return HierarchyLevelResponse(
                id=row['id'],
                org_slug=row['org_slug'],
                level=row['level'],
                level_code=row['level_code'],
                level_name=row['level_name'],
                level_name_plural=row['level_name_plural'],
                parent_level=row.get('parent_level'),
                is_required=row['is_required'],
                is_leaf=row['is_leaf'],
                max_children=row.get('max_children'),
                id_prefix=row.get('id_prefix'),
                id_auto_generate=row['id_auto_generate'],
                metadata_schema=row.get('metadata_schema'),
                display_order=row['display_order'],
                icon=row.get('icon'),
                color=row.get('color'),
                is_active=row['is_active'],
                created_at=row['created_at'],
                created_by=row['created_by'],
                updated_at=row.get('updated_at'),
                updated_by=row.get('updated_by'),
            )
        except google.api_core.exceptions.NotFound:
            return None

    async def get_levels_map(self, org_slug: str) -> Dict[str, HierarchyLevelResponse]:
        """Get levels as a map keyed by level_code."""
        levels_response = await self.get_levels(org_slug)
        return {level.level_code: level for level in levels_response.levels}

    # ==========================================================================
    # Create Operations
    # ==========================================================================

    async def create_level(
        self,
        org_slug: str,
        request: CreateLevelRequest,
        created_by: str
    ) -> HierarchyLevelResponse:
        """Create a new hierarchy level."""
        org_slug = validate_org_slug(org_slug)

        # Check if level number already exists
        existing = await self.get_level(org_slug, request.level)
        if existing:
            raise ValueError(f"Level {request.level} already exists")

        # Check if level code already exists
        existing_code = await self.get_level_by_code(org_slug, request.level_code)
        if existing_code:
            raise ValueError(f"Level code '{request.level_code}' already exists")

        # Validate parent level exists if specified
        if request.parent_level is not None:
            parent = await self.get_level(org_slug, request.parent_level)
            if not parent:
                raise ValueError(f"Parent level {request.parent_level} does not exist")
            if parent.is_leaf:
                raise ValueError(f"Cannot create child of leaf level {request.parent_level}")

        now = datetime.utcnow().isoformat()
        record_id = str(uuid.uuid4())

        row = {
            "id": record_id,
            "org_slug": org_slug,
            "level": request.level,
            "level_code": request.level_code.lower(),
            "level_name": request.level_name,
            "level_name_plural": request.level_name_plural,
            "parent_level": request.parent_level,
            "is_required": request.is_required,
            "is_leaf": request.is_leaf,
            "max_children": request.max_children,
            "id_prefix": request.id_prefix,
            "id_auto_generate": request.id_auto_generate,
            "metadata_schema": request.metadata_schema,
            "display_order": request.display_order or request.level,
            "icon": request.icon,
            "color": request.color,
            "is_active": True,
            "created_at": now,
            "created_by": created_by,
            "updated_at": None,
            "updated_by": None,
        }

        try:
            self._insert_to_central_table(HIERARCHY_LEVELS_TABLE, [row])
        except Exception as e:
            logger.error(f"Failed to create hierarchy level: {e}")
            raise RuntimeError(f"Failed to create hierarchy level: {e}")

        return await self.get_level(org_slug, request.level)

    async def seed_default_levels(
        self,
        org_slug: str,
        created_by: str
    ) -> HierarchyLevelsListResponse:
        """Seed default hierarchy levels for a new organization."""
        org_slug = validate_org_slug(org_slug)

        # Check if levels already exist
        existing = await self.get_levels(org_slug)
        if existing.total > 0:
            logger.info(f"Hierarchy levels already exist for {org_slug}, skipping seed")
            return existing

        now = datetime.utcnow().isoformat()
        rows = []

        for level_def in DEFAULT_LEVELS:
            rows.append({
                "id": str(uuid.uuid4()),
                "org_slug": org_slug,
                "level": level_def["level"],
                "level_code": level_def["level_code"],
                "level_name": level_def["level_name"],
                "level_name_plural": level_def["level_name_plural"],
                "parent_level": level_def["parent_level"],
                "is_required": level_def["is_required"],
                "is_leaf": level_def["is_leaf"],
                "max_children": level_def["max_children"],
                "id_prefix": level_def["id_prefix"],
                "id_auto_generate": level_def["id_auto_generate"],
                "metadata_schema": level_def["metadata_schema"],
                "display_order": level_def["display_order"],
                "icon": level_def["icon"],
                "color": level_def["color"],
                "is_active": True,
                "created_at": now,
                "created_by": created_by,
                "updated_at": None,
                "updated_by": None,
            })

        try:
            self._insert_to_central_table(HIERARCHY_LEVELS_TABLE, rows)
            logger.info(f"Seeded {len(rows)} default hierarchy levels for {org_slug}")
        except Exception as e:
            logger.error(f"Failed to seed hierarchy levels: {e}")
            raise RuntimeError(f"Failed to seed hierarchy levels: {e}")

        return await self.get_levels(org_slug)

    # ==========================================================================
    # Update Operations
    # ==========================================================================

    async def update_level(
        self,
        org_slug: str,
        level: int,
        request: UpdateLevelRequest,
        updated_by: str
    ) -> HierarchyLevelResponse:
        """Update a hierarchy level."""
        org_slug = validate_org_slug(org_slug)

        existing = await self.get_level(org_slug, level)
        if not existing:
            raise ValueError(f"Level {level} does not exist")

        now = datetime.utcnow()
        table_ref = self._get_central_table_ref(HIERARCHY_LEVELS_TABLE)

        # Build update fields
        update_fields = []
        update_params = [
            bigquery.ScalarQueryParameter("org_slug", "STRING", org_slug),
            bigquery.ScalarQueryParameter("level", "INT64", level),
            bigquery.ScalarQueryParameter("updated_at", "TIMESTAMP", now),
            bigquery.ScalarQueryParameter("updated_by", "STRING", updated_by),
        ]

        if request.level_name is not None:
            update_fields.append("level_name = @level_name")
            update_params.append(bigquery.ScalarQueryParameter("level_name", "STRING", request.level_name))

        if request.level_name_plural is not None:
            update_fields.append("level_name_plural = @level_name_plural")
            update_params.append(bigquery.ScalarQueryParameter("level_name_plural", "STRING", request.level_name_plural))

        if request.is_leaf is not None:
            update_fields.append("is_leaf = @is_leaf")
            update_params.append(bigquery.ScalarQueryParameter("is_leaf", "BOOL", request.is_leaf))

        if request.max_children is not None:
            update_fields.append("max_children = @max_children")
            update_params.append(bigquery.ScalarQueryParameter("max_children", "INT64", request.max_children))

        if request.id_prefix is not None:
            update_fields.append("id_prefix = @id_prefix")
            update_params.append(bigquery.ScalarQueryParameter("id_prefix", "STRING", request.id_prefix))

        if request.id_auto_generate is not None:
            update_fields.append("id_auto_generate = @id_auto_generate")
            update_params.append(bigquery.ScalarQueryParameter("id_auto_generate", "BOOL", request.id_auto_generate))

        if request.display_order is not None:
            update_fields.append("display_order = @display_order")
            update_params.append(bigquery.ScalarQueryParameter("display_order", "INT64", request.display_order))

        if request.icon is not None:
            update_fields.append("icon = @icon")
            update_params.append(bigquery.ScalarQueryParameter("icon", "STRING", request.icon))

        if request.color is not None:
            update_fields.append("color = @color")
            update_params.append(bigquery.ScalarQueryParameter("color", "STRING", request.color))

        if request.is_active is not None:
            update_fields.append("is_active = @is_active")
            update_params.append(bigquery.ScalarQueryParameter("is_active", "BOOL", request.is_active))

        update_fields.append("updated_at = @updated_at")
        update_fields.append("updated_by = @updated_by")

        query = f"""
        UPDATE `{table_ref}`
        SET {', '.join(update_fields)}
        WHERE org_slug = @org_slug AND level = @level
        """

        try:
            job_config = bigquery.QueryJobConfig(query_parameters=update_params)
            list(self.bq_client.client.query(query, job_config=job_config).result())
        except Exception as e:
            logger.error(f"Failed to update hierarchy level: {e}")
            raise RuntimeError(f"Failed to update hierarchy level: {e}")

        return await self.get_level(org_slug, level)

    # ==========================================================================
    # Delete Operations
    # ==========================================================================

    async def delete_level(
        self,
        org_slug: str,
        level: int,
        deleted_by: str
    ) -> bool:
        """Delete a hierarchy level (soft delete via is_active=false)."""
        org_slug = validate_org_slug(org_slug)

        existing = await self.get_level(org_slug, level)
        if not existing:
            raise ValueError(f"Level {level} does not exist")

        # Check if there are entities using this level
        from src.core.services.hierarchy_crud.service import HierarchyService
        entity_service = HierarchyService(self.bq_client)
        entities = await entity_service.get_entities_by_level(org_slug, existing.level_code)
        if entities.total > 0:
            raise ValueError(
                f"Cannot delete level {level} ({existing.level_code}): "
                f"{entities.total} entities still use this level"
            )

        # Check if other levels depend on this one
        all_levels = await self.get_levels(org_slug, include_inactive=False)
        for lvl in all_levels.levels:
            if lvl.parent_level == level:
                raise ValueError(
                    f"Cannot delete level {level}: "
                    f"Level {lvl.level} ({lvl.level_code}) depends on it"
                )

        now = datetime.utcnow()
        table_ref = self._get_central_table_ref(HIERARCHY_LEVELS_TABLE)

        query = f"""
        UPDATE `{table_ref}`
        SET is_active = FALSE,
            updated_at = @updated_at,
            updated_by = @updated_by
        WHERE org_slug = @org_slug AND level = @level
        """
        query_params = [
            bigquery.ScalarQueryParameter("org_slug", "STRING", org_slug),
            bigquery.ScalarQueryParameter("level", "INT64", level),
            bigquery.ScalarQueryParameter("updated_at", "TIMESTAMP", now),
            bigquery.ScalarQueryParameter("updated_by", "STRING", deleted_by),
        ]

        try:
            job_config = bigquery.QueryJobConfig(query_parameters=query_params)
            list(self.bq_client.client.query(query, job_config=job_config).result())
            return True
        except Exception as e:
            logger.error(f"Failed to delete hierarchy level: {e}")
            raise RuntimeError(f"Failed to delete hierarchy level: {e}")


# ==============================================================================
# Service Instance
# ==============================================================================

def get_hierarchy_level_service() -> HierarchyLevelService:
    """Get hierarchy level service instance."""
    return HierarchyLevelService()
