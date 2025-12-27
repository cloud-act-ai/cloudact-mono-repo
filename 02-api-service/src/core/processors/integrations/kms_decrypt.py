"""
KMS Decrypt Integration Processor

Retrieves and decrypts integration credentials from storage.
Used by pipelines that need access to external services.

Supports all providers defined in configs/system/providers.yml.
To add a new provider: just update providers.yml - no code changes needed.

SECURITY:
- Credentials are decrypted in memory only when needed
- Decrypted values have TTL and are cleared after pipeline step completes
- All decryption operations are audit logged (SECURITY FIX #2)
"""

import json
import logging
import time
import uuid
from datetime import datetime
from typing import Dict, Any, Optional
from google.cloud import bigquery

from src.core.engine.bq_client import BigQueryClient
from src.core.security.kms_encryption import decrypt_value
from src.core.providers import provider_registry
from src.app.config import get_settings


# TTL for decrypted secrets in seconds (SECURITY FIX #4)
DECRYPTED_SECRET_TTL_SECONDS = 300  # 5 minutes


class CredentialDecryptionAuditLogger:
    """
    SECURITY FIX #2: Audit logger for credential decryption operations.

    Logs all credential access to org_audit_logs table for compliance
    and security monitoring.
    """

    def __init__(self, settings, logger):
        self.settings = settings
        self.logger = logger

    async def log_decryption(
        self,
        org_slug: str,
        provider: str,
        credential_id: str,
        user_id: Optional[str] = None,
        request_id: Optional[str] = None,
        pipeline_id: Optional[str] = None,
        success: bool = True,
        error_message: Optional[str] = None
    ) -> None:
        """
        Log credential decryption to audit log.

        Args:
            org_slug: Organization identifier
            provider: Integration provider (e.g., OPENAI, ANTHROPIC)
            credential_id: UUID of the credential being decrypted
            user_id: User who triggered the operation (if available)
            request_id: Correlation ID for request tracking (SECURITY FIX #12)
            pipeline_id: Pipeline ID if triggered from pipeline
            success: Whether decryption succeeded
            error_message: Error message if decryption failed (sanitized)
        """
        try:
            bq_client = BigQueryClient(project_id=self.settings.gcp_project_id)

            audit_id = str(uuid.uuid4())
            timestamp = datetime.utcnow().isoformat()

            # Build audit log entry
            audit_entry = {
                "audit_id": audit_id,
                "org_slug": org_slug,
                "event_type": "CREDENTIAL_DECRYPTION",
                "event_subtype": "INTEGRATION_CREDENTIAL_ACCESS",
                "resource_type": "credential",
                "resource_id": credential_id,
                "provider": provider,
                "user_id": user_id,
                "request_id": request_id or str(uuid.uuid4()),  # SECURITY FIX #12
                "pipeline_id": pipeline_id,
                "success": success,
                "error_message": error_message[:500] if error_message else None,  # Truncate
                "ip_address": None,  # Not available in backend context
                "user_agent": None,  # Not available in backend context
                "created_at": timestamp,
            }

            # Insert audit log (fire and forget, don't block on failure)
            insert_query = f"""
            INSERT INTO `{self.settings.gcp_project_id}.organizations.org_audit_logs`
            (audit_id, org_slug, event_type, event_subtype, resource_type, resource_id,
             actor_id, request_id, details, created_at)
            VALUES
            (@audit_id, @org_slug, @event_type, @event_subtype, @resource_type, @resource_id,
             @user_id, @request_id, PARSE_JSON(@details), @created_at)
            """

            details_json = json.dumps({
                "provider": provider,
                "credential_id": credential_id,
                "pipeline_id": pipeline_id,
                "success": success,
                "error": error_message[:200] if error_message else None,
            })

            job_config = bigquery.QueryJobConfig(
                query_parameters=[
                    bigquery.ScalarQueryParameter("audit_id", "STRING", audit_id),
                    bigquery.ScalarQueryParameter("org_slug", "STRING", org_slug),
                    bigquery.ScalarQueryParameter("event_type", "STRING", "CREDENTIAL_DECRYPTION"),
                    bigquery.ScalarQueryParameter("event_subtype", "STRING", "INTEGRATION_CREDENTIAL_ACCESS"),
                    bigquery.ScalarQueryParameter("resource_type", "STRING", "credential"),
                    bigquery.ScalarQueryParameter("resource_id", "STRING", credential_id),
                    bigquery.ScalarQueryParameter("user_id", "STRING", user_id),
                    bigquery.ScalarQueryParameter("request_id", "STRING", request_id or audit_id),
                    bigquery.ScalarQueryParameter("details", "STRING", details_json),
                    bigquery.ScalarQueryParameter("created_at", "TIMESTAMP", timestamp),
                ],
                job_timeout_ms=10000  # 10 seconds max for audit log
            )

            # Execute asynchronously
            bq_client.client.query(insert_query, job_config=job_config)

            self.logger.debug(
                f"Audit logged: credential decryption for {org_slug}/{provider}",
                extra={
                    "audit_id": audit_id,
                    "org_slug": org_slug,
                    "provider": provider,
                    "credential_id": credential_id,
                    "request_id": request_id,
                }
            )

        except Exception as e:
            # Don't fail the operation if audit logging fails
            self.logger.warning(
                f"Failed to log credential decryption audit: {e}",
                extra={"org_slug": org_slug, "provider": provider}
            )


