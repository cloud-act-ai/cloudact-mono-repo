"""
KMS Store Integration Processor

Validates and stores integration credentials encrypted via GCP KMS.
Supports all providers defined in configs/system/providers.yml.

To add a new provider: just update providers.yml - no code changes needed.
"""

import json
import logging
import uuid
from datetime import datetime
from typing import Dict, Any
from google.cloud import bigquery

from src.core.engine.bq_client import BigQueryClient
from src.core.security.kms_encryption import encrypt_value
from src.core.providers import provider_registry, validate_credential, validate_credential_format
from src.app.config import get_settings


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
                validation_error = str(e)

        # Step 3: Encrypt credential using KMS
        try:
            encrypted_credential = encrypt_value(plaintext_credential)
            self.logger.info(f"Credential encrypted successfully for {org_slug}/{provider}")
        except Exception as e:
            self.logger.error(f"KMS encryption failed: {e}", exc_info=True)
            return {
                "status": "FAILED",
                "error": f"KMS encryption failed: {str(e)}",
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
                    job_timeout_ms=60000  # 60 seconds for integration ops
                )
            ).result()
        except Exception as e:
            self.logger.warning(f"Failed to deactivate existing credential: {e}")
            # Continue - not critical

        # Step 5: Insert new credential
        try:
            # Use PARSE_JSON for the metadata field since BigQuery JSON columns require it
            metadata_json_str = json.dumps(metadata) if metadata else "{}"

            insert_query = f"""
            INSERT INTO `{self.settings.gcp_project_id}.organizations.org_integration_credentials`
            (credential_id, org_slug, provider, credential_name, encrypted_credential,
             credential_type, validation_status, last_validated_at, last_error,
             metadata, is_active, created_by_user_id, created_at, updated_at)
            VALUES
            (@credential_id, @org_slug, @provider, @credential_name, @encrypted_credential,
             @credential_type, @validation_status, @last_validated_at, @last_error,
             PARSE_JSON(@metadata), TRUE, @user_id, CURRENT_TIMESTAMP(), CURRENT_TIMESTAMP())
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
                ],
                job_timeout_ms=60000  # 60 seconds for integration ops
            )

            bq_client.client.query(insert_query, job_config=job_config).result()

            self.logger.info(
                f"Credential stored successfully",
                extra={
                    "org_slug": org_slug,
                    "provider": provider,
                    "credential_id": credential_id,
                    "validation_status": validation_status
                }
            )

            return {
                "status": "SUCCESS",
                "credential_id": credential_id,
                "provider": provider,
                "validation_status": validation_status,
                "validation_error": validation_error,
                "message": f"Integration credential stored for {provider}"
            }

        except Exception as e:
            self.logger.error(f"Failed to store credential: {e}", exc_info=True)
            return {
                "status": "FAILED",
                "error": f"Failed to store credential: {str(e)}",
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
