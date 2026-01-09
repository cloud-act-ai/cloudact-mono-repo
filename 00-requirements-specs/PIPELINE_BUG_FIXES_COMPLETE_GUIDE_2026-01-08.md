# Pipeline Service Bug Fixes - Complete Implementation Guide
**Date:** 2026-01-08
**Status:** Phase 2 (14/18 completed) - Continue with remaining 31 issues

## ✅ COMPLETED FIXES (14 issues)

### Schema Enhancements
- **SCH-004**: Added x_data_quality_score to all cloud billing schemas
- **SCH-005**: Added x_created_at to AWS/Azure/OCI billing schemas
- **SCH-006**: Verified Azure CommitmentDiscountType mapping (already fixed)

### Procedure Improvements
- **PRO-004**: Added batch processing performance comment for GCP
- **PRO-006**: Added org authorization security check

### Configuration Updates
- **CFG-003**: Increased subscription pipeline timeout to 15 minutes
- **CFG-005**: Verified GCP provider config exists

### Processor Enhancements
- **PROC-004**: Added DeepSeek to PROVIDER_NAMES mapping

### Security Validations
- **SEC-002**: Verified org_slug validation exists
- **SEC-003**: Implemented org authorization (same as PRO-006)

---

## 🔄 REMAINING FIXES (31 issues)

### PHASE 2 HIGH PRIORITY - REMAINING (4 issues)

#### CFG-004: Add Schema Validation in Pipeline Loader
**File:** Create `src/core/pipeline/validator.py` or add to existing loader
**Implementation:**
```python
from typing import Dict, List
from pydantic import BaseModel, Field, validator

class PipelineStepConfig(BaseModel):
    step_id: str
    ps_type: str
    name: str
    description: str = ""
    timeout_minutes: int = 10

class PipelineConfig(BaseModel):
    pipeline_id: str
    name: str
    provider: str
    domain: str
    version: str
    steps: List[PipelineStepConfig]

    @validator('provider')
    def validate_provider(cls, v):
        valid_providers = ['gcp', 'aws', 'azure', 'oci', 'openai', 'anthropic', 'gemini', 'deepseek', 'subscription']
        if v not in valid_providers:
            raise ValueError(f'provider must be one of {valid_providers}')
        return v

def validate_pipeline_config(config_dict: Dict) -> PipelineConfig:
    """Validate pipeline configuration against schema"""
    try:
        return PipelineConfig(**config_dict)
    except Exception as e:
        raise ValueError(f"Pipeline config validation failed: {e}")
```

**Integration Point:** Call `validate_pipeline_config()` in pipeline loader before execution

---

#### PROC-005: Implement Retry Wrapper in payg_cost.py
**File:** `src/core/processors/genai/payg_cost.py`
**Location:** Add new method after line 82 (after __init__)
**Implementation:**
```python
async def _execute_with_retry(self, query: str, params: Dict = None) -> Any:
    """
    Execute BigQuery query with exponential backoff retry logic.
    Uses BQ_MAX_RETRIES, BQ_INITIAL_BACKOFF_SECONDS, BQ_MAX_BACKOFF_SECONDS, BQ_BACKOFF_MULTIPLIER constants.

    Retries on:
    - Rate limit errors (429)
    - Temporary failures (503)
    - Timeout errors
    """
    import time
    from google.api_core import exceptions as google_exceptions

    last_exception = None
    backoff = BQ_INITIAL_BACKOFF_SECONDS

    for attempt in range(BQ_MAX_RETRIES):
        try:
            result = await self.bq_client.query_async(query, params)
            return result
        except google_exceptions.TooManyRequests as e:
            last_exception = e
            self.logger.warning(f"Rate limit hit (attempt {attempt + 1}/{BQ_MAX_RETRIES}), backing off {backoff}s")
        except google_exceptions.ServiceUnavailable as e:
            last_exception = e
            self.logger.warning(f"Service unavailable (attempt {attempt + 1}/{BQ_MAX_RETRIES}), backing off {backoff}s")
        except google_exceptions.GoogleAPIError as e:
            if 'timeout' in str(e).lower():
                last_exception = e
                self.logger.warning(f"Timeout (attempt {attempt + 1}/{BQ_MAX_RETRIES}), backing off {backoff}s")
            else:
                raise  # Non-retryable error

        if attempt < BQ_MAX_RETRIES - 1:
            time.sleep(backoff)
            backoff = min(backoff * BQ_BACKOFF_MULTIPLIER, BQ_MAX_BACKOFF_SECONDS)

    raise last_exception or Exception("Max retries reached")
```

