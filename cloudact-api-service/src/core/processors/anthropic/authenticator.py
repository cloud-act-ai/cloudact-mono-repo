"""
Anthropic (Claude) Authenticator Utility

Shared authentication utility for all Anthropic/Claude processors.
Handles credential decryption, validation, and client factory methods.

Usage:
    from src.core.processors.anthropic.authenticator import AnthropicAuthenticator

    auth = AnthropicAuthenticator(org_slug="myorg_123")
    client = await auth.get_anthropic_client()
    # Use client for API calls...
"""

import logging
from typing import Dict, Any, Optional

from google.cloud import bigquery

from src.core.engine.bq_client import BigQueryClient
from src.core.security.kms_encryption import decrypt_value
from src.app.config import get_settings


class AnthropicAuthenticator:
    """
    Shared authentication utility for all Anthropic processors.

    Decrypts Anthropic API key from org_integration_credentials,
    caches it per instance, and provides factory methods for clients.

    Attributes:
        org_slug: Organization identifier
        api_key: Decrypted API key (available after authenticate())

    Example:
        auth = AnthropicAuthenticator("acme_corp_123")
        client = await auth.get_anthropic_client()
        message = await client.messages.create(...)
    """

    PROVIDER = "ANTHROPIC"
    BASE_URL = "https://api.anthropic.com/v1"

    def __init__(self, org_slug: str):
        """
        Initialize authenticator for an organization.

        Args:
            org_slug: Organization identifier (e.g., "acme_corp_123")
        """
        self.org_slug = org_slug
        self.settings = get_settings()
        self.logger = logging.getLogger(__name__)

        # Cached values
        self._api_key: Optional[str] = None
        self._credential_id: Optional[str] = None

    @property
    def api_key(self) -> Optional[str]:
        """Decrypted API key (available after authenticate())."""
        return self._api_key

    async def authenticate(self) -> str:
        """
        Decrypt and return Anthropic API key. Cached per instance.

        Returns:
            Decrypted Anthropic API key

        Raises:
            ValueError: If no valid credentials found
            Exception: If decryption fails
        """
        if self._api_key:
            return self._api_key

        self.logger.info(
            f"Authenticating Anthropic for {self.org_slug}",
            extra={"org_slug": self.org_slug, "provider": self.PROVIDER}
        )

        # Query for credential
        bq_client = BigQueryClient(project_id=self.settings.gcp_project_id)

        query = f"""
        SELECT
            credential_id,
            encrypted_credential,
            validation_status
        FROM `{self.settings.gcp_project_id}.organizations.org_integration_credentials`
        WHERE org_slug = @org_slug
            AND provider = @provider
            AND is_active = TRUE
            AND validation_status = 'VALID'
        ORDER BY created_at DESC
        LIMIT 1
        """

        results = list(bq_client.client.query(
            query,
            job_config=bigquery.QueryJobConfig(
                query_parameters=[
                    bigquery.ScalarQueryParameter("org_slug", "STRING", self.org_slug),
                    bigquery.ScalarQueryParameter("provider", "STRING", self.PROVIDER),
                ]
            )
        ).result())

        if not results:
            raise ValueError(f"No valid Anthropic credentials found for {self.org_slug}")

        row = results[0]
        self._credential_id = row["credential_id"]
        encrypted_credential = row["encrypted_credential"]

        # Decrypt
        try:
            self._api_key = decrypt_value(encrypted_credential)
        except Exception as e:
            self.logger.error(f"Failed to decrypt Anthropic credentials: {e}")
            raise

        self.logger.info(
            f"Anthropic authentication successful",
            extra={"org_slug": self.org_slug, "credential_id": self._credential_id}
        )

        return self._api_key

    async def get_async_client(self):
        """
        Return configured httpx AsyncClient with auth headers.

        Returns:
            httpx.AsyncClient with Anthropic headers set
        """
        import httpx

        api_key = await self.authenticate()
        return httpx.AsyncClient(
            base_url=self.BASE_URL,
            headers={
                "x-api-key": api_key,
                "anthropic-version": "2023-06-01",
                "content-type": "application/json"
            },
            timeout=60.0
        )

    async def get_anthropic_client(self):
        """
        Return official Anthropic Python SDK client.

        Returns:
            anthropic.AsyncAnthropic client

        Note:
            Requires 'anthropic' package to be installed.
        """
        from anthropic import AsyncAnthropic

        api_key = await self.authenticate()
        return AsyncAnthropic(api_key=api_key)

    async def validate(self) -> Dict[str, Any]:
        """
        Test credential validity by making a minimal API call.

        Returns:
            Dict with validation results:
                - status: "VALID" or "INVALID"
                - provider: "ANTHROPIC"
                - models: List of available models
                - error: Error message (if invalid)
        """
        import httpx

        try:
            api_key = await self.authenticate()

            async with httpx.AsyncClient(timeout=15.0) as client:
                # Use a minimal messages request to validate
                # Or check models endpoint if available
                response = await client.post(
                    f"{self.BASE_URL}/messages",
                    headers={
                        "x-api-key": api_key,
                        "anthropic-version": "2023-06-01",
                        "content-type": "application/json"
                    },
                    json={
                        "model": "claude-3-haiku-20240307",
                        "max_tokens": 1,
                        "messages": [{"role": "user", "content": "Hi"}]
                    }
                )

                if response.status_code == 200:
                    return {
                        "status": "VALID",
                        "provider": self.PROVIDER,
                        "models": ["claude-3-opus", "claude-3-sonnet", "claude-3-haiku"],
                        "message": "Anthropic API key validated successfully."
                    }
                elif response.status_code == 401:
                    return {
                        "status": "INVALID",
                        "provider": self.PROVIDER,
                        "error": "Invalid API key"
                    }
                elif response.status_code == 400:
                    # 400 with valid auth means key is valid but request was bad
                    # This is actually a sign of valid credentials
                    error_data = response.json()
                    if "authentication" not in str(error_data).lower():
                        return {
                            "status": "VALID",
                            "provider": self.PROVIDER,
                            "models": ["claude-3-opus", "claude-3-sonnet", "claude-3-haiku"],
                            "message": "Anthropic API key validated (auth successful)."
                        }
                    return {
                        "status": "INVALID",
                        "provider": self.PROVIDER,
                        "error": f"API error: {response.status_code}"
                    }
                else:
                    return {
                        "status": "INVALID",
                        "provider": self.PROVIDER,
                        "error": f"API error: {response.status_code}"
                    }

        except ValueError as e:
            return {
                "status": "INVALID",
                "provider": self.PROVIDER,
                "error": str(e)
            }
        except Exception as e:
            self.logger.error(f"Anthropic validation failed: {e}", exc_info=True)
            return {
                "status": "INVALID",
                "provider": self.PROVIDER,
                "error": str(e)
            }

    async def update_validation_status(
        self,
        status: str,
        error: Optional[str] = None
    ) -> None:
        """
        Update validation status in database.

        Args:
            status: Validation status ("VALID", "INVALID", "PENDING")
            error: Error message (for INVALID status)
        """
        bq_client = BigQueryClient(project_id=self.settings.gcp_project_id)

        try:
            query = f"""
            UPDATE `{self.settings.gcp_project_id}.organizations.org_integration_credentials`
            SET
                validation_status = @status,
                last_validated_at = CURRENT_TIMESTAMP(),
                last_error = @error,
                updated_at = CURRENT_TIMESTAMP()
            WHERE org_slug = @org_slug AND provider = @provider AND is_active = TRUE
            """

            bq_client.client.query(
                query,
                job_config=bigquery.QueryJobConfig(
                    query_parameters=[
                        bigquery.ScalarQueryParameter("org_slug", "STRING", self.org_slug),
                        bigquery.ScalarQueryParameter("provider", "STRING", self.PROVIDER),
                        bigquery.ScalarQueryParameter("status", "STRING", status),
                        bigquery.ScalarQueryParameter("error", "STRING", error),
                    ]
                )
            ).result()

            self.logger.info(
                f"Updated Anthropic validation status to {status}",
                extra={"org_slug": self.org_slug, "status": status}
            )
        except Exception as e:
            self.logger.error(f"Failed to update validation status: {e}")
