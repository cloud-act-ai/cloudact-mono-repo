# Migration Guide: Old to New Customer Architecture

## Overview

This guide walks you through migrating from the old tenant-based architecture to the new customer-centric architecture with centralized customer management.

**Migration Timeline**: 2-4 hours (depending on number of tenants)

**Downtime Required**: Minimal (read-only mode during migration)

---

## What's Changing?

### Old Architecture
```
Per-Tenant Datasets Only:
{tenant_id}/
├── x_meta_api_keys        (API keys per tenant)
├── x_meta_cloud_credentials
├── x_meta_pipeline_runs
└── ...
```

### New Architecture
```
Centralized Customers Dataset:
customers_metadata/
├── customers              (Central customer records)
├── customer_subscriptions
├── customer_api_keys      (Centralized API key management)
├── customer_credentials
├── customer_usage
├── customer_audit_logs
└── customer_invitations

Per-Tenant Datasets (unchanged):
{tenant_id}/
├── x_meta_api_keys        (Legacy - kept for backward compatibility)
├── x_meta_pipeline_runs
└── ...
```

**Key Changes**:
1. **Centralized Customer Management** - All customer metadata in `customers_metadata` dataset
2. **Subscription Plans** - New subscription tiers with quota enforcement
3. **API Key Management** - API keys now managed centrally with KMS encryption
4. **Usage Tracking** - Real-time usage tracking in `customer_usage` table

---

## Prerequisites

Before starting migration:

1. **Backup Current Data**:
   ```bash
   # Export all tenant datasets
   for TENANT in $(bq ls --project_id=gac-prod-471220 --format=json | jq -r '.[].id'); do
     bq extract --destination_format=NEWLINE_DELIMITED_JSON \
       "${TENANT}.x_meta_api_keys" \
       "gs://backup-bucket/migration-backup/${TENANT}/api_keys-*.json"
   done
   ```

2. **Create Customers Metadata Dataset**:
   ```bash
   bq mk --dataset \
     --location=US \
     --description="Centralized customer management dataset" \
     gac-prod-471220:customers_metadata
   ```

3. **Install Required Tools**:
   ```bash
   pip install google-cloud-bigquery google-cloud-kms pandas
   ```

---

## Migration Steps

### Step 1: Create Central Customer Tables

Create the 7 customer management tables in the `customers_metadata` dataset.

**Run Migration Script**:
```bash
python scripts/migration/create_customer_tables.py
```

**Or manually create each table**:

