"""
Hierarchy Export/Import Adapter.

Implements the ExportImportAdapter for organizational hierarchy entities.
Supports full sync mode where CSV becomes the source of truth.

CSV Format:
    entity_id,entity_name,level,level_code,parent_id,owner_name,owner_email,description,metadata,sort_order
    DEPT-CFO,Group CFO,1,c_suite,,Sarah Mitchell,sarah@acme.com,Finance ops,"{}",1
"""

import logging
import re
from dataclasses import dataclass
from typing import Any, Dict, List, Optional, Set

from src.core.services._shared.export_import import (
    ExportImportAdapter,
    SyncAction,
    SyncChange,
    SyncPreview,
    SyncPreviewItem,
    validate_entity_id_format,
    validate_email_format,
    validate_json_string,
    parse_json_field,
    serialize_json_field,
    normalize_text,
    MAX_IMPORT_ROWS,
    MAX_METADATA_SIZE,
)

logger = logging.getLogger(__name__)

# Validation patterns
LEVEL_CODE_PATTERN = re.compile(r'^[a-z][a-z0-9_]{1,29}$')


@dataclass
class HierarchyEntityData:
    """Data class representing a hierarchy entity for import/export."""

    entity_id: str
    entity_name: str
    level: int
    level_code: str
    parent_id: Optional[str] = None
    owner_name: Optional[str] = None
    owner_email: Optional[str] = None
    description: Optional[str] = None
    metadata: Optional[Dict[str, Any]] = None
    sort_order: Optional[int] = None
    # Fields from DB (not in CSV import)
    path: Optional[str] = None
    path_ids: Optional[List[str]] = None
    path_names: Optional[List[str]] = None
    depth: Optional[int] = None
    is_active: bool = True


