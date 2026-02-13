"""
Cost Alerts Router

Simplified API endpoints for cost threshold alerts.
Provides a frontend-friendly interface that transforms to full ScheduledAlertCreate models.
"""

import os
import logging
from typing import Optional, List
from fastapi import APIRouter, Depends, HTTPException, Query, Path

from src.core.services.notification_crud import (
    get_notification_settings_service,
    AlertType,
    AlertSeverity,
    QueryTemplate,
    ScheduledAlert,
    ScheduledAlertUpdate,
    AlertCondition,
)
from src.core.services.notification_crud.models import (
    CostAlertScope,
    CostAlertSummary,
    CostAlertCreateRequest,
    CostAlertUpdateRequest,
    SCOPE_TO_QUERY_TEMPLATE,
)
from src.app.dependencies.auth import get_current_org

logger = logging.getLogger(__name__)

router = APIRouter(
    prefix="/cost-alerts",
    tags=["Cost Alerts"],
)


def get_service():
    """Get notification settings service."""
    project_id = os.environ.get("GCP_PROJECT_ID", "cloudact-testing-1")
    return get_notification_settings_service(project_id)


def _query_template_to_scope(template: QueryTemplate) -> CostAlertScope:
    """Convert QueryTemplate enum to CostAlertScope."""
    template_to_scope = {v: k for k, v in SCOPE_TO_QUERY_TEMPLATE.items()}
    return template_to_scope.get(template, CostAlertScope.ALL)


def _alert_to_summary(alert: ScheduledAlert) -> CostAlertSummary:
    """Convert full ScheduledAlert to simplified CostAlertSummary."""
    # Extract threshold from conditions
    threshold_value = 0.0
    threshold_currency = "USD"
    if alert.conditions:
        first_condition = alert.conditions[0]
        threshold_value = first_condition.value
        threshold_currency = first_condition.unit

    # Determine scope from query template
    scope = _query_template_to_scope(alert.source_query_template)

    return CostAlertSummary(
        alert_id=alert.alert_id,
        name=alert.name,
        scope=scope,
        threshold_value=threshold_value,
        threshold_currency=threshold_currency,
        is_enabled=alert.is_enabled,
        last_triggered_at=alert.last_triggered_at,
        severity=alert.severity,
        channels=alert.channels,
        schedule_cron=alert.schedule_cron,
    )


# ==============================================================================
# Cost Alert Endpoints
# ==============================================================================

@router.get(
    "/{org_slug}",
    response_model=List[CostAlertSummary],
    summary="List cost alerts",
    description="List all cost threshold alerts for an organization in simplified format",
)
async def list_cost_alerts(
    org_slug: str = Path(..., description="Organization slug"),
    scope: Optional[CostAlertScope] = Query(None, description="Filter by cost scope"),
    enabled_only: bool = Query(False, description="Only return enabled alerts"),
    current_org: dict = Depends(get_current_org),
):
    """List cost threshold alerts for an organization."""
    if current_org.get("org_slug") != org_slug:
        raise HTTPException(status_code=403, detail="Access denied to this organization")

    service = get_service()
    try:
        # Get all cost_threshold alerts
        alerts = await service.list_scheduled_alerts(
            org_slug,
            alert_type=AlertType.COST_THRESHOLD,
            enabled_only=enabled_only
        )

        # Convert to simplified format
        summaries = [_alert_to_summary(alert) for alert in alerts]

        # Filter by scope if specified
        if scope:
            summaries = [s for s in summaries if s.scope == scope]

        return summaries

    except Exception as e:
        logger.error(f"Failed to list cost alerts for {org_slug}: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail="Failed to retrieve cost alerts")


@router.get(
    "/{org_slug}/{alert_id}",
    response_model=CostAlertSummary,
    summary="Get cost alert",
    description="Get a specific cost alert in simplified format",
)
async def get_cost_alert(
    org_slug: str = Path(..., description="Organization slug"),
    alert_id: str = Path(..., description="Alert ID"),
    current_org: dict = Depends(get_current_org),
):
    """Get a specific cost alert."""
    if current_org.get("org_slug") != org_slug:
        raise HTTPException(status_code=403, detail="Access denied to this organization")

    service = get_service()
    try:
        alert = await service.get_scheduled_alert(org_slug, alert_id)
        if not alert:
            raise HTTPException(status_code=404, detail="Cost alert not found")

        # SECURITY: Defense-in-depth validation of org isolation
        if alert.org_slug != org_slug:
            logger.warning(f"Org mismatch: requested {org_slug}, got {alert.org_slug}")
            raise HTTPException(status_code=404, detail="Cost alert not found")

        # Verify it's a cost_threshold alert
        if alert.alert_type != AlertType.COST_THRESHOLD:
            raise HTTPException(status_code=404, detail="Cost alert not found")

        return _alert_to_summary(alert)

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Failed to get cost alert {alert_id}: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail="Failed to retrieve cost alert")