```sql
-- 1. customers table
CREATE TABLE customers_metadata.customers (
  customer_id STRING NOT NULL,
  tenant_id STRING NOT NULL,
  company_name STRING NOT NULL,
  contact_email STRING,
  subscription_plan STRING NOT NULL DEFAULT 'starter',
  status STRING NOT NULL DEFAULT 'active',
  dataset_id STRING NOT NULL,
  created_at TIMESTAMP NOT NULL,
  updated_at TIMESTAMP NOT NULL,
  metadata JSON
)
PARTITION BY DATE(created_at)
CLUSTER BY subscription_plan, status;

-- 2. customer_subscriptions table
CREATE TABLE customers_metadata.customer_subscriptions (
  subscription_id STRING NOT NULL,
  customer_id STRING NOT NULL,
  plan_name STRING NOT NULL,
  monthly_pipeline_quota INT64,
  concurrent_pipeline_quota INT64,
  storage_quota_gb INT64,
  monthly_cost_usd NUMERIC(10,2),
  billing_cycle_start DATE NOT NULL,
  billing_cycle_end DATE,
  auto_renew BOOL NOT NULL DEFAULT TRUE,
  stripe_subscription_id STRING,
  stripe_customer_id STRING,
  created_at TIMESTAMP NOT NULL,
  updated_at TIMESTAMP NOT NULL
)
PARTITION BY DATE(billing_cycle_start)
CLUSTER BY customer_id, plan_name;

-- 3. customer_api_keys table
CREATE TABLE customers_metadata.customer_api_keys (
  api_key_id STRING NOT NULL,
  customer_id STRING NOT NULL,
  tenant_id STRING NOT NULL,
  api_key_hash STRING NOT NULL,
  encrypted_api_key BYTES NOT NULL,
  key_name STRING,
  scopes ARRAY<STRING>,
  is_active BOOL NOT NULL DEFAULT TRUE,
  expires_at TIMESTAMP,
  last_used_at TIMESTAMP,
  created_at TIMESTAMP NOT NULL,
  created_by STRING,
  revoked_at TIMESTAMP,
  revoked_by STRING
)
PARTITION BY DATE(created_at)
CLUSTER BY customer_id, is_active;

-- 4. customer_credentials table
CREATE TABLE customers_metadata.customer_credentials (
  credential_id STRING NOT NULL,
  customer_id STRING NOT NULL,
  tenant_id STRING NOT NULL,
  provider STRING NOT NULL,
  credential_type STRING NOT NULL,
  encrypted_credentials BYTES NOT NULL,
  credential_name STRING,
  scopes ARRAY<STRING>,
  is_active BOOL NOT NULL DEFAULT TRUE,
  expires_at TIMESTAMP,
  last_validated_at TIMESTAMP,
  created_at TIMESTAMP NOT NULL,
  updated_at TIMESTAMP NOT NULL,
  metadata JSON
)
PARTITION BY DATE(created_at)
CLUSTER BY customer_id, provider;

-- 5. customer_usage table
CREATE TABLE customers_metadata.customer_usage (
  usage_id STRING NOT NULL,
  customer_id STRING NOT NULL,
  tenant_id STRING NOT NULL,
  usage_month DATE NOT NULL,
  pipelines_run_count INT64 NOT NULL DEFAULT 0,
  pipelines_running_count INT64 NOT NULL DEFAULT 0,
  storage_used_gb NUMERIC(15,2) NOT NULL DEFAULT 0,
  compute_hours NUMERIC(15,2) NOT NULL DEFAULT 0,
  api_requests_count INT64 NOT NULL DEFAULT 0,
  last_pipeline_run_at TIMESTAMP,
  quota_reset_at TIMESTAMP NOT NULL,
  created_at TIMESTAMP NOT NULL,
  updated_at TIMESTAMP NOT NULL
)
PARTITION BY usage_month
CLUSTER BY customer_id, usage_month;

-- 6. customer_audit_logs table
CREATE TABLE customers_metadata.customer_audit_logs (
  log_id STRING NOT NULL,
  customer_id STRING NOT NULL,
  tenant_id STRING NOT NULL,
  event_type STRING NOT NULL,
  event_category STRING NOT NULL,
  actor_type STRING NOT NULL,
  actor_id STRING,
  resource_type STRING,
  resource_id STRING,
  action STRING NOT NULL,
  result STRING NOT NULL,
  ip_address STRING,
  user_agent STRING,
  metadata JSON,
  created_at TIMESTAMP NOT NULL
)
PARTITION BY DATE(created_at)
CLUSTER BY customer_id, event_type, created_at;

-- 7. customer_invitations table
CREATE TABLE customers_metadata.customer_invitations (
  invitation_id STRING NOT NULL,
  customer_id STRING NOT NULL,
  tenant_id STRING NOT NULL,
  invited_email STRING NOT NULL,
  invited_by STRING NOT NULL,
  role STRING NOT NULL,
  status STRING NOT NULL DEFAULT 'pending',
  invitation_token STRING NOT NULL,
  expires_at TIMESTAMP NOT NULL,
  accepted_at TIMESTAMP,
  revoked_at TIMESTAMP,
  created_at TIMESTAMP NOT NULL,
  metadata JSON
)
PARTITION BY DATE(created_at)
CLUSTER BY customer_id, status;
```

