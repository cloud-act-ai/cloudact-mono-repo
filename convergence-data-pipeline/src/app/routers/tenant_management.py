"""
Customer Management API Routes
Complete customer lifecycle management including onboarding, API keys, credentials, team, and usage.
"""

from fastapi import APIRouter, Depends, HTTPException, status, Header
from pydantic import BaseModel, Field, validator, EmailStr
from typing import List, Optional, Dict, Any
from datetime import datetime, timedelta
from enum import Enum
import hashlib
import secrets
import uuid
import logging
import json
from google.cloud import bigquery

from src.app.dependencies.auth import verify_api_key_header, TenantContext
from src.core.engine.bq_client import get_bigquery_client, BigQueryClient
from src.core.security.kms_encryption import encrypt_value_base64, decrypt_value_base64
from src.core.metadata.initializer import ensure_tenant_metadata
from src.app.config import settings
from src.app.models.tenant_models import UpgradeSubscriptionRequest, UpdateLimitsRequest, SUBSCRIPTION_LIMITS

router = APIRouter()
logger = logging.getLogger(__name__)


# ============================================
# Enums
# ============================================

class ProviderType(str, Enum):
    """Cloud provider types."""
    GCP = "gcp"
    AWS = "aws"
    AZURE = "azure"
    OPENAI = "openai"
    ANTHROPIC = "anthropic"


class CredentialType(str, Enum):
    """Credential type options."""
    SERVICE_ACCOUNT_KEY = "service_account_key"
    ACCESS_KEY = "access_key"
    API_KEY = "api_key"
    OAUTH_TOKEN = "oauth_token"
    CONNECTION_STRING = "connection_string"


class SubscriptionPlan(str, Enum):
    """Subscription plan tiers."""
    FREE = "free"
    STARTER = "starter"
    PROFESSIONAL = "professional"
    ENTERPRISE = "enterprise"


# TeamRole enum removed - User management is now handled by Supabase frontend
# The data pipeline only receives user_id via X-User-ID header for logging purposes


# ============================================
# Request/Response Models
# ============================================

# --- Onboarding ---

class OnboardCustomerRequest(BaseModel):
    """Request to onboard a new customer."""
    tenant_id: str = Field(..., description="Unique customer/tenant identifier")
    company_name: str = Field(..., description="Company name")
    admin_email: EmailStr = Field(..., description="Administrator email address")
    subscription_plan: SubscriptionPlan = Field(default=SubscriptionPlan.FREE)


class OnboardCustomerResponse(BaseModel):
    """Response for customer onboarding."""
    tenant_id: str
    dataset_id: str
    api_key: str  # Show once!
    status: str
    message: str


# --- Customer Profile ---

class CustomerProfile(BaseModel):
    """Customer profile information."""
    tenant_id: str
    company_name: str
    admin_email: str
    subscription_plan: str
    created_at: datetime
    updated_at: datetime
    is_active: bool


class UpdateCustomerRequest(BaseModel):
    """Request to update customer profile."""
    company_name: Optional[str] = None
    admin_email: Optional[EmailStr] = None


# --- Subscription ---

class SubscriptionLimits(BaseModel):
    """Subscription plan limits."""
    max_pipelines_per_month: int
    max_team_members: int
    max_providers: int
    max_api_keys: int
    concurrent_pipelines: int


class SubscriptionInfo(BaseModel):
    """Current subscription information."""
    tenant_id: str
    plan: str
    limits: SubscriptionLimits
    usage: Dict[str, int]
    is_active: bool


class UpdateSubscriptionRequest(BaseModel):
    """Request to update subscription (from Stripe webhook)."""
    plan: SubscriptionPlan
    effective_date: Optional[datetime] = None


# --- API Keys ---

class CreateAPIKeyRequest(BaseModel):
    """Request to create new API key."""
    key_name: str = Field(..., description="Friendly name for this API key")
    scopes: List[str] = Field(default=["*"], description="API scopes/permissions")
    expires_in_days: Optional[int] = Field(default=None, ge=1, le=365, description="Key expiration in days (null = never)")


class APIKeyResponse(BaseModel):
    """API key information (hashed)."""
    api_key_id: str
    key_name: Optional[str] = None
    api_key_hash: str
    created_at: datetime
    expires_at: Optional[datetime]
    is_active: bool
    scopes: List[str]


class CreateAPIKeyResponse(APIKeyResponse):
    """Response when creating new API key (includes plaintext key)."""
    api_key: str  # Only shown once!


# --- Cloud Credentials ---

class CreateCredentialRequest(BaseModel):
    """Request to add cloud provider credentials."""
    provider: ProviderType
    credential_type: CredentialType
    credentials_json: Dict[str, Any] = Field(..., description="Credential data (will be encrypted)")
    description: Optional[str] = None


class CredentialMetadata(BaseModel):
    """Credential metadata (no secrets)."""
    credential_id: str
    provider: str
    credential_type: str
    description: Optional[str]
    created_at: datetime
    updated_at: datetime
    is_active: bool


class UpdateCredentialRequest(BaseModel):
    """Request to update credential."""
    credentials_json: Optional[Dict[str, Any]] = None
    description: Optional[str] = None
    is_active: Optional[bool] = None


# --- Provider Configuration ---

class CreateProviderConfigRequest(BaseModel):
    """Request to create provider-specific pipeline config."""
    provider: ProviderType
    domain: str = Field(..., description="Domain (e.g., cost, security, compliance)")
    source_project_id: Optional[str] = None
    source_dataset: Optional[str] = None
    notification_emails: List[EmailStr] = Field(default=[])
    default_parameters: Dict[str, Any] = Field(default={})


class ProviderConfig(BaseModel):
    """Provider configuration."""
    config_id: str
    tenant_id: str
    provider: str
    domain: str
    source_project_id: Optional[str]
    source_dataset: Optional[str]
    notification_emails: List[str]
    default_parameters: Dict[str, Any]
    created_at: datetime
    updated_at: datetime


class UpdateProviderConfigRequest(BaseModel):
    """Request to update provider config."""
    source_project_id: Optional[str] = None
    source_dataset: Optional[str] = None
    notification_emails: Optional[List[EmailStr]] = None
    default_parameters: Optional[Dict[str, Any]] = None


