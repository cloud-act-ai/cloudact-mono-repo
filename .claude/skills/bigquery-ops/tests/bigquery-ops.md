# BigQuery Ops - Test Plan

## Overview

Validates BigQuery table schemas, bootstrap process, org dataset creation, materialized views, query performance, and data architecture for the CloudAct multi-tenant data layer.

## Test Matrix

### Bootstrap Tables (7 tests)

| # | Test | Type | Expected |
|---|------|------|----------|
| 1 | `organizations` dataset exists | Query | Dataset present in GCP project |
| 2 | All 30 bootstrap tables created | Query | 30 tables in `organizations` dataset |
| 3 | `org_profiles` schema matches JSON spec | Validation | Fields match `configs/setup/bootstrap/schemas/org_profiles.json` |
| 4 | `org_api_keys` has `key_hash` field | Validation | SHA256 hash field present and STRING type |
| 5 | `org_integration_credentials` has encryption fields | Validation | `encrypted_value` field present |
| 6 | `org_usage_quotas` has quota tracking fields | Validation | `quota_type`, `limit`, `used` fields present |
| 7 | Bootstrap is idempotent | E2E | Running bootstrap twice does not duplicate tables or data |

### Org Dataset Creation (6 tests)

| # | Test | Type | Expected |
|---|------|------|----------|
| 8 | Onboarding creates `{org_slug}_prod` dataset | E2E | Dataset created in BigQuery |
| 9 | `cost_data_standard_1_3` table created | Query | FOCUS 1.3 table present in org dataset |
| 10 | `subscription_plans` table created | Query | SaaS subscription table present |
| 11 | `genai_payg_pricing` table created | Query | GenAI pricing table present |
| 12 | `org_hierarchy` table created | Query | Hierarchy table present |
| 13 | Org dataset is isolated | Isolation | Org A cannot query Org B's dataset |

### Table Schema Validation (8 tests)

| # | Test | Type | Expected |
|---|------|------|----------|
| 14 | Schema JSON files are valid syntax | Validation | All JSON files parse without error |
| 15 | Required fields marked correctly | Validation | `mode: REQUIRED` on mandatory fields |
| 16 | Partition fields are DATE or TIMESTAMP | Validation | Partition column types are valid |
| 17 | Clustering columns exist in schema | Validation | Clustering fields reference existing columns |
| 18 | `cost_data_standard_1_3` has FOCUS fields | Validation | `ChargePeriodStart`, `EffectiveCost`, `ServiceProviderName` present |
| 19 | All x_* lineage fields present | Validation | `x_org_slug`, `x_pipeline_id`, `x_run_id`, etc. in pipeline tables |
| 20 | Hierarchy 5-field model present | Validation | `x_hierarchy_entity_id` through `x_hierarchy_path_names` |
| 21 | Table descriptions are meaningful | Validation | Every schema JSON has non-empty `description` |

### Stored Procedures (6 tests)

| # | Test | Type | Expected |
|---|------|------|----------|
| 22 | Cloud FOCUS procedures exist | Query | `sp_cloud_{gcp,aws,azure,oci}_convert_to_focus` in `organizations` dataset |
| 23 | GenAI consolidation procedures exist | Query | `sp_genai_1_consolidate_usage_daily`, `sp_genai_2_*`, `sp_genai_3_*` |
| 24 | Subscription procedures exist | Query | `sp_subscription_2_*`, `sp_subscription_3_*` |
| 25 | Procedures operate on per-org datasets | Validation | SQL references `{org_slug}_prod` parameterized |
| 26 | MERGE statements use composite key | Validation | Idempotency key: `(x_org_slug, x_pipeline_id, x_credential_id, x_pipeline_run_date)` |
| 27 | Hierarchy CTE in FOCUS procedures | Validation | `hierarchy_lookup` CTE with tag resolution logic |

### Materialized Views (4 tests)

| # | Test | Type | Expected |
|---|------|------|----------|
| 28 | `x_pipeline_exec_logs` view exists | Query | View present in org dataset |
| 29 | `x_org_hierarchy` view exists | Query | View present in org dataset |
| 30 | `x_all_notifications` view exists | Query | View present in org dataset |
| 31 | Views refresh within 15 minutes | Validation | Data propagation within expected window |

### Query Performance (5 tests)

| # | Test | Type | Expected |
|---|------|------|----------|
| 32 | Partition pruning reduces bytes scanned | Performance | Query with date filter scans fewer bytes than full scan |
| 33 | Clustering improves filter performance | Performance | Queries on clustering columns are faster |
| 34 | `SELECT *` avoided in cost reads | Audit | Cost service queries specify needed columns only |
| 35 | Dry run estimates bytes correctly | Performance | `bq query --dry_run` returns reasonable byte estimate |
| 36 | Cost read with Polars returns under 3s | Performance | API cost endpoint responds within 3 seconds |

