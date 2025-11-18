# Bootstrap Processor - Quick Start Guide

## What Was Created

✅ **One-Time Bootstrap Processor** that replaces custom scripts with pipeline-based infrastructure setup

## Key Files Created

```
📁 src/core/processors/setup/initial/
   └── onetime_bootstrap_processor.py  ← Main processor code

📁 ps_templates/setup/initial/
   ├── config.yml                      ← Processor config
   ├── README.md                       ← Full documentation
   └── schemas/                        ← 8 table schemas (JSON)
       ├── tenant_profiles.json
       ├── tenant_api_keys.json
       ├── tenant_subscriptions.json
       ├── tenant_usage_quotas.json
       ├── tenant_cloud_credentials.json
       ├── tenant_pipeline_configs.json
       ├── scheduled_pipeline_runs.json
       └── pipeline_execution_queue.json

📁 configs/setup/
   └── bootstrap_system.yml            ← Example pipeline config

📁 tests/
   └── test_bootstrap_setup.py         ← Test script
```

## Quick Start - 3 Steps

### Step 1: Run Initial Setup

```bash
cd convergence-data-pipeline
python tests/test_bootstrap_setup.py
```

This creates:
- Central `tenants` dataset
- 8 tenant management tables with proper schemas
- Partitioning and clustering

### Step 2: Verify Setup

Check BigQuery Console:
- Dataset: `{project_id}.tenants`
- Tables: `tenant_profiles`, `tenant_api_keys`, etc.

### Step 3: Start Using

Now you can:
- Onboard tenants (existing flow works)
- Run pipelines
- Use tenant management features

## What It Creates

| Table | Purpose | Partitioning |
|-------|---------|--------------|
| `tenant_profiles` | Tenant accounts | None |
| `tenant_api_keys` | Authentication | None |
| `tenant_subscriptions` | Plans & limits | None |
| `tenant_usage_quotas` | Usage tracking | Daily (usage_date) |
| `tenant_cloud_credentials` | Encrypted creds | None |
| `tenant_pipeline_configs` | Schedules | None |
| `scheduled_pipeline_runs` | Scheduled runs | Daily (scheduled_time) |
| `pipeline_execution_queue` | Execution queue | Daily (scheduled_time) |

## Common Commands

```bash
# First-time setup
python tests/test_bootstrap_setup.py

# Recreate tables (after schema changes)
python tests/test_bootstrap_setup.py --force-tables

# Complete reset (DANGER - dev only!)
python tests/test_bootstrap_setup.py --force-all
```

## Schema Changes

### Adding a new table:

1. Create JSON schema: `ps_templates/setup/initial/schemas/new_table.json`
2. Add to `config.yml`: `tables: [... , new_table]`
3. Run: `python tests/test_bootstrap_setup.py` (only creates new table)

### Updating existing table:

1. Edit JSON schema file
2. **Backup data first!**
3. Run: `python tests/test_bootstrap_setup.py --force-tables`

## Key Features

✅ **Idempotent** - Safe to run multiple times
✅ **No SQL Scripts** - All schemas in JSON
✅ **Force Recreation** - For schema updates
✅ **Proper Optimization** - Partitioning & clustering
✅ **Pipeline Framework** - Standard processor pattern

## Architecture

### Old Way (Deprecated)
```
setup_bigquery_datasets.py
├── SQL in Python strings
├── Custom script
└── Not integrated
```

### New Way (Current)
```
Bootstrap Processor
├── JSON schemas
├── Pipeline processor
└── Fully integrated
```

## Production Deployment

1. **Initial Setup**: Run once
2. **Never Use**: `--force-all` in production
3. **Schema Updates**: Test in dev → backup → `--force-tables`
4. **Better**: Use Alembic for incremental migrations

## Integration with Existing System

This processor creates the **foundation** for:
- ✅ Tenant onboarding (already works)
- ✅ API authentication
- ✅ Usage quotas
- ✅ Pipeline scheduling
- ✅ Multi-tenancy

No changes needed to existing code - it just ensures the infrastructure exists.

## Troubleshooting

**Import Error?**
```bash
cd convergence-data-pipeline
python -c "from src.core.processors.setup.initial import OnetimeBootstrapProcessor; print('OK')"
```

**Permission Error?**
- Check GCP credentials
- Ensure BigQuery Admin role
- Verify project ID in settings

**Table Already Exists?**
- Normal! Processor is idempotent
- Use `--force-tables` to recreate

## Documentation

- **Full Docs**: `ps_templates/setup/initial/README.md`
- **Summary**: `BOOTSTRAP_PROCESSOR_SUMMARY.md`
- **Processor Code**: `src/core/processors/setup/initial/onetime_bootstrap_processor.py`

## Next Steps

1. ✅ Run initial setup
2. ✅ Verify tables created
3. Test tenant onboarding
4. Set up Alembic for migrations (recommended)
5. Deprecate `setup_bigquery_datasets.py`

## Success Checklist

- [ ] Bootstrap processor runs without errors
- [ ] `tenants` dataset exists in BigQuery
- [ ] All 8 tables created with correct schemas
- [ ] Partitioning configured on time-series tables
- [ ] Can run multiple times (idempotent)
- [ ] Existing tenant onboarding still works

---

**Ready to go!** Run `python tests/test_bootstrap_setup.py` to get started.
