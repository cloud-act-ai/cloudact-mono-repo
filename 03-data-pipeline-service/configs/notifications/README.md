# Pipeline Failure Notifications

This directory contains notification configurations for pipeline failures and other events.

## Architecture

The notification system supports two configuration levels:

1. **Root Configuration** (`config.json`) - Global fallback for all organizations
2. **Org-Specific Configuration** (`../{org_slug}/notifications.json`) - Per-organization overrides

**Resolution Order:**
1. Check for org-specific config at `configs/{org_slug}/notifications.json`
2. Fall back to root config at `configs/notifications/config.json`
3. If neither exists, notifications are disabled

## Configuration Structure

```json
{
  "enabled": true,
  "default_provider": "email",
  "email": {
    "enabled": true,
    "smtp_host": "smtp.gmail.com",
    "smtp_port": 587,
    "smtp_username": "${SMTP_USERNAME}",
    "smtp_password": "${SMTP_PASSWORD}",
    "from_email": "noreply@cloudact.io",
    "to_emails": ["admin@example.com"]
  },
  "slack": {
    "enabled": false,
    "webhook_url": "${SLACK_WEBHOOK_URL}",
    "channel": "#alerts"
  },
  "event_triggers": [
    {
      "event": "pipeline_failure",
      "enabled": true,
      "severity": "error",
      "providers": ["email"],
      "cooldown_seconds": 300
    }
  ]
}
```

## Environment Variables

Set these in your `.env.local` file:

```bash
# Email Configuration (for SMTP)
SMTP_USERNAME=your-email@gmail.com
SMTP_PASSWORD=your-app-password

# Default admin email for root config
DEFAULT_ADMIN_EMAIL=admin@cloudact.io

# Org-specific admin email (per-org configs)
ORG_ADMIN_EMAIL=org-admin@example.com

# Slack webhook (optional)
SLACK_WEBHOOK_URL=https://hooks.slack.com/services/YOUR/WEBHOOK/URL
```

## Email Provider Setup

### Gmail SMTP

1. Enable 2FA on your Google account
2. Generate an App Password:
   - Go to: https://myaccount.google.com/apppasswords
   - Select "Mail" and "Other (Custom name)"
   - Copy the generated password
3. Set environment variables:
   ```bash
   export SMTP_USERNAME=your-email@gmail.com
   export SMTP_PASSWORD=your-app-password
   ```

### AWS SES

```json
{
  "email": {
    "smtp_host": "email-smtp.us-east-1.amazonaws.com",
    "smtp_port": 587,
    "smtp_username": "${AWS_SES_USERNAME}",
    "smtp_password": "${AWS_SES_PASSWORD}",
    "from_email": "verified-email@yourdomain.com"
  }
}
```

### SendGrid

```json
{
  "email": {
    "smtp_host": "smtp.sendgrid.net",
    "smtp_port": 587,
    "smtp_username": "apikey",
    "smtp_password": "${SENDGRID_API_KEY}",
    "from_email": "noreply@yourdomain.com"
  }
}
```

## Event Types

| Event | Description | Default Severity |
|-------|-------------|------------------|
| `pipeline_failure` | Pipeline failed or timed out | ERROR |
| `pipeline_success` | Pipeline completed successfully | INFO |
| `pipeline_started` | Pipeline execution started | INFO |
| `data_quality_failure` | Data quality checks failed | WARNING |
| `data_quality_warning` | Data quality checks degraded | WARNING |
| `rate_limit_exceeded` | Rate limit exceeded | WARNING |
| `system_error` | System-level error | CRITICAL |

## Notification Providers

### Email

**Features:**
- HTML and plain text formatting
- Multiple recipients (To, CC)
- SSL/TLS support
- Async SMTP operations

**Configuration:**
```json
{
  "email": {
    "enabled": true,
    "smtp_host": "smtp.gmail.com",
    "smtp_port": 587,
    "smtp_use_tls": true,
    "from_email": "noreply@cloudact.io",
    "from_name": "CloudAct Platform",
    "to_emails": ["admin@example.com", "ops@example.com"],
    "cc_emails": ["manager@example.com"],
    "subject_prefix": "[CloudAct]"
  }
}
```

### Slack

**Features:**
- Webhook-based notifications
- Channel override
- @mention support for critical alerts
- Rich formatting with attachments

**Configuration:**
```json
{
  "slack": {
    "enabled": true,
    "webhook_url": "https://hooks.slack.com/services/YOUR/WEBHOOK/URL",
    "channel": "#pipeline-alerts",
    "username": "CloudAct Bot",
    "icon_emoji": ":robot_face:",
    "mention_users": ["U123456", "U789012"],
    "mention_channel": false
  }
}
```

## Creating Org-Specific Configurations

1. Create config directory for organization:
   ```bash
   mkdir -p configs/{org_slug}
   ```

2. Copy template:
   ```bash
   cp configs/notifications/org_template.json configs/{org_slug}/notifications.json
   ```

