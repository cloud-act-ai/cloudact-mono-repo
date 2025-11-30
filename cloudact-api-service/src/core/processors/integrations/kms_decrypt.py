"""
KMS Decrypt Integration Processor

Retrieves and decrypts integration credentials from storage.
Used by pipelines that need access to external services.

Supports all providers defined in configs/system/providers.yml.
To add a new provider: just update providers.yml - no code changes needed.
"""

import json
import logging
from typing import Dict, Any, Optional
from google.cloud import bigquery

from src.core.engine.bq_client import BigQueryClient
from src.core.security.kms_encryption import decrypt_value
from src.core.providers import provider_registry
from src.app.config import get_settings


class KMSDecryptIntegrationProcessor:
    """
    Processor for retrieving and decrypting integration credentials.

    Flow:
    1. Queries org_integration_credentials for the specified org/provider
    2. Decrypts credential using GCP KMS
    3. Puts decrypted credential into context for downstream processors
    4. Returns success/failure status

    Provider configuration is loaded from configs/system/providers.yml.
    Context keys are defined in the YAML - no code changes needed for new providers.
    """

    def __init__(self):
        self.settings = get_settings()
        self.logger = logging.getLogger(__name__)

    async def execute(
        self,
        step_config: Dict[str, Any],
        context: Dict[str, Any]
    ) -> Dict[str, Any]:
        """
        Retrieve and decrypt integration credential.

        Args:
            step_config: Step configuration containing:
                - config.provider: Provider name from providers.yml
                - config.require_valid: Only return VALID credentials (default: True)
                - config.context_key: Override key to store decrypted credential in context
            context: Execution context containing:
                - org_slug: Organization identifier (REQUIRED)
                - secrets: Dict to store decrypted credentials (will be created if missing)

        Returns:
            Dict with:
                - status: SUCCESS or FAILED
                - credential_id: UUID of retrieved credential
                - provider: Provider name
                - validation_status: Current validation status
        """
        config = step_config.get("config", {})

        # Extract parameters
        org_slug = context.get("org_slug")
        provider = config.get("provider", "").upper()
        require_valid = config.get("require_valid", True)
        context_key = config.get("context_key")

        # Validate inputs
        if not org_slug:
            return {
                "status": "FAILED",
                "error": "org_slug is required in context"
            }

        if not provider:
            return {
                "status": "FAILED",
                "error": "provider is required in config"
            }

        self.logger.info(
            f"Retrieving integration credential for {org_slug}/{provider}",
            extra={"org_slug": org_slug, "provider": provider}
        )

        # Initialize BigQuery client
        bq_client = BigQueryClient(project_id=self.settings.gcp_project_id)

        # Query for credential
        try:
            query = f"""
            SELECT
                credential_id,
                provider,
                credential_name,
                encrypted_credential,
                credential_type,
                validation_status,
                last_validated_at,
                last_error,
                metadata
            FROM `{self.settings.gcp_project_id}.organizations.org_integration_credentials`
            WHERE org_slug = @org_slug
                AND provider = @provider
                AND is_active = TRUE
            """

            if require_valid:
                query += " AND validation_status = 'VALID'"

            query += " ORDER BY created_at DESC LIMIT 1"

            results = list(bq_client.client.query(
                query,
                job_config=bigquery.QueryJobConfig(
                    query_parameters=[
                        bigquery.ScalarQueryParameter("org_slug", "STRING", org_slug),
                        bigquery.ScalarQueryParameter("provider", "STRING", provider),
                    ]
                )
            ).result())

            if not results:
                self.logger.warning(
                    f"No active credential found for {org_slug}/{provider}",
                    extra={"org_slug": org_slug, "provider": provider, "require_valid": require_valid}
                )
                return {
                    "status": "FAILED",
                    "error": f"No active {provider} credentials found for organization",
                    "provider": provider
                }

            row = results[0]
            credential_id = row["credential_id"]
            encrypted_credential = row["encrypted_credential"]
            validation_status = row["validation_status"]

            # Decrypt credential
            try:
                decrypted_credential = decrypt_value(encrypted_credential)
                self.logger.info(
                    f"Credential decrypted successfully",
                    extra={
                        "org_slug": org_slug,
                        "provider": provider,
                        "credential_id": credential_id
                    }
                )
            except Exception as e:
                self.logger.error(f"KMS decryption failed: {e}", exc_info=True)
                return {
                    "status": "FAILED",
                    "error": f"Failed to decrypt credential: {str(e)}",
                    "provider": provider,
                    "credential_id": credential_id
                }

            # Store in context
            # Initialize secrets dict if not present
            if "secrets" not in context:
                context["secrets"] = {}

            # Determine context key - use provider registry if not overridden
            if context_key:
                key = context_key
            else:
                # Get key from provider registry (loaded from providers.yml)
                key = provider_registry.get_context_key(provider)
                if not key:
                    # Fallback if provider not in registry
                    key = f"{provider.lower()}_credential"

            context["secrets"][key] = decrypted_credential

            # Also store metadata if present
            if row.get("metadata"):
                metadata_key = f"{key}_metadata"
                context["secrets"][metadata_key] = json.loads(row["metadata"]) if isinstance(row["metadata"], str) else row["metadata"]

            self.logger.info(
                f"Credential stored in context",
                extra={
                    "org_slug": org_slug,
                    "provider": provider,
                    "context_key": key,
                    "credential_id": credential_id
                }
            )

            return {
                "status": "SUCCESS",
                "credential_id": credential_id,
                "provider": provider,
                "validation_status": validation_status,
                "credential_name": row.get("credential_name"),
                "context_key": key,
                "message": f"Credential decrypted and stored in context['{key}']"
            }

        except Exception as e:
            self.logger.error(f"Failed to retrieve credential: {e}", exc_info=True)
            return {
                "status": "FAILED",
                "error": f"Failed to retrieve credential: {str(e)}",
                "provider": provider
            }


