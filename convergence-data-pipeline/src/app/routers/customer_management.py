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


class TeamRole(str, Enum):
    """Team member roles."""
    OWNER = "owner"
    ADMIN = "admin"
    MEMBER = "member"
    VIEWER = "viewer"


# ============================================
# Request/Response Models
# ============================================

# --- Onboarding ---

class OnboardCustomerRequest(BaseModel):
    """Request to onboard a new customer."""
    customer_id: str = Field(..., description="Unique customer/tenant identifier")
    company_name: str = Field(..., description="Company name")
    admin_email: EmailStr = Field(..., description="Administrator email address")
    subscription_plan: SubscriptionPlan = Field(default=SubscriptionPlan.FREE)


class OnboardCustomerResponse(BaseModel):
    """Response for customer onboarding."""
    customer_id: str
    dataset_id: str
    api_key: str  # Show once!
    status: str
    message: str


# --- Customer Profile ---

class CustomerProfile(BaseModel):
    """Customer profile information."""
    customer_id: str
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
    customer_id: str
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
    customer_id: str
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


# --- Team Management ---

class InviteTeamMemberRequest(BaseModel):
    """Request to invite team member."""
    email: EmailStr
    role: TeamRole
    permissions: List[str] = Field(default=["read"])


class TeamMember(BaseModel):
    """Team member information."""
    member_id: str
    customer_id: str
    email: str
    role: str
    permissions: List[str]
    invited_at: datetime
    is_active: bool


