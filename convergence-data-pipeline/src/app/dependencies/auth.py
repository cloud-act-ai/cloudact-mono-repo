"""
API Key Authentication with Customer-Centric Architecture
Secure multi-tenant authentication using centralized customers dataset.
Supports subscription validation, quota management, and credential retrieval.
Fallback to local file-based API keys for development.
"""

import hashlib
import json
import os
from typing import Optional, Dict, Any
from pathlib import Path
from datetime import datetime, date
from fastapi import Header, HTTPException, status, Depends
from functools import lru_cache
import logging
from google.cloud import bigquery
from google.cloud import kms

from src.core.engine.bq_client import get_bigquery_client, BigQueryClient
from src.app.config import settings

logger = logging.getLogger(__name__)


class TenantContext:
    """Container for tenant context extracted from API key."""

    def __init__(self, tenant_id: str, api_key_hash: str):
        self.tenant_id = tenant_id
        self.api_key_hash = api_key_hash

    def __repr__(self) -> str:
        return f"TenantContext(tenant_id='{self.tenant_id}')"


def hash_api_key(api_key: str) -> str:
    """
    Create SHA256 hash of API key for secure storage/comparison.

    Args:
        api_key: Plain text API key

    Returns:
        SHA256 hex digest
    """
    return hashlib.sha256(api_key.encode()).hexdigest()


# ============================================
# Customer-Centric Authentication Functions
# ============================================


async def get_current_customer(
    api_key: str = Header(..., alias="X-API-Key"),
    bq_client: BigQueryClient = Depends(get_bigquery_client)
) -> Dict[str, Any]:
    """
    Authenticate customer using API key from centralized customers.customer_api_keys table.

    Returns customer profile with subscription info.

    Args:
        api_key: API key from X-API-Key header
        bq_client: BigQuery client instance

    Returns:
        Dict containing:
            - customer_id: Unique customer identifier
            - company_name: Customer company name
            - admin_email: Customer admin email
            - status: Customer status (ACTIVE, SUSPENDED, etc.)
            - subscription: Subscription details with limits
            - api_key_id: ID of the API key used

    Raises:
        HTTPException: If API key invalid, inactive, or customer suspended
    """
    # Check if authentication is disabled (development mode)
    if settings.disable_auth:
        logger.warning(f"Authentication disabled - using default customer '{settings.default_tenant_id}'")
        # Return mock customer for development
        return {
            "customer_id": settings.default_tenant_id,
            "company_name": "Development Customer",
            "admin_email": "dev@example.com",
            "status": "ACTIVE",
            "subscription": {
                "plan_name": "ENTERPRISE",
                "status": "ACTIVE",
                "max_pipelines_per_day": 999999,
                "max_pipelines_per_month": 999999,
                "max_concurrent_pipelines": 999999
            },
            "api_key_id": "dev-key"
        }

    # Hash the API key
    api_key_hash = hash_api_key(api_key)

    # Query customers.customer_api_keys for authentication
    query = f"""
    SELECT
        k.api_key_id,
        k.customer_id,
        k.is_active as key_active,
        k.expires_at,
        k.scopes,
        p.company_name,
        p.admin_email,
        p.status as customer_status,
        p.tenant_dataset_id,
        s.subscription_id,
        s.plan_name,
        s.status as subscription_status,
        s.max_pipelines_per_day,
        s.max_pipelines_per_month,
        s.max_concurrent_pipelines,
        s.trial_end_date,
        s.subscription_end_date
    FROM `{settings.gcp_project_id}.customers.customer_api_keys` k
    INNER JOIN `{settings.gcp_project_id}.customers.customer_profiles` p
        ON k.customer_id = p.customer_id
    INNER JOIN `{settings.gcp_project_id}.customers.customer_subscriptions` s
        ON p.customer_id = s.customer_id
    WHERE k.api_key_hash = @api_key_hash
        AND k.is_active = TRUE
        AND p.status = 'ACTIVE'
        AND s.status = 'ACTIVE'
    LIMIT 1
    """

    try:
        results = list(bq_client.query(
            query,
            parameters=[
                bigquery.ScalarQueryParameter("api_key_hash", "STRING", api_key_hash)
            ]
        ))

        if not results:
            logger.warning(f"Authentication failed - invalid or inactive API key")
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Invalid or inactive API key",
                headers={"WWW-Authenticate": "ApiKey"},
            )

        row = results[0]

        # Check if API key has expired
        if row.get("expires_at") and row["expires_at"] < datetime.utcnow():
            logger.warning(f"API key expired for customer: {row['customer_id']}")
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="API key has expired",
                headers={"WWW-Authenticate": "ApiKey"},
            )

        # Update last_used_at timestamp (async, best effort)
        update_query = f"""
        UPDATE `{settings.gcp_project_id}.customers.customer_api_keys`
        SET last_used_at = CURRENT_TIMESTAMP()
        WHERE api_key_id = @api_key_id
        """

        try:
            bq_client.client.query(
                update_query,
                job_config=bigquery.QueryJobConfig(
                    query_parameters=[
                        bigquery.ScalarQueryParameter("api_key_id", "STRING", row["api_key_id"])
                    ]
                )
            ).result()
        except Exception as e:
            logger.warning(f"Failed to update last_used_at: {e}")

        # Build customer object
        customer = {
            "customer_id": row["customer_id"],
            "company_name": row["company_name"],
            "admin_email": row["admin_email"],
            "status": row["customer_status"],
            "tenant_dataset_id": row["tenant_dataset_id"],
            "api_key_id": row["api_key_id"],
            "scopes": row.get("scopes", []),
            "subscription": {
                "subscription_id": row["subscription_id"],
                "plan_name": row["plan_name"],
                "status": row["subscription_status"],
                "max_pipelines_per_day": row["max_pipelines_per_day"],
                "max_pipelines_per_month": row["max_pipelines_per_month"],
                "max_concurrent_pipelines": row["max_concurrent_pipelines"],
                "trial_end_date": row.get("trial_end_date"),
                "subscription_end_date": row.get("subscription_end_date")
            }
        }

        logger.info(f"Authenticated customer: {customer['customer_id']} ({customer['company_name']})")
        return customer

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error during customer authentication: {e}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Authentication service error"
        )


