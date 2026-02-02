"""
Integration Management API Routes

Endpoints for managing external integrations.
Provider configuration is loaded from configs/system/providers.yml.
To add a new provider: just update providers.yml - no code changes needed.

All credentials are encrypted via GCP KMS.

URL Structure: /api/v1/integrations/{org_slug}/{provider}/setup|validate
"""

from fastapi import APIRouter, Depends, HTTPException, status, Request
from pydantic import BaseModel, Field, ConfigDict
from typing import List, Optional, Dict, Any, Literal
from datetime import datetime, timezone
from pathlib import Path
import logging
import json
import re
import uuid
import csv

from src.core.engine.bq_client import get_bigquery_client, BigQueryClient
from src.core.utils.supabase_client import get_supabase_client
from src.app.dependencies.auth import get_current_org
from src.app.config import settings
from src.core.providers import provider_registry
from src.core.utils.validators import validate_org_slug, sanitize_sql_identifier
from src.app.dependencies.rate_limit_decorator import rate_limit_by_org
from src.lib.integrations.metadata_schemas import validate_metadata  # BUG-020 FIX
from src.core.utils.audit_logger import log_delete, log_create, AuditLogger
from google.cloud import bigquery

router = APIRouter()
logger = logging.getLogger(__name__)


# ============================================
# Rate Limiting Helper (Fail-Closed)
# ============================================

async def safe_rate_limit(request: Request, org_slug: str, limit: int, action: str) -> None:
    """
    Issue #30: Wrapper for rate limiting with proper error handling.
    Fail-closed for security - reject requests if rate limiting fails.

    BUG-005 FIX: Distinguish rate limit exceptions from other errors.
    """
    try:
        await rate_limit_by_org(request, org_slug, limit, action)
    except HTTPException as e:
        # BUG-005 FIX: Check if this is a rate limit error (429)
        if e.status_code == 429:
            # Rate limit exceeded - this is expected behavior
            logger.warning(
                f"Rate limit exceeded for {org_slug}/{action}",
                extra={"org_slug": org_slug, "action": action, "limit": limit}
            )
        raise
    except Exception as e:
        # SECURITY: Fail-closed - reject requests if rate limiting fails
        logger.error(
            f"Rate limit check failed for {org_slug}/{action}: {type(e).__name__}",
            extra={"org_slug": org_slug, "action": action}
        )
        raise HTTPException(
            status_code=503,
            detail="Service temporarily unavailable - rate limit check failed"
        )


def get_request_id(request: Request) -> str:
    """
    Get or generate request ID for distributed tracing.

    Checks for existing X-Request-ID header, generates UUID if not present.
    This enables request correlation across services and in audit logs.

    Args:
        request: FastAPI Request object

    Returns:
        Request ID string (either from header or newly generated UUID)
    """
    request_id = request.headers.get("x-request-id")
    if not request_id:
        request_id = str(uuid.uuid4())
    return request_id


def enforce_credential_size_limit(credential: str, org_slug: str) -> None:
    """
    Issue #50: Enforce credential size limit from settings.max_credential_size_bytes.

    SECURITY: Prevents DOS attacks via oversized credential payloads.
    The limit is configurable via MAX_CREDENTIAL_SIZE_BYTES env var (default 100KB).

    Args:
        credential: The credential string to check
        org_slug: Organization slug for logging

    Raises:
        HTTPException: 413 if credential exceeds size limit
    """
    credential_size = len(credential.encode('utf-8'))
    if credential_size > settings.max_credential_size_bytes:
        logger.warning(
            f"Credential size exceeds limit for {org_slug}",
            extra={
                "org_slug": org_slug,
                "credential_size": credential_size,
                "max_size": settings.max_credential_size_bytes
            }
        )
        raise HTTPException(
            status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
            detail=f"Credential size ({credential_size} bytes) exceeds maximum allowed ({settings.max_credential_size_bytes} bytes)"
        )


# INT-003 FIX: Add metadata size validation
MAX_METADATA_SIZE_BYTES = 50 * 1024  # 50KB limit for metadata


def enforce_metadata_size_limit(metadata: dict, org_slug: str) -> None:
    """
    INT-003 FIX: Enforce metadata size limit to prevent DoS via large metadata payloads.

    Args:
        metadata: The metadata dict to check
        org_slug: Organization slug for logging

    Raises:
        HTTPException: 413 if metadata exceeds size limit
    """
    if not metadata:
        return

    import json
    metadata_json = json.dumps(metadata)
    metadata_size = len(metadata_json.encode('utf-8'))

    if metadata_size > MAX_METADATA_SIZE_BYTES:
        logger.warning(
            f"Metadata size exceeds limit for {org_slug}",
            extra={
                "org_slug": org_slug,
                "metadata_size": metadata_size,
                "max_size": MAX_METADATA_SIZE_BYTES
            }
        )
        raise HTTPException(
            status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
            detail=f"Metadata size ({metadata_size} bytes) exceeds maximum allowed ({MAX_METADATA_SIZE_BYTES} bytes)"
        )


# ============================================
# Request/Response Models
# ============================================

class SetupIntegrationRequest(BaseModel):
    """Request to setup an integration."""
    credential: str = Field(
        ...,
        description="The credential (API key or Service Account JSON). Max size configurable via MAX_CREDENTIAL_SIZE_BYTES env var (default 100KB)",
        min_length=10,
        max_length=100000  # 100KB default, validated against settings.max_credential_size_bytes in endpoint
    )
    credential_name: Optional[str] = Field(
        None,
        description="Human-readable name for this credential",
        min_length=3,
        max_length=200
    )
    metadata: Optional[Dict[str, Any]] = Field(
        None,
        description="Additional metadata (e.g., project_id for GCP)"
    )
    skip_validation: bool = Field(
        False,
        description="Skip credential validation (not recommended)"
    )

    model_config = ConfigDict(extra="forbid")

    # BUG-014 FIX: Validate credential is not empty after stripping
    @staticmethod
    def validate_credential(v: str) -> str:
        """Validate credential is not empty or whitespace-only"""
        if not v or not v.strip():
            raise ValueError("Credential cannot be empty or whitespace-only")
        return v.strip()


class IntegrationStatusResponse(BaseModel):
    """Response for integration status."""
    provider: str
    # Use 'status' as the serialized field name for frontend compatibility
    validation_status: Literal["VALID", "INVALID", "PENDING", "NOT_CONFIGURED"] = Field(
        ..., serialization_alias="status"
    )
    credential_name: Optional[str] = None
    last_validated_at: Optional[datetime] = None
    last_error: Optional[str] = None
    created_at: Optional[datetime] = None
    metadata: Optional[Dict[str, Any]] = Field(
        None,
        description="Integration metadata (e.g., billing_export_table for GCP)"
    )

    model_config = {"populate_by_name": True}


class SetupIntegrationResponse(BaseModel):
    """Response after setting up an integration."""
    success: bool
    provider: str
    credential_id: Optional[str] = None
    validation_status: str
    validation_error: Optional[str] = None
    message: str


class AllIntegrationsResponse(BaseModel):
    """Response with all integration statuses."""
    org_slug: str
    integrations: Dict[str, IntegrationStatusResponse]
    all_valid: bool
    providers_configured: List[str]


# ============================================
# Provider Constants (from providers.yml)
# ============================================

def get_valid_providers() -> list:
    """Get list of valid providers from registry."""
    if provider_registry is None:
        logger.error("Provider registry not initialized")
        return []
    return provider_registry.get_all_providers()


def get_default_credential_name(provider: str) -> str:
    """Get default credential name for a provider."""
    if provider_registry is None:
        return f"{provider} Credential"
    return provider_registry.get_display_name(provider.upper()) or f"{provider} Credential"


def normalize_provider(provider: str) -> str:
    """Normalize provider name to internal format using registry."""
    if provider_registry is None:
        logger.error("Provider registry not initialized")
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Service configuration error. Please try again later."
        )

    # First try direct lookup
    provider_upper = provider.upper()
    if provider_registry.is_valid_provider(provider_upper):
        return provider_upper

    # Then try aliases
    aliases = provider_registry.get_provider_aliases()
    if aliases is None:
        logger.error("Provider registry aliases not available")
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Service configuration error. Please try again later."
        )

    normalized = aliases.get(provider.lower())
    if normalized:
        return normalized

    # BUG-008 FIX: Log suspicious provider attempts with details for security monitoring
    logger.warning(
        f"Invalid provider requested: {provider}",
        extra={
            "provider": provider,
            "provider_uppercase": provider_upper,
            "security_category": "invalid_provider_attempt"
        }
    )
    raise HTTPException(
        status_code=status.HTTP_400_BAD_REQUEST,
        detail="Invalid provider specified. Please check the supported providers list."
    )


# ============================================
# Integration Setup Endpoints (Provider-Based)
# ============================================

@router.post(
    "/integrations/{org_slug}/gcp/setup",
    response_model=SetupIntegrationResponse,
    summary="Setup GCP Service Account integration",
    description="Validates and stores GCP Service Account JSON encrypted via KMS. Rate limited: 10 req/min."
)
async def setup_gcp_integration(
    org_slug: str,
    setup_request: SetupIntegrationRequest,
    request: Request,
    org: Dict = Depends(get_current_org),
    bq_client: BigQueryClient = Depends(get_bigquery_client)
):
    """
    Setup GCP Service Account integration.

    The credential should be the full Service Account JSON.
    """
    # SECURITY: Validate org_slug format first
    validate_org_slug(org_slug)
    # SECURITY: Rate limiting to prevent brute force attacks on credentials (10 req/min)
    await safe_rate_limit(request, org_slug, 10, "setup_gcp_integration")

    # SECURITY: Enforce credential size limit (Issue #50)
    credential_size = len(setup_request.credential.encode('utf-8'))
    if credential_size > settings.max_credential_size_bytes:
        logger.warning(
            f"Credential size exceeds limit for {org_slug}",
            extra={
                "org_slug": org_slug,
                "credential_size": credential_size,
                "max_size": settings.max_credential_size_bytes
            }
        )
        raise HTTPException(
            status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
            detail=f"Credential size ({credential_size} bytes) exceeds maximum allowed ({settings.max_credential_size_bytes} bytes)"
        )

    # INT-001 FIX: Always validate org ownership, even in dev mode
    # The auth dependency already provides the authenticated org - we must verify it matches
    if org.get("org_slug") != org_slug:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Cannot configure integrations for another organization"
        )

    # Validate JSON format with specific error messages
    try:
        sa_data = json.loads(setup_request.credential)
    except json.JSONDecodeError as e:
        logger.warning(
            f"Invalid JSON in GCP credential for {org_slug}",
            extra={"error": str(e), "error_type": "json_decode"}
        )
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid JSON format: The credential must be valid JSON. Please copy the entire contents of your Service Account JSON file."
        )

    # Validate required fields
    if not isinstance(sa_data, dict):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid credential format: Expected a JSON object, not an array or primitive value."
        )

    if sa_data.get("type") != "service_account":
        actual_type = sa_data.get("type", "missing")
        logger.warning(
            f"Invalid credential type for {org_slug}",
            extra={"expected": "service_account", "actual": actual_type}
        )
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Invalid credential type: Expected 'service_account' but got '{actual_type}'. Please ensure you're using a Service Account JSON key file."
        )

    # Validate other required SA fields
    required_fields = ["project_id", "private_key", "client_email"]
    missing_fields = [f for f in required_fields if not sa_data.get(f)]
    if missing_fields:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Invalid Service Account JSON: Missing required fields: {', '.join(missing_fields)}"
        )

    # INT-003 FIX: Validate metadata size BEFORE adding SA fields
    enforce_metadata_size_limit(setup_request.metadata, org_slug)

    # Extract metadata from SA JSON
    metadata = setup_request.metadata or {}
    metadata["project_id"] = sa_data.get("project_id")
    metadata["client_email"] = sa_data.get("client_email")

    # BUG-020 FIX: Validate metadata JSON schema AFTER adding SA fields
    # Use registry-based normalization for consistent provider naming
    gcp_provider = normalize_provider("gcp_sa")
    is_valid, error_msg = validate_metadata(gcp_provider, metadata)
    if not is_valid:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Invalid metadata structure: {error_msg}"
        )

    request_id = get_request_id(request)
    return await _setup_integration(
        org_slug=org_slug,
        provider=gcp_provider,
        credential=setup_request.credential,
        credential_name=setup_request.credential_name or f"GCP SA ({sa_data.get('project_id')})",
        metadata=metadata,
        skip_validation=setup_request.skip_validation,
        user_id=org.get("user_id"),
        request_id=request_id,
        api_key_id=org.get("org_api_key_id")
    )


