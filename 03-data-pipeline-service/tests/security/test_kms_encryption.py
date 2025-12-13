"""
KMS Encryption Tests - Comprehensive Security Testing

Tests KMS encryption/decryption, key rotation, and org-scoped encryption.
Covers both basic KMS encryption and envelope encryption patterns.
"""

import pytest
import base64
import time
from unittest.mock import MagicMock, patch, AsyncMock
from google.cloud import kms
from cryptography.fernet import Fernet

from src.core.security.kms_encryption import (
    encrypt_value,
    decrypt_value,
    encrypt_value_base64,
    decrypt_value_base64,
    _get_kms_client,
    _get_key_name
)
from src.core.security.org_kms_encryption import (
    OrgKMSEncryption,
    get_org_kms,
    encrypt_credential_for_org,
    decrypt_credential_for_org
)


# ============================================
# Basic KMS Encryption Tests
# ============================================

class TestBasicKMSEncryption:
    """Test basic KMS encryption/decryption functionality."""

    @pytest.fixture
    def mock_kms_client(self):
        """Mock KMS client for testing."""
        with patch("src.core.security.kms_encryption._get_kms_client") as mock:
            client = MagicMock()
            mock.return_value = client
            yield client

    @pytest.fixture
    def mock_settings(self):
        """Mock settings for KMS configuration."""
        with patch("src.core.security.kms_encryption.get_settings") as mock:
            settings = MagicMock()
            settings.kms_key_name = "projects/test/locations/us/keyRings/test/cryptoKeys/test"
            settings.kms_project_id = "test-project"
            settings.kms_location = "us-central1"
            settings.kms_keyring = "test-keyring"
            settings.kms_key = "test-key"
            mock.return_value = settings
            yield settings

    def test_encrypt_value_success(self, mock_kms_client, mock_settings):
        """Test successful encryption of plaintext value."""
        # Arrange
        plaintext = "my-secret-api-key"
        expected_ciphertext = b"encrypted_data_mock"

        mock_response = MagicMock()
        mock_response.ciphertext = expected_ciphertext
        mock_kms_client.encrypt.return_value = mock_response

        # Act
        result = encrypt_value(plaintext)

        # Assert
        assert result == expected_ciphertext
        mock_kms_client.encrypt.assert_called_once()

        # Verify the call arguments
        call_args = mock_kms_client.encrypt.call_args
        assert call_args[1]["request"]["plaintext"] == plaintext.encode('utf-8')

    def test_encrypt_value_empty_plaintext(self, mock_kms_client, mock_settings):
        """Test encryption fails with empty plaintext."""
        with pytest.raises(ValueError, match="Plaintext cannot be empty"):
            encrypt_value("")

    def test_decrypt_value_success(self, mock_kms_client, mock_settings):
        """Test successful decryption of ciphertext."""
        # Arrange
        ciphertext = b"encrypted_data"
        expected_plaintext = "my-secret-api-key"

        mock_response = MagicMock()
        mock_response.plaintext = expected_plaintext.encode('utf-8')
        mock_kms_client.decrypt.return_value = mock_response

        # Act
        result = decrypt_value(ciphertext)

        # Assert
        assert result == expected_plaintext
        mock_kms_client.decrypt.assert_called_once()

    def test_decrypt_value_empty_ciphertext(self, mock_kms_client, mock_settings):
        """Test decryption fails with empty ciphertext."""
        with pytest.raises(ValueError, match="Ciphertext cannot be empty"):
            decrypt_value(b"")

    def test_encrypt_decrypt_roundtrip(self, mock_kms_client, mock_settings):
        """Test encrypt -> decrypt roundtrip returns original value."""
        # Arrange
        original_plaintext = "test-secret-value-12345"
        mock_ciphertext = b"encrypted_mock_data"

        # Mock encrypt
        encrypt_response = MagicMock()
        encrypt_response.ciphertext = mock_ciphertext

        # Mock decrypt
        decrypt_response = MagicMock()
        decrypt_response.plaintext = original_plaintext.encode('utf-8')

        mock_kms_client.encrypt.return_value = encrypt_response
        mock_kms_client.decrypt.return_value = decrypt_response

        # Act
        encrypted = encrypt_value(original_plaintext)
        decrypted = decrypt_value(encrypted)

        # Assert
        assert decrypted == original_plaintext

    def test_encrypt_value_base64_success(self, mock_kms_client, mock_settings):
        """Test base64-encoded encryption."""
        # Arrange
        plaintext = "secret-key"
        mock_ciphertext = b"encrypted_data"

        mock_response = MagicMock()
        mock_response.ciphertext = mock_ciphertext
        mock_kms_client.encrypt.return_value = mock_response

        # Act
        result = encrypt_value_base64(plaintext)

        # Assert
        assert isinstance(result, str)
        # Verify it's valid base64
        decoded = base64.b64decode(result)
        assert decoded == mock_ciphertext

    def test_decrypt_value_base64_success(self, mock_kms_client, mock_settings):
        """Test base64-encoded decryption."""
        # Arrange
        plaintext = "secret-key"
        ciphertext = b"encrypted_data"
        ciphertext_b64 = base64.b64encode(ciphertext).decode('utf-8')

        mock_response = MagicMock()
        mock_response.plaintext = plaintext.encode('utf-8')
        mock_kms_client.decrypt.return_value = mock_response

        # Act
        result = decrypt_value_base64(ciphertext_b64)

        # Assert
        assert result == plaintext

    def test_get_key_name_from_full_path(self, mock_settings):
        """Test KMS key name resolution from full path."""
        # Arrange
        mock_settings.kms_key_name = "projects/p/locations/l/keyRings/k/cryptoKeys/key"

        # Act
        result = _get_key_name()

        # Assert
        assert result == mock_settings.kms_key_name

    def test_get_key_name_from_components(self, mock_settings):
        """Test KMS key name construction from components."""
        # Arrange
        mock_settings.kms_key_name = None
        mock_settings.kms_project_id = "test-project"
        mock_settings.kms_location = "us-central1"
        mock_settings.kms_keyring = "test-keyring"
        mock_settings.kms_key = "test-key"

        # Act
        result = _get_key_name()

        # Assert
        expected = "projects/test-project/locations/us-central1/keyRings/test-keyring/cryptoKeys/test-key"
        assert result == expected

    def test_get_key_name_incomplete_config(self, mock_settings):
        """Test KMS key name fails with incomplete configuration."""
        # Arrange
        mock_settings.kms_key_name = None
        mock_settings.kms_project_id = None

        # Act & Assert
        with pytest.raises(ValueError, match="KMS configuration incomplete"):
            _get_key_name()

    def test_kms_encryption_timeout(self, mock_kms_client, mock_settings):
        """Test KMS encryption handles timeout errors."""
        # Arrange
        mock_kms_client.encrypt.side_effect = TimeoutError("KMS timeout")

        # Act & Assert
        with pytest.raises(TimeoutError):
            encrypt_value("test-data")