async def validate_subscription(
    customer: Dict = Depends(get_current_customer),
    bq_client: BigQueryClient = Depends(get_bigquery_client)
) -> Dict[str, Any]:
    """
    Validate customer subscription is active and not expired.

    Raises HTTPException if subscription invalid.

    Args:
        customer: Customer object from get_current_customer
        bq_client: BigQuery client instance

    Returns:
        Subscription info with limits

    Raises:
        HTTPException: If subscription expired or inactive
    """
    subscription = customer.get("subscription", {})

    # Check subscription status
    if subscription.get("status") != "ACTIVE":
        logger.warning(f"Inactive subscription for customer: {customer['customer_id']}")
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=f"Subscription is {subscription.get('status')}. Please contact support."
        )

    # Check trial expiration
    trial_end = subscription.get("trial_end_date")
    if trial_end and isinstance(trial_end, (datetime, date)):
        trial_end_date = trial_end if isinstance(trial_end, date) else trial_end.date()
        if trial_end_date < date.today():
            logger.warning(f"Trial expired for customer: {customer['customer_id']}")
            raise HTTPException(
                status_code=status.HTTP_402_PAYMENT_REQUIRED,
                detail="Trial period has expired. Please upgrade your subscription."
            )

    # Check subscription expiration
    sub_end = subscription.get("subscription_end_date")
    if sub_end and isinstance(sub_end, (datetime, date)):
        sub_end_date = sub_end if isinstance(sub_end, date) else sub_end.date()
        if sub_end_date < date.today():
            logger.warning(f"Subscription expired for customer: {customer['customer_id']}")
            raise HTTPException(
                status_code=status.HTTP_402_PAYMENT_REQUIRED,
                detail="Subscription has expired. Please renew your subscription."
            )

    logger.info(f"Subscription validated for customer: {customer['customer_id']}")
    return subscription