@router.post(
    "/integrations/{org_slug}/openai/setup",
    response_model=SetupIntegrationResponse,
    summary="Setup OpenAI integration",
    description="Validates and stores OpenAI API key encrypted via KMS. Rate limited: 10 req/min."
)
async def setup_openai_integration(
    org_slug: str,
    setup_request: SetupIntegrationRequest,
    request: Request,
    org: Dict = Depends(get_current_org),
    bq_client: BigQueryClient = Depends(get_bigquery_client)
):
    """Setup OpenAI integration for an organization."""
    # SECURITY: Validate org_slug format first
    validate_org_slug(org_slug)
    # SECURITY: Rate limiting to prevent brute force attacks on credentials (10 req/min)
    await safe_rate_limit(request, org_slug, 10, "setup_openai_integration")

    # INT-001 FIX: Always validate org ownership, even in dev mode
    if org.get("org_slug") != org_slug:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Cannot configure integrations for another organization"
        )

    # INT-003 FIX: Validate metadata size before processing
    enforce_metadata_size_limit(setup_request.metadata, org_slug)

    # BUG-020 FIX: Validate metadata JSON schema
    # Use registry-based normalization for consistent provider naming
    openai_provider = normalize_provider("openai")
    is_valid, error_msg = validate_metadata(openai_provider, setup_request.metadata)
    if not is_valid:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Invalid metadata structure: {error_msg}"
        )

    request_id = get_request_id(request)
    return await _setup_integration(
        org_slug=org_slug,
        provider=openai_provider,
        credential=setup_request.credential,
        credential_name=setup_request.credential_name or "OpenAI API Key",
        metadata=setup_request.metadata,
        skip_validation=setup_request.skip_validation,
        user_id=org.get("user_id"),
        request_id=request_id,
        api_key_id=org.get("org_api_key_id")
    )


@router.post(
    "/integrations/{org_slug}/anthropic/setup",
    response_model=SetupIntegrationResponse,
    summary="Setup Anthropic (Claude) integration",
    description="Validates and stores Anthropic API key encrypted via KMS. Rate limited: 10 req/min."
)
async def setup_anthropic_integration(
    org_slug: str,
    setup_request: SetupIntegrationRequest,
    request: Request,
    org: Dict = Depends(get_current_org),
    bq_client: BigQueryClient = Depends(get_bigquery_client)
):
    """Setup Anthropic/Claude integration."""
    # SECURITY: Validate org_slug format first
    validate_org_slug(org_slug)
    # SECURITY: Rate limiting to prevent brute force attacks on credentials (10 req/min)
    await safe_rate_limit(request, org_slug, 10, "setup_anthropic_integration")

    # INT-001 FIX: Always validate org ownership, even in dev mode
    if org.get("org_slug") != org_slug:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Cannot configure integrations for another organization"
        )

    # INT-003 FIX: Validate metadata size before processing
    enforce_metadata_size_limit(setup_request.metadata, org_slug)

    # BUG-020 FIX: Validate metadata JSON schema
    is_valid, error_msg = validate_metadata("ANTHROPIC", setup_request.metadata)
    if not is_valid:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Invalid metadata structure: {error_msg}"
        )

    request_id = get_request_id(request)
    return await _setup_integration(
        org_slug=org_slug,
        provider="ANTHROPIC",
        credential=setup_request.credential,
        credential_name=setup_request.credential_name or "Anthropic API Key",
        metadata=setup_request.metadata,
        skip_validation=setup_request.skip_validation,
        user_id=org.get("user_id"),
        request_id=request_id,
        api_key_id=org.get("org_api_key_id")
    )


@router.post(
    "/integrations/{org_slug}/gemini/setup",
    response_model=SetupIntegrationResponse,
    summary="Setup Google Gemini integration",
    description="Validates and stores Gemini API key encrypted via KMS. Rate limited: 10 req/min."
)
async def setup_gemini_integration(
    org_slug: str,
    setup_request: SetupIntegrationRequest,
    request: Request,
    org: Dict = Depends(get_current_org),
    bq_client: BigQueryClient = Depends(get_bigquery_client)
):
    """Setup Google Gemini integration for an organization."""
    # SECURITY: Validate org_slug format first
    validate_org_slug(org_slug)
    # SECURITY: Rate limiting to prevent brute force attacks on credentials (10 req/min)
    await safe_rate_limit(request, org_slug, 10, "setup_gemini_integration")

    # INT-001 FIX: Always validate org ownership, even in dev mode
    if org.get("org_slug") != org_slug:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Cannot configure integrations for another organization"
        )

    # INT-003 FIX: Validate metadata size before processing
    enforce_metadata_size_limit(setup_request.metadata, org_slug)

    # BUG-020 FIX: Validate metadata JSON schema
    is_valid, error_msg = validate_metadata("GEMINI", setup_request.metadata)
    if not is_valid:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Invalid metadata structure: {error_msg}"
        )

    request_id = get_request_id(request)
    return await _setup_integration(
        org_slug=org_slug,
        provider="GEMINI",
        credential=setup_request.credential,
        credential_name=setup_request.credential_name or "Gemini API Key",
        metadata=setup_request.metadata,
        skip_validation=setup_request.skip_validation,
        user_id=org.get("user_id"),
        request_id=request_id,
        api_key_id=org.get("org_api_key_id")
    )


@router.post(
    "/integrations/{org_slug}/deepseek/setup",
    response_model=SetupIntegrationResponse,
    summary="Setup DeepSeek integration",
    description="Validates and stores DeepSeek API key encrypted via KMS. Rate limited: 10 req/min."
)
async def setup_deepseek_integration(
    org_slug: str,
    setup_request: SetupIntegrationRequest,
    request: Request,
    org: Dict = Depends(get_current_org),
    bq_client: BigQueryClient = Depends(get_bigquery_client)
):
    """Setup DeepSeek integration for an organization."""
    # SECURITY: Validate org_slug format first
    validate_org_slug(org_slug)
    # SECURITY: Rate limiting to prevent brute force attacks on credentials (10 req/min)
    await safe_rate_limit(request, org_slug, 10, "setup_deepseek_integration")

    # INT-001 FIX: Always validate org ownership, even in dev mode
    if org.get("org_slug") != org_slug:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Cannot configure integrations for another organization"
        )

    # INT-003 FIX: Validate metadata size before processing
    enforce_metadata_size_limit(setup_request.metadata, org_slug)

    # BUG-020 FIX: Validate metadata JSON schema
    is_valid, error_msg = validate_metadata("DEEPSEEK", setup_request.metadata)
    if not is_valid:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Invalid metadata structure: {error_msg}"
        )

    request_id = get_request_id(request)
    return await _setup_integration(
        org_slug=org_slug,
        provider="DEEPSEEK",
        credential=setup_request.credential,
        credential_name=setup_request.credential_name or "DeepSeek API Key",
        metadata=setup_request.metadata,
        skip_validation=setup_request.skip_validation,
        user_id=org.get("user_id"),
        request_id=request_id,
        api_key_id=org.get("org_api_key_id")
    )


# ============================================
# Integration Validation Endpoints (Provider-Based)
# ============================================

@router.post(
    "/integrations/{org_slug}/gcp/validate",
    response_model=SetupIntegrationResponse,
    summary="Validate GCP integration",
    description="Re-validate GCP Service Account credentials. Rate limited: 30 req/min."
)
async def validate_gcp_integration(
    org_slug: str,
    request: Request,
    org: Dict = Depends(get_current_org),
    bq_client: BigQueryClient = Depends(get_bigquery_client)
):
    """Re-validate GCP Service Account credentials using authenticator."""
    # SECURITY: Validate org_slug format first
    validate_org_slug(org_slug)
    # Rate limiting: 30 requests per minute for validation endpoints
    await safe_rate_limit(request, org_slug, 30, "validate_gcp_integration")
    return await _validate_integration(org_slug, "GCP_SA", org)


@router.post(
    "/integrations/{org_slug}/openai/validate",
    response_model=SetupIntegrationResponse,
    summary="Validate OpenAI integration",
    description="Re-validate OpenAI API key. Rate limited: 30 req/min."
)
async def validate_openai_integration(
    org_slug: str,
    request: Request,
    org: Dict = Depends(get_current_org),
    bq_client: BigQueryClient = Depends(get_bigquery_client)
):
    """Re-validate OpenAI API key using authenticator."""
    # SECURITY: Validate org_slug format first
    validate_org_slug(org_slug)
    # Rate limiting: 30 requests per minute for validation endpoints
    await safe_rate_limit(request, org_slug, 30, "validate_openai_integration")
    return await _validate_integration(org_slug, "OPENAI", org)


@router.post(
    "/integrations/{org_slug}/anthropic/validate",
    response_model=SetupIntegrationResponse,
    summary="Validate Anthropic integration",
    description="Re-validate Anthropic API key. Rate limited: 30 req/min."
)
async def validate_anthropic_integration(
    org_slug: str,
    request: Request,
    org: Dict = Depends(get_current_org),
    bq_client: BigQueryClient = Depends(get_bigquery_client)
):
    """Re-validate Anthropic API key using authenticator."""
    # SECURITY: Validate org_slug format first
    validate_org_slug(org_slug)
    # Rate limiting: 30 requests per minute for validation endpoints
    await safe_rate_limit(request, org_slug, 30, "validate_anthropic_integration")
    return await _validate_integration(org_slug, "ANTHROPIC", org)


@router.post(
    "/integrations/{org_slug}/gemini/validate",
    response_model=SetupIntegrationResponse,
    summary="Validate Gemini integration",
    description="Re-validate Gemini API key. Rate limited: 30 req/min."
)
async def validate_gemini_integration(
    org_slug: str,
    request: Request,
    org: Dict = Depends(get_current_org),
    bq_client: BigQueryClient = Depends(get_bigquery_client)
):
    """Re-validate Gemini API key using authenticator."""
    # SECURITY: Validate org_slug format first
    validate_org_slug(org_slug)
    # Rate limiting: 30 requests per minute for validation endpoints
    await safe_rate_limit(request, org_slug, 30, "validate_gemini_integration")
    return await _validate_integration(org_slug, "GEMINI", org)