# ============================================
# Org-Scoped KMS Encryption Tests (Envelope Encryption)
# ============================================

class TestOrgKMSEncryption:
    """Test organization-scoped envelope encryption."""

    @pytest.fixture
    def mock_kms_client(self):
        """Mock KMS client for envelope encryption."""
        with patch("src.core.security.org_kms_encryption.kms.KeyManagementServiceClient") as mock:
            client = MagicMock()
            mock.return_value = client
            yield client

    @pytest.fixture
    def mock_settings(self):
        """Mock settings for org KMS."""
        with patch("src.core.security.org_kms_encryption.get_settings") as mock:
            settings = MagicMock()
            settings.kms_key_name = "projects/test/locations/us/keyRings/test/cryptoKeys/test"
            settings.kms_project_id = "test-project"
            settings.kms_location = "us-central1"
            settings.kms_keyring = "test-keyring"
            settings.kms_key = "test-key"
            mock.return_value = settings
            yield settings

    @pytest.fixture
    def org_kms(self, mock_kms_client, mock_settings):
        """Create OrgKMSEncryption instance for testing."""
        return OrgKMSEncryption()

    def test_generate_dek(self, org_kms):
        """Test DEK generation produces valid Fernet key."""
        # Act
        dek = org_kms.generate_dek()

        # Assert
        assert isinstance(dek, bytes)
        assert len(dek) == 44  # Fernet keys are 44 bytes (base64 encoded 32 bytes)

        # Verify it's a valid Fernet key
        fernet = Fernet(dek)
        assert fernet is not None

    def test_wrap_dek_success(self, org_kms, mock_kms_client):
        """Test DEK wrapping with master KEK."""
        # Arrange
        dek = Fernet.generate_key()
        wrapped_dek = b"wrapped_dek_mock"

        mock_response = MagicMock()
        mock_response.ciphertext = wrapped_dek
        mock_kms_client.encrypt.return_value = mock_response

        # Act
        result = org_kms.wrap_dek(dek)

        # Assert
        assert result == wrapped_dek
        mock_kms_client.encrypt.assert_called_once()

    def test_unwrap_dek_success(self, org_kms, mock_kms_client):
        """Test DEK unwrapping with master KEK."""
        # Arrange
        wrapped_dek = b"wrapped_dek_data"
        original_dek = Fernet.generate_key()

        mock_response = MagicMock()
        mock_response.plaintext = original_dek
        mock_kms_client.decrypt.return_value = mock_response

        # Act
        result = org_kms.unwrap_dek(wrapped_dek)

        # Assert
        assert result == original_dek
        mock_kms_client.decrypt.assert_called_once()

    def test_create_org_dek_success(self, org_kms, mock_kms_client):
        """Test creating new DEK for organization."""
        # Arrange
        wrapped_dek_mock = b"wrapped_dek"

        mock_response = MagicMock()
        mock_response.ciphertext = wrapped_dek_mock
        mock_kms_client.encrypt.return_value = mock_response

        # Act
        wrapped_dek, dek = org_kms.create_org_dek("test_org")

        # Assert
        assert wrapped_dek == wrapped_dek_mock
        assert isinstance(dek, bytes)
        assert len(dek) == 44  # Valid Fernet key

    def test_get_org_fernet_with_cache(self, org_kms, mock_kms_client):
        """Test Fernet instance caching for performance."""
        # Arrange
        org_slug = "test_org"
        dek = Fernet.generate_key()
        wrapped_dek = b"wrapped_dek"

        mock_response = MagicMock()
        mock_response.plaintext = dek
        mock_kms_client.decrypt.return_value = mock_response

        # Act - First call (cache miss)
        fernet1 = org_kms.get_org_fernet(org_slug, wrapped_dek)

        # Act - Second call (cache hit)
        fernet2 = org_kms.get_org_fernet(org_slug, wrapped_dek)

        # Assert
        assert fernet1 is fernet2  # Same instance (cached)
        mock_kms_client.decrypt.assert_called_once()  # Only called once

    def test_get_org_fernet_cache_expiry(self, org_kms, mock_kms_client):
        """Test Fernet cache expires after TTL."""
        # Arrange
        org_slug = "test_org"
        dek = Fernet.generate_key()
        wrapped_dek = b"wrapped_dek"

        mock_response = MagicMock()
        mock_response.plaintext = dek
        mock_kms_client.decrypt.return_value = mock_response

        # Override cache TTL to 1 second for testing
        org_kms._cache_ttl_seconds = 1

        # Act - First call
        fernet1 = org_kms.get_org_fernet(org_slug, wrapped_dek)

        # Wait for cache to expire
        time.sleep(1.1)

        # Act - Second call after expiry
        fernet2 = org_kms.get_org_fernet(org_slug, wrapped_dek)

        # Assert
        assert mock_kms_client.decrypt.call_count == 2  # Called twice

    def test_encrypt_for_org_success(self, org_kms, mock_kms_client):
        """Test encrypting data for specific organization."""
        # Arrange
        org_slug = "test_org"
        plaintext = "my-secret-credential"
        dek = Fernet.generate_key()
        wrapped_dek = b"wrapped_dek"

        mock_response = MagicMock()
        mock_response.plaintext = dek
        mock_kms_client.decrypt.return_value = mock_response

        # Act
        ciphertext = org_kms.encrypt_for_org(org_slug, wrapped_dek, plaintext)

        # Assert
        assert isinstance(ciphertext, bytes)
        assert len(ciphertext) > len(plaintext)  # Encrypted is larger

    def test_decrypt_for_org_success(self, org_kms, mock_kms_client):
        """Test decrypting data for specific organization."""
        # Arrange
        org_slug = "test_org"
        plaintext = "my-secret-credential"
        dek = Fernet.generate_key()
        wrapped_dek = b"wrapped_dek"

        # Encrypt with real Fernet
        fernet = Fernet(dek)
        ciphertext = fernet.encrypt(plaintext.encode('utf-8'))

        mock_response = MagicMock()
        mock_response.plaintext = dek
        mock_kms_client.decrypt.return_value = mock_response

        # Act
        decrypted = org_kms.decrypt_for_org(org_slug, wrapped_dek, ciphertext)

        # Assert
        assert decrypted == plaintext

    def test_encrypt_decrypt_roundtrip_org(self, org_kms, mock_kms_client):
        """Test org encrypt -> decrypt roundtrip."""
        # Arrange
        org_slug = "test_org"
        original_plaintext = "sensitive-api-key-12345"
        dek = Fernet.generate_key()
        wrapped_dek = b"wrapped_dek"

        mock_response = MagicMock()
        mock_response.plaintext = dek
        mock_kms_client.decrypt.return_value = mock_response

        # Act
        encrypted = org_kms.encrypt_for_org(org_slug, wrapped_dek, original_plaintext)
        decrypted = org_kms.decrypt_for_org(org_slug, wrapped_dek, encrypted)

        # Assert
        assert decrypted == original_plaintext

    def test_clear_cache_specific_org(self, org_kms, mock_kms_client):
        """Test clearing cache for specific organization."""
        # Arrange
        org_slug = "test_org"
        dek = Fernet.generate_key()
        wrapped_dek = b"wrapped_dek"

        mock_response = MagicMock()
        mock_response.plaintext = dek
        mock_kms_client.decrypt.return_value = mock_response

        # Populate cache
        org_kms.get_org_fernet(org_slug, wrapped_dek)
        assert org_slug in org_kms._dek_cache

        # Act
        org_kms.clear_cache(org_slug)

        # Assert
        assert org_slug not in org_kms._dek_cache

    def test_clear_cache_all_orgs(self, org_kms, mock_kms_client):
        """Test clearing cache for all organizations."""
        # Arrange
        dek = Fernet.generate_key()

        mock_response = MagicMock()
        mock_response.plaintext = dek
        mock_kms_client.decrypt.return_value = mock_response

        # Populate cache for multiple orgs
        org_kms.get_org_fernet("org1", b"wrapped1")
        org_kms.get_org_fernet("org2", b"wrapped2")
        assert len(org_kms._dek_cache) == 2

        # Act
        org_kms.clear_cache()

        # Assert
        assert len(org_kms._dek_cache) == 0

    def test_rotate_org_dek_success(self, org_kms, mock_kms_client):
        """Test DEK rotation for organization."""
        # Arrange
        org_slug = "test_org"
        old_dek = Fernet.generate_key()
        old_wrapped_dek = b"old_wrapped_dek"
        new_wrapped_dek = b"new_wrapped_dek"

        # Mock KMS responses
        encrypt_response = MagicMock()
        encrypt_response.ciphertext = new_wrapped_dek
        mock_kms_client.encrypt.return_value = encrypt_response

        # Populate cache with old DEK
        decrypt_response = MagicMock()
        decrypt_response.plaintext = old_dek
        mock_kms_client.decrypt.return_value = decrypt_response
        org_kms.get_org_fernet(org_slug, old_wrapped_dek)

        # Act
        new_wrapped, new_dek = org_kms.rotate_org_dek(org_slug, old_wrapped_dek)

        # Assert
        assert new_wrapped == new_wrapped_dek
        assert isinstance(new_dek, bytes)
        assert org_slug not in org_kms._dek_cache  # Cache cleared

    def test_multi_org_isolation(self, org_kms, mock_kms_client):
        """Test encryption isolation between organizations."""
        # Arrange
        org1_dek = Fernet.generate_key()
        org2_dek = Fernet.generate_key()

        def mock_decrypt(request, timeout=None):
            """Return different DEKs for different wrapped DEKs."""
            wrapped = request["ciphertext"]
            response = MagicMock()
            if wrapped == b"org1_wrapped":
                response.plaintext = org1_dek
            else:
                response.plaintext = org2_dek
            return response

        mock_kms_client.decrypt.side_effect = mock_decrypt

        plaintext = "shared-secret"

        # Act
        org1_encrypted = org_kms.encrypt_for_org("org1", b"org1_wrapped", plaintext)
        org2_encrypted = org_kms.encrypt_for_org("org2", b"org2_wrapped", plaintext)

        # Assert - Different DEKs produce different ciphertexts
        assert org1_encrypted != org2_encrypted

        # Decrypt with wrong org's DEK should fail
        with pytest.raises(Exception):
            org_kms.decrypt_for_org("org1", b"org1_wrapped", org2_encrypted)


