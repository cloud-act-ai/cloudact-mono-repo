# Notification System Integration Guide

This guide shows how to integrate the notification system into your pipeline execution code.

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────┐
│                    Configuration Hierarchy                   │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  1. Tenant-Specific Config                                  │
│     ./configs/{tenant_id}/notifications.json                │
│     ↓ (if not found or disabled)                           │
│                                                              │
│  2. Root/Global Config (Fallback)                           │
│     ./configs/notifications/config.json                     │
│                                                              │
└─────────────────────────────────────────────────────────────┘
                          ↓
┌─────────────────────────────────────────────────────────────┐
│                   Notification Service                       │
├─────────────────────────────────────────────────────────────┤
│  • Loads configuration (tenant-specific → root fallback)    │
│  • Manages provider instances (Email, Slack)                │
│  • Routes notifications to configured providers             │
│  • Handles retry logic and cooldown periods                 │
└─────────────────────────────────────────────────────────────┘
                          ↓
        ┌─────────────────┴─────────────────┐
        ↓                                    ↓
┌──────────────────┐              ┌──────────────────┐
│ Email Provider   │              │ Slack Provider   │
├──────────────────┤              ├──────────────────┤
│ • SMTP sending   │              │ • Webhook calls  │
│ • HTML format    │              │ • Block Kit UI   │
│ • Retry logic    │              │ • Retry logic    │
└──────────────────┘              └──────────────────┘
```

## Integration Points

### 1. Pipeline Execution (Recommended)

Integrate notifications into your pipeline execution flow:

**File**: `src/core/pipeline/executor.py` or `src/app/routers/pipelines.py`

```python
from core.notifications import get_notification_service, NotificationEvent, NotificationSeverity
from datetime import datetime

async def execute_pipeline(tenant_id: str, pipeline_id: str, **kwargs):
    """Execute pipeline with notification support"""

    # Get notification service
    notification_service = get_notification_service()

    # Generate pipeline logging ID
    pipeline_logging_id = generate_logging_id()

    try:
        # Notify pipeline start (optional)
        await notification_service.notify_pipeline_started(
            tenant_id=tenant_id,
            pipeline_id=pipeline_id,
            pipeline_logging_id=pipeline_logging_id
        )

        # Execute pipeline steps
        start_time = datetime.utcnow()
        result = await run_pipeline_steps(tenant_id, pipeline_id, **kwargs)
        end_time = datetime.utcnow()
        duration_ms = int((end_time - start_time).total_seconds() * 1000)

        # Notify pipeline success
        await notification_service.notify_pipeline_success(
            tenant_id=tenant_id,
            pipeline_id=pipeline_id,
            pipeline_logging_id=pipeline_logging_id,
            duration_ms=duration_ms,
            details={
                "steps_completed": len(result.get("steps", [])),
                "rows_processed": result.get("total_rows", 0)
            }
        )

        return result

    except Exception as e:
        # Notify pipeline failure
        await notification_service.notify_pipeline_failure(
            tenant_id=tenant_id,
            pipeline_id=pipeline_id,
            pipeline_logging_id=pipeline_logging_id,
            error_message=str(e),
            details={
                "error_type": type(e).__name__,
                "traceback": traceback.format_exc()
            }
        )

        # Re-raise exception
        raise
```

### 2. Data Quality Checks

Integrate into data quality validation:

**File**: `src/core/dq/validator.py`

```python
from core.notifications import get_notification_service

async def validate_data_quality(tenant_id: str, pipeline_id: str, table_name: str, checks: List[Check]):
    """Run data quality checks with notification support"""

    notification_service = get_notification_service()
    failed_checks = []

    for check in checks:
        result = await run_check(check)
        if not result.passed:
            failed_checks.append(check.name)

    if failed_checks:
        await notification_service.notify_data_quality_failure(
            tenant_id=tenant_id,
            pipeline_id=pipeline_id,
            table_name=table_name,
            failed_checks=failed_checks,
            details={
                "total_checks": len(checks),
                "failed_count": len(failed_checks),
                "pass_rate": f"{((len(checks) - len(failed_checks)) / len(checks) * 100):.1f}%"
            }
        )

    return len(failed_checks) == 0
```

### 3. Error Handler Middleware

Add global error notification:

**File**: `src/app/main.py`

```python
from fastapi import FastAPI, Request
from core.notifications import get_notification_service, NotificationEvent, NotificationSeverity

app = FastAPI()

@app.middleware("http")
async def error_notification_middleware(request: Request, call_next):
    """Catch and notify system errors"""
    try:
        response = await call_next(request)
        return response
    except Exception as e:
        # Get tenant context
        tenant_id = getattr(request.state, "tenant_id", "system")

        # Notify system error
        notification_service = get_notification_service()
        await notification_service.notify(
            tenant_id=tenant_id,
            event=NotificationEvent.SYSTEM_ERROR,
            severity=NotificationSeverity.CRITICAL,
            title="System Error",
            message=f"Unhandled exception in {request.url.path}",
            details={
                "path": str(request.url),
                "method": request.method,
                "error": str(e),
                "error_type": type(e).__name__
            }
        )

        # Re-raise
        raise
