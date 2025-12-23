"""
Scope Enforcement Integration Example

This file demonstrates how to integrate scope enforcement into the Pipeline Service.
It shows both middleware-based and decorator-based approaches.

USAGE:
------

1. Add middleware to main.py (optional - for defense in depth):

   from src.app.middleware import ScopeEnforcementMiddleware

   app.add_middleware(
       ScopeEnforcementMiddleware,
       route_scopes={...}  # Custom mappings or use defaults
   )

2. Add decorators to endpoints (recommended):

   from src.app.middleware import require_scopes

   @router.post("/pipelines/run/...")
   @require_scopes("pipelines:execute")
   async def run_pipeline(...):
       pass

3. Update BigQuery API keys with scopes:

   UPDATE organizations.org_api_keys
   SET scopes = ['pipelines:*', 'integrations:*']
   WHERE org_api_key_id = 'key-uuid';
"""

from fastapi import FastAPI, APIRouter, Depends, HTTPException
from typing import Dict, Any
import logging

from src.app.middleware import (
    require_scopes,
    validate_scopes,
    has_scope,
    ScopeEnforcementMiddleware,
    ROLE_SCOPES,
)
from src.app.dependencies.auth import get_current_org

logger = logging.getLogger(__name__)

# ============================================
# Example 1: Decorator-Based Enforcement
# ============================================

router_pipelines = APIRouter(prefix="/api/v1/pipelines", tags=["Pipelines"])


@router_pipelines.post("/run/{org_slug}/{provider}/{domain}/{pipeline}")
@require_scopes("pipelines:execute")
async def trigger_pipeline(
    org_slug: str,
    provider: str,
    domain: str,
    pipeline: str,
    org: Dict[str, Any] = Depends(get_current_org)
):
    """
    Trigger pipeline execution.

    Required scope: pipelines:execute

    The @require_scopes decorator checks if the authenticated org has
    the required scope before allowing the request to proceed.
    """
    logger.info(f"Triggering pipeline for org {org_slug}: {provider}/{domain}/{pipeline}")

    return {
        "status": "started",
        "org_slug": org_slug,
        "pipeline": f"{provider}/{domain}/{pipeline}",
        "message": "Pipeline execution started"
    }


@router_pipelines.get("/status/{run_id}")
@require_scopes("pipelines:read")
async def get_pipeline_status(
    run_id: str,
    org: Dict[str, Any] = Depends(get_current_org)
):
    """
    Get pipeline execution status.

    Required scope: pipelines:read

    VIEWER, EDITOR, ADMIN, and OWNER roles all have this scope.
    """
    return {
        "run_id": run_id,
        "status": "running",
        "org_slug": org["org_slug"]
    }


@router_pipelines.delete("/cancel/{run_id}")
@require_scopes("pipelines:cancel", "pipelines:execute", require_all=False)
async def cancel_pipeline(
    run_id: str,
    org: Dict[str, Any] = Depends(get_current_org)
):
    """
    Cancel running pipeline.

    Required scope: pipelines:cancel OR pipelines:execute

    The require_all=False parameter means the user needs ANY of the listed scopes.
    Either pipelines:cancel OR pipelines:execute will grant access.
    """
    logger.info(f"Cancelling pipeline run {run_id} for org {org['org_slug']}")

    return {
        "run_id": run_id,
        "status": "cancelled",
        "message": "Pipeline execution cancelled"
    }


# ============================================
# Example 2: Manual Scope Validation
# ============================================

@router_pipelines.post("/bulk-run")
async def bulk_run_pipelines(
    pipeline_ids: list[str],
    org: Dict[str, Any] = Depends(get_current_org)
):
    """
    Run multiple pipelines in bulk.

    This example shows manual scope validation within the endpoint,
    useful when you need custom logic based on scope combinations.
    """
    # Manual scope check with custom logic
    if not has_scope(org["scopes"], "pipelines:execute"):
        # Check if user has admin wildcard as fallback
        if not has_scope(org["scopes"], "admin:*"):
            raise HTTPException(
                status_code=403,
                detail="Bulk pipeline execution requires pipelines:execute or admin:* scope"
            )

    # Additional check for bulk operations (hypothetical)
    if len(pipeline_ids) > 10:
        # Require admin scope for more than 10 pipelines
        validate_scopes(org, ["admin:*"])

    logger.info(f"Bulk running {len(pipeline_ids)} pipelines for org {org['org_slug']}")

    return {
        "status": "started",
        "pipeline_count": len(pipeline_ids),
        "org_slug": org["org_slug"]
    }


