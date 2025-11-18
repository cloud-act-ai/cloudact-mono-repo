"""
Enterprise Configuration Management
Centralized settings using Pydantic Settings with environment variable support.
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
        env_file=".env",
        env_file_encoding="utf-8",
        case_sensitive=False,
        extra="ignore"
    )

    # ============================================
    # GCP Configuration
    # ============================================
    gcp_project_id: str = Field(..., description="Google Cloud Project ID")
    bigquery_location: str = Field(default="US", description="BigQuery dataset location")
    google_application_credentials: Optional[str] = Field(
        default=None,
        description="Path to GCP service account JSON"
    )

    # ============================================
    # Application Settings
    # ============================================
    app_name: str = Field(default="convergence-data-pipeline")
    app_version: str = Field(default="1.0.0")
    environment: str = Field(default="development", pattern="^(development|staging|production)$")
    debug: bool = Field(default=False)
    log_level: str = Field(default="INFO", pattern="^(DEBUG|INFO|WARNING|ERROR|CRITICAL)$")

    # ============================================
    # API Configuration
    # ============================================
    api_host: str = Field(default="0.0.0.0")
    api_port: int = Field(default=8080, ge=1024, le=65535)
    api_workers: int = Field(default=4, ge=1, le=16)
    api_reload: bool = Field(default=False)

    # CORS settings
    cors_origins: List[str] = Field(
        default=["http://localhost:3000", "http://localhost:8080"]
    )
    cors_allow_credentials: bool = Field(default=True)
    cors_allow_methods: List[str] = Field(default=["*"])
    cors_allow_headers: List[str] = Field(default=["*"])

    # ============================================
    # Security Configuration
    # ============================================
    disable_auth: bool = Field(default=False, description="Disable API key authentication (for development)")
    default_tenant_id: str = Field(
        default="acmeinc_23xv2",
        description="Default tenant ID when authentication is disabled (new architecture)"
    )
    api_key_hash_algorithm: str = Field(default="HS256")
    api_key_secret_key: str = Field(
        default="change-this-in-production-to-a-secure-random-key"
    )
    admin_api_key: Optional[str] = Field(
        default=None,
        description="Admin API key for platform-level operations (tenant creation, etc). REQUIRED in production!"
    )
    secrets_base_path: str = Field(
        default="~/.cloudact-secrets",
        description="Base path for tenant secrets directory"
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
        default="convergence-keyring",
        description="GCP KMS keyring name (used if kms_key_name not provided)"
    )
    kms_key: str = Field(
        default="convergence-encryption-key",
        description="GCP KMS key name (used if kms_key_name not provided)"
    )

    # ============================================
    # Rate Limiting
    # ============================================
    rate_limit_requests_per_minute: int = Field(
        default=100,
        ge=1,
        description="Per-tenant requests per minute limit"
    )
    rate_limit_requests_per_hour: int = Field(
        default=1000,
        ge=1,
        description="Per-tenant requests per hour limit"
    )
    rate_limit_global_requests_per_minute: int = Field(
        default=10000,
        ge=1,
        description="Global requests per minute limit (all tenants combined)"
    )
    rate_limit_global_requests_per_hour: int = Field(
        default=100000,
        ge=1,
        description="Global requests per hour limit (all tenants combined)"
    )
    rate_limit_enabled: bool = Field(
        default=True,
        description="Enable rate limiting globally"
    )
    rate_limit_admin_tenants_per_minute: int = Field(
        default=10,
        ge=1,
        description="Rate limit for expensive /admin/tenants endpoint (per-tenant per minute)"
    )
    rate_limit_pipeline_run_per_minute: int = Field(
        default=50,
        ge=1,
        description="Rate limit for expensive /pipelines/run/* endpoints (per-tenant per minute)"
    )
    rate_limit_pipeline_concurrency: int = Field(default=5, ge=1, le=50)

    # ============================================
    # Observability
    # ============================================
    enable_tracing: bool = Field(default=True)
    enable_metrics: bool = Field(default=True)
    otel_service_name: str = Field(default="convergence-api")
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
        description="SMTP password (root configuration)"
    )
    email_from_address: Optional[str] = Field(
        default=None,
        description="Email sender address (root configuration)"
    )
    email_to_addresses: Optional[str] = Field(
        default=None,
        description="Comma-separated recipient email addresses (root configuration)"
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
    # Admin Metadata Configuration (DEPRECATED)
    # ============================================
    # NOTE: This is deprecated in the new single-dataset architecture.
    # API keys and metadata are now stored in per-tenant datasets: {tenant_id}.x_meta_api_keys
    # Keeping for backward compatibility only.
    admin_metadata_dataset: str = Field(
        default="metadata",
        description="DEPRECATED: Use {tenant_id}.x_meta_api_keys instead"
    )

    # ============================================
    # File Paths
    # ============================================
    configs_base_path: str = Field(default="./configs")
    system_configs_path: str = Field(default="./configs/system")
    dataset_types_config: str = Field(default="./configs/system/dataset_types.yml")
    metadata_schemas_path: str = Field(
        default="ps_templates/customer/onboarding/schemas",
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

    def get_tenant_config_path(self, tenant_id: str) -> str:
        """Get the base configuration path for a tenant."""
        return os.path.join(self.configs_base_path, tenant_id)

    def get_tenant_secrets_path(self, tenant_id: str) -> str:
        """Get the secrets directory path for a tenant."""
        return os.path.join(self.get_tenant_config_path(tenant_id), "secrets")

    def get_tenant_schemas_path(self, tenant_id: str) -> str:
        """Get the schemas directory path for a tenant."""
        return os.path.join(self.get_tenant_config_path(tenant_id), "schemas")

    def get_tenant_sources_path(self, tenant_id: str) -> str:
        """Get the sources directory path for a tenant."""
        return os.path.join(self.get_tenant_config_path(tenant_id), "sources")

    def get_tenant_pipelines_path(self, tenant_id: str) -> str:
        """Get the pipelines directory path for a tenant."""
        return os.path.join(self.get_tenant_config_path(tenant_id), "pipelines")

    def _validate_safe_identifier(self, value: str, param_name: str) -> None:
        """
        Validate that an identifier is safe and cannot be used for path traversal.

        SECURITY: Rejects path separators, parent directory references, and special chars.
        Only allows alphanumeric characters, underscores, and hyphens.

        Args:
            value: The identifier to validate (pipeline_id, provider, domain, tenant_id)
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

    def find_pipeline_path(self, tenant_id: str, pipeline_id: str) -> str:
        """
        Find pipeline file recursively in tenant config directory with path traversal protection.

        Searches for pipeline in new cloud-provider/domain structure:
        1. First tries: configs/{tenant_id}/{provider}/{domain}/{pipeline_id}.yml
        2. Falls back to shared templates: configs/{provider}/{domain}/{pipeline_id}.yml

        Args:
            tenant_id: The tenant identifier
            pipeline_id: The pipeline identifier (filename without .yml)

        Returns:
            Absolute path to pipeline YAML file

        Raises:
            FileNotFoundError: If pipeline file not found
            ValueError: If path traversal detected or multiple pipelines found
        """
        # SECURITY: Validate inputs to prevent path traversal attacks (CWE-22: Improper Limitation of Pathname)
        self._validate_safe_identifier(tenant_id, "tenant_id")
        self._validate_safe_identifier(pipeline_id, "pipeline_id")

        # Resolve base paths to absolute paths for comparison
        configs_base_abs = Path(self.configs_base_path).resolve()
        tenant_base_path = Path(self.get_tenant_config_path(tenant_id)).resolve()

        # Verify tenant path is within configs directory (prevent escape)
        try:
            tenant_base_path.relative_to(configs_base_abs)
        except ValueError:
            raise ValueError(
                f"Tenant path {tenant_base_path} escapes base configs directory {configs_base_abs}"
            )

        # First try tenant-specific config
        matches = list(tenant_base_path.glob(f"**/{pipeline_id}.yml"))

        # SECURITY: Verify all matched paths are within tenant directory
        safe_matches = []
        for match in matches:
            try:
                match.relative_to(tenant_base_path)
                safe_matches.append(match)
            except ValueError:
                # Path escaped tenant directory - reject it
                continue
        matches = safe_matches

        # If not found in tenant directory, try shared templates
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

            # Filter out tenant-specific paths from shared search
            matches = [m for m in safe_shared_matches if not str(m).startswith(str(tenant_base_path))]

        if not matches:
            raise FileNotFoundError(
                f"Pipeline '{pipeline_id}' not found for tenant '{tenant_id}' in {tenant_base_path} or shared configs"
            )

        if len(matches) > 1:
            match_paths = [str(m) for m in matches]
            raise ValueError(
                f"Multiple pipelines found with ID '{pipeline_id}': {match_paths}"
            )

        return str(matches[0])

    def get_tenant_dataset_name(self, tenant_id: str, dataset_type: str = None) -> str:
        """
        Generate tenant-specific dataset name.

        Single-dataset-per-tenant architecture: All data and metadata tables
        are stored in a single dataset named after the tenant_id.

        Args:
            tenant_id: The tenant identifier
            dataset_type: DEPRECATED - kept for backward compatibility, ignored

        Returns:
            Dataset name: {tenant_id}
        """
        # Single dataset per tenant - dataset_type parameter ignored
        return tenant_id

    def get_admin_metadata_dataset(self) -> str:
        """
        Get the admin/global metadata dataset name.
        This dataset contains unified view of all tenant metadata.

        Returns:
            Admin metadata dataset name
        """
        return self.admin_metadata_dataset

    def get_admin_metadata_table(self, table_name: str) -> str:
        """
        Get fully qualified admin metadata table name.

        Args:
            table_name: Name of the table (e.g., 'x_meta_api_keys', 'x_meta_pipeline_runs')

        Returns:
            Fully qualified table name: {project_id}.{admin_dataset}.{table_name}
        """
        return f"{self.gcp_project_id}.{self.admin_metadata_dataset}.{table_name}"

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

    # Set GOOGLE_APPLICATION_CREDENTIALS environment variable if configured
    # This is required because the Google Cloud client libraries look for this env var
    if settings_instance.google_application_credentials:
        os.environ["GOOGLE_APPLICATION_CREDENTIALS"] = settings_instance.google_application_credentials

    return settings_instance


# Convenience export
settings = get_settings()
