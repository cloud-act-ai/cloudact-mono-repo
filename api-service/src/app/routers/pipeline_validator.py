"""
Pipeline Validator API Routes

Service-to-service validation endpoints for data-pipeline-service.
Validates org subscription, quota, and credentials before pipeline execution.

URL Structure: /api/v1/validator
"""

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field
from typing import List, Optional, Dict, Any
from pathlib import Path
import logging
import yaml

from src.app.config import settings
from src.app.dependencies.auth import (
    get_current_org,
    validate_subscription,
    validate_quota,
    get_org_credentials,
    increment_pipeline_usage,
    reserve_pipeline_quota_atomic,
)
from src.core.engine.bq_client import BigQueryClient, get_bigquery_client

router = APIRouter()


# ============================================
# Pipeline Validation Models (for service-to-service)
# ============================================

class PipelineValidationRequest(BaseModel):
    """Request for pipeline validation (called by data-pipeline-service)."""
    pipeline_id: str = Field(..., description="Pipeline ID to validate")
    include_credentials: bool = Field(False, description="Include decrypted credentials in response")


class PipelineValidationResponse(BaseModel):
    """Response from pipeline validation."""
    valid: bool = Field(..., description="Whether pipeline can be executed")
    org_slug: str = Field(..., description="Organization slug")
    org_dataset_id: Optional[str] = Field(None, description="Organization's BigQuery dataset ID")
    pipeline_id: str = Field(..., description="Pipeline ID")
    pipeline_config: Optional[Dict[str, Any]] = Field(None, description="Pipeline configuration")
    subscription: Optional[Dict[str, Any]] = Field(None, description="Subscription info")
    quota: Optional[Dict[str, Any]] = Field(None, description="Quota info")
    credentials: Optional[Dict[str, Any]] = Field(None, description="Decrypted credentials (if requested)")
    error: Optional[str] = Field(None, description="Error message if validation failed")
    error_code: Optional[str] = Field(None, description="Error code for programmatic handling")


logger = logging.getLogger(__name__)


# ============================================
# Response Models
# ============================================

class PipelineConfig(BaseModel):
    """Configuration for a single pipeline."""
    id: str = Field(..., description="Unique pipeline identifier")
    name: str = Field(..., description="Human-readable pipeline name")
    description: str = Field(..., description="Pipeline description")
    provider: str = Field(..., description="Provider (GCP, OpenAI, Anthropic)")
    domain: str = Field(..., description="Domain (Billing, Usage, Cost)")
    pipeline: str = Field(..., description="Pipeline template name")
    required_integration: str = Field(..., description="Required integration to run")
    schedule: Optional[str] = Field(None, description="Default schedule (daily, monthly)")
    enabled: bool = Field(True, description="Whether pipeline is enabled")


class PipelinesListResponse(BaseModel):
    """Response listing all available pipelines."""
    success: bool
    pipelines: List[PipelineConfig]
    total: int


# ============================================
# Pipeline Registry (Loaded from YAML)
# ============================================

