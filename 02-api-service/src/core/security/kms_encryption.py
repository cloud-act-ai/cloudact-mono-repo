"""
Google Cloud KMS Encryption/Decryption Utilities

Simple encryption and decryption using GCP Cloud KMS for securing sensitive data
in the api-service.

SECURITY NOTES:
- All operations include retry logic for transient failures
- Audit logging should be performed by callers for compliance
"""

import base64
import time
import logging
from typing import Optional, Callable, TypeVar
from google.cloud import kms
from src.app.config import get_settings


logger = logging.getLogger(__name__)

# Retry configuration for KMS operations
KMS_MAX_RETRIES = 3
KMS_BACKOFF_SECONDS = 1  # Exponential backoff: 1s, 2s, 4s

T = TypeVar('T')


def _retry_with_backoff(
    func: Callable[..., T],
    max_retries: int = KMS_MAX_RETRIES,
    backoff_seconds: float = KMS_BACKOFF_SECONDS,
    operation_name: str = "KMS operation"
) -> T:
    """
    Retry a function with exponential backoff for transient KMS failures.

    Args:
        func: Function to retry (should be a callable with no args)
        max_retries: Maximum number of retry attempts (default: 3)
        backoff_seconds: Initial backoff time in seconds (default: 1)
        operation_name: Name of operation for logging

    Returns:
        Result of the function call

    Raises:
        Last exception if all retries exhausted
    """
    last_exception = None

    for attempt in range(max_retries + 1):  # +1 for initial attempt
        try:
            return func()
        except Exception as e:
            last_exception = e
            error_type = type(e).__name__

            # Check if this is a transient error worth retrying
            is_transient = error_type in {
                "ServiceUnavailable",
                "DeadlineExceeded",
                "ResourceExhausted",
                "Aborted",
                "Internal",
                "Unavailable",
                "Unknown",
                "ConnectionError",
                "TimeoutError",
            } or "503" in str(e) or "429" in str(e) or "deadline" in str(e).lower()

            if not is_transient or attempt >= max_retries:
                # Not transient or exhausted retries
                if attempt > 0:
                    logger.error(
                        f"{operation_name} failed after {attempt + 1} attempts",
                        extra={
                            "operation": operation_name,
                            "attempts": attempt + 1,
                            "error_type": error_type,
                        }
                    )
                raise

            # Calculate exponential backoff
            sleep_time = backoff_seconds * (2 ** attempt)
            logger.warning(
                f"{operation_name} failed (attempt {attempt + 1}/{max_retries + 1}), retrying in {sleep_time}s",
                extra={
                    "operation": operation_name,
                    "attempt": attempt + 1,
                    "max_attempts": max_retries + 1,
                    "backoff_seconds": sleep_time,
                    "error_type": error_type,
                }
            )
            time.sleep(sleep_time)

    # Should never reach here, but just in case
    if last_exception:
        raise last_exception
    raise RuntimeError(f"{operation_name} failed unexpectedly")


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

    Includes automatic retry with exponential backoff for transient failures.

    Args:
        plaintext: The string to encrypt

    Returns:
        Encrypted ciphertext as bytes

    Raises:
        ValueError: If plaintext is empty or KMS configuration is invalid
        Exception: If KMS encryption fails after retries

    Example:
        >>> encrypted = encrypt_value("my-secret-api-key")
        >>> # Store encrypted bytes in database or config
    """
    if not plaintext:
        raise ValueError("Plaintext cannot be empty")

    # Convert string to bytes
    plaintext_bytes = plaintext.encode('utf-8')

    client = _get_kms_client()
    key_name = _get_key_name()  # Will raise ValueError if KMS not configured

    # Encrypt using KMS with retry logic
    def _do_encrypt():
        response = client.encrypt(
            request={
                "name": key_name,
                "plaintext": plaintext_bytes
            }
        )
        return response.ciphertext

    return _retry_with_backoff(_do_encrypt, operation_name="KMS encrypt")


def decrypt_value(ciphertext: bytes) -> str:
    """
    Decrypt ciphertext using GCP KMS.

    Includes automatic retry with exponential backoff for transient failures.

    Args:
        ciphertext: The encrypted bytes to decrypt

    Returns:
        Decrypted plaintext as string

    Raises:
        ValueError: If ciphertext is empty or KMS configuration is invalid
        Exception: If KMS decryption fails after retries

    Example:
        >>> encrypted = encrypt_value("my-secret")
        >>> decrypted = decrypt_value(encrypted)
        >>> assert decrypted == "my-secret"
    """
    if not ciphertext:
        raise ValueError("Ciphertext cannot be empty")

    client = _get_kms_client()
    key_name = _get_key_name()

    # Decrypt using KMS with retry logic
    def _do_decrypt():
        response = client.decrypt(
            request={
                "name": key_name,
                "ciphertext": ciphertext
            }
        )
        return response.plaintext.decode('utf-8')

    return _retry_with_backoff(_do_decrypt, operation_name="KMS decrypt")


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
