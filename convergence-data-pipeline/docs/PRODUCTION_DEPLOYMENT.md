# Production Deployment Guide - Convergence Data Pipeline

## System Overview

The Convergence Data Pipeline is a production-ready multi-tenant data processing system built for BigQuery.

### Architecture

**Two-Dataset Architecture:**
1. **Central `tenants` dataset**:
   - Management tables (profiles, API keys, subscriptions, quotas, configs)
   - **Centralized logging** (ALL pipeline runs, step logs, DQ results from ALL tenants)
2. **Per-tenant datasets (`{tenant_id}`)**:
   - tenant_comprehensive_view (queries central tables, filters by tenant_id)
   - Data tables (gcp_cost_billing, etc.)

## Quick Start

### 1. Environment Setup

```bash
# Set required environment variables
export GCP_PROJECT_ID=gac-prod-471220
export BIGQUERY_LOCATION=US
export ADMIN_API_KEY=your-admin-key
```

### 2. Bootstrap System

```bash
# Run bootstrap to create central infrastructure
curl -X POST "http://your-host:8090/admin/bootstrap" \
  -H "X-Admin-Key: $ADMIN_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "force_recreate_dataset": false,
    "force_recreate_tables": false
  }'
```

### 3. Onboard New Tenant

```bash
# Create new tenant with subscription
curl -X POST "http://your-host:8090/api/v1/tenants/onboard" \
  -H "Content-Type: application/json" \
  -d '{
    "tenant_id": "customer_name",
    "company_name": "Customer Inc",
    "admin_email": "admin@customer.com",
    "subscription_plan": "PROFESSIONAL"
  }'
```

**Save the API key returned!** It's shown only once.

## Database Schema

### Central Tables (tenants dataset)

**Management Tables:**
| Table | Purpose | Key Fields |
|-------|---------|------------|
| tenant_profiles | Tenant metadata | tenant_id, company_name, status |
| tenant_api_keys | API authentication | api_key_hash, tenant_id, is_active |
| tenant_subscriptions | Plan limits | tenant_id, plan_name, daily_limit |
| tenant_usage_quotas | Usage tracking | tenant_id, pipelines_run_today |
| tenant_pipeline_configs | Pipeline definitions | config_id, tenant_id, pipeline_yaml |
| tenant_scheduled_pipeline_runs | Scheduler state | scheduled_run_id, status |
| tenant_pipeline_execution_queue | Execution queue | queue_id, priority |
| tenant_cloud_credentials | Encrypted credentials | credential_id, provider |

**Centralized Logging (ALL tenants):**
| Table | Purpose | Key Fields |
|-------|---------|------------|
| tenant_pipeline_runs | Pipeline execution logs (ALL tenants) | pipeline_logging_id, tenant_id, status |
| tenant_step_logs | Step-level logs (ALL tenants) | step_id, tenant_id, status, error_message |
| tenant_dq_results | Data quality results (ALL tenants) | check_name, tenant_id, status, row_count |

### Per-Tenant Dataset (`{tenant_id}`)

| Object | Type | Purpose |
|--------|------|---------|
| tenant_comprehensive_view | VIEW | Comprehensive view (queries central tables, filters by tenant_id) |
| gcp_cost_billing, etc. | TABLE | Data tables specific to tenant |

## API Endpoints

### Admin Endpoints

```
POST /admin/bootstrap                  # Initialize system
POST /admin/tenants                    # Create tenant (admin)
POST /admin/api-keys                   # Generate API key
GET  /admin/tenants/{tenant_id}       # Get tenant status
DELETE /admin/api-keys/{api_key_hash} # Revoke API key
```

### Tenant Endpoints

```
POST /api/v1/tenants/onboard          # Self-service onboarding
GET  /api/v1/pipelines/configs        # List configurations
POST /api/v1/pipelines/configs/{id}   # Create/update config
POST /api/v1/pipelines/run/{id}       # Execute pipeline
GET  /api/v1/pipelines/status/{id}    # Check execution status
GET  /api/v1/pipelines/history        # Execution history
```

## Pipeline Configuration

### Example BQ ETL Pipeline

```yaml
pipeline:
  id: "data_processing"
  name: "Daily Data Processing"
  version: "1.0.0"

dependencies:
  level_1:
    - step: extract_data
  level_2:
    - step: transform_data

steps:
  - id: extract_data
    ps_type: "bq_etl.query"
    config:
      source_query: "SELECT * FROM source_table"
      target_table: "${tenant_id}.extracted_data"
      write_disposition: "WRITE_TRUNCATE"

  - id: transform_data
    ps_type: "bq_etl.query"
    config:
      source_query: "SELECT processed_columns FROM ${tenant_id}.extracted_data"
      target_table: "${tenant_id}.final_data"
```

## Subscription Plans

| Plan | Daily Limit | Monthly Limit | Concurrent | Max Team |
|------|------------|---------------|------------|----------|
| STARTER | 6 | 180 | 3 | 2 |
| PROFESSIONAL | 25 | 750 | 5 | 6 |
| SCALE | 100 | 3000 | 10 | 11 |

## Testing

### Run BQ ETL Test Pipeline

```bash
# Save API key from onboarding
API_KEY="gtest_customer_3s323_api_CYQQO8EL1kCjKfMG"

# Upload test pipeline config
curl -X POST "http://your-host:8090/api/v1/pipelines/configs/bq_etl_test" \
  -H "X-API-Key: $API_KEY" \
  -H "Content-Type: application/json" \
  -d @configs/setup/bq_etl_test.yml

# Execute test pipeline
curl -X POST "http://your-host:8090/api/v1/pipelines/run/bq_etl_test" \
  -H "X-API-Key: $API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"date": "2024-01-01"}'
```

## Monitoring

### Check Pipeline Status

```bash
# Get pipeline execution status
curl -X GET "http://your-host:8090/api/v1/pipelines/status/{pipeline_logging_id}" \
  -H "X-API-Key: $API_KEY"
```

### View Quota Usage

```bash
# Check current usage against limits
curl -X GET "http://your-host:8090/api/v1/tenants/quota" \
  -H "X-API-Key: $API_KEY"
```

## Troubleshooting

### Common Issues

1. **Schema Mismatch Errors**
   - Run bootstrap with `force_recreate_tables: true`
   - Check table schemas match ps_templates/setup/initial/schemas/

2. **Quota Exceeded**
   - Check tenant_usage_quotas table
   - Update subscription plan if needed

3. **Pipeline Failures**
   - Check tenant_step_logs for error details
   - Verify BigQuery permissions

### Required Permissions

```
bigquery.datasets.create
bigquery.datasets.get
bigquery.tables.create
bigquery.tables.get
bigquery.tables.update
bigquery.tables.getData
bigquery.tables.updateData
bigquery.jobs.create
```

## Production Checklist

- [ ] Environment variables configured
- [ ] Bootstrap completed successfully
- [ ] Test tenant created and validated
- [ ] BQ ETL test pipeline executed
- [ ] API authentication working
- [ ] Quota tracking functional
- [ ] Monitoring dashboards set up
- [ ] Backup strategy implemented
- [ ] Alert rules configured
- [ ] Documentation distributed

## Support

For issues or questions:
1. Check logs in tenant_step_logs
2. Review quota usage
3. Verify API key is active
4. Check BigQuery permissions

---

**Version**: 1.0.0
**Last Updated**: 2024-01-18
**Status**: PRODUCTION READY