@router.post(
    "/integrations/{org_slug}/deepseek/validate",
    response_model=SetupIntegrationResponse,
    summary="Validate DeepSeek integration",
    description="Re-validate DeepSeek API key. Rate limited: 30 req/min."
)
async def validate_deepseek_integration(
    org_slug: str,
    request: Request,
    org: Dict = Depends(get_current_org),
    bq_client: BigQueryClient = Depends(get_bigquery_client)
):
    """Re-validate DeepSeek API key using authenticator."""
    # SECURITY: Validate org_slug format first
    validate_org_slug(org_slug)
    # Rate limiting: 30 requests per minute for validation endpoints
    await safe_rate_limit(request, org_slug, 30, "validate_deepseek_integration")
    return await _validate_integration(org_slug, "DEEPSEEK", org)


# ============================================
# Integration Status Endpoints
# ============================================

@router.get(
    "/integrations/{org_slug}",
    response_model=AllIntegrationsResponse,
    response_model_by_alias=True,
    summary="Get all integration statuses",
    description="Returns status of all configured integrations for the organization"
)
async def get_all_integrations(
    request: Request,
    org_slug: str,
    org: Dict = Depends(get_current_org),
    bq_client: BigQueryClient = Depends(get_bigquery_client)
):
    """Get status of all integrations for an organization."""
    # SECURITY: Validate org_slug format first
    validate_org_slug(org_slug)
    # Rate limiting: 100 requests per minute for read endpoints (prevents enumeration attacks)
    await safe_rate_limit(request, org_slug, 100, "get_all_integrations")

    # INT-007 FIX: Always validate org ownership, even in dev mode
    if org.get("org_slug") != org_slug:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Cannot view integrations for another organization"
        )

    try:
        from src.core.processors.integrations.kms_decrypt import GetIntegrationStatusProcessor

        processor = GetIntegrationStatusProcessor()
        result = await processor.execute(
            step_config={},
            context={"org_slug": org_slug}
        )

        if result["status"] == "FAILED":
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail=result.get("error")
            )

        # Build response with all providers (including not configured)
        integrations_data = result.get("integrations", {})

        integrations = {}
        for provider in get_valid_providers():
            if provider in integrations_data:
                data = integrations_data[provider]
                integrations[provider] = IntegrationStatusResponse(
                    provider=provider,
                    validation_status=data.get("status", "INVALID"),
                    credential_name=data.get("name"),
                    last_validated_at=datetime.fromisoformat(data["last_validated"]) if data.get("last_validated") else None,
                    last_error=data.get("last_error"),
                    created_at=datetime.fromisoformat(data["created_at"]) if data.get("created_at") else None,
                    metadata=data.get("metadata"),
                )
            else:
                integrations[provider] = IntegrationStatusResponse(
                    provider=provider,
                    validation_status="NOT_CONFIGURED",
                    credential_name=None,
                    last_validated_at=None,
                    last_error=None,
                    created_at=None,
                    metadata=None,
                )

        return AllIntegrationsResponse(
            org_slug=org_slug,
            integrations=integrations,
            all_valid=result.get("all_valid", False),
            providers_configured=result.get("providers_configured", [])
        )

    except HTTPException:
        raise
    except Exception as e:
        # SECURITY: Log full details but return generic message to client
        logger.error(
            f"Error getting integrations for {org_slug}",
            extra={"error_type": type(e).__name__},
            exc_info=True
        )
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to retrieve integrations. Please try again or contact support."
        )


@router.get(
    "/integrations/{org_slug}/{provider}",
    response_model=IntegrationStatusResponse,
    response_model_by_alias=True,
    summary="Get single integration status"
)
async def get_integration_status(
    request: Request,
    org_slug: str,
    provider: str,
    org: Dict = Depends(get_current_org),
    bq_client: BigQueryClient = Depends(get_bigquery_client)
):
    """Get status of a specific integration."""
    # SECURITY: Validate org_slug format first
    validate_org_slug(org_slug)
    # Rate limiting: 100 requests per minute for read endpoints (prevents enumeration attacks)
    await safe_rate_limit(request, org_slug, 100, "get_integration_status")

    # BUG-001 FIX: Always validate org ownership, even in dev mode
    if org.get("org_slug") != org_slug:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Cannot view integrations for another organization"
        )

    provider_upper = normalize_provider(provider)
    all_integrations = await get_all_integrations(request, org_slug, org, bq_client)
    integration = all_integrations.integrations.get(provider_upper)

    if not integration:
        logger.warning(f"Unknown provider requested: {provider}")
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Provider not found. Please check the supported providers list."
        )

    return integration


class UpdateIntegrationRequest(BaseModel):
    """Request to update an integration."""
    credential: Optional[str] = Field(
        None,
        description="New credential (API key or Service Account JSON)",
        min_length=10,
        max_length=50000
    )
    credential_name: Optional[str] = Field(
        None,
        description="Updated human-readable name for this credential",
        min_length=3,
        max_length=200
    )
    metadata: Optional[Dict[str, Any]] = Field(
        None,
        description="Updated additional metadata"
    )
    skip_validation: bool = Field(
        False,
        description="Skip credential validation"
    )

    model_config = ConfigDict(extra="forbid")


@router.put(
    "/integrations/{org_slug}/{provider}",
    response_model=SetupIntegrationResponse,
    summary="Update an integration",
    description="Update an existing integration's credential or metadata. Rate limited: 10 req/min."
)
async def update_integration(
    org_slug: str,
    provider: str,
    update_request: UpdateIntegrationRequest,
    request: Request,
    org: Dict = Depends(get_current_org),
    bq_client: BigQueryClient = Depends(get_bigquery_client)
):
    """
    Update an existing integration.

    If credential is provided, it will be re-encrypted and validated.
    If only credential_name or metadata is provided, only those fields are updated.
    """
    # SECURITY: Validate org_slug format first
    validate_org_slug(org_slug)
    # SECURITY: Rate limiting to prevent brute force attacks on credentials (10 req/min)
    await safe_rate_limit(request, org_slug, 10, "update_integration")

    # BUG-004 FIX: Always validate org ownership (no dev mode bypass)
    if org.get("org_slug") != org_slug:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Cannot update integrations for another organization"
        )

    provider_upper = normalize_provider(provider)

    # Check if integration exists
    try:
        check_query = f"""
        SELECT credential_id, credential_name, metadata
        FROM `{settings.gcp_project_id}.organizations.org_integration_credentials`
        WHERE org_slug = @org_slug AND provider = @provider AND is_active = TRUE
        LIMIT 1
        """

        check_result = list(bq_client.client.query(
            check_query,
            job_config=bigquery.QueryJobConfig(
                query_parameters=[
                    bigquery.ScalarQueryParameter("org_slug", "STRING", org_slug),
                    bigquery.ScalarQueryParameter("provider", "STRING", provider_upper),
                ]
            )
        ).result())

        if not check_result:
            # SECURITY: Log details but return generic message
            logger.info(f"No active {provider_upper} integration found for {org_slug}")
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="No active integration found for the specified provider."
            )

        existing_credential_id = check_result[0]["credential_id"]
        existing_name = check_result[0]["credential_name"]
        existing_metadata_raw = check_result[0].get("metadata")

        # Parse existing metadata
        existing_metadata = {}
        if existing_metadata_raw:
            import json
            try:
                if isinstance(existing_metadata_raw, str):
                    existing_metadata = json.loads(existing_metadata_raw)
                elif isinstance(existing_metadata_raw, dict):
                    existing_metadata = existing_metadata_raw
            except json.JSONDecodeError:
                existing_metadata = {}

        # BUG-004 FIX: Verify credential_id belongs to this org (paranoid check)
        # The query already filters by org_slug, but explicitly validate for security
        if not existing_credential_id:
            logger.error(f"Empty credential_id returned for {org_slug}/{provider_upper}")
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail="Integration data integrity error"
            )

    except HTTPException:
        raise
    except Exception as e:
        # SECURITY: Log full details but return generic message to client
        logger.error(
            f"Error checking integration for {org_slug}/{provider_upper}",
            extra={"error_type": type(e).__name__},
            exc_info=True
        )
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to verify integration status. Please try again or contact support."
        )

    # If new credential is provided, re-setup entirely
    if update_request.credential:
        request_id = get_request_id(request)
        return await _setup_integration(
            org_slug=org_slug,
            provider=provider_upper,
            credential=update_request.credential,
            credential_name=update_request.credential_name or existing_name,
            metadata=update_request.metadata,
            skip_validation=update_request.skip_validation,
            user_id=org.get("user_id"),
            request_id=request_id,
            api_key_id=org.get("org_api_key_id")
        )

    # Otherwise, update metadata/name only
    try:
        update_fields = ["updated_at = CURRENT_TIMESTAMP()"]
        query_params = [
            bigquery.ScalarQueryParameter("org_slug", "STRING", org_slug),
            bigquery.ScalarQueryParameter("provider", "STRING", provider_upper),
        ]

        if update_request.credential_name:
            update_fields.append("credential_name = @credential_name")
            query_params.append(bigquery.ScalarQueryParameter("credential_name", "STRING", update_request.credential_name))

        if update_request.metadata:
            import json
            # BUG-007 FIX: Validate metadata size before JSON serialization
            enforce_metadata_size_limit(update_request.metadata, org_slug)

            # CRUD-002 FIX: Filter protected fields that should only be set from credentials
            # These are derived from the Service Account/API key and must not be overwritten
            PROTECTED_METADATA_KEYS = {"project_id", "client_email", "credential_type", "private_key_id"}
            filtered_metadata = {
                k: v for k, v in update_request.metadata.items()
                if k not in PROTECTED_METADATA_KEYS
            }

            # Merge filtered metadata with existing metadata (protected fields preserved)
            merged_metadata = existing_metadata.copy()
            merged_metadata.update(filtered_metadata)

            # BUG-020 FIX: Validate merged metadata JSON schema before update
            is_valid, error_msg = validate_metadata(provider_upper, merged_metadata)
            if not is_valid:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail=f"Invalid metadata structure: {error_msg}"
                )

            # Use PARSE_JSON to convert string to JSON type for BigQuery
            update_fields.append("metadata = PARSE_JSON(@metadata)")
            query_params.append(bigquery.ScalarQueryParameter("metadata", "STRING", json.dumps(merged_metadata)))

        update_query = f"""
        UPDATE `{settings.gcp_project_id}.organizations.org_integration_credentials`
        SET {', '.join(update_fields)}
        WHERE org_slug = @org_slug AND provider = @provider AND is_active = TRUE
        """

        logger.info(
            f"Executing metadata update query",
            extra={
                "org_slug": org_slug,
                "provider": provider_upper,
                "update_fields": update_fields,
                "query_preview": update_query[:200]
            }
        )

        try:
            query_job = bq_client.client.query(
                update_query,
                job_config=bigquery.QueryJobConfig(query_parameters=query_params)
            )
            query_job.result()
        except Exception as query_error:
            logger.error(
                f"BigQuery UPDATE failed: {str(query_error)}",
                extra={
                    "org_slug": org_slug,
                    "provider": provider_upper,
                    "error_type": type(query_error).__name__,
                    "error_message": str(query_error)
                }
            )
            raise

        logger.info(f"Updated {provider_upper} integration metadata for {org_slug}")

        return SetupIntegrationResponse(
            success=True,
            provider=provider_upper,
            credential_id=existing_credential_id,
            validation_status="VALID",  # No re-validation needed for metadata-only update
            validation_error=None,
            message=f"{provider_upper} integration updated successfully"
        )

    except HTTPException:
        raise
    except Exception as e:
        # SECURITY: Log full details but return generic message to client
        error_msg = str(e)
        logger.error(
            f"Error updating integration for {org_slug}/{provider_upper}: {error_msg}",
            extra={
                "error_type": type(e).__name__,
                "error_message": error_msg[:500],
                "org_slug": org_slug,
                "provider": provider_upper
            },
            exc_info=True
        )
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to update integration: {error_msg[:200]}"
        )