# --- Team Management (REMOVED - Managed by Supabase Frontend) ---
# User/team management is now handled by the Supabase frontend.
# The data pipeline only receives user_id via X-User-ID header for audit logging.


# --- Validation & Usage ---

class ValidateCustomerRequest(BaseModel):
    """Request to validate before pipeline run."""
    pipeline_id: str


class ValidateCustomerResponse(BaseModel):
    """Response for customer validation."""
    can_run_pipeline: bool
    quota_remaining: int
    subscription_status: str
    validation_errors: List[str] = []


class UsageStatistics(BaseModel):
    """Usage statistics."""
    tenant_id: str
    pipelines_today: int
    pipelines_this_month: int
    quota_limit: int
    quota_remaining: int
    trends: Dict[str, Any]


# ============================================
# Helper Functions
# ============================================

def hash_api_key(api_key: str) -> str:
    """Create SHA256 hash of API key."""
    return hashlib.sha256(api_key.encode()).hexdigest()


def get_subscription_limits(plan: str) -> SubscriptionLimits:
    """Get subscription limits based on plan."""
    limits_map = {
        "free": SubscriptionLimits(
            max_pipelines_per_month=100,
            max_team_members=3,
            max_providers=2,
            max_api_keys=5,
            concurrent_pipelines=1
        ),
        "starter": SubscriptionLimits(
            max_pipelines_per_month=1000,
            max_team_members=10,
            max_providers=5,
            max_api_keys=20,
            concurrent_pipelines=3
        ),
        "professional": SubscriptionLimits(
            max_pipelines_per_month=10000,
            max_team_members=50,
            max_providers=10,
            max_api_keys=100,
            concurrent_pipelines=10
        ),
        "enterprise": SubscriptionLimits(
            max_pipelines_per_month=100000,
            max_team_members=1000,
            max_providers=50,
            max_api_keys=1000,
            concurrent_pipelines=50
        )
    }
    return limits_map.get(plan.lower(), limits_map["free"])


# ============================================
# Onboarding & Profile Endpoints
# ============================================

@router.post(
    "/api/v1/tenants/onboard",
    response_model=OnboardCustomerResponse,
    summary="Onboard new customer",
    description="Create new customer account with dataset, API key, and default subscription"
)
async def onboard_customer(
    request: OnboardCustomerRequest,
    bq_client: BigQueryClient = Depends(get_bigquery_client)
):
    """
    Onboard a new customer to the platform.

    Called by frontend after Stripe signup.
    Creates: customer profile, tenant dataset, default subscription record.
    Returns: tenant_id, dataset_id, API key (save this!), status.
    """
    tenant_id = request.tenant_id
    logger.info(f"Starting customer onboarding for: {tenant_id}")

    try:
        # Step 1: Create tenant metadata infrastructure
        ensure_tenant_metadata(
            tenant_id=tenant_id,
            bq_client=bq_client.client
        )

        dataset_id = f"{settings.gcp_project_id}.{tenant_id}"

        # Step 2: Generate API key
        random_suffix = secrets.token_urlsafe(16)[:16]
        api_key = f"{tenant_id}_api_{random_suffix}"
        api_key_hash = hash_api_key(api_key)

        # Encrypt API key
        encrypted_api_key = encrypt_value_base64(api_key)
        api_key_id = str(uuid.uuid4())

        # Step 3: Store API key
        insert_api_key_query = f"""
        INSERT INTO `{settings.gcp_project_id}.{tenant_id}.x_meta_api_keys`
        (api_key_id, tenant_id, api_key_hash, encrypted_api_key, created_at, is_active)
        VALUES
        (@api_key_id, @tenant_id, @api_key_hash, @encrypted_api_key, CURRENT_TIMESTAMP(), TRUE)
        """

        bq_client.client.query(
            insert_api_key_query,
            job_config=bigquery.QueryJobConfig(
                query_parameters=[
                    bigquery.ScalarQueryParameter("api_key_id", "STRING", api_key_id),
                    bigquery.ScalarQueryParameter("tenant_id", "STRING", tenant_id),
                    bigquery.ScalarQueryParameter("api_key_hash", "STRING", api_key_hash),
                    bigquery.ScalarQueryParameter("encrypted_api_key", "STRING", encrypted_api_key),
                ]
            )
        ).result()

        # Step 4: Create customer profile record
        # Note: This would typically be in a separate tenants table
        # For now, we use the API keys table as proof of customer existence

        logger.info(f"Customer onboarding completed for: {tenant_id}")

        return OnboardCustomerResponse(
            tenant_id=tenant_id,
            dataset_id=dataset_id,
            api_key=api_key,
            status="active",
            message=f"Customer {tenant_id} onboarded successfully. Save your API key - it won't be shown again!"
        )

    except Exception as e:
        logger.error(f"Failed to onboard customer {tenant_id}: {e}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to onboard customer: {str(e)}"
        )


@router.get(
    "/api/v1/tenants/{tenant_id}",
    response_model=CustomerProfile,
    summary="Get customer profile",
    description="Retrieve customer profile information"
)
async def get_customer_profile(
    tenant_id: str,
    tenant: TenantContext = Depends(verify_api_key_header),
    bq_client: BigQueryClient = Depends(get_bigquery_client)
):
    """Get customer profile."""
    # Verify tenant_id matches authenticated tenant
    if tenant_id != tenant.tenant_id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Cannot access other customer's profile"
        )

    # Query customer info from API keys table (simplified)
    query = f"""
    SELECT
        tenant_id as tenant_id,
        tenant_id as company_name,
        'admin@example.com' as admin_email,
        'free' as subscription_plan,
        MIN(created_at) as created_at,
        MAX(created_at) as updated_at,
        TRUE as is_active
    FROM `{settings.gcp_project_id}.{tenant_id}.x_meta_api_keys`
    WHERE tenant_id = @tenant_id
    GROUP BY tenant_id
    LIMIT 1
    """

    results = list(bq_client.client.query(
        query,
        job_config=bigquery.QueryJobConfig(
            query_parameters=[
                bigquery.ScalarQueryParameter("tenant_id", "STRING", tenant_id)
            ]
        )
    ).result())

    if not results:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Customer {tenant_id} not found"
        )

    return CustomerProfile(**dict(results[0]))


