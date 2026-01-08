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
import time
from datetime import datetime, timedelta
from typing import Dict, Any, Optional, Callable, TypeVar
from google.cloud import bigquery

from src.core.engine.bq_client import BigQueryClient
from src.core.security.kms_encryption import encrypt_value
from src.core.providers import provider_registry, validate_credential, validate_credential_format
from src.app.config import get_settings

T = TypeVar('T')


# SECURITY FIX #6: Default credential expiration (90 days)
DEFAULT_CREDENTIAL_EXPIRATION_DAYS = 90

# Warning threshold before expiration (14 days)
EXPIRATION_WARNING_DAYS = 14

# BUG-018 FIX: Retry configuration for transient KMS failures
DEFAULT_KMS_MAX_RETRIES = 3
DEFAULT_KMS_BACKOFF_SECONDS = 2  # Exponential backoff: 2s, 4s, 8s

# BUG-029 FIX: Centralized timeout configuration for BigQuery operations
DEFAULT_BIGQUERY_TIMEOUT_MS = 120000  # 120 seconds for integration operations

# BUG-028 FIX: Credential rotation grace period to prevent disruption
CREDENTIAL_ROTATION_GRACE_HOURS = 24  # Keep old credential active for 24 hours during rotation


def retry_with_backoff(
    func: Callable[..., T],
    max_retries: int = DEFAULT_KMS_MAX_RETRIES,
    backoff_seconds: float = DEFAULT_KMS_BACKOFF_SECONDS,
    operation_name: str = "operation",
    logger: Optional[logging.Logger] = None
) -> T:
    """
    BUG-018 FIX: Retry a function with exponential backoff for transient failures.

    Args:
        func: Function to retry (should be a lambda or callable with no args)
        max_retries: Maximum number of retry attempts (default: 3)
        backoff_seconds: Initial backoff time in seconds (default: 2)
        operation_name: Name of operation for logging
        logger: Logger instance for logging retry attempts

    Returns:
        Result of the function call

    Raises:
        Last exception if all retries exhausted

    Example:
        >>> encrypted = retry_with_backoff(
        ...     lambda: encrypt_value(credential),
        ...     operation_name="KMS encryption"
        ... )
    """
    log = logger or logging.getLogger(__name__)
    last_exception = None

    for attempt in range(max_retries + 1):  # +1 for initial attempt
        try:
            return func()
        except Exception as e:
            last_exception = e

            # Check if this is a transient error worth retrying
            error_type = type(e).__name__
            is_transient = error_type in {
                "ConnectionError",
                "ConnectionRefusedError",
                "ConnectionResetError",
                "TimeoutError",
                "HTTPError",
                "ServiceUnavailable",
                "TooManyRequests",
                "InternalServerError",
            }

            if not is_transient or attempt >= max_retries:
                # Not transient or exhausted retries
                if attempt > 0:
                    log.error(
                        f"{operation_name} failed after {attempt + 1} attempts",
                        extra={
                            "operation": operation_name,
                            "attempts": attempt + 1,
                            "error_type": error_type,
                            "error": str(e)
                        }
                    )
                raise

            # Calculate exponential backoff
            sleep_time = backoff_seconds * (2 ** attempt)
            log.warning(
                f"{operation_name} failed (attempt {attempt + 1}/{max_retries + 1}), retrying in {sleep_time}s",
                extra={
                    "operation": operation_name,
                    "attempt": attempt + 1,
                    "max_attempts": max_retries + 1,
                    "backoff_seconds": sleep_time,
                    "error_type": error_type,
                    "error": str(e)
                }
            )
            time.sleep(sleep_time)

    # Should never reach here, but just in case
    raise last_exception if last_exception else RuntimeError(f"{operation_name} failed with no exception")