---

### Step 2: Migrate Existing Tenant Data

Migrate data from per-tenant datasets to the central `customers_metadata` dataset.

**Migration Script** (`scripts/migration/migrate_tenants.py`):

```python
#!/usr/bin/env python3
"""
Migrate existing tenants to new customer-centric architecture
"""
from google.cloud import bigquery
import hashlib
import uuid
from datetime import datetime, timezone

# Initialize BigQuery client
client = bigquery.Client(project="gac-prod-471220")

# Default subscription plan for existing customers
DEFAULT_PLAN = "professional"
PLAN_QUOTAS = {
    "starter": {"monthly": 1000, "concurrent": 5, "storage_gb": 100},
    "professional": {"monthly": 5000, "concurrent": 15, "storage_gb": 500},
    "enterprise": {"monthly": None, "concurrent": None, "storage_gb": None}
}

def get_all_tenants():
    """Get list of all existing tenant datasets"""
    query = """
    SELECT schema_name as tenant_id
    FROM `gac-prod-471220.INFORMATION_SCHEMA.SCHEMATA`
    WHERE schema_name NOT IN ('customers_metadata', 'INFORMATION_SCHEMA', '__TABLES__')
    ORDER BY schema_name
    """
    return [row.tenant_id for row in client.query(query).result()]

def migrate_tenant(tenant_id: str):
    """Migrate a single tenant to new architecture"""
    print(f"\n{'='*60}")
    print(f"Migrating tenant: {tenant_id}")
    print(f"{'='*60}")

    customer_id = f"cust_{uuid.uuid4().hex[:12]}"
    now = datetime.now(timezone.utc)

    # Step 1: Create customer record
    print("1. Creating customer record...")
    customer_insert = f"""
    INSERT INTO `gac-prod-471220.customers_metadata.customers`
    (customer_id, tenant_id, company_name, subscription_plan, status, dataset_id, created_at, updated_at)
    VALUES
    (@customer_id, @tenant_id, @company_name, @subscription_plan, 'active', @tenant_id, @created_at, @updated_at)
    """

    job_config = bigquery.QueryJobConfig(
        query_parameters=[
            bigquery.ScalarQueryParameter("customer_id", "STRING", customer_id),
            bigquery.ScalarQueryParameter("tenant_id", "STRING", tenant_id),
            bigquery.ScalarQueryParameter("company_name", "STRING", f"{tenant_id} Corporation"),
            bigquery.ScalarQueryParameter("subscription_plan", "STRING", DEFAULT_PLAN),
            bigquery.ScalarQueryParameter("created_at", "TIMESTAMP", now),
            bigquery.ScalarQueryParameter("updated_at", "TIMESTAMP", now),
        ]
    )
    client.query(customer_insert, job_config=job_config).result()
    print(f"   ✓ Created customer: {customer_id}")

    # Step 2: Create subscription
    print("2. Creating subscription...")
    subscription_id = f"sub_{uuid.uuid4().hex[:12]}"
    quotas = PLAN_QUOTAS[DEFAULT_PLAN]

    subscription_insert = f"""
    INSERT INTO `gac-prod-471220.customers_metadata.customer_subscriptions`
    (subscription_id, customer_id, plan_name, monthly_pipeline_quota, concurrent_pipeline_quota,
     storage_quota_gb, billing_cycle_start, auto_renew, created_at, updated_at)
    VALUES
    (@subscription_id, @customer_id, @plan_name, @monthly_quota, @concurrent_quota,
     @storage_quota, @billing_start, TRUE, @created_at, @updated_at)
    """

    job_config = bigquery.QueryJobConfig(
        query_parameters=[
            bigquery.ScalarQueryParameter("subscription_id", "STRING", subscription_id),
            bigquery.ScalarQueryParameter("customer_id", "STRING", customer_id),
            bigquery.ScalarQueryParameter("plan_name", "STRING", DEFAULT_PLAN),
            bigquery.ScalarQueryParameter("monthly_quota", "INT64", quotas["monthly"]),
            bigquery.ScalarQueryParameter("concurrent_quota", "INT64", quotas["concurrent"]),
            bigquery.ScalarQueryParameter("storage_quota", "INT64", quotas["storage_gb"]),
            bigquery.ScalarQueryParameter("billing_start", "DATE", now.date()),
            bigquery.ScalarQueryParameter("created_at", "TIMESTAMP", now),
            bigquery.ScalarQueryParameter("updated_at", "TIMESTAMP", now),
        ]
    )
    client.query(subscription_insert, job_config=job_config).result()
    print(f"   ✓ Created subscription: {subscription_id}")

    # Step 3: Migrate API keys from tenant dataset
    print("3. Migrating API keys...")
    try:
        api_keys_query = f"""
        SELECT
          api_key_id,
          tenant_id,
          api_key_hash,
          encrypted_api_key,
          created_at,
          expires_at,
          is_active
        FROM `gac-prod-471220.{tenant_id}.x_meta_api_keys`
        WHERE is_active = TRUE
        """

        api_keys = client.query(api_keys_query).result()
        migrated_keys = 0

        for key in api_keys:
            key_insert = f"""
            INSERT INTO `gac-prod-471220.customers_metadata.customer_api_keys`
            (api_key_id, customer_id, tenant_id, api_key_hash, encrypted_api_key,
             is_active, expires_at, created_at)
            VALUES
            (@api_key_id, @customer_id, @tenant_id, @api_key_hash, @encrypted_api_key,
             @is_active, @expires_at, @created_at)
            """

            job_config = bigquery.QueryJobConfig(
                query_parameters=[
                    bigquery.ScalarQueryParameter("api_key_id", "STRING", key.api_key_id or f"key_{uuid.uuid4().hex[:12]}"),
                    bigquery.ScalarQueryParameter("customer_id", "STRING", customer_id),
                    bigquery.ScalarQueryParameter("tenant_id", "STRING", tenant_id),
                    bigquery.ScalarQueryParameter("api_key_hash", "STRING", key.api_key_hash),
                    bigquery.ScalarQueryParameter("encrypted_api_key", "BYTES", key.encrypted_api_key),
                    bigquery.ScalarQueryParameter("is_active", "BOOL", key.is_active),
                    bigquery.ScalarQueryParameter("expires_at", "TIMESTAMP", key.expires_at),
                    bigquery.ScalarQueryParameter("created_at", "TIMESTAMP", key.created_at or now),
                ]
            )
            client.query(key_insert, job_config=job_config).result()
            migrated_keys += 1

        print(f"   ✓ Migrated {migrated_keys} API key(s)")

    except Exception as e:
        print(f"   ⚠ No API keys found or migration failed: {e}")

    # Step 4: Migrate cloud credentials
    print("4. Migrating cloud credentials...")
    try:
        credentials_query = f"""
        SELECT
          credential_id,
          tenant_id,
          provider,
          credential_type,
          encrypted_credentials,
          credential_name,
          is_active,
          created_at
        FROM `gac-prod-471220.{tenant_id}.x_meta_cloud_credentials`
        WHERE is_active = TRUE
        """

        credentials = client.query(credentials_query).result()
        migrated_creds = 0

        for cred in credentials:
            cred_insert = f"""
            INSERT INTO `gac-prod-471220.customers_metadata.customer_credentials`
            (credential_id, customer_id, tenant_id, provider, credential_type,
             encrypted_credentials, credential_name, is_active, created_at, updated_at)
            VALUES
            (@credential_id, @customer_id, @tenant_id, @provider, @credential_type,
             @encrypted_credentials, @credential_name, @is_active, @created_at, @updated_at)
            """

            job_config = bigquery.QueryJobConfig(
                query_parameters=[
                    bigquery.ScalarQueryParameter("credential_id", "STRING", cred.credential_id or f"cred_{uuid.uuid4().hex[:12]}"),
                    bigquery.ScalarQueryParameter("customer_id", "STRING", customer_id),
                    bigquery.ScalarQueryParameter("tenant_id", "STRING", tenant_id),
                    bigquery.ScalarQueryParameter("provider", "STRING", cred.provider),
                    bigquery.ScalarQueryParameter("credential_type", "STRING", cred.credential_type),
                    bigquery.ScalarQueryParameter("encrypted_credentials", "BYTES", cred.encrypted_credentials),
                    bigquery.ScalarQueryParameter("credential_name", "STRING", cred.credential_name or f"{cred.provider} Credential"),
                    bigquery.ScalarQueryParameter("is_active", "BOOL", cred.is_active),
                    bigquery.ScalarQueryParameter("created_at", "TIMESTAMP", cred.created_at or now),
                    bigquery.ScalarQueryParameter("updated_at", "TIMESTAMP", now),
                ]
            )
            client.query(cred_insert, job_config=job_config).result()
            migrated_creds += 1

        print(f"   ✓ Migrated {migrated_creds} credential(s)")

    except Exception as e:
        print(f"   ⚠ No credentials found or migration failed: {e}")

    # Step 5: Create initial usage record
    print("5. Creating usage record...")
    usage_id = f"usage_{uuid.uuid4().hex[:12]}"
    current_month = now.replace(day=1, hour=0, minute=0, second=0, microsecond=0)

    # Calculate current usage from pipeline_runs
    try:
        usage_query = f"""
        SELECT
          COUNT(*) as pipelines_run,
          COUNTIF(status IN ('PENDING', 'RUNNING')) as pipelines_running,
          MAX(start_time) as last_run
        FROM `gac-prod-471220.{tenant_id}.x_meta_pipeline_runs`
        WHERE DATE(start_time) >= DATE_TRUNC(CURRENT_DATE(), MONTH)
        """
        usage_data = list(client.query(usage_query).result())[0]

        pipelines_run = usage_data.pipelines_run or 0
        pipelines_running = usage_data.pipelines_running or 0
        last_run = usage_data.last_run

    except Exception as e:
        print(f"   ⚠ Could not calculate usage: {e}")
        pipelines_run = 0
        pipelines_running = 0
        last_run = None

    usage_insert = f"""
    INSERT INTO `gac-prod-471220.customers_metadata.customer_usage`
    (usage_id, customer_id, tenant_id, usage_month, pipelines_run_count, pipelines_running_count,
     last_pipeline_run_at, quota_reset_at, created_at, updated_at)
    VALUES
    (@usage_id, @customer_id, @tenant_id, @usage_month, @pipelines_run, @pipelines_running,
     @last_run, @quota_reset, @created_at, @updated_at)
    """

    next_month = (current_month.replace(day=28) + timedelta(days=4)).replace(day=1)

    job_config = bigquery.QueryJobConfig(
        query_parameters=[
            bigquery.ScalarQueryParameter("usage_id", "STRING", usage_id),
            bigquery.ScalarQueryParameter("customer_id", "STRING", customer_id),
            bigquery.ScalarQueryParameter("tenant_id", "STRING", tenant_id),
            bigquery.ScalarQueryParameter("usage_month", "DATE", current_month.date()),
            bigquery.ScalarQueryParameter("pipelines_run", "INT64", pipelines_run),
            bigquery.ScalarQueryParameter("pipelines_running", "INT64", pipelines_running),
            bigquery.ScalarQueryParameter("last_run", "TIMESTAMP", last_run),
            bigquery.ScalarQueryParameter("quota_reset", "TIMESTAMP", next_month),
            bigquery.ScalarQueryParameter("created_at", "TIMESTAMP", now),
            bigquery.ScalarQueryParameter("updated_at", "TIMESTAMP", now),
        ]
    )
    client.query(usage_insert, job_config=job_config).result()
    print(f"   ✓ Created usage record with {pipelines_run} pipelines this month")

    # Step 6: Create audit log entry
    print("6. Creating audit log...")
    log_id = f"log_{uuid.uuid4().hex[:12]}"
    audit_insert = f"""
    INSERT INTO `gac-prod-471220.customers_metadata.customer_audit_logs`
    (log_id, customer_id, tenant_id, event_type, event_category, actor_type, action, result, created_at)
    VALUES
    (@log_id, @customer_id, @tenant_id, 'customer.migrated', 'admin', 'system', 'migrate', 'success', @created_at)
    """

    job_config = bigquery.QueryJobConfig(
        query_parameters=[
            bigquery.ScalarQueryParameter("log_id", "STRING", log_id),
            bigquery.ScalarQueryParameter("customer_id", "STRING", customer_id),
            bigquery.ScalarQueryParameter("tenant_id", "STRING", tenant_id),
            bigquery.ScalarQueryParameter("created_at", "TIMESTAMP", now),
        ]
    )
    client.query(audit_insert, job_config=job_config).result()
    print(f"   ✓ Created audit log entry")

    print(f"\n✅ Successfully migrated tenant: {tenant_id}")
    print(f"   Customer ID: {customer_id}")
    print(f"   Subscription: {DEFAULT_PLAN}")
    return customer_id

def main():
    """Main migration function"""
    print("=" * 60)
    print("Customer Architecture Migration Script")
    print("=" * 60)

    tenants = get_all_tenants()
    print(f"\nFound {len(tenants)} tenant(s) to migrate:")
    for tenant in tenants:
        print(f"  - {tenant}")

    confirm = input(f"\nProceed with migration? (yes/no): ")
    if confirm.lower() != 'yes':
        print("Migration cancelled.")
        return

    migrated_count = 0
    failed_tenants = []

    for tenant_id in tenants:
        try:
            migrate_tenant(tenant_id)
            migrated_count += 1
        except Exception as e:
            print(f"\n❌ Failed to migrate {tenant_id}: {e}")
            failed_tenants.append(tenant_id)

    print("\n" + "=" * 60)
    print("Migration Summary")
    print("=" * 60)
    print(f"Total tenants: {len(tenants)}")
    print(f"Successfully migrated: {migrated_count}")
    print(f"Failed: {len(failed_tenants)}")

    if failed_tenants:
        print(f"\nFailed tenants:")
        for tenant in failed_tenants:
            print(f"  - {tenant}")

if __name__ == "__main__":
    main()
```

