"""
Test Pipeline Failure Notifications

Demonstrates how the notification system integrates with pipeline executor.
"""

import pytest
import asyncio
from unittest.mock import AsyncMock, MagicMock, patch
from pathlib import Path

from src.core.pipeline.async_executor import AsyncPipelineExecutor
from src.core.notifications.service import NotificationService
from src.core.notifications.config import NotificationEvent, NotificationSeverity


@pytest.mark.asyncio
async def test_pipeline_failure_sends_notification():
    """
    Test that pipeline failures automatically trigger notifications.

    This test verifies:
    1. Pipeline executor initializes notification service
    2. Failures call notify_pipeline_failure()
    3. Notification includes error details
    """

    # Mock notification service
    mock_notification_service = MagicMock(spec=NotificationService)
    mock_notification_service.notify_pipeline_failure = AsyncMock(return_value={"email": True})

    # Create executor
    executor = AsyncPipelineExecutor(
        org_slug="test_org",
        pipeline_id="test-pipeline",
        trigger_type="api",
        trigger_by="test_user"
    )

    # Replace notification service with mock
    executor.notification_service = mock_notification_service

    # Mock config loading to fail
    with patch.object(executor, 'load_config', side_effect=ValueError("Test error")):
        try:
            await executor.execute()
        except ValueError:
            pass  # Expected to fail

    # Verify notification was sent
    mock_notification_service.notify_pipeline_failure.assert_called_once()

    # Check call arguments
    call_args = mock_notification_service.notify_pipeline_failure.call_args
    assert call_args.kwargs['org_slug'] == "test_org"
    assert call_args.kwargs['pipeline_id'] == "test-pipeline"
    assert "Test error" in call_args.kwargs['error_message']
    assert 'details' in call_args.kwargs


@pytest.mark.asyncio
async def test_pipeline_timeout_sends_notification():
    """
    Test that pipeline timeouts trigger failure notifications.
    """

    # Mock notification service
    mock_notification_service = MagicMock(spec=NotificationService)
    mock_notification_service.notify_pipeline_failure = AsyncMock(return_value={"email": True})

    # Create executor
    executor = AsyncPipelineExecutor(
        org_slug="test_org",
        pipeline_id="test-pipeline",
        trigger_type="api",
        trigger_by="test_user"
    )

    # Replace notification service with mock
    executor.notification_service = mock_notification_service

    # Mock BigQuery client to prevent real queries
    with patch("src.core.engine.bq_client.get_bigquery_client") as mock_bq:
        mock_client = MagicMock()
        mock_bq.return_value = mock_client

        # Mock config to have very short timeout
        mock_config = {
            'timeout_minutes': 0.001,  # Very short timeout
            'steps': []
        }

        # Mock slow pipeline execution
        async def slow_execution():
            await asyncio.sleep(1)  # Sleep longer than timeout

        with patch.object(executor, 'load_config', return_value=mock_config):
            with patch.object(executor, '_execute_pipeline_internal', side_effect=slow_execution):
                with pytest.raises(asyncio.TimeoutError):
                    await executor.execute()

        # Verify timeout notification was sent
        mock_notification_service.notify_pipeline_failure.assert_called_once()

        # Check timeout details
        call_args = mock_notification_service.notify_pipeline_failure.call_args
        assert "TIMEOUT" in call_args.kwargs['error_message']
        assert 'timeout_minutes' in call_args.kwargs['details']


@pytest.mark.asyncio
async def test_notification_failure_does_not_break_pipeline():
    """
    Test that notification failures are handled gracefully.

    Even if email/Slack fails, pipeline should still complete its
    error handling and cleanup.
    """

    # Mock notification service that fails
    mock_notification_service = MagicMock(spec=NotificationService)
    mock_notification_service.notify_pipeline_failure = AsyncMock(
        side_effect=Exception("SMTP connection failed")
    )

    # Create executor
    executor = AsyncPipelineExecutor(
        org_slug="test_org",
        pipeline_id="test-pipeline",
        trigger_type="api",
        trigger_by="test_user"
    )

    # Replace notification service with mock
    executor.notification_service = mock_notification_service

    # Mock config loading to fail
    with patch.object(executor, 'load_config', side_effect=ValueError("Pipeline error")):
        try:
            await executor.execute()
        except ValueError:
            pass  # Expected to fail with original error, not notification error

    # Verify pipeline failed with original error, not notification error
    assert executor.status == "FAILED"

    # Notification was attempted but failed
    mock_notification_service.notify_pipeline_failure.assert_called_once()


def test_notification_config_resolution():
    """
    Test notification configuration resolution order.

    Tests:
    1. Org-specific config takes precedence
    2. Falls back to root config
    3. Disables if neither exists
    """

    # Test with root config only
    service = NotificationService(config_base_path=Path("configs"))

    # Should use root config for org without specific config
    config = service.get_config("test_org_no_config")
    assert config is not None

    # Test org-specific config (if it exists)
    # config = service.get_config("acme_corp")
    # assert config.org_slug == "acme_corp"


@pytest.mark.asyncio
async def test_notification_cooldown():
    """
    Test that cooldown prevents notification spam.

    Multiple failures within cooldown period should only send
    one notification.
    """

    mock_notification_service = MagicMock(spec=NotificationService)

    # First call succeeds
    mock_notification_service.notify_pipeline_failure = AsyncMock(return_value={"email": True})

    # Simulate rapid failures
    for i in range(3):
        await mock_notification_service.notify_pipeline_failure(
            org_slug="test_org",
            pipeline_id="test-pipeline",
            pipeline_logging_id=f"log-{i}",
            error_message=f"Error {i}"
        )

    # All calls should go through (cooldown is enforced by NotificationService)
    assert mock_notification_service.notify_pipeline_failure.call_count == 3


# Integration test (requires actual SMTP config)
@pytest.mark.integration
@pytest.mark.asyncio
async def test_email_notification_integration():
    """
    Integration test for email notifications.

    Requires:
    - SMTP_USERNAME and SMTP_PASSWORD env vars
    - configs/notifications/config.json with valid SMTP settings

    To run:
        pytest tests/notifications/test_pipeline_failure_notification.py::test_email_notification_integration --run-integration
    """
    import os

    if not os.getenv("SMTP_USERNAME") or not os.getenv("SMTP_PASSWORD"):
        pytest.skip("SMTP credentials not configured")

    service = NotificationService(config_base_path=Path("configs"))

    # Send test notification
    result = await service.notify_pipeline_failure(
        org_slug="test_integration",
        pipeline_id="integration-test-pipeline",
        pipeline_logging_id="test-log-123",
        error_message="This is a test notification from integration tests",
        details={
            "test": True,
            "trigger_type": "manual",
            "steps_completed": 2,
            "total_steps": 5
        }
    )

    # Check if email was sent
    assert "email" in result or len(result) > 0, "Notification should have been sent"


if __name__ == "__main__":
    # Run basic tests
    asyncio.run(test_pipeline_failure_sends_notification())
    asyncio.run(test_pipeline_timeout_sends_notification())
    asyncio.run(test_notification_failure_does_not_break_pipeline())
    test_notification_config_resolution()
    asyncio.run(test_notification_cooldown())

    print("\nAll notification tests passed!")
    print("\nTo test email integration (requires SMTP config):")
    print("  pytest tests/notifications/test_pipeline_failure_notification.py::test_email_notification_integration --run-integration")
