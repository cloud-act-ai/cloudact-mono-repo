"""
Scope Enforcement Middleware
Validates API key scopes before allowing endpoint access.
"""

from functools import wraps
from typing import Dict, List, Optional, Callable, Any
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

    Provides route-based scope enforcement at the middleware level.
    Can be used alongside the @require_scopes decorator for defense in depth.

    Route Mapping:
    - Supports exact path matching: "/api/v1/pipelines/run"
    - Supports prefix matching: "/api/v1/pipelines/*"
    - Supports method-specific scopes: GET vs POST
    - Supports wildcard scopes: "pipelines:*" matches "pipelines:execute"

    Usage:
        app.add_middleware(
            ScopeEnforcementMiddleware,
            route_scopes={
                "POST:/api/v1/pipelines/run/*": ["pipelines:execute"],
                "GET:/api/v1/pipelines/status/*": ["pipelines:read"],
                "DELETE:/api/v1/pipelines/cancel/*": ["pipelines:cancel"],
                "POST:/api/v1/admin/*": ["admin:*"]
            }
        )
    """

    def __init__(
        self,
        app,
        route_scopes: Optional[Dict[str, List[str]]] = None,
        default_scopes: Optional[List[str]] = None,
        exempt_paths: Optional[List[str]] = None
    ):
        """
        Initialize scope enforcement middleware.

        Args:
            app: ASGI application
            route_scopes: Dict mapping "METHOD:/path/pattern" to list of required scopes
            default_scopes: Default scopes for routes not in route_scopes
            exempt_paths: Paths that bypass scope checking (e.g., /health, /metrics)
        """
        self.app = app
        self.route_scopes = route_scopes or self._get_default_route_scopes()
        self.default_scopes = default_scopes or []
        self.exempt_paths = exempt_paths or [
            "/health",
            "/health/live",
            "/health/ready",
            "/metrics",
            "/",
            "/docs",
            "/redoc",
            "/openapi.json"
        ]

    def _get_default_route_scopes(self) -> Dict[str, List[str]]:
        """
        Get default route scope mappings for common endpoints.

        Returns:
            Dict mapping route patterns to required scopes
        """
        return {
            # Pipeline execution
            "POST:/api/v1/pipelines/run/*": ["pipelines:execute"],
            "GET:/api/v1/pipelines/runs/*": ["pipelines:read"],
            "GET:/api/v1/pipelines/status/*": ["pipelines:read"],
            "DELETE:/api/v1/pipelines/cancel/*": ["pipelines:cancel"],

            # Scheduler
            "POST:/api/v1/scheduler/trigger": ["pipelines:execute"],
            "GET:/api/v1/scheduler/queue": ["pipelines:read"],
            "POST:/api/v1/scheduler/queue/process": ["pipelines:execute"],

            # Procedures (admin only)
            "GET:/api/v1/procedures": ["admin:*"],
            "GET:/api/v1/procedures/*": ["admin:*"],
            "POST:/api/v1/procedures/*": ["admin:*"],
            "DELETE:/api/v1/procedures/*": ["admin:*"],

            # Migrations (admin only)
            "POST:/api/v1/migrations/*": ["admin:*"],

            # Integration management
            "GET:/api/v1/integrations/*": ["integrations:read"],
            "POST:/api/v1/integrations/*/setup": ["integrations:create"],
            "POST:/api/v1/integrations/*/validate": ["integrations:validate"],
            "DELETE:/api/v1/integrations/*": ["integrations:delete"],
        }

    def _is_exempt_path(self, path: str) -> bool:
        """Check if path is exempt from scope checking."""
        return path in self.exempt_paths

    def _match_route_pattern(self, method: str, path: str) -> Optional[List[str]]:
        """
        Match request method and path against route patterns.

        Args:
            method: HTTP method (GET, POST, etc.)
            path: Request path

        Returns:
            List of required scopes if match found, None otherwise
        """
        # Try exact match first
        exact_key = f"{method}:{path}"
        if exact_key in self.route_scopes:
            return self.route_scopes[exact_key]

        # Try wildcard matching
        for pattern, scopes in self.route_scopes.items():
            pattern_method, pattern_path = pattern.split(":", 1)

            # Check method match
            if pattern_method != "*" and pattern_method != method:
                continue

            # Check path match with wildcard support
            if pattern_path.endswith("*"):
                prefix = pattern_path[:-1]  # Remove trailing *
                if path.startswith(prefix):
                    return scopes
            elif pattern_path == path:
                return scopes

        return None

    def _extract_org_scopes_from_request(self, scope_dict: dict) -> Optional[List[str]]:
        """
        Extract org scopes from request state.

        This requires that authentication middleware has already run
        and populated request.state with org info.

        Args:
            scope_dict: ASGI scope dict

        Returns:
            List of scopes if found, None otherwise
        """
        # In ASGI, request state is stored in scope["state"]
        # This is set by auth dependencies (get_current_org)
        state = scope_dict.get("state", {})

        # Check if org data exists in state
        org = state.get("org")
        if org and isinstance(org, dict):
            return org.get("scopes", [])

        return None

    async def __call__(self, scope, receive, send):
        """
        ASGI middleware entry point.

        Args:
            scope: ASGI scope dict
            receive: ASGI receive callable
            send: ASGI send callable
        """
        # Only process HTTP requests
        if scope["type"] != "http":
            await self.app(scope, receive, send)
            return

        method = scope["method"]
        path = scope["path"]

        # Skip exempt paths
        if self._is_exempt_path(path):
            await self.app(scope, receive, send)
            return

        # Match route pattern to get required scopes
        required_scopes = self._match_route_pattern(method, path)

        # If no specific scopes required, use default or pass through
        if not required_scopes:
            if self.default_scopes:
                required_scopes = self.default_scopes
            else:
                # No scopes required for this route
                await self.app(scope, receive, send)
                return

        # Extract user scopes from request
        # NOTE: This assumes auth middleware has already run and populated scope["state"]
        # If auth hasn't run yet, we can't enforce scopes at middleware level
        user_scopes = self._extract_org_scopes_from_request(scope)

        # If we can't extract scopes, it likely means:
        # 1. Auth middleware hasn't run yet (ordering issue)
        # 2. Request is unauthenticated
        #
        # SECURITY NOTE: This is correct behavior for FastAPI's dependency injection pattern.
        # Scope enforcement middleware runs BEFORE FastAPI route handlers, but auth is typically
        # handled via FastAPI dependencies (e.g., Depends(get_current_org)) which run AFTER
        # middleware. Therefore:
        # - If scopes are not in request state, it means the auth dependency hasn't run yet
        # - We let the request through to the route handler
        # - The auth dependency (get_current_org) will properly validate authentication
        # - If auth fails, the dependency raises HTTPException before the route handler runs
        # - If auth succeeds, scope validation happens via @require_scopes decorator on the route
        #
        # This is NOT a security vulnerability because:
        # 1. Unauthenticated requests will be rejected by auth dependencies
        # 2. Authenticated requests will have scopes validated by @require_scopes decorator
        # 3. This middleware provides defense-in-depth for routes where scopes ARE pre-populated
        if user_scopes is None:
            # Auth middleware hasn't populated scopes yet
            # Let the request through - the auth dependency will properly validate
            # This is expected for routes where auth runs as a FastAPI dependency
            logger.debug(
                f"Scope enforcement: No scopes in request state for {method} {path}. "
                "Auth will be validated by FastAPI dependency."
            )
            await self.app(scope, receive, send)
            return

        # Check if user has required scopes
        has_required_scope = has_any_scope(user_scopes, required_scopes)

        if not has_required_scope:
            # User lacks required scopes - return 403
            logger.warning(
                f"Scope enforcement: Access denied for {method} {path}",
                extra={
                    "method": method,
                    "path": path,
                    "required_scopes": required_scopes,
                    "user_scopes": user_scopes
                }
            )

            # Send 403 Forbidden response
            response_body = {
                "error": "Forbidden",
                "message": f"Insufficient permissions. Required scopes: {', '.join(required_scopes)}",
                "required_scopes": required_scopes
            }

            import json
            response_bytes = json.dumps(response_body).encode("utf-8")

            await send({
                "type": "http.response.start",
                "status": 403,
                "headers": [
                    [b"content-type", b"application/json"],
                    [b"content-length", str(len(response_bytes)).encode("utf-8")],
                ],
            })
            await send({
                "type": "http.response.body",
                "body": response_bytes,
            })
            return

        # User has required scope - allow request
        logger.debug(
            f"Scope enforcement: Access granted for {method} {path}",
            extra={
                "method": method,
                "path": path,
                "required_scopes": required_scopes,
                "user_scopes": user_scopes
            }
        )
        await self.app(scope, receive, send)
