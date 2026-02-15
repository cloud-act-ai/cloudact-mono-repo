"""
Generic Export/Import Framework for CloudAct.

Provides reusable base classes and types for CSV-based export/import operations
with full sync support (creates, updates, AND deletes).

Features:
- SyncAction enum for categorizing changes
- SyncPreview for showing diff before import
- ExportImportAdapter base class for domain-specific implementations
- Validation utilities for CSV content
"""

import csv
import io
import json
import re
import logging
import unicodedata
from abc import ABC, abstractmethod
from dataclasses import dataclass, field
from enum import Enum
from typing import Any, Dict, List, Optional, TypeVar, Generic

logger = logging.getLogger(__name__)

# Constants for validation
MAX_CSV_SIZE_BYTES = 5_000_000  # 5MB max CSV size (SEC-001)
MAX_METADATA_SIZE = 10_000  # 10KB max metadata size (VAL-002)
MAX_IMPORT_ROWS = 1000  # Max rows per import (MT-003)


class SyncAction(str, Enum):
    """Action to take for each entity during import sync."""

    CREATE = "create"
    UPDATE = "update"
    DELETE = "delete"
    UNCHANGED = "unchanged"


@dataclass
class SyncChange:
    """Represents a single field change for updates."""

    field: str
    old_value: Any
    new_value: Any


@dataclass
class SyncPreviewItem:
    """Preview item showing what will happen to a single entity during import."""

    action: SyncAction
    entity_id: str
    entity_name: Optional[str] = None
    level_code: Optional[str] = None
    changes: List[SyncChange] = field(default_factory=list)
    validation_errors: List[str] = field(default_factory=list)

    def to_dict(self) -> Dict[str, Any]:
        """Convert to dictionary for JSON serialization."""
        return {
            "action": self.action.value,
            "entity_id": self.entity_id,
            "entity_name": self.entity_name,
            "level_code": self.level_code,
            "changes": [
                {"field": c.field, "old_value": c.old_value, "new_value": c.new_value}
                for c in self.changes
            ],
            "validation_errors": self.validation_errors,
        }


@dataclass
class SyncPreview:
    """Complete preview of all changes that will occur during import."""

    creates: List[SyncPreviewItem] = field(default_factory=list)
    updates: List[SyncPreviewItem] = field(default_factory=list)
    deletes: List[SyncPreviewItem] = field(default_factory=list)
    unchanged: List[SyncPreviewItem] = field(default_factory=list)
    validation_errors: List[str] = field(default_factory=list)

    @property
    def is_valid(self) -> bool:
        """Check if the import can proceed (no validation errors)."""
        if self.validation_errors:
            return False
        for item in self.creates + self.updates + self.deletes:
            if item.validation_errors:
                return False
        return True

    @property
    def has_changes(self) -> bool:
        """Check if there are any changes to apply."""
        return bool(self.creates or self.updates or self.deletes)

    @property
    def summary(self) -> Dict[str, int]:
        """Get summary counts of changes."""
        return {
            "creates": len(self.creates),
            "updates": len(self.updates),
            "deletes": len(self.deletes),
            "unchanged": len(self.unchanged),
        }

    def to_dict(self) -> Dict[str, Any]:
        """Convert to dictionary for JSON serialization."""
        return {
            "summary": self.summary,
            "is_valid": self.is_valid,
            "has_changes": self.has_changes,
            "creates": [item.to_dict() for item in self.creates],
            "updates": [item.to_dict() for item in self.updates],
            "deletes": [item.to_dict() for item in self.deletes],
            "unchanged": [item.to_dict() for item in self.unchanged],
            "validation_errors": self.validation_errors,
        }


@dataclass
class ImportResult:
    """Result of an import operation."""

    success: bool
    created_count: int = 0
    updated_count: int = 0
    deleted_count: int = 0
    unchanged_count: int = 0
    errors: List[str] = field(default_factory=list)

    def to_dict(self) -> Dict[str, Any]:
        """Convert to dictionary for JSON serialization."""
        return {
            "success": self.success,
            "created_count": self.created_count,
            "updated_count": self.updated_count,
            "deleted_count": self.deleted_count,
            "unchanged_count": self.unchanged_count,
            "errors": self.errors,
        }


# Type variable for entity type
T = TypeVar('T')


# ============================================================================
# Validation Utilities (must be before ExportImportAdapter which uses them)
# ============================================================================

# Common patterns
ENTITY_ID_PATTERN = re.compile(r'^[a-zA-Z0-9_-]{1,50}$')
# Import canonical email pattern from validators
from src.core.utils.validators import EMAIL_PATTERN


def validate_entity_id_format(entity_id: str) -> bool:
    """Validate entity_id format: alphanumeric, underscore, hyphen, 1-50 chars."""
    return bool(entity_id and ENTITY_ID_PATTERN.match(entity_id))


