# Convergence Data Pipeline Documentation

**A multi-tenant data pipeline backend service for CloudAct**

Last Updated: November 17, 2025

---

## Overview

The Convergence Data Pipeline is a backend service that executes data pipelines for multiple organizations (tenants). It processes data, stores results in BigQuery, and tracks metadata for observability.

### What This System IS

- **Data pipeline backend service** - Processes and transforms data
- **Triggered by Cloud Scheduler OR manual API calls** - Scheduled or on-demand execution
- **Multi-tenant architecture** - Isolated data and quotas per organization
- **Metadata logging system** - Tracks pipeline execution history

### What This System IS NOT

- **NOT a user management system** - Users are for logging only, not authorization
- **NOT a data warehouse** - Results are stored in BigQuery, not managed here
- **NOT a real-time streaming service** - Batch processing with async execution

---

## Key Concepts

Understanding these core concepts is essential:

### tenant_id
- Represents an **organization** (e.g., "acme_corp")
- **Quotas and rate limits** are enforced at the tenant level
- Each tenant gets a **separate BigQuery dataset** for isolation
- Used for **authentication** via API keys

### user_id
- Used for **logging only** - tracks who triggered the pipeline
- **NOT used for authorization** - tenant_id determines access
- Optional field for audit trails

### Subscription
- **Belongs to a tenant** - defines pipeline configurations
- Contains YAML pipeline definitions
- Stored in tenant-specific config folders

### Dataset Isolation
- Each tenant gets a **separate BigQuery dataset**
- Format: `{project_id}.{tenant_id}_metadata`
- Ensures data isolation and security

---

## Quick Links

Navigate to specific documentation:

### Core Documentation
- **[API Documentation](api/TENANT_API_REFERENCE.md)** - All API endpoints and request/response schemas
- **[Architecture](architecture/TENANT_MANAGEMENT.md)** - System design and tenant management
- **[Quick Start Guide](guides/QUICK_START.md)** - Get started in 15 minutes
- **[Security](security/README_SECRETS.md)** - Authentication and encryption

### How-To Guides
- **[Onboarding Guide](guides/ONBOARDING.md)** - Onboard new tenants step-by-step
- **[Deployment Guide](guides/DEPLOYMENT_GUIDE.md)** - Deploy to production
- **[Pipeline Testing Guide](guides/PIPELINE_TESTING_GUIDE.md)** - Test pipelines end-to-end
- **[Rate Limiting Quick Start](guides/RATE_LIMITING_QUICK_START.md)** - Configure rate limits

### Reference Documentation
- **[API Reference](reference/API_REFERENCE.md)** - Complete API specification
- **[Environment Variables](reference/ENVIRONMENT_VARIABLES.md)** - All configuration options
- **[Pipeline Configuration](reference/pipeline-configuration.md)** - YAML pipeline structure
- **[Metadata Schema](reference/metadata-schema.md)** - BigQuery table schemas
- **[Rate Limiting](reference/RATE_LIMITING.md)** - Rate limit configuration

### Operations
- **[Monitoring](operations/MONITORING.md)** - Observability and alerting
- **[Troubleshooting](operations/TROUBLESHOOTING.md)** - Common issues and solutions
- **[Runbook](operations/RUNBOOK.md)** - Operational procedures
- **[Deployment Operations](operations/DEPLOYMENT.md)** - Deployment procedures

### Notifications
- **[Notification System](notifications/NOTIFICATION_SYSTEM_IMPLEMENTATION.md)** - Email and Slack alerts
- **[Integration Guide](notifications/INTEGRATION_GUIDE.md)** - Integrate notifications
- **[Configuration](notifications/CONFIGURATION.md)** - Configure email and Slack

---

## Getting Started

Follow these steps to get started:

### 1. Onboard a Tenant

Create a new tenant and get an API key:

```bash
# See: guides/ONBOARDING.md for detailed steps
1. Create tenant config folder
2. Generate API key
3. Configure BigQuery dataset
4. Set up pipeline YAML files
```

### 2. Execute a Pipeline

Trigger a pipeline execution:

```bash
# Manual execution via API
POST /api/v1/tenants/{tenant_id}/pipelines/execute

# Scheduled execution via Cloud Scheduler
# Automatically triggers based on cron schedule
```

### 3. Query Metadata

Retrieve pipeline execution results:

```bash
# Get execution logs
GET /api/v1/tenants/{tenant_id}/metadata/executions

# Query BigQuery directly
SELECT * FROM `{project}.{tenant_id}_metadata.pipeline_executions`
WHERE execution_date >= CURRENT_DATE() - 7
```

---

## Common Workflows

### Tenant Onboarding
1. Create tenant configuration folder: `configs/{tenant_id}/`
2. Generate API key: `python scripts/generate_api_key.py`
3. Create BigQuery dataset: `{tenant_id}_metadata`
4. Add pipeline YAML: `configs/{tenant_id}/pipelines/`
5. Test execution: `POST /api/v1/tenants/{tenant_id}/pipelines/execute`

See: [Onboarding Guide](guides/ONBOARDING.md)

### Pipeline Execution (Manual)
1. Authenticate with API key
2. Call execution endpoint with pipeline ID
3. Monitor execution via metadata tables
4. Receive notifications on completion/failure

See: [Quick Start Guide](guides/QUICK_START.md)

### Scheduled Pipelines
1. Define pipeline in YAML with schedule
2. Configure Cloud Scheduler job
3. Scheduler triggers API endpoint automatically
4. Pipeline executes on schedule

See: [Deployment Guide](guides/DEPLOYMENT_GUIDE.md)

---

## System Architecture

### Key Components

| Component | Purpose | Documentation |
|-----------|---------|---------------|
| **API Server** | FastAPI application with authentication | [API Reference](reference/API_REFERENCE.md) |
| **Pipeline Engine** | Async execution with retry logic | [Pipeline Config](reference/pipeline-configuration.md) |
| **Metadata Logger** | High-performance BigQuery logging | [Metadata Schema](reference/metadata-schema.md) |
| **Notification System** | Email and Slack alerts | [Notifications](notifications/NOTIFICATION_SYSTEM_IMPLEMENTATION.md) |
| **Rate Limiter** | Per-tenant and global limits | [Rate Limiting](reference/RATE_LIMITING.md) |
| **Security** | KMS encryption and API key auth | [Security](security/README_SECRETS.md) |

### Technology Stack
- **Python 3.11+** - Core language
- **FastAPI** - API framework
- **BigQuery** - Data storage and metadata
- **Polars/PyArrow** - Data processing
- **Google Cloud KMS** - Encryption
- **OpenTelemetry** - Observability

---

## Documentation Index

### By Topic

**Getting Started**
- [Quick Start](guides/QUICK_START.md) - 15-minute setup
- [Onboarding](guides/ONBOARDING.md) - Tenant onboarding
- [Deployment](guides/DEPLOYMENT_GUIDE.md) - Production deployment

**API & Reference**
- [API Reference](reference/API_REFERENCE.md) - Complete API docs
- [Tenant API](api/TENANT_API_REFERENCE.md) - Tenant-specific endpoints
- [Environment Variables](reference/ENVIRONMENT_VARIABLES.md) - Configuration
- [Metadata Schema](reference/metadata-schema.md) - BigQuery schemas

**Operations**
- [Monitoring](operations/MONITORING.md) - Observability
- [Troubleshooting](operations/TROUBLESHOOTING.md) - Issue resolution
- [Runbook](operations/RUNBOOK.md) - Operational procedures

**Security**
- [Secrets Management](security/README_SECRETS.md) - Secure credentials
- [KMS Encryption](security/KMS_ENCRYPTION.md) - Data encryption
- [Security Checklist](checklists/SECURITY_CHECKLIST.md) - Security review

---

## Need Help?

### Quick References
- [Quick Start Guide](guides/QUICK_START.md) - Get started fast
- [Troubleshooting](operations/TROUBLESHOOTING.md) - Common issues
- [Monthly Testing Guide](guides/MONTHLY_TESTING_GUIDE.md) - System health checks

### Documentation Index
For a complete, detailed index of all documentation: [INDEX.md](INDEX.md)

### Support
Contact: support@cloudact.io