**Run Migration**:
```bash
python scripts/migration/migrate_tenants.py
```

---

### Step 3: Test Migration

Verify that migration was successful for each tenant.

**Verification Script**:
```bash
#!/bin/bash
# verify_migration.sh

TENANT_ID="acmeinc_23xv2"

echo "Verifying migration for tenant: $TENANT_ID"

# 1. Check customer record exists
echo "1. Checking customer record..."
bq query --use_legacy_sql=false \
  "SELECT customer_id, tenant_id, subscription_plan, status
   FROM \`gac-prod-471220.customers_metadata.customers\`
   WHERE tenant_id = '$TENANT_ID'"

# 2. Check subscription exists
echo "2. Checking subscription..."
bq query --use_legacy_sql=false \
  "SELECT s.subscription_id, s.plan_name, s.monthly_pipeline_quota
   FROM \`gac-prod-471220.customers_metadata.customer_subscriptions\` s
   JOIN \`gac-prod-471220.customers_metadata.customers\` c
     ON s.customer_id = c.customer_id
   WHERE c.tenant_id = '$TENANT_ID'"

# 3. Check API keys migrated
echo "3. Checking API keys..."
bq query --use_legacy_sql=false \
  "SELECT api_key_id, is_active, created_at
   FROM \`gac-prod-471220.customers_metadata.customer_api_keys\`
   WHERE tenant_id = '$TENANT_ID'"

# 4. Check usage record exists
echo "4. Checking usage record..."
bq query --use_legacy_sql=false \
  "SELECT usage_id, usage_month, pipelines_run_count, pipelines_running_count
   FROM \`gac-prod-471220.customers_metadata.customer_usage\`
   WHERE tenant_id = '$TENANT_ID'
   ORDER BY usage_month DESC
   LIMIT 1"

echo "✓ Verification complete"
```