def validate_email_format(email: str) -> bool:
    """Validate email format if provided."""
    if not email:
        return True  # Empty email is valid (optional field)
    return bool(EMAIL_PATTERN.match(email))


def validate_json_string(json_str: str, max_size: int = MAX_METADATA_SIZE) -> bool:
    """Validate that a string is valid JSON if provided. VAL-002: Also checks size."""
    if not json_str or json_str.strip() == "":
        return True  # Empty is valid
    if len(json_str) > max_size:
        return False  # VAL-002: Metadata too large
    try:
        json.loads(json_str)
        return True
    except json.JSONDecodeError:
        return False


def strip_bom(content: str) -> str:
    """EDGE-002: Strip UTF-8 BOM (Byte Order Mark) if present."""
    return content.lstrip('\ufeff')


def normalize_text(text: str) -> str:
    """VAL-004: Apply NFKC Unicode normalization to text."""
    if not text:
        return text
    return unicodedata.normalize('NFKC', text)


def parse_json_field(value: str, default: Any = None) -> Any:
    """Parse JSON string field, returning default if empty or invalid."""
    if not value or value.strip() == "":
        return default
    try:
        return json.loads(value)
    except json.JSONDecodeError:
        return default


def serialize_json_field(value: Any) -> str:
    """Serialize value to JSON string for CSV."""
    if value is None:
        return ""
    if isinstance(value, str):
        return value
    return json.dumps(value)


# ============================================================================
# ExportImportAdapter Base Class
# ============================================================================


class ExportImportAdapter(ABC, Generic[T]):
    """
    Abstract base class for domain-specific export/import adapters.

    Implementations should provide:
    - CSV column definitions
    - Entity to CSV row conversion
    - CSV row to entity conversion
    - Validation rules
    - Comparison logic for updates
    """

    @property
    @abstractmethod
    def required_columns(self) -> List[str]:
        """List of required CSV columns."""
        pass

    @property
    @abstractmethod
    def optional_columns(self) -> List[str]:
        """List of optional CSV columns."""
        pass

    @property
    def all_columns(self) -> List[str]:
        """All columns (required + optional)."""
        return self.required_columns + self.optional_columns

    @abstractmethod
    def entity_to_row(self, entity: T) -> Dict[str, Any]:
        """Convert entity to CSV row dictionary."""
        pass

    @abstractmethod
    def row_to_entity(self, row: Dict[str, str]) -> T:
        """Convert CSV row dictionary to entity."""
        pass

    @abstractmethod
    def validate_row(self, row: Dict[str, str], row_index: int) -> List[str]:
        """Validate a single CSV row. Returns list of validation error messages."""
        pass

    @abstractmethod
    def get_entity_id(self, entity: T) -> str:
        """Get the unique identifier from an entity."""
        pass

    @abstractmethod
    def get_entity_name(self, entity: T) -> Optional[str]:
        """Get the display name from an entity."""
        pass

    @abstractmethod
    def compare_entities(self, existing: T, imported: T) -> List[SyncChange]:
        """Compare two entities and return list of changes."""
        pass

    def validate_csv_structure(self, csv_content: str) -> List[str]:
        """Validate CSV structure (columns, format). Returns list of errors."""
        errors = []

        # EDGE-002: Strip BOM if present
        csv_content = strip_bom(csv_content)

        try:
            reader = csv.DictReader(io.StringIO(csv_content))
            headers = reader.fieldnames or []
        except csv.Error as e:
            return [f"Invalid CSV format: {e}"]

        # Check required columns
        missing_required = set(self.required_columns) - set(headers)
        if missing_required:
            errors.append(f"Missing required columns: {', '.join(sorted(missing_required))}")

        # Warn about unknown columns (but don't fail)
        known_columns = set(self.all_columns)
        unknown_columns = set(headers) - known_columns
        if unknown_columns:
            logger.warning(f"Unknown columns in CSV will be ignored: {', '.join(sorted(unknown_columns))}")

        return errors

    def parse_csv(self, csv_content: str) -> List[Dict[str, str]]:
        """Parse CSV content to list of row dictionaries."""
        # EDGE-002: Strip BOM if present
        csv_content = strip_bom(csv_content)
        reader = csv.DictReader(io.StringIO(csv_content))
        return list(reader)

    def generate_csv(self, entities: List[T]) -> str:
        """Generate CSV content from entities."""
        if not entities:
            # Return headers only
            output = io.StringIO()
            writer = csv.DictWriter(output, fieldnames=self.all_columns)
            writer.writeheader()
            return output.getvalue()

        output = io.StringIO()
        writer = csv.DictWriter(output, fieldnames=self.all_columns)
        writer.writeheader()

        for entity in entities:
            row = self.entity_to_row(entity)
            writer.writerow(row)

        return output.getvalue()
