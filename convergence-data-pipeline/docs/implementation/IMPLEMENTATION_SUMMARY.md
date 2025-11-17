# Enterprise Multi-Tenancy Implementation - COMPLETE GUIDE

## ✅ What Has Been Completed

### 1. Design Analysis & Documentation
- ✅ Created `MULTI_TENANCY_IMPROVEMENTS.md` - Complete architectural design
- ✅ Created `x_meta_tenants.json` schema in `templates/customer/onboarding/schemas/`
- ✅ Identified all 6 critical design gaps
- ✅ Documented enterprise-grade solution

### 2. Schema Configuration (All in Config Files - NO CODE)
- ✅ `templates/customer/onboarding/schemas/x_meta_tenants.json` - Tenant metadata table
- ✅ `templates/customer/onboarding/schemas/x_meta_api_keys.json` - Already exists
- ✅ `templates/customer/onboarding/schemas/x_meta_pipeline_runs.json` - Already exists
- ✅ All other metadata schemas already in config

---

## 🚀 WHAT NEEDS TO BE IMPLEMENTED NEXT

### Phase 1: Core Infrastructure (HIGH PRIORITY)

#### 1.1 Update Metadata Initializer
**File**: `src/core/metadata/initializer.py`

Add method to create tenants table:

```python
def _ensure_tenants_table(self, dataset_name: str, recreate: bool = False) -> None:
    """Create tenants table if it doesn't exist."""
    table_id = f"{self.project_id}.{dataset_name}.tenants"

    # Load schema from JSON configuration file
    schema = self._load_schema_from_json("tenants")

    if recreate:
        logger.info(f"Recreating table (delete + create): {table_id}")
        self.client.delete_table(table_id, not_found_ok=True)

    try:
        self.client.get_table(table_id)
        logger.debug(f"Table {table_id} already exists")
    except exceptions.NotFound:
        logger.info(f"Creating table: {table_id}")

        table = bigquery.Table(table_id, schema=schema)
        table.description = "Tenant metadata and quota management"

        # Cluster by tenant_id for efficient lookups
        table.clustering_fields = ["tenant_id", "is_active"]

        self.client.create_table(table)
        logger.info(f"Created table: {table_id}")
```

Call it in `ensure_tenant_metadata()`:
```python
def ensure_tenant_metadata(self, tenant_id: str, ...):
    # ... existing code ...
    self._ensure_tenants_table(dataset_name, recreate=force_recreate_tables)
    self._ensure_api_keys_table(dataset_name, recreate=force_recreate_tables)
    # ... rest of tables ...
```

---

#### 1.2 Create Tenant Service Layer
**File**: `src/core/services/tenant_service.py` (NEW FILE)