# ============================================
# Global Helper Function Tests
# ============================================

class TestGlobalHelpers:
    """Test global convenience functions."""

    @pytest.fixture
    def mock_org_kms(self):
        """Mock global OrgKMSEncryption instance."""
        with patch("src.core.security.org_kms_encryption.get_org_kms") as mock:
            org_kms = MagicMock()
            mock.return_value = org_kms
            yield org_kms

    def test_encrypt_credential_for_org(self, mock_org_kms):
        """Test global encrypt credential function."""
        # Arrange
        org_slug = "test_org"
        wrapped_dek = b"wrapped_dek"
        credential = "api-key-123"
        expected_ciphertext = b"encrypted_cred"

        mock_org_kms.encrypt_for_org.return_value = expected_ciphertext

        # Act
        result = encrypt_credential_for_org(org_slug, wrapped_dek, credential)

        # Assert
        assert result == expected_ciphertext
        mock_org_kms.encrypt_for_org.assert_called_once_with(org_slug, wrapped_dek, credential)

    def test_decrypt_credential_for_org(self, mock_org_kms):
        """Test global decrypt credential function."""
        # Arrange
        org_slug = "test_org"
        wrapped_dek = b"wrapped_dek"
        ciphertext = b"encrypted_cred"
        expected_plaintext = "api-key-123"

        mock_org_kms.decrypt_for_org.return_value = expected_plaintext

        # Act
        result = decrypt_credential_for_org(org_slug, wrapped_dek, ciphertext)

        # Assert
        assert result == expected_plaintext
        mock_org_kms.decrypt_for_org.assert_called_once_with(org_slug, wrapped_dek, ciphertext)

    def test_get_org_kms_singleton(self):
        """Test global OrgKMSEncryption singleton."""
        # Act
        instance1 = get_org_kms()
        instance2 = get_org_kms()

        # Assert
        assert instance1 is instance2  # Same instance


