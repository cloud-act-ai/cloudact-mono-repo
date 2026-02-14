# Rollback Procedures

Use when a production deploy causes critical issues.

## Decision Matrix

| Symptom | Action | Urgency |
|---------|--------|---------|
| Service down (500s) | Rollback Cloud Run | Immediate |
| Data corruption | Rollback + BQ snapshot | Immediate |
| Feature bug (non-blocking) | Hotfix forward | Low |
| Stripe webhook failing | Disable webhook | Medium |
| Scheduler job failing | Pause specific job | Medium |

## Quick Rollback (Cloud Run Traffic)

Route traffic back to previous revision (fastest, ~30 seconds):

```bash
# List revisions for a service
gcloud run revisions list \
  --service=cloudact-api-service-prod \
  --region=us-central1 \
  --project=cloudact-prod

# Route 100% traffic to previous revision
gcloud run services update-traffic cloudact-api-service-prod \
  --to-revisions=cloudact-api-service-prod-PREVIOUS:100 \
  --region=us-central1 \
  --project=cloudact-prod
```

Repeat for all affected services:
- `cloudact-frontend-prod`
- `cloudact-api-service-prod`
- `cloudact-pipeline-service-prod`
- `cloudact-chat-backend-prod`

## Redeploy Previous Version

If traffic routing isn't enough (e.g., needs schema changes reverted):

```bash
# Find the last good tag
git log --oneline --tags --decorate | head -10

# Checkout and redeploy
git checkout v4.4.1
git tag v4.4.1-rollback
git push origin v4.4.1-rollback
```

## Pause Scheduler Jobs

```bash
# Pause all scheduled triggers (actual names use cloudact-*-trigger convention)
gcloud scheduler jobs pause cloudact-daily-quota-reset-trigger --location=us-central1 --project=cloudact-prod
gcloud scheduler jobs pause cloudact-daily-quota-cleanup-trigger --location=us-central1 --project=cloudact-prod
gcloud scheduler jobs pause cloudact-daily-stale-cleanup-trigger --location=us-central1 --project=cloudact-prod
gcloud scheduler jobs pause cloudact-daily-pipelines-trigger --location=us-central1 --project=cloudact-prod
gcloud scheduler jobs pause cloudact-daily-alerts-trigger --location=us-central1 --project=cloudact-prod
gcloud scheduler jobs pause cloudact-monthly-quota-reset-trigger --location=us-central1 --project=cloudact-prod
```

Resume after fix:
```bash
gcloud scheduler jobs resume cloudact-daily-quota-reset-trigger --location=us-central1 --project=cloudact-prod
gcloud scheduler jobs resume cloudact-daily-quota-cleanup-trigger --location=us-central1 --project=cloudact-prod
gcloud scheduler jobs resume cloudact-daily-stale-cleanup-trigger --location=us-central1 --project=cloudact-prod
gcloud scheduler jobs resume cloudact-daily-pipelines-trigger --location=us-central1 --project=cloudact-prod
gcloud scheduler jobs resume cloudact-daily-alerts-trigger --location=us-central1 --project=cloudact-prod
gcloud scheduler jobs resume cloudact-monthly-quota-reset-trigger --location=us-central1 --project=cloudact-prod
```

## BigQuery Recovery

BigQuery has automatic 7-day time travel:

```sql
-- Query data as it was at a specific time
SELECT * FROM `cloudact-prod.organizations.org_profiles`
FOR SYSTEM_TIME AS OF TIMESTAMP('2026-02-13 10:00:00 UTC');

-- Restore a table from snapshot
CREATE OR REPLACE TABLE `cloudact-prod.organizations.org_profiles`
AS SELECT * FROM `cloudact-prod.organizations.org_profiles`
FOR SYSTEM_TIME AS OF TIMESTAMP('2026-02-13 10:00:00 UTC');
```

## Stripe Recovery

| Issue | Action |
|-------|--------|
| Bad webhook | Disable in Stripe Dashboard, replay after fix |
| Wrong prices | Update price IDs in GCP Secret Manager |
| Subscription errors | Check Stripe Dashboard, manual correction |

## Supabase Recovery

```bash
# Migrations cannot be "undone" automatically
# Create a reverse migration if needed
cd 01-fronted-system/scripts/supabase_db

# Check current status
./migrate.sh --status --prod

# Apply reverse migration
./migrate.sh --prod
```

## Post-Rollback

1. **Verify health** - All 4 services healthy
2. **Check logs** - No new errors
3. **Test login** - Auth flow works
4. **Notify team** - Explain what happened
5. **Root cause** - Document the issue
6. **Fix forward** - Prepare hotfix on main
