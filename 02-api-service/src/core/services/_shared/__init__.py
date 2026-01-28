"""
Shared utilities for read-only services.

Provides common cache, validation, date utilities, and base classes for dashboard read services.
"""

from src.core.services._shared.cache import LRUCache, CacheEntry, CacheConfig, create_cache
from src.core.services._shared.validation import validate_org_slug, ORG_SLUG_PATTERN
from src.core.services._shared.export_import import (
    SyncAction,
    SyncChange,
    SyncPreviewItem,
    SyncPreview,
    ImportResult,
    ExportImportAdapter,
    validate_entity_id_format,
    validate_email_format,
    validate_json_string,
    parse_json_field,
    serialize_json_field,
)
from src.core.services._shared.date_utils import (
    # Core types
    DatePeriod,
    DateRange,
    FiscalYearConfig,
    # Single range functions
    get_fiscal_year_range,
    get_quarter_range,
    get_period_range,
    get_week_range,
    get_month_range,
    resolve_date_range,
    validate_date_range,
    get_default_date_range,
    get_last_n_days,
    # Comparison types
    ComparisonType,
    DateComparison,
    # Comparison functions
    get_comparison_ranges,
    get_custom_comparison,
    get_same_period_last_year,
    # Cache TTL utilities
    get_seconds_until_midnight,
)

__all__ = [
    # Cache
    "LRUCache",
    "CacheEntry",
    "CacheConfig",
    "create_cache",
    # Validation
    "validate_org_slug",
    "ORG_SLUG_PATTERN",
    # Export/Import Framework
    "SyncAction",
    "SyncChange",
    "SyncPreviewItem",
    "SyncPreview",
    "ImportResult",
    "ExportImportAdapter",
    "validate_entity_id_format",
    "validate_email_format",
    "validate_json_string",
    "parse_json_field",
    "serialize_json_field",
    # Date utilities - core
    "DatePeriod",
    "DateRange",
    "FiscalYearConfig",
    # Date utilities - single ranges
    "get_fiscal_year_range",
    "get_quarter_range",
    "get_period_range",
    "get_week_range",
    "get_month_range",
    "resolve_date_range",
    "validate_date_range",
    "get_default_date_range",
    "get_last_n_days",
    # Date utilities - comparisons
    "ComparisonType",
    "DateComparison",
    "get_comparison_ranges",
    "get_custom_comparison",
    "get_same_period_last_year",
    # Cache TTL utilities
    "get_seconds_until_midnight",
]
