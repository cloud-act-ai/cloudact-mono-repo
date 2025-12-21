"""
Example: Testing OpenAI Usage Processor

Demonstrates how to use the testing framework with existing processors.
No changes to the actual processor code required.
"""

import pytest
from unittest.mock import patch, AsyncMock, MagicMock

from src.core.test import (
    ProcessorTestCase,
    MockContext,
    MockBigQueryClient,
    mock_api_response,
)
from src.core.test.fixtures import make_openai_usage_data


class TestOpenAIUsageProcessor(ProcessorTestCase):
    """
    Tests for OpenAI Usage Processor.

    Uses MockContext and MockBigQueryClient to test without external dependencies.
    """

    processor_module = "src.core.processors.openai.usage"

    def setup(self):
        """Called before each test."""
        self.mock_bq = MockBigQueryClient()
        self.mock_context = MockContext(org_slug="test_org")
        self.mock_context.add_secret("OPENAI", "sk-test-key-12345")

    async def test_execute_success_with_data(self):
        """Test successful execution with usage data returned."""
        # Mock the OpenAI API response
        mock_usage_data = make_openai_usage_data(count=3, date="2025-01-01")
        mock_response = mock_api_response(200, {"data": mock_usage_data})

        with patch("httpx.AsyncClient") as mock_client:
            # Setup mock client
            mock_client_instance = AsyncMock()
            mock_client_instance.get.return_value = mock_response
            mock_client.return_value.__aenter__.return_value = mock_client_instance

            # Mock the authenticator
            with patch(
                "src.core.processors.openai.authenticator.OpenAIAuthenticator"
            ) as mock_auth:
                mock_auth_instance = MagicMock()
                mock_auth_instance.authenticate = AsyncMock(return_value="sk-test-key")
                mock_auth.return_value = mock_auth_instance

                # Mock BigQuery storage
                with patch(
                    "src.core.processors.openai.usage.OpenAIUsageProcessor._store_usage_data",
                    new_callable=AsyncMock
                ):
                    result = await self.execute_processor(
                        step_config={
                            "config": {
                                "start_date": "2025-01-01",
                                "end_date": "2025-01-02",
                                "store_to_bq": False,  # Skip BQ for unit test
                            }
                        },
                        context=self.mock_context.to_dict()
                    )

        # Assertions
        self.assert_success(result)
        self.assert_has_key(result, "usage_records")
        self.assert_has_key(result, "total_tokens")
        self.assert_equals(result.get("provider"), "OPENAI")

    async def test_execute_no_data(self):
        """Test execution when no usage data is available."""
        mock_response = mock_api_response(200, {"data": []})

        with patch("httpx.AsyncClient") as mock_client:
            mock_client_instance = AsyncMock()
            mock_client_instance.get.return_value = mock_response
            mock_client.return_value.__aenter__.return_value = mock_client_instance

            with patch(
                "src.core.processors.openai.authenticator.OpenAIAuthenticator"
            ) as mock_auth:
                mock_auth_instance = MagicMock()
                mock_auth_instance.authenticate = AsyncMock(return_value="sk-test-key")
                mock_auth.return_value = mock_auth_instance

                result = await self.execute_processor(
                    step_config={
                        "config": {
                            "start_date": "2025-01-01",
                            "store_to_bq": False,
                        }
                    },
                    context=self.mock_context.to_dict()
                )

        self.assert_success(result)
        self.assert_equals(result.get("usage_records", 0), 0)

    async def test_execute_missing_org_slug(self):
        """Test that missing org_slug returns FAILED."""
        context = {}  # No org_slug

        result = await self.execute_processor(
            step_config={"config": {}},
            context=context
        )

        self.assert_failed(result)
        self.assert_error_contains(result, "org_slug")

    async def test_execute_invalid_api_key(self):
        """Test handling of invalid API key (401 response)."""
        mock_response = mock_api_response(401, error="Invalid API key")

        with patch("httpx.AsyncClient") as mock_client:
            mock_client_instance = AsyncMock()
            mock_client_instance.get.return_value = mock_response
            mock_client.return_value.__aenter__.return_value = mock_client_instance

            with patch(
                "src.core.processors.openai.authenticator.OpenAIAuthenticator"
            ) as mock_auth:
                mock_auth_instance = MagicMock()
                mock_auth_instance.authenticate = AsyncMock(return_value="invalid-key")
                mock_auth.return_value = mock_auth_instance

                result = await self.execute_processor(
                    step_config={"config": {"store_to_bq": False}},
                    context=self.mock_context.to_dict()
                )

        self.assert_failed(result)
        self.assert_error_contains(result, "Invalid API key")

    async def test_execute_rate_limited(self):
        """Test handling of rate limiting (429 response)."""
        # First call returns 429, subsequent calls succeed
        mock_429 = mock_api_response(429, error="Rate limited")
        mock_429.headers = {"retry-after": "1"}

        mock_success = mock_api_response(200, {
            "data": make_openai_usage_data(count=1)
        })

        with patch("httpx.AsyncClient") as mock_client:
            mock_client_instance = AsyncMock()
            # Return 429 first, then success
            mock_client_instance.get.side_effect = [mock_429, mock_success]
            mock_client.return_value.__aenter__.return_value = mock_client_instance

            with patch(
                "src.core.processors.openai.authenticator.OpenAIAuthenticator"
            ) as mock_auth:
                mock_auth_instance = MagicMock()
                mock_auth_instance.authenticate = AsyncMock(return_value="sk-test-key")
                mock_auth.return_value = mock_auth_instance

                with patch("asyncio.sleep", new_callable=AsyncMock):  # Skip actual sleep
                    result = await self.execute_processor(
                        step_config={"config": {"store_to_bq": False}},
                        context=self.mock_context.to_dict()
                    )

        # Should succeed after retry
        self.assert_success(result)


# ==========================================
# pytest integration (optional)
# ==========================================

@pytest.fixture
def mock_context():
    """Pytest fixture for mock context."""
    ctx = MockContext(org_slug="pytest_org")
    ctx.add_secret("OPENAI", "sk-pytest-key")
    return ctx


@pytest.fixture
def mock_bq_client():
    """Pytest fixture for mock BigQuery client."""
    return MockBigQueryClient()


@pytest.mark.asyncio
async def test_processor_protocol_compliance():
    """Test that OpenAI processor implements ProcessorProtocol."""
    from src.core.processors.protocol import is_valid_processor
    from src.core.processors.openai.usage import get_engine

    processor = get_engine()
    assert is_valid_processor(processor), "Processor should implement ProcessorProtocol"


@pytest.mark.asyncio
async def test_processor_result_validation():
    """Test result structure validation."""
    from src.core.processors.protocol import validate_processor_result

    valid_result = {"status": "SUCCESS", "rows_processed": 10}
    invalid_result = {"status": "MAYBE"}

    assert validate_processor_result(valid_result) is True
    assert validate_processor_result(invalid_result) is False
