# BigQuery Schema Management

This directory contains SQL schema definitions for BigQuery datasets used in the convergence data pipeline.

## Overview

All schema files follow a standardized structure for managing BigQuery tables, partitioning, clustering, and Row-Level Security (RLS) policies.

## Files

### `customers_dataset.sql`
Complete schema for the centralized `customers` dataset with 7 core tables:

1. **customer_profiles** - Main customer registry with tenant metadata
2. **customer_api_keys** - Centralized API key storage (KMS encrypted)
3. **customer_cloud_credentials** - Multi-cloud provider credentials (KMS encrypted)
4. **customer_subscriptions** - Stripe subscription plans with usage limits
5. **customer_usage_quotas** - Daily/monthly usage tracking with quota enforcement
6. **customer_team_members** - Team member management with RBAC
7. **customer_provider_configs** - Provider-specific pipeline configurations

## Schema Architecture

### Multi-Tenant Isolation
- **Row-Level Security (RLS)**: All queries filtered by `customer_id` from JWT token
- **Tenant Datasets**: Each customer has isolated BigQuery dataset (referenced in `customer_profiles.tenant_dataset_id`)
- **Centralized Management**: Customer metadata, credentials, and billing in shared `customers` dataset

### Security Features
- **KMS Encryption**: Sensitive fields (API keys, cloud credentials) encrypted using Google Cloud KMS
- **SHA256 Hashing**: API keys hashed for fast lookup without exposing plaintext
- **Audit Trails**: All modifications tracked with `created_by`, `updated_by`, timestamps
- **Policy Tags**: BigQuery policy tags applied for data governance

### Performance Optimization
- **Partitioning**: All tables partitioned by date fields (typically `created_at` or `usage_date`)
- **Clustering**: Multi-column clustering for fast queries (e.g., `customer_id`, `status`)
- **Partition Pruning**: Date-based queries automatically prune irrelevant partitions

## Subscription Plans

Based on Stripe pricing tiers:

| Plan | Team Members | Providers | Daily Pipelines | Price |
|------|-------------|-----------|----------------|-------|
| **STARTER** | 2 | 3 | 6 | $49/month |
| **PROFESSIONAL** | 6 | 6 | 25 | $199/month |
| **SCALE** | 11 | 10 | 100 | $499/month |

All plans include:
- 14-day free trial
- Concurrent pipeline limit: 3
- Monthly API call limits (plan-dependent)

## Usage Tracking

### Daily Quotas
The `customer_usage_quotas` table tracks:
- Pipelines run today (compared against `daily_limit`)
- Concurrent pipelines running (compared against `concurrent_limit`)
- Monthly aggregates for billing
- Quota exceeded flags for enforcement

### Quota Enforcement Flow
1. **Before Pipeline Start**: Check `pipelines_run_today < daily_limit`
2. **On Start**: Increment `pipelines_run_today` and `concurrent_pipelines_running`
3. **On Completion**: Decrement `concurrent_pipelines_running`, update success/failure counts
4. **At 80% Usage**: Set `quota_warning_sent = TRUE` and send notification
5. **At 100% Usage**: Set `quota_exceeded = TRUE` and block new pipelines

## Deployment

### Initial Setup
```bash
# 1. Set project
gcloud config set project gac-prod-471220

# 2. Create dataset and tables
bq mk --dataset --location=US gac-prod-471220:customers
bq query --use_legacy_sql=false < customers_dataset.sql

# 3. Apply policy tags (RLS)
# See "Row-Level Security Setup" section below
```

### Schema Updates
```bash
# Dry run first
bq query --use_legacy_sql=false --dry_run < customers_dataset.sql

# Apply changes
bq query --use_legacy_sql=false < customers_dataset.sql
```

### Backup Before Changes
```bash
# Export current schema
bq show --schema --format=prettyjson gac-prod-471220:customers.customer_profiles > backup_schema.json

# Export data
bq extract --destination_format=AVRO 'gac-prod-471220:customers.customer_profiles' gs://backup-bucket/customers/profiles_*.avro
```

