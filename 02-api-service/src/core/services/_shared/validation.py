"""
Multi-Tenancy Validation

Security utilities for org_slug validation to prevent SQL injection.
"""

import re
import logging

logger = logging.getLogger(__name__)

# Valid org_slug pattern: lowercase alphanumeric + underscore only, 3-50 chars
ORG_SLUG_PATTERN = re.compile(r'^[a-z0-9_]{3,50}$')


def validate_org_slug(org_slug: str) -> str:
    """
    Validate and sanitize org_slug to prevent SQL injection.

    Args:
        org_slug: Organization identifier to validate

    Returns:
        Validated org_slug

    Raises:
        ValueError: If org_slug format is invalid
    """
    if not org_slug or not ORG_SLUG_PATTERN.match(org_slug):
        logger.warning(f"Invalid org_slug format rejected: {org_slug[:50] if org_slug else 'None'}")
        raise ValueError(f"Invalid organization identifier format: {org_slug}")
    return org_slug
