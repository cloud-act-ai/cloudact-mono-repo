# One-Time Bootstrap Processor

## Overview

The **One-Time Bootstrap Processor** creates the central system infrastructure required for multi-tenant operation. This processor should be run **ONCE** during initial system setup.

## What It Creates

### Central Dataset
- **Dataset**: `tenants`
- **Location**: US (configurable)
- **Purpose**: Stores all tenant management, authentication, and scheduling data

### Tables Created

1. **tenant_profiles**
   - Tenant account information
   - Company details and status
   - No partitioning

2. **tenant_api_keys**
   - API key authentication
   - Scopes and permissions
   - No partitioning

3. **tenant_subscriptions**
   - Subscription plans and limits
   - Trial and billing dates
   - No partitioning

4. **tenant_usage_quotas**
   - Daily/monthly usage tracking
   - Concurrent execution limits
   - **Partitioned by**: `usage_date` (daily)
   - **Clustered by**: `tenant_id`, `usage_date`

5. **tenant_cloud_credentials**
   - Encrypted cloud provider credentials
   - Multi-cloud support
   - No partitioning

6. **tenant_pipeline_configs**
   - Scheduled pipeline configurations
   - Cron schedules and parameters
   - No partitioning

7. **scheduled_pipeline_runs**
   - Individual scheduled run records
   - Run state and retry logic
   - **Partitioned by**: `scheduled_time` (daily)
   - **Clustered by**: `tenant_id`, `state`, `config_id`

8. **pipeline_execution_queue**
   - Active execution queue
   - Priority-based scheduling
   - **Partitioned by**: `scheduled_time` (daily)
   - **Clustered by**: `state`, `priority`, `tenant_id`

## Directory Structure

```
ps_templates/setup/initial/
├── config.yml                              # Processor configuration
├── README.md                               # This file
└── schemas/                                # Table schema definitions
    ├── tenant_profiles.json
    ├── tenant_api_keys.json
    ├── tenant_subscriptions.json
    ├── tenant_usage_quotas.json
    ├── tenant_cloud_credentials.json
    ├── tenant_pipeline_configs.json
    ├── scheduled_pipeline_runs.json
    └── pipeline_execution_queue.json
```

## Usage

### 1. First-Time Setup

Run the bootstrap pipeline to create all infrastructure:

```bash
# Run bootstrap pipeline
python -m src.core.pipeline.executor \
  --pipeline configs/setup/bootstrap_system.yml \
  --tenant-id system
```

### 2. Schema Updates

If you need to update table schemas (add fields, change partitioning, etc.):

```yaml
# In your pipeline config or as runtime parameter
variables:
  force_recreate_dataset: false  # Keep dataset
  force_recreate_tables: true    # Recreate tables with new schema
```

**WARNING**: `force_recreate_tables: true` will **DELETE all data** in the tables!

### 3. Complete System Reset (DANGER!)

Only use in development/testing environments:

```yaml
variables:
  force_recreate_dataset: true   # Delete entire dataset
  force_recreate_tables: true    # Recreate all tables
```

## Pipeline Configuration

Create a pipeline YAML file referencing this processor:

```yaml
pipeline:
  id: "system_bootstrap"
  name: "One-Time System Bootstrap"

steps:
  - step_id: "bootstrap_setup"
    name: "Bootstrap System Infrastructure"
    ps_type: "setup.initial.onetime_bootstrap"
    config:
      force_recreate_dataset: false
      force_recreate_tables: false
```

## Features

### Idempotent Execution
- Safe to run multiple times
- Skips existing tables/datasets
- Only creates what's missing

### Force Recreation
- `force_recreate_dataset`: Deletes and recreates entire dataset
- `force_recreate_tables`: Deletes and recreates all tables
- **Use with extreme caution in production!**

### Schema Versioning
- All schemas defined in JSON files
- Easy to version control
- No SQL scripts - declarative approach

### Proper Optimization
- Automatic partitioning for time-series tables
- Clustering fields for query performance
- Follows BigQuery best practices

## Schema Management

### Adding a New Table

1. Create schema file in `ps_templates/setup/initial/schemas/`:
```json
// new_table.json
[
  {
    "name": "field_name",
    "type": "STRING",
    "mode": "REQUIRED",
    "description": "Field description"
  }
]
```

2. Add table name to `config.yml`:
```yaml
tables:
  - existing_table
  - new_table  # Add here
```

3. Run bootstrap with `force_recreate_tables: false` (only creates missing tables)

### Updating a Table Schema

1. Modify the schema JSON file
2. Run bootstrap with `force_recreate_tables: true`
3. **Backup data before running!**

## Best Practices

### Production Deployment

1. **Initial Setup**:
   - Run once with default settings
   - Verify all tables created successfully
   - Check partitioning and clustering

2. **Schema Changes**:
   - Test in development first
   - Backup production data
   - Use `force_recreate_tables: true` carefully
   - Consider data migration if needed

3. **Never Use**:
   - `force_recreate_dataset: true` in production
   - This deletes ALL tenant data!

### Development/Testing

- Use force flags freely for quick resets
- Keep test data separate
- Validate schema changes before production

## Error Handling

The processor will:
- Log all operations with structured logging
- Fail fast on schema loading errors
- Skip existing resources (unless force flags set)
- Return detailed status in result

## Monitoring

Check logs for:
- Dataset creation status
- Table creation progress
- Schema loading success
- Partitioning/clustering setup

## Related Files

- **Processor**: `src/core/processors/setup/initial/onetime_bootstrap_processor.py`
- **Config**: `ps_templates/setup/initial/config.yml`
- **Example Pipeline**: `configs/setup/bootstrap_system.yml`
- **Old Script**: `setup_bigquery_datasets.py` (deprecated, use processor instead)

## Migration from Old Script

Previously, `setup_bigquery_datasets.py` was used. This processor replaces it with:
- ✅ Better integration with pipeline framework
- ✅ Schema versioning
- ✅ Idempotent execution
- ✅ Force recreation support
- ✅ Structured logging
- ✅ No custom SQL scripts

## Support

For questions or issues:
1. Check processor source code
2. Review schema JSON files
3. Check logs in BigQuery
4. Contact: data-ops@company.com
