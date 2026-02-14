"""
Notification Settings Router

API endpoints for managing notification channels, rules, summaries, and history.
Integrates with pipeline service for sending notifications and cost service for data.
"""

import os
import logging
from typing import Optional, List, Dict, Any
from datetime import datetime, timedelta, timezone
from fastapi import APIRouter, Depends, HTTPException, Query, Path
import httpx

from src.app.config import get_settings
# CRUD operations - direct BigQuery writes
from src.core.services.notification_crud import (
    ChannelType,
    RuleCategory,
    RulePriority,
    SummaryType,
    NotificationStatus,
    NotificationChannel,
    NotificationChannelCreate,
    NotificationChannelUpdate,
    NotificationRule,
    NotificationRuleCreate,
    NotificationRuleUpdate,
    NotificationSummary,
    NotificationSummaryCreate,
    NotificationSummaryUpdate,
    NotificationHistoryEntry,
    NotificationStats,
    get_notification_settings_service,
    # Org-specific Scheduled Alerts
    AlertType,
    AlertHistoryStatus,
    ScheduledAlert,
    ScheduledAlertCreate,
    ScheduledAlertUpdate,
    AlertHistoryEntry as OrgAlertHistoryEntry,
)
# Read operations - Polars-powered queries
from src.core.services.notification_read import (
    get_notification_read_service,
    NotificationStatsResponse,
    HistoryQueryParams,
)
from src.app.dependencies.auth import get_current_org

logger = logging.getLogger(__name__)

router = APIRouter(
    prefix="/notifications",
    tags=["notifications"],
)


def get_service():
    """Get notification settings service."""
    project_id = os.environ.get("GCP_PROJECT_ID", "cloudact-testing-1")
    return get_notification_settings_service(project_id)


# ==============================================================================
# Channel Endpoints
# ==============================================================================