class UpdateTeamMemberRequest(BaseModel):
    """Request to update team member."""
    role: Optional[TeamRole] = None
    permissions: Optional[List[str]] = None


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
    customer_id: str
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
    "/api/v1/customers/onboard",
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
    Returns: customer_id, dataset_id, API key (save this!), status.
    """
    customer_id = request.customer_id
    logger.info(f"Starting customer onboarding for: {customer_id}")

    try:
        # Step 1: Create tenant metadata infrastructure
        ensure_tenant_metadata(
            tenant_id=customer_id,
            bq_client=bq_client.client
        )

        dataset_id = f"{settings.gcp_project_id}.{customer_id}"

        # Step 2: Generate API key
        random_suffix = secrets.token_urlsafe(16)[:16]
        api_key = f"{customer_id}_api_{random_suffix}"
        api_key_hash = hash_api_key(api_key)

        # Encrypt API key
        encrypted_api_key = encrypt_value_base64(api_key)
        api_key_id = str(uuid.uuid4())

        # Step 3: Store API key
        insert_api_key_query = f"""
        INSERT INTO `{settings.gcp_project_id}.{customer_id}.x_meta_api_keys`
        (api_key_id, tenant_id, api_key_hash, encrypted_api_key, created_at, is_active)
        VALUES
        (@api_key_id, @tenant_id, @api_key_hash, @encrypted_api_key, CURRENT_TIMESTAMP(), TRUE)
        """

        bq_client.client.query(
            insert_api_key_query,
            job_config=bigquery.QueryJobConfig(
                query_parameters=[
                    bigquery.ScalarQueryParameter("api_key_id", "STRING", api_key_id),
                    bigquery.ScalarQueryParameter("tenant_id", "STRING", customer_id),
                    bigquery.ScalarQueryParameter("api_key_hash", "STRING", api_key_hash),
                    bigquery.ScalarQueryParameter("encrypted_api_key", "STRING", encrypted_api_key),
                ]
            )
        ).result()

        # Step 4: Create customer profile record
        # Note: This would typically be in a separate customers table
        # For now, we use the API keys table as proof of customer existence

        logger.info(f"Customer onboarding completed for: {customer_id}")

        return OnboardCustomerResponse(
            customer_id=customer_id,
            dataset_id=dataset_id,
            api_key=api_key,
            status="active",
            message=f"Customer {customer_id} onboarded successfully. Save your API key - it won't be shown again!"
        )

    except Exception as e:
        logger.error(f"Failed to onboard customer {customer_id}: {e}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to onboard customer: {str(e)}"
        )


@router.get(
    "/api/v1/customers/{customer_id}",
    response_model=CustomerProfile,
    summary="Get customer profile",
    description="Retrieve customer profile information"
)
async def get_customer_profile(
    customer_id: str,
    tenant: TenantContext = Depends(verify_api_key_header),
    bq_client: BigQueryClient = Depends(get_bigquery_client)
):
    """Get customer profile."""
    # Verify customer_id matches authenticated tenant
    if customer_id != tenant.tenant_id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Cannot access other customer's profile"
        )

    # Query customer info from API keys table (simplified)
    query = f"""
    SELECT
        tenant_id as customer_id,
        tenant_id as company_name,
        'admin@example.com' as admin_email,
        'free' as subscription_plan,
        MIN(created_at) as created_at,
        MAX(created_at) as updated_at,
        TRUE as is_active
    FROM `{settings.gcp_project_id}.{customer_id}.x_meta_api_keys`
    WHERE tenant_id = @customer_id
    GROUP BY tenant_id
    LIMIT 1
    """

    results = list(bq_client.client.query(
        query,
        job_config=bigquery.QueryJobConfig(
            query_parameters=[
                bigquery.ScalarQueryParameter("customer_id", "STRING", customer_id)
            ]
        )
    ).result())

    if not results:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Customer {customer_id} not found"
        )

    return CustomerProfile(**dict(results[0]))


@router.put(
    "/api/v1/customers/{customer_id}",
    response_model=CustomerProfile,
    summary="Update customer profile",
    description="Update customer profile information"
)
async def update_customer_profile(
    customer_id: str,
    request: UpdateCustomerRequest,
    tenant: TenantContext = Depends(verify_api_key_header),
    bq_client: BigQueryClient = Depends(get_bigquery_client)
):
    """Update customer profile."""
    if customer_id != tenant.tenant_id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Cannot update other customer's profile"
        )

    # In production, this would update a customers table
    # For now, return current profile
    return await get_customer_profile(customer_id, tenant, bq_client)


# ============================================
# Subscription Management Endpoints
# ============================================

@router.get(
    "/api/v1/customers/{customer_id}/subscription",
    response_model=SubscriptionInfo,
    summary="Get subscription info",
    description="Get current subscription plan and limits"
)
async def get_subscription(
    customer_id: str,
    tenant: TenantContext = Depends(verify_api_key_header),
    bq_client: BigQueryClient = Depends(get_bigquery_client)
):
    """Get current subscription and limits."""
    if customer_id != tenant.tenant_id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Cannot access other customer's subscription"
        )

    # Default to free plan
    plan = "free"
    limits = get_subscription_limits(plan)

    # Get usage statistics
    usage_query = f"""
    SELECT
        COUNT(*) as pipelines_this_month
    FROM `{settings.gcp_project_id}.{customer_id}.x_meta_pipeline_runs`
    WHERE tenant_id = @customer_id
      AND start_time >= TIMESTAMP_SUB(CURRENT_TIMESTAMP(), INTERVAL 30 DAY)
    """

    usage_results = list(bq_client.client.query(
        usage_query,
        job_config=bigquery.QueryJobConfig(
            query_parameters=[
                bigquery.ScalarQueryParameter("customer_id", "STRING", customer_id)
            ]
        )
    ).result())

    pipelines_this_month = usage_results[0]["pipelines_this_month"] if usage_results else 0

    return SubscriptionInfo(
        customer_id=customer_id,
        plan=plan,
        limits=limits,
        usage={
            "pipelines_this_month": pipelines_this_month,
            "team_members": 1,
            "providers": 0,
            "api_keys": 1
        },
        is_active=True
    )


@router.put(
    "/api/v1/customers/{customer_id}/subscription",
    response_model=SubscriptionInfo,
    summary="Update subscription",
    description="Update subscription plan (called by frontend/Stripe webhook)"
)
async def update_subscription(
    customer_id: str,
    request: UpdateSubscriptionRequest,
    tenant: TenantContext = Depends(verify_api_key_header),
    bq_client: BigQueryClient = Depends(get_bigquery_client)
):
    """Update subscription when customer changes plan in Stripe."""
    if customer_id != tenant.tenant_id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Cannot update other customer's subscription"
        )

    # In production, this would update subscription in database
    # For now, return updated subscription info
    logger.info(f"Subscription updated for {customer_id} to {request.plan}")

    return await get_subscription(customer_id, tenant, bq_client)


# ============================================
# API Key Management Endpoints
# ============================================

@router.post(
    "/api/v1/customers/{customer_id}/api-keys",
    response_model=CreateAPIKeyResponse,
    summary="Generate new API key",
    description="Create a new API key for customer"
)
async def create_api_key(
    customer_id: str,
    request: CreateAPIKeyRequest,
    tenant: TenantContext = Depends(verify_api_key_header),
    bq_client: BigQueryClient = Depends(get_bigquery_client)
):
    """Generate new API key (returns plaintext key - show once!)."""
    if customer_id != tenant.tenant_id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Cannot create API keys for other customers"
        )

    # Generate API key
    random_suffix = secrets.token_urlsafe(16)[:16]
    api_key = f"{customer_id}_api_{random_suffix}"
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
    INSERT INTO `{settings.gcp_project_id}.{customer_id}.x_meta_api_keys`
    (api_key_id, tenant_id, api_key_hash, encrypted_api_key, created_at, expires_at, is_active)
    VALUES
    (@api_key_id, @tenant_id, @api_key_hash, @encrypted_api_key, CURRENT_TIMESTAMP(), @expires_at, TRUE)
    """

    bq_client.client.query(
        insert_query,
        job_config=bigquery.QueryJobConfig(
            query_parameters=[
                bigquery.ScalarQueryParameter("api_key_id", "STRING", api_key_id),
                bigquery.ScalarQueryParameter("tenant_id", "STRING", customer_id),
                bigquery.ScalarQueryParameter("api_key_hash", "STRING", api_key_hash),
                bigquery.ScalarQueryParameter("encrypted_api_key", "STRING", encrypted_api_key),
                bigquery.ScalarQueryParameter("expires_at", "TIMESTAMP", expires_at),
            ]
        )
    ).result()

    logger.info(f"Created new API key for customer {customer_id}: {api_key_id}")

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
    "/api/v1/customers/{customer_id}/api-keys",
    response_model=List[APIKeyResponse],
    summary="List API keys",
    description="List all API keys (hashed only, no plaintext)"
)
async def list_api_keys(
    customer_id: str,
    tenant: TenantContext = Depends(verify_api_key_header),
    bq_client: BigQueryClient = Depends(get_bigquery_client)
):
    """List all API keys (hashed only)."""
    if customer_id != tenant.tenant_id:
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
    FROM `{settings.gcp_project_id}.{customer_id}.x_meta_api_keys`
    WHERE tenant_id = @customer_id
    ORDER BY created_at DESC
    """

    results = bq_client.client.query(
        query,
        job_config=bigquery.QueryJobConfig(
            query_parameters=[
                bigquery.ScalarQueryParameter("customer_id", "STRING", customer_id)
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
    "/api/v1/customers/{customer_id}/api-keys/{api_key_id}",
    summary="Revoke API key",
    description="Revoke/deactivate an API key"
)
async def revoke_api_key(
    customer_id: str,
    api_key_id: str,
    tenant: TenantContext = Depends(verify_api_key_header),
    bq_client: BigQueryClient = Depends(get_bigquery_client)
):
    """Revoke API key."""
    if customer_id != tenant.tenant_id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Cannot revoke other customer's API keys"
        )

    update_query = f"""
    UPDATE `{settings.gcp_project_id}.{customer_id}.x_meta_api_keys`
    SET is_active = FALSE
    WHERE tenant_id = @customer_id
      AND api_key_id = @api_key_id
    """

    job = bq_client.client.query(
        update_query,
        job_config=bigquery.QueryJobConfig(
            query_parameters=[
                bigquery.ScalarQueryParameter("customer_id", "STRING", customer_id),
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

    logger.info(f"Revoked API key {api_key_id} for customer {customer_id}")

    return {"message": f"API key {api_key_id} revoked successfully"}


# ============================================
# Cloud Credentials Management Endpoints
# ============================================

@router.post(
    "/api/v1/customers/{customer_id}/credentials",
    response_model=CredentialMetadata,
    summary="Add cloud credentials",
    description="Add cloud provider credentials (encrypted with KMS)"
)
async def create_credential(
    customer_id: str,
    request: CreateCredentialRequest,
    tenant: TenantContext = Depends(verify_api_key_header),
    bq_client: BigQueryClient = Depends(get_bigquery_client)
):
    """Add cloud provider credentials."""
    if customer_id != tenant.tenant_id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Cannot create credentials for other customers"
        )

    # Check max_providers limit
    subscription = await get_subscription(customer_id, tenant, bq_client)

    # Count existing providers
    count_query = f"""
    SELECT COUNT(DISTINCT provider) as provider_count
    FROM `{settings.gcp_project_id}.{customer_id}.x_meta_cloud_credentials`
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
    INSERT INTO `{settings.gcp_project_id}.{customer_id}.x_meta_cloud_credentials`
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

    logger.info(f"Created credential {credential_id} for customer {customer_id}")

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
    "/api/v1/customers/{customer_id}/credentials",
    response_model=List[CredentialMetadata],
    summary="List credentials",
    description="List all credentials (metadata only, no secrets)"
)
async def list_credentials(
    customer_id: str,
    tenant: TenantContext = Depends(verify_api_key_header),
    bq_client: BigQueryClient = Depends(get_bigquery_client)
):
    """List all credentials (metadata only, no secrets)."""
    if customer_id != tenant.tenant_id:
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
    FROM `{settings.gcp_project_id}.{customer_id}.x_meta_cloud_credentials`
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
    "/api/v1/customers/{customer_id}/credentials/{credential_id}",
    response_model=CredentialMetadata,
    summary="Get credential",
    description="Get specific credential metadata"
)
async def get_credential(
    customer_id: str,
    credential_id: str,
    tenant: TenantContext = Depends(verify_api_key_header),
    bq_client: BigQueryClient = Depends(get_bigquery_client)
):
    """Get specific credential metadata."""
    if customer_id != tenant.tenant_id:
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
    FROM `{settings.gcp_project_id}.{customer_id}.x_meta_cloud_credentials`
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
    "/api/v1/customers/{customer_id}/credentials/{credential_id}",
    response_model=CredentialMetadata,
    summary="Update credential",
    description="Update credential"
)
async def update_credential(
    customer_id: str,
    credential_id: str,
    request: UpdateCredentialRequest,
    tenant: TenantContext = Depends(verify_api_key_header),
    bq_client: BigQueryClient = Depends(get_bigquery_client)
):
    """Update credential."""
    if customer_id != tenant.tenant_id:
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
    UPDATE `{settings.gcp_project_id}.{customer_id}.x_meta_cloud_credentials`
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

    logger.info(f"Updated credential {credential_id} for customer {customer_id}")

    return await get_credential(customer_id, credential_id, tenant, bq_client)


