# Test Configuration Files

This directory contains JSON configuration files for parameterized testing. All test execution MUST use these configurations instead of hardcoded values.

## Directory Structure

```
tests/configs/
├── tenants/              # Tenant-related test configurations
│   ├── tenant_test_config.json
│   ├── tenant_bootstrap_config.json
│   └── tenant_dryrun_config.json
├── pipelines/            # Pipeline test configurations
│   └── pipeline_test_config.json
├── schemas/              # Schema validation configurations
│   └── schema_validation_config.json
└── README.md            # This file
```

## Configuration Files

### Tenant Configurations

#### `tenants/tenant_test_config.json`
**Purpose**: Parameterized tenant configurations for standard testing

**Usage**:
```bash
pytest tests/test_tenant_operations.py --config=tests/configs/tenants/tenant_test_config.json
```

**Contains**:
- Test tenant definitions (basic, standard, premium tiers)
- Test scenarios (bootstrap, quota validation, subscription updates)
- Test settings (cleanup, parallel execution, timeouts)

#### `tenants/tenant_bootstrap_config.json`
**Purpose**: Configuration for tenant onboarding via pipeline

**Usage**:
```bash
# Via pipeline ONLY (manual execution forbidden)
.github/workflows/tenant-bootstrap.yml --config=tests/configs/tenants/tenant_bootstrap_config.json
```

**Contains**:
- Bootstrap settings (pipeline-only enforcement)
- Tenant initialization parameters
- Dataset and table creation specs
- Validation rules and rollback configuration

#### `tenants/tenant_dryrun_config.json`
**Purpose**: Dry-run simulation without actual resource creation

**Usage**:
```bash
# Via pipeline ONLY
pytest tests/test_dryrun_validation.py --config=tests/configs/tenants/tenant_dryrun_config.json
```

**Contains**:
- Dry-run tenants for simulation
- Validation checks (naming, permissions, quotas)
- Output configuration for reports
- Pipeline integration settings

### Pipeline Configurations

#### `pipelines/pipeline_test_config.json`
**Purpose**: E2E and integration testing for data pipelines

**Usage**:
```bash
pytest tests/test_pipeline_runs.py --config=tests/configs/pipelines/pipeline_test_config.json
```

**Contains**:
- Pipeline definitions and test scenarios
- Expected outputs and validation rules
- Failure scenarios for error handling
- Performance and security checks

### Schema Configurations

#### `schemas/schema_validation_config.json`
**Purpose**: Database schema validation and migration testing

**Usage**:
```bash
pytest tests/test_schema_validation.py --config=tests/configs/schemas/schema_validation_config.json
```

**Contains**:
- Schema definitions and validation rules
- Field constraints and data types
- Migration validation settings
- Recreation tests (Alembic-only, NO dumps)

## Usage Guidelines

### ✅ DO:
- Use JSON config files for ALL parameterized tests
- Add new test cases by updating JSON configs
- Execute tests via pipelines
- Use Alembic for schema changes
- Validate configurations before execution

### ❌ DON'T:
- Hardcode tenant data in test files
- Execute tenant operations manually
- Use database dumps for schema recreation
- Skip pipeline execution for bootstrapping
- Modify configs without validation

## Adding New Test Configurations

1. **Create JSON config**:
   ```bash
   # Example: New tenant test scenario
   vi tests/configs/tenants/tenant_new_scenario.json
   ```

2. **Follow schema structure**:
   ```json
   {
     "description": "Clear description of config purpose",
     "version": "1.0.0",
     "test_data": [...],
     "test_scenarios": [...],
     "validation_rules": {...}
   }
   ```

3. **Update test files to use config**:
   ```python
   import json

   def load_test_config(config_path):
       with open(config_path) as f:
           return json.load(f)

   @pytest.fixture
   def test_config():
       return load_test_config('tests/configs/tenants/tenant_test_config.json')

   def test_tenant_bootstrap(test_config):
       for tenant in test_config['test_tenants']:
           # Use tenant config
           pass
   ```

4. **Document in this README**

## Test Execution Examples

### Run tenant tests with config:
```bash
pytest tests/test_tenant_operations.py \
  --config=tests/configs/tenants/tenant_test_config.json \
  --verbose
```

### Run pipeline tests:
```bash
pytest tests/test_pipeline_runs.py \
  --config=tests/configs/pipelines/pipeline_test_config.json \
  --capture=no
```

### Run schema validation:
```bash
pytest tests/test_schema_validation.py \
  --config=tests/configs/schemas/schema_validation_config.json
```

### Run dry-run validation:
```bash
pytest tests/test_dryrun_validation.py \
  --config=tests/configs/tenants/tenant_dryrun_config.json \
  --dryrun
```

## Integration with CLAUDE.md

These configurations enforce the project mandates defined in `CLAUDE.md`:

- **Pipeline-Only Execution**: Bootstrap configs require pipeline execution
- **Alembic-Only Schema**: Schema configs forbid dump/restore
- **Parameterized Testing**: All configs enable JSON-driven tests
- **Documentation Structure**: Configs stored in proper `/tests/configs/` hierarchy

## Version History

- **v1.0.0** (2025-11-18): Initial parameterized test configuration structure

---

For questions or issues with test configurations, refer to `CLAUDE.md` for project mandates.