# ============================================
# Example 3: Admin-Only Endpoints
# ============================================

router_admin = APIRouter(prefix="/api/v1/admin", tags=["Admin"])


@router_admin.post("/procedures/sync")
@require_scopes("admin:*")
async def sync_procedures(
    org: Dict[str, Any] = Depends(get_current_org)
):
    """
    Sync stored procedures to BigQuery.

    Required scope: admin:*

    This is an admin-only operation. Only API keys with admin:* scope
    (typically root keys or OWNER role) can execute this.
    """
    logger.info(f"Syncing procedures - initiated by org {org['org_slug']}")

    return {
        "status": "success",
        "message": "Procedures synced to BigQuery"
    }


@router_admin.delete("/organizations/{org_slug}")
@require_scopes("org:delete", "admin:*", require_all=False)
async def delete_organization(
    org_slug: str,
    org: Dict[str, Any] = Depends(get_current_org)
):
    """
    Delete organization (admin operation).

    Required scope: org:delete OR admin:*

    This is a destructive operation that requires elevated permissions.
    Only OWNER role has org:delete scope by default.
    """
    # Additional safety check - ensure org can only delete itself
    if org["org_slug"] != org_slug:
        # Unless they have admin:* wildcard
        validate_scopes(org, ["admin:*"])

    logger.warning(f"Deleting organization {org_slug} - initiated by {org['org_slug']}")

    return {
        "status": "deleted",
        "org_slug": org_slug,
        "message": "Organization marked for deletion"
    }


# ============================================
# Example 4: Integration Endpoints
# ============================================

router_integrations = APIRouter(prefix="/api/v1/integrations", tags=["Integrations"])


@router_integrations.post("/{org_slug}/{provider}/setup")
@require_scopes("integrations:create", "integrations:*", require_all=False)
async def setup_integration(
    org_slug: str,
    provider: str,
    credentials: Dict[str, Any],
    org: Dict[str, Any] = Depends(get_current_org)
):
    """
    Setup cloud provider integration.

    Required scope: integrations:create OR integrations:*

    EDITOR, ADMIN, and OWNER roles have this scope.
    VIEWER does not have create permissions.
    """
    logger.info(f"Setting up {provider} integration for org {org_slug}")

    return {
        "status": "success",
        "provider": provider,
        "org_slug": org_slug,
        "message": f"{provider} integration configured"
    }


@router_integrations.delete("/{org_slug}/{provider}")
@require_scopes("integrations:delete", "integrations:*", require_all=False)
async def delete_integration(
    org_slug: str,
    provider: str,
    org: Dict[str, Any] = Depends(get_current_org)
):
    """
    Delete cloud provider integration.

    Required scope: integrations:delete OR integrations:*

    Only ADMIN and OWNER roles have delete permissions by default.
    """
    logger.info(f"Deleting {provider} integration for org {org_slug}")

    return {
        "status": "deleted",
        "provider": provider,
        "org_slug": org_slug,
        "message": f"{provider} integration removed"
    }


# ============================================
# Example 5: Middleware Integration (main.py)
# ============================================

