# Quick Start - Manual Testing Guide

**Start Here** → Test the entire system in 5 minutes

---

## Step 1: Start Server

```bash
cd convergence-data-pipeline
python -m uvicorn src.app.main:app --host 0.0.0.0 --port 8080

# Verify server is running
curl http://localhost:8080/health
```

Expected: `{"status":"healthy",...}`

---

## Step 2: Onboard a Customer

```bash
curl -X POST "http://localhost:8080/api/v1/customers/onboard" \
  -H "Content-Type: application/json" \
  -d '{
    "tenant_id": "my_test_company",
    "company_name": "My Test Company",
    "admin_email": "test@mycompany.com",
    "subscription_plan": "PROFESSIONAL"
  }'
```

**Save the API key from the response!**

Expected response:
```json
{
  "customer_id": "cust-xyz...",
  "tenant_id": "my_test_company",
  "api_key": "my_test_company_api_xxxxx",  ← SAVE THIS!
  "subscription_plan": "PROFESSIONAL",
  "dataset_created": true,
  "dryrun_status": "SUCCESS"
}
```

---

## Step 3: Run a Pipeline

```bash
# Replace YOUR_API_KEY with the key from Step 2
curl -X POST "http://localhost:8080/api/v1/pipelines/run/my_test_company/gcp/example/dryrun" \
  -H "X-API-Key: YOUR_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"date": "2025-11-17", "trigger_by": "manual_test"}'
```

Expected response:
```json
{
  "pipeline_logging_id": "uuid...",
  "pipeline_id": "my_test_company-gcp-example-dryrun",
  "status": "PENDING",
  "message": "Pipeline triggered successfully"
}
```

---

## Step 4: Verify in BigQuery

### Check Customer Profile
```bash
bq query --use_legacy_sql=false \
  "SELECT customer_id, tenant_id, company_name, status
   FROM \`gac-prod-471220.customers.customer_profiles\`
   WHERE tenant_id = 'my_test_company'"
```

### Check Pipeline Execution
```bash
bq query --use_legacy_sql=false \
  "SELECT pipeline_logging_id, pipeline_id, status, start_time, end_time
   FROM \`gac-prod-471220.my_test_company.x_meta_pipeline_runs\`
   ORDER BY start_time DESC LIMIT 5"
```

---

## Step 5: Verify Security (GenAI-Safe)

### Check what's in tenant dataset
```bash
bq ls gac-prod-471220:my_test_company
```

Expected tables (NO credentials):
- x_meta_pipeline_runs ✅
- x_meta_step_logs ✅
- x_meta_dq_results ✅
- NO x_meta_api_keys ✅
- NO x_meta_cloud_credentials ✅

### Verify credentials are in customers dataset
```bash
bq query --use_legacy_sql=false \
  "SELECT api_key_id, customer_id, tenant_id, is_active
   FROM \`gac-prod-471220.customers.customer_api_keys\`
   WHERE tenant_id = 'my_test_company'"
```

---

## Success Criteria

✅ Server responds to /health
✅ Customer onboarding returns API key
✅ Customer record exists in BigQuery customers.customer_profiles
✅ API key exists in customers.customer_api_keys
✅ Pipeline executes successfully
✅ Pipeline logs appear in {tenant_id}.x_meta_pipeline_runs
✅ Tenant dataset contains NO credentials
✅ Server logs show NO errors

---

## Common Issues

### Issue: "Connection refused" when calling API
**Solution**: Start the server first with `python -m uvicorn src.app.main:app --host 0.0.0.0 --port 8080`

### Issue: "401 Unauthorized"
**Solution**: Check you're using the correct API key from Step 2

### Issue: "404 Not Found"
**Solution**: Check the tenant_id matches what you used in onboarding

### Issue: BigQuery table not found
**Solution**: Wait 2-3 seconds after pipeline execution for logs to flush

---

## Full Manual Testing Guide

For comprehensive testing instructions, see:
**MASTER_ONBOARDING_AND_TESTING_GUIDE.md**

---

## Cleanup After Testing

```bash
# Delete test customer dataset
bq rm -r -f gac-prod-471220:my_test_company

# Delete test customer from customers dataset
bq query --use_legacy_sql=false \
  "DELETE FROM \`gac-prod-471220.customers.customer_profiles\`
   WHERE tenant_id = 'my_test_company'"

bq query --use_legacy_sql=false \
  "DELETE FROM \`gac-prod-471220.customers.customer_api_keys\`
   WHERE tenant_id = 'my_test_company'"

bq query --use_legacy_sql=false \
  "DELETE FROM \`gac-prod-471220.customers.customer_subscriptions\`
   WHERE customer_id IN (
     SELECT customer_id FROM \`gac-prod-471220.customers.customer_profiles\`
     WHERE tenant_id = 'my_test_company'
   )"

bq query --use_legacy_sql=false \
  "DELETE FROM \`gac-prod-471220.customers.customer_usage_quotas\`
   WHERE customer_id IN (
     SELECT customer_id FROM \`gac-prod-471220.customers.customer_profiles\`
     WHERE tenant_id = 'my_test_company'
   )"
```

---

**Status**: Ready to test!
**Time Required**: 5 minutes
**Last Updated**: 2025-11-17
