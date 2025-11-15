"""
Enterprise Configuration Management
Centralized settings using Pydantic Settings with environment variable support.
"""

import os
from typing import List, Optional
from functools import lru_cache
from pydantic import Field, field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


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
    # Redis Configuration
    # ============================================
    redis_host: str = Field(default="localhost")
    redis_port: int = Field(default=6379, ge=1, le=65535)
    redis_db: int = Field(default=0, ge=0, le=15)
    redis_password: Optional[str] = Field(default=None)
    redis_url: Optional[str] = Field(default=None)

    @field_validator("redis_url", mode="before")
    @classmethod
    def build_redis_url(cls, v, info):
        """Build Redis URL from components if not provided."""
        if v:
            return v

        values = info.data
        password = values.get("redis_password")
        auth = f":{password}@" if password else ""

        return (
            f"redis://{auth}{values.get('redis_host', 'localhost')}"
            f":{values.get('redis_port', 6379)}/{values.get('redis_db', 0)}"
        )

    # ============================================
    # Celery Configuration
    # ============================================
    celery_broker_url: Optional[str] = Field(default=None)
    celery_result_backend: Optional[str] = Field(default=None)
    celery_task_track_started: bool = Field(default=True)
    celery_task_time_limit: int = Field(default=3600, ge=60)  # seconds

    @field_validator("celery_broker_url", mode="before")
    @classmethod
    def set_celery_broker(cls, v, info):
        """Use redis_url if celery_broker_url not set."""
        return v or info.data.get("redis_url")

    @field_validator("celery_result_backend", mode="before")
    @classmethod
    def set_celery_backend(cls, v, info):
        """Use redis_url if celery_result_backend not set."""
        return v or info.data.get("redis_url")

    # ============================================
    # Security Configuration
    # ============================================
    api_key_hash_algorithm: str = Field(default="HS256")
    api_key_secret_key: str = Field(
        default="change-this-in-production-to-a-secure-random-key"
    )

    # ============================================
    # Rate Limiting
    # ============================================
    rate_limit_requests_per_minute: int = Field(default=100, ge=1)
    rate_limit_requests_per_hour: int = Field(default=1000, ge=1)
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
    # File Paths
    # ============================================
    configs_base_path: str = Field(default="./configs")

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

    def get_tenant_dataset_name(self, tenant_id: str, dataset_type: str) -> str:
        """
        Generate tenant-specific dataset name.

        Args:
            tenant_id: The tenant identifier
            dataset_type: Type of dataset (e.g., 'raw_openai', 'silver_cost', 'metadata')

        Returns:
            Fully qualified dataset name: {tenant_id}_{dataset_type}
        """
        if dataset_type == "metadata":
            # Shared metadata dataset for all tenants
            return "metadata"
        return f"{tenant_id}_{dataset_type}"

    class Config:
        """Pydantic configuration."""
        env_file = ".env"
        case_sensitive = False


@lru_cache()
def get_settings() -> Settings:
    """
    Get cached settings instance.
    Use LRU cache to avoid reloading environment variables.
    """
    return Settings()


# Convenience export
settings = get_settings()
