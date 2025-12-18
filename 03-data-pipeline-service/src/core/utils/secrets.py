"""
Enterprise Secrets Management
Handles org-specific secrets from filesystem with fallback to Cloud Secret Manager.
"""

import os
from typing import Optional, Dict
from pathlib import Path
from functools import lru_cache
import logging

from google.cloud import secretmanager
from tenacity import retry, stop_after_attempt, wait_exponential

from src.app.config import settings

logger = logging.getLogger(__name__)


class SecretsManager:
    """
    Multi-org secrets manager with filesystem-first approach.

    Hierarchy:
    1. Check filesystem: configs/{org_slug}/secrets/{secret_name}.txt
    2. Fallback to Cloud Secret Manager: {org_slug}/{secret_name}
    """

    def __init__(self):
        """Initialize secrets manager."""
        self._cache: Dict[str, str] = {}
        self._secret_manager_client: Optional[secretmanager.SecretManagerServiceClient] = None

    @property
    def secret_manager_client(self) -> secretmanager.SecretManagerServiceClient:
        """Lazy-load Secret Manager client."""
        if self._secret_manager_client is None:
            self._secret_manager_client = secretmanager.SecretManagerServiceClient()
        return self._secret_manager_client

    def get_secret(
        self,
        org_slug: str,
        secret_name: str,
        use_cache: bool = True
    ) -> Optional[str]:
        """
        Get secret for an org.

        Args:
            org_slug: Org identifier
            secret_name: Name of the secret (e.g., 'openai_api_key')
            use_cache: Whether to use cached values

        Returns:
            Secret value or None if not found

        Raises:
            ValueError: If secret not found in either location
        """
        cache_key = f"{org_slug}:{secret_name}"

        # Check cache first
        if use_cache and cache_key in self._cache:
            logger.debug(f"Secret cache hit: {cache_key}")
            return self._cache[cache_key]

        # Try filesystem first
        secret_value = self._get_secret_from_filesystem(org_slug, secret_name)

        if secret_value is None:
            # Fallback to Cloud Secret Manager
            logger.info(
                f"Secret not found in filesystem for {org_slug}/{secret_name}, "
                "trying Cloud Secret Manager"
            )
            secret_value = self._get_secret_from_cloud(org_slug, secret_name)

        if secret_value is None:
            raise ValueError(
                f"Secret '{secret_name}' not found for org '{org_slug}' "
                "in filesystem or Cloud Secret Manager"
            )

        # Cache the secret
        if use_cache:
            self._cache[cache_key] = secret_value

        return secret_value

    def _validate_identifier(self, value: str, name: str) -> None:
        """
        Validate identifier to prevent path traversal attacks (CWE-22).

        Args:
            value: The identifier to validate
            name: Name for error messages

        Raises:
            ValueError: If identifier contains path traversal characters
        """
        import re
        # Only allow alphanumeric, underscore, and hyphen
        if not re.match(r'^[a-zA-Z0-9_-]+$', value):
            raise ValueError(
                f"{name} contains invalid characters. "
                f"Only alphanumeric, underscore, and hyphen are allowed. Got: {value}"
            )

    def _get_secret_from_filesystem(
        self,
        org_slug: str,
        secret_name: str
    ) -> Optional[str]:
        """
        Load secret from filesystem.

        Path: configs/{org_slug}/secrets/{secret_name}.txt

        Args:
            org_slug: Org identifier
            secret_name: Name of the secret

        Returns:
            Secret value or None if file doesn't exist

        Raises:
            ValueError: If org_slug or secret_name contain path traversal characters
        """
        # SECURITY: Validate inputs to prevent path traversal (CWE-22)
        self._validate_identifier(org_slug, "org_slug")
        self._validate_identifier(secret_name, "secret_name")

        secrets_path = settings.get_org_secrets_path(org_slug)
        secret_file = Path(secrets_path) / f"{secret_name}.txt"

        # SECURITY: Verify resolved path is within expected directory
        base_path = Path(settings.configs_base_path).resolve()
        resolved_file = secret_file.resolve()
        try:
            resolved_file.relative_to(base_path)
        except ValueError:
            logger.error(f"Path traversal attempt detected: {secret_file} escapes {base_path}")
            raise ValueError(f"Invalid secret path: escapes base directory")

        if not secret_file.exists():
            logger.debug(f"Secret file not found: {secret_file}")
            return None

        try:
            with open(secret_file, "r", encoding="utf-8") as f:
                secret_value = f.read().strip()

            logger.info(f"Loaded secret from filesystem: {org_slug}/{secret_name}")
            return secret_value

        except Exception as e:
            logger.error(
                f"Error reading secret from {secret_file}: {e}",
                exc_info=True
            )
            return None

    @retry(
        stop=stop_after_attempt(3),
        wait=wait_exponential(multiplier=1, min=1, max=10)
    )
    def _get_secret_from_cloud(
        self,
        org_slug: str,
        secret_name: str
    ) -> Optional[str]:
        """
        Load secret from Cloud Secret Manager.

        Secret naming: projects/{project_id}/secrets/{org_slug}_{secret_name}/versions/latest

        Args:
            org_slug: Org identifier
            secret_name: Name of the secret

        Returns:
            Secret value or None if not found
        """
        try:
            # Build secret path: {org_slug}/{secret_name}
            secret_path = (
                f"projects/{settings.gcp_project_id}/secrets/"
                f"{org_slug}_{secret_name}/versions/latest"
            )

            logger.debug(f"Fetching secret from Cloud Secret Manager: {secret_path}")

            response = self.secret_manager_client.access_secret_version(
                request={"name": secret_path}
            )

            secret_value = response.payload.data.decode("UTF-8")
            logger.info(f"Loaded secret from Cloud Secret Manager: {org_slug}/{secret_name}")

            return secret_value

        except Exception as e:
            logger.warning(
                f"Failed to fetch secret from Cloud Secret Manager: "
                f"{org_slug}/{secret_name}: {e}"
            )
            return None

    def set_secret_filesystem(
        self,
        org_slug: str,
        secret_name: str,
        secret_value: str
    ) -> bool:
        """
        Write secret to filesystem (for development/testing).

        Args:
            org_slug: Org identifier
            secret_name: Name of the secret
            secret_value: Value to write

        Returns:
            True if successful, False otherwise
        """
        secrets_path = Path(settings.get_org_secrets_path(org_slug))

        try:
            # Create directory if it doesn't exist
            secrets_path.mkdir(parents=True, exist_ok=True)

            # Write secret file
            secret_file = secrets_path / f"{secret_name}.txt"
            with open(secret_file, "w", encoding="utf-8") as f:
                f.write(secret_value)

            # Set restrictive permissions (owner read/write only)
            os.chmod(secret_file, 0o600)

            logger.info(f"Wrote secret to filesystem: {org_slug}/{secret_name}")

            # Invalidate cache
            cache_key = f"{org_slug}:{secret_name}"
            if cache_key in self._cache:
                del self._cache[cache_key]

            return True

        except Exception as e:
            logger.error(
                f"Error writing secret to filesystem: {org_slug}/{secret_name}: {e}",
                exc_info=True
            )
            return False

    def clear_cache(self, org_slug: Optional[str] = None):
        """
        Clear secrets cache.

        Args:
            org_slug: If provided, only clear secrets for this org.
                      If None, clear entire cache.
        """
        if org_slug is None:
            self._cache.clear()
            logger.info("Cleared entire secrets cache")
        else:
            keys_to_delete = [k for k in self._cache.keys() if k.startswith(f"{org_slug}:")]
            for key in keys_to_delete:
                del self._cache[key]
            logger.info(f"Cleared secrets cache for org: {org_slug}")


# Global singleton instance
@lru_cache()
def get_secrets_manager() -> SecretsManager:
    """Get cached secrets manager instance."""
    return SecretsManager()


# Convenience function
def get_secret(org_slug: str, secret_name: str) -> Optional[str]:
    """
    Convenience function to get a secret.

    Args:
        org_slug: Org identifier
        secret_name: Name of the secret

    Returns:
        Secret value or None
    """
    manager = get_secrets_manager()
    return manager.get_secret(org_slug, secret_name)
