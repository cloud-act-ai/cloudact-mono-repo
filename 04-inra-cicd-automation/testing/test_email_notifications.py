#!/usr/bin/env python3
"""
Email Notification Testing Infrastructure

Tests SMTP connectivity and email delivery for CloudAct platform.
Supports various notification types: signup, login alerts, cost alerts.

Usage:
    python test_email_notifications.py --type test
    python test_email_notifications.py --type signup --to user@example.com
    python test_email_notifications.py --type cost-alert --to admin@example.com
    python test_email_notifications.py --type login-alert --to user@example.com
"""

import smtplib
import ssl
import os
import argparse
import sys
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart
from datetime import datetime
from typing import Optional
from dataclasses import dataclass
from pathlib import Path

# Load environment from .env.local files
def load_env_file(env_path: str) -> dict:
    """Load environment variables from file."""
    env_vars = {}
    if os.path.exists(env_path):
        with open(env_path, 'r') as f:
            for line in f:
                line = line.strip()
                if line and not line.startswith('#') and '=' in line:
                    key, value = line.split('=', 1)
                    env_vars[key.strip()] = value.strip().strip('"').strip("'")
    return env_vars


@dataclass
class SMTPConfig:
    """SMTP configuration from environment."""
    host: str
    port: int
    username: str
    password: str
    from_email: str
    from_name: str

    @classmethod
    def from_env(cls) -> 'SMTPConfig':
        """Load SMTP config from environment variables."""
        # Try to load from .env.local files
        base_path = Path(__file__).parent.parent.parent

        env_files = [
            base_path / '02-api-service' / '.env.local',
            base_path / '03-data-pipeline-service' / '.env.local',
        ]

        env_vars = {}
        for env_file in env_files:
            if env_file.exists():
                env_vars.update(load_env_file(str(env_file)))
                break

        # Override with actual environment variables
        for key in ['EMAIL_SMTP_HOST', 'EMAIL_SMTP_PORT', 'EMAIL_SMTP_USERNAME',
                    'EMAIL_SMTP_PASSWORD', 'EMAIL_FROM_ADDRESS', 'EMAIL_FROM_NAME']:
            if os.getenv(key):
                env_vars[key] = os.getenv(key)

        return cls(
            host=env_vars.get('EMAIL_SMTP_HOST', 'smtp.gmail.com'),
            port=int(env_vars.get('EMAIL_SMTP_PORT', '587')),
            username=env_vars.get('EMAIL_SMTP_USERNAME', ''),
            password=env_vars.get('EMAIL_SMTP_PASSWORD', ''),
            from_email=env_vars.get('EMAIL_FROM_ADDRESS', ''),
            from_name=env_vars.get('EMAIL_FROM_NAME', 'CloudAct Support'),
        )