## Row-Level Security Setup

### Step 1: Create Policy Tag Taxonomy
```bash
gcloud data-catalog taxonomies create customer-data-taxonomy \
  --location=us \
  --display-name="Customer Data Taxonomy" \
  --description="Policy tags for customer data isolation"
```

### Step 2: Create Policy Tags
```bash
# Tag for customer_id filtering
gcloud data-catalog taxonomies policy-tags create customer-data \
  --taxonomy=customer-data-taxonomy \
  --location=us \
  --display-name="Customer Data" \
  --description="Restricts access to customer's own data"

# Tag for sensitive encrypted fields
gcloud data-catalog taxonomies policy-tags create sensitive-data \
  --taxonomy=customer-data-taxonomy \
  --location=us \
  --display-name="Sensitive Data" \
  --description="KMS encrypted sensitive fields"
```

### Step 3: Apply Policy Tags to Columns
```sql
-- Apply to customer_id columns
ALTER TABLE `gac-prod-471220.customers.customer_profiles`
ALTER COLUMN customer_id
SET OPTIONS (
  policy_tags=('projects/gac-prod-471220/locations/us/taxonomies/customer-data-taxonomy/policyTags/customer-data')
);

-- Apply to encrypted columns
ALTER TABLE `gac-prod-471220.customers.customer_api_keys`
ALTER COLUMN encrypted_api_key
SET OPTIONS (
  policy_tags=('projects/gac-prod-471220/locations/us/taxonomies/customer-data-taxonomy/policyTags/sensitive-data')
);
```

### Step 4: Create Authorized Views
```sql
-- Create view with RLS filter
CREATE VIEW `gac-prod-471220.customers_rls.customer_profiles_view` AS
SELECT *
FROM `gac-prod-471220.customers.customer_profiles`
WHERE customer_id = SESSION_USER().customer_id;

-- Grant access to view (not underlying table)
GRANT `roles/bigquery.dataViewer` ON `gac-prod-471220.customers_rls.customer_profiles_view`
TO serviceAccount:pipeline-service@gac-prod-471220.iam.gserviceaccount.com;
```

## API Integration

### Application Code Example
```python
from google.cloud import bigquery
from typing import Optional

class CustomerRepository:
    def __init__(self, customer_id: str):
        self.customer_id = customer_id
        self.client = bigquery.Client()

    def get_daily_quota(self, date: str) -> dict:
        """Check daily pipeline quota for customer."""
        query = f"""
        SELECT
            pipelines_run_today,
            daily_limit,
            quota_exceeded,
            concurrent_pipelines_running,
            concurrent_limit
        FROM `gac-prod-471220.customers.customer_usage_quotas`
        WHERE customer_id = @customer_id
          AND usage_date = @usage_date
        """

        job_config = bigquery.QueryJobConfig(
            query_parameters=[
                bigquery.ScalarQueryParameter("customer_id", "STRING", self.customer_id),
                bigquery.ScalarQueryParameter("usage_date", "DATE", date),
            ]
        )

        result = self.client.query(query, job_config=job_config).result()
        return next(iter(result), None)

    def increment_pipeline_count(self, date: str):
        """Increment daily pipeline count (atomic operation)."""
        query = f"""
        UPDATE `gac-prod-471220.customers.customer_usage_quotas`
        SET
            pipelines_run_today = pipelines_run_today + 1,
            last_updated = CURRENT_TIMESTAMP()
        WHERE customer_id = @customer_id
          AND usage_date = @usage_date
        """
        # Execute update...
```

## Monitoring Queries

### Active Customers
```sql
SELECT
  customer_id,
  company_name,
  subscription_plan,
  status,
  created_at
FROM `gac-prod-471220.customers.customer_profiles`
WHERE status IN ('ACTIVE', 'TRIAL')
ORDER BY created_at DESC;
```

