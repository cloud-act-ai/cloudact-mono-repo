"""
Enterprise Configuration Management
Centralized settings using Pydantic Settings with environment variable support.

ENVIRONMENT VARIABLES REFERENCE (#52)
=====================================

All settings can be configured via environment variables (uppercase, underscore-separated).
Example: `api_host` -> `API_HOST`

REQUIRED IN PRODUCTION:
-----------------------
CA_ROOT_API_KEY         - Platform admin API key (min 32 chars). Used for bootstrap and org management.
API_KEY_SECRET_KEY      - Secret key for API key signing.
DISABLE_AUTH            - Must be "false" in production.
RATE_LIMIT_ENABLED      - Must be "true" in production.

GCP CONFIGURATION:
------------------
GCP_PROJECT_ID          - Google Cloud Project ID (default: "local-dev-project")
BIGQUERY_LOCATION       - BigQuery dataset location (default: "US")
GOOGLE_APPLICATION_CREDENTIALS - Path to GCP service account JSON file

APPLICATION SETTINGS:
--------------------
ENVIRONMENT             - Runtime environment: development|staging|production (default: "development")
DEBUG                   - Enable debug mode (default: false)
EXPOSE_ERROR_DETAILS    - Expose detailed errors in responses (default: false, MUST be false in prod)
LOG_LEVEL               - Logging level: DEBUG|INFO|WARNING|ERROR|CRITICAL (default: "INFO")

API CONFIGURATION:
-----------------
API_HOST                - API bind host (default: "0.0.0.0")
API_PORT                - API bind port (default: 8000)
API_WORKERS             - Number of uvicorn workers (default: 4)
ENABLE_API_DOCS         - Enable /docs and /redoc endpoints (default: true)
CORS_ORIGINS            - Allowed CORS origins as JSON array (default: ["http://localhost:3000"])

RATE LIMITING:
--------------
RATE_LIMIT_ENABLED                  - Enable rate limiting (default: true)
RATE_LIMIT_REQUESTS_PER_MINUTE      - Per-org requests/minute (default: 100)
RATE_LIMIT_REQUESTS_PER_HOUR        - Per-org requests/hour (default: 1000)
RATE_LIMIT_GLOBAL_REQUESTS_PER_MINUTE - Global requests/minute (default: 10000)
RATE_LIMIT_ADMIN_ORGS_PER_MINUTE    - Admin org creation rate limit (default: 10)

MAINTENANCE MODE (#44):
----------------------
MAINTENANCE_MODE        - Enable maintenance mode, returns 503 (default: false)
MAINTENANCE_MESSAGE     - Custom message during maintenance

KMS ENCRYPTION:
--------------
KMS_KEY_NAME            - Full GCP KMS key resource name (optional)
KMS_PROJECT_ID          - GCP project for KMS (if KMS_KEY_NAME not set)
KMS_LOCATION            - KMS location (default: "us-central1")
KMS_KEYRING             - KMS keyring name (default: "cloudact-keyring")
KMS_KEY                 - KMS key name (default: "cloudact-encryption-key")

API KEY CONFIGURATION (#54):
---------------------------
API_KEY_DEFAULT_SCOPES  - Default scopes for new API keys as JSON array
                          (default: ["pipelines:read", "pipelines:write", "pipelines:execute"])

CREDENTIAL LIMITS (#50):
-----------------------
MAX_CREDENTIAL_SIZE_BYTES - Max size for credential uploads (default: 100000, range: 10000-1000000)

PROVIDER CONFIGURATION:
----------------------
OPENAI_API_BASE_URL     - OpenAI API base URL (default: "https://api.openai.com/v1")
ANTHROPIC_API_BASE_URL  - Anthropic API base URL (default: "https://api.anthropic.com/v1")
PROVIDER_TIMEOUT_OPENAI - HTTP timeout for OpenAI calls (default: 30.0s)
PROVIDER_TIMEOUT_ANTHROPIC - HTTP timeout for Anthropic calls (default: 30.0s)
PROVIDER_TIMEOUT_GCP    - HTTP timeout for GCP calls (default: 60.0s)

OBSERVABILITY:
-------------
ENABLE_TRACING          - Enable distributed tracing (default: true)
ENABLE_METRICS          - Enable Prometheus metrics (default: true)
OTEL_SERVICE_NAME       - OpenTelemetry service name (default: "api-service")
OTEL_EXPORTER_OTLP_ENDPOINT - OTLP exporter endpoint (optional)

For complete documentation, see each Field's description attribute below.
"""

