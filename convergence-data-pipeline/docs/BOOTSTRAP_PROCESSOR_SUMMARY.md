# One-Time Bootstrap Processor - Implementation Summary

## Overview

Created a **one-time bootstrap processor** that handles initial system setup for creating the central `tenants` dataset and all tenant management tables. This replaces the custom `setup_bigquery_datasets.py` script with a proper pipeline-based approach.

## Key Principle

✅ **NO CUSTOM SCRIPTS** - Everything uses the pipeline processor framework
- Schema definitions in JSON (not SQL)
- Idempotent execution (safe to run multiple times)
- Force recreation support for schema updates
- Integrated with existing logging and error handling

## What Was Created

### 1. Processor Implementation
**Location**: `src/core/processors/setup/initial/onetime_bootstrap_processor.py`

**Features**:
- Creates central `tenants` dataset
- Creates 8 tenant management tables
- Supports force recreation flags
- Idempotent (safe to run multiple times)
- Proper partitioning and clustering
- Schema validation
- Structured logging

**Class**: `OnetimeBootstrapProcessor`
- `execute()` - Main execution method
- `_ensure_tenants_dataset()` - Dataset creation
- `_ensure_table()` - Table creation with schema
- `_load_table_schema()` - Load schemas from JSON

### 2. Template Configuration
**Location**: `ps_templates/setup/initial/`

```
ps_templates/setup/initial/
├── config.yml              # Processor configuration
├── README.md               # Comprehensive documentation
└── schemas/                # Table schema definitions (JSON)
    ├── tenant_profiles.json
    ├── tenant_api_keys.json
    ├── tenant_subscriptions.json
    ├── tenant_usage_quotas.json
    ├── tenant_cloud_credentials.json
    ├── tenant_pipeline_configs.json
    ├── scheduled_pipeline_runs.json
    └── pipeline_execution_queue.json
```

**Note**: No `__init__.py` files in `ps_templates/` - it contains configs only, not Python code.

### 3. Schema Files (8 Tables)

All schemas use **BigQuery JSON format** (not SQL):

| Table | Partitioning | Clustering | Purpose |
|-------|--------------|-----------|---------|
| `tenant_profiles` | None | None | Tenant account info |
| `tenant_api_keys` | None | None | API authentication |
| `tenant_subscriptions` | None | None | Subscription plans |
| `tenant_usage_quotas` | `usage_date` (daily) | `tenant_id`, `usage_date` | Usage tracking |
| `tenant_cloud_credentials` | None | None | Encrypted credentials |
| `tenant_pipeline_configs` | None | None | Scheduled configs |
| `scheduled_pipeline_runs` | `scheduled_time` (daily) | `tenant_id`, `state`, `config_id` | Scheduled runs |
| `pipeline_execution_queue` | `scheduled_time` (daily) | `state`, `priority`, `tenant_id` | Execution queue |

### 4. Example Pipeline Config
**Location**: `configs/setup/bootstrap_system.yml`

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

### 5. Test Script
**Location**: `tests/test_bootstrap_setup.py`

```bash
# Test normal setup
python tests/test_bootstrap_setup.py

# Test with force recreation
python tests/test_bootstrap_setup.py --force-tables

# Complete reset (DANGER!)
python tests/test_bootstrap_setup.py --force-all
```

## Directory Structure Created

```
convergence-data-pipeline/
├── src/core/processors/
│   └── setup/
│       ├── __init__.py
│       └── initial/
│           ├── __init__.py
│           └── onetime_bootstrap_processor.py
│
├── ps_templates/
│   └── setup/
│       └── initial/
│           ├── config.yml
│           ├── README.md
│           └── schemas/
│               ├── tenant_profiles.json
│               ├── tenant_api_keys.json
│               ├── tenant_subscriptions.json
│               ├── tenant_usage_quotas.json
│               ├── tenant_cloud_credentials.json
│               ├── tenant_pipeline_configs.json
│               ├── scheduled_pipeline_runs.json
│               └── pipeline_execution_queue.json
│
├── configs/
│   └── setup/
│       └── bootstrap_system.yml
│
└── tests/
    └── test_bootstrap_setup.py
```

## Usage Instructions

### First-Time Setup

```bash
# Option 1: Run via test script
python tests/test_bootstrap_setup.py

# Option 2: Run via pipeline executor (when integrated)
python -m src.core.pipeline.executor \
  --pipeline configs/setup/bootstrap_system.yml \
  --tenant-id system
```

