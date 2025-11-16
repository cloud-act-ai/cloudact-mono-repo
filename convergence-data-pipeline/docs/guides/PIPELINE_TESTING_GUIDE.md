# Pipeline Testing Guide - dryrun.yml

**Date:** November 16, 2025
**Pipeline:** gcp/example/dryrun.yml
**Status:** ✅ Ready for Testing

---

## System Validation Summary

### ✅ Updates Applied

1. **dryrun.yml Updated** - Added `bq_project_id: "gac-prod-471220"` to source and destination
2. **Notifications Configured** - Failures sent to guru.kallam@gmail.com
3. **API Server Running** - Port 8080
4. **Authentication Tested** - Invalid API key returns 401

---

## Tenant ID Validation

### How the System Validates

**Two-Level Validation:**

1. **API Key Authentication (Line 208-248 in auth.py)**
   ```python
   # Step 1: Extract X-API-Key header
   # Step 2: SHA256 hash the API key
   # Step 3: Query BigQuery to find tenant_id
   # Step 4: Return tenant_id if valid and active
   ```

2. **Tenant Mismatch Check (Line 182-186 in pipelines.py)**
   ```python
   # Verify tenant_id in URL matches authenticated tenant
   if tenant_id != tenant.tenant_id:
       raise HTTPException(
           status_code=403,
           detail=f"Tenant ID mismatch: authenticated as '{tenant.tenant_id}' but requested '{tenant_id}'"
       )
   ```

### What Happens with Non-Existent Tenant

**Scenario 1: Invalid API Key**
```bash
curl -X POST "http://localhost:8080/api/v1/pipelines/run/nonexistent_tenant/gcp/example/dryrun" \
  -H "X-API-Key: invalid_key_12345" \
  -H "Content-Type: application/json" \
  -d '{"date": "2025-11-16"}'
```

**Response:**
```json
{
  "detail": "Invalid or inactive API key"
}
```
**HTTP Status:** `401 Unauthorized`

**Scenario 2: Valid API Key but Wrong Tenant ID in URL**
```bash
# Your API key is for "test_tenant" but you request "other_tenant"
curl -X POST "http://localhost:8080/api/v1/pipelines/run/other_tenant/gcp/example/dryrun" \
  -H "X-API-Key: test_tenant_api_xK9mPqWz7LnR4vYt" \
  -H "Content-Type: application/json" \
  -d '{"date": "2025-11-16"}'
```

**Response:**
```json
{
  "detail": "Tenant ID mismatch: authenticated as 'test_tenant' but requested 'other_tenant'"
}
```
**HTTP Status:** `403 Forbidden`

---

## Step-by-Step Testing

### Step 1: Create a Test Tenant

```bash
# Create tenant (this generates API key)
curl -X POST "http://localhost:8080/api/v1/customers/onboard" \
  -H "Content-Type: application/json" \
  -d '{
    "tenant_id": "test_pipeline_user"
  }'
```

**Expected Response:**
```json
{
  "tenant_id": "test_pipeline_user",
  "api_key": "test_pipeline_user_api_XXXXXXXXXXXXXXXX",
  "dataset_created": true,
  "tables_created": [
    "api_keys",
    "cloud_credentials",
    "pipeline_runs",
    "step_logs",
    "dq_results"
  ],
  "dryrun_status": "SUCCESS",
  "message": "Customer test_pipeline_user onboarded successfully. Save your API key - it will only be shown once!"
}
```

**⚠️ IMPORTANT:** Save the `api_key` value! You'll use it in the next steps.

---

### Step 2: Test Invalid API Key (Expect 401)

```bash
curl -v -X POST "http://localhost:8080/api/v1/pipelines/run/test_pipeline_user/gcp/example/dryrun" \
  -H "X-API-Key: invalid_key_123456" \
  -H "Content-Type: application/json" \
  -d '{
    "date": "2025-11-16",
    "trigger_by": "guru.kallam@gmail.com"
  }'
```

**Expected Response:**
```json
{
  "detail": "Invalid or inactive API key"
}
```
**HTTP Status:** `401 Unauthorized`

**Logs to Check:**
```bash
tail -20 server.log | grep -i "auth\|api key"
```

---

### Step 3: Test Tenant Mismatch (Expect 403)