@router.put(
    "/api/v1/tenants/{tenant_id}",
    response_model=CustomerProfile,
    summary="Update customer profile",
    description="Update customer profile information"
)
async def update_customer_profile(
    tenant_id: str,
    request: UpdateCustomerRequest,
    tenant: TenantContext = Depends(verify_api_key_header),
    bq_client: BigQueryClient = Depends(get_bigquery_client)
):
    """Update customer profile."""
    if tenant_id != tenant.tenant_id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Cannot update other customer's profile"
        )

    # In production, this would update a tenants table
    # For now, return current profile
    return await get_customer_profile(tenant_id, tenant, bq_client)


# ============================================
# Subscription Management Endpoints
# ============================================

@router.get(
    "/api/v1/tenants/{tenant_id}/subscription",
    summary="Get subscription info",
    description="Get current subscription plan, status, and limits from centralized tenants dataset"
)
async def get_subscription_info(
    tenant_id: str,
    tenant: TenantContext = Depends(verify_api_key_header),
    bq_client: BigQueryClient = Depends(get_bigquery_client)
):
    """
    Get customer's current subscription information from tenants.customer_subscriptions.

    Returns subscription plan, status, limits, trial info, and billing details.
    """
    if tenant_id != tenant.tenant_id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Cannot access other customer's subscription"
        )

    # Query subscription from centralized tenants dataset
    query = f"""
    SELECT
        s.subscription_id,
        s.tenant_id,
        s.plan_name,
        s.status,
        s.max_team_members,
        s.max_providers,
        s.max_pipelines_per_day,
        s.max_concurrent_pipelines,
        s.trial_start_date,
        s.trial_end_date,
        s.is_trial,
        s.subscription_start_date,
        s.subscription_end_date,
        s.billing_cycle,
        s.monthly_price_usd,
        s.stripe_subscription_id,
        s.auto_renew,
        s.next_billing_date,
        s.created_at,
        s.updated_at
    FROM `{settings.gcp_project_id}.tenants.customer_subscriptions` s
    WHERE s.tenant_id = @tenant_id
        AND s.status = 'ACTIVE'
    LIMIT 1
    """

    try:
        results = list(bq_client.client.query(
            query,
            job_config=bigquery.QueryJobConfig(
                query_parameters=[
                    bigquery.ScalarQueryParameter("tenant_id", "STRING", tenant_id)
                ]
            )
        ).result())

        if not results:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"No active subscription found for customer {tenant_id}"
            )

        row = results[0]

        return {
            "subscription_id": row["subscription_id"],
            "tenant_id": row["tenant_id"],
            "plan_name": row["plan_name"],
            "status": row["status"],
            "limits": {
                "max_team_members": row["max_team_members"],
                "max_providers": row["max_providers"],
                "max_pipelines_per_day": row["max_pipelines_per_day"],
                "max_concurrent_pipelines": row["max_concurrent_pipelines"]
            },
            "trial_info": {
                "is_trial": row.get("is_trial", False),
                "trial_start_date": row.get("trial_start_date"),
                "trial_end_date": row.get("trial_end_date")
            },
            "billing": {
                "subscription_start_date": row["subscription_start_date"],
                "subscription_end_date": row.get("subscription_end_date"),
                "billing_cycle": row.get("billing_cycle"),
                "monthly_price_usd": float(row.get("monthly_price_usd", 0)),
                "stripe_subscription_id": row.get("stripe_subscription_id"),
                "auto_renew": row.get("auto_renew", True),
                "next_billing_date": row.get("next_billing_date")
            },
            "created_at": row["created_at"],
            "updated_at": row["updated_at"]
        }

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Failed to retrieve subscription for {tenant_id}: {e}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to retrieve subscription: {str(e)}"
        )


@router.put(
    "/api/v1/tenants/{tenant_id}/subscription",
    summary="Update subscription",
    description="Update subscription plan and limits (typically called by Stripe webhook or admin)"
)
async def update_subscription_plan(
    tenant_id: str,
    request: UpdateSubscriptionRequest,
    tenant: TenantContext = Depends(verify_api_key_header),
    bq_client: BigQueryClient = Depends(get_bigquery_client)
):
    """
    Update customer subscription in tenants.customer_subscriptions.

    This endpoint is typically called by:
    1. Stripe webhooks when subscription changes
    2. Frontend when customer upgrades/downgrades
    3. Admin panel for manual adjustments
    """
    if tenant_id != tenant.tenant_id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Cannot update other customer's subscription"
        )

    # Update subscription in centralized dataset
    update_query = f"""
    UPDATE `{settings.gcp_project_id}.tenants.customer_subscriptions`
    SET
        plan_name = @plan_name,
        max_team_members = @max_team_members,
        max_providers = @max_providers,
        max_pipelines_per_day = @max_pipelines_per_day,
        max_pipelines_per_month = @max_pipelines_per_month,
        subscription_start_date = @subscription_start_date,
        subscription_end_date = @subscription_end_date,
        updated_at = CURRENT_TIMESTAMP()
    WHERE tenant_id = @tenant_id
        AND status = 'ACTIVE'
    """

    try:
        job = bq_client.client.query(
            update_query,
            job_config=bigquery.QueryJobConfig(
                query_parameters=[
                    bigquery.ScalarQueryParameter("tenant_id", "STRING", tenant_id),
                    bigquery.ScalarQueryParameter("plan_name", "STRING", request.plan_name.value),
                    bigquery.ScalarQueryParameter("max_team_members", "INT64", request.max_team_members),
                    bigquery.ScalarQueryParameter("max_providers", "INT64", request.max_providers),
                    bigquery.ScalarQueryParameter("max_pipelines_per_day", "INT64", request.max_pipelines_per_day),
                    bigquery.ScalarQueryParameter("max_pipelines_per_month", "INT64", request.max_pipelines_per_month),
                    bigquery.ScalarQueryParameter("subscription_start_date", "DATE", request.subscription_start_date),
                    bigquery.ScalarQueryParameter("subscription_end_date", "DATE", request.subscription_end_date)
                ]
            )
        )
        job.result()

        if job.num_dml_affected_rows == 0:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"No active subscription found for customer {tenant_id}"
            )

        logger.info(f"Subscription updated for {tenant_id} to {request.plan_name}")

        # Return updated subscription
        return await get_subscription_info(tenant_id, tenant, bq_client)

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Failed to update subscription for {tenant_id}: {e}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to update subscription: {str(e)}"
        )