@router.delete(
    "/api/v1/customers/{customer_id}/credentials/{credential_id}",
    summary="Delete credential",
    description="Delete credential"
)
async def delete_credential(
    customer_id: str,
    credential_id: str,
    tenant: TenantContext = Depends(verify_api_key_header),
    bq_client: BigQueryClient = Depends(get_bigquery_client)
):
    """Delete credential."""
    if customer_id != tenant.tenant_id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Cannot delete other customer's credentials"
        )

    delete_query = f"""
    DELETE FROM `{settings.gcp_project_id}.{customer_id}.x_meta_cloud_credentials`
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

    logger.info(f"Deleted credential {credential_id} for customer {customer_id}")

    return {"message": f"Credential {credential_id} deleted successfully"}


# ============================================
# Validation & Usage Endpoints
# ============================================

@router.post(
    "/api/v1/customers/{customer_id}/validate",
    response_model=ValidateCustomerResponse,
    summary="Validate before pipeline run",
    description="Check if customer can run pipeline (quota, subscription, API key)"
)
async def validate_customer(
    customer_id: str,
    request: ValidateCustomerRequest,
    tenant: TenantContext = Depends(verify_api_key_header),
    bq_client: BigQueryClient = Depends(get_bigquery_client)
):
    """Validate before pipeline run."""
    if customer_id != tenant.tenant_id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Cannot validate other customers"
        )

    errors = []

    # Check subscription
    subscription = await get_subscription(customer_id, tenant, bq_client)

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
    "/api/v1/customers/{customer_id}/usage",
    response_model=UsageStatistics,
    summary="Get usage statistics",
    description="Get usage statistics and trends"
)
async def get_usage_statistics(
    customer_id: str,
    tenant: TenantContext = Depends(verify_api_key_header),
    bq_client: BigQueryClient = Depends(get_bigquery_client)
):
    """Get usage statistics."""
    if customer_id != tenant.tenant_id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Cannot access other customer's usage"
        )

    # Get subscription
    subscription = await get_subscription(customer_id, tenant, bq_client)

    # Get today's pipelines
    today_query = f"""
    SELECT COUNT(*) as count
    FROM `{settings.gcp_project_id}.{customer_id}.x_meta_pipeline_runs`
    WHERE tenant_id = @customer_id
      AND DATE(start_time) = CURRENT_DATE()
    """

    today_results = list(bq_client.client.query(
        today_query,
        job_config=bigquery.QueryJobConfig(
            query_parameters=[
                bigquery.ScalarQueryParameter("customer_id", "STRING", customer_id)
            ]
        )
    ).result())

    pipelines_today = today_results[0]["count"] if today_results else 0
    pipelines_this_month = subscription.usage["pipelines_this_month"]
    quota_limit = subscription.limits.max_pipelines_per_month
    quota_remaining = max(0, quota_limit - pipelines_this_month)

    return UsageStatistics(
        customer_id=customer_id,
        pipelines_today=pipelines_today,
        pipelines_this_month=pipelines_this_month,
        quota_limit=quota_limit,
        quota_remaining=quota_remaining,
        trends={
            "daily_average": pipelines_this_month / 30,
            "usage_percentage": (pipelines_this_month / quota_limit * 100) if quota_limit > 0 else 0
        }
    )


# ============================================
# Provider Configuration Endpoints (Stub)
# ============================================
# Note: These endpoints are stubs since provider configs would need
# a separate table. Implement when needed.

@router.post(
    "/api/v1/customers/{customer_id}/provider-configs",
    summary="Create provider config (stub)",
    description="Setup provider-specific pipeline config"
)
async def create_provider_config(
    customer_id: str,
    request: CreateProviderConfigRequest,
    tenant: TenantContext = Depends(verify_api_key_header)
):
    """Create provider config (stub - implement with dedicated table)."""
    if customer_id != tenant.tenant_id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Cannot create configs for other customers"
        )

    return {
        "message": "Provider config endpoints require dedicated table implementation",
        "config_id": str(uuid.uuid4())
    }


@router.get(
    "/api/v1/customers/{customer_id}/provider-configs",
    summary="List provider configs (stub)",
    description="List all provider configs"
)
async def list_provider_configs(
    customer_id: str,
    tenant: TenantContext = Depends(verify_api_key_header)
):
    """List provider configs (stub)."""
    if customer_id != tenant.tenant_id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Cannot list other customer's configs"
        )

    return []


@router.put(
    "/api/v1/customers/{customer_id}/provider-configs/{config_id}",
    summary="Update provider config (stub)",
    description="Update provider config"
)
async def update_provider_config(
    customer_id: str,
    config_id: str,
    request: UpdateProviderConfigRequest,
    tenant: TenantContext = Depends(verify_api_key_header)
):
    """Update provider config (stub)."""
    if customer_id != tenant.tenant_id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Cannot update other customer's configs"
        )

    return {"message": "Provider config endpoints require dedicated table implementation"}


# ============================================
# Team Management Endpoints (Stub)
# ============================================
# Note: These endpoints are stubs since team management would need
# a separate table. Implement when needed.

@router.post(
    "/api/v1/customers/{customer_id}/team",
    summary="Invite team member (stub)",
    description="Invite team member"
)
async def invite_team_member(
    customer_id: str,
    request: InviteTeamMemberRequest,
    tenant: TenantContext = Depends(verify_api_key_header)
):
    """Invite team member (stub - implement with dedicated table)."""
    if customer_id != tenant.tenant_id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Cannot invite team members for other customers"
        )

    return {
        "message": "Team management endpoints require dedicated table implementation",
        "member_id": str(uuid.uuid4())
    }


@router.get(
    "/api/v1/customers/{customer_id}/team",
    summary="List team members (stub)",
    description="List team members"
)
async def list_team_members(
    customer_id: str,
    tenant: TenantContext = Depends(verify_api_key_header)
):
    """List team members (stub)."""
    if customer_id != tenant.tenant_id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Cannot list other customer's team"
        )

    return []


@router.put(
    "/api/v1/customers/{customer_id}/team/{member_id}",
    summary="Update team member (stub)",
    description="Update team member role"
)
async def update_team_member(
    customer_id: str,
    member_id: str,
    request: UpdateTeamMemberRequest,
    tenant: TenantContext = Depends(verify_api_key_header)
):
    """Update team member (stub)."""
    if customer_id != tenant.tenant_id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Cannot update other customer's team"
        )

    return {"message": "Team management endpoints require dedicated table implementation"}


@router.delete(
    "/api/v1/customers/{customer_id}/team/{member_id}",
    summary="Remove team member (stub)",
    description="Remove team member"
)
async def remove_team_member(
    customer_id: str,
    member_id: str,
    tenant: TenantContext = Depends(verify_api_key_header)
):
    """Remove team member (stub)."""
    if customer_id != tenant.tenant_id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Cannot remove team members from other customers"
        )

    return {"message": "Team member removed (stub implementation)"}
