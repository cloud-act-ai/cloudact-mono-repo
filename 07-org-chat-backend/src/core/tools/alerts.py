"""
Alert MCP tools — 4 tools for managing cost alerts.
"""

import logging
import uuid
from datetime import datetime, timezone
from typing import Any, Dict, Optional

from google.cloud import bigquery

from src.core.tools.shared import safe_query, get_org_dataset, validate_enum
from src.core.engine.bigquery import execute_query, streaming_insert
from src.core.security.org_validator import validate_org

logger = logging.getLogger(__name__)

_VALID_SEVERITIES = {"info", "warning", "critical"}
_VALID_ALERT_STATUSES = {"active", "paused", "disabled"}
_MAX_ALERT_NAME_LENGTH = 200


def list_alerts(
    org_slug: str,
    status: Optional[str] = None,
) -> Dict[str, Any]:
    """
    List configured cost alerts for an organization.

    Args:
        org_slug: Organization slug.
        status: Optional filter by status (active, paused, disabled).
    """
    dataset = get_org_dataset()

    query = f"""
        SELECT alert_id, alert_name, alert_type, severity, status,
               threshold_value, threshold_currency, provider_filter,
               created_at
        FROM `{dataset}.org_notification_rules`
        WHERE org_slug = @org_slug
    """
    params = [bigquery.ScalarQueryParameter("org_slug", "STRING", org_slug)]

    if status:
        validate_enum(status, _VALID_ALERT_STATUSES, "status")
        query += " AND status = @status"
        params.append(bigquery.ScalarQueryParameter("status", "STRING", status))

    query += " ORDER BY created_at DESC LIMIT 50"

    return safe_query(org_slug, query, params)


def create_alert(
    org_slug: str,
    alert_name: str,
    threshold_value: float,
    provider: Optional[str] = None,
    severity: str = "warning",
    threshold_currency: str = "USD",
) -> Dict[str, Any]:
    """
    Create a new cost alert rule.

    Args:
        org_slug: Organization slug.
        alert_name: Human-readable alert name.
        threshold_value: Cost threshold that triggers the alert.
        provider: Optional provider filter (e.g., AWS, GCP).
        severity: Alert severity — info, warning, critical.
        threshold_currency: Currency for threshold (default USD).
    """
    validate_org(org_slug)
    validate_enum(severity, _VALID_SEVERITIES, "severity")

    # Sanitize alert_name
    alert_name = alert_name.strip()[:_MAX_ALERT_NAME_LENGTH]
    if not alert_name:
        raise ValueError("alert_name cannot be empty")

    if threshold_value <= 0:
        raise ValueError("threshold_value must be positive")

    dataset = get_org_dataset()

    alert_id = f"chat_{uuid.uuid4().hex[:12]}"
    now = datetime.now(timezone.utc).isoformat()

    row = {
        "alert_id": alert_id,
        "org_slug": org_slug,
        "alert_name": alert_name,
        "alert_type": "cost_threshold",
        "severity": severity,
        "status": "active",
        "threshold_value": threshold_value,
        "threshold_currency": threshold_currency,
        "provider_filter": provider,
        "created_at": now,
    }

    table_id = f"{dataset}.org_notification_rules"
    streaming_insert(table_id, [row])

    return {
        "org_slug": org_slug,
        "alert_id": alert_id,
        "status": "created",
        "alert": row,
    }


def alert_history(
    org_slug: str,
    start_date: Optional[str] = None,
    end_date: Optional[str] = None,
    limit: int = 20,
) -> Dict[str, Any]:
    """
    View alert trigger history.

    Args:
        org_slug: Organization slug.
        start_date: Start date YYYY-MM-DD.
        end_date: End date YYYY-MM-DD.
        limit: Maximum results (1-100, default 20).
    """
    dataset = get_org_dataset()
    limit = max(1, min(limit, 100))

    query = f"""
        SELECT alert_history_id, alert_id, org_slug, status, severity,
               trigger_data, sent_at, created_at
        FROM `{dataset}.org_alert_history`
        WHERE org_slug = @org_slug
    """
    params = [bigquery.ScalarQueryParameter("org_slug", "STRING", org_slug)]

    if start_date:
        query += " AND created_at >= @start_date"
        params.append(bigquery.ScalarQueryParameter("start_date", "STRING", start_date))
    if end_date:
        query += " AND created_at <= @end_date"
        params.append(bigquery.ScalarQueryParameter("end_date", "STRING", end_date))

    query += f" ORDER BY created_at DESC LIMIT {limit}"

    return safe_query(org_slug, query, params)


def acknowledge_alert(
    org_slug: str,
    alert_history_id: str,
) -> Dict[str, Any]:
    """
    Acknowledge a triggered alert.

    Args:
        org_slug: Organization slug.
        alert_history_id: The alert history entry to acknowledge.
    """
    validate_org(org_slug)
    dataset = get_org_dataset()
    now = datetime.now(timezone.utc).isoformat()

    # Update alert history status in BigQuery
    update_query = f"""
        UPDATE `{dataset}.org_alert_history`
        SET status = 'acknowledged', acknowledged_at = @ack_at
        WHERE alert_history_id = @alert_history_id AND org_slug = @org_slug
    """
    params = [
        bigquery.ScalarQueryParameter("ack_at", "STRING", now),
        bigquery.ScalarQueryParameter("alert_history_id", "STRING", alert_history_id),
        bigquery.ScalarQueryParameter("org_slug", "STRING", org_slug),
    ]

    try:
        execute_query(update_query, params)
    except Exception as e:
        logger.error(f"Failed to acknowledge alert {alert_history_id}: {e}")
        return {
            "org_slug": org_slug,
            "alert_history_id": alert_history_id,
            "status": "error",
            "error": str(e),
        }

    return {
        "org_slug": org_slug,
        "alert_history_id": alert_history_id,
        "status": "acknowledged",
        "acknowledged_at": now,
    }
