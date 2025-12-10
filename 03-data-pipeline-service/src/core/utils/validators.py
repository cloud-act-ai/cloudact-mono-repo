"""
Centralized Input Validation Utility
Provides validation for all user inputs to prevent injection and invalid data.

Issues #47-#52: Input Validation
"""

import re
from typing import Optional
from datetime import datetime, date
from fastapi import HTTPException, status


# Validation patterns
ORG_SLUG_PATTERN = re.compile(r'^[a-zA-Z0-9_]{3,50}$')
EMAIL_PATTERN = re.compile(r'^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$')
DATE_PATTERN = re.compile(r'^\d{4}-\d{2}-\d{2}$')
API_KEY_PATTERN = re.compile(r'^[a-zA-Z0-9_-]{32,}$')

# Valid provider names (should match provider registry)
VALID_PROVIDERS = {
    'openai',
    'anthropic',
    'gemini',
    'gcp',
    'aws',
    'azure'
}


class ValidationError(HTTPException):
    """Custom validation error."""

    def __init__(self, field: str, message: str):
        super().__init__(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail={
                "error": "validation_error",
                "field": field,
                "message": message
            }
        )


def validate_org_slug(org_slug: str, field_name: str = "org_slug") -> str:
    """
    Validate organization slug format.

    Issue #47: Missing org_slug Validation

    Args:
        org_slug: Organization identifier to validate
        field_name: Name of the field for error messages

    Returns:
        Validated org_slug (unchanged)

    Raises:
        ValidationError: If org_slug is invalid
    """
    if not org_slug:
        raise ValidationError(field_name, "Organization slug is required")

    if not ORG_SLUG_PATTERN.match(org_slug):
        raise ValidationError(
            field_name,
            "Organization slug must be alphanumeric with underscores, 3-50 characters (^[a-zA-Z0-9_]{3,50}$)"
        )

    return org_slug


def validate_email(email: str, field_name: str = "email") -> str:
    """
    Validate email address format.

    Issue #48: Missing Email Validation

    Args:
        email: Email address to validate
        field_name: Name of the field for error messages

    Returns:
        Validated email (unchanged)

    Raises:
        ValidationError: If email is invalid
    """
    if not email:
        raise ValidationError(field_name, "Email address is required")

    # Basic format check
    if not EMAIL_PATTERN.match(email):
        raise ValidationError(
            field_name,
            "Invalid email address format"
        )

    # Additional checks
    if len(email) > 254:  # RFC 5321
        raise ValidationError(field_name, "Email address is too long (max 254 characters)")

    local_part, domain = email.rsplit('@', 1)

    if len(local_part) > 64:  # RFC 5321
        raise ValidationError(field_name, "Email local part is too long (max 64 characters)")

    if len(domain) > 253:  # RFC 1035
        raise ValidationError(field_name, "Email domain is too long (max 253 characters)")

    return email.lower()  # Normalize to lowercase


def validate_date(date_str: str, field_name: str = "date") -> date:
    """
    Validate date string format (YYYY-MM-DD).

    Issue #49: Missing Date Validation

    Args:
        date_str: Date string to validate
        field_name: Name of the field for error messages

    Returns:
        Parsed date object

    Raises:
        ValidationError: If date is invalid
    """
    if not date_str:
        raise ValidationError(field_name, "Date is required")

    if not DATE_PATTERN.match(date_str):
        raise ValidationError(
            field_name,
            "Date must be in YYYY-MM-DD format"
        )

    try:
        parsed_date = datetime.strptime(date_str, '%Y-%m-%d').date()
    except ValueError as e:
        raise ValidationError(
            field_name,
            f"Invalid date: {str(e)}"
        )

    # Check for reasonable date range (1900 to 100 years from now)
    if parsed_date.year < 1900 or parsed_date.year > datetime.now().year + 100:
        raise ValidationError(
            field_name,
            "Date is outside acceptable range (1900 to 100 years from now)"
        )

    return parsed_date


def validate_api_key_format(api_key: str, field_name: str = "api_key") -> str:
    """
    Validate API key format.

    Issue #51: Missing API Key Format Validation

    Args:
        api_key: API key to validate
        field_name: Name of the field for error messages

    Returns:
        Validated API key (unchanged)

    Raises:
        ValidationError: If API key is invalid
    """
    if not api_key:
        raise ValidationError(field_name, "API key is required")

    # Check minimum length
    if len(api_key) < 32:
        raise ValidationError(
            field_name,
            "API key must be at least 32 characters long"
        )

    # Check maximum length (prevent DOS attacks)
    if len(api_key) > 512:
        raise ValidationError(
            field_name,
            "API key is too long (max 512 characters)"
        )

    # Check format (alphanumeric, dash, underscore only)
    if not API_KEY_PATTERN.match(api_key):
        raise ValidationError(
            field_name,
            "API key contains invalid characters (allowed: a-z, A-Z, 0-9, -, _)"
        )

    return api_key