class SecretWithTTL:
    """
    SECURITY FIX #4: Wrapper for secrets with TTL.

    Secrets automatically become invalid after TTL expires.
    """

    def __init__(self, value: str, ttl_seconds: int = DECRYPTED_SECRET_TTL_SECONDS):
        self.value = value
        self.created_at = time.time()
        self.ttl_seconds = ttl_seconds

    def is_valid(self) -> bool:
        """Check if secret is still within TTL."""
        return (time.time() - self.created_at) < self.ttl_seconds

    def get_value(self) -> Optional[str]:
        """Get value if still valid, None otherwise."""
        if self.is_valid():
            return self.value
        return None

    def clear(self) -> None:
        """Explicitly clear the secret value from memory."""
        self.value = ""
        self.ttl_seconds = 0


class KMSDecryptIntegrationProcessor:
    """
    Processor for retrieving and decrypting integration credentials.

    Flow:
    1. Queries org_integration_credentials for the specified org/provider
    2. Decrypts credential using GCP KMS
    3. Puts decrypted credential into context for downstream processors
    4. Returns success/failure status
    5. Audit logs the decryption operation (SECURITY FIX #2)

    Provider configuration is loaded from configs/system/providers.yml.
    Context keys are defined in the YAML - no code changes needed for new providers.
    """

    def __init__(self):
        self.settings = get_settings()
        self.logger = logging.getLogger(__name__)
        # SECURITY FIX #2: Initialize audit logger
        self.audit_logger = CredentialDecryptionAuditLogger(self.settings, self.logger)

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
                    ],
                    job_timeout_ms=60000  # 60 seconds for integration ops
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

            # Extract context info for audit logging (SECURITY FIX #2, #12)
            user_id = context.get("user_id")
            request_id = context.get("request_id") or context.get("correlation_id")
            pipeline_id = context.get("pipeline_id")

            # Decrypt credential
            try:
                decrypted_credential = decrypt_value(encrypted_credential)
                self.logger.info(
                    f"Credential decrypted successfully",
                    extra={
                        "org_slug": org_slug,
                        "provider": provider,
                        "credential_id": credential_id,
                        "request_id": request_id,  # SECURITY FIX #12
                    }
                )

                # SECURITY FIX #2: Audit log successful decryption
                await self.audit_logger.log_decryption(
                    org_slug=org_slug,
                    provider=provider,
                    credential_id=credential_id,
                    user_id=user_id,
                    request_id=request_id,
                    pipeline_id=pipeline_id,
                    success=True
                )

            except Exception as e:
                self.logger.error(
                    f"KMS decryption failed: {e}",
                    exc_info=True,
                    extra={"request_id": request_id}  # SECURITY FIX #12
                )

                # SECURITY FIX #2: Audit log failed decryption (sanitized error)
                await self.audit_logger.log_decryption(
                    org_slug=org_slug,
                    provider=provider,
                    credential_id=credential_id,
                    user_id=user_id,
                    request_id=request_id,
                    pipeline_id=pipeline_id,
                    success=False,
                    error_message="KMS decryption failed"  # Don't expose actual error
                )

                return {
                    "status": "FAILED",
                    "error": "Failed to decrypt credential",  # SECURITY FIX #7: Generic error
                    "provider": provider,
                    "credential_id": credential_id
                }

            # Store in context
            # Initialize secrets dict if not present
            if "secrets" not in context:
                context["secrets"] = {}

            # SECURITY FIX #4: Initialize secrets_ttl tracking
            if "secrets_ttl" not in context:
                context["secrets_ttl"] = {}

            # Determine context key - use provider registry if not overridden
            if context_key:
                key = context_key
            else:
                # Get key from provider registry (loaded from providers.yml)
                key = provider_registry.get_context_key(provider)
                if not key:
                    # Fallback if provider not in registry
                    key = f"{provider.lower()}_credential"

            # SECURITY FIX #4: Wrap secret with TTL
            secret_with_ttl = SecretWithTTL(decrypted_credential)
            context["secrets"][key] = decrypted_credential  # Keep raw for backward compat
            context["secrets_ttl"][key] = secret_with_ttl  # Store TTL wrapper

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
                    "credential_id": credential_id,
                    "request_id": request_id,  # SECURITY FIX #12
                    "ttl_seconds": DECRYPTED_SECRET_TTL_SECONDS,  # SECURITY FIX #4
                }
            )

            return {
                "status": "SUCCESS",
                "credential_id": credential_id,
                "provider": provider,
                "validation_status": validation_status,
                "credential_name": row.get("credential_name"),
                "context_key": key,
                "ttl_seconds": DECRYPTED_SECRET_TTL_SECONDS,  # SECURITY FIX #4
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
                    ],
                    job_timeout_ms=60000  # 60 seconds for integration ops
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


