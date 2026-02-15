"""
Tests for org_validator — multi-tenant slug validation + cache.
"""

import time
import pytest
from unittest.mock import patch

from src.core.security.org_validator import (
    validate_org,
    clear_org_cache,
    OrgValidationError,
    _org_cache,
)


@pytest.fixture(autouse=True)
def _clear_cache():
    """Always start with clean cache."""
    clear_org_cache()
    yield
    clear_org_cache()


class TestOrgSlugFormat:
    def test_valid_slug(self):
        with patch("src.core.security.org_validator.execute_query", return_value=[{"1": 1}]):
            validate_org("acme_inc")

    def test_empty_slug_raises(self):
        with pytest.raises(OrgValidationError, match="Invalid org_slug format"):
            validate_org("")

    def test_none_slug_raises(self):
        with pytest.raises(OrgValidationError, match="Invalid org_slug format"):
            validate_org(None)

    def test_too_short_raises(self):
        with pytest.raises(OrgValidationError, match="Invalid org_slug format"):
            validate_org("ab")

    def test_too_long_raises(self):
        with pytest.raises(OrgValidationError, match="Invalid org_slug format"):
            validate_org("a" * 51)

    def test_uppercase_rejected(self):
        with pytest.raises(OrgValidationError, match="Invalid org_slug format"):
            validate_org("Acme_Inc")

    def test_hyphens_rejected(self):
        with pytest.raises(OrgValidationError, match="Invalid org_slug format"):
            validate_org("acme-inc")

    def test_special_chars_rejected(self):
        with pytest.raises(OrgValidationError, match="Invalid org_slug format"):
            validate_org("acme@inc")

    def test_spaces_rejected(self):
        with pytest.raises(OrgValidationError, match="Invalid org_slug format"):
            validate_org("acme inc")

    def test_sql_injection_rejected(self):
        with pytest.raises(OrgValidationError, match="Invalid org_slug format"):
            validate_org("'; DROP TABLE --")

    def test_valid_with_numbers(self):
        with patch("src.core.security.org_validator.execute_query", return_value=[{"1": 1}]):
            validate_org("org_123_test")

    def test_exactly_3_chars(self):
        with patch("src.core.security.org_validator.execute_query", return_value=[{"1": 1}]):
            validate_org("abc")

    def test_exactly_50_chars(self):
        with patch("src.core.security.org_validator.execute_query", return_value=[{"1": 1}]):
            validate_org("a" * 50)


class TestOrgExistence:
    def test_org_not_found_raises(self):
        with patch("src.core.security.org_validator.execute_query", return_value=[]):
            with pytest.raises(OrgValidationError, match="Organization not found"):
                validate_org("nonexistent_org")

    def test_org_found_succeeds(self):
        with patch("src.core.security.org_validator.execute_query", return_value=[{"1": 1}]):
            validate_org("real_org")


class TestOrgCache:
    def test_cached_org_skips_query(self):
        with patch("src.core.security.org_validator.execute_query", return_value=[{"1": 1}]) as mock_exec:
            validate_org("cached_org")
            validate_org("cached_org")
            assert mock_exec.call_count == 1

    def test_cache_expires_after_ttl(self):
        with patch("src.core.security.org_validator.execute_query", return_value=[{"1": 1}]) as mock_exec:
            validate_org("ttl_org")
            # TTL is 3600s (1 hour), so set timestamp well past that
            _org_cache["ttl_org"] = (True, time.time() - 3700)
            validate_org("ttl_org")
            assert mock_exec.call_count == 2

    def test_clear_cache(self):
        with patch("src.core.security.org_validator.execute_query", return_value=[{"1": 1}]):
            validate_org("clear_org")
        assert "clear_org" in _org_cache
        clear_org_cache()
        assert "clear_org" not in _org_cache
