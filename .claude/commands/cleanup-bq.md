# /cleanup-bq - BigQuery Full Cleanup + Bootstrap

**Nuke ALL BigQuery datasets (except protected) and rebuild via Cloud Run Jobs.**

## Usage

```
/cleanup-bq <environment>
```

## Environments

| Input | GCP Project | Key File | `run-job.sh` Arg |
|-------|-------------|----------|------------------|
| `local` / `test` / `stage` | cloudact-testing-1 | `/Users/openclaw/.gcp/cloudact-testing-1-e44da390bf82.json` | `stage` |
| `prod` | cloudact-prod | `/Users/openclaw/.gcp/cloudact-prod.json` | `prod` |

> **Note:** `local`, `test`, `stage` = same GCP project. No separate `cloudact-stage` project.
> **Note:** `run-job.sh` only accepts `test`, `stage`, or `prod` (NOT `local`). Map `local` → `stage`.

## What Gets Deleted

| Pattern | Description |
|---------|-------------|
| `organizations` | CloudAct meta dataset (**27 bootstrap tables**) |
| `*_prod` / `*_local` | ALL customer org datasets |
| Any other non-protected | Everything else |

## Protected Datasets (NEVER DELETE)

| Dataset | Purpose | Exists In |
|---------|---------|-----------|
| `gcp_billing_cud_dataset` | GCP Committed Use Discounts billing export | **prod only** |
| `gcp_cloud_billing_dataset` | GCP Cloud Billing export | **prod only** |

> Protected datasets only exist in `cloudact-prod`. Stage/test has no billing datasets.

## Full Workflow

```
Step 1: Activate GCP credentials (absolute paths!)
Step 2: List datasets → confirm deletion count
Step 3: Delete ALL datasets (skip protected in prod)
Step 4: Verify BQ is clean
Step 5: Bootstrap via Cloud Run Job → creates organizations + 30 tables
Step 6: Org-sync via Cloud Run Job → syncs active org datasets (0 after nuke)
```

---

## Instructions

### Step 1: Parse Environment + Activate Credentials

**CRITICAL:** Always use ABSOLUTE paths. `~/.gcp/` does NOT expand in gcloud commands.

```bash
case $ENV in
  local|test|stage)
    PROJECT="cloudact-testing-1"
    KEY_FILE="/Users/openclaw/.gcp/cloudact-testing-1-e44da390bf82.json"
    JOB_ENV="stage"
    ;;
  prod)
    PROJECT="cloudact-prod"
    KEY_FILE="/Users/openclaw/.gcp/cloudact-prod.json"
    JOB_ENV="prod"
    ;;
esac

gcloud auth activate-service-account --key-file=$KEY_FILE
gcloud config set project $PROJECT
```

### Step 2: If prod, ask for explicit confirmation

Use AskUserQuestion:
- "Delete ALL datasets from PRODUCTION BigQuery (cloudact-prod) and re-bootstrap? This is irreversible!"
- Options: "Yes, nuke + rebuild prod" / "No, cancel"

### Step 3: List and Delete ALL Datasets

```bash
PROTECTED="gcp_billing_cud_dataset gcp_cloud_billing_dataset"
DELETED=0

for ds in $(bq ls --project_id=$PROJECT 2>/dev/null | awk 'NR>2 {print $1}'); do
  if echo "$PROTECTED" | grep -qw "$ds"; then
    echo "SKIPPING (protected): $ds"
  else
    echo "Deleting: $ds"
    bq rm -r -f "$PROJECT:$ds"
    DELETED=$((DELETED + 1))
  fi
done

echo "Deleted $DELETED datasets"
```

### Step 4: Verify BQ is Clean

```bash
bq ls --project_id=$PROJECT
```

- **Stage/test:** Should be completely empty (no protected datasets here)
- **Prod:** Should show only `gcp_billing_cud_dataset` and `gcp_cloud_billing_dataset`

### Step 5: Run Bootstrap via Cloud Run Job

**Smart bootstrap auto-detects** fresh vs existing:
- **Fresh** (no organizations dataset): Creates dataset + 30 tables → `Tables created: 27, Tables existed: 0`
- **Existing** (organizations exists): Sync mode, adds new columns → `Tables created: 0, Tables existed: 27`

