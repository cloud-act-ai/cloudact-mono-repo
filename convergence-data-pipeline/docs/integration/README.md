# Integration Documentation

**Version:** 2.0
**Last Updated:** 2025-11-18

## Overview

This directory contains comprehensive integration and deployment documentation for the Convergence Data Pipeline service.

---

## Quick Start

**New to the service?** Follow this path:

1. **[Integration Guide](./INTEGRATION_GUIDE.md)** - Start here
   - Overview of the service
   - Authentication setup
   - Getting started guide
   - Best practices

2. **[Onboarding API](./ONBOARDING_API.md)** - Detailed API reference
   - Dry-run validation endpoint
   - Onboarding endpoint
   - Complete request/response schemas
   - Integration examples

3. **[Deployment Guide](./DEPLOYMENT_GUIDE.md)** - Deploy to production
   - Staging deployment
   - Production deployment
   - Rollback procedures
   - Troubleshooting

---

## Documentation Index

### For Integrators

| Document | Purpose | When to Use |
|----------|---------|-------------|
| [Integration Guide](./INTEGRATION_GUIDE.md) | Complete integration walkthrough | Starting integration, understanding architecture |
| [Onboarding API](./ONBOARDING_API.md) | Detailed API specifications | Implementing onboarding flow, API reference |

### For DevOps

| Document | Purpose | When to Use |
|----------|---------|-------------|
| [Deployment Guide](./DEPLOYMENT_GUIDE.md) | Deployment procedures and troubleshooting | Deploying to staging/production, rollback |

### Related Documentation

| Document | Location | Purpose |
|----------|----------|---------|
| API Reference | [`/docs/api/API.md`](../api/API.md) | Complete API endpoint reference |
| Architecture | [`/docs/architecture/ARCHITECTURE.md`](../architecture/ARCHITECTURE.md) | System architecture overview |
| Production Deployment | [`/docs/PRODUCTION_DEPLOYMENT.md`](../PRODUCTION_DEPLOYMENT.md) | Production readiness checklist |
| Quick Fix Guide | [`/docs/guides/QUICK_FIX_GUIDE.md`](../guides/QUICK_FIX_GUIDE.md) | Common issues and solutions |

---

## Typical Integration Flow

```
┌─────────────────────────────────────────────────────────────┐
│                   1. Read Documentation                      │
│  • Integration Guide (architecture, concepts)               │
│  • Onboarding API (endpoints, schemas)                      │
└────────────────────────┬────────────────────────────────────┘
                         │
                         v
┌─────────────────────────────────────────────────────────────┐
│              2. Prepare GCP Environment                      │
│  • Enable required APIs                                     │
│  • Create service accounts                                  │
│  • Set up permissions                                       │
└────────────────────────┬────────────────────────────────────┘
                         │
                         v
┌─────────────────────────────────────────────────────────────┐
│            3. Dry-Run Validation (MANDATORY)                 │
│  POST /api/v1/tenants/dryrun                                │
│  • Validates configuration                                  │
│  • Checks permissions                                       │
│  • No resources created                                     │
└────────────────────────┬────────────────────────────────────┘
                         │
                    ┌────┴─────┐
                    │ Success? │
                    └────┬─────┘
                         │ Yes
                         v
┌─────────────────────────────────────────────────────────────┐
│                4. Tenant Onboarding                          │
│  POST /api/v1/tenants/onboard                               │
│  • Creates tenant infrastructure                            │
│  • Generates API key (SAVE IMMEDIATELY!)                    │
│  • Creates BigQuery dataset                                 │
└────────────────────────┬────────────────────────────────────┘
                         │
                         v
┌─────────────────────────────────────────────────────────────┐
│              5. Save API Key Securely                        │
│  • Environment variables                                    │
│  • Secrets manager (GCP Secret Manager)                     │
│  • NEVER commit to version control                          │
└────────────────────────┬────────────────────────────────────┘
                         │
                         v
┌─────────────────────────────────────────────────────────────┐
│           6. Verify Onboarding Success                       │
│  • Check BigQuery dataset created                           │
│  • Test API key authentication                              │
│  • Verify comprehensive view exists                         │
└────────────────────────┬────────────────────────────────────┘
                         │
                         v
┌─────────────────────────────────────────────────────────────┐
│              7. Execute Test Pipeline                        │
│  POST /api/v1/pipelines/run/{tenant_id}/{provider}/...      │
│  • Verify pipeline execution                                │
│  • Check logs in BigQuery                                   │
│  • Monitor status                                           │
└────────────────────────┬────────────────────────────────────┘
                         │
                         v
┌─────────────────────────────────────────────────────────────┐
│           8. Set Up Monitoring & Alerts                      │
│  • Cloud Monitoring alerts                                  │
│  • BigQuery log queries                                     │
│  • Usage tracking                                           │
└────────────────────────┬────────────────────────────────────┘
                         │
                         v
┌─────────────────────────────────────────────────────────────┐
│                 9. Go to Production                          │
│  • Deploy to staging first                                  │
│  • Test thoroughly                                          │
│  • Deploy to production                                     │
│  • Monitor closely                                          │
└─────────────────────────────────────────────────────────────┘
```

