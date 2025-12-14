"""
Integration Management API Routes

Endpoints for managing external integrations.
Provider configuration is loaded from configs/system/providers.yml.
To add a new provider: just update providers.yml - no code changes needed.

All credentials are encrypted via GCP KMS.

URL Structure: /api/v1/integrations/{org_slug}/{provider}/setup|validate
"""

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field, ConfigDict
from typing import List, Optional, Dict, Any, Literal
from datetime import datetime
from pathlib import Path
import logging
import json
import re
import csv

from src.core.engine.bq_client import get_bigquery_client, BigQueryClient
from src.app.dependencies.auth import get_current_org
from src.app.config import settings
from src.core.providers import provider_registry
from google.cloud import bigquery

router = APIRouter()
logger = logging.getLogger(__name__)


# ============================================
# Input Validation (Multi-Tenancy Security)
# ============================================

def validate_org_slug(org_slug: str) -> None:
    """
    Validate org_slug format to prevent path traversal and injection.
    Must match backend requirements: 3-50 alphanumeric characters with underscores.
    """
    if not org_slug or not re.match(r'^[a-zA-Z0-9_]{3,50}$', org_slug):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid org_slug format. Must be 3-50 alphanumeric characters with underscores."
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


class IntegrationStatusResponse(BaseModel):
    """Response for integration status."""
    provider: str
    status: Literal["VALID", "INVALID", "PENDING", "NOT_CONFIGURED"]
    credential_name: Optional[str] = None
    last_validated_at: Optional[datetime] = None
    last_error: Optional[str] = None
    created_at: Optional[datetime] = None


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
    return provider_registry.get_all_providers()


def get_default_credential_name(provider: str) -> str:
    """Get default credential name for a provider."""
    return provider_registry.get_display_name(provider.upper()) or f"{provider} Credential"


def normalize_provider(provider: str) -> str:
    """Normalize provider name to internal format using registry."""
    # First try direct lookup
    provider_upper = provider.upper()
    if provider_registry.is_valid_provider(provider_upper):
        return provider_upper

    # Then try aliases
    aliases = provider_registry.get_provider_aliases()
    normalized = aliases.get(provider.lower())
    if normalized:
        return normalized

    # Not found
    raise HTTPException(
        status_code=status.HTTP_400_BAD_REQUEST,
        detail=f"Invalid provider: {provider}. Valid providers: {list(aliases.keys())}"
    )


# ============================================
# Integration Setup Endpoints (Provider-Based)
# ============================================

@router.post(
    "/integrations/{org_slug}/gcp/setup",
    response_model=SetupIntegrationResponse,
    summary="Setup GCP Service Account integration",
    description="Validates and stores GCP Service Account JSON encrypted via KMS"
)
async def setup_gcp_integration(
    org_slug: str,
    request: SetupIntegrationRequest,
    org: Dict = Depends(get_current_org),
    bq_client: BigQueryClient = Depends(get_bigquery_client)
):
    """
    Setup GCP Service Account integration.

    The credential should be the full Service Account JSON.
    """
    # SECURITY: Validate org_slug format first
    validate_org_slug(org_slug)

    # Skip org validation when auth is disabled (dev mode)
    if not settings.disable_auth and org["org_slug"] != org_slug:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Cannot configure integrations for another organization"
        )

    # Validate JSON format with specific error messages
    try:
        sa_data = json.loads(request.credential)
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

    # Extract metadata from SA JSON
    metadata = request.metadata or {}
    metadata["project_id"] = sa_data.get("project_id")
    metadata["client_email"] = sa_data.get("client_email")

    return await _setup_integration(
        org_slug=org_slug,
        provider="GCP_SA",
        credential=request.credential,
        credential_name=request.credential_name or f"GCP SA ({sa_data.get('project_id')})",
        metadata=metadata,
        skip_validation=request.skip_validation,
        user_id=org.get("user_id")
    )


