# /bigquery-ops - BigQuery Operations

Manage BigQuery stored procedures, cleanup test datasets, and database operations.

## Usage

```
/bigquery-ops <action> [environment] [options]
```

## Actions

### Procedure Sync
```
/bigquery-ops sync-procedures test       # Sync all procedures to test
/bigquery-ops sync-procedures stage      # Sync all procedures to stage
/bigquery-ops sync-procedures prod       # Sync all procedures to prod
/bigquery-ops sync-procedures test genai # Sync only GenAI domain
/bigquery-ops sync-procedures prod subscription # Sync only SaaS domain
```

### Cleanup Test Datasets
```
/bigquery-ops cleanup test              # List orphan datasets in test
/bigquery-ops cleanup test --delete     # Delete orphan test datasets
```

### List Procedures
```
/bigquery-ops list-procedures test      # List all procedures in test
/bigquery-ops list-procedures prod      # List all procedures in prod
```

---

## Instructions

When user runs `/bigquery-ops <action> <env> [domain]`, execute the following:

### Action: sync-procedures

**Parse arguments:**
- `{env}` = second argument (test, stage, prod)
- `{domain}` = third argument if provided (genai, subscription, cloud, migrations)

**Step 1: Set environment variables**
```bash
ENV={env}
case $ENV in
  test)  PROJECT=cloudact-testing-1; KEY_FILE=~/.gcp/cloudact-testing-1-e44da390bf82.json ;;
  stage) PROJECT=cloudact-stage; KEY_FILE=~/.gcp/cloudact-stage.json ;;
  prod)  PROJECT=cloudact-prod; KEY_FILE=~/.gcp/cloudact-prod.json ;;
esac
```

**Step 2: Activate GCP and get API key**
```bash
gcloud auth activate-service-account --key-file=$KEY_FILE
gcloud config set project $PROJECT
CA_ROOT_KEY=$(gcloud secrets versions access latest --secret=ca-root-api-key-${ENV} --project=$PROJECT)
```

**Step 3: Set pipeline URL**
```bash
case $ENV in
  test)  PIPELINE_URL="https://cloudact-pipeline-service-test-zfq7lndpda-uc.a.run.app" ;;
  stage) PIPELINE_URL="https://cloudact-pipeline-service-stage-zfq7lndpda-uc.a.run.app" ;;
  prod)  PIPELINE_URL="https://pipeline.cloudact.ai" ;;
esac
```

**Step 4: Sync procedures**

If domain is specified:
```bash
curl -s -X POST "${PIPELINE_URL}/api/v1/procedures/sync" \
  -H "X-CA-Root-Key: $CA_ROOT_KEY" \
  -H "Content-Type: application/json" \
  -d '{"force": true, "domain": "{domain}"}'
```

If no domain (sync all):
```bash
curl -s -X POST "${PIPELINE_URL}/api/v1/procedures/sync" \
  -H "X-CA-Root-Key: $CA_ROOT_KEY" \
  -H "Content-Type: application/json" \
  -d '{"force": true}'
```

**Step 5: Display results**
Parse the JSON response and report:
- Created procedures
- Updated procedures
- Failed procedures (with errors)

---

### Action: cleanup

**Parse arguments:**
- `{env}` = second argument (test, stage - NOT prod)
- `--delete` = flag to actually delete (otherwise just list)

**CRITICAL: Refuse if env=prod** - Never cleanup production datasets.

**Step 1: Set environment**
```bash
ENV={env}
case $ENV in
  test)  PROJECT=cloudact-testing-1 ;;
  stage) PROJECT=cloudact-stage ;;
  prod)  echo "ERROR: Cannot cleanup prod datasets"; exit 1 ;;
esac
```

**Step 2: Find orphan datasets**
```bash
bq query --project_id=$PROJECT --use_legacy_sql=false --format=prettyjson "
WITH valid_orgs AS (
  SELECT org_slug FROM \`$PROJECT.organizations.org_profiles\`
),
all_datasets AS (
  SELECT schema_name as dataset_id
  FROM \`$PROJECT.INFORMATION_SCHEMA.SCHEMATA\`
  WHERE REGEXP_CONTAINS(schema_name, r'_(prod|test|stage|local)\$')
    AND schema_name != 'organizations'
)
SELECT
  d.dataset_id,
  REGEXP_EXTRACT(d.dataset_id, r'^(.+)_(prod|test|stage|local)\$') as org_slug,
  CASE WHEN v.org_slug IS NULL THEN 'ORPHAN' ELSE 'VALID' END as status
FROM all_datasets d
LEFT JOIN valid_orgs v ON REGEXP_EXTRACT(d.dataset_id, r'^(.+)_(prod|test|stage|local)\$') = v.org_slug
WHERE v.org_slug IS NULL
ORDER BY dataset_id
"
```

**Step 3: If --delete flag present, ask for confirmation then delete**
```bash
# For each orphan dataset:
bq rm -r -f -d "$PROJECT:{dataset_id}"
```

---

### Action: list-procedures

**Step 1: Set environment**
```bash
ENV={env}
case $ENV in
  test)  PROJECT=cloudact-testing-1 ;;
  stage) PROJECT=cloudact-stage ;;
  prod)  PROJECT=cloudact-prod ;;
esac
```

**Step 2: Query procedures**
```bash
bq query --project_id=$PROJECT --use_legacy_sql=false --format=prettyjson "
SELECT
  routine_name,
  routine_type,
  FORMAT_TIMESTAMP('%Y-%m-%d %H:%M:%S', created) as created,
  FORMAT_TIMESTAMP('%Y-%m-%d %H:%M:%S', last_altered) as last_modified
FROM \`$PROJECT.organizations.INFORMATION_SCHEMA.ROUTINES\`
WHERE routine_type = 'PROCEDURE'
ORDER BY routine_name
"
```

---

## Procedure Domains Reference

| Domain | Procedures |
|--------|------------|
| `subscription` | sp_run_subscription_costs_pipeline, sp_calculate_subscription_plan_costs_daily, sp_convert_subscription_costs_to_focus_1_3 |
| `genai` | sp_consolidate_genai_costs_daily, sp_consolidate_genai_usage_daily, sp_convert_genai_to_focus_1_3 |
| `cloud` | sp_convert_cloud_costs_to_focus_1_3 |
| `migrations` | backfill_currency_audit_fields |

## Environment Reference

| Env | GCP Project | Secret Name |
|-----|-------------|-------------|
| test | cloudact-testing-1 | ca-root-api-key-test |
| stage | cloudact-stage | ca-root-api-key-stage |
| prod | cloudact-prod | ca-root-api-key-prod |

## Variables

- `$REPO_ROOT` = `/Users/gurukallam/prod-ready-apps/cloudact-mono-repo`

## Debug Account (for testing)

| Field | Value |
|-------|-------|
| Email | `john@example.com` |
| Password | `acme1234` |
| Org Slug | `acme_inc_01032026` |

**Debug dataset:** `acme_inc_01032026_local` (local environment)

**Example queries with debug org:**
```bash
# List tables in debug dataset
bq ls cloudact-testing-1:acme_inc_01032026_local

# Query debug org costs
bq query --nouse_legacy_sql \
  "SELECT SUM(EffectiveCost) FROM \`cloudact-testing-1.acme_inc_01032026_local.cost_data_standard_1_3\`"
```

See `.claude/debug-config.md` for full debug configuration.
