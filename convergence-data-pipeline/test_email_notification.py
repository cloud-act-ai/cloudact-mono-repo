#!/usr/bin/env python3
"""
Test Email Notification System

This script tests the email notification system with a simulated pipeline failure.
"""

import asyncio
import sys
from pathlib import Path
from datetime import datetime

# Add src to path
sys.path.insert(0, str(Path(__file__).parent / "src"))

from core.notifications import (
    get_notification_service,
    NotificationEvent,
    NotificationSeverity
)


async def test_pipeline_failure_notification():
    """Test pipeline failure notification via email"""

    print("=" * 80)
    print("Testing Email Notification System")
    print("=" * 80)
    print()

    # Get notification service
    print("Initializing notification service...")
    service = get_notification_service()

    # Test configuration loading
    config = service.get_config("test_tenant")
    print(f"Configuration loaded:")
    print(f"  - Enabled: {config.enabled}")
    print(f"  - Email enabled: {config.email.enabled if config.email else False}")
    print(f"  - SMTP Host: {config.email.smtp_host if config.email else 'N/A'}")
    print(f"  - From: {config.email.from_email if config.email else 'N/A'}")
    print(f"  - To: {config.email.to_emails if config.email else 'N/A'}")
    print()

    # Test data
    tenant_id = "test_tenant"
    pipeline_id = "daily_customer_ingestion"
    pipeline_logging_id = f"test_{datetime.utcnow().strftime('%Y%m%d_%H%M%S')}"

    print(f"Test Parameters:")
    print(f"  - Tenant ID: {tenant_id}")
    print(f"  - Pipeline ID: {pipeline_id}")
    print(f"  - Logging ID: {pipeline_logging_id}")
    print()

    # Send pipeline failure notification
    print("Sending pipeline failure notification...")
    print()

    try:
        results = await service.notify_pipeline_failure(
            tenant_id=tenant_id,
            pipeline_id=pipeline_id,
            pipeline_logging_id=pipeline_logging_id,
            error_message="Database connection timeout after 30 seconds",
            details={
                "error_type": "TimeoutError",
                "step": "load_data",
                "rows_processed": 12543,
                "duration_ms": 30125,
                "retry_count": 3,
                "last_successful_run": "2025-11-15 10:30:00 UTC"
            }
        )

        print("✅ Notification sent successfully!")
        print()
        print("Results:")
        for provider, success in results.items():
            status = "✅ Success" if success else "❌ Failed"
            print(f"  - {provider}: {status}")

        print()
        print("=" * 80)
        print("Check your email inbox at: guru.kallam@gmail.com")
        print("Subject: [CloudAct Alert] ERROR: Pipeline Failed: daily_customer_ingestion")
        print("=" * 80)

        return True

    except Exception as e:
        print(f"❌ Error sending notification: {str(e)}")
        print()
        import traceback
        traceback.print_exc()
        return False


async def test_multiple_notifications():
    """Test multiple notification types"""

    print()
    print("=" * 80)
    print("Testing Multiple Notification Types")
    print("=" * 80)
    print()

    service = get_notification_service()
    tenant_id = "test_tenant"
    pipeline_id = "daily_customer_ingestion"

    # Test 1: Pipeline Success
    print("1. Testing Pipeline Success Notification...")
    await service.notify_pipeline_success(
        tenant_id=tenant_id,
        pipeline_id=pipeline_id,
        pipeline_logging_id=f"success_{datetime.utcnow().strftime('%H%M%S')}",
        duration_ms=45230,
        details={
            "rows_processed": 125430,
            "tables_updated": 3
        }
    )
    print("   ✅ Sent\n")

    # Test 2: Data Quality Failure
    print("2. Testing Data Quality Failure Notification...")
    await service.notify_data_quality_failure(
        tenant_id=tenant_id,
        pipeline_id=pipeline_id,
        table_name="raw_customer_data",
        failed_checks=["null_check_email", "unique_check_customer_id", "format_check_phone"]
    )
    print("   ✅ Sent\n")

    # Test 3: Custom System Error
    print("3. Testing System Error Notification...")
    await service.notify(
        tenant_id=tenant_id,
        event=NotificationEvent.SYSTEM_ERROR,
        severity=NotificationSeverity.CRITICAL,
        title="Critical System Error",
        message="BigQuery quota exceeded for project cloudact-prod",
        details={
            "quota_type": "query_bytes_billed",
            "current_usage": "10.5 TB",
            "quota_limit": "10 TB",
            "reset_time": "2025-11-17 00:00:00 UTC"
        }
    )
    print("   ✅ Sent\n")

    print("=" * 80)
    print("✅ All notifications sent successfully!")
    print("Check your email inbox for 3 separate emails")
    print("=" * 80)


async def main():
    """Main test function"""

    print()
    print("🔔 CloudAct Email Notification System Test")
    print()

    # Test 1: Pipeline Failure (Primary Test)
    success = await test_pipeline_failure_notification()

    if not success:
        print()
        print("❌ Primary test failed. Please check the error above.")
        sys.exit(1)

    # Test 2: Multiple notifications (optional)
    print()
    user_input = input("Would you like to test additional notification types? (y/n): ").strip().lower()

    if user_input == 'y':
        await test_multiple_notifications()

    print()
    print("🎉 Testing complete!")
    print()


if __name__ == "__main__":
    asyncio.run(main())