@router.post(
    "/api/v1/tenants/{tenant_id}/subscription/upgrade",
    summary="Upgrade subscription plan",
    description="Upgrade to a higher-tier subscription plan"
)
async def upgrade_subscription(
    tenant_id: str,
    request: UpgradeSubscriptionRequest,
    tenant: TenantContext = Depends(verify_api_key_header),
    bq_client: BigQueryClient = Depends(get_bigquery_client)
):
    """
    Upgrade customer to a higher subscription tier.

    Automatically applies new limits based on the target plan.
    """
    from src.app.models.tenant_models import SUBSCRIPTION_LIMITS

    if tenant_id != tenant.tenant_id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Cannot upgrade other customer's subscription"
        )

    # Get limits for new plan
    new_limits = SUBSCRIPTION_LIMITS.get(request.new_plan)
    if not new_limits:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Invalid subscription plan: {request.new_plan}"
        )

    # Get current subscription
    current_sub = await get_subscription_info(tenant_id, tenant, bq_client)

    # Validate upgrade (can only upgrade, not downgrade)
    plan_order = {"STARTER": 1, "PROFESSIONAL": 2, "SCALE": 3}
    current_tier = plan_order.get(current_sub["plan_name"], 0)
    new_tier = plan_order.get(request.new_plan.value, 0)

    if new_tier <= current_tier:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Cannot upgrade from {current_sub['plan_name']} to {request.new_plan}. Use downgrade endpoint instead."
        )

    # Update subscription with new plan and limits
    update_query = f"""
    UPDATE `{settings.gcp_project_id}.tenants.customer_subscriptions`
    SET
        plan_name = @plan_name,
        max_team_members = @max_team_members,
        max_providers = @max_providers,
        max_pipelines_per_day = @max_pipelines_per_day,
        max_pipelines_per_month = @max_pipelines_per_month,
        max_concurrent_pipelines = @max_concurrent_pipelines,
        updated_at = CURRENT_TIMESTAMP()
    WHERE tenant_id = @tenant_id
        AND status = 'ACTIVE'
    """

    try:
        job = bq_client.client.query(
            update_query,
            job_config=bigquery.QueryJobConfig(
                query_parameters=[
                    bigquery.ScalarQueryParameter("tenant_id", "STRING", tenant_id),
                    bigquery.ScalarQueryParameter("plan_name", "STRING", request.new_plan.value),
                    bigquery.ScalarQueryParameter("max_team_members", "INT64", new_limits["max_team_members"]),
                    bigquery.ScalarQueryParameter("max_providers", "INT64", new_limits["max_providers"]),
                    bigquery.ScalarQueryParameter("max_pipelines_per_day", "INT64", new_limits["max_pipelines_per_day"]),
                    bigquery.ScalarQueryParameter("max_pipelines_per_month", "INT64", new_limits["max_pipelines_per_month"]),
                    bigquery.ScalarQueryParameter("max_concurrent_pipelines", "INT64", new_limits["max_concurrent_pipelines"])
                ]
            )
        )
        job.result()

        logger.info(f"Subscription upgraded for {tenant_id} from {current_sub['plan_name']} to {request.new_plan}")

        # Return updated subscription
        return await get_subscription_info(tenant_id, tenant, bq_client)

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Failed to upgrade subscription for {tenant_id}: {e}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to upgrade subscription: {str(e)}"
        )


# ============================================
# API Key Management Endpoints
# ============================================

@router.post(
    "/api/v1/tenants/{tenant_id}/api-keys",
    response_model=CreateAPIKeyResponse,
    summary="Generate new API key",
    description="Create a new API key for customer"
)
async def create_api_key(
    tenant_id: str,
    request: CreateAPIKeyRequest,
    tenant: TenantContext = Depends(verify_api_key_header),
    bq_client: BigQueryClient = Depends(get_bigquery_client)
):
    """Generate new API key (returns plaintext key - show once!)."""
    if tenant_id != tenant.tenant_id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Cannot create API keys for other tenants"
        )

    # Generate API key
    random_suffix = secrets.token_urlsafe(16)[:16]
    api_key = f"{tenant_id}_api_{random_suffix}"
    api_key_hash = hash_api_key(api_key)
    api_key_id = str(uuid.uuid4())

    # Encrypt API key
    encrypted_api_key = encrypt_value_base64(api_key)

    # Calculate expiration
    expires_at = None
    if request.expires_in_days:
        expires_at = datetime.utcnow() + timedelta(days=request.expires_in_days)

    # Store API key
    insert_query = f"""
    INSERT INTO `{settings.gcp_project_id}.{tenant_id}.x_meta_api_keys`
    (api_key_id, tenant_id, api_key_hash, encrypted_api_key, created_at, expires_at, is_active)
    VALUES
    (@api_key_id, @tenant_id, @api_key_hash, @encrypted_api_key, CURRENT_TIMESTAMP(), @expires_at, TRUE)
    """

    bq_client.client.query(
        insert_query,
        job_config=bigquery.QueryJobConfig(
            query_parameters=[
                bigquery.ScalarQueryParameter("api_key_id", "STRING", api_key_id),
                bigquery.ScalarQueryParameter("tenant_id", "STRING", tenant_id),
                bigquery.ScalarQueryParameter("api_key_hash", "STRING", api_key_hash),
                bigquery.ScalarQueryParameter("encrypted_api_key", "STRING", encrypted_api_key),
                bigquery.ScalarQueryParameter("expires_at", "TIMESTAMP", expires_at),
            ]
        )
    ).result()

    logger.info(f"Created new API key for customer {tenant_id}: {api_key_id}")

    return CreateAPIKeyResponse(
        api_key_id=api_key_id,
        key_name=request.key_name,
        api_key=api_key,
        api_key_hash=api_key_hash,
        created_at=datetime.utcnow(),
        expires_at=expires_at,
        is_active=True,
        scopes=request.scopes
    )


