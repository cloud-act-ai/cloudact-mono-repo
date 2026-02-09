"""
KMS decryption for chat credential retrieval.
Reuses the same KMS keyring as 02-api-service and 03-pipeline-service.
"""

import base64
import logging
from typing import Optional
from functools import lru_cache

from google.cloud import kms

from src.app.config import get_settings

logger = logging.getLogger(__name__)


@lru_cache()
def _get_kms_client() -> kms.KeyManagementServiceClient:
    return kms.KeyManagementServiceClient()


def _get_key_name() -> str:
    settings = get_settings()

    if settings.kms_key_name:
        return settings.kms_key_name

    if not all([settings.kms_project_id, settings.kms_location,
                settings.kms_keyring, settings.kms_key]):
        project = settings.kms_project_id or settings.gcp_project_id
        return (
            f"projects/{project}/"
            f"locations/{settings.kms_location}/"
            f"keyRings/{settings.kms_keyring}/"
            f"cryptoKeys/{settings.kms_key}"
        )

    return (
        f"projects/{settings.kms_project_id}/"
        f"locations/{settings.kms_location}/"
        f"keyRings/{settings.kms_keyring}/"
        f"cryptoKeys/{settings.kms_key}"
    )


def decrypt_value(ciphertext: bytes) -> str:
    """Decrypt ciphertext bytes using GCP KMS."""
    if not ciphertext:
        raise ValueError("Ciphertext cannot be empty")

    client = _get_kms_client()
    key_name = _get_key_name()

    response = client.decrypt(
        request={"name": key_name, "ciphertext": ciphertext}
    )
    return response.plaintext.decode("utf-8")


def decrypt_value_base64(ciphertext_b64: str) -> str:
    """Decrypt from base64-encoded string."""
    ciphertext = base64.b64decode(ciphertext_b64)
    return decrypt_value(ciphertext)