**Update all query calls:** Replace `self.bq_client.query()` with `await self._execute_with_retry()`

---

#### TEST-001: Create test_hierarchy_validation.py
**File:** Create `tests/test_hierarchy_validation.py`
**Implementation:**
```python
"""
Hierarchy validation tests for pipeline processors
Tests 10-level hierarchy expansion and validation logic
"""
import pytest
from datetime import date


@pytest.mark.asyncio
async def test_payg_cost_invalid_hierarchy_entity():
    """
    Test that PAYG cost processor handles invalid hierarchy entity IDs gracefully
    Expected: Log warning, continue processing with NULL hierarchy fields
    """
    # TODO: Setup test org with invalid hierarchy_entity_id in usage data
    # TODO: Run payg_cost processor
    # TODO: Assert costs calculated with NULL hierarchy
    # TODO: Verify warning logged to org_meta_dq_results
    pass


@pytest.mark.asyncio
async def test_focus_converter_hierarchy_null_handling():
    """
    Test that FOCUS converter properly handles NULL hierarchy fields
    Expected: FOCUS 1.3 records created with NULL x_hierarchy_level_* fields
    """
    # TODO: Setup test data with NULL hierarchy fields
    # TODO: Run genai focus_converter
    # TODO: Assert FOCUS records have NULL hierarchy but valid cost data
    pass


@pytest.mark.asyncio
async def test_cloud_focus_aws_hierarchy_allocation():
    """
    Test that AWS cloud costs properly expand 10-level hierarchy
    Expected: AWS costs allocated to full hierarchy path (L1-L10)
    """
    # TODO: Setup AWS billing data with hierarchy tags
    # TODO: Run sp_cloud_1_convert_to_focus for AWS
    # TODO: Assert x_hierarchy_level_1_id through x_hierarchy_level_10_id populated
    # TODO: Verify hierarchy path matches org_hierarchy table
    pass


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
```

---

### PHASE 3 MEDIUM PRIORITY (18 issues)

#### Schema Fixes

**SCH-007: Add x_cloud_provider to AWS/Azure/OCI schemas**
```json
{
  "name": "x_cloud_provider",
  "type": "STRING",
  "mode": "REQUIRED",
  "description": "Cloud provider identifier (aws, azure, gcp, oci)"
}
```
Add after x_updated_at field in:
- cloud_aws_billing_raw_daily.json
- cloud_azure_billing_raw_daily.json
- cloud_oci_billing_raw_daily.json

**SCH-008: Add x_cloud_account_id to all cloud schemas**
```json
{
  "name": "x_cloud_account_id",
  "type": "STRING",
  "mode": "NULLABLE",
  "description": "Normalized cloud account/subscription ID"
}
```
Add after x_cloud_provider in all 4 cloud billing schemas

**SCH-009: Reorder x_* fields to standard order**
Standard order in ALL schemas:
1. x_pipeline_id (REQUIRED)
2. x_credential_id (REQUIRED)
3. x_pipeline_run_date (REQUIRED)
4. x_run_id (REQUIRED)
5. x_ingested_at (REQUIRED)
6. x_data_quality_score (NULLABLE)
7. x_created_at (NULLABLE)

---

#### Procedure Fixes

**PRO-007: Add lineage parameters to subscription procedure**
File: `configs/system/procedures/subscription/sp_subscription_3_convert_to_focus.sql`
Line: 21-26 (parameter list)

Add parameters:
```sql
CREATE OR REPLACE PROCEDURE `sp_subscription_3_convert_to_focus`(
  p_project_id STRING,
  p_dataset_id STRING,
  p_start_date DATE,
  p_end_date DATE,
  p_credential_id STRING,    -- ADD THIS
  p_pipeline_id STRING,      -- ADD THIS
  p_run_id STRING            -- ADD THIS
)
```

**PRO-008: Implement fiscal year logic**
File: `configs/system/procedures/subscription/sp_subscription_2_calculate_daily_costs.sql`
Lines: 78-88

