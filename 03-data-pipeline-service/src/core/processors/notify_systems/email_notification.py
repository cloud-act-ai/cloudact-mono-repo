"""
Email Notification Engine (Notify Systems)

Processes notify_systems.email_notification ps_type for sending pipeline notifications.
Uses the unified notification registry.
"""

import logging
from typing import Dict, Any, List

from src.core.notifications import (
    get_notification_registry,
    NotificationPayload,
)

logger = logging.getLogger(__name__)


class EmailNotificationEngine:
    """
    Engine for processing email notifications.

    Uses the unified notification registry for sending.
    """

    def __init__(self):
        self._registry = get_notification_registry()

    def _determine_severity(self, trigger: str) -> str:
        """Map trigger to notification severity."""
        trigger_lower = trigger.lower()
        if "failure" in trigger_lower or "error" in trigger_lower:
            return "error"
        elif "warning" in trigger_lower:
            return "warning"
        elif "success" in trigger_lower:
            return "info"
        return "info"

    async def execute(
        self,
        step_config: Dict[str, Any],
        context: Dict[str, Any]
    ) -> Dict[str, Any]:
        """
        Execute email notification.

        Args:
            step_config: Step configuration from pipeline YAML
            context: Execution context including pipeline status, errors, etc.

        Returns:
            Execution result
        """
        org_slug = context.get("org_slug")
        pipeline_id = context.get("pipeline_id")
        trigger = step_config.get("trigger", "on_failure")

        # Check if notification should be sent based on trigger
        pipeline_status = context.get("pipeline_status", "UNKNOWN")
        should_send = self._should_send_notification(trigger, pipeline_status)

        if not should_send:
            return {
                "status": "SKIPPED",
                "reason": f"Trigger '{trigger}' not matched for status '{pipeline_status}'"
            }

        # Get notification parameters
        to_emails = step_config.get("to_emails", [])
        if isinstance(to_emails, str):
            to_emails = [to_emails]

        subject = step_config.get("subject", f"Pipeline {pipeline_id} Notification")
        message_body = step_config.get("message", context.get("error_message", "Pipeline notification"))

        # Determine severity
        severity = self._determine_severity(trigger)

        # Build notification details
        details = {
            "pipeline_id": pipeline_id,
            "org_slug": org_slug,
            "status": pipeline_status,
            "trigger": trigger
        }

        if context.get("error_message"):
            details["error"] = context["error_message"]

        if context.get("pipeline_logging_id"):
            details["pipeline_logging_id"] = context["pipeline_logging_id"]

        logger.info(
            "Sending email notification",
            extra={
                "trigger": trigger,
                "recipients": to_emails,
                "org_slug": org_slug,
                "pipeline_id": pipeline_id,
                "severity": severity,
            }
        )

        # Build unified payload
        payload = NotificationPayload(
            title=subject,
            message=message_body,
            severity=severity,
            org_slug=org_slug,
            recipients=to_emails,
            data=details,
        )

        # Send via unified registry
        results = await self._registry.send_to_channels(
            payload,
            channels=["email"],
            org_slug=org_slug
        )

        success = results.get("email", False)

        return {
            "status": "SUCCESS" if success else "FAILED",
            "trigger": trigger,
            "recipients": to_emails,
            "notification_sent": success
        }

    def _should_send_notification(self, trigger: str, pipeline_status: str) -> bool:
        """Determine if notification should be sent based on trigger and status."""
        trigger_lower = trigger.lower()
        status_lower = pipeline_status.lower()

        if trigger_lower == "always":
            return True
        elif trigger_lower == "on_failure":
            return status_lower in ["failed", "error", "failure"]
        elif trigger_lower == "on_success":
            return status_lower in ["success", "completed", "done"]
        elif trigger_lower == "on_completion":
            return status_lower in ["success", "completed", "done", "failed", "error", "failure"]

        return False


def get_engine():
    """Get EmailNotificationEngine instance."""
    return EmailNotificationEngine()