@router.get(
    "/api/v1/tenants/{tenant_id}/api-keys",
    response_model=List[APIKeyResponse],
    summary="List API keys",
    description="List all API keys (hashed only, no plaintext)"
)
async def list_api_keys(
    tenant_id: str,
    tenant: TenantContext = Depends(verify_api_key_header),
    bq_client: BigQueryClient = Depends(get_bigquery_client)
):
    """List all API keys (hashed only)."""
    if tenant_id != tenant.tenant_id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Cannot list other customer's API keys"
        )

    query = f"""
    SELECT
        api_key_id,
        api_key_hash,
        created_at,
        expires_at,
        is_active
    FROM `{settings.gcp_project_id}.{tenant_id}.x_meta_api_keys`
    WHERE tenant_id = @tenant_id
    ORDER BY created_at DESC
    """

    results = bq_client.client.query(
        query,
        job_config=bigquery.QueryJobConfig(
            query_parameters=[
                bigquery.ScalarQueryParameter("tenant_id", "STRING", tenant_id)
            ]
        )
    ).result()

    return [
        APIKeyResponse(
            api_key_id=row["api_key_id"],
            api_key_hash=row["api_key_hash"],
            created_at=row["created_at"],
            expires_at=row.get("expires_at"),
            is_active=row["is_active"],
            scopes=["*"]
        )
        for row in results
    ]


@router.delete(
    "/api/v1/tenants/{tenant_id}/api-keys/{api_key_id}",
    summary="Revoke API key",
    description="Revoke/deactivate an API key"
)
async def revoke_api_key(
    tenant_id: str,
    api_key_id: str,
    tenant: TenantContext = Depends(verify_api_key_header),
    bq_client: BigQueryClient = Depends(get_bigquery_client)
):
    """Revoke API key."""
    if tenant_id != tenant.tenant_id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Cannot revoke other customer's API keys"
        )

    update_query = f"""
    UPDATE `{settings.gcp_project_id}.{tenant_id}.x_meta_api_keys`
    SET is_active = FALSE
    WHERE tenant_id = @tenant_id
      AND api_key_id = @api_key_id
    """

    job = bq_client.client.query(
        update_query,
        job_config=bigquery.QueryJobConfig(
            query_parameters=[
                bigquery.ScalarQueryParameter("tenant_id", "STRING", tenant_id),
                bigquery.ScalarQueryParameter("api_key_id", "STRING", api_key_id),
            ]
        )
    )
    job.result()

    if job.num_dml_affected_rows == 0:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"API key {api_key_id} not found"
        )

    logger.info(f"Revoked API key {api_key_id} for customer {tenant_id}")

    return {"message": f"API key {api_key_id} revoked successfully"}


# ============================================
# Cloud Credentials Management Endpoints
# ============================================

@router.post(
    "/api/v1/tenants/{tenant_id}/credentials",
    response_model=CredentialMetadata,
    summary="Add cloud credentials",
    description="Add cloud provider credentials (encrypted with KMS)"
)
async def create_credential(
    tenant_id: str,
    request: CreateCredentialRequest,
    tenant: TenantContext = Depends(verify_api_key_header),
    bq_client: BigQueryClient = Depends(get_bigquery_client)
):
    """Add cloud provider credentials."""
    if tenant_id != tenant.tenant_id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Cannot create credentials for other tenants"
        )

    # Check max_providers limit
    subscription = await get_subscription(tenant_id, tenant, bq_client)

    # Count existing providers
    count_query = f"""
    SELECT COUNT(DISTINCT provider) as provider_count
    FROM `{settings.gcp_project_id}.{tenant_id}.x_meta_cloud_credentials`
    WHERE is_active = TRUE
    """

    count_results = list(bq_client.client.query(count_query).result())
    provider_count = count_results[0]["provider_count"] if count_results else 0

    if provider_count >= subscription.limits.max_providers:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=f"Maximum providers limit reached ({subscription.limits.max_providers}). Upgrade plan to add more."
        )

    # Encrypt credentials
    credentials_str = json.dumps(request.credentials_json)
    encrypted_value = encrypt_value_base64(credentials_str)

    credential_id = str(uuid.uuid4())

    # Store credential
    insert_query = f"""
    INSERT INTO `{settings.gcp_project_id}.{tenant_id}.x_meta_cloud_credentials`
    (credential_id, provider, credential_type, encrypted_value, created_at, updated_at, is_active)
    VALUES
    (@credential_id, @provider, @credential_type, @encrypted_value, CURRENT_TIMESTAMP(), CURRENT_TIMESTAMP(), TRUE)
    """

    bq_client.client.query(
        insert_query,
        job_config=bigquery.QueryJobConfig(
            query_parameters=[
                bigquery.ScalarQueryParameter("credential_id", "STRING", credential_id),
                bigquery.ScalarQueryParameter("provider", "STRING", request.provider.value),
                bigquery.ScalarQueryParameter("credential_type", "STRING", request.credential_type.value),
                bigquery.ScalarQueryParameter("encrypted_value", "STRING", encrypted_value),
            ]
        )
    ).result()

    logger.info(f"Created credential {credential_id} for customer {tenant_id}")

    return CredentialMetadata(
        credential_id=credential_id,
        provider=request.provider.value,
        credential_type=request.credential_type.value,
        description=request.description,
        created_at=datetime.utcnow(),
        updated_at=datetime.utcnow(),
        is_active=True
    )


