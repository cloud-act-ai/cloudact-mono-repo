"""
Customer Onboarding API Routes
Endpoint for onboarding new customers/tenants to the platform.

TWO-DATASET ARCHITECTURE:
1. customers dataset: Auth data (API keys, subscriptions, profiles, credentials)
2. {tenant_id} dataset: Operational data (pipeline_runs, step_logs, dq_results)
"""

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field, validator
from typing import List, Optional
from datetime import datetime, date
import hashlib
import secrets
import re
import logging
from pathlib import Path

from src.core.engine.bq_client import get_bigquery_client, BigQueryClient
from src.core.security.kms_encryption import encrypt_value
from src.core.pipeline.async_executor import AsyncPipelineExecutor
from src.app.config import settings
from google.cloud import bigquery
import uuid

router = APIRouter()
logger = logging.getLogger(__name__)


# ============================================
# Request/Response Models
# ============================================

class OnboardCustomerRequest(BaseModel):
    """Request to onboard a new customer."""
    tenant_id: str = Field(
        ...,
        description="Tenant identifier (alphanumeric + underscore, 3-50 chars)"
    )
    company_name: str = Field(
        ...,
        description="Company or organization name"
    )
    admin_email: str = Field(
        ...,
        description="Primary admin contact email"
    )
    subscription_plan: str = Field(
        default="STARTER",
        description="Subscription plan: STARTER, PROFESSIONAL, SCALE"
    )
    force_recreate_dataset: bool = Field(
        default=False,
        description="If True, delete and recreate the entire dataset (DESTRUCTIVE)"
    )
    force_recreate_tables: bool = Field(
        default=False,
        description="If True, delete and recreate all metadata tables (DESTRUCTIVE)"
    )

    @validator('tenant_id')
    def validate_tenant_id(cls, v):
        """Validate tenant_id format."""
        if not re.match(r'^[a-zA-Z0-9_]{3,50}$', v):
            raise ValueError(
                'tenant_id must be alphanumeric with underscores, 3-50 characters'
            )
        return v

    @validator('subscription_plan')
    def validate_subscription_plan(cls, v):
        """Validate subscription plan."""
        allowed = ['STARTER', 'PROFESSIONAL', 'SCALE']
        if v.upper() not in allowed:
            raise ValueError(f'subscription_plan must be one of {allowed}')
        return v.upper()


class OnboardCustomerResponse(BaseModel):
    """Response for customer onboarding."""
    customer_id: str
    tenant_id: str
    api_key: str  # Unencrypted - show once!
    subscription_plan: str
    dataset_created: bool
    tables_created: List[str]
    dryrun_status: str  # "SUCCESS" or "FAILED"
    message: str


# ============================================
# Customer Onboarding Endpoint
# ============================================

