"""
AWS Authenticator Processor

Handles AWS authentication via IAM Role (STS AssumeRole) or Access Keys.
Decrypts credentials from org_integration_credentials and creates boto3 sessions.

ps_type: cloud.aws.authenticator

Usage:
    from src.core.processors.cloud.aws.authenticator import AWSAuthenticator

    auth = AWSAuthenticator(org_slug="myorg_123")
    session = await auth.get_boto3_session()
    s3_client = session.client("s3")
"""

import json
import logging
from typing import Dict, Any, Optional

from google.cloud import bigquery

from src.core.engine.bq_client import BigQueryClient
from src.core.security.kms_encryption import decrypt_value
from src.app.config import get_settings

logger = logging.getLogger(__name__)


class AWSAuthenticator:
    """
    AWS authentication utility for pipeline processors.

    Supports:
    - IAM Role assumption (cross-account via STS AssumeRole)
    - Access Keys (direct authentication)

    Credentials are decrypted from org_integration_credentials using KMS.

    Attributes:
        org_slug: Organization identifier
        region: AWS region (default: us-east-1)

    Example:
        auth = AWSAuthenticator("acme_corp_123")
        session = await auth.get_boto3_session()
        s3 = session.client("s3")
        buckets = s3.list_buckets()
    """

    def __init__(self, org_slug: Optional[str] = None):
        """
        Initialize authenticator for an organization.

        Args:
            org_slug: Organization identifier (e.g., "acme_corp_123").
                      Can be None if set later via execute() context.
        """
        self.org_slug = org_slug
        self.settings = get_settings()
        self._credentials: Optional[Dict[str, Any]] = None
        self._session = None
        self._provider: Optional[str] = None

    async def execute(self, step_config: Dict[str, Any], context: Dict[str, Any]) -> Dict[str, Any]:
        """
        Entry point for pipeline executor (instance method).

        Called by AsyncPipelineExecutor when ps_type: cloud.aws.authenticator is encountered.

        Args:
            step_config: Step configuration from pipeline YAML
            context: Pipeline execution context with org_slug, variables, etc.

        Returns:
            Dict with execution status and authentication results
        """
        org_slug = context.get("org_slug")
        if not org_slug:
            return {"status": "FAILED", "error": "org_slug is required"}

        # Set org_slug from context if not already set
        if not self.org_slug:
            self.org_slug = org_slug

        try:
            creds = await self.authenticate()

            # Store credentials in context for downstream steps
            context_key = step_config.get("config", {}).get("context_key", "aws_credentials")
            context[context_key] = {
                "access_key_id": creds["access_key_id"],
                "region": creds.get("region"),
                # Note: Don't store secret keys in context logs
            }

            return {
                "status": "SUCCESS",
                "provider": self._provider,
                "region": creds.get("region"),
                "message": "AWS authentication successful"
            }
        except Exception as e:
            logger.error(f"AWS authentication failed: {e}", exc_info=True)
            return {"status": "FAILED", "error": str(e)}

    @property
    def region(self) -> Optional[str]:
        """AWS region from credentials (available after authenticate())."""
        if self._credentials:
            return self._credentials.get("region", "us-east-1")
        return None

    async def authenticate(self) -> Dict[str, Any]:
        """
        Decrypt and validate AWS credentials.

        Flow:
        1. Query BigQuery for encrypted credential (AWS_IAM or AWS_KEYS)
        2. Decrypt via KMS
        3. For IAM roles, assume role via STS
        4. Cache and return credentials

        Returns:
            Dict with AWS credentials:
                - access_key_id: AWS access key
                - secret_access_key: AWS secret key
                - session_token: (optional) STS session token for IAM roles
                - region: AWS region
                - expiration: (optional) Token expiration for IAM roles

        Raises:
            ValueError: If no valid credentials found
            Exception: If decryption or STS assumption fails
        """
        if self._credentials:
            return self._credentials

        logger.info(
            f"Authenticating AWS for {self.org_slug}",
            extra={"org_slug": self.org_slug, "provider": "AWS"}
        )

        # Fetch encrypted credentials from BigQuery
        bq_client = BigQueryClient(project_id=self.settings.gcp_project_id)

        query = f"""
        SELECT
            credential_id,
            encrypted_credential,
            provider,
            metadata
        FROM `{self.settings.gcp_project_id}.organizations.org_integration_credentials`
        WHERE org_slug = @org_slug
          AND provider IN ('AWS_IAM', 'AWS_KEYS')
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
            raise ValueError(f"No valid AWS credentials found for org {self.org_slug}")

        row = results[0]
        encrypted_cred = row["encrypted_credential"]
        self._provider = row["provider"]

        # Decrypt credentials
        try:
            decrypted_json = decrypt_value(encrypted_cred)
            creds = json.loads(decrypted_json)
        except Exception as e:
            logger.error(f"Failed to decrypt/parse AWS credentials: {e}")
            raise

        if self._provider == "AWS_IAM":
            # Assume role using STS
            self._credentials = await self._assume_role(creds)
        else:
            # Direct access keys (AWS_KEYS)
            self._credentials = {
                "access_key_id": creds.get("access_key_id"),
                "secret_access_key": creds.get("secret_access_key"),
                "region": creds.get("region", "us-east-1"),
            }

        logger.info(
            f"AWS authentication successful",
            extra={
                "org_slug": self.org_slug,
                "provider": self._provider,
                "region": self._credentials.get("region")
            }
        )

        return self._credentials

    async def _assume_role(self, creds: Dict[str, Any]) -> Dict[str, Any]:
        """
        Assume IAM role using STS.

        Args:
            creds: Decrypted credentials containing role_arn and optional external_id

        Returns:
            Dict with temporary credentials from STS
        """
        import boto3

        role_arn = creds.get("role_arn")
        external_id = creds.get("external_id")
        region = creds.get("region", "us-east-1")

        if not role_arn:
            raise ValueError("Missing role_arn for IAM role authentication")

        logger.info(
            f"Assuming AWS IAM role",
            extra={"role_arn": role_arn, "org_slug": self.org_slug}
        )

        sts_client = boto3.client("sts", region_name=region)

        assume_params = {
            "RoleArn": role_arn,
            "RoleSessionName": f"CloudAct-{self.org_slug}",
            "DurationSeconds": 3600,
        }

        if external_id:
            assume_params["ExternalId"] = external_id

        response = sts_client.assume_role(**assume_params)
        credentials = response["Credentials"]

        return {
            "access_key_id": credentials["AccessKeyId"],
            "secret_access_key": credentials["SecretAccessKey"],
            "session_token": credentials["SessionToken"],
            "expiration": credentials["Expiration"].isoformat(),
            "region": region,
        }

    async def get_boto3_session(self):
        """
        Get a boto3 session with the authenticated credentials.

        Returns:
            boto3.Session configured with org credentials

        Example:
            auth = AWSAuthenticator("acme_corp")
            session = await auth.get_boto3_session()
            s3 = session.client("s3")
            ec2 = session.resource("ec2")
        """
        import boto3

        if self._session:
            return self._session

        creds = await self.authenticate()

        session_kwargs = {
            "aws_access_key_id": creds["access_key_id"],
            "aws_secret_access_key": creds["secret_access_key"],
        }

        if creds.get("session_token"):
            session_kwargs["aws_session_token"] = creds["session_token"]

        if creds.get("region"):
            session_kwargs["region_name"] = creds["region"]

        self._session = boto3.Session(**session_kwargs)
        return self._session

    async def get_s3_client(self):
        """
        Return authenticated S3 client.

        Returns:
            boto3 S3 client authenticated with org credentials
        """
        session = await self.get_boto3_session()
        return session.client("s3")

    async def get_ce_client(self):
        """
        Return authenticated Cost Explorer client.

        Returns:
            boto3 Cost Explorer client authenticated with org credentials
        """
        session = await self.get_boto3_session()
        return session.client("ce")

    async def validate(self) -> Dict[str, Any]:
        """
        Test credential validity by making API calls.

        Returns:
            Dict with validation results:
                - status: "VALID" or "INVALID"
                - provider: "AWS_IAM" or "AWS_KEYS"
                - region: AWS region
                - permissions: List of validated permissions
                - error: Error message (if invalid)
        """
        try:
            session = await self.get_boto3_session()

            # Test STS GetCallerIdentity (always works with valid creds)
            sts = session.client("sts")
            identity = sts.get_caller_identity()

            validated_permissions = ["sts:GetCallerIdentity"]

            # Optionally test S3 access
            try:
                s3 = session.client("s3")
                s3.list_buckets()
                validated_permissions.append("s3:ListBuckets")
            except Exception:
                pass  # S3 access not required

            return {
                "status": "VALID",
                "provider": self._provider,
                "region": self.region,
                "account_id": identity.get("Account"),
                "arn": identity.get("Arn"),
                "permissions": validated_permissions,
                "message": f"AWS credentials validated for account {identity.get('Account')}"
            }

        except ValueError as e:
            # No credentials found
            return {
                "status": "INVALID",
                "provider": "AWS",
                "error": str(e)
            }
        except Exception as e:
            logger.error(f"AWS validation failed: {e}", exc_info=True)
            return {
                "status": "INVALID",
                "provider": "AWS",
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
            WHERE org_slug = @org_slug
              AND provider IN ('AWS_IAM', 'AWS_KEYS')
              AND is_active = TRUE
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

            logger.info(
                f"Updated AWS validation status to {status}",
                extra={"org_slug": self.org_slug, "status": status}
            )
        except Exception as e:
            logger.error(f"Failed to update validation status: {e}")


async def execute(step_config: Dict[str, Any], context: Dict[str, Any]) -> Dict[str, Any]:
    """
    Entry point for pipeline executor.

    This function is called by the AsyncPipelineExecutor when
    ps_type: cloud.aws.authenticator is encountered.

    Args:
        step_config: Step configuration from pipeline YAML
        context: Pipeline execution context with org_slug, variables, etc.

    Returns:
        Dict with execution status and authentication results
    """
    org_slug = context.get("org_slug")
    if not org_slug:
        return {"status": "FAILED", "error": "org_slug is required"}

    try:
        auth = AWSAuthenticator(org_slug)
        creds = await auth.authenticate()

        # Store credentials in context for downstream steps
        context_key = step_config.get("config", {}).get("context_key", "aws_credentials")
        context[context_key] = {
            "access_key_id": creds["access_key_id"],
            "region": creds.get("region"),
            # Note: Don't store secret keys in context logs
        }

        return {
            "status": "SUCCESS",
            "provider": auth._provider,
            "region": creds.get("region"),
            "message": "AWS authentication successful"
        }
    except Exception as e:
        logger.error(f"AWS authentication failed: {e}", exc_info=True)
        return {"status": "FAILED", "error": str(e)}


def get_engine():
    """Factory function for pipeline executor."""
    return AWSAuthenticator()