async def validate_quota(
    customer: Dict = Depends(get_current_customer),
    subscription: Dict = Depends(validate_subscription),
    bq_client: BigQueryClient = Depends(get_bigquery_client)
) -> Dict[str, Any]:
    """
    Validate customer has not exceeded daily/monthly pipeline quotas.

    Checks customers.customer_usage_quotas table.
    Returns quota info or raises HTTPException if exceeded.

    Args:
        customer: Customer object from get_current_customer
        subscription: Subscription info from validate_subscription
        bq_client: BigQuery client instance

    Returns:
        Dict containing:
            - pipelines_run_today: Current daily usage
            - pipelines_run_month: Current monthly usage
            - concurrent_pipelines_running: Current concurrent pipelines
            - daily_limit: Daily limit from subscription
            - monthly_limit: Monthly limit from subscription
            - concurrent_limit: Concurrent limit from subscription
            - remaining_today: Remaining daily quota
            - remaining_month: Remaining monthly quota

    Raises:
        HTTPException: 429 if quota exceeded
    """
    customer_id = customer["customer_id"]
    today = date.today()

    # Get or create today's usage record
    query = f"""
    SELECT
        usage_id,
        pipelines_run_today,
        pipelines_run_month,
        concurrent_pipelines_running,
        daily_limit,
        monthly_limit,
        concurrent_limit
    FROM `{settings.gcp_project_id}.customers.customer_usage_quotas`
    WHERE customer_id = @customer_id
        AND usage_date = @usage_date
    LIMIT 1
    """

    try:
        results = list(bq_client.query(
            query,
            parameters=[
                bigquery.ScalarQueryParameter("customer_id", "STRING", customer_id),
                bigquery.ScalarQueryParameter("usage_date", "DATE", today)
            ]
        ))

        if not results:
            # Create today's usage record
            usage_id = f"{customer_id}_{today.strftime('%Y%m%d')}"
            insert_query = f"""
            INSERT INTO `{settings.gcp_project_id}.customers.customer_usage_quotas`
            (usage_id, customer_id, usage_date, pipelines_run_today, pipelines_failed_today,
             pipelines_succeeded_today, pipelines_run_month, concurrent_pipelines_running,
             daily_limit, monthly_limit, concurrent_limit, created_at)
            VALUES (
                @usage_id,
                @customer_id,
                @usage_date,
                0, 0, 0, 0, 0,
                @daily_limit,
                @monthly_limit,
                @concurrent_limit,
                CURRENT_TIMESTAMP()
            )
            """

            bq_client.client.query(
                insert_query,
                job_config=bigquery.QueryJobConfig(
                    query_parameters=[
                        bigquery.ScalarQueryParameter("usage_id", "STRING", usage_id),
                        bigquery.ScalarQueryParameter("customer_id", "STRING", customer_id),
                        bigquery.ScalarQueryParameter("usage_date", "DATE", today),
                        bigquery.ScalarQueryParameter("daily_limit", "INT64", subscription["max_pipelines_per_day"]),
                        bigquery.ScalarQueryParameter("monthly_limit", "INT64", subscription["max_pipelines_per_month"]),
                        bigquery.ScalarQueryParameter("concurrent_limit", "INT64", subscription["max_concurrent_pipelines"])
                    ]
                )
            ).result()

            # Return fresh quota
            return {
                "pipelines_run_today": 0,
                "pipelines_run_month": 0,
                "concurrent_pipelines_running": 0,
                "daily_limit": subscription["max_pipelines_per_day"],
                "monthly_limit": subscription["max_pipelines_per_month"],
                "concurrent_limit": subscription["max_concurrent_pipelines"],
                "remaining_today": subscription["max_pipelines_per_day"],
                "remaining_month": subscription["max_pipelines_per_month"]
            }

        # Check existing usage
        usage = results[0]

        # Check daily limit
        if usage["pipelines_run_today"] >= usage["daily_limit"]:
            logger.warning(f"Daily quota exceeded for customer: {customer_id}")
            raise HTTPException(
                status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                detail=f"Daily pipeline quota exceeded ({usage['daily_limit']} pipelines/day). Try again tomorrow.",
                headers={"Retry-After": "86400"}  # 24 hours
            )

        # Check monthly limit
        if usage["pipelines_run_month"] >= usage["monthly_limit"]:
            logger.warning(f"Monthly quota exceeded for customer: {customer_id}")
            raise HTTPException(
                status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                detail=f"Monthly pipeline quota exceeded ({usage['monthly_limit']} pipelines/month). Upgrade your plan.",
            )

        # Check concurrent limit
        if usage["concurrent_pipelines_running"] >= usage["concurrent_limit"]:
            logger.warning(f"Concurrent pipeline limit reached for customer: {customer_id}")
            raise HTTPException(
                status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                detail=f"Concurrent pipeline limit reached ({usage['concurrent_limit']} pipelines). Wait for running pipelines to complete.",
                headers={"Retry-After": "300"}  # 5 minutes
            )

        # Return quota info
        quota_info = {
            "pipelines_run_today": usage["pipelines_run_today"],
            "pipelines_run_month": usage["pipelines_run_month"],
            "concurrent_pipelines_running": usage["concurrent_pipelines_running"],
            "daily_limit": usage["daily_limit"],
            "monthly_limit": usage["monthly_limit"],
            "concurrent_limit": usage["concurrent_limit"],
            "remaining_today": usage["daily_limit"] - usage["pipelines_run_today"],
            "remaining_month": usage["monthly_limit"] - usage["pipelines_run_month"]
        }

        logger.info(f"Quota validated for customer: {customer_id} - {quota_info['remaining_today']} remaining today")
        return quota_info

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error validating quota: {e}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Quota validation service error"
        )


