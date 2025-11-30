"""
Integration Management API Routes

Endpoints for managing external integrations:
- LLM providers (OpenAI, Anthropic, DeepSeek)
- Cloud providers (GCP Service Account)

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
        description="The credential (API key or Service Account JSON)",
        min_length=10,
        max_length=50000
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

            llm_providers = ["OPENAI", "ANTHROPIC", "DEEPSEEK"]
            if provider in llm_providers and is_valid:
                try:
                    pricing_result = await _initialize_llm_pricing(org_slug, provider.lower())
                    pricing_initialized = pricing_result.get("status") == "SUCCESS"
                    pricing_rows_seeded = pricing_result.get("rows_seeded", 0)

                    subs_result = await _initialize_llm_subscriptions(org_slug, provider.lower())
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

            # Generate appropriate message based on validation status
            if is_valid:
                message = f"{provider} integration configured and validated successfully"
                if provider in llm_providers:
                    message += f" (pricing: {pricing_rows_seeded} rows, subscriptions: {subscriptions_rows_seeded} rows)"
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
            result = bq_client.query(count_query).result()
            count = list(result)[0].cnt
            if count > 0:
                logger.info(f"Pricing table already has {count} rows, skipping seed")
                return {"status": "SUCCESS", "message": "Pricing table already has data", "rows_seeded": 0}

        # If force=True, delete existing data
        if force:
            delete_query = f"DELETE FROM `{table_id}` WHERE 1=1"
            bq_client.query(delete_query).result()
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
                rows.append({
                    "model_id": row["model_id"],
                    "model_name": row.get("model_name"),
                    "input_price_per_1k": float(row["input_price_per_1k"]),
                    "output_price_per_1k": float(row["output_price_per_1k"]),
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
        return {"status": "FAILED", "error": str(e)}


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
            result = bq_client.query(count_query).result()
            count = list(result)[0].cnt
            if count > 0:
                logger.info(f"Subscriptions table already has {count} rows, skipping seed")
                return {"status": "SUCCESS", "message": "Subscriptions table already has data", "rows_seeded": 0}

        # If force=True, delete existing data
        if force:
            delete_query = f"DELETE FROM `{table_id}` WHERE 1=1"
            bq_client.query(delete_query).result()
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
# Generic LLM Provider Initialization
# ============================================

# Provider configuration mapping
LLM_PROVIDER_CONFIG = {
    "openai": {
        "pricing_table": "openai_model_pricing",
        "subscriptions_table": "openai_subscriptions",
        "seed_path": "configs/openai/seed",
        "pricing_schema": "openai_model_pricing.json",
        "subscriptions_schema": "openai_subscriptions.json",
    },
    "anthropic": {
        "pricing_table": "anthropic_model_pricing",
        "subscriptions_table": "anthropic_subscriptions",
        "seed_path": "configs/anthropic/seed",
        "pricing_schema": "anthropic_pricing.json",
        "subscriptions_schema": "anthropic_subscriptions.json",
    },
    "deepseek": {
        "pricing_table": "deepseek_model_pricing",
        "subscriptions_table": "deepseek_subscriptions",
        "seed_path": "configs/deepseek/seed",
        "pricing_schema": "deepseek_pricing.json",
        "subscriptions_schema": "deepseek_subscriptions.json",
    },
}


async def _initialize_llm_pricing(org_slug: str, provider: str, force: bool = False) -> Dict[str, Any]:
    """
    Initialize LLM provider pricing table with default data.

    Args:
        org_slug: Organization slug
        provider: LLM provider name (openai, anthropic, deepseek)
        force: If True, delete existing data and re-seed

    Returns:
        Dict with status and rows_seeded count
    """
    provider_lower = provider.lower()
    if provider_lower not in LLM_PROVIDER_CONFIG:
        return {"status": "FAILED", "error": f"Unknown LLM provider: {provider}"}

    config = LLM_PROVIDER_CONFIG[provider_lower]

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
            schema_json = json.load(f)["schema"]

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
            result = bq_client.client.query(count_query).result()
            count = list(result)[0].cnt
            if count > 0:
                logger.info(f"{provider.upper()} pricing table already has {count} rows, skipping seed")
                return {"status": "SUCCESS", "message": "Pricing table already has data", "rows_seeded": 0}

        # If force=True, delete existing data
        if force:
            delete_query = f"DELETE FROM `{table_id}` WHERE 1=1"
            bq_client.client.query(delete_query).result()
            logger.info(f"Deleted existing pricing data from {table_id}")

        # Load CSV data
        csv_path = Path(__file__).parent.parent.parent.parent / config["seed_path"] / "data" / "default_pricing.csv"

        if not csv_path.exists():
            logger.warning(f"Default pricing CSV not found: {csv_path}")
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
                    "effective_date": row["effective_date"],
                    "notes": row.get("notes"),
                    "created_at": now,
                    "updated_at": now,
                })

        if rows:
            errors = bq_client.client.insert_rows_json(table_id, rows)
            if errors:
                logger.error(f"Failed to insert {provider} pricing rows: {errors}")
                return {"status": "FAILED", "error": str(errors)}

        logger.info(f"Seeded {len(rows)} {provider.upper()} pricing rows for {org_slug}")
        return {"status": "SUCCESS", "rows_seeded": len(rows)}

    except Exception as e:
        logger.error(f"Error initializing {provider.upper()} pricing: {e}", exc_info=True)
        return {"status": "FAILED", "error": str(e)}


async def _initialize_llm_subscriptions(org_slug: str, provider: str, force: bool = False) -> Dict[str, Any]:
    """
    Initialize LLM provider subscriptions table with default data.

    Args:
        org_slug: Organization slug
        provider: LLM provider name (openai, anthropic, deepseek)
        force: If True, delete existing data and re-seed

    Returns:
        Dict with status and rows_seeded count
    """
    provider_lower = provider.lower()
    if provider_lower not in LLM_PROVIDER_CONFIG:
        return {"status": "FAILED", "error": f"Unknown LLM provider: {provider}"}

    config = LLM_PROVIDER_CONFIG[provider_lower]

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
            schema_json = json.load(f)["schema"]

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
            result = bq_client.client.query(count_query).result()
            count = list(result)[0].cnt
            if count > 0:
                logger.info(f"{provider.upper()} subscriptions table already has {count} rows, skipping seed")
                return {"status": "SUCCESS", "message": "Subscriptions table already has data", "rows_seeded": 0}

        # If force=True, delete existing data
        if force:
            delete_query = f"DELETE FROM `{table_id}` WHERE 1=1"
            bq_client.client.query(delete_query).result()
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
            errors = bq_client.client.insert_rows_json(table_id, rows)
            if errors:
                logger.error(f"Failed to insert {provider} subscription rows: {errors}")
                return {"status": "FAILED", "error": str(errors)}

        logger.info(f"Seeded {len(rows)} {provider.upper()} subscription rows for {org_slug}")
        return {"status": "SUCCESS", "rows_seeded": len(rows)}

    except Exception as e:
        logger.error(f"Error initializing {provider.upper()} subscriptions: {e}", exc_info=True)
        return {"status": "FAILED", "error": str(e)}