class EmailTemplates:
    """Email templates for various notification types."""

    @staticmethod
    def get_base_style() -> str:
        return """
        <style>
            body { font-family: 'Segoe UI', Arial, sans-serif; line-height: 1.6; color: #333; margin: 0; padding: 0; }
            .container { max-width: 600px; margin: 0 auto; }
            .header { background: linear-gradient(135deg, #2563eb 0%, #1d4ed8 100%); color: white; padding: 30px; text-align: center; }
            .header h1 { margin: 0; font-size: 24px; }
            .content { padding: 30px; background-color: #ffffff; }
            .footer { background-color: #f8fafc; padding: 20px; text-align: center; color: #64748b; font-size: 12px; }
            .button { display: inline-block; background-color: #2563eb; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; margin: 15px 0; }
            .alert-box { padding: 15px; border-radius: 8px; margin: 15px 0; }
            .alert-info { background-color: #dbeafe; border-left: 4px solid #2563eb; }
            .alert-warning { background-color: #fef3c7; border-left: 4px solid #f59e0b; }
            .alert-error { background-color: #fee2e2; border-left: 4px solid #ef4444; }
            .alert-success { background-color: #dcfce7; border-left: 4px solid #22c55e; }
            .details-table { width: 100%; border-collapse: collapse; margin: 15px 0; }
            .details-table td { padding: 10px; border-bottom: 1px solid #e2e8f0; }
            .details-table td:first-child { font-weight: 600; color: #475569; width: 40%; }
        </style>
        """

    @staticmethod
    def test_email(to_email: str) -> tuple[str, str, str]:
        """Generate test email template."""
        subject = "[CloudAct.ai] SMTP Configuration Test"

        html = f"""
        <!DOCTYPE html>
        <html>
        <head>{EmailTemplates.get_base_style()}</head>
        <body>
            <div class="container">
                <div class="header">
                    <h1>CloudAct Email Test</h1>
                </div>
                <div class="content">
                    <div class="alert-box alert-success">
                        <strong>Success!</strong> SMTP configuration is working correctly.
                    </div>
                    <table class="details-table">
                        <tr><td>Test Type</td><td>SMTP Connectivity</td></tr>
                        <tr><td>Recipient</td><td>{to_email}</td></tr>
                        <tr><td>Timestamp</td><td>{datetime.utcnow().isoformat()}Z</td></tr>
                        <tr><td>SMTP Server</td><td>smtp.gmail.com:587</td></tr>
                    </table>
                </div>
                <div class="footer">
                    <p>CloudAct.ai - Cloud Cost Analytics</p>
                    <p>&copy; {datetime.utcnow().year} CloudAct Inc. All rights reserved.</p>
                </div>
            </div>
        </body>
        </html>
        """

        text = f"""
CloudAct Email Test
==================

SMTP configuration is working correctly.

Test Type: SMTP Connectivity
Recipient: {to_email}
Timestamp: {datetime.utcnow().isoformat()}Z

---
CloudAct.ai - Cloud Cost Analytics
© {datetime.utcnow().year} CloudAct Inc. All rights reserved.
        """

        return subject, html, text

    @staticmethod
    def signup_welcome(to_email: str, user_name: str = "User", org_name: str = "Your Organization") -> tuple[str, str, str]:
        """Generate signup welcome email template."""
        subject = f"[CloudAct.ai] Welcome to CloudAct.ai, {user_name}!"

        html = f"""
        <!DOCTYPE html>
        <html>
        <head>{EmailTemplates.get_base_style()}</head>
        <body>
            <div class="container">
                <div class="header">
                    <h1>Welcome to CloudAct.ai!</h1>
                </div>
                <div class="content">
                    <p>Hi {user_name},</p>
                    <p>Thank you for signing up for CloudAct.ai! Your account has been created successfully.</p>

                    <div class="alert-box alert-info">
                        <strong>Organization:</strong> {org_name}<br>
                        <strong>Email:</strong> {to_email}
                    </div>

                    <p>Here's what you can do next:</p>
                    <ul>
                        <li>Connect your cloud providers (AWS, GCP, Azure)</li>
                        <li>Set up cost alerts and budgets</li>
                        <li>Invite team members to collaborate</li>
                    </ul>

                    <a href="https://app.cloudact.ai/dashboard" class="button">Go to Dashboard</a>

                    <p>If you have any questions, our support team is here to help.</p>
                </div>
                <div class="footer">
                    <p>CloudAct.ai - Cloud Cost Analytics</p>
                    <p>&copy; {datetime.utcnow().year} CloudAct Inc. All rights reserved.</p>
                </div>
            </div>
        </body>
        </html>
        """

        text = f"""
Welcome to CloudAct.ai, {user_name}!
====================================

Thank you for signing up for CloudAct.ai! Your account has been created successfully.

Organization: {org_name}
Email: {to_email}

What's next:
- Connect your cloud providers (AWS, GCP, Azure)
- Set up cost alerts and budgets
- Invite team members to collaborate

Visit your dashboard: https://app.cloudact.ai/dashboard

---
CloudAct.ai - Cloud Cost Analytics
© {datetime.utcnow().year} CloudAct Inc. All rights reserved.
        """

        return subject, html, text

    @staticmethod
    def login_alert(to_email: str, ip_address: str = "Unknown", location: str = "Unknown", device: str = "Unknown") -> tuple[str, str, str]:
        """Generate login alert email template."""
        subject = "[CloudAct.ai] New Login Detected"

        html = f"""
        <!DOCTYPE html>
        <html>
        <head>{EmailTemplates.get_base_style()}</head>
        <body>
            <div class="container">
                <div class="header" style="background: linear-gradient(135deg, #f59e0b 0%, #d97706 100%);">
                    <h1>New Login Detected</h1>
                </div>
                <div class="content">
                    <p>Hi,</p>
                    <p>We detected a new login to your CloudAct.ai account.</p>

                    <table class="details-table">
                        <tr><td>Time</td><td>{datetime.utcnow().strftime('%Y-%m-%d %H:%M:%S')} UTC</td></tr>
                        <tr><td>IP Address</td><td>{ip_address}</td></tr>
                        <tr><td>Location</td><td>{location}</td></tr>
                        <tr><td>Device</td><td>{device}</td></tr>
                    </table>

                    <div class="alert-box alert-warning">
                        <strong>Not you?</strong> If you didn't sign in, please secure your account immediately by changing your password.
                    </div>

                    <a href="https://app.cloudact.ai/settings/security" class="button" style="background-color: #f59e0b;">Review Security Settings</a>
                </div>
                <div class="footer">
                    <p>CloudAct.ai - Cloud Cost Analytics</p>
                    <p>&copy; {datetime.utcnow().year} CloudAct Inc. All rights reserved.</p>
                </div>
            </div>
        </body>
        </html>
        """

        text = f"""
New Login Detected
==================

We detected a new login to your CloudAct.ai account.

Time: {datetime.utcnow().strftime('%Y-%m-%d %H:%M:%S')} UTC
IP Address: {ip_address}
Location: {location}
Device: {device}

Not you? If you didn't sign in, please secure your account immediately.

Review Security Settings: https://app.cloudact.ai/settings/security

---
CloudAct.ai - Cloud Cost Analytics
© {datetime.utcnow().year} CloudAct Inc. All rights reserved.
        """

        return subject, html, text

    @staticmethod
    def cost_alert(to_email: str, provider: str = "AWS", current_spend: float = 0, budget: float = 0, threshold: int = 80) -> tuple[str, str, str]:
        """Generate cost alert email template."""
        percentage = (current_spend / budget * 100) if budget > 0 else 0
        alert_level = "error" if percentage >= 100 else "warning"
        subject = f"[CloudAct.ai] Cost Alert: {provider} at {percentage:.0f}% of budget"

        html = f"""
        <!DOCTYPE html>
        <html>
        <head>{EmailTemplates.get_base_style()}</head>
        <body>
            <div class="container">
                <div class="header" style="background: linear-gradient(135deg, #ef4444 0%, #dc2626 100%);">
                    <h1>Cost Alert</h1>
                </div>
                <div class="content">
                    <div class="alert-box alert-{alert_level}">
                        <strong>{provider} spending has reached {percentage:.0f}% of your budget!</strong>
                    </div>

                    <table class="details-table">
                        <tr><td>Provider</td><td>{provider}</td></tr>
                        <tr><td>Current Spend</td><td>${current_spend:,.2f}</td></tr>
                        <tr><td>Budget</td><td>${budget:,.2f}</td></tr>
                        <tr><td>Alert Threshold</td><td>{threshold}%</td></tr>
                        <tr><td>Period</td><td>{datetime.utcnow().strftime('%B %Y')}</td></tr>
                    </table>

                    <p>Recommendations:</p>
                    <ul>
                        <li>Review your resource usage for optimization opportunities</li>
                        <li>Check for unused or idle resources</li>
                        <li>Consider reserved instances for predictable workloads</li>
                    </ul>

                    <a href="https://app.cloudact.ai/costs/{provider.lower()}" class="button" style="background-color: #ef4444;">View Cost Details</a>
                </div>
                <div class="footer">
                    <p>CloudAct.ai - Cloud Cost Analytics</p>
                    <p>&copy; {datetime.utcnow().year} CloudAct Inc. All rights reserved.</p>
                </div>
            </div>
        </body>
        </html>
        """

        text = f"""
Cost Alert: {provider}
=====================

{provider} spending has reached {percentage:.0f}% of your budget!

Provider: {provider}
Current Spend: ${current_spend:,.2f}
Budget: ${budget:,.2f}
Alert Threshold: {threshold}%
Period: {datetime.utcnow().strftime('%B %Y')}

Recommendations:
- Review your resource usage for optimization opportunities
- Check for unused or idle resources
- Consider reserved instances for predictable workloads

View details: https://app.cloudact.ai/costs/{provider.lower()}

---
CloudAct.ai - Cloud Cost Analytics
© {datetime.utcnow().year} CloudAct Inc. All rights reserved.
        """

        return subject, html, text