Add fiscal year calculation:
```sql
-- Fiscal year period calculation
DECLARE v_fiscal_start_month INT64;
SET v_fiscal_start_month = COALESCE(fiscal_year_start_month, 1);

-- Calculate fiscal year start date
DECLARE v_fiscal_year_start DATE;
SET v_fiscal_year_start = DATE(
  EXTRACT(YEAR FROM cost_date) - IF(EXTRACT(MONTH FROM cost_date) < v_fiscal_start_month, 1, 0),
  v_fiscal_start_month,
  1
);
```

**PRO-009: Use p_pipeline_id parameter**
File: `configs/system/procedures/subscription/sp_subscription_3_convert_to_focus.sql`
Line: 304

Change:
```sql
-- OLD:
'subscription_costs_pipeline' as x_pipeline_id,

-- NEW:
@p_pipeline_id as x_pipeline_id,
```

**PRO-010: Add DQ table writes for NULL seats**
File: `configs/system/procedures/subscription/sp_subscription_2_calculate_daily_costs.sql`
Line: 144 (after COALESCE for seats)

Add:
```sql
-- Log data quality issue for missing seats
INSERT INTO `{project}.organizations.org_meta_dq_results` (
  org_slug, table_name, column_name, issue_type,
  issue_description, record_count, severity, ingestion_date
)
SELECT
  p_org_slug,
  'subscription_plans',
  'number_of_users',
  'missing_value',
  'Seats defaulted to 1 due to NULL value',
  COUNT(*),
  'warning',
  CURRENT_DATE()
FROM subscription_plans
WHERE number_of_users IS NULL
  AND effective_date <= p_end_date
  AND (end_date IS NULL OR end_date >= p_start_date)
GROUP BY p_org_slug
HAVING COUNT(*) > 0;
```

---

#### Config Fixes

**CFG-006: Standardize retry config in openai.yml**
File: `configs/genai/payg/openai.yml`
Decision: Either standardize all steps to 3 retries/60s OR add comment explaining differences

**CFG-007: Add slack to notifications**
File: `configs/genai/payg/openai.yml`
Lines: 43-46
```yaml
notifications:
  on_failure:
    - email
    - slack
  on_success:
    - slack
```

**CFG-008: Bump pipeline versions to 15.0.0**
Files: All pipeline .yml files with version: "1.0.0"
Change to: version: "15.0.0"

**CFG-009: Add depends_on to sequential steps**
Example in multi-step pipelines:
```yaml
steps:
  - step_id: extract_usage
    # ... no depends_on (first step)

  - step_id: calculate_costs
    depends_on:
      - extract_usage  # ADD THIS

  - step_id: convert_to_focus
    depends_on:
      - calculate_costs  # ADD THIS
```

---

#### Processor Fixes

**PROC-006: Add org_slug validation in payg_cost.py**
File: `src/core/processors/genai/payg_cost.py`
Line: 253 (start of execute method)

Add at beginning of execute():
```python
async def execute(self, step_config: Dict, context: Dict) -> Dict:
    # Validate org_slug format (security)
    org_slug = context.get("org_slug")
    if not re.match(r'^[a-zA-Z0-9_]{3,50}$', org_slug):
        return {
            "status": "FAILED",
            "error": "Invalid org_slug format. Must be 3-50 alphanumeric + underscores."
        }

    # Continue with existing logic...
```

**PROC-007: Add MERGE count breakdown**
File: `src/core/processors/genai/focus_converter.py`
Line: 311 (after MERGE execution)

Add:
```python
# Get detailed MERGE statistics
merge_stats_query = f"""
SELECT
  @@row_count as total_rows,
  (SELECT COUNT(*) FROM `{table}` WHERE x_run_id = @run_id) as inserted_count,
  @@row_count - (SELECT COUNT(*) FROM `{table}` WHERE x_run_id = @run_id) as updated_count
"""
stats = await self.bq_client.query_async(merge_stats_query, params)

return {
    "status": "SUCCESS",
    "rows_inserted": stats['inserted_count'],
    "rows_updated": stats['updated_count'],
    "rows_total": stats['total_rows']
}
```

**PROC-008: Verify procedure loop for each date**
File: `src/core/processors/cloud/focus_converter.py`
Lines: 71-95

Ensure loop exists:
```python
date_range = self._generate_date_range(start_date, end_date)
for process_date in date_range:
    await self._call_focus_procedure(
        provider=provider,
        process_date=process_date,
        org_slug=org_slug,
        # ... other params
    )
```