def sanitize_error_message(error: Exception) -> str:
    """
    SECURITY FIX #7: Sanitize exception messages before storing/returning.
    BUG-015 FIX: Keep first level of stack trace, sanitize only sensitive parts.

    Removes potentially sensitive information like:
    - File paths
    - IP addresses
    - API endpoints
    - Stack traces (keeps error type and first line)
    - Internal service names

    Args:
        error: The exception to sanitize

    Returns:
        Sanitized error message
    """
    # BUG-015 FIX: Keep error type and message for debugging
    error_type = type(error).__name__
    message = str(error)

    # Keep first line of error for context
    first_line = message.split('\n')[0] if '\n' in message else message

    # Remove file paths (Unix and Windows)
    first_line = re.sub(r'(/[a-zA-Z0-9_.\-/]+)+', '[PATH]', first_line)
    first_line = re.sub(r'([A-Za-z]:\\[a-zA-Z0-9_.\-\\]+)+', '[PATH]', first_line)

    # Remove IP addresses
    first_line = re.sub(r'\b\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}\b', '[IP]', first_line)

    # Remove URLs
    first_line = re.sub(r'https?://[^\s<>"{}|\\^`\[\]]+', '[URL]', first_line)

    # Remove potential API keys/tokens (long alphanumeric strings)
    first_line = re.sub(r'\b[A-Za-z0-9_-]{32,}\b', '[REDACTED]', first_line)

    # Remove project IDs that look like GCP project IDs
    first_line = re.sub(r'\b[a-z][a-z0-9-]{4,28}[a-z0-9]\b', '[PROJECT]', first_line)

    # Combine error type with sanitized message
    sanitized = f"{error_type}: {first_line}"

    # Truncate to reasonable length
    max_length = 500
    if len(sanitized) > max_length:
        sanitized = sanitized[:max_length] + "... [truncated]"

    return sanitized