@router.post(
    "/{org_slug}",
    response_model=CostAlertSummary,
    status_code=201,
    summary="Create cost alert",
    description="Create a new cost threshold alert using simplified request format",
)
async def create_cost_alert(
    org_slug: str = Path(..., description="Organization slug"),
    request: CostAlertCreateRequest = ...,
    current_org: dict = Depends(get_current_org),
):
    """Create a new cost threshold alert."""
    if current_org.get("org_slug") != org_slug:
        raise HTTPException(status_code=403, detail="Access denied to this organization")

    service = get_service()
    try:
        # Convert simplified request to full ScheduledAlertCreate
        full_alert = request.to_scheduled_alert_create()

        # Create the alert
        created = await service.create_scheduled_alert(
            org_slug, full_alert, current_org.get("admin_email")
        )

        return _alert_to_summary(created)

    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        logger.error(f"Failed to create cost alert: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail="Failed to create cost alert")


@router.put(
    "/{org_slug}/{alert_id}",
    response_model=CostAlertSummary,
    summary="Update cost alert",
    description="Update a cost threshold alert",
)
async def update_cost_alert(
    org_slug: str = Path(..., description="Organization slug"),
    alert_id: str = Path(..., description="Alert ID"),
    request: CostAlertUpdateRequest = ...,
    current_org: dict = Depends(get_current_org),
):
    """Update a cost threshold alert."""
    if current_org.get("org_slug") != org_slug:
        raise HTTPException(status_code=403, detail="Access denied to this organization")

    service = get_service()
    try:
        # Get existing alert first
        existing = await service.get_scheduled_alert(org_slug, alert_id)
        if not existing:
            raise HTTPException(status_code=404, detail="Cost alert not found")

        # Build update model
        update_data = {}

        if request.name is not None:
            update_data["name"] = request.name
        if request.description is not None:
            update_data["description"] = request.description
        if request.is_enabled is not None:
            update_data["is_enabled"] = request.is_enabled
        if request.severity is not None:
            update_data["severity"] = request.severity
        if request.channels is not None:
            update_data["channels"] = request.channels
        if request.cooldown_hours is not None:
            update_data["cooldown_hours"] = request.cooldown_hours
        if request.schedule_cron is not None:
            update_data["schedule_cron"] = request.schedule_cron

        # Handle threshold update
        if request.threshold_value is not None or request.threshold_currency is not None:
            # Get existing condition values
            existing_value = existing.conditions[0].value if existing.conditions else 0
            existing_unit = existing.conditions[0].unit if existing.conditions else "USD"

            update_data["conditions"] = [
                AlertCondition(
                    field="total_cost",
                    operator="gt",
                    value=request.threshold_value if request.threshold_value is not None else existing_value,
                    unit=request.threshold_currency if request.threshold_currency is not None else existing_unit,
                )
            ]

        # Handle period/hierarchy_path update
        if request.period is not None or request.hierarchy_path is not None:
            existing_params = existing.source_params if existing.source_params is not None else {}
            source_params = {
                "period": request.period if request.period is not None else existing_params.get("period", "current_month")
            }
            if request.hierarchy_path is not None:
                source_params["hierarchy_path"] = request.hierarchy_path
            elif existing_params.get("hierarchy_path"):
                source_params["hierarchy_path"] = existing_params["hierarchy_path"]
            update_data["source_params"] = source_params

        # Apply update
        update = ScheduledAlertUpdate(**update_data)
        updated = await service.update_scheduled_alert(
            org_slug, alert_id, update, current_org.get("admin_email")
        )

        if not updated:
            raise HTTPException(status_code=404, detail="Cost alert not found")

        return _alert_to_summary(updated)

    except HTTPException:
        raise
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        logger.error(f"Failed to update cost alert {alert_id}: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail="Failed to update cost alert")


@router.delete(
    "/{org_slug}/{alert_id}",
    status_code=204,
    summary="Delete cost alert",
    description="Delete a cost threshold alert",
)
async def delete_cost_alert(
    org_slug: str = Path(..., description="Organization slug"),
    alert_id: str = Path(..., description="Alert ID"),
    current_org: dict = Depends(get_current_org),
):
    """Delete a cost threshold alert."""
    if current_org.get("org_slug") != org_slug:
        raise HTTPException(status_code=403, detail="Access denied to this organization")

    service = get_service()
    try:
        # Verify it's a cost_threshold alert
        existing = await service.get_scheduled_alert(org_slug, alert_id)
        if not existing:
            raise HTTPException(status_code=404, detail="Cost alert not found")
        if existing.alert_type != AlertType.COST_THRESHOLD:
            raise HTTPException(status_code=404, detail="Cost alert not found")

        deleted = await service.delete_scheduled_alert(org_slug, alert_id)
        if not deleted:
            raise HTTPException(status_code=404, detail="Cost alert not found")

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Failed to delete cost alert {alert_id}: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail="Failed to delete cost alert")


@router.post(
    "/{org_slug}/{alert_id}/enable",
    response_model=CostAlertSummary,
    summary="Enable cost alert",
    description="Enable a cost threshold alert",
)
async def enable_cost_alert(
    org_slug: str = Path(..., description="Organization slug"),
    alert_id: str = Path(..., description="Alert ID"),
    current_org: dict = Depends(get_current_org),
):
    """Enable a cost threshold alert."""
    if current_org.get("org_slug") != org_slug:
        raise HTTPException(status_code=403, detail="Access denied to this organization")

    service = get_service()
    try:
        alert = await service.enable_scheduled_alert(org_slug, alert_id)
        if not alert:
            raise HTTPException(status_code=404, detail="Cost alert not found")
        return _alert_to_summary(alert)

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Failed to enable cost alert {alert_id}: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail="Failed to enable cost alert")