@router.post(
    "/integrations/{org_slug}/openai/setup",
    response_model=SetupIntegrationResponse,
    summary="Setup OpenAI integration",
    description="Validates and stores OpenAI API key encrypted via KMS"
)
async def setup_openai_integration(
    org_slug: str,
    request: SetupIntegrationRequest,
    org: Dict = Depends(get_current_org),
    bq_client: BigQueryClient = Depends(get_bigquery_client)
):
    """Setup OpenAI integration for an organization."""
    # SECURITY: Validate org_slug format first
    validate_org_slug(org_slug)

    # Skip org validation when auth is disabled (dev mode)
    if not settings.disable_auth and org["org_slug"] != org_slug:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Cannot configure integrations for another organization"
        )

    return await _setup_integration(
        org_slug=org_slug,
        provider="OPENAI",
        credential=request.credential,
        credential_name=request.credential_name or "OpenAI API Key",
        metadata=request.metadata,
        skip_validation=request.skip_validation,
        user_id=org.get("user_id")
    )


@router.post(
    "/integrations/{org_slug}/anthropic/setup",
    response_model=SetupIntegrationResponse,
    summary="Setup Anthropic (Claude) integration",
    description="Validates and stores Anthropic API key encrypted via KMS"
)
async def setup_anthropic_integration(
    org_slug: str,
    request: SetupIntegrationRequest,
    org: Dict = Depends(get_current_org),
    bq_client: BigQueryClient = Depends(get_bigquery_client)
):
    """Setup Anthropic/Claude integration."""
    # SECURITY: Validate org_slug format first
    validate_org_slug(org_slug)

    # Skip org validation when auth is disabled (dev mode)
    if not settings.disable_auth and org["org_slug"] != org_slug:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Cannot configure integrations for another organization"
        )

    return await _setup_integration(
        org_slug=org_slug,
        provider="ANTHROPIC",
        credential=request.credential,
        credential_name=request.credential_name or "Anthropic API Key",
        metadata=request.metadata,
        skip_validation=request.skip_validation,
        user_id=org.get("user_id")
    )


@router.post(
    "/integrations/{org_slug}/gemini/setup",
    response_model=SetupIntegrationResponse,
    summary="Setup Google Gemini integration",
    description="Validates and stores Gemini API key encrypted via KMS"
)
async def setup_gemini_integration(
    org_slug: str,
    request: SetupIntegrationRequest,
    org: Dict = Depends(get_current_org),
    bq_client: BigQueryClient = Depends(get_bigquery_client)
):
    """Setup Google Gemini integration for an organization."""
    # SECURITY: Validate org_slug format first
    validate_org_slug(org_slug)

    # Skip org validation when auth is disabled (dev mode)
    if not settings.disable_auth and org["org_slug"] != org_slug:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Cannot configure integrations for another organization"
        )

    return await _setup_integration(
        org_slug=org_slug,
        provider="GEMINI",
        credential=request.credential,
        credential_name=request.credential_name or "Gemini API Key",
        metadata=request.metadata,
        skip_validation=request.skip_validation,
        user_id=org.get("user_id")
    )


# ============================================
# Integration Validation Endpoints (Provider-Based)
# ============================================

@router.post(
    "/integrations/{org_slug}/gcp/validate",
    response_model=SetupIntegrationResponse,
    summary="Validate GCP integration"
)
async def validate_gcp_integration(
    org_slug: str,
    org: Dict = Depends(get_current_org),
    bq_client: BigQueryClient = Depends(get_bigquery_client)
):
    """Re-validate GCP Service Account credentials using authenticator."""
    return await _validate_integration(org_slug, "GCP_SA", org)


@router.post(
    "/integrations/{org_slug}/openai/validate",
    response_model=SetupIntegrationResponse,
    summary="Validate OpenAI integration"
)
async def validate_openai_integration(
    org_slug: str,
    org: Dict = Depends(get_current_org),
    bq_client: BigQueryClient = Depends(get_bigquery_client)
):
    """Re-validate OpenAI API key using authenticator."""
    return await _validate_integration(org_slug, "OPENAI", org)


