"""
Audit Logging Utility
Logs all mutating operations (CREATE/UPDATE/DELETE) to org_audit_logs table.

Issue #32: Missing Audit Logs
"""

import logging
import uuid
import json
from typing import Optional, Dict, Any
from datetime import datetime
from google.cloud import bigquery

from src.app.config import settings
from src.core.engine.bq_client import get_bigquery_client

logger = logging.getLogger(__name__)


class AuditLogger:
    """
    Centralized audit logger for tracking all operations.

    All mutating operations (CREATE, UPDATE, DELETE, EXECUTE) are logged to
    the org_audit_logs table in BigQuery for compliance and security auditing.
    """

    # Action types
    ACTION_CREATE = "CREATE"
    ACTION_READ = "READ"
    ACTION_UPDATE = "UPDATE"
    ACTION_DELETE = "DELETE"
    ACTION_EXECUTE = "EXECUTE"
    ACTION_ROTATE = "ROTATE"

    # Resource types
    RESOURCE_ORG = "ORGANIZATION"
    RESOURCE_API_KEY = "API_KEY"
    RESOURCE_USER = "USER"
    RESOURCE_INTEGRATION = "INTEGRATION"
    RESOURCE_CREDENTIAL = "CREDENTIAL"
    RESOURCE_PIPELINE = "PIPELINE"
    RESOURCE_SUBSCRIPTION = "SUBSCRIPTION"
    RESOURCE_QUOTA = "QUOTA"

    # Status
    STATUS_SUCCESS = "SUCCESS"
    STATUS_FAILURE = "FAILURE"
    STATUS_DENIED = "DENIED"

    def __init__(self):
        """Initialize audit logger."""
        self.bq_client = None

    def _get_bq_client(self):
        """Lazy load BigQuery client."""
        if self.bq_client is None:
            self.bq_client = get_bigquery_client()
        return self.bq_client

    async def log_operation(
        self,
        org_slug: str,
        action: str,
        resource_type: str,
        status: str,
        resource_id: Optional[str] = None,
        user_id: Optional[str] = None,
        api_key_id: Optional[str] = None,
        details: Optional[Dict[str, Any]] = None,
        ip_address: Optional[str] = None,
        user_agent: Optional[str] = None,
        request_id: Optional[str] = None,
        error_message: Optional[str] = None
    ) -> bool:
        """
        Log an operation to the audit log.

        Args:
            org_slug: Organization identifier
            action: Action type (CREATE, UPDATE, DELETE, etc.)
            resource_type: Resource type (ORGANIZATION, API_KEY, etc.)
            status: Operation status (SUCCESS, FAILURE, DENIED)
            resource_id: Optional identifier of the affected resource
            user_id: Optional user identifier
            api_key_id: Optional API key identifier
            details: Optional additional details (JSON)
            ip_address: Optional client IP address
            user_agent: Optional client user agent
            request_id: Optional request identifier
            error_message: Optional error message if failed

        Returns:
            True if logged successfully, False otherwise
        """
        try:
            audit_id = str(uuid.uuid4())

            # Prepare details as JSON string
            details_json = json.dumps(details) if details else None

            # Insert audit log entry
            # Note: details column is JSON type, so we use PARSE_JSON() to convert string to JSON
            insert_query = f"""
            INSERT INTO `{settings.gcp_project_id}.organizations.org_audit_logs`
            (audit_id, org_slug, user_id, api_key_id, action, resource_type, resource_id,
             details, ip_address, user_agent, request_id, status, error_message, created_at)
            VALUES
            (@audit_id, @org_slug, @user_id, @api_key_id, @action, @resource_type, @resource_id,
             PARSE_JSON(@details), @ip_address, @user_agent, @request_id, @status, @error_message, CURRENT_TIMESTAMP())
            """

            bq_client = self._get_bq_client()

            job_config = bigquery.QueryJobConfig(
                query_parameters=[
                    bigquery.ScalarQueryParameter("audit_id", "STRING", audit_id),
                    bigquery.ScalarQueryParameter("org_slug", "STRING", org_slug),
                    bigquery.ScalarQueryParameter("user_id", "STRING", user_id),
                    bigquery.ScalarQueryParameter("api_key_id", "STRING", api_key_id),
                    bigquery.ScalarQueryParameter("action", "STRING", action),
                    bigquery.ScalarQueryParameter("resource_type", "STRING", resource_type),
                    bigquery.ScalarQueryParameter("resource_id", "STRING", resource_id),
                    bigquery.ScalarQueryParameter("details", "STRING", details_json),
                    bigquery.ScalarQueryParameter("ip_address", "STRING", ip_address),
                    bigquery.ScalarQueryParameter("user_agent", "STRING", user_agent),
                    bigquery.ScalarQueryParameter("request_id", "STRING", request_id),
                    bigquery.ScalarQueryParameter("status", "STRING", status),
                    bigquery.ScalarQueryParameter("error_message", "STRING", error_message)
                ],
                job_timeout_ms=60000  # 60 seconds for audit logging
            )

            bq_client.client.query(insert_query, job_config=job_config).result()

            logger.info(
                f"Audit log entry created",
                extra={
                    "audit_id": audit_id,
                    "org_slug": org_slug,
                    "action": action,
                    "resource_type": resource_type,
                    "status": status
                }
            )

            return True

        except Exception as e:
            # CRITICAL: Audit logging failure should be logged but not block operations
            logger.error(
                f"Failed to create audit log entry: {e}",
                extra={
                    "org_slug": org_slug,
                    "action": action,
                    "resource_type": resource_type,
                    "status": status
                },
                exc_info=True
            )
            return False