class HierarchyExportImportAdapter(ExportImportAdapter[HierarchyEntityData]):
    """
    Adapter for hierarchy entity export/import operations.

    Handles:
    - CSV column definitions and validation
    - Entity to/from CSV row conversion
    - Parent reference validation
    - Level code validation against org's configured levels
    - Full sync diff calculation (creates, updates, deletes)
    """

    def __init__(self, valid_level_codes: Optional[Set[str]] = None):
        """
        Initialize adapter with optional level code validation.

        Args:
            valid_level_codes: Set of valid level_code values for the org.
                               If None, level_code format validation only.
        """
        self.valid_level_codes = valid_level_codes or set()

    @property
    def required_columns(self) -> List[str]:
        """Required CSV columns."""
        return ["entity_id", "entity_name", "level", "level_code"]

    @property
    def optional_columns(self) -> List[str]:
        """Optional CSV columns."""
        return [
            "parent_id",
            "owner_name",
            "owner_email",
            "description",
            "metadata",
            "sort_order",
        ]

    def entity_to_row(self, entity: HierarchyEntityData) -> Dict[str, Any]:
        """Convert entity to CSV row dictionary."""
        # CRUD-004: Use 'is not None' check for sort_order to preserve 0 value
        return {
            "entity_id": entity.entity_id,
            "entity_name": entity.entity_name,
            "level": entity.level,
            "level_code": entity.level_code,
            "parent_id": entity.parent_id or "",
            "owner_name": entity.owner_name or "",
            "owner_email": entity.owner_email or "",
            "description": entity.description or "",
            "metadata": serialize_json_field(entity.metadata),
            "sort_order": str(entity.sort_order) if entity.sort_order is not None else "",
        }

    def row_to_entity(self, row: Dict[str, str]) -> HierarchyEntityData:
        """Convert CSV row dictionary to entity."""
        # Parse level as integer
        level_str = row.get("level", "").strip()
        level = int(level_str) if level_str else 0

        # Parse sort_order as integer if present
        sort_order_str = row.get("sort_order", "").strip()
        sort_order = int(sort_order_str) if sort_order_str else None

        # Parse metadata JSON
        metadata = parse_json_field(row.get("metadata", ""), default=None)

        # VAL-004: Apply Unicode normalization to entity_name
        entity_name = normalize_text(row.get("entity_name", "").strip())

        return HierarchyEntityData(
            entity_id=row.get("entity_id", "").strip().upper(),
            entity_name=entity_name,
            level=level,
            level_code=row.get("level_code", "").strip().lower(),
            parent_id=row.get("parent_id", "").strip().upper() or None,
            owner_name=row.get("owner_name", "").strip() or None,
            owner_email=row.get("owner_email", "").strip().lower() or None,
            description=row.get("description", "").strip() or None,
            metadata=metadata,
            sort_order=sort_order,
        )

    def validate_row(self, row: Dict[str, str], row_index: int) -> List[str]:
        """Validate a single CSV row. Returns list of validation error messages."""
        errors = []
        row_num = row_index + 2  # +2 for header row and 0-indexing

        # entity_id validation
        entity_id = row.get("entity_id", "").strip()
        if not entity_id:
            errors.append(f"Row {row_num}: entity_id is required")
        elif not validate_entity_id_format(entity_id):
            errors.append(
                f"Row {row_num}: entity_id '{entity_id}' invalid format "
                "(1-50 alphanumeric, underscore, hyphen)"
            )

        # entity_name validation
        entity_name = row.get("entity_name", "").strip()
        if not entity_name:
            errors.append(f"Row {row_num}: entity_name is required")
        elif len(entity_name) > 200:
            errors.append(f"Row {row_num}: entity_name exceeds 200 characters")

        # level validation - VAL-003: Validate against org's configured levels if available
        level_str = row.get("level", "").strip()
        if not level_str:
            errors.append(f"Row {row_num}: level is required")
        else:
            try:
                level = int(level_str)
                # Check against configured levels if available, otherwise use 1-10 range
                if self.valid_level_codes:
                    max_level = len(self.valid_level_codes)
                    if level < 1 or level > max_level:
                        errors.append(f"Row {row_num}: level must be between 1 and {max_level} (org has {max_level} levels configured)")
                elif level < 1 or level > 10:
                    errors.append(f"Row {row_num}: level must be between 1 and 10")
            except ValueError:
                errors.append(f"Row {row_num}: level must be an integer")

        # level_code validation
        level_code = row.get("level_code", "").strip().lower()
        if not level_code:
            errors.append(f"Row {row_num}: level_code is required")
        elif not LEVEL_CODE_PATTERN.match(level_code):
            errors.append(
                f"Row {row_num}: level_code '{level_code}' invalid format "
                "(2-30 lowercase, starts with letter)"
            )
        elif self.valid_level_codes and level_code not in self.valid_level_codes:
            errors.append(
                f"Row {row_num}: level_code '{level_code}' not configured for this organization"
            )

        # parent_id validation (format only, reference check done separately)
        parent_id = row.get("parent_id", "").strip()
        if parent_id and not validate_entity_id_format(parent_id):
            errors.append(
                f"Row {row_num}: parent_id '{parent_id}' invalid format"
            )

        # owner_email validation
        owner_email = row.get("owner_email", "").strip()
        if owner_email and not validate_email_format(owner_email):
            errors.append(f"Row {row_num}: owner_email '{owner_email}' invalid format")

        # metadata JSON validation - VAL-002: Also check size
        metadata_str = row.get("metadata", "").strip()
        if metadata_str:
            if len(metadata_str) > MAX_METADATA_SIZE:
                errors.append(f"Row {row_num}: metadata exceeds maximum size of {MAX_METADATA_SIZE // 1000}KB")
            elif not validate_json_string(metadata_str):
                errors.append(f"Row {row_num}: metadata must be valid JSON")

        # sort_order validation
        sort_order_str = row.get("sort_order", "").strip()
        if sort_order_str:
            try:
                int(sort_order_str)
            except ValueError:
                errors.append(f"Row {row_num}: sort_order must be an integer")

        return errors

    def get_entity_id(self, entity: HierarchyEntityData) -> str:
        """Get the unique identifier from an entity."""
        return entity.entity_id

    def get_entity_name(self, entity: HierarchyEntityData) -> Optional[str]:
        """Get the display name from an entity."""
        return entity.entity_name

    def compare_entities(
        self, existing: HierarchyEntityData, imported: HierarchyEntityData
    ) -> List[SyncChange]:
        """Compare two entities and return list of changes."""
        changes = []

        # Compare fields that can be updated
        if existing.entity_name != imported.entity_name:
            changes.append(SyncChange(
                field="entity_name",
                old_value=existing.entity_name,
                new_value=imported.entity_name,
            ))

        if existing.parent_id != imported.parent_id:
            changes.append(SyncChange(
                field="parent_id",
                old_value=existing.parent_id,
                new_value=imported.parent_id,
            ))

        if existing.owner_name != imported.owner_name:
            changes.append(SyncChange(
                field="owner_name",
                old_value=existing.owner_name,
                new_value=imported.owner_name,
            ))

        if existing.owner_email != imported.owner_email:
            changes.append(SyncChange(
                field="owner_email",
                old_value=existing.owner_email,
                new_value=imported.owner_email,
            ))

        if existing.description != imported.description:
            changes.append(SyncChange(
                field="description",
                old_value=existing.description,
                new_value=imported.description,
            ))

        if existing.metadata != imported.metadata:
            changes.append(SyncChange(
                field="metadata",
                old_value=existing.metadata,
                new_value=imported.metadata,
            ))

        if existing.sort_order != imported.sort_order:
            changes.append(SyncChange(
                field="sort_order",
                old_value=existing.sort_order,
                new_value=imported.sort_order,
            ))

        # Note: level and level_code changes are not allowed (would require delete+create)
        if existing.level_code != imported.level_code:
            changes.append(SyncChange(
                field="level_code",
                old_value=existing.level_code,
                new_value=imported.level_code,
            ))

        return changes

    def validate_parent_references(
        self, rows: List[Dict[str, str]]
    ) -> List[str]:
        """
        Validate that all parent_id references exist within the CSV.

        Returns list of validation errors.
        """
        errors = []

        # Collect all entity_ids
        all_entity_ids = set()
        for row in rows:
            entity_id = row.get("entity_id", "").strip().upper()
            if entity_id:
                all_entity_ids.add(entity_id)

        # Check all parent_id references
        for row_idx, row in enumerate(rows):
            row_num = row_idx + 2
            parent_id = row.get("parent_id", "").strip().upper()
            entity_id = row.get("entity_id", "").strip().upper()

            if parent_id and parent_id not in all_entity_ids:
                errors.append(
                    f"Row {row_num}: parent_id '{parent_id}' references "
                    f"entity not found in CSV (entity_id: {entity_id})"
                )

        return errors

    def validate_unique_entity_ids(
        self, rows: List[Dict[str, str]]
    ) -> List[str]:
        """
        Validate that all entity_ids are unique within the CSV.

        Returns list of validation errors.
        """
        errors = []
        seen_ids: Dict[str, int] = {}

        for row_idx, row in enumerate(rows):
            row_num = row_idx + 2
            entity_id = row.get("entity_id", "").strip().upper()

            if entity_id in seen_ids:
                errors.append(
                    f"Row {row_num}: Duplicate entity_id '{entity_id}' "
                    f"(first occurrence at row {seen_ids[entity_id]})"
                )
            else:
                seen_ids[entity_id] = row_num

        return errors

    def validate_hierarchy_structure(
        self, rows: List[Dict[str, str]]
    ) -> List[str]:
        """
        Validate hierarchy structure (no cycles, root entities exist, max depth).

        Returns list of validation errors.
        """
        errors = []

        # EDGE-005: Determine max allowed depth from configured levels
        max_depth = len(self.valid_level_codes) if self.valid_level_codes else 10

        # Build parent->children map
        entity_parents: Dict[str, Optional[str]] = {}
        for row in rows:
            entity_id = row.get("entity_id", "").strip().upper()
            parent_id = row.get("parent_id", "").strip().upper() or None
            level_str = row.get("level", "").strip()

            if entity_id:
                entity_parents[entity_id] = parent_id

                # Root entities (level 1) should not have parent
                if level_str == "1" and parent_id:
                    errors.append(
                        f"Entity '{entity_id}' is level 1 but has parent_id '{parent_id}'"
                    )
                # Non-root entities should have parent
                elif level_str and level_str != "1" and not parent_id:
                    errors.append(
                        f"Entity '{entity_id}' is level {level_str} but has no parent_id"
                    )

        # Check for cycles and max depth
        for entity_id in entity_parents:
            visited = set()
            current = entity_id
            depth = 0
            while current:
                depth += 1
                # EDGE-005: Check max depth
                if depth > max_depth:
                    errors.append(
                        f"Entity '{entity_id}' exceeds maximum hierarchy depth of {max_depth}"
                    )
                    break
                if current in visited:
                    errors.append(
                        f"Circular reference detected: entity '{entity_id}' "
                        f"creates a cycle in the hierarchy"
                    )
                    break
                visited.add(current)
                current = entity_parents.get(current)

        return errors

    def generate_preview(
        self,
        csv_rows: List[Dict[str, str]],
        existing_entities: List[HierarchyEntityData],
    ) -> SyncPreview:
        """
        Generate a preview of all changes that will occur during import.

        Args:
            csv_rows: Parsed CSV rows
            existing_entities: Current entities in database

        Returns:
            SyncPreview with categorized changes
        """
        preview = SyncPreview()

        # Validate CSV structure and content
        validation_errors = []

        # MT-003: Check max rows limit
        if len(csv_rows) > MAX_IMPORT_ROWS:
            validation_errors.append(
                f"CSV exceeds maximum of {MAX_IMPORT_ROWS} rows. "
                f"Found {len(csv_rows)} rows. Please split into smaller files."
            )

        # EDGE-001: Warn if CSV has no data rows (would delete everything)
        if len(csv_rows) == 0 and len(existing_entities) > 0:
            validation_errors.append(
                f"WARNING: CSV has no data rows. This will DELETE all {len(existing_entities)} "
                f"existing entities. If this is intentional, add at least one entity or use "
                f"the delete API directly."
            )

        # Validate unique entity_ids
        validation_errors.extend(self.validate_unique_entity_ids(csv_rows))

        # Validate parent references
        validation_errors.extend(self.validate_parent_references(csv_rows))

        # Validate hierarchy structure
        validation_errors.extend(self.validate_hierarchy_structure(csv_rows))

        # Validate individual rows
        for row_idx, row in enumerate(csv_rows):
            row_errors = self.validate_row(row, row_idx)
            validation_errors.extend(row_errors)

        preview.validation_errors = validation_errors

        # Build maps for comparison
        existing_map: Dict[str, HierarchyEntityData] = {
            e.entity_id: e for e in existing_entities
        }
        imported_map: Dict[str, HierarchyEntityData] = {}

        for row in csv_rows:
            entity_id = row.get("entity_id", "").strip().upper()
            if entity_id:
                imported_map[entity_id] = self.row_to_entity(row)

        # Categorize changes
        all_imported_ids = set(imported_map.keys())
        all_existing_ids = set(existing_map.keys())

        # Creates: in CSV, not in DB
        for entity_id in all_imported_ids - all_existing_ids:
            entity = imported_map[entity_id]
            preview.creates.append(SyncPreviewItem(
                action=SyncAction.CREATE,
                entity_id=entity_id,
                entity_name=entity.entity_name,
                level_code=entity.level_code,
            ))

        # Updates and Unchanged: in both
        for entity_id in all_imported_ids & all_existing_ids:
            existing = existing_map[entity_id]
            imported = imported_map[entity_id]
            changes = self.compare_entities(existing, imported)

            if changes:
                # Check for disallowed changes
                item_errors = []
                for change in changes:
                    if change.field == "level_code":
                        item_errors.append(
                            f"Cannot change level_code from '{change.old_value}' "
                            f"to '{change.new_value}' (delete and recreate instead)"
                        )

                preview.updates.append(SyncPreviewItem(
                    action=SyncAction.UPDATE,
                    entity_id=entity_id,
                    entity_name=imported.entity_name,
                    level_code=imported.level_code,
                    changes=changes,
                    validation_errors=item_errors,
                ))
            else:
                preview.unchanged.append(SyncPreviewItem(
                    action=SyncAction.UNCHANGED,
                    entity_id=entity_id,
                    entity_name=existing.entity_name,
                    level_code=existing.level_code,
                ))

        # Deletes: in DB, not in CSV
        for entity_id in all_existing_ids - all_imported_ids:
            existing = existing_map[entity_id]
            preview.deletes.append(SyncPreviewItem(
                action=SyncAction.DELETE,
                entity_id=entity_id,
                entity_name=existing.entity_name,
                level_code=existing.level_code,
            ))

        return preview


def db_row_to_entity_data(row: Dict[str, Any]) -> HierarchyEntityData:
    """Convert a BigQuery row dict to HierarchyEntityData."""
    # Handle metadata parsing
    metadata = row.get("metadata")
    if isinstance(metadata, str):
        metadata = parse_json_field(metadata, default=None)

    # Handle path_ids and path_names arrays
    path_ids = row.get("path_ids")
    if path_ids and not isinstance(path_ids, list):
        path_ids = list(path_ids)

    path_names = row.get("path_names")
    if path_names and not isinstance(path_names, list):
        path_names = list(path_names)

    return HierarchyEntityData(
        entity_id=row.get("entity_id", ""),
        entity_name=row.get("entity_name", ""),
        level=row.get("level", 0),
        level_code=row.get("level_code", ""),
        parent_id=row.get("parent_id"),
        owner_name=row.get("owner_name"),
        owner_email=row.get("owner_email"),
        description=row.get("description"),
        metadata=metadata,
        sort_order=row.get("sort_order"),
        path=row.get("path"),
        path_ids=path_ids,
        path_names=path_names,
        depth=row.get("depth"),
        is_active=row.get("is_active", True),
    )