@router.post(
    "/{org_slug}/{alert_id}/disable",
    response_model=CostAlertSummary,
    summary="Disable cost alert",
    description="Disable a cost threshold alert",
)
async def disable_cost_alert(
    org_slug: str = Path(..., description="Organization slug"),
    alert_id: str = Path(..., description="Alert ID"),
    current_org: dict = Depends(get_current_org),
):
    """Disable a cost threshold alert."""
    if current_org.get("org_slug") != org_slug:
        raise HTTPException(status_code=403, detail="Access denied to this organization")

    service = get_service()
    try:
        alert = await service.disable_scheduled_alert(org_slug, alert_id)
        if not alert:
            raise HTTPException(status_code=404, detail="Cost alert not found")
        return _alert_to_summary(alert)

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Failed to disable cost alert {alert_id}: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail="Failed to disable cost alert")


# ==============================================================================
# Bulk Operations
# ==============================================================================

@router.post(
    "/{org_slug}/bulk/enable",
    summary="Enable multiple cost alerts",
    description="Enable multiple cost alerts at once",
)
async def bulk_enable_cost_alerts(
    org_slug: str = Path(..., description="Organization slug"),
    alert_ids: List[str] = ...,
    current_org: dict = Depends(get_current_org),
):
    """Enable multiple cost alerts."""
    if current_org.get("org_slug") != org_slug:
        raise HTTPException(status_code=403, detail="Access denied to this organization")

    service = get_service()
    results = {"enabled": [], "failed": []}

    for alert_id in alert_ids:
        try:
            alert = await service.enable_scheduled_alert(org_slug, alert_id)
            if alert:
                results["enabled"].append(alert_id)
            else:
                results["failed"].append({"id": alert_id, "reason": "Not found"})
        except Exception as e:
            results["failed"].append({"id": alert_id, "reason": str(e)})

    return {
        "success": len(results["failed"]) == 0,
        "enabled_count": len(results["enabled"]),
        "failed_count": len(results["failed"]),
        "results": results,
    }


@router.post(
    "/{org_slug}/bulk/disable",
    summary="Disable multiple cost alerts",
    description="Disable multiple cost alerts at once",
)
async def bulk_disable_cost_alerts(
    org_slug: str = Path(..., description="Organization slug"),
    alert_ids: List[str] = ...,
    current_org: dict = Depends(get_current_org),
):
    """Disable multiple cost alerts."""
    if current_org.get("org_slug") != org_slug:
        raise HTTPException(status_code=403, detail="Access denied to this organization")

    service = get_service()
    results = {"disabled": [], "failed": []}

    for alert_id in alert_ids:
        try:
            alert = await service.disable_scheduled_alert(org_slug, alert_id)
            if alert:
                results["disabled"].append(alert_id)
            else:
                results["failed"].append({"id": alert_id, "reason": "Not found"})
        except Exception as e:
            results["failed"].append({"id": alert_id, "reason": str(e)})

    return {
        "success": len(results["failed"]) == 0,
        "disabled_count": len(results["disabled"]),
        "failed_count": len(results["failed"]),
        "results": results,
    }


# ==============================================================================
# Preset Templates
# ==============================================================================

