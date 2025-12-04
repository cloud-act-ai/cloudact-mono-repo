"""
Tests for OpenAI Authenticator

Tests credential decryption, validation, and client factory methods.
"""

import pytest
from unittest.mock import AsyncMock, MagicMock, patch


class TestOpenAIAuthenticator:
    """Test cases for OpenAIAuthenticator."""

    @pytest.mark.asyncio
    async def test_authenticate_success(self, mock_settings):
        """Test successful API key decryption."""
        with patch("src.core.processors.openai.authenticator.BigQueryClient") as MockBQClient, \
             patch("src.core.processors.openai.authenticator.decrypt_value") as mock_decrypt:

            # Setup BQ mock
            mock_client = MagicMock()
            mock_row = MagicMock()
            mock_row.__getitem__ = MagicMock(side_effect=lambda k: {
                "credential_id": "test-cred-123",
                "encrypted_credential": b"encrypted_data",
                "validation_status": "VALID",
            }.get(k))
            mock_result = MagicMock()
            mock_result.__iter__ = MagicMock(return_value=iter([mock_row]))
            mock_client.client.query.return_value.result.return_value = mock_result
            MockBQClient.return_value = mock_client

            # Setup KMS mock
            mock_decrypt.return_value = "sk-test-api-key-12345"

            from src.core.processors.openai.authenticator import OpenAIAuthenticator
            auth = OpenAIAuthenticator("test_org_123")
            api_key = await auth.authenticate()

            assert api_key == "sk-test-api-key-12345"
            assert auth.api_key == "sk-test-api-key-12345"

    @pytest.mark.asyncio
    async def test_authenticate_caches_api_key(self, mock_settings):
        """Test that API key is cached after first call."""
        with patch("src.core.processors.openai.authenticator.BigQueryClient") as MockBQClient, \
             patch("src.core.processors.openai.authenticator.decrypt_value") as mock_decrypt:

            # Setup BQ mock
            mock_client = MagicMock()
            mock_row = MagicMock()
            mock_row.__getitem__ = MagicMock(side_effect=lambda k: {
                "credential_id": "test-cred-123",
                "encrypted_credential": b"encrypted_data",
                "validation_status": "VALID",
            }.get(k))
            mock_result = MagicMock()
            mock_result.__iter__ = MagicMock(return_value=iter([mock_row]))
            mock_client.client.query.return_value.result.return_value = mock_result
            MockBQClient.return_value = mock_client

            # Setup KMS mock
            mock_decrypt.return_value = "sk-test-api-key-12345"

            from src.core.processors.openai.authenticator import OpenAIAuthenticator
            auth = OpenAIAuthenticator("test_org_123")

            key1 = await auth.authenticate()
            key2 = await auth.authenticate()

            assert key1 == key2
            # KMS decrypt should only be called once
            assert mock_decrypt.call_count == 1

    @pytest.mark.asyncio
    async def test_authenticate_no_credentials(self, mock_settings):
        """Test error when no credentials found."""
        with patch("src.core.processors.openai.authenticator.BigQueryClient") as MockBQClient:
            mock_client = MagicMock()
            mock_result = MagicMock()
            mock_result.__iter__ = MagicMock(return_value=iter([]))
            mock_client.client.query.return_value.result.return_value = mock_result
            MockBQClient.return_value = mock_client

            from src.core.processors.openai.authenticator import OpenAIAuthenticator
            auth = OpenAIAuthenticator("nonexistent_org")

            with pytest.raises(ValueError, match="No valid OpenAI credentials found"):
                await auth.authenticate()

    @pytest.mark.asyncio
    async def test_validate_success(self, mock_settings):
        """Test successful validation via API call."""
        with patch("src.core.processors.openai.authenticator.BigQueryClient") as MockBQClient, \
             patch("src.core.processors.openai.authenticator.decrypt_value") as mock_decrypt, \
             patch("httpx.AsyncClient") as MockHttpx:

            # Setup BQ mock
            mock_client = MagicMock()
            mock_row = MagicMock()
            mock_row.__getitem__ = MagicMock(side_effect=lambda k: {
                "credential_id": "test-cred-123",
                "encrypted_credential": b"encrypted_data",
                "validation_status": "VALID",
            }.get(k))
            mock_result = MagicMock()
            mock_result.__iter__ = MagicMock(return_value=iter([mock_row]))
            mock_client.client.query.return_value.result.return_value = mock_result
            MockBQClient.return_value = mock_client

            # Setup KMS mock
            mock_decrypt.return_value = "sk-test-api-key-12345"

            # Setup httpx mock for successful response
            mock_response = MagicMock()
            mock_response.status_code = 200
            mock_response.json.return_value = {
                "data": [
                    {"id": "gpt-4"},
                    {"id": "gpt-3.5-turbo"}
                ]
            }
            mock_http_client = AsyncMock()
            mock_http_client.get = AsyncMock(return_value=mock_response)
            mock_http_client.__aenter__ = AsyncMock(return_value=mock_http_client)
            mock_http_client.__aexit__ = AsyncMock(return_value=None)
            MockHttpx.return_value = mock_http_client

            from src.core.processors.openai.authenticator import OpenAIAuthenticator
            auth = OpenAIAuthenticator("test_org_123")
            result = await auth.validate()

            assert result["status"] == "VALID"
            assert result["provider"] == "OPENAI"
            assert result["models_count"] == 2

    @pytest.mark.asyncio
    async def test_validate_invalid_key(self, mock_settings):
        """Test validation with invalid API key."""
        with patch("src.core.processors.openai.authenticator.BigQueryClient") as MockBQClient, \
             patch("src.core.processors.openai.authenticator.decrypt_value") as mock_decrypt, \
             patch("httpx.AsyncClient") as MockHttpx:

            # Setup BQ mock
            mock_client = MagicMock()
            mock_row = MagicMock()
            mock_row.__getitem__ = MagicMock(side_effect=lambda k: {
                "credential_id": "test-cred-123",
                "encrypted_credential": b"encrypted_data",
                "validation_status": "VALID",
            }.get(k))
            mock_result = MagicMock()
            mock_result.__iter__ = MagicMock(return_value=iter([mock_row]))
            mock_client.client.query.return_value.result.return_value = mock_result
            MockBQClient.return_value = mock_client

            # Setup KMS mock
            mock_decrypt.return_value = "sk-invalid-key"

            # Setup httpx mock for 401 response
            mock_response = MagicMock()
            mock_response.status_code = 401
            mock_response.json.return_value = {"error": {"message": "Invalid API key"}}
            mock_http_client = AsyncMock()
            mock_http_client.get = AsyncMock(return_value=mock_response)
            mock_http_client.__aenter__ = AsyncMock(return_value=mock_http_client)
            mock_http_client.__aexit__ = AsyncMock(return_value=None)
            MockHttpx.return_value = mock_http_client

            from src.core.processors.openai.authenticator import OpenAIAuthenticator
            auth = OpenAIAuthenticator("test_org_123")
            result = await auth.validate()

            assert result["status"] == "INVALID"
            assert "Invalid API key" in result["error"]


class TestOpenAIValidationProcessor:
    """Test cases for OpenAI validation processor."""

    @pytest.mark.asyncio
    async def test_execute_success(self, mock_settings):
        """Test successful validation execution."""
        with patch("src.core.processors.openai.validation.OpenAIAuthenticator") as MockAuth:
            mock_auth = MagicMock()
            mock_auth.validate = AsyncMock(return_value={
                "status": "VALID",
                "provider": "OPENAI",
                "models_count": 5
            })
            mock_auth.update_validation_status = AsyncMock()
            MockAuth.return_value = mock_auth

            from src.core.processors.openai.validation import OpenAIValidationProcessor
            processor = OpenAIValidationProcessor()
            result = await processor.execute(
                step_config={},
                context={"org_slug": "test_org"}
            )

            assert result["status"] == "SUCCESS"

    @pytest.mark.asyncio
    async def test_execute_missing_org_slug(self, mock_settings):
        """Test error when org_slug is missing."""
        from src.core.processors.openai.validation import OpenAIValidationProcessor

        processor = OpenAIValidationProcessor()
        result = await processor.execute(
            step_config={},
            context={}
        )

        assert result["status"] == "FAILED"
        assert "org_slug is required" in result["error"]
