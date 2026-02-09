"""
Tests for model_factory — BYOK multi-provider model creation.
"""

import pytest
from unittest.mock import patch, MagicMock

from src.core.agents.model_factory import (
    create_model,
    create_default_model,
    PROVIDER_PREFIX,
    DEFAULT_MODELS,
)


class TestCreateModel:
    @patch("src.core.agents.model_factory.LiteLlm")
    def test_openai_model(self, mock_litellm):
        mock_litellm.return_value = MagicMock()
        model = create_model("OPENAI", "gpt-4o", "sk-test-key")
        mock_litellm.assert_called_once_with(model="openai/gpt-4o", api_key="sk-test-key")

    @patch("src.core.agents.model_factory.LiteLlm")
    def test_anthropic_model(self, mock_litellm):
        mock_litellm.return_value = MagicMock()
        model = create_model("ANTHROPIC", "claude-sonnet-4-20250514", "sk-ant-test")
        mock_litellm.assert_called_once_with(model="anthropic/claude-sonnet-4-20250514", api_key="sk-ant-test")

    @patch("src.core.agents.model_factory.LiteLlm")
    def test_gemini_model(self, mock_litellm):
        mock_litellm.return_value = MagicMock()
        model = create_model("GEMINI", "gemini-2.0-flash", "google-key")
        mock_litellm.assert_called_once_with(model="gemini/gemini-2.0-flash", api_key="google-key")

    @patch("src.core.agents.model_factory.LiteLlm")
    def test_deepseek_model(self, mock_litellm):
        mock_litellm.return_value = MagicMock()
        model = create_model("DEEPSEEK", "deepseek-chat", "ds-key")
        mock_litellm.assert_called_once_with(model="deepseek/deepseek-chat", api_key="ds-key")

    @patch("src.core.agents.model_factory.LiteLlm")
    def test_case_insensitive_provider(self, mock_litellm):
        mock_litellm.return_value = MagicMock()
        create_model("openai", "gpt-4o", "key")
        mock_litellm.assert_called_once_with(model="openai/gpt-4o", api_key="key")

    def test_unsupported_provider_raises(self):
        with pytest.raises(ValueError, match="Unsupported provider"):
            create_model("INVALID_PROVIDER", "model", "key")

    def test_api_key_not_stored_globally(self):
        """Ensure API key is passed per-request, not via os.environ."""
        import os
        with patch("src.core.agents.model_factory.LiteLlm") as mock_litellm:
            mock_litellm.return_value = MagicMock()
            create_model("OPENAI", "gpt-4o", "secret-key")
            assert os.environ.get("OPENAI_API_KEY") != "secret-key"


class TestProviderPrefix:
    def test_all_providers_mapped(self):
        assert "OPENAI" in PROVIDER_PREFIX
        assert "ANTHROPIC" in PROVIDER_PREFIX
        assert "GEMINI" in PROVIDER_PREFIX
        assert "DEEPSEEK" in PROVIDER_PREFIX


class TestDefaultModel:
    def test_default_is_gemini_flash(self):
        result = create_default_model()
        assert result == "gemini-2.0-flash"