def validate_provider_name(provider: str, field_name: str = "provider") -> str:
    """
    Validate provider name against registry.

    Issue #52: Missing Provider Name Validation

    Args:
        provider: Provider name to validate
        field_name: Name of the field for error messages

    Returns:
        Validated provider name (lowercase)

    Raises:
        ValidationError: If provider is invalid
    """
    if not provider:
        raise ValidationError(field_name, "Provider name is required")

    provider_lower = provider.lower()

    if provider_lower not in VALID_PROVIDERS:
        raise ValidationError(
            field_name,
            f"Invalid provider. Must be one of: {', '.join(sorted(VALID_PROVIDERS))}"
        )

    return provider_lower


def validate_json_size(json_data: dict, max_size_kb: int = 100, field_name: str = "request") -> dict:
    """
    Validate JSON payload size to prevent DOS attacks.

    Issue #50: Missing JSON Schema Validation (size check)

    Args:
        json_data: JSON dictionary to validate
        max_size_kb: Maximum size in kilobytes
        field_name: Name of the field for error messages

    Returns:
        Validated JSON data (unchanged)

    Raises:
        ValidationError: If JSON is too large
    """
    import json
    import sys

    # Estimate size (rough approximation)
    size_bytes = sys.getsizeof(json.dumps(json_data))
    size_kb = size_bytes / 1024

    if size_kb > max_size_kb:
        raise ValidationError(
            field_name,
            f"Request payload too large ({size_kb:.1f}KB). Maximum: {max_size_kb}KB"
        )

    return json_data


def validate_string_length(
    value: str,
    min_length: int = 1,
    max_length: int = 1000,
    field_name: str = "field"
) -> str:
    """
    Validate string length.

    Args:
        value: String to validate
        min_length: Minimum length
        max_length: Maximum length
        field_name: Name of the field for error messages

    Returns:
        Validated string (unchanged)

    Raises:
        ValidationError: If string length is invalid
    """
    if not value and min_length > 0:
        raise ValidationError(field_name, f"{field_name} is required")

    if len(value) < min_length:
        raise ValidationError(
            field_name,
            f"{field_name} must be at least {min_length} characters"
        )

    if len(value) > max_length:
        raise ValidationError(
            field_name,
            f"{field_name} must not exceed {max_length} characters"
        )

    return value


def validate_integer_range(
    value: int,
    min_value: Optional[int] = None,
    max_value: Optional[int] = None,
    field_name: str = "field"
) -> int:
    """
    Validate integer is within acceptable range.

    Args:
        value: Integer to validate
        min_value: Minimum value (inclusive)
        max_value: Maximum value (inclusive)
        field_name: Name of the field for error messages

    Returns:
        Validated integer (unchanged)

    Raises:
        ValidationError: If integer is out of range
    """
    if min_value is not None and value < min_value:
        raise ValidationError(
            field_name,
            f"{field_name} must be at least {min_value}"
        )

    if max_value is not None and value > max_value:
        raise ValidationError(
            field_name,
            f"{field_name} must not exceed {max_value}"
        )

    return value


def sanitize_sql_identifier(identifier: str, field_name: str = "identifier") -> str:
    """
    Sanitize SQL identifiers (table names, column names, etc.).

    Prevents SQL injection in dynamic queries.

    Args:
        identifier: SQL identifier to sanitize
        field_name: Name of the field for error messages

    Returns:
        Sanitized identifier

    Raises:
        ValidationError: If identifier contains invalid characters
    """
    # SQL identifiers should only contain alphanumeric and underscore
    if not re.match(r'^[a-zA-Z0-9_]+$', identifier):
        raise ValidationError(
            field_name,
            "Identifier contains invalid characters (allowed: a-z, A-Z, 0-9, _)"
        )

    # Prevent reserved words (basic check)
    reserved_words = {'select', 'insert', 'update', 'delete', 'drop', 'create', 'alter', 'truncate'}
    if identifier.lower() in reserved_words:
        raise ValidationError(
            field_name,
            f"Identifier cannot be a SQL reserved word: {identifier}"
        )

    return identifier
