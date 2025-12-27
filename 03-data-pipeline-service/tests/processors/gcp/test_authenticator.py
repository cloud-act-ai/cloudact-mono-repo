"""
Tests for GCP Authenticator

Tests credential decryption, validation, and client factory methods.
"""

import pytest
from unittest.mock import AsyncMock, MagicMock, patch
import json


class TestGCPAuthenticator:
    """Test cases for GCPAuthenticator."""

    @pytest.fixture
    def sample_sa_json(self):
        """Sample GCP Service Account JSON."""
        return json.dumps({
            "type": "service_account",
            "project_id": "test-project",
            "client_email": "test@test-project.iam.gserviceaccount.com",
            "private_key": "-----BEGIN PRIVATE KEY-----\nMOCK\n-----END PRIVATE KEY-----",
        })

    @pytest.mark.asyncio
    async def test_authenticate_success(self, mock_settings, sample_sa_json):
        """Test successful GCP credential decryption."""
        with patch("src.core.processors.cloud.gcp.authenticator.BigQueryClient") as MockBQClient, \
             patch("src.core.processors.cloud.gcp.authenticator.decrypt_value") as mock_decrypt, \
             patch("google.oauth2.service_account.Credentials.from_service_account_info") as mock_creds:

            # Setup BQ mock
            mock_client = MagicMock()
            mock_row = MagicMock()
            mock_row.__getitem__ = MagicMock(side_effect=lambda k: {
                "credential_id": "test-cred-123",
                "encrypted_credential": b"encrypted_data",
                "validation_status": "VALID",
                "metadata": None
            }.get(k))
            mock_result = MagicMock()
            mock_result.__iter__ = MagicMock(return_value=iter([mock_row]))
            mock_client.client.query.return_value.result.return_value = mock_result
            MockBQClient.return_value = mock_client

            # Setup KMS mock
            mock_decrypt.return_value = sample_sa_json

            # Setup credentials mock
            mock_creds.return_value = MagicMock()

            from src.core.processors.cloud.gcp.authenticator import GCPAuthenticator
            auth = GCPAuthenticator("test_org_123")
            credentials = await auth.authenticate()

            assert credentials is not None
            assert auth.project_id == "test-project"
            assert auth.client_email == "test@test-project.iam.gserviceaccount.com"

    @pytest.mark.asyncio
    async def test_authenticate_caches_credentials(self, mock_settings, sample_sa_json):
        """Test that credentials are cached after first call."""
        with patch("src.core.processors.cloud.gcp.authenticator.BigQueryClient") as MockBQClient, \
             patch("src.core.processors.cloud.gcp.authenticator.decrypt_value") as mock_decrypt, \
             patch("google.oauth2.service_account.Credentials.from_service_account_info") as mock_creds:

            # Setup BQ mock
            mock_client = MagicMock()
            mock_row = MagicMock()
            mock_row.__getitem__ = MagicMock(side_effect=lambda k: {
                "credential_id": "test-cred-123",
                "encrypted_credential": b"encrypted_data",
                "validation_status": "VALID",
                "metadata": None
            }.get(k))
            mock_result = MagicMock()
            mock_result.__iter__ = MagicMock(return_value=iter([mock_row]))
            mock_client.client.query.return_value.result.return_value = mock_result
            MockBQClient.return_value = mock_client

            # Setup KMS mock
            mock_decrypt.return_value = sample_sa_json

            # Setup credentials mock
            mock_creds.return_value = MagicMock()

            from src.core.processors.cloud.gcp.authenticator import GCPAuthenticator
            auth = GCPAuthenticator("test_org_123")

            # First call
            creds1 = await auth.authenticate()
            # Second call should return cached
            creds2 = await auth.authenticate()

            assert creds1 is creds2
            # KMS decrypt should only be called once
            assert mock_decrypt.call_count == 1

    @pytest.mark.asyncio
    async def test_authenticate_no_credentials_found(self, mock_settings):
        """Test error when no credentials found in database."""
        with patch("src.core.processors.cloud.gcp.authenticator.BigQueryClient") as MockBQClient:
            mock_client = MagicMock()
            mock_result = MagicMock()
            mock_result.__iter__ = MagicMock(return_value=iter([]))

            mock_client.client.query.return_value.result.return_value = mock_result
            MockBQClient.return_value = mock_client

            from src.core.processors.cloud.gcp.authenticator import GCPAuthenticator
            auth = GCPAuthenticator("nonexistent_org")

            with pytest.raises(ValueError, match="No valid GCP credentials found"):
                await auth.authenticate()

    @pytest.mark.asyncio
    async def test_validate_success(self, mock_settings, sample_sa_json):
        """Test successful validation."""
        with patch("src.core.processors.cloud.gcp.authenticator.BigQueryClient") as MockBQClient, \
             patch("src.core.processors.cloud.gcp.authenticator.decrypt_value") as mock_decrypt, \
             patch("google.oauth2.service_account.Credentials.from_service_account_info") as mock_creds, \
             patch("google.cloud.bigquery.Client") as MockBQValidate:

            # Setup BQ mock for credential query
            mock_client = MagicMock()
            mock_row = MagicMock()
            mock_row.__getitem__ = MagicMock(side_effect=lambda k: {
                "credential_id": "test-cred-123",
                "encrypted_credential": b"encrypted_data",
                "validation_status": "VALID",
                "metadata": None
            }.get(k))
            mock_result = MagicMock()
            mock_result.__iter__ = MagicMock(return_value=iter([mock_row]))
            mock_client.client.query.return_value.result.return_value = mock_result
            MockBQClient.return_value = mock_client

            # Setup KMS mock
            mock_decrypt.return_value = sample_sa_json

            # Setup credentials mock
            mock_creds.return_value = MagicMock()

            # Setup BQ validation client mock
            mock_bq = MagicMock()
            mock_bq.list_datasets.return_value = iter([MagicMock()])
            MockBQValidate.return_value = mock_bq

            from src.core.processors.cloud.gcp.authenticator import GCPAuthenticator
            auth = GCPAuthenticator("test_org_123")
            result = await auth.validate()

            assert result["status"] == "VALID"
            assert result["provider"] == "GCP_SA"
            assert "permissions" in result

    @pytest.mark.asyncio
    async def test_validate_invalid_credentials(self, mock_settings):
        """Test validation failure with invalid credentials."""
        with patch("src.core.processors.cloud.gcp.authenticator.BigQueryClient") as MockBQClient:
            mock_client = MagicMock()
            mock_result = MagicMock()
            mock_result.__iter__ = MagicMock(return_value=iter([]))
            mock_client.client.query.return_value.result.return_value = mock_result
            MockBQClient.return_value = mock_client

            from src.core.processors.cloud.gcp.authenticator import GCPAuthenticator
            auth = GCPAuthenticator("test_org_123")
            result = await auth.validate()

            assert result["status"] == "INVALID"
            assert "error" in result

    @pytest.mark.asyncio
    async def test_get_bigquery_client(self, mock_settings, sample_sa_json):
        """Test BigQuery client factory method."""
        with patch("src.core.processors.cloud.gcp.authenticator.BigQueryClient") as MockBQClient, \
             patch("src.core.processors.cloud.gcp.authenticator.decrypt_value") as mock_decrypt, \
             patch("google.oauth2.service_account.Credentials.from_service_account_info") as mock_creds, \
             patch("google.cloud.bigquery.Client") as MockBQFactory:

            # Setup BQ mock
            mock_client = MagicMock()
            mock_row = MagicMock()
            mock_row.__getitem__ = MagicMock(side_effect=lambda k: {
                "credential_id": "test-cred-123",
                "encrypted_credential": b"encrypted_data",
                "validation_status": "VALID",
                "metadata": None
            }.get(k))
            mock_result = MagicMock()
            mock_result.__iter__ = MagicMock(return_value=iter([mock_row]))
            mock_client.client.query.return_value.result.return_value = mock_result
            MockBQClient.return_value = mock_client

            # Setup KMS mock
            mock_decrypt.return_value = sample_sa_json

            # Setup credentials mock
            mock_creds.return_value = MagicMock()

            from src.core.processors.cloud.gcp.authenticator import GCPAuthenticator
            auth = GCPAuthenticator("test_org_123")
            client = await auth.get_bigquery_client()

            MockBQFactory.assert_called_once()
            assert client is not None


