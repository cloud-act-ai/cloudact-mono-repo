# CloudAct Notification System

Multi-provider notification system with tenant-specific configuration support.

## Features

- **Email Notifications**: SMTP-based email notifications with HTML formatting
- **Slack Notifications**: Rich Slack messages using Incoming Webhooks
- **Tenant-Specific Configuration**: Each tenant can have custom notification settings
- **Root Fallback**: Global configuration as fallback when tenant config not found
- **Event-Based Triggers**: Configure notifications per event type
- **Cooldown Periods**: Prevent notification spam with configurable cooldown
- **Retry Logic**: Automatic retry with exponential backoff
- **Multiple Providers**: Send to email, Slack, or both simultaneously

## Configuration Hierarchy

The notification system uses a two-level configuration hierarchy:

1. **Tenant-Specific Configuration** (highest priority)
   - Location: `./configs/{tenant_id}/notifications.json`
   - Use this for tenant-specific email addresses, Slack channels, etc.

2. **Root/Global Configuration** (fallback)
   - Location: `./configs/notifications/config.json`
   - Used when tenant-specific config not found or disabled

## Quick Start

### 1. Root Configuration (Global Fallback)

Copy the example and update credentials:

```bash
cp config.example.json config.json
```

Edit `config.json`:
- Set `enabled: true`
- Configure email SMTP settings
- Configure Slack webhook URL
- Enable/disable event triggers

### 2. Tenant-Specific Configuration (Optional)

For tenant-specific settings:

```bash
# Create tenant config directory
mkdir -p ../acme_corp

# Copy template
cp tenant-config.example.json ../acme_corp/notifications.json

# Edit tenant configuration
vi ../acme_corp/notifications.json
```

## Configuration Structure

### Root Configuration

```json
{
  "enabled": true,
  "default_provider": "email",

  "email": {
    "enabled": true,
    "smtp_host": "smtp.gmail.com",
    "smtp_port": 587,
    "smtp_username": "alerts@example.com",
    "smtp_password": "app-password",
    "from_email": "noreply@cloudact.io",
    "to_emails": ["admin@example.com"]
  },

  "slack": {
    "enabled": true,
    "webhook_url": "https://hooks.slack.com/services/...",
    "channel": "#alerts"
  },

  "event_triggers": [...]
}
```

### Tenant Configuration

Same structure as root config, but add:

```json
{
  "tenant_id": "acme_corp",
  ...
}
```

## Supported Events

| Event | Description | Default Severity |
|-------|-------------|------------------|
| `pipeline_started` | Pipeline execution started | INFO |
| `pipeline_success` | Pipeline completed successfully | INFO |
| `pipeline_failure` | Pipeline execution failed | ERROR |
| `pipeline_warning` | Pipeline completed with warnings | WARNING |
| `data_quality_failure` | Data quality checks failed | WARNING |
| `data_quality_warning` | Data quality warnings | WARNING |
| `rate_limit_exceeded` | Rate limit exceeded | WARNING |
| `system_error` | System-level error | CRITICAL |

## Event Trigger Configuration

Each event can be configured individually:

```json
{
  "event": "pipeline_failure",
  "enabled": true,
  "severity": "error",
  "providers": ["both"],  // email, slack, or both
  "template": null,       // Custom template (future)
  "cooldown_seconds": 300 // Min 5 minutes between notifications
}
```

## Provider Options

- `"email"`: Send via email only
- `"slack"`: Send via Slack only
- `"both"`: Send via both email and Slack

## Email Configuration

### SMTP Providers

**Gmail:**
```json
{
  "smtp_host": "smtp.gmail.com",
  "smtp_port": 587,
  "smtp_use_tls": true,
  "smtp_username": "your-email@gmail.com",
  "smtp_password": "your-app-password"
}
```

**Office 365:**
```json
{
  "smtp_host": "smtp.office365.com",
  "smtp_port": 587,
  "smtp_use_tls": true,
  "smtp_username": "your-email@company.com",
  "smtp_password": "your-password"
}
```

**SendGrid:**
```json
{
  "smtp_host": "smtp.sendgrid.net",
  "smtp_port": 587,
  "smtp_use_tls": true,
  "smtp_username": "apikey",
  "smtp_password": "YOUR_SENDGRID_API_KEY"
}
```

### Gmail App Passwords