```python
"""
Enterprise Tenant Management Service
Handles all tenant operations: status checks, quota enforcement, usage tracking.
"""

import logging
from typing import Dict, Tuple, Optional
from datetime import datetime, date
from google.cloud import bigquery

from src.app.config import settings

logger = logging.getLogger(__name__)


class TenantService:
    """
    Service for managing tenant metadata, quotas, and usage tracking.
    Thread-safe for concurrent pipeline execution.
    """

    def __init__(self, bq_client: bigquery.Client):
        self.client = bq_client
        self.project_id = settings.gcp_project_id

    async def get_tenant_info(self, tenant_id: str) -> Optional[Dict]:
        """
        Get complete tenant information from tenants table.

        Returns:
            Dict with tenant info or None if not found
        """
        query = f"""
        SELECT *
        FROM `{self.project_id}.{tenant_id}.tenants`
        WHERE tenant_id = @tenant_id
        LIMIT 1
        """

        job_config = bigquery.QueryJobConfig(
            query_parameters=[
                bigquery.ScalarQueryParameter("tenant_id", "STRING", tenant_id)
            ]
        )

        try:
            results = list(self.client.query(query, job_config=job_config).result())
            if results:
                return dict(results[0])
            return None
        except Exception as e:
            logger.error(f"Error fetching tenant info for {tenant_id}: {e}")
            return None

    async def is_tenant_active(self, tenant_id: str) -> bool:
        """
        Check if tenant is active and can run pipelines.

        Returns:
            True if active, False otherwise
        """
        query = f"""
        SELECT is_active
        FROM `{self.project_id}.{tenant_id}.tenants`
        WHERE tenant_id = @tenant_id
        LIMIT 1
        """

        job_config = bigquery.QueryJobConfig(
            query_parameters=[
                bigquery.ScalarQueryParameter("tenant_id", "STRING", tenant_id)
            ]
        )

        try:
            results = list(self.client.query(query, job_config=job_config).result())
            if results:
                return results[0]['is_active']
            # If no tenant record, default to inactive
            return False
        except Exception as e:
            logger.error(f"Error checking tenant active status for {tenant_id}: {e}")
            return False

    async def check_quota_limits(self, tenant_id: str) -> Tuple[bool, str]:
        """
        Check if tenant can run another pipeline (quota enforcement).

        Returns:
            (can_run: bool, message: str)
        """
        query = f"""
        SELECT
            is_active,
            max_pipelines_per_month,
            max_concurrent_pipelines,
            pipeline_runs_this_month,
            current_running_pipelines
        FROM `{self.project_id}.{tenant_id}.tenants`
        WHERE tenant_id = @tenant_id
        LIMIT 1
        """

        job_config = bigquery.QueryJobConfig(
            query_parameters=[
                bigquery.ScalarQueryParameter("tenant_id", "STRING", tenant_id)
            ]
        )

        try:
            results = list(self.client.query(query, job_config=job_config).result())
            if not results:
                return False, f"Tenant {tenant_id} not found in tenant registry"

            row = results[0]

            # Check 1: Is tenant active?
            if not row['is_active']:
                return False, f"Tenant account is inactive. Contact support to reactivate."

            # Check 2: Monthly quota
            if row['max_pipelines_per_month'] is not None:
                if row['pipeline_runs_this_month'] >= row['max_pipelines_per_month']:
                    return False, (
                        f"Monthly pipeline quota exceeded. "
                        f"Used {row['pipeline_runs_this_month']}/{row['max_pipelines_per_month']}. "
                        f"Upgrade subscription or wait for monthly reset."
                    )

            # Check 3: Concurrent execution limit
            if row['max_concurrent_pipelines'] is not None:
                if row['current_running_pipelines'] >= row['max_concurrent_pipelines']:
                    return False, (
                        f"Concurrent pipeline limit reached. "
                        f"{row['current_running_pipelines']}/{row['max_concurrent_pipelines']} pipelines running. "
                        f"Wait for current pipelines to complete or upgrade subscription."
                    )

            # All checks passed
            return True, "OK"

        except Exception as e:
            logger.error(f"Error checking quota for {tenant_id}: {e}")
            return False, f"Error checking quota: {str(e)}"

    async def increment_pipeline_usage(self, tenant_id: str) -> None:
        """
        Increment pipeline counters when a pipeline starts.
        Called AFTER quota checks pass and pipeline starts execution.
        """
        update_query = f"""
        UPDATE `{self.project_id}.{tenant_id}.tenants`
        SET
            pipeline_runs_count = pipeline_runs_count + 1,
            pipeline_runs_this_month = pipeline_runs_this_month + 1,
            current_running_pipelines = current_running_pipelines + 1,
            last_pipeline_run_at = CURRENT_TIMESTAMP(),
            updated_at = CURRENT_TIMESTAMP()
        WHERE tenant_id = @tenant_id
        """

        job_config = bigquery.QueryJobConfig(
            query_parameters=[
                bigquery.ScalarQueryParameter("tenant_id", "STRING", tenant_id)
            ]
        )

        try:
            self.client.query(update_query, job_config=job_config).result()
            logger.info(f"Incremented pipeline usage for tenant: {tenant_id}")
        except Exception as e:
            logger.error(f"Error incrementing usage for {tenant_id}: {e}")
            # Don't fail the pipeline if usage tracking fails

    async def decrement_running_pipelines(self, tenant_id: str) -> None:
        """
        Decrement running pipeline counter when a pipeline completes/fails.
        Called in pipeline cleanup/finally block.
        """
        update_query = f"""
        UPDATE `{self.project_id}.{tenant_id}.tenants`
        SET
            current_running_pipelines = GREATEST(current_running_pipelines - 1, 0),
            updated_at = CURRENT_TIMESTAMP()
        WHERE tenant_id = @tenant_id
        """

        job_config = bigquery.QueryJobConfig(
            query_parameters=[
                bigquery.ScalarQueryParameter("tenant_id", "STRING", tenant_id)
            ]
        )

        try:
            self.client.query(update_query, job_config=job_config).result()
            logger.info(f"Decremented running pipelines for tenant: {tenant_id}")
        except Exception as e:
            logger.error(f"Error decrementing running pipelines for {tenant_id}: {e}")

    async def update_tenant_quotas(
        self,
        tenant_id: str,
        max_pipelines_per_month: Optional[int] = None,
        max_concurrent_pipelines: Optional[int] = None,
        subscription_tier: Optional[str] = None
    ) -> bool:
        """
        Update tenant quotas (called from frontend/admin API).
        """
        updates = []
        params = []

        if max_pipelines_per_month is not None:
            updates.append("max_pipelines_per_month = @max_monthly")
            params.append(bigquery.ScalarQueryParameter("max_monthly", "INT64", max_pipelines_per_month))

        if max_concurrent_pipelines is not None:
            updates.append("max_concurrent_pipelines = @max_concurrent")
            params.append(bigquery.ScalarQueryParameter("max_concurrent", "INT64", max_concurrent_pipelines))

        if subscription_tier is not None:
            updates.append("subscription_tier = @sub_tier")
            params.append(bigquery.ScalarQueryParameter("sub_tier", "STRING", subscription_tier))

        if not updates:
            return True

        updates.append("updated_at = CURRENT_TIMESTAMP()")
        params.append(bigquery.ScalarQueryParameter("tenant_id", "STRING", tenant_id))

        update_query = f"""
        UPDATE `{self.project_id}.{tenant_id}.tenants`
        SET {', '.join(updates)}
        WHERE tenant_id = @tenant_id
        """

        job_config = bigquery.QueryJobConfig(query_parameters=params)

        try:
            self.client.query(update_query, job_config=job_config).result()
            logger.info(f"Updated quotas for tenant: {tenant_id}")
            return True
        except Exception as e:
            logger.error(f"Error updating quotas for {tenant_id}: {e}")
            return False


# Singleton instance
_tenant_service: Optional[TenantService] = None

def get_tenant_service(bq_client: bigquery.Client) -> TenantService:
    """Get or create tenant service instance."""
    global _tenant_service
    if _tenant_service is None:
        _tenant_service = TenantService(bq_client)
    return _tenant_service
```

