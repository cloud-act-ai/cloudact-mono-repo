# Cloud Run Jobs Setup

All scheduled operations run as Cloud Run Jobs. Set these up on first deploy and after job changes.

## Scripts

```bash
cd 05-scheduler-jobs/scripts

./create-all-jobs.sh <env>    # Create all jobs + schedulers
./run-job.sh <env> <job>      # Run a specific job
./list-jobs.sh <env>          # List jobs + recent executions
```

**Valid envs:** `test`, `stage`, `prod` (NOT `local` - map to `stage`)

## First-Time Setup

```bash
# 1. Activate prod credentials (ABSOLUTE PATH!)
gcloud auth activate-service-account \
  --key-file=/Users/openclaw/.gcp/cloudact-prod.json

# 2. Create all Cloud Run Jobs + Cloud Scheduler triggers
cd 05-scheduler-jobs/scripts
./create-all-jobs.sh prod

# 3. Verify all jobs created
./list-jobs.sh prod

# 4. Verify schedulers active
gcloud scheduler jobs list --location=us-central1 --project=cloudact-prod
```

## Job Inventory

### Manual Jobs (Run on Demand)

| Job | Command | When | Purpose |
|-----|---------|------|---------|
| bootstrap | `./run-job.sh prod bootstrap` | First deploy, schema changes | Create organizations dataset + 27 meta tables |
| bootstrap-sync | `./run-job.sh prod bootstrap-sync` | After adding columns | Add new columns to existing meta tables |
| org-sync-all | `./run-job.sh prod org-sync-all` | After bootstrap, schema changes | Sync ALL org datasets with latest schema |
| migrate | `./run-job.sh prod migrate` | Before bootstrap | Run Supabase migrations via Cloud Run |

**Execution order:** migrate -> bootstrap -> org-sync-all (dependencies cascade)

### Scheduled Daily Jobs

| Job | Schedule (UTC) | Purpose |
|-----|----------------|---------|
| quota-reset-daily | 00:00 | Reset daily pipeline run counters |
| quota-cleanup | 01:00 | Delete quota records older than 90 days |
| stale-cleanup | 02:00 | Fix stuck concurrent pipeline counters |
| alerts-daily | 08:00 | Process cost alerts for all orgs |

### Scheduled Monthly Jobs

| Job | Schedule (UTC) | Purpose |
|-----|----------------|---------|
| quota-reset-monthly | 00:05 on 1st | Reset monthly pipeline run counters |

## Manual Job Execution

```bash
cd 05-scheduler-jobs/scripts

# Stage (no confirmation needed)
./run-job.sh stage bootstrap
./run-job.sh stage org-sync-all

# Prod (requires "yes" confirmation)
echo "yes" | ./run-job.sh prod bootstrap
echo "yes" | ./run-job.sh prod org-sync-all

# Or interactively
./run-job.sh prod bootstrap
# Type "yes" when prompted
```

### Job Shortcuts

| Shortcut | Full Name |
|----------|-----------|
| `bootstrap` | `ca-{env}-bootstrap` |
| `bootstrap-sync` | `ca-{env}-bootstrap-sync` |
| `org-sync-all` | `ca-{env}-org-sync-all` |
| `migrate` | `ca-{env}-migrate` |
| `quota-reset-daily` | `ca-{env}-quota-reset-daily` |
| `quota-cleanup` | `ca-{env}-quota-cleanup` |
| `stale-cleanup` | `ca-{env}-stale-cleanup` |
| `alerts-daily` | `ca-{env}-alerts-daily` |
| `quota-reset-monthly` | `ca-{env}-quota-reset-monthly` |

## Verification

```bash
# List all jobs
./list-jobs.sh prod

# Check recent executions
gcloud run jobs executions list \
  --region=us-central1 \
  --project=cloudact-prod \
  --limit=10

# Check specific job status
gcloud run jobs executions list \
  --job=ca-prod-bootstrap \
  --region=us-central1 \
  --project=cloudact-prod

# Monitor first automatic runs
watch -n 60 'gcloud run jobs executions list --region=us-central1 --project=cloudact-prod --limit=10'
```

## Pause/Resume Schedulers

```bash
# Pause (during incidents)
gcloud scheduler jobs pause ca-prod-quota-reset-daily \
  --location=us-central1 --project=cloudact-prod

# Resume (after fix)
gcloud scheduler jobs resume ca-prod-quota-reset-daily \
  --location=us-central1 --project=cloudact-prod
```

## Troubleshooting

| Issue | Cause | Fix |
|-------|-------|-----|
| Job not found | Not created | Run `./create-all-jobs.sh prod` |
| PERMISSION_DENIED | Wrong credentials | `gcloud auth activate-service-account --key-file=...` |
| Job fails immediately | Missing env vars | Check Cloud Run Job env config |
| Scheduler not firing | Job paused | `gcloud scheduler jobs resume ...` |
| "local" env rejected | Not a valid env | Use `stage` instead |
