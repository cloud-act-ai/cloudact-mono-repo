# Quota System Fix Documentation

## Overview
Fixed the pipeline quota system to ensure all quota management is handled automatically during onboarding and bootstrap processes. No manual intervention required.

## Issues Fixed

### 1. Middleware Error
**Problem**: Pipeline execution failed with "RuntimeError: Unexpected message received: http.request"
**Root Cause**: Validation middleware was consuming request body and incorrectly reconstructing it
**Solution**: Removed body validation from middleware (validation happens via Pydantic models)

### 2. Missing Quota Records
**Problem**: Pipelines failed with "Quota record not found for tenant"
**Root Cause**: Onboarding process wasn't creating initial quota records
**Solution**: Updated onboarding processor to automatically create quota records for new tenants

## System Architecture

### Bootstrap Process
The bootstrap pipeline (`configs/setup/bootstrap_system.yml`) creates the central infrastructure:

**Tables Created in `tenants` dataset:**
- `tenant_profiles` - Basic tenant information
- `tenant_api_keys` - API authentication
- `tenant_usage_quotas` - Pipeline execution quotas
- `tenant_subscriptions` - Subscription plans
- `tenant_cloud_credentials` - Cloud provider credentials
- `tenant_pipeline_configs` - Custom pipeline configurations
- `tenant_scheduled_pipeline_runs` - Scheduled executions
- `tenant_pipeline_execution_queue` - Execution queue management

### Onboarding Process
When a new tenant is onboarded (`POST /api/v1/tenants/onboard`):

1. **Creates tenant dataset** with operational tables:
   - `x_meta_pipeline_runs` - Pipeline execution history
   - `x_meta_step_logs` - Detailed step logs
   - `x_meta_dq_results` - Data quality results

2. **Creates initial quota record** with defaults:
   - Daily limit: 50 pipelines
   - Monthly limit: 1000 pipelines
   - Concurrent limit: 5 pipelines

## Configuration

### Quota Defaults (configs/setup/tenants/onboarding.yml)
```yaml
default_daily_limit: 50      # Daily pipeline runs allowed
default_monthly_limit: 1000  # Monthly pipeline runs allowed
default_concurrent_limit: 5  # Concurrent pipelines allowed
```

### Quota Table Schema (ps_templates/setup/initial/schemas/tenant_usage_quotas.json)
- `usage_id` - Unique identifier
- `tenant_id` - Tenant identifier
- `usage_date` - Date of usage (partition key)
- `pipelines_run_today` - Daily counter
- `pipelines_succeeded_today` - Success counter
- `pipelines_failed_today` - Failure counter
- `pipelines_run_month` - Monthly counter
- `concurrent_pipelines_running` - Current concurrent count
- `daily_limit` - Daily pipeline limit
- `monthly_limit` - Monthly pipeline limit
- `concurrent_limit` - Concurrent execution limit

## Testing

### Local Testing
```bash
# Start API server
python -m uvicorn src.app.main:app --host 0.0.0.0 --port 8080

# Onboard new tenant (creates quota automatically)
curl -X POST http://localhost:8080/api/v1/tenants/onboard \
  -H "Content-Type: application/json" \
  -H "X-Admin-Key: admin_secret_key_123" \
  -d '{
    "tenant_id": "test_tenant",
    "company_name": "Test Company",
    "admin_email": "admin@test.com"
  }'

# Run pipeline (uses quota)
curl -X POST http://localhost:8080/api/v1/pipelines/run/{tenant_id}/gcp/cost/cost_billing \
  -H "Content-Type: application/json" \
  -H "X-API-Key: {api_key_from_onboarding}" \
  -d '{
    "date": "2024-11-17",
    "trigger_by": "test"
  }'
```

## Key Changes Made

### 1. src/app/middleware/validation.py
- Removed body validation for pipeline endpoints
- Prevents middleware streaming conflicts
- Validation still happens via Pydantic models

### 2. src/core/processors/setup/tenants/onboarding.py
- Added automatic quota record creation
- Creates initial record with default limits
- Non-blocking (doesn't fail onboarding if quota creation fails)

### 3. configs/setup/tenants/onboarding.yml
- Added quota configuration parameters
- Configurable default limits
- Documentation of quota behavior

## Verification

Successfully tested end-to-end:
1. ✅ Onboarded tenant "acme1281"
2. ✅ Automatic quota record created
3. ✅ Pipeline executed without errors
4. ✅ Quota usage tracked correctly
5. ✅ No middleware conflicts

## Production Deployment

1. **Run bootstrap once** to create central tables:
   ```bash
   # Via admin endpoint or direct execution
   ```

2. **All new tenants** automatically get quota records during onboarding

3. **Existing tenants** can be re-onboarded to create quota records

## Monitoring

Check quota usage:
```sql
SELECT
  tenant_id,
  usage_date,
  pipelines_run_today,
  daily_limit,
  daily_limit - pipelines_run_today as remaining
FROM `{project}.tenants.tenant_usage_quotas`
WHERE usage_date = CURRENT_DATE()
```

## Notes
- Quota enforcement happens at the API level before pipeline execution
- Quotas reset daily at midnight UTC
- Concurrent limits prevent resource exhaustion
- All quota management is automatic - no manual SQL required