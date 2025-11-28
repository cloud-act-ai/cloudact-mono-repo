"""
Scope Enforcement Middleware
Validates API key scopes before allowing endpoint access.
"""

from functools import wraps
from typing import List, Optional, Callable, Any
from fastapi import HTTPException, status, Request
import logging

logger = logging.getLogger(__name__)


# ============================================
# Default Role Scopes
# ============================================

ROLE_SCOPES = {
    "OWNER": [
        "org:*",
        "pipelines:*",
        "integrations:*",
        "users:*",
        "api_keys:*",
        "billing:*",
        "audit:read",
    ],
    "ADMIN": [
        "org:read",
        "org:update",
        "pipelines:*",
        "integrations:*",
        "users:read",
        "users:invite",
        "users:remove",
        "api_keys:create",
        "api_keys:read",
        "api_keys:revoke",
        "audit:read",
    ],
    "EDITOR": [
        "org:read",
        "pipelines:read",
        "pipelines:execute",
        "integrations:read",
        "integrations:create",
        "integrations:validate",
        "users:read",
    ],
    "VIEWER": [
        "org:read",
        "pipelines:read",
        "integrations:read",
        "users:read",
    ],
}


def expand_wildcard_scope(scope: str, required_scope: str) -> bool:
    """
    Check if a wildcard scope matches a required scope.

    Examples:
        - "pipelines:*" matches "pipelines:execute"
        - "org:*" matches "org:read"
        - "*" matches anything
    """
    if scope == "*":
        return True

    if "*" not in scope:
        return scope == required_scope

    # Handle wildcard patterns like "pipelines:*"
    scope_parts = scope.split(":")
    required_parts = required_scope.split(":")

    if len(scope_parts) != len(required_parts):
        return False

    for scope_part, required_part in zip(scope_parts, required_parts):
        if scope_part == "*":
            continue
        if scope_part != required_part:
            return False

    return True


def has_scope(user_scopes: List[str], required_scope: str) -> bool:
    """
    Check if user has the required scope.

    Args:
        user_scopes: List of scopes the user has
        required_scope: The scope required for the operation

    Returns:
        True if user has the required scope
    """
    for scope in user_scopes:
        if expand_wildcard_scope(scope, required_scope):
            return True
    return False


def has_any_scope(user_scopes: List[str], required_scopes: List[str]) -> bool:
    """Check if user has any of the required scopes."""
    return any(has_scope(user_scopes, scope) for scope in required_scopes)


def has_all_scopes(user_scopes: List[str], required_scopes: List[str]) -> bool:
    """Check if user has all of the required scopes."""
    return all(has_scope(user_scopes, scope) for scope in required_scopes)


def validate_scopes(
    org_data: dict,
    required_scopes: List[str],
    require_all: bool = False
) -> bool:
    """
    Validate that org/API key has required scopes.

    Args:
        org_data: Organization data from authentication (contains 'scopes' field)
        required_scopes: List of required scopes
        require_all: If True, all scopes required. If False, any scope is sufficient.

    Returns:
        True if scope requirements are met

    Raises:
        HTTPException: If scope requirements not met
    """
    api_key_scopes = org_data.get("scopes", [])

    # If no scopes defined on API key, deny by default
    if not api_key_scopes:
        logger.warning(
            f"No scopes defined for org {org_data.get('org_slug')} - denying access",
            extra={
                "org_slug": org_data.get("org_slug"),
                "required_scopes": required_scopes,
                "api_key_id": org_data.get("org_api_key_id")
            }
        )
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="API key has no scopes defined. Contact admin to configure scopes."
        )

    if require_all:
        if not has_all_scopes(api_key_scopes, required_scopes):
            missing = [s for s in required_scopes if not has_scope(api_key_scopes, s)]
            logger.warning(
                f"Scope validation failed - missing scopes",
                extra={
                    "org_slug": org_data.get("org_slug"),
                    "required_scopes": required_scopes,
                    "missing_scopes": missing,
                    "api_key_scopes": api_key_scopes
                }
            )
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"Missing required scopes: {', '.join(missing)}"
            )
    else:
        if not has_any_scope(api_key_scopes, required_scopes):
            logger.warning(
                f"Scope validation failed - no matching scopes",
                extra={
                    "org_slug": org_data.get("org_slug"),
                    "required_scopes": required_scopes,
                    "api_key_scopes": api_key_scopes
                }
            )
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"Requires one of these scopes: {', '.join(required_scopes)}"
            )

    logger.debug(
        f"Scope validation passed",
        extra={
            "org_slug": org_data.get("org_slug"),
            "required_scopes": required_scopes,
            "api_key_scopes": api_key_scopes
        }
    )
    return True


def require_scopes(*required_scopes: str, require_all: bool = False):
    """
    Decorator to enforce scope requirements on endpoints.

    Usage:
        @router.post("/pipelines/run/{org_slug}/...")
        @require_scopes("pipelines:execute")
        async def trigger_pipeline(
            org: Dict = Depends(get_current_org),
            ...
        ):
            ...

    Args:
        *required_scopes: Variable number of required scope strings
        require_all: If True, all scopes required. If False, any scope is sufficient.
    """
    def decorator(func: Callable) -> Callable:
        @wraps(func)
        async def wrapper(*args, **kwargs):
            # Look for 'org' in kwargs (from Depends(get_current_org))
            org = kwargs.get("org")

            if org is None:
                # Try to find org in positional args or other kwargs
                for key, value in kwargs.items():
                    if isinstance(value, dict) and "scopes" in value:
                        org = value
                        break

            if org is None:
                logger.error("Scope enforcement: Could not find org context in request")
                raise HTTPException(
                    status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                    detail="Internal error: org context not found for scope validation"
                )

            # Validate scopes
            validate_scopes(org, list(required_scopes), require_all=require_all)

            # Call the original function
            return await func(*args, **kwargs)

        return wrapper
    return decorator


class ScopeEnforcementMiddleware:
    """
    ASGI Middleware for scope enforcement.

    This can be used as a global middleware, but is less granular than
    the decorator approach. Use the decorator for endpoint-specific scopes.
    """

    def __init__(self, app, default_scopes: Optional[List[str]] = None):
        self.app = app
        self.default_scopes = default_scopes or []

    async def __call__(self, scope, receive, send):
        # This middleware is a placeholder for future global scope enforcement
        # Currently, we use the decorator approach for more granular control
        await self.app(scope, receive, send)
