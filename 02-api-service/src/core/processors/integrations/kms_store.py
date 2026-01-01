"""
KMS Store Integration Processor

Validates and stores integration credentials encrypted via GCP KMS.
Supports all providers defined in configs/system/providers.yml.

To add a new provider: just update providers.yml - no code changes needed.

SECURITY NOTES:
- Credentials are stored with expiration policy (SECURITY FIX #6)
- Error messages are sanitized to prevent metadata leakage (SECURITY FIX #7)
- Audit logging is performed for all credential operations
"""

import json
import logging
import re
import uuid
from datetime import datetime, timedelta
from typing import Dict, Any, Optional
from google.cloud import bigquery

from src.core.engine.bq_client import BigQueryClient
from src.core.security.kms_encryption import encrypt_value
from src.core.providers import provider_registry, validate_credential, validate_credential_format
from src.app.config import get_settings


# SECURITY FIX #6: Default credential expiration (90 days)
DEFAULT_CREDENTIAL_EXPIRATION_DAYS = 90

# Warning threshold before expiration (14 days)
EXPIRATION_WARNING_DAYS = 14


def sanitize_error_message(error: Exception) -> str:
    """
    SECURITY FIX #7: Sanitize exception messages before storing/returning.

    Removes potentially sensitive information like:
    - File paths
    - IP addresses
    - API endpoints
    - Stack traces
    - Internal service names

    Args:
        error: The exception to sanitize

    Returns:
        Sanitized error message
    """
    message = str(error)

    # Remove file paths (Unix and Windows)
    message = re.sub(r'(/[a-zA-Z0-9_.\-/]+)+', '[PATH]', message)
    message = re.sub(r'([A-Za-z]:\\[a-zA-Z0-9_.\-\\]+)+', '[PATH]', message)

    # Remove IP addresses
    message = re.sub(r'\b\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}\b', '[IP]', message)

    # Remove URLs
    message = re.sub(r'https?://[^\s<>"{}|\\^`\[\]]+', '[URL]', message)

    # Remove potential API keys/tokens (long alphanumeric strings)
    message = re.sub(r'\b[A-Za-z0-9_-]{32,}\b', '[REDACTED]', message)

    # Remove project IDs that look like GCP project IDs
    message = re.sub(r'\b[a-z][a-z0-9-]{4,28}[a-z0-9]\b', '[PROJECT]', message)

    # Truncate to reasonable length
    max_length = 500
    if len(message) > max_length:
        message = message[:max_length] + "... [truncated]"

    return message


def get_generic_error_code(error: Exception) -> str:
    """
    SECURITY FIX #7: Map exceptions to generic error codes.

    Returns:
        Generic error code for the exception type
    """
    error_type = type(error).__name__

    error_codes = {
        "ConnectionError": "CONN_001",
        "TimeoutError": "TIMEOUT_001",
        "AuthenticationError": "AUTH_001",
        "PermissionError": "PERM_001",
        "ValueError": "INVALID_001",
        "KeyError": "MISSING_001",
        "TypeError": "TYPE_001",
        "JSONDecodeError": "FORMAT_001",
    }

    return error_codes.get(error_type, "INTERNAL_001")