async def increment_pipeline_usage(
    customer_id: str,
    pipeline_status: str,
    bq_client: BigQueryClient
):
    """
    Increment usage counters after pipeline execution.

    Updates customers.customer_usage_quotas.

    Args:
        customer_id: Customer identifier
        pipeline_status: Pipeline execution status (SUCCESS, FAILED, RUNNING)
        bq_client: BigQuery client instance
    """
    today = date.today()

    # Determine which counters to increment
    if pipeline_status == "RUNNING":
        # Increment concurrent counter
        update_query = f"""
        UPDATE `{settings.gcp_project_id}.customers.customer_usage_quotas`
        SET concurrent_pipelines_running = concurrent_pipelines_running + 1
        WHERE customer_id = @customer_id
            AND usage_date = @usage_date
        """
    elif pipeline_status in ["SUCCESS", "FAILED"]:
        # Increment completion counters and decrement concurrent
        success_increment = "1" if pipeline_status == "SUCCESS" else "0"
        failed_increment = "1" if pipeline_status == "FAILED" else "0"

        update_query = f"""
        UPDATE `{settings.gcp_project_id}.customers.customer_usage_quotas`
        SET
            pipelines_run_today = pipelines_run_today + 1,
            pipelines_run_month = pipelines_run_month + 1,
            pipelines_succeeded_today = pipelines_succeeded_today + {success_increment},
            pipelines_failed_today = pipelines_failed_today + {failed_increment},
            concurrent_pipelines_running = GREATEST(concurrent_pipelines_running - 1, 0)
        WHERE customer_id = @customer_id
            AND usage_date = @usage_date
        """
    else:
        logger.warning(f"Unknown pipeline status: {pipeline_status}")
        return

    try:
        bq_client.client.query(
            update_query,
            job_config=bigquery.QueryJobConfig(
                query_parameters=[
                    bigquery.ScalarQueryParameter("customer_id", "STRING", customer_id),
                    bigquery.ScalarQueryParameter("usage_date", "DATE", today)
                ]
            )
        ).result()

        logger.info(f"Updated usage for customer {customer_id}: status={pipeline_status}")

    except Exception as e:
        logger.error(f"Failed to increment pipeline usage: {e}", exc_info=True)