3. Update configuration:
   ```json
   {
     "enabled": true,
     "org_slug": "acme_corp",
     "email": {
       "to_emails": ["admin@acme.com"]
     }
   }
   ```

4. Test notification:
   ```bash
   # Trigger a test pipeline failure to verify notifications work
   curl -X POST "http://localhost:8001/api/v1/pipelines/run/acme_corp/test/fail/test" \
     -H "X-API-Key: $ORG_API_KEY"
   ```

## How It Works

### Pipeline Executor Integration

The `AsyncPipelineExecutor` automatically sends notifications on:

1. **Pipeline Failure** - Any unhandled exception
   ```python
   await self.notification_service.notify_pipeline_failure(
       org_slug=self.org_slug,
       pipeline_id=self.tracking_pipeline_id,
       pipeline_logging_id=self.pipeline_logging_id,
       error_message=error_message,
       details={...}
   )
   ```

2. **Pipeline Timeout** - Execution exceeds configured timeout
3. **Data Quality Failure** - DQ checks fail (if configured)

### Notification Flow

```
Pipeline Failure
    │
    ├─ Log error to org_meta_pipeline_runs
    │
    ├─ Get notification config (org → root → disabled)
    │
    ├─ Check event_triggers for "pipeline_failure"
    │
    ├─ Send to configured providers
    │   ├─ Email: SMTP → HTML/plain text
    │   └─ Slack: Webhook → formatted message
    │
    └─ Continue with pipeline cleanup
```

### Configuration Caching

Configurations are cached for performance:
- Loaded once per organization
- Cache cleared on service restart
- Manual cache clear: `notification_service.clear_cache(org_slug)`

## Cooldown & Rate Limiting

Prevent notification spam with cooldowns:

```json
{
  "event_triggers": [
    {
      "event": "pipeline_failure",
      "cooldown_seconds": 300
    }
  ]
}
```

**Behavior:**
- First failure: Send notification
- Subsequent failures within 5 minutes: Skip notification
- After cooldown: Send next notification

## Retry Configuration

Failed notification delivery is retried with exponential backoff:

```json
{
  "retry_config": {
    "max_attempts": 3,
    "initial_delay_seconds": 5,
    "max_delay_seconds": 300,
    "exponential_backoff": true
  }
}
```

**Retry Schedule:**
- Attempt 1: Immediate
- Attempt 2: After 5 seconds
- Attempt 3: After 10 seconds (exponential backoff)

## Monitoring & Debugging

### Check Notification Logs

```bash
# Pipeline service logs
tail -f /var/log/pipeline-service.log | grep -i notification

# Check for notification errors
grep "notification failed" /var/log/pipeline-service.log
```

### Test Email Configuration

```python
from src.core.notifications.service import get_notification_service
import asyncio

async def test():
    service = get_notification_service()
    await service.notify_pipeline_failure(
        org_slug="test_org",
        pipeline_id="test-pipeline",
        pipeline_logging_id="test-123",
        error_message="Test notification"
    )

asyncio.run(test())
```

### Verify SMTP Credentials

```bash
# Test SMTP connection
python3 -c "
import smtplib
import ssl

context = ssl.create_default_context()
with smtplib.SMTP('smtp.gmail.com', 587) as server:
    server.starttls(context=context)
    server.login('your-email@gmail.com', 'your-app-password')
    print('SMTP authentication successful')
"
```

## Security Best Practices

1. **Never commit credentials** - Use environment variables
2. **Use App Passwords** - For Gmail, never use actual password
3. **Encrypt sensitive configs** - Consider KMS for SMTP passwords
4. **Restrict SMTP access** - Use dedicated notification email account
5. **Validate webhook URLs** - Ensure Slack webhooks are from hooks.slack.com

## Troubleshooting

### Email not sending

1. Check SMTP credentials:
   ```bash
   echo $SMTP_USERNAME
   echo $SMTP_PASSWORD
   ```

2. Verify email config in logs:
   ```
   grep "Email notifications" /var/log/pipeline-service.log
   ```

3. Test SMTP connection (see above)

### Notifications disabled

1. Check config exists:
   ```bash
   ls -la configs/notifications/config.json
   ls -la configs/{org_slug}/notifications.json
   ```

2. Verify `enabled: true` in config

3. Check event trigger is enabled:
   ```json
   {
     "event": "pipeline_failure",
     "enabled": true
   }
   ```

### Slack webhook failing

1. Verify webhook URL format:
   ```
   https://hooks.slack.com/services/T00000000/B00000000/XXXXXXXXXXXXXXXXXXXX
   ```

2. Test webhook directly:
   ```bash
   curl -X POST "$SLACK_WEBHOOK_URL" \
     -H "Content-Type: application/json" \
     -d '{"text": "Test notification"}'
   ```

3. Check Slack app permissions

## Future Enhancements

- [ ] PagerDuty integration
- [ ] SMS notifications (Twilio)
- [ ] Microsoft Teams webhooks
- [ ] Customizable email templates
- [ ] Notification batching (digest mode)
- [ ] Notification dashboard/history
- [ ] Per-pipeline notification overrides