### Schema Updates

When you need to update table schemas:

```bash
# This will DELETE and recreate tables (backup data first!)
python tests/test_bootstrap_setup.py --force-tables
```

### Complete Reset (Development Only!)

```bash
# This DELETES the entire tenants dataset
python tests/test_bootstrap_setup.py --force-all
```

## Key Features

### 1. **Idempotent Execution**
- Can run multiple times safely
- Skips existing tables/datasets
- Only creates what's missing

### 2. **Force Recreation Support**
- `force_recreate_dataset`: Delete and recreate entire dataset
- `force_recreate_tables`: Delete and recreate all tables
- Useful for schema updates during development

### 3. **Schema Versioning**
- All schemas in JSON files (no SQL scripts)
- Easy to version control
- Declarative approach

### 4. **Proper Optimization**
- Automatic partitioning for time-series tables
- Clustering for query performance
- Follows BigQuery best practices

### 5. **Integration with Pipeline Framework**
- Uses standard processor interface
- `get_engine()` factory function
- Async `execute()` method
- Structured logging

## Differences from Old Approach

### Before (setup_bigquery_datasets.py)
❌ Custom Python script
❌ SQL in Python strings
❌ Not integrated with pipeline framework
❌ No force recreation support
❌ No schema versioning

### After (Bootstrap Processor)
✅ Pipeline processor (standard pattern)
✅ JSON schema files (declarative)
✅ Fully integrated with framework
✅ Force recreation support
✅ Schema versioning
✅ Idempotent execution
✅ Proper error handling
✅ Structured logging

## Instructions for Schema Changes

### Adding a New Table

1. Create schema file:
```bash
# Create schema file
touch ps_templates/setup/initial/schemas/new_table.json
```

2. Define schema in JSON format:
```json
[
  {
    "name": "field_name",
    "type": "STRING",
    "mode": "REQUIRED",
    "description": "Field description"
  }
]
```

3. Add table to `config.yml`:
```yaml
tables:
  - tenant_profiles
  - new_table  # Add here
```

4. Run bootstrap (will only create new table):
```bash
python tests/test_bootstrap_setup.py
```

### Updating Existing Table Schema

1. Modify the schema JSON file
2. **Backup production data!**
3. Run with force recreation:
```bash
python tests/test_bootstrap_setup.py --force-tables
```

## Notes

### Why Not Use Alembic?

The user mentioned using Alembic for migrations. This processor is for **initial setup only**:
- Alembic is for **schema migrations** (evolving schemas over time)
- Bootstrap processor is for **initial creation** (one-time setup)

For ongoing schema changes, you should:
1. Use Alembic for schema migrations
2. Version your schemas in git
3. Apply migrations incrementally

### Production Deployment

1. **Initial Setup**: Run once with default settings
2. **Never Use** `force_recreate_dataset: true` in production (deletes all data!)
3. **Schema Changes**: Test in dev first, backup data, then use `force_recreate_tables: true`
4. **Better Approach**: Use Alembic for production schema migrations

## Related Files

- **Old Script**: `setup_bigquery_datasets.py` (can now be deprecated)
- **Processor**: `src/core/processors/setup/initial/onetime_bootstrap_processor.py`
- **Template**: `ps_templates/setup/initial/config.yml`
- **Schemas**: `ps_templates/setup/initial/schemas/*.json`
- **Test**: `tests/test_bootstrap_setup.py`
- **Docs**: `ps_templates/setup/initial/README.md`

## Migration Path

If you were using `setup_bigquery_datasets.py`:

1. **Backup existing data** (if any)
2. Run bootstrap processor: `python tests/test_bootstrap_setup.py`
3. Verify all tables created
4. Deprecate old script
5. Use this processor for future setups

## Future Enhancements

Possible improvements:
- [ ] Add data validation after creation
- [ ] Add health checks for tables
- [ ] Add rollback support
- [ ] Integration with Alembic for migrations
- [ ] Add dry-run mode
- [ ] Add table count validation

## Success Criteria

✅ Central `tenants` dataset created
✅ All 8 tables created with correct schemas
✅ Proper partitioning on time-series tables
✅ Clustering fields configured
✅ Idempotent execution (safe reruns)
✅ Force recreation support
✅ No custom SQL scripts
✅ Schema versioning in JSON
✅ Comprehensive documentation
✅ Test script provided