class GetIntegrationStatusProcessor:
    """
    Processor to check integration status without decrypting.
    Used for health checks and status displays.
    """

    def __init__(self):
        self.settings = get_settings()
        self.logger = logging.getLogger(__name__)

    async def execute(
        self,
        step_config: Dict[str, Any],
        context: Dict[str, Any]
    ) -> Dict[str, Any]:
        """
        Get status of all integrations for an organization.

        Args:
            step_config: Step configuration (optional)
            context: Execution context containing:
                - org_slug: Organization identifier (REQUIRED)

        Returns:
            Dict with:
                - status: SUCCESS
                - integrations: Dict of provider -> status info
        """
        org_slug = context.get("org_slug")

        if not org_slug:
            return {
                "status": "FAILED",
                "error": "org_slug is required in context"
            }

        bq_client = BigQueryClient(project_id=self.settings.gcp_project_id)

        try:
            query = f"""
            SELECT
                provider,
                credential_name,
                validation_status,
                last_validated_at,
                last_error,
                created_at,
                updated_at
            FROM `{self.settings.gcp_project_id}.organizations.org_integration_credentials`
            WHERE org_slug = @org_slug AND is_active = TRUE
            ORDER BY provider
            """

            results = list(bq_client.client.query(
                query,
                job_config=bigquery.QueryJobConfig(
                    query_parameters=[
                        bigquery.ScalarQueryParameter("org_slug", "STRING", org_slug),
                    ]
                )
            ).result())

            integrations = {}
            for row in results:
                integrations[row["provider"]] = {
                    "status": row["validation_status"],
                    "name": row.get("credential_name"),
                    "last_validated": row["last_validated_at"].isoformat() if row.get("last_validated_at") else None,
                    "last_error": row.get("last_error"),
                    "created_at": row["created_at"].isoformat() if row.get("created_at") else None,
                }

            return {
                "status": "SUCCESS",
                "org_slug": org_slug,
                "integrations": integrations,
                "providers_configured": list(integrations.keys()),
                "all_valid": all(i["status"] == "VALID" for i in integrations.values()) if integrations else False
            }

        except Exception as e:
            self.logger.error(f"Failed to get integration status: {e}", exc_info=True)
            return {
                "status": "FAILED",
                "error": str(e)
            }


# Factory functions for pipeline executor
def get_engine():
    """Factory function for pipeline executor."""
    return KMSDecryptIntegrationProcessor()


def get_status_engine():
    """Factory function for status processor."""
    return GetIntegrationStatusProcessor()


async def execute(step_config: Dict[str, Any], context: Dict[str, Any]) -> Dict[str, Any]:
    """Entry point for pipeline executor."""
    processor = KMSDecryptIntegrationProcessor()
    return await processor.execute(step_config, context)
