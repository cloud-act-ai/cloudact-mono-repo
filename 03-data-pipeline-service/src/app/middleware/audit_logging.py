"""
Audit Logging Middleware
Provides comprehensive audit logging for all org actions.
"""

import uuid
import json
import logging
import threading
from typing import Optional, Dict, Any
from datetime import datetime, timezone
from fastapi import Request

from src.app.config import settings
from src.core.engine.bq_client import get_bigquery_client

logger = logging.getLogger(__name__)


class AuditLogger:
    """
    Audit logger for tracking all org actions.

    Logs to BigQuery organizations.org_audit_logs table.
    Supports both synchronous and background logging.
    """

    def __init__(self):
        self._pending_logs = []
        self._batch_size = 100

    async def log(
        self,
        org_slug: str,
        action: str,
        resource_type: str,
        status: str = "SUCCESS",
        user_id: Optional[str] = None,
        api_key_id: Optional[str] = None,
        resource_id: Optional[str] = None,
        details: Optional[Dict[str, Any]] = None,
        ip_address: Optional[str] = None,
        user_agent: Optional[str] = None,
        request_id: Optional[str] = None,
        error_message: Optional[str] = None,
    ) -> None:
        """
        Log an audit event.

        Args:
            org_slug: Organization identifier
            action: Action type (CREATE, READ, UPDATE, DELETE, EXECUTE, LOGIN, LOGOUT)
            resource_type: Resource type (PIPELINE, INTEGRATION, API_KEY, USER, CREDENTIAL, ORG)
            status: Result status (SUCCESS, FAILURE, DENIED)
            user_id: User who performed the action
            api_key_id: API key used
            resource_id: ID of the affected resource
            details: Additional details (changes, parameters)
            ip_address: Request IP address
            user_agent: User agent string
            request_id: Request tracking ID
            error_message: Error message if failed
        """
        audit_id = str(uuid.uuid4())

        audit_entry = {
            "audit_id": audit_id,
            "org_slug": org_slug,
            "user_id": user_id,
            "api_key_id": api_key_id,
            "action": action,
            "resource_type": resource_type,
            "resource_id": resource_id,
            "details": json.dumps(details) if details else None,
            "ip_address": ip_address,
            "user_agent": user_agent,
            "request_id": request_id,
            "status": status,
            "error_message": error_message,
            "created_at": datetime.now(timezone.utc).isoformat(),
        }

        # Log to Python logger for immediate visibility
        log_level = logging.WARNING if status != "SUCCESS" else logging.INFO
        logger.log(
            log_level,
            f"AUDIT: {action} {resource_type}",
            extra={
                "audit_id": audit_id,
                "org_slug": org_slug,
                "user_id": user_id,
                "action": action,
                "resource_type": resource_type,
                "resource_id": resource_id,
                "status": status,
            }
        )

        # Insert to BigQuery
        try:
            await self._insert_audit_log(audit_entry)
        except Exception as e:
            logger.error(f"Failed to insert audit log: {e}", exc_info=True)

    async def _insert_audit_log(self, audit_entry: Dict[str, Any]) -> None:
        """Insert audit log to BigQuery."""
        from google.cloud import bigquery

        bq_client = get_bigquery_client()

        insert_query = f"""
        INSERT INTO `{settings.gcp_project_id}.organizations.org_audit_logs`
        (audit_id, org_slug, user_id, api_key_id, action, resource_type,
         resource_id, details, ip_address, user_agent, request_id,
         status, error_message, created_at)
        VALUES (
            @audit_id, @org_slug, @user_id, @api_key_id, @action, @resource_type,
            @resource_id, PARSE_JSON(@details), @ip_address, @user_agent, @request_id,
            @status, @error_message, CURRENT_TIMESTAMP()
        )
        """

        job_config = bigquery.QueryJobConfig(
            query_parameters=[
                bigquery.ScalarQueryParameter("audit_id", "STRING", audit_entry["audit_id"]),
                bigquery.ScalarQueryParameter("org_slug", "STRING", audit_entry["org_slug"]),
                bigquery.ScalarQueryParameter("user_id", "STRING", audit_entry.get("user_id")),
                bigquery.ScalarQueryParameter("api_key_id", "STRING", audit_entry.get("api_key_id")),
                bigquery.ScalarQueryParameter("action", "STRING", audit_entry["action"]),
                bigquery.ScalarQueryParameter("resource_type", "STRING", audit_entry["resource_type"]),
                bigquery.ScalarQueryParameter("resource_id", "STRING", audit_entry.get("resource_id")),
                bigquery.ScalarQueryParameter("details", "STRING", audit_entry.get("details")),
                bigquery.ScalarQueryParameter("ip_address", "STRING", audit_entry.get("ip_address")),
                bigquery.ScalarQueryParameter("user_agent", "STRING", audit_entry.get("user_agent")),
                bigquery.ScalarQueryParameter("request_id", "STRING", audit_entry.get("request_id")),
                bigquery.ScalarQueryParameter("status", "STRING", audit_entry["status"]),
                bigquery.ScalarQueryParameter("error_message", "STRING", audit_entry.get("error_message")),
            ]
        )

        bq_client.client.query(insert_query, job_config=job_config).result()

    async def log_from_request(
        self,
        request: Request,
        org_slug: str,
        action: str,
        resource_type: str,
        status: str = "SUCCESS",
        user_id: Optional[str] = None,
        api_key_id: Optional[str] = None,
        resource_id: Optional[str] = None,
        details: Optional[Dict[str, Any]] = None,
        error_message: Optional[str] = None,
    ) -> None:
        """
        Log an audit event with request context.

        Args:
            request: FastAPI Request object
            ... (other args same as log())
        """
        # Extract request metadata
        ip_address = request.client.host if request.client else None
        user_agent = request.headers.get("user-agent")
        request_id = request.headers.get("x-request-id")

        await self.log(
            org_slug=org_slug,
            action=action,
            resource_type=resource_type,
            status=status,
            user_id=user_id,
            api_key_id=api_key_id,
            resource_id=resource_id,
            details=details,
            ip_address=ip_address,
            user_agent=user_agent,
            request_id=request_id,
            error_message=error_message,
        )