---

#### Security & Quality

**SEC-004: Add global rate limiting**
File: `src/app/routers/pipelines.py`
Before `@rate_limit_by_org`, add:
```python
@rate_limit_global(requests=100, window_seconds=60)
@rate_limit_by_org(requests=10, window_seconds=60)
```

**SEC-005: Add audit logging to processors**
Add to all processor execute() methods:
```python
audit_data = {
    "org_slug": org_slug,
    "api_key_hash": hashlib.sha256(api_key.encode()).hexdigest()[:16],
    "source_ip": context.get("source_ip", "unknown"),
    "action": f"{self.__class__.__name__}.execute",
    "timestamp": datetime.utcnow().isoformat()
}
logger.info(f"Audit: {audit_data}")
```

**QUAL-001: Remove commented code**
File: `src/core/processors/genai/payg_cost.py`
Lines: 691-693
Action: Delete the commented validation code (already replaced with working code)

**QUAL-002: Delete .bak file**
Files:
1. Delete: `configs/system/procedures/genai/sp_consolidate_genai_costs_daily.sql.bak`
2. Add to `.gitignore`: `*.bak`

---

### PHASE 4 LOW PRIORITY (9 issues)

#### Schema Documentation

**SCH-010: Add billing_account_id description**
File: `cloud_gcp_billing_raw_daily.json` line 42
Already has description - verify it's complete

**SCH-011: Verify resource_name casing**
Check all schemas use `resource_name` (snake_case) not `ResourceName`

**SCH-012: Add clustering hint**
Add to x_pipeline_run_date descriptions:
```json
{
  "description": "The DATA date being processed. KEY for idempotent re-runs. Recommended for clustering."
}
```

**SCH-013: Add schema versioning**
Add to all schema JSON files (top level):
```json
{
  "$schema_version": "15.0.0",
  "last_updated": "2026-01-08",
  "fields": [...]
}
```

**SCH-014: Create CHANGELOG.md**
File: Create `configs/setup/organizations/onboarding/schemas/CHANGELOG.md`
```markdown
# Schema Changelog

## v15.0.0 - 2026-01-08
- Added x_data_quality_score to all cloud billing schemas
- Added x_created_at to AWS/Azure/OCI schemas
- Added 10-level hierarchy support (x_hierarchy_level_1_id through level_10)

## v14.0.0 - Previous
- Initial 10-level hierarchy migration
```

**SCH-015: Add deprecation note**
File: `subscription_plans.json`
Add to billing_amount field:
```json
{
  "name": "billing_amount",
  "type": "FLOAT64",
  "mode": "NULLABLE",
  "description": "DEPRECATED: Use monthly_cost instead. Kept for backward compatibility."
}
```

---

#### Procedure Enhancements

**PRO-011: Improve error message**
File: `configs/system/procedures/cloud/sp_cloud_1_convert_to_focus.sql`
Line: 558

Change:
```sql
-- OLD:
RAISE USING MESSAGE = @@error.message;

-- NEW:
RAISE USING MESSAGE = CONCAT(
  'sp_cloud_1_convert_to_focus failed for provider=', p_provider,
  ', date=', CAST(p_cost_date AS STRING),
  ': ', @@error.message
);
```

**PRO-012: Add currency validation**
File: `configs/system/procedures/subscription/sp_subscription_3_convert_to_focus.sql`
Line: 141 (after COALESCE currency)

Add:
```sql
DECLARE v_valid_currencies ARRAY<STRING> DEFAULT ['USD', 'EUR', 'GBP', 'INR', 'JPY', 'AUD', 'CAD', 'SGD', 'CHF'];
ASSERT billing_currency IN UNNEST(v_valid_currencies) AS "Invalid currency code";
```

---

#### Config Documentation

**CFG-010: Add timezone comment**
File: `configs/genai/payg/openai.yml`
Lines: 15-16

Add comment:
```yaml
schedule:
  time: "03:00"
  timezone: UTC  # Note: Org-specific timezone support planned for v16.0
```

**CFG-011: Add header comments to pipeline files**
Example for all .yml files:
```yaml
# Pipeline: {Name}
# Purpose: {Brief description}
# Data Sources: {Tables used}
# Output Tables: {Tables written}
# SLA: {Expected completion time}
# Dependencies: {Required tables/procedures}
```

