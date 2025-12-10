"""
Google Cloud KMS Encryption/Decryption Utilities

Simple encryption and decryption using GCP Cloud KMS for securing sensitive data
in the data pipeline service.
"""

import base64
from typing import Optional
from google.cloud import kms
from src.app.config import get_settings


def _get_kms_client() -> kms.KeyManagementServiceClient:
    """
    Get KMS client instance.

    Returns:
        KMS client for encryption/decryption operations
    """
    return kms.KeyManagementServiceClient()


def _get_key_name() -> str:
    """
    Get the full KMS key resource name from configuration.

    Returns:
        Full KMS key resource name

    Raises:
        ValueError: If KMS configuration is incomplete
    """
    settings = get_settings()

    # Use direct key name if provided (full resource path)
    if settings.kms_key_name:
        return settings.kms_key_name

    # Otherwise construct from components
    if not all([settings.kms_project_id, settings.kms_location,
                settings.kms_keyring, settings.kms_key]):
        raise ValueError(
            "KMS configuration incomplete. Either set GCP_KMS_KEY_NAME or all of: "
            "KMS_PROJECT_ID, KMS_LOCATION, KMS_KEYRING, KMS_KEY"
        )

    return (
        f"projects/{settings.kms_project_id}/"
        f"locations/{settings.kms_location}/"
        f"keyRings/{settings.kms_keyring}/"
        f"cryptoKeys/{settings.kms_key}"
    )


def encrypt_value(plaintext: str) -> bytes:
    """
    Encrypt a plaintext string using GCP KMS.

    Args:
        plaintext: The string to encrypt

    Returns:
        Encrypted ciphertext as bytes

    Raises:
        ValueError: If plaintext is empty or KMS configuration is invalid
        Exception: If KMS encryption fails

    Example:
        >>> encrypted = encrypt_value("my-secret-api-key")
        >>> # Store encrypted bytes in database or config
    """
    if not plaintext:
        raise ValueError("Plaintext cannot be empty")

    client = _get_kms_client()
    key_name = _get_key_name()

    # Convert string to bytes
    plaintext_bytes = plaintext.encode('utf-8')

    # Encrypt using KMS
    response = client.encrypt(
        request={
            "name": key_name,
            "plaintext": plaintext_bytes
        }
    )

    return response.ciphertext


def decrypt_value(ciphertext: bytes) -> str:
    """
    Decrypt ciphertext using GCP KMS.

    Args:
        ciphertext: The encrypted bytes to decrypt

    Returns:
        Decrypted plaintext as string

    Raises:
        ValueError: If ciphertext is empty or KMS configuration is invalid
        Exception: If KMS decryption fails

    Example:
        >>> encrypted = encrypt_value("my-secret")
        >>> decrypted = decrypt_value(encrypted)
        >>> assert decrypted == "my-secret"
    """
    if not ciphertext:
        raise ValueError("Ciphertext cannot be empty")

    client = _get_kms_client()
    key_name = _get_key_name()

    # Decrypt using KMS
    response = client.decrypt(
        request={
            "name": key_name,
            "ciphertext": ciphertext
        }
    )

    # Convert bytes back to string
    return response.plaintext.decode('utf-8')


def encrypt_value_base64(plaintext: str) -> str:
    """
    Encrypt and return as base64-encoded string for storage.

    Args:
        plaintext: The string to encrypt

    Returns:
        Base64-encoded encrypted ciphertext

    Example:
        >>> encrypted_b64 = encrypt_value_base64("my-secret")
        >>> # Store in text field or JSON
    """
    ciphertext = encrypt_value(plaintext)
    return base64.b64encode(ciphertext).decode('utf-8')


def decrypt_value_base64(ciphertext_b64: str) -> str:
    """
    Decrypt from base64-encoded string.

    Args:
        ciphertext_b64: Base64-encoded encrypted ciphertext

    Returns:
        Decrypted plaintext as string

    Example:
        >>> encrypted_b64 = encrypt_value_base64("my-secret")
        >>> decrypted = decrypt_value_base64(encrypted_b64)
        >>> assert decrypted == "my-secret"
    """
    ciphertext = base64.b64decode(ciphertext_b64)
    return decrypt_value(ciphertext)
