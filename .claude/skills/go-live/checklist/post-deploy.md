# Post-Deploy Checklist

Run AFTER deployment completes and health checks pass.

## 1. Functional Verification

### Auth Flows
- [ ] Login with demo@cloudact.ai / Demo1234
- [ ] Redirects to `/{orgSlug}/dashboard`
- [ ] Logout works, redirects to login
- [ ] Signup form renders (don't submit in prod unless testing)
- [ ] Forgot password form renders

### Dashboard
- [ ] Cost summary widget loads
- [ ] Trend chart renders
- [ ] Provider breakdown shows data
- [ ] Date range filter works
- [ ] Currency display formatted correctly

### Cost Pages
- [ ] Cloud costs page loads
- [ ] GenAI costs page loads
- [ ] Subscription costs page loads
- [ ] Unified costs page loads
- [ ] Filters work (provider, date range, hierarchy)

### Integrations
- [ ] Integration list renders
- [ ] All provider cards show
- [ ] Can click into provider setup (don't modify prod creds)

### Budgets
- [ ] Budget page loads (`/{orgSlug}/budgets`)
- [ ] Budget list shows existing budgets
- [ ] Create single budget works
- [ ] Top-down allocation wizard renders (3 steps)
- [ ] Allocation tree tab shows parent→children
- [ ] Variance view shows budget vs actual

### Alerts
- [ ] Alert list renders
- [ ] Budget alert rules evaluate correctly (alerts-daily job)
- [ ] Test alert sends email
- [ ] Email template renders correctly

### Settings
- [ ] Org settings page loads
- [ ] Profile settings page loads
- [ ] Team members page loads
- [ ] Billing page loads (Stripe portal accessible)

## 2. API Verification

```bash
# OpenAPI docs accessible
curl -s -o /dev/null -w '%{http_code}' https://api.cloudact.ai/openapi.json
# Expected: 200

# Bootstrap endpoint (requires root key)
curl -s -o /dev/null -w '%{http_code}' \
  -H "X-CA-Root-Key: $CA_ROOT_API_KEY" \
  https://api.cloudact.ai/api/v1/admin/bootstrap
# Expected: 200 (already bootstrapped)
```

## 3. Scheduler Jobs

```bash
cd 05-scheduler-jobs/scripts

# Verify all jobs exist
./list-jobs.sh prod

# Verify Cloud Scheduler triggers are active
gcloud scheduler jobs list --location=us-central1 --project=cloudact-prod
```

See [scheduler/cloud-run-jobs.md](../scheduler/cloud-run-jobs.md) for full setup.

## 4. Log Monitoring

```bash
cd 04-inra-cicd-automation/CICD

# Watch all services for 30 minutes
./monitor/watch-all.sh prod 50

# Or tail specific service
gcloud alpha logging tail \
  "resource.type=cloud_run_revision AND resource.labels.service_name=cloudact-api-service-prod" \
  --project=cloudact-prod
```

**Watch for:**
- 500 errors
- Connection refused
- Timeout errors
- BigQuery quota exceeded
- Authentication failures

## 5. Stripe Webhooks

- [ ] Webhook endpoint is active in Stripe Dashboard
- [ ] Recent webhook deliveries show 200 status
- [ ] No failed webhooks in backlog

## 6. Email Delivery

- [ ] Send test alert email
- [ ] Verify email received
- [ ] Check email template rendering
- [ ] Verify sender domain (noreply@cloudact.ai)

## 7. Announce

- [ ] Team notification (Slack/email)
- [ ] Update changelog if applicable
- [ ] Close related issues/PRs

## Monitoring Period

| Window | Action |
|--------|--------|
| 0-30 min | Active log watching |
| 30-60 min | Periodic checks |
| 1-4 hours | Check error rates |
| 24 hours | Review daily job executions |
| 48 hours | Verify all scheduled jobs ran |