# Thread-safe singleton instance
_audit_logger: Optional[AuditLogger] = None
_audit_logger_lock = threading.Lock()


def get_audit_logger() -> AuditLogger:
    """Get or create the global audit logger instance (thread-safe)."""
    global _audit_logger
    if _audit_logger is not None:
        return _audit_logger
    with _audit_logger_lock:
        if _audit_logger is None:
            _audit_logger = AuditLogger()
        return _audit_logger


# Convenience functions for common audit events
async def audit_pipeline_execute(
    request: Request,
    org_slug: str,
    pipeline_id: str,
    user_id: Optional[str] = None,
    api_key_id: Optional[str] = None,
    status: str = "SUCCESS",
    details: Optional[Dict[str, Any]] = None,
    error_message: Optional[str] = None,
) -> None:
    """Log pipeline execution audit event."""
    await get_audit_logger().log_from_request(
        request=request,
        org_slug=org_slug,
        action="EXECUTE",
        resource_type="PIPELINE",
        resource_id=pipeline_id,
        user_id=user_id,
        api_key_id=api_key_id,
        status=status,
        details=details,
        error_message=error_message,
    )


async def audit_integration_setup(
    request: Request,
    org_slug: str,
    provider: str,
    user_id: Optional[str] = None,
    api_key_id: Optional[str] = None,
    status: str = "SUCCESS",
    error_message: Optional[str] = None,
) -> None:
    """Log integration setup audit event."""
    await get_audit_logger().log_from_request(
        request=request,
        org_slug=org_slug,
        action="CREATE",
        resource_type="INTEGRATION",
        resource_id=provider,
        user_id=user_id,
        api_key_id=api_key_id,
        status=status,
        error_message=error_message,
    )


async def audit_credential_access(
    request: Request,
    org_slug: str,
    provider: str,
    user_id: Optional[str] = None,
    api_key_id: Optional[str] = None,
    status: str = "SUCCESS",
) -> None:
    """Log credential access audit event."""
    await get_audit_logger().log_from_request(
        request=request,
        org_slug=org_slug,
        action="READ",
        resource_type="CREDENTIAL",
        resource_id=provider,
        user_id=user_id,
        api_key_id=api_key_id,
        status=status,
    )


async def audit_api_key_create(
    request: Request,
    org_slug: str,
    new_api_key_id: str,
    user_id: Optional[str] = None,
    api_key_id: Optional[str] = None,
    status: str = "SUCCESS",
    scopes: Optional[list] = None,
) -> None:
    """Log API key creation audit event."""
    await get_audit_logger().log_from_request(
        request=request,
        org_slug=org_slug,
        action="CREATE",
        resource_type="API_KEY",
        resource_id=new_api_key_id,
        user_id=user_id,
        api_key_id=api_key_id,
        status=status,
        details={"scopes": scopes} if scopes else None,
    )