For Gmail, create an app password:
1. Go to Google Account settings
2. Security → 2-Step Verification
3. App passwords → Generate
4. Use generated password in config

## Slack Configuration

### Creating a Webhook

1. Go to https://api.slack.com/apps
2. Create New App → From scratch
3. Add features: Incoming Webhooks
4. Activate Incoming Webhooks
5. Add New Webhook to Workspace
6. Select channel
7. Copy webhook URL

### Mention Configuration

**Mention users:**
```json
{
  "mention_users": ["U1234567890", "U0987654321"]
}
```

Find user IDs: Slack → View Profile → More → Copy member ID

**Mention channel:**
```json
{
  "mention_channel": true  // Uses @channel for critical alerts
}
```

## Usage Examples

### Python Code

```python
from core.notifications import get_notification_service, NotificationEvent, NotificationSeverity

# Get service instance
service = get_notification_service()

# Send notification
await service.notify(
    tenant_id="acme_corp",
    event=NotificationEvent.PIPELINE_FAILURE,
    severity=NotificationSeverity.ERROR,
    title="Pipeline Failed",
    message="Daily ingestion pipeline failed",
    pipeline_id="daily_ingestion",
    pipeline_logging_id="abc123",
    details={"error": "Connection timeout", "duration_ms": 5000}
)

# Or use convenience methods
await service.notify_pipeline_failure(
    tenant_id="acme_corp",
    pipeline_id="daily_ingestion",
    pipeline_logging_id="abc123",
    error_message="Connection timeout"
)

await service.notify_pipeline_success(
    tenant_id="acme_corp",
    pipeline_id="daily_ingestion",
    pipeline_logging_id="abc123",
    duration_ms=12000
)

await service.notify_data_quality_failure(
    tenant_id="acme_corp",
    pipeline_id="daily_ingestion",
    table_name="raw_customer_data",
    failed_checks=["null_check", "unique_check"]
)
```

## Retry Configuration

Configure retry behavior:

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

## Cooldown Periods

Prevent notification spam by setting cooldown:

```json
{
  "event": "pipeline_failure",
  "cooldown_seconds": 300  // Max 1 notification per 5 minutes
}
```

Set to `null` for no cooldown.

## Testing Notifications

Test your configuration:

```bash
# Test email
python -m core.notifications.test_email --tenant acme_corp

# Test Slack
python -m core.notifications.test_slack --tenant acme_corp
```

## Security Best Practices

1. **Never commit credentials** to git
2. **Use environment variables** for sensitive data
3. **Use app passwords** instead of account passwords
4. **Restrict webhook URLs** (don't share publicly)
5. **Use separate configs** for dev/staging/prod
6. **Rotate credentials** periodically

## Troubleshooting

### Email Issues

**Authentication failed:**
- Use app password instead of account password
- Check SMTP username/password
- Verify 2FA is enabled (Gmail)

**Connection timeout:**
- Check SMTP host and port
- Verify firewall allows outbound SMTP
- Try different port (25, 465, 587, 2525)

**TLS errors:**
- Set `smtp_use_tls: true` for ports 587, 2525
- Set `smtp_use_tls: false` for port 25

### Slack Issues

**Invalid webhook:**
- Verify webhook URL starts with `https://hooks.slack.com/`
- Regenerate webhook if expired
- Check webhook is for correct workspace

**Message not appearing:**
- Verify channel exists
- Check bot permissions
- Test webhook with curl

## Environment Variables

Override config with environment variables:

```bash
export NOTIFICATIONS_ENABLED=true
export EMAIL_SMTP_HOST=smtp.gmail.com
export EMAIL_SMTP_USERNAME=alerts@example.com
export EMAIL_SMTP_PASSWORD=your-app-password
export SLACK_WEBHOOK_URL=https://hooks.slack.com/...
```

## Configuration Resolution

For tenant `acme_corp`:

1. Check `./configs/acme_corp/notifications.json`
   - If exists and `enabled: true` → Use it ✓
2. Otherwise, check `./configs/notifications/config.json`
   - If exists and `enabled: true` → Use it ✓
3. Otherwise → Notifications disabled

## Support

For issues or questions:
- Check logs: `tail -f logs/notifications.log`
- Enable debug: `LOG_LEVEL=DEBUG`
- Contact: support@cloudact.io