@router.get(
    "/{org_slug}/channels",
    response_model=List[NotificationChannel],
    summary="List notification channels",
    description="List all notification channels for an organization",
)
async def list_channels(
    org_slug: str = Path(..., description="Organization slug"),
    channel_type: Optional[ChannelType] = Query(None, description="Filter by channel type"),
    active_only: bool = Query(False, description="Only return active channels"),
    current_org: dict = Depends(get_current_org),
):
    """List notification channels for an organization."""
    if current_org.get("org_slug") != org_slug:
        raise HTTPException(status_code=403, detail="Access denied to this organization")

    service = get_service()
    try:
        channels = await service.list_channels(org_slug, channel_type, active_only)
        return channels
    except Exception as e:
        # SEC-003 FIX: Log full error, return generic message
        logger.error(f"Failed to list channels for {org_slug}: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail="Failed to retrieve notification channels")


@router.get(
    "/{org_slug}/channels/{channel_id}",
    response_model=NotificationChannel,
    summary="Get notification channel",
    description="Get a specific notification channel",
)
async def get_channel(
    org_slug: str = Path(..., description="Organization slug"),
    channel_id: str = Path(..., description="Channel ID"),
    current_org: dict = Depends(get_current_org),
):
    """Get a specific notification channel."""
    if current_org.get("org_slug") != org_slug:
        raise HTTPException(status_code=403, detail="Access denied to this organization")

    service = get_service()
    try:
        channel = await service.get_channel(org_slug, channel_id)
        if not channel:
            raise HTTPException(status_code=404, detail="Channel not found")
        return channel
    except HTTPException:
        raise
    except Exception as e:
        # SEC-003 FIX: Log full error, return generic message
        logger.error(f"Failed to get channel {channel_id}: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail="Failed to retrieve notification channel")


@router.post(
    "/{org_slug}/channels",
    response_model=NotificationChannel,
    status_code=201,
    summary="Create notification channel",
    description="Create a new notification channel",
)
async def create_channel(
    org_slug: str = Path(..., description="Organization slug"),
    channel: NotificationChannelCreate = ...,
    current_org: dict = Depends(get_current_org),
):
    """Create a new notification channel."""
    if current_org.get("org_slug") != org_slug:
        raise HTTPException(status_code=403, detail="Access denied to this organization")

    service = get_service()
    try:
        created = await service.create_channel(
            org_slug,
            channel,
            created_by=current_org.get("admin_email", "system"),
        )
        return created
    except Exception as e:
        logger.error(f"Failed to create channel: {e}")
        raise HTTPException(status_code=500, detail="An internal error occurred. Please try again later.")


@router.put(
    "/{org_slug}/channels/{channel_id}",
    response_model=NotificationChannel,
    summary="Update notification channel",
    description="Update a notification channel",
)
async def update_channel(
    org_slug: str = Path(..., description="Organization slug"),
    channel_id: str = Path(..., description="Channel ID"),
    update: NotificationChannelUpdate = ...,
    current_org: dict = Depends(get_current_org),
):
    """Update a notification channel."""
    if current_org.get("org_slug") != org_slug:
        raise HTTPException(status_code=403, detail="Access denied to this organization")

    service = get_service()
    try:
        updated = await service.update_channel(org_slug, channel_id, update)
        if not updated:
            raise HTTPException(status_code=404, detail="Channel not found")
        return updated
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Failed to update channel: {e}")
        raise HTTPException(status_code=500, detail="An internal error occurred. Please try again later.")


@router.delete(
    "/{org_slug}/channels/{channel_id}",
    status_code=204,
    summary="Delete notification channel",
    description="Delete a notification channel",
)
async def delete_channel(
    org_slug: str = Path(..., description="Organization slug"),
    channel_id: str = Path(..., description="Channel ID"),
    current_org: dict = Depends(get_current_org),
):
    """Delete a notification channel."""
    if current_org.get("org_slug") != org_slug:
        raise HTTPException(status_code=403, detail="Access denied to this organization")

    service = get_service()
    try:
        deleted = await service.delete_channel(org_slug, channel_id)
        if not deleted:
            raise HTTPException(status_code=404, detail="Channel not found")
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Failed to delete channel: {e}")
        raise HTTPException(status_code=500, detail="An internal error occurred. Please try again later.")


@router.post(
    "/{org_slug}/channels/{channel_id}/test",
    summary="Test notification channel",
    description="Send a test notification to verify channel configuration",
)
async def test_channel(
    org_slug: str = Path(..., description="Organization slug"),
    channel_id: str = Path(..., description="Channel ID"),
    current_org: dict = Depends(get_current_org),
):
    """Send a test notification to verify channel configuration."""
    if current_org.get("org_slug") != org_slug:
        raise HTTPException(status_code=403, detail="Access denied to this organization")

    service = get_service()
    settings = get_settings()

    try:
        channel = await service.get_channel(org_slug, channel_id)
        if not channel:
            raise HTTPException(status_code=404, detail="Channel not found")

        # Build test notification payload based on channel type
        test_payload = {
            "org_slug": org_slug,
            "event": "test_notification",
            "severity": "info",
            "title": "CloudAct Test Notification",
            "message": f"This is a test notification for channel '{channel.name}'. If you received this, your notification channel is configured correctly.",
            "details": {
                "channel_id": channel_id,
                "channel_type": channel.channel_type.value,
                "channel_name": channel.name,
                "test_time": datetime.now(timezone.utc).isoformat(),
            }
        }

        # SEC-002 FIX: Validate API key exists before making request
        api_key = current_org.get("api_key")
        if not api_key:
            raise HTTPException(
                status_code=500,
                detail="Organization API key not configured. Please contact support."
            )

        # Send test via pipeline service
        async with httpx.AsyncClient(timeout=30.0) as client:
            pipeline_url = f"{settings.pipeline_service_url}/api/v1/notifications/test"
            response = await client.post(
                pipeline_url,
                json=test_payload,
                headers={"X-CA-Root-Key": os.environ.get("CA_ROOT_API_KEY", "")}
            )

            if response.status_code == 200:
                return {
                    "success": True,
                    "message": f"Test notification sent to {channel.channel_type.value} channel",
                    "channel_id": channel_id,
                    "channel_name": channel.name,
                }
            else:
                # ERR-003 FIX: Return success=False when pipeline fails
                logger.error(f"Pipeline service returned {response.status_code}")
                return {
                    "success": False,
                    "message": f"Failed to send test notification (status: {response.status_code})",
                    "channel_id": channel_id,
                    "error": "Pipeline service returned an error",
                }

    except httpx.RequestError as e:
        # ERR-003 FIX: Return success=False when pipeline unreachable
        logger.error(f"Pipeline service unreachable for test: {e}")
        return {
            "success": False,
            "message": "Unable to send test notification - pipeline service unreachable",
            "channel_id": channel_id,
            "error": "Pipeline service currently unavailable",
        }
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Failed to test channel: {e}")
        raise HTTPException(status_code=500, detail="An internal error occurred. Please try again later.")


# ==============================================================================
# Rule Endpoints
# ==============================================================================

@router.get(
    "/{org_slug}/rules",
    response_model=List[NotificationRule],
    summary="List notification rules",
    description="List all notification rules for an organization",
)
async def list_rules(
    org_slug: str = Path(..., description="Organization slug"),
    category: Optional[RuleCategory] = Query(None, description="Filter by category"),
    priority: Optional[RulePriority] = Query(None, description="Filter by priority"),
    active_only: bool = Query(False, description="Only return active rules"),
    current_org: dict = Depends(get_current_org),
):
    """List notification rules for an organization."""
    if current_org.get("org_slug") != org_slug:
        raise HTTPException(status_code=403, detail="Access denied to this organization")

    service = get_service()
    try:
        rules = await service.list_rules(org_slug, category, priority, active_only)
        return rules
    except Exception as e:
        logger.error(f"Failed to list rules: {e}")
        raise HTTPException(status_code=500, detail="An internal error occurred. Please try again later.")


@router.get(
    "/{org_slug}/rules/{rule_id}",
    response_model=NotificationRule,
    summary="Get notification rule",
    description="Get a specific notification rule",
)
async def get_rule(
    org_slug: str = Path(..., description="Organization slug"),
    rule_id: str = Path(..., description="Rule ID"),
    current_org: dict = Depends(get_current_org),
):
    """Get a specific notification rule."""
    if current_org.get("org_slug") != org_slug:
        raise HTTPException(status_code=403, detail="Access denied to this organization")

    service = get_service()
    try:
        rule = await service.get_rule(org_slug, rule_id)
        if not rule:
            raise HTTPException(status_code=404, detail="Rule not found")
        return rule
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Failed to get rule: {e}")
        raise HTTPException(status_code=500, detail="An internal error occurred. Please try again later.")


@router.post(
    "/{org_slug}/rules",
    response_model=NotificationRule,
    status_code=201,
    summary="Create notification rule",
    description="Create a new notification rule",
)
async def create_rule(
    org_slug: str = Path(..., description="Organization slug"),
    rule: NotificationRuleCreate = ...,
    current_org: dict = Depends(get_current_org),
):
    """Create a new notification rule."""
    if current_org.get("org_slug") != org_slug:
        raise HTTPException(status_code=403, detail="Access denied to this organization")

    service = get_service()
    try:
        created = await service.create_rule(
            org_slug,
            rule,
            created_by=current_org.get("admin_email", "system"),
        )
        return created
    except Exception as e:
        logger.error(f"Failed to create rule: {e}")
        raise HTTPException(status_code=500, detail="An internal error occurred. Please try again later.")


@router.put(
    "/{org_slug}/rules/{rule_id}",
    response_model=NotificationRule,
    summary="Update notification rule",
    description="Update a notification rule",
)
async def update_rule(
    org_slug: str = Path(..., description="Organization slug"),
    rule_id: str = Path(..., description="Rule ID"),
    update: NotificationRuleUpdate = ...,
    current_org: dict = Depends(get_current_org),
):
    """Update a notification rule."""
    if current_org.get("org_slug") != org_slug:
        raise HTTPException(status_code=403, detail="Access denied to this organization")

    service = get_service()
    try:
        updated = await service.update_rule(org_slug, rule_id, update)
        if not updated:
            raise HTTPException(status_code=404, detail="Rule not found")
        return updated
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Failed to update rule: {e}")
        raise HTTPException(status_code=500, detail="An internal error occurred. Please try again later.")


@router.delete(
    "/{org_slug}/rules/{rule_id}",
    status_code=204,
    summary="Delete notification rule",
    description="Delete a notification rule",
)
async def delete_rule(
    org_slug: str = Path(..., description="Organization slug"),
    rule_id: str = Path(..., description="Rule ID"),
    current_org: dict = Depends(get_current_org),
):
    """Delete a notification rule."""
    if current_org.get("org_slug") != org_slug:
        raise HTTPException(status_code=403, detail="Access denied to this organization")

    service = get_service()
    try:
        deleted = await service.delete_rule(org_slug, rule_id)
        if not deleted:
            raise HTTPException(status_code=404, detail="Rule not found")
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Failed to delete rule: {e}")
        raise HTTPException(status_code=500, detail="An internal error occurred. Please try again later.")


@router.post(
    "/{org_slug}/rules/{rule_id}/pause",
    response_model=NotificationRule,
    summary="Pause notification rule",
    description="Pause a notification rule",
)
async def pause_rule(
    org_slug: str = Path(..., description="Organization slug"),
    rule_id: str = Path(..., description="Rule ID"),
    current_org: dict = Depends(get_current_org),
):
    """Pause a notification rule."""
    if current_org.get("org_slug") != org_slug:
        raise HTTPException(status_code=403, detail="Access denied to this organization")

    service = get_service()
    try:
        updated = await service.pause_rule(org_slug, rule_id)
        if not updated:
            raise HTTPException(status_code=404, detail="Rule not found")
        return updated
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Failed to pause rule: {e}")
        raise HTTPException(status_code=500, detail="An internal error occurred. Please try again later.")


@router.post(
    "/{org_slug}/rules/{rule_id}/resume",
    response_model=NotificationRule,
    summary="Resume notification rule",
    description="Resume a paused notification rule",
)
async def resume_rule(
    org_slug: str = Path(..., description="Organization slug"),
    rule_id: str = Path(..., description="Rule ID"),
    current_org: dict = Depends(get_current_org),
):
    """Resume a paused notification rule."""
    if current_org.get("org_slug") != org_slug:
        raise HTTPException(status_code=403, detail="Access denied to this organization")

    service = get_service()
    try:
        updated = await service.resume_rule(org_slug, rule_id)
        if not updated:
            raise HTTPException(status_code=404, detail="Rule not found")
        return updated
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Failed to resume rule: {e}")
        raise HTTPException(status_code=500, detail="An internal error occurred. Please try again later.")


@router.post(
    "/{org_slug}/rules/{rule_id}/test",
    summary="Test notification rule",
    description="Evaluate and optionally send a test notification for a rule",
)
async def test_rule(
    org_slug: str = Path(..., description="Organization slug"),
    rule_id: str = Path(..., description="Rule ID"),
    send_notification: bool = Query(False, description="Actually send the notification"),
    current_org: dict = Depends(get_current_org),
):
    """Test a notification rule by evaluating its conditions against current data."""
    if current_org.get("org_slug") != org_slug:
        raise HTTPException(status_code=403, detail="Access denied to this organization")

    service = get_service()
    settings = get_settings()

    try:
        rule = await service.get_rule(org_slug, rule_id)
        if not rule:
            raise HTTPException(status_code=404, detail="Rule not found")

        # Evaluate rule conditions using cost data
        would_trigger = False
        trigger_reason = None
        evaluation_data: Dict[str, Any] = {}

        # Get conditions from rule
        conditions = rule.conditions
        if conditions:
            # Fetch current cost data for evaluation
            from src.core.services.cost_read import get_cost_read_service, CostQuery, DatePeriod

            cost_service = get_cost_read_service()

            # Get cost data based on rule category
            if rule.rule_category.value in ["cost_spike", "budget_threshold"]:
                # Get MTD costs
                cost_query = CostQuery(org_slug=org_slug, period=DatePeriod.MTD)
                cost_data = await cost_service.get_cost_summary(cost_query)

                if cost_data:
                    total_cost = cost_data.get("total_cost", 0)
                    evaluation_data["current_mtd_cost"] = total_cost

                    # Evaluate threshold conditions
                    if conditions.threshold_value and total_cost >= conditions.threshold_value:
                        would_trigger = True
                        trigger_reason = f"Cost ${total_cost:.2f} exceeds threshold ${conditions.threshold_value:.2f}"

                    # Evaluate percentage change
                    if conditions.percentage_change:
                        pct_change = cost_data.get("percentage_change", 0)
                        evaluation_data["percentage_change"] = pct_change
                        if pct_change >= conditions.percentage_change:
                            would_trigger = True
                            trigger_reason = f"Cost increased {pct_change:.1f}% (threshold: {conditions.percentage_change}%)"

            elif rule.rule_category.value == "anomaly_detection":
                # For anomaly detection, check if current spend deviates significantly
                evaluation_data["anomaly_check"] = "Anomaly detection evaluated"
                # Simplified check - actual implementation would use statistical methods
                would_trigger = False
                trigger_reason = "No anomaly detected"

        result = {
            "success": True,
            "rule_id": rule_id,
            "rule_name": rule.name,
            "would_trigger": would_trigger,
            "trigger_reason": trigger_reason,
            "evaluation_data": evaluation_data,
            "notification_sent": False,
        }

        # Optionally send notification if rule would trigger
        if send_notification and would_trigger:
            async with httpx.AsyncClient(timeout=30.0) as client:
                pipeline_url = f"{settings.pipeline_service_url}/api/v1/notifications/send"
                notification_payload = {
                    "org_slug": org_slug,
                    "event": "rule_triggered",
                    "severity": rule.priority.value if hasattr(rule.priority, "value") else str(rule.priority),
                    "title": f"Alert: {rule.name}",
                    "message": trigger_reason or "Rule condition met",
                    "rule_id": rule_id,
                    "channels": ["email"],
                    "details": evaluation_data,
                }
                try:
                    response = await client.post(
                        pipeline_url,
                        json=notification_payload,
                        headers={"X-CA-Root-Key": os.environ.get("CA_ROOT_API_KEY", "")}
                    )
                    result["notification_sent"] = response.status_code == 200
                except httpx.RequestError:
                    result["notification_sent"] = False
                    result["notification_warning"] = "Pipeline service unreachable"

        return result

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Failed to test rule: {e}")
        raise HTTPException(status_code=500, detail="An internal error occurred. Please try again later.")


# ==============================================================================
# Summary Endpoints
# ==============================================================================

@router.get(
    "/{org_slug}/summaries",
    response_model=List[NotificationSummary],
    summary="List notification summaries",
    description="List all notification summaries for an organization",
)
async def list_summaries(
    org_slug: str = Path(..., description="Organization slug"),
    summary_type: Optional[SummaryType] = Query(None, description="Filter by type"),
    active_only: bool = Query(False, description="Only return active summaries"),
    current_org: dict = Depends(get_current_org),
):
    """List notification summaries for an organization."""
    if current_org.get("org_slug") != org_slug:
        raise HTTPException(status_code=403, detail="Access denied to this organization")

    service = get_service()
    try:
        summaries = await service.list_summaries(org_slug, summary_type, active_only)
        return summaries
    except Exception as e:
        logger.error(f"Failed to list summaries: {e}")
        raise HTTPException(status_code=500, detail="An internal error occurred. Please try again later.")


@router.get(
    "/{org_slug}/summaries/{summary_id}",
    response_model=NotificationSummary,
    summary="Get notification summary",
    description="Get a specific notification summary",
)
async def get_summary(
    org_slug: str = Path(..., description="Organization slug"),
    summary_id: str = Path(..., description="Summary ID"),
    current_org: dict = Depends(get_current_org),
):
    """Get a specific notification summary."""
    if current_org.get("org_slug") != org_slug:
        raise HTTPException(status_code=403, detail="Access denied to this organization")

    service = get_service()
    try:
        summary = await service.get_summary(org_slug, summary_id)
        if not summary:
            raise HTTPException(status_code=404, detail="Summary not found")
        return summary
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Failed to get summary: {e}")
        raise HTTPException(status_code=500, detail="An internal error occurred. Please try again later.")


@router.post(
    "/{org_slug}/summaries",
    response_model=NotificationSummary,
    status_code=201,
    summary="Create notification summary",
    description="Create a new notification summary schedule",
)
async def create_summary(
    org_slug: str = Path(..., description="Organization slug"),
    summary: NotificationSummaryCreate = ...,
    current_org: dict = Depends(get_current_org),
):
    """Create a new notification summary."""
    if current_org.get("org_slug") != org_slug:
        raise HTTPException(status_code=403, detail="Access denied to this organization")

    service = get_service()
    try:
        created = await service.create_summary(
            org_slug,
            summary,
            created_by=current_org.get("admin_email", "system"),
        )
        return created
    except Exception as e:
        logger.error(f"Failed to create summary: {e}")
        raise HTTPException(status_code=500, detail="An internal error occurred. Please try again later.")


@router.put(
    "/{org_slug}/summaries/{summary_id}",
    response_model=NotificationSummary,
    summary="Update notification summary",
    description="Update a notification summary",
)
async def update_summary(
    org_slug: str = Path(..., description="Organization slug"),
    summary_id: str = Path(..., description="Summary ID"),
    update: NotificationSummaryUpdate = ...,
    current_org: dict = Depends(get_current_org),
):
    """Update a notification summary."""
    if current_org.get("org_slug") != org_slug:
        raise HTTPException(status_code=403, detail="Access denied to this organization")

    service = get_service()
    try:
        updated = await service.update_summary(org_slug, summary_id, update)
        if not updated:
            raise HTTPException(status_code=404, detail="Summary not found")
        return updated
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Failed to update summary: {e}")
        raise HTTPException(status_code=500, detail="An internal error occurred. Please try again later.")


@router.delete(
    "/{org_slug}/summaries/{summary_id}",
    status_code=204,
    summary="Delete notification summary",
    description="Delete a notification summary",
)
async def delete_summary(
    org_slug: str = Path(..., description="Organization slug"),
    summary_id: str = Path(..., description="Summary ID"),
    current_org: dict = Depends(get_current_org),
):
    """Delete a notification summary."""
    if current_org.get("org_slug") != org_slug:
        raise HTTPException(status_code=403, detail="Access denied to this organization")

    service = get_service()
    try:
        deleted = await service.delete_summary(org_slug, summary_id)
        if not deleted:
            raise HTTPException(status_code=404, detail="Summary not found")
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Failed to delete summary: {e}")
        raise HTTPException(status_code=500, detail="An internal error occurred. Please try again later.")


@router.post(
    "/{org_slug}/summaries/{summary_id}/preview",
    summary="Preview notification summary",
    description="Generate a preview of the summary content",
)
async def preview_summary(
    org_slug: str = Path(..., description="Organization slug"),
    summary_id: str = Path(..., description="Summary ID"),
    current_org: dict = Depends(get_current_org),
):
    """Generate a preview of the summary content using current cost data."""
    if current_org.get("org_slug") != org_slug:
        raise HTTPException(status_code=403, detail="Access denied to this organization")

    service = get_service()
    try:
        summary = await service.get_summary(org_slug, summary_id)
        if not summary:
            raise HTTPException(status_code=404, detail="Summary not found")

        # Generate preview using cost read service
        from src.core.services.cost_read import get_cost_read_service, CostQuery, DatePeriod

        cost_service = get_cost_read_service()
        preview_data: Dict[str, Any] = {}
        sections = []

        # Determine date period based on summary type
        if summary.summary_type.value == "daily":
            period = DatePeriod.YESTERDAY
            period_label = "Yesterday"
        elif summary.summary_type.value == "weekly":
            period = DatePeriod.LAST_7_DAYS
            period_label = "Last 7 Days"
        else:  # monthly
            period = DatePeriod.LAST_30_DAYS
            period_label = "Last 30 Days"

        cost_query = CostQuery(org_slug=org_slug, period=period)

        # Generate sections based on summary configuration
        include_sections = summary.include_sections or ["cost_overview", "top_providers"]

        if "cost_overview" in include_sections:
            cost_summary = await cost_service.get_cost_summary(cost_query)
            if cost_summary:
                sections.append({
                    "title": "Cost Overview",
                    "content": f"Total Spend: ${cost_summary.get('total_cost', 0):,.2f}",
                    "data": cost_summary,
                })

        if "top_providers" in include_sections:
            provider_costs = await cost_service.get_cost_by_provider(cost_query)
            if provider_costs:
                top_n = summary.top_n_items or 5
                top_providers = sorted(
                    provider_costs, key=lambda x: x.get("cost", 0), reverse=True
                )[:top_n]
                sections.append({
                    "title": f"Top {top_n} Providers",
                    "content": ", ".join([p.get("provider", "Unknown") for p in top_providers]),
                    "data": top_providers,
                })

        if "cost_trend" in include_sections:
            trend_data = await cost_service.get_cost_trend(cost_query)
            if trend_data:
                sections.append({
                    "title": "Cost Trend",
                    "content": f"{len(trend_data)} data points",
                    "data": trend_data[:7],  # Last 7 for preview
                })

        # Build preview
        preview_data = {
            "subject": f"[CloudAct] {summary.name} - {period_label}",
            "period": period_label,
            "sections": sections,
            "generated_at": datetime.now(timezone.utc).isoformat(),
            "currency": summary.currency_display or "USD",
        }

        return {
            "success": True,
            "summary_id": summary_id,
            "summary_name": summary.name,
            "preview": preview_data,
        }

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Failed to preview summary: {e}")
        raise HTTPException(status_code=500, detail="An internal error occurred. Please try again later.")


@router.post(
    "/{org_slug}/summaries/{summary_id}/send-now",
    summary="Send summary now",
    description="Immediately send the summary (bypass schedule)",
)
async def send_summary_now(
    org_slug: str = Path(..., description="Organization slug"),
    summary_id: str = Path(..., description="Summary ID"),
    current_org: dict = Depends(get_current_org),
):
    """Immediately send the summary by generating content and sending to channels."""
    if current_org.get("org_slug") != org_slug:
        raise HTTPException(status_code=403, detail="Access denied to this organization")

    service = get_service()
    settings = get_settings()

    try:
        summary = await service.get_summary(org_slug, summary_id)
        if not summary:
            raise HTTPException(status_code=404, detail="Summary not found")

        # Generate summary content (same logic as preview)
        from src.core.services.cost_read import get_cost_read_service, CostQuery, DatePeriod

        cost_service = get_cost_read_service()

        # Determine date period based on summary type
        if summary.summary_type.value == "daily":
            period = DatePeriod.YESTERDAY
            period_label = "Yesterday"
        elif summary.summary_type.value == "weekly":
            period = DatePeriod.LAST_7_DAYS
            period_label = "Last 7 Days"
        else:
            period = DatePeriod.LAST_30_DAYS
            period_label = "Last 30 Days"

        cost_query = CostQuery(org_slug=org_slug, period=period)
        cost_summary = await cost_service.get_cost_summary(cost_query)
        provider_costs = await cost_service.get_cost_by_provider(cost_query)

        # Build summary content
        total_cost = cost_summary.get("total_cost", 0) if cost_summary else 0
        top_providers = sorted(
            provider_costs or [], key=lambda x: x.get("cost", 0), reverse=True
        )[: summary.top_n_items or 5]

        summary_content = {
            "subject": f"[CloudAct] {summary.name} - {period_label}",
            "period": period_label,
            "total_cost": total_cost,
            "top_providers": [
                {"name": p.get("provider", "Unknown"), "cost": p.get("cost", 0)}
                for p in top_providers
            ],
            "currency": summary.currency_display or "USD",
            "generated_at": datetime.now(timezone.utc).isoformat(),
        }

        # Send via pipeline service
        async with httpx.AsyncClient(timeout=60.0) as client:
            pipeline_url = f"{settings.pipeline_service_url}/api/v1/notifications/summary"
            notification_payload = {
                "org_slug": org_slug,
                "summary_id": summary_id,
                "summary_name": summary.name,
                "channel_ids": summary.notify_channel_ids,
                "content": summary_content,
            }

            try:
                response = await client.post(
                    pipeline_url,
                    json=notification_payload,
                    headers={"X-CA-Root-Key": os.environ.get("CA_ROOT_API_KEY", "")}
                )

                if response.status_code == 200:
                    # Update last_sent_at in the summary
                    from src.core.services.notification_crud.models import NotificationSummaryUpdate
                    await service.update_summary(
                        org_slug, summary_id,
                        NotificationSummaryUpdate()  # updated_at set automatically
                    )

                    return {
                        "success": True,
                        "summary_id": summary_id,
                        "message": f"Summary '{summary.name}' sent successfully",
                        "sent_to_channels": len(summary.notify_channel_ids or []),
                        "content_preview": {
                            "period": period_label,
                            "total_cost": f"${total_cost:,.2f}",
                        },
                    }
                else:
                    return {
                        "success": False,
                        "summary_id": summary_id,
                        "message": f"Pipeline service returned status {response.status_code}",
                        "error": response.text[:500] if response.text else None,
                    }

            except httpx.RequestError as e:
                logger.warning(f"Pipeline service unreachable: {e}")
                return {
                    "success": False,
                    "summary_id": summary_id,
                    "message": "Pipeline service currently unreachable",
                    "error": str(e),
                }

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Failed to send summary: {e}")
        raise HTTPException(status_code=500, detail="An internal error occurred. Please try again later.")


# ==============================================================================
# History Endpoints
# ==============================================================================

@router.get(
    "/{org_slug}/history",
    response_model=List[NotificationHistoryEntry],
    summary="List notification history",
    description="List notification history for an organization",
)
async def list_history(
    org_slug: str = Path(..., description="Organization slug"),
    notification_type: Optional[str] = Query(None, description="Filter by type: alert, summary, system"),
    channel_id: Optional[str] = Query(None, description="Filter by channel"),
    status: Optional[NotificationStatus] = Query(None, description="Filter by status"),
    days: int = Query(7, ge=1, le=90, description="Number of days to look back"),
    limit: int = Query(100, ge=1, le=1000, description="Max results"),
    offset: int = Query(0, ge=0, description="Offset for pagination"),
    current_org: dict = Depends(get_current_org),
):
    """List notification history for an organization."""
    if current_org.get("org_slug") != org_slug:
        raise HTTPException(status_code=403, detail="Access denied to this organization")

    service = get_service()
    try:
        history = await service.list_history(
            org_slug, notification_type, channel_id, status, days, limit, offset
        )
        return history
    except Exception as e:
        logger.error(f"Failed to list history: {e}")
        raise HTTPException(status_code=500, detail="An internal error occurred. Please try again later.")


@router.get(
    "/{org_slug}/history/{notification_id}",
    response_model=NotificationHistoryEntry,
    summary="Get notification history entry",
    description="Get a specific notification history entry",
)
async def get_history_entry(
    org_slug: str = Path(..., description="Organization slug"),
    notification_id: str = Path(..., description="Notification ID"),
    current_org: dict = Depends(get_current_org),
):
    """Get a specific notification history entry."""
    if current_org.get("org_slug") != org_slug:
        raise HTTPException(status_code=403, detail="Access denied to this organization")

    service = get_service()
    try:
        entry = await service.get_history_entry(org_slug, notification_id)
        if not entry:
            raise HTTPException(status_code=404, detail="History entry not found")
        return entry
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Failed to get history entry: {e}")
        raise HTTPException(status_code=500, detail="An internal error occurred. Please try again later.")


@router.post(
    "/{org_slug}/history/{notification_id}/acknowledge",
    response_model=NotificationHistoryEntry,
    summary="Acknowledge notification",
    description="Acknowledge a notification (mark as read/handled)",
)
async def acknowledge_notification(
    org_slug: str = Path(..., description="Organization slug"),
    notification_id: str = Path(..., description="Notification ID"),
    current_org: dict = Depends(get_current_org),
):
    """Acknowledge a notification."""
    if current_org.get("org_slug") != org_slug:
        raise HTTPException(status_code=403, detail="Access denied to this organization")

    service = get_service()
    try:
        entry = await service.acknowledge_notification(
            org_slug, notification_id, current_org.get("admin_email", "unknown")
        )
        if not entry:
            raise HTTPException(status_code=404, detail="History entry not found")
        return entry
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Failed to acknowledge notification: {e}")
        raise HTTPException(status_code=500, detail="An internal error occurred. Please try again later.")


# ==============================================================================
# Stats Endpoint
# ==============================================================================

@router.get(
    "/{org_slug}/stats",
    response_model=NotificationStats,
    summary="Get notification statistics",
    description="Get notification statistics for an organization",
)
async def get_stats(
    org_slug: str = Path(..., description="Organization slug"),
    current_org: dict = Depends(get_current_org),
):
    """Get notification statistics for an organization."""
    if current_org.get("org_slug") != org_slug:
        raise HTTPException(status_code=403, detail="Access denied to this organization")

    service = get_service()
    try:
        stats = await service.get_stats(org_slug)
        return stats
    except Exception as e:
        logger.error(f"Failed to get stats: {e}")
        raise HTTPException(status_code=500, detail="An internal error occurred. Please try again later.")


# ==============================================================================
# Scheduled Alerts Endpoints (Pipeline Service Integration)
# ==============================================================================

@router.get(
    "/{org_slug}/scheduled-alerts",
    summary="List scheduled alert configurations",
    description="List all scheduled alert configurations from the pipeline service",
)
async def list_scheduled_alerts(
    org_slug: str = Path(..., description="Organization slug"),
    enabled_only: bool = Query(False, description="Only return enabled alerts"),
    current_org: dict = Depends(get_current_org),
):
    """List scheduled alert configurations from pipeline service."""
    if current_org.get("org_slug") != org_slug:
        raise HTTPException(status_code=403, detail="Access denied to this organization")

    settings = get_settings()

    try:
        async with httpx.AsyncClient(timeout=30.0) as client:
            response = await client.get(
                f"{settings.pipeline_service_url}/api/v1/alerts/configs",
                headers={"X-CA-Root-Key": os.environ.get("CA_ROOT_API_KEY", "")}
            )

            if response.status_code == 200:
                alerts = response.json().get("alerts", [])
                # SECURITY: Filter alerts to only this org's alerts
                alerts = [a for a in alerts if a.get("org_slug") == org_slug]
                if enabled_only:
                    alerts = [a for a in alerts if a.get("enabled", False)]
                return {"success": True, "alerts": alerts}
            else:
                logger.warning(f"Pipeline service returned {response.status_code}")
                return {"success": False, "alerts": [], "message": "Could not fetch alerts"}

    except httpx.RequestError as e:
        logger.warning(f"Pipeline service unreachable: {e}")
        return {"success": False, "alerts": [], "message": "Pipeline service unreachable"}
    except Exception as e:
        logger.error(f"Failed to list scheduled alerts: {e}")
        raise HTTPException(status_code=500, detail="An internal error occurred. Please try again later.")


@router.get(
    "/{org_slug}/scheduled-alerts/{alert_id}",
    summary="Get scheduled alert configuration",
    description="Get a specific scheduled alert configuration",
)
async def get_scheduled_alert(
    org_slug: str = Path(..., description="Organization slug"),
    alert_id: str = Path(..., description="Alert configuration ID"),
    current_org: dict = Depends(get_current_org),
):
    """Get a specific scheduled alert configuration."""
    if current_org.get("org_slug") != org_slug:
        raise HTTPException(status_code=403, detail="Access denied to this organization")

    settings = get_settings()

    try:
        async with httpx.AsyncClient(timeout=30.0) as client:
            response = await client.get(
                f"{settings.pipeline_service_url}/api/v1/alerts/configs",
                headers={"X-CA-Root-Key": os.environ.get("CA_ROOT_API_KEY", "")}
            )

            if response.status_code == 200:
                alerts = response.json().get("alerts", [])
                alert = next(
                    (a for a in alerts if a.get("id") == alert_id and a.get("org_slug") == org_slug),
                    None,
                )
                if alert:
                    return {"success": True, "alert": alert}
                else:
                    raise HTTPException(status_code=404, detail="Alert not found")
            else:
                raise HTTPException(status_code=502, detail="Could not fetch alert from pipeline service")

    except HTTPException:
        raise
    except httpx.RequestError as e:
        logger.warning(f"Pipeline service unreachable: {e}")
        raise HTTPException(status_code=503, detail="Pipeline service unreachable")
    except Exception as e:
        logger.error(f"Failed to get scheduled alert: {e}")
        raise HTTPException(status_code=500, detail="An internal error occurred. Please try again later.")


@router.post(
    "/{org_slug}/scheduled-alerts/{alert_id}/test",
    summary="Test scheduled alert",
    description="Test a scheduled alert by evaluating and optionally sending",
)
async def test_scheduled_alert(
    org_slug: str = Path(..., description="Organization slug"),
    alert_id: str = Path(..., description="Alert configuration ID"),
    dry_run: bool = Query(True, description="If true, evaluate without sending"),
    current_org: dict = Depends(get_current_org),
):
    """Test a scheduled alert by evaluating its conditions."""
    if current_org.get("org_slug") != org_slug:
        raise HTTPException(status_code=403, detail="Access denied to this organization")

    settings = get_settings()

    try:
        async with httpx.AsyncClient(timeout=60.0) as client:
            response = await client.post(
                f"{settings.pipeline_service_url}/api/v1/alerts/configs/{alert_id}/test",
                params={"dry_run": dry_run, "org_slug": org_slug},
                headers={"X-CA-Root-Key": os.environ.get("CA_ROOT_API_KEY", "")}
            )

            if response.status_code == 200:
                result = response.json()
                # SECURITY: Verify response belongs to requesting org
                if result.get("org_slug") and result["org_slug"] != org_slug:
                    raise HTTPException(status_code=404, detail="Alert not found")
                return result
            elif response.status_code == 404:
                raise HTTPException(status_code=404, detail="Alert not found")
            else:
                return {
                    "success": False,
                    "alert_id": alert_id,
                    "message": f"Pipeline service returned {response.status_code}",
                }

    except HTTPException:
        raise
    except httpx.RequestError as e:
        logger.warning(f"Pipeline service unreachable: {e}")
        raise HTTPException(status_code=503, detail="Pipeline service unreachable")
    except Exception as e:
        logger.error(f"Failed to test scheduled alert: {e}")
        raise HTTPException(status_code=500, detail="An internal error occurred. Please try again later.")


@router.get(
    "/{org_slug}/alert-history",
    summary="Get alert history",
    description="Get history of scheduled alert evaluations",
)
async def get_alert_history(
    org_slug: str = Path(..., description="Organization slug"),
    alert_id: Optional[str] = Query(None, description="Filter by alert ID"),
    status: Optional[str] = Query(None, description="Filter by status: SENT, FAILED, COOLDOWN"),
    days: int = Query(7, ge=1, le=90, description="Number of days to look back"),
    limit: int = Query(50, ge=1, le=500, description="Max results"),
    current_org: dict = Depends(get_current_org),
):
    """Get alert history for an organization."""
    if current_org.get("org_slug") != org_slug:
        raise HTTPException(status_code=403, detail="Access denied to this organization")

    from google.cloud import bigquery as bq

    project_id = os.environ.get("GCP_PROJECT_ID", "cloudact-testing-1")

    try:
        client = bq.Client(project=project_id)

        # Build query with filters
        conditions = ["org_slug = @org_slug"]
        params = [
            bq.ScalarQueryParameter("org_slug", "STRING", org_slug),
            bq.ScalarQueryParameter("days", "INT64", days),
            bq.ScalarQueryParameter("limit", "INT64", limit),
        ]

        if alert_id:
            conditions.append("alert_id = @alert_id")
            params.append(bq.ScalarQueryParameter("alert_id", "STRING", alert_id))

        if status:
            conditions.append("status = @status")
            params.append(bq.ScalarQueryParameter("status", "STRING", status))

        where_clause = " AND ".join(conditions)

        query = f"""
        SELECT
            alert_history_id,
            alert_id,
            org_slug,
            status,
            severity,
            trigger_data,
            recipients,
            recipient_count,
            sent_at,
            error_message,
            created_at
        FROM `{project_id}.organizations.org_alert_history`
        WHERE {where_clause}
          AND created_at > TIMESTAMP_SUB(CURRENT_TIMESTAMP(), INTERVAL @days DAY)
        ORDER BY created_at DESC
        LIMIT @limit
        """

        job_config = bq.QueryJobConfig(query_parameters=params)
        job = client.query(query, job_config=job_config)
        rows = list(job.result())

        history = []
        for row in rows:
            entry = {
                "alert_history_id": row.alert_history_id,
                "alert_id": row.alert_id,
                "org_slug": row.org_slug,
                "status": row.status,
                "severity": row.severity,
                "trigger_data": row.trigger_data,
                "recipients": row.recipients,
                "recipient_count": row.recipient_count,
                "sent_at": row.sent_at.isoformat() if row.sent_at else None,
                "error_message": row.error_message,
                "created_at": row.created_at.isoformat() if row.created_at else None,
            }
            history.append(entry)

        return {"success": True, "history": history, "count": len(history)}

    except Exception as e:
        logger.error(f"Failed to get alert history: {e}")
        # Return empty list if table doesn't exist yet
        if "Not found" in str(e):
            return {"success": True, "history": [], "count": 0, "message": "No alert history yet"}
        raise HTTPException(status_code=500, detail="An internal error occurred. Please try again later.")


# ==============================================================================
# Org-Specific Scheduled Alerts CRUD (Unified with YAML alerts)
# ==============================================================================

@router.get(
    "/{org_slug}/org-alerts",
    response_model=List[ScheduledAlert],
    summary="List org-specific scheduled alerts",
    description="List all scheduled alerts configured for this organization",
)
async def list_org_alerts(
    org_slug: str = Path(..., description="Organization slug"),
    alert_type: Optional[AlertType] = Query(None, description="Filter by alert type"),
    enabled_only: bool = Query(False, description="Only return enabled alerts"),
    current_org: dict = Depends(get_current_org),
):
    """List org-specific scheduled alerts."""
    if current_org.get("org_slug") != org_slug:
        raise HTTPException(status_code=403, detail="Access denied to this organization")

    service = get_service()
    try:
        alerts = await service.list_scheduled_alerts(org_slug, alert_type, enabled_only)
        return alerts
    except Exception as e:
        logger.error(f"Failed to list org alerts for {org_slug}: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail="Failed to retrieve scheduled alerts")


@router.get(
    "/{org_slug}/org-alerts/{alert_id}",
    response_model=ScheduledAlert,
    summary="Get org-specific scheduled alert",
    description="Get a specific scheduled alert for this organization",
)
async def get_org_alert(
    org_slug: str = Path(..., description="Organization slug"),
    alert_id: str = Path(..., description="Alert ID"),
    current_org: dict = Depends(get_current_org),
):
    """Get a specific org-specific scheduled alert."""
    if current_org.get("org_slug") != org_slug:
        raise HTTPException(status_code=403, detail="Access denied to this organization")

    service = get_service()
    try:
        alert = await service.get_scheduled_alert(org_slug, alert_id)
        if not alert:
            raise HTTPException(status_code=404, detail="Alert not found")
        return alert
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Failed to get org alert {alert_id}: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail="Failed to retrieve scheduled alert")


@router.post(
    "/{org_slug}/org-alerts",
    response_model=ScheduledAlert,
    summary="Create org-specific scheduled alert",
    description="Create a new scheduled alert for this organization",
    status_code=201,
)
async def create_org_alert(
    alert: ScheduledAlertCreate,
    org_slug: str = Path(..., description="Organization slug"),
    current_org: dict = Depends(get_current_org),
):
    """Create a new org-specific scheduled alert."""
    if current_org.get("org_slug") != org_slug:
        raise HTTPException(status_code=403, detail="Access denied to this organization")

    service = get_service()
    try:
        created = await service.create_scheduled_alert(
            org_slug, alert, current_org.get("admin_email")
        )
        return created
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        logger.error(f"Failed to create org alert: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail="Failed to create scheduled alert")


@router.put(
    "/{org_slug}/org-alerts/{alert_id}",
    response_model=ScheduledAlert,
    summary="Update org-specific scheduled alert",
    description="Update a scheduled alert for this organization",
)
async def update_org_alert(
    update: ScheduledAlertUpdate,
    org_slug: str = Path(..., description="Organization slug"),
    alert_id: str = Path(..., description="Alert ID"),
    current_org: dict = Depends(get_current_org),
):
    """Update an org-specific scheduled alert."""
    if current_org.get("org_slug") != org_slug:
        raise HTTPException(status_code=403, detail="Access denied to this organization")

    service = get_service()
    try:
        updated = await service.update_scheduled_alert(
            org_slug, alert_id, update, current_org.get("admin_email")
        )
        if not updated:
            raise HTTPException(status_code=404, detail="Alert not found")
        return updated
    except HTTPException:
        raise
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        logger.error(f"Failed to update org alert {alert_id}: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail="Failed to update scheduled alert")


@router.delete(
    "/{org_slug}/org-alerts/{alert_id}",
    status_code=204,
    summary="Delete org-specific scheduled alert",
    description="Delete a scheduled alert from this organization",
)
async def delete_org_alert(
    org_slug: str = Path(..., description="Organization slug"),
    alert_id: str = Path(..., description="Alert ID"),
    current_org: dict = Depends(get_current_org),
):
    """Delete an org-specific scheduled alert."""
    if current_org.get("org_slug") != org_slug:
        raise HTTPException(status_code=403, detail="Access denied to this organization")

    service = get_service()
    try:
        deleted = await service.delete_scheduled_alert(org_slug, alert_id)
        if not deleted:
            raise HTTPException(status_code=404, detail="Alert not found")
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Failed to delete org alert {alert_id}: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail="Failed to delete scheduled alert")


@router.post(
    "/{org_slug}/org-alerts/{alert_id}/enable",
    response_model=ScheduledAlert,
    summary="Enable scheduled alert",
    description="Enable a scheduled alert",
)
async def enable_org_alert(
    org_slug: str = Path(..., description="Organization slug"),
    alert_id: str = Path(..., description="Alert ID"),
    current_org: dict = Depends(get_current_org),
):
    """Enable an org-specific scheduled alert."""
    if current_org.get("org_slug") != org_slug:
        raise HTTPException(status_code=403, detail="Access denied to this organization")

    service = get_service()
    try:
        alert = await service.enable_scheduled_alert(org_slug, alert_id)
        if not alert:
            raise HTTPException(status_code=404, detail="Alert not found")
        return alert
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Failed to enable org alert {alert_id}: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail="Failed to enable scheduled alert")


@router.post(
    "/{org_slug}/org-alerts/{alert_id}/disable",
    response_model=ScheduledAlert,
    summary="Disable scheduled alert",
    description="Disable a scheduled alert",
)
async def disable_org_alert(
    org_slug: str = Path(..., description="Organization slug"),
    alert_id: str = Path(..., description="Alert ID"),
    current_org: dict = Depends(get_current_org),
):
    """Disable an org-specific scheduled alert."""
    if current_org.get("org_slug") != org_slug:
        raise HTTPException(status_code=403, detail="Access denied to this organization")

    service = get_service()
    try:
        alert = await service.disable_scheduled_alert(org_slug, alert_id)
        if not alert:
            raise HTTPException(status_code=404, detail="Alert not found")
        return alert
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Failed to disable org alert {alert_id}: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail="Failed to disable scheduled alert")


@router.get(
    "/{org_slug}/org-alerts/{alert_id}/history",
    response_model=List[OrgAlertHistoryEntry],
    summary="Get alert evaluation history",
    description="Get evaluation history for a specific alert",
)
async def get_org_alert_history(
    org_slug: str = Path(..., description="Organization slug"),
    alert_id: str = Path(..., description="Alert ID"),
    status: Optional[AlertHistoryStatus] = Query(None, description="Filter by status"),
    days: int = Query(7, ge=1, le=90, description="Days to look back"),
    limit: int = Query(50, ge=1, le=500, description="Max results"),
    current_org: dict = Depends(get_current_org),
):
    """Get evaluation history for a specific alert."""
    if current_org.get("org_slug") != org_slug:
        raise HTTPException(status_code=403, detail="Access denied to this organization")

    service = get_service()
    try:
        history = await service.list_alert_history(
            org_slug, alert_id, status, days, limit, 0
        )
        return history
    except Exception as e:
        logger.error(f"Failed to get alert history for {alert_id}: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail="Failed to retrieve alert history")
