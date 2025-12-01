"""
Pipelines Configuration API Routes

Endpoints for listing available pipelines.
Pipeline configuration is loaded from configs/system/pipelines.yml.
To add a new pipeline: just update pipelines.yml - no code changes needed.

URL Structure: /api/v1/pipelines
"""

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field
from typing import List, Optional, Dict, Any
from pathlib import Path
import logging
import yaml

from src.app.config import settings

router = APIRouter()
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
                    "provider": "GCP",
                    "domain": "Billing",
                    "pipeline": "billing",
                    "required_integration": "GCP_SA",
                    "schedule": "daily",
                    "enabled": True
                },
                {
                    "id": "openai_usage_cost",
                    "name": "OpenAI Usage & Cost",
                    "description": "Extract usage data and calculate costs from OpenAI API",
                    "provider": "OpenAI",
                    "domain": "Usage",
                    "pipeline": "usage_cost",
                    "required_integration": "OPENAI",
                    "schedule": "daily",
                    "enabled": True
                },
                {
                    "id": "anthropic_usage_cost",
                    "name": "Anthropic Usage & Cost",
                    "description": "Extract usage data and calculate costs from Anthropic API",
                    "provider": "Anthropic",
                    "domain": "Usage",
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
    "/pipelines",
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
    "/pipelines/{pipeline_id}",
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