```bash
# Use your REAL API key from Step 1, but wrong tenant_id in URL
curl -v -X POST "http://localhost:8080/api/v1/pipelines/run/wrong_tenant/gcp/example/dryrun" \
  -H "X-API-Key: YOUR_API_KEY_FROM_STEP_1" \
  -H "Content-Type: application/json" \
  -d '{
    "date": "2025-11-16",
    "trigger_by": "guru.kallam@gmail.com"
  }'
```

**Expected Response:**
```json
{
  "detail": "Tenant ID mismatch: authenticated as 'test_pipeline_user' but requested 'wrong_tenant'"
}
```
**HTTP Status:** `403 Forbidden`

**Logs to Check:**
```bash
tail -20 server.log | grep -i "mismatch\|forbidden"
```

---

### Step 4: Test Successful Pipeline Run

```bash
# Replace YOUR_API_KEY with the actual API key from Step 1
curl -v -X POST "http://localhost:8080/api/v1/pipelines/run/test_pipeline_user/gcp/example/dryrun" \
  -H "X-API-Key: YOUR_API_KEY_FROM_STEP_1" \
  -H "Content-Type: application/json" \
  -d '{
    "date": "2025-11-16",
    "trigger_by": "guru.kallam@gmail.com"
  }'
```

**Expected Response:**
```json
{
  "pipeline_logging_id": "550e8400-e29b-41d4-a716-446655440000",
  "pipeline_id": "test_pipeline_user-gcp-example-dryrun",
  "tenant_id": "test_pipeline_user",
  "status": "PENDING",
  "message": "Templated pipeline triggered successfully"
}
```
**HTTP Status:** `200 OK`

**Logs to Check:**
```bash
# Server logs
tail -50 server.log | grep -i "pipeline\|dryrun"

# Notification test log
tail -20 test_notification.log
```

---

### Step 5: Test Failure Scenario & Check Email Notification

To test failure notification, we can cause an intentional failure:

```bash
# Test with invalid date format (will cause pipeline to fail)
curl -v -X POST "http://localhost:8080/api/v1/pipelines/run/test_pipeline_user/gcp/example/dryrun" \
  -H "X-API-Key: YOUR_API_KEY_FROM_STEP_1" \
  -H "Content-Type: application/json" \
  -d '{
    "date": "invalid_date_format",
    "trigger_by": "guru.kallam@gmail.com"
  }'
```

**What Happens:**
1. Pipeline starts execution
2. BigQuery query fails (invalid date)
3. Pipeline status updates to "FAILED"
4. **Email notification sent to guru.kallam@gmail.com** with:
   - Subject: `[CloudAct Alert] ERROR: Pipeline Failed: test_pipeline_user-gcp-example-dryrun`
   - Error details in email body
   - HTML formatted with red color (error severity)

**Check Email:**
- Inbox: guru.kallam@gmail.com
- Subject contains: "Pipeline Failed"
- Body contains: Error message and tenant_id

---

## Complete Curl Commands for Your Testing

### Option 1: Quick Test (Using Existing Tenant)

If you already have a tenant onboarded:

```bash
# Replace with your actual tenant_id and api_key
export TENANT_ID="your_tenant_id"
export API_KEY="your_api_key"

# Test successful run
curl -X POST "http://localhost:8080/api/v1/pipelines/run/${TENANT_ID}/gcp/example/dryrun" \
  -H "X-API-Key: ${API_KEY}" \
  -H "Content-Type: application/json" \
  -d '{
    "date": "2025-11-16",
    "trigger_by": "guru.kallam@gmail.com"
  }'
```

### Option 2: Complete Test Sequence (New Tenant)