---

### Step 4: Update Application Code

Update your application to use the new centralized customer management.

**Code Changes**:

1. **Authentication** - Update to query `customer_api_keys` instead of `{tenant_id}.x_meta_api_keys`:

```python
# OLD CODE
def authenticate_api_key(api_key: str):
    query = f"""
    SELECT tenant_id, is_active
    FROM `{project_id}.{tenant_id}.x_meta_api_keys`
    WHERE api_key_hash = SHA256(@api_key)
    """

# NEW CODE
def authenticate_api_key(api_key: str):
    query = f"""
    SELECT customer_id, tenant_id, is_active
    FROM `{project_id}.customers_metadata.customer_api_keys`
    WHERE api_key_hash = SHA256(@api_key)
      AND is_active = TRUE
      AND (expires_at IS NULL OR expires_at > CURRENT_TIMESTAMP())
    """
```

2. **Quota Enforcement** - Add quota checks before pipeline execution:

```python
# NEW CODE
def check_quotas(customer_id: str):
    query = f"""
    SELECT
      u.pipelines_run_count,
      u.pipelines_running_count,
      u.storage_used_gb,
      s.monthly_pipeline_quota,
      s.concurrent_pipeline_quota,
      s.storage_quota_gb
    FROM `{project_id}.customers_metadata.customer_usage` u
    JOIN `{project_id}.customers_metadata.customer_subscriptions` s
      ON u.customer_id = s.customer_id
    WHERE u.customer_id = @customer_id
      AND u.usage_month = DATE_TRUNC(CURRENT_DATE(), MONTH)
    """

    result = client.query(query, ...).result()
    usage = list(result)[0]

    if usage.monthly_pipeline_quota and usage.pipelines_run_count >= usage.monthly_pipeline_quota:
        raise QuotaExceededError("Monthly pipeline quota exceeded")

    if usage.concurrent_pipeline_quota and usage.pipelines_running_count >= usage.concurrent_pipeline_quota:
        raise QuotaExceededError("Concurrent pipeline limit reached")
```

