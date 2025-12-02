"""
Generic Provider Credential Validator

Validates credentials using configuration from providers.yml.
No code changes needed when adding new providers - just update the YAML.

For API key providers: Uses validation_endpoint, auth_header from config
For cloud providers: Uses required_fields, expected_type from config
"""

import json
import logging
from typing import Dict, Any, Optional

import httpx

from src.core.providers.registry import provider_registry

logger = logging.getLogger(__name__)


def validate_credential_format(provider: str, credential: str) -> Dict[str, Any]:
    """
    Validate credential format based on provider config.

    Args:
        provider: Provider name (e.g., "OPENAI", "GCP_SA")
        credential: The credential to validate

    Returns:
        {"valid": True} or {"valid": False, "error": "..."}
    """
    config = provider_registry.get_provider(provider)
    if not config:
        return {"valid": False, "error": f"Unknown provider: {provider}"}

    if not credential or len(credential) < 10:
        return {"valid": False, "error": f"{config.display_name} is too short"}

    # API_KEY validation
    if config.credential_type == "API_KEY":
        # Check key prefix if specified in config
        # Check key prefix if specified in config
        if config.key_prefix:
            prefixes = tuple(config.key_prefix) if isinstance(config.key_prefix, list) else config.key_prefix
            if not credential.startswith(prefixes):
                return {
                    "valid": False,
                    "error": f"{config.display_name} should start with '{config.key_prefix}'"
                }
        return {"valid": True}

    # SERVICE_ACCOUNT_JSON validation
    elif config.credential_type == "SERVICE_ACCOUNT_JSON":
        try:
            sa_json = json.loads(credential)

            # Check required fields from config
            if config.required_fields:
                missing = [f for f in config.required_fields if f not in sa_json]
                if missing:
                    return {"valid": False, "error": f"Missing required fields: {missing}"}

            # Check expected type from config
            if config.expected_type and sa_json.get("type") != config.expected_type:
                return {
                    "valid": False,
                    "error": f"Invalid type. Expected '{config.expected_type}', got '{sa_json.get('type')}'"
                }

            return {"valid": True}

        except json.JSONDecodeError:
            return {"valid": False, "error": "Invalid JSON format"}

    return {"valid": True}


async def validate_credential(
    provider: str,
    credential: str,
    metadata: Optional[Dict] = None
) -> Dict[str, Any]:
    """
    Validate credential connectivity using provider config.

    For LLM providers: Makes API request to validation_endpoint
    For cloud providers: Performs provider-specific validation

    Args:
        provider: Provider name (e.g., "OPENAI", "GCP_SA")
        credential: The credential to validate
        metadata: Optional metadata (e.g., project_id for GCP)

    Returns:
        {"valid": True} or {"valid": False, "error": "..."}
    """
    config = provider_registry.get_provider(provider)
    if not config:
        return {"valid": False, "error": f"Unknown provider: {provider}"}

    try:
        # API_KEY providers - generic HTTP validation
        if config.credential_type == "API_KEY":
            return await _validate_api_key_provider(config, credential)

        # SERVICE_ACCOUNT_JSON - GCP specific validation
        elif config.credential_type == "SERVICE_ACCOUNT_JSON":
            return await _validate_gcp_service_account(credential, metadata)

        return {"valid": False, "error": f"No validator for credential type: {config.credential_type}"}

    except Exception as e:
        logger.error(f"Validation error for {provider}: {e}", exc_info=True)
        return {"valid": False, "error": str(e)}


async def _validate_api_key_provider(config, credential: str) -> Dict[str, Any]:
    """
    Generic API key validation using config.

    Works for any provider that has:
    - api_base_url
    - validation_endpoint
    - auth_header
    """
    validation_url = provider_registry.get_validation_url(config.name)
    if not validation_url:
        logger.warning(f"No validation URL for {config.name}, skipping connectivity check")
        return {"valid": True, "message": "Format valid, connectivity check skipped"}

    headers = provider_registry.get_auth_headers(config.name, credential)
    timeout = provider_registry.get_validation_timeout()

    async with httpx.AsyncClient(timeout=timeout) as client:
        response = await client.get(validation_url, headers=headers)

        if response.status_code == 200:
            return {"valid": True}
        elif response.status_code == 401:
            return {"valid": False, "error": "Invalid API key"}
        elif response.status_code == 403:
            return {"valid": False, "error": "API key lacks required permissions"}
        else:
            return {"valid": False, "error": f"API error: {response.status_code}"}


async def _validate_gcp_service_account(
    sa_json_str: str,
    metadata: Optional[Dict] = None
) -> Dict[str, Any]:
    """
    Validate GCP Service Account by attempting to connect.
    """
    from google.oauth2 import service_account
    from google.cloud import bigquery

    try:
        sa_info = json.loads(sa_json_str)
        project_id = sa_info.get("project_id")

        credentials = service_account.Credentials.from_service_account_info(sa_info)
        client = bigquery.Client(credentials=credentials, project=project_id)

        # Try to list datasets (minimal permission check)
        list(client.list_datasets(max_results=1))

        return {"valid": True, "project_id": project_id}

    except Exception as e:
        return {"valid": False, "error": str(e)}
