#!/bin/bash
#
# Setup Pipeline Failure Notifications
#
# This script helps you configure email notifications for pipeline failures.
#

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
NOTIFICATIONS_DIR="$PROJECT_DIR/configs/notifications"
CONFIG_FILE="$NOTIFICATIONS_DIR/config.json"

echo "=========================================="
echo "Pipeline Notification Setup"
echo "=========================================="
echo ""

# Check if config already exists
if [ -f "$CONFIG_FILE" ]; then
    echo "✓ Notification config already exists at:"
    echo "  $CONFIG_FILE"
    echo ""
    read -p "Do you want to reconfigure? (y/N): " -n 1 -r
    echo ""
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        echo "Setup cancelled."
        exit 0
    fi
fi

# Create notifications directory if it doesn't exist
mkdir -p "$NOTIFICATIONS_DIR"

echo "This script will help you set up email notifications for pipeline failures."
echo ""
echo "You'll need:"
echo "  1. SMTP server details (e.g., Gmail, SendGrid, AWS SES)"
echo "  2. Admin email address to receive alerts"
echo ""

# Prompt for email provider choice
echo "Select your email provider:"
echo "  1) Gmail (recommended for testing)"
echo "  2) AWS SES"
echo "  3) SendGrid"
echo "  4) Custom SMTP server"
echo ""
read -p "Enter choice (1-4): " PROVIDER_CHOICE

case $PROVIDER_CHOICE in
    1)
        SMTP_HOST="smtp.gmail.com"
        SMTP_PORT=587
        echo ""
        echo "Gmail Setup Instructions:"
        echo "  1. Enable 2FA on your Google account"
        echo "  2. Go to: https://myaccount.google.com/apppasswords"
        echo "  3. Select 'Mail' and 'Other (Custom name)'"
        echo "  4. Copy the generated 16-character password"
        echo ""
        ;;
    2)
        SMTP_HOST="email-smtp.us-east-1.amazonaws.com"
        SMTP_PORT=587
        echo ""
        echo "AWS SES Setup Instructions:"
        echo "  1. Verify your sending email in SES console"
        echo "  2. Create SMTP credentials in SES console"
        echo "  3. Use the SMTP username and password"
        echo ""
        ;;
    3)
        SMTP_HOST="smtp.sendgrid.net"
        SMTP_PORT=587
        echo ""
        echo "SendGrid Setup Instructions:"
        echo "  1. Create API key in SendGrid dashboard"
        echo "  2. Username is 'apikey' (literal)"
        echo "  3. Password is your API key"
        echo ""
        ;;
    4)
        read -p "Enter SMTP host: " SMTP_HOST
        read -p "Enter SMTP port (usually 587 or 465): " SMTP_PORT
        ;;
    *)
        echo "Invalid choice. Exiting."
        exit 1
        ;;
esac

# Prompt for credentials
echo ""
read -p "Enter SMTP username/email: " SMTP_USERNAME
read -sp "Enter SMTP password (hidden): " SMTP_PASSWORD
echo ""

# Prompt for from/to emails
echo ""
read -p "Enter 'from' email address: " FROM_EMAIL
read -p "Enter admin email (to receive alerts): " ADMIN_EMAIL

# Ask about Slack (optional)
echo ""
read -p "Do you want to enable Slack notifications? (y/N): " -n 1 -r ENABLE_SLACK
echo ""

if [[ $ENABLE_SLACK =~ ^[Yy]$ ]]; then
    echo ""
    echo "Slack Setup Instructions:"
    echo "  1. Create Incoming Webhook in Slack:"
    echo "     https://api.slack.com/messaging/webhooks"
    echo "  2. Copy the webhook URL"
    echo ""
    read -p "Enter Slack webhook URL: " SLACK_WEBHOOK
    read -p "Enter Slack channel (e.g., #alerts): " SLACK_CHANNEL
    SLACK_ENABLED="true"