async def get_customer_credentials(
    customer_id: str,
    provider: str,
    bq_client: BigQueryClient
) -> Dict[str, Any]:
    """
    Retrieve and decrypt customer cloud credentials for a specific provider.

    Returns decrypted credentials for pipeline execution.

    Args:
        customer_id: Customer identifier
        provider: Cloud provider (GCP, AWS, AZURE, OPENAI, CLAUDE)
        bq_client: BigQuery client instance

    Returns:
        Dict containing:
            - credential_id: Credential identifier
            - provider: Cloud provider
            - credential_type: Type of credential
            - credentials: Decrypted credential JSON
            - project_id: GCP project or AWS account
            - region: Default region

    Raises:
        HTTPException: If credentials not found or decryption fails
    """
    query = f"""
    SELECT
        credential_id,
        provider,
        credential_type,
        credential_name,
        encrypted_credentials,
        project_id,
        region,
        scopes,
        validation_status
    FROM `{settings.gcp_project_id}.customers.customer_cloud_credentials`
    WHERE customer_id = @customer_id
        AND provider = @provider
        AND is_active = TRUE
        AND validation_status = 'VALID'
    LIMIT 1
    """

    try:
        results = list(bq_client.query(
            query,
            parameters=[
                bigquery.ScalarQueryParameter("customer_id", "STRING", customer_id),
                bigquery.ScalarQueryParameter("provider", "STRING", provider.upper())
            ]
        ))

        if not results:
            logger.warning(f"No active credentials found for customer {customer_id}, provider {provider}")
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"No active {provider} credentials configured for this customer"
            )

        row = results[0]

        # Decrypt credentials using KMS
        encrypted_bytes = row["encrypted_credentials"]

        try:
            # Initialize KMS client
            kms_client = kms.KeyManagementServiceClient()

            # Get KMS key name
            if settings.kms_key_name:
                key_name = settings.kms_key_name
            else:
                kms_project = settings.kms_project_id or settings.gcp_project_id
                key_name = f"projects/{kms_project}/locations/{settings.kms_location}/keyRings/{settings.kms_keyring}/cryptoKeys/{settings.kms_key}"

            # Decrypt
            decrypt_response = kms_client.decrypt(
                request={"name": key_name, "ciphertext": encrypted_bytes}
            )

            decrypted_data = decrypt_response.plaintext.decode("utf-8")
            credentials_json = json.loads(decrypted_data)

        except Exception as e:
            logger.error(f"Failed to decrypt credentials: {e}", exc_info=True)
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail="Failed to decrypt credentials"
            )

        # Return decrypted credentials
        result = {
            "credential_id": row["credential_id"],
            "provider": row["provider"],
            "credential_type": row["credential_type"],
            "credential_name": row["credential_name"],
            "credentials": credentials_json,
            "project_id": row.get("project_id"),
            "region": row.get("region"),
            "scopes": row.get("scopes", [])
        }

        logger.info(f"Retrieved credentials for customer {customer_id}, provider {provider}")
        return result

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error retrieving customer credentials: {e}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Credential retrieval service error"
        )