---

#### Processor Improvements

**PROC-009: Implement GCP monitoring API**
File: `src/core/processors/genai/provider_adapters/gcp_vertex_adapter.py`
Lines: 91, 125, 159

Replace TODOs with:
```python
from google.cloud import monitoring_v3

async def _get_commitment_metrics(self):
    client = monitoring_v3.MetricServiceClient()
    project_name = f"projects/{self.project_id}"

    # Query Cloud Monitoring for GPU/TPU commitment usage
    interval = monitoring_v3.TimeInterval({
        "end_time": {"seconds": int(time.time())},
        "start_time": {"seconds": int(time.time()) - 86400}
    })

    results = client.list_time_series(
        request={
            "name": project_name,
            "filter": 'metric.type="compute.googleapis.com/gpu/commitment_usage"',
            "interval": interval
        }
    )

    return results
```

**PROC-010: Add exception context**
File: `src/core/processors/genai/focus_converter.py`
Line: 322

Change:
```python
except Exception as e:
    self.logger.error(
        f"FOCUS conversion failed: {e}",
        extra={
            "org_slug": org_slug,
            "process_date": str(process_date),
            "provider": provider
        },
        exc_info=True
    )
    raise
```

---

#### Quality Documentation

**QUAL-003: Add retry constant comments**
File: `src/core/processors/genai/payg_cost.py`
Lines: 40-44

Change to:
```python
# BigQuery rate limit retry configuration
# 5 retries with exponential backoff (1s → 2s → 4s → 8s → 16s)
# Total max wait time: 31 seconds before final failure
# Chosen based on BigQuery rate limit reset window (60s)
BQ_MAX_RETRIES = 5
BQ_INITIAL_BACKOFF_SECONDS = 1.0  # Start with 1 second
BQ_MAX_BACKOFF_SECONDS = 60.0     # Cap at 60 seconds
BQ_BACKOFF_MULTIPLIER = 2.0        # Double each retry
```

---

## Implementation Checklist

### Phase 2 High (Remaining)
- [ ] CFG-004: Pipeline schema validation
- [ ] PROC-005: Retry wrapper implementation
- [ ] TEST-001: Hierarchy validation tests

### Phase 3 Medium
- [ ] SCH-007, SCH-008, SCH-009: Schema field additions and reordering
- [ ] PRO-007, PRO-008, PRO-009, PRO-010: Subscription procedure fixes
- [ ] CFG-006, CFG-007, CFG-008, CFG-009: Config standardization
- [ ] PROC-006, PROC-007, PROC-008: Processor enhancements
- [ ] SEC-004, SEC-005: Security improvements
- [ ] QUAL-001, QUAL-002: Code cleanup

### Phase 4 Low
- [ ] SCH-010 through SCH-015: Schema documentation
- [ ] PRO-011, PRO-012: Procedure error handling
- [ ] CFG-010, CFG-011: Config documentation
- [ ] PROC-009, PROC-010: Processor improvements
- [ ] QUAL-003: Code documentation

---

## Testing Strategy

After completing all fixes:

1. **Schema Sync Test**
   ```bash
   curl -X POST http://localhost:8000/api/v1/organizations/{org}/sync \
     -H "X-CA-Root-Key: $KEY" \
     -d '{"sync_missing_columns": true}'
   ```

2. **Procedure Sync Test**
   ```bash
   curl -X POST http://localhost:8001/api/v1/procedures/sync \
     -H "X-CA-Root-Key: $KEY"
   ```

3. **Pipeline Tests**
   ```bash
   cd 03-data-pipeline-service
   python -m pytest tests/ -v
   python -m pytest tests/test_hierarchy_validation.py -v
   ```

4. **Integration Tests**
   - Run full GenAI pipeline with hierarchy validation
   - Run cloud billing conversion for all providers
   - Verify FOCUS 1.3 output correctness

---

## Success Metrics

- [ ] All 45 issues resolved
- [ ] All tests passing
- [ ] No schema sync errors
- [ ] All procedures synced successfully
- [ ] Documentation updated
- [ ] Code review approved
- [ ] Production deployment successful

---

**Generated:** 2026-01-08
**Next Action:** Continue with remaining HIGH priority fixes, then proceed systematically through MEDIUM and LOW