---

### Step 5: Deploy Updated Application

Deploy the updated application with backward compatibility.

**Deployment Strategy**:
1. Deploy new code with feature flag `USE_CENTRALIZED_CUSTOMERS=false`
2. Run parallel for 1 week (reads from both old and new locations)
3. Enable feature flag `USE_CENTRALIZED_CUSTOMERS=true`
4. Monitor for 1 week
5. Remove old tenant-specific API key tables (optional)

---

## Rollback Plan

If issues arise during migration:

**Rollback Steps**:
1. Disable centralized customer management: `USE_CENTRALIZED_CUSTOMERS=false`
2. Application falls back to old per-tenant tables
3. No data loss - old tables remain intact

**Data Restoration** (if needed):
```bash
# Restore from backup
bq load --source_format=NEWLINE_DELIMITED_JSON \
  gac-prod-471220:acmeinc_23xv2.x_meta_api_keys \
  gs://backup-bucket/migration-backup/acmeinc_23xv2/api_keys-*.json
```

---

## Post-Migration Checklist

After successful migration:

- [ ] All tenants migrated to `customers_metadata.customers`
- [ ] API keys migrated to `customers_metadata.customer_api_keys`
- [ ] Subscriptions created for all customers
- [ ] Usage tracking enabled
- [ ] Application code updated and deployed
- [ ] Feature flag enabled: `USE_CENTRALIZED_CUSTOMERS=true`
- [ ] Monitoring dashboards updated
- [ ] Documentation updated
- [ ] Team trained on new architecture
- [ ] Backup retention policy set (6 months minimum)