async def get_provider_config(
    customer_id: str,
    provider: str,
    domain: str,
    bq_client: BigQueryClient
) -> Dict[str, Any]:
    """
    Get customer's provider-specific configuration.

    Returns source_project_id, source_dataset, notification_emails, default_parameters.

    Args:
        customer_id: Customer identifier
        provider: Cloud provider (GCP, AWS, etc.)
        domain: Data domain (COST, SECURITY, COMPLIANCE, etc.)
        bq_client: BigQuery client instance

    Returns:
        Dict containing:
            - provider: Cloud provider
            - domain: Data domain
            - source_project_id: Source GCP project or AWS account
            - source_dataset: Source dataset/database
            - notification_emails: List of email addresses
            - default_parameters: Default pipeline parameters

    Raises:
        HTTPException: If configuration not found
    """
    query = f"""
    SELECT
        config_id,
        provider,
        domain,
        source_project_id,
        source_dataset,
        notification_emails,
        default_parameters,
        is_active
    FROM `{settings.gcp_project_id}.customers.customer_provider_configs`
    WHERE customer_id = @customer_id
        AND provider = @provider
        AND domain = @domain
        AND is_active = TRUE
    LIMIT 1
    """

    try:
        results = list(bq_client.query(
            query,
            parameters=[
                bigquery.ScalarQueryParameter("customer_id", "STRING", customer_id),
                bigquery.ScalarQueryParameter("provider", "STRING", provider.upper()),
                bigquery.ScalarQueryParameter("domain", "STRING", domain.upper())
            ]
        ))

        if not results:
            # Return default configuration if not found
            logger.info(f"No provider config found for customer {customer_id}, provider {provider}, domain {domain} - using defaults")
            return {
                "provider": provider.upper(),
                "domain": domain.upper(),
                "source_project_id": None,
                "source_dataset": None,
                "notification_emails": [],
                "default_parameters": {}
            }

        row = results[0]

        config = {
            "config_id": row["config_id"],
            "provider": row["provider"],
            "domain": row["domain"],
            "source_project_id": row.get("source_project_id"),
            "source_dataset": row.get("source_dataset"),
            "notification_emails": row.get("notification_emails", []),
            "default_parameters": row.get("default_parameters", {})
        }

        logger.info(f"Retrieved provider config for customer {customer_id}: {provider}/{domain}")
        return config

    except Exception as e:
        logger.error(f"Error retrieving provider config: {e}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Provider configuration service error"
        )


# ============================================
# Legacy Tenant-Based Authentication (Backward Compatibility)
# ============================================


async def get_tenant_from_local_file(api_key_hash: str) -> Optional[str]:
    """
    Look up tenant_id from local file-based API keys (development fallback).

    Args:
        api_key_hash: SHA256 hash of API key

    Returns:
        tenant_id if found, None otherwise
    """
    # Expand ~ to home directory if present
    secrets_base_str = os.path.expanduser(settings.secrets_base_path)
    secrets_base = Path(secrets_base_str)

    if not secrets_base.exists():
        return None

    # Search through tenant directories
    for tenant_dir in secrets_base.iterdir():
        if not tenant_dir.is_dir():
            continue

        metadata_file = tenant_dir / "api_key_metadata.json"
        if not metadata_file.exists():
            continue

        try:
            with open(metadata_file, 'r') as f:
                metadata = json.load(f)

            if metadata.get("api_key_hash") == api_key_hash:
                tenant_id = metadata.get("tenant_id")
                logger.info(f"Found API key in local file for tenant: {tenant_id}")
                return tenant_id

        except Exception as e:
            logger.warning(f"Error reading {metadata_file}: {e}")
            continue

    return None


