"""
Alert Scheduler Router

Endpoints for Cloud Scheduler to trigger alert evaluations.
"""

from fastapi import APIRouter, Depends, HTTPException, status, Query
from typing import List, Optional
import logging

from src.app.dependencies.auth import verify_admin_key
from src.core.alerts import AlertEngine, get_alert_engine

logger = logging.getLogger(__name__)

router = APIRouter(
    prefix="/alerts",
    tags=["alerts"],
)


@router.post(
    "/scheduler/evaluate",
    summary="Evaluate scheduled alerts (Cloud Scheduler)",
    description="Called by Cloud Scheduler to evaluate all due alerts. Requires admin API key.",
    response_model=dict,
)
async def evaluate_scheduled_alerts(
    alert_ids: Optional[List[str]] = Query(
        default=None,
        description="Specific alert IDs to evaluate. If not provided, evaluates all enabled alerts."
    ),
    force_check: bool = Query(
        default=False,
        description="Ignore cooldown periods and force evaluation"
    ),
    _admin_context: None = Depends(verify_admin_key)
):
    """
    Evaluate scheduled alerts.

    Called by Cloud Scheduler at configured intervals (e.g., daily 8 AM UTC).

    Flow:
    1. Load all enabled alert configurations from YAML
    2. Execute BigQuery queries to get current cost data
    3. Evaluate conditions against thresholds
    4. Resolve recipients for triggered alerts (org owners from Supabase)
    5. Send email notifications
    6. Record history in BigQuery

    Security:
    - Requires admin API key (X-CA-Root-Key header)
    """
    try:
        engine = get_alert_engine()
        summary = await engine.evaluate_all_alerts(
            alert_ids=alert_ids,
            force_check=force_check
        )

        logger.info(
            f"Alert evaluation complete: {summary.triggered} triggered, "
            f"{summary.skipped_cooldown} cooldown, {summary.no_match} no match, "
            f"{summary.errors} errors"
        )

        return {
            "status": "SUCCESS",
            "summary": {
                "triggered": summary.triggered,
                "skipped_cooldown": summary.skipped_cooldown,
                "skipped_disabled": summary.skipped_disabled,
                "no_match": summary.no_match,
                "no_data": summary.no_data,
                "errors": summary.errors,
            },
            "duration_ms": round(summary.duration_ms, 2),
            "details": summary.details,
        }

    except Exception as e:
        logger.error(f"Alert evaluation failed: {e}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Alert evaluation failed"
        )


@router.get(
    "/configs",
    summary="List alert configurations",
    description="Get all configured alerts from YAML files. Requires admin API key.",
    response_model=dict,
)
async def list_alert_configs(
    enabled_only: bool = Query(
        default=False,
        description="Only return enabled alerts"
    ),
    tag: Optional[str] = Query(
        default=None,
        description="Filter by tag"
    ),
    _admin_context: None = Depends(verify_admin_key)
):
    """
    List all alert configurations.

    Returns the parsed YAML configurations for review.
    """
    engine = get_alert_engine()
    alerts = engine.config_loader.load_all_alerts()

    if enabled_only:
        alerts = [a for a in alerts if a.enabled]

    if tag:
        alerts = [a for a in alerts if tag in a.tags]

    return {
        "alerts": [a.model_dump() for a in alerts],
        "total": len(alerts),
    }


@router.get(
    "/configs/{alert_id}",
    summary="Get specific alert configuration",
    description="Get a single alert configuration by ID. Requires admin API key.",
    response_model=dict,
)
async def get_alert_config(
    alert_id: str,
    _admin_context: None = Depends(verify_admin_key)
):
    """Get a specific alert configuration."""
    engine = get_alert_engine()
    alert = engine.config_loader.get_alert_by_id(alert_id)

    if not alert:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Alert not found: {alert_id}"
        )

    return {
        "alert": alert.model_dump(),
    }


@router.post(
    "/configs/{alert_id}/test",
    summary="Test a specific alert",
    description="Force evaluate a specific alert, ignoring cooldown. Requires admin API key.",
    response_model=dict,
)
async def test_alert(
    alert_id: str,
    dry_run: bool = Query(
        default=True,
        description="If true, don't send notifications (just evaluate)"
    ),
    _admin_context: None = Depends(verify_admin_key)
):
    """
    Test a specific alert configuration.

    Useful for debugging and validation before enabling in production.
    """
    engine = get_alert_engine()

    # Verify alert exists
    alert = engine.config_loader.get_alert_by_id(alert_id)
    if not alert:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Alert not found: {alert_id}"
        )

    # Evaluate with force_check to ignore cooldown
    summary = await engine.evaluate_all_alerts(
        alert_ids=[alert_id],
        force_check=True
    )

    return {
        "alert_id": alert_id,
        "alert_name": alert.name,
        "dry_run": dry_run,
        "summary": {
            "triggered": summary.triggered,
            "no_match": summary.no_match,
            "errors": summary.errors,
        },
        "duration_ms": round(summary.duration_ms, 2),
        "details": summary.details,
    }


@router.post(
    "/cache/clear",
    summary="Clear alert configuration cache",
    description="Force reload of alert configurations from YAML files. Requires admin API key.",
    response_model=dict,
)
async def clear_alert_cache(
    _admin_context: None = Depends(verify_admin_key)
):
    """Clear the alert configuration cache."""
    engine = get_alert_engine()
    engine.config_loader.clear_cache()

    return {
        "status": "SUCCESS",
        "message": "Alert configuration cache cleared",
    }


