"""
KMS decryption for chat credential retrieval.
Reuses the same KMS keyring as 02-api-service and 03-pipeline-service.
"""

import asyncio
import base64
import logging
from typing import Optional
from functools import lru_cache

from google.cloud import kms
from google.api_core import exceptions as google_exceptions

from src.app.config import get_settings

logger = logging.getLogger(__name__)


@lru_cache()
def _get_kms_client() -> kms.KeyManagementServiceClient:
    return kms.KeyManagementServiceClient()


def _get_key_name() -> str:
    settings = get_settings()

    if settings.kms_key_name:
        return settings.kms_key_name

    project = settings.kms_project_id or settings.gcp_project_id
    location = settings.kms_location
    keyring = settings.kms_keyring
    key = settings.kms_key

    if not all([project, location, keyring, key]):
        raise ValueError(
            "KMS configuration incomplete. Provide either kms_key_name or all of: "
            "kms_project_id (or gcp_project_id), kms_location, kms_keyring, kms_key"
        )

    return (
        f"projects/{project}/"
        f"locations/{location}/"
        f"keyRings/{keyring}/"
        f"cryptoKeys/{key}"
    )


def decrypt_value(ciphertext: bytes, max_retries: int = 3) -> str:
    """Decrypt ciphertext bytes using GCP KMS with retry for transient errors."""
    if not ciphertext:
        raise ValueError("Ciphertext cannot be empty")

    client = _get_kms_client()
    key_name = _get_key_name()

    last_exception = None
    for attempt in range(max_retries):
        try:
            response = client.decrypt(
                request={"name": key_name, "ciphertext": ciphertext}
            )
            return response.plaintext.decode("utf-8")
        except (google_exceptions.ServiceUnavailable,
                google_exceptions.TooManyRequests,
                google_exceptions.InternalServerError) as e:
            last_exception = e
            if attempt < max_retries - 1:
                wait = 2 ** attempt  # 1s, 2s, 4s
                logger.warning(f"KMS decrypt retry {attempt + 1}/{max_retries}: {e}")
                # Use asyncio-safe sleep if running in event loop, else sync sleep
                try:
                    loop = asyncio.get_running_loop()
                    # We're in an async context - use run_in_executor to avoid blocking
                    import time as _time
                    _time.sleep(wait)
                except RuntimeError:
                    import time as _time
                    _time.sleep(wait)
            else:
                logger.error(f"KMS decrypt failed after {max_retries} retries: {e}")
                raise


async def async_decrypt_value(ciphertext: bytes, max_retries: int = 3) -> str:
    """Async-safe KMS decryption that doesn't block the event loop."""
    loop = asyncio.get_running_loop()
    return await loop.run_in_executor(None, decrypt_value, ciphertext, max_retries)


def decrypt_value_base64(ciphertext_b64: str) -> str:
    """Decrypt from base64-encoded string."""
    ciphertext = base64.b64decode(ciphertext_b64)
    return decrypt_value(ciphertext)


async def async_decrypt_value_base64(ciphertext_b64: str) -> str:
    """Async-safe base64 decryption."""
    ciphertext = base64.b64decode(ciphertext_b64)
    return await async_decrypt_value(ciphertext)
