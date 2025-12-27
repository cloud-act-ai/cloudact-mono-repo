"""
Azure Authenticator Processor

Handles Azure authentication via Service Principal (OAuth2).
Decrypts credentials from org_integration_credentials and creates Azure SDK clients.

ps_type: cloud.azure.authenticator

Usage:
    from src.core.processors.cloud.azure.authenticator import AzureAuthenticator

    auth = AzureAuthenticator(org_slug="myorg_123")
    creds = await auth.authenticate()
    # Use creds for Azure API calls...
"""

import json
import logging
from typing import Dict, Any, Optional

from google.cloud import bigquery

from src.core.engine.bq_client import BigQueryClient
from src.core.security.kms_encryption import decrypt_value
from src.app.config import get_settings

logger = logging.getLogger(__name__)


class AzureAuthenticator:
    """
    Azure authentication utility for pipeline processors.

    Uses Service Principal (client credentials flow) for authentication.
    Credentials are decrypted from org_integration_credentials using KMS.

    Attributes:
        org_slug: Organization identifier
        tenant_id: Azure AD tenant ID
        subscription_id: Azure subscription ID
        client_id: Service Principal client ID

    Example:
        auth = AzureAuthenticator("acme_corp_123")
        creds = await auth.authenticate()
        token = creds["access_token"]
    """

    def __init__(self, org_slug: str):
        """
        Initialize authenticator for an organization.

        Args:
            org_slug: Organization identifier (e.g., "acme_corp_123")
        """
        self.org_slug = org_slug
        self.settings = get_settings()
        self.logger = logging.getLogger(__name__)

        # Cached values (populated on first authenticate() call)
        self._credentials: Optional[Dict[str, Any]] = None
        self._token: Optional[str] = None
        self._tenant_id: Optional[str] = None
        self._client_id: Optional[str] = None
        self._subscription_id: Optional[str] = None

    @property
    def tenant_id(self) -> Optional[str]:
        """Azure AD tenant ID (available after authenticate())."""
        return self._tenant_id

    @property
    def client_id(self) -> Optional[str]:
        """Service Principal client ID (available after authenticate())."""
        return self._client_id

    @property
    def subscription_id(self) -> Optional[str]:
        """Azure subscription ID (available after authenticate())."""
        return self._subscription_id

    async def authenticate(self) -> Dict[str, Any]:
        """
        Decrypt and validate Azure credentials.

        Flow:
        1. Query BigQuery for encrypted credential
        2. Decrypt via KMS
        3. Parse JSON and extract Service Principal details
        4. Get OAuth2 access token
        5. Cache and return

        Returns:
            Dict with Azure credentials:
                - tenant_id: Azure AD tenant ID
                - client_id: Service Principal client ID
                - subscription_id: Azure subscription ID
                - access_token: OAuth2 access token

        Raises:
            ValueError: If no valid credentials found
            Exception: If decryption, parsing, or token acquisition fails
        """
        if self._credentials and self._token:
            return {**self._credentials, "access_token": self._token}

        self.logger.info(
            f"Authenticating Azure for {self.org_slug}",
            extra={"org_slug": self.org_slug, "provider": "AZURE"}
        )

        # Fetch encrypted credentials from BigQuery
        bq_client = BigQueryClient(project_id=self.settings.gcp_project_id)

        query = f"""
        SELECT
            credential_id,
            encrypted_credential,
            validation_status,
            metadata
        FROM `{self.settings.gcp_project_id}.organizations.org_integration_credentials`
        WHERE org_slug = @org_slug
          AND provider = 'AZURE'
          AND is_active = TRUE
          AND validation_status = 'VALID'
        ORDER BY created_at DESC
        LIMIT 1
        """

        results = list(bq_client.client.query(
            query,
            job_config=bigquery.QueryJobConfig(query_parameters=[
                bigquery.ScalarQueryParameter("org_slug", "STRING", self.org_slug)
            ])
        ).result())

        if not results:
            raise ValueError(f"No valid Azure credentials found for org {self.org_slug}")

        row = results[0]
        encrypted_cred = row["encrypted_credential"]

        # Decrypt credentials
        try:
            decrypted_json = decrypt_value(encrypted_cred)
            creds = json.loads(decrypted_json)
        except Exception as e:
            self.logger.error(f"Failed to decrypt/parse Azure credentials: {e}")
            raise

        # Extract and cache metadata
        self._tenant_id = creds.get("tenant_id")
        self._client_id = creds.get("client_id")
        self._subscription_id = creds.get("subscription_id")

        if not self._tenant_id or not self._client_id:
            raise ValueError("Azure credentials missing required fields (tenant_id, client_id)")

        self._credentials = {
            "tenant_id": self._tenant_id,
            "client_id": self._client_id,
            "subscription_id": self._subscription_id,
        }

        # Get OAuth2 token
        self._token = await self._get_access_token(creds)

        self.logger.info(
            f"Azure authentication successful",
            extra={
                "org_slug": self.org_slug,
                "tenant_id": self._tenant_id,
                "subscription_id": self._subscription_id
            }
        )

        return {**self._credentials, "access_token": self._token}

    async def _get_access_token(self, creds: Dict[str, Any]) -> str:
        """
        Get Azure AD access token using client credentials flow.

        Args:
            creds: Decrypted credentials containing tenant_id, client_id, client_secret

        Returns:
            OAuth2 access token string

        Raises:
            httpx.HTTPStatusError: If token request fails
        """
        import httpx

        tenant_id = creds.get("tenant_id")
        client_id = creds.get("client_id")
        client_secret = creds.get("client_secret")

        if not client_secret:
            raise ValueError("Azure credentials missing client_secret")

        token_url = f"https://login.microsoftonline.com/{tenant_id}/oauth2/v2.0/token"

        async with httpx.AsyncClient() as client:
            response = await client.post(
                token_url,
                data={
                    "grant_type": "client_credentials",
                    "client_id": client_id,
                    "client_secret": client_secret,
                    "scope": "https://management.azure.com/.default",
                },
            )
            response.raise_for_status()
            token_data = response.json()
            return token_data["access_token"]

    async def get_access_token(self) -> str:
        """
        Get a fresh OAuth2 access token for REST API calls.

        Useful for httpx/aiohttp async clients that need Bearer token.

        Returns:
            OAuth2 access token string

        Example:
            auth = AzureAuthenticator("acme_corp")
            token = await auth.get_access_token()
            headers = {"Authorization": f"Bearer {token}"}
        """
        creds = await self.authenticate()
        return creds["access_token"]

    async def get_cost_management_client(self) -> Dict[str, Any]:
        """
        Get Azure Cost Management client configuration.

        Returns credentials and headers needed for Cost Management API calls.

        Returns:
            Dict with:
                - base_url: Cost Management API base URL
                - headers: Authorization headers
                - subscription_id: Azure subscription ID

        Example:
            auth = AzureAuthenticator("acme_corp")
            client_config = await auth.get_cost_management_client()
            # Use with httpx for Cost Management API
        """
        creds = await self.authenticate()

        return {
            "base_url": "https://management.azure.com",
            "headers": {
                "Authorization": f"Bearer {creds['access_token']}",
                "Content-Type": "application/json",
            },
            "subscription_id": creds["subscription_id"],
            "api_version": "2023-03-01",
        }

    async def validate(self) -> Dict[str, Any]:
        """
        Test credential validity by making API calls.

        Returns:
            Dict with validation results:
                - status: "VALID" or "INVALID"
                - provider: "AZURE"
                - tenant_id: Azure AD tenant ID (if valid)
                - subscription_id: Azure subscription ID (if valid)
                - permissions: List of validated permissions
                - error: Error message (if invalid)
        """
        try:
            creds = await self.authenticate()

            # Test by listing subscriptions
            import httpx

            async with httpx.AsyncClient() as client:
                response = await client.get(
                    f"https://management.azure.com/subscriptions/{creds['subscription_id']}",
                    headers={"Authorization": f"Bearer {creds['access_token']}"},
                    params={"api-version": "2022-12-01"},
                )
                response.raise_for_status()

            validated_permissions = ["Microsoft.Subscription/subscriptions/read"]

            return {
                "status": "VALID",
                "provider": "AZURE",
                "tenant_id": self._tenant_id,
                "subscription_id": self._subscription_id,
                "permissions": validated_permissions,
                "message": f"Azure Service Principal validated for subscription {self._subscription_id}"
            }

        except ValueError as e:
            # No credentials found
            return {
                "status": "INVALID",
                "provider": "AZURE",
                "error": str(e)
            }
        except Exception as e:
            self.logger.error(f"Azure validation failed: {e}", exc_info=True)
            return {
                "status": "INVALID",
                "provider": "AZURE",
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
            WHERE org_slug = @org_slug AND provider = 'AZURE' AND is_active = TRUE
            """

            bq_client.client.query(
                query,
                job_config=bigquery.QueryJobConfig(
                    query_parameters=[
                        bigquery.ScalarQueryParameter("org_slug", "STRING", self.org_slug),
                        bigquery.ScalarQueryParameter("status", "STRING", status),
                        bigquery.ScalarQueryParameter("error", "STRING", error),
                    ]
                )
            ).result()

            self.logger.info(
                f"Updated Azure validation status to {status}",
                extra={"org_slug": self.org_slug, "status": status}
            )
        except Exception as e:
            self.logger.error(f"Failed to update validation status: {e}")


async def execute(step_config: Dict[str, Any], context: Dict[str, Any]) -> Dict[str, Any]:
    """
    Entry point for pipeline executor.

    Args:
        step_config: Step configuration from pipeline YAML
        context: Pipeline execution context containing org_slug

    Returns:
        Dict with execution status and results
    """
    org_slug = context.get("org_slug")
    if not org_slug:
        return {"status": "FAILED", "error": "org_slug is required"}

    try:
        auth = AzureAuthenticator(org_slug)
        await auth.authenticate()
        return {
            "status": "SUCCESS",
            "provider": "AZURE",
            "tenant_id": auth.tenant_id,
            "subscription_id": auth.subscription_id,
            "message": "Azure authentication successful"
        }
    except Exception as e:
        logger.error(f"Azure authentication failed: {e}", exc_info=True)
        return {"status": "FAILED", "error": str(e)}


def get_engine():
    """Factory function for pipeline executor."""
    return AzureAuthenticator