def create_app_with_scope_middleware() -> FastAPI:
    """
    Example of how to integrate ScopeEnforcementMiddleware in main.py.

    This provides defense-in-depth: middleware checks scopes globally,
    while decorators provide endpoint-specific enforcement.
    """
    app = FastAPI(title="Pipeline Service with Scope Enforcement")

    # Add CORS middleware first
    from fastapi.middleware.cors import CORSMiddleware
    app.add_middleware(
        CORSMiddleware,
        allow_origins=["*"],
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    # Add scope enforcement middleware
    # This runs AFTER auth middleware populates request.state with org data
    app.add_middleware(
        ScopeEnforcementMiddleware,
        route_scopes={
            # Pipeline operations
            "POST:/api/v1/pipelines/run/*": ["pipelines:execute"],
            "GET:/api/v1/pipelines/status/*": ["pipelines:read"],
            "DELETE:/api/v1/pipelines/cancel/*": ["pipelines:cancel"],

            # Scheduler operations
            "POST:/api/v1/scheduler/trigger": ["pipelines:execute"],
            "GET:/api/v1/scheduler/queue": ["pipelines:read"],

            # Admin operations
            "POST:/api/v1/admin/*": ["admin:*"],
            "DELETE:/api/v1/admin/*": ["admin:*"],

            # Integration operations
            "GET:/api/v1/integrations/*": ["integrations:read"],
            "POST:/api/v1/integrations/*/setup": ["integrations:create"],
            "DELETE:/api/v1/integrations/*": ["integrations:delete"],
        },
        # Health checks and docs are exempt
        exempt_paths=[
            "/health",
            "/health/live",
            "/health/ready",
            "/metrics",
            "/docs",
            "/redoc",
            "/openapi.json",
        ]
    )

    # Include routers
    app.include_router(router_pipelines)
    app.include_router(router_admin)
    app.include_router(router_integrations)

    return app


# ============================================
# Example 6: Custom Scope Logic
# ============================================

@router_pipelines.post("/validate-and-run")
async def validate_and_run_pipeline(
    pipeline_id: str,
    validate_only: bool = False,
    org: Dict[str, Any] = Depends(get_current_org)
):
    """
    Example of custom scope logic based on operation mode.

    - validate_only=True: Requires integrations:validate
    - validate_only=False: Requires pipelines:execute
    """
    if validate_only:
        # Validation only requires integrations:validate
        validate_scopes(org, ["integrations:validate", "integrations:*"], require_all=False)

        logger.info(f"Validating pipeline {pipeline_id} for org {org['org_slug']}")
        return {
            "status": "valid",
            "pipeline_id": pipeline_id,
            "message": "Pipeline configuration is valid"
        }
    else:
        # Actual execution requires pipelines:execute
        validate_scopes(org, ["pipelines:execute", "pipelines:*"], require_all=False)

        logger.info(f"Validating and running pipeline {pipeline_id} for org {org['org_slug']}")
        return {
            "status": "started",
            "pipeline_id": pipeline_id,
            "message": "Pipeline validated and execution started"
        }


# ============================================
# Example 7: Role-Based Access
# ============================================

def check_role_access_example():
    """
    Example showing how different roles have different access levels.
    """
    # VIEWER role scopes
    viewer_scopes = ROLE_SCOPES["VIEWER"]
    viewer_org = {"org_slug": "test_org", "scopes": viewer_scopes}

    # VIEWER can read
    assert has_scope(viewer_scopes, "pipelines:read") is True
    assert has_scope(viewer_scopes, "integrations:read") is True

    # VIEWER cannot execute or modify
    assert has_scope(viewer_scopes, "pipelines:execute") is False
    assert has_scope(viewer_scopes, "integrations:create") is False

    # EDITOR role scopes
    editor_scopes = ROLE_SCOPES["EDITOR"]
    editor_org = {"org_slug": "test_org", "scopes": editor_scopes}

    # EDITOR can read and execute
    assert has_scope(editor_scopes, "pipelines:read") is True
    assert has_scope(editor_scopes, "pipelines:execute") is True
    assert has_scope(editor_scopes, "integrations:create") is True

    # EDITOR cannot delete
    assert has_scope(editor_scopes, "integrations:delete") is False

    # ADMIN role scopes
    admin_scopes = ROLE_SCOPES["ADMIN"]
    admin_org = {"org_slug": "test_org", "scopes": admin_scopes}

    # ADMIN has wildcard for pipelines and integrations
    assert has_scope(admin_scopes, "pipelines:execute") is True
    assert has_scope(admin_scopes, "pipelines:cancel") is True
    assert has_scope(admin_scopes, "integrations:delete") is True

    # ADMIN cannot delete org
    assert has_scope(admin_scopes, "org:delete") is False

    # OWNER role scopes
    owner_scopes = ROLE_SCOPES["OWNER"]
    owner_org = {"org_slug": "test_org", "scopes": owner_scopes}

    # OWNER has wildcards for everything
    assert has_scope(owner_scopes, "org:delete") is True
    assert has_scope(owner_scopes, "pipelines:cancel") is True
    assert has_scope(owner_scopes, "billing:update") is True


# ============================================
# Example 8: Database Migration - Add Scopes
# ============================================

"""
SQL to add default scopes to existing API keys:

-- Add ADMIN-level scopes to existing active API keys
UPDATE `{project_id}.organizations.org_api_keys`
SET scopes = [
    'org:read',
    'org:update',
    'pipelines:*',
    'integrations:*',
    'users:read',
    'users:invite',
    'users:remove',
    'api_keys:create',
    'api_keys:read',
    'api_keys:revoke',
    'audit:read'
]
WHERE is_active = TRUE
  AND (scopes IS NULL OR ARRAY_LENGTH(scopes) = 0);

-- Create new API key with VIEWER role
INSERT INTO `{project_id}.organizations.org_api_keys`
(org_api_key_id, org_slug, org_api_key_hash, scopes, is_active, created_at)
VALUES (
    GENERATE_UUID(),
    'test_org',
    SHA256('test_api_key_12345'),
    ['org:read', 'pipelines:read', 'integrations:read', 'users:read'],  -- VIEWER scopes
    TRUE,
    CURRENT_TIMESTAMP()
);

-- Create root admin key with full access
INSERT INTO `{project_id}.organizations.org_api_keys`
(org_api_key_id, org_slug, org_api_key_hash, scopes, is_active, created_at)
VALUES (
    GENERATE_UUID(),
    'system',
    SHA256('root_admin_key_xyz'),
    ['*'],  -- Root wildcard - full access
    TRUE,
    CURRENT_TIMESTAMP()
);
"""


# ============================================
# Example 9: Testing Scope Enforcement
# ============================================

"""
Test script for scope enforcement:

```bash
# Set up test API keys with different scopes

# 1. Create VIEWER API key (read-only)
curl -X POST "http://localhost:8000/api/v1/admin/test-api-key" \
  -H "X-CA-Root-Key: $CA_ROOT_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "org_slug": "test_org",
    "role": "VIEWER",
    "scopes": ["org:read", "pipelines:read", "integrations:read", "users:read"]
  }'

# Save the returned API key
export VIEWER_API_KEY="..."

# 2. Test VIEWER can read pipeline status (should succeed)
curl -X GET "http://localhost:8001/api/v1/pipelines/status/test-run-123" \
  -H "X-API-Key: $VIEWER_API_KEY"

# Expected: 200 OK

# 3. Test VIEWER cannot execute pipeline (should fail)
curl -X POST "http://localhost:8001/api/v1/pipelines/run/test_org/gcp/cost/billing" \
  -H "X-API-Key: $VIEWER_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"date": "2025-12-01"}'

# Expected: 403 Forbidden
# {
#   "error": "Forbidden",
#   "message": "Insufficient permissions. Required scopes: pipelines:execute",
#   "required_scopes": ["pipelines:execute"]
# }

# 4. Create EDITOR API key
curl -X POST "http://localhost:8000/api/v1/admin/test-api-key" \
  -H "X-CA-Root-Key: $CA_ROOT_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "org_slug": "test_org",
    "role": "EDITOR",
    "scopes": ["org:read", "pipelines:read", "pipelines:execute", "integrations:read", "integrations:create"]
  }'

export EDITOR_API_KEY="..."

# 5. Test EDITOR can execute pipeline (should succeed)
curl -X POST "http://localhost:8001/api/v1/pipelines/run/test_org/gcp/cost/billing" \
  -H "X-API-Key: $EDITOR_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"date": "2025-12-01"}'

# Expected: 200 OK
```
"""


if __name__ == "__main__":
    # Run role access check examples
    print("Running role-based access examples...")
    check_role_access_example()
    print("✓ All role access checks passed")

    # Create example app
    print("\nCreating FastAPI app with scope enforcement middleware...")
    app = create_app_with_scope_middleware()
    print(f"✓ App created with {len(app.routes)} routes")

    print("\n✓ Scope enforcement integration examples completed successfully")