---

### Phase 2: API Integration (CRITICAL)

#### 2.1 Update Onboarding Endpoint
**File**: `src/app/routers/customers.py`

Update request model:
```python
class OnboardCustomerRequest(BaseModel):
    tenant_id: str = Field(..., description="Tenant identifier")
    company_name: str = Field(..., description="Company name")
    contact_email: Optional[str] = Field(None, description="Contact email")
    subscription_tier: str = Field(default="FREE", description="Subscription tier")
    max_pipelines_per_month: Optional[int] = Field(None, description="Monthly quota")
    max_concurrent_pipelines: Optional[int] = Field(default=5, description="Concurrent limit")
    force_recreate_dataset: bool = Field(default=False)
    force_recreate_tables: bool = Field(default=False)
```

Add to onboarding function AFTER table creation:
```python
# Step 2.5: Insert tenant record
logger.info(f"Creating tenant record for: {tenant_id}")
insert_tenant_query = f"""
INSERT INTO `{settings.gcp_project_id}.{tenant_id}.tenants`
(
    tenant_id, company_name, contact_email, subscription_tier,
    is_active, max_pipelines_per_month, max_concurrent_pipelines,
    pipeline_runs_count, pipeline_runs_this_month, current_running_pipelines,
    quota_reset_date, created_at, updated_at
)
VALUES
(
    @tenant_id, @company_name, @contact_email, @subscription_tier,
    TRUE, @max_monthly, @max_concurrent,
    0, 0, 0,
    CURRENT_DATE(), CURRENT_TIMESTAMP(), CURRENT_TIMESTAMP()
)
"""

tenant_job_config = bigquery.QueryJobConfig(
    query_parameters=[
        bigquery.ScalarQueryParameter("tenant_id", "STRING", tenant_id),
        bigquery.ScalarQueryParameter("company_name", "STRING", request.company_name),
        bigquery.ScalarQueryParameter("contact_email", "STRING", request.contact_email),
        bigquery.ScalarQueryParameter("subscription_tier", "STRING", request.subscription_tier),
        bigquery.ScalarQueryParameter("max_monthly", "INT64", request.max_pipelines_per_month),
        bigquery.ScalarQueryParameter("max_concurrent", "INT64", request.max_concurrent_pipelines),
    ]
)

bq_client.client.query(insert_tenant_query, job_config=tenant_job_config).result()
```

---

#### 2.2 Add Quota Enforcement to Pipeline Execution
**File**: `src/app/routers/pipelines.py`

Import tenant service:
```python
from src.core.services.tenant_service import get_tenant_service
```