# ==============================================================================
# Org-Specific Endpoints (with org validation)
# CRITICAL-003 FIX: Added org validation for multi-tenant security
# ==============================================================================

@router.post(
    "/orgs/{org_slug}/evaluate",
    summary="Evaluate alerts for specific organization",
    description="Evaluate all alerts for a specific organization. Validates org context.",
    response_model=dict,
)
async def evaluate_org_alerts(
    org_slug: str,
    alert_ids: Optional[List[str]] = Query(
        default=None,
        description="Specific alert IDs to evaluate"
    ),
    force_check: bool = Query(
        default=False,
        description="Ignore cooldown periods"
    ),
    _admin_context: None = Depends(verify_admin_key)
):
    """
    Evaluate alerts for a specific organization.

    CRITICAL-003 FIX: This endpoint validates that:
    1. The org_slug is provided and non-empty
    2. Only data for this specific org is queried
    3. Notifications are sent only to this org's recipients

    Use this endpoint for org-specific testing and manual triggering.
    """
    # Validate org_slug
    if not org_slug or not org_slug.strip():
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="org_slug is required and cannot be empty"
        )

    # Sanitize org_slug (only allow alphanumeric, underscores, hyphens)
    import re
    if not re.match(r'^[a-zA-Z0-9_-]+$', org_slug):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="org_slug contains invalid characters"
        )

    try:
        engine = get_alert_engine()

        # Evaluate only for this org
        summary = await engine.evaluate_alerts_for_org(
            org_slug=org_slug,
            alert_ids=alert_ids,
            force_check=force_check
        )

        logger.info(
            f"Org alert evaluation complete for {org_slug}: {summary.triggered} triggered"
        )

        return {
            "status": "SUCCESS",
            "org_slug": org_slug,
            "summary": {
                "triggered": summary.triggered,
                "skipped_cooldown": summary.skipped_cooldown,
                "skipped_disabled": summary.skipped_disabled,
                "no_match": summary.no_match,
                "no_data": summary.no_data,
                "errors": summary.errors,
            },
            "duration_ms": round(summary.duration_ms, 2),
            "details": summary.details,
        }

    except Exception as e:
        logger.error(f"Org alert evaluation failed for {org_slug}: {e}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Alert evaluation failed"
        )


@router.get(
    "/orgs/{org_slug}/history",
    summary="Get alert history for organization",
    description="Get alert evaluation history for a specific organization.",
    response_model=dict,
)
async def get_org_alert_history(
    org_slug: str,
    alert_id: Optional[str] = Query(None, description="Filter by alert ID"),
    status_filter: Optional[str] = Query(None, alias="status", description="Filter by status"),
    days: int = Query(7, ge=1, le=90, description="Days to look back"),
    limit: int = Query(50, ge=1, le=500, description="Max results"),
    _admin_context: None = Depends(verify_admin_key)
):
    """
    Get alert history for a specific organization.

    CRITICAL-003 FIX: Validates org_slug to prevent cross-org data access.
    """
    # Validate org_slug
    if not org_slug or not org_slug.strip():
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="org_slug is required and cannot be empty"
        )

    import re
    if not re.match(r'^[a-zA-Z0-9_-]+$', org_slug):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="org_slug contains invalid characters"
        )

    try:
        from google.cloud import bigquery
        import os

        project_id = os.environ.get("GCP_PROJECT_ID", "cloudact-testing-1")
        client = bigquery.Client(project=project_id)

        # Build query with org isolation
        conditions = ["org_slug = @org_slug"]
        params = [
            bigquery.ScalarQueryParameter("org_slug", "STRING", org_slug),
            bigquery.ScalarQueryParameter("days", "INT64", days),
        ]

        if alert_id:
            conditions.append("alert_id = @alert_id")
            params.append(bigquery.ScalarQueryParameter("alert_id", "STRING", alert_id))

        if status_filter:
            conditions.append("status = @status")
            params.append(bigquery.ScalarQueryParameter("status", "STRING", status_filter))

        query = f"""
        SELECT *
        FROM `{project_id}.organizations.org_alert_history`
        WHERE {' AND '.join(conditions)}
          AND created_at > TIMESTAMP_SUB(CURRENT_TIMESTAMP(), INTERVAL @days DAY)
        ORDER BY created_at DESC
        LIMIT {limit}
        """

        job_config = bigquery.QueryJobConfig(query_parameters=params)
        results = list(client.query(query, job_config=job_config).result())

        history = []
        for row in results:
            history.append({
                "alert_history_id": row.alert_history_id,
                "alert_id": row.alert_id,
                "org_slug": row.org_slug,
                "status": row.status,
                "severity": row.severity,
                "trigger_data": row.trigger_data,
                "recipients": list(row.recipients) if row.recipients else [],
                "recipient_count": row.recipient_count,
                "sent_at": row.sent_at.isoformat() if row.sent_at else None,
                "error_message": row.error_message,
                "created_at": row.created_at.isoformat() if row.created_at else None,
            })

        return {
            "success": True,
            "org_slug": org_slug,
            "history": history,
            "count": len(history),
        }

    except Exception as e:
        logger.error(f"Failed to get alert history for {org_slug}: {e}", exc_info=True)
        # Return empty list if table doesn't exist
        if "Not found" in str(e):
            return {"success": True, "org_slug": org_slug, "history": [], "count": 0}
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to retrieve alert history"
        )