# Global audit logger instance
_audit_logger = AuditLogger()


async def log_audit(
    org_slug: str,
    action: str,
    resource_type: str,
    status: str = AuditLogger.STATUS_SUCCESS,
    **kwargs
) -> bool:
    """
    Convenience function for logging audit events.

    Args:
        org_slug: Organization identifier
        action: Action type
        resource_type: Resource type
        status: Operation status
        **kwargs: Additional arguments for log_operation

    Returns:
        True if logged successfully, False otherwise
    """
    return await _audit_logger.log_operation(
        org_slug=org_slug,
        action=action,
        resource_type=resource_type,
        status=status,
        **kwargs
    )


async def log_create(
    org_slug: str,
    resource_type: str,
    resource_id: Optional[str] = None,
    **kwargs
) -> bool:
    """Log a CREATE operation."""
    return await log_audit(
        org_slug=org_slug,
        action=AuditLogger.ACTION_CREATE,
        resource_type=resource_type,
        resource_id=resource_id,
        **kwargs
    )


async def log_update(
    org_slug: str,
    resource_type: str,
    resource_id: Optional[str] = None,
    **kwargs
) -> bool:
    """Log an UPDATE operation."""
    return await log_audit(
        org_slug=org_slug,
        action=AuditLogger.ACTION_UPDATE,
        resource_type=resource_type,
        resource_id=resource_id,
        **kwargs
    )


async def log_delete(
    org_slug: str,
    resource_type: str,
    resource_id: Optional[str] = None,
    **kwargs
) -> bool:
    """Log a DELETE operation."""
    return await log_audit(
        org_slug=org_slug,
        action=AuditLogger.ACTION_DELETE,
        resource_type=resource_type,
        resource_id=resource_id,
        **kwargs
    )


async def log_execute(
    org_slug: str,
    resource_type: str,
    resource_id: Optional[str] = None,
    **kwargs
) -> bool:
    """Log an EXECUTE operation."""
    return await log_audit(
        org_slug=org_slug,
        action=AuditLogger.ACTION_EXECUTE,
        resource_type=resource_type,
        resource_id=resource_id,
        **kwargs
    )