@router.delete(
    "/integrations/{org_slug}/{provider}",
    summary="Delete an integration",
    description="Deactivate an integration. Rate limited: 10 req/min."
)
async def delete_integration(
    org_slug: str,
    provider: str,
    request: Request,
    org: Dict = Depends(get_current_org),
    bq_client: BigQueryClient = Depends(get_bigquery_client)
):
    """Delete (deactivate) an integration."""
    # SECURITY: Validate org_slug format first
    validate_org_slug(org_slug)
    # Rate limiting: 10 requests per minute for delete endpoints (lower limit)
    await safe_rate_limit(request, org_slug, 10, "delete_integration")

    # BUG-006 FIX: Always validate org ownership, even in dev mode
    if org.get("org_slug") != org_slug:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Cannot delete integrations for another organization"
        )

    provider_upper = normalize_provider(provider)

    try:
        # First, get the credential_id(s) that will be affected for audit logging
        select_query = f"""
        SELECT credential_id
        FROM `{settings.gcp_project_id}.organizations.org_integration_credentials`
        WHERE org_slug = @org_slug AND provider = @provider AND is_active = TRUE
        """

        select_results = list(bq_client.client.query(
            select_query,
            job_config=bigquery.QueryJobConfig(
                query_parameters=[
                    bigquery.ScalarQueryParameter("org_slug", "STRING", org_slug),
                    bigquery.ScalarQueryParameter("provider", "STRING", provider_upper),
                ]
            )
        ).result())

        credential_ids = [row["credential_id"] for row in select_results] if select_results else []

        # Perform the soft delete
        query = f"""
        UPDATE `{settings.gcp_project_id}.organizations.org_integration_credentials`
        SET is_active = FALSE, updated_at = CURRENT_TIMESTAMP()
        WHERE org_slug = @org_slug AND provider = @provider AND is_active = TRUE
        """

        bq_client.client.query(
            query,
            job_config=bigquery.QueryJobConfig(
                query_parameters=[
                    bigquery.ScalarQueryParameter("org_slug", "STRING", org_slug),
                    bigquery.ScalarQueryParameter("provider", "STRING", provider_upper),
                ]
            )
        ).result()

        logger.info(f"Deleted {provider_upper} integration for {org_slug}")

        # Audit log: Credential deleted (soft delete)
        for credential_id in credential_ids:
            await log_delete(
                org_slug=org_slug,
                resource_type=AuditLogger.RESOURCE_CREDENTIAL,
                resource_id=credential_id,
                api_key_id=org.get("org_api_key_id"),
                details={
                    "provider": provider_upper,
                    "action": "CREDENTIAL_DELETED",
                    "soft_delete": True
                }
            )

        return {
            "success": True,
            "message": f"{provider_upper} integration deleted",
            "provider": provider_upper
        }

    except Exception as e:
        # SECURITY: Log full details but return generic message to client
        logger.error(
            f"Error deleting integration for {org_slug}/{provider_upper}",
            extra={"error_type": type(e).__name__},
            exc_info=True
        )
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to delete integration. Please try again or contact support."
        )


# ============================================
# Helper Functions
# ============================================

async def _setup_integration(
    org_slug: str,
    provider: str,
    credential: str,
    credential_name: str,
    metadata: Optional[Dict],
    skip_validation: bool,
    user_id: Optional[str],
    request_id: Optional[str] = None,
    api_key_id: Optional[str] = None
) -> SetupIntegrationResponse:
    """
    Common logic for setting up any integration.

    Args:
        org_slug: Organization identifier
        provider: Provider name (e.g., GCP_SA, OPENAI)
        credential: The credential string to store
        credential_name: Human-readable name for the credential
        metadata: Optional metadata dictionary
        skip_validation: Whether to skip credential validation
        user_id: Optional user ID for audit logging
        request_id: Optional request ID for distributed tracing/correlation
        api_key_id: Optional API key ID for audit logging

    Returns:
        SetupIntegrationResponse with setup result
    """
    try:
        # SECURITY: Enforce credential size limit (Issue #50)
        enforce_credential_size_limit(credential, org_slug)

        # SECURITY: Validate table name components before dynamic usage
        # This prevents SQL injection in table names constructed from org_slug/provider
        sanitize_sql_identifier(org_slug, "org_slug")
        # BUG-002 FIX: Validate provider against allowlist instead of just stripping underscores
        # Provider must be in registry's valid providers list
        if not provider_registry.is_valid_provider(provider):
            logger.error(
                f"SQL injection attempt? Invalid provider after normalization: {provider}",
                extra={"provider": provider, "org_slug": org_slug, "security_category": "sql_injection_attempt"}
            )
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Invalid provider specified"
            )

        # INTEGRATION LIMITS ENFORCEMENT: Check if adding a new integration would exceed the org's provider limit
        bq_client = get_bigquery_client()

        # Check if this is a new integration (not an update to existing one)
        existing_integration_query = f"""
        SELECT COUNT(*) as cnt
        FROM `{settings.gcp_project_id}.organizations.org_integration_credentials`
        WHERE org_slug = @org_slug AND provider = @provider AND is_active = TRUE
        """

        existing_result = list(bq_client.client.query(
            existing_integration_query,
            job_config=bigquery.QueryJobConfig(
                query_parameters=[
                    bigquery.ScalarQueryParameter("org_slug", "STRING", org_slug),
                    bigquery.ScalarQueryParameter("provider", "STRING", provider),
                ]
            )
        ).result())

        is_new_integration = existing_result[0]["cnt"] == 0

        # Only enforce limits for NEW integrations (not updates)
        if is_new_integration:
            # Count current active integrations
            count_query = f"""
            SELECT COUNT(DISTINCT provider) as provider_count
            FROM `{settings.gcp_project_id}.organizations.org_integration_credentials`
            WHERE org_slug = @org_slug AND is_active = TRUE
            """

            count_result = list(bq_client.client.query(
                count_query,
                job_config=bigquery.QueryJobConfig(
                    query_parameters=[
                        bigquery.ScalarQueryParameter("org_slug", "STRING", org_slug),
                    ]
                )
            ).result())

            current_integration_count = count_result[0]["provider_count"]

            # Get org's provider limit from Supabase organizations table
            from src.app.models.org_models import SUBSCRIPTION_LIMITS, SubscriptionPlan

            try:
                supabase = get_supabase_client()
                org_result = supabase.table("organizations").select(
                    "providers_limit, subscription_plan, subscription_status"
                ).eq("org_slug", org_slug).single().execute()

                if not org_result.data:
                    raise HTTPException(
                        status_code=status.HTTP_404_NOT_FOUND,
                        detail="Organization not found. Please complete billing setup."
                    )

                org_data = org_result.data
                subscription_status = org_data.get("subscription_status", "ACTIVE")

                # Check if subscription is active or trial
                if subscription_status not in ("ACTIVE", "TRIAL"):
                    raise HTTPException(
                        status_code=status.HTTP_403_FORBIDDEN,
                        detail=f"Subscription is {subscription_status}. Please contact support."
                    )

                providers_limit = org_data.get("providers_limit")

                # Fallback to SUBSCRIPTION_LIMITS if providers_limit is NULL
                if providers_limit is None:
                    plan_name = org_data.get("subscription_plan", "STARTER")
                    try:
                        plan_enum = SubscriptionPlan(plan_name)
                        providers_limit = SUBSCRIPTION_LIMITS[plan_enum]["providers_limit"]
                        logger.info(f"Using fallback providers_limit={providers_limit} for plan {plan_name}")
                    except (ValueError, KeyError):
                        providers_limit = 3  # Default to STARTER limit
                        logger.warning(f"Unknown plan {plan_name}, using default providers_limit=3")

            except HTTPException:
                raise
            except Exception as supabase_error:
                logger.error(f"Failed to get provider limit from Supabase: {supabase_error}")
                providers_limit = 3  # Default to STARTER limit

            # Check if adding new integration would exceed limit
            if current_integration_count >= providers_limit:
                # Handle unlimited (999999) case
                if providers_limit == 999999:
                    pass  # Unlimited, allow integration
                else:
                    logger.warning(
                        f"Integration limit reached for {org_slug}",
                        extra={
                            "org_slug": org_slug,
                            "current_count": current_integration_count,
                            "limit": providers_limit,
                            "attempted_provider": provider
                        }
                    )
                    raise HTTPException(
                        status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                        detail=f"Integration limit reached. Your plan allows {providers_limit} integrations. Upgrade to add more."
                    )

        from src.core.processors.integrations.kms_store import KMSStoreIntegrationProcessor

        processor = KMSStoreIntegrationProcessor()

        result = await processor.execute(
            step_config={
                "config": {
                    "provider": provider,
                    "skip_validation": skip_validation,
                    "credential_name": credential_name,
                }
            },
            context={
                "org_slug": org_slug,
                "plaintext_credential": credential,
                "user_id": user_id,
                "metadata": metadata or {},
                "request_id": request_id,
            }
        )

        if result["status"] == "SUCCESS":
            validation_status = result.get("validation_status", "PENDING")
            validation_error = result.get("validation_error")

            # Determine success based on validation status
            is_valid = validation_status == "VALID"

            # Initialize pricing and subscriptions tables for LLM providers if validation succeeded
            pricing_initialized = False
            pricing_rows_seeded = 0
            subscriptions_initialized = False
            subscriptions_rows_seeded = 0

            # Check if provider is GenAI and has data tables configured (from providers.yml)
            if provider_registry.is_genai_provider(provider) and provider_registry.has_data_tables(provider) and is_valid:
                try:
                    pricing_result = await _initialize_genai_pricing(org_slug, provider.lower())
                    pricing_initialized = pricing_result.get("status") == "SUCCESS"
                    pricing_rows_seeded = pricing_result.get("rows_seeded", 0)

                    subs_result = await _initialize_subscriptions(org_slug, provider.lower())
                    subscriptions_initialized = subs_result.get("status") == "SUCCESS"
                    subscriptions_rows_seeded = subs_result.get("rows_seeded", 0)

                    logger.info(
                        f"{provider} data tables initialized for {org_slug}",
                        extra={
                            "pricing_rows": pricing_rows_seeded,
                            "subscription_rows": subscriptions_rows_seeded
                        }
                    )
                except Exception as e:
                    logger.warning(f"Failed to initialize {provider} data tables: {e}")
                    # Don't fail the integration setup if data init fails

            # GCP integration: Also initialize Gemini AI tables (usage from billing export)
            gemini_pricing_rows = 0
            gemini_subs_rows = 0
            if provider == "GCP_SA" and provider_registry.has_gemini_data_tables(provider) and is_valid:
                try:
                    gemini_pricing_result = await _initialize_gemini_pricing(org_slug)
                    gemini_pricing_rows = gemini_pricing_result.get("rows_seeded", 0)

                    gemini_subs_result = await _initialize_gemini_subscriptions(org_slug)
                    gemini_subs_rows = gemini_subs_result.get("rows_seeded", 0)

                    logger.info(
                        f"Gemini AI data tables initialized for {org_slug}",
                        extra={
                            "gemini_pricing_rows": gemini_pricing_rows,
                            "gemini_subscription_rows": gemini_subs_rows
                        }
                    )
                except Exception as e:
                    logger.warning(f"Failed to initialize Gemini data tables: {e}")
                    # Don't fail the integration setup if Gemini data init fails

            # Generate appropriate message based on validation status
            if is_valid:
                message = f"{provider} integration configured and validated successfully"
                if provider_registry.has_data_tables(provider):
                    message += f" (pricing: {pricing_rows_seeded} rows, subscriptions: {subscriptions_rows_seeded} rows)"
                if provider == "GCP_SA" and provider_registry.has_gemini_data_tables(provider):
                    message += f" (Gemini: {gemini_pricing_rows} pricing, {gemini_subs_rows} subscriptions)"
            elif validation_status == "INVALID":
                message = f"{provider} credential validation failed: {validation_error or 'Invalid API key'}"
            elif validation_status == "PENDING":
                message = f"{provider} integration configured (validation pending)"
            else:
                message = f"{provider} integration configured with status: {validation_status}"

            logger.info(
                f"Integration setup completed",
                extra={
                    "org_slug": org_slug,
                    "provider": provider,
                    "validation_status": validation_status,
                    "is_valid": is_valid,
                    "pricing_initialized": pricing_initialized,
                    "subscriptions_initialized": subscriptions_initialized,
                    "request_id": request_id
                }
            )

            # Audit log: Integration created/updated
            await log_create(
                org_slug=org_slug,
                resource_type=AuditLogger.RESOURCE_INTEGRATION,
                resource_id=result.get("credential_id"),
                api_key_id=api_key_id,
                request_id=request_id,
                details={
                    "provider": provider,
                    "validation_status": validation_status,
                    "credential_name": credential_name,
                    "action": "INTEGRATION_SETUP"
                }
            )

            return SetupIntegrationResponse(
                success=is_valid,
                provider=provider,
                credential_id=result.get("credential_id"),
                validation_status=validation_status,
                validation_error=validation_error,
                message=message
            )
        else:
            # SECURITY: Log full error but return generic message to client
            error_detail = result.get("error", "Unknown error")
            logger.error(
                f"Integration setup failed for {org_slug}/{provider}",
                extra={"error_detail": error_detail, "request_id": request_id}
            )
            return SetupIntegrationResponse(
                success=False,
                provider=provider,
                credential_id=None,
                validation_status="FAILED",
                validation_error="Integration setup failed",
                message=f"Failed to setup {provider} integration. Please verify your credentials and try again."
            )

    except HTTPException:
        raise
    except Exception as e:
        # SECURITY: Log full details but return generic message to client
        logger.error(
            f"Integration setup error for {org_slug}/{provider}",
            extra={"error_type": type(e).__name__, "request_id": request_id},
            exc_info=True
        )
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Integration setup failed. Please try again or contact support."
        )