### Multi-Tenant Data Isolation (5 tests)

| # | Test | Type | Expected |
|---|------|------|----------|
| 37 | `org_slug` filter on all shared tables | Isolation | Queries include `WHERE org_slug = @org_slug` |
| 38 | API key scoped to single org | Isolation | API key only returns data for associated org |
| 39 | Cross-dataset access prevented | Isolation | Org A API key cannot query Org B dataset |
| 40 | Bootstrap tables filter by org_slug | Isolation | All 30 tables use `org_slug` as tenant identifier |
| 41 | No org_id usage (only org_slug) | Audit | All tables use `org_slug` not `org_id` |

### Data Partitioning & Retention (3 tests)

| # | Test | Type | Expected |
|---|------|------|----------|
| 42 | `cost_data_standard_1_3` partitioned by `ChargePeriodStart` | Validation | DAY partitioning configured |
| 43 | Raw tables have 730-day retention | Validation | Partition expiration set to 730 days |
| 44 | Clustering columns match expected order | Validation | Clustering on `billing_account_id`, `service_id`, etc. |

**Total: 44 tests**

## Verification Commands

```bash
# List datasets
bq ls --project_id=cloudact-testing-1

# List bootstrap tables
bq ls organizations --project_id=cloudact-testing-1

# List org tables
bq ls {org_slug}_prod --project_id=cloudact-testing-1

# Show table schema
bq show --format=prettyjson cloudact-testing-1:organizations.org_profiles
bq show --format=prettyjson cloudact-testing-1:{org_slug}_prod.cost_data_standard_1_3

# Verify partitioning
bq show --format=prettyjson cloudact-testing-1:{org_slug}_prod.cost_data_standard_1_3 | jq '.timePartitioning'

# Verify clustering
bq show --format=prettyjson cloudact-testing-1:{org_slug}_prod.cost_data_standard_1_3 | jq '.clustering'

# Check stored procedures
bq ls --routines organizations --project_id=cloudact-testing-1

# Dry run for bytes estimation
bq query --nouse_legacy_sql --dry_run \
  "SELECT * FROM \`cloudact-testing-1.{org}_prod.cost_data_standard_1_3\` WHERE ChargePeriodStart >= '2025-12-01'"

# Check materialized views
bq ls {org_slug}_prod --project_id=cloudact-testing-1 | grep "VIEW"

# Verify multi-tenant isolation
bq query --nouse_legacy_sql \
  "SELECT DISTINCT x_org_slug FROM \`cloudact-testing-1.{org}_prod.cost_data_standard_1_3\`"

# Validate schema JSONs locally
cd 02-api-service
python -c "
import json, glob
for f in glob.glob('configs/setup/bootstrap/schemas/*.json') + glob.glob('configs/setup/organizations/onboarding/schemas/*.json'):
    try:
        json.load(open(f))
        print(f'OK: {f}')
    except Exception as e:
        print(f'FAIL: {f}: {e}')
"

# Bootstrap via Cloud Run Job
cd 05-scheduler-jobs
./scripts/run-job.sh stage bootstrap
```

## Pass Criteria

| Criteria | Target |
|----------|--------|
| Bootstrap tables created | 14/14 (100%) |
| Org dataset tables created | 6+ tables per org (100%) |
| Schema JSON validation | All files valid (100%) |
| Stored procedures present | All cloud + genai + subscription procedures |
| Materialized views present | 4/4 (100%) |
| Multi-tenant isolation | 0 cross-org data leakage |
| Query performance | Cost reads under 3s |
| Partition pruning effective | Bytes scanned reduced by 80%+ with date filter |

## Known Limitations

1. **Bootstrap idempotency**: Bootstrap creates tables only if they do not exist. Schema changes require `bootstrap-sync` job.
2. **Materialized view refresh**: 15-minute refresh interval means tests must wait for data propagation.
3. **Query performance tests**: Results vary by data volume. Performance benchmarks assume demo data (~100K rows).
4. **Stored procedure validation**: SQL syntax validation requires BigQuery execution. Cannot validate offline.
5. **Partition retention**: 730-day retention means old test data is automatically deleted. Use recent dates for testing.
6. **Schema changes**: Adding columns to existing tables requires `ALTER TABLE` or `bootstrap-sync`. Cannot modify via schema JSON alone.
7. **GCP project access**: Tests require GCP credentials with BigQuery read/write permissions.
8. **Polars read service**: Performance depends on network latency to BigQuery and data volume.
