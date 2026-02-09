"""
Tests for query_guard — dry-run cost gate (Layer 5 of 6).
"""

import pytest
from unittest.mock import patch

from src.core.security.query_guard import guard_query, QueryTooExpensiveError


class TestGuardQuery:
    def test_small_query_passes(self):
        with patch("src.core.security.query_guard.dry_run_estimate", return_value=1024 * 1024):
            result = guard_query("SELECT 1")
            assert result == 1024 * 1024

    def test_large_query_rejected(self):
        with patch("src.core.security.query_guard.dry_run_estimate", return_value=15 * 1024 ** 3):
            with pytest.raises(QueryTooExpensiveError, match="Query too expensive"):
                guard_query("SELECT * FROM huge_table")

    def test_exactly_at_limit_passes(self):
        limit = 10 * 1024 ** 3  # 10 GB default
        with patch("src.core.security.query_guard.dry_run_estimate", return_value=limit):
            result = guard_query("SELECT 1")
            assert result == limit

    def test_one_byte_over_limit_rejected(self):
        limit = 10 * 1024 ** 3 + 1
        with patch("src.core.security.query_guard.dry_run_estimate", return_value=limit):
            with pytest.raises(QueryTooExpensiveError):
                guard_query("SELECT 1")

    def test_error_message_includes_guidance(self):
        with patch("src.core.security.query_guard.dry_run_estimate", return_value=15 * 1024 ** 3):
            with pytest.raises(QueryTooExpensiveError, match="date filters"):
                guard_query("SELECT * FROM huge_table")

    def test_parameterized_query_passed_to_dry_run(self):
        from google.cloud import bigquery
        params = [bigquery.ScalarQueryParameter("org", "STRING", "test")]
        with patch("src.core.security.query_guard.dry_run_estimate", return_value=1024) as mock:
            guard_query("SELECT 1 WHERE org = @org", params)
            mock.assert_called_once_with("SELECT 1 WHERE org = @org", params)
