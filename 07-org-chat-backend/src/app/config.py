"""
Configuration for CloudAct Chat Backend.
Centralized settings with environment variable support.
"""

import os
import json
from typing import List, Optional
from functools import lru_cache
from pydantic import Field, field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=(".env", ".env.local"),
        env_file_encoding="utf-8",
        case_sensitive=False,
        extra="ignore",
    )

    # GCP
    gcp_project_id: str = Field(default="local-dev-project")
    google_application_credentials: Optional[str] = Field(default=None)
    bigquery_location: str = Field(default="US")

    # Application
    app_name: str = Field(default="org-chat-backend")
    app_version: str = Field(default="1.0.0")
    environment: str = Field(default="development")
    debug: bool = Field(default=False)
    log_level: str = Field(default="INFO")

    # API
    api_host: str = Field(default="0.0.0.0")
    api_port: int = Field(default=8002)

    # CORS
    cors_origins: List[str] = Field(
        default=["http://localhost:3000"]
    )

    @field_validator("cors_origins", mode="before")
    @classmethod
    def parse_cors_origins(cls, v):
        """Handle CORS_ORIGINS as plain string, comma-separated, or JSON array."""
        if isinstance(v, list):
            return v
        if isinstance(v, str):
            v = v.strip()
            if v.startswith("["):
                return json.loads(v)
            return [origin.strip() for origin in v.split(",") if origin.strip()]
        return v

    # Security
    disable_auth: bool = Field(default=False)
    default_org_slug: str = Field(default="dev_org_local")
    ca_root_api_key: Optional[str] = Field(default=None)

    # KMS (reuse existing keyring)
    kms_key_name: Optional[str] = Field(default=None)
    kms_project_id: Optional[str] = Field(default=None)
    kms_location: str = Field(default="global")
    kms_keyring: str = Field(default="cloudact-keyring")
    kms_key: str = Field(default="api-key-encryption")

    # BigQuery
    organizations_dataset: str = Field(default="organizations")
    bq_query_timeout_ms: int = Field(default=30000)
    bq_max_bytes_gate: int = Field(
        default=10 * 1024 * 1024 * 1024,
        description="10 GB dry-run gate for cost queries",
    )

    # Chat defaults
    default_temperature: float = Field(default=0.7)
    default_max_tokens: int = Field(default=4096)
    default_max_history: int = Field(default=50)

    # Supabase (for auth validation in runtime)
    supabase_url: Optional[str] = Field(default=None)
    supabase_service_role_key: Optional[str] = Field(default=None)


@lru_cache()
def get_settings() -> Settings:
    settings_instance = Settings()

    # Set GOOGLE_APPLICATION_CREDENTIALS for Google Cloud client libraries
    # In Cloud Run, credentials come from the service account, not a file
    if settings_instance.google_application_credentials:
        creds_path = settings_instance.google_application_credentials
        if os.path.exists(creds_path):
            os.environ["GOOGLE_APPLICATION_CREDENTIALS"] = creds_path

    return settings_instance
