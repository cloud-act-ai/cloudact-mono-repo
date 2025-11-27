"""
Shared pytest fixtures for processor tests.

Provides mocked KMS, BigQuery, and HTTP clients for testing authenticators and processors.
"""

import os

# Set environment variables BEFORE any imports that might load settings
os.environ.setdefault("GCP_PROJECT_ID", "test-project")
os.environ.setdefault("ENVIRONMENT", "development")
os.environ.setdefault("KMS_KEY_NAME", "projects/test/locations/global/keyRings/test/cryptoKeys/test")
os.environ.setdefault("CA_ROOT_API_KEY", "test-ca-root-key")
os.environ.setdefault("DISABLE_AUTH", "true")

import pytest
from unittest.mock import AsyncMock, MagicMock, patch
import json


# ============================================
# Mock KMS Service
# ============================================

@pytest.fixture
def mock_kms():
    """Mock GCP KMS encryption/decryption."""
    with patch("src.core.security.kms_encryption.encrypt_value") as mock_encrypt, \
         patch("src.core.security.kms_encryption.decrypt_value") as mock_decrypt:

        # Encrypt returns bytes (simulated encrypted data)
        mock_encrypt.return_value = b"encrypted_credential_bytes"

        # Decrypt returns the original string
        mock_decrypt.return_value = "sk-test-api-key-12345"

        yield {
            "encrypt": mock_encrypt,
            "decrypt": mock_decrypt
        }


@pytest.fixture
def mock_kms_gcp_sa():
    """Mock KMS for GCP Service Account JSON."""
    sa_json = json.dumps({
        "type": "service_account",
        "project_id": "test-project",
        "client_email": "test@test-project.iam.gserviceaccount.com",
        "private_key": "-----BEGIN PRIVATE KEY-----\\nMOCK\\n-----END PRIVATE KEY-----",
    })

    with patch("src.core.security.kms_encryption.decrypt_value") as mock_decrypt:
        mock_decrypt.return_value = sa_json
        yield mock_decrypt


# ============================================
# Mock BigQuery Client
# ============================================

@pytest.fixture
def mock_bigquery_client():
    """Mock BigQuery client for database operations."""
    with patch("src.core.engine.bq_client.BigQueryClient") as MockBQClient:
        mock_client = MagicMock()

        # Mock query results
        mock_result = MagicMock()
        mock_result.__iter__ = MagicMock(return_value=iter([]))
        mock_client.client.query.return_value.result.return_value = mock_result

        MockBQClient.return_value = mock_client
        yield mock_client


@pytest.fixture
def mock_bigquery_with_credentials():
    """Mock BigQuery with existing credentials in database."""
    with patch("src.core.engine.bq_client.BigQueryClient") as MockBQClient:
        mock_client = MagicMock()

        # Mock credential row
        mock_row = {
            "credential_id": "test-credential-123",
            "encrypted_credential": b"encrypted_data",
            "validation_status": "VALID",
            "metadata": None
        }

        mock_result = MagicMock()
        mock_result.__iter__ = MagicMock(return_value=iter([mock_row]))
        mock_result.__len__ = MagicMock(return_value=1)
        mock_client.client.query.return_value.result.return_value = mock_result

        MockBQClient.return_value = mock_client
        yield mock_client


# ============================================
# Mock HTTP Client (for API validation)
# ============================================

@pytest.fixture
def mock_httpx_success():
    """Mock httpx for successful API calls."""
    with patch("httpx.AsyncClient") as MockClient:
        mock_response = MagicMock()
        mock_response.status_code = 200
        mock_response.json.return_value = {
            "data": [
                {"id": "gpt-4"},
                {"id": "gpt-3.5-turbo"},
            ]
        }

        mock_client = AsyncMock()
        mock_client.get = AsyncMock(return_value=mock_response)
        mock_client.post = AsyncMock(return_value=mock_response)
        mock_client.__aenter__ = AsyncMock(return_value=mock_client)
        mock_client.__aexit__ = AsyncMock(return_value=None)

        MockClient.return_value = mock_client
        yield mock_client


@pytest.fixture
def mock_httpx_auth_failure():
    """Mock httpx for 401 authentication failure."""
    with patch("httpx.AsyncClient") as MockClient:
        mock_response = MagicMock()
        mock_response.status_code = 401
        mock_response.json.return_value = {"error": "Invalid API key"}

        mock_client = AsyncMock()
        mock_client.get = AsyncMock(return_value=mock_response)
        mock_client.__aenter__ = AsyncMock(return_value=mock_client)
        mock_client.__aexit__ = AsyncMock(return_value=None)

        MockClient.return_value = mock_client
        yield mock_client


# ============================================
# Mock Settings
# ============================================

@pytest.fixture
def mock_settings():
    """Mock application settings."""
    with patch("src.app.config.get_settings") as mock_get_settings:
        settings = MagicMock()
        settings.gcp_project_id = "test-project"
        settings.environment = "development"
        settings.kms_key_name = "projects/test/locations/global/keyRings/test/cryptoKeys/test"

        mock_get_settings.return_value = settings
        yield settings


# ============================================
# Sample Test Data
# ============================================

@pytest.fixture
def sample_openai_api_key():
    """Sample OpenAI API key for testing."""
    return "sk-test-openai-key-123456789012345678901234"


@pytest.fixture
def sample_anthropic_api_key():
    """Sample Anthropic API key for testing."""
    return "sk-ant-test-key-123456789012345678901234"


@pytest.fixture
def sample_deepseek_api_key():
    """Sample DeepSeek API key for testing."""
    return "sk-test-deepseek-key-12345678901234567890"


@pytest.fixture
def sample_gcp_service_account():
    """Sample GCP Service Account JSON for testing."""
    return json.dumps({
        "type": "service_account",
        "project_id": "test-project-123",
        "private_key_id": "key123",
        "private_key": "-----BEGIN PRIVATE KEY-----\nMOCK_KEY\n-----END PRIVATE KEY-----\n",
        "client_email": "test@test-project-123.iam.gserviceaccount.com",
        "client_id": "123456789",
        "auth_uri": "https://accounts.google.com/o/oauth2/auth",
        "token_uri": "https://oauth2.googleapis.com/token",
    })