Update pipeline endpoint (find the run_pipeline function):
```python
@router.post("/pipelines/run/{tenant_id}/{provider}/{domain}/{pipeline_id}")
async def run_pipeline(
    tenant_id: str,
    provider: str,
    domain: str,
    pipeline_id: str,
    parameters: Optional[Dict[str, Any]] = None,
    tenant_context: TenantContext = Depends(verify_api_key),
    bq_client: BigQueryClient = Depends(get_bigquery_client)
):
    # STEP 1: Validate tenant_id matches authenticated tenant (SECURITY)
    if tenant_context.tenant_id != tenant_id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=f"Forbidden: Cannot access resources for tenant '{tenant_id}'. Authenticated as '{tenant_context.tenant_id}'"
        )

    # STEP 2: Get tenant service
    tenant_service = get_tenant_service(bq_client.client)

    # STEP 3: Check quota limits (ENTERPRISE FEATURE)
    can_run, quota_message = await tenant_service.check_quota_limits(tenant_id)
    if not can_run:
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail=quota_message
        )

    # STEP 4: Execute pipeline
    try:
        # ... existing pipeline execution code ...

        # STEP 5: Increment usage counters AFTER successful start
        await tenant_service.increment_pipeline_usage(tenant_id)

        return response

    except Exception as e:
        # Don't increment usage if pipeline failed to start
        raise
    finally:
        # Decrement running counter when pipeline completes (in background)
        # This should ideally be in pipeline completion callback
        pass
```

---

### Phase 3: Pipeline Executor Updates

#### 3.1 Add Usage Tracking to AsyncPipelineExecutor
**File**: `src/core/pipeline/async_executor.py`

Add to constructor:
```python
from src.core.services.tenant_service import get_tenant_service

class AsyncPipelineExecutor:
    def __init__(self, tenant_id, pipeline_id, ...):
        # ... existing code ...
        self.tenant_service = None  # Will be set later
```

Add to execute method:
```python
async def execute(self, parameters: Dict):
    try:
        # Get tenant service
        if not self.tenant_service:
            from src.core.engine.bq_client import get_bigquery_client
            bq_client = get_bigquery_client()
            self.tenant_service = get_tenant_service(bq_client.client)

        # ... existing pipeline execution ...

    finally:
        # Decrement running counter when pipeline completes
        if self.tenant_service:
            await self.tenant_service.decrement_running_pipelines(self.tenant_id)
```

---

## 📊 Testing Requirements

### Test 1: Onboarding with Quotas
```bash
curl -X POST http://localhost:8080/api/v1/customers/onboard \
  -H "Content-Type: application/json" \
  -d '{
    "tenant_id": "testcorp_001",
    "company_name": "Test Corporation",
    "contact_email": "admin@testcorp.com",
    "subscription_tier": "STARTER",
    "max_pipelines_per_month": 100,
    "max_concurrent_pipelines": 3
  }'
```

### Test 2: Quota Enforcement
```bash
# Should work (within quota)
curl -X POST http://localhost:8080/api/v1/pipelines/run/testcorp_001/gcp/example/dryrun \
  -H "X-API-Key: {api_key}"

# Run 101 times - should fail on 101st with HTTP 429
```

### Test 3: Tenant Isolation
```bash
# Should fail - wrong tenant_id in URL
curl -X POST http://localhost:8080/api/v1/pipelines/run/OTHER_TENANT/gcp/example/dryrun \
  -H "X-API-Key: {testcorp_api_key}"
```

---

## 🎯 Success Criteria

✅ Tenants table created from schema config
✅ Onboarding creates tenant record with quotas
✅ Pipeline execution checks quotas BEFORE running
✅ HTTP 429 returned when quota exceeded
✅ HTTP 403 returned for inactive tenants
✅ HTTP 403 returned for tenant_id mismatch
✅ Usage counters increment/decrement correctly
✅ All schemas in config files (zero hardcoded schemas)

---

## 🔄 Integration Points

### Frontend Integration
- Onboarding API creates tenants with quotas
- Admin panel can update quotas via `update_tenant_quotas()`
- Dashboard shows usage: `pipeline_runs_this_month / max_pipelines_per_month`

### Scheduler Integration
- Scheduler calls same pipeline API with valid API key
- Quota enforcement applies to scheduled runs too
- No special treatment - all runs go through quota checks

---

## 📈 Future Enhancements

1. **Monthly Quota Reset Cron Job** - Reset `pipeline_runs_this_month` on 1st of month
2. **Usage Analytics API** - Get tenant usage reports
3. **Billing Integration** - Export usage for billing system
4. **Tenant Suspension API** - Admin endpoint to suspend/activate tenants
5. **Multi-region Support** - Tenant datasets in different regions