@router.get(
    "/api/v1/tenants/{tenant_id}/credentials",
    response_model=List[CredentialMetadata],
    summary="List credentials",
    description="List all credentials (metadata only, no secrets)"
)
async def list_credentials(
    tenant_id: str,
    tenant: TenantContext = Depends(verify_api_key_header),
    bq_client: BigQueryClient = Depends(get_bigquery_client)
):
    """List all credentials (metadata only, no secrets)."""
    if tenant_id != tenant.tenant_id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Cannot list other customer's credentials"
        )

    query = f"""
    SELECT
        credential_id,
        provider,
        credential_type,
        created_at,
        updated_at,
        is_active
    FROM `{settings.gcp_project_id}.{tenant_id}.x_meta_cloud_credentials`
    ORDER BY created_at DESC
    """

    results = bq_client.client.query(query).result()

    return [
        CredentialMetadata(
            credential_id=row["credential_id"],
            provider=row["provider"],
            credential_type=row["credential_type"],
            description=None,
            created_at=row["created_at"],
            updated_at=row["updated_at"],
            is_active=row["is_active"]
        )
        for row in results
    ]


@router.get(
    "/api/v1/tenants/{tenant_id}/credentials/{credential_id}",
    response_model=CredentialMetadata,
    summary="Get credential",
    description="Get specific credential metadata"
)
async def get_credential(
    tenant_id: str,
    credential_id: str,
    tenant: TenantContext = Depends(verify_api_key_header),
    bq_client: BigQueryClient = Depends(get_bigquery_client)
):
    """Get specific credential metadata."""
    if tenant_id != tenant.tenant_id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Cannot access other customer's credentials"
        )

    query = f"""
    SELECT
        credential_id,
        provider,
        credential_type,
        created_at,
        updated_at,
        is_active
    FROM `{settings.gcp_project_id}.{tenant_id}.x_meta_cloud_credentials`
    WHERE credential_id = @credential_id
    LIMIT 1
    """

    results = list(bq_client.client.query(
        query,
        job_config=bigquery.QueryJobConfig(
            query_parameters=[
                bigquery.ScalarQueryParameter("credential_id", "STRING", credential_id)
            ]
        )
    ).result())

    if not results:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Credential {credential_id} not found"
        )

    row = results[0]
    return CredentialMetadata(
        credential_id=row["credential_id"],
        provider=row["provider"],
        credential_type=row["credential_type"],
        description=None,
        created_at=row["created_at"],
        updated_at=row["updated_at"],
        is_active=row["is_active"]
    )


@router.put(
    "/api/v1/tenants/{tenant_id}/credentials/{credential_id}",
    response_model=CredentialMetadata,
    summary="Update credential",
    description="Update credential"
)
async def update_credential(
    tenant_id: str,
    credential_id: str,
    request: UpdateCredentialRequest,
    tenant: TenantContext = Depends(verify_api_key_header),
    bq_client: BigQueryClient = Depends(get_bigquery_client)
):
    """Update credential."""
    if tenant_id != tenant.tenant_id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Cannot update other customer's credentials"
        )

    # Build update query dynamically
    updates = ["updated_at = CURRENT_TIMESTAMP()"]
    params = [
        bigquery.ScalarQueryParameter("credential_id", "STRING", credential_id)
    ]

    if request.credentials_json is not None:
        credentials_str = json.dumps(request.credentials_json)
        encrypted_value = encrypt_value_base64(credentials_str)
        updates.append("encrypted_value = @encrypted_value")
        params.append(bigquery.ScalarQueryParameter("encrypted_value", "STRING", encrypted_value))

    if request.is_active is not None:
        updates.append("is_active = @is_active")
        params.append(bigquery.ScalarQueryParameter("is_active", "BOOL", request.is_active))

    update_query = f"""
    UPDATE `{settings.gcp_project_id}.{tenant_id}.x_meta_cloud_credentials`
    SET {', '.join(updates)}
    WHERE credential_id = @credential_id
    """

    job = bq_client.client.query(
        update_query,
        job_config=bigquery.QueryJobConfig(query_parameters=params)
    )
    job.result()

    if job.num_dml_affected_rows == 0:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Credential {credential_id} not found"
        )

    logger.info(f"Updated credential {credential_id} for customer {tenant_id}")

    return await get_credential(tenant_id, credential_id, tenant, bq_client)


@router.delete(
    "/api/v1/tenants/{tenant_id}/credentials/{credential_id}",
    summary="Delete credential",
    description="Delete credential"
)
async def delete_credential(
    tenant_id: str,
    credential_id: str,
    tenant: TenantContext = Depends(verify_api_key_header),
    bq_client: BigQueryClient = Depends(get_bigquery_client)
):
    """Delete credential."""
    if tenant_id != tenant.tenant_id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Cannot delete other customer's credentials"
        )

    delete_query = f"""
    DELETE FROM `{settings.gcp_project_id}.{tenant_id}.x_meta_cloud_credentials`
    WHERE credential_id = @credential_id
    """

    job = bq_client.client.query(
        delete_query,
        job_config=bigquery.QueryJobConfig(
            query_parameters=[
                bigquery.ScalarQueryParameter("credential_id", "STRING", credential_id)
            ]
        )
    )
    job.result()

    if job.num_dml_affected_rows == 0:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Credential {credential_id} not found"
        )

    logger.info(f"Deleted credential {credential_id} for customer {tenant_id}")

    return {"message": f"Credential {credential_id} deleted successfully"}


# ============================================
# Validation & Usage Endpoints
# ============================================

@router.post(
    "/api/v1/tenants/{tenant_id}/validate",
    response_model=ValidateCustomerResponse,
    summary="Validate before pipeline run",
    description="Check if customer can run pipeline (quota, subscription, API key)"
)
async def validate_customer(
    tenant_id: str,
    request: ValidateCustomerRequest,
    tenant: TenantContext = Depends(verify_api_key_header),
    bq_client: BigQueryClient = Depends(get_bigquery_client)
):
    """Validate before pipeline run."""
    if tenant_id != tenant.tenant_id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Cannot validate other tenants"
        )

    errors = []

    # Check subscription
    subscription = await get_subscription(tenant_id, tenant, bq_client)

    if not subscription.is_active:
        errors.append("Subscription is not active")

    # Check quota
    quota_remaining = subscription.limits.max_pipelines_per_month - subscription.usage["pipelines_this_month"]

    if quota_remaining <= 0:
        errors.append("Monthly pipeline quota exceeded")

    can_run = len(errors) == 0

    return ValidateCustomerResponse(
        can_run_pipeline=can_run,
        quota_remaining=max(0, quota_remaining),
        subscription_status="active" if subscription.is_active else "inactive",
        validation_errors=errors
    )