```

### 4. Rate Limit Handler

Notify when rate limits are exceeded:

**File**: `src/app/main.py` (rate limiting middleware)

```python
from core.notifications import get_notification_service, NotificationEvent, NotificationSeverity

async def rate_limit_exceeded_handler(tenant_id: str, limit_type: str, current_count: int, limit: int):
    """Handle rate limit exceeded event"""

    notification_service = get_notification_service()

    await notification_service.notify(
        tenant_id=tenant_id,
        event=NotificationEvent.RATE_LIMIT_EXCEEDED,
        severity=NotificationSeverity.WARNING,
        title=f"Rate Limit Exceeded: {limit_type}",
        message=f"Tenant {tenant_id} exceeded {limit_type} rate limit",
        details={
            "limit_type": limit_type,
            "current_count": current_count,
            "limit": limit,
            "percentage": f"{(current_count / limit * 100):.1f}%"
        }
    )
```

## Usage Examples

### Basic Notification

```python
from core.notifications import get_notification_service, NotificationEvent, NotificationSeverity

service = get_notification_service()

await service.notify(
    tenant_id="acme_corp",
    event=NotificationEvent.PIPELINE_FAILURE,
    severity=NotificationSeverity.ERROR,
    title="Pipeline Failed",
    message="Daily ingestion pipeline failed",
    pipeline_id="daily_ingestion",
    pipeline_logging_id="abc123",
    details={"error": "Connection timeout"}
)
```

### Convenience Methods

```python
# Pipeline notifications
await service.notify_pipeline_started(
    tenant_id="acme_corp",
    pipeline_id="daily_ingestion",
    pipeline_logging_id="abc123"
)

await service.notify_pipeline_success(
    tenant_id="acme_corp",
    pipeline_id="daily_ingestion",
    pipeline_logging_id="abc123",
    duration_ms=12000
)

await service.notify_pipeline_failure(
    tenant_id="acme_corp",
    pipeline_id="daily_ingestion",
    pipeline_logging_id="abc123",
    error_message="Connection timeout"
)

# Data quality notifications
await service.notify_data_quality_failure(
    tenant_id="acme_corp",
    pipeline_id="daily_ingestion",
    table_name="raw_customer_data",
    failed_checks=["null_check", "unique_check"]
)
```

### Custom Event with Specific Providers

```python
from core.notifications import NotificationProvider

await service.notify(
    tenant_id="acme_corp",
    event=NotificationEvent.PIPELINE_WARNING,
    severity=NotificationSeverity.WARNING,
    title="Pipeline Warning",
    message="Pipeline completed with warnings",
    pipeline_id="daily_ingestion",
    providers=[NotificationProvider.SLACK]  # Slack only
)
```

## Configuration Management

### Clear Cache

If notification configuration is updated at runtime:

```python
# Clear cache for specific tenant
service.clear_cache(tenant_id="acme_corp")

# Clear all caches and reload root config
service.clear_cache()
```

### Check Configuration

```python
# Get configuration for tenant
config = service.get_config(tenant_id="acme_corp")

# Check if notifications enabled
if config.enabled:
    print(f"Notifications enabled for {tenant_id}")

# Check event configuration
event_config = config.get_event_config(NotificationEvent.PIPELINE_FAILURE)
if event_config:
    print(f"Pipeline failure notifications enabled: {event_config.enabled}")
    print(f"Providers: {event_config.providers}")
    print(f"Cooldown: {event_config.cooldown_seconds}s")
```

## Testing

### Unit Tests

```python
import pytest
from core.notifications import get_notification_service, NotificationEvent, NotificationSeverity

@pytest.mark.asyncio
async def test_notification_service():
    """Test notification service"""
    service = get_notification_service()

    # Send test notification
    results = await service.notify(
        tenant_id="test_tenant",
        event=NotificationEvent.PIPELINE_SUCCESS,
        severity=NotificationSeverity.INFO,
        title="Test Notification",
        message="This is a test",
        pipeline_id="test_pipeline"
    )

    # Check results
    assert len(results) > 0
```

### Integration Tests

```python
@pytest.mark.asyncio
async def test_pipeline_failure_notification():
    """Test pipeline failure notification"""
    service = get_notification_service()

    # Simulate pipeline failure
    await service.notify_pipeline_failure(
        tenant_id="test_tenant",
        pipeline_id="test_pipeline",
        pipeline_logging_id="test123",
        error_message="Test error"
    )

    # Verify notification was sent (check logs, mock, etc.)
