"""
OCI Authenticator Processor

Handles Oracle Cloud Infrastructure authentication via API Key signature.
Decrypts credentials from org_integration_credentials and creates OCI SDK clients.

ps_type: cloud.oci.authenticator
"""

import json
import logging
from typing import Dict, Any, Optional

from google.cloud import bigquery

from src.core.engine.bq_client import BigQueryClient
from src.core.security.kms_encryption import decrypt_value
from src.app.config import get_settings

logger = logging.getLogger(__name__)


class OCIAuthenticator:
    """
    OCI authentication utility for pipeline processors.

    Uses API Key signature authentication (RSA key pair).
    Credentials are decrypted from org_integration_credentials using KMS.

    Attributes:
        org_slug: Organization identifier
        tenancy_ocid: OCI tenancy OCID
        user_ocid: OCI user OCID
        region: OCI region identifier

    Example:
        auth = OCIAuthenticator("acme_corp_123")
        config = await auth.get_oci_config()
        # Use config with OCI SDK clients
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
        self._tenancy_ocid: Optional[str] = None
        self._user_ocid: Optional[str] = None
        self._region: Optional[str] = None

    @property
    def tenancy_ocid(self) -> Optional[str]:
        """OCI tenancy OCID (available after authenticate())."""
        return self._tenancy_ocid

    @property
    def user_ocid(self) -> Optional[str]:
        """OCI user OCID (available after authenticate())."""
        return self._user_ocid

    @property
    def region(self) -> Optional[str]:
        """OCI region (available after authenticate())."""
        return self._region

    async def authenticate(self) -> Dict[str, Any]:
        """
        Decrypt and validate OCI credentials.

        Flow:
        1. Query BigQuery for encrypted credential
        2. Decrypt via KMS
        3. Parse JSON and extract OCI config
        4. Cache and return

        Returns:
            Dict with OCI credentials (tenancy_ocid, user_ocid, fingerprint, region)

        Raises:
            ValueError: If no valid credentials found
            Exception: If decryption or parsing fails
        """
        if self._credentials:
            return self._credentials

        self.logger.info(
            f"Authenticating OCI for {self.org_slug}",
            extra={"org_slug": self.org_slug, "provider": "OCI"}
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
          AND provider = 'OCI'
          AND is_active = TRUE
          AND validation_status = 'VALID'
        ORDER BY created_at DESC
        LIMIT 1
        """

        results = list(bq_client.client.query(
            query,
            job_config=bigquery.QueryJobConfig(
                query_parameters=[
                    bigquery.ScalarQueryParameter("org_slug", "STRING", self.org_slug)
                ]
            )
        ).result())

        if not results:
            raise ValueError(f"No valid OCI credentials found for org {self.org_slug}")

        row = results[0]
        encrypted_cred = row["encrypted_credential"]

        # Decrypt credentials
        try:
            decrypted_json = decrypt_value(encrypted_cred)
            creds = json.loads(decrypted_json)
        except Exception as e:
            self.logger.error(f"Failed to decrypt/parse OCI credentials: {e}")
            raise

        # Extract and cache metadata
        self._tenancy_ocid = creds.get("tenancy_ocid")
        self._user_ocid = creds.get("user_ocid")
        self._region = creds.get("region")

        if not self._tenancy_ocid:
            raise ValueError("OCI credentials missing tenancy_ocid")

        self._credentials = {
            "tenancy_ocid": self._tenancy_ocid,
            "user_ocid": self._user_ocid,
            "fingerprint": creds.get("fingerprint"),
            "region": self._region,
            "private_key": creds.get("private_key"),
        }

        self.logger.info(
            f"OCI authentication successful",
            extra={
                "org_slug": self.org_slug,
                "tenancy_ocid": self._tenancy_ocid,
                "region": self._region
            }
        )

        return self._credentials

    async def get_oci_config(self) -> Dict[str, Any]:
        """
        Get OCI SDK configuration dict.

        Returns:
            Dict compatible with OCI SDK client initialization

        Example:
            auth = OCIAuthenticator("acme_corp")
            config = await auth.get_oci_config()
            # Use with: oci.usage_api.UsageapiClient(config)
        """
        creds = await self.authenticate()

        return {
            "user": creds["user_ocid"],
            "key_content": creds["private_key"],
            "fingerprint": creds["fingerprint"],
            "tenancy": creds["tenancy_ocid"],
            "region": creds["region"],
        }

    async def get_usage_api_client(self):
        """
        Get OCI Usage API client for cost data.

        Note: Requires 'oci' package to be installed.
        In production, use: oci.usage_api.UsageapiClient(config)

        Returns:
            OCI Usage API client or config dict if oci package not available
        """
        config = await self.get_oci_config()

        try:
            import oci
            return oci.usage_api.UsageapiClient(config)
        except ImportError:
            self.logger.warning("OCI SDK not installed, returning config only")
            return config

    async def get_identity_client(self):
        """
        Get OCI Identity client for tenant/user management.

        Note: Requires 'oci' package to be installed.

        Returns:
            OCI Identity client or config dict if oci package not available
        """
        config = await self.get_oci_config()

        try:
            import oci
            return oci.identity.IdentityClient(config)
        except ImportError:
            self.logger.warning("OCI SDK not installed, returning config only")
            return config

    async def validate(self) -> Dict[str, Any]:
        """
        Test credential validity by making API calls.

        Returns:
            Dict with validation results:
                - status: "VALID" or "INVALID"
                - provider: "OCI"
                - tenancy_ocid: OCI tenancy OCID (if valid)
                - region: OCI region (if valid)
                - error: Error message (if invalid)
        """
        try:
            await self.authenticate()

            # Try to get identity client and list compartments
            try:
                import oci
                config = await self.get_oci_config()
                identity = oci.identity.IdentityClient(config)

                # Test access by getting tenancy info
                tenancy = identity.get_tenancy(self._tenancy_ocid).data

                return {
                    "status": "VALID",
                    "provider": "OCI",
                    "tenancy_ocid": self._tenancy_ocid,
                    "tenancy_name": tenancy.name,
                    "region": self._region,
                    "message": f"OCI credentials validated for tenancy {tenancy.name}"
                }
            except ImportError:
                # OCI SDK not installed, basic validation only
                return {
                    "status": "VALID",
                    "provider": "OCI",
                    "tenancy_ocid": self._tenancy_ocid,
                    "region": self._region,
                    "message": "OCI credentials decrypted (SDK not installed for full validation)"
                }

        except ValueError as e:
            return {
                "status": "INVALID",
                "provider": "OCI",
                "error": str(e)
            }
        except Exception as e:
            self.logger.error(f"OCI validation failed: {e}", exc_info=True)
            return {
                "status": "INVALID",
                "provider": "OCI",
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
            WHERE org_slug = @org_slug AND provider = 'OCI' AND is_active = TRUE
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
                f"Updated OCI validation status to {status}",
                extra={"org_slug": self.org_slug, "status": status}
            )
        except Exception as e:
            self.logger.error(f"Failed to update validation status: {e}")


async def execute(step_config: Dict[str, Any], context: Dict[str, Any]) -> Dict[str, Any]:
    """
    Entry point for pipeline executor.

    Args:
        step_config: Step configuration from pipeline YAML
        context: Pipeline context with org_slug and other metadata

    Returns:
        Dict with execution status and results
    """
    org_slug = context.get("org_slug")
    if not org_slug:
        return {"status": "FAILED", "error": "org_slug is required"}

    try:
        auth = OCIAuthenticator(org_slug)
        await auth.authenticate()
        return {
            "status": "SUCCESS",
            "provider": "OCI",
            "tenancy_ocid": auth.tenancy_ocid,
            "region": auth.region,
            "message": "OCI authentication successful"
        }
    except Exception as e:
        logger.error(f"OCI authentication failed: {e}", exc_info=True)
        return {"status": "FAILED", "error": str(e)}


def get_engine():
    """Factory function for pipeline executor."""
    return OCIAuthenticator