async def _validate_integration(
    org_slug: str,
    provider: str,
    org: Dict
) -> SetupIntegrationResponse:
    """Common logic for validating any integration using authenticators."""
    # SEC-001 FIX: Always validate org ownership, even in dev mode
    # Matches the pattern used in setup endpoints (INT-001 FIX)
    if org["org_slug"] != org_slug:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Cannot validate integrations for another organization"
        )

    try:
        # Import authenticators based on provider
        if provider == "GCP_SA":
            from src.core.processors.gcp.authenticator import GCPAuthenticator
            auth = GCPAuthenticator(org_slug)
        elif provider == "OPENAI":
            from src.core.processors.openai.authenticator import OpenAIAuthenticator
            auth = OpenAIAuthenticator(org_slug)
        elif provider == "ANTHROPIC":
            from src.core.processors.anthropic.authenticator import AnthropicAuthenticator
            auth = AnthropicAuthenticator(org_slug)
        else:
            logger.warning(f"Unsupported provider for validation: {provider}")
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Validation is not supported for the specified provider."
            )

        # Validate and update status
        result = await auth.validate()
        await auth.update_validation_status(
            result["status"],
            result.get("error")
        )

        return SetupIntegrationResponse(
            success=True,
            provider=provider,
            credential_id=None,
            validation_status=result.get("status", "UNKNOWN"),
            validation_error=result.get("error"),
            message=result.get("message", "Validation completed")
        )

    except ValueError as e:
        # No credentials found - log details but return generic message
        logger.warning(f"Validation lookup failed for {org_slug}/{provider}: {e}")
        return SetupIntegrationResponse(
            success=False,
            provider=provider,
            credential_id=None,
            validation_status="NOT_CONFIGURED",
            validation_error="Integration not configured",
            message="No integration found for the specified provider."
        )
    except HTTPException:
        raise
    except Exception as e:
        # SECURITY: Log full details but return generic message to client
        logger.error(
            f"Validation error for {org_slug}/{provider}",
            extra={"error_type": type(e).__name__},
            exc_info=True
        )
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Credential validation failed. Please try again or contact support."
        )


# ============================================
# OpenAI Data Initialization Helpers
# ============================================

async def _initialize_openai_pricing(org_slug: str, force: bool = False) -> Dict:
    """
    Create openai_model_pricing table and seed from CSV.

    Args:
        org_slug: Organization identifier
        force: If True, delete existing data and re-insert defaults

    Returns:
        Dict with status and rows_seeded count
    """
    import csv
    from pathlib import Path
    from datetime import datetime

    try:
        # Use settings.get_org_dataset_name() for consistency with onboarding
        # Maps: development -> local, staging -> stage, production -> prod
        dataset_id = settings.get_org_dataset_name(org_slug)
        project_id = settings.gcp_project_id
        table_id = f"{project_id}.{dataset_id}.openai_model_pricing"

        bq_client = bigquery.Client(project=project_id)

        # Load schema
        schema_path = Path(__file__).parent.parent.parent.parent / "configs" / "openai" / "seed" / "schemas" / "openai_model_pricing.json"

        if not schema_path.exists():
            logger.error(f"Schema file not found: {schema_path}")
            return {"status": "FAILED", "error": f"Schema file not found: {schema_path}"}

        import json
        with open(schema_path, 'r') as f:
            schema_data = json.load(f)

        # Handle both formats: direct array or {"schema": [...]}
        if isinstance(schema_data, dict) and "schema" in schema_data:
            schema_json = schema_data["schema"]
        else:
            schema_json = schema_data

        schema = [bigquery.SchemaField.from_api_repr(field) for field in schema_json]

        # Create table if not exists
        table = bigquery.Table(table_id, schema=schema)
        try:
            bq_client.get_table(table_id)
            logger.info(f"Table already exists: {table_id}")
        except Exception as e:
            # Table check failed, creating new table
            table = bq_client.create_table(table)
            logger.info(f"Created table: {table_id}")

        # Check if table has data (and force is False)
        if not force:
            count_query = f"SELECT COUNT(*) as cnt FROM `{table_id}`"
            # Bug fix #2: Add timeout to prevent hanging queries
            result = bq_client.query(count_query).result(timeout=15)
            count = list(result)[0].cnt
            if count > 0:
                logger.info(f"Pricing table already has {count} rows, skipping seed")
                return {"status": "SUCCESS", "message": "Pricing table already has data", "rows_seeded": 0}

        # If force=True, delete existing data
        if force:
            delete_query = f"DELETE FROM `{table_id}` WHERE 1=1"
            job_config = bigquery.QueryJobConfig(job_timeout_ms=300000)  # 5 minute timeout for admin/batch operations
            bq_client.query(delete_query, job_config=job_config).result()
            logger.info(f"Deleted existing pricing data from {table_id}")

        # Load CSV data
        csv_path = Path(__file__).parent.parent.parent.parent / "configs" / "openai" / "seed" / "data" / "default_pricing.csv"

        if not csv_path.exists():
            logger.warning(f"Default pricing CSV not found: {csv_path}")
            return {"status": "SUCCESS", "message": "No default pricing CSV found", "rows_seeded": 0}

        rows = []
        now = datetime.now(timezone.utc).isoformat()

        with open(csv_path, 'r') as f:
            reader = csv.DictReader(f)
            for row in reader:
                # Validate float parsing with error handling
                try:
                    input_price = float(row["input_price_per_1k"])
                    output_price = float(row["output_price_per_1k"])
                except (ValueError, KeyError) as e:
                    logger.warning(f"Invalid pricing data in CSV row {row.get('model_id', 'unknown')}: {e}")
                    continue

                rows.append({
                    "model_id": row["model_id"],
                    "model_name": row.get("model_name"),
                    "input_price_per_1k": input_price,
                    "output_price_per_1k": output_price,
                    "effective_date": row["effective_date"],
                    "notes": row.get("notes"),
                    "created_at": now,
                    "updated_at": now,
                })

        if rows:
            errors = bq_client.insert_rows_json(table_id, rows)
            if errors:
                # SECURITY: Log full error details but return generic message
                logger.error(f"Failed to insert pricing rows for {org_slug}", extra={"bq_errors": errors})
                return {"status": "FAILED", "error": "Failed to insert pricing data"}

        logger.info(f"Seeded {len(rows)} pricing rows for {org_slug}")
        return {"status": "SUCCESS", "rows_seeded": len(rows)}

    except Exception as e:
        # SECURITY: Log full details but return generic message
        logger.error(
            f"Error initializing OpenAI pricing for {org_slug}",
            extra={"error_type": type(e).__name__},
            exc_info=True
        )
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to initialize pricing data. Please try again or contact support."
        ) from e