class EmailTester:
    """Email testing utility."""

    def __init__(self, config: Optional[SMTPConfig] = None):
        self.config = config or SMTPConfig.from_env()

    def validate_config(self) -> bool:
        """Validate SMTP configuration."""
        if not self.config.username:
            print("ERROR: EMAIL_SMTP_USERNAME not set")
            return False
        if not self.config.password:
            print("ERROR: EMAIL_SMTP_PASSWORD not set")
            return False
        if not self.config.from_email:
            print("ERROR: EMAIL_FROM_ADDRESS not set")
            return False
        return True

    def test_connection(self) -> bool:
        """Test SMTP connection without sending."""
        try:
            print(f"Testing connection to {self.config.host}:{self.config.port}...")
            context = ssl.create_default_context()
            with smtplib.SMTP(self.config.host, self.config.port, timeout=10) as server:
                server.starttls(context=context)
                server.login(self.config.username, self.config.password)
                print("Connection successful!")
                return True
        except Exception as e:
            print(f"Connection failed: {e}")
            return False

    def send_email(self, to_email: str, subject: str, html_body: str, text_body: str) -> bool:
        """Send an email."""
        try:
            msg = MIMEMultipart('alternative')
            msg['Subject'] = subject
            msg['From'] = f"{self.config.from_name} <{self.config.from_email}>"
            msg['To'] = to_email

            msg.attach(MIMEText(text_body, 'plain'))
            msg.attach(MIMEText(html_body, 'html'))

            context = ssl.create_default_context()
            with smtplib.SMTP(self.config.host, self.config.port) as server:
                server.starttls(context=context)
                server.login(self.config.username, self.config.password)
                server.send_message(msg)

            print(f"Email sent successfully to {to_email}")
            return True
        except Exception as e:
            print(f"Failed to send email: {e}")
            return False

    def send_test_email(self, to_email: str) -> bool:
        """Send a test email."""
        subject, html, text = EmailTemplates.test_email(to_email)
        return self.send_email(to_email, subject, html, text)

    def send_signup_email(self, to_email: str, user_name: str = "User", org_name: str = "Your Organization") -> bool:
        """Send signup welcome email."""
        subject, html, text = EmailTemplates.signup_welcome(to_email, user_name, org_name)
        return self.send_email(to_email, subject, html, text)

    def send_login_alert(self, to_email: str, ip_address: str = "192.168.1.1",
                         location: str = "San Francisco, CA", device: str = "Chrome on macOS") -> bool:
        """Send login alert email."""
        subject, html, text = EmailTemplates.login_alert(to_email, ip_address, location, device)
        return self.send_email(to_email, subject, html, text)

    def send_cost_alert(self, to_email: str, provider: str = "AWS",
                        current_spend: float = 850.00, budget: float = 1000.00) -> bool:
        """Send cost alert email."""
        subject, html, text = EmailTemplates.cost_alert(to_email, provider, current_spend, budget)
        return self.send_email(to_email, subject, html, text)