```

## Best Practices

### 1. Use Convenience Methods

✅ **Good:**
```python
await service.notify_pipeline_failure(
    tenant_id=tenant_id,
    pipeline_id=pipeline_id,
    pipeline_logging_id=logging_id,
    error_message=str(e)
)
```

❌ **Avoid:**
```python
await service.notify(
    tenant_id=tenant_id,
    event=NotificationEvent.PIPELINE_FAILURE,
    severity=NotificationSeverity.ERROR,
    title=f"Pipeline Failed: {pipeline_id}",
    message=f"Pipeline {pipeline_id} failed with error: {str(e)}",
    ...
)
```

### 2. Include Contextual Details

✅ **Good:**
```python
await service.notify_pipeline_failure(
    tenant_id=tenant_id,
    pipeline_id=pipeline_id,
    pipeline_logging_id=logging_id,
    error_message=str(e),
    details={
        "error_type": type(e).__name__,
        "step": current_step,
        "rows_processed": rows_count,
        "duration_ms": duration
    }
)
```

### 3. Handle Notification Failures Gracefully

✅ **Good:**
```python
try:
    await service.notify_pipeline_failure(...)
except Exception as notification_error:
    # Log notification failure but don't fail the main operation
    logger.error(f"Failed to send notification: {notification_error}")
```

### 4. Use Cooldowns for Noisy Events

Configure cooldowns in event triggers to prevent spam:

```json
{
  "event": "rate_limit_exceeded",
  "cooldown_seconds": 3600  // Max 1 notification per hour
}
```

### 5. Tenant-Specific Overrides

Create tenant-specific configs for different notification requirements:

```
./configs/
  ├── notifications/config.json          # Root (fallback)
  ├── acme_corp/notifications.json       # ACME Corp (Slack-focused)
  ├── beta_customer/notifications.json   # Beta (Email-focused)
  └── vip_client/notifications.json      # VIP (Both, frequent)
```

## Troubleshooting

### Enable Debug Logging

```python
import logging

logging.getLogger("core.notifications").setLevel(logging.DEBUG)
```

### Check Configuration Loading

```python
service = get_notification_service()
config = service.get_config("your_tenant_id")

print(f"Enabled: {config.enabled}")
print(f"Email enabled: {config.email.enabled if config.email else False}")
print(f"Slack enabled: {config.slack.enabled if config.slack else False}")
print(f"Event triggers: {len(config.event_triggers)}")
```

### Test Email Configuration

```bash
# Send test email using Python
python -c "
import asyncio
from core.notifications import get_notification_service, NotificationEvent, NotificationSeverity

async def test():
    service = get_notification_service()
    await service.notify(
        tenant_id='test',
        event=NotificationEvent.SYSTEM_ERROR,
        severity=NotificationSeverity.INFO,
        title='Test Email',
        message='Testing email configuration'
    )

asyncio.run(test())
"
```

### Test Slack Configuration

```bash
# Test Slack webhook with curl
curl -X POST YOUR_WEBHOOK_URL \
  -H 'Content-Type: application/json' \
  -d '{"text": "Test message"}'
```

## Performance Considerations

### Async Operations

All notification operations are async and non-blocking:

```python
# Notifications don't block pipeline execution
await service.notify_pipeline_started(...)  # Returns immediately

# Pipeline continues executing
result = await execute_pipeline_steps()
```

### Concurrent Notifications

Multiple providers are notified concurrently:

```python
# Both email and Slack sent in parallel
await service.notify(
    ...,
    providers=[NotificationProvider.BOTH]  # Concurrent
)
```

### Caching

Service caches configurations and provider instances:
- Configuration loaded once per tenant
- Provider instances reused
- Call `clear_cache()` to reload

## Security

### Credential Management

**Never commit credentials to git!**

✅ **Good:**
```json
{
  "smtp_password": "${SMTP_PASSWORD}"  // Reference env var
}
```

❌ **Bad:**
```json
{
  "smtp_password": "actual-password-here"
}
```

### Use Environment Variables

```bash
export EMAIL_SMTP_PASSWORD=your-password
export SLACK_WEBHOOK_URL=https://hooks.slack.com/...
```

### Separate Configs by Environment

```
./configs/
  ├── notifications/config.dev.json
  ├── notifications/config.staging.json
  └── notifications/config.prod.json
```

## Migration Guide

### From No Notifications

1. Create root configuration
2. Enable notifications in settings
3. Add notification calls to pipeline code
4. Test with one tenant
5. Roll out to all tenants

### Adding Tenant-Specific Config

1. Copy template: `cp tenant-config.example.json configs/{tenant_id}/notifications.json`
2. Update tenant-specific settings
3. Test: Verify tenant config loads
4. Clear cache: `service.clear_cache(tenant_id)`

## Support

For issues or questions:
- Check logs: Application logs show notification activity
- Debug mode: Enable DEBUG logging
- Configuration: Verify configs are valid JSON
- Contact: support@cloudact.io