class PipelineRegistry:
    """Registry of available pipelines loaded from config."""

    _instance: Optional["PipelineRegistry"] = None
    _pipelines: List[Dict[str, Any]] = []
    _loaded: bool = False

    def __new__(cls):
        if cls._instance is None:
            cls._instance = super().__new__(cls)
        return cls._instance

    def _load_pipelines(self) -> None:
        """Load pipelines from configs/system/pipelines.yml."""
        if self._loaded:
            return

        # Try multiple config paths
        config_paths = [
            Path(__file__).parent.parent.parent.parent / "configs" / "system" / "pipelines.yml",
            Path("configs/system/pipelines.yml"),
        ]

        pipelines_config = None
        for config_path in config_paths:
            if config_path.exists():
                with open(config_path, 'r') as f:
                    pipelines_config = yaml.safe_load(f)
                logger.info(f"Loaded pipelines config from {config_path}")
                break

        if pipelines_config and "pipelines" in pipelines_config:
            self._pipelines = pipelines_config["pipelines"]
        else:
            # Default pipelines if no config file
            logger.warning("No pipelines.yml found, using defaults")
            self._pipelines = [
                {
                    "id": "gcp_billing",
                    "name": "GCP Billing",
                    "description": "Extract daily billing cost data from GCP Cloud Billing export",
                    "provider": "gcp",
                    "domain": "cost",  # Matches config path: configs/gcp/cost/billing.yml
                    "pipeline": "billing",
                    "required_integration": "GCP_SA",
                    "schedule": "daily",
                    "enabled": True
                },
                {
                    "id": "openai_usage_cost",
                    "name": "OpenAI Usage & Cost",
                    "description": "Extract usage data and calculate costs from OpenAI API",
                    "provider": "openai",
                    "domain": "",  # Matches config path: configs/openai/usage_cost.yml (no subdomain)
                    "pipeline": "usage_cost",
                    "required_integration": "OPENAI",
                    "schedule": "daily",
                    "enabled": True
                },
                {
                    "id": "anthropic_usage_cost",
                    "name": "Anthropic Usage & Cost",
                    "description": "Extract usage data and calculate costs from Anthropic API",
                    "provider": "anthropic",
                    "domain": "",  # Matches config path: configs/anthropic/usage_cost.yml (no subdomain)
                    "pipeline": "usage_cost",
                    "required_integration": "ANTHROPIC",
                    "schedule": "daily",
                    "enabled": True
                }
            ]

        self._loaded = True

    def get_pipelines(self, enabled_only: bool = True) -> List[Dict[str, Any]]:
        """Get list of available pipelines."""
        self._load_pipelines()
        if enabled_only:
            return [p for p in self._pipelines if p.get("enabled", True)]
        return self._pipelines

    def get_pipeline(self, pipeline_id: str) -> Optional[Dict[str, Any]]:
        """Get a specific pipeline by ID."""
        self._load_pipelines()
        for pipeline in self._pipelines:
            if pipeline["id"] == pipeline_id:
                return pipeline
        return None

    def get_pipelines_by_provider(self, provider: str) -> List[Dict[str, Any]]:
        """Get pipelines for a specific provider."""
        self._load_pipelines()
        return [p for p in self._pipelines if p["provider"].lower() == provider.lower()]


def get_pipeline_registry() -> PipelineRegistry:
    """Get the pipeline registry instance."""
    return PipelineRegistry()


# ============================================
# API Endpoints
# ============================================

@router.get(
    "/validator/pipelines",
    response_model=PipelinesListResponse,
    summary="List available pipelines",
    description="Returns list of all available pipelines that can be run. No authentication required."
)
async def list_pipelines(
    provider: Optional[str] = None,
    enabled_only: bool = True
) -> PipelinesListResponse:
    """
    List all available pipelines.

    This is a public endpoint that returns pipeline metadata.
    Actual pipeline execution requires authentication via the pipeline service.

    Args:
        provider: Optional filter by provider (GCP, OpenAI, Anthropic)
        enabled_only: Only return enabled pipelines (default: True)

    Returns:
        List of available pipelines with their configurations
    """
    registry = get_pipeline_registry()

    if provider:
        pipelines = registry.get_pipelines_by_provider(provider)
    else:
        pipelines = registry.get_pipelines(enabled_only=enabled_only)

    return PipelinesListResponse(
        success=True,
        pipelines=[
            PipelineConfig(
                id=p["id"],
                name=p["name"],
                description=p["description"],
                provider=p["provider"],
                domain=p["domain"],
                pipeline=p["pipeline"],
                required_integration=p["required_integration"],
                schedule=p.get("schedule"),
                enabled=p.get("enabled", True)
            )
            for p in pipelines
        ],
        total=len(pipelines)
    )