@router.post(
    "/customers/onboard",
    response_model=OnboardCustomerResponse,
    summary="Onboard a new customer",
    description="Complete customer onboarding: create customer profile, API key, subscription, and tenant dataset"
)
async def onboard_customer(
    request: OnboardCustomerRequest,
    bq_client: BigQueryClient = Depends(get_bigquery_client)
):
    """
    Onboard a new customer to the platform.

    TWO-DATASET ARCHITECTURE:
    1. Creates customer record in customers.customer_profiles
    2. Stores API key in customers.customer_api_keys (centralized auth)
    3. Creates subscription in customers.customer_subscriptions
    4. Creates usage tracking in customers.customer_usage_quotas
    5. Creates tenant dataset with ONLY operational tables (no API keys)
    6. Runs dry-run pipeline to validate infrastructure

    - **tenant_id**: Unique tenant identifier (becomes dataset name)
    - **company_name**: Company or organization name
    - **admin_email**: Primary admin contact email
    - **subscription_plan**: STARTER, PROFESSIONAL, or SCALE

    Returns:
    - API key (unencrypted - save immediately)
    - Customer and subscription details
    - Dataset and table creation status
    """
    tenant_id = request.tenant_id
    customer_id = str(uuid.uuid4())  # Generate unique customer ID

    logger.info(f"Starting customer onboarding for tenant: {tenant_id}, customer_id: {customer_id}")

    # Track tables created
    tables_created = []

    # Subscription plan limits
    PLAN_LIMITS = {
        "STARTER": {"max_team": 2, "max_providers": 3, "max_daily": 6, "max_concurrent": 3},
        "PROFESSIONAL": {"max_team": 6, "max_providers": 6, "max_daily": 25, "max_concurrent": 5},
        "SCALE": {"max_team": 11, "max_providers": 10, "max_daily": 100, "max_concurrent": 10}
    }

    plan_limits = PLAN_LIMITS.get(request.subscription_plan, PLAN_LIMITS["STARTER"])

    # ============================================
    # STEP 1: Create customer profile in customers.customer_profiles
    # ============================================
    try:
        logger.info(f"Creating customer profile in customers.customer_profiles")

        insert_profile_query = f"""
        INSERT INTO `{settings.gcp_project_id}.customers.customer_profiles`
        (customer_id, company_name, admin_email, tenant_id, status, subscription_plan, created_at, updated_at)
        VALUES
        (@customer_id, @company_name, @admin_email, @tenant_id, 'ACTIVE', @subscription_plan, CURRENT_TIMESTAMP(), CURRENT_TIMESTAMP())
        """

        bq_client.client.query(
            insert_profile_query,
            job_config=bigquery.QueryJobConfig(
                query_parameters=[
                    bigquery.ScalarQueryParameter("customer_id", "STRING", customer_id),
                    bigquery.ScalarQueryParameter("company_name", "STRING", request.company_name),
                    bigquery.ScalarQueryParameter("admin_email", "STRING", request.admin_email),
                    bigquery.ScalarQueryParameter("tenant_id", "STRING", tenant_id),
                    bigquery.ScalarQueryParameter("subscription_plan", "STRING", request.subscription_plan)
                ]
            )
        ).result()

        logger.info(f"Customer profile created: {customer_id}")

    except Exception as e:
        logger.error(f"Failed to create customer profile: {e}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to create customer profile: {str(e)}"
        )

    # ============================================
    # STEP 2: Generate and store API key in customers.customer_api_keys
    # ============================================
    try:
        logger.info(f"Generating API key for customer: {customer_id}")

        # Generate secure API key with format: {tenant_id}_api_{random_16_chars}
        random_suffix = secrets.token_urlsafe(16)[:16]
        api_key = f"{tenant_id}_api_{random_suffix}"

        # Hash API key with SHA256 for lookup
        api_key_hash = hashlib.sha256(api_key.encode()).hexdigest()

        # Encrypt API key using KMS
        try:
            encrypted_api_key_bytes = encrypt_value(api_key)
        except Exception as kms_error:
            logger.warning(f"KMS encryption failed, storing plain API key (DEV ONLY): {kms_error}")
            encrypted_api_key_bytes = api_key.encode('utf-8')

        api_key_id = str(uuid.uuid4())

        # Store API key in centralized customers.customer_api_keys table
        insert_api_key_query = f"""
        INSERT INTO `{settings.gcp_project_id}.customers.customer_api_keys`
        (api_key_id, customer_id, tenant_id, api_key_hash, encrypted_api_key, scopes, is_active, created_at)
        VALUES
        (@api_key_id, @customer_id, @tenant_id, @api_key_hash, @encrypted_api_key, @scopes, TRUE, CURRENT_TIMESTAMP())
        """

        bq_client.client.query(
            insert_api_key_query,
            job_config=bigquery.QueryJobConfig(
                query_parameters=[
                    bigquery.ScalarQueryParameter("api_key_id", "STRING", api_key_id),
                    bigquery.ScalarQueryParameter("customer_id", "STRING", customer_id),
                    bigquery.ScalarQueryParameter("tenant_id", "STRING", tenant_id),
                    bigquery.ScalarQueryParameter("api_key_hash", "STRING", api_key_hash),
                    bigquery.ScalarQueryParameter("encrypted_api_key", "BYTES", encrypted_api_key_bytes),
                    bigquery.ArrayQueryParameter("scopes", "STRING", ["pipelines:read", "pipelines:write", "pipelines:execute"])
                ]
            )
        ).result()

        logger.info(f"API key stored in customers.customer_api_keys: {api_key_id}")

    except Exception as e:
        logger.error(f"Failed to generate/store API key: {e}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to generate API key: {str(e)}"
        )

    # ============================================
    # STEP 3: Create subscription in customers.customer_subscriptions
    # ============================================
    try:
        logger.info(f"Creating subscription for customer: {customer_id}")

        subscription_id = str(uuid.uuid4())
        trial_end = date.today()  # You can add 14 days for real trial

        insert_subscription_query = f"""
        INSERT INTO `{settings.gcp_project_id}.customers.customer_subscriptions`
        (subscription_id, customer_id, plan_name, status, max_team_members, max_providers,
         max_pipelines_per_day, max_concurrent_pipelines, trial_end_date, created_at)
        VALUES
        (@subscription_id, @customer_id, @plan_name, 'ACTIVE', @max_team_members, @max_providers,
         @max_pipelines_per_day, @max_concurrent_pipelines, @trial_end_date, CURRENT_TIMESTAMP())
        """

        bq_client.client.query(
            insert_subscription_query,
            job_config=bigquery.QueryJobConfig(
                query_parameters=[
                    bigquery.ScalarQueryParameter("subscription_id", "STRING", subscription_id),
                    bigquery.ScalarQueryParameter("customer_id", "STRING", customer_id),
                    bigquery.ScalarQueryParameter("plan_name", "STRING", request.subscription_plan),
                    bigquery.ScalarQueryParameter("max_team_members", "INT64", plan_limits["max_team"]),
                    bigquery.ScalarQueryParameter("max_providers", "INT64", plan_limits["max_providers"]),
                    bigquery.ScalarQueryParameter("max_pipelines_per_day", "INT64", plan_limits["max_daily"]),
                    bigquery.ScalarQueryParameter("max_concurrent_pipelines", "INT64", plan_limits["max_concurrent"]),
                    bigquery.ScalarQueryParameter("trial_end_date", "DATE", trial_end)
                ]
            )
        ).result()

        logger.info(f"Subscription created: {subscription_id}")

    except Exception as e:
        logger.error(f"Failed to create subscription: {e}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to create subscription: {str(e)}"
        )

    # ============================================
    # STEP 4: Create initial usage quota record in customers.customer_usage_quotas
    # ============================================
    try:
        logger.info(f"Creating usage quota for customer: {customer_id}")

        usage_id = f"{customer_id}_{date.today().strftime('%Y%m%d')}"

        insert_usage_query = f"""
        INSERT INTO `{settings.gcp_project_id}.customers.customer_usage_quotas`
        (usage_id, customer_id, tenant_id, usage_date, pipelines_run_today, pipelines_succeeded_today,
         pipelines_failed_today, concurrent_pipelines_running, daily_limit, last_updated)
        VALUES
        (@usage_id, @customer_id, @tenant_id, CURRENT_DATE(), 0, 0, 0, 0, @daily_limit, CURRENT_TIMESTAMP())
        """

        bq_client.client.query(
            insert_usage_query,
            job_config=bigquery.QueryJobConfig(
                query_parameters=[
                    bigquery.ScalarQueryParameter("usage_id", "STRING", usage_id),
                    bigquery.ScalarQueryParameter("customer_id", "STRING", customer_id),
                    bigquery.ScalarQueryParameter("tenant_id", "STRING", tenant_id),
                    bigquery.ScalarQueryParameter("daily_limit", "INT64", plan_limits["max_daily"])
                ]
            )
        ).result()

        logger.info(f"Usage quota created: {usage_id}")

    except Exception as e:
        logger.error(f"Failed to create usage quota: {e}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to create usage quota: {str(e)}"
        )

    # ============================================
    # STEP 5: Create tenant dataset with ONLY operational tables
    # ============================================
    try:
        logger.info(f"Creating tenant dataset: {tenant_id}")

        # Create tenant dataset
        dataset_id = f"{settings.gcp_project_id}.{tenant_id}"

        if request.force_recreate_dataset:
            logger.warning(f"Force recreating dataset: {dataset_id}")
            bq_client.client.delete_dataset(dataset_id, delete_contents=True, not_found_ok=True)

        try:
            bq_client.client.get_dataset(dataset_id)
            logger.info(f"Dataset already exists: {dataset_id}")
        except Exception:
            dataset = bigquery.Dataset(dataset_id)
            dataset.location = settings.bigquery_location
            dataset.description = f"Operational data for tenant {tenant_id}"
            bq_client.client.create_dataset(dataset, timeout=30)
            logger.info(f"Created dataset: {dataset_id}")

        dataset_created = True

        # Create ONLY operational tables (NO API keys or credentials)
        operational_tables = [
            "x_meta_pipeline_runs",
            "x_meta_step_logs",
            "x_meta_dq_results"
        ]

        for table_name in operational_tables:
            table_id = f"{dataset_id}.{table_name}"

            if request.force_recreate_tables:
                bq_client.client.delete_table(table_id, not_found_ok=True)

            try:
                bq_client.client.get_table(table_id)
                logger.debug(f"Table already exists: {table_id}")
            except Exception:
                # Load schema from JSON
                schema_file = Path(settings.metadata_schemas_path) / f"{table_name}.json"
                if not schema_file.exists():
                    logger.error(f"Schema file not found: {schema_file}")
                    continue

                with open(schema_file, 'r') as f:
                    import json
                    schema_json = json.load(f)
                    schema = [bigquery.SchemaField.from_api_repr(field) for field in schema_json]

                table = bigquery.Table(table_id, schema=schema)

                # Add partitioning and clustering based on table type
                if table_name == "x_meta_pipeline_runs":
                    table.time_partitioning = bigquery.TimePartitioning(
                        type_=bigquery.TimePartitioningType.DAY,
                        field="start_time"
                    )
                    table.clustering_fields = ["tenant_id", "pipeline_id", "status"]
                elif table_name == "x_meta_step_logs":
                    table.time_partitioning = bigquery.TimePartitioning(
                        type_=bigquery.TimePartitioningType.DAY,
                        field="start_time"
                    )
                    table.clustering_fields = ["pipeline_logging_id", "status"]
                elif table_name == "x_meta_dq_results":
                    table.time_partitioning = bigquery.TimePartitioning(
                        type_=bigquery.TimePartitioningType.DAY,
                        field="ingestion_date"
                    )
                    table.clustering_fields = ["tenant_id", "target_table", "overall_status"]

                bq_client.client.create_table(table)
                logger.info(f"Created table: {table_id}")
                tables_created.append(table_name)

        logger.info(f"Tenant dataset created with {len(tables_created)} operational tables")

    except Exception as e:
        logger.error(f"Failed to create tenant dataset: {e}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to create tenant dataset: {str(e)}"
        )

    # ============================================
    # STEP 6: Run dry-run pipeline (optional validation)
    # ============================================
    dryrun_status = "SKIPPED"
    dryrun_message = "Dry-run pipeline skipped (optional)"

    try:
        dryrun_config_path = Path("configs/gcp/example/dryrun.yml")

        if dryrun_config_path.exists():
            logger.info(f"Running dry-run pipeline for tenant: {tenant_id}")

            executor = AsyncPipelineExecutor(
                tenant_id=tenant_id,
                pipeline_id="dryrun",
                trigger_type="onboarding",
                trigger_by="onboarding_api"
            )

            result = await executor.execute(parameters={})

            if result and result.get('status') in ['COMPLETED', 'COMPLETE', 'SUCCESS']:
                dryrun_status = "SUCCESS"
                dryrun_message = "Dryrun pipeline completed successfully"
            else:
                dryrun_status = "FAILED"
                dryrun_message = f"Dryrun pipeline failed: {result.get('error', 'Unknown error')}"
        else:
            logger.info("Dryrun config not found, skipping validation pipeline")

    except Exception as e:
        logger.error(f"Error running dryrun pipeline: {e}", exc_info=True)
        dryrun_status = "FAILED"
        dryrun_message = f"Dryrun error: {str(e)}"

    # ============================================
    # STEP 7: Return response
    # ============================================
    logger.info(f"Customer onboarding completed - customer_id: {customer_id}, tenant_id: {tenant_id}")

    return OnboardCustomerResponse(
        customer_id=customer_id,
        tenant_id=tenant_id,
        api_key=api_key,  # SAVE THIS - shown only once!
        subscription_plan=request.subscription_plan,
        dataset_created=dataset_created,
        tables_created=tables_created,
        dryrun_status=dryrun_status,
        message=f"Customer {request.company_name} onboarded successfully. API key generated. {dryrun_message}"
    )
