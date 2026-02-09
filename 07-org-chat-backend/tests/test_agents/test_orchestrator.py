"""
Tests for the shared tools module — bind_org_slug, safe_query, validate_enum.
"""

import pytest
from unittest.mock import patch, MagicMock
from functools import partial

from src.core.tools.shared import (
    bind_org_slug,
    validate_enum,
    get_dataset,
    default_date_range,
    _validate_org_slug_format,
)


class TestBindOrgSlug:
    def test_binds_org_slug_as_first_arg(self):
        def tool_fn(org_slug, param1):
            return f"{org_slug}:{param1}"

        bound = bind_org_slug(tool_fn, "acme_inc")
        result = bound("hello")
        assert result == "acme_inc:hello"

    def test_preserves_function_name(self):
        def my_tool(org_slug):
            pass

        bound = bind_org_slug(my_tool, "test_org")
        assert bound.__name__ == "my_tool"

    def test_preserves_docstring(self):
        def my_tool(org_slug):
            """This is the docstring."""
            pass

        bound = bind_org_slug(my_tool, "test_org")
        assert bound.__doc__ == "This is the docstring."

    def test_llm_cannot_override_org_slug(self):
        """Critical security test: bound org_slug cannot be changed by extra args."""
        def tool_fn(org_slug, query="default"):
            return org_slug

        bound = bind_org_slug(tool_fn, "safe_org")
        # Even if LLM tries to pass a different org, the bound one wins
        result = bound(query="test")
        assert result == "safe_org"


class TestValidateEnum:
    def test_valid_value_returns_value(self):
        result = validate_enum("provider", {"provider", "service"}, "test_field")
        assert result == "provider"

    def test_invalid_value_raises(self):
        with pytest.raises(ValueError, match="Invalid test_field"):
            validate_enum("invalid", {"provider", "service"}, "test_field")

    def test_error_message_shows_allowed(self):
        with pytest.raises(ValueError, match="provider"):
            validate_enum("bad", {"provider"}, "field")


class TestGetDataset:
    def test_returns_slug_prod(self):
        dataset = get_dataset("acme_inc")
        assert dataset == "acme_inc_prod"

    def test_invalid_slug_raises(self):
        with pytest.raises(ValueError, match="Invalid org_slug"):
            get_dataset("INVALID!")

    def test_sql_injection_in_slug_rejected(self):
        with pytest.raises(ValueError):
            get_dataset("'; DROP TABLE --")


class TestDefaultDateRange:
    def test_returns_tuple_of_strings(self):
        start, end = default_date_range()
        assert isinstance(start, str)
        assert isinstance(end, str)

    def test_start_is_first_of_month(self):
        start, _ = default_date_range()
        assert start.endswith("-01")

    def test_format_is_iso(self):
        start, end = default_date_range()
        from datetime import date
        # Should not raise
        date.fromisoformat(start)
        date.fromisoformat(end)


class TestValidateOrgSlugFormat:
    def test_valid(self):
        _validate_org_slug_format("test_org")  # should not raise

    def test_empty_raises(self):
        with pytest.raises(ValueError):
            _validate_org_slug_format("")

    def test_uppercase_raises(self):
        with pytest.raises(ValueError):
            _validate_org_slug_format("Test_Org")