import os
import yaml
import re
from typing import List, Optional, Dict, Any
from functools import lru_cache
from pathlib import Path
from pydantic import Field, field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


# Module-level cache for dataset types configuration
_DATASET_TYPES_CACHE: Optional[List[Dict[str, Any]]] = None


class Settings(BaseSettings):
    """
    Application-wide settings loaded from environment variables.
    Supports .env file loading in development.
    """

    model_config = SettingsConfigDict(
        env_file=(".env", ".env.local"),
        env_file_encoding="utf-8",
        case_sensitive=False,
        extra="ignore"
    )

    # ============================================
    # GCP Configuration
    # ============================================
    gcp_project_id: str = Field(default="local-dev-project", description="Google Cloud Project ID - set via GCP_PROJECT_ID env var")
    bigquery_location: str = Field(default="US", description="BigQuery dataset location")
    google_application_credentials: Optional[str] = Field(
        default=None,
        description="Path to GCP service account JSON"
    )

    # ============================================
    # Application Settings
    # ============================================
    app_name: str = Field(
        default="api-service",
        description="Application name"
    )
    app_version: str = Field(
        default="1.0.0",
        description="Application version"
    )
    release_version: str = Field(
        default="v1.0.3",
        description="Git release tag version (e.g., v1.0.0)"
    )
    release_timestamp: str = Field(
        default="2025-12-30T06:15:00Z",
        description="Release build timestamp in ISO 8601 format"
    )
    environment: str = Field(
        default="development",
        pattern="^(development|staging|production)$",
        description="Runtime environment"
    )
    debug: bool = Field(
        default=False,
        description="Enable debug mode"
    )
    expose_error_details: bool = Field(
        default=False,
        description="Expose detailed error messages in API responses (#53). Should be False in production."
    )
    log_level: str = Field(
        default="INFO",
        pattern="^(DEBUG|INFO|WARNING|ERROR|CRITICAL)$",
        description="Logging level"
    )

    # ============================================
    # API Configuration
    # ============================================
    api_host: str = Field(default="0.0.0.0")
    api_port: int = Field(default=8000, ge=1024, le=65535, description="Default port for api-service")
    api_workers: int = Field(default=4, ge=1, le=16)
    api_reload: bool = Field(default=False)
    enable_api_docs: bool = Field(
        default=True,
        description="Enable OpenAPI documentation (/docs and /redoc endpoints)"
    )

    # CORS settings
    # SECURITY: credentials=true with wildcard origin is blocked by browsers (CWE-942)
    cors_origins: List[str] = Field(
        default=["http://localhost:3000"],
        description="Allowed CORS origins. Add production domains via CORS_ORIGINS env var. Wildcard '*' is NOT allowed when credentials=true."
    )
    cors_allow_credentials: bool = Field(default=True)
    cors_allow_methods: List[str] = Field(
        default=["GET", "POST", "PUT", "DELETE", "OPTIONS", "PATCH"],
        description="Allowed HTTP methods for CORS. Explicit list is safer than wildcard."
    )
    cors_allow_headers: List[str] = Field(
        default=["Content-Type", "Authorization", "X-API-Key", "X-CA-Root-Key", "X-User-ID", "X-Request-ID"],
        description="Allowed HTTP headers for CORS. Explicit list is safer than wildcard."
    )

    @field_validator('cors_origins')
    @classmethod
    def validate_cors_no_wildcard_with_credentials(cls, v: List[str]) -> List[str]:
        """
        Validate CORS origins - wildcard '*' is insecure with credentials.

        SECURITY: Browsers block 'Access-Control-Allow-Credentials: true'
        when 'Access-Control-Allow-Origin: *' (CWE-942: Overly Permissive CORS).
        """
        if '*' in v and len(v) == 1:
            raise ValueError(
                "CORS wildcard '*' is not allowed when cors_allow_credentials=true. "
                "Specify explicit origins instead (e.g., ['https://app.cloudact.io'])"
            )
        return v

    # ============================================
    # Security Configuration
    # ============================================
    # SECURITY NOTE: These settings are validated at startup in production.
    # See src/app/main.py:validate_production_config() for validation rules.
    # See SECURITY.md for full security documentation.
    #
    # CRITICAL: In production:
    #   - disable_auth MUST be false (startup fails otherwise)
    #   - ca_root_api_key MUST be set (startup fails otherwise)
    #   - rate_limit_enabled MUST be true (startup fails otherwise)
    # ============================================
    disable_auth: bool = Field(
        default=False,
        description="Disable API key authentication (for development). MUST be false in production!"
    )
    default_org_slug: str = Field(
        default="dev_org_local",
        description="Default organization slug when authentication is disabled (used only in development mode)"
    )
    api_key_hash_algorithm: str = Field(
        default="SHA256",
        description="Hash algorithm for API key storage (SHA256, not JWT HS256)"
    )
    api_key_secret_key: Optional[str] = Field(
        default=None,
        description="Secret key for API key signing. REQUIRED in production - set via API_KEY_SECRET_KEY env var"
    )
    ca_root_api_key: Optional[str] = Field(
        default=None,
        description="CloudAct Root API key for platform-level operations (organization creation, etc). REQUIRED in production!"
    )
    secrets_base_path: str = Field(
        default="~/.cloudact-secrets",
        description="Base path for organization secrets directory"
    )

    def validate_production_security(self) -> None:
        """
        Validate required security settings in production environment.

        Raises:
            ValueError: If required security settings are not configured
        """
        if not self.is_production:
            return

        errors = []

        if self.disable_auth:
            errors.append("disable_auth must be False in production")

        if not self.ca_root_api_key or len(self.ca_root_api_key) < 32:
            errors.append("ca_root_api_key must be set and at least 32 characters in production")

        if not self.rate_limit_enabled:
            errors.append("rate_limit_enabled must be True in production")

        if not self.api_key_secret_key:
            errors.append("api_key_secret_key must be set in production")

        if errors:
            raise ValueError(
                "Production security validation failed:\n" + "\n".join(f"  - {err}" for err in errors)
            )

    # ============================================
    # KMS Encryption Configuration
    # ============================================
    kms_key_name: Optional[str] = Field(
        default=None,
        description="Full GCP KMS key resource name (projects/{project}/locations/{location}/keyRings/{keyring}/cryptoKeys/{key})"
    )
    kms_project_id: Optional[str] = Field(
        default=None,
        description="GCP project ID for KMS (used if kms_key_name not provided)"
    )
    kms_location: str = Field(
        default="us-central1",
        description="GCP KMS location (used if kms_key_name not provided)"
    )
    kms_keyring: str = Field(
        default="cloudact-keyring",
        description="GCP KMS keyring name (used if kms_key_name not provided)"
    )
    kms_key: str = Field(
        default="cloudact-encryption-key",
        description="GCP KMS key name (used if kms_key_name not provided)"
    )

    # ============================================
    # Rate Limiting
    # ============================================
    rate_limit_requests_per_minute: int = Field(
        default=100,
        ge=1,
        description="Per-organization requests per minute limit"
    )
    rate_limit_requests_per_hour: int = Field(
        default=1000,
        ge=1,
        description="Per-organization requests per hour limit"
    )
    rate_limit_global_requests_per_minute: int = Field(
        default=10000,
        ge=1,
        description="Global requests per minute limit (all organizations combined)"
    )
    rate_limit_global_requests_per_hour: int = Field(
        default=100000,
        ge=1,
        description="Global requests per hour limit (all organizations combined)"
    )
    rate_limit_enabled: bool = Field(
        default=True,
        description="Enable rate limiting globally"
    )
    rate_limit_admin_orgs_per_minute: int = Field(
        default=10,
        ge=1,
        description="Rate limit for expensive /admin/organizations endpoint (per-org per minute)"
    )
    rate_limit_pipeline_run_per_minute: int = Field(
        default=50,
        ge=1,
        description="Rate limit for expensive /pipelines/run/* endpoints (per-org per minute)"
    )
    rate_limit_pipeline_concurrency: int = Field(default=5, ge=1, le=50)
    # Global (platform-wide) pipeline concurrency limit for scalability
    pipeline_global_concurrent_limit: int = Field(
        default=100,
        ge=10,
        le=1000,
        description="Maximum concurrent pipelines across ALL organizations (prevents resource exhaustion)"
    )

    # ============================================
    # Pipeline Service Configuration
    # ============================================
    pipeline_service_url: str = Field(
        default="http://localhost:8001",
        description="URL of the pipeline service for proxying pipeline triggers. In production, set to internal service URL."
    )

    # ============================================
    # Maintenance Mode (#44)
    # ============================================
    maintenance_mode: bool = Field(
        default=False,
        description="Enable maintenance mode - blocks all API requests with 503"
    )
    maintenance_message: str = Field(
        default="Service is under maintenance. Please try again later.",
        description="Message returned during maintenance mode"
    )

    # ============================================
    # Egress Control - External API Domain Allowlist
    # ============================================
    # SECURITY: Only these domains can be contacted for credential validation
    # Prevents SSRF attacks and credential exfiltration to rogue servers
    allowed_external_domains: list = Field(
        default=[
            "api.openai.com",
            "api.anthropic.com",
            "generativelanguage.googleapis.com",
            "bigquery.googleapis.com",
            "cloudresourcemanager.googleapis.com",
            "iam.googleapis.com",
            "storage.googleapis.com",
        ],
        description="Allowed external domains for API credential validation. Wildcard subdomains supported with *."
    )
    # Block these domains even if they match allowed patterns (defense-in-depth)
    blocked_external_domains: list = Field(
        default=[
            "metadata.google.internal",  # GCP metadata service - SSRF target
            "169.254.169.254",           # AWS/GCP metadata IP - SSRF target
            "localhost",
            "127.0.0.1",
            "0.0.0.0",
        ],
        description="Blocked domains that override allowed list (SSRF protection)"
    )

    # ============================================
    # API Key Scopes (#54)
    # ============================================
    api_key_default_scopes: list = Field(
        default=["pipelines:read", "pipelines:write", "pipelines:execute"],
        description="Default scopes assigned to new API keys"
    )

    # ============================================
    # Credential Limits (#50)
    # ============================================
    max_credential_size_bytes: int = Field(
        default=100000,  # 100KB - larger than 50KB to accommodate complex SA JSONs
        ge=10000,
        le=1000000,
        description="Maximum size for credential uploads (GCP SA JSON, API keys)"
    )

    # ============================================
    # Observability
    # ============================================
    enable_tracing: bool = Field(default=True)
    enable_metrics: bool = Field(default=True)
    otel_service_name: str = Field(default="api-service")
    otel_exporter_otlp_endpoint: Optional[str] = Field(default=None)

    # ============================================
    # BigQuery Configuration
    # ============================================
    bq_max_results_per_page: int = Field(default=10000, ge=100, le=100000)
    bq_query_timeout_seconds: int = Field(default=300, ge=10)
    bq_max_retry_attempts: int = Field(default=3, ge=1, le=10)

    # ============================================
    # Polars Configuration
    # ============================================
    polars_max_threads: int = Field(default=8, ge=1, le=64)
    polars_streaming_chunk_size: int = Field(default=100000, ge=1000)

    # ============================================
    # Data Quality
    # ============================================
    dq_fail_on_error: bool = Field(default=False)
    dq_store_results_in_bq: bool = Field(default=True)

    # ============================================
    # Metadata Logging Configuration
    # ============================================
    metadata_log_batch_size: int = Field(default=100, ge=1, le=10000)
    metadata_log_flush_interval_seconds: int = Field(default=5, ge=1, le=60)
    metadata_log_max_retries: int = Field(default=3, ge=1, le=10)
    metadata_log_workers: int = Field(
        default=5,
        ge=1,
        le=20,
        description="Number of background workers for concurrent log flushing"
    )
    metadata_log_queue_size: int = Field(
        default=1000,
        ge=100,
        le=10000,
        description="Maximum queue size for buffered logs (backpressure when full)"
    )

    # ============================================
    # Pipeline Parallel Processing
    # ============================================
    pipeline_max_parallel_steps: int = Field(
        default=10,
        ge=1,
        le=100,
        description="Maximum number of steps to execute in parallel per level"
    )
    pipeline_partition_batch_size: int = Field(
        default=10,
        ge=1,
        le=100,
        description="Number of partitions to process in parallel"
    )

    # ============================================
    # Notification Configuration
    # ============================================
    notifications_enabled: bool = Field(
        default=False,
        description="Enable notification system (Email, Slack)"
    )
    notifications_config_path: str = Field(
        default="./configs/notifications",
        description="Path to notification configurations"
    )

    # Email notification defaults (root fallback)
    email_notifications_enabled: bool = Field(
        default=False,
        description="Enable email notifications (root configuration)"
    )
    email_smtp_host: Optional[str] = Field(
        default=None,
        description="SMTP server hostname (root configuration)"
    )
    email_smtp_port: int = Field(
        default=587,
        ge=25,
        le=65535,
        description="SMTP server port (root configuration)"
    )
    email_smtp_username: Optional[str] = Field(
        default=None,
        description="SMTP username (root configuration)"
    )
    email_smtp_password: Optional[str] = Field(
        default=None,
        description=(
            "SMTP password (root configuration). "
            "SECURITY WARNING: In production, use Secret Manager reference instead of plaintext. "
            "Format: 'secretmanager://projects/{project}/secrets/{name}/versions/latest' "
            "or use SMTP_PASSWORD_SECRET_NAME env var pointing to Secret Manager secret."
        )
    )
    email_from_address: Optional[str] = Field(
        default=None,
        description="Email sender address (root configuration)"
    )
    email_to_addresses: Optional[List[str]] = Field(
        default=None,
        description="List of recipient email addresses (root configuration)"
    )

    # Slack notification defaults (root fallback)
    slack_notifications_enabled: bool = Field(
        default=False,
        description="Enable Slack notifications (root configuration)"
    )
    slack_webhook_url: Optional[str] = Field(
        default=None,
        description="Slack webhook URL (root configuration)"
    )
    slack_channel: Optional[str] = Field(
        default=None,
        description="Slack channel override (root configuration)"
    )


    # ============================================
    # Central Dataset and Table Configuration
    # ============================================
    central_metadata_dataset: str = Field(
        default="organizations",
        description="Name of central dataset for organization management tables"
    )

    # ============================================
    # Subscription and Plan Configuration
    # ============================================
    valid_subscription_plans: List[str] = Field(
        default=["STARTER", "PROFESSIONAL", "SCALE"],
        description="Valid subscription plan names"
    )
    default_subscription_plan: str = Field(
        default="STARTER",
        description="Default subscription plan for new organizations"
    )
    active_subscription_statuses: List[str] = Field(
        default=["ACTIVE", "TRIAL"],
        description="Subscription statuses that allow pipeline execution"
    )

    # ============================================
    # Default Quota Limits
    # ============================================
    default_daily_pipeline_limit: int = Field(
        default=50,
        ge=1,
        description="Default daily pipeline run limit for new organizations"
    )
    default_monthly_pipeline_limit: int = Field(
        default=1000,
        ge=1,
        description="Default monthly pipeline run limit for new organizations"
    )
    default_concurrent_pipeline_limit: int = Field(
        default=5,
        ge=1,
        description="Default concurrent pipeline limit for new organizations"
    )
    # Fallback limits when subscription not found (STARTER defaults)
    fallback_daily_limit: int = Field(default=6, description="Fallback daily limit if subscription not found")
    fallback_monthly_limit: int = Field(default=180, description="Fallback monthly limit if subscription not found")
    fallback_concurrent_limit: int = Field(default=6, description="Fallback concurrent limit if subscription not found")

    # ============================================
    # API Key Configuration
    # ============================================
    default_api_key_scopes: List[str] = Field(
        default=["pipelines:read", "pipelines:write", "pipelines:execute"],
        description="Default scopes assigned to new organization API keys"
    )

    # ============================================
    # Provider Configuration
    # ============================================
    valid_providers: List[str] = Field(
        default=["OPENAI", "ANTHROPIC", "CLAUDE", "GCP_SA"],
        description="Valid integration provider names (includes CLAUDE alias for ANTHROPIC)"
    )
    llm_providers: List[str] = Field(
        default=["OPENAI", "ANTHROPIC", "CLAUDE"],
        description="LLM providers (subset of valid_providers)"
    )
    provider_credential_names: Dict[str, str] = Field(
        default={
            "OPENAI": "OpenAI API Key",
            "ANTHROPIC": "Anthropic API Key",
            "CLAUDE": "Claude API Key",
            "GCP_SA": "GCP Service Account"
        },
        description="Display names for provider credentials"
    )
    # Provider-specific timeout configuration (seconds)
    provider_timeout_openai: float = Field(default=30.0, description="HTTP timeout for OpenAI API calls")
    provider_timeout_anthropic: float = Field(default=30.0, description="HTTP timeout for Anthropic API calls")
    provider_timeout_claude: float = Field(default=30.0, description="HTTP timeout for Claude/Anthropic API calls (alias)")
    provider_timeout_gcp: float = Field(default=60.0, description="HTTP timeout for GCP API calls (higher for BigQuery)")
    provider_credential_types: Dict[str, str] = Field(
        default={
            "OPENAI": "API_KEY",
            "CLAUDE": "API_KEY",
            "ANTHROPIC": "API_KEY",
            "GCP_SA": "SERVICE_ACCOUNT_JSON"
        },
        description="Credential type for each provider"
    )
    provider_context_keys: Dict[str, str] = Field(
        default={
            "OPENAI": "openai_api_key",
            "CLAUDE": "claude_api_key",
            "ANTHROPIC": "anthropic_api_key",
            "GCP_SA": "gcp_sa_json"
        },
        description="Context key names for decrypted credentials"
    )

    # ============================================
    # Integration Status Configuration
    # ============================================
    valid_integration_statuses: List[str] = Field(
        default=["VALID", "INVALID", "PENDING", "NOT_CONFIGURED"],
        description="Valid integration validation statuses"
    )

    # ============================================
    # HTTP Timeout Configuration
    # ============================================
    http_timeout_default: float = Field(default=30.0, description="Default HTTP timeout in seconds")
    http_timeout_validation: float = Field(default=15.0, description="HTTP timeout for validation requests")
    http_timeout_kms: float = Field(default=10.0, description="HTTP timeout for KMS operations")

    # ============================================
    # BigQuery Auth Timeout Configuration
    # ============================================
    bq_auth_timeout_ms: int = Field(
        default=10000,
        ge=1000,
        le=60000,
        description="BigQuery job timeout for authentication operations in milliseconds"
    )

    # ============================================
    # Provider API URLs (can be overridden for testing)
    # ============================================
    openai_api_base_url: str = Field(default="https://api.openai.com/v1", description="OpenAI API base URL")
    anthropic_api_base_url: str = Field(default="https://api.anthropic.com/v1", description="Anthropic API base URL")
    anthropic_api_version: str = Field(default="2023-06-01", description="Anthropic API version header")
    anthropic_validation_model: str = Field(default="claude-3-haiku-20240307", description="Model for Anthropic validation")

    # ============================================
    # File Paths
    # ============================================
    configs_base_path: str = Field(default="./configs")
    system_configs_path: str = Field(default="./configs/system")
    dataset_types_config: str = Field(default="./configs/system/dataset_types.yml")
    metadata_schemas_path: str = Field(
        default="configs/setup/organizations/onboarding/schemas",
        description="Path to metadata table schema definitions"
    )


    @property
    def is_production(self) -> bool:
        """Check if running in production environment."""
        return self.environment == "production"

    @property
    def is_development(self) -> bool:
        """Check if running in development environment."""
        return self.environment == "development"

    def check_smtp_password_security(self) -> None:
        """
        SECURITY FIX #8: Check if SMTP password is configured securely.

        In production, SMTP passwords should use Secret Manager reference.
        Logs a warning if plaintext password is detected.
        """
        if self.email_smtp_password and self.is_production:
            # Check if it's a Secret Manager reference
            if not self.email_smtp_password.startswith("secretmanager://"):
                import warnings
                warnings.warn(
                    "SECURITY WARNING: SMTP password is configured as plaintext in production. "
                    "Use Secret Manager reference instead: "
                    "'secretmanager://projects/{project}/secrets/{name}/versions/latest' "
                    "or set SMTP_PASSWORD_SECRET_NAME environment variable.",
                    SecurityWarning
                )

    def get_org_config_path(self, org_slug: str) -> str:
        """Get the base configuration path for an organization."""
        return os.path.join(self.configs_base_path, org_slug)

    def get_org_secrets_path(self, org_slug: str) -> str:
        """Get the secrets directory path for an organization."""
        return os.path.join(self.get_org_config_path(org_slug), "secrets")

    def get_org_schemas_path(self, org_slug: str) -> str:
        """Get the schemas directory path for an organization."""
        return os.path.join(self.get_org_config_path(org_slug), "schemas")

    def get_org_sources_path(self, org_slug: str) -> str:
        """Get the sources directory path for an organization."""
        return os.path.join(self.get_org_config_path(org_slug), "sources")

    def get_org_pipelines_path(self, org_slug: str) -> str:
        """Get the pipelines directory path for an organization."""
        return os.path.join(self.get_org_config_path(org_slug), "pipelines")

    def _validate_safe_identifier(self, value: str, param_name: str) -> None:
        """
        Validate that an identifier is safe and cannot be used for path traversal.

        SECURITY: Rejects path separators, parent directory references, and special chars.
        Only allows alphanumeric characters, underscores, and hyphens.

        Args:
            value: The identifier to validate (pipeline_id, provider, domain, org_slug)
            param_name: Name of parameter for error messages

        Raises:
            ValueError: If identifier contains invalid characters or path traversal patterns
        """
        if not value:
            raise ValueError(f"{param_name} cannot be empty")

        # CRITICAL: Only allow safe characters - alphanumeric, underscore, hyphen
        # This prevents: ../, ..\, /, \, etc.
        safe_pattern = r'^[a-zA-Z0-9_-]+$'
        if not re.match(safe_pattern, value):
            raise ValueError(
                f"{param_name} contains invalid characters. "
                f"Must match pattern {safe_pattern}, got: {value}"
            )

    def find_pipeline_path(self, org_slug: str, pipeline_id: str) -> str:
        """
        Find pipeline file recursively in organization config directory with path traversal protection.

        Searches for pipeline in new cloud-provider/domain structure:
        1. First tries: configs/{org_slug}/{provider}/{domain}/{pipeline_id}.yml
        2. Falls back to shared templates: configs/{provider}/{domain}/{pipeline_id}.yml

        Args:
            org_slug: The organization identifier
            pipeline_id: The pipeline identifier (filename without .yml)

        Returns:
            Absolute path to pipeline YAML file

        Raises:
            FileNotFoundError: If pipeline file not found
            ValueError: If path traversal detected or multiple pipelines found
        """
        # SECURITY: Validate inputs to prevent path traversal attacks (CWE-22: Improper Limitation of Pathname)
        self._validate_safe_identifier(org_slug, "org_slug")
        self._validate_safe_identifier(pipeline_id, "pipeline_id")

        # Resolve base paths to absolute paths for comparison
        configs_base_abs = Path(self.configs_base_path).resolve()
        org_base_path = Path(self.get_org_config_path(org_slug)).resolve()

        # Verify org path is within configs directory (prevent escape)
        try:
            org_base_path.relative_to(configs_base_abs)
        except ValueError:
            raise ValueError(
                f"Organization path {org_base_path} escapes base configs directory {configs_base_abs}"
            )

        # First try organization-specific config
        matches = list(org_base_path.glob(f"**/{pipeline_id}.yml"))

        # SECURITY: Verify all matched paths are within org directory
        safe_matches = []
        for match in matches:
            try:
                match.relative_to(org_base_path)
                safe_matches.append(match)
            except ValueError:
                # Path escaped org directory - reject it
                continue
        matches = safe_matches

        # If not found in org directory, try shared templates
        if not matches:
            shared_base_path = configs_base_abs
            all_matches = list(shared_base_path.glob(f"**/{pipeline_id}.yml"))

            # SECURITY: Verify all matched paths are within configs directory
            safe_shared_matches = []
            for match in all_matches:
                try:
                    match.relative_to(configs_base_abs)
                    safe_shared_matches.append(match)
                except ValueError:
                    # Path escaped configs directory - reject it
                    continue

            # Filter out org-specific paths from shared search
            matches = [m for m in safe_shared_matches if not str(m).startswith(str(org_base_path))]

        if not matches:
            raise FileNotFoundError(
                f"Pipeline '{pipeline_id}' not found for organization '{org_slug}' in {org_base_path} or shared configs"
            )

        if len(matches) > 1:
            match_paths = [str(m) for m in matches]
            raise ValueError(
                f"Multiple pipelines found with ID '{pipeline_id}': {match_paths}"
            )

        return str(matches[0])

    def get_environment_suffix(self) -> str:
        """
        Get standardized environment suffix for dataset naming.

        Maps environment values to short suffixes:
        - development -> local
        - staging -> stage
        - production -> prod

        Returns:
            Environment suffix (local, stage, or prod)
        """
        env_map = {
            "development": "local",
            "staging": "stage",
            "production": "prod"
        }
        return env_map.get(self.environment, "local")

    def get_org_dataset_name(self, org_slug: str, dataset_type: str = None) -> str:
        """
        Generate organization-specific dataset name with environment suffix.

        New standard: All organization datasets are named {org_slug}_{environment}
        to enable multi-environment deployments in the same GCP project.

        Args:
            org_slug: The organization identifier
            dataset_type: DEPRECATED - kept for backward compatibility, ignored

        Returns:
            Dataset name: {org_slug}_{environment}
            Examples:
                - acme_corp_local (development)
                - acme_corp_stage (staging)
                - acme_corp_prod (production)
        """
        # Append environment suffix to org_slug
        env_suffix = self.get_environment_suffix()
        return f"{org_slug}_{env_suffix}"

    def load_dataset_types(self) -> List[Dict[str, Any]]:
        """
        Load dataset types from YAML configuration file.
        Uses module-level cache to avoid re-reading the file.

        Returns:
            List of dataset type configurations with name, description, layer, etc.

        Raises:
            FileNotFoundError: If dataset_types.yml not found
        """
        global _DATASET_TYPES_CACHE

        # Return cached value if available
        if _DATASET_TYPES_CACHE is not None:
            return _DATASET_TYPES_CACHE

        config_path = Path(self.dataset_types_config)

        if not config_path.exists():
            raise FileNotFoundError(
                f"Dataset types configuration not found at {config_path}"
            )

        with open(config_path, 'r') as f:
            config = yaml.safe_load(f)

        _DATASET_TYPES_CACHE = config.get('dataset_types', [])
        return _DATASET_TYPES_CACHE

    def get_dataset_type_names(self) -> List[str]:
        """
        Get list of dataset type names.

        Returns:
            List of dataset type names (e.g., ['raw_openai', 'raw_google', ...])
        """
        dataset_types = self.load_dataset_types()
        return [dt['name'] for dt in dataset_types]

    def get_dataset_types_with_descriptions(self) -> List[tuple[str, str]]:
        """
        Get list of dataset types with descriptions.

        Returns:
            List of tuples: [(name, description), ...]
        """
        dataset_types = self.load_dataset_types()
        return [(dt['name'], dt['description']) for dt in dataset_types]


@lru_cache()
def get_settings() -> Settings:
    """
    Get cached settings instance.
    Use LRU cache to avoid reloading environment variables.
    """
    settings_instance = Settings()

    # Set GOOGLE_APPLICATION_CREDENTIALS environment variable if configured AND file exists
    # This is required because the Google Cloud client libraries look for this env var
    # In Cloud Run, credentials come from the service account, not a file
    if settings_instance.google_application_credentials:
        creds_path = settings_instance.google_application_credentials
        if os.path.exists(creds_path):
            os.environ["GOOGLE_APPLICATION_CREDENTIALS"] = creds_path
        else:
            # Don't set invalid path - let Google Cloud use default credentials (e.g., service account)
            # This happens in Cloud Run where GOOGLE_APPLICATION_CREDENTIALS may be set in env file
            # but the file doesn't exist (local path baked into Docker image)
            pass

    return settings_instance


# Convenience export
settings = get_settings()