```bash
cd /Users/openclaw/.openclaw/workspace/cloudact-mono-repo/05-scheduler-jobs/scripts

# Stage/test (no confirmation needed)
./run-job.sh stage bootstrap

# Prod (requires confirmation)
echo "yes" | ./run-job.sh prod bootstrap
```

### Step 6: Verify Bootstrap via Cloud Run Logs

**Always check actual job logs** to confirm what happened (don't rely on exit code alone):

```bash
gcloud logging read \
  "resource.type=cloud_run_job AND resource.labels.job_name=cloudact-manual-bootstrap AND timestamp>=\"$(date -u +%Y-%m-%dT00:00:00Z)\"" \
  --project=$PROJECT \
  --limit=30 \
  --format="table(timestamp,textPayload)" \
  --order=asc
```

**Expected output patterns:**
- Fresh: `Tables created: 27, Tables existed: 0`
- Sync: `Tables created: 0, Columns added: 0, Already in sync`
- Conflict recovery: `Dataset already exists - will run sync instead`

### Step 7: Run Org Sync via Cloud Run Job

```bash
# After nuke: "Found 0 active organizations" (expected, exits cleanly)
./run-job.sh $JOB_ENV org-sync-all

# Prod
echo "yes" | ./run-job.sh prod org-sync-all
```

### Step 8: Verify Org Sync via Cloud Run Logs

```bash
gcloud logging read \
  "resource.type=cloud_run_job AND resource.labels.job_name=cloudact-manual-org-sync-all AND timestamp>=\"$(date -u +%Y-%m-%dT00:00:00Z)\"" \
  --project=$PROJECT \
  --limit=30 \
  --format="table(timestamp,textPayload)" \
  --order=asc
```

### Step 9: Report Summary

```
=== BigQuery Cleanup + Bootstrap Complete ===
Environment: $ENV ($PROJECT)
Datasets deleted: X
Protected (kept): gcp_billing_cud_dataset, gcp_cloud_billing_dataset (prod only)
Bootstrap: OK (organizations + 30 tables)
Org sync: OK (0 orgs after nuke is expected)
```

---

## Smart Bootstrap Behavior (Verified 2026-02-12)

| Scenario | Detection | Result |
|----------|-----------|--------|
| **Fresh** (no `organizations` dataset) | Auto-detect | Creates dataset + **30 tables** |
| **Existing** (dataset exists) | Auto-detect | Sync: adds new columns, skips existing |
| **After nuke** | Fresh path | Full recreation |

> **Note:** Bootstrap creates **30 tables** (23 core + 4 chat).

## Smart Migration Behavior (Verified 2026-02-12)

| Scenario | Result |
|----------|--------|
| **Already applied** | "Already applied: 48 migrations, No pending" → skips |
| **New migrations** | Applies only new ones |
| **After Supabase nuke** | Schema tables survive TRUNCATE, migration tracking preserved |

> **Note:** Applied count (48) > file count (41) because some migrations were consolidated.

## Cloud Run Job Reference

| Step | Command (stage) | Command (prod) |
|------|-----------------|----------------|
| Bootstrap | `./run-job.sh stage bootstrap` | `echo "yes" \| ./run-job.sh prod bootstrap` |
| Org Sync | `./run-job.sh stage org-sync-all` | `echo "yes" \| ./run-job.sh prod org-sync-all` |

**Scripts location:** `05-scheduler-jobs/scripts/`

**`run-job.sh` valid envs:** `test`, `stage`, `prod` (NOT `local` — map local → stage)

## Safety Notes

1. **Prod requires confirmation** - Never auto-delete prod without explicit user approval
2. **Protected datasets preserved** - GCP billing datasets NEVER deleted (prod only)
3. **Use absolute paths** - `~/.gcp/` does NOT expand; use `/Users/openclaw/.gcp/`
4. **Cloud Run Jobs only** - Bootstrap/sync via Cloud Run Jobs, NOT local scripts
5. **Prod needs `echo "yes" |`** - `run-job.sh prod` prompts for confirmation
6. **Map local → stage** - `run-job.sh` doesn't accept `local`, use `stage` instead