async def _initialize_openai_subscriptions(org_slug: str, force: bool = False) -> Dict:
    """
    Create openai_subscriptions table and seed from CSV.

    Args:
        org_slug: Organization identifier
        force: If True, delete existing data and re-insert defaults

    Returns:
        Dict with status and rows_seeded count
    """
    import csv
    from pathlib import Path
    from datetime import datetime

    try:
        # Use settings.get_org_dataset_name() for consistency with onboarding
        # Maps: development -> local, staging -> stage, production -> prod
        dataset_id = settings.get_org_dataset_name(org_slug)
        project_id = settings.gcp_project_id
        table_id = f"{project_id}.{dataset_id}.openai_subscriptions"

        bq_client = bigquery.Client(project=project_id)

        # Load schema
        schema_path = Path(__file__).parent.parent.parent.parent / "configs" / "openai" / "seed" / "schemas" / "openai_subscriptions.json"

        if not schema_path.exists():
            logger.error(f"Schema file not found: {schema_path}")
            return {"status": "FAILED", "error": f"Schema file not found: {schema_path}"}

        import json
        with open(schema_path, 'r') as f:
            schema_data = json.load(f)

        # Handle both formats: direct array or {"schema": [...]}
        if isinstance(schema_data, dict) and "schema" in schema_data:
            schema_json = schema_data["schema"]
        else:
            schema_json = schema_data

        schema = [bigquery.SchemaField.from_api_repr(field) for field in schema_json]

        # Create table if not exists
        table = bigquery.Table(table_id, schema=schema)
        try:
            bq_client.get_table(table_id)
            logger.info(f"Table already exists: {table_id}")
        except Exception as e:
            # Table check failed, creating new table
            table = bq_client.create_table(table)
            logger.info(f"Created table: {table_id}")

        # Check if table has data (and force is False)
        if not force:
            count_query = f"SELECT COUNT(*) as cnt FROM `{table_id}`"
            result = bq_client.query(count_query).result(timeout=15)
            count = list(result)[0].cnt
            if count > 0:
                logger.info(f"Subscriptions table already has {count} rows, skipping seed")
                return {"status": "SUCCESS", "message": "Subscriptions table already has data", "rows_seeded": 0}

        # If force=True, delete existing data
        if force:
            delete_query = f"DELETE FROM `{table_id}` WHERE 1=1"
            job_config = bigquery.QueryJobConfig(job_timeout_ms=300000)  # 5 minute timeout for admin/batch operations
            bq_client.query(delete_query, job_config=job_config).result()
            logger.info(f"Deleted existing subscriptions data from {table_id}")

        # Load CSV data
        csv_path = Path(__file__).parent.parent.parent.parent / "configs" / "openai" / "seed" / "data" / "default_subscriptions.csv"

        if not csv_path.exists():
            logger.warning(f"Default subscriptions CSV not found: {csv_path}")
            return {"status": "SUCCESS", "message": "No default subscriptions CSV found", "rows_seeded": 0}

        rows = []
        now = datetime.now(timezone.utc).isoformat()

        with open(csv_path, 'r') as f:
            reader = csv.DictReader(f)
            for row in reader:
                rows.append({
                    "subscription_id": row["subscription_id"],
                    "plan_name": row["plan_name"],
                    "quantity": int(row["quantity"]),
                    "unit_price": float(row["unit_price"]),
                    "effective_date": row["effective_date"],
                    "notes": row.get("notes"),
                    "created_at": now,
                    "updated_at": now,
                })

        if rows:
            errors = bq_client.insert_rows_json(table_id, rows)
            if errors:
                # SECURITY: Log full error details but return generic message
                logger.error(f"Failed to insert subscription rows for {org_slug}", extra={"bq_errors": errors})
                return {"status": "FAILED", "error": "Failed to insert subscription data"}

        logger.info(f"Seeded {len(rows)} subscription rows for {org_slug}")
        return {"status": "SUCCESS", "rows_seeded": len(rows)}

    except Exception as e:
        # SECURITY: Log full details but return generic error
        logger.error(
            f"Error initializing OpenAI subscriptions for {org_slug}",
            extra={"error_type": type(e).__name__},
            exc_info=True
        )
        return {"status": "FAILED", "error": "Subscription initialization failed"}


# ============================================
# Generic GenAI Provider Initialization (from providers.yml)
# ============================================

def _get_genai_provider_config(provider: str) -> Optional[Dict[str, str]]:
    """Get GenAI provider data tables config from registry."""
    provider_upper = provider.upper()
    if not provider_registry.has_data_tables(provider_upper):
        return None

    return {
        "pricing_table": provider_registry.get_pricing_table(provider_upper),
        "subscriptions_table": provider_registry.get_subscriptions_table(provider_upper),
        "seed_path": provider_registry.get_seed_path(provider_upper),
        "pricing_schema": provider_registry.get_pricing_schema(provider_upper),
        "subscriptions_schema": provider_registry.get_subscriptions_schema(provider_upper),
    }


async def _initialize_genai_pricing(org_slug: str, provider: str, force: bool = False) -> Dict[str, Any]:
    """
    Initialize GenAI provider pricing table with default data.
    Configuration is loaded from providers.yml.

    Args:
        org_slug: Organization slug
        provider: GenAI provider name (openai, anthropic)
        force: If True, delete existing data and re-seed

    Returns:
        Dict with status and rows_seeded count
    """
    config = _get_genai_provider_config(provider)
    if not config:
        return {"status": "FAILED", "error": f"Unknown GenAI provider or no data tables configured: {provider}"}

    try:
        bq_client = get_bigquery_client()
        # Use settings.get_org_dataset_name() for consistency with onboarding
        dataset_id = settings.get_org_dataset_name(org_slug)
        table_id = f"{settings.gcp_project_id}.{dataset_id}.{config['pricing_table']}"

        # Load schema
        schema_path = Path(__file__).parent.parent.parent.parent / config["seed_path"] / "schemas" / config["pricing_schema"]
        if not schema_path.exists():
            logger.warning(f"Pricing schema not found: {schema_path}")
            return {"status": "FAILED", "error": f"Schema file not found: {schema_path}"}

        with open(schema_path, 'r') as f:
            schema_data = json.load(f)

        # SECURITY: Validate schema_data is dict and has "schema" key (Bug fix #1)
        if isinstance(schema_data, dict) and "schema" in schema_data:
            schema_json = schema_data["schema"]
        else:
            schema_json = schema_data

        schema = [bigquery.SchemaField.from_api_repr(field) for field in schema_json]

        # Create table if not exists
        table = bigquery.Table(table_id, schema=schema)
        try:
            bq_client.client.get_table(table_id)
            logger.info(f"Table already exists: {table_id}")
        except Exception as e:
            # Table check failed, creating new table
            table = bq_client.client.create_table(table)
            logger.info(f"Created table: {table_id}")

        # Check if table has data (and force is False)
        if not force:
            count_query = f"SELECT COUNT(*) as cnt FROM `{table_id}`"
            result = bq_client.client.query(count_query).result(timeout=15)
            count = list(result)[0].cnt
            if count > 0:
                logger.info(f"{provider.upper()} pricing table already has {count} rows, skipping seed")
                return {"status": "SUCCESS", "message": "Pricing table already has data", "rows_seeded": 0}

        # If force=True, delete existing data
        if force:
            delete_query = f"DELETE FROM `{table_id}` WHERE 1=1"
            job_config = bigquery.QueryJobConfig(job_timeout_ms=300000)  # 5 minute timeout for admin/batch operations
            bq_client.client.query(delete_query, job_config=job_config).result()
            logger.info(f"Deleted existing pricing data from {table_id}")

        # Load CSV data
        csv_path = Path(__file__).parent.parent.parent.parent / config["seed_path"] / "data" / "default_pricing.csv"

        if not csv_path.exists():
            logger.warning(f"Default pricing CSV not found: {csv_path}")
            return {"status": "SUCCESS", "message": "No default pricing CSV found", "rows_seeded": 0}

        rows = []
        now = datetime.now(timezone.utc).isoformat()

        # Parse helpers for optional fields
        def parse_int(val: Any) -> Optional[int]:
            if val is None or val == "":
                return None
            return int(val)

        def parse_float(val: Any) -> Optional[float]:
            if val is None or val == "":
                return None
            return float(val)

        with open(csv_path, 'r') as f:
            reader = csv.DictReader(f)
            for row in reader:
                # Filter by provider - only insert rows matching this provider
                csv_provider = row.get("provider", "").lower()
                if csv_provider != provider.lower():
                    continue

                # Bug fix #3: Add bounds validation on prices
                input_price = float(row["input_price_per_1k"])
                output_price = float(row["output_price_per_1k"])
                if input_price < 0 or input_price > 1000000:
                    logger.warning(f"Invalid input_price {input_price} for model {row.get('model_id', 'unknown')}, skipping")
                    continue
                if output_price < 0 or output_price > 1000000:
                    logger.warning(f"Invalid output_price {output_price} for model {row.get('model_id', 'unknown')}, skipping")
                    continue

                is_custom = row.get("is_custom", "false").lower() == "true"
                is_enabled = row.get("is_enabled", "true").lower() == "true"

                rows.append({
                    "pricing_id": row.get("pricing_id", f"price_{csv_provider}_{row['model_id']}"),
                    "provider": csv_provider,
                    "model_id": row["model_id"],
                    "model_name": row.get("model_name"),
                    "is_custom": is_custom,
                    "input_price_per_1k": input_price,
                    "output_price_per_1k": output_price,
                    "effective_date": row["effective_date"],
                    "end_date": row.get("end_date") or None,
                    "is_enabled": is_enabled,
                    "notes": row.get("notes") or None,
                    "x_gemini_context_window": row.get("x_gemini_context_window") or None,
                    "x_gemini_region": row.get("x_gemini_region") or None,
                    "x_anthropic_tier": row.get("x_anthropic_tier") or None,
                    "x_openai_batch_input_price": parse_float(row.get("x_openai_batch_input_price")),
                    "x_openai_batch_output_price": parse_float(row.get("x_openai_batch_output_price")),
                    "pricing_type": row.get("pricing_type", "standard"),
                    "free_tier_input_tokens": parse_int(row.get("free_tier_input_tokens")),
                    "free_tier_output_tokens": parse_int(row.get("free_tier_output_tokens")),
                    "free_tier_reset_frequency": row.get("free_tier_reset_frequency") or None,
                    "discount_percentage": parse_float(row.get("discount_percentage")),
                    "discount_reason": row.get("discount_reason") or None,
                    "volume_threshold_tokens": parse_int(row.get("volume_threshold_tokens")),
                    "base_input_price_per_1k": parse_float(row.get("base_input_price_per_1k")),
                    "base_output_price_per_1k": parse_float(row.get("base_output_price_per_1k")),
                    "created_at": now,
                    "updated_at": now,
                })

        if rows:
            # Use standard INSERT instead of streaming insert to avoid streaming buffer issues
            # Streaming inserts can't be modified/deleted for ~90 minutes
            for row in rows:
                insert_query = f"""
                INSERT INTO `{table_id}` (
                    pricing_id, provider, model_id, model_name, is_custom,
                    input_price_per_1k, output_price_per_1k, effective_date, end_date, is_enabled,
                    notes, x_gemini_context_window, x_gemini_region, x_anthropic_tier,
                    x_openai_batch_input_price, x_openai_batch_output_price, pricing_type,
                    free_tier_input_tokens, free_tier_output_tokens, free_tier_reset_frequency,
                    discount_percentage, discount_reason, volume_threshold_tokens,
                    base_input_price_per_1k, base_output_price_per_1k, created_at, updated_at
                ) VALUES (
                    @pricing_id, @provider, @model_id, @model_name, @is_custom,
                    @input_price, @output_price, @effective_date, @end_date, @is_enabled,
                    @notes, @x_gemini_context_window, @x_gemini_region, @x_anthropic_tier,
                    @x_openai_batch_input_price, @x_openai_batch_output_price, @pricing_type,
                    @free_tier_input_tokens, @free_tier_output_tokens, @free_tier_reset_frequency,
                    @discount_percentage, @discount_reason, @volume_threshold_tokens,
                    @base_input_price_per_1k, @base_output_price_per_1k, @created_at, @updated_at
                )
                """
                job_config = bigquery.QueryJobConfig(
                    query_parameters=[
                        bigquery.ScalarQueryParameter("pricing_id", "STRING", row["pricing_id"]),
                        bigquery.ScalarQueryParameter("provider", "STRING", row["provider"]),
                        bigquery.ScalarQueryParameter("model_id", "STRING", row["model_id"]),
                        bigquery.ScalarQueryParameter("model_name", "STRING", row.get("model_name")),
                        bigquery.ScalarQueryParameter("is_custom", "BOOL", row["is_custom"]),
                        bigquery.ScalarQueryParameter("input_price", "FLOAT64", row["input_price_per_1k"]),
                        bigquery.ScalarQueryParameter("output_price", "FLOAT64", row["output_price_per_1k"]),
                        bigquery.ScalarQueryParameter("effective_date", "STRING", row["effective_date"]),
                        bigquery.ScalarQueryParameter("end_date", "STRING", row.get("end_date")),
                        bigquery.ScalarQueryParameter("is_enabled", "BOOL", row["is_enabled"]),
                        bigquery.ScalarQueryParameter("notes", "STRING", row.get("notes")),
                        bigquery.ScalarQueryParameter("x_gemini_context_window", "STRING", row.get("x_gemini_context_window")),
                        bigquery.ScalarQueryParameter("x_gemini_region", "STRING", row.get("x_gemini_region")),
                        bigquery.ScalarQueryParameter("x_anthropic_tier", "STRING", row.get("x_anthropic_tier")),
                        bigquery.ScalarQueryParameter("x_openai_batch_input_price", "FLOAT64", row.get("x_openai_batch_input_price")),
                        bigquery.ScalarQueryParameter("x_openai_batch_output_price", "FLOAT64", row.get("x_openai_batch_output_price")),
                        bigquery.ScalarQueryParameter("pricing_type", "STRING", row["pricing_type"]),
                        bigquery.ScalarQueryParameter("free_tier_input_tokens", "INT64", row.get("free_tier_input_tokens")),
                        bigquery.ScalarQueryParameter("free_tier_output_tokens", "INT64", row.get("free_tier_output_tokens")),
                        bigquery.ScalarQueryParameter("free_tier_reset_frequency", "STRING", row.get("free_tier_reset_frequency")),
                        bigquery.ScalarQueryParameter("discount_percentage", "FLOAT64", row.get("discount_percentage")),
                        bigquery.ScalarQueryParameter("discount_reason", "STRING", row.get("discount_reason")),
                        bigquery.ScalarQueryParameter("volume_threshold_tokens", "INT64", row.get("volume_threshold_tokens")),
                        bigquery.ScalarQueryParameter("base_input_price_per_1k", "FLOAT64", row.get("base_input_price_per_1k")),
                        bigquery.ScalarQueryParameter("base_output_price_per_1k", "FLOAT64", row.get("base_output_price_per_1k")),
                        bigquery.ScalarQueryParameter("created_at", "STRING", row["created_at"]),
                        bigquery.ScalarQueryParameter("updated_at", "STRING", row["updated_at"]),
                    ],
                    job_timeout_ms=300000  # 5 minute timeout for admin/batch operations
                )
                bq_client.client.query(insert_query, job_config=job_config).result()

        logger.info(f"Seeded {len(rows)} {provider.upper()} pricing rows for {org_slug}")
        return {"status": "SUCCESS", "rows_seeded": len(rows)}

    except Exception as e:
        # SECURITY: Log full details but return generic error
        logger.error(
            f"Error initializing {provider.upper()} pricing for {org_slug}",
            extra={"error_type": type(e).__name__},
            exc_info=True
        )
        return {"status": "FAILED", "error": "Pricing initialization failed"}