else
    SLACK_ENABLED="false"
    SLACK_WEBHOOK=""
    SLACK_CHANNEL="#alerts"
fi

# Create config.json
echo ""
echo "Creating notification configuration..."

cat > "$CONFIG_FILE" <<EOF
{
  "enabled": true,
  "description": "Root/global notification configuration (fallback for all organizations)",
  "default_provider": "email",
  "email": {
    "enabled": true,
    "smtp_host": "$SMTP_HOST",
    "smtp_port": $SMTP_PORT,
    "smtp_username": "$SMTP_USERNAME",
    "smtp_password": "$SMTP_PASSWORD",
    "smtp_use_tls": true,
    "from_email": "$FROM_EMAIL",
    "from_name": "CloudAct Platform",
    "to_emails": [
      "$ADMIN_EMAIL"
    ],
    "subject_prefix": "[CloudAct]"
  },
EOF

if [[ $SLACK_ENABLED == "true" ]]; then
cat >> "$CONFIG_FILE" <<EOF
  "slack": {
    "enabled": true,
    "webhook_url": "$SLACK_WEBHOOK",
    "channel": "$SLACK_CHANNEL",
    "username": "CloudAct Bot",
    "icon_emoji": ":robot_face:",
    "mention_users": [],
    "mention_channel": false
  },
EOF
fi

cat >> "$CONFIG_FILE" <<EOF
  "event_triggers": [
    {
      "event": "pipeline_failure",
      "enabled": true,
      "severity": "error",
      "providers": ["email"],
      "cooldown_seconds": 300
    },
    {
      "event": "pipeline_success",
      "enabled": false,
      "severity": "info",
      "providers": ["email"]
    },
    {
      "event": "data_quality_failure",
      "enabled": true,
      "severity": "warning",
      "providers": ["email"],
      "cooldown_seconds": 600
    },
    {
      "event": "system_error",
      "enabled": true,
      "severity": "critical",
      "providers": ["email"],
      "cooldown_seconds": 180
    }
  ],
  "retry_config": {
    "max_attempts": 3,
    "initial_delay_seconds": 5,
    "max_delay_seconds": 300,
    "exponential_backoff": true
  },
  "timeout_seconds": 30
}
EOF

echo ""
echo "✓ Configuration created successfully!"
echo ""
echo "Config file location:"
echo "  $CONFIG_FILE"
echo ""

# Test SMTP connection
echo "=========================================="
echo "Testing SMTP Connection..."
echo "=========================================="
echo ""

python3 <<PYTHON_TEST
import smtplib
import ssl

try:
    context = ssl.create_default_context()
    with smtplib.SMTP('$SMTP_HOST', $SMTP_PORT) as server:
        server.starttls(context=context)
        server.login('$SMTP_USERNAME', '$SMTP_PASSWORD')
        print("✓ SMTP connection successful!")
        print("")
except Exception as e:
    print("✗ SMTP connection failed!")
    print(f"  Error: {e}")
    print("")
    print("Please check your credentials and try again.")
    exit(1)
PYTHON_TEST

if [ $? -eq 0 ]; then
    echo "=========================================="
    echo "Setup Complete!"
    echo "=========================================="
    echo ""
    echo "Pipeline failures will now automatically send notifications to:"
    echo "  Email: $ADMIN_EMAIL"
    if [[ $SLACK_ENABLED == "true" ]]; then
        echo "  Slack: $SLACK_CHANNEL"
    fi
    echo ""
    echo "To test notifications:"
    echo "  1. Run any pipeline that will fail"
    echo "  2. Check your email for failure alert"
    echo ""
    echo "To create org-specific configs:"
    echo "  cp configs/notifications/org_template.json configs/{org_slug}/notifications.json"
    echo ""
    echo "For more information, see:"
    echo "  configs/notifications/README.md"
    echo ""
else
    echo ""
    echo "Setup failed. Please check the errors above and try again."
    exit 1
fi
