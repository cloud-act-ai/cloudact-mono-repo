"""
Integration Management API Routes

Endpoints for managing external integrations:
- LLM providers (OpenAI, Anthropic, DeepSeek)
- Cloud providers (GCP Service Account)

All credentials are encrypted via GCP KMS.

URL Structure: /api/v1/integrations/{org_slug}/{provider}/setup|validate
"""

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field
from typing import List, Optional, Dict, Any, Literal
from datetime import datetime
import logging
import json

from src.core.engine.bq_client import get_bigquery_client, BigQueryClient
from src.app.dependencies.auth import get_current_org
from src.app.config import settings
from google.cloud import bigquery

router = APIRouter()
logger = logging.getLogger(__name__)


# ============================================
# Request/Response Models
# ============================================

class SetupIntegrationRequest(BaseModel):
    """Request to setup an integration."""
    credential: str = Field(
        ...,
        description="The credential (API key or Service Account JSON)",
        min_length=10
    )
    credential_name: Optional[str] = Field(
        None,
        description="Human-readable name for this credential"
    )
    metadata: Optional[Dict[str, Any]] = Field(
        None,
        description="Additional metadata (e.g., project_id for GCP)"
    )
    skip_validation: bool = Field(
        False,
        description="Skip credential validation (not recommended)"
    )


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
# Provider Constants
# ============================================

# Provider name normalization map
PROVIDER_MAP = {
    "gcp": "GCP_SA",
    "gcp_sa": "GCP_SA",
    "gcp_service_account": "GCP_SA",
    "openai": "OPENAI",
    "anthropic": "ANTHROPIC",
    "claude": "ANTHROPIC",  # Alias: claude -> ANTHROPIC
    "deepseek": "DEEPSEEK",
}

VALID_PROVIDERS = ["OPENAI", "ANTHROPIC", "DEEPSEEK", "GCP_SA"]

DEFAULT_CREDENTIAL_NAMES = {
    "OPENAI": "OpenAI API Key",
    "ANTHROPIC": "Anthropic API Key",
    "DEEPSEEK": "DeepSeek API Key",
    "GCP_SA": "GCP Service Account",
}


def normalize_provider(provider: str) -> str:
    """Normalize provider name to internal format."""
    normalized = PROVIDER_MAP.get(provider.lower())
    if not normalized:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Invalid provider: {provider}. Valid providers: {list(PROVIDER_MAP.keys())}"
        )
    return normalized


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
    "/integrations/{org_slug}/deepseek/setup",
    response_model=SetupIntegrationResponse,
    summary="Setup DeepSeek integration",
    description="Validates and stores DeepSeek API key encrypted via KMS"
)
async def setup_deepseek_integration(
    org_slug: str,
    request: SetupIntegrationRequest,
    org: Dict = Depends(get_current_org),
    bq_client: BigQueryClient = Depends(get_bigquery_client)
):
    """Setup DeepSeek integration."""
    # Skip org validation when auth is disabled (dev mode)
    if not settings.disable_auth and org["org_slug"] != org_slug:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Cannot configure integrations for another organization"
        )

    return await _setup_integration(
        org_slug=org_slug,
        provider="DEEPSEEK",
        credential=request.credential,
        credential_name=request.credential_name or "DeepSeek API Key",
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
    "/integrations/{org_slug}/deepseek/validate",
    response_model=SetupIntegrationResponse,
    summary="Validate DeepSeek integration"
)
async def validate_deepseek_integration(
    org_slug: str,
    org: Dict = Depends(get_current_org),
    bq_client: BigQueryClient = Depends(get_bigquery_client)
):
    """Re-validate DeepSeek API key using authenticator."""
    return await _validate_integration(org_slug, "DEEPSEEK", org)


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
        for provider in VALID_PROVIDERS:
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
            detail=f"Failed to retrieve integrations: {str(e)}"
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
            detail=f"Failed to delete integration: {str(e)}"
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

            # Generate appropriate message based on validation status
            if is_valid:
                message = f"{provider} integration configured and validated successfully"
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
                    "is_valid": is_valid
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
            detail=f"Integration setup failed: {str(e)}"
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
        elif provider == "DEEPSEEK":
            from src.core.processors.deepseek.authenticator import DeepSeekAuthenticator
            auth = DeepSeekAuthenticator(org_slug)
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
        # No credentials found
        return SetupIntegrationResponse(
            success=False,
            provider=provider,
            credential_id=None,
            validation_status="NOT_CONFIGURED",
            validation_error=str(e),
            message=f"No {provider} integration found"
        )
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Validation error for {org_slug}/{provider}: {e}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Validation failed: {str(e)}"
        )