async def _initialize_subscriptions(org_slug: str, provider: str, force: bool = False) -> Dict[str, Any]:
    """
    Initialize SaaS provider subscriptions table with default data.
    Configuration is loaded from providers.yml.

    Args:
        org_slug: Organization slug
        provider: SaaS provider name (openai, anthropic)
        force: If True, delete existing data and re-seed

    Returns:
        Dict with status and rows_seeded count
    """
    config = _get_genai_provider_config(provider)
    if not config:
        return {"status": "FAILED", "error": f"Unknown GenAI provider or no data tables configured: {provider}"}

    try:
        bq_client = get_bigquery_client()
        # Use settings.get_org_dataset_name() for consistency with onboarding
        dataset_id = settings.get_org_dataset_name(org_slug)
        table_id = f"{settings.gcp_project_id}.{dataset_id}.{config['subscriptions_table']}"

        # Load schema
        schema_path = Path(__file__).parent.parent.parent.parent / config["seed_path"] / "schemas" / config["subscriptions_schema"]
        if not schema_path.exists():
            logger.warning(f"Subscriptions schema not found: {schema_path}")
            return {"status": "FAILED", "error": f"Schema file not found: {schema_path}"}

        with open(schema_path, 'r') as f:
            schema_data = json.load(f)
            # Support both "schema" and "fields" keys for flexibility
            schema_json = schema_data.get("schema") or schema_data.get("fields") or schema_data

        schema = [bigquery.SchemaField.from_api_repr(field) for field in schema_json]

        # Create table if not exists
        table = bigquery.Table(table_id, schema=schema)
        try:
            bq_client.client.get_table(table_id)
            logger.info(f"Table already exists: {table_id}")
        except Exception as e:
            # Table check failed, creating new table
            table = bq_client.client.create_table(table)
            logger.info(f"Created table: {table_id}")

        # Check if table has data (and force is False)
        if not force:
            count_query = f"SELECT COUNT(*) as cnt FROM `{table_id}`"
            result = bq_client.client.query(count_query).result(timeout=15)
            count = list(result)[0].cnt
            if count > 0:
                logger.info(f"{provider.upper()} subscriptions table already has {count} rows, skipping seed")
                return {"status": "SUCCESS", "message": "Subscriptions table already has data", "rows_seeded": 0}

        # If force=True, delete existing data
        if force:
            delete_query = f"DELETE FROM `{table_id}` WHERE 1=1"
            job_config = bigquery.QueryJobConfig(job_timeout_ms=300000)  # 5 minute timeout for admin/batch operations
            bq_client.client.query(delete_query, job_config=job_config).result()
            logger.info(f"Deleted existing subscriptions data from {table_id}")

        # Load CSV data
        csv_path = Path(__file__).parent.parent.parent.parent / config["seed_path"] / "data" / "default_subscriptions.csv"

        if not csv_path.exists():
            logger.warning(f"Default subscriptions CSV not found: {csv_path}")
            return {"status": "SUCCESS", "message": "No default subscriptions CSV found", "rows_seeded": 0}

        rows = []
        now = datetime.now(timezone.utc).isoformat()

        with open(csv_path, 'r') as f:
            reader = csv.DictReader(f)
            for row in reader:
                # Filter by provider - only insert rows matching this provider
                csv_provider = row.get("provider", "").lower()
                if csv_provider != provider.lower():
                    continue

                # Validate int/float parsing with error handling
                try:
                    quantity = int(row["quantity"])
                    unit_price = float(row["unit_price"])
                    is_custom = row.get("is_custom", "false").lower() == "true"
                    is_enabled = row.get("is_enabled", "true").lower() == "true"
                except (ValueError, KeyError) as e:
                    logger.warning(f"Invalid subscription data in CSV row {row.get('subscription_id', 'unknown')}: {e}")
                    continue

                # Parse optional numeric fields
                def parse_int(val: Any) -> Optional[int]:
                    if val is None or val == "":
                        return None
                    return int(val)

                def parse_float(val: Any) -> Optional[float]:
                    if val is None or val == "":
                        return None
                    return float(val)

                # Parse date fields - convert empty strings to None
                def parse_date(val: Any) -> Optional[str]:
                    if val is None or val == "" or val == "0":
                        return None
                    return val  # Keep as string for BigQuery DATE type

                rows.append({
                    "subscription_id": row["subscription_id"],
                    "provider": csv_provider,
                    "plan_name": row["plan_name"],
                    "is_custom": is_custom,
                    "quantity": quantity,
                    "unit_price": unit_price,
                    "effective_date": parse_date(row["effective_date"]),
                    "end_date": parse_date(row.get("end_date")),
                    "is_enabled": is_enabled,
                    "auth_type": row.get("auth_type") or None,
                    "notes": row.get("notes") or None,
                    "tier_type": row.get("tier_type", "paid"),
                    "trial_end_date": parse_date(row.get("trial_end_date")),
                    "trial_credit_usd": parse_float(row.get("trial_credit_usd")),
                    "monthly_token_limit": parse_int(row.get("monthly_token_limit")),
                    "daily_token_limit": parse_int(row.get("daily_token_limit")),
                    "rpm_limit": parse_int(row.get("rpm_limit")),
                    "tpm_limit": parse_int(row.get("tpm_limit")),
                    "rpd_limit": parse_int(row.get("rpd_limit")),
                    "tpd_limit": parse_int(row.get("tpd_limit")),
                    "concurrent_limit": parse_int(row.get("concurrent_limit")),
                    "committed_spend_usd": parse_float(row.get("committed_spend_usd")),
                    "commitment_term_months": parse_int(row.get("commitment_term_months")),
                    "discount_percentage": parse_float(row.get("discount_percentage")),
                    "billing_period": row.get("billing_period", "pay_as_you_go"),
                    "yearly_price": parse_float(row.get("yearly_price")),
                    "yearly_discount_percentage": parse_float(row.get("yearly_discount_percentage")),
                    "created_at": now,
                    "updated_at": now,
                })

        if rows:
            # Use standard INSERT instead of streaming insert to avoid streaming buffer issues
            # Streaming inserts can't be modified/deleted for ~90 minutes
            for row in rows:
                insert_query = f"""
                INSERT INTO `{table_id}` (
                    subscription_id, provider, plan_name, is_custom, quantity, unit_price,
                    effective_date, end_date, is_enabled, auth_type, notes, tier_type,
                    trial_end_date, trial_credit_usd, monthly_token_limit, daily_token_limit,
                    rpm_limit, tpm_limit, rpd_limit, tpd_limit, concurrent_limit,
                    committed_spend_usd, commitment_term_months, discount_percentage,
                    billing_period, yearly_price, yearly_discount_percentage,
                    created_at, updated_at
                ) VALUES (
                    @subscription_id, @provider, @plan_name, @is_custom, @quantity, @unit_price,
                    @effective_date, @end_date, @is_enabled, @auth_type, @notes, @tier_type,
                    @trial_end_date, @trial_credit_usd, @monthly_token_limit, @daily_token_limit,
                    @rpm_limit, @tpm_limit, @rpd_limit, @tpd_limit, @concurrent_limit,
                    @committed_spend_usd, @commitment_term_months, @discount_percentage,
                    @billing_period, @yearly_price, @yearly_discount_percentage,
                    @created_at, @updated_at
                )
                """
                job_config = bigquery.QueryJobConfig(
                    query_parameters=[
                        bigquery.ScalarQueryParameter("subscription_id", "STRING", row["subscription_id"]),
                        bigquery.ScalarQueryParameter("provider", "STRING", row["provider"]),
                        bigquery.ScalarQueryParameter("plan_name", "STRING", row["plan_name"]),
                        bigquery.ScalarQueryParameter("is_custom", "BOOL", row["is_custom"]),
                        bigquery.ScalarQueryParameter("quantity", "INT64", row["quantity"]),
                        bigquery.ScalarQueryParameter("unit_price", "FLOAT64", row["unit_price"]),
                        bigquery.ScalarQueryParameter("effective_date", "DATE", row["effective_date"]),
                        bigquery.ScalarQueryParameter("end_date", "DATE", row.get("end_date")),
                        bigquery.ScalarQueryParameter("is_enabled", "BOOL", row["is_enabled"]),
                        bigquery.ScalarQueryParameter("auth_type", "STRING", row.get("auth_type")),
                        bigquery.ScalarQueryParameter("notes", "STRING", row.get("notes")),
                        bigquery.ScalarQueryParameter("tier_type", "STRING", row["tier_type"]),
                        bigquery.ScalarQueryParameter("trial_end_date", "DATE", row.get("trial_end_date")),
                        bigquery.ScalarQueryParameter("trial_credit_usd", "FLOAT64", row.get("trial_credit_usd")),
                        bigquery.ScalarQueryParameter("monthly_token_limit", "INT64", row.get("monthly_token_limit")),
                        bigquery.ScalarQueryParameter("daily_token_limit", "INT64", row.get("daily_token_limit")),
                        bigquery.ScalarQueryParameter("rpm_limit", "INT64", row.get("rpm_limit")),
                        bigquery.ScalarQueryParameter("tpm_limit", "INT64", row.get("tpm_limit")),
                        bigquery.ScalarQueryParameter("rpd_limit", "INT64", row.get("rpd_limit")),
                        bigquery.ScalarQueryParameter("tpd_limit", "INT64", row.get("tpd_limit")),
                        bigquery.ScalarQueryParameter("concurrent_limit", "INT64", row.get("concurrent_limit")),
                        bigquery.ScalarQueryParameter("committed_spend_usd", "FLOAT64", row.get("committed_spend_usd")),
                        bigquery.ScalarQueryParameter("commitment_term_months", "INT64", row.get("commitment_term_months")),
                        bigquery.ScalarQueryParameter("discount_percentage", "FLOAT64", row.get("discount_percentage")),
                        bigquery.ScalarQueryParameter("billing_period", "STRING", row["billing_period"]),
                        bigquery.ScalarQueryParameter("yearly_price", "FLOAT64", row.get("yearly_price")),
                        bigquery.ScalarQueryParameter("yearly_discount_percentage", "FLOAT64", row.get("yearly_discount_percentage")),
                        bigquery.ScalarQueryParameter("created_at", "TIMESTAMP", row["created_at"]),
                        bigquery.ScalarQueryParameter("updated_at", "TIMESTAMP", row["updated_at"]),
                    ],
                    job_timeout_ms=300000  # 5 minute timeout for admin/batch operations
                )
                bq_client.client.query(insert_query, job_config=job_config).result()

        logger.info(f"Seeded {len(rows)} {provider.upper()} subscription rows for {org_slug}")
        return {"status": "SUCCESS", "rows_seeded": len(rows)}

    except Exception as e:
        # SECURITY: Log full details but return generic error
        logger.error(
            f"Error initializing {provider.upper()} subscriptions for {org_slug}",
            extra={"error_type": type(e).__name__},
            exc_info=True
        )
        return {"status": "FAILED", "error": "Subscription initialization failed"}