class KMSStoreIntegrationProcessor:
    """
    Processor for storing integration credentials securely.

    Flow:
    1. Receives plaintext credential from context
    2. Validates credential format and connectivity (via generic validator)
    3. Encrypts credential using GCP KMS
    4. Stores encrypted credential in org_integration_credentials table
    5. Returns credential_id and validation status

    Provider configuration is loaded from configs/system/providers.yml.
    Adding a new provider requires NO code changes - just update the YAML.
    """

    def __init__(self):
        self.settings = get_settings()
        self.logger = logging.getLogger(__name__)

    @property
    def supported_providers(self) -> list:
        """Get supported providers from registry (loaded from YAML)."""
        return provider_registry.get_all_providers()

    def get_credential_type(self, provider: str) -> str:
        """Get credential type from registry."""
        return provider_registry.get_credential_type(provider) or "API_KEY"

    async def execute(
        self,
        step_config: Dict[str, Any],
        context: Dict[str, Any]
    ) -> Dict[str, Any]:
        """
        Store integration credential securely.

        Args:
            step_config: Step configuration containing:
                - config.provider: Provider name from providers.yml
                - config.skip_validation: Skip credential validation (default: False)
                - config.credential_name: Optional human-readable name
            context: Execution context containing:
                - org_slug: Organization identifier (REQUIRED)
                - plaintext_credential: The credential to store (REQUIRED)
                - user_id: User who created the credential (optional)
                - metadata: Additional metadata like project_id, region (optional)

        Returns:
            Dict with:
                - status: SUCCESS or FAILED
                - credential_id: UUID of stored credential
                - provider: Provider name
                - validation_status: VALID, INVALID, or PENDING
                - validation_error: Error message if validation failed
        """
        config = step_config.get("config", {})

        # Extract required parameters
        org_slug = context.get("org_slug")
        plaintext_credential = context.get("plaintext_credential")
        provider = config.get("provider", "").upper()
        skip_validation = config.get("skip_validation", False)
        credential_name = config.get("credential_name")
        user_id = context.get("user_id")
        metadata = context.get("metadata", {})

        # Validate inputs
        if not org_slug:
            return {
                "status": "FAILED",
                "error": "org_slug is required in context"
            }

        if not plaintext_credential:
            return {
                "status": "FAILED",
                "error": "plaintext_credential is required in context"
            }

        # Use registry to check valid providers
        if not provider_registry.is_valid_provider(provider):
            return {
                "status": "FAILED",
                "error": f"Unsupported provider: {provider}. Supported: {self.supported_providers}"
            }

        self.logger.info(
            f"Storing integration credential for {org_slug}/{provider}",
            extra={
                "org_slug": org_slug,
                "provider": provider,
                "skip_validation": skip_validation
            }
        )

        # Initialize BigQuery client
        bq_client = BigQueryClient(project_id=self.settings.gcp_project_id)

        # Step 1: Validate credential format using generic validator
        format_result = validate_credential_format(provider, plaintext_credential)
        if not format_result["valid"]:
            return {
                "status": "FAILED",
                "error": format_result["error"],
                "provider": provider
            }

        # Step 2: Validate credential connectivity (unless skipped)
        validation_status = "PENDING"
        validation_error = None
        last_validated_at = None

        if not skip_validation:
            try:
                # Use generic validator from providers package
                connectivity_result = await validate_credential(
                    provider, plaintext_credential, metadata
                )
                if connectivity_result["valid"]:
                    validation_status = "VALID"
                    last_validated_at = datetime.utcnow()
                else:
                    validation_status = "INVALID"
                    validation_error = connectivity_result.get("error", "Validation failed")
            except Exception as e:
                self.logger.error(f"Credential validation error: {e}", exc_info=True)
                validation_status = "INVALID"
                # SECURITY FIX #7: Sanitize error message
                validation_error = sanitize_error_message(e)

        # Step 3: Encrypt credential using KMS
        try:
            encrypted_credential = encrypt_value(plaintext_credential)
            self.logger.info(f"Credential encrypted successfully for {org_slug}/{provider}")
        except Exception as e:
            self.logger.error(f"KMS encryption failed: {e}", exc_info=True)
            # SECURITY FIX #7: Return generic error, log detailed one
            return {
                "status": "FAILED",
                "error": "Encryption failed. Please try again or contact support.",
                "error_code": get_generic_error_code(e),
                "provider": provider
            }

        # Step 4: Check for existing credential and deactivate it
        credential_id = str(uuid.uuid4())
        credential_type = self.get_credential_type(provider)

        try:
            # Deactivate existing credential for this org/provider
            deactivate_query = f"""
            UPDATE `{self.settings.gcp_project_id}.organizations.org_integration_credentials`
            SET is_active = FALSE, updated_at = CURRENT_TIMESTAMP()
            WHERE org_slug = @org_slug AND provider = @provider AND is_active = TRUE
            """
            bq_client.client.query(
                deactivate_query,
                job_config=bigquery.QueryJobConfig(
                    query_parameters=[
                        bigquery.ScalarQueryParameter("org_slug", "STRING", org_slug),
                        bigquery.ScalarQueryParameter("provider", "STRING", provider),
                    ],
                    job_timeout_ms=120000  # 120 seconds for integration ops (increased from 60s)
                )
            ).result()
        except Exception as e:
            self.logger.warning(f"Failed to deactivate existing credential: {e}")
            # Continue - not critical

        # Step 5: Insert new credential
        try:
            # Use PARSE_JSON for the metadata field since BigQuery JSON columns require it
            metadata_json_str = json.dumps(metadata) if metadata else "{}"

            # SECURITY FIX #6: Calculate expiration date
            expiration_days = config.get("expiration_days", DEFAULT_CREDENTIAL_EXPIRATION_DAYS)
            expires_at = datetime.utcnow() + timedelta(days=expiration_days)

            insert_query = f"""
            INSERT INTO `{self.settings.gcp_project_id}.organizations.org_integration_credentials`
            (credential_id, org_slug, provider, credential_name, encrypted_credential,
             credential_type, validation_status, last_validated_at, last_error,
             metadata, is_active, created_by_user_id, created_at, updated_at, expires_at)
            VALUES
            (@credential_id, @org_slug, @provider, @credential_name, @encrypted_credential,
             @credential_type, @validation_status, @last_validated_at, @last_error,
             PARSE_JSON(@metadata), TRUE, @user_id, CURRENT_TIMESTAMP(), CURRENT_TIMESTAMP(), @expires_at)
            """

            job_config = bigquery.QueryJobConfig(
                query_parameters=[
                    bigquery.ScalarQueryParameter("credential_id", "STRING", credential_id),
                    bigquery.ScalarQueryParameter("org_slug", "STRING", org_slug),
                    bigquery.ScalarQueryParameter("provider", "STRING", provider),
                    bigquery.ScalarQueryParameter("credential_name", "STRING", credential_name),
                    bigquery.ScalarQueryParameter("encrypted_credential", "BYTES", encrypted_credential),
                    bigquery.ScalarQueryParameter("credential_type", "STRING", credential_type),
                    bigquery.ScalarQueryParameter("validation_status", "STRING", validation_status),
                    bigquery.ScalarQueryParameter("last_validated_at", "TIMESTAMP", last_validated_at),
                    bigquery.ScalarQueryParameter("last_error", "STRING", validation_error),
                    bigquery.ScalarQueryParameter("metadata", "STRING", metadata_json_str),
                    bigquery.ScalarQueryParameter("user_id", "STRING", user_id),
                    bigquery.ScalarQueryParameter("expires_at", "TIMESTAMP", expires_at),
                ],
                job_timeout_ms=120000  # 120 seconds for integration ops (increased from 60s)
            )

            bq_client.client.query(insert_query, job_config=job_config).result()

            self.logger.info(
                f"Credential stored successfully",
                extra={
                    "org_slug": org_slug,
                    "provider": provider,
                    "credential_id": credential_id,
                    "validation_status": validation_status,
                    "expires_at": expires_at.isoformat(),  # SECURITY FIX #6
                }
            )

            return {
                "status": "SUCCESS",
                "credential_id": credential_id,
                "provider": provider,
                "validation_status": validation_status,
                "validation_error": validation_error,
                "expires_at": expires_at.isoformat(),  # SECURITY FIX #6
                "message": f"Integration credential stored for {provider}"
            }

        except Exception as e:
            self.logger.error(f"Failed to store credential: {e}", exc_info=True)
            # SECURITY FIX #7: Return sanitized error
            return {
                "status": "FAILED",
                "error": "Failed to store credential. Please try again or contact support.",
                "error_code": get_generic_error_code(e),
                "provider": provider
            }


# Factory function for pipeline executor
def get_engine():
    """Factory function for pipeline executor."""
    return KMSStoreIntegrationProcessor()


async def execute(step_config: Dict[str, Any], context: Dict[str, Any]) -> Dict[str, Any]:
    """Entry point for pipeline executor."""
    processor = KMSStoreIntegrationProcessor()
    return await processor.execute(step_config, context)
