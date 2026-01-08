"""
Integration Metadata Schema Validation (BUG-020 FIX)

Validates metadata JSON structure for each integration provider.
Prevents storing invalid or malformed metadata.

Provider-specific metadata schemas:
- GCP_SA: project_id, client_email, region (optional)
- AWS_IAM: role_arn, external_id, region (optional)
- AWS_KEYS: region (optional), account_id (optional)
- AZURE: subscription_id, resource_group (optional), region (optional)
- OCI: compartment_id (optional), region
- GenAI providers: environment (optional), project_id (optional), notes (optional)
"""

from typing import Dict, Any, Optional, Tuple
from pydantic import BaseModel, Field, field_validator, ValidationError, ConfigDict
import logging

logger = logging.getLogger(__name__)


# ============================================
# Provider-Specific Metadata Models
# ============================================

class GcpMetadata(BaseModel):
    """GCP Service Account metadata schema."""
    project_id: str = Field(..., min_length=6, max_length=30, description="GCP project ID")
    client_email: str = Field(..., min_length=5, max_length=255, description="Service account email")
    region: Optional[str] = Field(None, max_length=50, description="Default GCP region")
    environment: Optional[str] = Field(None, max_length=50, description="Environment tag (dev, staging, prod)")
    notes: Optional[str] = Field(None, max_length=500, description="User notes")

    model_config = ConfigDict(extra="forbid")

    @field_validator('project_id')
    @classmethod
    def validate_project_id(cls, v: str) -> str:
        """Validate GCP project ID format."""
        if not v.replace('-', '').replace('_', '').isalnum():
            raise ValueError("project_id must contain only alphanumeric characters, hyphens, and underscores")
        return v


class AwsIamMetadata(BaseModel):
    """AWS IAM Role metadata schema."""
    role_arn: str = Field(..., min_length=20, max_length=2048, description="IAM role ARN")
    external_id: str = Field(..., min_length=2, max_length=1224, description="External ID for cross-account access")
    region: Optional[str] = Field(None, max_length=50, description="Default AWS region")
    account_id: Optional[str] = Field(None, min_length=12, max_length=12, description="AWS account ID")
    environment: Optional[str] = Field(None, max_length=50, description="Environment tag")
    notes: Optional[str] = Field(None, max_length=500, description="User notes")

    model_config = ConfigDict(extra="forbid")

    @field_validator('role_arn')
    @classmethod
    def validate_role_arn(cls, v: str) -> str:
        """Validate AWS role ARN format."""
        if not v.startswith('arn:aws:iam::'):
            raise ValueError("role_arn must start with 'arn:aws:iam::'")
        return v

    @field_validator('account_id')
    @classmethod
    def validate_account_id(cls, v: Optional[str]) -> Optional[str]:
        """Validate AWS account ID is 12 digits."""
        if v and not v.isdigit():
            raise ValueError("account_id must be 12 digits")
        return v


class AwsKeysMetadata(BaseModel):
    """AWS Access Keys metadata schema."""
    region: Optional[str] = Field(None, max_length=50, description="Default AWS region")
    account_id: Optional[str] = Field(None, min_length=12, max_length=12, description="AWS account ID")
    environment: Optional[str] = Field(None, max_length=50, description="Environment tag")
    notes: Optional[str] = Field(None, max_length=500, description="User notes")

    model_config = ConfigDict(extra="forbid")


class AzureMetadata(BaseModel):
    """Azure Service Principal metadata schema."""
    subscription_id: str = Field(..., min_length=36, max_length=36, description="Azure subscription ID (UUID)")
    resource_group: Optional[str] = Field(None, max_length=90, description="Default resource group")
    region: Optional[str] = Field(None, max_length=50, description="Default Azure region")
    tenant_id: Optional[str] = Field(None, min_length=36, max_length=36, description="Azure AD tenant ID")
    environment: Optional[str] = Field(None, max_length=50, description="Environment tag")
    notes: Optional[str] = Field(None, max_length=500, description="User notes")

    model_config = ConfigDict(extra="forbid")


class OciMetadata(BaseModel):
    """Oracle Cloud Infrastructure metadata schema."""
    compartment_id: Optional[str] = Field(None, max_length=255, description="Default OCI compartment OCID")
    region: str = Field(..., max_length=50, description="OCI region (required)")
    tenancy_ocid: Optional[str] = Field(None, max_length=255, description="Tenancy OCID")
    environment: Optional[str] = Field(None, max_length=50, description="Environment tag")
    notes: Optional[str] = Field(None, max_length=500, description="User notes")

    model_config = ConfigDict(extra="forbid")


