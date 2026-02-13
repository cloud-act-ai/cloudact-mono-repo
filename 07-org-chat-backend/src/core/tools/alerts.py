"""
Alert MCP tools — 4 tools for managing cost alerts.

BQ table: organizations.org_notification_rules
Columns: rule_id, org_slug, name, description, is_active (BOOL), priority,
         rule_category, rule_type, conditions (JSON str), provider_filter (REPEATED),
         service_filter (REPEATED), notify_channel_ids (REPEATED),
         last_triggered_at, trigger_count_today, acknowledged_at, acknowledged_by,
         created_at, updated_at, created_by.

BQ table: organizations.org_alert_history
Columns: alert_history_id, alert_id, org_slug, status, severity,
         trigger_data, condition_results, recipients (REPEATED),
         recipient_count, sent_at, error_message, created_at.
"""

import json
import logging
import uuid
from datetime import datetime, timezone
from typing import Any, Dict, Optional

from google.cloud import bigquery

from src.core.tools.shared import safe_query, get_org_dataset, validate_enum
from src.core.engine.bigquery import execute_query, streaming_insert
from src.core.security.org_validator import validate_org

logger = logging.getLogger(__name__)

_VALID_PRIORITIES = {"info", "warning", "critical"}
_MAX_NAME_LENGTH = 200


def list_alerts(
    org_slug: str,
    status: Optional[str] = None,
) -> Dict[str, Any]:
    """
    List configured cost alert rules for an organization.

    Args:
        org_slug: Organization slug.
        status: Optional filter — 'active' or 'inactive'. Active shows enabled rules only.
    """
    dataset = get_org_dataset()

    query = f"""
        SELECT rule_id, name, description, is_active, priority,
               rule_category, rule_type, conditions,
               provider_filter, service_filter,
               last_triggered_at, trigger_count_today,
               created_at
        FROM `{dataset}.org_notification_rules`
        WHERE org_slug = @org_slug
    """
    params = [bigquery.ScalarQueryParameter("org_slug", "STRING", org_slug)]

    if status == "active":
        query += " AND is_active = TRUE"
    elif status == "inactive":
        query += " AND is_active = FALSE"

    query += " ORDER BY created_at DESC LIMIT 50"

    return safe_query(org_slug, query, params)


def create_alert(
    org_slug: str,
    alert_name: str,
    threshold_value: float,
    provider: Optional[str] = None,
    priority: str = "warning",
    threshold_currency: str = "USD",
    hierarchy_entity_id: Optional[str] = None,
    hierarchy_path: Optional[str] = None,
) -> Dict[str, Any]:
    """
    Create a new cost alert rule.

    Args:
        org_slug: Organization slug.
        alert_name: Human-readable alert name.
        threshold_value: Cost threshold that triggers the alert.
        provider: Optional provider filter (e.g., AWS, GCP, OpenAI).
        priority: Alert priority — info, warning, critical.
        threshold_currency: Currency for threshold (default USD).
        hierarchy_entity_id: Optional hierarchy entity ID (e.g., DEPT-ENG, TEAM-BACKEND).
        hierarchy_path: Optional hierarchy path (e.g., /Acme/Engineering/Backend).
    """
    validate_org(org_slug)
    validate_enum(priority, _VALID_PRIORITIES, "priority")

    alert_name = alert_name.strip()[:_MAX_NAME_LENGTH]
    if not alert_name:
        raise ValueError("alert_name cannot be empty")

    if threshold_value <= 0:
        raise ValueError("threshold_value must be positive")

    dataset = get_org_dataset()

    rule_id = f"chat_{uuid.uuid4().hex[:12]}"
    now = datetime.now(timezone.utc).isoformat()

    conditions_dict = {
        "type": "cost_threshold",
        "threshold_value": threshold_value,
        "threshold_currency": threshold_currency,
        "comparison": "greater_than",
    }
    if hierarchy_entity_id:
        conditions_dict["hierarchy_entity_id"] = hierarchy_entity_id
    if hierarchy_path:
        conditions_dict["hierarchy_path"] = hierarchy_path

    conditions = json.dumps(conditions_dict)

    description = f"Cost alert: notify when costs exceed {threshold_currency} {threshold_value}"
    if hierarchy_entity_id:
        description += f" for {hierarchy_entity_id}"

    row = {
        "rule_id": rule_id,
        "org_slug": org_slug,
        "name": alert_name,
        "description": description,
        "is_active": True,
        "priority": priority,
        "rule_category": "cost_threshold",
        "rule_type": "cost_threshold",
        "conditions": conditions,
        "provider_filter": [provider] if provider else [],
        "service_filter": [],
        "notify_channel_ids": [],
        "created_at": now,
    }

    table_id = f"{dataset}.org_notification_rules"
    streaming_insert(table_id, [row])

    alert_info = {
        "rule_id": rule_id,
        "name": alert_name,
        "priority": priority,
        "threshold_value": threshold_value,
        "threshold_currency": threshold_currency,
        "provider": provider,
    }
    if hierarchy_entity_id:
        alert_info["hierarchy_entity_id"] = hierarchy_entity_id
    if hierarchy_path:
        alert_info["hierarchy_path"] = hierarchy_path

    return {
        "org_slug": org_slug,
        "rule_id": rule_id,
        "status": "created",
        "alert": alert_info,
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
        query += " AND created_at >= TIMESTAMP(@start_date)"
        params.append(bigquery.ScalarQueryParameter("start_date", "STRING", start_date))
    if end_date:
        query += " AND created_at <= TIMESTAMP(@end_date)"
        params.append(bigquery.ScalarQueryParameter("end_date", "STRING", end_date))

    query += " ORDER BY created_at DESC LIMIT @limit"
    params.append(bigquery.ScalarQueryParameter("limit", "INT64", limit))

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

    # Find the alert_id (rule_id) from the history entry
    history_rows = execute_query(
        f"""SELECT alert_id FROM `{dataset}.org_alert_history`
            WHERE alert_history_id = @ahid AND org_slug = @org_slug LIMIT 1""",
        params=[
            bigquery.ScalarQueryParameter("ahid", "STRING", alert_history_id),
            bigquery.ScalarQueryParameter("org_slug", "STRING", org_slug),
        ],
    )

    if not history_rows:
        return {
            "org_slug": org_slug,
            "alert_history_id": alert_history_id,
            "status": "not_found",
        }

    rule_id = history_rows[0]["alert_id"]

    # Update the rule's acknowledged_at on org_notification_rules
    try:
        execute_query(
            f"""UPDATE `{dataset}.org_notification_rules`
                SET acknowledged_at = TIMESTAMP(@ack_at), acknowledged_by = 'chat_agent'
                WHERE rule_id = @rule_id AND org_slug = @org_slug""",
            params=[
                bigquery.ScalarQueryParameter("ack_at", "STRING", now),
                bigquery.ScalarQueryParameter("rule_id", "STRING", rule_id),
                bigquery.ScalarQueryParameter("org_slug", "STRING", org_slug),
            ],
        )
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
        "rule_id": rule_id,
        "status": "acknowledged",
        "acknowledged_at": now,
    }