# ============================================
# Gemini Data Initialization (for GCP Integration)
# ============================================

async def _initialize_gemini_pricing(org_slug: str, force: bool = False) -> Dict[str, Any]:
    """
    Initialize Gemini model pricing table with default data.
    Called when GCP integration is setup (Gemini usage comes from GCP billing).

    Args:
        org_slug: Organization slug
        force: If True, delete existing data and re-seed

    Returns:
        Dict with status and rows_seeded count
    """
    gemini_config = provider_registry.get_gemini_data_tables("GCP_SA")
    if not gemini_config:
        return {"status": "SKIPPED", "message": "No Gemini data tables configured for GCP_SA"}

    try:
        bq_client = get_bigquery_client()
        dataset_id = settings.get_org_dataset_name(org_slug)
        table_id = f"{settings.gcp_project_id}.{dataset_id}.{gemini_config['pricing_table']}"

        # Load schema
        schema_path = Path(__file__).parent.parent.parent.parent / gemini_config["seed_path"] / "schemas" / gemini_config["pricing_schema"]
        if not schema_path.exists():
            logger.warning(f"Gemini pricing schema not found: {schema_path}")
            return {"status": "FAILED", "error": f"Schema file not found: {schema_path}"}

        with open(schema_path, 'r') as f:
            schema_data = json.load(f)
            # Support both "schema" and "fields" keys for flexibility
            schema_json = schema_data.get("schema") or schema_data.get("fields") or schema_data

        schema = [bigquery.SchemaField.from_api_repr(field) for field in schema_json]

        # Create table if not exists
        table = bigquery.Table(table_id, schema=schema)
        try:
            bq_client.client.get_table(table_id)
            logger.info(f"Table already exists: {table_id}")
        except Exception as e:
            # Table check failed, creating new table
            table = bq_client.client.create_table(table)
            logger.info(f"Created table: {table_id}")

        # Check if table has data (and force is False)
        if not force:
            count_query = f"SELECT COUNT(*) as cnt FROM `{table_id}`"
            result = bq_client.client.query(count_query).result(timeout=15)
            count = list(result)[0].cnt
            if count > 0:
                logger.info(f"Gemini pricing table already has {count} rows, skipping seed")
                return {"status": "SUCCESS", "message": "Pricing table already has data", "rows_seeded": 0}

        # If force=True, delete existing data
        if force:
            delete_query = f"DELETE FROM `{table_id}` WHERE 1=1"
            job_config = bigquery.QueryJobConfig(job_timeout_ms=300000)  # 5 minute timeout for admin/batch operations
            bq_client.client.query(delete_query, job_config=job_config).result()
            logger.info(f"Deleted existing pricing data from {table_id}")

        # Load CSV data
        csv_path = Path(__file__).parent.parent.parent.parent / gemini_config["seed_path"] / "data" / "default_pricing.csv"

        if not csv_path.exists():
            logger.warning(f"Default Gemini pricing CSV not found: {csv_path}")
            return {"status": "SUCCESS", "message": "No default pricing CSV found", "rows_seeded": 0}

        rows = []
        now = datetime.now(timezone.utc).isoformat()

        with open(csv_path, 'r') as f:
            reader = csv.DictReader(f)
            for row in reader:
                rows.append({
                    "model_id": row["model_id"],
                    "model_name": row["model_name"],
                    "input_price_per_1k": float(row["input_price_per_1k"]),
                    "output_price_per_1k": float(row["output_price_per_1k"]),
                    "context_window": row.get("context_window"),
                    "effective_date": row["effective_date"],
                    "notes": row.get("notes"),
                    "created_at": now,
                    "updated_at": now,
                })

        if rows:
            errors = bq_client.client.insert_rows_json(table_id, rows)
            if errors:
                # SECURITY: Log full error details but return generic message
                logger.error(f"Failed to insert Gemini pricing rows for {org_slug}", extra={"bq_errors": errors})
                return {"status": "FAILED", "error": "Failed to insert Gemini pricing data"}

        logger.info(f"Seeded {len(rows)} Gemini pricing rows for {org_slug}")
        return {"status": "SUCCESS", "rows_seeded": len(rows)}

    except Exception as e:
        # SECURITY: Log full details but return generic error
        logger.error(
            f"Error initializing Gemini pricing for {org_slug}",
            extra={"error_type": type(e).__name__},
            exc_info=True
        )
        return {"status": "FAILED", "error": "Gemini pricing initialization failed"}


async def _initialize_gemini_subscriptions(org_slug: str, force: bool = False) -> Dict[str, Any]:
    """
    Initialize Gemini subscriptions table with default data.
    Called when GCP integration is setup.

    Args:
        org_slug: Organization slug
        force: If True, delete existing data and re-seed

    Returns:
        Dict with status and rows_seeded count
    """
    gemini_config = provider_registry.get_gemini_data_tables("GCP_SA")
    if not gemini_config:
        return {"status": "SKIPPED", "message": "No Gemini data tables configured for GCP_SA"}

    try:
        bq_client = get_bigquery_client()
        dataset_id = settings.get_org_dataset_name(org_slug)
        table_id = f"{settings.gcp_project_id}.{dataset_id}.{gemini_config['subscriptions_table']}"

        # Load schema
        schema_path = Path(__file__).parent.parent.parent.parent / gemini_config["seed_path"] / "schemas" / gemini_config["subscriptions_schema"]
        if not schema_path.exists():
            logger.warning(f"Gemini subscriptions schema not found: {schema_path}")
            return {"status": "FAILED", "error": f"Schema file not found: {schema_path}"}

        with open(schema_path, 'r') as f:
            schema_data = json.load(f)
            # Support both "schema" and "fields" keys for flexibility
            schema_json = schema_data.get("schema") or schema_data.get("fields") or schema_data

        schema = [bigquery.SchemaField.from_api_repr(field) for field in schema_json]

        # Create table if not exists
        table = bigquery.Table(table_id, schema=schema)
        try:
            bq_client.client.get_table(table_id)
            logger.info(f"Table already exists: {table_id}")
        except Exception as e:
            # Table check failed, creating new table
            table = bq_client.client.create_table(table)
            logger.info(f"Created table: {table_id}")

        # Check if table has data (and force is False)
        if not force:
            count_query = f"SELECT COUNT(*) as cnt FROM `{table_id}`"
            result = bq_client.client.query(count_query).result(timeout=15)
            count = list(result)[0].cnt
            if count > 0:
                logger.info(f"Gemini subscriptions table already has {count} rows, skipping seed")
                return {"status": "SUCCESS", "message": "Subscriptions table already has data", "rows_seeded": 0}

        # If force=True, delete existing data
        if force:
            delete_query = f"DELETE FROM `{table_id}` WHERE 1=1"
            job_config = bigquery.QueryJobConfig(job_timeout_ms=300000)  # 5 minute timeout for admin/batch operations
            bq_client.client.query(delete_query, job_config=job_config).result()
            logger.info(f"Deleted existing subscriptions data from {table_id}")

        # Load CSV data
        csv_path = Path(__file__).parent.parent.parent.parent / gemini_config["seed_path"] / "data" / "default_subscriptions.csv"

        if not csv_path.exists():
            logger.warning(f"Default Gemini subscriptions CSV not found: {csv_path}")
            return {"status": "SUCCESS", "message": "No default subscriptions CSV found", "rows_seeded": 0}

        rows = []
        now = datetime.now(timezone.utc).isoformat()

        with open(csv_path, 'r') as f:
            reader = csv.DictReader(f)
            for row in reader:
                # Bug fix #6: Wrap int/float conversions in try-except
                try:
                    quantity = int(row["quantity"])
                    unit_price = float(row["unit_price"])
                except (ValueError, KeyError) as e:
                    logger.warning(f"Invalid Gemini subscription data in CSV row {row.get('subscription_id', 'unknown')}: {e}")
                    continue

                rows.append({
                    "subscription_id": row["subscription_id"],
                    "plan_name": row["plan_name"],
                    "quantity": quantity,
                    "unit_price": unit_price,
                    "effective_date": row["effective_date"],
                    "notes": row.get("notes"),
                    "created_at": now,
                    "updated_at": now,
                })

        if rows:
            errors = bq_client.client.insert_rows_json(table_id, rows)
            if errors:
                # SECURITY: Log full error details but return generic message
                logger.error(f"Failed to insert Gemini subscription rows for {org_slug}", extra={"bq_errors": errors})
                return {"status": "FAILED", "error": "Failed to insert Gemini subscription data"}

        logger.info(f"Seeded {len(rows)} Gemini subscription rows for {org_slug}")
        return {"status": "SUCCESS", "rows_seeded": len(rows)}

    except Exception as e:
        # SECURITY: Log full details but return generic error
        logger.error(
            f"Error initializing Gemini subscriptions for {org_slug}",
            extra={"error_type": type(e).__name__},
            exc_info=True
        )
        return {"status": "FAILED", "error": "Gemini subscription initialization failed"}