class GenAiMetadata(BaseModel):
    """GenAI providers (OpenAI, Anthropic, Gemini, DeepSeek) metadata schema."""
    project_id: Optional[str] = Field(None, max_length=100, description="Project or workspace ID")
    billing_account: Optional[str] = Field(None, max_length=100, description="Billing account identifier")
    environment: Optional[str] = Field(None, max_length=50, description="Environment tag (dev, staging, prod)")
    cost_center: Optional[str] = Field(None, max_length=100, description="Cost center or department")
    notes: Optional[str] = Field(None, max_length=500, description="User notes")

    model_config = ConfigDict(extra="allow")  # Allow extra fields for flexibility


# ============================================
# Schema Registry
# ============================================

METADATA_SCHEMAS: Dict[str, type[BaseModel]] = {
    "GCP_SA": GcpMetadata,
    "AWS_IAM": AwsIamMetadata,
    "AWS_KEYS": AwsKeysMetadata,
    "AZURE": AzureMetadata,
    "OCI": OciMetadata,
    # GenAI providers use the same flexible schema
    "OPENAI": GenAiMetadata,
    "ANTHROPIC": GenAiMetadata,
    "CLAUDE": GenAiMetadata,
    "GEMINI": GenAiMetadata,
    "DEEPSEEK": GenAiMetadata,
}


# ============================================
# Validation Functions
# ============================================

def validate_metadata(provider: str, metadata: Optional[Dict[str, Any]]) -> Tuple[bool, Optional[str]]:
    """
    BUG-020 FIX: Validate metadata JSON structure against provider schema.

    Args:
        provider: Provider name (e.g., "GCP_SA", "OPENAI")
        metadata: Metadata dictionary to validate

    Returns:
        Tuple of (is_valid, error_message)
        - (True, None) if valid or no metadata
        - (False, error_message) if invalid

    Examples:
        >>> validate_metadata("GCP_SA", {"project_id": "my-project", "client_email": "sa@project.iam.gserviceaccount.com"})
        (True, None)

        >>> validate_metadata("GCP_SA", {"invalid_field": "value"})
        (False, "Metadata validation failed: ...")

        >>> validate_metadata("OPENAI", None)
        (True, None)
    """
    # No metadata is valid (all fields optional)
    if metadata is None or not metadata:
        return (True, None)

    # Get schema for provider
    provider_upper = provider.upper()
    schema_class = METADATA_SCHEMAS.get(provider_upper)

    if schema_class is None:
        # Unknown provider - allow any metadata (no validation)
        logger.warning(f"No metadata schema defined for provider: {provider}")
        return (True, None)

    # Validate metadata against schema
    try:
        schema_class(**metadata)
        return (True, None)
    except ValidationError as e:
        # Extract first error message
        errors = e.errors()
        if errors:
            first_error = errors[0]
            field = ".".join(str(loc) for loc in first_error["loc"])
            msg = first_error["msg"]
            error_message = f"Metadata validation failed for '{field}': {msg}"
        else:
            error_message = f"Metadata validation failed: {str(e)}"

        logger.warning(
            f"Metadata validation failed for {provider}",
            extra={
                "provider": provider,
                "error": error_message,
                "metadata_keys": list(metadata.keys()) if metadata else []
            }
        )
        return (False, error_message)
    except Exception as e:
        error_message = f"Metadata validation error: {str(e)}"
        logger.error(
            f"Unexpected error validating metadata for {provider}",
            extra={"provider": provider, "error": str(e)},
            exc_info=True
        )
        return (False, error_message)


def get_metadata_schema_info(provider: str) -> Optional[Dict[str, Any]]:
    """
    Get metadata schema information for a provider.

    Args:
        provider: Provider name

    Returns:
        Dictionary with schema info or None if no schema defined

    Example:
        >>> info = get_metadata_schema_info("GCP_SA")
        >>> print(info["required_fields"])
        ['project_id', 'client_email']
    """
    provider_upper = provider.upper()
    schema_class = METADATA_SCHEMAS.get(provider_upper)

    if schema_class is None:
        return None

    # Extract required and optional fields from Pydantic model
    required_fields = []
    optional_fields = []

    for field_name, field_info in schema_class.model_fields.items():
        if field_info.is_required():
            required_fields.append(field_name)
        else:
            optional_fields.append(field_name)

    return {
        "provider": provider,
        "required_fields": required_fields,
        "optional_fields": optional_fields,
        "schema_class": schema_class.__name__,
    }