### Quota Utilization
```sql
SELECT
  cp.company_name,
  uq.usage_date,
  uq.pipelines_run_today,
  uq.daily_limit,
  ROUND(uq.pipelines_run_today / uq.daily_limit * 100, 2) AS utilization_pct,
  uq.quota_exceeded
FROM `gac-prod-471220.customers.customer_usage_quotas` uq
JOIN `gac-prod-471220.customers.customer_profiles` cp
  ON uq.customer_id = cp.customer_id
WHERE uq.usage_date = CURRENT_DATE()
  AND cp.status = 'ACTIVE'
ORDER BY utilization_pct DESC;
```

### Expired API Keys
```sql
SELECT
  cp.company_name,
  ak.key_name,
  ak.expires_at,
  ak.last_used_at
FROM `gac-prod-471220.customers.customer_api_keys` ak
JOIN `gac-prod-471220.customers.customer_profiles` cp
  ON ak.customer_id = cp.customer_id
WHERE ak.expires_at < CURRENT_TIMESTAMP()
  AND ak.is_active = TRUE
ORDER BY ak.expires_at;
```

### Trial Expiring Soon
```sql
SELECT
  customer_id,
  company_name,
  trial_end_date,
  DATE_DIFF(trial_end_date, CURRENT_DATE(), DAY) AS days_remaining
FROM `gac-prod-471220.customers.customer_profiles`
WHERE status = 'TRIAL'
  AND trial_end_date BETWEEN CURRENT_DATE() AND DATE_ADD(CURRENT_DATE(), INTERVAL 7 DAY)
ORDER BY trial_end_date;
```

## Maintenance Tasks

### Daily
- Monitor quota usage and send warnings at 80% threshold
- Validate API key usage patterns
- Check for quota exceeded customers

### Weekly
- Validate cloud credentials (test connections)
- Review failed pipeline patterns
- Archive old audit logs

### Monthly
- Deactivate expired API keys
- Review subscription changes
- Optimize partition pruning
- Generate billing reports

### Quarterly
- Audit team member access
- Review and update policy tags
- Optimize clustering columns
- Analyze query performance

## Best Practices

### Schema Evolution
1. Always use `CREATE TABLE IF NOT EXISTS` for idempotency
2. Add new columns with `DEFAULT` values to avoid breaking changes
3. Test schema changes in dev/staging environment first
4. Document all schema changes in git commit messages

### Query Optimization
1. Always filter by `customer_id` first (leverages clustering)
2. Use date range filters to leverage partitioning
3. Avoid `SELECT *` in production queries
4. Use `LIMIT` for exploratory queries

### Security
1. Never store plaintext API keys or credentials
2. Rotate KMS keys annually
3. Audit RLS policy tag assignments quarterly
4. Monitor unauthorized access attempts

### Cost Management
1. Set table expiration for temporary tables
2. Use clustering to reduce data scanned
3. Monitor slot usage for expensive queries
4. Archive old partitions to cheaper storage

## Troubleshooting

### Issue: Query timeout on large tables
**Solution**: Add partition filter or increase clustering efficiency

### Issue: RLS not working
**Solution**: Verify policy tags applied and authorized views configured

### Issue: Quota not updating in real-time
**Solution**: Check for transaction conflicts, use atomic UPDATE operations

### Issue: KMS decryption failures
**Solution**: Verify service account has `cloudkms.cryptoKeyDecrypter` role

## References

- [BigQuery Partitioning Guide](https://cloud.google.com/bigquery/docs/partitioned-tables)
- [BigQuery Clustering Guide](https://cloud.google.com/bigquery/docs/clustered-tables)
- [BigQuery Column-Level Security](https://cloud.google.com/bigquery/docs/column-level-security)
- [Cloud KMS Encryption](https://cloud.google.com/kms/docs/encrypt-decrypt)
- [BigQuery Best Practices](https://cloud.google.com/bigquery/docs/best-practices)

## Support

For schema questions or issues:
- Slack: #data-engineering
- Email: data-team@cloudact.ai
- Documentation: https://docs.cloudact.ai/bigquery-schemas