---

## Troubleshooting

### Issue: Duplicate Customer IDs

**Symptom**: Error inserting customer record - duplicate customer_id

**Solution**:
```sql
-- Check for duplicates
SELECT customer_id, COUNT(*) as count
FROM customers_metadata.customers
GROUP BY customer_id
HAVING count > 1;

-- Delete duplicates (keep most recent)
DELETE FROM customers_metadata.customers
WHERE customer_id IN (
  SELECT customer_id
  FROM (
    SELECT customer_id, ROW_NUMBER() OVER (PARTITION BY tenant_id ORDER BY created_at DESC) as rn
    FROM customers_metadata.customers
  )
  WHERE rn > 1
);
```

### Issue: API Keys Not Working After Migration

**Symptom**: 401 Unauthorized with valid API key

**Solution**:
1. Check if API key was migrated:
```sql
SELECT * FROM customers_metadata.customer_api_keys
WHERE api_key_hash = SHA256('your_api_key_here');
```

2. Verify application is querying correct table:
```bash
# Check application logs for SQL queries
grep "customer_api_keys" /var/log/app.log
```

3. Ensure feature flag is enabled:
```bash
echo $USE_CENTRALIZED_CUSTOMERS  # Should be "true"
```

### Issue: Usage Counts Incorrect