def get_generic_error_code(error: Exception) -> str:
    """
    SECURITY FIX #7 + BUG-017 FIX: Map exceptions to generic error codes.

    Returns:
        Generic error code for the exception type
    """
    error_type = type(error).__name__

    # BUG-017 FIX: Expanded error code mapping
    error_codes = {
        # Network errors
        "ConnectionError": "CONN_001",
        "ConnectionRefusedError": "CONN_002",
        "ConnectionResetError": "CONN_003",
        "TimeoutError": "TIMEOUT_001",
        "HTTPError": "HTTP_001",
        # Auth errors
        "AuthenticationError": "AUTH_001",
        "PermissionError": "PERM_001",
        "PermissionDenied": "PERM_002",
        # Data errors
        "ValueError": "INVALID_001",
        "KeyError": "MISSING_001",
        "TypeError": "TYPE_001",
        "JSONDecodeError": "FORMAT_001",
        "UnicodeDecodeError": "FORMAT_002",
        # KMS errors
        "EncryptionError": "ENC_001",
        "DecryptionError": "ENC_002",
        # BigQuery errors
        "BigQueryError": "BQ_001",
        "NotFound": "BQ_002",
        "Conflict": "BQ_003",
        # Rate limiting
        "TooManyRequests": "RATE_001",
        "QuotaExceeded": "RATE_002",
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
                - default_hierarchy_level_1_id through default_hierarchy_level_10_id: Hierarchy entity IDs (optional)
                - default_hierarchy_level_1_name through default_hierarchy_level_10_name: Hierarchy entity names (optional)

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

        # Extract hierarchy fields (10 levels, each with ID and name)
        hierarchy = {}
        for level in range(1, 11):
            level_id = context.get(f"default_hierarchy_level_{level}_id")
            level_name = context.get(f"default_hierarchy_level_{level}_name")
            if level_id:  # Only include if ID provided
                hierarchy[f"level_{level}_id"] = level_id
                hierarchy[f"level_{level}_name"] = level_name or ""

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

        # Step 3: Encrypt credential using KMS with retry logic
        try:
            # BUG-018 FIX: Add retry logic with exponential backoff for transient KMS failures
            encrypted_credential = retry_with_backoff(
                func=lambda: encrypt_value(plaintext_credential),
                max_retries=DEFAULT_KMS_MAX_RETRIES,
                backoff_seconds=DEFAULT_KMS_BACKOFF_SECONDS,
                operation_name=f"KMS encryption for {org_slug}/{provider}",
                logger=self.logger
            )

            # BUG-010 FIX: Verify encryption result is valid before proceeding
            if not encrypted_credential:
                self.logger.error(f"KMS encryption returned empty result for {org_slug}/{provider}")
                return {
                    "status": "FAILED",
                    "error": "Encryption failed to produce valid result. Please try again or contact support.",
                    "error_code": "ENC_001",
                    "provider": provider
                }

            # Verify encrypted value is different from plaintext (sanity check)
            if isinstance(encrypted_credential, bytes):
                if encrypted_credential == plaintext_credential.encode('utf-8'):
                    self.logger.error(f"KMS encryption returned plaintext for {org_slug}/{provider}")
                    return {
                        "status": "FAILED",
                        "error": "Encryption validation failed. Please contact support.",
                        "error_code": "ENC_002",
                        "provider": provider
                    }

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
            # BUG-028 FIX: Mark existing credential for deactivation with grace period
            # Instead of immediate deactivation, set deactivation_date to allow grace period
            # This prevents disruption during credential rotation
            deactivation_date = datetime.utcnow() + timedelta(hours=CREDENTIAL_ROTATION_GRACE_HOURS)

            deactivate_query = f"""
            UPDATE `{self.settings.gcp_project_id}.organizations.org_integration_credentials`
            SET
                deactivation_scheduled_at = @deactivation_date,
                updated_at = CURRENT_TIMESTAMP()
            WHERE org_slug = @org_slug AND provider = @provider AND is_active = TRUE
            """
            bq_client.client.query(
                deactivate_query,
                job_config=bigquery.QueryJobConfig(
                    query_parameters=[
                        bigquery.ScalarQueryParameter("org_slug", "STRING", org_slug),
                        bigquery.ScalarQueryParameter("provider", "STRING", provider),
                        bigquery.ScalarQueryParameter("deactivation_date", "TIMESTAMP", deactivation_date),
                    ],
                    job_timeout_ms=DEFAULT_BIGQUERY_TIMEOUT_MS  # BUG-029 FIX: Use centralized timeout
                )
            ).result()

            self.logger.info(
                f"Scheduled deactivation for existing {provider} credential",
                extra={
                    "org_slug": org_slug,
                    "provider": provider,
                    "deactivation_date": deactivation_date.isoformat(),
                    "grace_hours": CREDENTIAL_ROTATION_GRACE_HOURS
                }
            )
        except Exception as e:
            self.logger.warning(f"Failed to schedule deactivation for existing credential: {e}")
            # Continue - not critical, old credential will remain active

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
             metadata,
             default_hierarchy_level_1_id, default_hierarchy_level_1_name,
             default_hierarchy_level_2_id, default_hierarchy_level_2_name,
             default_hierarchy_level_3_id, default_hierarchy_level_3_name,
             default_hierarchy_level_4_id, default_hierarchy_level_4_name,
             default_hierarchy_level_5_id, default_hierarchy_level_5_name,
             default_hierarchy_level_6_id, default_hierarchy_level_6_name,
             default_hierarchy_level_7_id, default_hierarchy_level_7_name,
             default_hierarchy_level_8_id, default_hierarchy_level_8_name,
             default_hierarchy_level_9_id, default_hierarchy_level_9_name,
             default_hierarchy_level_10_id, default_hierarchy_level_10_name,
             is_active, created_by_user_id, created_at, updated_at, expires_at)
            VALUES
            (@credential_id, @org_slug, @provider, @credential_name, @encrypted_credential,
             @credential_type, @validation_status, @last_validated_at, @last_error,
             PARSE_JSON(@metadata),
             @level_1_id, @level_1_name,
             @level_2_id, @level_2_name,
             @level_3_id, @level_3_name,
             @level_4_id, @level_4_name,
             @level_5_id, @level_5_name,
             @level_6_id, @level_6_name,
             @level_7_id, @level_7_name,
             @level_8_id, @level_8_name,
             @level_9_id, @level_9_name,
             @level_10_id, @level_10_name,
             TRUE, @user_id, CURRENT_TIMESTAMP(), CURRENT_TIMESTAMP(), @expires_at)
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
                    # Hierarchy level parameters (10 levels, each with ID and name)
                    bigquery.ScalarQueryParameter("level_1_id", "STRING", hierarchy.get("level_1_id")),
                    bigquery.ScalarQueryParameter("level_1_name", "STRING", hierarchy.get("level_1_name")),
                    bigquery.ScalarQueryParameter("level_2_id", "STRING", hierarchy.get("level_2_id")),
                    bigquery.ScalarQueryParameter("level_2_name", "STRING", hierarchy.get("level_2_name")),
                    bigquery.ScalarQueryParameter("level_3_id", "STRING", hierarchy.get("level_3_id")),
                    bigquery.ScalarQueryParameter("level_3_name", "STRING", hierarchy.get("level_3_name")),
                    bigquery.ScalarQueryParameter("level_4_id", "STRING", hierarchy.get("level_4_id")),
                    bigquery.ScalarQueryParameter("level_4_name", "STRING", hierarchy.get("level_4_name")),
                    bigquery.ScalarQueryParameter("level_5_id", "STRING", hierarchy.get("level_5_id")),
                    bigquery.ScalarQueryParameter("level_5_name", "STRING", hierarchy.get("level_5_name")),
                    bigquery.ScalarQueryParameter("level_6_id", "STRING", hierarchy.get("level_6_id")),
                    bigquery.ScalarQueryParameter("level_6_name", "STRING", hierarchy.get("level_6_name")),
                    bigquery.ScalarQueryParameter("level_7_id", "STRING", hierarchy.get("level_7_id")),
                    bigquery.ScalarQueryParameter("level_7_name", "STRING", hierarchy.get("level_7_name")),
                    bigquery.ScalarQueryParameter("level_8_id", "STRING", hierarchy.get("level_8_id")),
                    bigquery.ScalarQueryParameter("level_8_name", "STRING", hierarchy.get("level_8_name")),
                    bigquery.ScalarQueryParameter("level_9_id", "STRING", hierarchy.get("level_9_id")),
                    bigquery.ScalarQueryParameter("level_9_name", "STRING", hierarchy.get("level_9_name")),
                    bigquery.ScalarQueryParameter("level_10_id", "STRING", hierarchy.get("level_10_id")),
                    bigquery.ScalarQueryParameter("level_10_name", "STRING", hierarchy.get("level_10_name")),
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

            # BUG-030 FIX: Rollback deactivation if insert fails
            # If we scheduled deactivation but failed to insert new credential,
            # reactivate the old credential to prevent service disruption
            try:
                rollback_query = f"""
                UPDATE `{self.settings.gcp_project_id}.organizations.org_integration_credentials`
                SET
                    deactivation_scheduled_at = NULL,
                    updated_at = CURRENT_TIMESTAMP()
                WHERE org_slug = @org_slug
                    AND provider = @provider
                    AND is_active = TRUE
                    AND deactivation_scheduled_at IS NOT NULL
                """
                bq_client.client.query(
                    rollback_query,
                    job_config=bigquery.QueryJobConfig(
                        query_parameters=[
                            bigquery.ScalarQueryParameter("org_slug", "STRING", org_slug),
                            bigquery.ScalarQueryParameter("provider", "STRING", provider),
                        ],
                        job_timeout_ms=DEFAULT_BIGQUERY_TIMEOUT_MS
                    )
                ).result()

                self.logger.info(
                    f"Rolled back deactivation due to insert failure for {org_slug}/{provider}",
                    extra={"org_slug": org_slug, "provider": provider}
                )
            except Exception as rollback_error:
                self.logger.error(
                    f"CRITICAL: Failed to rollback deactivation after insert failure: {rollback_error}",
                    extra={
                        "org_slug": org_slug,
                        "provider": provider,
                        "original_error": str(e),
                        "rollback_error": str(rollback_error)
                    }
                )

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