@router.get(
    "/validator/pipelines/{pipeline_id}",
    response_model=PipelineConfig,
    summary="Get pipeline details",
    description="Get configuration details for a specific pipeline."
)
async def get_pipeline(pipeline_id: str) -> PipelineConfig:
    """
    Get details for a specific pipeline.

    Args:
        pipeline_id: The pipeline identifier

    Returns:
        Pipeline configuration

    Raises:
        HTTPException: If pipeline not found
    """
    registry = get_pipeline_registry()
    pipeline = registry.get_pipeline(pipeline_id)

    if not pipeline:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Pipeline '{pipeline_id}' not found"
        )

    return PipelineConfig(
        id=pipeline["id"],
        name=pipeline["name"],
        description=pipeline["description"],
        provider=pipeline["provider"],
        domain=pipeline["domain"],
        pipeline=pipeline["pipeline"],
        required_integration=pipeline["required_integration"],
        schedule=pipeline.get("schedule"),
        enabled=pipeline.get("enabled", True)
    )


# ============================================
# Pipeline Validation Endpoint (for data-pipeline-service)
# ============================================

@router.post(
    "/validator/validate/{org_slug}",
    response_model=PipelineValidationResponse,
    summary="Validate pipeline execution",
    description="Validates org can run a pipeline. Called by data-pipeline-service before execution."
)
async def validate_pipeline_execution(
    org_slug: str,
    request: PipelineValidationRequest,
    org: Dict[str, Any] = Depends(get_current_org),
    bq_client: BigQueryClient = Depends(get_bigquery_client)
) -> PipelineValidationResponse:
    """
    Validate that an organization can execute a pipeline.

    This endpoint is called by data-pipeline-service (service-to-service)
    to validate:
    1. API key is valid and org is active
    2. Subscription is active
    3. Quota is not exceeded
    4. Required integration is configured

    Args:
        org_slug: Organization slug (from URL)
        request: Validation request with pipeline_id
        org: Authenticated org from X-API-Key header
        bq_client: BigQuery client

    Returns:
        Validation result with org/subscription/quota info
    """
    pipeline_id = request.pipeline_id

    # Verify org_slug matches authenticated org
    if org["org_slug"] != org_slug:
        logger.warning(f"Org slug mismatch: URL={org_slug}, API key={org['org_slug']}")
        return PipelineValidationResponse(
            valid=False,
            org_slug=org_slug,
            pipeline_id=pipeline_id,
            error="Organization mismatch",
            error_code="ORG_MISMATCH"
        )

    # Get pipeline config
    registry = get_pipeline_registry()
    pipeline_config = registry.get_pipeline(pipeline_id)

    if not pipeline_config:
        return PipelineValidationResponse(
            valid=False,
            org_slug=org_slug,
            pipeline_id=pipeline_id,
            error=f"Pipeline '{pipeline_id}' not found",
            error_code="PIPELINE_NOT_FOUND"
        )

    if not pipeline_config.get("enabled", True):
        return PipelineValidationResponse(
            valid=False,
            org_slug=org_slug,
            pipeline_id=pipeline_id,
            error=f"Pipeline '{pipeline_id}' is disabled",
            error_code="PIPELINE_DISABLED"
        )

    # Validate subscription
    try:
        subscription = org.get("subscription", {})
        valid_subscription_statuses = ["ACTIVE", "TRIAL"]
        if subscription.get("status") not in valid_subscription_statuses:
            return PipelineValidationResponse(
                valid=False,
                org_slug=org_slug,
                pipeline_id=pipeline_id,
                subscription=subscription,
                error=f"Subscription is {subscription.get('status')}. Must be ACTIVE or TRIAL.",
                error_code="SUBSCRIPTION_INACTIVE"
            )
    except HTTPException as e:
        return PipelineValidationResponse(
            valid=False,
            org_slug=org_slug,
            pipeline_id=pipeline_id,
            error=e.detail,
            error_code="SUBSCRIPTION_ERROR"
        )

    # ATOMIC quota check and reservation
    # This prevents race conditions where multiple concurrent requests pass quota checks
    # before any increments happen. The atomic operation checks limits AND increments in one query.
    try:
        await reserve_pipeline_quota_atomic(org_slug, subscription, bq_client)
        # Get current quota info for response (after reservation)
        quota = await validate_quota(org, subscription, bq_client)
    except HTTPException as e:
        return PipelineValidationResponse(
            valid=False,
            org_slug=org_slug,
            pipeline_id=pipeline_id,
            subscription=subscription,
            error=e.detail,
            error_code="QUOTA_EXCEEDED"
        )

    # Check required integration
    required_integration = pipeline_config.get("required_integration")
    credentials = None

    if required_integration:
        try:
            # Map integration name to provider (must match how credentials are stored)
            # Credentials are stored with provider = "GCP_SA", "OPENAI", "ANTHROPIC"
            provider_map = {
                "GCP_SA": "GCP_SA",  # Keep as GCP_SA - credentials stored with this name
                "OPENAI": "OPENAI",
                "ANTHROPIC": "ANTHROPIC",
            }
            provider = provider_map.get(required_integration, required_integration)

            if request.include_credentials:
                credentials = await get_org_credentials(org_slug, provider, bq_client)
            else:
                # Just check if credentials exist (don't decrypt)
                from google.cloud import bigquery as bq
                check_query = f"""
                SELECT credential_id
                FROM `{settings.gcp_project_id}.organizations.org_integration_credentials`
                WHERE org_slug = @org_slug
                    AND provider = @provider
                    AND is_active = TRUE
                    AND validation_status = 'VALID'
                LIMIT 1
                """
                results = list(bq_client.query(
                    check_query,
                    parameters=[
                        bq.ScalarQueryParameter("org_slug", "STRING", org_slug),
                        bq.ScalarQueryParameter("provider", "STRING", provider)
                    ]
                ))
                if not results:
                    return PipelineValidationResponse(
                        valid=False,
                        org_slug=org_slug,
                        pipeline_id=pipeline_id,
                        pipeline_config=pipeline_config,
                        subscription=subscription,
                        quota=quota,
                        error=f"Required integration '{required_integration}' not configured",
                        error_code="INTEGRATION_NOT_CONFIGURED"
                    )

        except HTTPException as e:
            return PipelineValidationResponse(
                valid=False,
                org_slug=org_slug,
                pipeline_id=pipeline_id,
                pipeline_config=pipeline_config,
                subscription=subscription,
                quota=quota,
                error=e.detail,
                error_code="INTEGRATION_ERROR"
            )

    # NOTE: Pipeline quota already reserved atomically by reserve_pipeline_quota_atomic() above.
    # No need to call increment_pipeline_usage("RUNNING") - quota is already incremented.

    logger.info(f"Pipeline validation successful: org={org_slug}, pipeline={pipeline_id}")

    return PipelineValidationResponse(
        valid=True,
        org_slug=org_slug,
        org_dataset_id=org.get("org_dataset_id"),
        pipeline_id=pipeline_id,
        pipeline_config=pipeline_config,
        subscription=subscription,
        quota=quota,
        credentials=credentials
    )