async def get_tenant_from_api_key(
    api_key_hash: str,
    bq_client: BigQueryClient
) -> Optional[str]:
    """
    Look up tenant_id from API key hash in BigQuery.
    Searches all tenant datasets' api_keys tables using UNION ALL.
    Falls back to local file-based lookup if BigQuery fails.

    New Architecture: API keys stored in {tenant_id}.api_keys tables.

    Args:
        api_key_hash: SHA256 hash of API key
        bq_client: BigQuery client instance

    Returns:
        tenant_id if found and active, None otherwise
    """
    # Query across all tenant datasets using INFORMATION_SCHEMA
    query = f"""
    SELECT tenant_id, is_active
    FROM (
      SELECT table_schema AS tenant_id
      FROM `{settings.gcp_project_id}.region-{settings.bigquery_location}.INFORMATION_SCHEMA.TABLES`
      WHERE table_name = 'x_meta_api_keys'
        AND table_schema NOT IN ('information_schema', 'metadata', 'pg_catalog')
    ) AS tenant_datasets
    LEFT JOIN `{settings.gcp_project_id}.{{tenant_id}}.x_meta_api_keys` AS api_keys
      USING (tenant_id)
    WHERE api_keys.api_key_hash = @api_key_hash
      AND api_keys.is_active = TRUE
    LIMIT 1
    """

    try:
        # First, get all datasets (using standard INFORMATION_SCHEMA instead of regional)
        # Then check each one for x_meta_api_keys table existence
        datasets_query = f"""
        SELECT schema_name
        FROM `{settings.gcp_project_id}.INFORMATION_SCHEMA.SCHEMATA`
        WHERE schema_name NOT IN ('information_schema', 'metadata', 'pg_catalog')
        """

        logger.info(f"[AUTH DEBUG] Looking up API key hash: {api_key_hash[:20]}...")
        all_datasets = list(bq_client.client.query(datasets_query).result())
        logger.info(f"[AUTH DEBUG] Found {len(all_datasets)} tenant datasets")

        # Filter to only datasets that have x_meta_api_keys table
        datasets = []
        for row in all_datasets:
            schema_name = row['schema_name']
            try:
                # Check if x_meta_api_keys table exists in this dataset
                table_check = f"""
                SELECT COUNT(*) as cnt
                FROM `{settings.gcp_project_id}.{schema_name}.INFORMATION_SCHEMA.TABLES`
                WHERE table_name = 'x_meta_api_keys'
                """
                result = list(bq_client.client.query(table_check).result())
                if result and result[0]['cnt'] > 0:
                    datasets.append({'table_schema': schema_name})
            except Exception as e:
                logger.debug(f"[AUTH DEBUG] Skipping dataset {schema_name}: {e}")
                continue

        logger.info(f"[AUTH DEBUG] Found {len(datasets)} datasets with x_meta_api_keys table")

        if not datasets:
            logger.warning(f"No tenant datasets with x_meta_api_keys table found")
            return await get_tenant_from_local_file(api_key_hash)

        # Build UNION ALL query across all tenant x_meta_api_keys tables
        union_parts = []
        for row in datasets:
            tenant_id = row['table_schema']
            logger.info(f"[AUTH DEBUG] Adding dataset to UNION query: {tenant_id}")
            union_parts.append(f"""
                SELECT tenant_id, is_active
                FROM `{settings.gcp_project_id}.{tenant_id}.x_meta_api_keys`
                WHERE api_key_hash = @api_key_hash
            """)

        if not union_parts:
            return await get_tenant_from_local_file(api_key_hash)

        union_query = " UNION ALL ".join(union_parts) + " LIMIT 1"
        logger.info(f"[AUTH DEBUG] Executing UNION query:\n{union_query}")
        logger.info(f"[AUTH DEBUG] With parameter: api_key_hash = {api_key_hash[:20]}...")

        results = list(bq_client.query(
            union_query,
            parameters=[
                bigquery.ScalarQueryParameter("api_key_hash", "STRING", api_key_hash)
            ]
        ))

        logger.info(f"[AUTH DEBUG] Query returned {len(results)} results")

        if not results:
            logger.warning(f"API key not found in any tenant dataset, trying local files")
            return await get_tenant_from_local_file(api_key_hash)

        row = results[0]
        logger.info(f"[AUTH DEBUG] First result row: tenant_id={row.get('tenant_id')}, is_active={row.get('is_active')}")

        if not row.get("is_active", False):
            logger.warning(f"API key is inactive for tenant: {row.get('tenant_id')}")
            return None

        tenant_id = row["tenant_id"]
        logger.info(f"[AUTH DEBUG] Returning tenant_id: {tenant_id}")
        return tenant_id

    except Exception as e:
        logger.warning(f"BigQuery lookup failed: {e}, trying local files")
        # Fallback to local file lookup
        return await get_tenant_from_local_file(api_key_hash)


