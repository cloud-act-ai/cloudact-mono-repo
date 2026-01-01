"""
Notification Settings Router

API endpoints for managing notification channels, rules, summaries, and history.
Reuses existing cost read service for data aggregation.
"""

import os
import logging
from typing import Optional, List
from fastapi import APIRouter, Depends, HTTPException, Query, Path

from src.core.services.notifications import (
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
)
from src.app.dependencies.auth import get_current_org, get_current_user

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
        logger.error(f"Failed to list channels: {e}")
        raise HTTPException(status_code=500, detail=str(e))


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
        logger.error(f"Failed to get channel: {e}")
        raise HTTPException(status_code=500, detail=str(e))


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
    current_user: dict = Depends(get_current_user),
):
    """Create a new notification channel."""
    if current_org.get("org_slug") != org_slug:
        raise HTTPException(status_code=403, detail="Access denied to this organization")

    service = get_service()
    try:
        created = await service.create_channel(
            org_slug,
            channel,
            created_by=current_user.get("user_id"),
        )
        return created
    except Exception as e:
        logger.error(f"Failed to create channel: {e}")
        raise HTTPException(status_code=500, detail=str(e))


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
        raise HTTPException(status_code=500, detail=str(e))


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
        raise HTTPException(status_code=500, detail=str(e))


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
    try:
        channel = await service.get_channel(org_slug, channel_id)
        if not channel:
            raise HTTPException(status_code=404, detail="Channel not found")

        # TODO: Implement actual test notification sending via pipeline service
        return {
            "success": True,
            "message": f"Test notification queued for {channel.channel_type.value} channel",
            "channel_id": channel_id,
        }
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Failed to test channel: {e}")
        raise HTTPException(status_code=500, detail=str(e))


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
        raise HTTPException(status_code=500, detail=str(e))


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
        raise HTTPException(status_code=500, detail=str(e))


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
    current_user: dict = Depends(get_current_user),
):
    """Create a new notification rule."""
    if current_org.get("org_slug") != org_slug:
        raise HTTPException(status_code=403, detail="Access denied to this organization")

    service = get_service()
    try:
        created = await service.create_rule(
            org_slug,
            rule,
            created_by=current_user.get("user_id"),
        )
        return created
    except Exception as e:
        logger.error(f"Failed to create rule: {e}")
        raise HTTPException(status_code=500, detail=str(e))


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
        raise HTTPException(status_code=500, detail=str(e))


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
        raise HTTPException(status_code=500, detail=str(e))


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
        raise HTTPException(status_code=500, detail=str(e))


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
        raise HTTPException(status_code=500, detail=str(e))


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
    """Test a notification rule."""
    if current_org.get("org_slug") != org_slug:
        raise HTTPException(status_code=403, detail="Access denied to this organization")

    service = get_service()
    try:
        rule = await service.get_rule(org_slug, rule_id)
        if not rule:
            raise HTTPException(status_code=404, detail="Rule not found")

        # TODO: Implement actual rule evaluation via pipeline service
        return {
            "success": True,
            "rule_id": rule_id,
            "would_trigger": False,
            "message": "Rule evaluation not yet implemented",
            "notification_sent": False,
        }
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Failed to test rule: {e}")
        raise HTTPException(status_code=500, detail=str(e))


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
        raise HTTPException(status_code=500, detail=str(e))


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
        raise HTTPException(status_code=500, detail=str(e))


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
    current_user: dict = Depends(get_current_user),
):
    """Create a new notification summary."""
    if current_org.get("org_slug") != org_slug:
        raise HTTPException(status_code=403, detail="Access denied to this organization")

    service = get_service()
    try:
        created = await service.create_summary(
            org_slug,
            summary,
            created_by=current_user.get("user_id"),
        )
        return created
    except Exception as e:
        logger.error(f"Failed to create summary: {e}")
        raise HTTPException(status_code=500, detail=str(e))


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
        raise HTTPException(status_code=500, detail=str(e))


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
        raise HTTPException(status_code=500, detail=str(e))


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
    """Generate a preview of the summary content."""
    if current_org.get("org_slug") != org_slug:
        raise HTTPException(status_code=403, detail="Access denied to this organization")

    service = get_service()
    try:
        summary = await service.get_summary(org_slug, summary_id)
        if not summary:
            raise HTTPException(status_code=404, detail="Summary not found")

        # TODO: Implement actual summary generation via cost service
        return {
            "success": True,
            "summary_id": summary_id,
            "preview": {
                "subject": f"[CloudAct] {summary.name}",
                "body_preview": "Cost summary preview not yet implemented",
            },
        }
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Failed to preview summary: {e}")
        raise HTTPException(status_code=500, detail=str(e))


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
    """Immediately send the summary."""
    if current_org.get("org_slug") != org_slug:
        raise HTTPException(status_code=403, detail="Access denied to this organization")

    service = get_service()
    try:
        summary = await service.get_summary(org_slug, summary_id)
        if not summary:
            raise HTTPException(status_code=404, detail="Summary not found")

        # TODO: Trigger immediate summary via pipeline service
        return {
            "success": True,
            "summary_id": summary_id,
            "message": "Summary queued for immediate delivery",
        }
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Failed to send summary: {e}")
        raise HTTPException(status_code=500, detail=str(e))


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
        raise HTTPException(status_code=500, detail=str(e))


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
        raise HTTPException(status_code=500, detail=str(e))


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
    current_user: dict = Depends(get_current_user),
):
    """Acknowledge a notification."""
    if current_org.get("org_slug") != org_slug:
        raise HTTPException(status_code=403, detail="Access denied to this organization")

    service = get_service()
    try:
        entry = await service.acknowledge_notification(
            org_slug, notification_id, current_user.get("user_id", "unknown")
        )
        if not entry:
            raise HTTPException(status_code=404, detail="History entry not found")
        return entry
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Failed to acknowledge notification: {e}")
        raise HTTPException(status_code=500, detail=str(e))


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
        raise HTTPException(status_code=500, detail=str(e))