# ============================================
# Security Edge Cases
# ============================================

class TestSecurityEdgeCases:
    """Test security edge cases and error handling."""

    @pytest.fixture
    def mock_kms_client(self):
        """Mock KMS client."""
        with patch("src.core.security.kms_encryption._get_kms_client") as mock:
            client = MagicMock()
            mock.return_value = client
            yield client

    @pytest.fixture
    def mock_settings(self):
        """Mock settings."""
        with patch("src.core.security.kms_encryption.get_settings") as mock:
            settings = MagicMock()
            settings.kms_key_name = "projects/test/locations/us/keyRings/test/cryptoKeys/test"
            mock.return_value = settings
            yield settings

    def test_encrypt_unicode_characters(self, mock_kms_client, mock_settings):
        """Test encryption handles unicode characters."""
        # Arrange
        plaintext = "Secret with émojis 🔐 and 中文"
        mock_response = MagicMock()
        mock_response.ciphertext = b"encrypted"
        mock_kms_client.encrypt.return_value = mock_response

        # Act
        result = encrypt_value(plaintext)

        # Assert
        assert isinstance(result, bytes)

    def test_encrypt_very_long_value(self, mock_kms_client, mock_settings):
        """Test encryption handles large payloads."""
        # Arrange
        plaintext = "x" * 10000  # 10KB string
        mock_response = MagicMock()
        mock_response.ciphertext = b"encrypted_large"
        mock_kms_client.encrypt.return_value = mock_response

        # Act
        result = encrypt_value(plaintext)

        # Assert
        assert isinstance(result, bytes)

    def test_decrypt_corrupted_data(self, mock_kms_client, mock_settings):
        """Test decryption fails gracefully with corrupted data."""
        # Arrange
        mock_kms_client.decrypt.side_effect = Exception("Invalid ciphertext")

        # Act & Assert
        with pytest.raises(Exception, match="Invalid ciphertext"):
            decrypt_value(b"corrupted_data")

    def test_kms_client_network_error(self, mock_kms_client, mock_settings):
        """Test KMS operations handle network errors."""
        # Arrange
        mock_kms_client.encrypt.side_effect = ConnectionError("Network unavailable")

        # Act & Assert
        with pytest.raises(ConnectionError):
            encrypt_value("test-data")

    def test_base64_padding_edge_cases(self, mock_kms_client, mock_settings):
        """Test base64 encoding handles edge cases."""
        # Arrange
        plaintext = "abc"  # Short string that might need padding
        mock_ciphertext = b"xyz"

        mock_response = MagicMock()
        mock_response.ciphertext = mock_ciphertext
        mock_kms_client.encrypt.return_value = mock_response

        # Act
        encrypted_b64 = encrypt_value_base64(plaintext)

        # Assert
        # Should be valid base64 (no exception on decode)
        decoded = base64.b64decode(encrypted_b64)
        assert decoded == mock_ciphertext
