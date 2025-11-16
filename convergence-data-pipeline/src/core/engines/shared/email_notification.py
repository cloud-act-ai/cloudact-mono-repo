"""
Email Notification Engine (Shared)
Processes shared.email_notification ps_type for sending pipeline notifications
"""
from typing import Dict, Any, Optional
from src.core.notifications.service import get_notification_service
from src.core.notifications.config import NotificationMessage, NotificationSeverity, NotificationEvent


class EmailNotificationEngine:
    """
    Engine for processing email notifications
    Integrates with existing notification system
    """

    def __init__(self):
        self.notification_service = get_notification_service()

    def _determine_severity(self, trigger: str) -> NotificationSeverity:
        """Map trigger to notification severity"""
        if "failure" in trigger.lower() or "error" in trigger.lower():
            return NotificationSeverity.ERROR
        elif "warning" in trigger.lower():
            return NotificationSeverity.WARNING
        elif "success" in trigger.lower():
            return NotificationSeverity.INFO
        return NotificationSeverity.INFO

    def _determine_event(self, trigger: str) -> NotificationEvent:
        """Map trigger to notification event"""
        if "failure" in trigger.lower():
            return NotificationEvent.PIPELINE_FAILURE
        elif "success" in trigger.lower():
            return NotificationEvent.PIPELINE_SUCCESS
        return NotificationEvent.PIPELINE_COMPLETION

    async def execute(
        self,
        step_config: Dict[str, Any],
        context: Dict[str, Any]
    ) -> Dict[str, Any]:
        """
        Execute email notification

        Args:
            step_config: Step configuration from pipeline YAML
            context: Execution context including pipeline status, errors, etc.

        Returns:
            Execution result
        """
        tenant_id = context.get("tenant_id")
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

        # Determine severity and event
        severity = self._determine_severity(trigger)
        event = self._determine_event(trigger)

        # Build notification details
        details = {
            "pipeline_id": pipeline_id,
            "tenant_id": tenant_id,
            "status": pipeline_status,
            "trigger": trigger
        }

        if context.get("error_message"):
            details["error"] = context["error_message"]

        if context.get("pipeline_logging_id"):
            details["pipeline_logging_id"] = context["pipeline_logging_id"]

        # Send notification using existing service
        print(f"[Email Engine] Sending {trigger} notification to {to_emails}")

        if trigger == "on_failure" and context.get("error_message"):
            # Use convenience method for failures
            success = await self.notification_service.notify_pipeline_failure(
                tenant_id=tenant_id,
                pipeline_id=pipeline_id,
                pipeline_logging_id=context.get("pipeline_logging_id", "unknown"),
                error_message=context["error_message"],
                details=details
            )
        elif trigger == "on_success":
            # Use convenience method for success
            success = await self.notification_service.notify_pipeline_success(
                tenant_id=tenant_id,
                pipeline_id=pipeline_id,
                pipeline_logging_id=context.get("pipeline_logging_id", "unknown"),
                details=details
            )
        else:
            # Use generic notify method
            message = NotificationMessage(
                event=event,
                severity=severity,
                title=subject,
                message=message_body,
                details=details
            )
            success = await self.notification_service.notify(
                tenant_id=tenant_id,
                message=message
            )

        return {
            "status": "SUCCESS" if success else "FAILED",
            "trigger": trigger,
            "recipients": to_emails,
            "notification_sent": success
        }

    def _should_send_notification(self, trigger: str, pipeline_status: str) -> bool:
        """Determine if notification should be sent based on trigger and status"""
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


# Factory function to get engine instance
def get_engine():
    """Get EmailNotificationEngine instance"""
    return EmailNotificationEngine()