@router.get(
    "/api/v1/tenants/{tenant_id}/usage",
    summary="Get usage statistics",
    description="Get current usage statistics from tenants.customer_usage_quotas"
)
async def get_usage_statistics(
    tenant_id: str,
    tenant: TenantContext = Depends(verify_api_key_header),
    bq_client: BigQueryClient = Depends(get_bigquery_client)
):
    """
    Get customer's current usage statistics from tenants.customer_usage_quotas.

    Returns pipelines run today/month, concurrent pipelines, and quota information.
    """
    if tenant_id != tenant.tenant_id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Cannot access other customer's usage"
        )

    from datetime import date
    today = date.today()

    # Query usage quotas
    query = f"""
    SELECT
        usage_id,
        tenant_id,
        usage_date,
        pipelines_run_today,
        pipelines_failed_today,
        pipelines_succeeded_today,
        pipelines_run_month,
        concurrent_pipelines_running,
        daily_limit,
        monthly_limit,
        concurrent_limit,
        quota_exceeded,
        last_pipeline_started_at,
        last_pipeline_completed_at
    FROM `{settings.gcp_project_id}.tenants.customer_usage_quotas`
    WHERE tenant_id = @tenant_id
        AND usage_date = @usage_date
    LIMIT 1
    """

    try:
        results = list(bq_client.client.query(
            query,
            job_config=bigquery.QueryJobConfig(
                query_parameters=[
                    bigquery.ScalarQueryParameter("tenant_id", "STRING", tenant_id),
                    bigquery.ScalarQueryParameter("usage_date", "DATE", today)
                ]
            )
        ).result())

        if not results:
            # Return empty usage if no record exists
            subscription = await get_subscription_info(tenant_id, tenant, bq_client)
            return {
                "tenant_id": tenant_id,
                "usage_date": today,
                "pipelines_run_today": 0,
                "pipelines_failed_today": 0,
                "pipelines_succeeded_today": 0,
                "pipelines_run_month": 0,
                "concurrent_pipelines_running": 0,
                "limits": {
                    "daily_limit": subscription["limits"]["max_pipelines_per_day"],
                    "monthly_limit": subscription["limits"].get("max_pipelines_per_month", 0),
                    "concurrent_limit": subscription["limits"]["max_concurrent_pipelines"]
                },
                "quota_remaining": {
                    "daily": subscription["limits"]["max_pipelines_per_day"],
                    "monthly": subscription["limits"].get("max_pipelines_per_month", 0),
                    "concurrent": subscription["limits"]["max_concurrent_pipelines"]
                },
                "quota_exceeded": False
            }

        row = results[0]

        return {
            "tenant_id": row["tenant_id"],
            "usage_date": row["usage_date"],
            "pipelines_run_today": row["pipelines_run_today"],
            "pipelines_failed_today": row.get("pipelines_failed_today", 0),
            "pipelines_succeeded_today": row.get("pipelines_succeeded_today", 0),
            "pipelines_run_month": row["pipelines_run_month"],
            "concurrent_pipelines_running": row["concurrent_pipelines_running"],
            "limits": {
                "daily_limit": row["daily_limit"],
                "monthly_limit": row.get("monthly_limit"),
                "concurrent_limit": row["concurrent_limit"]
            },
            "quota_remaining": {
                "daily": max(0, row["daily_limit"] - row["pipelines_run_today"]),
                "monthly": max(0, row.get("monthly_limit", 0) - row["pipelines_run_month"]) if row.get("monthly_limit") else None,
                "concurrent": max(0, row["concurrent_limit"] - row["concurrent_pipelines_running"])
            },
            "quota_exceeded": row.get("quota_exceeded", False),
            "last_pipeline_started_at": row.get("last_pipeline_started_at"),
            "last_pipeline_completed_at": row.get("last_pipeline_completed_at")
        }

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Failed to retrieve usage for {tenant_id}: {e}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to retrieve usage: {str(e)}"
        )


@router.get(
    "/api/v1/tenants/{tenant_id}/limits",
    summary="Get subscription limits",
    description="Get subscription limits and current usage counts"
)
async def get_limits(
    tenant_id: str,
    tenant: TenantContext = Depends(verify_api_key_header),
    bq_client: BigQueryClient = Depends(get_bigquery_client)
):
    """
    Get customer's subscription limits with current usage counts.

    Returns limits for team members, providers, and pipeline executions.
    """
    if tenant_id != tenant.tenant_id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Cannot access other customer's limits"
        )

    # Get subscription limits
    subscription = await get_subscription_info(tenant_id, tenant, bq_client)

    # Get current usage counts
    usage_query = f"""
    SELECT
        (SELECT COUNT(*) FROM `{settings.gcp_project_id}.tenants.customer_team_members`
         WHERE tenant_id = @tenant_id AND status IN ('ACTIVE', 'INVITED')) as team_members_count,
        (SELECT COUNT(DISTINCT provider) FROM `{settings.gcp_project_id}.tenants.customer_cloud_credentials`
         WHERE tenant_id = @tenant_id AND is_active = TRUE) as providers_count,
        (SELECT pipelines_run_today FROM `{settings.gcp_project_id}.tenants.customer_usage_quotas`
         WHERE tenant_id = @tenant_id AND usage_date = CURRENT_DATE() LIMIT 1) as pipelines_today,
        (SELECT pipelines_run_month FROM `{settings.gcp_project_id}.tenants.customer_usage_quotas`
         WHERE tenant_id = @tenant_id AND usage_date = CURRENT_DATE() LIMIT 1) as pipelines_month,
        (SELECT concurrent_pipelines_running FROM `{settings.gcp_project_id}.tenants.customer_usage_quotas`
         WHERE tenant_id = @tenant_id AND usage_date = CURRENT_DATE() LIMIT 1) as concurrent_running
    """

    try:
        usage_results = list(bq_client.client.query(
            usage_query,
            job_config=bigquery.QueryJobConfig(
                query_parameters=[
                    bigquery.ScalarQueryParameter("tenant_id", "STRING", tenant_id)
                ]
            )
        ).result())

        usage = usage_results[0] if usage_results else {}

        return {
            "tenant_id": tenant_id,
            "subscription_plan": subscription["plan_name"],
            "limits": subscription["limits"],
            "current_usage": {
                "team_members": usage.get("team_members_count", 0),
                "providers": usage.get("providers_count", 0),
                "pipelines_today": usage.get("pipelines_today", 0),
                "pipelines_month": usage.get("pipelines_month", 0),
                "concurrent_running": usage.get("concurrent_running", 0)
            },
            "available": {
                "team_members": max(0, subscription["limits"]["max_team_members"] - usage.get("team_members_count", 0)),
                "providers": max(0, subscription["limits"]["max_providers"] - usage.get("providers_count", 0)),
                "pipelines_today": max(0, subscription["limits"]["max_pipelines_per_day"] - usage.get("pipelines_today", 0)),
                "concurrent": max(0, subscription["limits"]["max_concurrent_pipelines"] - usage.get("concurrent_running", 0))
            }
        }

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Failed to retrieve limits for {tenant_id}: {e}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to retrieve limits: {str(e)}"
        )