---

## Key Endpoints

### Onboarding

| Endpoint | Method | Purpose | Auth Required |
|----------|--------|---------|---------------|
| `/api/v1/tenants/dryrun` | POST | Validate tenant config (MANDATORY first step) | No |
| `/api/v1/tenants/onboard` | POST | Create tenant and API key | No |

### Pipeline Execution

| Endpoint | Method | Purpose | Auth Required |
|----------|--------|---------|---------------|
| `/api/v1/pipelines/run/{tenant_id}/{provider}/{domain}/{template}` | POST | Trigger pipeline | Yes (X-API-Key) |
| `/api/v1/pipelines/runs/{pipeline_logging_id}` | GET | Get pipeline run status | Yes (X-API-Key) |
| `/api/v1/pipelines/runs` | GET | List recent pipeline runs | Yes (X-API-Key) |

### Health & Status

| Endpoint | Method | Purpose | Auth Required |
|----------|--------|---------|---------------|
| `/health` | GET | Health check | No |

---

## Architecture Overview

### Two-Dataset Model

**Central Dataset (`tenants`)**:
- Shared across ALL tenants
- Contains management tables: `tenant_profiles`, `tenant_api_keys`, `tenant_subscriptions`, `tenant_usage_quotas`
- Contains centralized logs: `tenant_pipeline_runs`, `tenant_step_logs`, `tenant_dq_results`

**Per-Tenant Dataset (`{tenant_id}`)**:
- One dataset per tenant
- Contains tenant's operational data tables
- Contains `tenant_comprehensive_view` - unified view of all pipeline execution data
- Isolated from other tenants

### Authentication Flow

```
Client Request
  │
  ├─> Header: X-API-Key (required)
  ├─> Header: X-User-ID (optional, for audit)
  │
  v
API Gateway / Cloud Run
  │
  ├─> Validate API key (SHA256 hash lookup)
  ├─> Verify tenant exists and is active
  ├─> Check quota limits
  │
  v
Pipeline Execution / Data Access
  │
  └─> Logs to BigQuery (tenant_pipeline_runs)
```

---

## Quick Examples

### Onboarding a New Tenant

**Step 1: Dry-Run Validation**
```bash
curl -X POST https://your-service-url.run.app/api/v1/tenants/dryrun \
  -H "Content-Type: application/json" \
  -d '{
    "tenant_id": "acme_corp",
    "company_name": "Acme Corporation",
    "admin_email": "admin@acme.com",
    "subscription_plan": "PROFESSIONAL"
  }'
```

**Step 2: Onboard (if validation succeeds)**
```bash
curl -X POST https://your-service-url.run.app/api/v1/tenants/onboard \
  -H "Content-Type: application/json" \
  -d '{
    "tenant_id": "acme_corp",
    "company_name": "Acme Corporation",
    "admin_email": "admin@acme.com",
    "subscription_plan": "PROFESSIONAL"
  }'
```

**Response**:
```json
{
  "tenant_id": "acme_corp",
  "api_key": "acme_corp_api_xY9kL2mP4qR8vT",
  "subscription_plan": "PROFESSIONAL",
  "dataset_created": true,
  "message": "Tenant onboarded successfully"
}
```

