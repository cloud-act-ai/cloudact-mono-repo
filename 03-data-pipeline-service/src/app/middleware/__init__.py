"""
Middleware Package

Contains middleware for:
- Scope enforcement (RBAC)
- Audit logging
- Request validation
"""

from src.app.middleware.scope_enforcement import (
    require_scopes,
    validate_scopes,
    has_scope,
    has_any_scope,
    has_all_scopes,
    ROLE_SCOPES,
    ScopeEnforcementMiddleware,
)

from src.app.middleware.audit_logging import (
    AuditLogger,
    get_audit_logger,
    audit_pipeline_execute,
    audit_integration_setup,
    audit_credential_access,
    audit_api_key_create,
)

__all__ = [
    # Scope enforcement
    "require_scopes",
    "validate_scopes",
    "has_scope",
    "has_any_scope",
    "has_all_scopes",
    "ROLE_SCOPES",
    "ScopeEnforcementMiddleware",
    # Audit logging
    "AuditLogger",
    "get_audit_logger",
    "audit_pipeline_execute",
    "audit_integration_setup",
    "audit_credential_access",
    "audit_api_key_create",
]