def main():
    parser = argparse.ArgumentParser(description='CloudAct Email Testing Tool')
    parser.add_argument('--type', choices=['test', 'signup', 'login-alert', 'cost-alert', 'connection'],
                        default='test', help='Type of email to send')
    parser.add_argument('--to', type=str, help='Recipient email address')
    parser.add_argument('--user', type=str, default='Test User', help='User name (for signup)')
    parser.add_argument('--org', type=str, default='Test Organization', help='Organization name (for signup)')
    parser.add_argument('--provider', type=str, default='AWS', help='Cloud provider (for cost-alert)')
    parser.add_argument('--spend', type=float, default=850.00, help='Current spend (for cost-alert)')
    parser.add_argument('--budget', type=float, default=1000.00, help='Budget amount (for cost-alert)')

    args = parser.parse_args()

    tester = EmailTester()

    if not tester.validate_config():
        sys.exit(1)

    if args.type == 'connection':
        success = tester.test_connection()
        sys.exit(0 if success else 1)

    if not args.to:
        print("ERROR: --to email address is required")
        sys.exit(1)

    if args.type == 'test':
        success = tester.send_test_email(args.to)
    elif args.type == 'signup':
        success = tester.send_signup_email(args.to, args.user, args.org)
    elif args.type == 'login-alert':
        success = tester.send_login_alert(args.to)
    elif args.type == 'cost-alert':
        success = tester.send_cost_alert(args.to, args.provider, args.spend, args.budget)
    else:
        print(f"Unknown email type: {args.type}")
        sys.exit(1)

    sys.exit(0 if success else 1)


if __name__ == '__main__':
    main()
