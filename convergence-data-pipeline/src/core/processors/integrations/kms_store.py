"""
KMS Store Integration Processor

Validates and stores integration credentials encrypted via GCP KMS.
Supports: OpenAI, Claude/Anthropic, DeepSeek API keys, and GCP Service Account JSON.
"""

import json
import logging
import uuid
from datetime import datetime
from typing import Dict, Any, Optional
from google.cloud import bigquery

from src.core.engine.bq_client import BigQueryClient
from src.core.security.kms_encryption import encrypt_value
from src.app.config import get_settings


class KMSStoreIntegrationProcessor:
    """
    Processor for storing integration credentials securely.

    Flow:
    1. Receives plaintext credential from context
    2. Validates credential format and connectivity (via provider-specific validator)
    3. Encrypts credential using GCP KMS
    4. Stores encrypted credential in org_integration_credentials table
    5. Returns credential_id and validation status
    """

    SUPPORTED_PROVIDERS = ["OPENAI", "CLAUDE", "ANTHROPIC", "DEEPSEEK", "GCP_SA"]
    CREDENTIAL_TYPES = {
        "OPENAI": "API_KEY",
        "CLAUDE": "API_KEY",
        "ANTHROPIC": "API_KEY",  # Anthropic/Claude
        "DEEPSEEK": "API_KEY",
        "GCP_SA": "SERVICE_ACCOUNT_JSON",
    }

    def __init__(self):
        self.settings = get_settings()
        self.logger = logging.getLogger(__name__)

    async def execute(
        self,
        step_config: Dict[str, Any],
        context: Dict[str, Any]
    ) -> Dict[str, Any]:
        """
        Store integration credential securely.

        Args:
            step_config: Step configuration containing:
                - config.provider: Provider name (OPENAI, CLAUDE, DEEPSEEK, GCP_SA)
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

        if provider not in self.SUPPORTED_PROVIDERS:
            return {
                "status": "FAILED",
                "error": f"Unsupported provider: {provider}. Supported: {self.SUPPORTED_PROVIDERS}"
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

        # Step 1: Validate credential format
        validation_result = self._validate_credential_format(provider, plaintext_credential)
        if not validation_result["valid"]:
            return {
                "status": "FAILED",
                "error": validation_result["error"],
                "provider": provider
            }

        # Step 2: Validate credential connectivity (unless skipped)
        validation_status = "PENDING"
        validation_error = None
        last_validated_at = None

        if not skip_validation:
            try:
                connectivity_result = await self._validate_credential_connectivity(
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
        credential_type = self.CREDENTIAL_TYPES[provider]

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
                    ]
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
                ]
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

    def _validate_credential_format(self, provider: str, credential: str) -> Dict[str, Any]:
        """Validate credential format based on provider."""
        if provider in ["OPENAI", "CLAUDE", "ANTHROPIC", "DEEPSEEK"]:
            # API keys should be non-empty strings
            if not credential or len(credential) < 10:
                return {"valid": False, "error": "API key is too short"}

            # OpenAI keys typically start with sk-
            if provider == "OPENAI" and not credential.startswith("sk-"):
                return {"valid": False, "error": "OpenAI API keys should start with 'sk-'"}

            return {"valid": True}

        elif provider == "GCP_SA":
            # GCP Service Account should be valid JSON
            try:
                sa_json = json.loads(credential)
                required_fields = ["type", "project_id", "private_key", "client_email"]
                missing = [f for f in required_fields if f not in sa_json]
                if missing:
                    return {"valid": False, "error": f"Missing required fields: {missing}"}
                if sa_json.get("type") != "service_account":
                    return {"valid": False, "error": "Invalid service account type"}
                return {"valid": True}
            except json.JSONDecodeError:
                return {"valid": False, "error": "Invalid JSON format for service account"}

        return {"valid": False, "error": f"Unknown provider: {provider}"}

    async def _validate_credential_connectivity(
        self,
        provider: str,
        credential: str,
        metadata: Optional[Dict] = None
    ) -> Dict[str, Any]:
        """
        Validate credential can connect to the service.
        Uses provider-specific validation logic.
        """
        try:
            if provider == "OPENAI":
                return await self._validate_openai_key(credential)
            elif provider in ["CLAUDE", "ANTHROPIC"]:
                return await self._validate_claude_key(credential)
            elif provider == "DEEPSEEK":
                return await self._validate_deepseek_key(credential)
            elif provider == "GCP_SA":
                return await self._validate_gcp_sa(credential, metadata)
            else:
                return {"valid": False, "error": f"No validator for provider: {provider}"}
        except Exception as e:
            return {"valid": False, "error": str(e)}

    async def _validate_openai_key(self, api_key: str) -> Dict[str, Any]:
        """Validate OpenAI API key by listing models."""
        import httpx

        async with httpx.AsyncClient(timeout=10.0) as client:
            response = await client.get(
                "https://api.openai.com/v1/models",
                headers={"Authorization": f"Bearer {api_key}"}
            )

            if response.status_code == 200:
                return {"valid": True}
            elif response.status_code == 401:
                return {"valid": False, "error": "Invalid API key"}
            else:
                return {"valid": False, "error": f"API error: {response.status_code}"}

    async def _validate_claude_key(self, api_key: str) -> Dict[str, Any]:
        """Validate Anthropic/Claude API key by listing models."""
        import httpx

        async with httpx.AsyncClient(timeout=10.0) as client:
            response = await client.get(
                "https://api.anthropic.com/v1/models",
                headers={
                    "x-api-key": api_key,
                    "anthropic-version": "2023-06-01"
                }
            )

            if response.status_code == 200:
                return {"valid": True}
            elif response.status_code == 401:
                return {"valid": False, "error": "Invalid API key"}
            else:
                return {"valid": False, "error": f"API error: {response.status_code}"}

    async def _validate_deepseek_key(self, api_key: str) -> Dict[str, Any]:
        """Validate DeepSeek API key."""
        import httpx

        async with httpx.AsyncClient(timeout=10.0) as client:
            response = await client.get(
                "https://api.deepseek.com/v1/models",
                headers={"Authorization": f"Bearer {api_key}"}
            )

            if response.status_code == 200:
                return {"valid": True}
            elif response.status_code == 401:
                return {"valid": False, "error": "Invalid API key"}
            else:
                return {"valid": False, "error": f"API error: {response.status_code}"}

    async def _validate_gcp_sa(
        self,
        sa_json_str: str,
        metadata: Optional[Dict] = None
    ) -> Dict[str, Any]:
        """Validate GCP Service Account by making a simple API call."""
        import tempfile
        import os
        from google.oauth2 import service_account
        from google.cloud import bigquery as bq

        try:
            sa_info = json.loads(sa_json_str)
            project_id = sa_info.get("project_id")

            # Create credentials from service account info
            credentials = service_account.Credentials.from_service_account_info(sa_info)

            # Try to list datasets (minimal permission check)
            client = bq.Client(credentials=credentials, project=project_id)

            # Just check we can connect - list 1 dataset
            list(client.list_datasets(max_results=1))

            return {"valid": True, "project_id": project_id}

        except Exception as e:
            return {"valid": False, "error": str(e)}


# Factory function for pipeline executor
def get_engine():
    """Factory function for pipeline executor."""
    return KMSStoreIntegrationProcessor()


async def execute(step_config: Dict[str, Any], context: Dict[str, Any]) -> Dict[str, Any]:
    """Entry point for pipeline executor."""
    processor = KMSStoreIntegrationProcessor()
    return await processor.execute(step_config, context)
