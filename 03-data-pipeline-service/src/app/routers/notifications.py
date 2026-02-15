"""
Notifications Router

Endpoints for sending notifications through configured channels (email, Slack, webhook).
Called by the API Service when alert rules trigger or when users test channels/rules.
"""

import logging
from typing import Optional, List, Dict, Any
from pydantic import BaseModel, Field
from fastapi import APIRouter, Depends, HTTPException, status

from src.app.dependencies.auth import verify_admin_key
from src.core.notifications.registry import (
    get_notification_registry,
    NotificationPayload,
    ProviderType,
)
from src.core.notifications.alert_sender import (
    AlertNotificationSender,
    AlertNotificationData,
    get_alert_sender,
)

logger = logging.getLogger(__name__)

router = APIRouter(
    prefix="/notifications",
    tags=["notifications"],
)


# ============================================
# Request/Response Models
# ============================================

class SendNotificationRequest(BaseModel):
    """Request to send a notification through configured channels."""
    org_slug: str = Field(..., description="Organization slug")
    event: str = Field(default="alert_triggered", description="Event type")
    severity: str = Field(default="medium", description="Severity: info, low, medium, high, critical")
    title: str = Field(..., description="Notification title")
    message: str = Field(..., description="Notification body")
    rule_id: Optional[str] = Field(None, description="Associated rule ID")
    # Channel targeting
    recipients: List[str] = Field(default_factory=list, description="Email recipients")
    channels: List[str] = Field(default_factory=lambda: ["email"], description="Channel types: email, slack, webhook")
    # Slack overrides
    slack_webhook_url: Optional[str] = Field(None, description="Slack webhook URL override")
    slack_channel: Optional[str] = Field(None, description="Slack channel override")
    # Cost context
    total_cost: Optional[float] = Field(None, description="Current cost amount")
    threshold: Optional[float] = Field(None, description="Threshold that was breached")
    currency: str = Field(default="USD", description="Currency code")
    period: str = Field(default="current_month", description="Cost period")
    # Extra
    details: Optional[Dict[str, Any]] = Field(None, description="Additional context data")


class TestChannelRequest(BaseModel):
    """Request to test a notification channel."""
    org_slug: str = Field(..., description="Organization slug")
    channel_type: str = Field(..., description="Channel type: email, slack, webhook")
    # Email config
    recipients: List[str] = Field(default_factory=list, description="Email recipients for test")
    # Slack config
    slack_webhook_url: Optional[str] = Field(None, description="Slack webhook URL")
    slack_channel: Optional[str] = Field(None, description="Slack channel")
    # Webhook config
    webhook_url: Optional[str] = Field(None, description="Webhook URL")
    webhook_headers: Optional[Dict[str, str]] = Field(None, description="Webhook headers")


class SendSummaryRequest(BaseModel):
    """Request to send a notification summary."""
    org_slug: str = Field(..., description="Organization slug")
    summary_id: str = Field(..., description="Summary ID")
    summary_name: str = Field(..., description="Summary name")
    channel_ids: List[str] = Field(default_factory=list, description="Target channel IDs")
    content: Dict[str, Any] = Field(default_factory=dict, description="Summary content")
    recipients: List[str] = Field(default_factory=list, description="Email recipients")


# ============================================
# Endpoints
# ============================================

@router.post(
    "/send",
    summary="Send notification through configured channels",
    description="Dispatches a notification to email/Slack/webhook. Called by API Service when alerts trigger.",
)
async def send_notification(
    request: SendNotificationRequest,
    _admin_context: None = Depends(verify_admin_key),
):
    """Send a notification to specified channels."""
    try:
        sender = get_alert_sender()

        alert_data = AlertNotificationData(
            alert_id=request.rule_id or "system",
            alert_name=request.title,
            org_slug=request.org_slug,
            severity=request.severity,
            description=request.message,
            total_cost=request.total_cost or 0.0,
            threshold=request.threshold or 0.0,
            currency=request.currency,
            period=request.period,
            recipients=request.recipients,
            channels=request.channels,
            slack_webhook_url=request.slack_webhook_url,
            slack_channel=request.slack_channel,
        )

        results = await sender.send(alert_data)

        success_count = sum(1 for v in results.values() if v)
        total_count = len(results)

        return {
            "success": success_count > 0,
            "channels_sent": success_count,
            "channels_total": total_count,
            "results": results,
            "org_slug": request.org_slug,
            "title": request.title,
        }

    except Exception as e:
        logger.error(f"Failed to send notification for {request.org_slug}: {e}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Notification send failed"
        )