async def verify_api_key(
    x_api_key: Optional[str] = Header(None, description="API Key for authentication"),
    bq_client: BigQueryClient = Depends(get_bigquery_client)
) -> TenantContext:
    """
    FastAPI dependency to verify API key and extract tenant context.

    Args:
        x_api_key: API key from X-API-Key header
        bq_client: BigQuery client (injected)

    Returns:
        TenantContext with tenant_id

    Raises:
        HTTPException: If API key is invalid or inactive (when auth is enabled)
    """
    # Check if authentication is disabled
    if settings.disable_auth:
        logger.warning(f"Authentication is disabled - using default tenant '{settings.default_tenant_id}'")
        return TenantContext(tenant_id=settings.default_tenant_id, api_key_hash="disabled")

    if not x_api_key:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Missing API key",
            headers={"WWW-Authenticate": "ApiKey"},
        )

    # Hash the API key
    api_key_hash = hash_api_key(x_api_key)

    # Look up tenant
    tenant_id = await get_tenant_from_api_key(api_key_hash, bq_client)

    if not tenant_id:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or inactive API key",
            headers={"WWW-Authenticate": "ApiKey"},
        )

    logger.info(f"Authenticated request for tenant: {tenant_id}")

    return TenantContext(tenant_id=tenant_id, api_key_hash=api_key_hash)


async def verify_api_key_header(
    x_api_key: str = Header(..., description="API Key for authentication"),
    bq_client: BigQueryClient = Depends(get_bigquery_client)
) -> TenantContext:
    """
    FastAPI dependency to verify API key from X-API-Key header (required).

    This is a stricter version of verify_api_key that always requires the header.
    Use this for new endpoints that need explicit authentication.

    Args:
        x_api_key: API key from X-API-Key header (required)
        bq_client: BigQuery client (injected)

    Returns:
        TenantContext with tenant_id

    Raises:
        HTTPException: If API key is invalid or inactive
    """
    # Check if authentication is disabled
    if settings.disable_auth:
        logger.warning(f"Authentication is disabled - using default tenant '{settings.default_tenant_id}'")
        return TenantContext(tenant_id=settings.default_tenant_id, api_key_hash="disabled")

    # Hash the API key
    api_key_hash = hash_api_key(x_api_key)

    # Look up tenant
    tenant_id = await get_tenant_from_api_key(api_key_hash, bq_client)

    if not tenant_id:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or inactive API key",
            headers={"WWW-Authenticate": "ApiKey"},
        )

    logger.info(f"Authenticated request for tenant: {tenant_id}")

    return TenantContext(tenant_id=tenant_id, api_key_hash=api_key_hash)


# Optional: Allow unauthenticated access for health checks
async def optional_auth(
    x_api_key: Optional[str] = Header(None),
    bq_client: BigQueryClient = Depends(get_bigquery_client)
) -> Optional[TenantContext]:
    """
    Optional authentication dependency.

    Returns:
        TenantContext if API key provided and valid, None otherwise
    """
    if not x_api_key:
        return None

    try:
        return await verify_api_key(x_api_key, bq_client)
    except HTTPException:
        return None


async def verify_admin_key(
    x_admin_key: str = Header(..., description="Admin API Key for platform operations")
) -> None:
    """
    FastAPI dependency to verify admin API key for platform-level operations.

    This is used for endpoints that manage tenants, API keys, and other platform
    operations that exist outside the tenant scope.

    Args:
        x_admin_key: Admin API key from X-Admin-Key header (required)

    Raises:
        HTTPException: If admin key is invalid or not configured
    """
    # Check if admin key is configured
    if not settings.admin_api_key:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Admin API key not configured. Set ADMIN_API_KEY environment variable.",
        )

    # Verify the admin key
    if x_admin_key != settings.admin_api_key:
        logger.warning("Invalid admin API key attempt")
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Invalid admin API key",
            headers={"WWW-Authenticate": "AdminKey"},
        )

    logger.info("Admin authentication successful")