```bash
# 1. Create tenant
echo "Creating tenant..."
ONBOARD_RESPONSE=$(curl -s -X POST "http://localhost:8080/api/v1/customers/onboard" \
  -H "Content-Type: application/json" \
  -d '{"tenant_id": "test_pipeline_user"}')

echo "$ONBOARD_RESPONSE"

# Extract API key (manual - copy from response above)
export API_KEY="PASTE_API_KEY_HERE"

# 2. Test invalid API key
echo -e "\n\nTest 1: Invalid API Key (expect 401)..."
curl -s -X POST "http://localhost:8080/api/v1/pipelines/run/test_pipeline_user/gcp/example/dryrun" \
  -H "X-API-Key: invalid_key" \
  -H "Content-Type: application/json" \
  -d '{"date": "2025-11-16"}' | jq .

# 3. Test tenant mismatch
echo -e "\n\nTest 2: Tenant Mismatch (expect 403)..."
curl -s -X POST "http://localhost:8080/api/v1/pipelines/run/wrong_tenant/gcp/example/dryrun" \
  -H "X-API-Key: ${API_KEY}" \
  -H "Content-Type: application/json" \
  -d '{"date": "2025-11-16"}' | jq .

# 4. Test successful run
echo -e "\n\nTest 3: Successful Run (expect 200)..."
curl -s -X POST "http://localhost:8080/api/v1/pipelines/run/test_pipeline_user/gcp/example/dryrun" \
  -H "X-API-Key: test_pipeline_user_api_gk0-XpfwlY0rewD7" \
  -H "Content-Type: application/json" \
  -d '{"date": "2025-11-16", "trigger_by": "guru.kallam@gmail.com"}' | jq .
```

---

## Log Files to Monitor

### Server Logs
```bash
# Real-time monitoring
tail -f server.log

# Search for errors
grep -i "error\|fail" server.log | tail -20

# Search for auth issues
grep -i "auth\|401\|403" server.log | tail -20
```

### Notification Logs
```bash
# Check notification test log
cat test_notification.log

# Check if email was sent
grep -i "success\|sent" test_notification.log
```

### BigQuery Logs (Check Pipeline Status)
```sql
-- Check recent pipeline runs
SELECT
  pipeline_logging_id,
  pipeline_id,
  tenant_id,
  status,
  start_time,
  end_time,
  error_message
FROM `gac-prod-471220.test_pipeline_user.pipeline_runs`
ORDER BY start_time DESC
LIMIT 10;

-- Check step logs for details
SELECT
  pipeline_logging_id,
  step_name,
  status,
  duration_ms,
  error_message
FROM `gac-prod-471220.test_pipeline_user.step_logs`
WHERE pipeline_logging_id = 'YOUR_PIPELINE_LOGGING_ID'
ORDER BY step_index;
```

---

## Validation Checklist

### Before Testing
- [ ] Server running (`curl http://localhost:8080/health`)
- [ ] Notification config loaded (`configs/notifications/config.json`)
- [ ] Email credentials configured (elsa@genai.community)
- [ ] Recipient email set (guru.kallam@gmail.com)

### Test Results Expected
- [ ] **Test 1:** Invalid API key → 401 response
- [ ] **Test 2:** Tenant mismatch → 403 response
- [ ] **Test 3:** Successful run → 200 response + pipeline_logging_id
- [ ] **Test 4:** Pipeline completes → Check BigQuery for status
- [ ] **Test 5:** Failure scenario → Email sent to guru.kallam@gmail.com

### Logs to Review
- [ ] Server logs show authentication flow
- [ ] Server logs show pipeline execution
- [ ] Notification logs show email sent
- [ ] Email received in inbox

---

## Troubleshooting

### Issue: 401 Unauthorized
**Cause:** Invalid or missing API key
**Solution:**
1. Check API key is correct
2. Verify tenant exists in BigQuery
3. Check `{tenant_id}.api_keys` table

### Issue: 403 Forbidden
**Cause:** Tenant ID mismatch
**Solution:**
1. Verify tenant_id in URL matches API key's tenant
2. Check authentication logs

### Issue: Pipeline Fails
**Cause:** Various (BigQuery permissions, invalid query, etc.)
**Solution:**
1. Check `pipeline_runs` table for error_message
2. Check `step_logs` table for detailed error
3. Review server logs

### Issue: No Email Received
**Cause:** SMTP configuration or notification not triggered
**Solution:**
1. Check spam folder
2. Verify notification config enabled
3. Check test_notification.log for errors
4. Test email manually: `python test_email_notification.py`

---

## Quick Reference

| Test Scenario | Expected HTTP Status | Expected Response |
|---------------|---------------------|-------------------|
| Invalid API key | 401 | "Invalid or inactive API key" |
| Tenant mismatch | 403 | "Tenant ID mismatch..." |
| Successful run | 200 | pipeline_logging_id returned |
| Pipeline failure | 200 (for trigger) | Email sent to guru.kallam@gmail.com |

---

**Ready to Test!** Use the curl commands above to test the system end-to-end.

**Check email at:** guru.kallam@gmail.com for failure notifications
**Server running on:** http://localhost:8080
**Pipeline:** gcp/example/dryrun.yml
