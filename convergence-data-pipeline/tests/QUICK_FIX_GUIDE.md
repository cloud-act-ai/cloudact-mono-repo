# Quick Fix Guide for Test Failures

## Issue #1: Variable Substitution in SQL Queries (6 tests failed)

### Problem
Variables in SQL queries like `{source_billing_table}` are not being replaced, causing BigQuery errors.

### Location
File: `/configs/gcp/cost/cost_billing.yml`

### Current Code (Line 11-12)
```yaml
variables:
  source_billing_table: "gac-prod-471220.cloudact_cost_usage.gcp_billing_export_resource_v1_01ECB7_6EE0BA_7357F1"
  destination_dataset_type: "gcp_silver_cost"
```

### Quick Fix Option 1: Pass as Parameter
Update the test to pass the variable as a parameter:

```python
parameters = {
    "date": yesterday,
    "admin_email": "test@example.com",
    "source_billing_table": "gac-prod-471220.cloudact_cost_usage.gcp_billing_export_resource_v1_01ECB7_6EE0BA_7357F1"
}
```

### Quick Fix Option 2: Update Variable Replacement Logic
Update `/src/core/processors/gcp/bq_etl.py` line 88-91:

```python
# Current
variables = context.copy()
variables.update(step_config.get("variables", {}))

# Replace variables in query
query = source.get("query", "")
query = self._replace_variables(query, variables)
```

Add:
```python
# Also include pipeline-level variables from config
if "variables" in step_config:
    variables.update(step_config.get("variables", {}))

# Also check context for pipeline parameters
if "parameters" in context:
    variables.update(context.get("parameters", {}))
```

---

## Issue #2: Hardcoded Project ID in Example Pipeline (1 test failed)

### Problem
Example pipeline uses `your-project-id` which doesn't exist.

### Location
File: `/configs/examples/pipeline_with_email_notification.yml`

### Current Code (Line 21-23)
```yaml
source:
  bq_project_id: "your-project-id"
  query: |
```

### Quick Fix
Replace with environment variable:

```yaml
source:
  bq_project_id: "{gcp_project_id}"  # Will use GCP_PROJECT_ID from .env
  query: |
```

OR use the actual project ID:

```yaml
source:
  bq_project_id: "gac-prod-471220"
  query: |
```

---

## Issue #3: BigQuery SQL Syntax for DEFAULT (Warning in Test 8)

### Problem
`DEFAULT CURRENT_TIMESTAMP()` syntax not supported in BigQuery CREATE TABLE.

### Location
File: `tests/test_comprehensive_pipeline_scenarios.py`
Function: `_create_metadata_tables()` (Line 686-700)

### Current Code
```python
CREATE TABLE IF NOT EXISTS `{dataset_id}.x_meta_pipeline_runs` (
    pipeline_logging_id STRING NOT NULL,
    tenant_id STRING NOT NULL,
    pipeline_id STRING NOT NULL,
    status STRING NOT NULL,
    started_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP(),  # ❌
    ended_at TIMESTAMP,
```

### Quick Fix
Remove `DEFAULT CURRENT_TIMESTAMP()` from schema:

```python
CREATE TABLE IF NOT EXISTS `{dataset_id}.x_meta_pipeline_runs` (
    pipeline_logging_id STRING NOT NULL,
    tenant_id STRING NOT NULL,
    pipeline_id STRING NOT NULL,
    status STRING NOT NULL,
    started_at TIMESTAMP NOT NULL,  # ✅
    ended_at TIMESTAMP,
```

**Note:** Default values should be set in application code, not in BigQuery schema.

---

## Issue #4: Missing Data Quality Pipeline (1 test skipped)

### Problem
No sample DQ check pipeline exists.

### Location
Expected: `/configs/data_quality/sample_dq_check.yml`

### Quick Fix
Create the file with this content:

```yaml
pipeline_id: "{tenant_id}_sample_dq_check"
description: "Sample data quality check pipeline for testing"

steps:
  - step_id: "validate_test_data"
    name: "Validate Test Data Quality"
    ps_type: "gcp.bq_etl"
    timeout_minutes: 10

    source:
      bq_project_id: "gac-prod-471220"
      query: |
        SELECT
          COUNT(*) as row_count,
          COUNT(DISTINCT id) as unique_ids,
          COUNTIF(name IS NULL) as null_names,
          CURRENT_TIMESTAMP() as check_timestamp
        FROM `gac-prod-471220.{tenant_id}.test_dq_data`

    destination:
      bq_project_id: "gac-prod-471220"
      dataset_type: "{tenant_id}"
      table: "dq_check_results"
      write_mode: "append"
```

---

## Priority Order for Fixes

