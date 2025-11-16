# CloudAct Convergence Data Pipeline - Documentation Index

**Complete documentation for the CloudAct Convergence Data Pipeline platform**

Last Updated: November 16, 2025

---

## 📚 Table of Contents

- [Getting Started](#getting-started)
- [Guides](#guides)
- [Reference Documentation](#reference-documentation)
- [Implementation Details](#implementation-details)
- [Notifications](#notifications)
- [Security](#security)
- [Testing](#testing)

---

## 🚀 Getting Started

**Start here if you're new to the platform**

### Quick Start
- **[Quick Start Guide](guides/QUICK_START.md)** - Get up and running in 15 minutes
- **[Onboarding Guide](guides/ONBOARDING.md)** - Complete tenant onboarding process
- **[Deployment Guide](guides/DEPLOYMENT_GUIDE.md)** - Production deployment instructions

### Core Concepts
- **[Multi-Tenancy Design](implementation/MULTI_TENANCY_DESIGN.md)** - How multi-tenancy works
- **[Implementation Summary](implementation/IMPLEMENTATION_SUMMARY.md)** - High-level architecture overview
- **[Technical Implementation](implementation/TECHNICAL_IMPLEMENTATION.md)** - Detailed technical documentation

---

## 📖 Guides

**Step-by-step guides for common tasks**

### Setup & Deployment
- **[Deployment Guide](guides/DEPLOYMENT_GUIDE.md)** - Deploy to production
- **[Hands-Off Implementation Guide](guides/HANDS_OFF_IMPLEMENTATION.md)** - Automated setup guide
- **[GCP Navigation Guide](guides/GCP_NAVIGATION_GUIDE.md)** - Navigate Google Cloud Platform resources

### Operations
- **[Onboarding Guide](guides/ONBOARDING.md)** - Onboard new tenants
- **[Monthly Testing Guide](guides/MONTHLY_TESTING_GUIDE.md)** - Monthly system health checks
- **[Rate Limiting Quick Start](guides/RATE_LIMITING_QUICK_START.md)** - Configure rate limits

---

## 📋 Reference Documentation

**Complete API and configuration references**

### API & Configuration
- **[API Reference](reference/API_REFERENCE.md)** - Complete API documentation
- **[Environment Variables](reference/ENVIRONMENT_VARIABLES.md)** - All environment variables
- **[Pipeline Configuration](reference/pipeline-configuration.md)** - Pipeline YAML structure
- **[Metadata Schema](reference/metadata-schema.md)** - BigQuery metadata tables

### Rate Limiting
- **[Rate Limiting Documentation](reference/RATE_LIMITING.md)** - Complete rate limiting guide
- **[Rate Limits Reference](reference/RATE_LIMITS_REFERENCE.md)** - Rate limit values and configuration

---

## 🏗️ Implementation Details

**Architecture and design documentation**

### Architecture
- **[Implementation Summary](implementation/IMPLEMENTATION_SUMMARY.md)** - System architecture
- **[Technical Implementation](implementation/TECHNICAL_IMPLEMENTATION.md)** - Detailed implementation
- **[Multi-Tenancy Design](implementation/MULTI_TENANCY_DESIGN.md)** - Multi-tenant architecture

### Key Features
- Single-dataset-per-tenant architecture
- BigQuery-native metadata storage
- Async batch processing with retry logic
- Circuit breaker pattern for resilience
- Per-tenant and global rate limiting

---

## 🔔 Notifications

**Email and Slack notification system**

### Getting Started
- **[Notification System Overview](notifications/NOTIFICATION_SYSTEM_IMPLEMENTATION.md)** - Complete implementation guide
- **[Integration Guide](notifications/INTEGRATION_GUIDE.md)** - Integrate notifications into pipelines
- **[Configuration Guide](notifications/CONFIGURATION.md)** - Configure email and Slack

### Key Features
- **Tenant-Specific Configuration** with root fallback
- **Multi-Provider Support**: Email (SMTP) and Slack (Webhooks)
- **Event-Based Triggers**: Pipeline, data quality, system events
- **Retry Logic**: Exponential backoff with configurable attempts
- **Cooldown Periods**: Prevent notification spam
- **Rich Formatting**: HTML emails, Slack Block Kit

### Quick Setup
```python
from core.notifications import get_notification_service

service = get_notification_service()

# Send pipeline failure notification
await service.notify_pipeline_failure(
    tenant_id="acme_corp",
    pipeline_id="daily_ingestion",
    pipeline_logging_id="abc123",
    error_message="Connection timeout"
)
```

### Configuration Files
- Root: `./configs/notifications/config.json`
- Tenant: `./configs/{tenant_id}/notifications.json`

---

## 🔒 Security

**Security features and best practices**

### Documentation
- **[Secrets Management](security/README_SECRETS.md)** - Secure secrets handling
- **[KMS Encryption](security/KMS_ENCRYPTION.md)** - Google Cloud KMS integration

### Security Features
- API key authentication with SHA256 hashing
- Google Cloud KMS encryption for credentials
- SQL injection protection (parameterized queries)
- Path traversal prevention
- Rate limiting (per-tenant and global)
- Secrets stored outside git repository
- OWASP Top 10 compliance

### Best Practices
- Never commit credentials to git
- Use KMS for production encryption
- Rotate API keys regularly
- Enable rate limiting in production
- Use separate configs per environment
- Monitor failed authentication attempts

---

## 🧪 Testing

**Testing guides and documentation**

### Documentation
- **[Testing Guide](testing/README.md)** - Complete testing documentation

### Test Coverage
- Unit tests for core modules
- Integration tests for BigQuery operations
- E2E tests for pipeline execution
- Security tests for authentication
- Performance tests for rate limiting

### Running Tests
```bash
# Run all tests
pytest

# Run with coverage
pytest --cov=src --cov-report=html

# Run specific test file
pytest tests/test_notifications.py
```

---

## 📁 Project Structure

```
convergence-data-pipeline/
├── src/
│   ├── app/                    # FastAPI application
│   │   ├── main.py            # App entry point
│   │   ├── config.py          # Configuration
│   │   ├── routers/           # API endpoints
│   │   └── dependencies/      # Auth & rate limiting
│   └── core/                  # Core business logic
│       ├── metadata/          # Metadata logging
│       ├── pipeline/          # Pipeline execution
│       ├── notifications/     # Notification system
│       ├── security/          # KMS encryption
│       ├── pubsub/           # Pub/Sub integration
│       └── utils/            # Utilities
├── configs/
│   ├── {tenant_id}/          # Tenant-specific configs
│   ├── notifications/        # Notification configs
│   ├── metadata/schemas/     # BigQuery schemas
│   └── system/              # System configs
├── docs/                     # Documentation (you are here)
│   ├── guides/              # How-to guides
│   ├── reference/           # API & config reference
│   ├── implementation/      # Architecture docs
│   ├── notifications/       # Notification docs
│   ├── security/           # Security docs
│   └── testing/            # Testing docs
└── tests/                   # Test suite
```

---

## 🔗 Quick Links

### Essential Reading
1. **[Quick Start Guide](guides/QUICK_START.md)** - Get started in 15 minutes
2. **[API Reference](reference/API_REFERENCE.md)** - API endpoints
3. **[Notification System](notifications/NOTIFICATION_SYSTEM_IMPLEMENTATION.md)** - Email/Slack alerts

### Common Tasks
- **Add a new tenant**: [Onboarding Guide](guides/ONBOARDING.md)
- **Configure notifications**: [Notification Configuration](notifications/CONFIGURATION.md)
- **Set up rate limits**: [Rate Limiting Quick Start](guides/RATE_LIMITING_QUICK_START.md)
- **Deploy to production**: [Deployment Guide](guides/DEPLOYMENT_GUIDE.md)
- **Troubleshoot issues**: Check logs, see [Monthly Testing Guide](guides/MONTHLY_TESTING_GUIDE.md)

### External Resources
- [Google Cloud BigQuery Documentation](https://cloud.google.com/bigquery/docs)
- [FastAPI Documentation](https://fastapi.tiangolo.com/)
- [Pydantic Documentation](https://docs.pydantic.dev/)

---

## 📊 System Overview

### Key Components

| Component | Description | Documentation |
|-----------|-------------|---------------|
| **API Server** | FastAPI application with tenant authentication | [API Reference](reference/API_REFERENCE.md) |
| **Pipeline Engine** | Async pipeline execution with retry logic | [Pipeline Config](reference/pipeline-configuration.md) |
| **Metadata Logger** | High-performance async logging to BigQuery | [Metadata Schema](reference/metadata-schema.md) |
| **Notification System** | Multi-provider notifications (Email, Slack) | [Notifications](notifications/NOTIFICATION_SYSTEM_IMPLEMENTATION.md) |
| **Rate Limiter** | Per-tenant and global rate limiting | [Rate Limiting](reference/RATE_LIMITING.md) |
| **Security** | KMS encryption, API key auth, SQL injection protection | [Security](security/README_SECRETS.md) |

### Technology Stack
- **Language**: Python 3.11+
- **Framework**: FastAPI
- **Data Processing**: Polars, PyArrow
- **Cloud**: Google Cloud Platform (BigQuery, KMS, Pub/Sub)
- **Authentication**: API Key (SHA256 hashed)
- **Observability**: OpenTelemetry, Cloud Logging

---

## 🆘 Support

### Getting Help
1. Check the relevant documentation above
2. Review error logs and troubleshooting guides
3. Contact: support@cloudact.io

### Contributing
- Follow existing code patterns
- Add tests for new features
- Update documentation
- Use black for code formatting

---

## 📝 Version History

### Latest (November 2025)
- ✅ Notification system (Email + Slack)
- ✅ Tenant-specific configuration with fallback
- ✅ SQL injection protection
- ✅ Rate limiting enhancements
- ✅ Documentation consolidation

### Previous Versions
- Multi-tenant architecture
- BigQuery metadata logging
- KMS encryption
- API key authentication
- Pipeline execution engine

---

**Need help?** Start with the [Quick Start Guide](guides/QUICK_START.md) or contact support@cloudact.io