@router.put(
    "/api/v1/tenants/{tenant_id}/limits",
    summary="Update subscription limits (admin only)",
    description="Update custom limits for customer (requires admin privileges)"
)
async def update_limits(
    tenant_id: str,
    request: UpdateLimitsRequest,
    tenant: TenantContext = Depends(verify_api_key_header),
    bq_client: BigQueryClient = Depends(get_bigquery_client)
):
    """
    Update custom limits for a customer subscription.

    This is an admin-only operation for providing custom limits beyond standard plans.
    """
    from src.app.models.tenant_models import UpdateLimitsRequest

    if tenant_id != tenant.tenant_id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Cannot update limits for other tenants"
        )

    # Build dynamic update query
    updates = ["updated_at = CURRENT_TIMESTAMP()"]
    params = [bigquery.ScalarQueryParameter("tenant_id", "STRING", tenant_id)]

    if request.max_team_members is not None:
        updates.append("max_team_members = @max_team_members")
        params.append(bigquery.ScalarQueryParameter("max_team_members", "INT64", request.max_team_members))

    if request.max_providers is not None:
        updates.append("max_providers = @max_providers")
        params.append(bigquery.ScalarQueryParameter("max_providers", "INT64", request.max_providers))

    if request.max_pipelines_per_day is not None:
        updates.append("max_pipelines_per_day = @max_pipelines_per_day")
        params.append(bigquery.ScalarQueryParameter("max_pipelines_per_day", "INT64", request.max_pipelines_per_day))

    if request.max_pipelines_per_month is not None:
        updates.append("max_pipelines_per_month = @max_pipelines_per_month")
        params.append(bigquery.ScalarQueryParameter("max_pipelines_per_month", "INT64", request.max_pipelines_per_month))

    if request.max_concurrent_pipelines is not None:
        updates.append("max_concurrent_pipelines = @max_concurrent_pipelines")
        params.append(bigquery.ScalarQueryParameter("max_concurrent_pipelines", "INT64", request.max_concurrent_pipelines))

    if len(updates) == 1:  # Only updated_at
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="No limits provided to update"
        )

    update_query = f"""
    UPDATE `{settings.gcp_project_id}.tenants.customer_subscriptions`
    SET {', '.join(updates)}
    WHERE tenant_id = @tenant_id
        AND status = 'ACTIVE'
    """

    try:
        job = bq_client.client.query(
            update_query,
            job_config=bigquery.QueryJobConfig(query_parameters=params)
        )
        job.result()

        if job.num_dml_affected_rows == 0:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"No active subscription found for customer {tenant_id}"
            )

        logger.info(f"Custom limits updated for customer {tenant_id}")

        # Return updated limits
        return await get_limits(tenant_id, tenant, bq_client)

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Failed to update limits for {tenant_id}: {e}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to update limits: {str(e)}"
        )


# ============================================
# Provider Configuration Endpoints (Stub)
# ============================================
# Note: These endpoints are stubs since provider configs would need
# a separate table. Implement when needed.

@router.post(
    "/api/v1/tenants/{tenant_id}/provider-configs",
    summary="Create provider config (stub)",
    description="Setup provider-specific pipeline config"
)
async def create_provider_config(
    tenant_id: str,
    request: CreateProviderConfigRequest,
    tenant: TenantContext = Depends(verify_api_key_header)
):
    """Create provider config (stub - implement with dedicated table)."""
    if tenant_id != tenant.tenant_id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Cannot create configs for other tenants"
        )

    return {
        "message": "Provider config endpoints require dedicated table implementation",
        "config_id": str(uuid.uuid4())
    }


@router.get(
    "/api/v1/tenants/{tenant_id}/provider-configs",
    summary="List provider configs (stub)",
    description="List all provider configs"
)
async def list_provider_configs(
    tenant_id: str,
    tenant: TenantContext = Depends(verify_api_key_header)
):
    """List provider configs (stub)."""
    if tenant_id != tenant.tenant_id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Cannot list other customer's configs"
        )

    return []


@router.put(
    "/api/v1/tenants/{tenant_id}/provider-configs/{config_id}",
    summary="Update provider config (stub)",
    description="Update provider config"
)
async def update_provider_config(
    tenant_id: str,
    config_id: str,
    request: UpdateProviderConfigRequest,
    tenant: TenantContext = Depends(verify_api_key_header)
):
    """Update provider config (stub)."""
    if tenant_id != tenant.tenant_id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Cannot update other customer's configs"
        )

    return {"message": "Provider config endpoints require dedicated table implementation"}


# ============================================
# Team Member Management Endpoints (REMOVED)
# ============================================
# User/team management is now handled by the Supabase frontend.
# Users, memberships, roles, and invitations are managed there.
# The data pipeline only receives user_id via X-User-ID header for audit logging.
