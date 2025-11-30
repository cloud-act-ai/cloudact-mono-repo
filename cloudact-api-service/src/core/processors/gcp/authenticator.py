"""
GCP Service Account Authenticator Utility

Shared authentication utility for all GCP processors.
Handles credential decryption, validation, and client factory methods.

Usage:
    from src.core.processors.gcp.authenticator import GCPAuthenticator

    auth = GCPAuthenticator(org_slug="myorg_123")
    bq_client = await auth.get_bigquery_client()
    # Use client for queries...
"""

import json
import logging
from typing import Dict, Any, Optional

from google.cloud import bigquery
from google.oauth2 import service_account

from src.core.engine.bq_client import BigQueryClient
from src.core.security.kms_encryption import decrypt_value
from src.app.config import get_settings


class GCPAuthenticator:
    """
    Shared authentication utility for all GCP processors.

    Decrypts GCP Service Account credentials from org_integration_credentials,
    caches them per instance, and provides factory methods for GCP clients.

    Attributes:
        org_slug: Organization identifier
        project_id: GCP project ID (from service account)
        client_email: Service account email

    Example:
        auth = GCPAuthenticator("acme_corp_123")
        client = await auth.get_bigquery_client()
        datasets = list(client.list_datasets())
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
        self._credentials: Optional[service_account.Credentials] = None
        self._sa_info: Optional[Dict[str, Any]] = None
        self._project_id: Optional[str] = None
        self._client_email: Optional[str] = None

    @property
    def project_id(self) -> Optional[str]:
        """GCP project ID from service account (available after authenticate())."""
        return self._project_id

    @property
    def client_email(self) -> Optional[str]:
        """Service account email (available after authenticate())."""
        return self._client_email

    async def authenticate(self) -> service_account.Credentials:
        """
        Decrypt and return GCP credentials. Cached per instance.

        Flow:
        1. Query BigQuery for encrypted credential
        2. Decrypt via KMS
        3. Parse JSON and create credentials object
        4. Cache and return

        Returns:
            Google OAuth2 service account credentials

        Raises:
            ValueError: If no valid credentials found
            Exception: If decryption or parsing fails
        """
        if self._credentials:
            return self._credentials

        self.logger.info(
            f"Authenticating GCP for {self.org_slug}",
            extra={"org_slug": self.org_slug, "provider": "GCP_SA"}
        )

        # Query for credential
        bq_client = BigQueryClient(project_id=self.settings.gcp_project_id)

        query = f"""
        SELECT
            credential_id,
            encrypted_credential,
            validation_status,
            metadata
        FROM `{self.settings.gcp_project_id}.organizations.org_integration_credentials`
        WHERE org_slug = @org_slug
            AND provider = 'GCP_SA'
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
                ]
            )
        ).result())

        if not results:
            raise ValueError(f"No valid GCP credentials found for {self.org_slug}")

        row = results[0]
        encrypted_credential = row["encrypted_credential"]

        # Decrypt
        try:
            decrypted_json = decrypt_value(encrypted_credential)
            self._sa_info = json.loads(decrypted_json)
        except Exception as e:
            self.logger.error(f"Failed to decrypt/parse GCP credentials: {e}")
            raise

        # Extract metadata
        self._project_id = self._sa_info.get("project_id")
        self._client_email = self._sa_info.get("client_email")

        if not self._project_id:
            raise ValueError("Service account JSON missing project_id")

        # Create credentials
        self._credentials = service_account.Credentials.from_service_account_info(
            self._sa_info
        )

        self.logger.info(
            f"GCP authentication successful",
            extra={
                "org_slug": self.org_slug,
                "project_id": self._project_id,
                "client_email": self._client_email
            }
        )

        return self._credentials

    async def get_bigquery_client(self) -> bigquery.Client:
        """
        Return authenticated BigQuery client.

        Returns:
            BigQuery client authenticated with org's service account
        """
        creds = await self.authenticate()
        return bigquery.Client(credentials=creds, project=self._project_id)

    async def get_billing_service(self):
        """
        Return authenticated Cloud Billing API service.

        Returns:
            Cloud Billing API service object
        """
        from googleapiclient.discovery import build

        creds = await self.authenticate()
        return build(
            "cloudbilling", "v1",
            credentials=creds,
            cache_discovery=False
        )

    async def get_storage_client(self):
        """
        Return authenticated Cloud Storage client.

        Returns:
            Cloud Storage client authenticated with org's service account
        """
        from google.cloud import storage

        creds = await self.authenticate()
        return storage.Client(credentials=creds, project=self._project_id)

    async def validate(self) -> Dict[str, Any]:
        """
        Test credential validity by making API calls.

        Returns:
            Dict with validation results:
                - status: "VALID" or "INVALID"
                - provider: "GCP_SA"
                - project_id: GCP project ID (if valid)
                - permissions: List of validated permissions
                - error: Error message (if invalid)
        """
        try:
            client = await self.get_bigquery_client()

            # Test BigQuery access
            list(client.list_datasets(max_results=1))

            validated_permissions = ["bigquery.datasets.list", "bigquery.read"]

            return {
                "status": "VALID",
                "provider": "GCP_SA",
                "project_id": self._project_id,
                "client_email": self._client_email,
                "permissions": validated_permissions,
                "message": f"GCP Service Account validated for project {self._project_id}"
            }

        except ValueError as e:
            # No credentials found
            return {
                "status": "INVALID",
                "provider": "GCP_SA",
                "error": str(e)
            }
        except Exception as e:
            self.logger.error(f"GCP validation failed: {e}", exc_info=True)
            return {
                "status": "INVALID",
                "provider": "GCP_SA",
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
            WHERE org_slug = @org_slug AND provider = 'GCP_SA' AND is_active = TRUE
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
                f"Updated GCP validation status to {status}",
                extra={"org_slug": self.org_slug, "status": status}
            )
        except Exception as e:
            self.logger.error(f"Failed to update validation status: {e}")
