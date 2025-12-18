"""
Per-Organization KMS Envelope Encryption

Implements envelope encryption where each organization has its own
data encryption key (DEK) that is wrapped by the master KMS key (KEK).

This provides:
1. Per-org key isolation - Compromise of one org's DEK doesn't affect others
2. Efficient key rotation - Only need to rotate DEKs, not re-encrypt all data
3. Audit trail - Can track which org's keys were accessed
"""

import base64
import os
import json
import logging
import threading
import hashlib
from typing import Optional, Tuple, Dict, Any
from google.cloud import kms
from cryptography.fernet import Fernet
from cryptography.hazmat.primitives import hashes
from cryptography.hazmat.primitives.kdf.pbkdf2 import PBKDF2HMAC

from src.app.config import get_settings

logger = logging.getLogger(__name__)


class OrgKMSEncryption:
    """
    Per-organization envelope encryption using GCP KMS.

    Architecture:
    - Master KEK (Key Encryption Key): Stored in GCP KMS, used to wrap/unwrap DEKs
    - Per-Org DEK (Data Encryption Key): Generated per org, wrapped by KEK, stored in BigQuery
    - Data: Encrypted with DEK using Fernet (symmetric encryption)

    Flow:
    1. On org creation: Generate DEK -> Wrap with KEK -> Store wrapped DEK
    2. On encrypt: Unwrap DEK -> Encrypt data with DEK
    3. On decrypt: Unwrap DEK -> Decrypt data with DEK
    """

    def __init__(self):
        self.settings = get_settings()
        self._kms_client: Optional[kms.KeyManagementServiceClient] = None
        # SECURITY: Cache key is org_slug:dek_hash to prevent cross-org DEK confusion
        self._dek_cache: Dict[str, Tuple[Fernet, float]] = {}  # cache_key -> (Fernet, expiry)
        self._cache_lock = threading.RLock()  # Thread-safe cache access
        self._cache_ttl_seconds = 300  # 5 minutes
        self._kms_timeout_seconds = 30  # Timeout for KMS operations

    def _get_cache_key(self, org_slug: str, wrapped_dek: bytes) -> str:
        """
        Generate a composite cache key from org_slug and wrapped DEK hash.

        SECURITY: Using only org_slug as cache key could cause DEK confusion
        if the same org has multiple DEKs (during rotation) or if there's
        any cache key collision. The hash ensures we return the correct Fernet
        for the exact wrapped_dek provided.
        """
        dek_hash = hashlib.sha256(wrapped_dek).hexdigest()[:16]
        return f"{org_slug}:{dek_hash}"

    @property
    def kms_client(self) -> kms.KeyManagementServiceClient:
        """Lazy-load KMS client."""
        if self._kms_client is None:
            self._kms_client = kms.KeyManagementServiceClient()
        return self._kms_client

    def _get_kek_name(self) -> str:
        """Get the master KMS key (KEK) resource name."""
        if self.settings.kms_key_name:
            return self.settings.kms_key_name

        if not all([self.settings.kms_project_id, self.settings.kms_location,
                    self.settings.kms_keyring, self.settings.kms_key]):
            raise ValueError(
                "KMS configuration incomplete. Set GCP_KMS_KEY_NAME or all of: "
                "KMS_PROJECT_ID, KMS_LOCATION, KMS_KEYRING, KMS_KEY"
            )

        return (
            f"projects/{self.settings.kms_project_id}/"
            f"locations/{self.settings.kms_location}/"
            f"keyRings/{self.settings.kms_keyring}/"
            f"cryptoKeys/{self.settings.kms_key}"
        )

    def generate_dek(self) -> bytes:
        """Generate a new Data Encryption Key (DEK)."""
        return Fernet.generate_key()

    def wrap_dek(self, dek: bytes) -> bytes:
        """
        Wrap (encrypt) a DEK using the master KEK in KMS.

        Args:
            dek: The data encryption key to wrap

        Returns:
            Wrapped (encrypted) DEK
        """
        response = self.kms_client.encrypt(
            request={
                "name": self._get_kek_name(),
                "plaintext": dek
            },
            timeout=self._kms_timeout_seconds
        )

        logger.info(
            "Wrapped DEK with master KEK",
            extra={"kek_name": self._get_kek_name()[:50] + "..."}
        )

        return response.ciphertext

    def unwrap_dek(self, wrapped_dek: bytes) -> bytes:
        """
        Unwrap (decrypt) a DEK using the master KEK in KMS.

        Args:
            wrapped_dek: The encrypted data encryption key

        Returns:
            Unwrapped (decrypted) DEK
        """
        response = self.kms_client.decrypt(
            request={
                "name": self._get_kek_name(),
                "ciphertext": wrapped_dek
            },
            timeout=self._kms_timeout_seconds
        )

        return response.plaintext

    def create_org_dek(self, org_slug: str) -> Tuple[bytes, bytes]:
        """
        Create a new DEK for an organization.

        Args:
            org_slug: Organization identifier

        Returns:
            Tuple of (wrapped_dek, dek) where wrapped_dek should be stored
        """
        dek = self.generate_dek()
        wrapped_dek = self.wrap_dek(dek)

        logger.info(
            f"Created new DEK for org",
            extra={"org_slug": org_slug}
        )

        return wrapped_dek, dek

    def get_org_fernet(self, org_slug: str, wrapped_dek: bytes) -> Fernet:
        """
        Get Fernet instance for an org, with thread-safe caching.

        SECURITY: Uses composite cache key (org_slug:dek_hash) and thread lock
        to prevent race conditions and cross-org DEK confusion.

        Args:
            org_slug: Organization identifier
            wrapped_dek: The wrapped DEK from storage

        Returns:
            Fernet instance for encryption/decryption
        """
        import time

        cache_key = self._get_cache_key(org_slug, wrapped_dek)

        # Thread-safe cache access
        with self._cache_lock:
            # Check cache with composite key
            if cache_key in self._dek_cache:
                fernet, expiry = self._dek_cache[cache_key]
                if time.time() < expiry:
                    return fernet
                else:
                    # Cache expired - remove within lock
                    del self._dek_cache[cache_key]

        # Unwrap DEK outside of lock (KMS call can be slow)
        dek = self.unwrap_dek(wrapped_dek)
        fernet = Fernet(dek)

        # Cache it with thread safety
        with self._cache_lock:
            self._dek_cache[cache_key] = (fernet, time.time() + self._cache_ttl_seconds)

        logger.debug(
            f"Unwrapped and cached DEK for org",
            extra={"org_slug": org_slug, "cache_key": cache_key[:20] + "..."}
        )

        return fernet

    def encrypt_for_org(self, org_slug: str, wrapped_dek: bytes, plaintext: str) -> bytes:
        """
        Encrypt data for a specific organization.

        Args:
            org_slug: Organization identifier
            wrapped_dek: The org's wrapped DEK from storage
            plaintext: Data to encrypt

        Returns:
            Encrypted ciphertext
        """
        fernet = self.get_org_fernet(org_slug, wrapped_dek)
        return fernet.encrypt(plaintext.encode('utf-8'))

    def decrypt_for_org(self, org_slug: str, wrapped_dek: bytes, ciphertext: bytes) -> str:
        """
        Decrypt data for a specific organization.

        Args:
            org_slug: Organization identifier
            wrapped_dek: The org's wrapped DEK from storage
            ciphertext: Data to decrypt

        Returns:
            Decrypted plaintext
        """
        fernet = self.get_org_fernet(org_slug, wrapped_dek)
        return fernet.decrypt(ciphertext).decode('utf-8')

    def clear_cache(self, org_slug: Optional[str] = None) -> None:
        """
        Clear DEK cache with thread safety.

        Args:
            org_slug: If provided, clear only this org's cache entries. Otherwise clear all.
        """
        with self._cache_lock:
            if org_slug:
                # Clear all cache entries for this org (cache key starts with org_slug:)
                keys_to_delete = [k for k in self._dek_cache.keys() if k.startswith(f"{org_slug}:")]
                for key in keys_to_delete:
                    del self._dek_cache[key]
            else:
                self._dek_cache.clear()

    def rotate_org_dek(self, org_slug: str, old_wrapped_dek: bytes) -> Tuple[bytes, bytes]:
        """
        Rotate an organization's DEK.

        This creates a new DEK. The caller is responsible for:
        1. Re-encrypting all data with the new DEK
        2. Storing the new wrapped DEK
        3. Deleting the old wrapped DEK

        Args:
            org_slug: Organization identifier
            old_wrapped_dek: The current wrapped DEK (for logging/audit)

        Returns:
            Tuple of (new_wrapped_dek, new_dek)
        """
        # Clear cache for this org
        self.clear_cache(org_slug)

        # Create new DEK
        new_wrapped_dek, new_dek = self.create_org_dek(org_slug)

        logger.info(
            f"Rotated DEK for org",
            extra={"org_slug": org_slug}
        )

        return new_wrapped_dek, new_dek


# Global instance
_org_kms: Optional[OrgKMSEncryption] = None


def get_org_kms() -> OrgKMSEncryption:
    """Get or create the global OrgKMSEncryption instance."""
    global _org_kms
    if _org_kms is None:
        _org_kms = OrgKMSEncryption()
    return _org_kms


# Convenience functions
def encrypt_credential_for_org(org_slug: str, wrapped_dek: bytes, credential: str) -> bytes:
    """Encrypt a credential for a specific organization."""
    return get_org_kms().encrypt_for_org(org_slug, wrapped_dek, credential)


def decrypt_credential_for_org(org_slug: str, wrapped_dek: bytes, ciphertext: bytes) -> str:
    """Decrypt a credential for a specific organization."""
    return get_org_kms().decrypt_for_org(org_slug, wrapped_dek, ciphertext)