**Step 3: Save API Key**
```bash
# CRITICAL: Save API key immediately!
export CONVERGENCE_API_KEY="acme_corp_api_xY9kL2mP4qR8vT"
```

### Executing a Pipeline

```bash
curl -X POST https://your-service-url.run.app/api/v1/pipelines/run/acme_corp/gcp/cost/cost_billing \
  -H "X-API-Key: acme_corp_api_xY9kL2mP4qR8vT" \
  -H "X-User-ID: user_123" \
  -H "Content-Type: application/json" \
  -d '{
    "trigger_by": "john@acme.com",
    "date": "2025-11-18"
  }'
```

### Deploying to Production

**Using GitHub Actions**:
```bash
# Trigger manual deployment
gh workflow run cd.yml --ref main --field environment=production
```

**Using Cloud Build**:
```bash
gcloud builds submit \
  --config=deployment/cloudbuild.yaml \
  --substitutions=_ENVIRONMENT=production \
  --project=your-project-prod
```

---

## Common Questions

### Q: Do I need to run dry-run validation?

**A**: YES! Dry-run validation is MANDATORY before onboarding. It validates configuration and permissions without creating resources, preventing onboarding failures.

### Q: What happens to the API key after onboarding?

**A**: The API key is shown ONLY ONCE during onboarding. Save it immediately to a secrets manager or environment variable. It cannot be retrieved later (only regenerated).

### Q: Can I onboard multiple tenants?

**A**: Yes! Each tenant gets:
- Unique API key
- Isolated BigQuery dataset
- Independent quota limits
- Separate subscription plan

### Q: What subscription plan should I choose?

**A**:
- **FREE**: Testing, proof-of-concept (3 daily pipelines)
- **BASIC**: Small teams, limited providers (10 daily pipelines)
- **PROFESSIONAL**: Medium teams, multi-provider (25 daily pipelines)
- **ENTERPRISE**: Large teams, extensive usage (100 daily pipelines)

### Q: How do I monitor pipeline execution?

**A**: Pipeline execution is logged to BigQuery:
- Centralized logs: `tenants.tenant_pipeline_runs`
- Tenant-specific view: `{tenant_id}.tenant_comprehensive_view`
- Cloud Logging: Application logs

### Q: What if my deployment fails?

**A**: See [Deployment Guide - Troubleshooting](./DEPLOYMENT_GUIDE.md#troubleshooting) for:
- Common issues and solutions
- Rollback procedures
- Log investigation steps

---

## Support & Resources

### Documentation

- [Integration Guide](./INTEGRATION_GUIDE.md) - Complete integration walkthrough
- [Onboarding API](./ONBOARDING_API.md) - Detailed API reference
- [Deployment Guide](./DEPLOYMENT_GUIDE.md) - Deployment procedures
- [API Reference](../api/API.md) - All API endpoints
- [Architecture](../architecture/ARCHITECTURE.md) - System design

### Code Examples

- Python: See [Onboarding API - Integration Examples](./ONBOARDING_API.md#integration-examples)
- Node.js: See [Onboarding API - Integration Examples](./ONBOARDING_API.md#integration-examples)
- cURL: Examples throughout all documentation

### Getting Help

- **GitHub Issues**: [Submit Issue](https://github.com/your-org/convergence-data-pipeline/issues)
- **Email**: support@your-company.com
- **Documentation**: Start with [Integration Guide](./INTEGRATION_GUIDE.md)

---

## Changelog

### v2.0 (2025-11-18)
- Added comprehensive integration documentation
- Dry-run validation endpoint documentation
- Deployment guide for staging/production
- Integration examples (Python, Node.js, cURL)
- Architecture overview and flow diagrams

### v1.0 (2025-11-01)
- Initial API documentation
- Basic onboarding flow

---

## Next Steps

1. **Read**: [Integration Guide](./INTEGRATION_GUIDE.md) for overview
2. **Implement**: Follow [Onboarding API](./ONBOARDING_API.md) for tenant onboarding
3. **Deploy**: Use [Deployment Guide](./DEPLOYMENT_GUIDE.md) for production deployment
4. **Monitor**: Set up alerts and logging (see Integration Guide)
5. **Support**: Contact support if you need help

---

**Happy Integrating!**

For the latest updates, check the [main README](../../README.md).