### 🔴 HIGH PRIORITY (Unblocks 6 tests)
1. **Fix Variable Substitution** (Issue #1)
   - Affects: Tests 1, 5, 6, 9, 10
   - Time: 15 minutes
   - Impact: High

### 🟡 MEDIUM PRIORITY
2. **Fix Example Pipeline Project ID** (Issue #2)
   - Affects: Test 3
   - Time: 2 minutes
   - Impact: Medium

3. **Fix BigQuery SQL Syntax** (Issue #3)
   - Affects: Test 8 (warnings only)
   - Time: 5 minutes
   - Impact: Low

4. **Create Sample DQ Pipeline** (Issue #4)
   - Affects: Test 2
   - Time: 10 minutes
   - Impact: Low

---

## Testing After Fixes

### Step 1: Fix Variable Substitution
```bash
# Test just the cost_billing pipeline
python -c "
from src.core.pipeline.executor import PipelineExecutor
executor = PipelineExecutor('guru_232342', 'cost_billing', 'test', 'fixer')
result = executor.execute(parameters={'date': '2025-11-17', 'admin_email': 'test@example.com'})
print('Success!' if result['status'] == 'COMPLETED' else 'Failed')
"
```

### Step 2: Run Full Test Suite
```bash
python tests/test_comprehensive_pipeline_scenarios.py
```

### Expected Results After All Fixes
- **Passed:** 9/10 tests (90%)
- **Skipped:** 0/10 tests
- **Failed:** 1/10 or 0/10 tests

---

## Detailed Fix for Issue #1 (Recommended Approach)

The best fix is to update the `_replace_variables` method to include pipeline-level variables.

### File: `/src/core/processors/gcp/bq_etl.py`
### Location: Lines 57-64

**Current Code:**
```python
def _replace_variables(self, text: str, variables: Dict[str, Any]) -> str:
    """Replace {variable} placeholders in text"""
    result = text
    for key, value in variables.items():
        placeholder = f"{{{key}}}"
        result = result.replace(placeholder, str(value))
    return result
```

**Updated Code:**
```python
def _replace_variables(self, text: str, variables: Dict[str, Any]) -> str:
    """Replace {variable} placeholders in text"""
    result = text
    for key, value in variables.items():
        placeholder = f"{{{key}}}"
        # Handle None values
        if value is not None:
            result = result.replace(placeholder, str(value))
    return result
```

### File: `/src/core/processors/gcp/bq_etl.py`
### Location: Lines 86-91

**Current Code:**
```python
# Get variables for replacement
variables = context.copy()
variables.update(step_config.get("variables", {}))

# Replace variables in query
query = source.get("query", "")
query = self._replace_variables(query, variables)
```

**Updated Code:**
```python
# Get variables for replacement - merge from multiple sources
variables = {}

# 1. Start with context (contains tenant_id, pipeline_id, etc.)
variables.update(context)

# 2. Add step-level variables
if "variables" in step_config:
    variables.update(step_config.get("variables", {}))

# 3. Add parameters from context (runtime parameters)
if "parameters" in context:
    variables.update(context.get("parameters", {}))

# 4. Add variables from the pipeline config (loaded into context)
# These should already be in context['parameters'], but check explicitly
if hasattr(self, 'pipeline_variables'):
    variables.update(self.pipeline_variables)

# Replace variables in query
query = source.get("query", "")
query = self._replace_variables(query, variables)
```

### Alternative: Pass Pipeline Variables Through Context

**File:** `/src/core/pipeline/executor.py`
**Location:** Line 312-320

**Current Code:**
```python
# Build execution context
context = {
    'tenant_id': self.tenant_id,
    'pipeline_id': self.pipeline_id,
    'pipeline_logging_id': self.pipeline_logging_id,
    'step_logging_id': step_logging_id,
    'step_index': step_index,
    'pipeline_status': self.status,
    'parameters': self.config.get('parameters', {})
}
```

**Updated Code:**
```python
# Build execution context
context = {
    'tenant_id': self.tenant_id,
    'pipeline_id': self.pipeline_id,
    'pipeline_logging_id': self.pipeline_logging_id,
    'step_logging_id': step_logging_id,
    'step_index': step_index,
    'pipeline_status': self.status,
    'parameters': self.config.get('parameters', {}),
    'variables': self.config.get('variables', {})  # ✅ Add pipeline variables
}
```

Then in `bq_etl.py`, use:
```python
variables.update(context.get('variables', {}))
```

---

## Validation Checklist

After applying fixes, verify:

- [ ] All 10 tests run without Python errors
- [ ] At least 8/10 tests pass (excluding expected skips)
- [ ] No BigQuery syntax errors
- [ ] Variables are correctly substituted in SQL queries
- [ ] Pipeline metadata is logged correctly
- [ ] Tenant onboarding completes without warnings
- [ ] Concurrent execution works correctly

---

**Last Updated:** 2025-11-18
**Fix Priority:** High
**Estimated Time to Fix All:** 30-45 minutes
