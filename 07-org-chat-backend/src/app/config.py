"""
Configuration for CloudAct Chat Backend.
Centralized settings with environment variable support.
"""

import os
import json
from datetime import datetime, timezone, timedelta
from typing import Optional
from functools import lru_cache
from pathlib import Path
from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict


def _get_version_info() -> dict:
    """
    Load version info from version.json at repo root.
    Returns defaults if file not found.
    """
    version_paths = [
        Path(__file__).parent.parent.parent.parent / "version.json",  # From src/app/config.py
        Path(__file__).parent.parent.parent / "version.json",          # Fallback
        Path("version.json"),                                           # Current dir
    ]

    for version_path in version_paths:
        if version_path.exists():
            try:
                with open(version_path) as f:
                    return json.load(f)
            except Exception:
                pass

    return {}


def _get_dynamic_timestamp() -> str:
    """Generate current timestamp in ISO 8601 format with PST timezone."""
    pst = timezone(timedelta(hours=-8))
    return datetime.now(pst).strftime("%Y-%m-%dT%H:%M:%S%z")


def _get_app_version() -> str:
    """Get app version from env var or version.json."""
    if env_val := os.environ.get("APP_VERSION"):
        return env_val
    version_info = _get_version_info()
    return version_info.get("version", "v4.4.5")


def _get_release_version() -> str:
    """Get release version from env var or version.json."""
    if env_val := os.environ.get("RELEASE_VERSION"):
        return env_val
    version_info = _get_version_info()
    return version_info.get("release", "v4.4.5")


def _get_release_timestamp() -> str:
    """Get release timestamp from env var, version.json, or generate dynamically."""
    if env_val := os.environ.get("RELEASE_TIMESTAMP"):
        return env_val
    version_info = _get_version_info()
    if ts := version_info.get("release_timestamp"):
        return ts
    return _get_dynamic_timestamp()


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
    app_version: str = Field(
        default_factory=_get_app_version,
        description="Application version from version.json"
    )
    release_version: str = Field(
        default_factory=_get_release_version,
        description="Git release tag version. Set via RELEASE_VERSION env var or version.json"
    )
    release_timestamp: str = Field(
        default_factory=_get_release_timestamp,
        description="Release build timestamp. Auto-generated if not set via RELEASE_TIMESTAMP env var"
    )
    environment: str = Field(default="development")
    debug: bool = Field(default=False)
    log_level: str = Field(default="INFO")

    # API
    api_host: str = Field(default="0.0.0.0")
    api_port: int = Field(default=8002)

    # CORS — stored as string to avoid pydantic-settings JSON parsing issues
    # Accepts: plain URL, comma-separated URLs, or JSON array string
    cors_origins: str = Field(default="http://localhost:3000")

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
