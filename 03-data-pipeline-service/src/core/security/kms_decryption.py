"""
KMS Credential Decryption Utilities

Provides async-compatible functions for decrypting credentials stored in BigQuery.
Uses the base KMS encryption module for actual decryption operations.

Security Notes:
- Credentials are stored as base64-encoded encrypted JSON in BigQuery
- Decryption requires GCP KMS key access
- Decrypted credentials should NEVER be logged or returned in error messages
"""

import json
import logging
import asyncio
from typing import Dict, Any, Optional
from functools import partial

from src.core.security.kms_encryption import decrypt_value_base64, decrypt_value

logger = logging.getLogger("src.core.security.kms_decryption")


class DecryptionError(Exception):
    """
    SECURITY: Custom exception for decryption failures.

    Wraps underlying exceptions with a safe message that doesn't leak
    sensitive information about the decryption process or key details.
    """
    pass


async def decrypt_credentials(encrypted_data: Any) -> Dict[str, Any]:
    """
    Decrypt credentials from encrypted storage format.

    Handles both base64-encoded strings (common for BigQuery storage) and
    raw bytes. Returns the decrypted JSON as a dictionary.

    Args:
        encrypted_data: Either a base64-encoded string or raw encrypted bytes.
                       The decrypted content should be valid JSON.

    Returns:
        Dict containing the decrypted credential fields (e.g., api_key, etc.)

    Raises:
        ValueError: If decryption fails or decrypted data is not valid JSON

    Security:
        - This function should only be called with data from org_integration_credentials
        - The caller must ensure proper org_slug filtering before calling
        - Decrypted values are NOT logged
    """
    if not encrypted_data:
        raise ValueError("Encrypted data cannot be empty")

    try:
        # MEDIUM #13: Use get_running_loop() instead of deprecated get_event_loop()
        # Run decryption in executor to avoid blocking async loop
        try:
            loop = asyncio.get_running_loop()
        except RuntimeError:
            # No running loop - create one for sync context
            loop = asyncio.new_event_loop()

        if isinstance(encrypted_data, str):
            # Base64-encoded string (common for BigQuery TEXT/STRING columns)
            decrypted_str = await loop.run_in_executor(
                None,
                partial(decrypt_value_base64, encrypted_data)
            )
        elif isinstance(encrypted_data, bytes):
            # Raw bytes
            decrypted_str = await loop.run_in_executor(
                None,
                partial(decrypt_value, encrypted_data)
            )
        else:
            raise ValueError(f"Unsupported encrypted data type: {type(encrypted_data)}")

        # Parse JSON to dict
        try:
            credentials = json.loads(decrypted_str)
        except json.JSONDecodeError as e:
            # Don't leak decrypted content in error
            logger.error("Decrypted data is not valid JSON")
            raise ValueError("Decrypted credential data is not valid JSON") from e

        if not isinstance(credentials, dict):
            raise ValueError("Decrypted credentials must be a JSON object")

        return credentials

    except DecryptionError:
        # Re-raise our custom exception as-is
        raise
    except Exception as e:
        # SECURITY: Log full error internally but wrap in safe exception
        logger.error(
            f"Credential decryption failed: {type(e).__name__}",
            exc_info=True  # Full stack trace in logs only
        )
        # SECURITY: Raise custom exception with safe message, don't re-raise original
        raise DecryptionError("Failed to decrypt credentials. Check logs for details.") from None


async def decrypt_api_key(encrypted_key: Any) -> str:
    """
    Decrypt a single API key value.

    For simple credentials that are just an API key string (not JSON).

    Args:
        encrypted_key: Base64-encoded encrypted API key string

    Returns:
        The decrypted API key string
    """
    if not encrypted_key:
        raise ValueError("Encrypted key cannot be empty")

    # MEDIUM #13: Use get_running_loop() instead of deprecated get_event_loop()
    try:
        loop = asyncio.get_running_loop()
    except RuntimeError:
        loop = asyncio.new_event_loop()

    if isinstance(encrypted_key, str):
        return await loop.run_in_executor(
            None,
            partial(decrypt_value_base64, encrypted_key)
        )
    elif isinstance(encrypted_key, bytes):
        return await loop.run_in_executor(
            None,
            partial(decrypt_value, encrypted_key)
        )
    else:
        raise ValueError(f"Unsupported encrypted key type: {type(encrypted_key)}")


def decrypt_credentials_sync(encrypted_data: Any) -> Dict[str, Any]:
    """
    Synchronous version of decrypt_credentials.

    For use in synchronous code paths. Prefer async version when possible.
    """
    if not encrypted_data:
        raise ValueError("Encrypted data cannot be empty")

    try:
        if isinstance(encrypted_data, str):
            decrypted_str = decrypt_value_base64(encrypted_data)
        elif isinstance(encrypted_data, bytes):
            decrypted_str = decrypt_value(encrypted_data)
        else:
            raise ValueError(f"Unsupported encrypted data type: {type(encrypted_data)}")

        credentials = json.loads(decrypted_str)

        if not isinstance(credentials, dict):
            raise ValueError("Decrypted credentials must be a JSON object")

        return credentials

    except json.JSONDecodeError:
        logger.error("Decrypted data is not valid JSON")
        raise ValueError("Decrypted credential data is not valid JSON")