class TestGCPValidationProcessor:
    """Test cases for GCP validation processor."""

    @pytest.mark.asyncio
    async def test_execute_success(self, mock_settings):
        """Test successful validation execution."""
        with patch("src.core.processors.cloud.gcp.validation.GCPAuthenticator") as MockAuth:
            mock_auth = MagicMock()
            mock_auth.validate = AsyncMock(return_value={
                "status": "VALID",
                "provider": "GCP_SA",
                "permissions": ["bigquery.datasets.list"]
            })
            mock_auth.update_validation_status = AsyncMock()
            MockAuth.return_value = mock_auth

            from src.core.processors.cloud.gcp.validation import GCPValidationProcessor
            processor = GCPValidationProcessor()
            result = await processor.execute(
                step_config={},
                context={"org_slug": "test_org"}
            )

            assert result["status"] == "SUCCESS"
            assert result["validation_status"] == "VALID"

    @pytest.mark.asyncio
    async def test_execute_missing_org_slug(self, mock_settings):
        """Test error when org_slug is missing."""
        from src.core.processors.cloud.gcp.validation import GCPValidationProcessor

        processor = GCPValidationProcessor()
        result = await processor.execute(
            step_config={},
            context={}
        )

        assert result["status"] == "FAILED"
        assert "org_slug is required" in result["error"]
