"""
Organizational Hierarchy Service

Manages hierarchy entities (departments, projects, teams) with BigQuery backend.
Implements version history pattern for audit trail and soft deletes.

Features:
- CRUD operations for departments, projects, teams
- Strict hierarchy enforcement (Org -> Dept -> Project -> Team)
- Deletion blocking when entities have children or references
- CSV import/export with validation
- Version history for all changes
"""

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
    HierarchyEntityType,
    CreateDepartmentRequest,
    CreateProjectRequest,
    CreateTeamRequest,
    UpdateHierarchyEntityRequest,
    HierarchyCSVRow,
    HierarchyEntityResponse,
    HierarchyTreeNode,
    HierarchyTreeResponse,
    HierarchyListResponse,
    HierarchyImportResult,
    HierarchyDeletionBlockedResponse,
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
ORG_HIERARCHY_VIEW = "x_org_hierarchy"  # Materialized view in org dataset for fast reads
SAAS_SUBSCRIPTION_PLANS_TABLE = "saas_subscription_plans"
CENTRAL_DATASET = "organizations"  # org_hierarchy is in central dataset for consistency


# ==============================================================================
# Hierarchy Service Class
# ==============================================================================

class HierarchyService:
    """Service for managing organizational hierarchy in BigQuery."""

    def __init__(self, bq_client: Optional[BigQueryClient] = None):
        """Initialize with optional BigQuery client."""
        self.bq_client = bq_client or get_bigquery_client()
        self.project_id = settings.gcp_project_id

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
            Tuple of (table_ref, uses_view) - table_ref is the fully qualified reference,
            uses_view indicates if it's the org-specific view (no org_slug filter needed)
            or the central table (requires org_slug filter).

        The org-specific view x_org_hierarchy is preferred as it's:
        - Pre-filtered by org_slug for faster queries
        - Materialized for better performance
        - Provides multi-tenancy isolation at view level

        Falls back to central table if view doesn't exist (e.g., during onboarding).
        Raises BigQueryResourceNotFoundError if neither view nor central table exist.
        """
        view_ref = self._get_org_view_ref(org_slug, ORG_HIERARCHY_VIEW)

        # Check if view exists
        try:
            self.bq_client.client.get_table(view_ref)
            return (view_ref, True)
        except google.api_core.exceptions.NotFound:
            # View doesn't exist, fall back to central table
            logger.debug(f"View {view_ref} not found, falling back to central table")
            central_ref = self._get_central_table_ref(ORG_HIERARCHY_TABLE)

            # Verify central table exists - throw error if it doesn't
            try:
                self.bq_client.client.get_table(central_ref)
                return (central_ref, False)
            except google.api_core.exceptions.NotFound:
                raise BigQueryResourceNotFoundError(
                    f"Neither x_org_hierarchy view nor org_hierarchy central table found. "
                    f"Ensure bootstrap has been run and org dataset is onboarded."
                )

    def _insert_to_central_table(self, table_name: str, rows: List[Dict[str, Any]]) -> None:
        """Insert rows into a central dataset table using streaming insert."""
        table_id = self._get_central_table_ref(table_name)
        # Use direct BigQuery client for central dataset inserts
        errors = self.bq_client.client.insert_rows_json(table_id, rows)
        if errors:
            raise ValueError(f"Failed to insert rows into {table_id}: {errors}")

    # ==========================================================================
    # Read Operations
    # ==========================================================================

    async def get_all_entities(
        self,
        org_slug: str,
        entity_type: Optional[HierarchyEntityType] = None,
        include_inactive: bool = False
    ) -> HierarchyListResponse:
        """Get all hierarchy entities for an organization.

        Reads from x_org_hierarchy view (preferred) or falls back to central table.
        The view is pre-filtered by org_slug and end_date IS NULL.
        """
        org_slug = validate_org_slug(org_slug)
        table_ref, uses_view = self._get_hierarchy_read_ref(org_slug)

        # Build query - view is already filtered by org_slug and end_date
        if uses_view:
            query = f"""
            SELECT *
            FROM `{table_ref}`
            WHERE 1=1
            """
        else:
            # Fallback to central table - needs explicit filters
            query = f"""
            SELECT *
            FROM `{table_ref}`
            WHERE org_slug = '{org_slug}'
              AND end_date IS NULL
            """

        if not include_inactive:
            query += " AND is_active = TRUE"

        if entity_type:
            query += f" AND entity_type = '{entity_type.value}'"

        query += " ORDER BY entity_type, entity_id"

        try:
            results = list(self.bq_client.query(query))

            entities = []
            for row in results:
                entities.append(HierarchyEntityResponse(
                    id=row['id'],
                    org_slug=row['org_slug'],
                    entity_type=HierarchyEntityType(row['entity_type']),
                    entity_id=row['entity_id'],
                    entity_name=row['entity_name'],
                    parent_id=row.get('parent_id'),
                    parent_type=row.get('parent_type'),
                    dept_id=row.get('dept_id'),
                    dept_name=row.get('dept_name'),
                    project_id=row.get('project_id'),
                    project_name=row.get('project_name'),
                    team_id=row.get('team_id'),
                    team_name=row.get('team_name'),
                    owner_id=row.get('owner_id'),
                    owner_name=row.get('owner_name'),
                    owner_email=row.get('owner_email'),
                    description=row.get('description'),
                    metadata=row.get('metadata'),
                    is_active=row['is_active'],
                    created_at=row['created_at'],
                    created_by=row['created_by'],
                    updated_at=row.get('updated_at'),
                    updated_by=row.get('updated_by'),
                    version=row['version'],
                ))

            return HierarchyListResponse(
                org_slug=org_slug,
                entities=entities,
                total=len(entities)
            )
        except (google.api_core.exceptions.NotFound, BigQueryResourceNotFoundError):
            # Table or dataset doesn't exist yet - return empty list
            return HierarchyListResponse(org_slug=org_slug, entities=[], total=0)

    async def get_entity(
        self,
        org_slug: str,
        entity_type: HierarchyEntityType,
        entity_id: str
    ) -> Optional[HierarchyEntityResponse]:
        """Get a specific hierarchy entity.

        Reads from x_org_hierarchy view (preferred) or falls back to central table.
        """
        org_slug = validate_org_slug(org_slug)
        entity_id = validate_entity_id(entity_id)
        table_ref, uses_view = self._get_hierarchy_read_ref(org_slug)

        # Build query - view is already filtered by org_slug and end_date
        if uses_view:
            query = f"""
            SELECT *
            FROM `{table_ref}`
            WHERE entity_type = '{entity_type.value}'
              AND entity_id = '{entity_id}'
            LIMIT 1
            """
        else:
            # Fallback to central table - needs explicit filters
            query = f"""
            SELECT *
            FROM `{table_ref}`
            WHERE org_slug = '{org_slug}'
              AND entity_type = '{entity_type.value}'
              AND entity_id = '{entity_id}'
              AND end_date IS NULL
            LIMIT 1
            """

        try:
            results = list(self.bq_client.query(query))

            if not results:
                return None

            row = results[0]
            return HierarchyEntityResponse(
                id=row['id'],
                org_slug=row['org_slug'],
                entity_type=HierarchyEntityType(row['entity_type']),
                entity_id=row['entity_id'],
                entity_name=row['entity_name'],
                parent_id=row.get('parent_id'),
                parent_type=row.get('parent_type'),
                dept_id=row.get('dept_id'),
                dept_name=row.get('dept_name'),
                project_id=row.get('project_id'),
                project_name=row.get('project_name'),
                team_id=row.get('team_id'),
                team_name=row.get('team_name'),
                owner_id=row.get('owner_id'),
                owner_name=row.get('owner_name'),
                owner_email=row.get('owner_email'),
                description=row.get('description'),
                metadata=row.get('metadata'),
                is_active=row['is_active'],
                created_at=row['created_at'],
                created_by=row['created_by'],
                updated_at=row.get('updated_at'),
                updated_by=row.get('updated_by'),
                version=row['version'],
            )
        except (google.api_core.exceptions.NotFound, BigQueryResourceNotFoundError):
            return None

    async def get_hierarchy_tree(self, org_slug: str) -> HierarchyTreeResponse:
        """Get full hierarchy as a tree structure."""
        org_slug = validate_org_slug(org_slug)

        # Get all active entities
        all_entities = await self.get_all_entities(org_slug)

        # Separate by type
        departments = []
        projects_by_dept: Dict[str, List[HierarchyTreeNode]] = {}
        teams_by_project: Dict[str, List[HierarchyTreeNode]] = {}

        for entity in all_entities.entities:
            node = HierarchyTreeNode(
                entity_type=entity.entity_type,
                entity_id=entity.entity_id,
                entity_name=entity.entity_name,
                owner_name=entity.owner_name,
                owner_email=entity.owner_email,
                description=entity.description,
                is_active=entity.is_active,
                children=[]
            )

            if entity.entity_type == HierarchyEntityType.DEPARTMENT:
                departments.append(node)
            elif entity.entity_type == HierarchyEntityType.PROJECT:
                if entity.parent_id not in projects_by_dept:
                    projects_by_dept[entity.parent_id] = []
                projects_by_dept[entity.parent_id].append(node)
            elif entity.entity_type == HierarchyEntityType.TEAM:
                if entity.parent_id not in teams_by_project:
                    teams_by_project[entity.parent_id] = []
                teams_by_project[entity.parent_id].append(node)

        # Build tree by attaching children
        for project_id, teams in teams_by_project.items():
            for dept_id, projects in projects_by_dept.items():
                for project in projects:
                    if project.entity_id == project_id:
                        project.children = teams
                        break

        for dept in departments:
            dept.children = projects_by_dept.get(dept.entity_id, [])

        return HierarchyTreeResponse(
            org_slug=org_slug,
            departments=departments,
            total_departments=len(departments),
            total_projects=sum(len(p) for p in projects_by_dept.values()),
            total_teams=sum(len(t) for t in teams_by_project.values())
        )

    # ==========================================================================
    # Create Operations
    # ==========================================================================

    async def create_department(
        self,
        org_slug: str,
        request: CreateDepartmentRequest,
        created_by: str
    ) -> HierarchyEntityResponse:
        """Create a new department."""
        org_slug = validate_org_slug(org_slug)
        entity_id = validate_entity_id(request.entity_id)

        # Check if department already exists
        existing = await self.get_entity(org_slug, HierarchyEntityType.DEPARTMENT, entity_id)
        if existing:
            raise ValueError(f"Department {entity_id} already exists")

        now = datetime.utcnow().isoformat()
        record_id = str(uuid.uuid4())

        row = {
            "id": record_id,
            "org_slug": org_slug,
            "entity_type": HierarchyEntityType.DEPARTMENT.value,
            "entity_id": entity_id,
            "entity_name": request.entity_name,
            "parent_id": None,
            "parent_type": None,
            "dept_id": entity_id,
            "dept_name": request.entity_name,
            "project_id": None,
            "project_name": None,
            "team_id": None,
            "team_name": None,
            "owner_id": request.owner_id,
            "owner_name": request.owner_name,
            "owner_email": request.owner_email,
            "description": request.description,
            "metadata": request.metadata,
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
            logger.error(f"Failed to create department: {e}")
            raise RuntimeError(f"Failed to create department: {e}")

        return await self.get_entity(org_slug, HierarchyEntityType.DEPARTMENT, entity_id)

    async def create_project(
        self,
        org_slug: str,
        request: CreateProjectRequest,
        created_by: str
    ) -> HierarchyEntityResponse:
        """Create a new project under a department."""
        org_slug = validate_org_slug(org_slug)
        entity_id = validate_entity_id(request.entity_id)
        dept_id = validate_entity_id(request.dept_id)

        # Check if department exists
        dept = await self.get_entity(org_slug, HierarchyEntityType.DEPARTMENT, dept_id)
        if not dept:
            raise ValueError(f"Department {dept_id} does not exist")

        # Check if project already exists
        existing = await self.get_entity(org_slug, HierarchyEntityType.PROJECT, entity_id)
        if existing:
            raise ValueError(f"Project {entity_id} already exists")

        now = datetime.utcnow().isoformat()
        record_id = str(uuid.uuid4())

        row = {
            "id": record_id,
            "org_slug": org_slug,
            "entity_type": HierarchyEntityType.PROJECT.value,
            "entity_id": entity_id,
            "entity_name": request.entity_name,
            "parent_id": dept_id,
            "parent_type": HierarchyEntityType.DEPARTMENT.value,
            "dept_id": dept_id,
            "dept_name": dept.entity_name,
            "project_id": entity_id,
            "project_name": request.entity_name,
            "team_id": None,
            "team_name": None,
            "owner_id": request.owner_id,
            "owner_name": request.owner_name,
            "owner_email": request.owner_email,
            "description": request.description,
            "metadata": request.metadata,
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
            logger.error(f"Failed to create project: {e}")
            raise RuntimeError(f"Failed to create project: {e}")

        return await self.get_entity(org_slug, HierarchyEntityType.PROJECT, entity_id)

    async def create_team(
        self,
        org_slug: str,
        request: CreateTeamRequest,
        created_by: str
    ) -> HierarchyEntityResponse:
        """Create a new team under a project."""
        org_slug = validate_org_slug(org_slug)
        entity_id = validate_entity_id(request.entity_id)
        project_id = validate_entity_id(request.project_id)

        # Check if project exists
        project = await self.get_entity(org_slug, HierarchyEntityType.PROJECT, project_id)
        if not project:
            raise ValueError(f"Project {project_id} does not exist")

        # Check if team already exists
        existing = await self.get_entity(org_slug, HierarchyEntityType.TEAM, entity_id)
        if existing:
            raise ValueError(f"Team {entity_id} already exists")

        now = datetime.utcnow().isoformat()
        record_id = str(uuid.uuid4())

        row = {
            "id": record_id,
            "org_slug": org_slug,
            "entity_type": HierarchyEntityType.TEAM.value,
            "entity_id": entity_id,
            "entity_name": request.entity_name,
            "parent_id": project_id,
            "parent_type": HierarchyEntityType.PROJECT.value,
            "dept_id": project.dept_id,
            "dept_name": project.dept_name,
            "project_id": project_id,
            "project_name": project.entity_name,
            "team_id": entity_id,
            "team_name": request.entity_name,
            "owner_id": request.owner_id,
            "owner_name": request.owner_name,
            "owner_email": request.owner_email,
            "description": request.description,
            "metadata": request.metadata,
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
            logger.error(f"Failed to create team: {e}")
            raise RuntimeError(f"Failed to create team: {e}")

        return await self.get_entity(org_slug, HierarchyEntityType.TEAM, entity_id)

    # ==========================================================================
    # Update Operations
    # ==========================================================================

    async def update_entity(
        self,
        org_slug: str,
        entity_type: HierarchyEntityType,
        entity_id: str,
        request: UpdateHierarchyEntityRequest,
        updated_by: str
    ) -> HierarchyEntityResponse:
        """Update a hierarchy entity with version history."""
        org_slug = validate_org_slug(org_slug)
        entity_id = validate_entity_id(entity_id)

        # Get existing entity
        existing = await self.get_entity(org_slug, entity_type, entity_id)
        if not existing:
            raise ValueError(f"{entity_type.value.title()} {entity_id} does not exist")

        now = datetime.utcnow().isoformat()
        table_ref = self._get_central_table_ref(ORG_HIERARCHY_TABLE)

        # Mark old version as ended
        end_query = f"""
        UPDATE `{table_ref}`
        SET end_date = TIMESTAMP('{now}'),
            updated_at = TIMESTAMP('{now}'),
            updated_by = '{updated_by}'
        WHERE org_slug = '{org_slug}'
          AND id = '{existing.id}'
        """
        list(self.bq_client.query(end_query))  # Execute UPDATE

        # Create new version
        new_id = str(uuid.uuid4())
        row = {
            "id": new_id,
            "org_slug": org_slug,
            "entity_type": entity_type.value,
            "entity_id": entity_id,
            "entity_name": request.entity_name or existing.entity_name,
            "parent_id": existing.parent_id,
            "parent_type": existing.parent_type,
            "dept_id": existing.dept_id,
            "dept_name": existing.dept_name,
            "project_id": existing.project_id,
            "project_name": existing.project_name,
            "team_id": existing.team_id,
            "team_name": existing.team_name,
            "owner_id": request.owner_id if request.owner_id is not None else existing.owner_id,
            "owner_name": request.owner_name if request.owner_name is not None else existing.owner_name,
            "owner_email": request.owner_email if request.owner_email is not None else existing.owner_email,
            "description": request.description if request.description is not None else existing.description,
            "metadata": request.metadata if request.metadata is not None else existing.metadata,
            "is_active": request.is_active if request.is_active is not None else existing.is_active,
            "created_at": existing.created_at.isoformat() if hasattr(existing.created_at, 'isoformat') else existing.created_at,
            "created_by": existing.created_by,
            "updated_at": now,
            "updated_by": updated_by,
            "version": existing.version + 1,
            "end_date": None,
        }

        # Update denormalized name if entity_name changed
        if request.entity_name and request.entity_name != existing.entity_name:
            if entity_type == HierarchyEntityType.DEPARTMENT:
                row["dept_name"] = request.entity_name
            elif entity_type == HierarchyEntityType.PROJECT:
                row["project_name"] = request.entity_name
            elif entity_type == HierarchyEntityType.TEAM:
                row["team_name"] = request.entity_name

        try:
            self._insert_to_central_table(ORG_HIERARCHY_TABLE, [row])
        except Exception as e:
            logger.error(f"Failed to update entity: {e}")
            raise RuntimeError(f"Failed to update entity: {e}")

        return await self.get_entity(org_slug, entity_type, entity_id)

    # ==========================================================================
    # Delete Operations
    # ==========================================================================

    async def check_deletion_blocked(
        self,
        org_slug: str,
        entity_type: HierarchyEntityType,
        entity_id: str
    ) -> HierarchyDeletionBlockedResponse:
        """Check if entity deletion is blocked by children or references.

        Reads from x_org_hierarchy view (preferred) or falls back to central table.
        """
        org_slug = validate_org_slug(org_slug)
        entity_id = validate_entity_id(entity_id)

        blocking_entities = []
        table_ref, uses_view = self._get_hierarchy_read_ref(org_slug)

        # Check for child entities
        if entity_type == HierarchyEntityType.DEPARTMENT:
            # Check for projects under this department
            # View is already filtered by org_slug and end_date IS NULL
            if uses_view:
                query = f"""
                SELECT entity_type, entity_id, entity_name
                FROM `{table_ref}`
                WHERE parent_id = '{entity_id}'
                  AND parent_type = 'department'
                  AND is_active = TRUE
                """
            else:
                query = f"""
                SELECT entity_type, entity_id, entity_name
                FROM `{table_ref}`
                WHERE org_slug = '{org_slug}'
                  AND parent_id = '{entity_id}'
                  AND parent_type = 'department'
                  AND end_date IS NULL
                  AND is_active = TRUE
                """
            results = list(self.bq_client.query(query))
            for row in results:
                blocking_entities.append({
                    "entity_type": row['entity_type'],
                    "entity_id": row['entity_id'],
                    "entity_name": row['entity_name']
                })

        elif entity_type == HierarchyEntityType.PROJECT:
            # Check for teams under this project
            # View is already filtered by org_slug and end_date IS NULL
            if uses_view:
                query = f"""
                SELECT entity_type, entity_id, entity_name
                FROM `{table_ref}`
                WHERE parent_id = '{entity_id}'
                  AND parent_type = 'project'
                  AND is_active = TRUE
                """
            else:
                query = f"""
                SELECT entity_type, entity_id, entity_name
                FROM `{table_ref}`
                WHERE org_slug = '{org_slug}'
                  AND parent_id = '{entity_id}'
                  AND parent_type = 'project'
                  AND end_date IS NULL
                  AND is_active = TRUE
                """
            results = list(self.bq_client.query(query))
            for row in results:
                blocking_entities.append({
                    "entity_type": row['entity_type'],
                    "entity_id": row['entity_id'],
                    "entity_name": row['entity_name']
                })

        # Check for references in subscription plans
        subscription_table = self._get_table_ref(org_slug, SAAS_SUBSCRIPTION_PLANS_TABLE)
        try:
            if entity_type == HierarchyEntityType.DEPARTMENT:
                ref_query = f"""
                SELECT subscription_id, provider, plan_name
                FROM `{subscription_table}`
                WHERE hierarchy_dept_id = '{entity_id}'
                  AND end_date IS NULL
                LIMIT 10
                """
            elif entity_type == HierarchyEntityType.PROJECT:
                ref_query = f"""
                SELECT subscription_id, provider, plan_name
                FROM `{subscription_table}`
                WHERE hierarchy_project_id = '{entity_id}'
                  AND end_date IS NULL
                LIMIT 10
                """
            else:  # TEAM
                ref_query = f"""
                SELECT subscription_id, provider, plan_name
                FROM `{subscription_table}`
                WHERE hierarchy_team_id = '{entity_id}'
                  AND end_date IS NULL
                LIMIT 10
                """

            ref_results = list(self.bq_client.query(ref_query))
            for row in ref_results:
                blocking_entities.append({
                    "entity_type": "subscription",
                    "entity_id": row['subscription_id'],
                    "entity_name": f"{row['provider']} - {row['plan_name']}"
                })
        except google.api_core.exceptions.NotFound:
            pass  # Table doesn't exist yet

        blocked = len(blocking_entities) > 0
        reason = ""
        if blocked:
            child_types = {"project", "team"}
            has_children = any(e["entity_type"] in child_types for e in blocking_entities)
            has_refs = any(e["entity_type"] == "subscription" for e in blocking_entities)

            if has_children and has_refs:
                reason = f"Cannot delete {entity_type.value} with active children and subscription references"
            elif has_children:
                reason = f"Cannot delete {entity_type.value} with active children"
            else:
                reason = f"Cannot delete {entity_type.value} with active subscription references"

        return HierarchyDeletionBlockedResponse(
            entity_type=entity_type,
            entity_id=entity_id,
            blocked=blocked,
            reason=reason,
            blocking_entities=blocking_entities
        )

    async def delete_entity(
        self,
        org_slug: str,
        entity_type: HierarchyEntityType,
        entity_id: str,
        deleted_by: str,
        force: bool = False
    ) -> bool:
        """Soft delete a hierarchy entity."""
        org_slug = validate_org_slug(org_slug)
        entity_id = validate_entity_id(entity_id)

        # Check if deletion is blocked
        if not force:
            block_check = await self.check_deletion_blocked(org_slug, entity_type, entity_id)
            if block_check.blocked:
                raise ValueError(block_check.reason)

        # Get existing entity
        existing = await self.get_entity(org_slug, entity_type, entity_id)
        if not existing:
            raise ValueError(f"{entity_type.value.title()} {entity_id} does not exist")

        now = datetime.utcnow().isoformat()
        table_ref = self._get_central_table_ref(ORG_HIERARCHY_TABLE)

        # Soft delete by setting end_date and is_active = false
        delete_query = f"""
        UPDATE `{table_ref}`
        SET end_date = TIMESTAMP('{now}'),
            is_active = FALSE,
            updated_at = TIMESTAMP('{now}'),
            updated_by = '{deleted_by}'
        WHERE org_slug = '{org_slug}'
          AND id = '{existing.id}'
        """

        list(self.bq_client.query(delete_query))  # Execute UPDATE
        return True

    # ==========================================================================
    # Import/Export Operations
    # ==========================================================================

    async def import_hierarchy(
        self,
        org_slug: str,
        rows: List[HierarchyCSVRow],
        mode: str,
        imported_by: str
    ) -> HierarchyImportResult:
        """Import hierarchy from CSV rows."""
        org_slug = validate_org_slug(org_slug)

        created = 0
        updated = 0
        errors = []

        # Sort rows: departments first, then projects, then teams
        type_order = {
            HierarchyEntityType.DEPARTMENT: 0,
            HierarchyEntityType.PROJECT: 1,
            HierarchyEntityType.TEAM: 2
        }
        sorted_rows = sorted(rows, key=lambda r: type_order[r.entity_type])

        if mode == "replace":
            # Delete all existing entities for this org
            table_ref = self._get_central_table_ref(ORG_HIERARCHY_TABLE)
            now = datetime.utcnow().isoformat()
            delete_query = f"""
            UPDATE `{table_ref}`
            SET end_date = TIMESTAMP('{now}'),
                is_active = FALSE,
                updated_by = '{imported_by}'
            WHERE org_slug = '{org_slug}'
              AND end_date IS NULL
            """
            try:
                list(self.bq_client.query(delete_query))  # Execute UPDATE
            except google.api_core.exceptions.NotFound:
                pass

        for i, row in enumerate(sorted_rows):
            try:
                existing = await self.get_entity(org_slug, row.entity_type, row.entity_id)

                if row.entity_type == HierarchyEntityType.DEPARTMENT:
                    if existing:
                        await self.update_entity(
                            org_slug,
                            row.entity_type,
                            row.entity_id,
                            UpdateHierarchyEntityRequest(
                                entity_name=row.entity_name,
                                owner_id=row.owner_id,
                                owner_name=row.owner_name,
                                owner_email=row.owner_email,
                                description=row.description
                            ),
                            imported_by
                        )
                        updated += 1
                    else:
                        await self.create_department(
                            org_slug,
                            CreateDepartmentRequest(
                                entity_id=row.entity_id,
                                entity_name=row.entity_name,
                                owner_id=row.owner_id,
                                owner_name=row.owner_name,
                                owner_email=row.owner_email,
                                description=row.description
                            ),
                            imported_by
                        )
                        created += 1

                elif row.entity_type == HierarchyEntityType.PROJECT:
                    if existing:
                        await self.update_entity(
                            org_slug,
                            row.entity_type,
                            row.entity_id,
                            UpdateHierarchyEntityRequest(
                                entity_name=row.entity_name,
                                owner_id=row.owner_id,
                                owner_name=row.owner_name,
                                owner_email=row.owner_email,
                                description=row.description
                            ),
                            imported_by
                        )
                        updated += 1
                    else:
                        await self.create_project(
                            org_slug,
                            CreateProjectRequest(
                                entity_id=row.entity_id,
                                entity_name=row.entity_name,
                                dept_id=row.parent_id,
                                owner_id=row.owner_id,
                                owner_name=row.owner_name,
                                owner_email=row.owner_email,
                                description=row.description
                            ),
                            imported_by
                        )
                        created += 1

                elif row.entity_type == HierarchyEntityType.TEAM:
                    if existing:
                        await self.update_entity(
                            org_slug,
                            row.entity_type,
                            row.entity_id,
                            UpdateHierarchyEntityRequest(
                                entity_name=row.entity_name,
                                owner_id=row.owner_id,
                                owner_name=row.owner_name,
                                owner_email=row.owner_email,
                                description=row.description
                            ),
                            imported_by
                        )
                        updated += 1
                    else:
                        await self.create_team(
                            org_slug,
                            CreateTeamRequest(
                                entity_id=row.entity_id,
                                entity_name=row.entity_name,
                                project_id=row.parent_id,
                                owner_id=row.owner_id,
                                owner_name=row.owner_name,
                                owner_email=row.owner_email,
                                description=row.description
                            ),
                            imported_by
                        )
                        created += 1

            except Exception as e:
                errors.append({
                    "row": i + 1,
                    "entity_id": row.entity_id,
                    "error": str(e)
                })

        success = len(errors) == 0
        message = f"Import completed: {created} created, {updated} updated"
        if errors:
            message += f", {len(errors)} errors"

        return HierarchyImportResult(
            success=success,
            created=created,
            updated=updated,
            errors=errors,
            message=message
        )

    async def export_hierarchy(self, org_slug: str) -> List[Dict[str, Any]]:
        """Export hierarchy to CSV-compatible format."""
        org_slug = validate_org_slug(org_slug)

        all_entities = await self.get_all_entities(org_slug)

        export_rows = []
        for entity in all_entities.entities:
            export_rows.append({
                "entity_type": entity.entity_type.value,
                "entity_id": entity.entity_id,
                "entity_name": entity.entity_name,
                "parent_id": entity.parent_id or "",
                "owner_id": entity.owner_id or "",
                "owner_name": entity.owner_name or "",
                "owner_email": entity.owner_email or "",
                "description": entity.description or ""
            })

        return export_rows


# ==============================================================================
# Service Instance
# ==============================================================================

def get_hierarchy_crud_service() -> HierarchyService:
    """Get hierarchy service instance."""
    return HierarchyService()
