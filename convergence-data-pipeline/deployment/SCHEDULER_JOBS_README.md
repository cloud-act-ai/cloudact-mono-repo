# Cloud Scheduler Jobs - Deployment Guide

This directory contains configuration and deployment scripts for critical Cloud Scheduler maintenance jobs.

## Overview

Two critical maintenance jobs keep the system healthy:

1. **Daily Quota Reset** - Resets pipeline quotas at midnight UTC
2. **Orphaned Pipeline Cleanup** - Cleans up stuck pipelines every 30 minutes

---

## Quick Start

### 1. Prerequisites

```bash
# Install gcloud CLI
curl https://sdk.cloud.google.com | bash
exec -l $SHELL

# Authenticate
gcloud auth login
gcloud config set project gac-prod-471220

# Enable Cloud Scheduler API
gcloud services enable cloudscheduler.googleapis.com
```

### 2. Set Environment Variables

```bash
# Set your admin API key (REQUIRED)
export ADMIN_API_KEY="your-admin-api-key-here"

# Set your API base URL (REQUIRED)
export API_BASE_URL="https://your-convergence-api.run.app"

# Optional: Override defaults
export GCP_PROJECT_ID="gac-prod-471220"
export GCP_REGION="us-central1"
```

### 3. Deploy Jobs

```bash
# Make script executable (first time only)
chmod +x deployment/deploy-scheduler-jobs.sh

# Deploy both jobs
./deployment/deploy-scheduler-jobs.sh
```

Expected output:
```
==================================================
Cloud Scheduler Jobs Deployment
==================================================

Configuration:
  Project ID:    gac-prod-471220
  Region:        us-central1
  API Base URL:  https://your-api.run.app
  Admin Key:     admin_key_abc123... (masked)

Deploying Cloud Scheduler jobs...

Deploying job: reset-daily-quotas
✓ Job 'reset-daily-quotas' created successfully

Deploying job: cleanup-orphaned-pipelines
✓ Job 'cleanup-orphaned-pipelines' updated successfully

==================================================
Deployment Complete!
==================================================
```

---

## Job Details

### Job 1: Daily Quota Reset

**Purpose**: Reset all tenant pipeline quotas at midnight UTC

**Schedule**: `0 0 * * *` (Daily at 00:00 UTC)

**Endpoint**: `POST /api/v1/scheduler/reset-daily-quotas`

**What it does**:
- Resets `pipelines_run_today` to 0
- Resets `pipelines_succeeded_today` to 0
- Resets `pipelines_failed_today` to 0
- Resets `concurrent_pipelines_running` to 0
- Archives quota records older than 90 days

**Timeout**: 180 seconds (3 minutes)

**Retries**: 3 attempts with exponential backoff

---

### Job 2: Orphaned Pipeline Cleanup

**Purpose**: Clean up pipelines stuck in PENDING/RUNNING state

**Schedule**: `*/30 * * * *` (Every 30 minutes)

**Endpoint**: `POST /api/v1/scheduler/cleanup-orphaned-pipelines`

**What it does**:
- Finds pipelines in PENDING/RUNNING state for >60 minutes
- Marks them as FAILED with error: "TIMEOUT: Pipeline orphaned and auto-cleaned by scheduler"
- Decrements `concurrent_pipelines_running` counter
- Processes all active tenants

**Timeout**: 300 seconds (5 minutes)

**Retries**: 2 attempts with exponential backoff

---

## Monitoring & Testing

### View Deployed Jobs

```bash
# List all scheduler jobs
gcloud scheduler jobs list --location=us-central1

# Describe specific job
gcloud scheduler jobs describe reset-daily-quotas \
  --location=us-central1
```

### Manual Testing

```bash
# Test quota reset job
gcloud scheduler jobs run reset-daily-quotas \
  --location=us-central1 \
  --project=gac-prod-471220

# Test cleanup job
gcloud scheduler jobs run cleanup-orphaned-pipelines \
  --location=us-central1 \
  --project=gac-prod-471220
```

### View Execution Logs

```bash
# Quota reset logs
gcloud logging read \
  'resource.type=cloud_scheduler_job AND resource.labels.job_id=reset-daily-quotas' \
  --limit=20 \
  --format=json

# Cleanup job logs
gcloud logging read \
  'resource.type=cloud_scheduler_job AND resource.labels.job_id=cleanup-orphaned-pipelines' \
  --limit=20 \
  --format=json
```

### Check Job Status

```bash
# Check recent executions
gcloud scheduler jobs describe reset-daily-quotas \
  --location=us-central1 \
  --format="value(state,lastAttemptTime,scheduleTime)"
```

---

## Troubleshooting

### Issue: "Permission denied" errors

**Solution**: Grant Cloud Scheduler service account permissions