@router.post(
    "/test",
    summary="Test a notification channel",
    description="Send a test notification to verify channel configuration.",
)
async def test_notification_channel(
    request: TestChannelRequest,
    _admin_context: None = Depends(verify_admin_key),
):
    """Test a notification channel by sending a test message."""
    try:
        registry = get_notification_registry()

        payload = NotificationPayload(
            subject=f"[CloudAct] Test notification for {request.org_slug}",
            body=f"This is a test notification from CloudAct to verify your {request.channel_type} channel is configured correctly.",
            severity="info",
            org_slug=request.org_slug,
            recipients=request.recipients,
            webhook_url=request.webhook_url,
            slack_channel=request.slack_channel,
        )

        # Map channel_type to provider type
        channel_map = {
            "email": ProviderType.EMAIL,
            "slack": ProviderType.SLACK,
            "webhook": ProviderType.WEBHOOK,
        }
        provider_type = channel_map.get(request.channel_type)
        if not provider_type:
            raise HTTPException(
                status_code=400,
                detail=f"Unknown channel type: {request.channel_type}"
            )

        # Configure org-specific overrides for Slack/Webhook
        if request.channel_type == "slack" and request.slack_webhook_url:
            from src.core.notifications.registry import SlackProviderConfig
            slack_config = SlackProviderConfig(
                enabled=True,
                webhook_url=request.slack_webhook_url,
                channel=request.slack_channel,
            )
            registry.set_config(ProviderType.SLACK, slack_config, org_slug=request.org_slug)

        if request.channel_type == "webhook" and request.webhook_url:
            from src.core.notifications.registry import WebhookProviderConfig
            webhook_config = WebhookProviderConfig(
                enabled=True,
                url=request.webhook_url,
                headers=request.webhook_headers or {},
            )
            registry.set_config(ProviderType.WEBHOOK, webhook_config, org_slug=request.org_slug)

        # Send test
        provider = registry.get_provider(provider_type, org_slug=request.org_slug)
        if not provider:
            return {
                "success": False,
                "message": f"{request.channel_type} provider not configured",
            }

        success = await provider.send(payload)

        return {
            "success": success,
            "message": "Test notification sent" if success else "Test notification failed",
            "channel_type": request.channel_type,
            "org_slug": request.org_slug,
        }

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Test notification failed: {e}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Test notification failed"
        )


@router.post(
    "/summary",
    summary="Send a notification summary",
    description="Send a pre-built summary report to specified channels.",
)
async def send_summary(
    request: SendSummaryRequest,
    _admin_context: None = Depends(verify_admin_key),
):
    """Send a summary notification to specified channels."""
    try:
        registry = get_notification_registry()

        # Build summary body from content
        content = request.content
        period = content.get("period", "Unknown period")
        total = content.get("total_cost", 0)
        currency = content.get("currency", "USD")

        body_lines = [
            f"Cost Summary: {period}",
            f"Total Cost: {currency} {total:,.2f}" if isinstance(total, (int, float)) else f"Total Cost: {currency} {total}",
        ]

        providers = content.get("top_providers", [])
        if providers:
            body_lines.append("\nTop Providers:")
            for p in providers:
                body_lines.append(f"  - {p.get('name', 'Unknown')}: {currency} {p.get('cost', 0):,.2f}")

        payload = NotificationPayload(
            subject=f"[CloudAct] {request.summary_name} - {request.org_slug}",
            body="\n".join(body_lines),
            severity="info",
            org_slug=request.org_slug,
            recipients=request.recipients,
        )

        results = await registry.send_to_channels(payload, ["email"], org_slug=request.org_slug)

        return {
            "success": any(results.values()),
            "results": results,
            "summary_id": request.summary_id,
        }

    except Exception as e:
        logger.error(f"Summary send failed: {e}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Summary send failed"
        )