**Symptom**: Usage counts don't match actual pipeline runs

**Solution**:
```sql
-- Recalculate usage from pipeline_runs
UPDATE customers_metadata.customer_usage u
SET
  pipelines_run_count = (
    SELECT COUNT(*)
    FROM `gac-prod-471220.{tenant_id}.x_meta_pipeline_runs` pr
    WHERE pr.tenant_id = u.tenant_id
      AND DATE(pr.start_time) >= u.usage_month
      AND DATE(pr.start_time) < DATE_ADD(u.usage_month, INTERVAL 1 MONTH)
  ),
  pipelines_running_count = (
    SELECT COUNT(*)
    FROM `gac-prod-471220.{tenant_id}.x_meta_pipeline_runs` pr
    WHERE pr.tenant_id = u.tenant_id
      AND pr.status IN ('PENDING', 'RUNNING')
  ),
  updated_at = CURRENT_TIMESTAMP()
WHERE u.customer_id = 'cust_abc123';
```

---

## FAQ

**Q: Will existing API keys continue to work?**
A: Yes, all existing API keys are migrated and will continue to work without any changes.

**Q: Do we need downtime for migration?**
A: Minimal downtime. The system can operate in read-only mode during migration (15-30 minutes).

**Q: Can we run old and new architecture in parallel?**
A: Yes, feature flags allow running both architectures simultaneously for gradual rollout.

**Q: What happens to old tenant-specific tables?**
A: They remain intact for backward compatibility. You can optionally delete them after 6 months.

**Q: How are subscription plans assigned to existing customers?**
A: By default, existing customers are assigned "professional" plan. You can update later via API.

**Q: Can we customize subscription quotas per customer?**
A: Yes, quotas can be customized in `customer_subscriptions` table or via API.

---

## Related Documentation

- [Customer Management Architecture](../architecture/CUSTOMER_MANAGEMENT.md)
- [API Reference](../api/CUSTOMER_API_REFERENCE.md)
- [Onboarding Guide](ONBOARDING.md)
- [Encryption Guide](../security/ENCRYPTION.md)

---

**Version**: 1.0.0
**Last Updated**: 2025-11-17
**Migration Support**: support@convergence-pipeline.com