```bash
# Get the service account email
gcloud projects get-iam-policy gac-prod-471220 \
  --flatten="bindings[].members" \
  --filter="bindings.role:roles/cloudscheduler.serviceAgent" \
  --format="value(bindings.members)"

# Grant Cloud Run invoker role
gcloud projects add-iam-policy-binding gac-prod-471220 \
  --member=serviceAccount:service-PROJECT_NUMBER@gcp-sa-cloudscheduler.iam.gserviceaccount.com \
  --role=roles/cloudscheduler.jobRunner
```

### Issue: "Job already exists" on deployment

**Solution**: Script automatically updates existing jobs. Check logs for update status.

### Issue: Jobs timing out

**Possible causes**:
- API endpoint is slow
- Too many tenants to process (cleanup job)
- Database connection issues

**Solutions**:
1. Increase attempt deadline:
   ```bash
   gcloud scheduler jobs update http cleanup-orphaned-pipelines \
     --attempt-deadline=600s \
     --location=us-central1
   ```

2. Optimize endpoint performance
3. Add database connection pooling

### Issue: Jobs failing with HTTP 401 Unauthorized

**Cause**: Admin API key is invalid or expired

**Solution**: Regenerate admin API key and redeploy:
```bash
# Generate new admin key in database
# Then update environment and redeploy
export ADMIN_API_KEY="new-admin-key"
./deployment/deploy-scheduler-jobs.sh
```

---

## Alerting

### Recommended Alerts

Set up Cloud Monitoring alerts for job failures:

```bash
# Create alert for quota reset failures
gcloud alpha monitoring policies create \
  --notification-channels=CHANNEL_ID \
  --display-name="Quota Reset Job Failures" \
  --condition-display-name="Job failed 2+ times" \
  --condition-threshold-value=2 \
  --condition-threshold-duration=300s \
  --condition-filter='
    resource.type="cloud_scheduler_job"
    AND resource.labels.job_id="reset-daily-quotas"
    AND metric.type="scheduler.googleapis.com/job/execution_count"
    AND metric.labels.status="FAILURE"
  '
```

### Email Notifications

Configure notifications via Cloud Monitoring:
1. Go to Cloud Console > Monitoring > Alerting
2. Create notification channel (email, PagerDuty, Slack)
3. Link to alert policies

---

## Updating Jobs

### Change Schedule

```bash
# Update quota reset to run at 1 AM instead of midnight
gcloud scheduler jobs update http reset-daily-quotas \
  --schedule="0 1 * * *" \
  --location=us-central1
```

### Change Cleanup Frequency

```bash
# Run every 15 minutes instead of 30
gcloud scheduler jobs update http cleanup-orphaned-pipelines \
  --schedule="*/15 * * * *" \
  --location=us-central1
```

### Update API URL

```bash
# Update API base URL for both jobs
export API_BASE_URL="https://new-api-url.run.app"
./deployment/deploy-scheduler-jobs.sh
```

---

## Deleting Jobs

### Remove Single Job

```bash
gcloud scheduler jobs delete reset-daily-quotas \
  --location=us-central1 \
  --quiet
```

### Remove All Jobs

```bash
gcloud scheduler jobs delete reset-daily-quotas \
  --location=us-central1 \
  --quiet

gcloud scheduler jobs delete cleanup-orphaned-pipelines \
  --location=us-central1 \
  --quiet
```

---

## Security Best Practices

1. **Admin API Key Rotation**: Rotate admin keys every 90 days
2. **Least Privilege**: Use dedicated service account for Cloud Scheduler
3. **Audit Logging**: Enable Cloud Audit Logs for scheduler operations
4. **Network Security**: Use VPC Service Controls if available
5. **Secret Management**: Store admin key in Secret Manager:

```bash
# Store key in Secret Manager
echo -n "$ADMIN_API_KEY" | gcloud secrets create scheduler-admin-key \
  --data-file=- \
  --replication-policy=automatic

# Grant access to Cloud Scheduler service account
gcloud secrets add-iam-policy-binding scheduler-admin-key \
  --member=serviceAccount:service-PROJECT_NUMBER@gcp-sa-cloudscheduler.iam.gserviceaccount.com \
  --role=roles/secretmanager.secretAccessor
```

---

## Cost Optimization

**Cloud Scheduler Pricing** (as of 2024):
- First 3 jobs: Free
- Additional jobs: $0.10 per job per month

**Current Cost**: $0/month (2 jobs < 3 free tier)

**Tips**:
- Don't create redundant jobs
- Use appropriate retry configurations
- Monitor job execution frequency

---

## Support

For issues or questions:
- **Internal**: Contact DevOps team
- **GCP Support**: https://cloud.google.com/support
- **Documentation**: https://cloud.google.com/scheduler/docs

---

## Changelog

### 2025-11-17
- Initial deployment of quota reset and cleanup jobs
- Added comprehensive documentation and deployment script

---

## Files in This Directory

- `cloud-scheduler-jobs.yaml` - Job configuration (YAML format)
- `deploy-scheduler-jobs.sh` - Automated deployment script
- `SCHEDULER_JOBS_README.md` - This file

---

**Last Updated**: 2025-11-17
**Maintainer**: DevOps Team
**Version**: 1.0.0