def clear_expired_secrets(context: Dict[str, Any]) -> int:
    """
    SECURITY FIX #4: Clear expired secrets from context.

    Should be called after each pipeline step completes.

    Args:
        context: Pipeline execution context

    Returns:
        Number of secrets cleared
    """
    cleared = 0
    secrets_ttl = context.get("secrets_ttl", {})
    secrets = context.get("secrets", {})

    for key, secret_wrapper in list(secrets_ttl.items()):
        if isinstance(secret_wrapper, SecretWithTTL):
            if not secret_wrapper.is_valid():
                # Clear from both locations
                secret_wrapper.clear()
                secrets_ttl.pop(key, None)
                secrets.pop(key, None)
                cleared += 1

    return cleared


def clear_all_secrets(context: Dict[str, Any]) -> int:
    """
    SECURITY FIX #4: Clear ALL secrets from context.

    Should be called at the end of pipeline execution.

    Args:
        context: Pipeline execution context

    Returns:
        Number of secrets cleared
    """
    cleared = 0
    secrets_ttl = context.get("secrets_ttl", {})
    secrets = context.get("secrets", {})

    # Clear all TTL-wrapped secrets
    for key, secret_wrapper in list(secrets_ttl.items()):
        if isinstance(secret_wrapper, SecretWithTTL):
            secret_wrapper.clear()
        secrets_ttl.pop(key, None)
        secrets.pop(key, None)
        cleared += 1

    # Clear any remaining secrets (backward compatibility)
    for key in list(secrets.keys()):
        secrets.pop(key, None)
        cleared += 1

    return cleared