@router.post(
    "/validator/complete/{org_slug}",
    summary="Report pipeline completion",
    description="Called by data-pipeline-service after pipeline execution to update usage counters."
)
async def report_pipeline_completion(
    org_slug: str,
    pipeline_status: str,
    org: Dict[str, Any] = Depends(get_current_org),
    bq_client: BigQueryClient = Depends(get_bigquery_client)
) -> Dict[str, Any]:
    """
    Report pipeline completion to update usage counters.

    Called by data-pipeline-service after pipeline execution.

    Args:
        org_slug: Organization slug
        pipeline_status: Pipeline status (SUCCESS, FAILED)
        org: Authenticated org
        bq_client: BigQuery client

    Returns:
        Confirmation of update
    """
    # Verify org_slug matches
    if org["org_slug"] != org_slug:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Organization mismatch"
        )

    if pipeline_status not in ["SUCCESS", "FAILED"]:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid pipeline_status. Must be SUCCESS or FAILED"
        )

    await increment_pipeline_usage(org_slug, pipeline_status, bq_client)

    logger.info(f"Pipeline completion reported: org={org_slug}, status={pipeline_status}")

    return {
        "success": True,
        "org_slug": org_slug,
        "pipeline_status": pipeline_status,
        "message": "Usage counters updated"
    }