@router.get(
    "/{org_slug}/presets",
    summary="Get cost alert presets",
    description="Get preset templates for common cost alert configurations",
)
async def get_cost_alert_presets(
    org_slug: str = Path(..., description="Organization slug"),
    current_org: dict = Depends(get_current_org),
):
    """Get preset templates for common cost alert configurations."""
    if current_org.get("org_slug") != org_slug:
        raise HTTPException(status_code=403, detail="Access denied to this organization")

    presets = [
        {
            "id": "cloud_1000",
            "name": "Cloud Cost Threshold ($1,000)",
            "scope": "cloud",
            "threshold_value": 1000,
            "threshold_currency": "USD",
            "period": "current_month",
            "severity": "warning",
            "channels": ["email"],
            "description": "Alert when monthly cloud costs exceed $1,000",
        },
        {
            "id": "cloud_5000_critical",
            "name": "Critical Cloud Spend ($5,000)",
            "scope": "cloud",
            "threshold_value": 5000,
            "threshold_currency": "USD",
            "period": "current_month",
            "severity": "critical",
            "channels": ["email", "slack"],
            "description": "Critical alert when cloud costs exceed $5,000",
        },
        {
            "id": "genai_500",
            "name": "GenAI Cost Threshold ($500)",
            "scope": "genai",
            "threshold_value": 500,
            "threshold_currency": "USD",
            "period": "current_month",
            "severity": "warning",
            "channels": ["email"],
            "description": "Alert when monthly GenAI costs exceed $500",
        },
        {
            "id": "openai_200",
            "name": "OpenAI Cost Threshold ($200)",
            "scope": "openai",
            "threshold_value": 200,
            "threshold_currency": "USD",
            "period": "current_month",
            "severity": "warning",
            "channels": ["email"],
            "description": "Alert when monthly OpenAI costs exceed $200",
        },
        {
            "id": "total_2500",
            "name": "Total Monthly Cost ($2,500)",
            "scope": "all",
            "threshold_value": 2500,
            "threshold_currency": "USD",
            "period": "current_month",
            "severity": "warning",
            "channels": ["email"],
            "description": "Alert when total monthly costs exceed $2,500",
        },
    ]

    return {"presets": presets}


@router.post(
    "/{org_slug}/from-preset/{preset_id}",
    response_model=CostAlertSummary,
    status_code=201,
    summary="Create alert from preset",
    description="Create a new cost alert from a preset template",
)
async def create_from_preset(
    org_slug: str = Path(..., description="Organization slug"),
    preset_id: str = Path(..., description="Preset template ID"),
    name_override: Optional[str] = Query(None, description="Override the preset name"),
    threshold_override: Optional[float] = Query(None, description="Override the threshold value"),
    current_org: dict = Depends(get_current_org),
):
    """Create a new cost alert from a preset template."""
    if current_org.get("org_slug") != org_slug:
        raise HTTPException(status_code=403, detail="Access denied to this organization")

    # Define presets
    presets = {
        "cloud_1000": CostAlertCreateRequest(
            name="Cloud Cost Threshold ($1,000)",
            scope=CostAlertScope.CLOUD,
            threshold_value=1000,
            severity=AlertSeverity.WARNING,
            channels=["email"],
        ),
        "cloud_5000_critical": CostAlertCreateRequest(
            name="Critical Cloud Spend ($5,000)",
            scope=CostAlertScope.CLOUD,
            threshold_value=5000,
            severity=AlertSeverity.CRITICAL,
            channels=["email", "slack"],
            cooldown_hours=12,
        ),
        "genai_500": CostAlertCreateRequest(
            name="GenAI Cost Threshold ($500)",
            scope=CostAlertScope.GENAI,
            threshold_value=500,
            severity=AlertSeverity.WARNING,
            channels=["email"],
        ),
        "openai_200": CostAlertCreateRequest(
            name="OpenAI Cost Threshold ($200)",
            scope=CostAlertScope.OPENAI,
            threshold_value=200,
            severity=AlertSeverity.WARNING,
            channels=["email"],
        ),
        "total_2500": CostAlertCreateRequest(
            name="Total Monthly Cost ($2,500)",
            scope=CostAlertScope.ALL,
            threshold_value=2500,
            severity=AlertSeverity.WARNING,
            channels=["email"],
        ),
    }

    if preset_id not in presets:
        raise HTTPException(status_code=404, detail=f"Preset '{preset_id}' not found")

    # Get preset and apply overrides
    request = presets[preset_id]
    if name_override:
        request.name = name_override
    if threshold_override:
        request.threshold_value = threshold_override

    service = get_service()
    try:
        full_alert = request.to_scheduled_alert_create()
        created = await service.create_scheduled_alert(
            org_slug, full_alert, current_org.get("admin_email")
        )
        return _alert_to_summary(created)

    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        logger.error(f"Failed to create cost alert from preset: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail="Failed to create cost alert")