@router.post(
    "/integrations/{org_slug}/anthropic/validate",
    response_model=SetupIntegrationResponse,
    summary="Validate Anthropic integration"
)
async def validate_anthropic_integration(
    org_slug: str,
    org: Dict = Depends(get_current_org),
    bq_client: BigQueryClient = Depends(get_bigquery_client)
):
    """Re-validate Anthropic API key using authenticator."""
    return await _validate_integration(org_slug, "ANTHROPIC", org)


@router.post(
    "/integrations/{org_slug}/gemini/validate",
    response_model=SetupIntegrationResponse,
    summary="Validate Gemini integration"
)
async def validate_gemini_integration(
    org_slug: str,
    org: Dict = Depends(get_current_org),
    bq_client: BigQueryClient = Depends(get_bigquery_client)
):
    """Re-validate Gemini API key using authenticator."""
    return await _validate_integration(org_slug, "GEMINI", org)


# ============================================
# Integration Status Endpoints
# ============================================

@router.get(
    "/integrations/{org_slug}",
    response_model=AllIntegrationsResponse,
    summary="Get all integration statuses",
    description="Returns status of all configured integrations for the organization"
)
async def get_all_integrations(
    org_slug: str,
    org: Dict = Depends(get_current_org),
    bq_client: BigQueryClient = Depends(get_bigquery_client)
):
    """Get status of all integrations for an organization."""
    # SECURITY: Validate org_slug format first
    validate_org_slug(org_slug)

    # Skip org validation when auth is disabled (dev mode)
    if not settings.disable_auth and org["org_slug"] != org_slug:
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
                    status=data.get("status", "INVALID"),
                    credential_name=data.get("name"),
                    last_validated_at=datetime.fromisoformat(data["last_validated"]) if data.get("last_validated") else None,
                    last_error=data.get("last_error"),
                    created_at=datetime.fromisoformat(data["created_at"]) if data.get("created_at") else None,
                )
            else:
                integrations[provider] = IntegrationStatusResponse(
                    provider=provider,
                    status="NOT_CONFIGURED",
                    credential_name=None,
                    last_validated_at=None,
                    last_error=None,
                    created_at=None,
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
        logger.error(f"Error getting integrations for {org_slug}: {e}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Operation failed. Please check server logs for details."
        )


@router.get(
    "/integrations/{org_slug}/{provider}",
    response_model=IntegrationStatusResponse,
    summary="Get single integration status"
)
async def get_integration_status(
    org_slug: str,
    provider: str,
    org: Dict = Depends(get_current_org),
    bq_client: BigQueryClient = Depends(get_bigquery_client)
):
    """Get status of a specific integration."""
    # SECURITY: Validate org_slug format first
    validate_org_slug(org_slug)

    # Skip org validation when auth is disabled (dev mode)
    if not settings.disable_auth and org["org_slug"] != org_slug:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Cannot view integrations for another organization"
        )

    provider_upper = normalize_provider(provider)
    all_integrations = await get_all_integrations(org_slug, org, bq_client)
    integration = all_integrations.integrations.get(provider_upper)

    if not integration:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Unknown provider: {provider}"
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
    description="Update an existing integration's credential or metadata"
)
async def update_integration(
    org_slug: str,
    provider: str,
    request: UpdateIntegrationRequest,
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

    # Skip org validation when auth is disabled (dev mode)
    if not settings.disable_auth and org["org_slug"] != org_slug:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Cannot update integrations for another organization"
        )

    provider_upper = normalize_provider(provider)

    # Check if integration exists
    try:
        check_query = f"""
        SELECT credential_id, credential_name
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
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"No active {provider_upper} integration found for {org_slug}"
            )

        existing_credential_id = check_result[0]["credential_id"]
        existing_name = check_result[0]["credential_name"]

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error checking integration: {e}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to check existing integration"
        )

    # If new credential is provided, re-setup entirely
    if request.credential:
        return await _setup_integration(
            org_slug=org_slug,
            provider=provider_upper,
            credential=request.credential,
            credential_name=request.credential_name or existing_name,
            metadata=request.metadata,
            skip_validation=request.skip_validation,
            user_id=org.get("user_id")
        )

    # Otherwise, update metadata/name only
    try:
        update_fields = ["updated_at = CURRENT_TIMESTAMP()"]
        query_params = [
            bigquery.ScalarQueryParameter("org_slug", "STRING", org_slug),
            bigquery.ScalarQueryParameter("provider", "STRING", provider_upper),
        ]

        if request.credential_name:
            update_fields.append("credential_name = @credential_name")
            query_params.append(bigquery.ScalarQueryParameter("credential_name", "STRING", request.credential_name))

        if request.metadata:
            import json
            update_fields.append("metadata = @metadata")
            query_params.append(bigquery.ScalarQueryParameter("metadata", "STRING", json.dumps(request.metadata)))

        update_query = f"""
        UPDATE `{settings.gcp_project_id}.organizations.org_integration_credentials`
        SET {', '.join(update_fields)}
        WHERE org_slug = @org_slug AND provider = @provider AND is_active = TRUE
        """

        bq_client.client.query(
            update_query,
            job_config=bigquery.QueryJobConfig(query_parameters=query_params)
        ).result()

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
        logger.error(f"Error updating integration: {e}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to update integration"
        )


@router.delete(
    "/integrations/{org_slug}/{provider}",
    summary="Delete an integration"
)
async def delete_integration(
    org_slug: str,
    provider: str,
    org: Dict = Depends(get_current_org),
    bq_client: BigQueryClient = Depends(get_bigquery_client)
):
    """Delete (deactivate) an integration."""
    # SECURITY: Validate org_slug format first
    validate_org_slug(org_slug)

    # Skip org validation when auth is disabled (dev mode)
    if not settings.disable_auth and org["org_slug"] != org_slug:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Cannot delete integrations for another organization"
        )

    provider_upper = normalize_provider(provider)

    try:
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

        return {
            "success": True,
            "message": f"{provider_upper} integration deleted",
            "provider": provider_upper
        }

    except Exception as e:
        logger.error(f"Error deleting integration: {e}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Operation failed. Please check server logs for details."
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
    user_id: Optional[str]
) -> SetupIntegrationResponse:
    """Common logic for setting up any integration."""
    try:
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

            # Check if provider is LLM and has data tables configured (from providers.yml)
            if provider_registry.is_llm_provider(provider) and provider_registry.has_data_tables(provider) and is_valid:
                try:
                    pricing_result = await _initialize_llm_pricing(org_slug, provider.lower())
                    pricing_initialized = pricing_result.get("status") == "SUCCESS"
                    pricing_rows_seeded = pricing_result.get("rows_seeded", 0)

                    subs_result = await _initialize_saas_subscriptions(org_slug, provider.lower())
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
                    "subscriptions_initialized": subscriptions_initialized
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
            return SetupIntegrationResponse(
                success=False,
                provider=provider,
                credential_id=None,
                validation_status="FAILED",
                validation_error=result.get("error"),
                message=f"Failed to setup {provider} integration: {result.get('error', 'Unknown error')}"
            )

    except Exception as e:
        logger.error(f"Integration setup error: {e}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Operation failed. Please check server logs for details."
        )


async def _validate_integration(
    org_slug: str,
    provider: str,
    org: Dict
) -> SetupIntegrationResponse:
    """Common logic for validating any integration using authenticators."""
    # Skip org validation when auth is disabled (dev mode)
    if not settings.disable_auth and org["org_slug"] != org_slug:
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
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Invalid provider: {provider}"
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
            message=f"No {provider} integration found"
        )
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Validation error for {org_slug}/{provider}: {e}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Operation failed. Please check server logs for details."
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
        except Exception:
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
        now = datetime.utcnow().isoformat()

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
                logger.error(f"Failed to insert pricing rows: {errors}")
                return {"status": "FAILED", "error": str(errors)}

        logger.info(f"Seeded {len(rows)} pricing rows for {org_slug}")
        return {"status": "SUCCESS", "rows_seeded": len(rows)}

    except Exception as e:
        logger.error(f"Error initializing OpenAI pricing: {e}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to initialize OpenAI pricing. Please check server logs for details."
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
        except Exception:
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
        now = datetime.utcnow().isoformat()

        with open(csv_path, 'r') as f:
            reader = csv.DictReader(f)
            for row in reader:
                rows.append({
                    "subscription_id": row["subscription_id"],
                    "plan_name": row["plan_name"],
                    "quantity": int(row["quantity"]),
                    "unit_price_usd": float(row["unit_price_usd"]),
                    "effective_date": row["effective_date"],
                    "notes": row.get("notes"),
                    "created_at": now,
                    "updated_at": now,
                })

        if rows:
            errors = bq_client.insert_rows_json(table_id, rows)
            if errors:
                logger.error(f"Failed to insert subscription rows: {errors}")
                return {"status": "FAILED", "error": str(errors)}

        logger.info(f"Seeded {len(rows)} subscription rows for {org_slug}")
        return {"status": "SUCCESS", "rows_seeded": len(rows)}

    except Exception as e:
        logger.error(f"Error initializing OpenAI subscriptions: {e}", exc_info=True)
        return {"status": "FAILED", "error": str(e)}


# ============================================
# Generic LLM Provider Initialization (from providers.yml)
# ============================================

def _get_llm_provider_config(provider: str) -> Optional[Dict[str, str]]:
    """Get LLM provider data tables config from registry."""
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


async def _initialize_llm_pricing(org_slug: str, provider: str, force: bool = False) -> Dict[str, Any]:
    """
    Initialize LLM provider pricing table with default data.
    Configuration is loaded from providers.yml.

    Args:
        org_slug: Organization slug
        provider: LLM provider name (openai, anthropic)
        force: If True, delete existing data and re-seed

    Returns:
        Dict with status and rows_seeded count
    """
    config = _get_llm_provider_config(provider)
    if not config:
        return {"status": "FAILED", "error": f"Unknown LLM provider or no data tables configured: {provider}"}

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
        except Exception:
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
        now = datetime.utcnow().isoformat()

        # Parse helpers for optional fields
        def parse_int(val):
            if val is None or val == "":
                return None
            return int(val)

        def parse_float(val):
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
        logger.error(f"Error initializing {provider.upper()} pricing: {e}", exc_info=True)
        return {"status": "FAILED", "error": str(e)}


async def _initialize_saas_subscriptions(org_slug: str, provider: str, force: bool = False) -> Dict[str, Any]:
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
    config = _get_llm_provider_config(provider)
    if not config:
        return {"status": "FAILED", "error": f"Unknown LLM provider or no data tables configured: {provider}"}

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
        except Exception:
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
        now = datetime.utcnow().isoformat()

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
                    unit_price = float(row["unit_price_usd"])
                    is_custom = row.get("is_custom", "false").lower() == "true"
                    is_enabled = row.get("is_enabled", "true").lower() == "true"
                except (ValueError, KeyError) as e:
                    logger.warning(f"Invalid subscription data in CSV row {row.get('subscription_id', 'unknown')}: {e}")
                    continue

                # Parse optional numeric fields
                def parse_int(val):
                    if val is None or val == "":
                        return None
                    return int(val)

                def parse_float(val):
                    if val is None or val == "":
                        return None
                    return float(val)

                # Parse date fields - convert empty strings to None
                def parse_date(val):
                    if val is None or val == "" or val == "0":
                        return None
                    return val  # Keep as string for BigQuery DATE type

                rows.append({
                    "subscription_id": row["subscription_id"],
                    "provider": csv_provider,
                    "plan_name": row["plan_name"],
                    "is_custom": is_custom,
                    "quantity": quantity,
                    "unit_price_usd": unit_price,
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
                    "yearly_price_usd": parse_float(row.get("yearly_price_usd")),
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
                    subscription_id, provider, plan_name, is_custom, quantity, unit_price_usd,
                    effective_date, end_date, is_enabled, auth_type, notes, tier_type,
                    trial_end_date, trial_credit_usd, monthly_token_limit, daily_token_limit,
                    rpm_limit, tpm_limit, rpd_limit, tpd_limit, concurrent_limit,
                    committed_spend_usd, commitment_term_months, discount_percentage,
                    billing_period, yearly_price_usd, yearly_discount_percentage,
                    created_at, updated_at
                ) VALUES (
                    @subscription_id, @provider, @plan_name, @is_custom, @quantity, @unit_price_usd,
                    @effective_date, @end_date, @is_enabled, @auth_type, @notes, @tier_type,
                    @trial_end_date, @trial_credit_usd, @monthly_token_limit, @daily_token_limit,
                    @rpm_limit, @tpm_limit, @rpd_limit, @tpd_limit, @concurrent_limit,
                    @committed_spend_usd, @commitment_term_months, @discount_percentage,
                    @billing_period, @yearly_price_usd, @yearly_discount_percentage,
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
                        bigquery.ScalarQueryParameter("unit_price_usd", "FLOAT64", row["unit_price_usd"]),
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
                        bigquery.ScalarQueryParameter("yearly_price_usd", "FLOAT64", row.get("yearly_price_usd")),
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
        logger.error(f"Error initializing {provider.upper()} subscriptions: {e}", exc_info=True)
        return {"status": "FAILED", "error": str(e)}


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
        except Exception:
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
        now = datetime.utcnow().isoformat()

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
                logger.error(f"Failed to insert Gemini pricing rows: {errors}")
                return {"status": "FAILED", "error": str(errors)}

        logger.info(f"Seeded {len(rows)} Gemini pricing rows for {org_slug}")
        return {"status": "SUCCESS", "rows_seeded": len(rows)}

    except Exception as e:
        logger.error(f"Error initializing Gemini pricing: {e}", exc_info=True)
        return {"status": "FAILED", "error": str(e)}


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
        except Exception:
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
        now = datetime.utcnow().isoformat()

        with open(csv_path, 'r') as f:
            reader = csv.DictReader(f)
            for row in reader:
                # Bug fix #6: Wrap int/float conversions in try-except
                try:
                    quantity = int(row["quantity"])
                    unit_price = float(row["unit_price_usd"])
                except (ValueError, KeyError) as e:
                    logger.warning(f"Invalid Gemini subscription data in CSV row {row.get('subscription_id', 'unknown')}: {e}")
                    continue

                rows.append({
                    "subscription_id": row["subscription_id"],
                    "plan_name": row["plan_name"],
                    "quantity": quantity,
                    "unit_price_usd": unit_price,
                    "effective_date": row["effective_date"],
                    "notes": row.get("notes"),
                    "created_at": now,
                    "updated_at": now,
                })

        if rows:
            errors = bq_client.client.insert_rows_json(table_id, rows)
            if errors:
                logger.error(f"Failed to insert Gemini subscription rows: {errors}")
                return {"status": "FAILED", "error": str(errors)}

        logger.info(f"Seeded {len(rows)} Gemini subscription rows for {org_slug}")
        return {"status": "SUCCESS", "rows_seeded": len(rows)}

    except Exception as e:
        logger.error(f"Error initializing Gemini subscriptions: {e}", exc_info=True)
        return {"status": "FAILED", "error": str(e)}
